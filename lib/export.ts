// ZIP-Export-Builder.
// Bündelt für einen Output:
//   - texte.md          → menschlich lesbar, fürs Copy/Paste in Seller Central
//   - texte.json        → kompletter generierter Output (für Re-Import/Backup)
//   - bild-prompts.md   → alle Higgsfield-Prompts + Alt-Texte sortiert
//   - images/NN-modul-feldid[-i].png  → alle erfolgreich generierten Bilder

import JSZip from "jszip";
import {
  type FieldDef,
  MODULES_BY_TYPE,
  type ModuleType,
} from "./modules";
import type {
  FieldValue,
  GeneratedModule,
} from "./content";
import type { ProductAnalysis, SelectedModule } from "./plan";
import type { ScrapedProduct } from "./scraper";

export type ExportSlot = {
  module: SelectedModule;
  generated: GeneratedModule | null;
};

export type ExportInput = {
  scraped: ScrapedProduct;
  analysis: ProductAnalysis;
  slots: ExportSlot[];
};

// --- Markdown-Builder ----------------------------------------------------

function imageFilename(
  position: number,
  moduleType: ModuleType,
  fieldId: string,
  itemIndex?: number,
): string {
  const pos = String(position).padStart(2, "0");
  const suffix = itemIndex !== undefined ? `-${itemIndex + 1}` : "";
  return `images/${pos}-${moduleType}-${fieldId}${suffix}.png`;
}

function describeFieldValue(
  fdef: FieldDef,
  value: FieldValue,
  position: number,
  moduleType: ModuleType,
): string {
  const lines: string[] = [];
  lines.push(`### ${fdef.label}`);
  if (fdef.required) lines.push("_(Pflichtfeld)_");

  switch (value.kind) {
    case "text":
    case "richtext":
      if (value.value.length === 0) {
        lines.push("_(leer — Text wird ins Bild gerendert)_");
      } else {
        lines.push("");
        lines.push("```");
        lines.push(value.value);
        lines.push("```");
      }
      break;
    case "image":
      lines.push(
        `- **Datei:** \`${imageFilename(position, moduleType, fdef.id)}\` ${value.src ? "" : "_(nicht generiert)_"}`,
      );
      lines.push(`- **Alt-Text:** ${value.altText}`);
      if (fdef.image) {
        lines.push(
          `- **Pixel:** ${fdef.image.widthPx}×${fdef.image.heightPx} (${fdef.image.aspectRatio})`,
        );
      }
      lines.push("- **Prompt (EN):**");
      lines.push("  ```");
      for (const l of value.prompt.split("\n")) lines.push(`  ${l}`);
      lines.push("  ```");
      break;
    case "imageList":
      value.items.forEach((item, i) => {
        lines.push("");
        lines.push(`**Bild ${i + 1}**`);
        lines.push(
          `- Datei: \`${imageFilename(position, moduleType, fdef.id, i)}\` ${item.src ? "" : "_(nicht generiert)_"}`,
        );
        if (item.caption) lines.push(`- Caption: ${item.caption}`);
        lines.push(`- Alt-Text: ${item.altText}`);
        lines.push("- Prompt (EN):");
        lines.push("  ```");
        for (const l of item.prompt.split("\n")) lines.push(`  ${l}`);
        lines.push("  ```");
      });
      break;
    case "specTable":
      lines.push("");
      lines.push("| Spezifikation | Wert |");
      lines.push("|---|---|");
      for (const r of value.rows) {
        lines.push(`| ${escapeCell(r.key)} | ${escapeCell(r.value)} |`);
      }
      break;
    case "comparison":
      lines.push(
        "_(Vergleichstabelle — in V1 nicht automatisch generiert.)_",
      );
      break;
  }
  return lines.join("\n");
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function buildMarkdown(input: ExportInput): string {
  const { scraped, analysis, slots } = input;
  const out: string[] = [];

  out.push(`# A+ Content Export`);
  out.push("");
  out.push(`**Produkt:** ${scraped.title}`);
  if (scraped.brand) out.push(`**Marke:** ${scraped.brand}`);
  if (scraped.category) out.push(`**Kategorie:** ${scraped.category}`);
  out.push(`**Quelle:** ${scraped.url}`);
  out.push(`**Stand:** ${new Date().toISOString()}`);
  out.push("");

  out.push(`## Analyse`);
  out.push("");
  out.push(`- **Charakter:** ${analysis.productCharacter}`);
  out.push(`- **Materialien:** ${analysis.materials.join(", ")}`);
  out.push(`- **Zielgruppe:** ${analysis.targetAudience}`);
  out.push(`- **Kern-Aussage:** ${analysis.coreMessage}`);
  out.push(`- **Rationale:** ${analysis.rationale}`);
  out.push("");

  out.push(`---`);
  out.push("");
  out.push(`## Storyline (${slots.length} Module)`);
  out.push("");

  slots.forEach((slot, i) => {
    const position = i + 1;
    const def = MODULES_BY_TYPE[slot.module.type];
    out.push(
      `### ${String(position).padStart(2, "0")} · ${def.name} \`${slot.module.type}\``,
    );
    out.push("");
    out.push(
      `**Modus:** ${slot.module.textInImage ? "Text im Bild" : "Echter Text"}`,
    );
    out.push(`**Begründung:** ${slot.module.reasoning}`);
    if (slot.module.imageBrief) {
      out.push(`**Bild-Brief:** ${slot.module.imageBrief}`);
    }
    out.push("");

    if (!slot.generated) {
      out.push(`_(Content für dieses Modul nicht generiert)_`);
      out.push("");
      out.push("---");
      out.push("");
      return;
    }

    for (const fdef of def.fields) {
      const value = slot.generated.fields[fdef.id];
      if (!value) continue;
      out.push(describeFieldValue(fdef, value, position, slot.module.type));
      out.push("");
    }
    out.push("---");
    out.push("");
  });

  return out.join("\n");
}

export function buildPromptsMarkdown(input: ExportInput): string {
  const { slots } = input;
  const out: string[] = [];
  out.push(`# Bild-Prompts`);
  out.push("");
  out.push(
    `Alle Higgsfield-Prompts dieses Exports, sortiert nach Storyline-Position.`,
  );
  out.push("");

  slots.forEach((slot, i) => {
    const position = i + 1;
    const def = MODULES_BY_TYPE[slot.module.type];
    if (!slot.generated) return;

    const imageFields = def.fields.filter(
      (f) => f.kind === "image" || f.kind === "imageList",
    );
    if (imageFields.length === 0) return;

    out.push(
      `## ${String(position).padStart(2, "0")} · ${def.name} \`${slot.module.type}\``,
    );
    out.push("");

    for (const fdef of imageFields) {
      const value = slot.generated.fields[fdef.id];
      if (!value) continue;
      if (value.kind === "image") {
        out.push(`### ${fdef.label}`);
        out.push(
          `- Datei: \`${imageFilename(position, slot.module.type, fdef.id)}\``,
        );
        out.push(`- Alt-Text: ${value.altText}`);
        out.push("- Prompt:");
        out.push("  ```");
        for (const l of value.prompt.split("\n")) out.push(`  ${l}`);
        out.push("  ```");
        out.push("");
      } else if (value.kind === "imageList") {
        value.items.forEach((item, idx) => {
          out.push(`### ${fdef.label} · Bild ${idx + 1}`);
          out.push(
            `- Datei: \`${imageFilename(position, slot.module.type, fdef.id, idx)}\``,
          );
          if (item.caption) out.push(`- Caption: ${item.caption}`);
          out.push(`- Alt-Text: ${item.altText}`);
          out.push("- Prompt:");
          out.push("  ```");
          for (const l of item.prompt.split("\n")) out.push(`  ${l}`);
          out.push("  ```");
          out.push("");
        });
      }
    }
  });

  return out.join("\n");
}

// --- Image-Liste ---------------------------------------------------------

export type ImageJob = {
  src: string;
  path: string; // ZIP-internal path
};

export function collectImageJobs(input: ExportInput): ImageJob[] {
  const jobs: ImageJob[] = [];
  input.slots.forEach((slot, i) => {
    const position = i + 1;
    if (!slot.generated) return;
    const def = MODULES_BY_TYPE[slot.module.type];
    for (const fdef of def.fields) {
      const value = slot.generated.fields[fdef.id];
      if (!value) continue;
      if (value.kind === "image" && value.src) {
        jobs.push({
          src: value.src,
          path: imageFilename(position, slot.module.type, fdef.id),
        });
      } else if (value.kind === "imageList") {
        value.items.forEach((item, idx) => {
          if (item.src) {
            jobs.push({
              src: item.src,
              path: imageFilename(position, slot.module.type, fdef.id, idx),
            });
          }
        });
      }
    }
  });
  return jobs;
}

// --- ZIP-Build -----------------------------------------------------------

export type BuildZipOptions = {
  onProgress?: (done: number, total: number, message?: string) => void;
};

async function fetchImageBlob(src: string): Promise<Blob> {
  const url = `/api/proxy-image?url=${encodeURIComponent(src)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Image fetch failed: ${src} → HTTP ${res.status}`);
  }
  return await res.blob();
}

