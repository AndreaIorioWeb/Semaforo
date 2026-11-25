import { readdirSync, readFileSync } from "node:fs";

/** RSS in MB di un processo (Linux, da /proc). */
function rssMb(pid: number): number {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const kb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
    return kb / 1024;
  } catch {
    return 0;
  }
}

/** Processi figli (e nipoti) di un PID: i processi di Chromium avviati da Node. */
function descendants(root: number): number[] {
  let entries: string[];
  try {
    entries = readdirSync("/proc").filter((e) => /^\d+$/.test(e));
  } catch {
    return [];
  }
  const parent = new Map<number, number>();
  for (const e of entries) {
    try {
      const stat = readFileSync(`/proc/${e}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      parent.set(Number(e), ppid);
    } catch {
      // processo terminato nel frattempo
    }
  }
  const out: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const p = queue.shift() as number;
    for (const [child, pp] of parent) {
      if (pp === p) {
        out.push(child);
        queue.push(child);
      }
    }
  }
  return out;
}

export interface MemorySample {
  nodeMb: number;
  chromiumMb: number;
  totalMb: number;
}

export function sampleMemory(): MemorySample {
  const nodeMb = process.platform === "linux" ? rssMb(process.pid) : process.memoryUsage().rss / 1024 / 1024;
  const chromiumMb = process.platform === "linux" ? descendants(process.pid).reduce((sum, pid) => sum + rssMb(pid), 0) : 0;
  return { nodeMb: round(nodeMb), chromiumMb: round(chromiumMb), totalMb: round(nodeMb + chromiumMb) };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Campiona la memoria a intervalli e restituisce il picco. */
export class MemoryMonitor {
  private peak: MemorySample = { nodeMb: 0, chromiumMb: 0, totalMb: 0 };
  private readonly timer: NodeJS.Timeout;

  constructor(intervalMs = 200) {
    this.take();
    this.timer = setInterval(() => this.take(), intervalMs);
    this.timer.unref();
  }

  private take(): void {
    const s = sampleMemory();
    if (s.totalMb > this.peak.totalMb) this.peak = s;
  }

  stop(): MemorySample {
    clearInterval(this.timer);
    this.take();
    return this.peak;
  }
}
