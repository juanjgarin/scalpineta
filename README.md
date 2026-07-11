# La Scalpineta

App simple en Next.js que detecta **barridos de liquidez** y **Turtle Soup** en BTCUSDT Perpetual (Binance Futures) para scalping en **1m**, **5m** y **15m**.

## Qué detecta

- **Barrido (Sweep)**: la vela barre un máximo/mínimo reciente con mecha y cierra del otro lado → señal de reversión.
- **Turtle Soup**: falso quiebre del máximo/mínimo de las últimas 20 velas → señal contraria.
- **Gráfico de velas** con marcadores en cada señal (B = barrido, TS = turtle soup).
- **SL / TP** calculados en 1:1, 1:2 y 1:3 (SL debajo/sobre la mecha barrida). Click en una señal para ver las líneas en el gráfico.
- **Tiempo real** vía WebSocket de Binance (precio ~1s, velas en vivo, señal al cierre instantánea).
- **Preview** tentativo en la vela abierta antes del cierre.

## Desarrollo local

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Deploy en Vercel

1. Subí el repo a GitHub.
2. Entrá a [vercel.com/new](https://vercel.com/new) e importá el proyecto.
3. Deploy — no necesita variables de entorno (usa la API pública de Binance).

O con CLI:

```bash
npx vercel
```

## API

```
GET /api/signals?interval=1m|5m|15m
```

Respuesta JSON con precio mark, señales recientes y la más reciente.

## Nota

Esto es **solo informativo**. No ejecuta trades. Ajustá los parámetros en `src/lib/patterns.ts` si querés afinar la detección.
