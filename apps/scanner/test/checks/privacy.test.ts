import { describe, expect, it } from "vitest";
import { priv001, priv002, priv003, priv004, priv005 } from "../../src/checks/privacy.js";
import type { LegalPage } from "../../src/scan/context.js";
import { ctxFrom, fixture, page, runOne } from "../fixtures.js";

const clean = () => ctxFrom(fixture("static/clean-home.html"));
const wp = () => ctxFrom(fixture("static/wordpress-old.html"));

const COMPLETE_POLICY =
  "Titolare del trattamento è Alfa S.r.l., email privacy@alfa.it. Finalità: rispondere alle richieste. Base giuridica: art. 6 GDPR, consenso e legittimo interesse. " +
  "Destinatari: fornitori nominati responsabili del trattamento. Periodo di conservazione: 24 mesi. Diritti dell'interessato: accesso, rettifica, cancellazione (art. 15-22). " +
  "Puoi proporre reclamo al Garante per la protezione dei dati personali. Non effettuiamo trasferimenti verso paesi terzi extra UE. Reg. UE 2016/679.";

const legal = (text: string, kind: LegalPage["kind"] = "privacy"): LegalPage[] => [{ kind, url: "https://esempio-sito.it/privacy", text, links: [] }];

describe("PRIV-001 link all'informativa", () => {
  it("ok con link nel footer", () => expect(runOne(priv001, clean())?.status).toBe("ok"));
  it("ko senza link", () => expect(runOne(priv001, wp())).toMatchObject({ status: "ko", severity: "high" }));
  it("warn se il link è solo nel menu", () => {
    expect(runOne(priv001, ctxFrom(page('<nav><a href="/privacy">Privacy</a></nav>')))?.status).toBe("warn");
  });
});

describe("PRIV-002 contenuti art. 13", () => {
  it("unverifiable se l'informativa non è stata letta", () => expect(runOne(priv002, clean())?.status).toBe("unverifiable"));
  it("ok (indicativo) con tutti gli elementi", () => {
    const f = runOne(priv002, ctxFrom(page(""), { legalPages: legal(COMPLETE_POLICY) }));
    expect(f?.status).toBe("ok");
    expect(f?.explanation).toMatch(/non ne garantisce/);
  });
  it("warn, mai ko, se mancano elementi", () => {
    const f = runOne(priv002, ctxFrom(page(""), { legalPages: legal("Il titolare del trattamento è Alfa. Finalità: newsletter.") }));
    expect(f?.status).toBe("warn");
    expect(f?.evidence?.join(" ")).toContain("reclamo al Garante");
  });
});

describe("PRIV-003 norme superate", () => {
  it("ko se cita solo il vecchio Codice e la direttiva 95/46", () => {
    const text = "Ai sensi dell'art. 13 del D.Lgs. 196/2003 e della Direttiva 95/46/CE la informiamo che...";
    expect(runOne(priv003, ctxFrom(page(""), { legalPages: legal(text) }))?.status).toBe("ko");
  });
  it("warn se cita norme superate insieme al GDPR (ambiguo)", () => {
    const text = "Ai sensi del Reg. UE 2016/679 (GDPR), che ha abrogato la Direttiva 95/46/CE...";
    expect(runOne(priv003, ctxFrom(page(""), { legalPages: legal(text) }))?.status).toBe("warn");
  });
  it("ok con riferimenti aggiornati", () => {
    expect(runOne(priv003, ctxFrom(page(""), { legalPages: legal(COMPLETE_POLICY) }))?.status).toBe("ok");
  });
  it("nessun esito senza testo", () => expect(priv003.run(clean())).toEqual([]));
});

describe("PRIV-004 moduli", () => {
  it("ok con link e caselle non spuntate", () => expect(runOne(priv004, clean())?.status).toBe("ok"));
  it("ko con casella di consenso preselezionata", () => expect(runOne(priv004, wp())).toMatchObject({ status: "ko", severity: "high" }));
  it("warn senza link all'informativa", () => {
    const html = page('<form><input type="email" name="email"><button>Invia</button></form>');
    expect(runOne(priv004, ctxFrom(html))?.status).toBe("warn");
  });
  it("nessun esito senza moduli con dati personali", () => {
    expect(priv004.run(ctxFrom(page('<form><input name="q"></form>')))).toEqual([]);
  });
});

describe("PRIV-005 consenso marketing", () => {
  it("ok con newsletter separata", () => expect(runOne(priv005, clean())?.status).toBe("ok"));
  it("warn con consenso unico privacy + newsletter", () => expect(runOne(priv005, wp())?.status).toBe("warn"));
  it("warn se il marketing è obbligatorio", () => {
    const html = page('<form><input type="email"><label><input type="checkbox" required> Iscrivimi alla newsletter</label></form>');
    expect(runOne(priv005, ctxFrom(html))?.status).toBe("warn");
  });
});
