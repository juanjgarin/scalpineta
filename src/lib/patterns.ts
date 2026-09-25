import { calculateRiskLevels } from "./risk";
import type { Candle, Interval, Signal } from "./types";

const SWEEP_LOOKBACK = 15;
const TURTLE_PERIOD = 20;
/** Raschke: el extremo previo de 20 velas debe tener al menos 4 velas de antigüedad */
const TURTLE_MIN_BARS_SINCE_EXTREME = 4;

/*
 * Filtros de calidad (backtest BTCUSDT, 3000 velas por TF, con comisiones):
 * sin ellos solo 1D daba positivo; con ellos 5m–1h y 1D pasan a positivo y el win
 * rate sube de ~24% a ~28–39%, validado en datos fuera de muestra.
 */
/** Cierre en el 30% del rango a favor: rechazo real del nivel barrido */
const MIN_CLOSE_STRENGTH = 0.7;
/** Volumen de la vela de quiebre vs promedio de las 20 previas */
const MIN_VOLUME_RATIO = 2;
const ATR_PERIOD = 14;
const VOLUME_PERIOD = 20;
/** Primera vela con ATR y promedio de volumen disponibles */
const FIRST_INDEX = Math.max(TURTLE_PERIOD, VOLUME_PERIOD) + 1;

interface Indicators {
  atr: (number | null)[];
  /** Promedio de volumen de las VOLUME_PERIOD velas anteriores a i */
  volumeAvg: (number | null)[];
}

function computeIndicators(candles: Candle[]): Indicators {
  const atr: (number | null)[] = new Array(candles.length).fill(null);
  const volumeAvg: (number | null)[] = new Array(candles.length).fill(null);
  let current: number | null = null;
  let volumeSum = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i > 0) {
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      );
      // ATR de Wilder
      current =
        current == null ? tr : (current * (ATR_PERIOD - 1) + tr) / ATR_PERIOD;
      if (i >= ATR_PERIOD) atr[i] = current;
    }

    if (i >= VOLUME_PERIOD) volumeAvg[i] = volumeSum / VOLUME_PERIOD;
    volumeSum += c.volume;
    if (i >= VOLUME_PERIOD) volumeSum -= candles[i - VOLUME_PERIOD].volume;
  }

  return { atr, volumeAvg };
}

function swingLevels(candles: Candle[], endIndex: number, lookback: number) {
  const start = Math.max(0, endIndex - lookback);
  const slice = candles.slice(start, endIndex);

  if (slice.length === 0) {
    return { swingHigh: 0, swingLow: Infinity };
  }

  return {
    swingHigh: Math.max(...slice.map((c) => c.high)),
    swingLow: Math.min(...slice.map((c) => c.low)),
  };
}

type RawSignal = Omit<
  Signal,
  | "interval"
  | "candleLow"
  | "candleHigh"
  | "stopLoss"
  | "takeProfits"
  | "riskPercent"
  | "preview"
>;

/** Rango usado para el SL (en TS de 2 velas incluye la vela de quiebre) */
interface StopRange {
  low: number;
  high: number;
}

interface Detection {
  raw: RawSignal;
  range: StopRange;
  /** Vela que barrió el nivel (en TS de 2 velas es la anterior) */
  breakIndex: number;
}

function enrichSignal(
  { raw, range }: Detection,
  interval: Interval,
  atr: number,
  preview = false
): Signal {
  const risk = calculateRiskLevels(
    raw.type,
    raw.price,
    range.low,
    range.high,
    raw.level,
    atr
  );

  return {
    ...raw,
    interval,
    candleLow: range.low,
    candleHigh: range.high,
    stopLoss: risk?.stopLoss ?? null,
    takeProfits: risk?.takeProfits ?? null,
    riskPercent: risk?.riskPercent ?? null,
    preview,
  };
}

function detectSweep(
  candle: Candle,
  index: number,
  swingHigh: number,
  swingLow: number
): Detection | null {
  const range = { low: candle.low, high: candle.high };

  if (candle.low < swingLow && candle.close > swingLow) {
    return {
      range,
      breakIndex: index,
      raw: {
        type: "BUY",
        pattern: "SWEEP",
        timestamp: candle.openTime,
        price: candle.close,
        level: swingLow,
        description: `Barrido alcista en ${swingLow.toFixed(2)} — mecha abajo, cierre arriba`,
      },
    };
  }

  if (candle.high > swingHigh && candle.close < swingHigh) {
    return {
      range,
      breakIndex: index,
      raw: {
        type: "SELL",
        pattern: "SWEEP",
        timestamp: candle.openTime,
        price: candle.close,
        level: swingHigh,
        description: `Barrido bajista en ${swingHigh.toFixed(2)} — mecha arriba, cierre abajo`,
      },
    };
  }

  return null;
}

/** Extremo de las TURTLE_PERIOD velas previas a breakIndex y su antigüedad en velas */
function priorExtremes(candles: Candle[], breakIndex: number) {
  const start = breakIndex - TURTLE_PERIOD;
  let lowIdx = start;
  let highIdx = start;

  for (let i = start; i < breakIndex; i++) {
    // <= / >= para quedarnos con el toque más reciente del extremo
    if (candles[i].low <= candles[lowIdx].low) lowIdx = i;
    if (candles[i].high >= candles[highIdx].high) highIdx = i;
  }

  return {
    low: candles[lowIdx].low,
    lowAge: breakIndex - lowIdx,
    high: candles[highIdx].high,
    highAge: breakIndex - highIdx,
  };
}

