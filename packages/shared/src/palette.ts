/**
 * Palette "Carta e inchiostro": neutri caldi, un solo accento (blu petrolio).
 * I colori di stato (rosso, ambra, verde, grigio) servono solo agli stati di rischio
 * e sono sempre accompagnati da icona e testo.
 * Fonte unica: apps/web/src/app/globals.css deve usare gli stessi valori (verificato da test).
 */
export const PALETTE = {
  paper: "#FBF8F2",
  surface: "#FFFDF9",
  line: "#E2DACB",
  lineStrong: "#857A69",
  ink: "#221E19",
  inkMuted: "#5A5247",
  accent: "#1C5A66",
  accentStrong: "#123F48",
  accentSoft: "#E2EDEE",
  highText: "#9B2526",
  highSoft: "#FBE8E5",
  mediumText: "#7A4C00",
  mediumSoft: "#FCF0D4",
  lowText: "#2B6439",
  lowSoft: "#E5F1E4",
  neutralText: "#4D483F",
  neutralSoft: "#EEE9E0",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Coppie testo/sfondo usate nell'interfaccia: tutte devono avere contrasto ≥ 4.5:1 (WCAG 1.4.3). */
export const TEXT_PAIRS: ReadonlyArray<readonly [PaletteKey, PaletteKey]> = [
  ["ink", "paper"],
  ["ink", "surface"],
  ["inkMuted", "paper"],
  ["inkMuted", "surface"],
  ["accent", "paper"],
  ["accent", "surface"],
  ["accentStrong", "accentSoft"],
  ["surface", "accent"],
  ["surface", "accentStrong"],
  ["highText", "highSoft"],
  ["highText", "surface"],
  ["mediumText", "mediumSoft"],
  ["mediumText", "surface"],
  ["lowText", "lowSoft"],
  ["lowText", "surface"],
  ["neutralText", "neutralSoft"],
  ["neutralText", "surface"],
];

/** Elementi grafici e bordi di controlli: contrasto ≥ 3:1 (WCAG 1.4.11). */
export const UI_PAIRS: ReadonlyArray<readonly [PaletteKey, PaletteKey]> = [
  ["lineStrong", "surface"],
  ["accent", "paper"],
];

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
