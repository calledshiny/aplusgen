import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  buildPlanMessages,
  getSystemPrompt,
  validatePlan,
} from "@/lib/plan";
import type { ScrapedProduct } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }

  let body: { scraped?: ScrapedProduct };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.scraped || typeof body.scraped !== "object") {
    return NextResponse.json(
      { error: "`scraped` (ScrapedProduct) is required" },
      { status: 400 },
    );
  }
  if (!body.scraped.title) {
    return NextResponse.json(
      { error: "`scraped.title` is required" },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: getSystemPrompt(),
      messages: buildPlanMessages(body.scraped),
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

    const validation = validatePlan(parsed);
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "Claude returned invalid plan",
          issues: validation.issues,
          raw: parsed,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(validation.plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Anthropic API call failed", detail: message },
      { status: 502 },
    );
  }
}
