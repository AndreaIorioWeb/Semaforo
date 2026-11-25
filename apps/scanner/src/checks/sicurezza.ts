import { compareVersions, VULNERABLE_LIBRARIES, WORDPRESS_MIN_RECOMMENDED } from "@semaforo/shared";
import type { ScanContext } from "../scan/context.js";
import { headerValue } from "../scan/html.js";
import { type Check, finding } from "./types.js";

/** Maschera un segreto: primi 4 e ultimi 2 caratteri (SPEC sezione 5). Mai mostrato né salvato in chiaro. */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return `${secret.slice(0, 2)}${"*".repeat(Math.max(4, secret.length - 2))}`;
  return `${secret.slice(0, 4)}${"*".repeat(Math.min(16, secret.length - 6))}${secret.slice(-2)}`;
}

const EXPIRY_WARNING_DAYS = 14;

export const sec001: Check = {
  id: "SEC-001",
  run(ctx) {
    const now = Date.now();
    if (ctx.tlsError) {
      return [
        finding("SEC-001", {
          status: "ko",
          severity: "high",
          explanation:
            "Il certificato HTTPS del sito non è valido: i browser mostrano un avviso di sicurezza e molti visitatori se ne vanno.",
          evidence: [`Errore TLS: ${ctx.tlsError}`],
          howToFix: "Rinnova o reinstalla il certificato (ad esempio con Let's Encrypt dal pannello dell'hosting) e verifica che copra il dominio con e senza www.",
        }),
      ];
    }
    if (ctx.finalUrl.protocol !== "https:") {
      return [
        finding("SEC-001", {
          status: "ko",
          severity: "high",
          explanation: "Il sito non usa HTTPS: i dati inviati (ad esempio dai moduli) viaggiano in chiaro e il browser lo segnala come \"non sicuro\".",
          evidence: [`Indirizzo finale: ${ctx.finalUrl.href}`],
          howToFix: "Attiva un certificato HTTPS (gratuito con Let's Encrypt) e reindirizza tutte le pagine da http a https.",
        }),
      ];
    }
    const issues: string[] = [];
    if (ctx.httpRedirectsToHttps === false) issues.push("la versione http:// non reindirizza a https://");
    const validTo = ctx.tls?.validTo ? Date.parse(ctx.tls.validTo) : Number.NaN;
    if (!Number.isNaN(validTo)) {
      const days = Math.floor((validTo - now) / 86_400_000);
      if (days < EXPIRY_WARNING_DAYS) issues.push(`il certificato scade tra ${days} giorni`);
    }
    if (issues.length > 0) {
      return [
        finding("SEC-001", {
          status: "warn",
          severity: "medium",
          explanation: "HTTPS è attivo, ma c'è qualcosa da sistemare.",
          evidence: issues,
          howToFix: "Imposta il redirect permanente (301) da http a https e attiva il rinnovo automatico del certificato.",
        }),
      ];
    }
    return [
      finding("SEC-001", {
        status: "ok",
        severity: "info",
        explanation: "HTTPS è attivo e il certificato è valido.",
        ...(ctx.tls?.validTo ? { evidence: [`Certificato valido fino al ${ctx.tls.validTo}`] } : {}),
        howToFix: "Nessuna azione necessaria.",
      }),
    ];
  },
};

const SECURITY_HEADERS: ReadonlyArray<{ label: string; present: (ctx: ScanContext) => boolean }> = [
  { label: "Strict-Transport-Security (HSTS)", present: (c) => !!headerValue(c.headers, "strict-transport-security") },
  { label: "Content-Security-Policy", present: (c) => !!headerValue(c.headers, "content-security-policy") },
  { label: "X-Content-Type-Options", present: (c) => /nosniff/i.test(headerValue(c.headers, "x-content-type-options") ?? "") },
  {
    label: "X-Frame-Options o frame-ancestors",
    present: (c) => !!headerValue(c.headers, "x-frame-options") || /frame-ancestors/i.test(headerValue(c.headers, "content-security-policy") ?? ""),
  },
  { label: "Referrer-Policy", present: (c) => !!headerValue(c.headers, "referrer-policy") },
  { label: "Permissions-Policy", present: (c) => !!headerValue(c.headers, "permissions-policy") },
];

