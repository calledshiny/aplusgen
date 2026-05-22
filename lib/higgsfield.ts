// Higgsfield CLI Wrapper.
// Spawnt die `hf`-CLI als Subprozess, parsed JSON, gibt URLs zurück.
//
// CLI install: `npm i -g @higgsfield/cli` ODER Binary von
// github.com/higgsfield-ai/cli/releases nach $PATH.
// Auth: `hf auth login` (device-code flow, einmalig).
// Pfad konfigurierbar via env HIGGSFIELD_CLI, default ~/bin/hf.exe.

import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AspectRatio } from "./modules";

const DEFAULT_CLI =
  process.platform === "win32"
    ? "C:/Users/j.wiemann/bin/hf.exe"
    : "hf";
const CLI = process.env.HIGGSFIELD_CLI ?? DEFAULT_CLI;

export type HfImage = { url: string; jobId: string };

// --- Aspect-Ratio Mapping -----------------------------------------------
// nano_banana_2 unterstützt: 1:1, 3:2, 2:3, 4:3, 3:4, 4:5, 5:4, 9:16, 16:9, 21:9
// Module-Spec hat ein paar Ratios die nicht 1:1 mappen — wir nehmen die
// nächstliegende und akzeptieren minimalen Crop am Ende.
const ASPECT_MAP: Record<AspectRatio, string> = {
  "1:1": "1:1",
  "3:2": "3:2",
  "16:9": "16:9",
  "16:10": "3:2",
  "3:4": "3:4",
  "9:16": "9:16",
  "2:1": "16:9",
  "21:9": "21:9",
  "1:2": "9:16",
};

export function mapAspectRatio(ar: AspectRatio): string {
  return ASPECT_MAP[ar] ?? "1:1";
}

// --- Modellwahl ----------------------------------------------------------
// nano_banana_2 = Nano Banana Pro: bestes Text-Rendering, img2img-fähig,
// bis 4K. Wir nutzen es als Default für alle Cases.
export function selectModel(_opts: {
  textInImage: boolean;
  hasRef: boolean;
}): string {
  return "nano_banana_2";
}

// --- Spawn-Helper --------------------------------------------------------
function runCliOnce(args: string[], timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, [...args, "--json"], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`hf spawn error: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`hf timed out after ${timeoutMs}ms`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `hf exited with code ${code}.\nstderr: ${stderr.trim()}\nstdout: ${stdout.trim()}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(
          new Error(
            `hf returned non-JSON: ${(err as Error).message}\nOutput: ${stdout}`,
          ),
        );
      }
    });
  });
}

// Globaler in-process Lock: nur EIN hf.exe-Prozess gleichzeitig.
// Windows zickt sonst gerne mit EPERM/EBUSY wenn der Antivirus
// (oder der Filesystem-Lock) parallele Spawns blockt.
let cliQueue: Promise<unknown> = Promise.resolve();

async function runCli(args: string[], timeoutMs: number): Promise<unknown> {
  const previous = cliQueue;
  let release: () => void = () => {};
  cliQueue = new Promise<void>((r) => (release = r));

  try {
    await previous.catch(() => undefined);

    // Retry-Loop für transientes Windows-Spawn-Geraschel (EPERM/EBUSY).
    const transientPatterns = ["EPERM", "EBUSY", "EACCES", "ETXTBSY"];
    const maxAttempts = 3;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await runCliOnce(args, timeoutMs);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const transient = transientPatterns.some((p) => msg.includes(p));
        if (!transient || attempt === maxAttempts - 1) throw err;
        const backoff = 250 * 2 ** attempt; // 250, 500, 1000 ms
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  } finally {
    release();
  }
}

// --- Download + Temp-Datei ----------------------------------------------
// Lädt eine Amazon-Bild-URL nach /tmp, gibt den Pfad zurück.
// Pfad muss vom Caller danach manuell gelöscht werden (oder über
// auto-cleanup im finally).
export async function downloadToTemp(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Download failed: ${imageUrl} → HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const extMatch = imageUrl.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
  const ext = extMatch ? `.${extMatch[1]}` : ".jpg";
  const tmp = join(
    tmpdir(),
    `aplusgen-ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`,
  );
  await writeFile(tmp, buf);
  return tmp;
}

// --- Generate ------------------------------------------------------------
export type GenerateOptions = {
  prompt: string;
  model?: string;
  aspectRatio?: AspectRatio;
  resolution?: "1k" | "2k" | "4k";
  // Lokale Pfade zu Referenzbildern. CLI lädt sie auto hoch und
  // mappt sie ins `input_images`-Array des Modells.
  refImagePaths?: string[];
  timeoutMs?: number;
};

export async function generateImage(opts: GenerateOptions): Promise<HfImage> {
  const model = opts.model ?? "nano_banana_2";
  const aspect = opts.aspectRatio ? mapAspectRatio(opts.aspectRatio) : "1:1";
  const resolution = opts.resolution ?? "2k";
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  const args = [
    "generate",
    "create",
    model,
    "--prompt",
    opts.prompt,
    "--aspect_ratio",
    aspect,
    "--resolution",
    resolution,
    "--wait",
    "--wait-timeout",
    "5m",
  ];

  // Media-Flag --image akzeptiert Pfad ODER UUID; CLI lädt Pfade auto hoch.
  // Bei mehreren Referenzen passen wir mehrfach an.
  for (const p of opts.refImagePaths ?? []) {
    args.push("--image", p);
  }

  const result = (await runCli(args, timeoutMs)) as Array<{
    id: string;
    status: string;
    result_url?: string;
  }>;

  const job = result[0];
  if (!job) throw new Error("hf returned empty result array");
  if (job.status !== "completed" || !job.result_url) {
    throw new Error(`Job not completed: ${JSON.stringify(job)}`);
  }
  return { url: job.result_url, jobId: job.id };
}

// --- High-level: aus URLs Referenzbilder ziehen + generieren ------------
export async function generateImageFromUrls(opts: {
  prompt: string;
  refImageUrls?: string[];
  aspectRatio?: AspectRatio;
  resolution?: "1k" | "2k" | "4k";
  model?: string;
  timeoutMs?: number;
}): Promise<HfImage> {
  const tmpPaths: string[] = [];
  try {
    for (const url of opts.refImageUrls ?? []) {
      tmpPaths.push(await downloadToTemp(url));
    }
    return await generateImage({
      prompt: opts.prompt,
      model: opts.model,
      aspectRatio: opts.aspectRatio,
      resolution: opts.resolution,
      refImagePaths: tmpPaths,
      timeoutMs: opts.timeoutMs,
    });
  } finally {
    for (const p of tmpPaths) {
      await unlink(p).catch(() => {});
    }
  }
}
