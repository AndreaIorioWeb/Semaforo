import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

export type { CheerioAPI };

export function loadHtml(html: string): CheerioAPI {
  return cheerio.load(html);
}

/** Testo visibile della pagina (senza script, stili, template), con spazi normalizzati. */
export function visibleText($: CheerioAPI, scope = "body"): string {
  const root = $(scope).first().clone();
  root.find("script, style, noscript, template, svg, iframe").remove();
  // Spazi tra blocchi per non incollare parole di elementi diversi.
  root.find("br, p, div, li, td, th, h1, h2, h3, h4, h5, h6, section, footer, header, span, a").each((_, el) => {
    $(el).append(" ");
  });
  const text = root.length > 0 ? root.text() : $.root().text();
  return normalizeSpaces(text);
}

export function normalizeSpaces(s: string): string {
  return s.replace(/[\s\u00a0]+/g, " ").trim();
}

export interface PageLink {
  href: string;
  text: string;
  /** URL assoluto, se risolvibile. */
  url?: string;
  inFooter: boolean;
  inNav: boolean;
}

/** Tutti i link della pagina con testo e posizione (footer/menu). */
export function extractLinks($: CheerioAPI, baseUrl: string): PageLink[] {
  const links: PageLink[] = [];
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const href = ($el.attr("href") ?? "").trim();
    if (href === "" || href.startsWith("#") || /^(javascript|mailto|tel):/i.test(href)) return;
    let url: string | undefined;
    try {
      url = new URL(href, baseUrl).href;
    } catch {
      url = undefined;
    }
    const text = normalizeSpaces(`${$el.text()} ${$el.attr("title") ?? ""} ${$el.attr("aria-label") ?? ""}`);
    links.push({
      href,
      text,
      ...(url ? { url } : {}),
      inFooter: $el.closest("footer, [role=contentinfo], #footer, .footer, .site-footer").length > 0,
      inNav: $el.closest("nav, [role=navigation], header, .menu").length > 0,
    });
  });
  return links;
}

/** Valori di un header come stringa unica (minuscolo il nome). */
export function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = headers[name.toLowerCase()];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.join(", ") : v;
}
