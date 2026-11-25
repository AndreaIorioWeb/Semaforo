import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { reportSchema } from "@semaforo/shared";
import { loadConfig } from "../src/config.js";
import type { AppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";
import { fakeResolver, PUBLIC_IP } from "./helpers.js";
import { fakeTxt, startSites } from "./site-server.js";

let sites: Awaited<ReturnType<typeof startSites>>;
const home = { "/": "@static/clean-home.html" };

beforeAll(async () => {
  sites = await startSites({
    "a.it": home,
    "b.it": home,
    "www.b.it": home,
    "c.it": home,
    "lento.it": {
      "/": (_req, res) => {
        setTimeout(() => {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<html><body>lento</body></html>");
        }, 300);
      },
    },
    "bloccato.it": { "/": () => undefined },
  });
});

afterAll(async () => sites.server.close());

/** Come il resolver dei siti fixture, più un dominio che risolve a un IP interno. */
const resolver = (host: string) => {
  if (host === "interno.it") return fakeResolver({ "interno.it": ["10.0.0.1"] })(host);
  return sites.resolver(host);
};
void PUBLIC_IP;

let app: FastifyInstance | undefined;

async function setup(env: Record<string, string> = {}, now?: () => number) {
  const config = loadConfig({
    FINGERPRINT_SALT: "salt-di-test-lungo-abbastanza-123",
    DATABASE_PATH: ":memory:",
    ...env,
  });
  const built = await buildServer({
    config,
    fetch: { resolver, dial: sites.dial },
    pipeline: { txtResolver: fakeTxt({ "a.it": ["v=spf1 -all"], "_dmarc.a.it": ["v=DMARC1; p=reject"] }) },
    logger: false,
    ...(now ? { now } : {}),
  });
  app = built.app;
  return built as { app: FastifyInstance; ctx: AppContext };
}

function scan(a: FastifyInstance, url: string, ua = "UA-test", extra: Record<string, unknown> = {}) {
  return a.inject({ method: "POST", url: "/api/scan", headers: { "user-agent": ua }, payload: { url, ...extra } });
}

function parseSse(body: string) {
  return body
    .split("\n\n")
    .filter((block) => block.includes("event:"))
    .map((block) => {
      const event = /event: (.+)/.exec(block)?.[1];
      const data = /data: (.+)/.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : undefined };
    });
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("API", () => {
  it("GET /api/health", async () => {
    const { app } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", queue: { running: 0, waiting: 0 } });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("flusso completo: POST, SSE fino a done, report JSON", async () => {
    const { app, ctx } = await setup();
    const post = await scan(app, "a.it", "UA", { siteType: "shop" });
    expect(post.statusCode).toBe(202);
    const { jobId } = post.json() as { jobId: string };
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);

    const sse = await app.inject({ method: "GET", url: `/api/scan/${jobId}/events` });
    expect(sse.headers["content-type"]).toContain("text/event-stream");
    const events = parseSse(sse.body);
    expect(events.filter((e) => e.event === "progress").length).toBeGreaterThan(3);
    expect(events.at(-1)).toEqual({ event: "done", data: { jobId } });
    expect(events[0]?.data).toMatchObject({ label: "Mi collego al sito", index: 1 });

    const report = await app.inject({ method: "GET", url: `/api/scan/${jobId}` });
    expect(report.statusCode).toBe(200);
    const parsed = reportSchema.parse(report.json());
    expect(parsed.siteType).toBe("shop");
    expect(parsed.unverifiable.length).toBeGreaterThan(0);
    expect(parsed.findings.find((f) => f.id === "AZ-001")?.status).toBe("ok");
    expect(parsed.findings.find((f) => f.id === "SEC-003")?.status).toBe("ok");
    expect(["low", "medium", "high"]).toContain(parsed.risk);
    // L'URL non resta nel job dopo la fine.
    expect(ctx.jobs.get(jobId)?.targetUrl).toBeUndefined();
  });

  it.each([
    ["http://localhost/", "URL_BLOCKED"],
    ["http://127.0.0.1/", "URL_BLOCKED"],
    ["http://[::1]/", "URL_BLOCKED"],
    ["http://169.254.169.254/", "URL_BLOCKED"],
    ["interno.it", "URL_BLOCKED"],
    ["file:///etc/passwd", "URL_SCHEME"],
    ["gopher://a.it/", "URL_SCHEME"],
    ["http://u:p@a.it/", "URL_CREDENTIALS"],
    ["a.it:8080", "URL_PORT"],
    ["nonesiste.it", "DNS_FAILED"],
  ])("400 per %s (%s) con messaggio in italiano", async (url, code) => {
    const { app } = await setup();
    const res = await scan(app, url);
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe(code);
    expect(body.error.message.length).toBeGreaterThan(10);
  });

  it("400 per corpo non valido", async () => {
    const { app } = await setup();
    for (const payload of [{}, { url: 123 }, { url: "a.it", siteType: "altro" }]) {
      const res = await app.inject({ method: "POST", url: "/api/scan", payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "INVALID_BODY" } });
    }
    const bad = await app.inject({
      method: "POST",
      url: "/api/scan",
      headers: { "content-type": "application/json" },
      payload: "{non json",
    });
    expect(bad.statusCode).toBe(400);
  });

  it("i rifiuti per URL non validi non consumano quota", async () => {
    const { app } = await setup();
    for (let i = 0; i < 5; i++) await scan(app, "http://127.0.0.1/");
    expect((await scan(app, "a.it")).statusCode).toBe(202);
    expect((await scan(app, "b.it")).statusCode).toBe(202);
  });

  it("429 al terzo sito, rianalisi consentita", async () => {
    const { app } = await setup();
    expect((await scan(app, "a.it")).statusCode).toBe(202);
    expect((await scan(app, "https://www.b.it/contatti")).statusCode).toBe(202);
    const third = await scan(app, "c.it");
    expect(third.statusCode).toBe(429);
    expect(third.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(Number(third.headers["retry-after"])).toBeGreaterThan(0);
    expect((await scan(app, "https://a.it/altra-pagina")).statusCode).toBe(202);
    // Un altro visitatore (user agent diverso) ha la sua quota.
    expect((await scan(app, "c.it", "Altro-UA")).statusCode).toBe(202);
  });

  it("429 globale oltre il limite orario", async () => {
    const { app } = await setup({ GLOBAL_SCANS_PER_HOUR: "2", RATE_LIMIT_PER_DAY: "10" });
    expect((await scan(app, "a.it", "u1")).statusCode).toBe(202);
    expect((await scan(app, "b.it", "u2")).statusCode).toBe(202);
    const res = await scan(app, "c.it", "u3");
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ error: { code: "GLOBAL_RATE_LIMITED" } });
  });

  it("503 quando la coda è piena, senza consumare quota", async () => {
    const { app, ctx } = await setup({ SCAN_MAX_QUEUE: "1", SCAN_CONCURRENCY: "1" });
    expect((await scan(app, "lento.it", "u1")).statusCode).toBe(202); // in esecuzione
    expect((await scan(app, "lento.it", "u2")).statusCode).toBe(202); // in attesa
    const full = await scan(app, "lento.it", "u3");
    expect(full.statusCode).toBe(503);
    expect(full.json()).toMatchObject({ error: { code: "QUEUE_FULL", message: "Il servizio è occupato, riprova tra poco." } });
    await ctx.queue.onIdle();
    // u3 non ha consumato quota: può ancora analizzare 2 siti.
    expect((await scan(app, "a.it", "u3")).statusCode).toBe(202);
    expect((await scan(app, "b.it", "u3")).statusCode).toBe(202);
  });

  it("404 per job inesistente o con id non valido", async () => {
    const { app } = await setup();
    for (const url of [
      "/api/scan/00000000-0000-0000-0000-000000000000",
      "/api/scan/00000000-0000-0000-0000-000000000000/events",
      "/api/scan/../../etc/passwd",
      "/api/scan/abc",
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(404);
    }
  });

  it("il job scade dopo 60 minuti", async () => {
    let now = Date.now();
    const { app, ctx } = await setup({}, () => now);
    const { jobId } = (await scan(app, "a.it")).json() as { jobId: string };
    await ctx.queue.onIdle();
    expect((await app.inject({ method: "GET", url: `/api/scan/${jobId}` })).statusCode).toBe(200);
    now += 60 * 60 * 1000;
    const expired = await app.inject({ method: "GET", url: `/api/scan/${jobId}` });
    expect(expired.statusCode).toBe(404);
    expect(expired.json()).toMatchObject({ error: { code: "JOB_NOT_FOUND" } });
  });

  it("SSE invia un evento error se la scansione supera il timeout", async () => {
    const { app } = await setup({ SCAN_TIMEOUT_MS: "1000" });
    const { jobId } = (await scan(app, "bloccato.it")).json() as { jobId: string };
    const sse = await app.inject({ method: "GET", url: `/api/scan/${jobId}/events` });
    const last = parseSse(sse.body).at(-1);
    expect(last).toMatchObject({ event: "error", data: { code: "TIMEOUT" } });
    const status = await app.inject({ method: "GET", url: `/api/scan/${jobId}` });
    expect(status.json()).toMatchObject({ state: "error", error: { code: "TIMEOUT" } });
  });
});

describe("config", () => {
  it("in produzione richiede FINGERPRINT_SALT", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/FINGERPRINT_SALT/);
    expect(() => loadConfig({ FINGERPRINT_SALT: "corto" })).toThrow(/corto/);
  });

  it("usa i default della SPEC", () => {
    const c = loadConfig({});
    expect(c.rateLimitPerDay).toBe(2);
    expect(c.scanConcurrency).toBe(1);
    expect(c.scanMaxQueue).toBe(10);
    expect(c.scanTimeoutMs).toBe(60_000);
    expect(c.globalScansPerHour).toBe(30);
    expect(c.userAgent).toBe("SemaforoBot/1.0 (+http://localhost:3000/metodologia)");
  });
});
