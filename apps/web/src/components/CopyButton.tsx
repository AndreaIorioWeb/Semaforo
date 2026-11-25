"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

interface CopyButtonProps {
  text: string;
  label: string;
  /** Testo annunciato e mostrato dopo la copia. */
  doneLabel?: string;
  variant?: "primary" | "secondary";
}

/** Pulsante di copia con feedback visivo e annuncio per i lettori di schermo. */
export function CopyButton({ text, label, doneLabel = "Copiato negli appunti", variant = "secondary" }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyText(text);
    setState(ok ? "done" : "error");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button type="button" onClick={onClick} className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}`}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {state === "done" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : (<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>)}
        </svg>
        {state === "done" ? "Copiato" : label}
      </button>
      <span role="status" aria-live="polite" className={state === "error" ? "text-sm font-bold text-high-text" : "text-sm text-low-text"}>
        {state === "done" ? doneLabel : state === "error" ? "Copia non riuscita: seleziona il testo e copialo a mano." : ""}
      </span>
    </span>
  );
}
