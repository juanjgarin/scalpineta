"use client";

import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PriceChart from "@/components/PriceChart";
import StatsTable from "@/components/StatsTable";
import ThemeToggle from "@/components/ThemeToggle";
import { useDailyOpen } from "@/hooks/useDailyOpen";
import { useHistory } from "@/hooks/useHistory";
import { useMarketStream } from "@/hooks/useMarketStream";
import {
  computeSignalResolution,
  EMPTY_RESOLUTION,
  lockedLabel,
  outcomeLabel,
  type SignalResolution,
} from "@/lib/hits";
import { signalKey } from "@/lib/patterns";
import {
  comboKey,
  evaluateCombos,
  MIN_CLOSED,
  MIN_WIN_RATE,
  rankRecommended,
  type ComboEvaluation,
} from "@/lib/recommend";
import type { SignalStats } from "@/lib/stats";
import { DEFAULT_INTERVAL, INTERVALS } from "@/lib/intervals";
import {
  calculatePositionSize,
  DEFAULT_CAPITAL,
  DEFAULT_LEVERAGE,
  MAX_LEVERAGE,
  DEFAULT_RISK_PCT,
  MAX_RISK_PCT,
} from "@/lib/risk";
import type { Interval, PatternType, Signal } from "@/lib/types";

const INTERVAL_LABELS: Record<Interval, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1D",
};

const CAPITAL_STORAGE_KEY = "scalpineta:capital";
const LEVERAGE_STORAGE_KEY = "scalpineta:leverage";
const RISK_STORAGE_KEY = "scalpineta:risk-pct";
const CURRENT_TRADE_STORAGE_KEY = "scalpineta:current-trade";
const RISK_PRESETS = [0.25, 0.5, 1, 2];
/** Caída máxima esperable en una racha mala (backtest + Monte Carlo) */
const RISK_HINTS: Record<number, string> = {
  0.25: "Muy conservador: caída máxima ~5–6% en rachas malas",
  0.5: "Conservador: caída máxima ~10–12% en rachas malas",
  1: "Por defecto: caída máxima ~20% en rachas malas",
  2: "Agresivo: caída máxima ~35–40% en rachas malas",
};

interface Account {
  capital: number;
  leverage: number;
  /** % del capital que se pierde si toca el SL */
  riskPct: number;
}

/** Etiqueta de sección: mono, mayúsculas, tracking amplio (eyebrow Kraken) */
const EYEBROW =
  "font-mono text-xs font-medium uppercase tracking-[0.12em] text-faint";
const CARD = "rounded-card border border-line bg-surface";
const INPUT =
  "mt-2 block w-full rounded-card border border-line bg-bg px-3 py-2 font-mono text-lg tabular-nums text-ink outline-none transition-colors hover:border-line-strong focus:border-accent";
const LEVERAGE_PRESETS = [1, 3, 5, 10, 20, 50];
const BADGE =
  "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-xs font-semibold leading-none";

function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUsd(value: number) {
  return `$${formatPrice(value)}`;
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

/** Evaluación en vivo de cada patrón × temporalidad (win rate, R neto) */
const CombosContext = createContext<Map<string, ComboEvaluation>>(new Map());

function useCombo(signal: Signal): ComboEvaluation | undefined {
  return useContext(CombosContext).get(comboKey(signal.interval, signal.pattern));
}

function shortPattern(pattern: Signal["pattern"]) {
  return pattern === "SWEEP" ? "Barrido" : "TS";
}

function comboSummary(stats: SignalStats) {
  const win = stats.winRate == null ? "—" : `${stats.winRate.toFixed(1)}%`;
  const net = `${stats.netR >= 0 ? "+" : ""}${stats.netR.toFixed(1)}R`;
  return `win rate ${win} en ${stats.closed} operaciones cerradas (${net} neto)`;
}

function PatternBadge({ signal }: { signal: Signal }) {
  const combo = useCombo(signal);
  const tf = INTERVAL_LABELS[signal.interval];
  const label = shortPattern(signal.pattern);

  if (signal.preview) {
    return (
      <span
        className={`${BADGE} border border-dashed border-accent text-accent-press`}
        title={`${label} formándose en ${tf}: la vela sigue abierta y puede invalidarse.`}
      >
        {label}
        <span aria-label="formándose">⏳</span>
        <span className="font-mono font-medium">{tf}</span>
        <span className="font-normal">· formándose</span>
      </span>
    );
  }

  if (combo?.recommended) {
    return (
      <span
        className={`${BADGE} bg-accent-wash text-accent-press`}
        title={`Recomendado: ${label} en ${tf}, ${comboSummary(combo.stats)}.`}
      >
        {label}
        <span aria-label="recomendado">✓</span>
        <span className="font-mono font-medium">{tf}</span>
      </span>
    );
  }

  return (
    <span
      className={`${BADGE} bg-negative-wash text-muted`}
      title={
        combo
          ? `No recomendado ahora: ${comboSummary(combo.stats)}. Si entrás, es bajo tu propio riesgo.`
          : "Evaluando el histórico de esta temporalidad…"
      }
    >
      {label}
      <span className="font-mono font-medium">{tf}</span>
      <span className="font-normal">
        · {combo ? "no recomendado" : "evaluando…"}
      </span>
    </span>
  );
}

function EntryCallout({ signal }: { signal: Signal }) {
  const combo = useCombo(signal);
  const tf = INTERVAL_LABELS[signal.interval];
  const label = shortPattern(signal.pattern);

  if (signal.preview) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-card border border-dashed border-accent px-3 py-2 text-sm text-ink">
        <span aria-hidden="true">⏳</span>
        <span>
          <span className="font-semibold">
            {label} formándose en {tf}
          </span>{" "}
          — la vela sigue abierta y puede invalidarse. Esperá el cierre.
          {combo?.recommended &&
            ` Si confirma, es una combinación recomendada (${comboSummary(combo.stats)}).`}
        </span>
      </p>
    );
  }

  if (!combo) return null;

  if (combo.recommended) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-card border border-accent bg-accent-wash px-3 py-2 text-sm text-ink">
        <span className="font-semibold text-accent-press" aria-hidden="true">
          ✓
        </span>
        <span>
          <span className="font-semibold">
            Recomendado: {label} en {tf}
          </span>{" "}
          — {comboSummary(combo.stats)} en las últimas 1500 velas.
        </span>
      </p>
    );
  }

  return (
    <p className="mt-3 flex items-start gap-2 rounded-card border border-line px-3 py-2 text-sm text-muted">
      <span aria-hidden="true">⚠</span>
      <span>
        <span className="font-semibold text-ink">Bajo tu propio riesgo</span> —{" "}
        {label} en {tf} tiene {comboSummary(combo.stats)}. No llega al mínimo
        recomendado: win rate ≥{MIN_WIN_RATE}%, R neto positivo y al menos{" "}
        {MIN_CLOSED} operaciones.
      </span>
    </p>
  );
}

