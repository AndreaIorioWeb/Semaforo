import type { Browser, BrowserContext, Route } from "playwright";
import { isScanError, ScanError } from "../errors.js";
import { Budget, MAX_SUBRESOURCES } from "../scan/budget.js";
import { isThirdParty, registrableDomain } from "../scan/domain.js";
import { safeFetch, type SafeFetchOptions } from "../security/safe-fetch.js";
import { BANNER_SCRIPT } from "./banner-script.js";
import type { BannerObservation, BrowserObservation, ObservedCookie, ObservedRequest } from "./types.js";

export interface ObserveOptions {
  fetch: SafeFetchOptions;
  signal: AbortSignal;
  /** User agent dichiarato (SPEC sezione 5). */
  userAgent?: string;
  /** Timeout del caricamento della pagina. */
  navigationTimeoutMs?: number;
  /** Tetto massimo di attesa della rete inattiva. */
  idleCapMs?: number;
  /** Massimo di sottorisorse scaricate (default 50). */
  maxSubresources?: number;
}

const MAX_HTML_CHARS = 5 * 1024 * 1024;
/** Tipi di risorsa scaricati davvero; gli altri sono annotati ma non scaricati (bastano gli URL). */
const FETCHED_TYPES = new Set(["document", "script", "stylesheet", "xhr", "fetch"]);
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length",
  "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade", "alt-svc",
]);
const FORWARDED_HEADERS = ["accept", "accept-language", "cookie", "referer", "origin", "range"];

const EMPTY_BANNER: BannerObservation = { found: false, confidence: "low", text: "", buttons: [], hasCategoryToggles: false };

/**
 * Apre la home in un contesto nuovo e isolato, senza interagire con il banner, e registra
 * cookie, richieste, storage e banner. Ogni richiesta del browser passa da safeFetch:
 * stessi controlli anti SSRF, IP pinnato e limiti del fetch iniziale.
 */
export async function observePage(browser: Browser, url: string, options: ObserveOptions): Promise<BrowserObservation> {
  const started = Date.now();
  const siteHost = new URL(url).hostname;
  const budget = new Budget(options.maxSubresources ?? MAX_SUBRESOURCES);
  const requests: ObservedRequest[] = [];

  const context = await browser.newContext({
    serviceWorkers: "block",
    acceptDownloads: false,
    permissions: [],
    javaScriptEnabled: true,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    viewport: { width: 1366, height: 900 },
    ...(options.userAgent ? { userAgent: options.userAgent } : {}),
  });

  const onAbort = () => void context.close().catch(() => undefined);
  options.signal.addEventListener("abort", onAbort, { once: true });

  try {
    await context.routeWebSocket(/.*/, (ws) => {
      requests.push(record(ws.url(), "GET", "websocket", false, siteHost, "blocked", "websocket non consentiti"));
      void ws.close().catch(() => undefined);
    });
    await context.route("**/*", (route) => handleRoute(route, { ...options, budget, siteHost, requests }));

    const page = await context.newPage();
    page.on("dialog", (d) => void d.dismiss().catch(() => undefined));
    page.on("popup", (p) => void p.close().catch(() => undefined));

    await page.goto(url, { waitUntil: "load", timeout: options.navigationTimeoutMs ?? 20_000 });
    // La pagina iniziale non si è caricata (bloccata o vuota): niente osservazioni falsate.
    if (!/^https?:/i.test(page.url()) || !requests.some((r) => r.isNavigation && r.outcome === "fetched")) {
      throw new ScanError("FETCH_FAILED");
    }

    let idleTimedOut = false;
    try {
      await page.waitForLoadState("networkidle", { timeout: options.idleCapMs ?? 8_000 });
    } catch {
      idleTimedOut = true;
    }
    // Molti banner compaiono con un piccolo ritardo dopo il caricamento.
    await page.waitForTimeout(800);

    const banner = await detectBanner(context);
    const html = (await page.content()).slice(0, MAX_HTML_CHARS);
    const finalUrl = page.url();
    const localStorageKeys = await page.evaluate("Object.keys(window.localStorage || {})").catch(() => []) as string[];
    const iframes = page
      .frames()
      .map((f) => f.url())
      .filter((u) => /^https?:/i.test(u) && u !== finalUrl);
    const cookies: ObservedCookie[] = (await context.cookies()).map((c) => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      thirdParty: registrableDomain(c.domain.replace(/^\./, "")) !== registrableDomain(siteHost),
    }));

    return {
      finalUrl,
      html,
      cookies,
      requests,
      localStorageKeys,
      banner,
      iframes: [...new Set(iframes)],
      durationMs: Date.now() - started,
      idleTimedOut,
    };
  } finally {
    options.signal.removeEventListener("abort", onAbort);
    await context.close().catch(() => undefined);
  }
}

