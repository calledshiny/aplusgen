// Phase-3 Planung: Claude analysiert ein gescrapetes Produkt, wählt aus
// den 17 Basic-Modulen eine Storyline aus (bis zu 7 Module).
// Output ist eine `AplusPlan`-Struktur, die in der UI bearbeitet werden kann.

import type Anthropic from "@anthropic-ai/sdk";
import { MODULES, MODULES_BY_TYPE, type ModuleDef, type ModuleType } from "./modules";
import type { ScrapedProduct } from "./scraper";

export type ProductCharacter = "light" | "dark" | "colorful";

export type ProductAnalysis = {
  productCharacter: ProductCharacter;
  materials: string[];
  targetAudience: string;
  coreMessage: string;
  rationale: string;
};

export type SelectedModule = {
  type: ModuleType;
  reasoning: string;
  // textInImage = true → Text-Felder bleiben in Phase 4 LEER, dafür wird
  // der Claim/die Headline beim Bild-Prompt mit Typografie eingebrannt.
  // Auf Mobile entscheidend: ohne diesen Trick steht oben ein leeres Bild
  // und der Text rutscht weit drunter.
  textInImage: boolean;
  // imageBrief: was AUFS Bild soll (Motiv + ggf. zu setzender Text).
  // Wird in Phase 4 als Basis für den Higgsfield-Prompt verwendet.
  imageBrief: string;
};

export type AplusPlan = {
  analysis: ProductAnalysis;
  modules: SelectedModule[];
};

// Helper für Anzeige: wie viele Bilder hat ein Modul (max)
export function moduleImageCount(def: ModuleDef): number {
  return def.fields.reduce((sum, f) => {
    if (f.kind === "image") return sum + 1;
    if (f.kind === "imageList") return sum + (f.imageList?.count ?? 0);
    return sum;
  }, 0);
}

// --- Prompt-Bau ----------------------------------------------------------

function buildModuleCatalog(): string {
  // Kompakte Übersicht für Claude: Type, Name, Usage, Bildanzahl
  return MODULES.map((m) => {
    const imgs = moduleImageCount(m);
    const aiFlag = m.aiReady ? " 🔵" : "";
    return `- ${m.type}${aiFlag} (${imgs} Bild${imgs === 1 ? "" : "er"}) — ${m.name}: ${m.usage}`;
  }).join("\n");
}

