import type { Finding, Severity } from "./types.js";

export const FINAL_LINE = "Le indicazioni legali vanno verificate con un professionista.";

export interface PromptContext {
  url: string;
  cms?: string;
  siteType: "shop" | "showcase";
}

/**
 * Dati che solo l'utente conosce: il prompt li chiede con [PLACEHOLDER: ...] e non li inventa mai.
 */
const PLACEHOLDERS: Readonly<Record<string, string[]>> = {
  "AZ-001": ["[PLACEHOLDER: partita IVA di 11 cifre]"],
  "AZ-002": ["[PLACEHOLDER: ragione sociale o denominazione completa]", "[PLACEHOLDER: indirizzo della sede con CAP e città]"],
  "AZ-003": [
    "[PLACEHOLDER: numero REA con sigla della provincia]",
    "[PLACEHOLDER: ufficio del registro delle imprese]",
    "[PLACEHOLDER: capitale sociale e se è interamente versato]",
    "[PLACEHOLDER: eventuale socio unico o stato di liquidazione]",
  ],
  "AZ-004": ["[PLACEHOLDER: indirizzo email o PEC per i contatti]", "[PLACEHOLDER: telefono, se vuoi indicarlo]"],
  "AZ-005": ["[PLACEHOLDER: ordine o albo professionale]", "[PLACEHOLDER: numero di iscrizione]"],
  "PRIV-001": ["[PLACEHOLDER: indirizzo della pagina con l'informativa, se esiste già]"],
  "PRIV-002": [
    "[PLACEHOLDER: titolare del trattamento (nome o ragione sociale)]",
    "[PLACEHOLDER: email per le richieste privacy]",
    "[PLACEHOLDER: servizi e fornitori che trattano i dati (hosting, email, analytics)]",
  ],
  "PRIV-003": ["[PLACEHOLDER: testo attuale dell'informativa]"],
  "PRIV-004": ["[PLACEHOLDER: codice o nome del modulo di contatto]"],
  "PRIV-005": ["[PLACEHOLDER: codice o nome del modulo di contatto]"],
  "COOKIE-005": ["[PLACEHOLDER: testo attuale della cookie policy]"],
  "VEND-001": ["[PLACEHOLDER: dati del venditore e condizioni commerciali (prezzi, consegne, resi)]"],
  "VEND-002": ["[PLACEHOLDER: indirizzo e email a cui inviare il recesso]"],
  "VEND-005": ["[PLACEHOLDER: costi e tempi di spedizione per zona]"],
  "VEND-007": ["[PLACEHOLDER: metodi di pagamento accettati]"],
  "SEC-003": ["[PLACEHOLDER: provider di posta del dominio (es. Google Workspace, Aruba)]"],
};

const AREAS: Readonly<Record<string, string>> = {
  privacy: "privacy e GDPR",
  cookie: "cookie e tracciamento (normativa italiana ed europea)",
  azienda: "obblighi informativi delle imprese sui siti web",
  vendita: "e-commerce e Codice del Consumo",
  pubblico: "SEO tecnica e accessibilità",
  sicurezza: "sicurezza dei siti web",
};

/** Istruzioni specifiche per la piattaforma rilevata (differenziatore 1 della SPEC). */
export function platformInstructions(cms: string | undefined): string {
  switch (cms) {
    case "WordPress":
      return "Il sito è fatto con WordPress. Proponi la soluzione più semplice tra: impostazioni del pannello, un plugin affidabile e aggiornato, oppure uno snippet PHP con hook (add_action/add_filter) da mettere nel functions.php di un tema child o in un plugin di snippet. Non modificare mai i file del core di WordPress.";
    case "Shopify":
      return "Il sito è fatto con Shopify. Indica dove intervenire nel pannello (Impostazioni, Negozio online > Temi > Personalizza, oppure Modifica codice per i file Liquid) e quali app eventualmente usare.";
    case "Wix":
    case "Squarespace":
    case "Webflow":
      return `Il sito è fatto con ${cms}: non ho accesso al server. Indica i passaggi nelle impostazioni dell'editor e, se serve, dove inserire codice personalizzato.`;
    case "Next.js":
      return "Il sito è fatto con Next.js. Proponi le modifiche al codice (componenti, layout, next.config.js per gli header, middleware) indicando i file da toccare.";
    case "Joomla":
    case "PrestaShop":
      return `Il sito è fatto con ${cms}. Proponi soluzioni dal pannello di amministrazione o con estensioni/moduli affidabili, senza modificare il core.`;
    default:
      return "Non so con certezza con cosa è fatto il sito: [PLACEHOLDER: piattaforma o tecnologia del sito, es. HTML statico, WordPress, sito custom]. Se è un sito custom, proponi modifiche al codice HTML/JS e alla configurazione del server (nginx o Apache).";
  }
}

