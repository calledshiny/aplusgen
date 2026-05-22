// Phase 4: Content-Generierung pro Modul.
// Claude bekommt das exakte Feld-Schema eines Moduls + Scraped-Daten +
// Plan-Analyse und liefert für jedes Feld den fertigen Wert (Text,
// Rich-Text, Bild-Prompt+AltText, Spec-Tabelle).

import type Anthropic from "@anthropic-ai/sdk";
import {
  type FieldDef,
  type FieldKind,
  type ImageSpec,
  MODULES_BY_TYPE,
  type ModuleDef,
  type ModuleType,
} from "./modules";
import type { ProductAnalysis, SelectedModule } from "./plan";
import type { ScrapedProduct } from "./scraper";

// --- Output-Typen (matchen Spec-Datenmodell) ----------------------------

export type TextField = { kind: "text"; value: string };
export type RichTextField = { kind: "richtext"; value: string };
export type ImageField = {
  kind: "image";
  src?: string;
  prompt: string;
  altText: string;
  status: "pending" | "generating" | "done" | "error";
};
export type ImageListItem = {
  src?: string;
  caption?: string;
  prompt: string;
  altText: string;
  status: "pending" | "generating" | "done" | "error";
};
export type ImageListField = { kind: "imageList"; items: ImageListItem[] };
export type SpecTableRow = { key: string; value: string };
export type SpecTableField = { kind: "specTable"; rows: SpecTableRow[] };
export type ComparisonField = {
  kind: "comparison";
  products: Array<{
    asin: string;
    image: string;
    title: string;
    highlight: boolean;
    metrics: Record<string, string>;
  }>;
};

export type FieldValue =
  | TextField
  | RichTextField
  | ImageField
  | ImageListField
  | SpecTableField
  | ComparisonField;

export type GeneratedModule = {
  type: ModuleType;
  fields: Record<string, FieldValue>;
};

// --- Prompt-Bau ---------------------------------------------------------

function describeImageSpec(spec: ImageSpec): string {
  return `${spec.widthPx}×${spec.heightPx} px (${spec.aspectRatio})`;
}

function describeField(f: FieldDef): string {
  const flags: string[] = [];
  if (f.required) flags.push("PFLICHT");
  if (f.maxChars) flags.push(`max ${f.maxChars} Zeichen`);
  if (f.image) flags.push(describeImageSpec(f.image));
  if (f.imageList)
    flags.push(
      `${f.imageList.count}× ${describeImageSpec(f.imageList.itemImage)}` +
        (f.imageList.captionMaxChars
          ? ` (Caption max ${f.imageList.captionMaxChars} Zeichen)`
          : ""),
    );
  const group = f.group ? ` [${f.group}]` : "";
  const flagStr = flags.length ? ` — ${flags.join(", ")}` : "";
  const hint = f.hint ? ` // ${f.hint}` : "";
  return `  • ${f.id} (${f.kind}): "${f.label}"${group}${flagStr}${hint}`;
}

function describeModule(def: ModuleDef): string {
  return [
    `Modul: ${def.type} — ${def.name}`,
    `Beschreibung: ${def.description}`,
    `Einsatz: ${def.usage}`,
    `Felder:`,
    def.fields.map(describeField).join("\n"),
  ].join("\n");
}