const SYSTEM_PROMPT = `Du bist Spezialist für Amazon A+ Content (deutscher Markt) — und du denkst MOBILE-FIRST.

WICHTIGSTER KONTEXT (lies das doppelt):
Amazon Mobile zeigt in JEDEM Multi-Spalten-Modul die Bilder zuerst, der Text rutscht DARUNTER. Das heißt:
- Ein klassisches "Bild links, Text rechts"-Modul wird auf Mobile zu "leeres Bild oben, Text scrollt unten weg". Der User sieht ein dekoratives Bild ohne Kontext.
- Ein bildheader mit Headline UNTER dem Bild lässt den User erst ein riesiges Bild sehen, bevor er die Aussage findet.
- Die Folge: Text-/Bullet-Felder werden auf Mobile oft komplett übersehen.

UNSERE STRATEGIE: Bilder tragen die Aussage. Text wird in die Bilder GERENDERT (Typografie als Teil des Higgsfield-Prompts, Phase 4). Echte Text-Felder werden nur dort verwendet, wo Informationsdichte das verlangt (z.B. Spec-Tabellen, längere Erklärungen die nicht als Grafik funktionieren).

KONSEQUENZ für deine Module-Wahl:
- BEVORZUGE bildlastige Module: bildheader, overlay_hell, overlay_dunkel, mehrfach_a, drei_bilder, vier_bilder, vier_bilder_quadrant.
- VERMEIDE textlastige Module fast immer: produkttext (nie ohne Grund), standardtext (selten, nur als Brand-Closing), einzelbild_specs (nur bei wirklich vielen Spec-Schichten), einzelbild_markierungen (nur bei wirklich 3+ Detail-Erklärungen die nicht ins Bild passen).
- einzelbild_links / einzelbild_rechts NUR wenn es einen echten erklärenden Fließtext gibt der nicht ins Bild passt.
- Lieber mehr image-driven Module mit textInImage=true als wenige text-driven Module.

textInImage=true bedeutet: alle Text-Felder dieses Moduls werden in Phase 4 LEER bleiben; stattdessen schreibst du den gewünschten Claim/die Headline in imageBrief, und Higgsfield rendert ihn typografisch ins Bild.
textInImage=false bedeutet: die Text-Felder werden in Phase 4 gefüllt; das Bild bleibt ohne eingebrannte Typografie.

Gib NUR ein JSON-Objekt zurück, kein Markdown, keine Codefences:

{
  "analysis": {
    "productCharacter": "light" | "dark" | "colorful",
    "materials": string[],
    "targetAudience": string,
    "coreMessage": string,
    "rationale": string
  },
  "modules": [
    {
      "type": "<module_type>",
      "reasoning": "<1-2 Sätze warum dieses Modul an dieser Stelle>",
      "textInImage": true | false,
      "imageBrief": "<Was zeigt das Bild? Wenn textInImage=true, welcher Text+Typo-Stil soll eingebrannt werden? Wenn textInImage=false, nur das Motiv beschreiben.>"
    }
  ]
}

KATALOG (type → Beschreibung):
${buildModuleCatalog()}

PFLICHT-REGELN:
- modules.length zwischen 3 und 7.
- type muss EXAKT einer der oben gelisteten sein.
- Hero am Anfang: GENAU 1 von { bildheader, overlay_hell, overlay_dunkel, mehrfach_a } — und in der Regel mit textInImage=true (Hero-Claim als Typo aufs Bild).
- helle Produkte → overlay_dunkel.
- dunkle Produkte → overlay_hell.
- bunte/colorful Produkte → bildheader oder mehrfach_a bevorzugen.
- technische_angaben NUR wenn ≥4 echte Specs in den Produktdaten vorhanden sind (Specs sind Inhalt der NICHT als Bild funktioniert — hier textInImage=false).
- vergleichstabelle NUR wenn User explizit Geschwister-ASINs liefert (default niemals).
- firmenlogo NUR bei starker etablierter Marke (default weglassen).
- Module dürfen sich wiederholen, aber NICHT direkt hintereinander dasselbe.
- Reihenfolge folgt der Buyer Journey: Hero → Einordnung → USPs → Vertiefung → Anwendung → Specs → Abschluss.

WANN textInImage=true (Default für die meisten Module):
- Hero-Module immer.
- USP-Module (drei_bilder, vier_bilder, vier_bilder_quadrant) wenn der Claim pro Kachel kurz ist (max ~6 Wörter pro Bild).
- overlay_hell/overlay_dunkel praktisch immer.
- mehrfach_a fast immer.
- bildheader fast immer.

WANN textInImage=false (Ausnahmefälle):
- technische_angaben (Spec-Tabelle, gehört nicht ins Bild).
- vergleichstabelle (Tabelle, gehört nicht ins Bild).
- produkttext / standardtext (Fließtext-Module — falls du sie überhaupt nutzt).
- einzelbild_specs / einzelbild_markierungen / einzelbild_seitenleiste (komplexe Text-Strukturen).
- Wenn die nötige Erklärung länger als ~15 Wörter ist und nicht typografisch funktioniert.

imageBrief-Schema:
- Wenn textInImage=true: "[Motiv-Beschreibung]. Eingebrannter Text: '[exakter Claim]', Stil: [serif/sans/handschriftlich, weiß auf dunkel / dunkel auf hell, mittig/links unten/etc.]."
- Wenn textInImage=false: nur das Motiv, kein Text auf dem Bild ("clean studio shot, kein Text").

ANALYSE:
- productCharacter visuell, basiert auf Farbe/Material der Produktfotos und -beschreibung.
- materials: max 3 prägende Materialien.
- targetAudience: ein konkreter Satz (kein "alle").
- coreMessage: EINE Kernaussage, max 12 Wörter, deutsch.
- rationale: 1-2 Sätze warum du das Produkt so siehst.

reasoning pro Modul ist KONKRET (kein "guter Übergang"), referenziert die Produkteigenschaft die dieses Modul abdeckt UND nennt warum gerade Bild-Typo vs. echter Text die richtige Wahl ist.`;

