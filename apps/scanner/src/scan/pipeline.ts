import { randomBytes } from "node:crypto";
import { computeRisk, SCAN_STEPS, type Finding, type Report, reportSchema, type SiteTypeInput, UNVERIFIABLE_ITEMS } from "@semaforo/shared";
import type { BrowserObservation } from "../browser/types.js";
import { ALL_CHECKS, type Check } from "../checks/index.js";
import { detectCms, detectTechnologies } from "../detect/cms.js";
import { detectSiteType } from "../detect/site-type.js";
import { isScanError, ScanError } from "../errors.js";
import { readLegalPages } from "../legal/reader.js";
import { withFixPrompts } from "../prompts/generator.js";
import { safeFetch, type SafeFetchOptions, type SafeResponse } from "../security/safe-fetch.js";
import { parseTargetUrl } from "../security/url-policy.js";
import { Budget, MAX_SCRIPT_BYTES, MAX_SCRIPTS_FETCHED, MAX_SUBRESOURCES } from "./budget.js";
import { createContext, type LegalPage, type ScanContext } from "./context.js";
import { lookupEmailDns, type TxtResolver } from "./dns.js";

export interface ScanStep {
  step: string;
  label: string;
}

export { SCAN_STEPS };

export const TOTAL_STEPS = Object.keys(SCAN_STEPS).length;

/** Browser della Milestone 3: osserva la home come un nuovo visitatore. */
export type BrowserRunner = (url: string, options: { fetch: SafeFetchOptions; signal: AbortSignal }) => Promise<BrowserObservation>;

/** Lettore delle pagine legali (Milestone 3). */
export type LegalReader = (
  ctx: ScanContext,
  options: { fetch: SafeFetchOptions; signal: AbortSignal; budget: Budget },
) => Promise<LegalPage[]>;

export interface PipelineDeps {
  fetch: SafeFetchOptions;
  txtResolver?: TxtResolver;
  browser?: BrowserRunner;
  /** Default: lettura HTTP con rispetto di robots.txt. */
  legalReader?: LegalReader;
  /** Default: tutti i check. */
  checks?: readonly Check[];
  onProgress?: (step: ScanStep, index: number) => void;
}

export interface ScanInput {
  url: string;
  siteType: SiteTypeInput;
  jobId: string;
  expiresAt: number;
}

export interface ScanResult {
  report: Report;
  ctx: ScanContext;
  timings: Record<string, number>;
}

function tlsErrorCode(err: unknown): string | undefined {
  if (!isScanError(err)) return undefined;
  const cause = err.cause as { code?: string } | undefined;
  const code = cause?.code ?? "";
  return /CERT|SSL|TLS|SELF_SIGNED|ALTNAME|UNABLE_TO_VERIFY|HOSTNAME/i.test(code) ? code : undefined;
}

async function tryFetch(url: string, options: SafeFetchOptions): Promise<SafeResponse | undefined> {
  try {
    return await safeFetch(url, options);
  } catch {
    return undefined;
  }
}

