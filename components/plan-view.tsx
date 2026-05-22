"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  MODULES,
  MODULES_BY_TYPE,
  type ModuleType,
} from "@/lib/modules";
import { moduleImageCount, type AplusPlan } from "@/lib/plan";

type Item = {
  id: string; // stable per slot
  type: ModuleType;
  reasoning: string;
  textInImage: boolean;
  imageBrief: string;
};

let counter = 0;
const nextId = () => `slot_${++counter}`;

function toItems(plan: AplusPlan): Item[] {
  return plan.modules.map((m) => ({
    id: nextId(),
    type: m.type,
    reasoning: m.reasoning,
    textInImage: m.textInImage,
    imageBrief: m.imageBrief,
  }));
}

export function PlanView({ plan }: { plan: AplusPlan }) {
  const [items, setItems] = useState<Item[]>(() => toItems(plan));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function changeType(id: string, type: ModuleType) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, type } : i)));
  }

  function addModule(type: ModuleType) {
    setItems((prev) => [
      ...prev,
      {
        id: nextId(),
        type,
        reasoning: "(manuell hinzugefügt)",
        textInImage: true,
        imageBrief: "",
      },
    ]);
  }

  function toggleTextInImage(id: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, textInImage: !i.textInImage } : i,
      ),
    );
  }

  const totalImages = useMemo(
    () =>
      items.reduce(
        (sum, i) => sum + moduleImageCount(MODULES_BY_TYPE[i.type]),
        0,
      ),
    [items],
  );

  return (
    <div className="space-y-6">
      <AnalysisCard analysis={plan.analysis} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Storyline ({items.length} Module · {totalImages} Bilder)
          </h3>
          <span className="text-xs text-zinc-500">
            Drag, um die Reihenfolge zu ändern
          </span>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {items.map((item, index) => (
                <ModuleCard
                  key={item.id}
                  item={item}
                  index={index}
                  onRemove={() => removeItem(item.id)}
                  onChangeType={(t) => changeType(item.id, t)}
                  onToggleTextInImage={() => toggleTextInImage(item.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {items.length === 0 && (
          <div className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Keine Module mehr — über das Dropdown unten wieder hinzufügen.
          </div>
        )}
      </div>

      <AddModuleRow onAdd={addModule} disabled={items.length >= 7} />

      <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="text-xs text-zinc-500">
          Phase 4 (Content-Generierung) ist noch nicht aktiv.
        </div>
        <Button disabled>Content generieren →</Button>
      </div>
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: AplusPlan["analysis"] }) {
  const characterColor = {
    light: "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200",
    dark: "bg-zinc-800 text-zinc-100",
    colorful:
      "bg-gradient-to-r from-pink-200 to-blue-200 text-zinc-900 dark:from-pink-900/40 dark:to-blue-900/40 dark:text-zinc-100",
  }[analysis.productCharacter];

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="text-xs uppercase tracking-wider text-zinc-500">
        Analyse
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-[max-content_1fr] sm:gap-x-4 sm:gap-y-2">
        <div className="text-xs text-zinc-500">Charakter</div>
        <div>
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${characterColor}`}
          >
            {analysis.productCharacter}
          </span>
        </div>

        <div className="text-xs text-zinc-500">Materialien</div>
        <div className="text-sm text-zinc-800 dark:text-zinc-200">
          {analysis.materials.join(", ")}
        </div>

        <div className="text-xs text-zinc-500">Zielgruppe</div>
        <div className="text-sm text-zinc-800 dark:text-zinc-200">
          {analysis.targetAudience}
        </div>

        <div className="text-xs text-zinc-500">Kern-Aussage</div>
        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {analysis.coreMessage}
        </div>

        <div className="text-xs text-zinc-500">Begründung</div>
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          {analysis.rationale}
        </div>
      </div>
    </div>
  );
}

function ModuleCard({
  item,
  index,
  onRemove,
  onChangeType,
  onToggleTextInImage,
}: {
  item: Item;
  index: number;
  onRemove: () => void;
  onChangeType: (t: ModuleType) => void;
  onToggleTextInImage: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const def = MODULES_BY_TYPE[item.type];
  const imgCount = moduleImageCount(def);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 active:cursor-grabbing dark:hover:bg-zinc-800"
          aria-label="Reorder"
        >
          <DragIcon />
        </button>

        <div className="w-7 shrink-0 pt-1 text-right font-mono text-sm text-zinc-500">
          {String(index + 1).padStart(2, "0")}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
              {def.name}
            </div>
            {def.aiReady && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                AI
              </span>
            )}
            <span className="text-xs text-zinc-500">
              {imgCount} Bild{imgCount === 1 ? "" : "er"}
            </span>
            <button
              type="button"
              onClick={onToggleTextInImage}
              title="Text wird beim Bild als Typografie eingebrannt statt in Text-Felder geschrieben (Mobile-first)"
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                item.textInImage
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {item.textInImage ? "Text im Bild" : "Echter Text"}
            </button>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {item.reasoning}
          </p>
          {item.imageBrief && (
            <p className="mt-2 rounded border-l-2 border-zinc-200 bg-zinc-50 px-2 py-1 text-xs italic text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
              <span className="not-italic font-medium text-zinc-500">Bild: </span>
              {item.imageBrief}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <select
            value={item.type}
            onChange={(e) => onChangeType(e.target.value as ModuleType)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            {MODULES.map((m) => (
              <option key={m.type} value={m.type}>
                {String(m.number).padStart(2, "0")} · {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
          >
            Entfernen
          </button>
        </div>
      </div>
    </li>
  );
}

function AddModuleRow({
  onAdd,
  disabled,
}: {
  onAdd: (t: ModuleType) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<ModuleType>("standardtext");
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <span className="text-xs text-zinc-500">Modul hinzufügen:</span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as ModuleType)}
        className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {MODULES.map((m) => (
          <option key={m.type} value={m.type}>
            {String(m.number).padStart(2, "0")} · {m.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="secondary"
        onClick={() => onAdd(selected)}
        disabled={disabled}
      >
        + Hinzufügen
      </Button>
      {disabled && (
        <span className="text-xs text-amber-600">max 7 erreicht</span>
      )}
    </div>
  );
}

function DragIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="3" r="1.2" />
      <circle cx="10" cy="3" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="11" r="1.2" />
      <circle cx="10" cy="11" r="1.2" />
    </svg>
  );
}
