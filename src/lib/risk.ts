import type { SignalType, TakeProfits } from "./types";

const SL_BUFFER_PCT = 0.0002;
/**
 * El SL se aleja 0.75 ATR más allá de la mecha: con stops pegados a la mecha las
 * comisiones se comían 0.3–1.7R por operación (backtest 3000 velas/TF).
 */
export const SL_ATR_BUFFER = 0.75;

/**
 * Riesgo por operación por defecto (% del capital que se pierde si toca SL).
 * Con win rate ~35% las rachas de 11–16 pérdidas son normales: con 1% la caída
 * máxima ronda ~20%, con 0.5% ~10–12% (backtest + Monte Carlo).
 */
export const DEFAULT_RISK_PCT = 1;
export const MAX_RISK_PCT = 5;

export const DEFAULT_CAPITAL = 1000;

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
  level: number,
  atr = 0
): RiskLevels | null {
  const sl =
    type === "BUY"
      ? Math.min(candleLow, level) * (1 - SL_BUFFER_PCT) - SL_ATR_BUFFER * atr
      : Math.max(candleHigh, level) * (1 + SL_BUFFER_PCT) + SL_ATR_BUFFER * atr;

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

export const DEFAULT_LEVERAGE = 10;
export const MAX_LEVERAGE = 125;

/** Margen de mantenimiento aprox. de Binance para BTCUSDT en el primer tramo */
const MAINTENANCE_MARGIN_RATE = 0.004;

export interface PositionSize {
  /** USDT que se pierden si toca SL (≤ riskPct del capital) */
  riskAmount: number;
  /** Riesgo real sobre el capital (menor a riskPct si el tamaño quedó limitado) */
  riskPercentOfCapital: number;
  /** Cantidad de BTC */
  quantity: number;
  /** Valor nocional de la posición en USDT */
  notional: number;
  /** Margen que se bloquea con el apalancamiento elegido */
  margin: number;
  /** El capital × apalancamiento no alcanza para arriesgar el 1% completo */
  capped: boolean;
  /** Precio de liquidación aproximado (margen aislado) */
  liquidationPrice: number;
  /** La liquidación llega antes que el SL: bajar apalancamiento */
  liquidatesBeforeStop: boolean;
}

/**
 * Tamaño de posición para que el SL cueste riskPct del capital.
 * El nocional nunca supera capital × apalancamiento: si no alcanza, se achica
 * la posición y el riesgo real queda por debajo de riskPct.
 */
export function calculatePositionSize(
  type: SignalType,
  capital: number,
  leverage: number,
  riskPct: number,
  entry: number,
  stopLoss: number
): PositionSize | null {
  const distance = Math.abs(entry - stopLoss);
  if (!(capital > 0) || !(leverage >= 1) || !(distance > 0)) return null;

  const targetRisk = capital * (riskPct / 100);
  const maxNotional = capital * leverage;
  const idealQuantity = targetRisk / distance;
  const capped = idealQuantity * entry > maxNotional;
  const quantity = capped ? maxNotional / entry : idealQuantity;
  const notional = quantity * entry;
  const riskAmount = quantity * distance;

  const liquidationPrice =
    type === "BUY"
      ? entry * (1 - 1 / leverage + MAINTENANCE_MARGIN_RATE)
      : entry * (1 + 1 / leverage - MAINTENANCE_MARGIN_RATE);

  return {
    riskAmount,
    riskPercentOfCapital: (riskAmount / capital) * 100,
    quantity,
    notional,
    margin: notional / leverage,
    capped,
    liquidationPrice,
    liquidatesBeforeStop:
      type === "BUY"
        ? liquidationPrice >= stopLoss
        : liquidationPrice <= stopLoss,
  };
}
