/**
 * Domini e cookie di tracciamento (COOKIE-001, COOKIE-005).
 * Aggiornare periodicamente (vedi README). "keywords" serve a cercare il servizio nella cookie policy.
 */
export type TrackerCategory = "analytics" | "ads" | "social" | "session-recording" | "tag-manager";

export interface TrackerDefinition {
  name: string;
  category: TrackerCategory;
  /** Domini (e sottodomini) contattati dal servizio. */
  domains: string[];
  /** Percorsi che indicano un invio di dati (hit), non solo il caricamento dello script. */
  hitPatterns?: RegExp[];
  /** Nomi (o prefissi) dei cookie impostati dal servizio. */
  cookies?: RegExp[];
  /** Parole da cercare nella cookie policy. */
  keywords: RegExp;
}

export const TRACKERS: readonly TrackerDefinition[] = [
  {
    name: "Google Tag Manager",
    category: "tag-manager",
    domains: ["googletagmanager.com"],
    keywords: /tag manager|google/i,
  },
  {
    name: "Google Analytics",
    category: "analytics",
    domains: ["google-analytics.com", "analytics.google.com"],
    hitPatterns: [/\/g\/collect/, /\/collect\b/, /\/j\/collect/],
    cookies: [/^_ga($|_)/, /^_gid$/, /^_gat/],
    keywords: /google analytics|analytics/i,
  },
  {
    name: "Google Ads / DoubleClick",
    category: "ads",
    domains: ["doubleclick.net", "googleadservices.com", "googlesyndication.com", "google.com/pagead", "adservice.google.com"],
    hitPatterns: [/\/pagead\//, /\/conversion\//],
    cookies: [/^_gcl_/, /^IDE$/, /^test_cookie$/],
    keywords: /google ads|adwords|doubleclick|adsense/i,
  },
  {
    name: "Meta Pixel",
    category: "social",
    domains: ["connect.facebook.net", "facebook.com/tr", "facebook.net"],
    hitPatterns: [/facebook\.com\/tr/],
    cookies: [/^_fbp$/, /^_fbc$/, /^fr$/],
    keywords: /facebook|meta pixel|\bmeta\b/i,
  },
  {
    name: "TikTok Pixel",
    category: "social",
    domains: ["analytics.tiktok.com", "tiktok.com"],
    cookies: [/^_ttp$/, /^_tt_enable_cookie$/],
    keywords: /tiktok/i,
  },
  {
    name: "LinkedIn Insight",
    category: "social",
    domains: ["snap.licdn.com", "px.ads.linkedin.com", "linkedin.com/px"],
    cookies: [/^li_/, /^lidc$/, /^bcookie$/, /^UserMatchHistory$/],
    keywords: /linkedin/i,
  },
  {
    name: "Pinterest Tag",
    category: "social",
    domains: ["s.pinimg.com", "ct.pinterest.com"],
    cookies: [/^_pin_unauth$/, /^_pinterest_/],
    keywords: /pinterest/i,
  },
  {
    name: "X (Twitter) Pixel",
    category: "social",
    domains: ["static.ads-twitter.com", "analytics.twitter.com", "t.co"],
    cookies: [/^muc_ads$/, /^personalization_id$/],
    keywords: /twitter|\bx\.com\b/i,
  },
  {
    name: "Hotjar",
    category: "session-recording",
    domains: ["hotjar.com", "hotjar.io"],
    cookies: [/^_hj/],
    keywords: /hotjar/i,
  },
  {
    name: "Microsoft Clarity",
    category: "session-recording",
    domains: ["clarity.ms"],
    cookies: [/^_clck$/, /^_clsk$/, /^CLID$/, /^MUID$/],
    keywords: /clarity|microsoft/i,
  },
  {
    name: "Microsoft Advertising (Bing UET)",
    category: "ads",
    domains: ["bat.bing.com"],
    cookies: [/^_uetsid$/, /^_uetvid$/],
    keywords: /bing|microsoft advertising/i,
  },
  {
    name: "Matomo Cloud",
    category: "analytics",
    domains: ["matomo.cloud", "innocraft.cloud"],
    cookies: [/^_pk_/],
    keywords: /matomo|piwik/i,
  },
  {
    name: "Yandex Metrica",
    category: "analytics",
    domains: ["mc.yandex.ru", "mc.yandex.com"],
    cookies: [/^_ym/],
    keywords: /yandex/i,
  },
  {
    name: "Criteo",
    category: "ads",
    domains: ["criteo.com", "criteo.net"],
    keywords: /criteo/i,
  },
  {
    name: "Taboola / Outbrain",
    category: "ads",
    domains: ["taboola.com", "outbrain.com"],
    keywords: /taboola|outbrain/i,
  },
];

/** Cookie di tracciamento noti anche se impostati in prima parte (es. _ga creato da gtag.js). */
export function trackerForCookie(name: string): TrackerDefinition | undefined {
  return TRACKERS.find((t) => t.cookies?.some((re) => re.test(name)));
}

/** Tracker a cui appartiene un URL, confrontando dominio e sottodomini. */
export function trackerForUrl(url: string): TrackerDefinition | undefined {
  let host: string;
  let hostAndPath: string;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    hostAndPath = `${host}${u.pathname}`;
  } catch {
    return undefined;
  }
  return TRACKERS.find((t) =>
    t.domains.some((d) => (d.includes("/") ? hostAndPath.startsWith(d) || hostAndPath.includes(`.${d}`) : host === d || host.endsWith(`.${d}`))),
  );
}

