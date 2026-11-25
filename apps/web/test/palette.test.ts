import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, PALETTE, type PaletteKey, TEXT_PAIRS, UI_PAIRS } from "@semaforo/shared";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("palette e contrasti (WCAG 2.1 AA)", () => {
  it("globals.css usa esattamente i valori di palette.ts", () => {
    for (const [key, value] of Object.entries(PALETTE)) {
      expect(css, key).toMatch(new RegExp(`--color-${kebab(key)}:\\s*${value};`, "i"));
    }
  });

  it.each(TEXT_PAIRS.map(([a, b]) => [a, b]))("testo %s su %s ≥ 4.5:1", (fg, bg) => {
    expect(contrastRatio(PALETTE[fg as PaletteKey], PALETTE[bg as PaletteKey])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS.map(([a, b]) => [a, b]))("componente %s su %s ≥ 3:1", (fg, bg) => {
    expect(contrastRatio(PALETTE[fg as PaletteKey], PALETTE[bg as PaletteKey])).toBeGreaterThanOrEqual(3);
  });
});
