"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "scalpineta:theme";
const MODES = ["system", "light", "dark"] as const;
type Mode = (typeof MODES)[number];

const LABELS: Record<Mode, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};

/** Evento propio para que el gráfico repinte al cambiar de tema manualmente */
export const THEME_CHANGE_EVENT = "scalpineta:themechange";

function applyMode(mode: Mode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    // El script de layout ya aplicó el tema guardado; solo sincronizamos el label
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (attr === "light" || attr === "dark") setMode(attr);
  }, []);

  const cycle = () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    setMode(next);
    applyMode(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage bloqueado: el tema dura lo que dure la pestaña
    }
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-live="polite"
      className="whitespace-nowrap rounded-pill border border-line bg-surface px-3.5 py-2 font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      Tema: {LABELS[mode]}
    </button>
  );
}