/** CDN che ricevono l'IP del visitatore (COOKIE-006). */
export const EXTERNAL_CDNS: ReadonlyArray<{ name: string; domains: string[]; kind: "font" | "library" }> = [
  { name: "Google Fonts", domains: ["fonts.googleapis.com", "fonts.gstatic.com"], kind: "font" },
  { name: "Adobe Fonts (Typekit)", domains: ["use.typekit.net", "p.typekit.net"], kind: "font" },
  { name: "Font Awesome CDN", domains: ["use.fontawesome.com", "kit.fontawesome.com", "ka-f.fontawesome.com"], kind: "font" },
  { name: "Bunny Fonts", domains: ["fonts.bunny.net"], kind: "font" },
  { name: "jsDelivr", domains: ["cdn.jsdelivr.net"], kind: "library" },
  { name: "cdnjs", domains: ["cdnjs.cloudflare.com"], kind: "library" },
  { name: "unpkg", domains: ["unpkg.com"], kind: "library" },
  { name: "Google Hosted Libraries", domains: ["ajax.googleapis.com"], kind: "library" },
  { name: "jQuery CDN", domains: ["code.jquery.com"], kind: "library" },
  { name: "BootstrapCDN", domains: ["stackpath.bootstrapcdn.com", "maxcdn.bootstrapcdn.com", "netdna.bootstrapcdn.com"], kind: "library" },
];

/** Incorporamenti di terze parti (COOKIE-007). */
export const EMBEDS: ReadonlyArray<{ name: string; re: RegExp; privacyFriendly?: boolean }> = [
  { name: "YouTube (modalità privacy avanzata)", re: /^https?:\/\/(www\.)?youtube-nocookie\.com\/embed\//i, privacyFriendly: true },
  { name: "YouTube", re: /^https?:\/\/(www\.|m\.)?youtube\.com\/(embed|watch)/i },
  { name: "Vimeo", re: /^https?:\/\/player\.vimeo\.com\//i },
  { name: "Google Maps", re: /^https?:\/\/(www\.)?google\.[a-z.]+\/maps|^https?:\/\/maps\.google\./i },
  { name: "Facebook", re: /^https?:\/\/(www\.)?facebook\.com\/plugins\//i },
  { name: "Instagram", re: /^https?:\/\/(www\.)?instagram\.com\/.*\/embed/i },
  { name: "X (Twitter)", re: /^https?:\/\/platform\.twitter\.com\/embed/i },
  { name: "TikTok", re: /^https?:\/\/(www\.)?tiktok\.com\/embed/i },
  { name: "Spotify", re: /^https?:\/\/open\.spotify\.com\/embed/i },
  { name: "Calendly", re: /^https?:\/\/calendly\.com\//i },
];
