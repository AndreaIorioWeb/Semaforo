import { reportSchema, UNVERIFIABLE_ITEMS, type Report } from "@semaforo/shared";
import { ScanError } from "../errors.js";
import type { Job, JobStore } from "./job-store.js";

/** Passi mostrati all'utente durante l'analisi (testi della SPEC sezione 3). */
export const SCAN_STEPS: ReadonlyArray<{ step: string; label: string }> = [
  { step: "fetch", label: "Mi collego al sito" },
  { step: "browser", label: "Apro il sito come un nuovo visitatore" },
  { step: "cookie", label: "Controllo cookie e tracciamento" },
  { step: "legal", label: "Leggo le pagine legali" },
  { step: "company", label: "Cerco i dati aziendali" },
  { step: "security", label: "Controllo la sicurezza di base" },
  { step: "report", label: "Preparo il report" },
];

export interface SimulatedScanOptions {
  /** Pausa tra i passi, in ms (0 nei test). */
  stepDelayMs: number;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ScanError("TIMEOUT"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ScanError("TIMEOUT"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Scansione SIMULATA della Milestone 1: emette i passi via SSE e produce un report vuoto.
 * Nessuna richiesta al sito: i check reali arrivano dalla Milestone 2.
 */
export async function runSimulatedScan(
  job: Job,
  store: JobStore,
  signal: AbortSignal,
  options: SimulatedScanOptions,
): Promise<Report> {
  const total = SCAN_STEPS.length;
  for (const [index, { step, label }] of SCAN_STEPS.entries()) {
    if (signal.aborted) throw new ScanError("TIMEOUT");
    store.emit(job, { type: "progress", data: { step, label, index: index + 1, total } });
    await sleep(options.stepDelayMs, signal);
  }

  const report: Report = {
    jobId: job.id,
    scannedAt: new Date().toISOString(),
    siteType: job.siteType === "shop" ? "shop" : "showcase",
    risk: "low",
    findings: [],
    unverifiable: [...UNVERIFIABLE_ITEMS],
    expiresAt: new Date(job.expiresAt).toISOString(),
  };
  return reportSchema.parse(report);
}
