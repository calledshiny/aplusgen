"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  MODULES_BY_TYPE,
  type AspectRatio,
  type FieldDef,
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
  const [lastError, setLastError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // Ref hält IMMER den aktuellen state-Snapshot — ohne async-Lag wie bei
  // setSlots-Updater-Trick. Sync mit jedem Render.
  const slotsRef = useRef<SlotState[]>(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // Erstes Produktbild als Referenz für alle Bild-Generierungen (V1).
  const refImageUrls = useMemo(() => scraped.images.slice(0, 1), [scraped.images]);

  // --- State-Updater Helpers ------------------------------------------
  const patchSlotField = useCallback(
    (slotIndex: number, fieldId: string, updater: (v: FieldValue) => FieldValue) => {
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

  // Editierbare Texte schreiben in den state zurück. Diese Werte landen
  // auch im JSON-Export und werden bei „Neu generieren" ÜBERSCHRIEBEN —
  // user-edits sind also nur stabil solange nicht regeneriert wird.
  const setTextValue = useCallback(
    (slotIndex: number, fieldId: string, value: string) =>
      patchSlotField(slotIndex, fieldId, (v) => {
        if (v.kind === "text" || v.kind === "richtext") return { ...v, value };
        return v;
      }),
    [patchSlotField],
  );

  const setImagePrompt = useCallback(
    (slotIndex: number, fieldId: string, prompt: string, itemIndex?: number) =>
      patchSlotField(slotIndex, fieldId, (v) => {
        if (v.kind === "image") return { ...v, prompt };
        if (v.kind === "imageList" && itemIndex !== undefined) {
          return {
            ...v,
            items: v.items.map((it, i) =>
              i === itemIndex ? { ...it, prompt } : it,
            ),
          };
        }
        return v;
      }),
    [patchSlotField],
  );

  const setImageAlt = useCallback(
    (slotIndex: number, fieldId: string, altText: string, itemIndex?: number) =>
      patchSlotField(slotIndex, fieldId, (v) => {
        if (v.kind === "image") return { ...v, altText };
        if (v.kind === "imageList" && itemIndex !== undefined) {
          return {
            ...v,
            items: v.items.map((it, i) =>
              i === itemIndex ? { ...it, altText } : it,
            ),
          };
        }
        return v;
      }),
    [patchSlotField],
  );

  const setImageCaption = useCallback(
    (slotIndex: number, fieldId: string, caption: string, itemIndex: number) =>
      patchSlotField(slotIndex, fieldId, (v) => {
        if (v.kind === "imageList") {
          return {
            ...v,
            items: v.items.map((it, i) =>
              i === itemIndex ? { ...it, caption } : it,
            ),
          };
        }
        return v;
      }),
    [patchSlotField],
  );

  // --- Text-Generierung ------------------------------------------------
  const generateOne = useCallback(
    async (index: number) => {
      const slot = slotsRef.current[index];
      if (!slot) return;
      setSlots((prev) =>
        prev.map((s, i) =>
          i === index ? { ...s, status: "generating", error: undefined } : s,
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
    [analysis, scraped],
  );

  const runAll = useCallback(async () => {
    setRunning(true);
    cancelRef.current = false;
    for (let i = 0; i < story.length; i++) {
      if (cancelRef.current) break;
      await generateOne(i);
    }
    setRunning(false);
  }, [generateOne, story.length]);

  // Auto-start text generation on mount
  useEffect(() => {
    void runAll();
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Bild-Generierung ------------------------------------------------
  const generateImageForField = useCallback(
    async (
      slotIndex: number,
      fieldId: string,
      prompt: string,
      aspectRatio: AspectRatio | undefined,
      textInImage: boolean,
      itemIndex?: number,
    ) => {
      // status → generating
      patchSlotField(slotIndex, fieldId, (v) => {
        if (v.kind === "image")
          return { ...v, status: "generating", src: undefined };
        if (v.kind === "imageList" && itemIndex !== undefined) {
          return {
            ...v,
            items: v.items.map((it, i) =>
              i === itemIndex
                ? { ...it, status: "generating", src: undefined }
                : it,
            ),
          };
        }
        return v;
      });

      let errorDetail: string | null = null;

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
          errorDetail = data.detail || data.error || `HTTP ${res.status}`;
        } else {
          const url = (data as { url: string }).url;
          patchSlotField(slotIndex, fieldId, (v) => {
            if (v.kind === "image") return { ...v, src: url, status: "done" };
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
          return;
        }
      } catch (err) {
        errorDetail = err instanceof Error ? err.message : String(err);
      }

      // Error path
      console.error("Image gen failed:", errorDetail);
      setLastError(`Bild #${slotIndex + 1}${itemIndex !== undefined ? `.${itemIndex + 1}` : ""}: ${errorDetail}`);
      patchSlotField(slotIndex, fieldId, (v) => {
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
    },
    [patchSlotField, refImageUrls],
  );

  const generateImagesForSlot = useCallback(
    async (slotIndex: number) => {
      const slot = slotsRef.current[slotIndex];
      if (!slot?.generated) return;
      const def = MODULES_BY_TYPE[slot.item.module.type];
      const textInImage = slot.item.module.textInImage;

      for (const fdef of def.fields) {
        if (cancelRef.current) return;
        // Re-read from ref so we see updates from previous iterations
        const fresh = slotsRef.current[slotIndex]?.generated?.fields[fdef.id];
        if (!fresh) continue;

        if (fresh.kind === "image") {
          if (fresh.src) continue;
          await generateImageForField(
            slotIndex,
            fdef.id,
            fresh.prompt,
            fdef.image?.aspectRatio,
            textInImage,
          );
        } else if (fresh.kind === "imageList") {
          for (let i = 0; i < fresh.items.length; i++) {
            if (cancelRef.current) return;
            const fresh2 = slotsRef.current[slotIndex]?.generated?.fields[fdef.id];
            if (fresh2?.kind !== "imageList") break;
            const it = fresh2.items[i];
            if (it.src) continue;
            await generateImageForField(
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
    [generateImageForField],
  );

  const runAllImages = useCallback(async () => {
    if (imagesRunning) return;
    setImagesRunning(true);
    setLastError(null);
    cancelRef.current = false;
    const all = slotsRef.current;
    for (let i = 0; i < all.length; i++) {
      if (cancelRef.current) break;
      if (slotsRef.current[i]?.status !== "done") continue;
      await generateImagesForSlot(i);
    }
    setImagesRunning(false);
  }, [generateImagesForSlot, imagesRunning]);

  const regenerateOneImage = useCallback(
    async (
      slotIndex: number,
      fieldId: string,
      itemIndex?: number,
    ) => {
      const slot = slotsRef.current[slotIndex];
      if (!slot?.generated) return;
      const def = MODULES_BY_TYPE[slot.item.module.type];
      const fdef = def.fields.find((f) => f.id === fieldId);
      if (!fdef) return;
      const textInImage = slot.item.module.textInImage;
      const value = slot.generated.fields[fieldId];
      if (!value) return;

      if (value.kind === "image") {
        await generateImageForField(
          slotIndex,
          fieldId,
          value.prompt,
          fdef.image?.aspectRatio,
          textInImage,
        );
      } else if (value.kind === "imageList" && itemIndex !== undefined) {
        const item = value.items[itemIndex];
        await generateImageForField(
          slotIndex,
          fieldId,
          item.prompt,
          fdef.imageList?.itemImage.aspectRatio,
          textInImage,
          itemIndex,
        );
      }
    },
    [generateImageForField],
  );

  // --- Derived counts -------------------------------------------------
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Content-Generierung
          </h3>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>
              Texte: {done}/{total} Module {running && "· läuft…"}
            </span>
            {done > 0 && (
              <span>
                Bilder: {imagesDone}/{imagesTotal}{" "}
                {imagesRunning && "· läuft…"}
              </span>
            )}
            {refImageUrls.length > 0 && (
              <span className="text-zinc-400">
                Referenz: erstes Produktbild
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={runAllImages}
            disabled={
              imagesRunning ||
              running ||
              done === 0 ||
              (imagesTotal > 0 && imagesDone === imagesTotal)
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

      {lastError && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <div className="min-w-0 flex-1">
            <div className="font-medium">Letzter Bild-Fehler</div>
            <div className="mt-1 break-all font-mono text-xs">{lastError}</div>
          </div>
          <button
            type="button"
            onClick={() => setLastError(null)}
            className="text-xs text-red-600 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
          >
            ✕
          </button>
        </div>
      )}

      {slots.map((slot, i) => (
        <ModuleSection
          key={slot.item.id}
          slot={slot}
          index={i}
          onRetry={() => generateOne(i)}
          retryDisabled={slot.status === "generating"}
          onSetText={(fieldId, val) => setTextValue(i, fieldId, val)}
          onSetPrompt={(fieldId, val, itemIdx) =>
            setImagePrompt(i, fieldId, val, itemIdx)
          }
          onSetAlt={(fieldId, val, itemIdx) =>
            setImageAlt(i, fieldId, val, itemIdx)
          }
          onSetCaption={(fieldId, val, itemIdx) =>
            setImageCaption(i, fieldId, val, itemIdx)
          }
          onRegenerateImage={(fieldId, itemIdx) =>
            regenerateOneImage(i, fieldId, itemIdx)
          }
          imagesRunning={imagesRunning}
        />
      ))}
    </div>
  );
}

// =====================================================================
// ModuleSection
// =====================================================================

type SectionProps = {
  slot: SlotState;
  index: number;
  onRetry: () => void;
  retryDisabled: boolean;
  onSetText: (fieldId: string, value: string) => void;
  onSetPrompt: (fieldId: string, value: string, itemIndex?: number) => void;
  onSetAlt: (fieldId: string, value: string, itemIndex?: number) => void;
  onSetCaption: (fieldId: string, value: string, itemIndex: number) => void;
  onRegenerateImage: (fieldId: string, itemIndex?: number) => Promise<void>;
  imagesRunning: boolean;
};

function ModuleSection(props: SectionProps) {
  const { slot, index, onRetry, retryDisabled } = props;
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
                <FieldBlock
                  key={fdef.id}
                  fdef={fdef}
                  value={value}
                  onSetText={(val) => props.onSetText(fdef.id, val)}
                  onSetPrompt={(val, itemIdx) =>
                    props.onSetPrompt(fdef.id, val, itemIdx)
                  }
                  onSetAlt={(val, itemIdx) =>
                    props.onSetAlt(fdef.id, val, itemIdx)
                  }
                  onSetCaption={(val, itemIdx) =>
                    props.onSetCaption(fdef.id, val, itemIdx)
                  }
                  onRegenerateImage={(itemIdx) =>
                    props.onRegenerateImage(fdef.id, itemIdx)
                  }
                  imagesRunning={props.imagesRunning}
                />
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

// =====================================================================
// Per-field block (header + body)
// =====================================================================

type FieldBlockProps = {
  fdef: FieldDef;
  value: FieldValue;
  onSetText: (value: string) => void;
  onSetPrompt: (value: string, itemIndex?: number) => void;
  onSetAlt: (value: string, itemIndex?: number) => void;
  onSetCaption: (value: string, itemIndex: number) => void;
  onRegenerateImage: (itemIndex?: number) => Promise<void>;
  imagesRunning: boolean;
};

function FieldBlock({
  fdef,
  value,
  onSetText,
  onSetPrompt,
  onSetAlt,
  onSetCaption,
  onRegenerateImage,
  imagesRunning,
}: FieldBlockProps) {
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
      <FieldBody
        fdef={fdef}
        value={value}
        onSetText={onSetText}
        onSetPrompt={onSetPrompt}
        onSetAlt={onSetAlt}
        onSetCaption={onSetCaption}
        onRegenerateImage={onRegenerateImage}
        imagesRunning={imagesRunning}
      />
    </div>
  );
}

function FieldBody({
  fdef,
  value,
  onSetText,
  onSetPrompt,
  onSetAlt,
  onSetCaption,
  onRegenerateImage,
  imagesRunning,
}: FieldBlockProps) {
  switch (value.kind) {
    case "text":
      return <TextEditor value={value} max={fdef.maxChars} onChange={onSetText} />;
    case "richtext":
      return (
        <RichTextEditor value={value} max={fdef.maxChars} onChange={onSetText} />
      );
    case "image":
      return (
        <ImageSlot
          value={value}
          spec={fdef.image}
          onSetPrompt={(v) => onSetPrompt(v)}
          onSetAlt={(v) => onSetAlt(v)}
          onRegenerate={() => onRegenerateImage()}
          regenerateDisabled={imagesRunning || value.status === "generating"}
        />
      );
    case "imageList":
      return (
        <ImageListSlot
          value={value}
          itemSpec={fdef.imageList?.itemImage}
          onSetPrompt={(v, i) => onSetPrompt(v, i)}
          onSetAlt={(v, i) => onSetAlt(v, i)}
          onSetCaption={(v, i) => onSetCaption(v, i)}
          onRegenerate={(i) => onRegenerateImage(i)}
          regenerateDisabled={imagesRunning}
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

// =====================================================================
// Editors
// =====================================================================

function EditableArea({
  value,
  onChange,
  multiline = true,
  max,
  placeholder,
  monospace = false,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  max?: number;
  placeholder?: string;
  monospace?: boolean;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  // Re-sync wenn externer Wert ändert (z.B. nach Re-Generierung)
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onChange(draft);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === "Escape") {
      setDraft(value);
      (e.target as HTMLElement).blur();
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      commit();
      (e.target as HTMLElement).blur();
    }
  };

  const baseCls = `w-full resize-y rounded border border-transparent bg-transparent p-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:focus:bg-zinc-950 ${
    monospace ? "font-mono text-xs" : ""
  }`;

  const computedRows =
    rows ?? Math.max(2, Math.min(12, draft.split("\n").length));

  return (
    <>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setDraft(e.target.value)
          }
          onBlur={commit}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={computedRows}
          className={baseCls}
        />
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setDraft(e.target.value)
          }
          onBlur={commit}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={baseCls.replace("resize-y ", "")}
        />
      )}
      {max && (
        <div
          className={`mt-1 text-[10px] ${
            draft.length > max ? "text-red-500" : "text-zinc-400"
          }`}
        >
          {draft.length}/{max} Zeichen
        </div>
      )}
    </>
  );
}

function TextEditor({
  value,
  max,
  onChange,
}: {
  value: TextField;
  max?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="group relative rounded-md border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/50">
      <EditableArea
        value={value.value}
        onChange={onChange}
        multiline={false}
        max={max}
        placeholder="(leer — Text wird ins Bild gerendert)"
      />
      <CopyButton text={value.value} disabled={value.value.length === 0} />
    </div>
  );
}

function RichTextEditor({
  value,
  max,
  onChange,
}: {
  value: RichTextField;
  max?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="group relative rounded-md border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/50">
      <EditableArea
        value={value.value}
        onChange={onChange}
        multiline
        max={max}
        placeholder="(leer — Text wird ins Bild gerendert)"
      />
      <CopyButton text={value.value} disabled={value.value.length === 0} />
    </div>
  );
}

function ImageSlot({
  value,
  spec,
  onSetPrompt,
  onSetAlt,
  onRegenerate,
  regenerateDisabled,
}: {
  value: ImageField;
  spec?: { widthPx: number; heightPx: number; aspectRatio: string };
  onSetPrompt: (v: string) => void;
  onSetAlt: (v: string) => void;
  onRegenerate: () => void;
  regenerateDisabled: boolean;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {spec
            ? `${spec.widthPx}×${spec.heightPx} (${spec.aspectRatio})`
            : "Bild"}
        </span>
        <div className="flex items-center gap-2">
          <StatusBadge status={value.status} />
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerateDisabled}
            className="text-[10px] text-zinc-500 hover:text-zinc-900 disabled:opacity-30 dark:hover:text-zinc-100"
          >
            ↻ Bild generieren
          </button>
        </div>
      </div>
      <ImagePreview src={value.src} status={value.status} alt={value.altText} />
      <div className="mt-2 space-y-2">
        <EditableBlock
          label="Prompt (EN)"
          value={value.prompt}
          onChange={onSetPrompt}
          multiline
          monospace
        />
        <EditableBlock
          label="Alt-Text (DE)"
          value={value.altText}
          onChange={onSetAlt}
          multiline={false}
        />
      </div>
    </div>
  );
}

function ImageListSlot({
  value,
  itemSpec,
  onSetPrompt,
  onSetAlt,
  onSetCaption,
  onRegenerate,
  regenerateDisabled,
}: {
  value: ImageListField;
  itemSpec?: { widthPx: number; heightPx: number; aspectRatio: string };
  onSetPrompt: (v: string, i: number) => void;
  onSetAlt: (v: string, i: number) => void;
  onSetCaption: (v: string, i: number) => void;
  onRegenerate: (i: number) => void;
  regenerateDisabled: boolean;
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
            <div className="flex items-center gap-2">
              <StatusBadge status={item.status} />
              <button
                type="button"
                onClick={() => onRegenerate(i)}
                disabled={regenerateDisabled || item.status === "generating"}
                className="text-[10px] text-zinc-500 hover:text-zinc-900 disabled:opacity-30 dark:hover:text-zinc-100"
              >
                ↻ Bild generieren
              </button>
            </div>
          </div>
          <ImagePreview src={item.src} status={item.status} alt={item.altText} />
          {item.caption !== undefined && (
            <div className="mt-2">
              <EditableBlock
                label="Caption"
                value={item.caption}
                onChange={(v) => onSetCaption(v, i)}
                multiline={false}
              />
            </div>
          )}
          <div className="mt-2 space-y-2">
            <EditableBlock
              label="Prompt (EN)"
              value={item.prompt}
              onChange={(v) => onSetPrompt(v, i)}
              multiline
              monospace
            />
            <EditableBlock
              label="Alt-Text (DE)"
              value={item.altText}
              onChange={(v) => onSetAlt(v, i)}
              multiline={false}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EditableBlock({
  label,
  value,
  onChange,
  multiline,
  monospace = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline: boolean;
  monospace?: boolean;
}) {
  return (
    <div className="rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-100 px-2 py-1 dark:border-zinc-800">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <CopyButton text={value} inline />
      </div>
      <div className="px-1 py-0.5">
        <EditableArea
          value={value}
          onChange={onChange}
          multiline={multiline}
          monospace={monospace}
        />
      </div>
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