function buildOutputSchemaExample(def: ModuleDef): string {
  // Zeigt Claude EXAKT was zurückkommen muss, pro Feld-Kind das richtige Format
  const samples = def.fields.map((f) => {
    switch (f.kind) {
      case "text":
        return `  "${f.id}": { "kind": "text", "value": "<string>" }`;
      case "richtext":
        return `  "${f.id}": { "kind": "richtext", "value": "<markdown-ish: **bold**, *italic*, > quote, - bullet, 1. ordered>" }`;
      case "image":
        return `  "${f.id}": { "kind": "image", "prompt": "<englischer Higgsfield-Prompt>", "altText": "<deutscher Alt-Text>", "status": "pending" }`;
      case "imageList": {
        const n = f.imageList?.count ?? 3;
        return `  "${f.id}": { "kind": "imageList", "items": [${n} Objekte mit { "caption"?: "<optional>", "prompt": "<englisch>", "altText": "<deutsch>", "status": "pending" }] }`;
      }
      case "specTable":
        return `  "${f.id}": { "kind": "specTable", "rows": [{ "key": "<Attribut>", "value": "<Wert>" }, ... 4-16 rows] }`;
      case "comparison":
        return `  "${f.id}": { "kind": "comparison", "products": [...] }`;
    }
  });
  return `{\n  "fields": {\n${samples.join(",\n")}\n  }\n}`;
}

const CONTENT_RULES = `INHALTLICHE REGELN:
- Sprache: Deutsch.
- Pro Modul EINE Kernaussage, kein Themen-Zickzack.
- Headlines max 6-8 Wörter (Mobile-first, scannbar).
- Bodies kurz und nutzenorientiert — Feature → Benefit übersetzen.

ABSOLUT VERBOTEN (Amazon Guidelines):
- Preise, Rabatte, Promo-Infos, Versand-Aussagen, Garantie/Gewährleistung.
- Superlative ohne Beleg: "Bester", "Nr. 1", "einzigartig", "unschlagbar".
- Umwelt-/Gesundheitsclaims ohne Quelle.
- Konkurrenzvergleiche.
- QR-Codes, externe Links, Kontaktdaten.
- Zeitbezüge: "neu 2026", "limitiert".

RICH TEXT (Format):
- **bold**: sparsam, für Schlüsselbegriffe.
- *italic*: sparsam.
- > quote: für Markenversprechen / Testimonial-Style.
- - bullet: für Listen ab 3 Punkten.
- 1. ordered list: für nummerierte Anleitungen.
- Kein underline, keine Links, keine Tabellen.

BILD-PROMPTS (Higgsfield, ENGLISCH):
Strukturiert nach Spec-Schema:
"Photorealistic [shot type] of [exact product with material/color/texture].
[Scene/context: surface, environment, props].
[Lighting: source, direction, quality].
[Mood: atmosphere].
[Camera: lens, depth, angle].
[Style: cinematic / editorial / clean studio / lifestyle].
[No text. No people. OR with subtle hand/lifestyle context]"

ALT-TEXTE (DEUTSCH):
- Konkrete Bildbeschreibung, kein Keyword-Stuffing.
- 1 Satz, max ~125 Zeichen.`;

const TEXT_IN_IMAGE_TRUE_RULES = `TEXT-IN-BILD-MODUS (textInImage=true):
- ALLE text/richtext Felder dieses Moduls bleiben LEER ("value": "").
- ALLE Bild-Prompts erweitern um eingebrannten Text:
  "...with typography: \\"<exakter deutscher Claim>\\" in [Schriftart-Stil], [Farbe], [Position: top/center/bottom-left/etc]"
- Modell-Empfehlung in Prompt explizit nicht nötig (App wählt Nano Banana Pro / GPT Image 2 für Text-Rendering).
- Wenn das Modul mehrere Bilder hat (drei_bilder, vier_bilder, mehrfach_a, etc): pro Bild EIN eigener Mini-Claim (max ~5 Wörter), abgestimmt aufeinander.
- imageBrief des Moduls ist dein Ausgangspunkt — übersetze ihn ins englische Prompt-Schema.`;

const TEXT_IN_IMAGE_FALSE_RULES = `ECHTER-TEXT-MODUS (textInImage=false):
- text/richtext Felder werden NORMAL gefüllt mit echtem deutschem Content.
- Bild-Prompts enthalten KEINEN eingebrannten Text ("No text on the image").
- imageBrief gibt dir das Motiv vor.`;

