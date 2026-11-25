import type { Finding, Report } from "@semaforo/shared";

/**
 * Report di esempio di un sito INVENTATO (dominio .example, riservato e inesistente).
 * Nessun dato reale.
 */
const findings: Finding[] = [
  {
    id: "COOKIE-001",
    category: "cookie",
    title: "Tracciamento attivo prima del consenso",
    status: "ko",
    severity: "high",
    explanation:
      "Appena il sito si apre, prima di qualsiasi scelta sul banner, partono strumenti di statistica e pubblicità. Questi richiedono il consenso preventivo.",
    legalRef: "Art. 122 Codice Privacy; Linee guida cookie del Garante, 10/06/2021",
    evidence: ["Cookie di statistica impostato prima del consenso", "Invio dati a un servizio pubblicitario"],
    howToFix: "Configura la piattaforma di consenso in modo che blocchi questi script finché l'utente non accetta.",
    fixPrompt:
      "Sei un esperto di cookie e tracciamento. Aiutami a risolvere un problema del mio sito.\n\nSito: https://bottega-orsini.example/\nProblema COOKIE-001: Tracciamento attivo prima del consenso\n…\nLe indicazioni legali vanno verificate con un professionista.",
    appliesTo: "all",
  },
  {
    id: "AZ-003",
    category: "azienda",
    title: "Dati delle società di capitali",
    status: "warn",
    severity: "medium",
    explanation: "Il sito sembra di una società di capitali, ma manca il capitale sociale tra i dati obbligatori.",
    legalRef: "Art. 2250 c.c.",
    evidence: ["Forma societaria riconosciuta nel footer"],
    howToFix: "Aggiungi nel footer il capitale sociale, indicando se è interamente versato.",
    fixPrompt:
      "Sei un esperto di obblighi informativi delle imprese sui siti web. Aiutami a risolvere un problema del mio sito.\n\nSito: https://bottega-orsini.example/\nProblema AZ-003: Dati delle società di capitali\n…\nLe indicazioni legali vanno verificate con un professionista.",
    appliesTo: "all",
  },
  {
    id: "SEC-001",
    category: "sicurezza",
    title: "HTTPS e certificato",
    status: "ok",
    severity: "info",
    explanation: "HTTPS è attivo e il certificato è valido.",
    howToFix: "Nessuna azione necessaria.",
    appliesTo: "all",
  },
];

export const SAMPLE_REPORT: Pick<Report, "risk" | "findings" | "cms" | "siteType" | "scannedAt"> = {
  risk: "high",
  findings,
  cms: "WordPress",
  siteType: "showcase",
  scannedAt: "2026-11-02T09:30:00.000Z",
};

export const SAMPLE_SITE = "bottega-orsini.example";
