import type { Candle, Signal } from "./types";

export interface LevelHits {
  sl: boolean;
  tp1: boolean;
  tp2: boolean;
  tp3: boolean;
}

export type SignalOutcome = "SL" | "TP1" | "TP2" | "TP3";

export interface SignalResolution {
  status: "ACTIVE" | "CLOSED";
  outcome: SignalOutcome | null;
  hits: LevelHits;
}

const EMPTY_HITS: LevelHits = { sl: false, tp1: false, tp2: false, tp3: false };

function candleHits(
  signal: Signal,
  candle: Candle
): { sl: boolean; tp1: boolean; tp2: boolean; tp3: boolean } {
  if (!signal.stopLoss || !signal.takeProfits) {
    return { sl: false, tp1: false, tp2: false, tp3: false };
  }

  const { stopLoss, takeProfits } = signal;
  const isBuy = signal.type === "BUY";

  if (isBuy) {
    return {
      sl: candle.low <= stopLoss,
      tp1: candle.high >= takeProfits.r1,
      tp2: candle.high >= takeProfits.r2,
      tp3: candle.high >= takeProfits.r3,
    };
  }

  return {
    sl: candle.high >= stopLoss,
    tp1: candle.low <= takeProfits.r1,
    tp2: candle.low <= takeProfits.r2,
    tp3: candle.low <= takeProfits.r3,
  };
}

function liveHits(
  signal: Signal,
  livePrice: number
): { sl: boolean; tp1: boolean; tp2: boolean; tp3: boolean } {
  if (!signal.stopLoss || !signal.takeProfits) {
    return { sl: false, tp1: false, tp2: false, tp3: false };
  }

  const { stopLoss, takeProfits } = signal;
  const isBuy = signal.type === "BUY";

  if (isBuy) {
    return {
      sl: livePrice <= stopLoss,
      tp1: livePrice >= takeProfits.r1,
      tp2: livePrice >= takeProfits.r2,
      tp3: livePrice >= takeProfits.r3,
    };
  }

  return {
    sl: livePrice >= stopLoss,
    tp1: livePrice <= takeProfits.r1,
    tp2: livePrice <= takeProfits.r2,
    tp3: livePrice <= takeProfits.r3,
  };
}

function mergeHits(a: LevelHits, b: LevelHits): LevelHits {
  return {
    sl: a.sl || b.sl,
    tp1: a.tp1 || b.tp1,
    tp2: a.tp2 || b.tp2,
    tp3: a.tp3 || b.tp3,
  };
}

function outcomeFromBar(
  bar: { sl: boolean; tp1: boolean; tp2: boolean; tp3: boolean }
): SignalOutcome | null {
  if (bar.sl) return "SL";
  if (bar.tp3) return "TP3";
  if (bar.tp2) return "TP2";
  if (bar.tp1) return "TP1";
  return null;
}

/** Primer toque gana: SL tiene prioridad en la misma vela */
export function computeSignalResolution(
  signal: Signal,
  candles: Candle[],
  livePrice?: number | null
): SignalResolution {
  if (signal.preview || !signal.stopLoss || !signal.takeProfits) {
    return { status: "ACTIVE", outcome: null, hits: EMPTY_HITS };
  }

  const after = candles.filter((c) => c.openTime > signal.timestamp);
  let hits = { ...EMPTY_HITS };

  for (const c of after) {
    const bar = candleHits(signal, c);
    hits = mergeHits(hits, bar);

    const outcome = outcomeFromBar(bar);
    if (outcome) {
      return { status: "CLOSED", outcome, hits };
    }
  }

  if (livePrice != null) {
    const bar = liveHits(signal, livePrice);
    hits = mergeHits(hits, bar);
    const outcome = outcomeFromBar(bar);
    if (outcome) {
      return { status: "CLOSED", outcome, hits };
    }
  }

  return { status: "ACTIVE", outcome: null, hits };
}

/** @deprecated use computeSignalResolution */
export function computeLevelHits(
  signal: Signal,
  candles: Candle[],
  livePrice?: number | null
): LevelHits {
  return computeSignalResolution(signal, candles, livePrice).hits;
}

export function hasAnyHit(hits: LevelHits): boolean {
  return hits.sl || hits.tp1 || hits.tp2 || hits.tp3;
}

export function outcomeLabel(outcome: SignalOutcome): string {
  switch (outcome) {
    case "SL":
      return "SL HIT";
    case "TP1":
      return "TP 1:1";
    case "TP2":
      return "TP 1:2";
    case "TP3":
      return "TP 1:3";
  }
}
