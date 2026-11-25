import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/health", async () => ({
    status: "ok",
    queue: ctx.queue.stats,
    metrics: ctx.metrics.snapshot(),
  }));
}
