import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Finding, Report } from "@semaforo/shared";
import { BrowserManager, createBrowserRunner } from "../../src/browser/index.js";
import { observePage } from "../../src/browser/observe.js";
import type { ScanContext } from "../../src/scan/context.js";
import { runScan } from "../../src/scan/pipeline.js";
import type { Resolver } from "../../src/security/resolver.js";
import { fixture } from "../fixtures.js";
import { fakeResolver, PUBLIC_IP } from "../helpers.js";
import { fakeTxt, type Route, startSites } from "../site-server.js";

const BOT_UA = "SemaforoBot/1.0 (+http://localhost:3000/metodologia)";
let sites: Awaited<ReturnType<typeof startSites>>;
let resolver: Resolver;
const manager = new BrowserManager();
const measures: Array<{ site: string; totalMs: number; browserMs: number; peakMb: number; chromiumMb: number; subrequests: number }> = [];

const file = (path: string): Route => (_req, res) => {
  const type = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : "text/html; charset=utf-8";
  res.writeHead(200, { "content-type": type });
  res.end(fixture(path).replaceAll("{{PORT}}", String(sites.server.port)));
};
const text = (body: string, type = "text/plain"): Route => (_req, res) => {
  res.writeHead(200, { "content-type": type });
  res.end(body);
};

beforeAll(async () => {
  sites = await startSites({
    "ga-prima.it": { "/": file("sites/ga-prima.html"), "/cookie-policy": file("sites/cookie-policy-generica.html") },
    "www.googletagmanager.com": { "/gtag/js": file("sites/gtag.js") },
    "region1.google-analytics.com": {},
    "fonts.googleapis.com": { "/css2": text("@font-face{font-family:Lato}", "text/css") },
    "www.youtube.com": { "/embed/abc123": text("<html><body>video</body></html>", "text/html") },
    "corretto.it": {
      "/": file("sites/corretto.html"),
      "/fonts/fonts.css": text("@font-face{font-family:Inter;src:url(/fonts/inter.woff2)}", "text/css"),
      "/privacy-policy": file("sites/privacy-completa.html"),
      "/cookie-policy": file("sites/cookie-policy-generica.html"),
      "/robots.txt": text("User-agent: *\nDisallow:\n"),
    },
    "senza-banner.it": { "/": file("sites/senza-banner.html") },
    "connect.facebook.net": { "/en_US/fbevents.js": file("sites/fbevents.js") },
    "www.facebook.com": {},
    "negozio.it": {
      "/": file("sites/negozio.html"),
      "/condizioni-di-vendita": file("sites/condizioni-vendita.html"),
      "/diritto-di-recesso": file("sites/recesso.html"),
      "/privacy-policy": file("sites/privacy-completa.html"),
      "/note-legali": text("<html><body>NON DOVREI ESSERE LETTA</body></html>", "text/html"),
      "/robots.txt": text("User-agent: *\nDisallow: /note-legali\n"),
    },
    "trappola.it": { "/": file("sites/trappola.html") },
    "pubblico-redirect.it": {
      "/redirect.js": (_req, res) => {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/segreto-redirect" });
        res.end();
      },
      "/a.js": (_req, res) => {
        res.writeHead(302, { location: "/b.js" });
        res.end();
      },
      "/b.js": text("window.redirectOk = true", "application/javascript"),
    },
    "home-redirect.it": {
      "/": (_req, res) => {
        res.writeHead(301, { location: "/benvenuto" });
        res.end();
      },
      "/benvenuto": text('<html><body><script src="http://pubblico-redirect.it/a.js"></script></body></html>', "text/html"),
    },
    "nav-interna.it": {
      "/": (_req, res) => {
        res.writeHead(302, { location: `http://127.0.0.1:${sites.server.port}/segreto-nav-redirect` });
        res.end();
      },
    },
    "isolamento.it": {
      "/": (req, res) => {
        const returning = /visita=1/.test(req.headers.cookie ?? "");
        res.writeHead(200, { "content-type": "text/html", "set-cookie": returning ? "ritorno=1; Path=/" : "visita=1; Path=/" });
        res.end("<html><body><h1>Isolamento</h1></body></html>");
      },
    },
    "pesante.it": {
      "/": text(`<html><body>${Array.from({ length: 70 }, (_, i) => `<script src="/s${i}.js"></script>`).join("")}</body></html>`, "text/html"),
      ...Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`/s${i}.js`, text(`window.s${i}=1`, "application/javascript")])),
    },
    "lento-browser.it": {
      "/": text('<html><body><script src="/mai.js"></script></body></html>', "text/html"),
      "/mai.js": () => undefined,
    },
  });
  const internal = fakeResolver({ "interno.it": ["10.0.0.1"] });
  resolver = async (host) => (host === "interno.it" ? internal(host) : sites.resolver(host));
});

