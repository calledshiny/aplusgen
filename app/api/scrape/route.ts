import { NextResponse } from "next/server";
import { isAmazonUrl, normalizeProductInput, scrapeAmazon } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { input?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body.input ?? body.url ?? "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "`input` is required (Amazon URL or ASIN)" },
      { status: 400 },
    );
  }

  const url = normalizeProductInput(raw);
  if (!isAmazonUrl(url)) {
    return NextResponse.json(
      {
        error:
          "Input must be a 10-character ASIN or an Amazon URL (amazon.de, .com, .co.uk, …)",
      },
      { status: 400 },
    );
  }

  try {
    const scraped = await scrapeAmazon(url);
    return NextResponse.json(scraped);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Scrape failed", detail: message },
      { status: 502 },
    );
  }
}
