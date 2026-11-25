import type { Metadata } from "next";
import { CATEGORY_LABELS, CATEGORY_ORDER, CHECKS, RISK_THRESHOLDS, SEVERITY_LABELS, SEVERITY_WEIGHTS, UNVERIFIABLE_ITEMS, WARN_FACTOR } from "@semaforo/shared";

export const metadata: Metadata = {
  title: "Metodologia",
  description: "Tutti i controlli di Semaforo: cosa verificano, le fonti normative e i limiti di un controllo automatico.",
};

export default function MetodologiaPage() {
  return (
    <div className="container-page py-12">
      <div className="max-w-3xl">
        <p className="eyebrow">Trasparenza</p>
        <h1 className="mt-2 text-4xl">Metodologia</h1>
        <p className="mt-4 text-lg text-ink-muted">
          Ecco tutti i controlli che Semaforo esegue, cosa verificano, su quali fonti si basano e quali sono i loro limiti. Semaforo guarda solo ciò che vede un visitatore: non
          prova ad accedere a percorsi riservati e non invia dati ai siti analizzati.
        </p>
      </div>

      <nav aria-label="Categorie" className="mt-8">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {CATEGORY_ORDER.map((c) => (
            <li key={c}><a href={`#${c}`}>{CATEGORY_LABELS[c]}</a></li>
          ))}
          <li><a href="#rischio">Calcolo del rischio</a></li>
          <li><a href="#limiti">Cosa non si può verificare</a></li>
        </ul>
      </nav>

      {CATEGORY_ORDER.map((cat) => {
        const checks = CHECKS.filter((c) => c.category === cat);
        return (
          <section key={cat} id={cat} aria-labelledby={`${cat}-titolo`} className="mt-14 scroll-mt-6">
            <h2 id={`${cat}-titolo`} className="text-3xl">{CATEGORY_LABELS[cat]}</h2>
            {cat === "vendita" ? <p className="mt-2 text-ink-muted">Questi controlli si applicano solo ai siti che vendono online a privati.</p> : null}
            <div className="mt-6 space-y-4">
              {checks.map((c) => (
                <article key={c.id} id={c.id} aria-labelledby={`${c.id}-t`} className="card p-5">
                  <p className="text-sm font-bold text-ink-muted">{c.id}{c.needsBrowser ? " · richiede l'apertura del sito nel browser" : ""}</p>
                  <h3 id={`${c.id}-t`} className="mt-1 text-xl">{c.title}</h3>
                  <dl className="mt-3 grid gap-3 text-[0.9375rem] md:grid-cols-[10rem_1fr]">
                    <dt className="font-bold">Cosa verifica</dt>
                    <dd>{c.verifies}</dd>
                    <dt className="font-bold">Fonte</dt>
                    <dd>{c.legalRef ?? "Buona pratica tecnica, nessun obbligo normativo specifico."}</dd>
                    <dt className="font-bold">Limiti</dt>
                    <dd className="text-ink-muted">{c.limits}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      <section id="rischio" aria-labelledby="rischio-titolo" className="mt-14 max-w-3xl scroll-mt-6">
        <h2 id="rischio-titolo" className="text-3xl">Calcolo del rischio</h2>
        <p className="mt-3">Ogni problema vale dei punti in base alla gravità. I punti contano per intero se il problema è certo (&quot;da sistemare&quot;) e per metà se è da verificare.</p>
        <table className="mt-4 w-full border-collapse text-left text-[0.9375rem]">
          <caption className="sr-only">Punti per gravità</caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th scope="col" className="py-2 pr-4">Gravità</th>
              <th scope="col" className="py-2 pr-4">Da sistemare</th>
              <th scope="col" className="py-2">Da verificare</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(SEVERITY_WEIGHTS) as Array<keyof typeof SEVERITY_WEIGHTS>).map((s) => (
              <tr key={s} className="border-b border-line">
                <th scope="row" className="py-2 pr-4 font-normal">{SEVERITY_LABELS[s]}</th>
                <td className="py-2 pr-4">{SEVERITY_WEIGHTS[s]}</td>
                <td className="py-2">{SEVERITY_WEIGHTS[s] * WARN_FACTOR}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-4 list-disc space-y-1 pl-5">
          <li><strong>Rischio alto</strong>: almeno un problema certo di gravità alta, oppure {RISK_THRESHOLDS.high} punti o più.</li>
          <li><strong>Rischio medio</strong>: da {RISK_THRESHOLDS.medium} punti.</li>
          <li><strong>Rischio basso</strong>: meno di {RISK_THRESHOLDS.medium} punti.</li>
        </ul>
        <p className="mt-3 text-ink-muted">Quando un rilevamento è incerto, il risultato è &quot;da verificare&quot; o &quot;non verificabile&quot;, mai &quot;da sistemare&quot;.</p>
      </section>

      <section id="limiti" aria-labelledby="limiti-titolo" className="mt-14 max-w-3xl scroll-mt-6">
        <h2 id="limiti-titolo" className="text-3xl">Cosa non si può verificare</h2>
        <ul className="mt-4 list-disc space-y-1 pl-5">
          {UNVERIFIABLE_ITEMS.map((u) => <li key={u}>{u}</li>)}
        </ul>
        <p className="mt-4">
          Semaforo è uno strumento automatico: i risultati sono indicativi, non sono consulenza legale né una certificazione. I riferimenti normativi sono aggiornati alla data di
          pubblicazione e vanno sempre verificati con un professionista.
        </p>
      </section>
    </div>
  );
}
