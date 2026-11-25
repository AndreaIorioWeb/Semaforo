import { leadSchema } from "@semaforo/shared";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { ScanError } from "../errors.js";
import { visitorFingerprint } from "../rate-limit/fingerprint.js";

const MAX_LEADS_PER_DAY = 5;

export function registerLeadRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/lead", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    // Campo trappola compilato: ai bot rispondiamo "ok" senza salvare nulla.
    if (typeof body.company === "string" && body.company.length > 0) return reply.code(202).send({ ok: true });
    if (body.consent !== true) throw new ScanError("LEAD_CONSENT");
    const parsed = leadSchema.safeParse(body);
    if (!parsed.success) throw new ScanError("LEAD_INVALID");

    const fp = visitorFingerprint(request.ip, request.headers["user-agent"] ?? "", ctx.config.fingerprintSalt);
    if (!ctx.leadStore.allow(`lead:${fp}`, MAX_LEADS_PER_DAY)) throw new ScanError("LEAD_RATE_LIMITED");

    await ctx.leads.submit(parsed.data);
    return reply.code(202).send({ ok: true });
  });
}
