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
export type Interval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export interface TakeProfits {
  r1: number;
  r2: number;
  r3: number;
}

export interface Signal {
  type: SignalType;
  pattern: PatternType;
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
