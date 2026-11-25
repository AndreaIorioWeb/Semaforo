import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { scanRequestSchema } from "@semaforo/shared";
import type { AppContext } from "../context.js";
import { ScanError } from "../errors.js";
import type { JobEvent } from "../jobs/job-store.js";
import { siteKey, visitorFingerprint } from "../rate-limit/fingerprint.js";
import { assertPublicUrl } from "../security/guard.js";
import { bareHostname, parseTargetUrl } from "../security/url-policy.js";

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SSE_HEARTBEAT_MS = 15_000;

function jobIdParam(request: FastifyRequest): string {
  const { jobId } = request.params as { jobId?: string };
  if (!jobId || !JOB_ID.test(jobId)) throw new ScanError("JOB_NOT_FOUND");
  return jobId;
}

export function registerScanRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/scan", async (request, reply) => {
    const parsed = scanRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ScanError("INVALID_BODY");
    const { url: input, siteType } = parsed.data;

    // 1. Validazione sintattica (economica, nessuna rete).
    const syntactic = parseTargetUrl(input, ctx.fetch);

    // 2. Limite: verifica senza consumare, così non si fanno lookup DNS per chi ha già esaurito la quota.
    const fingerprint = visitorFingerprint(request.ip, request.headers["user-agent"] ?? "", ctx.config.fingerprintSalt);
    const site = siteKey(bareHostname(syntactic), ctx.config.fingerprintSalt);
    throwIfLimited(ctx.rateLimiter.check(fingerprint, site), reply);

    // 3. Anti SSRF completo: DNS e IP pubblici.
    const { url } = await assertPublicUrl(syntactic, ctx.fetch);

    // 4. Coda piena: non si consuma quota.
    if (!ctx.queue.hasCapacity()) throw new ScanError("QUEUE_FULL");

    // 5. Consumo atomico della quota e accodamento.
    throwIfLimited(ctx.rateLimiter.consume(fingerprint, site), reply);
    const job = ctx.jobs.create(url.href, siteType);
    if (!ctx.queue.enqueue(job)) throw new ScanError("QUEUE_FULL");
    ctx.metrics.started();

    return reply.code(202).send({ jobId: job.id });
  });

  app.get("/api/scan/:jobId", async (request, reply) => {
    const job = ctx.jobs.get(jobIdParam(request));
    if (!job) throw new ScanError("JOB_NOT_FOUND");
    if (job.state === "done" && job.report) return job.report;
    if (job.state === "error") return reply.code(200).send({ jobId: job.id, state: job.state, error: job.error });
    return reply.code(202).send({ jobId: job.id, state: job.state });
  });

  app.get("/api/scan/:jobId/pdf", async (request, reply) => {
    const job = ctx.jobs.get(jobIdParam(request));
    if (!job) throw new ScanError("JOB_NOT_FOUND");
    if (job.state !== "done" || !job.report) throw new ScanError("JOB_NOT_FOUND");
    if (!ctx.pdf) throw new ScanError("PDF_UNAVAILABLE");
    let pdf: Buffer;
    try {
      pdf = await ctx.pdf(job.report);
    } catch {
      throw new ScanError("PDF_UNAVAILABLE");
    }
    const host = job.report.siteUrl ? new URL(job.report.siteUrl).hostname.replace(/[^a-z0-9.-]/gi, "") : "sito";
    const date = job.report.scannedAt.slice(0, 10);
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="semaforo-${host}-${date}.pdf"`)
      .send(pdf);
  });

  app.get("/api/scan/:jobId/events", (request, reply) => {
    const job = ctx.jobs.get(jobIdParam(request));
    if (!job) throw new ScanError("JOB_NOT_FOUND");

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
    });

    const lastEventId = Number(request.headers["last-event-id"] ?? 0) || 0;
    let closed = false;
    const write = (event: JobEvent) => {
      if (closed) return;
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      if (event.type === "done" || event.type === "error") close();
    };
    const heartbeat = setInterval(() => res.write(": ping\n\n"), SSE_HEARTBEAT_MS);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      job.emitter.off("event", write);
      res.end();
    };

    res.write("retry: 3000\n\n");
    for (const event of job.events) if (event.id > lastEventId) write(event);
    if (!closed) {
      job.emitter.on("event", write);
      request.raw.on("close", close);
    }
  });
}

function throwIfLimited(decision: ReturnType<AppContext["rateLimiter"]["check"]>, reply: FastifyReply): void {
  if (decision.allowed) return;
  reply.header("retry-after", String(decision.retryAfterSeconds));
  throw new ScanError(decision.reason === "global" ? "GLOBAL_RATE_LIMITED" : "RATE_LIMITED");
}
