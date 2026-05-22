"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type ScrapedProduct = {
  title: string;
  description: string;
  bullets: string[];
  technicalDetails: Record<string, string>;
  images: string[];
  brand?: string;
  category?: string;
  url: string;
};

export function ScrapeForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapedProduct | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || `HTTP ${res.status}`);
      } else {
        setResult(data as ScrapedProduct);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.amazon.de/dp/..."
          required
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100"
        />
        <Button type="submit" disabled={loading || !url.trim()}>
          {loading ? "Lädt…" : "Scrapen"}
        </Button>
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <div className="font-medium">Fehler</div>
          <div className="mt-1 font-mono text-xs">{error}</div>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">
              Titel
            </div>
            <div className="mt-1 text-lg font-medium text-zinc-900 dark:text-zinc-100">
              {result.title}
            </div>
            {(result.brand || result.category) && (
              <div className="mt-1 flex gap-3 text-xs text-zinc-500">
                {result.brand && <span>Marke: {result.brand}</span>}
                {result.category && <span>Kategorie: {result.category}</span>}
              </div>
            )}
          </div>

          {result.bullets.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Bullets ({result.bullets.length})
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                {result.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {Object.keys(result.technicalDetails).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Technische Details ({Object.keys(result.technicalDetails).length})
              </div>
              <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                {Object.entries(result.technicalDetails).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="text-zinc-800 dark:text-zinc-200">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {result.images.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Bilder ({result.images.length})
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {result.images.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt={`Produktbild ${i + 1}`}
                    className="aspect-square rounded-md border border-zinc-200 bg-white object-contain p-1 dark:border-zinc-800 dark:bg-zinc-900"
                  />
                ))}
              </div>
            </div>
          )}

          {result.description && (
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Beschreibung
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">
                {result.description}
              </p>
            </div>
          )}

          <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Rohes JSON
            </summary>
            <pre className="mt-3 overflow-auto text-xs text-zinc-700 dark:text-zinc-300">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
