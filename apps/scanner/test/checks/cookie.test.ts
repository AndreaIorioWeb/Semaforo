import { describe, expect, it } from "vitest";
import type { BannerButton, BannerObservation, BrowserObservation, ObservedRequest } from "../../src/browser/types.js";
import { cookie001, cookie002, cookie003, cookie004, cookie005, cookie006, cookie007 } from "../../src/checks/cookie.js";
import type { ScanContext } from "../../src/scan/context.js";
import { ctxFrom, page, runOne } from "../fixtures.js";

const btn = (role: BannerButton["role"], text: string, w = 120, h = 40, extra: Partial<BannerButton> = {}): BannerButton => ({
  role, text, width: w, height: h, looksLikeLink: false, fontSize: 16, backgroundColor: "rgb(0,0,0)", color: "rgb(255,255,255)", ...extra,
});
const banner = (buttons: BannerButton[], extra: Partial<BannerObservation> = {}): BannerObservation => ({
  found: true, confidence: "high", text: "Usiamo i cookie", buttons, hasCategoryToggles: false, ...extra,
});
const NO_BANNER: BannerObservation = { found: false, confidence: "low", text: "", buttons: [], hasCategoryToggles: false };
const req = (url: string, resourceType = "script", method = "GET"): ObservedRequest => ({
  url, host: new URL(url).hostname, method, resourceType, thirdParty: true, outcome: "fetched", isNavigation: false,
});

function withBrowser(obs: Partial<BrowserObservation>, html = page(""), extra: Partial<ScanContext> = {}): ScanContext {
  const browser: BrowserObservation = {
    finalUrl: "https://esempio-sito.it/", html, cookies: [], requests: [], localStorageKeys: [], banner: NO_BANNER, iframes: [], durationMs: 1000, idleTimedOut: false, ...obs,
  };
  return ctxFrom(html, { browser, ...extra });
}
const gaCookie = { name: "_ga", domain: ".esempio-sito.it", path: "/", expires: 1, httpOnly: false, secure: false, thirdParty: false };

describe("COOKIE-001 tracciamento prima del consenso", () => {
  it("unverifiable senza browser", () => expect(runOne(cookie001, ctxFrom(page("")))?.status).toBe("unverifiable"));
  it("ko con cookie _ga", () => expect(runOne(cookie001, withBrowser({ cookies: [gaCookie] }))).toMatchObject({ status: "ko", severity: "high" }));
  it("ko con hit verso Google Analytics", () => {
    expect(runOne(cookie001, withBrowser({ requests: [req("https://region1.google-analytics.com/g/collect?v=2&tid=G-1", "fetch", "POST")] }))?.status).toBe("ko");
  });
  it("ko con pixel Meta (immagine)", () => {
    expect(runOne(cookie001, withBrowser({ requests: [req("https://www.facebook.com/tr?id=1&ev=PageView", "image")] }))?.status).toBe("ko");
  });
  it("warn (incerto) con solo script caricato", () => {
    expect(runOne(cookie001, withBrowser({ requests: [req("https://www.googletagmanager.com/gtag/js?id=G-1")] }))).toMatchObject({ status: "warn" });
  });
  it("warn (incerto) con Consent Mode negato", () => {
    expect(runOne(cookie001, withBrowser({ requests: [req("https://region1.google-analytics.com/g/collect?v=2&gcs=G100", "fetch", "POST")] }))?.status).toBe("warn");
  });
  it("ok senza tracker", () => expect(runOne(cookie001, withBrowser({ requests: [req("https://esempio-sito.it/app.js")] }))?.status).toBe("ok"));
});

describe("COOKIE-002 banner assente", () => {
  it("ko senza banner con tracciamento certo", () => expect(runOne(cookie002, withBrowser({ cookies: [gaCookie] }))?.status).toBe("ko"));
  it("warn senza banner con solo indizi", () => {
    expect(runOne(cookie002, withBrowser({ requests: [req("https://www.googletagmanager.com/gtm.js?id=GTM-1")] }))?.status).toBe("warn");
  });
  it("ok con banner", () => expect(runOne(cookie002, withBrowser({ cookies: [gaCookie], banner: banner([btn("accept", "Accetta")]) }))?.status).toBe("ok"));
  it("ok senza banner e senza tracker", () => expect(runOne(cookie002, withBrowser({}))?.status).toBe("ok"));
});

