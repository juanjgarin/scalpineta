import type { Candle } from "./types";

export function markCandlesClosed(candles: Candle[]): Candle[] {
  return candles.map((c, i) => ({
    ...c,
    closed: i < candles.length - 1,
  }));
}

export function mergeCandle(candles: Candle[], incoming: Candle): Candle[] {
  if (candles.length === 0) return [incoming];

  const last = candles[candles.length - 1];

  if (last.openTime === incoming.openTime) {
    return [...candles.slice(0, -1), incoming];
  }

  if (incoming.openTime > last.openTime) {
    const closedLast: Candle = { ...last, closed: true };
    return [...candles.slice(0, -1), closedLast, incoming];
  }

  return candles;
}

export function mergeCandles(candles: Candle[], incoming: Candle[]): Candle[] {
  let result = candles;
  for (const c of incoming) {
    result = mergeCandle(result, c);
  }
  return result;
}

export const CHART_CANDLES = 120;

export function trimCandles(candles: Candle[], limit = CHART_CANDLES): Candle[] {
  return candles.length > limit ? candles.slice(-limit) : candles;
}

/** Asegura que todas las velas excepto la última estén cerradas */
export function normalizeClosed(candles: Candle[]): Candle[] {
  if (candles.length === 0) return candles;
  return candles.map((c, i) => ({
    ...c,
    closed: i < candles.length - 1 ? true : (c.closed ?? false),
  }));
}

/** Sincroniza la vela abierta con el mark price (refresh cada 1s) */
export function syncLastCandleWithMark(
  candles: Candle[],
  mark: number
): Candle[] {
  if (candles.length === 0 || mark <= 0) return candles;

  const last = candles[candles.length - 1];
  if (last.closed === true) return candles;

  const updated: Candle = {
    ...last,
    close: mark,
    high: Math.max(last.high, mark),
    low: Math.min(last.low, mark),
    closed: false,
  };

  return [...candles.slice(0, -1), updated];
}

export function applyMarketCandles(
  prev: Candle[],
  incoming: Candle[],
  mark: number
): Candle[] {
  const merged = trimCandles(mergeCandles(prev, incoming));
  const normalized = normalizeClosed(merged);
  return syncLastCandleWithMark(normalized, mark);
}
