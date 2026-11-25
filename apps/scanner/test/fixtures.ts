import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Finding } from "@semaforo/shared";
import type { Check } from "../src/checks/types.js";
import { createContext, type ContextInput, type ScanContext } from "../src/scan/context.js";

const DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** Chiave finta costruita a runtime, per non avere segreti "veri" nel repository. */
export const FAKE_STRIPE_KEY = ["sk", "live", "51Hc8TestOnlyNotARealKey0000abcd"].join("_");

export function fixture(path: string): string {
  return readFileSync(`${DIR}${path}`, "utf8").replaceAll("{{STRIPE_KEY}}", FAKE_STRIPE_KEY);
}

export function ctxFrom(html: string, extra: Partial<ScanContext> = {}, input: Partial<ContextInput> = {}): ScanContext {
  return createContext({ url: "https://esempio-sito.it/", html, ...input }, extra);
}

/** Pagina minima: body e head opzionali. */
export function page(body: string, head = ""): string {
  return `<!doctype html><html lang="it"><head>${head}</head><body>${body}</body></html>`;
}

export function runOne(check: Check, ctx: ScanContext): Finding | undefined {
  const results = check.run(ctx);
  return results[0];
}
