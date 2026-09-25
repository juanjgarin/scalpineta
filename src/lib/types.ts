export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  /** false = vela en formación (WebSocket) */
  closed?: boolean;
}

export type SignalType = "BUY" | "SELL";
export type PatternType = "SWEEP" | "TURTLE_SOUP";
export type Interval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d";

export interface TakeProfits {
  r1: number;
  r2: number;
  r3: number;
}

export interface Signal {
  type: SignalType;
  pattern: PatternType;
  /** Temporalidad en la que se generó la señal */
  interval: Interval;
  timestamp: number;
  price: number;
  level: number;
  description: string;
  candleLow: number;
  candleHigh: number;
  stopLoss: number | null;
  takeProfits: TakeProfits | null;
  riskPercent: number | null;
  /** Señal en vela aún abierta — puede invalidarse */
  preview?: boolean;
  /** Turtle Soup: velas entre el extremo previo barrido y la vela de quiebre */
  barsSinceExtreme?: number;
  /** Turtle Soup: 1 = reclamo en la misma vela, 2 = reclamo en la vela siguiente */
  confirmBars?: 1 | 2;
  /** Fuerza del cierre: 1 = cerró en el extremo a favor, 0 = en el contrario */
  closeStrength?: number;
  /** Volumen de la vela de quiebre / promedio de las 20 previas */
  volumeRatio?: number;
}

export interface SignalsResponse {
  symbol: string;
  interval: Interval;
  price: number;
  updatedAt: number;
  candles: Candle[];
  signals: Signal[];
  latest: Signal | null;
}
