import type { Report } from "@semaforo/shared";
import type { BrowserManager } from "../browser/launcher.js";
import { reportHtml } from "./template.js";

export type PdfRenderer = (report: Report) => Promise<Buffer>;

/**
 * PDF con Chromium in un contesto isolato: JavaScript disattivato e ogni richiesta di rete bloccata
 * (il modello incorpora font e icone, non serve altro).
 */
export function createPdfRenderer(manager: BrowserManager, timeoutMs = 20_000): PdfRenderer {
  return async (report) => {
    const browser = await manager.get();
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block", acceptDownloads: false });
    try {
      await context.route("**/*", (route) => route.abort("blockedbyclient"));
      const page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      await page.setContent(reportHtml(report), { waitUntil: "load" });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:8px;width:100%;padding:0 16mm;color:#5A5247;display:flex;justify-content:space-between"><span>Semaforo · risultati indicativi, non consulenza legale</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
        margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
      });
    } finally {
      await context.close().catch(() => undefined);
    }
  };
}
