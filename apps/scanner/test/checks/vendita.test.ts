import { describe, expect, it } from "vitest";
import { vend001, vend002, vend003, vend004, vend005, vend006, vend007 } from "../../src/checks/vendita.js";
import { isAllowedByRobots } from "../../src/legal/robots.js";
import { classifyLink, pickLegalLinks } from "../../src/legal/reader.js";
import type { LegalPage } from "../../src/scan/context.js";
import { ctxFrom, page, runOne } from "../fixtures.js";

const sales = (text: string, kind: LegalPage["kind"] = "sales", links: string[] = []): LegalPage[] => [{ kind, url: "https://esempio-sito.it/condizioni", text, links }];
const shop = (body = "", legalPages: LegalPage[] = []) => ctxFrom(page(body), { legalPages, siteType: "shop", siteTypeSource: "user", siteTypeConfidence: "high" });
const FULL =
  "Venditore Alfa S.r.l. P.IVA 12345678903. Diritto di recesso entro 14 giorni con il modulo di recesso. Garanzia legale di conformità di 24 mesi. " +
  "Spese di spedizione 5 €, consegna in 3 giorni lavorativi. Prezzi IVA inclusa. Pagamenti con PayPal e carta di credito.";

describe("VEND-001 condizioni di vendita", () => {
  it("ok se lette", () => expect(runOne(vend001, shop("", sales(FULL)))?.status).toBe("ok"));
  it("unverifiable con link ma pagina non letta", () => expect(runOne(vend001, shop('<a href="/cgv">Condizioni di vendita</a>'))?.status).toBe("unverifiable"));
  it("ko senza link", () => expect(runOne(vend001, shop("<p>Negozio</p>"))).toMatchObject({ status: "ko", severity: "high" }));
});

describe("VEND-002 recesso", () => {
  it("ok completo", () => expect(runOne(vend002, shop("", sales(FULL)))?.status).toBe("ok"));
  it("warn se manca il modulo", () => expect(runOne(vend002, shop("", sales("Recesso entro 14 giorni.")))?.status).toBe("warn"));
  it("ko se il recesso non è citato", () => expect(runOne(vend002, shop("", sales("Prezzi IVA inclusa.")))?.status).toBe("ko"));
  it("unverifiable senza pagine", () => expect(runOne(vend002, shop())?.status).toBe("unverifiable"));
});

describe("VEND-003 recesso online", () => {
  it("warn informativo, mai ko", () => expect(runOne(vend003, shop("", sales(FULL)))).toMatchObject({ status: "warn", severity: "info" }));
  it("ok se c'è la funzione", () => expect(runOne(vend003, shop('<a href="/recesso">Recedi dal contratto qui</a>'))?.status).toBe("ok"));
});

describe("VEND-004 garanzia legale", () => {
  it("ok con 24 mesi", () => expect(runOne(vend004, shop("", sales(FULL)))?.status).toBe("ok"));
  it("warn senza durata", () => expect(runOne(vend004, shop("", sales("Garanzia legale prevista dalla legge.")))?.status).toBe("warn"));
  it("nessun esito senza pagine", () => expect(vend004.run(shop())).toEqual([]));
});

describe("VEND-005 spedizioni e imposte", () => {
  it("ok completo", () => expect(runOne(vend005, shop("", sales(FULL)))?.status).toBe("ok"));
  it("warn se mancano i tempi", () => expect(runOne(vend005, shop("", sales("Spese di spedizione 5 €. IVA inclusa.")))?.status).toBe("warn"));
});

describe("VEND-006 piattaforma ODR", () => {
  it("warn con link ODR", () => expect(runOne(vend006, shop('<a href="https://ec.europa.eu/consumers/odr">ODR</a>'))?.status).toBe("warn"));
  it("warn con link ODR in una pagina legale", () => expect(runOne(vend006, shop("", sales(FULL, "sales", ["https://ec.europa.eu/consumers/odr/main"])))?.status).toBe("warn"));
  it("ok senza", () => expect(runOne(vend006, shop("", sales(FULL)))?.status).toBe("ok"));
});

describe("VEND-007 pagamenti e venditore", () => {
  it("ok con pagamenti e P.IVA coerente", () => expect(runOne(vend007, shop("<footer>P.IVA 12345678903</footer>", sales(FULL)))?.status).toBe("ok"));
  it("warn con P.IVA diversa", () => {
    expect(runOne(vend007, shop("<footer>P.IVA 01234567897</footer>", sales(FULL)))).toMatchObject({ status: "warn", severity: "medium" });
  });
  it("warn senza metodi di pagamento", () => expect(runOne(vend007, shop("", sales("Recesso 14 giorni.")))?.status).toBe("warn"));
});

describe("pagine legali e robots.txt", () => {
  it("rispetta robots.txt (regola più specifica)", () => {
    const robots = "User-agent: *\nDisallow: /legal/\nAllow: /legal/privacy\n\nUser-agent: SemaforoBot\nDisallow: /privato";
    expect(isAllowedByRobots(robots, "/privato/x")).toBe(false);
    expect(isAllowedByRobots(robots, "/legal/termini", "googlebot")).toBe(false);
    expect(isAllowedByRobots(robots, "/legal/privacy", "googlebot")).toBe(true);
    expect(isAllowedByRobots("User-agent: *\nDisallow: /*.pdf$", "/doc.pdf")).toBe(false);
    expect(isAllowedByRobots(null, "/qualsiasi")).toBe(true);
  });

  it("classifica i link legali", () => {
    const l = (text: string, href: string) => ({ text, href, inFooter: true, inNav: false });
    expect(classifyLink(l("Cookie policy", "/cookie"))).toBe("cookie");
    expect(classifyLink(l("Privacy", "/privacy-policy"))).toBe("privacy");
    expect(classifyLink(l("Condizioni di vendita", "/cgv"))).toBe("sales");
    expect(classifyLink(l("Resi e rimborsi", "/resi"))).toBe("withdrawal");
    expect(classifyLink(l("Note legali", "/note-legali"))).toBe("legal");
    expect(classifyLink(l("Chi siamo", "/chi-siamo"))).toBeUndefined();
  });

  it("massimo 6 pagine, una per tipo, footer preferito, iubenda ammesso, siti esterni esclusi", () => {
    const html = page(`
      <nav><a href="/privacy-vecchia">Privacy</a></nav>
      <footer>
        <a href="https://www.iubenda.com/privacy-policy/123">Privacy policy</a>
        <a href="/cookie">Cookie</a><a href="/cgv">Condizioni di vendita</a><a href="/recesso">Recesso</a>
        <a href="/note-legali">Note legali</a><a href="/termini-di-uso">Termini di uso</a><a href="/contatti">Contatti</a>
        <a href="https://altro-sito.it/privacy">Privacy partner</a>
      </footer>`);
    const ctx = ctxFrom(html, { siteType: "shop" });
    const picks = pickLegalLinks(ctx);
    expect(picks).toHaveLength(6);
    expect(picks.find((p) => p.kind === "privacy")?.url).toBe("https://www.iubenda.com/privacy-policy/123");
    expect(picks.some((p) => p.url.includes("altro-sito.it"))).toBe(false);
    expect(picks.some((p) => p.kind === "contacts")).toBe(false);
  });
});
