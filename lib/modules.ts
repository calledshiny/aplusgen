// Amazon A+ Content Basic — 17 Module-Spec
// Single source of truth: jedes Modul, jedes Feld, jede Pixel-/Aspect-Vorgabe.
// Verwendet von: Modul-Auswahl-Prompt, Content-Generator, Higgsfield-Bridge, UI-Vorschau.

export type ModuleType =
  | "firmenlogo"
  | "mehrfach_a"
  | "produkttext"
  | "overlay_dunkel"
  | "overlay_hell"
  | "bildheader"
  | "einzelbild_links"
  | "einzelbild_rechts"
  | "einzelbild_markierungen"
  | "einzelbild_seitenleiste"
  | "einzelbild_specs"
  | "vergleichstabelle"
  | "drei_bilder"
  | "vier_bilder"
  | "vier_bilder_quadrant"
  | "standardtext"
  | "technische_angaben";

export type FieldKind =
  | "text"
  | "richtext"
  | "image"
  | "imageList"
  | "specTable"
  | "comparison";

export type AspectRatio =
  | "1:1"
  | "3:2"
  | "16:9"
  | "16:10"
  | "3:4"
  | "9:16"
  | "2:1"
  | "21:9"
  | "1:2";

export type ImageSpec = {
  widthPx: number;
  heightPx: number;
  aspectRatio: AspectRatio;
};

export type FieldDef = {
  id: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  group?: string;
  maxChars?: number;
  hint?: string;
  image?: ImageSpec;
  imageList?: { count: number; itemImage: ImageSpec; captionMaxChars?: number };
};

export type ModuleDef = {
  type: ModuleType;
  number: number;
  name: string;
  description: string;
  aiReady: boolean;
  usage: string;
  fields: FieldDef[];
};

const img = (w: number, h: number, ar: AspectRatio): ImageSpec => ({
  widthPx: w,
  heightPx: h,
  aspectRatio: ar,
});

