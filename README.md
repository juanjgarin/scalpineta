# La Scalpineta

PoC scalping signals for **BTCUSDT Perpetual** (Binance Futures) on **1m**, **5m**, and **15m** timeframes.

Detects **liquidity sweeps** and **Turtle Soup** patterns with a live chart, SL/TP levels, and signal outcome tracking.

## Features

- **Liquidity sweep** — wick beyond a recent swing high/low, close back inside → reversal signal
- **Turtle Soup** — false break of the 20-candle high/low → counter-trend signal
- **Live candlestick chart** with COMPRA/VENTA markers
- **SL / TP** at 1:1, 1:2, and 1:3 (SL below/above the sweep wick). Click a signal to draw levels on the chart
- **Real-time updates** — mark price and active candle refresh every ~1s via Binance API
- **Preview** — tentative signal on the open candle before close
- **History** — active vs closed signals (SL HIT or TP 1:1 / 1:2 / 1:3)

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

```
GET /api/signals?interval=1m|5m|15m
GET /api/tick?interval=1m|5m|15m
```

`/api/signals` — full snapshot: mark price, candles, detected signals.  
`/api/tick` — lightweight 1s poll: mark price + latest candles.

## Configuration

Tune detection in `src/lib/patterns.ts`:

- `SWEEP_LOOKBACK` — swing level lookback (default 15)
- `TURTLE_PERIOD` — Turtle Soup period (default 20)

## Disclaimer

Proof of concept for informational purposes only. Not financial advice. No trades are executed. Use at your own risk.

Made by [Garincho](https://jgarin.com/)
