"use client";

import { useEffect, useMemo, useState } from "react";
import PriceChart from "@/components/PriceChart";
import { useMarketStream } from "@/hooks/useMarketStream";
import { ui as UI } from "@/lib/colors";
import {
  computeSignalResolution,
  outcomeLabel,
  type SignalResolution,
} from "@/lib/hits";
import { signalKey } from "@/lib/patterns";
import type { Candle, Interval, Signal } from "@/lib/types";

const INTERVALS: Interval[] = ["1m", "5m", "15m"];

function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    second: "2-digit",
  });
}

function patternLabel(pattern: Signal["pattern"]) {
  return pattern === "SWEEP" ? "Barrido" : "Turtle Soup";
}

function LevelTag({
  label,
  price,
  hit,
  kind,
  isOutcome,
}: {
  label: string;
  price: number;
  hit: boolean;
  kind: "sl" | "entry" | "tp";
  isOutcome?: boolean;
}) {
  const muted =
    kind === "sl"
      ? UI.slMuted
      : kind === "entry"
        ? UI.entryMuted
        : UI.tpMuted;
  const active =
    kind === "sl" ? UI.slHit : kind === "tp" ? UI.tpHit : UI.entryMuted;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs ${
        hit && kind !== "entry" ? active : muted
      } ${isOutcome ? "ring-1 ring-zinc-500/40" : ""}`}
    >
      {label} {formatPrice(price)}
      {hit && kind !== "entry" && (
        <span className="text-[10px] font-semibold tracking-wide opacity-90">
          HIT
        </span>
      )}
    </span>
  );
}

function StatusBadge({ resolution }: { resolution: SignalResolution }) {
  if (resolution.status === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80 ring-1 ring-amber-800/30">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400/70" />
        Activa
      </span>
    );
  }

  const outcome = resolution.outcome!;
  const isSl = outcome === "SL";

  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${
        isSl
          ? "bg-rose-950/35 text-rose-400/80 ring-rose-800/30"
          : "bg-teal-950/30 text-teal-400/80 ring-teal-800/25"
      }`}
    >
      Cerrada · {outcomeLabel(outcome)}
    </span>
  );
}