export function buildPlanMessages(scraped: ScrapedProduct): Anthropic.MessageParam[] {
  const userBlock = [
    `URL: ${scraped.url}`,
    `Titel: ${scraped.title}`,
    scraped.brand ? `Marke: ${scraped.brand}` : null,
    scraped.category ? `Kategorie: ${scraped.category}` : null,
    scraped.bullets.length
      ? `Bullets:\n- ${scraped.bullets.join("\n- ")}`
      : null,
    Object.keys(scraped.technicalDetails).length
      ? `Specs (${Object.keys(scraped.technicalDetails).length}):\n${Object.entries(
          scraped.technicalDetails,
        )
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n")}`
      : `Specs: keine`,
    scraped.description
      ? `Beschreibung:\n${scraped.description.slice(0, 1500)}`
      : null,
    `Anzahl Produktbilder: ${scraped.images.length}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [{ role: "user", content: userBlock }];
}

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

// --- Validierung ---------------------------------------------------------

type Issue = { path: string; message: string };

export function validatePlan(plan: unknown): {
  ok: boolean;
  plan?: AplusPlan;
  issues: Issue[];
} {
  const issues: Issue[] = [];

  if (typeof plan !== "object" || plan === null) {
    return { ok: false, issues: [{ path: "$", message: "not an object" }] };
  }
  const p = plan as Record<string, unknown>;
  const analysis = p.analysis as Record<string, unknown> | undefined;
  const modules = p.modules as unknown[] | undefined;

  if (!analysis) issues.push({ path: "analysis", message: "missing" });
  if (!Array.isArray(modules))
    issues.push({ path: "modules", message: "missing or not array" });

  if (analysis) {
    const char = analysis.productCharacter;
    if (char !== "light" && char !== "dark" && char !== "colorful") {
      issues.push({
        path: "analysis.productCharacter",
        message: `invalid value: ${String(char)}`,
      });
    }
    if (!Array.isArray(analysis.materials))
      issues.push({ path: "analysis.materials", message: "not an array" });
    for (const f of ["targetAudience", "coreMessage", "rationale"] as const) {
      if (typeof analysis[f] !== "string")
        issues.push({ path: `analysis.${f}`, message: "not a string" });
    }
  }

  if (Array.isArray(modules)) {
    if (modules.length < 1)
      issues.push({ path: "modules", message: "empty" });
    if (modules.length > 7)
      issues.push({
        path: "modules",
        message: `too many: ${modules.length} > 7`,
      });
    modules.forEach((m, i) => {
      const mo = m as Record<string, unknown>;
      const type = mo.type as string | undefined;
      if (!type || !(type in MODULES_BY_TYPE)) {
        issues.push({
          path: `modules[${i}].type`,
          message: `unknown module type: ${String(type)}`,
        });
      }
      if (typeof mo.reasoning !== "string") {
        issues.push({
          path: `modules[${i}].reasoning`,
          message: "not a string",
        });
      }
      if (typeof mo.textInImage !== "boolean") {
        issues.push({
          path: `modules[${i}].textInImage`,
          message: "not a boolean",
        });
      }
      if (typeof mo.imageBrief !== "string") {
        issues.push({
          path: `modules[${i}].imageBrief`,
          message: "not a string",
        });
      }
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, plan: plan as AplusPlan, issues: [] };
}
