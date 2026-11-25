/**
 * Dati del titolare del tool (footer, privacy). Si impostano con variabili d'ambiente
 * a runtime: finché mancano compaiono come [PLACEHOLDER] ben visibili.
 */
export interface Owner {
  name: string;
  vat: string;
  address: string;
  email: string;
  pec?: string;
}

export function getOwner(): Owner {
  const env = process.env;
  return {
    name: env.OWNER_NAME || "[PLACEHOLDER: nome e cognome o ragione sociale]",
    vat: env.OWNER_VAT || "[PLACEHOLDER: partita IVA]",
    address: env.OWNER_ADDRESS || "[PLACEHOLDER: indirizzo]",
    email: env.OWNER_EMAIL || "[PLACEHOLDER: email]",
    ...(env.OWNER_PEC ? { pec: env.OWNER_PEC } : {}),
  };
}

export function isPlaceholder(value: string): boolean {
  return value.startsWith("[PLACEHOLDER");
}

/** URL pubblico del sito (robots.txt, sitemap, metadati). */
export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function dailyLimit(): number {
  const n = Number(process.env.RATE_LIMIT_PER_DAY);
  return Number.isFinite(n) && n > 0 ? n : 2;
}