/** Esegue la scansione completa: fetch, browser (se disponibile), risorse pubbliche, DNS, check, rischio, prompt. */
export async function runScan(input: ScanInput, deps: PipelineDeps, signal: AbortSignal): Promise<ScanResult> {
  const timings: Record<string, number> = {};
  const started = Date.now();
  let stepIndex = 0;
  const progress = (step: ScanStep) => deps.onProgress?.(step, ++stepIndex);
  const mark = (name: string, since: number) => {
    timings[name] = Date.now() - since;
  };
  const fetchOpts: SafeFetchOptions = { ...deps.fetch, signal };
  const budget = new Budget(MAX_SUBRESOURCES);

  // 1. Fetch iniziale (header, redirect, TLS, HTML grezzo).
  progress(SCAN_STEPS.fetch);
  let t = Date.now();
  const target = parseTargetUrl(input.url, fetchOpts);
  let home: SafeResponse;
  let tlsError: string | undefined;
  try {
    home = await safeFetch(target, fetchOpts);
  } catch (err) {
    // HTTPS non disponibile (certificato non valido o porta 443 chiusa): si riprova in http,
    // così il report può segnalarlo (SEC-001) invece di fallire.
    const retriable = isScanError(err) && err.code === "FETCH_FAILED";
    if (!retriable || target.protocol !== "https:" || signal.aborted) throw err;
    tlsError = tlsErrorCode(err);
    const httpUrl = new URL(target.href);
    httpUrl.protocol = "http:";
    home = await safeFetch(httpUrl, fetchOpts);
  }
  if (home.status >= 400) throw new ScanError("FETCH_FAILED");
  const finalUrl = new URL(home.url);
  mark("fetch", t);

  // 2. Browser: home in contesto pulito, senza toccare il banner.
  let browser: BrowserObservation | undefined;
  const notes: string[] = [];
  progress(SCAN_STEPS.browser);
  if (deps.browser) {
    t = Date.now();
    try {
      browser = await deps.browser(finalUrl.href, { fetch: fetchOpts, signal });
    } catch (err) {
      if (signal.aborted) throw new ScanError("TIMEOUT");
      notes.push("Il sito non si è aperto correttamente nel browser: i controlli su cookie e tracciamento non sono disponibili.");
      void err;
    }
    mark("browser", t);
  } else {
    notes.push("Il browser non è attivo: i controlli su cookie e tracciamento non sono stati eseguiti.");
  }

  const ctx = createContext(
    {
      url: finalUrl.href,
      html: home.body.toString("utf8"),
      status: home.status,
      headers: home.headers,
      siteType: input.siteType,
      ...(browser ? { renderedHtml: browser.html } : {}),
    },
    {
      inputUrl: input.url,
      redirects: home.redirects,
      ...(home.tls ? { tls: home.tls } : {}),
      ...(tlsError ? { tlsError } : {}),
      ...(browser ? { browser } : {}),
      notes,
    },
  );

  // 3. Risorse pubbliche consentite: robots.txt, sitemap.xml, security.txt, 404, redirect da http.
  progress(SCAN_STEPS.public);
  t = Date.now();
  const origin = finalUrl.origin;
  const small: SafeFetchOptions = { ...fetchOpts, maxBytes: 512 * 1024, timeoutMs: 8_000 };
  const [robots, security, notFound, httpCheck] = await Promise.all([
    budget.take() ? tryFetch(`${origin}/robots.txt`, small) : undefined,
    budget.take() ? tryFetch(`${origin}/.well-known/security.txt`, small) : undefined,
    budget.take() ? tryFetch(`${origin}/semaforo-${randomBytes(6).toString("hex")}-pagina-inesistente`, small) : undefined,
    finalUrl.protocol === "https:" && budget.take()
      ? tryFetch(`http://${finalUrl.host}/`, { ...small, method: "HEAD" })
      : undefined,
  ]);
  if (robots) ctx.robotsTxt = robots.status === 200 && !/<html/i.test(robots.body.toString("utf8", 0, 500)) ? robots.body.toString("utf8") : null;
  else notes.push("robots.txt non leggibile.");
  if (security) ctx.securityTxtFound = security.status === 200;
  if (notFound) ctx.notFoundStatus = notFound.status;
  if (httpCheck) ctx.httpRedirectsToHttps = new URL(httpCheck.url).protocol === "https:";

  const sitemapCandidates = [
    ...(typeof ctx.robotsTxt === "string" ? [...ctx.robotsTxt.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1] ?? "") : []),
    `${origin}/sitemap.xml`,
  ].filter(Boolean);
  for (const candidate of sitemapCandidates.slice(0, 2)) {
    if (!budget.take()) break;
    const res = await tryFetch(candidate, small);
    if (res && res.status === 200 && /<(urlset|sitemapindex)\b/i.test(res.body.toString("utf8", 0, 4096))) {
      ctx.sitemapFound = true;
      break;
    }
    ctx.sitemapFound = false;
  }
  mark("public", t);

  // 4. Script dello stesso sito (per SEC-004/005), entro il budget.
  t = Date.now();
  const sameOrigin = ctx.scripts.filter((s) => s.sameOrigin).slice(0, MAX_SCRIPTS_FETCHED);
  await Promise.all(
    sameOrigin.map(async (s) => {
      if (!budget.take()) return;
      const res = await tryFetch(s.url, { ...fetchOpts, maxBytes: MAX_SCRIPT_BYTES, timeoutMs: 8_000 });
      if (res && res.status === 200) s.content = res.body.toString("utf8");
    }),
  );
  mark("scripts", t);

  // 5. Rilevamento CMS, tecnologie e tipo di sito.
  const cms = detectCms(ctx);
  if (cms) ctx.cms = cms;
  ctx.technologies = detectTechnologies(ctx);
  if (input.siteType === "auto") {
    const detected = detectSiteType(ctx);
    ctx.siteType = detected.siteType;
    ctx.siteTypeConfidence = detected.confidence;
  }

  // 6. Pagine legali.
  progress(SCAN_STEPS.legal);
  t = Date.now();
  try {
    ctx.legalPages = await (deps.legalReader ?? readLegalPages)(ctx, { fetch: fetchOpts, signal, budget });
  } catch {
    if (signal.aborted) throw new ScanError("TIMEOUT");
    notes.push("Le pagine legali non sono state lette.");
  }
  mark("legal", t);

  // 7. DNS per l'email.
  progress(SCAN_STEPS.security);
  t = Date.now();
  ctx.dns = await lookupEmailDns(finalUrl.hostname, deps.txtResolver);
  mark("dns", t);

  // 8-9. Check, rischio, prompt.
  progress(SCAN_STEPS.report);
  const checks = deps.checks ?? ALL_CHECKS;
  const findings = runChecks(checks, ctx);
  const promptCtx = { url: finalUrl.href, siteType: ctx.siteType, ...(ctx.cms ? { cms: ctx.cms.name } : {}) };
  const withPrompts = withFixPrompts(findings, promptCtx);
  timings.total = Date.now() - started;
  if (browser?.memory) {
    timings.peakMemoryMb = browser.memory.totalMb;
    timings.chromiumMemoryMb = browser.memory.chromiumMb;
  }
  timings.subrequests = budget.count + (browser?.requests.filter((r) => r.outcome === "fetched").length ?? 0);

  const report: Report = {
    jobId: input.jobId,
    siteUrl: finalUrl.href,
    scannedAt: new Date().toISOString(),
    siteType: ctx.siteType,
    ...(ctx.cms ? { cms: ctx.cms.name } : {}),
    risk: computeRisk(withPrompts),
    findings: withPrompts,
    unverifiable: [...UNVERIFIABLE_ITEMS, ...notes],
    expiresAt: new Date(input.expiresAt).toISOString(),
  };
  return { report: reportSchema.parse(report), ctx, timings };
}

/**
 * Esegue i check in isolamento: un check che fallisce non blocca gli altri.
 * I check "solo shop" si applicano solo ai negozi; se il tipo è stato dedotto con bassa confidenza
 * i "ko" diventano "warn" (rilevamento incerto → mai ko).
 */
export function runChecks(checks: readonly Check[], ctx: ScanContext): Finding[] {
  const out: Finding[] = [];
  for (const check of checks) {
    let results: Finding[];
    try {
      results = check.run(ctx);
    } catch {
      continue;
    }
    for (const f of results) {
      if (f.appliesTo === "shop" && ctx.siteType !== "shop") continue;
      if (f.appliesTo === "shop" && ctx.siteTypeSource === "auto" && ctx.siteTypeConfidence === "low" && f.status === "ko") {
        out.push({ ...f, status: "warn" });
        continue;
      }
      out.push(f);
    }
  }
  return out;
}
