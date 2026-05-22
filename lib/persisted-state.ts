"use client";

import { useEffect, useRef, useState } from "react";

// Drop-in replacement für useState, das den Wert in localStorage spiegelt.
// SSR-safe (initial-Hydratation läuft ohne localStorage, dann ein
// Re-Hydrate beim ersten Client-Render falls Key existiert).
//
// Setze `null` oder `undefined` um den Eintrag zu löschen.
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initial);

  // Initial-Load nach mount (verhindert hydration-mismatch).
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null && raw !== "") {
        setState(JSON.parse(raw) as T);
      }
    } catch {
      /* parse error → ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speichern bei jeder Änderung (nach initial-load).
  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (state === null || state === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(state));
      }
    } catch {
      /* quota / serialization → ignore */
    }
  }, [key, state]);

  return [state, setState];
}

export function clearPersistedState(...keys: string[]): void {
  if (typeof window === "undefined") return;
  for (const k of keys) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
