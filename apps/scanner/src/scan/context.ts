import type { IncomingHttpHeaders } from "node:http";
import type { SiteType, SiteTypeInput } from "@semaforo/shared";
import type { BrowserObservation } from "../browser/types.js";
import type { RedirectHop, TlsInfo } from "../security/safe-fetch.js";
import { type CheerioAPI, extractLinks, loadHtml, type PageLink, visibleText } from "./html.js";

export type LegalKind = "privacy" | "cookie" | "terms" | "sales" | "withdrawal" | "legal" | "contacts";

export interface LegalPage {
  kind: LegalKind;
  url: string;
  text: string;
  /** Link trovati nella pagina (per VEND-006 e simili). */
  links: string[];
}

export interface ScriptInfo {
  url: string;
  sameOrigin: boolean;
  /** Contenuto, solo per gli script dello stesso sito scaricati (budget limitato). */
  content?: string;
}

export interface DnsInfo {
  domain: string;
  spf: string[];
  dmarc: string[];
  /** true se la lettura DNS è fallita: SEC-003 diventa non verificabile. */
  failed: boolean;
}

export interface CmsDetection {
  name: string;
  version?: string;
  evidence: string[];
}

export interface ScanContext {
  inputUrl: string;
  /** URL finale della home dopo i redirect. */
  finalUrl: URL;
  status: number;
  headers: IncomingHttpHeaders;
  /** HTML della home (renderizzato dal browser se disponibile, altrimenti quello grezzo). */
  html: string;
  /** HTML grezzo ricevuto via HTTP. */
  rawHtml: string;
  $: CheerioAPI;
  text: string;
  links: PageLink[];
  redirects: RedirectHop[];
  tls?: TlsInfo;
  /** Codice dell'errore TLS se la connessione HTTPS è fallita (es. CERT_HAS_EXPIRED). */
  tlsError?: string;
  /** true/false se verificato il redirect da http:// a https://; undefined se non verificabile. */
  httpRedirectsToHttps?: boolean;
  /** Contenuto di robots.txt; null se assente (404); undefined se non letto. */
  robotsTxt?: string | null;
  sitemapFound?: boolean;
  securityTxtFound?: boolean;
  /** Stato HTTP di un indirizzo inesistente casuale (PUB-005). */
  notFoundStatus?: number;
  scripts: ScriptInfo[];
  inlineScripts: string[];
  dns?: DnsInfo;
  cms?: CmsDetection;
  technologies: string[];
  siteType: SiteType;
  siteTypeSource: "user" | "auto";
  siteTypeConfidence: "high" | "low";
  legalPages: LegalPage[];
  /** Osservazioni del browser (Milestone 3). Assente se il browser non è disponibile. */
  browser?: BrowserObservation;
  /** Limitazioni incontrate (es. "robots.txt non letto"), utili nel report. */
  notes: string[];
}

export interface ContextInput {
  url: string;
  html: string;
  status?: number;
  headers?: IncomingHttpHeaders;
  siteType?: SiteTypeInput;
  renderedHtml?: string;
}

/** Costruisce il contesto a partire dall'HTML (usato da pipeline e test). */
export function createContext(input: ContextInput, extra: Partial<ScanContext> = {}): ScanContext {
  const html = input.renderedHtml ?? input.html;
  const $ = loadHtml(html);
  const finalUrl = new URL(input.url);
  const userType = input.siteType ?? "auto";
  const scripts: ScriptInfo[] = [];
  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    try {
      const u = new URL(src, finalUrl);
      scripts.push({ url: u.href, sameOrigin: u.host === finalUrl.host });
    } catch {
      // URL non valido: ignorato.
    }
  });
  const inlineScripts = $("script:not([src])")
    .map((_, el) => $(el).text())
    .get()
    .filter((s) => s.trim().length > 0);

  return {
    inputUrl: input.url,
    finalUrl,
    status: input.status ?? 200,
    headers: input.headers ?? {},
    html,
    rawHtml: input.html,
    $,
    text: visibleText($),
    links: extractLinks($, finalUrl.href),
    redirects: [],
    scripts,
    inlineScripts,
    technologies: [],
    siteType: userType === "shop" ? "shop" : "showcase",
    siteTypeSource: userType === "auto" ? "auto" : "user",
    siteTypeConfidence: userType === "auto" ? "low" : "high",
    legalPages: [],
    notes: [],
    ...extra,
  };
}

/** Testo di una pagina legale del tipo indicato, se letta. */
export function legalText(ctx: ScanContext, ...kinds: LegalKind[]): string | undefined {
  const pages = ctx.legalPages.filter((p) => kinds.includes(p.kind));
  if (pages.length === 0) return undefined;
  return pages.map((p) => p.text).join("\n");
}
