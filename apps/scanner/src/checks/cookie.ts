import { EMBEDS, EXTERNAL_CDNS, trackerForCookie, trackerForUrl, type TrackerDefinition } from "@semaforo/shared";
import type { BannerButton } from "../browser/types.js";
import { legalText, type ScanContext } from "../scan/context.js";
import { type Check, finding } from "./types.js";

export interface TrackingAnalysis {
  /** Prove forti: cookie di tracciamento o invii di dati (hit) prima del consenso. */
  strong: string[];
  /** Indizi deboli: script caricati senza invii o con Consent Mode "denied". */
  weak: string[];
  trackers: Map<string, TrackerDefinition>;
}

/**
 * Google Consent Mode: il parametro gcs=G1xy indica ad_storage (x) e analytics_storage (y).
 * Se entrambi sono negati (0) il ping non usa cookie: è un indizio, non una prova.
 */
function consentDenied(url: string): boolean {
  const gcs = /[?&]gcs=G1([01-])([01-])/.exec(url);
  return gcs !== null && gcs[1] !== "1" && gcs[2] !== "1";
}

export function analyzeTracking(ctx: ScanContext): TrackingAnalysis | undefined {
  const obs = ctx.browser;
  if (!obs) return undefined;
  const strong: string[] = [];
  const weak: string[] = [];
  const trackers = new Map<string, TrackerDefinition>();

  for (const c of obs.cookies) {
    const t = trackerForCookie(c.name);
    if (!t) continue;
    trackers.set(t.name, t);
    strong.push(`Cookie ${c.name} (${t.name}) impostato su ${c.domain} prima del consenso`);
  }
  const seenHosts = new Set<string>();
  for (const r of obs.requests) {
    const t = trackerForUrl(r.url);
    if (!t) continue;
    trackers.set(t.name, t);
    const isHit = (t.hitPatterns?.some((re) => re.test(r.url)) ?? false) || (r.resourceType === "image" && r.thirdParty);
    if (isHit && !consentDenied(r.url)) {
      strong.push(`Invio dati a ${t.name}: ${r.host} (${r.resourceType})`);
    } else if (isHit) {
      weak.push(`${t.name} contattato con Consent Mode in stato "negato": ${r.host}`);
    } else if (!seenHosts.has(r.host)) {
      weak.push(`Script di ${t.name} caricato prima del consenso: ${r.host}`);
    }
    seenHosts.add(r.host);
  }
  return { strong: [...new Set(strong)], weak: [...new Set(weak)], trackers };
}

const NO_BROWSER = "Il browser non era disponibile: senza aprire il sito come un visitatore non possiamo vedere cookie e tracciamenti.";

export const cookie001: Check = {
  id: "COOKIE-001",
  run(ctx) {
    const a = analyzeTracking(ctx);
    if (!a) {
      return [finding("COOKIE-001", { status: "unverifiable", severity: "info", explanation: NO_BROWSER, howToFix: "Verifica con gli strumenti per sviluppatori del browser (scheda Rete e Cookie) aprendo il sito in incognito." })];
    }
    if (a.strong.length > 0) {
      return [
        finding("COOKIE-001", {
          status: "ko",
          severity: "high",
          explanation:
            "Appena il sito si apre, prima di qualsiasi scelta sul banner, partono strumenti di tracciamento. Cookie analitici non anonimizzati, pubblicitari e pixel social richiedono il consenso preventivo.",
          evidence: [...a.strong, ...a.weak],
          howToFix:
            "Configura la piattaforma di consenso (CMP) in modo che blocchi questi script finché l'utente non accetta, ad esempio con Google Consent Mode avanzato o il blocco automatico degli script.",
        }),
      ];
    }
    if (a.weak.length > 0) {
      return [
        finding("COOKIE-001", {
          status: "warn",
          severity: "medium",
          explanation:
            "Alcuni script di tracciamento si caricano prima del consenso, ma non abbiamo visto cookie o invii di dati. Potrebbe essere Consent Mode correttamente configurato: va verificato.",
          evidence: a.weak,
          howToFix: "Verifica che, prima del consenso, questi servizi non impostino cookie e non inviino dati identificativi. Se possibile, carica gli script solo dopo il consenso.",
        }),
      ];
    }
    return [
      finding("COOKIE-001", {
        status: "ok",
        severity: "info",
        explanation: "All'apertura, senza consenso, non abbiamo rilevato strumenti di tracciamento noti.",
        howToFix: "Nessuna azione necessaria. Il controllo non vede cosa succede dopo l'accettazione.",
      }),
    ];
  },
};

