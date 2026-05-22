import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  buildContentMessages,
  getContentSystemPrompt,
  validateContent,
} from "@/lib/content";
import { MODULES_BY_TYPE } from "@/lib/modules";
import type { ProductAnalysis, SelectedModule } from "@/lib/plan";
import type { ScrapedProduct } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  scraped?: ScrapedProduct;
  analysis?: ProductAnalysis;
  module?: SelectedModule;
  position?: number;
};

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scraped, analysis, module, position } = body;
  if (!scraped || !analysis || !module || typeof position !== "number") {
    return NextResponse.json(
      {
        error:
          "Required: { scraped, analysis, module: { type, reasoning, textInImage, imageBrief }, position: number }",
      },
      { status: 400 },
    );
  }
  const def = MODULES_BY_TYPE[module.type];
  if (!def) {
    return NextResponse.json(
      { error: `Unknown module type: ${module.type}` },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const system = getContentSystemPrompt(module, def).replace(
      "<position>",
      String(position),
    );
    const messages = buildContentMessages(scraped, analysis, position);

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system,
      messages,
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return NextResponse.json(
        { error: "Claude returned non-JSON", raw: text },
        { status: 502 },
      );
    }

    const validation = validateContent(module.type, parsed, {
      textInImage: module.textInImage,
    });
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "Generated content failed validation",
          issues: validation.issues,
          raw: parsed,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(validation.module);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Anthropic API call failed", detail: message },
      { status: 502 },
    );
  }
}
