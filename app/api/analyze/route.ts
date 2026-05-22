import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Du analysierst Produkte für Amazon A+ Content (deutscher Markt).
Bekommst Produktinformationen, gibst NUR ein JSON-Objekt mit dieser Form zurück (kein Prosa, keine Codefences):

{
  "productCharacter": "light" | "dark" | "colorful",
  "materials": string[],
  "targetAudience": string,
  "coreMessage": string,
  "rationale": string
}

Regeln:
- productCharacter = visueller Charakter des Produkts (helle Oberfläche/Verpackung → "light", dunkle → "dark", bunt/vielfarbig → "colorful"). Steuert später die Wahl zwischen overlay_dunkel und overlay_hell.
- materials = max 3 prägende Materialien (z.B. ["Keramik","Bambus"]).
- targetAudience = ein Satz, konkret (kein "alle").
- coreMessage = die EINE Kernaussage des Produkts, max 12 Wörter, deutsch.
- rationale = 1-2 Sätze warum du das so siehst.`;

type AnalyzeRequest = {
  title: string;
  description?: string;
  bullets?: string[];
  category?: string;
  brand?: string;
};

type AnalyzeResponse = {
  productCharacter: "light" | "dark" | "colorful";
  materials: string[];
  targetAudience: string;
  coreMessage: string;
  rationale: string;
};

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }

  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json(
      { error: "`title` is required (string)" },
      { status: 400 },
    );
  }

  const userBlock = [
    `Produktname: ${body.title}`,
    body.brand ? `Marke: ${body.brand}` : null,
    body.category ? `Kategorie: ${body.category}` : null,
    body.description ? `Beschreibung:\n${body.description}` : null,
    body.bullets?.length
      ? `Bullet Points:\n- ${body.bullets.join("\n- ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userBlock }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const stripped = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: AnalyzeResponse;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return NextResponse.json(
        { error: "Claude returned non-JSON", raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Anthropic API call failed", detail: message },
      { status: 502 },
    );
  }
}
