import type { Candle, Interval } from "./types";

/** BTCUSDT USDT-M Perpetual (Binance Futures) */
export const SYMBOL = "BTCUSDT";

const BINANCE_FUTURES = "https://fapi.binance.com";
const BINANCE_FUTURES_WS = "wss://fstream.binance.com";
const FETCH_TIMEOUT_MS = 8000;

async function binanceFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Binance API error ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`
    );
  }

  return res;
}

export async function fetchKlines(
  interval: Interval,
  limit = 200
): Promise<Candle[]> {
  const url = `${BINANCE_FUTURES}/fapi/v1/klines?symbol=${SYMBOL}&interval=${interval}&limit=${limit}`;
  const res = await binanceFetch(url);
  const data: (string | number)[][] = await res.json();

  return data.map((k, i) => ({
    openTime: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
    closeTime: Number(k[6]),
    closed: i < data.length - 1,
  }));
}

export async function fetchMarkPrice(): Promise<number> {
  const url = `${BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol=${SYMBOL}`;
  const res = await binanceFetch(url);
  const data = await res.json();
  return parseFloat(data.markPrice);
}

export interface BinanceKlineEvent {
  t: number;
  T: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  x: boolean;
}

export function klineEventToCandle(k: BinanceKlineEvent): Candle {
  return {
    openTime: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
    closeTime: k.T,
    closed: k.x,
  };
}

export function binanceWsUrl(interval: Interval): string {
  const sym = SYMBOL.toLowerCase();
  const kline = `${sym}@kline_${interval}`;
  const mark = `${sym}@markPrice@1s`;
  return `${BINANCE_FUTURES_WS}/stream?streams=${kline}/${mark}`;
}
