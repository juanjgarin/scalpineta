import type { Interval } from "./types";

export const INTERVALS: Interval[] = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
];

export const DEFAULT_INTERVAL: Interval = "5m";

const MINUTE = 60_000;

export const INTERVAL_MS: Record<Interval, number> = {
  "1m": MINUTE,
  "3m": 3 * MINUTE,
  "5m": 5 * MINUTE,
  "15m": 15 * MINUTE,
  "30m": 30 * MINUTE,
  "1h": 60 * MINUTE,
  "4h": 240 * MINUTE,
  "1d": 1440 * MINUTE,
};

/** Momento en que la señal quedó confirmada: cierre de su vela */
export function confirmedAt(signal: { timestamp: number; interval: Interval }) {
  return signal.timestamp + INTERVAL_MS[signal.interval];
}

/**
 * Vela del gráfico donde ubicar una señal de otra temporalidad: la que contiene
 * el último instante de la vela de la señal.
 */
export function chartBarTime(
  signal: { timestamp: number; interval: Interval },
  chartInterval: Interval
) {
  if (signal.interval === chartInterval) return signal.timestamp;
  const ms = INTERVAL_MS[chartInterval];
  return Math.floor((confirmedAt(signal) - 1) / ms) * ms;
}

export function isValidInterval(value: string): value is Interval {
  return (INTERVALS as string[]).includes(value);
}

export function parseInterval(
  value: string | null,
  fallback: Interval = DEFAULT_INTERVAL
): Interval {
  return value && isValidInterval(value) ? value : fallback;
}
