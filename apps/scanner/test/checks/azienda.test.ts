import { describe, expect, it } from "vitest";
import { az001, az002, az003, az004, az005, findPartiteIva, isValidPartitaIva } from "../../src/checks/azienda.js";
import { ctxFrom, fixture, page, runOne } from "../fixtures.js";

const clean = () => ctxFrom(fixture("static/clean-home.html"));
const wp = () => ctxFrom(fixture("static/wordpress-old.html"));

describe("partita IVA", () => {
  it("valida la cifra di controllo", () => {
    expect(isValidPartitaIva("12345678903")).toBe(true);
    expect(isValidPartitaIva("01234567897")).toBe(true);
    expect(isValidPartitaIva("12345678901")).toBe(false);
    expect(isValidPartitaIva("00000000000")).toBe(false);
    expect(isValidPartitaIva("1234567890")).toBe(false);
  });

  it("trova la partita IVA con etichette diverse", () => {
    expect(findPartiteIva("P.IVA 12345678903")).toEqual(["12345678903"]);
    expect(findPartiteIva("Partita IVA: IT01234567897")).toEqual(["01234567897"]);
    expect(findPartiteIva("C.F. e P.IVA 01234567897")).toEqual(["01234567897"]);
    expect(findPartiteIva("VAT number IT 09876543217")).toEqual(["09876543217"]);
    expect(findPartiteIva("Telefono 12345678903")).toEqual([]);
  });
});

describe("AZ-001 partita IVA", () => {
  it("ok con partita IVA valida", () => expect(runOne(az001, clean())?.status).toBe("ok"));
  it("ko se manca", () => expect(runOne(az001, wp())).toMatchObject({ status: "ko", severity: "medium" }));
  it("warn se la cifra di controllo non torna (ambiguo)", () => {
    expect(runOne(az001, ctxFrom(page("<footer>P.IVA 12345678901</footer>")))?.status).toBe("warn");
  });
});

describe("AZ-002 denominazione e sede", () => {
  it("ok con forma societaria e indirizzo", () => expect(runOne(az002, clean())?.status).toBe("ok"));
  it("warn se mancano", () => expect(runOne(az002, wp())?.status).toBe("warn"));
  it("warn se c'è solo l'indirizzo (ambiguo)", () => {
    const f = runOne(az002, ctxFrom(page("<footer>Mario Rossi, Via Roma 1, 00100 Roma</footer>")));
    expect(f?.status).toBe("warn");
    expect(f?.explanation).toContain("ragione sociale");
  });
});

describe("AZ-003 società di capitali", () => {
  it("ok con REA, registro e capitale", () => expect(runOne(az003, clean())?.status).toBe("ok"));
  it("ko se è una S.r.l. senza nessun dato", () => {
    expect(runOne(az003, ctxFrom(page("<footer>Alfa S.r.l. - P.IVA 12345678903</footer>")))?.status).toBe("ko");
  });
  it("warn se ne manca solo una parte", () => {
    expect(runOne(az003, ctxFrom(page("<footer>Alfa S.p.A. - REA MI-1234 - Registro Imprese di Milano</footer>")))?.status).toBe("warn");
  });
  it("non si applica a ditte individuali o S.n.c.", () => {
    expect(az003.run(ctxFrom(page("<footer>Beta S.n.c. di Bianchi</footer>")))).toEqual([]);
    expect(az003.run(wp())).toEqual([]);
  });
});

describe("AZ-004 contatti", () => {
  it("ok con email", () => expect(runOne(az004, clean())?.status).toBe("ok"));
  it("ko senza contatti", () => expect(runOne(az004, wp())?.status).toBe("ko"));
  it("warn con sola pagina contatti", () => {
    expect(runOne(az004, ctxFrom(page('<a href="/contatti">Contatti</a>')))?.status).toBe("warn");
  });
});

describe("AZ-005 professioni regolamentate", () => {
  it("warn per un avvocato senza albo", () => {
    expect(runOne(az005, wp())).toMatchObject({ status: "warn", severity: "info" });
  });
  it("ok se è indicata l'iscrizione all'albo", () => {
    const html = page("<footer>Avv. Mario Bianchi, iscritto all'Ordine degli Avvocati di Roma, n. 12345</footer>");
    expect(runOne(az005, ctxFrom(html.replace("Avv.", "Avvocato")))?.status).toBe("ok");
  });
  it("non si applica ad altre attività", () => expect(az005.run(clean())).toEqual([]));
});
