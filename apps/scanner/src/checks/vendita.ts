import { legalText, type ScanContext } from "../scan/context.js";
import { findPartiteIva, isValidPartitaIva } from "./azienda.js";
import { type Check, finding } from "./types.js";

/** Testi in cui cercare le informazioni per i consumatori: pagine di vendita, recesso, termini, più la home. */
function salesText(ctx: ScanContext): string | undefined {
  return legalText(ctx, "sales", "withdrawal", "terms", "legal");
}

const SALES_LINK = /condizioni\s+(generali\s+)?(di\s+)?vendita|termini\s+(e|&)\s+condizioni|condizioni\s+generali|termini\s+di\s+vendita|\bcgv\b|terms/i;

export const vend001: Check = {
  id: "VEND-001",
  run(ctx) {
    const page = ctx.legalPages.find((p) => p.kind === "sales");
    if (page) {
      return [
        finding("VEND-001", {
          status: "ok",
          severity: "info",
          explanation: "Le condizioni generali di vendita sono raggiungibili.",
          evidence: [page.url],
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    const link = ctx.links.find((l) => SALES_LINK.test(`${l.text} ${l.href}`));
    if (link) {
      return [
        finding("VEND-001", {
          status: "unverifiable",
          severity: "info",
          explanation: "C'è un link alle condizioni di vendita, ma non siamo riusciti a leggerne il contenuto.",
          evidence: [link.url ?? link.href],
          howToFix: "Verifica che la pagina sia raggiungibile e completa.",
        }),
      ];
    }
    return [
      finding("VEND-001", {
        status: "ko",
        severity: "high",
        explanation:
          "Il sito sembra vendere online ma non abbiamo trovato le condizioni generali di vendita. Il consumatore deve poterle leggere prima di acquistare.",
        howToFix: "Pubblica le condizioni generali di vendita e collegale dal footer e dal checkout.",
      }),
    ];
  },
};

export const vend002: Check = {
  id: "VEND-002",
  run(ctx) {
    const text = salesText(ctx);
    if (text === undefined) {
      return [
        finding("VEND-002", {
          status: "unverifiable",
          severity: "info",
          explanation: "Non abbiamo letto pagine su vendita o recesso, quindi non possiamo verificare le informazioni sul diritto di recesso.",
          howToFix: "Verifica che siano spiegati il recesso di 14 giorni e come esercitarlo.",
        }),
      ];
    }
    const hasRecesso = /recesso|ripensamento|right of withdrawal/i.test(text);
    const has14 = /\b(14|quattordici)\s+giorni/i.test(text);
    const hasForm = /modulo|formulario|istruzioni|comunicazione\s+(scritta|esplicita)|dichiarazione\s+esplicita/i.test(text);
    if (hasRecesso && has14 && hasForm) {
      return [
        finding("VEND-002", {
          status: "ok",
          severity: "info",
          explanation: "Sono indicati il diritto di recesso entro 14 giorni e come esercitarlo.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    if (!hasRecesso) {
      return [
        finding("VEND-002", {
          status: "ko",
          severity: "high",
          explanation: "Nelle pagine di vendita lette non si parla del diritto di recesso, che va sempre comunicato al consumatore.",
          howToFix: "Aggiungi una sezione sul diritto di recesso: 14 giorni, modulo tipo, a chi inviarlo, rimborso e costi di restituzione.",
        }),
      ];
    }
    const missing = [!has14 && "termine di 14 giorni", !hasForm && "modulo o istruzioni per recedere"].filter(Boolean) as string[];
    return [
      finding("VEND-002", {
        status: "warn",
        severity: "medium",
        explanation: `Il recesso è citato ma mancano: ${missing.join(" e ")}.`,
        evidence: missing.map((m) => `Non trovato: ${m}`),
        howToFix: "Indica chiaramente il termine di 14 giorni e allega il modulo tipo di recesso (Allegato I, parte B del Codice del Consumo).",
      }),
    ];
  },
};

export const vend003: Check = {
  id: "VEND-003",
  run(ctx) {
    const text = `${salesText(ctx) ?? ""} ${ctx.text}`;
    const hasFunction = /funzione\s+di\s+recesso|pulsante\s+di\s+recesso|recedi\s+(dal\s+contratto|qui|online)|recesso\s+online|recedere\s+dal\s+contratto\s+qui/i.test(text);
    return [
      finding("VEND-003", {
        status: hasFunction ? "ok" : "warn",
        severity: "info",
        explanation: hasFunction
          ? "Sembra presente una funzione per recedere online."
          : "Non abbiamo trovato una funzione per recedere online. La Dir. (UE) 2023/2673 la prevede per i contratti a distanza dal 19/06/2026: verifica con un professionista come è stata recepita in Italia e se si applica al tuo caso.",
        howToFix: hasFunction
          ? "Verifica che la funzione sia ben visibile e confermi la ricezione su supporto durevole."
          : "Valuta con un professionista l'aggiunta di un pulsante \"Recedi dal contratto qui\" nell'area cliente o nel footer.",
      }),
    ];
  },
};

export const vend004: Check = {
  id: "VEND-004",
  run(ctx) {
    const text = salesText(ctx);
    if (text === undefined) return [];
    const legal = /garanzia\s+legale|garanzia\s+di\s+conformit|difetto\s+di\s+conformit/i.test(text);
    const duration = /\b(24|ventiquattro)\s+mesi|\b(2|due)\s+anni/i.test(text);
    if (legal && duration) {
      return [
        finding("VEND-004", {
          status: "ok",
          severity: "info",
          explanation: "È citata la garanzia legale di conformità di 24 mesi.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("VEND-004", {
        status: "warn",
        severity: "medium",
        explanation: legal
          ? "La garanzia legale è citata, ma non abbiamo trovato la durata di 24 mesi."
          : "Nelle pagine lette non abbiamo trovato la garanzia legale di conformità (24 mesi). Potrebbe essere in una pagina che non abbiamo letto.",
        howToFix: "Indica nelle condizioni di vendita la garanzia legale di conformità di 24 mesi prevista dal Codice del Consumo, distinta da eventuali garanzie commerciali.",
      }),
    ];
  },
};

export const vend005: Check = {
  id: "VEND-005",
  run(ctx) {
    const text = `${salesText(ctx) ?? ""} ${ctx.text}`;
    const shipping = /spedizion|consegna|shipping/i.test(text);
    const times = /(giorni|ore)\s+lavorativ|tempi\s+di\s+(consegna|spedizione)|entro\s+\d+\s+(giorni|ore)|consegna\s+in\s+\d+/i.test(text);
    const costs = /(cost[oi]|spese)\s+di\s+(spedizione|consegna)|spedizione\s+gratuita|free\s+shipping/i.test(text);
    const taxes = /iva\s+inclusa|iva\s+compresa|tasse\s+incluse|imposte\s+incluse|prezzi\s+(sono\s+)?(comprensivi|inclusi)|incl\.?\s+iva/i.test(text);
    const missing = [!costs && "costi di spedizione", !times && "tempi di consegna", !taxes && "prezzi comprensivi di IVA"].filter(Boolean) as string[];
    if (missing.length === 0) {
      return [
        finding("VEND-005", {
          status: "ok",
          severity: "info",
          explanation: "Sono indicati costi e tempi di spedizione e prezzi comprensivi di imposte.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("VEND-005", {
        status: "warn",
        severity: shipping ? "low" : "medium",
        explanation: `Nelle pagine lette non abbiamo trovato: ${missing.join(", ")}. Il consumatore deve conoscere il prezzo totale prima di ordinare.`,
        evidence: missing.map((m) => `Non trovato: ${m}`),
        howToFix: "Indica in una pagina dedicata (e nel carrello) costi e tempi di spedizione per zona e che i prezzi sono IVA inclusa.",
      }),
    ];
  },
};

const ODR = /ec\.europa\.eu\/consumers\/odr|webgate\.ec\.europa\.eu\/odr/i;

export const vend006: Check = {
  id: "VEND-006",
  run(ctx) {
    const links = [...ctx.links.map((l) => l.url ?? l.href), ...ctx.legalPages.flatMap((p) => p.links)];
    const text = `${ctx.text} ${ctx.legalPages.map((p) => p.text).join(" ")}`;
    const found = links.filter((l) => ODR.test(l));
    if (found.length === 0 && !ODR.test(text)) {
      return [
        finding("VEND-006", {
          status: "ok",
          severity: "info",
          explanation: "Non abbiamo trovato link alla piattaforma ODR dismessa.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("VEND-006", {
        status: "warn",
        severity: "low",
        explanation:
          "Il sito rimanda ancora alla piattaforma europea ODR per le controversie online, che è stata dismessa. Il link è inutile e va rimosso (verifica data e fonte con un professionista).",
        evidence: found.length > 0 ? [...new Set(found)].slice(0, 3) : ["Riferimento testuale alla piattaforma ODR"],
        howToFix: "Rimuovi il link e il riferimento all'ODR dal footer e dalle condizioni di vendita; mantieni le informazioni su eventuali organismi ADR.",
      }),
    ];
  },
};

const PAYMENTS = /carta\s+di\s+credito|carte\s+di\s+credito|\bvisa\b|mastercard|paypal|bonifico|satispay|contrassegno|apple\s+pay|google\s+pay|klarna|scalapay|stripe|postepay/i;

export const vend007: Check = {
  id: "VEND-007",
  run(ctx) {
    const sales = salesText(ctx);
    const text = `${sales ?? ""} ${ctx.text}`;
    const evidence: string[] = [];
    const payments = PAYMENTS.test(text);
    if (!payments) evidence.push("Metodi di pagamento non indicati");

    const homeVat = findPartiteIva(ctx.text).filter(isValidPartitaIva);
    const salesVat = sales ? findPartiteIva(sales).filter(isValidPartitaIva) : [];
    const mismatch = homeVat.length > 0 && salesVat.length > 0 && !salesVat.some((v) => homeVat.includes(v));
    if (mismatch) evidence.push(`Partita IVA diversa tra home (${homeVat.join(", ")}) e condizioni di vendita (${salesVat.join(", ")})`);

    if (evidence.length === 0) {
      return [
        finding("VEND-007", {
          status: "ok",
          severity: "info",
          explanation: "Sono indicati i metodi di pagamento e i dati del venditore sono coerenti.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("VEND-007", {
        status: "warn",
        severity: mismatch ? "medium" : "low",
        explanation: mismatch
          ? "I dati del venditore non coincidono tra home e condizioni di vendita: il consumatore deve sapere con certezza con chi sta contrattando."
          : "Non abbiamo trovato i metodi di pagamento accettati.",
        evidence,
        howToFix: "Indica i metodi di pagamento accettati e usa gli stessi dati del venditore (denominazione, sede, P.IVA) in tutte le pagine.",
      }),
    ];
  },
};

export const VENDITA_CHECKS: readonly Check[] = [vend001, vend002, vend003, vend004, vend005, vend006, vend007];
