import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ErrorEvent, JobState, ProgressEvent, Report, SiteTypeInput } from "@semaforo/shared";

export const JOB_TTL_MS = 60 * 60 * 1000;

export type JobEvent =
  | { id: number; type: "progress"; data: ProgressEvent }
  | { id: number; type: "done"; data: { jobId: string } }
  | { id: number; type: "error"; data: ErrorEvent };

type JobEventInput = JobEvent extends infer E ? (E extends JobEvent ? Omit<E, "id"> : never) : never;

export interface Job {
  id: string;
  state: JobState;
  siteType: SiteTypeInput;
  /** URL da analizzare: solo in memoria, cancellato a fine job. */
  targetUrl: string | undefined;
  createdAt: number;
  expiresAt: number;
  events: JobEvent[];
  report?: Report;
  error?: ErrorEvent;
  emitter: EventEmitter;
}

/**
 * Job e report solo in memoria, con scadenza (default 60 minuti).
 * Nessuna persistenza di URL o report (SPEC sezione 2).
 */
export class JobStore {
  private readonly jobs = new Map<string, Job>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number = JOB_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  create(targetUrl: string, siteType: SiteTypeInput): Job {
    const createdAt = this.now();
    const job: Job = {
      id: randomUUID(),
      state: "queued",
      siteType,
      targetUrl,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      events: [],
      emitter: new EventEmitter(),
    };
    job.emitter.setMaxListeners(50);
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.expiresAt <= this.now()) {
      this.delete(id);
      return undefined;
    }
    return job;
  }

  emit(job: Job, event: JobEventInput): void {
    const full = { ...event, id: job.events.length + 1 } as JobEvent;
    job.events.push(full);
    job.emitter.emit("event", full);
  }

  markRunning(job: Job): void {
    job.state = "running";
  }

  complete(job: Job, report: Report): void {
    job.state = "done";
    job.report = report;
    job.targetUrl = undefined;
    this.emit(job, { type: "done", data: { jobId: job.id } });
  }

  fail(job: Job, error: ErrorEvent): void {
    job.state = "error";
    job.error = error;
    job.targetUrl = undefined;
    this.emit(job, { type: "error", data: error });
  }

  sweep(): void {
    const now = this.now();
    for (const [id, job] of this.jobs) {
      if (job.expiresAt <= now) this.delete(id);
    }
  }

  get size(): number {
    return this.jobs.size;
  }

  close(): void {
    clearInterval(this.sweeper);
    for (const job of this.jobs.values()) job.emitter.removeAllListeners();
    this.jobs.clear();
  }

  private delete(id: string): void {
    this.jobs.get(id)?.emitter.removeAllListeners();
    this.jobs.delete(id);
  }
}
