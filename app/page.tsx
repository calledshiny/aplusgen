import { MODULES } from "@/lib/modules";

export default function Home() {
  return (
    <main className="min-h-dvh bg-zinc-50 px-6 py-16 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          <span className="size-2 rounded-full bg-emerald-500" />
          Phase 1 · Foundation
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          A+ Content Generator
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Web-App zum automatischen Generieren von Amazon A+ Content. Amazon-URL
          rein, fertiger Content mit Texten und Bildern raus — ready zum
          Copy/Paste in Seller Central.
        </p>

        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {MODULES.length} Module geladen
            </h2>
            <span className="text-xs text-zinc-500">lib/modules.ts</span>
          </div>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODULES.map((m) => (
              <li
                key={m.type}
                className="flex items-center gap-3 rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50"
              >
                <span className="w-6 shrink-0 text-right font-mono text-xs text-zinc-500">
                  {String(m.number).padStart(2, "0")}
                </span>
                <span className="truncate font-medium text-zinc-800 dark:text-zinc-200">
                  {m.name}
                </span>
                {m.aiReady && (
                  <span
                    title="Bereit für KI"
                    className="ml-auto text-xs text-blue-500"
                  >
                    AI
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            API
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
              POST /api/analyze
            </code>{" "}
            — analysiert ein Produkt via Claude Sonnet 4.5.
          </p>
        </section>
      </div>
    </main>
  );
}
