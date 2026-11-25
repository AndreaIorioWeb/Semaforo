"use client";

import Link from "next/link";
import { type FormEvent, useId, useRef, useState } from "react";

export function LeadForm({ defaultSite = "" }: { defaultSite?: string }) {
  const id = useId();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const status = useRef<HTMLDivElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          site: String(form.get("site") ?? ""),
          message: String(form.get("message") ?? ""),
          consent: form.get("consent") === "si",
          company: String(form.get("company") ?? ""),
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (res.ok) {
        setResult({ ok: true, message: "Richiesta inviata. Ti rispondo al più presto all'indirizzo email che hai indicato." });
        e.currentTarget?.reset();
      } else {
        setResult({ ok: false, message: body.error?.message ?? "Invio non riuscito. Riprova tra poco." });
      }
    } catch {
      setResult({ ok: false, message: "Non riesco a contattare il servizio. Riprova tra poco." });
    }
    setSending(false);
    status.current?.focus();
  }

  const field = "mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-base";
  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-5 sm:p-6" aria-labelledby={`${id}-titolo`}>
      <h2 id={`${id}-titolo`} className="text-2xl">Scrivimi</h2>
      <p className="text-[0.9375rem] text-ink-muted">I campi con * sono obbligatori.</p>
      <div>
        <label htmlFor={`${id}-name`} className="font-bold">Nome e cognome *</label>
        <input id={`${id}-name`} name="name" required maxLength={100} autoComplete="name" className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="font-bold">Email *</label>
        <input id={`${id}-email`} name="email" type="email" required maxLength={254} autoComplete="email" className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-site`} className="font-bold">Sito</label>
        <input id={`${id}-site`} name="site" maxLength={300} defaultValue={defaultSite} autoComplete="url" inputMode="url" className={field} />
      </div>
      <div>
        <label htmlFor={`${id}-message`} className="font-bold">Messaggio</label>
        <textarea id={`${id}-message`} name="message" rows={5} maxLength={3000} className={field} aria-describedby={`${id}-message-nota`} />
        <p id={`${id}-message-nota`} className="mt-1 text-sm text-ink-muted">Facoltativo. Il report non viene allegato.</p>
      </div>
      {/* Campo trappola per i bot: nascosto a tutti, anche ai lettori di schermo. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={`${id}-company`}>Lascia vuoto</label>
        <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex items-start gap-3">
        <input id={`${id}-consent`} name="consent" type="checkbox" value="si" required className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)]" />
        <label htmlFor={`${id}-consent`}>
          Ho letto l&apos;<Link prefetch={false} href="/privacy">informativa privacy</Link> e chiedo di essere ricontattato per questa richiesta. *
        </label>
      </div>
      <p className="text-sm text-ink-muted">Nessuna newsletter. La richiesta arriva via email a chi gestisce Semaforo; nel database del servizio resta al massimo 24 ore.</p>
      <button type="submit" className="btn btn-primary" disabled={sending}>
        {sending ? "Invio in corso…" : "Invia la richiesta"}
      </button>
      <div ref={status} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        {result ? (
          <p className={`rounded-lg px-4 py-3 font-bold ${result.ok ? "bg-low-soft text-low-text" : "bg-high-soft text-high-text"}`}>{result.message}</p>
        ) : null}
      </div>
    </form>
  );
}
