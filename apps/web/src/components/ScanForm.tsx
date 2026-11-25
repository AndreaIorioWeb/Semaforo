"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";

const SITE_TYPES = [
  { value: "auto", label: "Rileva automaticamente" },
  { value: "shop", label: "Sì, vende online" },
  { value: "showcase", label: "No, è un sito vetrina" },
] as const;

/** Toglie schema, percorso e spazi: l'utente può incollare un indirizzo completo. */
export function cleanDomain(input: string): string {
  return input.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export function ScanForm({ dailyLimit }: { dailyLimit: number }) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [domain, setDomain] = useState("");
  const [siteType, setSiteType] = useState<(typeof SITE_TYPES)[number]["value"]>("auto");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanDomain(domain);
    if (!clean) {
      setError("Scrivi l'indirizzo del sito, ad esempio miosito.it.");
      input.current?.focus();
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: `https://${clean}`, siteType }),
      });
      const body = (await res.json()) as { jobId?: string; error?: { message: string } };
      if (res.ok && body.jobId) {
        router.push(`/analisi/${body.jobId}`);
        return;
      }
      setError(body.error?.message ?? "Qualcosa non ha funzionato. Riprova tra poco.");
    } catch {
      setError("Non riesco a contattare il servizio. Controlla la connessione e riprova.");
    }
    setSending(false);
    input.current?.focus();
  }

  const errorId = `${id}-errore`;
  const hintId = `${id}-nota`;
  return (
    <form onSubmit={onSubmit} noValidate className="card p-5 shadow-[0_1px_0_var(--color-line)] sm:p-6" aria-label="Controlla un sito">
      <label htmlFor={`${id}-dominio`} className="block font-bold">
        Indirizzo del sito
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <div className="flex min-h-12 flex-1 items-stretch overflow-hidden rounded-lg border border-line-strong bg-surface focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-accent">
          <span className="flex items-center border-r border-line bg-paper px-3 text-ink-muted" aria-hidden="true">
            https://
          </span>
          <input
            ref={input}
            id={`${id}-dominio`}
            name="dominio"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="miosito.it"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              setDomain(cleanDomain(e.clipboardData.getData("text")));
            }}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
            aria-invalid={error ? true : undefined}
            className="min-w-0 flex-1 bg-transparent px-3 text-lg outline-none"
          />
        </div>
        <button type="submit" className="btn btn-primary min-h-12 text-lg" disabled={sending}>
          {sending ? "Avvio in corso…" : "Controlla il sito"}
        </button>
      </div>
      <p id={hintId} className="mt-2 text-sm text-ink-muted">
        Il prefisso https:// è già inserito: scrivi solo il dominio.
      </p>

      <fieldset className="mt-5">
        <legend className="font-bold">Vende online a privati?</legend>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
          {SITE_TYPES.map((t) => (
            <label key={t.value} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="tipo"
                value={t.value}
                checked={siteType === t.value}
                onChange={() => setSiteType(t.value)}
                className="h-5 w-5 accent-[var(--color-accent)]"
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div aria-live="assertive">
        {error ? (
          <p id={errorId} className="mt-4 rounded-lg bg-high-soft px-4 py-3 font-bold text-high-text">
            {error}
          </p>
        ) : null}
      </div>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] text-ink-muted">
        <li>Gratuito</li>
        <li>Nessuna registrazione</li>
        <li>Nessun cookie</li>
        <li>I siti analizzati non vengono salvati</li>
        <li>
          Fino a {dailyLimit} siti diversi al giorno: puoi ricontrollare gli stessi quando vuoi
        </li>
      </ul>
    </form>
  );
}
