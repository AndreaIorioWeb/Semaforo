import { resolveTxt } from "node:dns/promises";
import type { DnsInfo } from "./context.js";
import { registrableDomain } from "./domain.js";

export type TxtResolver = (name: string) => Promise<string[][]>;

export const systemTxtResolver: TxtResolver = (name) => resolveTxt(name);

const DNS_TIMEOUT_MS = 5_000;

async function txt(resolver: TxtResolver, name: string): Promise<string[] | "error"> {
  try {
    const records = await Promise.race([
      resolver(name),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), DNS_TIMEOUT_MS).unref()),
    ]);
    return records.map((chunks) => chunks.join(""));
  } catch (err) {
    const code = (err as { code?: string }).code;
    // Nessun record: è un'informazione, non un errore.
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    return "error";
  }
}

/** SPF e DMARC del dominio registrabile (SEC-003). */
export async function lookupEmailDns(hostname: string, resolver: TxtResolver = systemTxtResolver): Promise<DnsInfo> {
  const domain = registrableDomain(hostname);
  const [root, dmarc] = await Promise.all([txt(resolver, domain), txt(resolver, `_dmarc.${domain}`)]);
  if (root === "error" || dmarc === "error") return { domain, spf: [], dmarc: [], failed: true };
  return {
    domain,
    spf: root.filter((r) => /^v=spf1/i.test(r)),
    dmarc: dmarc.filter((r) => /^v=DMARC1/i.test(r)),
    failed: false,
  };
}