export async function buildZip(
  input: ExportInput,
  options: BuildZipOptions = {},
): Promise<Blob> {
  const zip = new JSZip();

  const markdown = buildMarkdown(input);
  const promptsMarkdown = buildPromptsMarkdown(input);
  zip.file("texte.md", markdown);
  zip.file("bild-prompts.md", promptsMarkdown);
  zip.file(
    "texte.json",
    JSON.stringify(
      {
        scrapedUrl: input.scraped.url,
        title: input.scraped.title,
        brand: input.scraped.brand,
        category: input.scraped.category,
        analysis: input.analysis,
        modules: input.slots.map((s) => ({
          type: s.module.type,
          textInImage: s.module.textInImage,
          imageBrief: s.module.imageBrief,
          reasoning: s.module.reasoning,
          generated: s.generated,
        })),
      },
      null,
      2,
    ),
  );

  const jobs = collectImageJobs(input);
  const total = jobs.length;
  options.onProgress?.(0, total, "Bilder werden geladen…");

  let done = 0;
  for (const job of jobs) {
    try {
      const blob = await fetchImageBlob(job.src);
      zip.file(job.path, blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fehler nicht abbrechen — markiere in fehlende-bilder.txt
      const existing =
        (zip.file("fehlende-bilder.txt")?.async("string")) ?? Promise.resolve("");
      const prev = await existing;
      zip.file(
        "fehlende-bilder.txt",
        prev + `${job.path}\t${job.src}\t${msg}\n`,
      );
    }
    done++;
    options.onProgress?.(done, total);
  }

  options.onProgress?.(total, total, "ZIP wird gepackt…");
  return await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