export const MODULES: ModuleDef[] = [
  {
    type: "firmenlogo",
    number: 1,
    name: "Standard Firmenlogo",
    description: "Reines Logo-Modul ohne Text.",
    aiReady: false,
    usage: "Nur bei sehr starker, etablierter Marke.",
    fields: [
      {
        id: "logo",
        label: "Firmenlogo",
        kind: "image",
        required: true,
        image: img(600, 180, "21:9"),
      },
    ],
  },

  {
    type: "mehrfach_a",
    number: 2,
    name: "Standard Mehrfach-Abbildung Modul A",
    description: "Hauptbild + Überschrift + Beschreibung + 4 Thumbnails mit Captions.",
    aiReady: true,
    usage: "Visuelles Hero mit Detail-Abbildungen darunter.",
    fields: [
      {
        id: "hauptbild",
        label: "Hauptbild",
        kind: "image",
        required: true,
        image: img(300, 300, "1:1"),
      },
      { id: "ueberschrift", label: "Überschrift", kind: "text", required: false, maxChars: 50 },
      { id: "beschreibung", label: "Beschreibung", kind: "richtext", required: false, maxChars: 500 },
      {
        id: "thumbnails",
        label: "Thumbnails (4 Bilder + Captions)",
        kind: "imageList",
        required: false,
        imageList: { count: 4, itemImage: img(135, 135, "1:1"), captionMaxChars: 80 },
      },
    ],
  },

  {
    type: "produkttext",
    number: 3,
    name: "Standard Produktbeschreibungstext",
    description: "Pure Text-Sektion, kein Bild.",
    aiReady: false,
    usage: "Längerer Fließtext-Abschnitt — z.B. Marken-Story oder Produkt-Background.",
    fields: [
      { id: "fliesstext", label: "Fließtext", kind: "richtext", required: true },
    ],
  },

  {
    type: "overlay_dunkel",
    number: 4,
    name: "Standard-Bild und Overlay mit dunklem Text",
    description: "Großes Hintergrundbild mit dunklem Text-Overlay.",
    aiReady: true,
    usage: "Für HELLE Produkte (Keramik, Papier, weiße Verpackungen). Background muss hell sein.",
    fields: [
      {
        id: "hintergrundbild",
        label: "Hintergrundbild (muss hell sein)",
        kind: "image",
        required: true,
        image: img(970, 600, "16:10"),
      },
      { id: "ueberschrift", label: "Überschrift", kind: "text", required: false },
      { id: "fliesstext", label: "Fließtext", kind: "richtext", required: false },
    ],
  },

  {
    type: "overlay_hell",
    number: 5,
    name: "Standard-Bild und Overlay mit hellem Text",
    description: "Großes Hintergrundbild mit hellem Text-Overlay.",
    aiReady: true,
    usage: "Für DUNKLE Produkte (Stein, Metall, dunkles Holz). Background muss dunkel sein.",
    fields: [
      {
        id: "hintergrundbild",
        label: "Hintergrundbild (muss dunkel sein)",
        kind: "image",
        required: true,
        image: img(970, 600, "16:10"),
      },
      { id: "ueberschrift", label: "Überschrift", kind: "text", required: false },
      { id: "fliesstext", label: "Fließtext", kind: "richtext", required: false },
    ],
  },

  {
    type: "bildheader",
    number: 6,
    name: "Standard-Bildheader mit Text",
    description: "Headline oben, großes Bild, Headline + Text unten.",
    aiReady: false,
    usage: "Klassisches Hero-Modul mit Headline-Sandwich.",
    fields: [
      { id: "ueberschrift_oben", label: "Überschrift (oben)", kind: "text", required: false },
      {
        id: "bild",
        label: "Bild",
        kind: "image",
        required: true,
        image: img(970, 600, "16:10"),
      },
      { id: "ueberschrift_unten", label: "Überschrift (unten)", kind: "text", required: false },
      { id: "fliesstext", label: "Fließtext", kind: "richtext", required: false },
    ],
  },

  {
    type: "einzelbild_links",
    number: 7,
    name: "Standard-Einzelbild links",
    description: "Quadratisches Bild links, Text rechts.",
    aiReady: true,
    usage: "Klassisches 50/50-Modul für ein Feature mit Visual.",
    fields: [
      {
        id: "bild",
        label: "Bild (links)",
        kind: "image",
        required: true,
        image: img(300, 300, "1:1"),
      },
      { id: "ueberschrift", label: "Überschrift", kind: "text", required: false },
      { id: "fliesstext", label: "Fließtext", kind: "richtext", required: true },
    ],
  },

  {
    type: "einzelbild_rechts",
    number: 8,
    name: "Standard-Einzelbild rechts",
    description: "Text links, quadratisches Bild rechts.",
    aiReady: true,
    usage: "Spiegelt einzelbild_links. Abwechselnd einsetzen für visuellen Rhythmus.",
    fields: [
      { id: "ueberschrift", label: "Überschrift", kind: "text", required: false },
      { id: "fliesstext", label: "Fließtext", kind: "richtext", required: true },
      {
        id: "bild",
        label: "Bild (rechts)",
        kind: "image",
        required: true,
        image: img(300, 300, "1:1"),
      },
    ],
  },

  {
    type: "einzelbild_markierungen",
    number: 9,
    name: "Standard-Einzelbild und Markierungen",
    description: "Bild links, 3 Text-Blöcke Mitte, 1 Bullet-Block rechts.",
    aiReady: true,
    usage: "Komplex — nur nutzen wenn 3+ Textblöcke + Bullet-Liste echten Mehrwert haben.",
    fields: [
      {
        id: "bild",
        label: "Bild (links)",
        kind: "image",
        required: true,
        image: img(300, 300, "1:1"),
      },

      // Block 1 (Mitte oben)
      { id: "block1_ueberschrift", label: "Block 1 · Überschrift", kind: "text", required: false, group: "Block 1 (Mitte oben)" },
      { id: "block1_unterueberschrift", label: "Block 1 · Unterüberschrift", kind: "text", required: false, group: "Block 1 (Mitte oben)" },
      { id: "block1_fliesstext", label: "Block 1 · Fließtext", kind: "richtext", required: false, group: "Block 1 (Mitte oben)" },

      // Block 2 (Mitte Mitte)
      { id: "block2_unterueberschrift", label: "Block 2 · Unterüberschrift", kind: "text", required: false, group: "Block 2 (Mitte Mitte)" },
      { id: "block2_fliesstext", label: "Block 2 · Fließtext", kind: "richtext", required: false, group: "Block 2 (Mitte Mitte)" },

      // Block 3 (Mitte unten)
      { id: "block3_unterueberschrift", label: "Block 3 · Unterüberschrift", kind: "text", required: false, group: "Block 3 (Mitte unten)" },
      { id: "block3_fliesstext", label: "Block 3 · Fließtext", kind: "richtext", required: false, group: "Block 3 (Mitte unten)" },

      // Block 4 (Rechts)
      { id: "block4_ueberschrift", label: "Block 4 · Überschrift", kind: "text", required: false, group: "Block 4 (Rechts)" },
      { id: "block4_bullets", label: "Block 4 · Aufzählungspunkte", kind: "richtext", required: false, group: "Block 4 (Rechts)", hint: "Als Bullet-Liste formatieren" },
    ],
  },

  {
    type: "einzelbild_seitenleiste",
    number: 10,
    name: "Standard-Einzelbild und Seitenleiste",
    description: "Hauptbild links (hochkant) + Mittelblock + Seitenleisten-Bild rechts oben + Rechts-Block.",
    aiReady: true,
    usage: "Gut wenn Hauptprodukt + Zubehör/Variante kombiniert gezeigt werden.",
    fields: [
      {
        id: "hauptbild",
        label: "Hauptbild (links, hochkant)",
        kind: "image",
        required: true,
        image: img(300, 400, "3:4"),
      },
      { id: "hauptbild_caption", label: "Bildunterschrift (unter Hauptbild)", kind: "text", required: false },

      { id: "mitte_ueberschrift", label: "Mitte · Überschrift", kind: "text", required: false, group: "Mitte" },
      { id: "mitte_unterueberschrift", label: "Mitte · Unterüberschrift", kind: "text", required: false, group: "Mitte" },
      { id: "mitte_fliesstext", label: "Mitte · Fließtext", kind: "richtext", required: false, group: "Mitte" },
      { id: "mitte_bullets", label: "Mitte · Aufzählungspunkte", kind: "richtext", required: false, group: "Mitte" },

      {
        id: "seitenleiste_bild",
        label: "Seitenleisten-Bild (rechts oben, quer)",
        kind: "image",
        required: true,
        image: img(350, 175, "2:1"),
      },
      { id: "rechts_ueberschrift", label: "Rechts · Überschrift", kind: "text", required: false, group: "Rechts (unter Seitenleisten-Bild)" },
      { id: "rechts_fliesstext", label: "Rechts · Fließtext", kind: "richtext", required: false, group: "Rechts (unter Seitenleisten-Bild)" },
      { id: "rechts_bullets", label: "Rechts · Aufzählungspunkte", kind: "richtext", required: false, group: "Rechts (unter Seitenleisten-Bild)" },
    ],
  },

  {
    type: "einzelbild_specs",
    number: 11,
    name: "Standard-Einzelbild und Spezifikationsdetail",
    description: "Headline oben + Bild links + 2 Textspalten rechts (jeweils mit Unter-Headlines).",
    aiReady: true,
    usage: "Sehr textlastig. Für Produkte mit vielen Specs/Eigenschaften.",
    fields: [
      { id: "ueberschrift_oben", label: "Überschrift (oben, gesamt)", kind: "text", required: false },
      {
        id: "bild",
        label: "Bild (links)",
        kind: "image",
        required: true,
        image: img(300, 300, "1:1"),
      },

      { id: "mitte_ueberschrift", label: "Spalte Mitte · Überschrift", kind: "text", required: false, group: "Spalte Mitte" },
      { id: "mitte_unterueberschrift_1", label: "Spalte Mitte · Unterüberschrift 1", kind: "text", required: false, group: "Spalte Mitte" },
      { id: "mitte_fliesstext_1", label: "Spalte Mitte · Fließtext 1", kind: "richtext", required: true, group: "Spalte Mitte" },
      { id: "mitte_unterueberschrift_2", label: "Spalte Mitte · Unterüberschrift 2", kind: "text", required: false, group: "Spalte Mitte" },
      { id: "mitte_fliesstext_2", label: "Spalte Mitte · Fließtext 2", kind: "richtext", required: false, group: "Spalte Mitte" },

      { id: "rechts_ueberschrift", label: "Spalte Rechts · Überschrift", kind: "text", required: false, group: "Spalte Rechts" },
      { id: "rechts_unterueberschrift_1", label: "Spalte Rechts · Unterüberschrift 1", kind: "text", required: false, group: "Spalte Rechts" },
      { id: "rechts_bullets", label: "Spalte Rechts · Aufzählungspunkte", kind: "richtext", required: false, group: "Spalte Rechts" },
      { id: "rechts_unterueberschrift_2", label: "Spalte Rechts · Unterüberschrift 2", kind: "text", required: false, group: "Spalte Rechts" },
      { id: "rechts_fliesstext_2", label: "Spalte Rechts · Fließtext 2", kind: "richtext", required: false, group: "Spalte Rechts" },
    ],
  },

  {
    type: "vergleichstabelle",
    number: 12,
    name: "Standard-Vergleichstabelle",
    description: "Vergleichstabelle mit 2–6 Geschwister-ASINs und 1–10 Metriken.",
    aiReady: false,
    usage: "NUR für eigene Geschwister-ASINs (Variantenvergleich). KEINE Konkurrenz!",
    fields: [
      {
        id: "products",
        label: "Vergleichsprodukte (2–6)",
        kind: "comparison",
        required: true,
        hint: "Pro Produkt: ASIN (Pflicht), Bild 150×300 (1:2), Titel, Highlight",
      },
      { id: "show_reviews", label: "Rezensionen zeigen", kind: "text", required: false, hint: "true/false" },
      { id: "show_prices", label: "Preise zeigen", kind: "text", required: false, hint: "true/false" },
      { id: "show_cart_button", label: "„In den Einkaufswagen\" Button zeigen", kind: "text", required: false, hint: "true/false" },
    ],
  },

  {
    type: "drei_bilder",
    number: 13,
    name: "Standard: drei Bilder und Text",
    description: "Headline oben + 3 Spalten mit Bild + Headline + Text.",
    aiReady: true,
    usage: "Klassisch für „3 Features\" oder „3 Anwendungen\".",
    fields: [
      { id: "ueberschrift_oben", label: "Überschrift (oben)", kind: "text", required: false },
      {
        id: "spalten",
        label: "3 Spalten (Bild + Überschrift + Text)",
        kind: "imageList",
        required: true,
        imageList: { count: 3, itemImage: img(300, 300, "1:1") },
        hint: "Jede Spalte hat: Bild, Überschrift, Fließtext",
      },
    ],
  },

  {
    type: "vier_bilder",
    number: 14,
    name: "Standard: vier Bilder und Text",
    description: "Headline oben + 4 Spalten mit Bild + Headline + Text.",
    aiReady: true,
    usage: "Wie drei_bilder, aber 4 statt 3 — kleinere Bilder.",
    fields: [
      { id: "ueberschrift_oben", label: "Überschrift (oben)", kind: "text", required: false },
      {
        id: "spalten",
        label: "4 Spalten (Bild + Überschrift + Text)",
        kind: "imageList",
        required: true,
        imageList: { count: 4, itemImage: img(220, 220, "1:1") },
        hint: "Jede Spalte hat: Bild, Überschrift, Fließtext",
      },
    ],
  },

  {
    type: "vier_bilder_quadrant",
    number: 15,
    name: "Standard: vier Bilder/Textquadrant",
    description: "2×2 Grid: pro Kachel Bild + Headline + Text (alle Pflicht).",
    aiReady: true,
    usage: "Mehr Textplatz pro Feature als vier_bilder. Alle Felder Pflicht.",
    fields: [
      {
        id: "quadranten",
        label: "4 Quadranten (Bild + Überschrift + Text — alle Pflicht)",
        kind: "imageList",
        required: true,
        imageList: { count: 4, itemImage: img(135, 135, "1:1") },
        hint: "2×2 Grid. Jede Kachel: Bild, Überschrift, Fließtext — alle drei Pflicht.",
      },
    ],
  },

  {
    type: "standardtext",
    number: 16,
    name: "Standardtext",
    description: "Headline + Fließtext, kein Bild.",
    aiReady: true,
    usage: "Brand Statement oder Abschluss-Sektion.",
    fields: [
      { id: "ueberschrift", label: "Überschrift", kind: "text", required: false },
      { id: "fliesstext", label: "Fließtext", kind: "richtext", required: true },
    ],
  },

  {
    type: "technische_angaben",
    number: 17,
    name: "Technische Standardangaben",
    description: "Headline + Specs-Tabelle (4–16 Zeilen, 1- oder 2-spaltig).",
    aiReady: false,
    usage: "Nur einsetzen wenn ≥4 echte Specs vorhanden sind.",
    fields: [
      { id: "ueberschrift", label: "Überschrift", kind: "text", required: false },
      {
        id: "specs",
        label: "Specs (4–16 Zeilen: Spezifikation + Definition)",
        kind: "specTable",
        required: true,
        hint: "min 4, max 16 Zeilen — jeweils Attribut + Wert",
      },
      { id: "layout", label: "Layout (1-spaltig oder 2-spaltig)", kind: "text", required: false, hint: "1 | 2" },
    ],
  },
];

export const MODULES_BY_TYPE: Record<ModuleType, ModuleDef> = MODULES.reduce(
  (acc, m) => {
    acc[m.type] = m;
    return acc;
  },
  {} as Record<ModuleType, ModuleDef>,
);

export function getModule(type: ModuleType): ModuleDef {
  return MODULES_BY_TYPE[type];
}
