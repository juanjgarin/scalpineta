/** Paleta tenue compartida (UI + gráfico) */

export const chart = {
  bg: "#141416",
  grid: "#1f1f23",
  text: "#8a8a93",
  up: "#5a7d6a",
  down: "#8a6565",
  wickUp: "#5a7d6a",
  wickDown: "#8a6565",
  markerBuy: "#6b9178",
  markerSell: "#9a7373",
  markerPreview: "#6b6b75",
  entry: "#8a7d62",
  entryHit: "#a89470",
  sl: "#7a5c5c",
  slHit: "#a87878",
  tp: "#5c7568",
  tpHit: "#7a9a88",
  live: "#6a7580",
} as const;

export const ui = {
  buyText: "text-emerald-600/80",
  sellText: "text-rose-600/80",
  buyBorder: "border-emerald-900/25 bg-emerald-950/15",
  sellBorder: "border-rose-900/25 bg-rose-950/15",
  slMuted: "text-rose-400/50",
  slHit: "text-rose-400/90 bg-rose-950/35 ring-1 ring-rose-800/30",
  entryMuted: "text-amber-200/45",
  tpMuted: "text-teal-400/45",
  tpHit: "text-teal-400/85 bg-teal-950/30 ring-1 ring-teal-800/25",
} as const;
