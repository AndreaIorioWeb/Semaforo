/** Solo contatori aggregati: nessun URL, nessun IP (SPEC sezione 5, Logging). */
export class Metrics {
  private scansStarted = 0;
  private scansDone = 0;
  private scansFailed = 0;
  private rejected: Record<string, number> = {};
  private totalDurationMs = 0;
  private peakMemoryMb = 0;

  started(): void {
    this.scansStarted++;
  }

  finished(outcome: "done" | "error", durationMs: number): void {
    if (outcome === "done") this.scansDone++;
    else this.scansFailed++;
    this.totalDurationMs += durationMs;
  }

  memory(totalMb: number | undefined): void {
    if (totalMb !== undefined && totalMb > this.peakMemoryMb) this.peakMemoryMb = totalMb;
  }

  reject(code: string): void {
    this.rejected[code] = (this.rejected[code] ?? 0) + 1;
  }

  snapshot() {
    const completed = this.scansDone + this.scansFailed;
    return {
      scansStarted: this.scansStarted,
      scansDone: this.scansDone,
      scansFailed: this.scansFailed,
      avgDurationMs: completed === 0 ? 0 : Math.round(this.totalDurationMs / completed),
      peakMemoryMb: this.peakMemoryMb,
      rejected: { ...this.rejected },
    };
  }
}