export const cookie002: Check = {
  id: "COOKIE-002",
  run(ctx) {
    const a = analyzeTracking(ctx);
    if (!a || !ctx.browser) return [];
    if (ctx.browser.banner.found) {
      return [
        finding("COOKIE-002", {
          status: "ok",
          severity: "info",
          explanation: `È presente un banner cookie${ctx.browser.banner.vendor ? ` (${ctx.browser.banner.vendor})` : ""}.`,
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    if (a.strong.length === 0 && a.weak.length === 0) {
      return [
        finding("COOKIE-002", {
          status: "ok",
          severity: "info",
          explanation: "Non abbiamo trovato un banner, ma nemmeno tracciamenti: con soli cookie tecnici il banner non è necessario.",
          howToFix: "Se aggiungi analytics, pixel o video incorporati, serve un banner con scelta preventiva.",
        }),
      ];
    }
    return [
      finding("COOKIE-002", {
        status: a.strong.length > 0 ? "ko" : "warn",
        severity: "high",
        explanation:
          a.strong.length > 0
            ? "Il sito usa strumenti di tracciamento ma non mostra alcun banner per chiedere il consenso."
            : "Si caricano script di tracciamento e non abbiamo trovato un banner cookie. Se il banner c'è ma non lo abbiamo riconosciuto, verifica che compaia a un nuovo visitatore.",
        evidence: [...a.strong, ...a.weak].slice(0, 6),
        howToFix: "Installa una piattaforma di gestione del consenso (CMP) con pulsanti Accetta, Rifiuta e Personalizza e il blocco preventivo degli script.",
      }),
    ];
  },
};

function area(b: BannerButton): number {
  return b.width * b.height;
}

export const cookie003: Check = {
  id: "COOKIE-003",
  run(ctx) {
    const banner = ctx.browser?.banner;
    if (!banner?.found) return [];
    const accept = banner.buttons.filter((b) => b.role === "accept");
    const reject = banner.buttons.filter((b) => b.role === "reject");
    const close = banner.buttons.filter((b) => b.role === "close");
    const evidence = banner.buttons.filter((b) => b.role !== "other").map((b) => `${b.role}: "${b.text || "(senza testo)"}" ${b.width}x${b.height}px${b.looksLikeLink ? ", link testuale" : ""}`);

    if (reject.length === 0 && close.length === 0) {
      return [
        finding("COOKIE-003", {
          status: banner.confidence === "high" && accept.length > 0 ? "ko" : "warn",
          severity: "high",
          explanation:
            "Nel banner non abbiamo trovato un pulsante per rifiutare né una X per chiudere. Rifiutare deve essere facile quanto accettare.",
          evidence: evidence.length > 0 ? evidence : [`Testo del banner: "${banner.text.slice(0, 120)}"`],
          howToFix: "Aggiungi un pulsante \"Rifiuta\" (o \"Continua senza accettare\") accanto ad \"Accetta\", con la stessa evidenza grafica.",
        }),
      ];
    }
    if (reject.length === 0) {
      return [
        finding("COOKIE-003", {
          status: "warn",
          severity: "medium",
          explanation:
            "Il banner si chiude con una X ma non ha un pulsante \"Rifiuta\". La chiusura con la X è ammessa se equivale al rifiuto, ma un pulsante esplicito è più chiaro.",
          evidence,
          howToFix: "Assicurati che la X non attivi i cookie e valuta un pulsante \"Rifiuta\" accanto ad \"Accetta\".",
        }),
      ];
    }
    const bestAccept = accept.sort((a, b) => area(b) - area(a))[0];
    const bestReject = reject.sort((a, b) => area(b) - area(a))[0];
    if (bestAccept && bestReject) {
      const smaller = area(bestReject) < area(bestAccept) * 0.5;
      const linkVsButton = bestReject.looksLikeLink && !bestAccept.looksLikeLink;
      const smallerFont = bestReject.fontSize > 0 && bestReject.fontSize < bestAccept.fontSize * 0.8;
      if (smaller || linkVsButton || smallerFont) {
        return [
          finding("COOKIE-003", {
            status: "warn",
            severity: "medium",
            explanation:
              "Il pulsante \"Rifiuta\" sembra meno evidente di \"Accetta\" (più piccolo, testo più piccolo o semplice link). Le linee guida chiedono pari evidenza. La valutazione è automatica e approssimativa.",
            evidence,
            howToFix: "Dai a \"Rifiuta\" la stessa forma, dimensione e peso visivo di \"Accetta\".",
          }),
        ];
      }
    }
    return [
      finding("COOKIE-003", {
        status: "ok",
        severity: "info",
        explanation: "Il banner offre un pulsante per rifiutare con un'evidenza simile a quello per accettare.",
        evidence,
        howToFix: "Nessuna azione necessaria.",
      }),
    ];
  },
};

export const cookie004: Check = {
  id: "COOKIE-004",
  run(ctx) {
    const banner = ctx.browser?.banner;
    if (!banner?.found) return [];
    const customize = banner.buttons.some((b) => b.role === "customize");
    if (customize || banner.hasCategoryToggles) {
      return [
        finding("COOKIE-004", {
          status: "ok",
          severity: "info",
          explanation: "Il banner permette di scegliere per categoria o finalità.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("COOKIE-004", {
        status: "warn",
        severity: "medium",
        explanation:
          "Nel banner non abbiamo trovato un modo per scegliere quali categorie di cookie attivare (es. \"Personalizza\"). Potrebbe trovarsi in un secondo livello che non apriamo.",
        evidence: banner.buttons.map((b) => `pulsante: "${b.text}"`).slice(0, 6),
        howToFix: "Aggiungi un pulsante \"Personalizza\" che apra la scelta per finalità (statistiche, marketing, contenuti di terze parti).",
      }),
    ];
  },
};

export const cookie005: Check = {
  id: "COOKIE-005",
  run(ctx) {
    const a = analyzeTracking(ctx);
    const policyLink = ctx.links.some((l) => /cookie/i.test(`${l.text} ${l.href}`));
    const cookieText = legalText(ctx, "cookie");
    const privacy = legalText(ctx, "privacy");
    const text = cookieText ?? (privacy && /cookie/i.test(privacy) ? privacy : undefined);
    const trackers = a ? [...a.trackers.values()] : [];

    if (!text) {
      if (trackers.length === 0) return [];
      if (!policyLink) {
        return [
          finding("COOKIE-005", {
            status: "ko",
            severity: "medium",
            explanation: "Il sito usa servizi di terze parti ma non abbiamo trovato alcun link a una cookie policy.",
            evidence: trackers.map((t) => `Servizio rilevato: ${t.name}`),
            howToFix: "Pubblica una cookie policy che elenchi i servizi usati, le finalità e la durata dei cookie, e collegala dal footer e dal banner.",
          }),
        ];
      }
      return [
        finding("COOKIE-005", {
          status: "unverifiable",
          severity: "info",
          explanation: "La cookie policy è collegata ma non siamo riusciti a leggerla, quindi non possiamo confrontarla con i servizi rilevati.",
          howToFix: "Verifica che la cookie policy citi tutti i servizi rilevati.",
        }),
      ];
    }
    if (trackers.length === 0) {
      return [
        finding("COOKIE-005", {
          status: "ok",
          severity: "info",
          explanation: "La cookie policy è presente e non abbiamo rilevato servizi di tracciamento da confrontare.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    const missing = trackers.filter((t) => !t.keywords.test(text)).map((t) => t.name);
    if (missing.length === 0) {
      return [
        finding("COOKIE-005", {
          status: "ok",
          severity: "info",
          explanation: "La cookie policy cita i servizi di terze parti rilevati.",
          howToFix: "Nessuna azione necessaria. Verifica anche durate e finalità indicate.",
        }),
      ];
    }
    return [
      finding("COOKIE-005", {
        status: "warn",
        severity: "medium",
        explanation: "La cookie policy non sembra citare alcuni servizi che il sito usa. Il confronto è per parole chiave.",
        evidence: missing.map((m) => `Non citato: ${m}`),
        howToFix: "Aggiorna la cookie policy con l'elenco completo dei servizi, la finalità, la durata dei cookie e il link all'informativa di ciascun fornitore.",
      }),
    ];
  },
};

function cdnHits(ctx: ScanContext): Array<{ name: string; kind: "font" | "library"; url: string }> {
  const urls = new Set<string>([
    ...(ctx.browser?.requests.map((r) => r.url) ?? []),
    ...ctx.scripts.map((s) => s.url),
    ...ctx.$('link[href]').map((_, el) => ctx.$(el).attr("href") ?? "").get(),
  ]);
  const hits: Array<{ name: string; kind: "font" | "library"; url: string }> = [];
  const seen = new Set<string>();
  for (const url of urls) {
    let host: string;
    try {
      host = new URL(url, ctx.finalUrl).hostname;
    } catch {
      continue;
    }
    const cdn = EXTERNAL_CDNS.find((c) => c.domains.some((d) => host === d || host.endsWith(`.${d}`)));
    if (cdn && !seen.has(cdn.name)) {
      seen.add(cdn.name);
      hits.push({ name: cdn.name, kind: cdn.kind, url });
    }
  }
  return hits;
}

export const cookie006: Check = {
  id: "COOKIE-006",
  run(ctx) {
    const hits = cdnHits(ctx);
    if (hits.length === 0) {
      return [
        finding("COOKIE-006", {
          status: "ok",
          severity: "info",
          explanation: "Non abbiamo rilevato font o librerie caricati da CDN esterni noti.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    const fonts = hits.some((h) => h.kind === "font");
    return [
      finding("COOKIE-006", {
        status: "warn",
        severity: fonts ? "medium" : "low",
        explanation:
          "Il sito carica font o librerie da server esterni: ogni visitatore invia così il proprio indirizzo IP a terzi, senza saperlo. Ospitarli sul proprio server evita il problema.",
        evidence: hits.map((h) => `${h.name}: ${h.url}`),
        howToFix: "Scarica i font e le librerie e servili dal tuo dominio (self-hosting). In WordPress esistono plugin che lo fanno automaticamente.",
      }),
    ];
  },
};

export const cookie007: Check = {
  id: "COOKIE-007",
  run(ctx) {
    const loaded = new Set<string>([
      ...(ctx.browser?.iframes ?? []),
      ...(ctx.browser?.requests.filter((r) => r.resourceType === "document" && !r.isNavigation).map((r) => r.url) ?? []),
    ]);
    if (!ctx.browser) {
      // Senza browser: iframe con src già presenti nell'HTML (si caricano subito).
      ctx.$("iframe[src]").each((_, el) => {
        const src = ctx.$(el).attr("src");
        if (src) loaded.add(src);
      });
    }
    const found = new Map<string, { privacyFriendly: boolean; url: string }>();
    for (const url of loaded) {
      const e = EMBEDS.find((x) => x.re.test(url));
      if (e && !found.has(e.name)) found.set(e.name, { privacyFriendly: e.privacyFriendly ?? false, url });
    }
    if (found.size === 0) {
      return ctx.browser
        ? [
            finding("COOKIE-007", {
              status: "ok",
              severity: "info",
              explanation: "Nessun contenuto incorporato di terze parti si carica prima del consenso.",
              howToFix: "Nessuna azione necessaria.",
            }),
          ]
        : [];
    }
    const onlyFriendly = [...found.values()].every((f) => f.privacyFriendly);
    return [
      finding("COOKIE-007", {
        status: "warn",
        severity: onlyFriendly ? "low" : "medium",
        explanation: onlyFriendly
          ? "C'è un video YouTube in modalità privacy avanzata: non imposta cookie subito, ma trasmette comunque l'IP del visitatore prima del consenso."
          : "Alcuni contenuti di terze parti (video, mappe, post social) si caricano prima del consenso e possono impostare cookie o trasmettere dati.",
        evidence: [...found.entries()].map(([name, f]) => `${name}: ${f.url}`),
        howToFix: "Mostra un'anteprima con il pulsante \"Carica contenuto\" e carica l'incorporamento solo dopo il consenso (molte CMP lo fanno in automatico).",
      }),
    ];
  },
};

export const COOKIE_CHECKS: readonly Check[] = [cookie001, cookie002, cookie003, cookie004, cookie005, cookie006, cookie007];
