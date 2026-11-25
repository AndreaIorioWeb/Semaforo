/**
 * Elenco curato di librerie JavaScript con vulnerabilità note (SEC-005).
 * Aggiornare periodicamente (vedi README). "fixedIn" è la prima versione corretta.
 */
export interface VulnerableLibrary {
  name: string;
  /** Prima versione senza le vulnerabilità elencate. */
  fixedIn: string;
  advisory: string;
}

export const VULNERABLE_LIBRARIES: readonly VulnerableLibrary[] = [
  { name: "jquery", fixedIn: "3.5.0", advisory: "CVE-2020-11022, CVE-2020-11023 (XSS)" },
  { name: "jquery-ui", fixedIn: "1.13.2", advisory: "CVE-2022-31160, CVE-2021-41184 (XSS)" },
  { name: "bootstrap", fixedIn: "3.4.1", advisory: "CVE-2019-8331, CVE-2018-14042 (XSS)" },
  { name: "angular", fixedIn: "999.0.0", advisory: "AngularJS 1.x non è più supportato dal 2022" },
  { name: "lodash", fixedIn: "4.17.21", advisory: "CVE-2021-23337, CVE-2020-8203" },
  { name: "moment", fixedIn: "2.29.4", advisory: "CVE-2022-31129, CVE-2022-24785" },
  { name: "handlebars", fixedIn: "4.7.7", advisory: "CVE-2021-23369 (esecuzione di codice)" },
  { name: "underscore", fixedIn: "1.13.6", advisory: "CVE-2021-23358" },
];

/** Confronto semplice tra versioni "x.y.z". Restituisce <0, 0, >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Ultima versione principale di WordPress considerata aggiornata (SEC-006).
 * DA AGGIORNARE a ogni rilascio maggiore di WordPress.
 */
export const WORDPRESS_MIN_RECOMMENDED = "6.8";
