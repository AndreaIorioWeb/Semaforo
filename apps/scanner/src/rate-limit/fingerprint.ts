import { createHmac } from "node:crypto";

/**
 * Fingerprint del visitatore = HMAC-SHA256(IP + user agent, salt).
 * L'IP non viene mai salvato in chiaro.
 */
export function visitorFingerprint(ip: string, userAgent: string, salt: string): string {
  return createHmac("sha256", salt).update(`visitor\n${ip}\n${userAgent}`).digest("hex");
}

/**
 * Chiave del sito per riconoscere una rianalisi nella giornata.
 * È un hash: il database non contiene gli URL analizzati.
 */
export function siteKey(hostname: string, salt: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return createHmac("sha256", salt).update(`site\n${host}`).digest("hex");
}
