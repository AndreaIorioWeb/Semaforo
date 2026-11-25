/**
 * Scanner per i test e2e del sito (apps/web/e2e). NON per produzione.
 * - siti fixture locali raggiungibili tramite resolver finto + dial
 * - "semaforo.test" punta al sito Next in esecuzione (dogfooding)
 * - le email dei lead sono raccolte in memoria ed esposte su una porta di servizio
 */
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Transporter } from "nodemailer";
import { BrowserManager, createBrowserRunner } from "../src/browser/index.js";
import { loadConfig } from "../src/config.js";
import { createPdfRenderer } from "../src/pdf/render.js";
import type { ResolvedAddress } from "../src/security/resolver.js";
import { buildServer } from "../src/server.js";
import { fixture } from "./fixtures.js";
import { PUBLIC_IP, PUBLIC_IP_2, startServer } from "./helpers.js";
import { fakeTxt } from "./site-server.js";

const PORT = Number(process.env.PORT ?? 3101);
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 3102);
const WEB_PORT = Number(process.env.WEB_PORT ?? 3100);

const file = (path: string) => (_req: http.IncomingMessage, res: http.ServerResponse) => {
  const type = path.endsWith(".js") ? "application/javascript" : "text/html; charset=utf-8";
  res.writeHead(200, { "content-type": type });
  res.end(fixture(path));
};
const text = (body: string, type: string) => (_req: http.IncomingMessage, res: http.ServerResponse) => {
  res.writeHead(200, { "content-type": type });
  res.end(body);
};

const sites: Record<string, Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void>> = {
  "ga-prima.it": { "/": file("sites/ga-prima.html"), "/cookie-policy": file("sites/cookie-policy-generica.html") },
  "www.googletagmanager.com": { "/gtag/js": file("sites/gtag.js") },
  "fonts.googleapis.com": { "/css2": text("body{}", "text/css") },
  "www.youtube.com": { "/embed/abc123": text("<html><body>video</body></html>", "text/html") },
  "corretto.it": {
    "/": file("sites/corretto.html"),
    "/fonts/fonts.css": text("body{}", "text/css"),
    "/privacy-policy": file("sites/privacy-completa.html"),
    "/cookie-policy": file("sites/cookie-policy-generica.html"),
  },
};

const fixtures = await startServer((req, res) => {
  const host = (req.headers.host ?? "").split(":")[0] ?? "";
  const path = (req.url ?? "/").split("?")[0] ?? "/";
  const route = sites[host]?.[path];
  if (route) return route(req, res);
  res.writeHead(404, { "content-type": "text/html" });
  res.end("<h1>Non trovato</h1>");
});

const hostTable: Record<string, string> = { "semaforo.test": PUBLIC_IP_2, ...Object.fromEntries(Object.keys(sites).map((h) => [h, PUBLIC_IP])) };
const resolver = async (host: string): Promise<ResolvedAddress[]> => {
  const ip = hostTable[host];
  if (!ip) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  return [{ address: ip, family: 4 }];
};
const dial = (address: ResolvedAddress) =>
  address.address === PUBLIC_IP_2 ? { host: "127.0.0.1", port: WEB_PORT } : { host: "127.0.0.1", port: fixtures.port };

const mails: unknown[] = [];
const mailTransport = { sendMail: async (mail: unknown) => (mails.push(mail), {}) } as unknown as Transporter;

const config = loadConfig({
  ...process.env,
  FINGERPRINT_SALT: "salt-solo-per-i-test-e2e-1234567890",
  DATABASE_PATH: join(mkdtempSync(join(tmpdir(), "semaforo-e2e-")), "db.sqlite"),
  RATE_LIMIT_PER_DAY: "100",
  GLOBAL_SCANS_PER_HOUR: "1000",
  SCAN_MAX_QUEUE: "20",
  LEAD_TO: "autore@semaforo.test",
  SMTP_FROM: "semaforo@semaforo.test",
});

const manager = new BrowserManager();
const { app } = await buildServer({
  config,
  logger: false,
  fetch: { resolver, dial, userAgent: config.userAgent },
  pipeline: {
    browser: createBrowserRunner(manager, { botUserAgent: config.userAgent, idleCapMs: 3_000 }),
    txtResolver: fakeTxt({
      "semaforo.test": ["v=spf1 -all"],
      "_dmarc.semaforo.test": ["v=DMARC1; p=reject"],
    }),
  },
  pdf: createPdfRenderer(manager),
  mailTransport,
});
await app.listen({ port: PORT, host: "127.0.0.1" });

http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(req.url === "/mails" ? mails : { ok: true }));
  })
  .listen(ADMIN_PORT, "127.0.0.1");

const stop = async () => {
  await app.close();
  await manager.close();
  await fixtures.close();
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
