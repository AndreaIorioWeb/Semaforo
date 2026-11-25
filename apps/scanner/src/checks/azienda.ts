import type { ScanContext } from "../scan/context.js";
import { type Check, finding, snippet } from "./types.js";

/** Cifra di controllo della partita IVA italiana (algoritmo di Luhn adattato). */
export function isValidPartitaIva(piva: string): boolean {
  if (!/^\d{11}$/.test(piva) || /^0{11}$/.test(piva)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(piva[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(piva[10]);
}

const PIVA_LABELED =
  /(?:p\.?\s?iva|partita\s+iva|vat(?:\s+(?:number|no\.?|id))?|c\.?\s?f\.?\s*(?:e|\/|-)\s*p\.?\s?iva)\s*(?:n\.?|nr\.?|num\.?)?\s*[:.-]?\s*(?:IT)?\s?(\d{11})\b/gi;
const PIVA_IT_PREFIX = /\bIT\s?(\d{11})\b/g;

export function findPartiteIva(text: string): string[] {
  const found = new Set<string>();
  for (const re of [PIVA_LABELED, PIVA_IT_PREFIX]) {
    for (const m of text.matchAll(re)) if (m[1]) found.add(m[1]);
  }
  return [...found];
}

export const COMPANY_FORMS: ReadonlyArray<{ re: RegExp; label: string; capital: boolean }> = [
  { re: /\bs\.?\s?r\.?\s?l\.?\s?s\.?(?=[\s,.;)]|$)/i, label: "S.r.l.s.", capital: true },
  { re: /\bs\.?\s?r\.?\s?l\.?(?=[\s,.;)]|$)/i, label: "S.r.l.", capital: true },
  { re: /\bs\.?\s?p\.?\s?a\.?(?=[\s,.;)]|$)/i, label: "S.p.A.", capital: true },
  { re: /\bs\.?\s?a\.?\s?p\.?\s?a\.?(?=[\s,.;)]|$)/i, label: "S.a.p.a.", capital: true },
  { re: /\bs\.?\s?n\.?\s?c\.?(?=[\s,.;)]|$)/i, label: "S.n.c.", capital: false },
  { re: /\bs\.?\s?a\.?\s?s\.?(?=[\s,.;)]|$)/i, label: "S.a.s.", capital: false },
  { re: /\bsocietà\s+cooperativa\b|\bsoc\.?\s?coop\.?/i, label: "Società cooperativa", capital: true },
  { re: /\bditta\s+individuale\b/i, label: "Ditta individuale", capital: false },
];

export function companyForm(text: string): { label: string; capital: boolean } | undefined {
  return COMPANY_FORMS.find((f) => f.re.test(text));
}

