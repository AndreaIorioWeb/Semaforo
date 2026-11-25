import { isIpLiteral } from "../security/ip-policy.js";

/** Suffissi a due livelli più comuni (lista minima, senza dipendenze esterne). */
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.za", "co.jp", "ne.jp", "or.jp",
  "com.br", "com.mx", "com.ar", "com.tr", "co.in", "com.cn", "com.hk", "com.sg",
  "co.il", "co.kr", "com.pl", "com.es", "com.pt", "com.gr", "com.ro",
]);

/** Dominio registrabile (es. www.shop.miosito.it → miosito.it). */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (TWO_LEVEL_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

export function isThirdParty(url: string, siteHost: string): boolean {
  try {
    return registrableDomain(new URL(url).hostname) !== registrableDomain(siteHost);
  } catch {
    return true;
  }
}
