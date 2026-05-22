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

const SYSTEM_PROMPT = `Du bist Spezialist für Amazon A+ Content (deutscher Markt).
Du bekommst gescrapte Produktdaten und wählst aus dem Katalog der 17 Basic-Module die beste Storyline (bis zu 7 Module).

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
    { "type": "<module_type>", "reasoning": "<1-2 Sätze warum genau hier>" }
  ]
}

KATALOG (type → Beschreibung):
${buildModuleCatalog()}

PFLICHT-REGELN:
- modules.length zwischen 3 und 7.
- type muss EXAKT einer der oben gelisteten sein.
- Hero am Anfang: GENAU 1 von { bildheader, overlay_hell, overlay_dunkel, mehrfach_a }.
- helle Produkte → overlay_dunkel (dunkler Text auf hellem Background).
- dunkle Produkte → overlay_hell (heller Text auf dunklem Background).
- bunte/colorful Produkte → bildheader oder mehrfach_a bevorzugen.
- technische_angaben NUR wenn ≥4 echte Specs in den Produktdaten vorhanden sind.
- vergleichstabelle NUR wenn der User explizit Geschwister-ASINs liefert (in den Daten = niemals automatisch).
- firmenlogo NUR bei starker etablierter Marke (Standard: nein, weglassen).
- Module dürfen sich wiederholen, aber NICHT direkt hintereinander dasselbe.
- Lifestyle-Pause: keine zwei textlastigen Module hintereinander (z.B. nicht produkttext direkt nach standardtext).
- Reihenfolge folgt der Buyer Journey: Hero → Marke/Einordnung → USPs → Vertiefung → Anwendung → Specs → Abschluss.

ANALYSE:
- productCharacter visuell, basiert auf Farbe/Material der Produktfotos und -beschreibung.
- materials: max 3 prägende Materialien.
- targetAudience: ein konkreter Satz (kein "alle").
- coreMessage: EINE Kernaussage, max 12 Wörter, deutsch.
- rationale: 1-2 Sätze warum du das Produkt so siehst.

STORYLINE-LOGIK:
- Jedes ausgewählte Modul muss eine echte Funktion im Story-Flow erfüllen.
- reasoning ist KONKRET (kein "guter Übergang"), referenziert die Produkteigenschaft die dieses Modul abdeckt.`;

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
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, plan: plan as AplusPlan, issues: [] };
}
