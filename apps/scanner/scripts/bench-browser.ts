/**
 * Misura tempi e memoria della scansione con browser sui siti fixture locali.
 * Uso: pnpm --filter @semaforo/scanner bench [ripetizioni]
 */
import { BrowserManager, createBrowserRunner } from "../src/browser/index.js";
import { sampleMemory } from "../src/browser/resources.js";
import { runScan } from "../src/scan/pipeline.js";
import { fixture } from "../test/fixtures.js";
import { fakeTxt, startSites, type Route } from "../test/site-server.js";

const runs = Number(process.argv[2] ?? 5);
const file = (p: string): Route => (_q, r) => {
  r.writeHead(200, { "content-type": p.endsWith(".js") ? "application/javascript" : "text/html; charset=utf-8" });
  r.end(fixture(p));
};

const sites = await startSites({
  "ga-prima.it": { "/": file("sites/ga-prima.html"), "/cookie-policy": file("sites/cookie-policy-generica.html") },
  "www.googletagmanager.com": { "/gtag/js": file("sites/gtag.js") },
  "region1.google-analytics.com": {},
  "fonts.googleapis.com": { "/css2": "body{}" },
  "www.youtube.com": { "/embed/abc123": "<html>video</html>" },
  "negozio.it": {
    "/": file("sites/negozio.html"),
    "/condizioni-di-vendita": file("sites/condizioni-vendita.html"),
    "/diritto-di-recesso": file("sites/recesso.html"),
    "/privacy-policy": file("sites/privacy-completa.html"),
  },
});

const baseline = sampleMemory();
const manager = new BrowserManager();
const browser = createBrowserRunner(manager, { botUserAgent: "SemaforoBot/1.0 (+bench)", idleCapMs: 4_000 });
const rows: Array<Record<string, number | string>> = [];

for (let i = 0; i < runs; i++) {
  for (const site of ["ga-prima.it", "negozio.it"]) {
    const { timings } = await runScan(
      { url: site, siteType: "auto", jobId: "bench", expiresAt: Date.now() + 60_000 },
      { fetch: { resolver: sites.resolver, dial: sites.dial }, browser, txtResolver: fakeTxt({}) },
      AbortSignal.timeout(60_000),
    );
    rows.push({ run: i + 1, site, totalMs: timings.total ?? 0, browserMs: timings.browser ?? 0, peakMb: timings.peakMemoryMb ?? 0, chromiumMb: timings.chromiumMemoryMb ?? 0 });
  }
}
const idleWithBrowser = sampleMemory();
await manager.close();
await sites.server.close();

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const num = (k: string) => rows.map((r) => Number(r[k]));
console.table(rows);
console.log(JSON.stringify({
  baselineNodeMb: baseline.nodeMb,
  idleWithBrowserMb: idleWithBrowser,
  medianTotalMs: median(num("totalMs")),
  maxTotalMs: Math.max(...num("totalMs")),
  medianPeakMb: median(num("peakMb")),
  maxPeakMb: Math.max(...num("peakMb")),
  maxChromiumMb: Math.max(...num("chromiumMb")),
}, null, 2));
