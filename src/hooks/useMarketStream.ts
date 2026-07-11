"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  binanceWsUrl,
  klineEventToCandle,
  type BinanceKlineEvent,
} from "@/lib/binance";
import {
  applyMarketCandles,
  mergeCandle,
  syncLastCandleWithMark,
  trimCandles,
} from "@/lib/candles";
import { detectPreview, detectSignals, signalKey } from "@/lib/patterns";
import type { Candle, Interval, Signal, SignalsResponse } from "@/lib/types";

const TICK_MS = 1000;
const API_SYNC_MS = 3000;

interface TickResponse {
  price: number;
  candles: Candle[];
  updatedAt: number;
}

export interface MarketStreamState {
  candles: Candle[];
  price: number | null;
  tickCount: number;
  signals: Signal[];
  preview: Signal | null;
  latest: Signal | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  updatedAt: number;
  justClosed: Signal | null;
}

export function useMarketStream(interval: Interval): MarketStreamState {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [tickCount, setTickCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [justClosed, setJustClosed] = useState<Signal | null>(null);

  const knownSignalsRef = useRef<Set<string>>(new Set());
  const lastOpenTimeRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsLiveRef = useRef(false);
  const alertTimerRef = useRef<number | null>(null);
  const tickBusyRef = useRef(false);
  const apiFailCountRef = useRef(0);

  const notifyNewSignals = useCallback((nextCandles: Candle[]) => {
    const confirmed = detectSignals(nextCandles);
    const fresh = confirmed.filter(
      (s) => !knownSignalsRef.current.has(signalKey(s))
    );

    if (fresh.length > 0) {
      if (alertTimerRef.current) {
        window.clearTimeout(alertTimerRef.current);
      }
      setJustClosed(fresh[0]);
      alertTimerRef.current = window.setTimeout(() => setJustClosed(null), 5000);
    }

    knownSignalsRef.current = new Set(confirmed.map(signalKey));
  }, []);

  const applyMarketTick = useCallback(
    (tick: TickResponse) => {
      setPrice(tick.price);
      setUpdatedAt(tick.updatedAt);
      setTickCount((n) => n + 1);
      apiFailCountRef.current = 0;

      setCandles((prev) => {
        const prevLastTime = prev[prev.length - 1]?.openTime ?? null;
        const next = applyMarketCandles(prev, tick.candles, tick.price);
        const nextLastTime = next[next.length - 1]?.openTime ?? null;

        if (
          prevLastTime != null &&
          nextLastTime != null &&
          nextLastTime > prevLastTime
        ) {
          lastOpenTimeRef.current = nextLastTime;
          queueMicrotask(() => notifyNewSignals(next));
        }

        return next;
      });
    },
    [notifyNewSignals]
  );

  const loadHistory = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/signals?interval=${interval}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const json: SignalsResponse = await res.json();
      setCandles(json.candles);
      setPrice(json.price);
      setUpdatedAt(Date.now());
      knownSignalsRef.current = new Set(json.signals.map(signalKey));
      lastOpenTimeRef.current =
        json.candles[json.candles.length - 1]?.openTime ?? null;
      apiFailCountRef.current = 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar datos";
      setError(
        wsLiveRef.current
          ? `API no disponible — usando WebSocket directo (${msg})`
          : msg
      );
    } finally {
      setLoading(false);
    }
  }, [interval]);

  const pollTick = useCallback(async () => {
    if (tickBusyRef.current) return;
    tickBusyRef.current = true;

    try {
      const res = await fetch(`/api/tick?interval=${interval}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        apiFailCountRef.current += 1;
        return;
      }

      const tick: TickResponse = await res.json();
      applyMarketTick(tick);
      setError((prev) =>
        prev?.startsWith("API no disponible") ? null : prev
      );
    } catch {
      apiFailCountRef.current += 1;
    } finally {
      tickBusyRef.current = false;
    }
  }, [interval, applyMarketTick]);

  useEffect(() => {
    setLoading(true);
    setCandles([]);
    setConnected(false);
    wsLiveRef.current = false;
    knownSignalsRef.current = new Set();
    lastOpenTimeRef.current = null;
    apiFailCountRef.current = 0;
    loadHistory();
  }, [interval, loadHistory]);

  useEffect(() => {
    pollTick();
    const timer = window.setInterval(pollTick, API_SYNC_MS);
    return () => window.clearInterval(timer);
  }, [pollTick]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (price != null) {
        setTickCount((n) => n + 1);
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [price]);

  useEffect(() => {
    let alive = true;

    const ws = new WebSocket(binanceWsUrl(interval));

    ws.onmessage = (event) => {
      if (!alive) return;

      try {
        const msg = JSON.parse(event.data as string) as {
          stream?: string;
          data?: { p?: string; k?: BinanceKlineEvent };
        };

        if (msg.stream?.includes("markPrice") && msg.data?.p) {
          const mark = parseFloat(msg.data.p);
          setPrice(mark);
          setUpdatedAt(Date.now());
          setCandles((prev) => syncLastCandleWithMark(prev, mark));
          setConnected(true);
          setError((prev) =>
            prev?.startsWith("API no disponible") ? null : prev
          );
          return;
        }

        if (msg.stream?.includes("kline") && msg.data?.k) {
          const incoming = klineEventToCandle(msg.data.k);
          setCandles((prev) => {
            const prevLastTime = prev[prev.length - 1]?.openTime ?? null;
            const next = trimCandles(mergeCandle(prev, incoming));
            const nextLastTime = next[next.length - 1]?.openTime ?? null;

            if (
              prevLastTime != null &&
              nextLastTime != null &&
              nextLastTime > prevLastTime
            ) {
              queueMicrotask(() => notifyNewSignals(next));
            } else if (incoming.closed) {
              queueMicrotask(() => notifyNewSignals(next));
            }

            return next;
          });
          setConnected(true);
        }
      } catch {
        // ignorar mensaje malformado
      }
    };

    ws.onopen = () => {
      if (!alive) return;
      wsLiveRef.current = true;
      setConnected(true);
    };

    ws.onclose = () => {
      if (!alive) return;
      wsLiveRef.current = false;
      setConnected(false);
    };

    wsRef.current = ws;

    return () => {
      alive = false;
      wsLiveRef.current = false;
      ws.close();
      wsRef.current = null;
      if (alertTimerRef.current) {
        window.clearTimeout(alertTimerRef.current);
      }
    };
  }, [interval, notifyNewSignals]);

  const signals = useMemo(() => detectSignals(candles), [candles]);
  const preview = useMemo(() => detectPreview(candles), [candles]);
  const latest = signals[0] ?? preview ?? null;

  return {
    candles,
    price,
    tickCount,
    signals,
    preview,
    latest,
    connected,
    loading,
    error,
    updatedAt,
    justClosed,
  };
}
