import type { Candle, Signal } from "./types";

export interface LevelHits {
  sl: boolean;
  tp1: boolean;
  tp2: boolean;
  tp3: boolean;
  /** Cerró al tocar el stop escalonado (BE o un R ya asegurado) */
  trail: boolean;
}

/** SL = stop original · TRAIL = stop escalonado tras asegurar 1:1 */
export type SignalOutcome = "SL" | "TRAIL";

export interface SignalResolution {
  status: "ACTIVE" | "CLOSED";
  outcome: SignalOutcome | null;
  hits: LevelHits;
  /** Tocó 1:1 → el stop ya no puede quedar en pérdida */
  secured: boolean;
  /**
   * R asegurados por el stop escalonado: null antes de 1:1, 0 = BE,
   * 1 = 1:1 asegurado, 2 = 1:2... (al cerrar por TRAIL es lo que se cobra)
   */
  lockedR: number | null;
  /** Precio del stop vigente */
  activeStop: number | null;
  /** Máximo recorrido a favor alcanzado, en múltiplos de R (1 = 1:1) */
  maxR: number;
}

const EMPTY_HITS: LevelHits = {
  sl: false,
  tp1: false,
  tp2: false,
  tp3: false,
  trail: false,
};

export const EMPTY_RESOLUTION: SignalResolution = {
  status: "ACTIVE",
  outcome: null,
  hits: EMPTY_HITS,
  secured: false,
  lockedR: null,
  activeStop: null,
  maxR: 0,
};

interface Bar {
  high: number;
  low: number;
}

function stopped(isBuy: boolean, bar: Bar, stop: number) {
  return isBuy ? bar.low <= stop : bar.high >= stop;
}

/**
 * Gestión de la operación con stop escalonado (primer toque gana):
 * - Antes de 1:1: SL original (prioriza si SL y TP caen en la misma vela).
 * - Cada vez que el precio alcanza un nuevo múltiplo entero de R, el stop sube
 *   un escalón: 1R → BE, 2R → +1R, 3R → +2R… Sin techo.
 * - Cierra cuando el precio toca el stop vigente, cobrando los R asegurados.
 */
export function computeSignalResolution(
  signal: Signal,
  candles: Candle[],
  livePrice?: number | null
): SignalResolution {
  if (signal.preview || !signal.stopLoss || !signal.takeProfits) {
    return EMPTY_RESOLUTION;
  }

  const { stopLoss, takeProfits, price: entry } = signal;
  const isBuy = signal.type === "BUY";
  const sign = isBuy ? 1 : -1;
  const risk = Math.abs(entry - stopLoss);
  const stopAt = (r: number) => entry + sign * r * risk;

  const bars: Bar[] = candles
    .filter((c) => c.openTime > signal.timestamp)
    .map((c) => ({ high: c.high, low: c.low }));
  if (livePrice != null) bars.push({ high: livePrice, low: livePrice });

  const hits = { ...EMPTY_HITS };
  let lockedR: number | null = null;
  let maxR = 0;

  for (const bar of bars) {
    const stop = lockedR == null ? stopLoss : stopAt(lockedR);

    // El stop se evalúa contra el escalón previo a esta vela: no sabemos si el
    // máximo de la vela vino antes o después del toque, así que no lo sumamos.
    if (stopped(isBuy, bar, stop)) {
      if (lockedR == null) hits.sl = true;
      else hits.trail = true;
      return {
        status: "CLOSED",
        outcome: lockedR == null ? "SL" : "TRAIL",
        hits,
        secured: lockedR != null,
        lockedR,
        activeStop: stop,
        maxR,
      };
    }

    const favorable = isBuy ? bar.high - entry : entry - bar.low;
    maxR = Math.max(maxR, favorable / risk);
    hits.tp1 ||= maxR >= 1 - 1e-9;
    hits.tp2 ||= reachedTarget(isBuy, bar, takeProfits.r2);
    hits.tp3 ||= reachedTarget(isBuy, bar, takeProfits.r3);

    const step = Math.floor(maxR + 1e-9);
    if (step >= 1) lockedR = Math.max(lockedR ?? 0, step - 1);
  }

  return {
    status: "ACTIVE",
    outcome: null,
    hits,
    secured: lockedR != null,
    lockedR,
    activeStop: lockedR == null ? stopLoss : stopAt(lockedR),
    maxR,
  };
}

function reachedTarget(isBuy: boolean, bar: Bar, target: number) {
  return isBuy ? bar.high >= target : bar.low <= target;
}

/** "BE", "+1R", "+2R"… */
export function lockedLabel(lockedR: number): string {
  return lockedR === 0 ? "BE" : `+${lockedR}R`;
}

export function outcomeLabel(resolution: SignalResolution): string {
  if (resolution.outcome === "SL") return "SL HIT";
  const locked = resolution.lockedR ?? 0;
  return locked === 0 ? "en BE" : `+${locked}R asegurado`;
}
