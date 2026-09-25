"use client";

import { useMemo, useState } from "react";
import { INTERVALS } from "@/lib/intervals";
import { detectSignals } from "@/lib/patterns";
import { computeStats, type SignalStats } from "@/lib/stats";
import type { History } from "@/hooks/useHistory";
import type { Candle, Interval } from "@/lib/types";

/** Negativas en el backtest aun con filtros: la comisión pesa demasiado en R */
const FEE_HEAVY: Interval[] = ["1m", "3m"];

const LABELS: Record<Interval, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1D",
};

type PatternFilter = "ALL" | "TS" | "SWEEP";

const FILTERS: { id: PatternFilter; label: string }[] = [
  { id: "ALL", label: "Todas" },
  { id: "TS", label: "Solo TS" },
  { id: "SWEEP", label: "Solo barridos" },
];

type Preset = "ALL" | "CHART" | "NONE" | "CUSTOM";

const PRESETS: { id: Exclude<Preset, "CUSTOM">; label: string }[] = [
  { id: "ALL", label: "Todas" },
  { id: "CHART", label: "Solo gráfico" },
  { id: "NONE", label: "Ninguna" },
];

const SEGMENTED = "flex gap-1 rounded-pill bg-sink p-1";

function segmentClass(active: boolean) {
  return `rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
    active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
  }`;
}

const EYEBROW =
  "font-mono text-xs font-medium uppercase tracking-[0.12em] text-faint";

function formatSpan(candles: Candle[]) {
  if (candles.length < 2) return "—";
  const ms = candles[candles.length - 1].closeTime - candles[0].openTime;
  const hours = ms / 3_600_000;
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = hours / 24;
  if (days < 60) return `${Math.round(days)} d`;
  return `${(days / 30).toFixed(1)} meses`;
}

function sumStats(rows: SignalStats[]): SignalStats {
  const total = rows.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      active: acc.active + s.active,
      closed: acc.closed + s.closed,
      sl: acc.sl + s.sl,
      be: acc.be + s.be,
      r1: acc.r1 + s.r1,
      r2: acc.r2 + s.r2,
      r3: acc.r3 + s.r3,
      rMore: acc.rMore + s.rMore,
      winRate: null,
      grossR: acc.grossR + s.grossR,
      feesR: acc.feesR + s.feesR,
      netR: acc.netR + s.netR,
    }),
    {
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
    } as SignalStats
  );
  const wins = total.r1 + total.r2 + total.r3 + total.rMore;
  total.winRate = total.closed > 0 ? (wins / total.closed) * 100 : null;
  return total;
}