describe("COOKIE-003 pulsante Rifiuta", () => {
  it("ok con pulsanti equivalenti", () => {
    expect(runOne(cookie003, withBrowser({ banner: banner([btn("accept", "Accetta"), btn("reject", "Rifiuta")]) }))?.status).toBe("ok");
  });
  it("ko senza rifiuto né chiusura (banner certo)", () => {
    expect(runOne(cookie003, withBrowser({ banner: banner([btn("accept", "Accetta")]) }))).toMatchObject({ status: "ko", severity: "high" });
  });
  it("warn senza rifiuto se il banner è incerto", () => {
    expect(runOne(cookie003, withBrowser({ banner: banner([btn("accept", "Accetta")], { confidence: "low" }) }))?.status).toBe("warn");
  });
  it("warn se Rifiuta è un link piccolo", () => {
    const b = banner([btn("accept", "Accetta tutto", 200, 50), btn("reject", "rifiuta", 40, 14, { looksLikeLink: true, fontSize: 11 })]);
    expect(runOne(cookie003, withBrowser({ banner: b }))?.status).toBe("warn");
  });
  it("warn con sola X", () => expect(runOne(cookie003, withBrowser({ banner: banner([btn("accept", "Accetta"), btn("close", "×", 20, 20)]) }))?.status).toBe("warn"));
  it("nessun esito senza banner", () => expect(cookie003.run(withBrowser({}))).toEqual([]));
});

describe("COOKIE-004 scelta per categoria", () => {
  it("ok con Personalizza", () => expect(runOne(cookie004, withBrowser({ banner: banner([btn("accept", "Accetta"), btn("customize", "Personalizza")]) }))?.status).toBe("ok"));
  it("ok con interruttori di categoria", () => expect(runOne(cookie004, withBrowser({ banner: banner([btn("accept", "Accetta")], { hasCategoryToggles: true }) }))?.status).toBe("ok"));
  it("warn (mai ko) senza scelta", () => expect(runOne(cookie004, withBrowser({ banner: banner([btn("accept", "Accetta")]) }))?.status).toBe("warn"));
});

describe("COOKIE-005 cookie policy", () => {
  const links = page('<footer><a href="/cookie-policy">Cookie policy</a></footer>');
  const policy = (text: string) => [{ kind: "cookie" as const, url: "https://esempio-sito.it/cookie-policy", text, links: [] }];
  it("ko con tracker e nessun link alla policy", () => expect(runOne(cookie005, withBrowser({ cookies: [gaCookie] }))?.status).toBe("ko"));
  it("unverifiable con link ma testo non letto", () => expect(runOne(cookie005, withBrowser({ cookies: [gaCookie] }, links))?.status).toBe("unverifiable"));
  it("warn se non cita il servizio", () => {
    const f = runOne(cookie005, withBrowser({ cookies: [gaCookie] }, links, { legalPages: policy("Usiamo solo cookie tecnici.") }));
    expect(f?.status).toBe("warn");
  });
  it("ok se cita il servizio", () => {
    expect(runOne(cookie005, withBrowser({ cookies: [gaCookie] }, links, { legalPages: policy("Usiamo Google Analytics per le statistiche.") }))?.status).toBe("ok");
  });
});

describe("COOKIE-006 CDN esterni", () => {
  it("warn con Google Fonts (anche senza browser)", () => {
    const f = runOne(cookie006, ctxFrom(page("", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato">')));
    expect(f).toMatchObject({ status: "warn", severity: "medium" });
  });
  it("warn low con sola libreria da CDN", () => {
    expect(runOne(cookie006, withBrowser({ requests: [req("https://cdn.jsdelivr.net/npm/x.js")] }))).toMatchObject({ status: "warn", severity: "low" });
  });
  it("ok con risorse self-hosted", () => expect(runOne(cookie006, withBrowser({ requests: [req("https://esempio-sito.it/font.woff2", "font")] }))?.status).toBe("ok"));
});

describe("COOKIE-007 incorporamenti", () => {
  it("warn con YouTube caricato", () => expect(runOne(cookie007, withBrowser({ iframes: ["https://www.youtube.com/embed/abc"] }))).toMatchObject({ status: "warn", severity: "medium" }));
  it("warn low con youtube-nocookie", () => expect(runOne(cookie007, withBrowser({ iframes: ["https://www.youtube-nocookie.com/embed/abc"] }))).toMatchObject({ status: "warn", severity: "low" }));
  it("ok con incorporamento bloccato (data-src)", () => {
    expect(runOne(cookie007, withBrowser({}, page('<div data-src="https://www.youtube.com/embed/abc"></div>')))?.status).toBe("ok");
  });
  it("senza browser usa gli iframe nell'HTML", () => {
    expect(runOne(cookie007, ctxFrom(page('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>')))?.status).toBe("warn");
  });
});
