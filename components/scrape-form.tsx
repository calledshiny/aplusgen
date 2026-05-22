"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlanView } from "@/components/plan-view";
import { ContentView, type StoryItem } from "@/components/content-view";
import type { AplusPlan } from "@/lib/plan";
import { clearPersistedState, usePersistedState } from "@/lib/persisted-state";

const LS = {
  input: "aplus.input",
  scraped: "aplus.scraped",
  plan: "aplus.plan",
  story: "aplus.story",
};

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
  const [input, setInput] = usePersistedState<string>(LS.input, "");
  const [scraping, setScraping] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scraped, setScraped] = usePersistedState<ScrapedProduct | null>(
    LS.scraped,
    null,
  );
  const [plan, setPlan] = usePersistedState<AplusPlan | null>(LS.plan, null);
  const [story, setStory] = usePersistedState<StoryItem[] | null>(
    LS.story,
    null,
  );

  async function onScrape(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || scraping) return;
    setScraping(true);
    setError(null);
    setScraped(null);
    setPlan(null);
    setStory(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || `HTTP ${res.status}`);
      } else {
        setScraped(data as ScrapedProduct);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScraping(false);
    }
  }

  async function onPlan() {
    if (!scraped || planning) return;
    setPlanning(true);
    setError(null);
    setPlan(null);
    setStory(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scraped }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || `HTTP ${res.status}`);
      } else {
        setPlan(data as AplusPlan);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanning(false);
    }
  }

  function onReset() {
    setInput("");
    setScraped(null);
    setPlan(null);
    setStory(null);
    setError(null);
    // Persistierten Slot-State der Content-View auch wegräumen
    if (typeof window !== "undefined") {
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith("aplus.slots.")) {
            window.localStorage.removeItem(key);
          }
        }
      } catch {
        /* ignore */
      }
    }
    clearPersistedState(LS.input, LS.scraped, LS.plan, LS.story);
  }

  return (
    <div>
      <form onSubmit={onScrape} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Amazon-URL oder ASIN (z.B. B07XJ8C8F5)"
          required
          disabled={scraping || planning}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100"
        />
        <Button type="submit" disabled={scraping || planning || !input.trim()}>
          {scraping ? "Scrapen…" : "Scrapen"}
        </Button>
        {scraped && (
          <Button type="button" variant="secondary" onClick={onReset}>
            Neu
          </Button>
        )}
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <div className="font-medium">Fehler</div>
          <div className="mt-1 break-all font-mono text-xs">{error}</div>
        </div>
      )}

      {scraped && !plan && (
        <div className="mt-6 space-y-6">
          <ScrapedSummary scraped={scraped} />
          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <span className="mr-auto text-xs text-zinc-500">
              Daten sehen okay aus? → Plan generieren (Claude wählt Module aus)
            </span>
            <Button onClick={onPlan} disabled={planning}>
              {planning ? "Plant…" : "Plan erstellen →"}
            </Button>
          </div>
        </div>
      )}

      {plan && !story && (
        <div className="mt-6 space-y-6">
          {scraped && <ScrapedSummary scraped={scraped} collapsed />}
          <PlanView plan={plan} onGenerate={(items) => setStory(items)} />
        </div>
      )}

      {story && plan && scraped && (
        <div className="mt-6">
          <ContentView
            scraped={scraped}
            analysis={plan.analysis}
            story={story}
            persistenceKey={`aplus.slots.${scraped.url}`}
            onBack={() => setStory(null)}
          />
        </div>
      )}
    </div>
  );
}

function ScrapedSummary({
  scraped,
  collapsed = false,
}: {
  scraped: ScrapedProduct;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">
          Scrape-Daten ({scraped.images.length} Bilder, {scraped.bullets.length} Bullets, {Object.keys(scraped.technicalDetails).length} Specs)
        </summary>
        <div className="mt-3">
          <ScrapedSummary scraped={scraped} />
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500">
          Titel
        </div>
        <div className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
          {scraped.title}
        </div>
        {(scraped.brand || scraped.category) && (
          <div className="mt-1 flex gap-3 text-xs text-zinc-500">
            {scraped.brand && <span>Marke: {scraped.brand}</span>}
            {scraped.category && <span>Kategorie: {scraped.category}</span>}
          </div>
        )}
      </div>

      {scraped.bullets.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            Bullets ({scraped.bullets.length})
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {scraped.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(scraped.technicalDetails).length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            Technische Details (
            {Object.keys(scraped.technicalDetails).length})
          </div>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            {Object.entries(scraped.technicalDetails).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {scraped.images.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            Bilder ({scraped.images.length})
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {scraped.images.map((src, i) => (
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
    </div>
  );
}
