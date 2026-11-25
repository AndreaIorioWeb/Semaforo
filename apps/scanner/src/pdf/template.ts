import { readFileSync } from "node:fs";
import {
  buildCombinedPrompt,
  CATEGORY_LABELS,
  DISCLAIMER,
  type Finding,
  iconSvg,
  PALETTE,
  type Report,
  RISK_LABELS,
  riskLightIcon,
  SEVERITY_LABELS,
  sortBySeverity,
  STATUS_ICONS,
  STATUS_LABELS,
  type Status,
} from "@semaforo/shared";
import { FONTS_DIR } from "@semaforo/shared/fonts";

/** Escaping HTML: tutto ciò che arriva dal sito analizzato è testo, mai markup. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

let fontCss: string | undefined;
function fonts(): string {
  if (fontCss) return fontCss;
  const data = (file: string) => readFileSync(new URL(file, FONTS_DIR)).toString("base64");
  fontCss = `
    @font-face { font-family: "Atkinson"; font-weight: 400; src: url(data:font/woff2;base64,${data("atkinson-hyperlegible-latin-400-normal.woff2")}) format("woff2"); }
    @font-face { font-family: "Atkinson"; font-weight: 700; src: url(data:font/woff2;base64,${data("atkinson-hyperlegible-latin-700-normal.woff2")}) format("woff2"); }
    @font-face { font-family: "Atkinson"; font-style: italic; src: url(data:font/woff2;base64,${data("atkinson-hyperlegible-latin-400-italic.woff2")}) format("woff2"); }
    @font-face { font-family: "SourceSerif"; font-weight: 200 900; src: url(data:font/woff2;base64,${data("source-serif-4-latin-wght-normal.woff2")}) format("woff2"); }`;
  return fontCss;
}

const STATUS_COLORS: Record<Status, [string, string]> = {
  ko: [PALETTE.highText, PALETTE.highSoft],
  warn: [PALETTE.mediumText, PALETTE.mediumSoft],
  ok: [PALETTE.lowText, PALETTE.lowSoft],
  unverifiable: [PALETTE.neutralText, PALETTE.neutralSoft],
};

const RISK_COLORS = { high: PALETTE.highText, medium: PALETTE.mediumText, low: PALETTE.lowText } as const;

function findingHtml(f: Finding): string {
  const [color, bg] = STATUS_COLORS[f.status];
  return `<article class="finding">
    <div class="badge" style="color:${color};background:${bg}">${iconSvg(STATUS_ICONS[f.status], 14)}<span>${esc(STATUS_LABELS[f.status])}</span></div>
    <h3>${esc(f.title)} <span class="id">${esc(f.id)} · ${esc(CATEGORY_LABELS[f.category])} · ${esc(SEVERITY_LABELS[f.severity])}</span></h3>
    <p>${esc(f.explanation)}</p>
    ${f.legalRef ? `<p class="meta"><strong>Riferimento:</strong> ${esc(f.legalRef)}</p>` : ""}
    ${f.evidence?.length ? `<p class="meta"><strong>Evidenze:</strong></p><ul>${f.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
    <p class="meta"><strong>Come risolvere:</strong> ${esc(f.howToFix)}</p>
  </article>`;
}

/** HTML autonomo del report: nessuno script, nessuna risorsa esterna (font incorporati). */
export function reportHtml(report: Report): string {
  const groups: Array<[Status, string]> = [
    ["ko", "Da sistemare"],
    ["warn", "Da verificare"],
    ["ok", "In regola"],
    ["unverifiable", "Non verificabile"],
  ];
  const ordered = sortBySeverity(report.findings);
  const count = (s: Status) => report.findings.filter((f) => f.status === s).length;
  const risk = RISK_LABELS[report.risk];
  const site = report.siteUrl ? new URL(report.siteUrl).host : "sito analizzato";
  const combined = buildCombinedPrompt(report.findings, {
    url: report.siteUrl ?? "",
    siteType: report.siteType,
    ...(report.cms ? { cms: report.cms } : {}),
  });
  const date = new Date(report.scannedAt).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Rome" });

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Report Semaforo: ${esc(site)}</title>
<style>${fonts()}
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: "Atkinson", sans-serif; color: ${PALETTE.ink}; font-size: 10.5pt; line-height: 1.5; margin: 0; }
  h1, h2, h3 { font-family: "SourceSerif", serif; font-weight: 600; line-height: 1.2; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  h2 { font-size: 15pt; margin: 18pt 0 8pt; border-bottom: 1px solid ${PALETTE.line}; padding-bottom: 4pt; }
  h3 { font-size: 11.5pt; margin: 6pt 0 4pt; }
  .brand { display: flex; align-items: center; gap: 6pt; color: ${PALETTE.accent}; font-weight: 700; letter-spacing: .02em; }
  .muted, .id { color: ${PALETTE.inkMuted}; }
  .id { font-family: "Atkinson"; font-size: 8.5pt; font-weight: 400; }
  .summary { display: flex; gap: 14pt; align-items: center; border: 1px solid ${PALETTE.line}; border-radius: 6pt; padding: 10pt 12pt; margin: 12pt 0; background: ${PALETTE.surface}; }
  .risk { display: flex; align-items: center; gap: 8pt; font-size: 14pt; font-weight: 700; }
  .counts { margin-left: auto; text-align: right; font-size: 9.5pt; }
  .finding { border: 1px solid ${PALETTE.line}; border-radius: 6pt; padding: 8pt 10pt; margin: 0 0 8pt; break-inside: avoid; }
  .badge { display: inline-flex; align-items: center; gap: 4pt; font-size: 8.5pt; font-weight: 700; padding: 2pt 6pt; border-radius: 99pt; }
  .meta { margin: 3pt 0; }
  ul { margin: 2pt 0 4pt 14pt; padding: 0; }
  pre { white-space: pre-wrap; font-family: "Atkinson"; font-size: 8.5pt; background: ${PALETTE.paper}; border: 1px solid ${PALETTE.line}; padding: 8pt; border-radius: 6pt; }
  .disclaimer { font-size: 9pt; color: ${PALETTE.inkMuted}; border-top: 1px solid ${PALETTE.line}; margin-top: 16pt; padding-top: 8pt; }
</style></head><body>
  <div class="brand">${iconSvg(riskLightIcon("low"), 16)}Semaforo</div>
  <h1>Report di ${esc(site)}</h1>
  <p class="muted">Analisi del ${esc(date)}${report.cms ? ` · Piattaforma rilevata: ${esc(report.cms)}` : ""} · ${report.siteType === "shop" ? "Vende online" : "Sito vetrina"}</p>
  <div class="summary">
    <div class="risk" style="color:${RISK_COLORS[report.risk]}">${iconSvg(riskLightIcon(report.risk), 28)}<span>${esc(risk.label)}</span></div>
    <div>${esc(risk.description)}</div>
    <div class="counts">${count("ko")} da sistemare<br>${count("warn")} da verificare<br>${count("ok")} in regola<br>${count("unverifiable")} non verificabili</div>
  </div>
  ${groups
    .map(([status, title]) => {
      const items = ordered.filter((f) => f.status === status);
      return items.length ? `<h2>${esc(title)} (${items.length})</h2>${items.map(findingHtml).join("")}` : "";
    })
    .join("")}
  <h2>Cosa non si può verificare</h2>
  <ul>${report.unverifiable.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>
  <p class="muted">Un esito positivo non è una certificazione.</p>
  ${combined ? `<h2>Prompt per farti aiutare da un assistente AI</h2><pre>${esc(combined)}</pre>` : ""}
  <p class="disclaimer">${esc(DISCLAIMER)}</p>
</body></html>`;
}
