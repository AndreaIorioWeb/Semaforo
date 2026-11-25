import type { Config } from "./config.js";
import type { Job, JobStore } from "./jobs/job-store.js";
import type { ScanQueue } from "./jobs/queue.js";
import type { Metrics } from "./metrics.js";
import type { RateLimiter } from "./rate-limit/rate-limiter.js";
import type { PipelineDeps } from "./scan/pipeline.js";
import type { SafeFetchOptions } from "./security/safe-fetch.js";

/** Dipendenze condivise dalle route (iniettabili nei test). */
export interface AppContext {
  config: Config;
  jobs: JobStore;
  queue: ScanQueue<Job>;
  rateLimiter: RateLimiter;
  metrics: Metrics;
  /** Opzioni anti SSRF e di rete per tutte le richieste verso i siti. */
  fetch: SafeFetchOptions;
  pipeline: Omit<PipelineDeps, "fetch" | "onProgress">;
}
