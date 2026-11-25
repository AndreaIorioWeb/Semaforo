import type { CmsDetection, ScanContext } from "../scan/context.js";
import { headerValue } from "../scan/html.js";

interface Signal {
  name: string;
  test: (ctx: ScanContext, generator: string) => string | undefined;
}

const has = (haystack: string, needle: RegExp, label: string) => (needle.test(haystack) ? label : undefined);

/** Indizi pubblici per riconoscere CMS e piattaforme (SPEC sezione 6, punto 5). */
const CMS_SIGNALS: Signal[] = [
  { name: "WordPress", test: (_c, g) => has(g, /wordpress/i, "meta generator WordPress") },
  { name: "WordPress", test: (c) => has(c.html, /\/wp-(content|includes)\//i, "percorsi wp-content / wp-includes") },
  { name: "WordPress", test: (c) => has(headerValue(c.headers, "link") ?? "", /wp-json|api\.w\.org/i, "header Link verso wp-json") },
  { name: "Shopify", test: (c) => has(c.html, /cdn\.shopify\.com|Shopify\.theme/i, "risorse cdn.shopify.com") },
  { name: "Shopify", test: (c) => (headerValue(c.headers, "x-shopid") ? "header x-shopid" : undefined) },
  { name: "Wix", test: (_c, g) => has(g, /wix\.com/i, "meta generator Wix") },
  { name: "Wix", test: (c) => has(c.html, /static\.wixstatic\.com|static\.parastorage\.com/i, "risorse wixstatic") },
  { name: "Squarespace", test: (c) => has(c.html, /static1\.squarespace\.com|squarespace-cdn\.com/i, "risorse Squarespace") },
  { name: "Webflow", test: (c) => has(c.html, /data-wf-page|data-wf-site|assets\.website-files\.com/i, "attributi data-wf") },
  { name: "Joomla", test: (_c, g) => has(g, /joomla/i, "meta generator Joomla") },
  { name: "Joomla", test: (c) => has(c.html, /\/media\/jui\/|\/components\/com_/i, "percorsi Joomla") },
  { name: "PrestaShop", test: (_c, g) => has(g, /prestashop/i, "meta generator PrestaShop") },
  { name: "PrestaShop", test: (c) => has(c.html, /var prestashop\s*=|\/modules\/ps_/i, "variabili PrestaShop") },
  { name: "Next.js", test: (c) => has(c.html, /\/_next\/static\/|id="__NEXT_DATA__"/i, "risorse /_next/") },
  { name: "Next.js", test: (c) => has(headerValue(c.headers, "x-powered-by") ?? "", /next\.js/i, "header x-powered-by Next.js") },
];

const TECH_SIGNALS: Signal[] = [
  { name: "WooCommerce", test: (c, g) => has(`${g} ${c.html}`, /woocommerce/i, "WooCommerce") },
  { name: "Elementor", test: (c) => has(c.html, /\/plugins\/elementor\//i, "Elementor") },
  { name: "jQuery", test: (c) => has(c.html, /jquery(\.min)?\.js|jquery-\d/i, "jQuery") },
  { name: "React", test: (c) => has(c.html, /data-reactroot|react(-dom)?(\.production)?(\.min)?\.js/i, "React") },
  { name: "Vue", test: (c) => has(c.html, /data-v-[0-9a-f]{8}|vue(\.min)?\.js/i, "Vue") },
  { name: "Supabase", test: (c) => has(allCode(c), /[a-z0-9]{20}\.supabase\.co|@supabase\/supabase-js/i, "Supabase") },
  { name: "Firebase", test: (c) => has(allCode(c), /firebaseio\.com|firebaseapp\.com|firebase-app/i, "Firebase") },
  { name: "Cloudflare", test: (c) => (headerValue(c.headers, "cf-ray") ? "Cloudflare" : undefined) },
];

function allCode(ctx: ScanContext): string {
  return [ctx.html, ...ctx.inlineScripts, ...ctx.scripts.map((s) => `${s.url}\n${s.content ?? ""}`)].join("\n");
}

function generatorOf(ctx: ScanContext): string {
  return ctx.$('meta[name="generator" i]')
    .map((_, el) => ctx.$(el).attr("content") ?? "")
    .get()
    .join(" | ");
}

export function detectCms(ctx: ScanContext): CmsDetection | undefined {
  const generator = generatorOf(ctx);
  const evidence = new Map<string, string[]>();
  for (const signal of CMS_SIGNALS) {
    const ev = signal.test(ctx, generator);
    if (ev) evidence.set(signal.name, [...(evidence.get(signal.name) ?? []), ev]);
  }
  if (evidence.size === 0) return undefined;
  // Vince il CMS con più indizi (a parità, l'ordine della lista).
  const [name, ev] = [...evidence.entries()].sort((a, b) => b[1].length - a[1].length)[0] as [string, string[]];
  const version = name === "WordPress" ? /WordPress\s+([\d.]+)/i.exec(generator)?.[1] : undefined;
  return { name, ...(version ? { version } : {}), evidence: ev };
}

export function detectTechnologies(ctx: ScanContext): string[] {
  const generator = generatorOf(ctx);
  const found = new Set<string>();
  for (const signal of TECH_SIGNALS) if (signal.test(ctx, generator)) found.add(signal.name);
  return [...found];
}