const ADDRESS =
  /\b(via|viale|v\.le|piazza|p\.zza|piazzale|corso|c\.so|largo|vicolo|strada|località|loc\.|contrada)\s+[A-ZÀ-Ýa-zà-ÿ'.\s]{2,40}?,?\s*\d{1,4}[a-zA-Z]?\b/i;
const CAP = /\b\d{5}\b/;

/** Testo della home in cui cercare i dati aziendali: footer prima, poi tutta la pagina. */
function companyText(ctx: ScanContext): string {
  return ctx.text;
}

export const az001: Check = {
  id: "AZ-001",
  run(ctx) {
    const pivas = findPartiteIva(companyText(ctx));
    if (pivas.length === 0) {
      return [
        finding("AZ-001", {
          status: "ko",
          severity: "medium",
          explanation:
            "Nella home non abbiamo trovato la partita IVA. Chi ha partita IVA e un sito deve indicarla nella home, di solito nel piè di pagina.",
          howToFix: "Aggiungi nel footer di tutte le pagine la dicitura \"P.IVA\" seguita dal numero di 11 cifre.",
        }),
      ];
    }
    const valid = pivas.filter(isValidPartitaIva);
    if (valid.length === 0) {
      return [
        finding("AZ-001", {
          status: "warn",
          severity: "medium",
          explanation:
            "Abbiamo trovato un numero indicato come partita IVA, ma la cifra di controllo non torna. Potrebbe esserci un errore di battitura.",
          evidence: pivas.map((p) => `P.IVA trovata: ${p}`),
          howToFix: "Controlla il numero sul certificato di attribuzione della partita IVA e correggilo nel footer.",
        }),
      ];
    }
    return [
      finding("AZ-001", {
        status: "ok",
        severity: "info",
        explanation: "La partita IVA è presente nella home e ha un formato valido.",
        evidence: valid.map((p) => `P.IVA: ${p}`),
        howToFix: "Nessuna azione necessaria.",
      }),
    ];
  },
};

export const az002: Check = {
  id: "AZ-002",
  run(ctx) {
    const text = companyText(ctx);
    const form = companyForm(text);
    const address = ADDRESS.exec(text);
    const hasAddress = address !== null && CAP.test(text);
    if (form && hasAddress) {
      return [
        finding("AZ-002", {
          status: "ok",
          severity: "info",
          explanation: "Sono indicati la forma societaria e un indirizzo della sede.",
          evidence: [`Forma: ${form.label}`, `Indirizzo: ${snippet(address[0], 80)}`],
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    const missing = [!form && "ragione sociale o denominazione completa", !hasAddress && "indirizzo della sede con CAP"].filter(
      Boolean,
    ) as string[];
    return [
      finding("AZ-002", {
        status: "warn",
        severity: "medium",
        explanation: `Nella home non abbiamo riconosciuto: ${missing.join(" e ")}. Il riconoscimento è automatico e potrebbe non vedere formati insoliti.`,
        ...(form ? { evidence: [`Forma: ${form.label}`] } : hasAddress && address ? { evidence: [`Indirizzo: ${snippet(address[0], 80)}`] } : {}),
        howToFix: "Indica nel footer denominazione o ragione sociale completa e indirizzo della sede (via, numero, CAP, città).",
      }),
    ];
  },
};

export const az003: Check = {
  id: "AZ-003",
  run(ctx) {
    const text = companyText(ctx);
    const form = companyForm(text);
    if (!form?.capital) return [];
    const items = [
      { label: "numero REA", ok: /\bR\.?\s?E\.?\s?A\.?\b/i.test(text) },
      { label: "registro delle imprese", ok: /registro\s+(delle\s+)?imprese|reg\.?\s?imp\.?|c\.?c\.?i\.?a\.?a\.?/i.test(text) },
      { label: "capitale sociale", ok: /capitale\s+sociale|cap\.?\s?soc\.?/i.test(text) },
    ];
    const missing = items.filter((i) => !i.ok).map((i) => i.label);
    if (missing.length === 0) {
      return [
        finding("AZ-003", {
          status: "ok",
          severity: "info",
          explanation: `Per la ${form.label} sono indicati REA, registro delle imprese e capitale sociale.`,
          howToFix: "Nessuna azione necessaria. Verifica che il capitale indicato sia quello effettivamente versato.",
        }),
      ];
    }
    return [
      finding("AZ-003", {
        status: missing.length === items.length ? "ko" : "warn",
        severity: "medium",
        explanation: `Il sito sembra di una ${form.label}, ma mancano: ${missing.join(", ")}. Le società di capitali devono indicarli anche sul sito.`,
        evidence: [`Forma riconosciuta: ${form.label}`],
        howToFix:
          "Aggiungi nel footer: numero REA con sigla della provincia, ufficio del registro delle imprese, capitale sociale (indicando \"i.v.\" se interamente versato) ed eventuale socio unico o stato di liquidazione.",
      }),
    ];
  },
};

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+39\s?)?\b0\d{1,3}[\s./-]?\d{5,8}\b|(?:\+39\s?)?\b3\d{2}[\s./-]?\d{3}[\s./-]?\d{3,4}\b/;

export const az004: Check = {
  id: "AZ-004",
  run(ctx) {
    const mailto = ctx.$('a[href^="mailto:" i]').first().attr("href")?.replace(/^mailto:/i, "").split("?")[0];
    const email = mailto ?? EMAIL.exec(ctx.text)?.[0];
    const pec = /\bpec\b|legalmail|pec\.it|postacert/i.test(ctx.text);
    const phone = ctx.$('a[href^="tel:" i]').length > 0 || PHONE.test(ctx.text);
    const contactPage = ctx.links.some((l) => /contatt|contact/i.test(`${l.text} ${l.href}`));

    if (email) {
      return [
        finding("AZ-004", {
          status: "ok",
          severity: "info",
          explanation: `È indicato un indirizzo email${pec ? " (anche PEC)" : ""}${phone ? " e un telefono" : ""}.`,
          evidence: [`Email: ${email}`],
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("AZ-004", {
        status: contactPage || phone ? "warn" : "ko",
        severity: "medium",
        explanation: contactPage
          ? "Nella home non c'è un indirizzo email: c'è una pagina contatti, ma la legge chiede un indirizzo email per contattarti rapidamente."
          : "Nella home non abbiamo trovato un indirizzo email per contattarti.",
        howToFix: "Indica nel footer un indirizzo email (o PEC) cliccabile, oltre all'eventuale modulo di contatto.",
      }),
    ];
  },
};

const PROFESSIONS =
  /\b(avvocat[oaie]|studio legale|commercialist[aie]|dottore commercialista|architett[oaie]|ingegner[ei]|geometr[ai]|notai[oa]?|medic[oi] chirurg|odontoiatr[ai]|dentist[ai]|psicolog[oaie]|psicoterapeut[ai]|consulente del lavoro|veterinari[oa]|farmacist[ai]|biolog[oaie]|nutrizionist[ai]|fisioterapist[ai]|ostetric[ai]|infermier[ei])\b/i;

export const az005: Check = {
  id: "AZ-005",
  run(ctx) {
    const profession = PROFESSIONS.exec(ctx.text);
    if (!profession) return [];
    const hasRegistration = /\b(iscritt[oa]|iscrizione|albo|ordine\s+(degli|dei|delle)|collegio\s+(dei|degli)|n\.\s?iscr)/i.test(ctx.text);
    return [
      finding("AZ-005", {
        status: hasRegistration ? "ok" : "warn",
        severity: "info",
        explanation: hasRegistration
          ? "Sembra una professione regolamentata e sono indicati albo o iscrizione."
          : "Sembra il sito di una professione regolamentata, ma non abbiamo trovato ordine o albo di appartenenza e numero di iscrizione.",
        evidence: [`Professione riconosciuta: ${profession[0]}`],
        howToFix: hasRegistration
          ? "Nessuna azione necessaria."
          : "Indica ordine o albo professionale, numero di iscrizione, titolo professionale e Stato in cui è stato rilasciato.",
      }),
    ];
  },
};

export const AZIENDA_CHECKS: readonly Check[] = [az001, az002, az003, az004, az005];
