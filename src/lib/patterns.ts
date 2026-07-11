import { calculateRiskLevels } from "./risk";
import type { Candle, Signal } from "./types";

const SWEEP_LOOKBACK = 15;
const TURTLE_PERIOD = 20;

function swingLevels(candles: Candle[], endIndex: number, lookback: number) {
  const start = Math.max(0, endIndex - lookback);
  const slice = candles.slice(start, endIndex);

  if (slice.length === 0) {
    return { swingHigh: 0, swingLow: Infinity };
  }

  return {
    swingHigh: Math.max(...slice.map((c) => c.high)),
    swingLow: Math.min(...slice.map((c) => c.low)),
  };
}

type RawSignal = Omit<
  Signal,
  | "candleLow"
  | "candleHigh"
  | "stopLoss"
  | "takeProfits"
  | "riskPercent"
  | "preview"
>;

function enrichSignal(
  raw: RawSignal,
  candle: Candle,
  preview = false
): Signal {
  const risk = calculateRiskLevels(
    raw.type,
    raw.price,
    candle.low,
    candle.high,
    raw.level
  );

  return {
    ...raw,
    candleLow: candle.low,
    candleHigh: candle.high,
    stopLoss: risk?.stopLoss ?? null,
    takeProfits: risk?.takeProfits ?? null,
    riskPercent: risk?.riskPercent ?? null,
    preview,
  };
}

function detectSweep(
  candle: Candle,
  swingHigh: number,
  swingLow: number
): RawSignal | null {
  if (candle.low < swingLow && candle.close > swingLow) {
    return {
      type: "BUY",
      pattern: "SWEEP",
      timestamp: candle.openTime,
      price: candle.close,
      level: swingLow,
      description: `Barrido alcista en ${swingLow.toFixed(2)} — mecha abajo, cierre arriba`,
    };
  }

  if (candle.high > swingHigh && candle.close < swingHigh) {
    return {
      type: "SELL",
      pattern: "SWEEP",
      timestamp: candle.openTime,
      price: candle.close,
      level: swingHigh,
      description: `Barrido bajista en ${swingHigh.toFixed(2)} — mecha arriba, cierre abajo`,
    };
  }

  return null;
}

function detectTurtleSoup(
  candles: Candle[],
  index: number,
  period = TURTLE_PERIOD
): RawSignal | null {
  if (index < period) return null;

  const prior = candles.slice(index - period, index);
  const periodHigh = Math.max(...prior.map((c) => c.high));
  const periodLow = Math.min(...prior.map((c) => c.low));
  const candle = candles[index];

  if (candle.low < periodLow && candle.close > periodLow) {
    return {
      type: "BUY",
      pattern: "TURTLE_SOUP",
      timestamp: candle.openTime,
      price: candle.close,
      level: periodLow,
      description: `Turtle Soup alcista — falso quiebre de mínimo ${periodLow.toFixed(2)}`,
    };
  }

  if (candle.high > periodHigh && candle.close < periodHigh) {
    return {
      type: "SELL",
      pattern: "TURTLE_SOUP",
      timestamp: candle.openTime,
      price: candle.close,
      level: periodHigh,
      description: `Turtle Soup bajista — falso quiebre de máximo ${periodHigh.toFixed(2)}`,
    };
  }

  return null;
}

function signalKey(signal: Pick<Signal, "timestamp" | "pattern" | "type">) {
  return `${signal.timestamp}-${signal.pattern}-${signal.type}`;
}

function lastClosedIndex(candles: Candle[]): number {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].closed !== false) return i;
  }
  return Math.max(0, candles.length - 2);
}

function scanAtIndex(
  candles: Candle[],
  index: number,
  preview: boolean
): Signal[] {
  const candle = candles[index];
  const { swingHigh, swingLow } = swingLevels(candles, index, SWEEP_LOOKBACK);
  const found: Signal[] = [];

  for (const raw of [
    detectSweep(candle, swingHigh, swingLow),
    detectTurtleSoup(candles, index),
  ]) {
    if (raw) found.push(enrichSignal(raw, candle, preview));
  }

  return found;
}

export function detectSignals(candles: Candle[]): Signal[] {
  const found: Signal[] = [];
  const seen = new Set<string>();

  const lastIndex = lastClosedIndex(candles);
  const startIndex = TURTLE_PERIOD;

  for (let i = startIndex; i <= lastIndex; i++) {
    for (const signal of scanAtIndex(candles, i, false)) {
      const key = signalKey(signal);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(signal);
    }
  }

  return found.sort((a, b) => b.timestamp - a.timestamp);
}

/** Señal tentativa en la vela abierta (puede cambiar antes del cierre) */
export function detectPreview(candles: Candle[]): Signal | null {
  if (candles.length === 0) return null;

  const last = candles[candles.length - 1];
  if (last.closed !== false) return null;

  const index = candles.length - 1;
  if (index < TURTLE_PERIOD) return null;

  const previews = scanAtIndex(candles, index, true);
  return previews[0] ?? null;
}

export { signalKey };
