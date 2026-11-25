import { MAX_LEGAL_PAGES } from "../scan/budget.js";
import type { LegalKind, LegalPage, ScanContext } from "../scan/context.js";
import { extractLinks, loadHtml, type PageLink, visibleText } from "../scan/html.js";
import type { LegalReader } from "../scan/pipeline.js";
import { safeFetch } from "../security/safe-fetch.js";
import { isAllowedByRobots } from "./robots.js";

/** Riconoscimento dei link legali per testo e indirizzo (SPEC sezione 6, punto 4). Ordine = priorità. */
export const LEGAL_PATTERNS: ReadonlyArray<{ kind: LegalKind; re: RegExp; exclude?: RegExp }> = [
  { kind: "cookie", re: /cookie/i },
  { kind: "privacy", re: /privacy|informativa|riservatezza|dati personali|data protection|gdpr/i, exclude: /cookie/i },
  {
    kind: "sales",
    re: /condizioni\s+(generali\s+)?(di\s+)?vendita|termini\s+(e|&)\s+condizioni|condizioni\s+generali|termini\s+di\s+vendita|\bcgv\b|terms\s+of\s+sale|terms\s*(and|&)\s*conditions|condizioni-(generali-)?(di-)?vendita|termini-e-condizioni/i,
  },
  { kind: "withdrawal", re: /recesso|\bresi\b|\breso\b|rimborsi|returns|refund|diritto-di-recesso/i },
  { kind: "legal", re: /note\s+legali|note-legali|legal\s+notice|impressum|dati\s+societari/i },
  { kind: "terms", re: /termini\s+(d'|di\s+)uso|condizioni\s+(d'|di\s+)uso|condizioni\s+di\s+utilizzo|terms\s+of\s+(use|service)/i },
  { kind: "contacts", re: /contatt|contact/i },
];

/** Host noti di generatori di policy, ammessi anche se esterni al sito. */
const POLICY_HOSTS = /(^|\.)(iubenda\.com|termly\.io|cookiebot\.com|privacypolicies\.com|termsfeed\.com|complianz\.io)$/i;

export function classifyLink(link: PageLink): LegalKind | undefined {
  const haystack = `${link.text} ${link.href}`;
  return LEGAL_PATTERNS.find((p) => p.re.test(haystack) && !(p.exclude?.test(haystack)))?.kind;
}

/** Sceglie al massimo una pagina per tipo, preferendo i link del footer, entro il limite di 6. */
export function pickLegalLinks(ctx: ScanContext, max = MAX_LEGAL_PAGES): Array<{ kind: LegalKind; url: string }> {
  const site = ctx.finalUrl.hostname.replace(/^www\./, "");
  const byKind = new Map<LegalKind, { url: string; footer: boolean }>();
  for (const link of ctx.links) {
    if (!link.url) continue;
    let u: URL;
    try {
      u = new URL(link.url);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    const host = u.hostname.replace(/^www\./, "");
    const sameSite = host === site || host.endsWith(`.${site}`);
    if (!sameSite && !POLICY_HOSTS.test(host)) continue;
    u.hash = "";
    if (u.href === ctx.finalUrl.href) continue;
    let kind = classifyLink(link);
    if (!kind) continue;
    // "Termini e condizioni" su un sito vetrina sono condizioni d'uso, non di vendita.
    if (kind === "sales" && ctx.siteType !== "shop" && !/vendita|sale/i.test(`${link.text} ${link.href}`)) kind = "terms";
    const current = byKind.get(kind);
    if (!current || (!current.footer && link.inFooter)) byKind.set(kind, { url: u.href, footer: link.inFooter });
  }
  const order = LEGAL_PATTERNS.map((p) => p.kind);
  const seen = new Set<string>();
  return order
    .filter((k) => byKind.has(k))
    .map((kind) => ({ kind, url: byKind.get(kind)?.url ?? "" }))
    .filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)))
    .slice(0, max);
}

/**
 * Legge le pagine legali via HTTP (con safeFetch), rispettando robots.txt di ciascun host.
 * Le pagine bloccate da robots.txt finiscono nelle note del report.
 */
export const readLegalPages: LegalReader = async (ctx, { fetch, signal, budget }) => {
  const picks = pickLegalLinks(ctx);
  const robotsCache = new Map<string, string | null>([[ctx.finalUrl.host, ctx.robotsTxt ?? null]]);
  const pages: LegalPage[] = [];
  const opts = { ...fetch, signal, maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000 };

  for (const { kind, url } of picks) {
    if (signal.aborted) break;
    const u = new URL(url);
    if (!robotsCache.has(u.host)) {
      let robots: string | null = null;
      if (budget.take()) {
        try {
          const res = await safeFetch(`${u.origin}/robots.txt`, { ...opts, maxBytes: 256 * 1024 });
          robots = res.status === 200 ? res.body.toString("utf8") : null;
        } catch {
          robots = null;
        }
      }
      robotsCache.set(u.host, robots);
    }
    if (!isAllowedByRobots(robotsCache.get(u.host), `${u.pathname}${u.search}`)) {
      ctx.notes.push(`Pagina "${kind}" non letta: robots.txt ne vieta la lettura ai bot.`);
      continue;
    }
    if (!budget.take()) {
      ctx.notes.push("Limite di richieste raggiunto: alcune pagine legali non sono state lette.");
      break;
    }
    try {
      const res = await safeFetch(url, opts);
      if (res.status >= 400) continue;
      const $ = loadHtml(res.body.toString("utf8"));
      const text = visibleText($);
      const links = extractLinks($, res.url)
        .map((l) => l.url ?? l.href)
        .slice(0, 500);
      pages.push({ kind, url: res.url, text: text.slice(0, 200_000), links });
    } catch {
      // Pagina non raggiungibile: il check relativo resterà non verificabile.
    }
  }
  return pages;
};
