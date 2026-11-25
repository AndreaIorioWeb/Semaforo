import Link from "next/link";
import { FindingCard } from "@/components/FindingCard";
import { StatusIcon } from "@/components/Icon";
import { RiskSummary } from "@/components/RiskSummary";
import { ScanForm } from "@/components/ScanForm";
import { dailyLimit } from "@/lib/owner";
import { SAMPLE_REPORT, SAMPLE_SITE } from "@/lib/sample";

const CATEGORIES = [
  {
    title: "Privacy e cookie",
    text: "Se statistiche, pubblicità o video partono prima del consenso, se il banner permette di rifiutare e se l'informativa è completa.",
  },
  { title: "Dati aziendali", text: "Partita IVA, denominazione, sede, contatti e, per le società, i dati del registro delle imprese." },
  { title: "Vendita online", text: "Per chi vende ai privati: condizioni di vendita, diritto di recesso, garanzia legale, spedizioni e pagamenti." },
  { title: "Prontezza pubblica", text: "Se Google può vedere il sito, se sono rimasti testi provvisori e alcune basi di accessibilità." },
  { title: "Sicurezza di base", text: "HTTPS, certificato, protezioni del browser, difesa delle email dallo spoofing e chiavi segrete esposte." },
];

const STEPS = [
  { title: "Inserisci l'indirizzo", text: "Scrivi il dominio del sito e indica se vende online. Non serve registrarsi." },
  {
    title: "Semaforo lo visita",
    text: "Apre il sito come un nuovo visitatore, senza toccare il banner dei cookie, e legge le pagine legali. Guarda solo ciò che è pubblico.",
  },
  { title: "Ricevi il report", text: "Per ogni punto trovi una spiegazione semplice, la norma di riferimento e un prompt pronto per farti aiutare da un assistente AI." },
];

const FAQ = [
  {
    q: "È davvero gratuito?",
    a: "Sì. Non serve registrarsi e non chiediamo dati. Se vuoi, dal report puoi chiedere aiuto a un professionista, ma non sei obbligato.",
  },
  {
    q: "Salvate il mio sito o il report?",
    a: "No. L'indirizzo e il report restano in memoria per 60 minuti e poi vengono cancellati. Per il limite giornaliero conserviamo per 24 ore solo un codice anonimo, mai l'indirizzo IP.",
  },
  {
    q: "Il risultato vale come certificazione?",
    a: "No. È un controllo automatico e indicativo: vede il sito da fuori, come un visitatore. Non sostituisce la verifica di un professionista e non può vedere, ad esempio, contratti con i fornitori o misure interne.",
  },
  {
    q: "Cosa sono i prompt?",
    a: "Sono istruzioni già pronte da incollare in un assistente AI. Spiegano il problema, la piattaforma del sito e cosa ottenere, senza inventare i tuoi dati: dove servono, trovi dei segnaposto da completare.",
  },
  {
    q: "Perché c'è un limite giornaliero?",
    a: "Per evitare abusi e mantenere il servizio gratuito. Puoi ricontrollare gli stessi siti quante volte vuoi nella giornata, per esempio dopo una correzione.",
  },
  {
    q: "Il mio sito non vuole essere analizzato: posso escluderlo?",
    a: "Semaforo si presenta come SemaforoBot e rispetta robots.txt per le pagine diverse dalla home. Per altre richieste scrivi dalla pagina Contatti.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="container-page pt-12 pb-16 sm:pt-20">
        <div className="max-w-3xl">
          <p className="eyebrow">Il controllo gratuito del tuo sito</p>
          <h1 className="mt-3 text-4xl sm:text-5xl">Il tuo sito è in regola? Scoprilo in un minuto.</h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-muted">
            Semaforo apre il sito come farebbe un nuovo visitatore e controlla privacy, cookie, dati aziendali, vendita online e sicurezza di base. Per ogni punto ricevi
            una spiegazione chiara e un prompt pronto per sistemarlo.
          </p>
        </div>
        <div className="mt-10 max-w-3xl">
          <ScanForm dailyLimit={dailyLimit()} />
        </div>
      </section>

      <section aria-labelledby="cosa-controlla" className="border-y border-line bg-surface py-16">
        <div className="container-page">
          <h2 id="cosa-controlla" className="text-3xl">Cosa controlla</h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <li key={c.title} className="border-t-2 border-accent pt-4">
                <h3 className="text-xl">{c.title}</h3>
                <p className="mt-2 text-ink-muted">{c.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8">
            <Link prefetch={false} href="/metodologia">Vedi l&apos;elenco completo dei controlli, con fonti e limiti</Link>
          </p>
        </div>
      </section>

      <section id="come-funziona" aria-labelledby="come-funziona-titolo" className="container-page py-16">
        <h2 id="come-funziona-titolo" className="text-3xl">Come funziona</h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="font-serif text-4xl text-accent" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mt-2 text-xl">
                <span className="sr-only">Passo {i + 1}: </span>
                {s.title}
              </h3>
              <p className="mt-2 text-ink-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid gap-3 text-[0.9375rem] sm:grid-cols-2 lg:grid-cols-4">
          {(["ko", "warn", "ok", "unverifiable"] as const).map((s) => (
            <p key={s} className="flex items-start gap-2">
              <StatusIcon status={s} size={20} className={{ ko: "text-high-text", warn: "text-medium-text", ok: "text-low-text", unverifiable: "text-neutral-text" }[s]} />
              <span>
                <strong>{{ ko: "Da sistemare", warn: "Da verificare", ok: "In regola", unverifiable: "Non verificabile" }[s]}</strong>
                {{ ko: ": un problema chiaro.", warn: ": un dubbio da controllare.", ok: ": nessun problema visto.", unverifiable: ": non si vede da fuori." }[s]}
              </span>
            </p>
          ))}
        </div>
      </section>

      <section aria-labelledby="esempio" className="border-y border-line bg-surface py-16">
        <div className="container-page">
          <h2 id="esempio" className="text-3xl">Un report di esempio</h2>
          <p className="mt-2 max-w-prose text-ink-muted">
            Il sito <strong className="text-ink">{SAMPLE_SITE}</strong> non esiste: è inventato per mostrarti come appare un report.
          </p>
          <div className="mt-8 space-y-5">
            <RiskSummary report={SAMPLE_REPORT} site={SAMPLE_SITE} />
            <ul className="space-y-5">
              {SAMPLE_REPORT.findings.map((f) => (
                <li key={f.id}>
                  <FindingCard finding={f} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq" className="container-page py-16">
        <h2 id="faq" className="text-3xl">Domande frequenti</h2>
        <div className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
                {f.q}
                <span aria-hidden="true" className="text-accent transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-prose text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
