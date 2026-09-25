"use client";

import { useEffect, useState } from "react";
import type { Candle } from "@/lib/types";

const REFRESH_MS = 60_000;

/**
 * Apertura de la vela diaria actual (00:00 UTC), base del % diario como en
 * TradingView. Se refresca cada minuto para tomar el cambio de día.
 */
export function useDailyOpen(): number | null {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch("/api/tick?interval=1d", { cache: "no-store" });
        if (!res.ok) return;
        const json: { candles: Candle[] } = await res.json();
        const today = json.candles[json.candles.length - 1];
        if (alive && today) setOpen(today.open);
      } catch {
        // sin dato diario el título muestra solo el precio
      }
    };

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return open;
}
