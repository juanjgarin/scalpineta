"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { THEME_CHANGE_EVENT } from "@/components/ThemeToggle";
import { readChartPalette, type ChartPalette } from "@/lib/colors";
import type { LevelHits } from "@/lib/hits";
import { chartBarTime } from "@/lib/intervals";
import type { Candle, Interval, Signal } from "@/lib/types";

interface PriceChartProps {
  candles: Candle[];
  /** Temporalidad del gráfico */
  interval: Interval;
  signals: Signal[];
  /** Señales en velas abiertas (⏳), de cualquier temporalidad */
  previews: Signal[];
  selectedSignal: Signal | null;
  levelHits: LevelHits | null;
  /** R asegurados por el stop escalonado (null = SL original) */
  lockedR?: number | null;
  /** Precio del stop vigente */
  activeStop?: number | null;
  livePrice: number | null;
  /** Si la combinación patrón × temporalidad está recomendada ahora */
  isRecommended: (s: Signal) => boolean;
  /** Cambia cuando el usuario pide ver la señal seleccionada: centrarla */
  focusNonce?: number;
  /** Click sobre una vela con marca: selecciona esa señal */
  onSignalClick?: (signal: Signal) => void;
  /** Si hay operación actual, botón para volver a ella */
  onGoToCurrent?: (() => void) | null;
}

const HEIGHT_STORAGE_KEY = "scalpineta:chart-height";
const MIN_HEIGHT = 260;
const MAX_HEIGHT = 1400;
const SIZE_PRESETS = [
  { label: "S", height: 320 },
  { label: "M", height: 460 },
  { label: "L", height: 680 },
] as const;
const DEFAULT_HEIGHT = SIZE_PRESETS[1].height;

function clampHeight(h: number) {
  return Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h)));
}

function toChartTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

/** ✓ = patrón y temporalidad recomendados ahora; ⏳ = vela todavía abierta */
function markerText(s: Signal, recommended: boolean): string {
  const arrow = s.type === "BUY" ? "↑" : "↓";
  const mark = s.preview ? " ⏳" : recommended ? " ✓" : "";
  const label = s.pattern === "TURTLE_SOUP" ? "TS" : s.type === "BUY" ? "COMPRA" : "VENTA";
  return `${label}${mark} ${s.interval}${arrow}`;
}

function markerColor(s: Signal, recommended: boolean, C: ChartPalette): string {
  if (s.preview) return C.markerPreview;
  if (recommended) return C.markerTs;
  return s.type === "BUY" ? C.markerBuy : C.markerSell;
}

/**
 * Marcadores de la temporalidad del gráfico y de otras (TS de 1h en un gráfico
 * de 5m cae en la vela de 5m donde cerró la vela de 1h).
 */
function buildMarkers(
  signals: Signal[],
  previews: Signal[],
  barTimes: Set<number>,
  chartInterval: Interval,
  isRecommended: (s: Signal) => boolean,
  C: ChartPalette
): SeriesMarker<Time>[] {
  if (barTimes.size === 0) return [];

  return [...signals, ...previews]
    .map((s) => ({ s, time: chartBarTime(s, chartInterval) }))
    .filter(({ time }) => barTimes.has(time))
    .sort((a, b) => a.time - b.time)
    .map(({ s, time }) => {
      const isBuy = s.type === "BUY";
      const recommended = isRecommended(s);
      return {
        time: toChartTime(time),
        position: isBuy ? "belowBar" : "aboveBar",
        color: markerColor(s, recommended, C),
        shape: isBuy ? "arrowUp" : "arrowDown",
        text: markerText(s, recommended),
      };
    });
}

/** Velas visibles al abrir; el resto del histórico queda a un scroll/zoom */
const INITIAL_VISIBLE_BARS = 150;

function showRecent(chart: IChartApi, count: number) {
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(0, count - INITIAL_VISIBLE_BARS),
    to: count + 3,
  });
}

function chartOptions(C: ChartPalette) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: C.bg },
      textColor: C.text,
      fontFamily: C.fontFamily,
    },
    grid: {
      vertLines: { color: C.grid },
      horzLines: { color: C.grid },
    },
    rightPriceScale: { borderColor: C.grid },
    timeScale: { borderColor: C.grid },
  };
}

function seriesOptions(C: ChartPalette) {
  return {
    upColor: C.up,
    downColor: C.down,
    wickUpColor: C.up,
    wickDownColor: C.down,
  };
}

