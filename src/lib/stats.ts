import { computeSignalResolution } from "./hits";
import type { Candle, Signal } from "./types";

/** Comisión taker de Binance Futures por lado (entrada y salida a mercado) */
export const TAKER_FEE = 0.0005;

export interface SignalStats {
  /** Señales detectadas en la muestra */
  total: number;
  /** Todavía abiertas (no cuentan para el win rate) */
  active: number;
  closed: number;
  sl: number;
  be: number;
  r1: number;
  r2: number;
  r3: number;
  /** Cerradas asegurando 4R o más */
  rMore: number;
  /** Cerradas con al menos +1R asegurado / cerradas */
  winRate: number | null;
  /** Suma de R de las cerradas: SL = −1, BE = 0, +nR asegurado = n */
  grossR: number;
  /** Comisiones de entrada + salida, expresadas en R */
  feesR: number;
  /** grossR − feesR: lo que realmente queda */
  netR: number;
}

export function computeStats(signals: Signal[], candles: Candle[]): SignalStats {
  const stats: SignalStats = {
    total: 0,
    active: 0,
    closed: 0,
    sl: 0,
    be: 0,
    r1: 0,
    r2: 0,
    r3: 0,
    rMore: 0,
    winRate: null,
    grossR: 0,
    feesR: 0,
    netR: 0,
  };

  for (const signal of signals) {
    if (!signal.stopLoss || !signal.takeProfits) continue;
    stats.total++;

    const res = computeSignalResolution(signal, candles);
    if (res.status === "ACTIVE") {
      stats.active++;
      continue;
    }

    stats.closed++;
    // Con stops cortos la comisión pesa mucho en R: 0.1% ida y vuelta sobre
    // un SL de 0.1% es 1R entero.
    const risk = Math.abs(signal.price - signal.stopLoss);
    stats.feesR += (2 * TAKER_FEE * signal.price) / risk;

    if (res.outcome === "SL") {
      stats.sl++;
      stats.grossR -= 1;
      continue;
    }

    const locked = res.lockedR ?? 0;
    stats.grossR += locked;
    if (locked === 0) stats.be++;
    else if (locked === 1) stats.r1++;
    else if (locked === 2) stats.r2++;
    else if (locked === 3) stats.r3++;
    else stats.rMore++;
  }

  const wins = stats.r1 + stats.r2 + stats.r3 + stats.rMore;
  stats.winRate = stats.closed > 0 ? (wins / stats.closed) * 100 : null;
  stats.netR = stats.grossR - stats.feesR;
  return stats;
}
