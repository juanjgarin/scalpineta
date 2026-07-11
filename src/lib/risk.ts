import type { SignalType, TakeProfits } from "./types";

const SL_BUFFER_PCT = 0.0002;

export interface RiskLevels {
  stopLoss: number;
  takeProfits: TakeProfits;
  riskPercent: number;
}

export function calculateRiskLevels(
  type: SignalType,
  entry: number,
  candleLow: number,
  candleHigh: number,
  level: number
): RiskLevels | null {
  const sl =
    type === "BUY"
      ? Math.min(candleLow, level) * (1 - SL_BUFFER_PCT)
      : Math.max(candleHigh, level) * (1 + SL_BUFFER_PCT);

  const risk = type === "BUY" ? entry - sl : sl - entry;

  if (risk <= 0) return null;

  const sign = type === "BUY" ? 1 : -1;

  return {
    stopLoss: sl,
    takeProfits: {
      r1: entry + sign * risk,
      r2: entry + sign * 2 * risk,
      r3: entry + sign * 3 * risk,
    },
    riskPercent: (risk / entry) * 100,
  };
}