function formatR(r: number) {
  const rounded = Math.round(r * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}R`;
}

function StatCells({ stats }: { stats: SignalStats }) {
  const num = (n: number, tone = "text-ink") => (
    <td className={`px-3 py-2.5 text-right tabular-nums ${n === 0 ? "text-faint" : tone}`}>
      {n}
    </td>
  );

  return (
    <>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink">
        {stats.total}
        {stats.active > 0 && (
          <span className="text-faint"> ({stats.active} act.)</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-ink">
        {stats.winRate == null ? "—" : `${stats.winRate.toFixed(1)}%`}
      </td>
      {num(stats.sl, "text-negative")}
      {num(stats.be, "text-muted")}
      {num(stats.r1, "text-positive")}
      {num(stats.r2, "text-positive")}
      {num(stats.r3, "text-positive")}
      {num(stats.rMore, "text-positive")}
      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
        {formatR(stats.grossR)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
        −{stats.feesR.toFixed(1)}R
      </td>
      <td
        className={`px-3 py-2.5 text-right tabular-nums font-medium ${
          stats.netR > 0.05
            ? "text-positive"
            : stats.netR < -0.05
              ? "text-negative"
              : "text-muted"
        }`}
      >
        {formatR(stats.netR)}
      </td>
    </>
  );
}

/**
 * La temporalidad del gráfico siempre está incluida; el resto se agrega a mano
 * y se mantiene al cambiar de gráfico.
 */
export default function StatsTable({
  chartInterval,
  history,
}: {
  chartInterval: Interval;
  /** Histórico compartido con las recomendaciones (1500 velas por TF) */
  history: History;
}) {
  // null = "Solo gráfico": sigue a la temporalidad del gráfico al cambiarla.
  // Un array = selección fija (Todas, Ninguna o personalizada).
  const [custom, setCustom] = useState<Interval[] | null>(null);
  const [filter, setFilter] = useState<PatternFilter>("ALL");

  const selected = useMemo(
    () => (custom ? INTERVALS.filter((i) => custom.includes(i)) : [chartInterval]),
    [chartInterval, custom]
  );

  const preset: Preset =
    custom == null
      ? "CHART"
      : selected.length === INTERVALS.length
        ? "ALL"
        : selected.length === 0
          ? "NONE"
          : "CUSTOM";

  const applyPreset = (p: Exclude<Preset, "CUSTOM">) =>
    setCustom(p === "CHART" ? null : p === "ALL" ? [...INTERVALS] : []);

  const toggle = (tf: Interval) =>
    setCustom(
      selected.includes(tf)
        ? selected.filter((i) => i !== tf)
        : [...selected, tf]
    );


  const rows = useMemo(
    () =>
      selected.map((tf) => {
        const candles = history[tf];
        if (!candles) return { tf, candles: null, stats: null };
        const signals = detectSignals(candles, tf).filter((s) =>
          filter === "ALL"
            ? true
            : filter === "TS"
              ? s.pattern === "TURTLE_SOUP"
              : s.pattern === "SWEEP"
        );
        return { tf, candles, stats: computeStats(signals, candles) };
      }),
    [selected, history, filter]
  );

  const loaded = rows.filter((r) => r.stats != null);
  const total = loaded.length > 1 ? sumStats(loaded.map((r) => r.stats!)) : null;

  const th = "px-3 py-2.5 text-right font-medium";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={SEGMENTED} role="group" aria-label="Selección rápida">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => applyPreset(p.id)}
                className={segmentClass(preset === p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "CUSTOM" && (
            <span className="font-mono text-xs text-faint">Personalizado</span>
          )}
        </div>
        <div className={SEGMENTED} role="group" aria-label="Patrón">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={segmentClass(filter === f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Temporalidades">
          {INTERVALS.map((tf) => {
            const on = selected.includes(tf);
            const isChart = tf === chartInterval;
            return (
              <button
                key={tf}
                type="button"
                aria-pressed={on}
                title={isChart ? "Temporalidad del gráfico" : undefined}
                onClick={() => toggle(tf)}
                className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-mono text-sm transition-colors ${
                  on
                    ? "bg-accent-wash text-accent-press"
                    : "border border-line text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                {on ? "✓ " : ""}
                {LABELS[tf]}
                {isChart && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-accent"
                    aria-label="gráfico"
                  />
                )}
              </button>
            );
          })}
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[900px] border-collapse font-mono text-sm">
          <thead className="bg-sink">
            <tr className={EYEBROW}>
              <th className="px-3 py-2.5 text-left font-medium">TF</th>
              <th className="px-3 py-2.5 text-left font-medium">Muestra</th>
              <th className={th}>Señales</th>
              <th className={th}>Win rate</th>
              <th className={th}>SL</th>
              <th className={th}>BE</th>
              <th className={th}>1:1</th>
              <th className={th}>1:2</th>
              <th className={th}>1:3</th>
              <th className={th}>&gt;1:3</th>
              <th className={th}>R bruto</th>
              <th className={th}>Comis.</th>
              <th className={th}>R neto</th>
            </tr>
          </thead>
          <tbody>
            {selected.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center font-sans text-muted">
                  Elegí al menos una temporalidad.
                </td>
              </tr>
            )}
            {rows.map(({ tf, candles, stats }) => (
              <tr key={tf} className="border-t border-line">
                <td className="px-3 py-2.5 font-medium text-ink">
                  {LABELS[tf]}
                  {FEE_HEAVY.includes(tf) && (
                    <span
                      className="ml-1.5 font-sans text-xs font-normal text-faint"
                      title={`En ${LABELS[tf]} el SL es tan corto que las comisiones se comen la ventaja: no recomendado`}
                    >
                      ⚠ comis.
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  {candles ? formatSpan(candles) : "…"}
                </td>
                {stats ? (
                  <StatCells stats={stats} />
                ) : (
                  <td colSpan={11} className="px-3 py-2.5 text-center font-sans text-faint">
                    Cargando…
                  </td>
                )}
              </tr>
            ))}
            {total && (
              <tr className="border-t-2 border-line-strong bg-sink font-medium">
                <td className="px-3 py-2.5 text-ink" colSpan={2}>
                  Total
                </td>
                <StatCells stats={total} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-faint">
        Últimas 1500 velas por temporalidad, con el stop escalonado: SL = −1R,
        BE = 0, 1:n = cerró asegurando n R. Win rate = cerradas con +1R o más
        sobre el total de cerradas (las activas no cuentan). R neto descuenta
        comisiones taker de 0.05% por lado (entrada y salida a mercado); con
        órdenes límite (maker 0.02%) el resultado mejora. Sin slippage ni
        funding. Simulación sobre velas reales, entrada al cierre. Se actualiza
        cada 2 minutos.
      </p>
    </div>
  );
}
