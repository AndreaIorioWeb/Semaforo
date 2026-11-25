import type { ScanContext } from "../scan/context.js";

export interface SiteTypeDetection {
  siteType: "shop" | "showcase";
  confidence: "high" | "low";
  evidence: string[];
}

/** Indizi di e-commerce (SPEC sezione 6, punto 6). Due indizi forti = alta confidenza. */
export function detectSiteType(ctx: ScanContext): SiteTypeDetection {
  const strong: string[] = [];
  const weak: string[] = [];
  const html = ctx.html;

  if (/"@type"\s*:\s*"(Product|Offer|AggregateOffer)"/i.test(html) || /itemtype="https?:\/\/schema\.org\/(Product|Offer)"/i.test(html)) {
    strong.push("dati strutturati schema.org Product/Offer");
  }
  if (ctx.technologies.includes("WooCommerce") || ctx.cms?.name === "Shopify" || ctx.cms?.name === "PrestaShop") {
    strong.push(`piattaforma e-commerce (${ctx.cms?.name === "WordPress" ? "WooCommerce" : (ctx.cms?.name ?? "WooCommerce")})`);
  }
  if (ctx.links.some((l) => /\/(cart|carrello|checkout|cassa)(\/|$|\?)/i.test(l.url ?? l.href))) strong.push("link a carrello o checkout");
  if (/add[-_]to[-_]cart|aggiungi al carrello/i.test(html)) strong.push("pulsante \"aggiungi al carrello\"");
  if (/€\s?\d+[.,]\d{2}|\d+[.,]\d{2}\s?€|EUR\s?\d+[.,]\d{2}/.test(ctx.text)) weak.push("prezzi in euro");
  if (/\b(carrello|cart|checkout|spedizione gratuita)\b/i.test(ctx.text)) weak.push("parole del negozio online");

  if (strong.length >= 2) return { siteType: "shop", confidence: "high", evidence: strong };
  if (strong.length === 1) return { siteType: "shop", confidence: weak.length > 0 ? "high" : "low", evidence: [...strong, ...weak] };
  if (weak.length >= 2) return { siteType: "shop", confidence: "low", evidence: weak };
  return { siteType: "showcase", confidence: weak.length === 0 ? "high" : "low", evidence: weak };
}