const CHART_PATTERN_OPTIONS: { id: PatternType; label: string }[] = [
  { id: "TURTLE_SOUP", label: "TS" },
  { id: "SWEEP", label: "Barridos de liquidez" },
];

/** Qué patrones se marcan en el gráfico */
function ChartPatternFilter({
  value,
  onChange,
}: {
  value: PatternType[];
  onChange: (next: PatternType[]) => void;
}) {
  return (
    <fieldset className="mb-3 flex flex-wrap items-center gap-2">
      <legend className={`${EYEBROW} mr-1 float-left`}>Mostrar en el gráfico</legend>
      {CHART_PATTERN_OPTIONS.map((o) => {
        const on = value.includes(o.id);
        return (
          <label
            key={o.id}
            className={`flex cursor-pointer items-center gap-2 rounded-pill border px-3 py-1.5 text-sm transition-colors ${
              on
                ? "border-accent bg-accent-wash text-accent-press"
                : "border-line text-muted hover:border-line-strong"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() =>
                onChange(
                  on ? value.filter((p) => p !== o.id) : [...value, o.id]
                )
              }
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {o.label}
          </label>
        );
      })}
      {value.length === 0 && (
        <span className="text-xs text-faint">Sin patrones: el gráfico no marca señales.</span>
      )}
    </fieldset>
  );
}

/** Aviso principal: qué patrón y temporalidad conviene operar ahora */
function RecommendationPanel({ loading }: { loading: boolean }) {
  const combos = useContext(CombosContext);
  const ranked = rankRecommended(combos);

  return (
    <div className="mb-4 grid gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-ink">Recomendado para entrar ahora</p>
        <p className="font-mono text-xs text-faint">
          por win rate · últimas 1500 velas · se reevalúa cada 2 min
        </p>
      </div>

      {loading && ranked.length === 0 ? (
        <p className="text-sm text-faint">Evaluando temporalidades…</p>
      ) : ranked.length === 0 ? (
        <p className="text-sm text-muted">
          Ninguna combinación cumple el mínimo ahora (win rate ≥{MIN_WIN_RATE}%,
          R neto positivo, {MIN_CLOSED}+ operaciones). Cualquier entrada es bajo
          tu propio riesgo.
        </p>
      ) : (
        <ol className="flex flex-wrap gap-2">
          {ranked.map((c, i) => (
            <li
              key={comboKey(c.interval, c.pattern)}
              className={`${BADGE} bg-accent-wash text-accent-press`}
              title={comboSummary(c.stats)}
            >
              {i === 0 && <span aria-label="mejor">★</span>}
              {shortPattern(c.pattern)} ✓
              <span className="font-mono">{INTERVAL_LABELS[c.interval]}</span>
              <span className="font-mono font-normal">
                · {c.stats.winRate?.toFixed(0)}% · {c.stats.closed} op.
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-muted">
        <span>
          <strong className="font-semibold text-ink">✓</strong> patrón y
          temporalidad recomendados
        </span>
        <span>
          <strong className="font-semibold text-ink">⏳</strong> formándose en la
          vela abierta: esperar el cierre
        </span>
        <span>
          <strong className="font-semibold text-ink">Sin ✓</strong> no
          recomendado: bajo tu propio riesgo
        </span>
      </div>
    </div>
  );
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
  const tone =
    kind === "entry"
      ? "bg-accent-wash text-accent-press"
      : hit && kind === "tp"
        ? "bg-positive-wash text-positive-deep"
        : hit && kind === "sl"
          ? "bg-negative-wash text-ink"
          : "border border-line text-muted";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-mono text-xs tabular-nums ${tone} ${
        isOutcome ? "ring-1 ring-line-strong" : ""
      }`}
    >
      <span className="font-sans font-semibold">{label}</span>
      {formatPrice(price)}
      {hit && kind !== "entry" && (
        <span className="font-sans text-[10px] font-semibold tracking-wide">
          HIT
        </span>
      )}
    </span>
  );
}

function StatusBadge({ resolution }: { resolution: SignalResolution }) {
  if (resolution.status === "ACTIVE" && resolution.secured) {
    return (
      <span className={`${BADGE} bg-positive-wash text-positive-deep`}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        SL en {lockedLabel(resolution.lockedR ?? 0)} · corriendo{" "}
        {resolution.maxR.toFixed(1)}R
      </span>
    );
  }

  if (resolution.status === "ACTIVE") {
    return (
      <span className={`${BADGE} bg-accent-wash text-accent-press`}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        Activa
      </span>
    );
  }

  const isSl = resolution.outcome === "SL";

  return (
    <span
      className={`${BADGE} ${
        isSl
          ? "bg-negative-wash text-muted"
          : "bg-positive-wash text-positive-deep"
      }`}
    >
      Cerrada · {outcomeLabel(resolution)}
      {!isSl && ` · máx ${resolution.maxR.toFixed(1)}R`}
    </span>
  );
}

function PositionSizing({
  signal,
  resolution,
  account,
}: {
  signal: Signal;
  resolution: SignalResolution;
  account: Account;
}) {
  if (!signal.stopLoss) return null;
  const size = calculatePositionSize(
    signal.type,
    account.capital,
    account.leverage,
    account.riskPct,
    signal.price,
    signal.stopLoss
  );
  if (!size) return null;

  const cells: { label: string; value: string; tone?: string }[] = [
    {
      label: `Pérdida máx (${size.riskPercentOfCapital.toFixed(2)}%)`,
      value: `−${formatUsd(size.riskAmount)}`,
      tone: "text-negative",
    },
    resolution.lockedR != null
      ? {
          label: `Asegurado (${lockedLabel(resolution.lockedR)})`,
          value: `+${formatUsd(resolution.lockedR * size.riskAmount)}`,
          tone: "text-positive",
        }
      : {
          label: "Cada 1R",
          value: `+${formatUsd(size.riskAmount)}`,
          tone: "text-positive",
        },
    { label: "Tamaño", value: `${size.quantity.toFixed(4)} BTC` },
    { label: "Nocional", value: formatUsd(size.notional) },
    { label: `Margen ${account.leverage}x`, value: formatUsd(size.margin) },
    {
      label: "Liquidación ≈",
      value: `$${formatPrice(size.liquidationPrice)}`,
      tone: size.liquidatesBeforeStop ? "text-ink font-medium" : undefined,
    },
  ];

  return (
    <div className="mt-3 rounded-card bg-sink px-4 py-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
              {c.label}
            </dt>
            <dd
              className={`mt-0.5 font-mono text-sm tabular-nums ${c.tone ?? "text-ink"}`}
            >
              {c.value}
            </dd>
          </div>
        ))}
      </dl>
      {size.liquidatesBeforeStop && (
        <p className="mt-3 rounded-card border border-line-strong bg-negative-wash px-3 py-2 text-xs text-ink">
          ⚠ Con {account.leverage}x la liquidación llega antes que el SL. Bajá
          el apalancamiento.
        </p>
      )}
      {size.capped && !size.liquidatesBeforeStop && (
        <p className="mt-3 text-xs text-muted">
          Capital × {account.leverage}x no alcanza para arriesgar el{" "}
          {account.riskPct}% completo: el tamaño quedó limitado.
        </p>
      )}
    </div>
  );
}

function RiskLevels({
  signal,
  resolution,
  account,
}: {
  signal: Signal;
  resolution: SignalResolution;
  account: Account;
}) {
  const { hits, outcome, lockedR, activeStop } = resolution;

  if (!signal.stopLoss || !signal.takeProfits) {
    return (
      <p className="mt-3 text-sm text-faint">
        SL/TP no calculable (riesgo inválido en esta vela)
      </p>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <LevelTag
          label={lockedR != null ? `SL → ${lockedLabel(lockedR)}` : "SL"}
          price={activeStop ?? signal.stopLoss}
          hit={hits.sl || hits.trail}
          kind="sl"
          isOutcome={outcome != null}
        />
        <LevelTag label="Entry" price={signal.price} hit={false} kind="entry" />
        <LevelTag
          label="TP 1:1"
          price={signal.takeProfits.r1}
          hit={hits.tp1}
          kind="tp"
          isOutcome={lockedR === 1}
        />
        <LevelTag
          label="TP 1:2"
          price={signal.takeProfits.r2}
          hit={hits.tp2}
          kind="tp"
          isOutcome={lockedR === 2}
        />
        <LevelTag
          label="TP 1:3"
          price={signal.takeProfits.r3}
          hit={hits.tp3}
          kind="tp"
          isOutcome={lockedR === 3}
        />
        {signal.riskPercent != null && (
          <span className="font-mono text-xs text-faint">
            Distancia SL {signal.riskPercent.toFixed(3)}%
          </span>
        )}
      </div>
      <PositionSizing signal={signal} resolution={resolution} account={account} />
    </>
  );
}

interface SignalCardProps {
  signal: Signal;
  resolution: SignalResolution;
  account: Account;
  selected: boolean;
  onSelect: () => void;
  /** Es la operación que el usuario marcó como abierta */
  isCurrent: boolean;
  onSetCurrent: () => void;
}

/** Lo que la tarjeta muestra de la resolución (maxR se ve con 1 decimal) */
function sameResolution(a: SignalResolution, b: SignalResolution) {
  return (
    a.status === b.status &&
    a.outcome === b.outcome &&
    a.lockedR === b.lockedR &&
    a.activeStop === b.activeStop &&
    a.maxR.toFixed(1) === b.maxR.toFixed(1) &&
    a.hits.sl === b.hits.sl &&
    a.hits.tp1 === b.hits.tp1 &&
    a.hits.tp2 === b.hits.tp2 &&
    a.hits.tp3 === b.hits.tp3 &&
    a.hits.trail === b.hits.trail
  );
}

/**
 * Con 1500 velas hay decenas de tarjetas y el precio cambia cada segundo:
 * solo se redibuja una tarjeta si cambió algo que muestra. onSelect y
 * onSetCurrent se ignoran porque siempre actúan sobre la misma señal.
 */
const SignalCard = memo(
  SignalCardView,
  (prev: SignalCardProps, next: SignalCardProps) =>
    prev.signal === next.signal &&
    prev.selected === next.selected &&
    prev.isCurrent === next.isCurrent &&
    prev.account === next.account &&
    sameResolution(prev.resolution, next.resolution)
);

function SignalCardView({
  signal,
  resolution,
  account,
  selected,
  onSelect,
  isCurrent,
  onSetCurrent,
}: SignalCardProps) {
  const isBuy = signal.type === "BUY";
  const isClosed = resolution.status === "CLOSED";

  // Tarjeta clickeable como div (adentro hay otro botón, y no se anidan botones)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      title="Ver SL y TPs en el gráfico"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`w-full cursor-pointer rounded-card border bg-surface p-5 text-left transition-colors sm:p-6 ${
        selected
          ? "border-accent ring-1 ring-accent"
          : "border-line hover:border-line-strong"
      } ${isClosed && !selected ? "opacity-75 hover:opacity-100" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={`font-brand text-[22px] font-bold leading-tight tracking-[-0.5px] ${
              isBuy ? "text-positive" : "text-negative"
            }`}
          >
            {isBuy ? "Compra" : "Venta"}
          </span>
          {signal.preview && (
            <span className={`${BADGE} border border-line-strong text-muted`}>
              Preview
            </span>
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {!signal.preview && <StatusBadge resolution={resolution} />}
          <PatternBadge signal={signal} />
        </div>
      </div>
      <p className="mt-2 text-sm leading-normal text-muted">
        {signal.description}
      </p>
      <EntryCallout signal={signal} />
      <div className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-xs text-faint">
        <span>Cierre ${formatPrice(signal.price)}</span>
        <span>Nivel ${formatPrice(signal.level)}</span>
        {signal.closeStrength != null && (
          <span title="Dónde cerró la vela dentro de su rango (100% = en el extremo a favor) y volumen de la vela de quiebre vs promedio de 20">
            Cierre {Math.round(signal.closeStrength * 100)}%
            {signal.volumeRatio ? ` · Vol ${signal.volumeRatio.toFixed(1)}×` : ""}
          </span>
        )}
        <span>{formatTime(signal.timestamp)}</span>
      </div>
      <RiskLevels signal={signal} resolution={resolution} account={account} />
      {!signal.preview && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isCurrent ? (
            <span className={`${BADGE} bg-accent text-white`}>
              ● Operación actual
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetCurrent();
              }}
              className="rounded-pill border border-accent px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent-wash"
            >
              Establecer como operación actual
            </button>
          )}
          {selected && (
            <span className="font-mono text-xs text-faint">
              SL y TPs marcados en el gráfico
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Señal seleccionada en el gráfico, con acceso directo a marcarla como actual */
function SelectionBar({
  signal,
  isCurrent,
  onSetCurrent,
}: {
  signal: Signal;
  isCurrent: boolean;
  onSetCurrent: () => void;
}) {
  const isBuy = signal.type === "BUY";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className={EYEBROW}>Seleccionada</span>
        <span className={`font-semibold ${isBuy ? "text-positive" : "text-negative"}`}>
          {isBuy ? "Compra" : "Venta"}
        </span>
        <PatternBadge signal={signal} />
        <span className="font-mono text-xs text-muted">
          {formatTime(signal.timestamp)} · entrada ${formatPrice(signal.price)}
          {signal.stopLoss != null && ` · SL ${formatPrice(signal.stopLoss)}`}
        </span>
      </div>
      {signal.preview ? (
        <span className="text-xs text-faint">
          Se está formando: esperá el cierre para poder marcarla.
        </span>
      ) : isCurrent ? (
        <span className={`${BADGE} bg-accent text-white`}>● Operación actual</span>
      ) : (
        <button
          type="button"
          onClick={onSetCurrent}
          className="rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover active:bg-accent-press"
        >
          Establecer como operación actual
        </button>
      )}
    </div>
  );
}

/** Operación que el usuario marcó como abierta, con resultado en vivo */
function CurrentTradePanel({
  trade,
  resolution,
  price,
  account,
  onFocus,
  onClear,
}: {
  trade: Signal;
  resolution: SignalResolution;
  price: number | null;
  account: Account;
  onFocus: () => void;
  onClear: () => void;
}) {
  const isBuy = trade.type === "BUY";
  const risk = trade.stopLoss != null ? Math.abs(trade.price - trade.stopLoss) : 0;
  const size =
    trade.stopLoss != null
      ? calculatePositionSize(
          trade.type,
          account.capital,
          account.leverage,
          account.riskPct,
          trade.price,
          trade.stopLoss
        )
      : null;
  const closed = resolution.status === "CLOSED";
  // Abierta: resultado flotante al precio actual. Cerrada: lo que cobró el stop.
  const r = closed
    ? resolution.outcome === "SL"
      ? -1
      : (resolution.lockedR ?? 0)
    : price != null && risk > 0
      ? ((isBuy ? price - trade.price : trade.price - price) / risk)
      : null;
  const usd = r != null && size ? r * size.riskAmount : null;
  const tone =
    r == null ? "text-ink" : r > 0 ? "text-positive" : r < 0 ? "text-negative" : "text-muted";
  const stopLabel =
    resolution.lockedR == null
      ? "SL"
      : resolution.lockedR === 0
        ? "SL en BE"
        : `SL en +${resolution.lockedR}R`;

  const cells: { label: string; value: string; tone?: string }[] = [
    { label: "Entrada", value: `${formatPrice(trade.price)}` },
    {
      label: `Stop vigente (${stopLabel})`,
      value:
        resolution.activeStop != null
          ? `${formatPrice(resolution.activeStop)}`
          : trade.stopLoss != null
            ? `${formatPrice(trade.stopLoss)}`
            : "—",
    },
    { label: "Precio", value: price != null ? `${formatPrice(price)}` : "—" },
    {
      label: closed ? "Resultado" : "Resultado en vivo",
      value:
        r == null
          ? "—"
          : `${r > 0 ? "+" : ""}${r.toFixed(2)}R${
              usd != null ? ` · ${usd >= 0 ? "+" : "−"}${formatUsd(Math.abs(usd))}` : ""
            }`,
      tone,
    },
    { label: "Máximo alcanzado", value: `${resolution.maxR.toFixed(1)}R` },
  ];

  return (
    <section
      aria-label="Operación actual"
      className="mt-6 rounded-card border-2 border-accent bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={EYEBROW}>Operación actual</span>
          <span
            className={`font-brand text-lg font-bold ${isBuy ? "text-positive" : "text-negative"}`}
          >
            {isBuy ? "Compra" : "Venta"}
          </span>
          <PatternBadge signal={trade} />
          <StatusBadge resolution={resolution} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onFocus}
            className="rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover active:bg-accent-press"
          >
            Ver en gráfico
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-pill px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-sink hover:text-ink"
          >
            Quitar
          </button>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">
              {c.label}
            </dt>
            <dd className={`mt-0.5 font-mono text-sm tabular-nums ${c.tone ?? "text-ink"}`}>
              {c.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-faint">
        Simulado con la entrada de la señal ({formatTime(trade.timestamp)},{" "}
        {INTERVAL_LABELS[trade.interval]}) y tu riesgo de {account.riskPct}%. Si
        entraste a otro precio, el resultado real puede diferir.
      </p>
    </section>
  );
}

function readStored<T>(key: string, parse: (raw: string) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? null : parse(raw);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage bloqueado: el valor solo vive en esta sesión
  }
}

const isValidCapital = (n: number) => Number.isFinite(n) && n > 0;
const isValidLeverage = (n: number) =>
  Number.isInteger(n) && n >= 1 && n <= MAX_LEVERAGE;

const isValidRisk = (n: number) =>
  Number.isFinite(n) && n > 0 && n <= MAX_RISK_PCT;

const DEFAULT_ACCOUNT: Account = {
  capital: DEFAULT_CAPITAL,
  leverage: DEFAULT_LEVERAGE,
  riskPct: DEFAULT_RISK_PCT,
};

/**
 * Capital, apalancamiento y riesgo se editan como borrador y solo impactan en
 * las señales al tocar "Aplicar" (o Enter). Solo cambian montos en USDT:
 * entradas, SL/TP y estadísticas en R no dependen de esto.
 */
function AccountForm({
  account,
  onApply,
}: {
  account: Account;
  onApply: (next: Account) => void;
}) {
  const [capitalDraft, setCapitalDraft] = useState(String(account.capital));
  const [leverageDraft, setLeverageDraft] = useState(String(account.leverage));
  const [riskDraft, setRiskDraft] = useState(String(account.riskPct));
  const [syncedAccount, setSyncedAccount] = useState(account);

  // Si la cuenta cambia desde afuera (lectura de localStorage), reflejarla
  if (syncedAccount !== account) {
    setSyncedAccount(account);
    setCapitalDraft(String(account.capital));
    setLeverageDraft(String(account.leverage));
    setRiskDraft(String(account.riskPct));
  }

  const capital = Number(capitalDraft);
  const leverage = Number(leverageDraft);
  const riskPct = Number(riskDraft);
  const capitalOk = isValidCapital(capital);
  const leverageOk = isValidLeverage(leverage);
  const riskOk = isValidRisk(riskPct);
  const dirty =
    capital !== account.capital ||
    leverage !== account.leverage ||
    riskPct !== account.riskPct;
  const canApply = capitalOk && leverageOk && riskOk && dirty;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canApply) onApply({ capital, leverage, riskPct });
  };

  const reset = () => {
    setCapitalDraft(String(DEFAULT_CAPITAL));
    setLeverageDraft(String(DEFAULT_LEVERAGE));
    setRiskDraft(String(DEFAULT_RISK_PCT));
  };

  return (
    <form onSubmit={submit} className={`${CARD} p-6`} noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={EYEBROW}>Capital (USDT)</span>
          <input
            type="number"
            min={1}
            step="any"
            inputMode="decimal"
            value={capitalDraft}
            onChange={(e) => setCapitalDraft(e.target.value)}
            aria-invalid={!capitalOk}
            className={`${INPUT} ${capitalOk ? "" : "border-negative"}`}
          />
        </label>
        <label className="block">
          <span className={EYEBROW}>Apalancamiento</span>
          <div className="relative">
            <input
              type="number"
              min={1}
              max={MAX_LEVERAGE}
              step={1}
              inputMode="numeric"
              value={leverageDraft}
              onChange={(e) => setLeverageDraft(e.target.value)}
              aria-invalid={!leverageOk}
              className={`${INPUT} pr-8 ${leverageOk ? "" : "border-negative"}`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 mt-1 -translate-y-1/2 font-mono text-muted">
              x
            </span>
          </div>
        </label>
        <label className="block">
          <span className={EYEBROW}>Riesgo</span>
          <div className="relative">
            <input
              type="number"
              min={0.05}
              max={MAX_RISK_PCT}
              step={0.05}
              inputMode="decimal"
              value={riskDraft}
              onChange={(e) => setRiskDraft(e.target.value)}
              aria-invalid={!riskOk}
              className={`${INPUT} pr-8 ${riskOk ? "" : "border-negative"}`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 mt-1 -translate-y-1/2 font-mono text-muted">
              %
            </span>
          </div>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Riesgo y apalancamiento rápido">
        {RISK_PRESETS.map((r) => (
          <button
            key={`r${r}`}
            type="button"
            onClick={() => setRiskDraft(String(r))}
            title={RISK_HINTS[r]}
            className={`rounded-pill px-2.5 py-1 font-mono text-xs transition-colors ${
              riskPct === r
                ? "bg-accent-wash text-accent-press"
                : "border border-line text-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {r}%{r === DEFAULT_RISK_PCT ? " ★" : ""}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {LEVERAGE_PRESETS.map((lev) => (
          <button
            key={lev}
            type="button"
            onClick={() => setLeverageDraft(String(lev))}
            className={`rounded-pill px-2.5 py-1 font-mono text-xs transition-colors ${
              leverage === lev
                ? "bg-accent-wash text-accent-press"
                : "border border-line text-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {lev}x
          </button>
        ))}
      </div>

      {(!capitalOk || !leverageOk || !riskOk) && (
        <p className="mt-3 text-xs text-ink" role="alert">
          {!capitalOk && "El capital tiene que ser mayor a 0. "}
          {!leverageOk && `El apalancamiento va de 1x a ${MAX_LEVERAGE}x, entero. `}
          {!riskOk && `El riesgo va de más de 0% a ${MAX_RISK_PCT}%.`}
        </p>
      )}
      {riskOk && riskPct > 1 && (
        <p className="mt-3 text-xs text-muted">
          ⚠ Con {riskPct}% una racha mala normal (11–16 pérdidas seguidas con
          win rate ~35%) puede bajar la cuenta ~{riskPct >= 2 ? "35–40" : "20–35"}%.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!canApply}
          className="rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover active:bg-accent-press disabled:cursor-not-allowed disabled:opacity-45"
        >
          Aplicar
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-pill px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-sink hover:text-ink"
        >
          Volver a {DEFAULT_CAPITAL} · {DEFAULT_LEVERAGE}x · {DEFAULT_RISK_PCT}%
        </button>
        {dirty && canApply && (
          <span className="font-mono text-xs text-faint">Cambios sin aplicar</span>
        )}
      </div>

      <p className="mt-3 text-sm text-muted">
        Aplicado: <span className="font-mono text-ink">{formatUsd(account.capital)}</span>{" "}
        · <span className="font-mono text-ink">{account.leverage}x</span> · riesgo{" "}
        {account.riskPct}% ={" "}
        <span className="font-mono text-ink">
          {formatUsd((account.capital * account.riskPct) / 100)}
        </span>{" "}
        por entrada
      </p>
    </form>
  );
}

function SectionTitle({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <h2 className="mb-4 flex items-baseline gap-2 font-brand text-[22px] font-bold leading-tight tracking-[-0.5px] text-ink">
      {children}
      {count != null && (
        <span className="font-mono text-sm font-normal tracking-normal text-faint">
          {count}
        </span>
      )}
    </h2>
  );
}

export default function Dashboard() {
  const [interval, setInterval] = useState<Interval>(DEFAULT_INTERVAL);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [account, setAccount] = useState<Account>(DEFAULT_ACCOUNT);
  const [currentTrade, setCurrentTrade] = useState<Signal | null>(null);
  /** Cambia cuando el usuario pide ver una señal: el gráfico se desplaza a ella */
  const [focusNonce, setFocusNonce] = useState(0);
  const chartSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const trade = readStored(CURRENT_TRADE_STORAGE_KEY, (raw) => {
      const parsed = JSON.parse(raw) as Signal;
      return parsed && typeof parsed.timestamp === "number" ? parsed : null;
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (trade) setCurrentTrade(trade);
  }, []);

  useEffect(() => {
    const capital = readStored(CAPITAL_STORAGE_KEY, Number);
    const leverage = readStored(LEVERAGE_STORAGE_KEY, Number);
    const riskPct = readStored(RISK_STORAGE_KEY, Number);
    // localStorage solo existe en el cliente: se lee después de hidratar
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccount({
      capital:
        capital != null && isValidCapital(capital) ? capital : DEFAULT_CAPITAL,
      leverage:
        leverage != null && isValidLeverage(leverage)
          ? leverage
          : DEFAULT_LEVERAGE,
      riskPct:
        riskPct != null && isValidRisk(riskPct) ? riskPct : DEFAULT_RISK_PCT,
    });
  }, []);

  const applyAccount = (next: Account) => {
    setAccount(next);
    writeStored(CAPITAL_STORAGE_KEY, String(next.capital));
    writeStored(LEVERAGE_STORAGE_KEY, String(next.leverage));
    writeStored(RISK_STORAGE_KEY, String(next.riskPct));
  };

  const {
    candles,
    price,
    signals,
    preview,
    connected,
    loading,
    error,
    updatedAt,
    justClosed,
  } = useMarketStream(interval);

  const dailyOpen = useDailyOpen();

  const history = useHistory(INTERVALS);
  const combos = useMemo(() => evaluateCombos(history), [history]);
  const isRecommendedSignal = useMemo(
    () => (s: Signal) =>
      !s.preview && combos.get(comboKey(s.interval, s.pattern))?.recommended === true,
    [combos]
  );

  // Título de la pestaña: "BTCUSDT.P 83,649.04 (-1.2%)"
  useEffect(() => {
    if (price == null) return;
    let title = `BTCUSDT.P ${formatPrice(price)}`;
    if (dailyOpen) {
      const change = ((price - dailyOpen) / dailyOpen) * 100;
      title += ` (${change >= 0 ? "+" : ""}${change.toFixed(1)}%)`;
    }
    document.title = title;
  }, [price, dailyOpen]);

  const allSignals = signals;
  const previews = useMemo(() => (preview ? [preview] : []), [preview]);

  // Filtro solo del gráfico: las listas y estadísticas siguen mostrando todo
  const [chartPatterns, setChartPatterns] = useState<PatternType[]>([
    "TURTLE_SOUP",
    "SWEEP",
  ]);
  const chartSignals = useMemo(
    () => allSignals.filter((s) => chartPatterns.includes(s.pattern)),
    [allSignals, chartPatterns]
  );
  const chartPreviews = useMemo(
    () => previews.filter((s) => chartPatterns.includes(s.pattern)),
    [previews, chartPatterns]
  );

  const resolutionMap = useMemo(() => {
    const map = new Map<string, SignalResolution>();
    for (const s of signals) {
      map.set(signalKey(s), computeSignalResolution(s, candles, price));
    }
    return map;
  }, [signals, candles, price]);

  const { activeSignals, closedSignals } = useMemo(() => {
    const active: Signal[] = [];
    const closed: Signal[] = [];
    for (const s of allSignals) {
      const res = resolutionMap.get(signalKey(s));
      if (res?.status === "CLOSED") closed.push(s);
      else active.push(s);
    }
    return { activeSignals: active, closedSignals: closed };
  }, [allSignals, resolutionMap]);

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
      const find = (target: Signal | null) => {
        if (!target) return undefined;
        const key = signalKey(target);
        return (
          allSignals.find((s) => signalKey(s) === key) ??
          previews.find((s) => signalKey(s) === key)
        );
      };
      // Mantener la selección; si no está, la operación actual; si no, la última
      return find(prev) ?? find(currentTrade) ?? allSignals[0] ?? previews[0] ?? null;
    });
  }, [allSignals, previews, currentTrade]);

  const selectedKey = selectedSignal ? signalKey(selectedSignal) : null;
  const currentKey = currentTrade ? signalKey(currentTrade) : null;

  /** Seleccionar desde una tarjeta: subir al gráfico y centrar la señal */
  const focusSignal = (signal: Signal) => {
    setSelectedSignal(signal);
    setFocusNonce((n) => n + 1);
    chartSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setAsCurrent = (signal: Signal) => {
    setCurrentTrade(signal);
    writeStored(CURRENT_TRADE_STORAGE_KEY, JSON.stringify(signal));
    focusSignal(signal);
  };

  const clearCurrent = () => {
    setCurrentTrade(null);
    try {
      window.localStorage.removeItem(CURRENT_TRADE_STORAGE_KEY);
    } catch {
      // storage bloqueado
    }
  };

  const viewCurrent = () => {
    if (!currentTrade) return;
    if (currentTrade.interval !== interval) setInterval(currentTrade.interval);
    focusSignal(currentTrade);
  };

  // La operación actual se evalúa con las velas de su temporalidad
  const currentResolution = useMemo(() => {
    if (!currentTrade) return EMPTY_RESOLUTION;
    const source =
      currentTrade.interval === interval
        ? candles
        : (history[currentTrade.interval] ?? []);
    return computeSignalResolution(currentTrade, source, price);
  }, [currentTrade, interval, candles, history, price]);
  const latest = allSignals[0] ?? null;

  const renderList = (list: Signal[]) => (
    <div className="grid gap-4">
      {list.map((signal) => (
        <SignalCard
          key={signalKey(signal)}
          account={account}
          signal={signal}
          resolution={
            signal.preview
              ? EMPTY_RESOLUTION
              : (resolutionMap.get(signalKey(signal)) ?? EMPTY_RESOLUTION)
          }
          selected={selectedKey === signalKey(signal)}
          onSelect={() => focusSignal(signal)}
          isCurrent={currentKey === signalKey(signal)}
          onSetCurrent={() => setAsCurrent(signal)}
        />
      ))}
    </div>
  );

  return (
    <CombosContext.Provider value={combos}>
    <div className="mx-auto w-full max-w-[1200px] px-5 pb-24 pt-8 sm:px-10 sm:pt-12">
      <header className="grid gap-6 border-b border-line pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-accent">
              BTCUSDT Perpetual · Binance Futures
            </p>
            <h1 className="mt-3 flex items-center gap-3 font-brand text-[34px] font-bold leading-[1.17] tracking-[-1px] text-ink sm:text-5xl">
              <span>La Scalpineta</span>
              <span className="text-3xl leading-none" aria-hidden="true">
                🧉🇦🇷
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`${BADGE} ${
                connected
                  ? "bg-positive-wash text-positive-deep"
                  : "bg-negative-wash text-muted"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full bg-current ${
                  connected ? "animate-pulse" : ""
                }`}
              />
              {connected ? "Live · 3s" : "Reconectando..."}
            </span>
            <ThemeToggle />
          </div>
        </div>
        <p className="max-w-[62ch] text-muted">
          Barridos de liquidez y Turtle Soup. El{" "}
          <strong className="font-semibold text-ink">✓</strong> marca las
          combinaciones de patrón y temporalidad recomendadas por win rate,
          evaluadas en vivo; <strong className="font-semibold text-ink">⏳</strong>{" "}
          es una señal que todavía se está formando. Cada entrada arriesga el{" "}
          {account.riskPct}% del capital (editable) y el stop sube un escalón
          por cada R ganado: 1R → BE, 2R → +1R, 3R → +2R…
        </p>
      </header>

      {justClosed && (
        <div
          role="status"
          className="mt-6 flex flex-wrap items-center gap-2 rounded-card border border-accent bg-accent-wash px-4 py-3 text-sm text-ink"
        >
          <span className="font-semibold">Nueva señal confirmada</span>
          <span className="text-muted">
            {justClosed.type === "BUY" ? "Compra" : "Venta"} ·{" "}
            {shortPattern(justClosed.pattern)}
            {isRecommendedSignal(justClosed) ? " ✓ " : " "}
            {INTERVAL_LABELS[justClosed.interval]}
            {isRecommendedSignal(justClosed) ? " (recomendado)" : " (bajo tu propio riesgo)"}{" "}
            @ <span className="font-mono">${formatPrice(justClosed.price)}</span>
          </span>
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_1.7fr_0.9fr]">
        <div className={`${CARD} p-6`}>
          <p className={EYEBROW}>Precio mark · cada 1s</p>
          <p className="mt-2 font-mono text-4xl font-medium tabular-nums text-ink">
            {price != null ? `$${formatPrice(price)}` : "—"}
          </p>
        </div>
        <AccountForm account={account} onApply={applyAccount} />
        <div className={`${CARD} p-6`}>
          <p className={EYEBROW}>Actualizado</p>
          <p className="mt-2 font-mono text-lg tabular-nums text-ink">
            {updatedAt > 0 ? formatTime(updatedAt) : "—"}
          </p>
        </div>
      </div>

      {currentTrade && (
        <CurrentTradePanel
          trade={currentTrade}
          resolution={currentResolution}
          price={price}
          account={account}
          onFocus={viewCurrent}
          onClear={clearCurrent}
        />
      )}

      <div className="mt-6">
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Temporalidad"
        >
          {INTERVALS.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={interval === tf}
              onClick={() => setInterval(tf)}
              className={`rounded-pill px-4 py-2.5 font-mono text-sm font-medium transition-colors ${
                interval === tf
                  ? "bg-accent text-white hover:bg-accent-hover active:bg-accent-press"
                  : "border border-line text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {INTERVAL_LABELS[tf]}
            </button>
          ))}
        </div>
      </div>

      {loading && candles.length === 0 && (
        <p className="mt-8 text-center text-sm text-faint">Cargando...</p>
      )}

      {error && (
        <div className="mt-6 rounded-card border border-line-strong bg-negative-wash p-4 text-sm text-ink">
          {error}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-16">
        {candles.length > 0 && (
          <section ref={chartSectionRef} className="scroll-mt-4">
            <SectionTitle>Gráfico · {INTERVAL_LABELS[interval]}</SectionTitle>
            <RecommendationPanel
              loading={Object.keys(history).length < INTERVALS.length}
            />
            <ChartPatternFilter
              value={chartPatterns}
              onChange={setChartPatterns}
            />
            <PriceChart
              key={interval}
              interval={interval}
              candles={candles}
              signals={chartSignals}
              previews={chartPreviews}
              selectedSignal={selectedSignal}
              levelHits={selectedResolution.hits}
              lockedR={selectedResolution.lockedR}
              activeStop={selectedResolution.activeStop}
              livePrice={price}
              isRecommended={isRecommendedSignal}
              focusNonce={focusNonce}
              onSignalClick={setSelectedSignal}
              onGoToCurrent={currentTrade ? viewCurrent : null}
            />
            {selectedSignal && (
              <SelectionBar
                signal={selectedSignal}
                isCurrent={currentKey === signalKey(selectedSignal)}
                onSetCurrent={() => setAsCurrent(selectedSignal)}
              />
            )}
          </section>
        )}

        <section>
          <SectionTitle>Estadísticas por temporalidad</SectionTitle>
          <StatsTable chartInterval={interval} history={history} />
        </section>

        {previews.length > 0 && (
          <section>
            <SectionTitle>Formándose · vela abierta</SectionTitle>
            {renderList(previews)}
          </section>
        )}

        {latest && selectedSignal && !selectedSignal.preview && (
          <section>
            <SectionTitle>Señal seleccionada</SectionTitle>
            <SignalCard
              account={account}
              signal={selectedSignal}
              resolution={selectedResolution}
              selected
              onSelect={() => focusSignal(selectedSignal)}
              isCurrent={currentKey === signalKey(selectedSignal)}
              onSetCurrent={() => setAsCurrent(selectedSignal)}
            />
          </section>
        )}

        {activeSignals.length > 0 && (
          <section>
            <SectionTitle count={activeSignals.length}>Activas</SectionTitle>
            {renderList(activeSignals)}
          </section>
        )}

        <section>
          <SectionTitle count={closedSignals.length}>Cerradas</SectionTitle>

          {!loading && allSignals.length === 0 && previews.length === 0 && (
            <p className={`${CARD} p-6 text-center text-sm text-muted`}>
              Sin señales confirmadas. Esperando cierre de vela...
            </p>
          )}

          {allSignals.length > 0 && closedSignals.length === 0 && (
            <p className={`${CARD} p-4 text-center text-sm text-muted`}>
              Ninguna señal cerrada aún — esperando SL o TP
            </p>
          )}

          {renderList(closedSignals)}
        </section>
      </div>

      <footer className="mt-16 grid gap-3 border-t border-line pt-6 text-xs leading-relaxed text-faint">
        <p>
          Prueba de concepto con fines informativos. No constituye asesoramiento
          financiero ni recomendación de inversión. El uso de esta herramienta
          y cualquier operación derivada es bajo tu propia responsabilidad.
        </p>
        <p>
          Stop escalonado: al llegar a 1R el SL pasa a la entrada (BE), a 2R
          sube a +1R, a 3R a +2R, y así sin techo. Cerrada = toca el SL original
          o el escalón asegurado (el stop prioriza en la misma vela).
        </p>
        <p className="text-muted">
          Made by{" "}
          <a
            href="https://jgarin.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Garincho
          </a>
          {" · "}
          <a
            href="https://github.com/juanjgarin/scalpineta"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            GitHub Scalpineta Repo
          </a>
        </p>
      </footer>
    </div>
    </CombosContext.Provider>
  );
}
