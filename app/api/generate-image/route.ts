import { NextResponse } from "next/server";
import {
  generateImageFromUrls,
  selectModel,
} from "@/lib/higgsfield";
import type { AspectRatio } from "@/lib/modules";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min

type Body = {
  prompt?: string;
  aspectRatio?: AspectRatio;
  resolution?: "1k" | "2k" | "4k";
  textInImage?: boolean;
  refImageUrls?: string[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { prompt, aspectRatio, resolution, textInImage, refImageUrls } = body;
  if (!prompt || typeof prompt !== "string" || prompt.length < 10) {
    return NextResponse.json(
      { error: "`prompt` is required (string, ≥10 chars)" },
      { status: 400 },
    );
  }

  const model = selectModel({
    textInImage: !!textInImage,
    hasRef: !!(refImageUrls && refImageUrls.length > 0),
  });

  try {
    const result = await generateImageFromUrls({
      prompt,
      refImageUrls,
      aspectRatio,
      resolution,
      model,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Higgsfield generation failed", detail: message },
      { status: 502 },
    );
  }
}