/** Re-lee los tokens cuando cambia el tema (sistema o toggle manual) */
function useChartPalette(): ChartPalette | null {
  const [palette, setPalette] = useState<ChartPalette | null>(null);

  useEffect(() => {
    const refresh = () => setPalette(readChartPalette());
    refresh();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refresh);
    window.addEventListener(THEME_CHANGE_EVENT, refresh);
    return () => {
      media.removeEventListener("change", refresh);
      window.removeEventListener(THEME_CHANGE_EVENT, refresh);
    };
  }, []);

  return palette;
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid h-8 min-w-8 place-items-center rounded-pill px-2 font-mono text-xs font-medium transition-colors ${
        active
          ? "bg-accent-wash text-accent-press"
          : "border border-line text-muted hover:border-line-strong hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export default function PriceChart({
  candles,
  interval,
  signals,
  previews,
  selectedSignal,
  levelHits,
  lockedR = null,
  activeStop = null,
  livePrice,
  isRecommended,
  focusNonce = 0,
  onSignalClick,
  onGoToCurrent,
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
  // Señales por vela y datos actuales para los handlers de click/hover, que se
  // suscriben una sola vez al crear el gráfico
  const signalsAtBarRef = useRef<Map<number, Signal[]>>(new Map());
  const candlesRef = useRef<Candle[]>(candles);
  const onSignalClickRef = useRef(onSignalClick);
  const selectedRef = useRef(selectedSignal);

  const palette = useChartPalette();
  const [height, setHeight] = useState<number>(DEFAULT_HEIGHT);
  const [fullscreen, setFullscreen] = useState(false);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
      // localStorage solo existe en el cliente: se lee después de hidratar
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored > 0) setHeight(clampHeight(stored));
    } catch {
      // storage bloqueado: altura por defecto
    }
  }, []);

  const commitHeight = useCallback((h: number) => {
    const next = clampHeight(h);
    setHeight(next);
    try {
      localStorage.setItem(HEIGHT_STORAGE_KEY, String(next));
    } catch {
      // storage bloqueado: la altura dura lo que dure la pestaña
    }
  }, []);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHeight: height };
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setHeight(
      clampHeight(dragRef.current.startHeight + e.clientY - dragRef.current.startY)
    );
  };
  const onDragEnd = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    commitHeight(height);
  };
  const onHandleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") commitHeight(height + 40);
    if (e.key === "ArrowUp") commitHeight(height - 40);
  };

  useEffect(() => {
    // El ancho cambia al entrar/salir: re-encuadrar para no dejar las velas apretadas
    const frame = requestAnimationFrame(() => {
      const count = candleCountRef.current;
      if (chartRef.current && count > 0) showRecent(chartRef.current, count);
    });
    return () => cancelAnimationFrame(frame);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!containerRef.current) return;

    const C = readChartPalette();
    const chart = createChart(containerRef.current, {
      ...chartOptions(C),
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: C.grid,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      ...seriesOptions(C),
      borderVisible: false,
    });

    markersRef.current = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;

    // Señales en la vela clickeada (o en las vecinas, para no exigir puntería)
    const signalsNear = (param: MouseEventParams<Time>) => {
      if (param.time == null) return [];
      const map = signalsAtBarRef.current;
      const exact = map.get((param.time as number) * 1000);
      if (exact?.length) return exact;
      const idx = param.logical;
      if (idx == null) return [];
      for (const offset of [-1, 1]) {
        const bar = candlesRef.current[Math.round(idx) + offset];
        const near = bar ? map.get(bar.openTime) : undefined;
        if (near?.length) return near;
      }
      return [];
    };

    const handleClick = (param: MouseEventParams<Time>) => {
      const found = signalsNear(param);
      if (found.length === 0 || !onSignalClickRef.current) return;
      // Varias señales en la misma vela: cada click pasa a la siguiente
      const current = selectedRef.current;
      const i = current
        ? found.findIndex(
            (x) =>
              x.timestamp === current.timestamp &&
              x.pattern === current.pattern &&
              x.type === current.type
          )
        : -1;
      onSignalClickRef.current(found[(i + 1) % found.length]);
    };

    const container = containerRef.current;
    const handleMove = (param: MouseEventParams<Time>) => {
      container.style.cursor = signalsNear(param).length ? "pointer" : "";
    };

    chart.subscribeClick(handleClick);
    chart.subscribeCrosshairMove(handleMove);

    return () => {
      chart.unsubscribeClick(handleClick);
      chart.unsubscribeCrosshairMove(handleMove);
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
    if (!palette) return;
    chartRef.current?.applyOptions(chartOptions(palette));
    seriesRef.current?.applyOptions(seriesOptions(palette));
    liveLineRef.current?.applyOptions({ color: palette.live });
  }, [palette]);

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

      if (!fittedRef.current) {
        showRecent(chart, candles.length);
        fittedRef.current = true;
      }
    }

    candleCountRef.current = candles.length;
  }, [candles, livePrice]);

  // Mantener actualizados los datos que leen los handlers del gráfico
  useEffect(() => {
    const map = new Map<number, Signal[]>();
    for (const sig of [...signals, ...previews]) {
      const t = chartBarTime(sig, interval);
      map.set(t, [...(map.get(t) ?? []), sig]);
    }
    signalsAtBarRef.current = map;
  }, [signals, previews, interval]);
  useEffect(() => {
    candlesRef.current = candles;
    onSignalClickRef.current = onSignalClick;
    selectedRef.current = selectedSignal;
  });

  // Centrar la señal pedida. Queda pendiente hasta que sus velas estén cargadas
  // (al cambiar de temporalidad el gráfico se monta vacío).
  const pendingFocusRef = useRef(focusNonce > 0);
  useEffect(() => {
    if (focusNonce > 0) pendingFocusRef.current = true;
  }, [focusNonce]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!pendingFocusRef.current || !chart || !selectedSignal) return;
    const time = chartBarTime(selectedSignal, interval);
    const idx = candles.findIndex((c) => c.openTime === time);
    if (idx < 0) return;
    pendingFocusRef.current = false;
    const range = chart.timeScale().getVisibleLogicalRange();
    const half = (range ? range.to - range.from : INITIAL_VISIBLE_BARS) / 2;
    chart.timeScale().setVisibleLogicalRange({ from: idx - half, to: idx + half });
  }, [focusNonce, selectedSignal, candles, interval]);

  // Solo cambia cuando entra/sale una vela, no con cada tick del precio
  const barsKey = `${candles.length}:${candles[0]?.openTime}:${candles[candles.length - 1]?.openTime}`;
  const barTimes = useMemo(
    () => new Set(candles.map((c) => c.openTime)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [barsKey]
  );

  useEffect(() => {
    if (!palette) return;
    markersRef.current?.setMarkers(
      buildMarkers(signals, previews, barTimes, interval, isRecommended, palette)
    );
  }, [signals, previews, barTimes, interval, isRecommended, palette]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || livePrice == null || !palette) return;

    if (!liveLineRef.current) {
      liveLineRef.current = series.createPriceLine({
        price: livePrice,
        color: palette.live,
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: "Live",
      });
    } else {
      liveLineRef.current.applyOptions({ price: livePrice });
    }
  }, [livePrice, palette]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !palette) return;
    const C = palette;

    levelLinesRef.current.forEach((line) => series.removePriceLine(line));
    levelLinesRef.current = [];

    if (!selectedSignal?.stopLoss || !selectedSignal.takeProfits) return;

    const hits = levelHits ?? {
      sl: false,
      tp1: false,
      tp2: false,
      tp3: false,
      trail: false,
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

    if (lockedR != null && activeStop != null) {
      // Stop escalonado: el SL original ya no aplica
      if (lockedR > 0) {
        addLine(selectedSignal.price, C.entry, C.entry, "Entry", false, 2);
      }
      addLine(
        activeStop,
        C.entry,
        C.slHit,
        `SL → ${lockedR === 0 ? "BE" : `+${lockedR}R`}`,
        hits.trail,
        2
      );
    } else {
      addLine(selectedSignal.price, C.entry, C.entry, "Entry", false, 2);
      addLine(
        selectedSignal.stopLoss,
        C.sl,
        C.slHit,
        "SL",
        hits.sl,
        hits.sl ? 0 : 2
      );
    }
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
  }, [selectedSignal, levelHits, lockedR, activeStop, palette]);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-bg p-3 sm:p-6"
          : "relative min-w-0"
      }
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? "Gráfico en pantalla completa" : undefined}
    >
      <div
        className={`flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface ${
          fullscreen ? "min-h-0 flex-1" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <span className="font-mono text-xs text-faint">
            Tocá una marca para ver su SL y TPs
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {onGoToCurrent && (
              <IconButton label="Volver a la operación actual" onClick={onGoToCurrent}>
                ● Operación actual
              </IconButton>
            )}
            <IconButton
              label="Ir a la última vela"
              onClick={() => chartRef.current?.timeScale().scrollToRealTime()}
            >
              Ahora →
            </IconButton>
            <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
            {!fullscreen &&
              SIZE_PRESETS.map((p) => (
                <IconButton
                  key={p.label}
                  label={`Altura ${p.label} (${p.height}px)`}
                  active={height === p.height}
                  onClick={() => commitHeight(p.height)}
                >
                  {p.label}
                </IconButton>
              ))}
            <IconButton
              label={fullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
              active={fullscreen}
              onClick={() => setFullscreen((f) => !f)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                {fullscreen ? (
                  <path d="M5 1v4H1M9 1v4h4M5 13V9H1M9 13V9h4" />
                ) : (
                  <path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" />
                )}
              </svg>
            </IconButton>
          </div>
        </div>
        <div
          ref={containerRef}
          className={`w-full ${fullscreen ? "min-h-0 flex-1" : ""}`}
          style={fullscreen ? undefined : { height }}
        />
        {!fullscreen && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Arrastrar para cambiar la altura del gráfico"
            aria-valuemin={MIN_HEIGHT}
            aria-valuemax={MAX_HEIGHT}
            aria-valuenow={height}
            tabIndex={0}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onKeyDown={onHandleKey}
            onDoubleClick={() => commitHeight(DEFAULT_HEIGHT)}
            className="group flex h-4 cursor-row-resize touch-none items-center justify-center border-t border-line bg-surface hover:bg-sink"
          >
            <span className="h-1 w-10 rounded-full bg-line-strong transition-colors group-hover:bg-accent" />
          </div>
        )}
      </div>
    </div>
  );
}
