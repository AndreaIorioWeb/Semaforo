export type Worker<T> = (item: T, signal: AbortSignal) => Promise<void>;

export interface QueueOptions {
  /** Job eseguiti in parallelo (default 1). */
  concurrency: number;
  /** Job massimi in attesa, oltre si risponde "servizio occupato" (default 10). */
  maxWaiting: number;
  /** Timeout totale di ogni job. */
  timeoutMs: number;
}

/** Coda in memoria con concorrenza limitata e timeout per job. */
export class ScanQueue<T> {
  private readonly waiting: T[] = [];
  private active = 0;
  private closed = false;
  private readonly idleResolvers: Array<() => void> = [];

  constructor(
    private readonly worker: Worker<T>,
    private readonly options: QueueOptions,
  ) {}

  hasCapacity(): boolean {
    return !this.closed && this.waiting.length < this.options.maxWaiting;
  }

  /** Accoda un job. Restituisce false se la coda è piena. */
  enqueue(item: T): boolean {
    if (!this.hasCapacity()) return false;
    this.waiting.push(item);
    this.pump();
    return true;
  }

  get stats(): { running: number; waiting: number } {
    return { running: this.active, waiting: this.waiting.length };
  }

  /** Si risolve quando non ci sono job attivi né in attesa. */
  onIdle(): Promise<void> {
    if (this.active === 0 && this.waiting.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  close(): void {
    this.closed = true;
    this.waiting.length = 0;
  }

  private pump(): void {
    while (!this.closed && this.active < this.options.concurrency && this.waiting.length > 0) {
      const item = this.waiting.shift() as T;
      this.active++;
      void this.run(item);
    }
  }

  private async run(item: T): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      await this.worker(item, controller.signal);
    } catch {
      // Il worker gestisce i propri errori; qui si evita solo che la coda si blocchi.
    } finally {
      clearTimeout(timer);
      this.active--;
      this.pump();
      if (this.active === 0 && this.waiting.length === 0) {
        for (const resolve of this.idleResolvers.splice(0)) resolve();
      }
    }
  }
}
