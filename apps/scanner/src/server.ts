import Fastify, { type FastifyInstance } from "fastify";
import { ERROR_MESSAGES } from "@semaforo/shared";
import type { Config } from "./config.js";
import type { AppContext } from "./context.js";
import { isScanError, ScanError } from "./errors.js";
import { type Job, JobStore } from "./jobs/job-store.js";
import { ScanQueue } from "./jobs/queue.js";
import { Metrics } from "./metrics.js";
import { type Db, openDatabase } from "./rate-limit/db.js";
import { RateLimiter } from "./rate-limit/rate-limiter.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerScanRoutes } from "./routes/scan.js";
import { type PipelineDeps, runScan, TOTAL_STEPS } from "./scan/pipeline.js";
import type { SafeFetchOptions } from "./security/safe-fetch.js";

export interface BuildOptions {
  config: Config;
  db?: Db;
  /** Opzioni di rete (nei test: resolver finto e dial verso server locali). */
  fetch?: SafeFetchOptions;
  /** Dipendenze della pipeline: DNS, browser, lettore pagine legali, check aggiuntivi. */
  pipeline?: Omit<PipelineDeps, "fetch" | "onProgress">;
  now?: () => number;
  logger?: boolean;
}

/** Header di sicurezza per le risposte API (HSTS va messo su nginx, dove termina il TLS). */
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "geolocation=(), camera=(), microphone=()",
  "cache-control": "no-store",
};

export async function buildServer(options: BuildOptions): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const { config } = options;
  const db = options.db ?? openDatabase(config.databasePath);
  const now = options.now ?? Date.now;

  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
    logger:
      options.logger === false
        ? false
        : {
            level: config.env === "production" ? "info" : "debug",
            // Nessun URL scansionato, IP o corpo nei log: solo metodo, rotta ed esito.
            serializers: {
              req: (req) => ({ method: req.method, route: req.routeOptions?.url }),
              res: (res) => ({ statusCode: res.statusCode }),
            },
          },
  });

  const jobs = new JobStore(undefined, now);
  const metrics = new Metrics();
  const rateLimiter = new RateLimiter(db, {
    perDay: config.rateLimitPerDay,
    globalPerHour: config.globalScansPerHour,
    now,
  });

  const queue = new ScanQueue<Job>(
    async (job, signal) => {
      const started = Date.now();
      jobs.markRunning(job);
      try {
        const url = job.targetUrl;
        if (!url) throw new ScanError("INTERNAL");
        const { report, timings } = await runScan(
          { url, siteType: job.siteType, jobId: job.id, expiresAt: job.expiresAt },
          {
            ...ctx.pipeline,
            fetch: ctx.fetch,
            onProgress: (step, index) => jobs.emit(job, { type: "progress", data: { ...step, index, total: TOTAL_STEPS } }),
          },
          signal,
        );
        jobs.complete(job, report);
        metrics.memory(timings.peakMemoryMb);
        app.log.info({ event: "scan_timings", ...timings });
        metrics.finished("done", Date.now() - started);
        app.log.info({ event: "scan_finished", outcome: "done", durationMs: Date.now() - started });
      } catch (err) {
        const scanErr = isScanError(err) ? err : new ScanError("INTERNAL", { cause: err });
        jobs.fail(job, { code: scanErr.code, message: scanErr.message });
        metrics.finished("error", Date.now() - started);
        app.log.info({ event: "scan_finished", outcome: "error", code: scanErr.code, durationMs: Date.now() - started });
      }
    },
    { concurrency: config.scanConcurrency, maxWaiting: config.scanMaxQueue, timeoutMs: config.scanTimeoutMs },
  );

  const ctx: AppContext = {
    config,
    jobs,
    queue,
    rateLimiter,
    metrics,
    fetch: { userAgent: config.userAgent, ...options.fetch },
    pipeline: { ...options.pipeline },
  };

  app.addHook("onSend", async (_request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!reply.hasHeader(name)) reply.header(name, value);
    }
    return payload;
  });

  app.setErrorHandler((error, _request, reply) => {
    if (isScanError(error)) {
      if (error.httpStatus >= 400 && error.httpStatus < 500) metrics.reject(error.code);
      return reply.code(error.httpStatus).send({ error: { code: error.code, message: error.message } });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.code(400).send({ error: { code: "INVALID_BODY", message: ERROR_MESSAGES.INVALID_BODY } });
    }
    const info = error as { name?: string; code?: string };
    app.log.error({ err: { name: info.name, code: info.code } }, "errore interno");
    return reply.code(500).send({ error: { code: "INTERNAL", message: ERROR_MESSAGES.INTERNAL } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "Risorsa non trovata." } }),
  );

  registerHealthRoutes(app, ctx);
  registerScanRoutes(app, ctx);

  app.addHook("onClose", async () => {
    queue.close();
    jobs.close();
    if (!options.db) db.close();
  });

  return { app, ctx };
}
