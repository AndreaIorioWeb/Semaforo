import { CATEGORY_LABELS, type Finding, SEVERITY_LABELS } from "@semaforo/shared";
import { StatusBadge } from "./Badges";
import { CopyButton } from "./CopyButton";

export function FindingCard({ finding, headingLevel = 3 }: { finding: Finding; headingLevel?: 3 | 4 }) {
  const H = headingLevel === 3 ? "h3" : "h4";
  const titleId = `f-${finding.id}`;
  return (
    <article aria-labelledby={titleId} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={finding.status} />
        <span className="text-sm text-ink-muted">
          {finding.id} · {CATEGORY_LABELS[finding.category]} · {SEVERITY_LABELS[finding.severity]}
        </span>
      </div>
      <H id={titleId} className="mt-3 text-xl">
        {finding.title}
      </H>
      <p className="mt-2">{finding.explanation}</p>

      <dl className="mt-4 space-y-3 text-[0.9375rem]">
        {finding.legalRef ? (
          <div>
            <dt className="font-bold">Riferimento normativo</dt>
            <dd className="text-ink-muted">{finding.legalRef}</dd>
          </div>
        ) : null}
        {finding.evidence?.length ? (
          <div>
            <dt className="font-bold">Cosa abbiamo trovato</dt>
            <dd>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-muted [overflow-wrap:anywhere]">
                {finding.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="font-bold">Come risolvere</dt>
          <dd>{finding.howToFix}</dd>
        </div>
      </dl>

      {finding.fixPrompt ? (
        <div className="mt-5 border-t border-line pt-4">
          <CopyButton text={finding.fixPrompt} label="Copia prompt" doneLabel="Prompt copiato: incollalo nel tuo assistente AI" />
          <details className="mt-3">
            <summary className="cursor-pointer text-[0.9375rem] font-bold text-accent">Mostra il prompt</summary>
            <pre tabIndex={0} aria-label={`Testo del prompt per ${finding.id}`} className="mt-2 max-h-80 overflow-auto rounded-lg border border-line bg-paper p-4 font-sans text-sm whitespace-pre-wrap">{finding.fixPrompt}</pre>
          </details>
        </div>
      ) : null}
    </article>
  );
}
