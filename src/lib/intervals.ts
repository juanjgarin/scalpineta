import type { Interval } from "./types";

export const INTERVALS: Interval[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
];

export const DEFAULT_INTERVAL: Interval = "5m";

export function isValidInterval(value: string): value is Interval {
  return (INTERVALS as string[]).includes(value);
}

export function parseInterval(
  value: string | null,
  fallback: Interval = DEFAULT_INTERVAL
): Interval {
  return value && isValidInterval(value) ? value : fallback;
}
