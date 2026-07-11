"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { chart as C } from "@/lib/colors";
import type { LevelHits } from "@/lib/hits";
import type { Candle, Signal } from "@/lib/types";

interface PriceChartProps {
  candles: Candle[];
  signals: Signal[];
  preview: Signal | null;
  selectedSignal: Signal | null;
  levelHits: LevelHits | null;
  livePrice: number | null;
}

function toChartTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function buildMarkers(signals: Signal[], preview: Signal | null): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = signals.map((s) => ({
    time: toChartTime(s.timestamp),
    position: s.type === "BUY" ? "belowBar" : "aboveBar",
    color: s.type === "BUY" ? C.markerBuy : C.markerSell,
    shape: s.type === "BUY" ? "arrowUp" : "arrowDown",
    text:
      s.type === "BUY"
        ? s.pattern === "SWEEP"
          ? "COMPRA"
          : "TS↑"
        : s.pattern === "SWEEP"
          ? "VENTA"
          : "TS↓",
  }));

  if (preview) {
    markers.push({
      time: toChartTime(preview.timestamp),
      position: preview.type === "BUY" ? "belowBar" : "aboveBar",
      color: C.markerPreview,
      shape: preview.type === "BUY" ? "arrowUp" : "arrowDown",
      text: preview.type === "BUY" ? "PRE↑" : "PRE↓",
    });
  }

  return markers;
}

export default function PriceChart({
  candles,
  signals,
  preview,
  selectedSignal,
  levelHits,
  livePrice,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const liveLineRef = useRef<IPriceLine | null>(null);
  const fittedRef = useRef(false);
  const candleCountRef = useRef(0);
  const firstOpenTimeRef = useRef<number | null>(null);
  const lastOpenTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.grid },
      timeScale: {
        borderColor: C.grid,
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: 420,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: C.up,
      downColor: C.down,
      borderVisible: false,
      wickUpColor: C.wickUp,
      wickDownColor: C.wickDown,
    });

    markersRef.current = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      levelLinesRef.current.forEach((line) => series.removePriceLine(line));
      levelLinesRef.current = [];
      if (liveLineRef.current) {
        series.removePriceLine(liveLineRef.current);
        liveLineRef.current = null;
      }
      markersRef.current?.detach();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      fittedRef.current = false;
      candleCountRef.current = 0;
      firstOpenTimeRef.current = null;
      lastOpenTimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || candles.length === 0) return;

    const last = candles[candles.length - 1];
    const isOpen = last.closed === false;
    const close =
      isOpen && livePrice != null ? livePrice : last.close;
    const high =
      isOpen && livePrice != null
        ? Math.max(last.high, livePrice)
        : last.high;
    const low =
      isOpen && livePrice != null
        ? Math.min(last.low, livePrice)
        : last.low;

    const bar = {
      time: toChartTime(last.openTime),
      open: last.open,
      high,
      low,
      close,
    };

    const prevLen = candleCountRef.current;
    const firstTime = candles[0].openTime;
    const canIncremental =
      prevLen > 0 &&
      firstOpenTimeRef.current === firstTime &&
      candles.length >= prevLen &&
      candles.length <= prevLen + 1;

    if (canIncremental) {
      series.update(bar);
      lastOpenTimeRef.current = last.openTime;
    } else {
      series.setData(
        candles.map((c, i) => {
          const isLast = i === candles.length - 1;
          const cClose =
            isLast && isOpen && livePrice != null ? livePrice : c.close;
          return {
            time: toChartTime(c.openTime),
            open: c.open,
            high: isLast && isOpen && livePrice != null
              ? Math.max(c.high, livePrice)
              : c.high,
            low: isLast && isOpen && livePrice != null
              ? Math.min(c.low, livePrice)
              : c.low,
            close: cClose,
          };
        })
      );
      firstOpenTimeRef.current = firstTime;
      lastOpenTimeRef.current = last.openTime;

      if (!fittedRef.current || prevLen !== candles.length) {
        chart.timeScale().fitContent();
        fittedRef.current = true;
      }
    }

    candleCountRef.current = candles.length;
  }, [candles, livePrice]);

  useEffect(() => {
    markersRef.current?.setMarkers(buildMarkers(signals, preview));
  }, [signals, preview]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || livePrice == null) return;

    if (!liveLineRef.current) {
      liveLineRef.current = series.createPriceLine({
        price: livePrice,
        color: C.live,
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: "Live",
      });
    } else {
      liveLineRef.current.applyOptions({ price: livePrice });
    }
  }, [livePrice]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    levelLinesRef.current.forEach((line) => series.removePriceLine(line));
    levelLinesRef.current = [];

    if (!selectedSignal?.stopLoss || !selectedSignal.takeProfits) return;

    const hits = levelHits ?? {
      sl: false,
      tp1: false,
      tp2: false,
      tp3: false,
    };

    const addLine = (
      price: number,
      color: string,
      hitColor: string,
      title: string,
      hit: boolean,
      lineStyle = 0
    ) => {
      const line = series.createPriceLine({
        price,
        color: hit ? hitColor : color,
        lineWidth: hit ? 2 : 1,
        lineStyle,
        axisLabelVisible: true,
        title: hit ? `${title} HIT` : title,
      });
      levelLinesRef.current.push(line);
    };

    addLine(selectedSignal.price, C.entry, C.entryHit, "Entry", false, 2);
    addLine(
      selectedSignal.stopLoss,
      C.sl,
      C.slHit,
      "SL",
      hits.sl,
      hits.sl ? 0 : 2
    );
    addLine(
      selectedSignal.takeProfits.r1,
      C.tp,
      C.tpHit,
      "TP 1:1",
      hits.tp1
    );
    addLine(
      selectedSignal.takeProfits.r2,
      C.tp,
      C.tpHit,
      "TP 1:2",
      hits.tp2
    );
    addLine(
      selectedSignal.takeProfits.r3,
      C.tp,
      C.tpHit,
      "TP 1:3",
      hits.tp3
    );
  }, [selectedSignal, levelHits]);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/30">
      <div ref={containerRef} className="w-full" />
      {selectedSignal ? (
        <div className="border-t border-zinc-800/60 px-4 py-2 text-xs text-zinc-600">
          Gráfico y mark price sincronizados cada 1s · HIT al tocar SL/TP
        </div>
      ) : (
        <div className="border-t border-zinc-800/60 px-4 py-2 text-xs text-zinc-600">
          Vela activa + línea Live · actualización cada 1s
        </div>
      )}
    </div>
  );
}