export const sec002: Check = {
  id: "SEC-002",
  run(ctx) {
    const missing = SECURITY_HEADERS.filter((h) => !h.present(ctx)).map((h) => h.label);
    if (missing.length === 0) {
      return [
        finding("SEC-002", {
          status: "ok",
          severity: "info",
          explanation: "Tutti gli header di sicurezza consigliati sono presenti.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("SEC-002", {
        status: "warn",
        severity: missing.length >= 4 ? "medium" : "low",
        explanation:
          "Mancano alcuni header di sicurezza: sono istruzioni che il server dà al browser per ridurre rischi come il clickjacking. È un miglioramento consigliato, non una falla certa.",
        evidence: missing.map((m) => `Manca: ${m}`),
        howToFix: "Aggiungi gli header mancanti nella configurazione del server (nginx, .htaccess) o con un plugin di sicurezza.",
      }),
    ];
  },
};

export const sec003: Check = {
  id: "SEC-003",
  run(ctx) {
    if (!ctx.dns || ctx.dns.failed) {
      return [
        finding("SEC-003", {
          status: "unverifiable",
          severity: "info",
          explanation: "Non siamo riusciti a leggere i record DNS del dominio.",
          howToFix: "Verifica SPF e DMARC con il tuo provider di posta.",
        }),
      ];
    }
    const issues: string[] = [];
    const spf = ctx.dns.spf.find((r) => /^v=spf1\b/i.test(r));
    if (!spf) issues.push("record SPF assente");
    else if (/[+?]all\b/i.test(spf)) issues.push(`SPF troppo permissivo: "${spf}"`);
    const dmarc = ctx.dns.dmarc.find((r) => /^v=DMARC1\b/i.test(r));
    if (!dmarc) issues.push("record DMARC assente");
    else if (/\bp\s*=\s*none\b/i.test(dmarc)) issues.push("DMARC con policy \"none\": monitora ma non blocca le email false");
    if (issues.length === 0) {
      return [
        finding("SEC-003", {
          status: "ok",
          severity: "info",
          explanation: "SPF e DMARC sono configurati.",
          evidence: [`SPF: ${spf}`, `DMARC: ${dmarc}`],
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("SEC-003", {
        status: "warn",
        severity: !spf || !dmarc ? "medium" : "low",
        explanation:
          "Senza SPF e DMARC chiunque può inviare email che sembrano partire dal tuo dominio (phishing a clienti e fornitori).",
        evidence: [`Dominio: ${ctx.dns.domain}`, ...issues],
        howToFix:
          "Aggiungi nel DNS un record SPF fornito dal tuo provider di posta e un record DMARC su _dmarc (inizia con p=none, poi passa a quarantine o reject).",
      }),
    ];
  },
};

interface SecretPattern {
  label: string;
  re: RegExp;
  /** false per chiavi che possono essere pubbliche se limitate (es. Google Maps). */
  definite: boolean;
  validate?: (match: string) => boolean;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  { label: "chiave segreta Stripe (live)", re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/g, definite: true },
  { label: "chiave di accesso AWS", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, definite: true },
  { label: "chiave privata", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g, definite: true },
  { label: "token GitHub", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/g, definite: true },
  { label: "token Slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, definite: true },
  { label: "chiave API OpenAI", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g, definite: true, validate: (m) => !m.startsWith("sk-ant-") },
  { label: "chiave API Anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g, definite: true },
  { label: "chiave SendGrid", re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, definite: true },
  {
    label: "chiave Supabase service_role",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    definite: true,
    validate: (m) => jwtRole(m) === "service_role",
  },
  { label: "chiave API Google", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, definite: false },
];

function jwtRole(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

export const sec004: Check = {
  id: "SEC-004",
  run(ctx) {
    const sources: Array<{ where: string; code: string }> = [
      { where: "home", code: ctx.rawHtml },
      ...ctx.scripts.filter((s) => s.content).map((s) => ({ where: s.url, code: s.content ?? "" })),
    ];
    const definite: string[] = [];
    const possible: string[] = [];
    const seen = new Set<string>();
    for (const { where, code } of sources) {
      for (const p of SECRET_PATTERNS) {
        for (const m of code.matchAll(p.re)) {
          const value = m[0];
          if (seen.has(value) || (p.validate && !p.validate(value))) continue;
          seen.add(value);
          const line = `${p.label}: ${maskSecret(value)} (in ${where === "home" ? "home" : where})`;
          (p.definite ? definite : possible).push(line);
        }
      }
    }
    if (definite.length > 0) {
      return [
        finding("SEC-004", {
          status: "ko",
          severity: "high",
          explanation:
            "Nel codice pubblico del sito c'è quella che sembra una chiave segreta. Chiunque visiti il sito può copiarla e usarla a tuo nome (pagamenti, servizi cloud, dati).",
          evidence: [...definite, ...possible],
          howToFix:
            "Revoca subito la chiave dal pannello del servizio, generane una nuova e spostala sul server (variabile d'ambiente): non deve mai finire nel codice che arriva al browser.",
        }),
      ];
    }
    if (possible.length > 0) {
      return [
        finding("SEC-004", {
          status: "warn",
          severity: "low",
          explanation:
            "C'è una chiave API Google nel codice pubblico. Per alcuni servizi (es. Maps) è normale, ma deve essere limitata al tuo dominio, altrimenti altri possono usarla a tue spese.",
          evidence: possible,
          howToFix: "Nella Google Cloud Console imposta le restrizioni della chiave: referrer HTTP del tuo dominio e solo le API necessarie.",
        }),
      ];
    }
    return [
      finding("SEC-004", {
        status: "ok",
        severity: "info",
        explanation: "Non abbiamo trovato chiavi segrete nel codice pubblico analizzato.",
        howToFix: "Nessuna azione necessaria.",
      }),
    ];
  },
};

interface DetectedLibrary {
  name: string;
  version: string;
  source: string;
}

const LIB_FILE_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "jquery", re: /jquery[-.]?(\d+\.\d+(?:\.\d+)?)(?:\.min|\.slim)*\.js/i },
  { name: "jquery", re: /\/jquery\/(\d+\.\d+(?:\.\d+)?)\/jquery/i },
  { name: "jquery", re: /\/jquery(?:\.min)?\.js\?ver=(\d+\.\d+(?:\.\d+)?)/i },
  { name: "jquery-ui", re: /jquery-ui[-.]?(\d+\.\d+(?:\.\d+)?)/i },
  { name: "jquery-ui", re: /\/jqueryui\/(\d+\.\d+(?:\.\d+)?)\//i },
  { name: "bootstrap", re: /bootstrap[@/-](\d+\.\d+(?:\.\d+)?)/i },
  { name: "angular", re: /angular(?:js)?[@/.-](1\.\d+(?:\.\d+)?)/i },
  { name: "lodash", re: /lodash[@/.-](\d+\.\d+(?:\.\d+)?)/i },
  { name: "moment", re: /moment[@/.-](\d+\.\d+(?:\.\d+)?)/i },
  { name: "handlebars", re: /handlebars[@/.-](\d+\.\d+(?:\.\d+)?)/i },
  { name: "underscore", re: /underscore[@/.-](\d+\.\d+(?:\.\d+)?)/i },
];

const LIB_BANNER_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "jquery", re: /jQuery (?:JavaScript Library )?v(\d+\.\d+(?:\.\d+)?)/ },
  { name: "jquery-ui", re: /jQuery UI - v(\d+\.\d+(?:\.\d+)?)/ },
  { name: "bootstrap", re: /Bootstrap v(\d+\.\d+(?:\.\d+)?)/ },
  { name: "angular", re: /AngularJS v(1\.\d+(?:\.\d+)?)/ },
  { name: "lodash", re: /lodash(?:\.com)?\s*(?:<[^>]+>\s*)?(?:Lodash\s*)?v?(\d+\.\d+\.\d+)/i },
  { name: "moment", re: /\/\/! moment\.js\s*(?:\/\/! )?version\s*:\s*(\d+\.\d+\.\d+)/i },
];

export function detectLibraries(ctx: ScanContext): DetectedLibrary[] {
  const found = new Map<string, DetectedLibrary>();
  const add = (lib: DetectedLibrary) => {
    const key = `${lib.name}@${lib.version}`;
    if (!found.has(key)) found.set(key, lib);
  };
  for (const s of ctx.scripts) {
    for (const p of LIB_FILE_PATTERNS) {
      const m = p.re.exec(s.url);
      if (m?.[1]) add({ name: p.name, version: m[1], source: s.url });
    }
    if (s.content) {
      const head = s.content.slice(0, 2000);
      for (const p of LIB_BANNER_PATTERNS) {
        const m = p.re.exec(head);
        if (m?.[1]) add({ name: p.name, version: m[1], source: s.url });
      }
    }
  }
  for (const href of ctx.$('link[rel="stylesheet"]').map((_, el) => ctx.$(el).attr("href") ?? "").get()) {
    const m = /bootstrap[@/-](\d+\.\d+(?:\.\d+)?)/i.exec(href);
    if (m?.[1]) add({ name: "bootstrap", version: m[1], source: href });
  }
  return [...found.values()];
}

export const sec005: Check = {
  id: "SEC-005",
  run(ctx) {
    const libs = detectLibraries(ctx);
    if (libs.length === 0) return [];
    const vulnerable = libs.flatMap((lib) => {
      const known = VULNERABLE_LIBRARIES.find((v) => v.name === lib.name);
      if (!known || compareVersions(lib.version, known.fixedIn) >= 0) return [];
      // Bootstrap 4.x corretto da 4.3.1, 3.x da 3.4.1.
      if (lib.name === "bootstrap" && lib.version.startsWith("4.") && compareVersions(lib.version, "4.3.1") >= 0) return [];
      return [`${lib.name} ${lib.version}: ${known.advisory}`];
    });
    if (vulnerable.length === 0) {
      return [
        finding("SEC-005", {
          status: "ok",
          severity: "info",
          explanation: "Le librerie riconosciute non risultano nell'elenco di versioni con vulnerabilità note.",
          evidence: libs.map((l) => `${l.name} ${l.version}`),
          howToFix: "Nessuna azione necessaria. Tieni aggiornati tema e plugin.",
        }),
      ];
    }
    return [
      finding("SEC-005", {
        status: "warn",
        severity: "medium",
        explanation:
          "Il sito usa versioni vecchie di librerie JavaScript con vulnerabilità note. La versione è dedotta dai nomi dei file e potrebbe essere imprecisa.",
        evidence: vulnerable,
        howToFix: "Aggiorna tema, plugin o dipendenze che includono queste librerie alla versione più recente.",
      }),
    ];
  },
};

export const sec006: Check = {
  id: "SEC-006",
  run(ctx) {
    if (ctx.cms?.name !== "WordPress") return [];
    const evidence: string[] = [];
    let outdated = false;
    const generator = ctx.$('meta[name="generator" i]').attr("content") ?? "";
    if (/wordpress/i.test(generator)) evidence.push(`meta generator visibile: "${generator}"`);
    const version = ctx.cms.version ?? /[?&]ver=(\d+\.\d+(?:\.\d+)?)/.exec(ctx.$('link[href*="wp-includes"], script[src*="wp-includes"]').attr("href") ?? "")?.[1];
    if (ctx.cms.version) {
      evidence.push(`versione WordPress esposta: ${ctx.cms.version}`);
      if (compareVersions(ctx.cms.version, WORDPRESS_MIN_RECOMMENDED) < 0) {
        outdated = true;
        evidence.push(`versione precedente alla ${WORDPRESS_MIN_RECOMMENDED}: probabilmente non aggiornata`);
      }
    }
    const plugins = new Map<string, string>();
    for (const m of ctx.html.matchAll(/\/wp-content\/plugins\/([a-z0-9_-]+)\/[^"'\s>]*?[?&]ver=([\d.]+)/gi)) {
      if (m[1] && m[2] && !plugins.has(m[1])) plugins.set(m[1], m[2]);
    }
    if (plugins.size > 0) {
      evidence.push(`plugin con versione visibile: ${[...plugins.entries()].slice(0, 8).map(([n, v]) => `${n} ${v}`).join(", ")}`);
    }
    if (evidence.length === 0) {
      return [
        finding("SEC-006", {
          status: "ok",
          severity: "info",
          explanation: "WordPress non espone versione né plugin nei percorsi pubblici analizzati.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("SEC-006", {
        status: "warn",
        severity: outdated ? "medium" : "low",
        explanation:
          "WordPress mostra pubblicamente versione o plugin. Non è una falla di per sé, ma aiuta chi cerca siti con versioni vulnerabili.",
        evidence: version && !ctx.cms.version ? [...evidence, `versione dedotta dagli asset: ${version}`] : evidence,
        howToFix:
          "Aggiorna WordPress e plugin. Rimuovi il meta generator (remove_action('wp_head', 'wp_generator')) e valuta di eliminare readme.html dalla radice del sito.",
      }),
    ];
  },
};

export const sec007: Check = {
  id: "SEC-007",
  run(ctx) {
    const services = ctx.technologies.filter((t) => t === "Supabase" || t === "Firebase");
    if (services.length === 0) return [];
    return [
      finding("SEC-007", {
        status: "unverifiable",
        severity: "info",
        explanation: `Il sito usa ${services.join(" e ")} direttamente dal browser. Da fuori non possiamo vedere se le regole di accesso proteggono davvero i dati.`,
        evidence: services.map((s) => `Rilevato: ${s}`),
        howToFix:
          services.includes("Supabase")
            ? "Verifica che Row Level Security sia attiva su tutte le tabelle e che nel browser arrivi solo la chiave anon."
            : "Verifica le Security Rules di Firestore e Realtime Database: niente regole \"allow read, write: if true\".",
      }),
    ];
  },
};

export const sec008: Check = {
  id: "SEC-008",
  run(ctx) {
    if (ctx.finalUrl.protocol !== "https:") return [];
    const $ = ctx.$;
    const active: string[] = [];
    const passive: string[] = [];
    $("script[src], iframe[src], link[rel=stylesheet][href], object[data], embed[src], form[action]").each((_, el) => {
      const url = $(el).attr("src") ?? $(el).attr("href") ?? $(el).attr("data") ?? $(el).attr("action") ?? "";
      if (/^http:\/\//i.test(url)) active.push(`${el.tagName}: ${url}`);
    });
    $("img[src], audio[src], video[src], source[src]").each((_, el) => {
      const url = $(el).attr("src") ?? "";
      if (/^http:\/\//i.test(url)) passive.push(`${el.tagName}: ${url}`);
    });
    if (active.length === 0 && passive.length === 0) {
      return [
        finding("SEC-008", {
          status: "ok",
          severity: "info",
          explanation: "La home non carica risorse in HTTP non cifrato.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("SEC-008", {
        status: active.length > 0 ? "ko" : "warn",
        severity: active.length > 0 ? "medium" : "low",
        explanation:
          active.length > 0
            ? "La pagina è in HTTPS ma carica script, stili o moduli in HTTP: il browser li blocca o mostra avvisi, e possono essere manomessi."
            : "La pagina è in HTTPS ma carica alcune immagini o media in HTTP non cifrato.",
        evidence: [...active, ...passive],
        howToFix: "Sostituisci gli indirizzi http:// con https:// (in WordPress puoi usare uno strumento di cerca e sostituisci sul database).",
      }),
    ];
  },
};

export const SICUREZZA_CHECKS: readonly Check[] = [sec001, sec002, sec003, sec004, sec005, sec006, sec007, sec008];