interface RouteState extends ObserveOptions {
  budget: Budget;
  siteHost: string;
  requests: ObservedRequest[];
}

function record(
  url: string,
  method: string,
  resourceType: string,
  isNavigation: boolean,
  siteHost: string,
  outcome: ObservedRequest["outcome"],
  blockReason?: string,
): ObservedRequest {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  return {
    url: url.slice(0, 2048),
    host,
    method,
    resourceType,
    thirdParty: isThirdParty(url, siteHost),
    outcome,
    ...(blockReason ? { blockReason } : {}),
    isNavigation,
  };
}

async function handleRoute(route: Route, state: RouteState): Promise<void> {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  const type = req.resourceType();
  const isNav = req.isNavigationRequest();
  const add = (outcome: ObservedRequest["outcome"], reason?: string) =>
    state.requests.push(record(url, method, type, isNav, state.siteHost, outcome, reason));
  // Navigazione bloccata: 204 lascia il browser sulla pagina corrente (abort mostrerebbe una pagina di errore).
  const block = async (reason: string) => {
    add("blocked", reason);
    if (isNav) await route.fulfill({ status: 204, body: "" });
    else await route.abort("blockedbyclient");
  };

  try {
    if (!/^https?:\/\//i.test(url)) return await block("schema non consentito");

    // Difesa in profondità: se il browser seguisse comunque un redirect, si blocca.
    if (req.redirectedFrom()) return await block("redirect non intercettato");

    // Solo osservazione passiva: niente invii di dati (beacon, form, POST di analytics).
    if (method !== "GET" && method !== "HEAD") {
      add("recorded", `${method} non inoltrata`);
      return await route.fulfill({ status: 204, body: "" });
    }

    if (!FETCHED_TYPES.has(type)) {
      add("recorded");
      return await route.abort("blockedbyclient");
    }

    if (!state.budget.take()) return await block("limite di sottorisorse raggiunto");

    const all = await req.allHeaders();
    const headers: Record<string, string> = {};
    for (const name of FORWARDED_HEADERS) {
      const v = all[name];
      if (v) headers[name] = v;
    }

    const res = await safeFetch(url, {
      ...state.fetch,
      method: method as "GET" | "HEAD",
      headers,
      // Mai restituire un 3xx al browser: Chromium seguirebbe il redirect SENZA ripassare
      // dall'intercettazione. I redirect li segue safeFetch, ricontrollando ogni salto.
      timeoutMs: 10_000,
      signal: state.signal,
      ...(state.userAgent ? { userAgent: state.userAgent } : {}),
    });

    add("fetched");
    const outHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(res.headers)) {
      if (value === undefined || HOP_BY_HOP.has(name)) continue;
      // Più cookie nello stesso header, separati da a capo (convenzione di Playwright).
      outHeaders[name] = Array.isArray(value) ? value.join(name === "set-cookie" ? "\n" : ", ") : value;
    }
    // Un 3xx senza Location valida resta un 3xx "finale": lo trasformiamo in 204 per non farlo seguire.
    const status = res.status >= 300 && res.status < 400 ? 204 : res.status;
    delete outHeaders.location;
    await route.fulfill({ status, headers: outHeaders, body: status === 204 ? "" : res.body });
  } catch (err) {
    await block(isScanError(err) ? err.code : "errore").catch(() => undefined);
  }
}

/** Cerca il banner nella pagina principale e negli iframe (alcune CMP lo mostrano in un frame). */
async function detectBanner(context: BrowserContext): Promise<BannerObservation> {
  const page = context.pages()[0];
  if (!page) return EMPTY_BANNER;
  let best: BannerObservation = EMPTY_BANNER;
  for (const frame of page.frames()) {
    const result = (await frame.evaluate(BANNER_SCRIPT).catch(() => undefined)) as BannerObservation | undefined;
    if (!result?.found) continue;
    if (!best.found || (best.confidence === "low" && result.confidence === "high")) best = result;
    if (best.confidence === "high") break;
  }
  return best;
}
