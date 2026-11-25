/** Osservazioni raccolte dal browser senza interagire con il banner (Milestone 3). */

export type RequestOutcome = "fetched" | "recorded" | "blocked";

export interface ObservedRequest {
  url: string;
  host: string;
  method: string;
  resourceType: string;
  /** Dominio diverso da quello del sito (confronto sul dominio registrabile). */
  thirdParty: boolean;
  /** fetched: scaricata tramite safeFetch; recorded: annotata ma non scaricata; blocked: rifiutata (SSRF o limiti). */
  outcome: RequestOutcome;
  blockReason?: string;
  isNavigation: boolean;
}

export interface ObservedCookie {
  name: string;
  domain: string;
  path: string;
  /** -1 per i cookie di sessione. */
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  thirdParty: boolean;
}

export type BannerButtonRole = "accept" | "reject" | "customize" | "close" | "other";

export interface BannerButton {
  text: string;
  role: BannerButtonRole;
  width: number;
  height: number;
  /** true se è un link testuale (a senza sfondo), false se ha l'aspetto di un pulsante. */
  looksLikeLink: boolean;
  fontSize: number;
  backgroundColor: string;
  color: string;
}

export interface BannerObservation {
  found: boolean;
  /** high: CMP noto o contenitore chiaramente dedicato ai cookie; low: indizi deboli. */
  confidence: "high" | "low";
  vendor?: string;
  text: string;
  buttons: BannerButton[];
  hasCategoryToggles: boolean;
}

export interface BrowserObservation {
  finalUrl: string;
  html: string;
  cookies: ObservedCookie[];
  requests: ObservedRequest[];
  localStorageKeys: string[];
  banner: BannerObservation;
  /** URL degli iframe presenti nella pagina. */
  iframes: string[];
  durationMs: number;
  /** true se l'attesa di rete inattiva ha raggiunto il tetto massimo. */
  idleTimedOut: boolean;
  /** Picco di memoria durante l'apertura della pagina (Node + Chromium). */
  memory?: { nodeMb: number; chromiumMb: number; totalMb: number };
}
