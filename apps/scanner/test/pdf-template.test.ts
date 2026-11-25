import { describe, expect, it } from "vitest";
import type { Report } from "@semaforo/shared";
import { finding } from "../src/checks/types.js";
import { reportHtml } from "../src/pdf/template.js";

const report = (evidence: string): Report => ({
  jobId: "x",
  siteUrl: "https://esempio-sito.it/",
  scannedAt: "2026-11-25T10:00:00.000Z",
  siteType: "showcase",
  risk: "high",
  findings: [finding("PRIV-001", { status: "ko", severity: "high", explanation: "Spiegazione", howToFix: "Correggi", evidence: [evidence] })],
  unverifiable: ["Carrello e checkout"],
  expiresAt: "2026-11-25T11:00:00.000Z",
});

describe("modello PDF", () => {
  it("fa l'escaping di tutto il testo che arriva dal sito", () => {
    const html = reportHtml(report('<script>alert(1)</script><img src=x onerror="fetch(1)">'));
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("non contiene risorse esterne né script", () => {
    const html = reportHtml(report("ok"));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)="https?:/i);
    expect(html).not.toMatch(/url\((?!data:)/i);
  });

  it("riporta rischio con testo, stati, cosa non si può verificare e disclaimer", () => {
    const html = reportHtml(report("ok"));
    expect(html).toContain("Rischio alto");
    expect(html).toContain("Da sistemare");
    expect(html).toContain("Cosa non si può verificare");
    expect(html).toContain("non sono consulenza legale");
    expect(html).toContain("esempio-sito.it");
  });
});
