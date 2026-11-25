import type { Config } from "./config.js";
import type { Job, JobStore } from "./jobs/job-store.js";
import type { ScanQueue } from "./jobs/queue.js";
import type { Metrics } from "./metrics.js";
import type { RateLimiter } from "./rate-limit/rate-limiter.js";
import type { GuardOptions } from "./security/guard.js";

/** Dipendenze condivise dalle route (iniettabili nei test). */
export interface AppContext {
  config: Config;
  jobs: JobStore;
  queue: ScanQueue<Job>;
  rateLimiter: RateLimiter;
  metrics: Metrics;
  guard: GuardOptions;
}