afterAll(async () => {
  await manager.close();
  await sites.server.close();
  if (measures.length > 0) {
    writeFileSync(new URL("../../e2e-measures.json", import.meta.url), `${JSON.stringify(measures, null, 2)}\n`);
  }
});

const runner = () => createBrowserRunner(manager, { botUserAgent: BOT_UA, idleCapMs: 4_000 });

async function scan(site: string, siteType: "auto" | "shop" | "showcase" = "auto"): Promise<{ report: Report; ctx: ScanContext; byId: Record<string, Finding> }> {
  const { report, ctx, timings } = await runScan(
    { url: site, siteType, jobId: "e2e", expiresAt: Date.now() + 3_600_000 },
    { fetch: { resolver, dial: sites.dial, userAgent: BOT_UA }, browser: runner(), txtResolver: fakeTxt({}) },
    AbortSignal.timeout(60_000),
  );
  measures.push({
    site,
    totalMs: timings.total ?? 0,
    browserMs: timings.browser ?? 0,
    peakMb: timings.peakMemoryMb ?? 0,
    chromiumMb: timings.chromiumMemoryMb ?? 0,
    subrequests: timings.subrequests ?? 0,
  });
  return { report, ctx, byId: Object.fromEntries(report.findings.map((f) => [f.id, f])) };
}

describe("e2e: sito con Google Analytics prima del consenso", () => {
  it("rileva tracciamento, banner sbilanciato, font e video esterni", async () => {
    const { byId, ctx } = await scan("ga-prima.it");
    expect(ctx.browser?.cookies.map((c) => c.name)).toEqual(expect.arrayContaining(["_ga", "_ga_TEST123"]));
    expect(byId["COOKIE-001"]).toMatchObject({ status: "ko", severity: "high" });
    expect(byId["COOKIE-001"]?.evidence?.join(" ")).toContain("Google Analytics");
    expect(byId["COOKIE-002"]?.status).toBe("ok");
    expect(byId["COOKIE-003"]?.status).toBe("warn");
    expect(byId["COOKIE-004"]?.status).toBe("warn");
    expect(byId["COOKIE-005"]?.status).toBe("warn");
    expect(byId["COOKIE-005"]?.evidence?.join(" ")).toContain("Google Analytics");
    expect(byId["COOKIE-006"]?.evidence?.join(" ")).toContain("Google Fonts");
    expect(byId["COOKIE-007"]).toMatchObject({ status: "warn", severity: "medium" });
    // Il beacon POST non viene inoltrato: solo annotato.
    const beacon = ctx.browser?.requests.find((r) => r.host === "region1.google-analytics.com");
    expect(beacon).toMatchObject({ method: "POST", outcome: "recorded" });
    expect(sites.server.requests.some((r) => r.host === "region1.google-analytics.com")).toBe(false);
  });
});

