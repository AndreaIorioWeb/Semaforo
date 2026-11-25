import { type Report, RISK_LABELS, type Status } from "@semaforo/shared";
import { RISK_BG, RiskBadge, STATUS_CLASSES } from "./Badges";
import { StatusIcon } from "./Icon";

const COUNT_LABELS: Array<[Status, string, string]> = [
  ["ko", "da sistemare", "da sistemare"],
  ["warn", "da verificare", "da verificare"],
  ["ok", "in regola", "in regola"],
  ["unverifiable", "non verificabile", "non verificabili"],
];

export function RiskSummary({ report, site }: { report: Pick<Report, "risk" | "findings" | "cms" | "siteType" | "scannedAt">; site: string }) {
  const counts = (s: Status) => report.findings.filter((f) => f.status === s).length;
  const date = new Date(report.scannedAt).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Rome" });
  return (
    <section aria-labelledby="riepilogo" className="card overflow-hidden">
      <div className={`flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between ${RISK_BG[report.risk]}`}>
        <div>
          <h2 id="riepilogo" className="sr-only">Riepilogo</h2>
          <RiskBadge risk={report.risk} size="lg" />
          <p className="mt-2 max-w-prose">{RISK_LABELS[report.risk].description}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 text-[0.9375rem] sm:min-w-64">
          {COUNT_LABELS.map(([s, one, many]) => (
            <li key={s} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${STATUS_CLASSES[s]}`}>
              <StatusIcon status={s} size={18} />
              <span>
                <strong>{counts(s)}</strong> {counts(s) === 1 ? one : many}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="border-t border-line px-6 py-3 text-[0.9375rem] text-ink-muted">
        <span className="font-bold text-ink">{site}</span> · analizzato il {date}
        {report.cms ? ` · piattaforma: ${report.cms}` : ""} · {report.siteType === "shop" ? "vende online" : "sito vetrina"}
      </p>
    </section>
  );
}
