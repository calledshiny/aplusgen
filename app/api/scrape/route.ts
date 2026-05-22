import { NextResponse } from "next/server";
import { isAmazonUrl, scrapeAmazon } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json(
      { error: "`url` is required (string)" },
      { status: 400 },
    );
  }
  if (!isAmazonUrl(url)) {
    return NextResponse.json(
      {
        error:
          "URL must point to amazon.de, amazon.com, or another supported Amazon domain",
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