describe("e2e: sito corretto", () => {
  it("nessun ko su cookie e privacy", async () => {
    const { report, byId, ctx } = await scan("corretto.it");
    for (const id of ["COOKIE-001", "COOKIE-002", "COOKIE-003", "COOKIE-004", "COOKIE-005", "COOKIE-006", "COOKIE-007"]) {
      expect(byId[id]?.status, id).toBe("ok");
    }
    expect(byId["PRIV-002"]?.status).toBe("ok");
    expect(ctx.browser?.banner).toMatchObject({ found: true, confidence: "high" });
    // Unico ko ammesso: HTTPS, perché i siti fixture locali sono in http.
    expect(report.findings.filter((f) => f.status === "ko").map((f) => f.id)).toEqual(["SEC-001"]);
    // gtag.js non deve essere stato richiesto: si carica solo al clic su Accetta.
    expect(ctx.browser?.requests.some((r) => r.host === "www.googletagmanager.com")).toBe(false);
  });
});

describe("e2e: sito senza banner", () => {
  it("Meta Pixel attivo senza banner: ko", async () => {
    const { byId } = await scan("senza-banner.it");
    expect(byId["COOKIE-001"]).toMatchObject({ status: "ko" });
    expect(byId["COOKIE-001"]?.evidence?.join(" ")).toMatch(/_fbp|Meta Pixel/);
    expect(byId["COOKIE-002"]).toMatchObject({ status: "ko", severity: "high" });
    expect(byId["COOKIE-005"]).toMatchObject({ status: "ko" });
    expect(byId["COOKIE-003"]).toBeUndefined();
  });
});

describe("e2e: negozio online e pagine legali", () => {
  it("legge le pagine di vendita, rispetta robots.txt, verifica i VEND", async () => {
    sites.server.requests.length = 0;
    const { report, byId, ctx } = await scan("negozio.it");
    expect(report.siteType).toBe("shop");
    expect(ctx.legalPages.map((p) => p.kind).sort()).toEqual(["privacy", "sales", "withdrawal"]);
    expect(sites.server.requests.some((r) => r.path === "/note-legali")).toBe(false);
    expect(report.unverifiable.join(" ")).toMatch(/robots\.txt ne vieta/);
    expect(byId["VEND-001"]?.status).toBe("ok");
    expect(byId["VEND-002"]?.status).toBe("ok");
    expect(byId["VEND-003"]).toMatchObject({ status: "warn", severity: "info" });
    expect(byId["VEND-004"]?.status).toBe("ok");
    expect(byId["VEND-005"]?.status).toBe("ok");
    expect(byId["VEND-006"]?.status).toBe("warn");
    expect(byId["VEND-007"]?.status).toBe("ok");
  });

  it("i VEND non si applicano a un sito vetrina", async () => {
    const { report } = await scan("corretto.it");
    expect(report.findings.some((f) => f.category === "vendita")).toBe(false);
  });
});

