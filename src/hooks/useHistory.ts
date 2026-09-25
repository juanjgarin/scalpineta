"use client";

import { useEffect, useState } from "react";
import type { Candle, Interval } from "@/lib/types";

/** El histórico de 1500 velas cambia lento: con refrescar cada 2 min alcanza */
const REFRESH_MS = 120_000;

export type History = Partial<Record<Interval, Candle[]>>;

/** Últimas 1500 velas de cada temporalidad (vía /api/history) */
export function useHistory(intervals: readonly Interval[]): History {
  const [history, setHistory] = useState<History>({});
  const key = intervals.join(",");

  useEffect(() => {
    const list = key ? (key.split(",") as Interval[]) : [];
    if (list.length === 0) return;
    let alive = true;

    const load = async (interval: Interval) => {
      try {
        const res = await fetch(`/api/history?interval=${interval}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json: { candles: Candle[] } = await res.json();
        if (alive) setHistory((prev) => ({ ...prev, [interval]: json.candles }));
      } catch {
        // se conserva el último dato bueno de esa temporalidad
      }
    };

    const loadAll = () => list.forEach(load);
    loadAll();
    const timer = window.setInterval(loadAll, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [key]);

  return history;
}
