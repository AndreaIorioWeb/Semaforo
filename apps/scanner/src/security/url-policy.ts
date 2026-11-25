import { ScanError } from "../errors.js";
import { isIpLiteral, isPublicIp } from "./ip-policy.js";

export interface UrlPolicyOptions {
  /** Porte consentite. Default 80 e 443 (SPEC sezione 5). */
  allowedPorts?: readonly number[];
}

export const DEFAULT_ALLOWED_PORTS: readonly number[] = [80, 443];
const MAX_URL_LENGTH = 2048;

/** Suffissi che non devono mai uscire su Internet. */
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp", ".private"];
const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata", "metadata.google.internal"]);

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const OTHER_SCHEME = /^(file|gopher|ftp|data|javascript|mailto|dict|ldap|tftp|ws|wss|blob|jar|netdoc|sftp|smb):/i;

/**
 * Normalizza e valida un URL inserito dall'utente, senza risolvere il DNS.
 * - aggiunge https:// se manca lo schema
 * - solo http/https, solo porte consentite, niente credenziali
 * - IP letterali ammessi solo se pubblici; hostname interni rifiutati
 */
export function parseTargetUrl(input: string | URL, options: UrlPolicyOptions = {}): URL {
  const allowedPorts = options.allowedPorts ?? DEFAULT_ALLOWED_PORTS;
  let raw = typeof input === "string" ? input.trim() : input.href;

  if (raw.length === 0 || raw.length > MAX_URL_LENGTH) throw new ScanError("INVALID_URL");
  if (/[\s\u0000-\u001f\u007f\\]/.test(raw)) throw new ScanError("INVALID_URL");
  if (!HAS_SCHEME.test(raw)) {
    // Schemi senza "//" (es. file:/etc/passwd, javascript:..., data:...) non vanno trattati come domini.
    if (OTHER_SCHEME.test(raw)) throw new ScanError("URL_SCHEME");
    raw = `https://${raw}`;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScanError("INVALID_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ScanError("URL_SCHEME");
  if (url.username !== "" || url.password !== "") throw new ScanError("URL_CREDENTIALS");

  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  if (!allowedPorts.includes(port)) throw new ScanError("URL_PORT");

  let host = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.length === 0) throw new ScanError("INVALID_URL");

  if (isIpLiteral(host)) {
    if (!isPublicIp(host)) throw new ScanError("URL_BLOCKED");
  } else {
    if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
      throw new ScanError("URL_BLOCKED");
    }
    // Un sito pubblico ha almeno un punto (es. miosito.it): blocca "intranet", "router", ecc.
    if (!host.includes(".")) throw new ScanError("URL_BLOCKED");
    if (!/^[a-z0-9.-]+$/.test(host) || host.split(".").some((l) => l.length === 0 || l.length > 63)) {
      throw new ScanError("INVALID_URL");
    }
    url.hostname = host;
  }

  url.hash = "";
  return url;
}

/** Porta effettiva dell'URL. */
export function effectivePort(url: URL): number {
  if (url.port !== "") return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

/** Hostname senza parentesi quadre (per IPv6). */
export function bareHostname(url: URL): string {
  const h = url.hostname;
  return h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
}
