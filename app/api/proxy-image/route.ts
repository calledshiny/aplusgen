import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Strikte Whitelist: nur Higgsfield-CDN — kein offener Proxy (Schutz gegen SSRF).
const ALLOWED_HOSTS = new Set<string>([
  "d8j0ntlcm91z4.cloudfront.net",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB pro Bild — Hi-Res reicht das

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "?url=… required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.host)) {
    return NextResponse.json(
      { error: `Host not allowed: ${parsed.host}` },
      { status: 403 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Upstream fetch failed", detail: message },
      { status: 502 },
    );
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream HTTP ${upstream.status}` },
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${buf.byteLength} > ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
