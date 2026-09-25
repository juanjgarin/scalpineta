/**
 * Paleta del gráfico leída de los tokens Kraken (globals.css), así sigue al
 * tema claro/oscuro. lightweight-charts necesita colores resueltos, no var().
 */
export interface ChartPalette {
  bg: string;
  grid: string;
  text: string;
  up: string;
  down: string;
  markerBuy: string;
  markerSell: string;
  markerPreview: string;
  markerTs: string;
  entry: string;
  sl: string;
  slHit: string;
  tp: string;
  tpHit: string;
  live: string;
  fontFamily: string;
}

function token(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

export function readChartPalette(): ChartPalette {
  const s = getComputedStyle(document.documentElement);
  const positive = token(s, "--positive", "#149e61");
  const negative = token(s, "--negative", "#484b5e");
  const accent = token(s, "--accent", "#7132f5");
  const muted = token(s, "--text-muted", "#686b82");
  const faint = token(s, "--text-faint", "#9497a9");

  return {
    bg: token(s, "--surface", "#faf9fe"),
    grid: token(s, "--border", "#dedee5"),
    text: muted,
    up: positive,
    down: negative,
    markerBuy: positive,
    markerSell: negative,
    markerPreview: faint,
    markerTs: accent,
    entry: accent,
    sl: faint,
    slHit: token(s, "--text", "#101114"),
    tp: positive,
    tpHit: token(s, "--positive-deep", "#026b3f"),
    live: muted,
    fontFamily: `${token(s, "--font-plex-mono", "")}, ui-monospace, monospace`.replace(
      /^, /,
      ""
    ),
  };
}
