import { INTERVALS } from "./intervals";
import { detectSignals } from "./patterns";
import { computeStats, type SignalStats } from "./stats";
import type { Candle, Interval, PatternType } from "./types";

/*
 * Recomendación por patrón y temporalidad, evaluada en vivo sobre las últimas
 * 1500 velas de cada TF. El criterio principal es el win rate, pero exige R
 * neto positivo: con comisiones, un win rate alto con SL cortos igual pierde.
 */
export const MIN_WIN_RATE = 30;
/** Menos operaciones cerradas que esto no alcanzan para confiar en el win rate */
export const MIN_CLOSED = 10;

export const PATTERNS: PatternType[] = ["TURTLE_SOUP", "SWEEP"];

export interface ComboEvaluation {
  interval: Interval;
  pattern: PatternType;
  stats: SignalStats;
  recommended: boolean;
}

export function comboKey(interval: Interval, pattern: PatternType) {
  return `${interval}:${pattern}`;
}

export function isRecommended(stats: SignalStats) {
  return (
    stats.closed >= MIN_CLOSED &&
    (stats.winRate ?? 0) >= MIN_WIN_RATE &&
    stats.netR > 0
  );
}

/** Evalúa cada combinación patrón × temporalidad con datos disponibles */
export function evaluateCombos(
  history: Partial<Record<Interval, Candle[]>>
): Map<string, ComboEvaluation> {
  const result = new Map<string, ComboEvaluation>();

  for (const interval of INTERVALS) {
    const candles = history[interval];
    if (!candles) continue;
    const signals = detectSignals(candles, interval);

    for (const pattern of PATTERNS) {
      const stats = computeStats(
        signals.filter((s) => s.pattern === pattern),
        candles
      );
      result.set(comboKey(interval, pattern), {
        interval,
        pattern,
        stats,
        recommended: isRecommended(stats),
      });
    }
  }

  return result;
}

/** Recomendadas, de mayor a menor win rate */
export function rankRecommended(combos: Map<string, ComboEvaluation>) {
  return [...combos.values()]
    .filter((c) => c.recommended)
    .sort((a, b) => (b.stats.winRate ?? 0) - (a.stats.winRate ?? 0));
}
