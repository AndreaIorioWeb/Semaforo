import type { Risk, Status } from "./types.js";

/**
 * Icone a tratto (viewBox 0 0 24 24) condivise da sito e PDF.
 * Ogni stato ha una forma diversa: il significato non dipende mai dal solo colore.
 */
export interface IconShape {
  /** Elementi SVG come [tag, attributi]. */
  parts: ReadonlyArray<readonly [string, Readonly<Record<string, string>>]>;
}

const stroke = { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" };

export const STATUS_ICONS: Readonly<Record<Status, IconShape>> = {
  // Ottagono con X: "da sistemare"
  ko: {
    parts: [
      ["path", { ...stroke, d: "M8 2.5h8l5.5 5.5v8L16 21.5H8L2.5 16V8z" }],
      ["path", { ...stroke, d: "M9 9l6 6M15 9l-6 6" }],
    ],
  },
  // Triangolo con punto esclamativo: "da verificare"
  warn: {
    parts: [
      ["path", { ...stroke, d: "M12 3l9.5 17h-19z" }],
      ["path", { ...stroke, d: "M12 10v4.5M12 17.5v.01" }],
    ],
  },
  // Cerchio con spunta: "in regola"
  ok: {
    parts: [
      ["circle", { ...stroke, cx: "12", cy: "12", r: "9.5" }],
      ["path", { ...stroke, d: "M7.5 12.5l3 3 6-6.5" }],
    ],
  },
  // Quadrato arrotondato con punto di domanda: "non verificabile"
  unverifiable: {
    parts: [
      ["rect", { ...stroke, x: "3", y: "3", width: "18", height: "18", rx: "4" }],
      ["path", { ...stroke, d: "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.01" }],
    ],
  },
};

/** Semaforo verticale: si "accende" la luce del livello di rischio (in alto = alto). */
export function riskLightIcon(risk: Risk): IconShape {
  const lit = { high: 0, medium: 1, low: 2 }[risk];
  const lights = [6.5, 12, 17.5].map(
    (cy, i) => ["circle", { cx: "12", cy: String(cy), r: "2.6", fill: i === lit ? "currentColor" : "none", stroke: "currentColor", "stroke-width": "1.5" }] as const,
  );
  return { parts: [["rect", { ...stroke, x: "7", y: "2", width: "10", height: "20", rx: "5" }], ...lights] };
}

/** SVG come stringa (per il PDF). */
export function iconSvg(icon: IconShape, size = 18, label?: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const inner = icon.parts
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(" ")}/>`)
    .join("");
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : `aria-hidden="true"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" ${a11y}>${inner}</svg>`;
}
