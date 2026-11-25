"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Report, SCAN_STEP_LIST } from "@semaforo/shared";
import { ReportView } from "./ReportView";

type State =
  | { kind: "loading" }
  | { kind: "progress"; index: number }
  | { kind: "report"; report: Report }
  | { kind: "expired" }
  | { kind: "error"; message: string };

const POLL_MS = 2000;

/** Avanzamento in tempo reale (SSE) e report. Se l'SSE si interrompe, passa al controllo periodico. */
export function AnalysisView({ jobId }: { jobId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const source = useRef<EventSource | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);

  const loadReport = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/scan/${jobId}`, { cache: "no-store" });
      if (res.status === 404) {
        setState({ kind: "expired" });
        return true;
      }
      const body = (await res.json()) as Report | { state: string; error?: { message: string } };
      if (res.status === 200 && "findings" in body) {
        setState({ kind: "report", report: body });
        return true;
      }
      if ("state" in body && body.state === "error") {
        setState({ kind: "error", message: body.error?.message ?? "L'analisi non è andata a buon fine." });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [jobId]);

  const startPolling = useCallback(() => {
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      if (await loadReport()) clearInterval(poll.current);
    }, POLL_MS);
  }, [loadReport]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (await loadReport()) return;
      if (cancelled) return;
      setState({ kind: "progress", index: 0 });
      const es = new EventSource(`/api/scan/${jobId}/events`);
      source.current = es;
      es.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent<string>).data) as { index: number };
        setState({ kind: "progress", index: data.index });
      });
      es.addEventListener("done", () => {
        es.close();
        void loadReport();
      });
      es.addEventListener("error", (e) => {
        const msg = e as MessageEvent<string>;
        es.close();
        if (typeof msg.data === "string" && msg.data.length > 0) {
          const data = JSON.parse(msg.data) as { message: string };
          setState({ kind: "error", message: data.message });
        } else {
          // Connessione interrotta: si continua controllando periodicamente.
          startPolling();
        }
      });
    })();
    return () => {
      cancelled = true;
      source.current?.close();
      clearInterval(poll.current);
    };
  }, [jobId, loadReport, startPolling]);

  // Sposta il focus sul titolo quando cambia la schermata (utile con i lettori di schermo).
  useEffect(() => {
    if (state.kind === "report" || state.kind === "expired" || state.kind === "error") heading.current?.focus();
  }, [state.kind]);

  if (state.kind === "report") return <ReportView report={state.report} />;

  if (state.kind === "expired" || state.kind === "error") {
    const expired = state.kind === "expired";
    return (
      <div className="card p-6 sm:p-8">
        <h1 ref={heading} tabIndex={-1} className="text-3xl outline-none">
          {expired ? "Questa analisi non è più disponibile" : "L'analisi non è riuscita"}
        </h1>
        <p className="mt-3 max-w-prose">
          {expired
            ? "I report restano disponibili per 60 minuti e poi vengono cancellati: non li conserviamo. Puoi avviare una nuova analisi, la rianalisi dello stesso sito non consuma il limite giornaliero."
            : state.message}
        </p>
        <Link prefetch={false} href="/" className="btn btn-primary mt-6">
          Avvia una nuova analisi
        </Link>
      </div>
    );
  }

  const current = state.kind === "progress" ? state.index : 0;
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-3xl">Analisi in corso</h1>
      <p className="mt-2 text-ink-muted">Di solito ci vuole meno di un minuto. Puoi lasciare aperta questa pagina.</p>
      <ol className="mt-6 space-y-3" aria-label="Passi dell'analisi">
        {SCAN_STEP_LIST.map((s, i) => {
          const n = i + 1;
          const status = n < current ? "done" : n === current ? "current" : "todo";
          return (
            <li key={s.step} className="flex items-center gap-3" {...(status === "current" ? { "aria-current": "step" as const } : {})}>
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                  status === "done" ? "border-low-text bg-low-soft text-low-text" : status === "current" ? "border-accent bg-accent text-surface" : "border-line-strong text-ink-muted"
                }`}
                aria-hidden="true"
              >
                {status === "done" ? "✓" : n}
              </span>
              <span className={status === "todo" ? "text-ink-muted" : "font-bold"}>{s.label}</span>
              <span className="sr-only">{status === "done" ? " (completato)" : status === "current" ? " (in corso)" : " (da fare)"}</span>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">
        {current > 0 ? `${SCAN_STEP_LIST[current - 1]?.label ?? ""}…` : "Analisi avviata"}
      </p>
    </div>
  );
}