function buildSystemPrompt(module: SelectedModule, def: ModuleDef): string {
  const modeRules = module.textInImage
    ? TEXT_IN_IMAGE_TRUE_RULES
    : TEXT_IN_IMAGE_FALSE_RULES;

  return `Du generierst den finalen Content für EIN Amazon-A+-Modul (deutscher Markt).
Du bekommst das Modul-Schema, gescrapte Produktdaten und die übergeordnete Analyse.

Gib NUR ein JSON-Objekt zurück, kein Markdown, keine Codefences:

${buildOutputSchemaExample(def)}

KEY-NAMEN müssen EXAKT mit den Feld-IDs aus dem Schema übereinstimmen. KEINE zusätzlichen Felder, KEINE fehlenden Pflichtfelder.

${describeModule(def)}

POSITION IM PLAN: ${module.type} ist Modul Nr. <position> in der Storyline.
MODUL-BEGRÜNDUNG (vom Planner): "${module.reasoning}"
BILD-BRIEF (vom Planner): "${module.imageBrief}"
TEXT-MODUS: ${module.textInImage ? "TEXT_IN_IMAGE" : "REAL_TEXT"}

${modeRules}

${CONTENT_RULES}`;
}

export function buildContentMessages(
  scraped: ScrapedProduct,
  analysis: ProductAnalysis,
  position: number,
): Anthropic.MessageParam[] {
  const userBlock = [
    `STORYLINE-POSITION: ${position}`,
    `ANALYSE:`,
    `  Charakter: ${analysis.productCharacter}`,
    `  Materialien: ${analysis.materials.join(", ")}`,
    `  Zielgruppe: ${analysis.targetAudience}`,
    `  Kernaussage: ${analysis.coreMessage}`,
    ``,
    `SCRAPED PRODUCT:`,
    `  Titel: ${scraped.title}`,
    scraped.brand ? `  Marke: ${scraped.brand}` : null,
    scraped.category ? `  Kategorie: ${scraped.category}` : null,
    scraped.bullets.length
      ? `  Bullets:\n    - ${scraped.bullets.join("\n    - ")}`
      : null,
    Object.keys(scraped.technicalDetails).length
      ? `  Specs:\n${Object.entries(scraped.technicalDetails)
          .map(([k, v]) => `    ${k}: ${v}`)
          .join("\n")}`
      : null,
    scraped.description
      ? `  Beschreibung:\n${scraped.description.slice(0, 1500)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [{ role: "user", content: userBlock }];
}

export function getContentSystemPrompt(
  module: SelectedModule,
  def: ModuleDef,
): string {
  return buildSystemPrompt(module, def);
}

// --- Validierung --------------------------------------------------------

export type ContentIssue = { path: string; message: string };

export function validateContent(
  type: ModuleType,
  raw: unknown,
  options: { textInImage: boolean },
): { ok: boolean; module?: GeneratedModule; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, issues: [{ path: "$", message: "not an object" }] };
  }
  const root = raw as Record<string, unknown>;
  const fields = root.fields as Record<string, unknown> | undefined;
  if (!fields || typeof fields !== "object") {
    return {
      ok: false,
      issues: [{ path: "fields", message: "missing or not an object" }],
    };
  }

  const def = MODULES_BY_TYPE[type];

  for (const fdef of def.fields) {
    const val = fields[fdef.id] as Record<string, unknown> | undefined;
    if (val === undefined) {
      if (fdef.required) {
        issues.push({
          path: `fields.${fdef.id}`,
          message: `required field missing`,
        });
      }
      continue;
    }
    const kindMatches = val.kind === fdef.kind;
    if (!kindMatches) {
      issues.push({
        path: `fields.${fdef.id}.kind`,
        message: `expected "${fdef.kind}", got "${String(val.kind)}"`,
      });
      continue;
    }

    validateFieldValue(fdef, val, options, issues);
  }

  // Extra fields (warning only, not error)
  for (const k of Object.keys(fields)) {
    if (!def.fields.some((f) => f.id === k)) {
      issues.push({
        path: `fields.${k}`,
        message: `unknown field — not in module schema`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    module: { type, fields: fields as Record<string, FieldValue> },
  };
}

function validateFieldValue(
  fdef: FieldDef,
  val: Record<string, unknown>,
  options: { textInImage: boolean },
  issues: ContentIssue[],
): void {
  const path = `fields.${fdef.id}`;
  const isTextual: Record<FieldKind, boolean> = {
    text: true,
    richtext: true,
    image: false,
    imageList: false,
    specTable: false,
    comparison: false,
  };

  switch (fdef.kind) {
    case "text":
    case "richtext": {
      if (typeof val.value !== "string") {
        issues.push({ path: `${path}.value`, message: "not a string" });
        break;
      }
      const v = val.value as string;
      if (options.textInImage && isTextual[fdef.kind] && v.length > 0) {
        issues.push({
          path: `${path}.value`,
          message: "textInImage=true → text field must be empty",
        });
      }
      if (fdef.maxChars && v.length > fdef.maxChars) {
        issues.push({
          path: `${path}.value`,
          message: `${v.length} chars > maxChars ${fdef.maxChars}`,
        });
      }
      break;
    }
    case "image": {
      if (typeof val.prompt !== "string" || val.prompt.length < 10) {
        issues.push({
          path: `${path}.prompt`,
          message: "missing or too short",
        });
      }
      if (typeof val.altText !== "string" || val.altText.length === 0) {
        issues.push({ path: `${path}.altText`, message: "missing" });
      }
      if (val.status !== "pending") {
        issues.push({
          path: `${path}.status`,
          message: `expected "pending", got "${String(val.status)}"`,
        });
      }
      break;
    }
    case "imageList": {
      const items = val.items as unknown;
      if (!Array.isArray(items)) {
        issues.push({ path: `${path}.items`, message: "not an array" });
        break;
      }
      const expected = fdef.imageList?.count ?? 0;
      if (items.length !== expected) {
        issues.push({
          path: `${path}.items.length`,
          message: `expected ${expected}, got ${items.length}`,
        });
      }
      items.forEach((it, i) => {
        const item = it as Record<string, unknown>;
        if (typeof item.prompt !== "string" || item.prompt.length < 10) {
          issues.push({
            path: `${path}.items[${i}].prompt`,
            message: "missing or too short",
          });
        }
        if (typeof item.altText !== "string" || item.altText.length === 0) {
          issues.push({
            path: `${path}.items[${i}].altText`,
            message: "missing",
          });
        }
        if (item.status !== "pending") {
          issues.push({
            path: `${path}.items[${i}].status`,
            message: `expected "pending"`,
          });
        }
        const capMax = fdef.imageList?.captionMaxChars;
        if (capMax && typeof item.caption === "string" && item.caption.length > capMax) {
          issues.push({
            path: `${path}.items[${i}].caption`,
            message: `${item.caption.length} chars > ${capMax}`,
          });
        }
      });
      break;
    }
    case "specTable": {
      const rows = val.rows as unknown;
      if (!Array.isArray(rows)) {
        issues.push({ path: `${path}.rows`, message: "not an array" });
        break;
      }
      if (rows.length < 4 || rows.length > 16) {
        issues.push({
          path: `${path}.rows.length`,
          message: `${rows.length} not in [4,16]`,
        });
      }
      rows.forEach((r, i) => {
        const row = r as Record<string, unknown>;
        if (typeof row.key !== "string" || row.key.length === 0)
          issues.push({ path: `${path}.rows[${i}].key`, message: "missing" });
        if (typeof row.value !== "string" || row.value.length === 0)
          issues.push({
            path: `${path}.rows[${i}].value`,
            message: "missing",
          });
      });
      break;
    }
    case "comparison": {
      // Phase 4 nutzt vergleichstabelle nicht automatisch — leichte Prüfung
      if (!Array.isArray((val as Record<string, unknown>).products)) {
        issues.push({ path: `${path}.products`, message: "not an array" });
      }
      break;
    }
  }
}
