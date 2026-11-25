"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildCombinedPrompt, DISCLAIMER, type Report, sortBySeverity } from "@semaforo/shared";
import { CopyButton } from "./CopyButton";
import { FilterTabs } from "./FilterTabs";
import { FindingCard } from "./FindingCard";
import { RiskSummary } from "./RiskSummary";

type Filter = "todo" | "all" | "ok" | "unverifiable";

export function ReportView({ report }: { report: Report }) {
  const site = report.siteUrl ? new URL(report.siteUrl).host : "Sito analizzato";
  const sorted = useMemo(() => sortBySeverity(report.findings), [report.findings]);
  const open = sorted.filter((f) => f.status === "ko" || f.status === "warn");
  const [filter, setFilter] = useState<Filter>(open.length > 0 ? "todo" : "all");
  const combined = useMemo(
    () => buildCombinedPrompt(report.findings, { url: report.siteUrl ?? site, siteType: report.siteType, ...(report.cms ? { cms: report.cms } : {}) }),
    [report, site],
  );

  const visible = {
    todo: open,
    all: sorted,
    ok: sorted.filter((f) => f.status === "ok"),
    unverifiable: sorted.filter((f) => f.status === "unverifiable"),
  }[filter];

  const tabs = [
    { id: "todo", label: "Da sistemare", count: open.length },
    { id: "all", label: "Tutti", count: sorted.length },
    { id: "ok", label: "In regola", count: sorted.filter((f) => f.status === "ok").length },
    { id: "unverifiable", label: "Non verificabile", count: sorted.filter((f) => f.status === "unverifiable").length },
  ];
  const expires = new Date(report.expiresAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Report</p>
        <h1 className="mt-2 text-3xl sm:text-4xl [overflow-wrap:anywhere]">{site}</h1>
      </header>

      <RiskSummary report={report} site={site} />

      <div className="flex flex-wrap items-start gap-3">
        {combined ? <CopyButton text={combined} label="Copia tutti i prompt aperti" doneLabel="Tutti i prompt copiati, in ordine di gravità" variant="primary" /> : null}
        <a href={`/api/scan/${report.jobId}/pdf`} className="btn btn-secondary" download>
          Scarica PDF
        </a>
        <Link prefetch={false} href="/" className="btn btn-secondary">
          Controlla un altro sito
        </Link>
      </div>
      <p className="text-[0.9375rem] text-ink-muted">
        Il report resta disponibile fino alle {expires}, poi viene cancellato. Non lo salviamo: scarica il PDF se vuoi conservarlo.
      </p>

      <section aria-labelledby="risultati">
        <h2 id="risultati" className="text-2xl">Risultati</h2>
        <div className="mt-4">
          <FilterTabs tabs={tabs} active={filter} onChange={(id) => setFilter(id as Filter)}>
            {visible.length === 0 ? (
              <p>{filter === "todo" ? "Nessun problema da sistemare tra quelli che possiamo verificare." : "Nessun risultato in questa scheda."}</p>
            ) : (
              <ul className="space-y-5">
                {visible.map((f) => (
                  <li key={f.id}>
                    <FindingCard finding={f} />
                  </li>
                ))}
              </ul>
            )}
          </FilterTabs>
        </div>
      </section>

      <section aria-labelledby="non-verificabile" className="card p-6">
        <h2 id="non-verificabile" className="text-2xl">Cosa non si può verificare</h2>
        <p className="mt-2">Un controllo automatico guarda il sito da fuori, come un visitatore. Restano esclusi:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {report.unverifiable.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
        <p className="mt-3 font-bold">Un esito positivo non è una certificazione.</p>
      </section>

      <section aria-labelledby="cta" className="rounded-xl bg-accent-strong p-6 text-surface sm:p-8">
        <h2 id="cta" className="text-2xl">Preferisci che se ne occupi qualcuno?</h2>
        <p className="mt-2 max-w-prose">
          Puoi chiedere a un professionista di sistemare i punti aperti. Ti risponde una persona, senza impegno. Il report non viene inviato: scegli tu cosa raccontare.
        </p>
        <Link prefetch={false} href={`/contatti?sito=${encodeURIComponent(site)}`} className="btn mt-4 bg-surface text-accent-strong hover:bg-accent-soft hover:text-accent-strong">
          Fai sistemare a un professionista
        </Link>
      </section>

      <p className="text-[0.9375rem] text-ink-muted">{DISCLAIMER}</p>
    </div>
  );
}
