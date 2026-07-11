import type { Candle, Interval } from "./types";

const BINANCE_FUTURES = "https://fapi.binance.com";

export async function fetchKlines(
  interval: Interval,
  limit = 200
): Promise<Candle[]> {
  const url = `${BINANCE_FUTURES}/fapi/v1/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status}`);
  }

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
  const url = `${BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol=BTCUSDT`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status}`);
  }

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
  const kline = `btcusdt@kline_${interval}`;
  const mark = "btcusdt@markPrice@1s";
  return `wss://fstream.binance.com/stream?streams=${kline}/${mark}`;
}
