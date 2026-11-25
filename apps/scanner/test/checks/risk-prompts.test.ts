import { describe, expect, it } from "vitest";
import { computeRisk, type Finding, riskScore } from "@semaforo/shared";
import { az001 } from "../../src/checks/azienda.js";
import { finding } from "../../src/checks/types.js";
import { buildCombinedPrompt, buildFixPrompt, FINAL_LINE, platformInstructions, withFixPrompts } from "../../src/prompts/generator.js";
import { runChecks } from "../../src/scan/pipeline.js";
import { ctxFrom, page } from "../fixtures.js";

const f = (id: string, status: Finding["status"], severity: Finding["severity"]): Finding =>
  finding(id, { status, severity, explanation: "x", howToFix: "y" });

describe("calcolo del rischio", () => {
  it("basso senza problemi", () => {
    expect(computeRisk([])).toBe("low");
    expect(computeRisk([f("AZ-001", "ok", "info"), f("SEC-003", "unverifiable", "info")])).toBe("low");
  });
  it("alto con un solo ko di gravità alta", () => expect(computeRisk([f("PRIV-001", "ko", "high")])).toBe("high"));
  it("i warn pesano la metà", () => {
    expect(riskScore([f("PUB-004", "warn", "medium")])).toBe(2);
    expect(riskScore([f("PUB-004", "ko", "medium")])).toBe(4);
    expect(riskScore([f("PRIV-002", "warn", "high")])).toBe(5);
  });
  it("soglie: medio da 6 punti, alto da 20", () => {
    expect(computeRisk([f("AZ-001", "ko", "medium")])).toBe("low");
    expect(computeRisk([f("AZ-001", "ko", "medium"), f("AZ-004", "ko", "medium")])).toBe("medium");
    expect(computeRisk(Array.from({ length: 5 }, () => f("AZ-001", "ko", "medium")))).toBe("high");
  });
  it("un warn di gravità alta non porta da solo ad alto", () => expect(computeRisk([f("PRIV-002", "warn", "high")])).toBe("low"));
});

describe("generatore di prompt", () => {
  const base = { url: "https://esempio-sito.it/", siteType: "showcase" as const };

  it("usa i placeholder e non inventa dati", () => {
    const azKo = az001.run(ctxFrom(page("<p>nulla</p>")))[0] as Finding;
    const prompt = buildFixPrompt(azKo, { ...base, cms: "WordPress" });
    expect(prompt).toContain("[PLACEHOLDER: partita IVA di 11 cifre]");
    expect(prompt).not.toMatch(/\b\d{11}\b/);
    expect(prompt).toContain("https://esempio-sito.it/");
    expect(prompt).toContain("AZ-001");
  });

  it("termina sempre con la riga sul professionista", () => {
    const prompt = buildFixPrompt(f("SEC-002", "warn", "low"), base);
    expect(prompt.trim().split("\n").at(-1)).toBe(FINAL_LINE);
    expect(prompt).toMatch(/revisione di un professionista/);
  });

  it("varianti per CMS", () => {
    expect(platformInstructions("WordPress")).toMatch(/functions\.php.*tema child/);
    expect(platformInstructions("WordPress")).toMatch(/Non modificare mai i file del core/);
    expect(platformInstructions("Shopify")).toMatch(/Liquid/);
    expect(platformInstructions("Wix")).toMatch(/editor/);
    expect(platformInstructions("Next.js")).toMatch(/next\.config\.js/);
    expect(platformInstructions(undefined)).toContain("[PLACEHOLDER: piattaforma");
  });

  it("aggiunge il prompt solo a ko e warn", () => {
    const out = withFixPrompts([f("AZ-001", "ok", "info"), f("AZ-004", "ko", "medium"), f("SEC-003", "unverifiable", "info")], base);
    expect(out.map((x) => Boolean(x.fixPrompt))).toEqual([false, true, false]);
  });

  it("prompt unico ordinato per gravità", () => {
    const combined = buildCombinedPrompt(
      [f("SEC-002", "warn", "low"), f("PRIV-001", "ko", "high"), f("AZ-004", "ko", "medium"), f("AZ-001", "ok", "info")],
      base,
    );
    expect(combined).toBeDefined();
    const order = ["PRIV-001", "AZ-004", "SEC-002"].map((id) => combined?.indexOf(`Problema ${id}`) ?? -1);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(combined).not.toContain("Problema AZ-001");
    expect(combined?.trim().split("\n").at(-1)).toBe(FINAL_LINE);
    expect(buildCombinedPrompt([f("AZ-001", "ok", "info")], base)).toBeUndefined();
  });
});

describe("runChecks", () => {
  it("isola i check che lanciano eccezioni", () => {
    const broken = { id: "X", run: () => { throw new Error("boom"); } };
    const ok = { id: "AZ-001", run: () => [f("AZ-001", "ok", "info")] };
    expect(runChecks([broken, ok], ctxFrom(page("")))).toHaveLength(1);
  });
  it("esclude i check shop dai siti vetrina e attenua i ko se il tipo è incerto", () => {
    const shopKo = { id: "VEND-001", run: () => [f("VEND-001", "ko", "high")] };
    const ctx = ctxFrom(page(""));
    expect(runChecks([shopKo], ctx)).toEqual([]);
    ctx.siteType = "shop";
    ctx.siteTypeConfidence = "low";
    expect(runChecks([shopKo], ctx)[0]?.status).toBe("warn");
    ctx.siteTypeConfidence = "high";
    expect(runChecks([shopKo], ctx)[0]?.status).toBe("ko");
  });
});
