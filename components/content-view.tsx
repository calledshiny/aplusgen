"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MODULES_BY_TYPE,
  type AspectRatio,
  type FieldDef,
  type ModuleType,
} from "@/lib/modules";
import type {
  FieldValue,
  GeneratedModule,
  ImageField,
  ImageListField,
  RichTextField,
  SpecTableField,
  TextField,
} from "@/lib/content";
import type { ProductAnalysis, SelectedModule } from "@/lib/plan";
import type { ScrapedProduct } from "@/lib/scraper";

export type StoryItem = {
  id: string;
  module: SelectedModule;
};

type Status = "pending" | "generating" | "done" | "error";

type SlotState = {
  item: StoryItem;
  status: Status;
  generated?: GeneratedModule;
  error?: string;
};

export function ContentView({
  scraped,
  analysis,
  story,
  onBack,
}: {
  scraped: ScrapedProduct;
  analysis: ProductAnalysis;
  story: StoryItem[];
  onBack: () => void;
}) {
  const [slots, setSlots] = useState<SlotState[]>(() =>
    story.map((item) => ({ item, status: "pending" })),
  );
  const [running, setRunning] = useState(false);
  const [imagesRunning, setImagesRunning] = useState(false);
  const cancelRef = useRef(false);

  // Default: erstes Produktbild als Referenz für alle Bild-Generierungen.
  // (Spec sieht eigentlich User-Auswahl vor — V1 simpel.)
  const refImageUrls = scraped.images.slice(0, 1);

  const generateOne = useCallback(
    async (index: number) => {
      const slot = slots[index];
      if (!slot) return;
      setSlots((prev) =>
        prev.map((s, i) =>
          i === index
            ? { ...s, status: "generating", error: undefined }
            : s,
        ),
      );
      try {
        const res = await fetch("/api/generate-module", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scraped,
            analysis,
            module: slot.item.module,
            position: index + 1,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const detail =
            data.detail ||
            (data.issues
              ? data.issues
                  .map((i: { path: string; message: string }) => `${i.path}: ${i.message}`)
                  .join("; ")
              : data.error) ||
            `HTTP ${res.status}`;
          setSlots((prev) =>
            prev.map((s, i) =>
              i === index ? { ...s, status: "error", error: detail } : s,
            ),
          );
        } else {
          setSlots((prev) =>
            prev.map((s, i) =>
              i === index
                ? { ...s, status: "done", generated: data as GeneratedModule }
                : s,
            ),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSlots((prev) =>
          prev.map((s, i) =>
            i === index ? { ...s, status: "error", error: message } : s,
          ),
        );
      }
    },
    [analysis, scraped, slots],
  );

  // Sequential generate-all loop. Triggered by useEffect on first mount.
  const runAll = useCallback(async () => {
    if (running) return;
    setRunning(true);
    cancelRef.current = false;
    for (let i = 0; i < story.length; i++) {
      if (cancelRef.current) break;
      // Re-read latest slot to avoid stale closure on slots[]; check status.
      // We always (re)generate from where we are — used at start and on retry-all
      await generateOne(i);
    }
    setRunning(false);
  }, [generateOne, running, story.length]);

  // Auto-start on mount
  useEffect(() => {
    void runAll();
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Bild-Generierung ------------------------------------------------
  const updateSlotField = useCallback(
    (
      slotIndex: number,
      fieldId: string,
      updater: (v: FieldValue) => FieldValue,
    ) => {
      setSlots((prev) =>
        prev.map((s, i) => {
          if (i !== slotIndex || !s.generated) return s;
          const cur = s.generated.fields[fieldId];
          if (!cur) return s;
          return {
            ...s,
            generated: {
              ...s.generated,
              fields: { ...s.generated.fields, [fieldId]: updater(cur) },
            },
          };
        }),
      );
    },
    [],
  );

  const generateImageForSlot = useCallback(
    async (
      slotIndex: number,
      fieldId: string,
      prompt: string,
      aspectRatio: AspectRatio | undefined,
      textInImage: boolean,
      itemIndex?: number,
    ) => {
      // status: generating
      updateSlotField(slotIndex, fieldId, (v) => {
        if (v.kind === "image") return { ...v, status: "generating" };
        if (v.kind === "imageList" && itemIndex !== undefined) {
          return {
            ...v,
            items: v.items.map((it, i) =>
              i === itemIndex ? { ...it, status: "generating" } : it,
            ),
          };
        }
        return v;
      });

      try {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            aspectRatio,
            resolution: "2k",
            textInImage,
            refImageUrls,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const detail = data.detail || data.error || `HTTP ${res.status}`;
          updateSlotField(slotIndex, fieldId, (v) => {
            if (v.kind === "image") return { ...v, status: "error" };
            if (v.kind === "imageList" && itemIndex !== undefined) {
              return {
                ...v,
                items: v.items.map((it, i) =>
                  i === itemIndex ? { ...it, status: "error" } : it,
                ),
              };
            }
            return v;
          });
          console.error("Image gen failed:", detail);
          return;
        }
        const url = (data as { url: string }).url;
        updateSlotField(slotIndex, fieldId, (v) => {
          if (v.kind === "image")
            return { ...v, src: url, status: "done" };
          if (v.kind === "imageList" && itemIndex !== undefined) {
            return {
              ...v,
              items: v.items.map((it, i) =>
                i === itemIndex ? { ...it, src: url, status: "done" } : it,
              ),
            };
          }
          return v;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Image gen exception:", message);
      }
    },
    [refImageUrls, updateSlotField],
  );

  const generateImagesForSlot = useCallback(
    async (slotIndex: number) => {
      // Wir lesen aus dem aktuellen state via Closure — kann veraltet sein.
      // Trick: setSlots-Callback um den aktuellen Snapshot zu kriegen.
      let snapshot: SlotState[] = [];
      setSlots((prev) => {
        snapshot = prev;
        return prev;
      });
      const slot = snapshot[slotIndex];
      if (!slot?.generated) return;
      const def = MODULES_BY_TYPE[slot.item.module.type];
      const textInImage = slot.item.module.textInImage;

      for (const fdef of def.fields) {
        const val = slot.generated.fields[fdef.id];
        if (!val) continue;

        if (val.kind === "image") {
          if (val.src) continue; // already done
          await generateImageForSlot(
            slotIndex,
            fdef.id,
            val.prompt,
            fdef.image?.aspectRatio,
            textInImage,
          );
        } else if (val.kind === "imageList") {
          for (let i = 0; i < val.items.length; i++) {
            const it = val.items[i];
            if (it.src) continue;
            await generateImageForSlot(
              slotIndex,
              fdef.id,
              it.prompt,
              fdef.imageList?.itemImage.aspectRatio,
              textInImage,
              i,
            );
          }
        }
      }
    },
    [generateImageForSlot],
  );

  const runAllImages = useCallback(async () => {
    if (imagesRunning) return;
    setImagesRunning(true);
    cancelRef.current = false;
    let snapshot: SlotState[] = [];
    setSlots((prev) => {
      snapshot = prev;
      return prev;
    });
    for (let i = 0; i < snapshot.length; i++) {
      if (cancelRef.current) break;
      if (snapshot[i]?.status !== "done") continue;
      await generateImagesForSlot(i);
    }
    setImagesRunning(false);
  }, [generateImagesForSlot, imagesRunning]);

  const done = slots.filter((s) => s.status === "done").length;
  const total = slots.length;
  const imagesDone = slots.reduce((sum, s) => {
    if (!s.generated) return sum;
    let n = 0;
    for (const v of Object.values(s.generated.fields)) {
      if (v.kind === "image" && v.src) n++;
      else if (v.kind === "imageList")
        n += v.items.filter((it) => it.src).length;
    }
    return sum + n;
  }, 0);
  const imagesTotal = slots.reduce((sum, s) => {
    if (!s.generated) return sum;
    let n = 0;
    for (const v of Object.values(s.generated.fields)) {
      if (v.kind === "image") n++;
      else if (v.kind === "imageList") n += v.items.length;
    }
    return sum + n;
  }, 0);

  const exportJson = useMemo(() => {
    const payload = {
      scrapedUrl: scraped.url,
      analysis,
      modules: slots.map((s) => ({
        type: s.item.module.type,
        textInImage: s.item.module.textInImage,
        imageBrief: s.item.module.imageBrief,
        reasoning: s.item.module.reasoning,
        status: s.status,
        generated: s.generated ?? null,
        error: s.error ?? null,
      })),
    };
    return JSON.stringify(payload, null, 2);
  }, [analysis, scraped.url, slots]);

  function downloadJson() {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aplus-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Content-Generierung
          </h3>
          <div className="mt-1 flex gap-3 text-xs text-zinc-500">
            <span>
              Texte: {done}/{total} Module {running && "· läuft…"}
            </span>
            {done > 0 && (
              <span>
                Bilder: {imagesDone}/{imagesTotal}{" "}
                {imagesRunning && "· läuft…"}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={runAllImages}
            disabled={
              imagesRunning || running || done === 0 || imagesDone === imagesTotal
            }
          >
            {imagesRunning
              ? "Bilder läuft…"
              : imagesDone === 0
                ? "Bilder generieren"
                : "Restliche Bilder"}
          </Button>
          <Button type="button" variant="secondary" onClick={downloadJson}>
            JSON exportieren
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              cancelRef.current = true;
              onBack();
            }}
          >
            Zurück zum Plan
          </Button>
        </div>
      </div>

      {slots.map((slot, i) => (
        <ModuleSection
          key={slot.item.id}
          slot={slot}
          index={i}
          onRetry={() => generateOne(i)}
          retryDisabled={slot.status === "generating"}
        />
      ))}
    </div>
  );
}

function ModuleSection({
  slot,
  index,
  onRetry,
  retryDisabled,
}: {
  slot: SlotState;
  index: number;
  onRetry: () => void;
  retryDisabled: boolean;
}) {
  const def = MODULES_BY_TYPE[slot.item.module.type];
  const statusColor = {
    pending: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
    generating: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  }[slot.status];

  return (
    <details
      open={slot.status === "done" || slot.status === "error"}
      className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <summary className="flex cursor-pointer items-center gap-3 p-3">
        <span className="w-7 shrink-0 text-right font-mono text-sm text-zinc-500">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="flex-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
          {def.name}
        </span>
        {slot.item.module.textInImage && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            Text im Bild
          </span>
        )}
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${statusColor}`}
        >
          {slot.status === "pending" && "wartet"}
          {slot.status === "generating" && "generiert…"}
          {slot.status === "done" && "fertig"}
          {slot.status === "error" && "fehler"}
        </span>
      </summary>

      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        {slot.status === "error" && (
          <div className="space-y-2">
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <div className="font-medium">Fehler bei der Generierung</div>
              <div className="mt-1 break-all font-mono text-xs">
                {slot.error}
              </div>
            </div>
            <Button onClick={onRetry} disabled={retryDisabled} variant="secondary">
              Erneut versuchen
            </Button>
          </div>
        )}

        {slot.status === "generating" && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="size-3 animate-pulse rounded-full bg-blue-500" />
            Claude schreibt gerade…
          </div>
        )}

        {slot.status === "pending" && (
          <div className="text-sm text-zinc-500">Wartet auf vorherige Module…</div>
        )}

        {slot.status === "done" && slot.generated && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={onRetry} disabled={retryDisabled} variant="ghost">
                ↻ Neu generieren
              </Button>
            </div>
            {def.fields.map((fdef) => {
              const value = slot.generated!.fields[fdef.id];
              if (!value) return null;
              return (
                <FieldDisplay key={fdef.id} fdef={fdef} value={value} />
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

function FieldDisplay({ fdef, value }: { fdef: FieldDef; value: FieldValue }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <div className="text-xs uppercase tracking-wider text-zinc-500">
          {fdef.label}
        </div>
        {fdef.group && (
          <div className="text-[10px] text-zinc-400">[{fdef.group}]</div>
        )}
        {fdef.required && (
          <div className="text-[10px] text-zinc-400">Pflicht</div>
        )}
      </div>
      <FieldBody fdef={fdef} value={value} />
    </div>
  );
}

function FieldBody({ fdef, value }: { fdef: FieldDef; value: FieldValue }) {
  switch (value.kind) {
    case "text":
      return <TextDisplay value={value} max={fdef.maxChars} />;
    case "richtext":
      return <RichTextDisplay value={value} max={fdef.maxChars} />;
    case "image":
      return <ImageSlot value={value} spec={fdef.image} />;
    case "imageList":
      return (
        <ImageListSlot
          value={value}
          itemSpec={fdef.imageList?.itemImage}
        />
      );
    case "specTable":
      return <SpecTableDisplay value={value} />;
    case "comparison":
      return (
        <div className="text-sm text-zinc-500">
          Vergleichstabelle wird in V1 nicht automatisch generiert.
        </div>
      );
  }
}

function TextDisplay({ value, max }: { value: TextField; max?: number }) {
  const empty = value.value.length === 0;
  return (
    <div className="group relative rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      {empty ? (
        <div className="text-sm italic text-zinc-400">
          (leer — Text wird ins Bild gerendert)
        </div>
      ) : (
        <div className="text-sm text-zinc-900 dark:text-zinc-100">
          {value.value}
        </div>
      )}
      <CopyButton text={value.value} disabled={empty} />
      {max && !empty && (
        <div className="mt-1 text-[10px] text-zinc-400">
          {value.value.length}/{max} Zeichen
        </div>
      )}
    </div>
  );
}

function RichTextDisplay({
  value,
  max,
}: {
  value: RichTextField;
  max?: number;
}) {
  const empty = value.value.length === 0;
  return (
    <div className="group relative rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      {empty ? (
        <div className="text-sm italic text-zinc-400">
          (leer — Text wird ins Bild gerendert)
        </div>
      ) : (
        <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-900 dark:text-zinc-100">
          {value.value}
        </pre>
      )}
      <CopyButton text={value.value} disabled={empty} />
      {max && !empty && (
        <div className="mt-1 text-[10px] text-zinc-400">
          {value.value.length}/{max} Zeichen
        </div>
      )}
    </div>
  );
}

function ImageSlot({
  value,
  spec,
}: {
  value: ImageField;
  spec?: { widthPx: number; heightPx: number; aspectRatio: string };
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {spec
            ? `${spec.widthPx}×${spec.heightPx} (${spec.aspectRatio})`
            : "Bild"}
        </span>
        <StatusBadge status={value.status} />
      </div>
      <ImagePreview src={value.src} status={value.status} alt={value.altText} />
      <div className="mt-2 grid gap-2">
        <PromptBlock label="Prompt (EN)" text={value.prompt} />
        <PromptBlock label="Alt-Text (DE)" text={value.altText} />
      </div>
    </div>
  );
}

function ImageListSlot({
  value,
  itemSpec,
}: {
  value: ImageListField;
  itemSpec?: { widthPx: number; heightPx: number; aspectRatio: string };
}) {
  return (
    <div className="space-y-3">
      {value.items.map((item, i) => (
        <div
          key={i}
          className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              Bild {i + 1}{" "}
              {itemSpec &&
                `· ${itemSpec.widthPx}×${itemSpec.heightPx} (${itemSpec.aspectRatio})`}
            </span>
            <StatusBadge status={item.status} />
          </div>
          <ImagePreview
            src={item.src}
            status={item.status}
            alt={item.altText}
          />
          {item.caption && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Caption
              </div>
              <div className="text-sm text-zinc-900 dark:text-zinc-100">
                {item.caption}
              </div>
            </div>
          )}
          <div className="mt-2 grid gap-2">
            <PromptBlock label="Prompt (EN)" text={item.prompt} />
            <PromptBlock label="Alt-Text (DE)" text={item.altText} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "pending" | "generating" | "done" | "error";
}) {
  const map = {
    pending: { label: "wartet", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400" },
    generating: { label: "generiert…", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    done: { label: "fertig", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    error: { label: "fehler", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  }[status];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map.cls}`}>
      {map.label}
    </span>
  );
}

function ImagePreview({
  src,
  status,
  alt,
}: {
  src?: string;
  status: "pending" | "generating" | "done" | "error";
  alt: string;
}) {
  if (src) {
    return (
      <div className="mt-2 overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="block max-h-96 w-full object-contain"
        />
        <div className="border-t border-zinc-200 px-2 py-1 text-right text-[10px] dark:border-zinc-800">
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ↗ Original (PNG, 2k)
          </a>
        </div>
      </div>
    );
  }
  if (status === "generating") {
    return (
      <div className="mt-2 flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-2 text-sm text-zinc-500">
          <span className="size-3 animate-pulse rounded-full bg-blue-500" />
          Higgsfield generiert…
        </div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="mt-2 flex aspect-square items-center justify-center rounded-md border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
        <div className="text-sm text-red-600 dark:text-red-300">
          Generierung fehlgeschlagen
        </div>
      </div>
    );
  }
  return null;
}

function SpecTableDisplay({ value }: { value: SpecTableField }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <table className="w-full text-sm">
        <tbody>
          {value.rows.map((r, i) => (
            <tr
              key={i}
              className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800"
            >
              <td className="py-1.5 pr-3 text-zinc-500">{r.key}</td>
              <td className="py-1.5 text-zinc-900 dark:text-zinc-100">
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-100 px-2 py-1 dark:border-zinc-800">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <CopyButton text={text} inline />
      </div>
      <div className="px-2 py-1.5 text-xs text-zinc-800 dark:text-zinc-300">
        {text}
      </div>
    </div>
  );
}

function CopyButton({
  text,
  inline = false,
  disabled = false,
}: {
  text: string;
  inline?: boolean;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (disabled) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  if (inline) {
    return (
      <button
        type="button"
        onClick={copy}
        disabled={disabled}
        className="text-[10px] text-zinc-400 hover:text-zinc-900 disabled:opacity-30 dark:hover:text-zinc-100"
      >
        {copied ? "✓ kopiert" : "Kopieren"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled}
      className="absolute right-2 top-2 rounded bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 opacity-0 shadow-sm hover:text-zinc-900 group-hover:opacity-100 disabled:opacity-30 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      {copied ? "✓ kopiert" : "Kopieren"}
    </button>
  );
}