function RiskLevels({
  signal,
  resolution,
}: {
  signal: Signal;
  resolution: SignalResolution;
}) {
  const { hits, outcome } = resolution;

  if (!signal.stopLoss || !signal.takeProfits) {
    return (
      <p className="mt-3 text-xs text-zinc-600">
        SL/TP no calculable (riesgo inválido en esta vela)
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <LevelTag
        label="SL"
        price={signal.stopLoss}
        hit={hits.sl}
        kind="sl"
        isOutcome={outcome === "SL"}
      />
      <LevelTag label="Entry" price={signal.price} hit={false} kind="entry" />
      <LevelTag
        label="TP 1:1"
        price={signal.takeProfits.r1}
        hit={hits.tp1}
        kind="tp"
        isOutcome={outcome === "TP1" || outcome === "TP2" || outcome === "TP3"}
      />
      <LevelTag
        label="TP 1:2"
        price={signal.takeProfits.r2}
        hit={hits.tp2}
        kind="tp"
        isOutcome={outcome === "TP2" || outcome === "TP3"}
      />
      <LevelTag
        label="TP 1:3"
        price={signal.takeProfits.r3}
        hit={hits.tp3}
        kind="tp"
        isOutcome={outcome === "TP3"}
      />
      {signal.riskPercent != null && (
        <span className="self-center text-xs text-zinc-600">
          Riesgo {signal.riskPercent.toFixed(3)}%
        </span>
      )}
    </div>
  );
}

function SignalCard({
  signal,
  resolution,
  selected,
  onSelect,
}: {
  signal: Signal;
  resolution: SignalResolution;
  selected: boolean;
  onSelect: () => void;
}) {
  const isBuy = signal.type === "BUY";
  const isActive = resolution.status === "ACTIVE";
  const isClosed = resolution.status === "CLOSED";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-4 text-left transition-all ${
        selected
          ? "border-zinc-600/50 bg-zinc-800/30 ring-1 ring-zinc-600/30"
          : isActive
            ? "border-amber-900/35 bg-amber-950/10 hover:border-amber-800/40"
            : signal.preview
              ? "border-zinc-700/40 bg-zinc-900/40 hover:border-zinc-600/50"
              : isClosed && resolution.outcome === "SL"
                ? "border-rose-900/20 bg-rose-950/5 opacity-80 hover:opacity-100"
                : isClosed
                  ? "border-teal-900/20 bg-teal-950/5 opacity-80 hover:opacity-100"
                  : isBuy
                    ? `${UI.buyBorder} hover:border-emerald-900/40`
                    : `${UI.sellBorder} hover:border-rose-900/40`
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`text-sm font-semibold uppercase tracking-wide ${
            isBuy ? UI.buyText : UI.sellText
          }`}
        >
          {isBuy ? "Compra" : "Venta"}
          {signal.preview && (
            <span className="ml-2 text-[10px] font-normal normal-case text-zinc-500">
              preview
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {!signal.preview && <StatusBadge resolution={resolution} />}
          <span className="rounded bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-500">
            {patternLabel(signal.pattern)}
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-500">{signal.description}</p>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-zinc-600">
        <span>Cierre: ${formatPrice(signal.price)}</span>
        <span>Nivel: ${formatPrice(signal.level)}</span>
        <span>{formatTime(signal.timestamp)}</span>
      </div>
      <RiskLevels signal={signal} resolution={resolution} />
    </button>
  );
}

function useResolutionMap(
  signals: Signal[],
  candles: Candle[],
  livePrice: number | null
) {
  return useMemo(() => {
    const map = new Map<string, SignalResolution>();
    for (const s of signals) {
      map.set(signalKey(s), computeSignalResolution(s, candles, livePrice));
    }
    return map;
  }, [signals, candles, livePrice]);
}

const EMPTY_RESOLUTION: SignalResolution = {
  status: "ACTIVE",
  outcome: null,
  hits: { sl: false, tp1: false, tp2: false, tp3: false },
};

export default function Dashboard() {
  const [interval, setInterval] = useState<Interval>("5m");
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  const {
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
  } = useMarketStream(interval);

  const resolutionMap = useResolutionMap(signals, candles, price);

  const { activeSignals, closedSignals } = useMemo(() => {
    const active: Signal[] = [];
    const closed: Signal[] = [];
    for (const s of signals) {
      const res = resolutionMap.get(signalKey(s));
      if (res?.status === "CLOSED") closed.push(s);
      else active.push(s);
    }
    return { activeSignals: active, closedSignals: closed };
  }, [signals, resolutionMap]);

  const selectedResolution = useMemo(() => {
    if (!selectedSignal || selectedSignal.preview) return EMPTY_RESOLUTION;
    return resolutionMap.get(signalKey(selectedSignal)) ?? EMPTY_RESOLUTION;
  }, [selectedSignal, resolutionMap]);

  useEffect(() => {
    if (justClosed) {
      setSelectedSignal(justClosed);
    }
  }, [justClosed]);

  useEffect(() => {
    setSelectedSignal((prev) => {
      if (prev) {
        if (prev.preview && preview && prev.timestamp === preview.timestamp) {
          return preview;
        }
        const match = signals.find(
          (s) =>
            s.timestamp === prev.timestamp &&
            s.pattern === prev.pattern &&
            s.type === prev.type
        );
        if (match) return match;
      }
      return signals[0] ?? preview ?? null;
    });
  }, [signals, preview, interval]);

  const previewResolution = preview
    ? computeSignalResolution(preview, candles, price)
    : EMPTY_RESOLUTION;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-amber-700/70">BTCUSDT Perpetual</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-200">
            La Scalpineta
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Barridos de liquidez y Turtle Soup · Binance Futures
          </p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
            connected
              ? "bg-teal-950/25 text-teal-600/70"
              : "bg-zinc-800/50 text-zinc-600"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "animate-pulse bg-teal-600/60" : "bg-zinc-700"
            }`}
          />
          {connected ? "Live · 1s" : "Reconectando..."}
        </div>
      </header>

      {justClosed && (
        <div className="mb-4 rounded-lg border border-amber-900/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/70">
          Nueva señal confirmada — {justClosed.type === "BUY" ? "Compra" : "Venta"}{" "}
          · {patternLabel(justClosed.pattern)} @ ${formatPrice(justClosed.price)}
        </div>
      )}

      <div className="mb-6 flex gap-2">
        {INTERVALS.map((tf) => (
          <button
            key={tf}
            onClick={() => setInterval(tf)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              interval === tf
                ? "bg-amber-900/35 text-amber-200/80"
                : "bg-zinc-800/40 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-400"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/25 p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-600">
            Precio mark · cada 1s
          </p>
          <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-zinc-300">
            {price != null ? `$${formatPrice(price)}` : "—"}
          </p>
        </div>
        {updatedAt > 0 && (
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/25 p-5 text-xs text-zinc-600">
            <p>Actualizado · #{tickCount}</p>
            <p className="mt-1 text-zinc-500">{formatTime(updatedAt)}</p>
          </div>
        )}
      </div>

      {loading && candles.length === 0 && (
        <p className="text-center text-sm text-zinc-600">Cargando...</p>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-rose-900/30 bg-rose-950/15 p-4 text-sm text-rose-400/70">
          {error}
        </div>
      )}

      {candles.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-600">
            Gráfico · {interval}
          </h2>
          <PriceChart
            key={interval}
            candles={candles}
            signals={signals}
            preview={preview}
            selectedSignal={selectedSignal}
            levelHits={selectedResolution.hits}
            livePrice={price}
          />
        </section>
      )}

      {preview && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-600">
            Preview · vela abierta
          </h2>
          <SignalCard
            signal={preview}
            resolution={previewResolution}
            selected={
              selectedSignal?.timestamp === preview.timestamp &&
              selectedSignal.preview === true
            }
            onSelect={() => setSelectedSignal(preview)}
          />
        </section>
      )}

      {latest && !latest.preview && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-600">
            Señal seleccionada
          </h2>
          <SignalCard
            signal={selectedSignal ?? latest}
            resolution={selectedResolution}
            selected
            onSelect={() => setSelectedSignal(latest)}
          />
        </section>
      )}

      {activeSignals.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-700/60">
            Activas ({activeSignals.length})
          </h2>
          <div className="space-y-3">
            {activeSignals.map((signal) => (
              <SignalCard
                key={`${signal.timestamp}-${signal.pattern}-${signal.type}`}
                signal={signal}
                resolution={
                  resolutionMap.get(signalKey(signal)) ?? EMPTY_RESOLUTION
                }
                selected={
                  selectedSignal?.timestamp === signal.timestamp &&
                  selectedSignal.pattern === signal.pattern &&
                  selectedSignal.type === signal.type &&
                  !selectedSignal.preview
                }
                onSelect={() => setSelectedSignal(signal)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-600">
          Cerradas ({closedSignals.length})
        </h2>

        {!loading && signals.length === 0 && !preview && (
          <p className="rounded-lg border border-zinc-800/50 bg-zinc-900/20 p-6 text-center text-sm text-zinc-600">
            Sin señales confirmadas. Esperando cierre de vela...
          </p>
        )}

        {signals.length > 0 && closedSignals.length === 0 && (
          <p className="rounded-lg border border-zinc-800/50 bg-zinc-900/20 p-4 text-center text-sm text-zinc-600">
            Ninguna señal cerrada aún — esperando SL o TP
          </p>
        )}

        <div className="space-y-3">
          {closedSignals.map((signal) => (
            <SignalCard
              key={`${signal.timestamp}-${signal.pattern}-${signal.type}`}
              signal={signal}
              resolution={
                resolutionMap.get(signalKey(signal)) ?? EMPTY_RESOLUTION
              }
              selected={
                selectedSignal?.timestamp === signal.timestamp &&
                selectedSignal.pattern === signal.pattern &&
                selectedSignal.type === signal.type &&
                !selectedSignal.preview
              }
              onSelect={() => setSelectedSignal(signal)}
            />
          ))}
        </div>
      </section>

      <footer className="mt-10 border-t border-zinc-800/60 pt-6 text-xs leading-relaxed text-zinc-700">
        <p>
          Prueba de concepto con fines informativos. No constituye asesoramiento
          financiero ni recomendación de inversión. El uso de esta herramienta
          y cualquier operación derivada es bajo tu propia responsabilidad.
        </p>
        <p className="mt-2 text-zinc-800">
          Activa = sin tocar SL ni TP · Cerrada = primer toque (SL prioriza en
          misma vela).
        </p>
        <p className="mt-4 text-zinc-600">
          Made by{" "}
          <a
            href="https://jgarin.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 underline decoration-zinc-700/60 underline-offset-2 transition-colors hover:text-amber-700/70 hover:decoration-amber-800/40"
          >
            Garincho
          </a>
        </p>
      </footer>
    </div>
  );
}