describe("e2e: sicurezza del browser", () => {
  it("SSRF: nessuna sottorichiesta raggiunge indirizzi interni", async () => {
    sites.server.requests.length = 0;
    const browser = await manager.get();
    const obs = await observePage(browser, "http://trappola.it/", {
      fetch: { resolver, dial: sites.dial },
      signal: AbortSignal.timeout(30_000),
      idleCapMs: 3_000,
    });

    // Il server locale (127.0.0.1) non deve aver ricevuto nessuna richiesta "segreta".
    const leaked = sites.server.requests.filter((r) => r.path.includes("segreto"));
    expect(leaked).toEqual([]);

    const blocked = (frag: string) => obs.requests.find((r) => r.url.includes(frag));
    for (const frag of ["segreto-script.js", "segreto-metadata", "segreto-dns-privato", "segreto-ipv6", "segreto-css", "segreto-fetch", "segreto-xhr", "segreto-navigazione"]) {
      expect(blocked(frag)?.outcome, frag).toBe("blocked");
    }
    // Sottorisorsa pubblica che reindirizza verso il metadata cloud: il salto è bloccato da safeFetch.
    expect(blocked("redirect.js")).toMatchObject({ outcome: "blocked", blockReason: "URL_BLOCKED" });
    expect(blocked("segreto-dns-privato")?.blockReason).toBe("URL_BLOCKED");
    expect(blocked("segreto-ws")).toMatchObject({ outcome: "blocked", blockReason: "websocket non consentiti" });
    // Immagini e iframe interni: annotati o bloccati, mai scaricati.
    expect(blocked("segreto-img")?.outcome).not.toBe("fetched");
    expect(blocked("segreto-iframe")?.outcome).toBe("blocked");
    // POST mai inoltrate.
    expect(blocked("segreto-post")).toMatchObject({ method: "POST", outcome: "recorded" });
    expect(sites.server.requests.some((r) => r.path.includes("/api/"))).toBe(false);
    // La pagina resta sul sito: la navigazione verso 127.0.0.1 è stata bloccata.
    expect(obs.finalUrl).toBe("http://trappola.it/");
  });

  it("redirect legittimi: home e sottorisorse funzionano e passano dai controlli", async () => {
    const browser = await manager.get();
    const obs = await observePage(browser, "http://home-redirect.it/", { fetch: { resolver, dial: sites.dial }, signal: AbortSignal.timeout(30_000), idleCapMs: 2_000 });
    // Il redirect è seguito da safeFetch: il contenuto finale è servito sull'URL richiesto.
    expect(obs.requests.find((r) => r.url === "http://home-redirect.it/")?.outcome).toBe("fetched");
    expect(sites.server.requests.some((r) => r.path === "/benvenuto")).toBe(true);
    expect(obs.requests.find((r) => r.url.endsWith("/a.js"))?.outcome).toBe("fetched");
    expect(sites.server.requests.some((r) => r.path === "/b.js")).toBe(true);
  });

  it("redirect della home verso un IP interno: bloccato, nessuna richiesta parte", async () => {
    sites.server.requests.length = 0;
    const browser = await manager.get();
    await expect(
      observePage(browser, "http://nav-interna.it/", { fetch: { resolver, dial: sites.dial }, signal: AbortSignal.timeout(30_000), idleCapMs: 2_000 }),
    ).rejects.toThrow();
    expect(sites.server.requests.filter((r) => r.path.includes("segreto"))).toEqual([]);
  });

  it("contesto isolato: nessun cookie passa da una scansione all'altra", async () => {
    const browser = await manager.get();
    const opts = { fetch: { resolver, dial: sites.dial }, signal: AbortSignal.timeout(30_000), idleCapMs: 2_000 };
    const first = await observePage(browser, "http://isolamento.it/", opts);
    const second = await observePage(browser, "http://isolamento.it/", opts);
    expect(first.cookies.map((c) => c.name)).toEqual(["visita"]);
    expect(second.cookies.map((c) => c.name)).toEqual(["visita"]);
  });

  it("limite di 50 sottorisorse scaricate", async () => {
    const browser = await manager.get();
    const obs = await observePage(browser, "http://pesante.it/", { fetch: { resolver, dial: sites.dial }, signal: AbortSignal.timeout(30_000), idleCapMs: 3_000 });
    expect(obs.requests.filter((r) => r.outcome === "fetched").length).toBe(50);
    expect(obs.requests.filter((r) => r.blockReason === "limite di sottorisorse raggiunto").length).toBeGreaterThan(0);
  });

  it("timeout: la scansione si interrompe con il segnale", async () => {
    const browser = await manager.get();
    const started = Date.now();
    await expect(
      observePage(browser, "http://lento-browser.it/", { fetch: { resolver, dial: sites.dial }, signal: AbortSignal.timeout(1_500), navigationTimeoutMs: 20_000 }),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("user agent dichiarato e nessuna risorsa del sito fuori dal fetch controllato", async () => {
    sites.server.requests.length = 0;
    await scan("corretto.it");
    expect(sites.server.requests.length).toBeGreaterThan(0);
    expect(sites.server.requests.every((r) => r.userAgent?.includes("SemaforoBot/1.0"))).toBe(true);
    void PUBLIC_IP;
  });
});
