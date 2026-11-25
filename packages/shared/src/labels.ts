import type { Category, Risk, Severity, Status } from "./types.js";

/** Etichette in italiano condivise da web e PDF. Il colore non è mai l'unico segnale: c'è sempre il testo. */
export const RISK_LABELS: Readonly<Record<Risk, { label: string; description: string }>> = {
  high: { label: "Rischio alto", description: "Ci sono problemi importanti da sistemare al più presto." },
  medium: { label: "Rischio medio", description: "Ci sono alcuni punti da sistemare." },
  low: { label: "Rischio basso", description: "Non abbiamo trovato problemi gravi." },
};

export const STATUS_LABELS: Readonly<Record<Status, string>> = {
  ko: "Da sistemare",
  warn: "Da verificare",
  ok: "In regola",
  unverifiable: "Non verificabile",
};

export const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  high: "Gravità alta",
  medium: "Gravità media",
  low: "Gravità bassa",
  info: "Informativo",
};

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  privacy: "Privacy",
  cookie: "Cookie e tracciamento",
  azienda: "Dati aziendali",
  vendita: "Vendita online",
  pubblico: "Prontezza pubblica",
  sicurezza: "Sicurezza di base",
};

export const CATEGORY_ORDER: readonly Category[] = ["cookie", "privacy", "azienda", "vendita", "pubblico", "sicurezza"];

export const DISCLAIMER =
  "Semaforo è uno strumento automatico: i risultati sono indicativi, non sono consulenza legale né una certificazione e non sostituiscono un professionista.";

/** Passi dell'analisi mostrati all'utente (SPEC sezione 3), nell'ordine in cui avvengono. */
export const SCAN_STEPS = {
  fetch: { step: "fetch", label: "Mi collego al sito" },
  browser: { step: "browser", label: "Apro il sito come un nuovo visitatore" },
  public: { step: "public", label: "Controllo come appare a Google e ai visitatori" },
  legal: { step: "legal", label: "Leggo le pagine legali" },
  security: { step: "security", label: "Controllo la sicurezza di base" },
  report: { step: "report", label: "Preparo il report" },
} as const;

export type ScanStepKey = keyof typeof SCAN_STEPS;
export const SCAN_STEP_LIST = Object.values(SCAN_STEPS);