function findingBlock(f: Finding): string[] {
  const lines = [`Problema ${f.id}: ${f.title}`, `Cosa è stato rilevato: ${f.explanation}`];
  if (f.evidence && f.evidence.length > 0) {
    lines.push("Evidenze:");
    for (const e of f.evidence) lines.push(`- ${e}`);
  }
  if (f.legalRef) lines.push(`Riferimento normativo indicato: ${f.legalRef}`);
  lines.push(`Risultato atteso: ${f.howToFix}`);
  return lines;
}

function closing(placeholders: string[]): string[] {
  const lines: string[] = [];
  if (placeholders.length > 0) {
    lines.push("", "Dati della mia attività (li compilo io, non inventarli):");
    for (const p of [...new Set(placeholders)]) lines.push(`- ${p}`);
  }
  lines.push(
    "",
    "Spiegami i passi uno alla volta, in modo semplice. Dove servono dati della mia attività usa i segnaposto tra parentesi quadre e chiedimeli: non inventare nomi, numeri o indirizzi.",
    "Segnalami chiaramente cosa richiede la revisione di un professionista (avvocato, consulente privacy, sistemista).",
    FINAL_LINE,
  );
  return lines;
}

/** Prompt autosufficiente per un singolo finding "ko" o "warn" (SPEC sezione 9). */
export function buildFixPrompt(f: Finding, ctx: PromptContext): string {
  const area = AREAS[f.category] ?? "siti web";
  const lines = [
    `Sei un esperto di ${area}. Aiutami a risolvere un problema del mio sito.`,
    "",
    `Sito: ${ctx.url}`,
    `Tipo di sito: ${ctx.siteType === "shop" ? "vende online a privati" : "sito vetrina"}`,
    ...findingBlock(f),
    "",
    platformInstructions(ctx.cms),
    ...closing(PLACEHOLDERS[f.id] ?? []),
  ];
  return lines.join("\n");
}

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = { high: 0, medium: 1, low: 2, info: 3 };

/** Ordina per gravità: prima i "ko", poi per severità, poi per ID. */
export function sortBySeverity(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      (a.status === "ko" ? 0 : 1) - (b.status === "ko" ? 0 : 1) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.id.localeCompare(b.id),
  );
}

/** Un unico prompt con tutti i problemi aperti, in ordine di gravità ("Copia tutti i prompt"). */
export function buildCombinedPrompt(findings: readonly Finding[], ctx: PromptContext): string | undefined {
  const open = sortBySeverity(findings.filter((f) => f.status === "ko" || f.status === "warn"));
  if (open.length === 0) return undefined;
  const lines = [
    "Sei un esperto di siti web, privacy, cookie, e-commerce e sicurezza. Un controllo automatico del mio sito ha trovato questi problemi, in ordine di gravità. Aiutami a risolverli partendo dai più gravi.",
    "",
    `Sito: ${ctx.url}`,
    `Tipo di sito: ${ctx.siteType === "shop" ? "vende online a privati" : "sito vetrina"}`,
    platformInstructions(ctx.cms),
  ];
  open.forEach((f, i) => {
    lines.push("", `${i + 1}. [${f.status === "ko" ? "da sistemare" : "da verificare"}, gravità ${f.severity}]`, ...findingBlock(f));
  });
  lines.push(...closing(open.flatMap((f) => PLACEHOLDERS[f.id] ?? [])));
  return lines.join("\n");
}

/** Aggiunge fixPrompt a ogni finding "ko" o "warn". */
export function withFixPrompts(findings: readonly Finding[], ctx: PromptContext): Finding[] {
  return findings.map((f) => (f.status === "ko" || f.status === "warn" ? { ...f, fixPrompt: buildFixPrompt(f, ctx) } : f));
}