/**
 * Turtle Soup (Linda Raschke), solo señales confirmadas:
 * 1. La vela de quiebre marca un nuevo mínimo/máximo de 20 velas.
 * 2. El mínimo/máximo previo tiene al menos 4 velas de antigüedad.
 * 3. El precio cierra de vuelta del lado interno del nivel, en la misma vela
 *    o en la siguiente (si la vela de quiebre cerró afuera).
 */
function detectTurtleSoup(candles: Candle[], index: number): Detection | null {
  const candle = candles[index];

  for (const breakIndex of [index, index - 1]) {
    if (breakIndex < TURTLE_PERIOD) continue;

    const confirmBars = breakIndex === index ? 1 : 2;
    const breakCandle = candles[breakIndex];
    const prior = priorExtremes(candles, breakIndex);
    const range = {
      low: Math.min(breakCandle.low, candle.low),
      high: Math.max(breakCandle.high, candle.high),
    };

    const bullishBreak =
      breakCandle.low < prior.low &&
      prior.lowAge >= TURTLE_MIN_BARS_SINCE_EXTREME &&
      candle.close > prior.low &&
      // En 2 velas, la de quiebre tuvo que cerrar abajo (si no, ya era señal de 1 vela)
      (confirmBars === 1 || breakCandle.close <= prior.low);

    if (bullishBreak) {
      return {
        range,
        breakIndex,
        raw: {
          type: "BUY",
          pattern: "TURTLE_SOUP",
          timestamp: candle.openTime,
          price: candle.close,
          level: prior.low,
          barsSinceExtreme: prior.lowAge,
          confirmBars,
          description: `Turtle Soup alcista — nuevo mínimo de ${TURTLE_PERIOD} velas bajo ${prior.low.toFixed(2)} (hecho hace ${prior.lowAge} velas) y cierre de vuelta arriba${confirmBars === 2 ? " en la vela siguiente" : ""}`,
        },
      };
    }

    const bearishBreak =
      breakCandle.high > prior.high &&
      prior.highAge >= TURTLE_MIN_BARS_SINCE_EXTREME &&
      candle.close < prior.high &&
      (confirmBars === 1 || breakCandle.close >= prior.high);

    if (bearishBreak) {
      return {
        range,
        breakIndex,
        raw: {
          type: "SELL",
          pattern: "TURTLE_SOUP",
          timestamp: candle.openTime,
          price: candle.close,
          level: prior.high,
          barsSinceExtreme: prior.highAge,
          confirmBars,
          description: `Turtle Soup bajista — nuevo máximo de ${TURTLE_PERIOD} velas sobre ${prior.high.toFixed(2)} (hecho hace ${prior.highAge} velas) y cierre de vuelta abajo${confirmBars === 2 ? " en la vela siguiente" : ""}`,
        },
      };
    }
  }

  return null;
}

function signalKey(
  signal: Pick<Signal, "timestamp" | "pattern" | "type" | "interval">
) {
  return `${signal.interval}-${signal.timestamp}-${signal.pattern}-${signal.type}`;
}

function lastClosedIndex(candles: Candle[]): number {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].closed !== false) return i;
  }
  return Math.max(0, candles.length - 2);
}

/**
 * Filtros de calidad. En la vela abierta (preview) el volumen todavía no está
 * completo, así que solo se exige al confirmar.
 */
function passesFilters(
  detection: Detection,
  candles: Candle[],
  index: number,
  indicators: Indicators,
  preview: boolean
) {
  const candle = candles[index];
  const range = candle.high - candle.low;
  const isBuy = detection.raw.type === "BUY";
  const closeStrength =
    range > 0
      ? isBuy
        ? (candle.close - candle.low) / range
        : (candle.high - candle.close) / range
      : 0;

  const avg = indicators.volumeAvg[detection.breakIndex];
  const volumeRatio = avg ? candles[detection.breakIndex].volume / avg : 0;

  detection.raw.closeStrength = closeStrength;
  detection.raw.volumeRatio = volumeRatio;

  if (closeStrength < MIN_CLOSE_STRENGTH) return false;
  if (!preview && volumeRatio < MIN_VOLUME_RATIO) return false;
  return true;
}

function scanAtIndex(
  candles: Candle[],
  index: number,
  interval: Interval,
  indicators: Indicators,
  preview: boolean
): Signal | null {
  const candle = candles[index];
  const atr = indicators.atr[index];
  if (atr == null) return null;

  const { swingHigh, swingLow } = swingLevels(candles, index, SWEEP_LOOKBACK);

  // Una sola señal por vela: si hay TS y barrido a la vez, gana el TS
  const detection = [
    detectTurtleSoup(candles, index),
    detectSweep(candle, index, swingHigh, swingLow),
  ].find(
    (d): d is Detection =>
      d != null && passesFilters(d, candles, index, indicators, preview)
  );

  return detection ? enrichSignal(detection, interval, atr, preview) : null;
}

export function detectSignals(candles: Candle[], interval: Interval): Signal[] {
  const found: Signal[] = [];
  const seen = new Set<string>();

  const lastIndex = lastClosedIndex(candles);
  const indicators = computeIndicators(candles);

  for (let i = FIRST_INDEX; i <= lastIndex; i++) {
    const signal = scanAtIndex(candles, i, interval, indicators, false);
    if (!signal) continue;
    const key = signalKey(signal);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(signal);
  }

  return found.sort((a, b) => b.timestamp - a.timestamp);
}

/** Señal tentativa en la vela abierta (puede cambiar antes del cierre) */
export function detectPreview(
  candles: Candle[],
  interval: Interval
): Signal | null {
  if (candles.length === 0) return null;

  const last = candles[candles.length - 1];
  if (last.closed !== false) return null;

  const index = candles.length - 1;
  if (index < FIRST_INDEX) return null;

  return scanAtIndex(candles, index, interval, computeIndicators(candles), true);
}

export { signalKey };
