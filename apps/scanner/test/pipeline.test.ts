import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScan } from "../src/scan/pipeline.js";
import { FAKE_STRIPE_KEY } from "./fixtures.js";
import { fakeTxt, startSites } from "./site-server.js";

let sites: Awaited<ReturnType<typeof startSites>>;

beforeAll(async () => {
  sites = await startSites({
    "vecchio-blog.it": {
      "/": "@static/wordpress-old.html",
      "/robots.txt": "User-agent: *\nDisallow: /",
      "/wp-includes/js/jquery/jquery.min.js": "/*! jQuery v1.12.4 | (c) jQuery Foundation */",
    },
    "falegnameria-rossi.it": {
      "/": "@static/clean-home.html",
      "/robots.txt": "User-agent: *\nDisallow:\nSitemap: http://falegnameria-rossi.it/sitemap.xml",
      "/sitemap.xml": '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
      "/assets/app.js": "console.log('ok')",
    },
  });
});

afterAll(async () => sites.server.close());

const scan = (url: string) =>
  runScan(
    { url, siteType: "auto", jobId: "test-job", expiresAt: Date.now() + 3_600_000 },
    {
      fetch: { resolver: sites.resolver, dial: sites.dial },
      txtResolver: fakeTxt({ "falegnameria-rossi.it": ["v=spf1 include:_spf.aruba.it -all"], "_dmarc.falegnameria-rossi.it": ["v=DMARC1; p=quarantine"] }),
    },
    new AbortController().signal,
  );

describe("pipeline Milestone 2", () => {
  it("sito WordPress trascurato: trova i problemi attesi", async () => {
    const { report, ctx } = await scan("vecchio-blog.it");
    const byId = Object.fromEntries(report.findings.map((f) => [f.id, f]));

    expect(report.cms).toBe("WordPress");
    expect(report.siteType).toBe("showcase");
    expect(report.risk).toBe("high");
    expect(byId["PUB-001"]?.status).toBe("ko");
    expect(byId["PUB-002"]?.status).toBe("ko");
    expect(byId["SEC-001"]?.status).toBe("ko"); // fixture solo http
    expect(byId["SEC-004"]?.status).toBe("ko");
    expect(byId["SEC-005"]?.status).toBe("warn");
    expect(byId["SEC-006"]?.status).toBe("warn");
    expect(byId["SEC-003"]?.status).toBe("warn");
    expect(byId["PRIV-004"]?.status).toBe("ko");
    expect(ctx.robotsTxt).toContain("Disallow: /");

    // Prompt solo per ko/warn, con istruzioni WordPress.
    expect(byId["PUB-001"]?.fixPrompt).toContain("functions.php");
    expect(byId["PUB-001"]?.fixPrompt?.trim().endsWith("verificate con un professionista.")).toBe(true);

    // Il segreto non compare mai in chiaro nel report.
    expect(JSON.stringify(report)).not.toContain(FAKE_STRIPE_KEY);
  });

  it("sito corretto: nessun ko", async () => {
    const { report, ctx } = await scan("falegnameria-rossi.it");
    const ko = report.findings.filter((f) => f.status === "ko").map((f) => f.id);
    // SEC-001 è ko solo perché la fixture locale non ha HTTPS.
    expect(ko).toEqual(["SEC-001"]);
    expect(ctx.sitemapFound).toBe(true);
    expect(ctx.notFoundStatus).toBe(404);
    expect(report.findings.find((f) => f.id === "PUB-006")?.status).toBe("ok");
    expect(report.findings.find((f) => f.id === "SEC-003")?.status).toBe("ok");
  });

  it("controlli passivi: nessuna richiesta a percorsi sensibili", async () => {
    sites.server.requests.length = 0;
    await scan("vecchio-blog.it");
    const paths = sites.server.requests.map((r) => r.path);
    for (const p of paths) {
      expect(p).not.toMatch(/wp-admin|wp-login|\.env|\.git|readme\.html|backup|\.sql|xmlrpc/i);
    }
    const allowed = /^\/($|robots\.txt|sitemap\.xml|\.well-known\/security\.txt|semaforo-[0-9a-f]+-pagina-inesistente|wp-includes\/js\/jquery\/jquery\.min\.js|assets\/app\.js)/;
    expect(paths.filter((p) => !allowed.test(p))).toEqual([]);
    expect(sites.server.requests.every((r) => r.userAgent?.startsWith("SemaforoBot/1.0"))).toBe(true);
  });
});
