import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { ResolvedAddress, Resolver } from "../src/security/resolver.js";

/** IP pubblici "finti" usati come risposta DNS nei test (nessuna connessione reale verso di essi). */
export const PUBLIC_IP = "93.184.216.34";
export const PUBLIC_IP_2 = "93.184.216.35";

/** Resolver finto: mappa hostname → IP. Un valore funzione permette risposte diverse a ogni chiamata. */
export function fakeResolver(
  table: Record<string, string[] | (() => string[])>,
): Resolver & { calls: string[] } {
  const calls: string[] = [];
  const resolver = (async (hostname: string): Promise<ResolvedAddress[]> => {
    calls.push(hostname);
    const entry = table[hostname];
    if (entry === undefined) {
      const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as Error & { code: string };
      err.code = "ENOTFOUND";
      throw err;
    }
    const ips = typeof entry === "function" ? entry() : entry;
    return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  }) as Resolver & { calls: string[] };
  resolver.calls = calls;
  return resolver;
}

export interface TestServer {
  port: number;
  requests: Array<{ path: string; host: string | undefined; userAgent: string | undefined }>;
  close: () => Promise<void>;
}

/** Server HTTP locale: simula un sito "pubblico" raggiungibile solo tramite l'opzione dial dei test. */
export async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<TestServer> {
  const requests: TestServer["requests"] = [];
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url ?? "", host: req.headers.host, userAgent: req.headers["user-agent"] });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Devia verso il server locale solo gli IP pubblici previsti; qualsiasi altro IP fa fallire il test. */
export function dialTo(server: TestServer, allowed: string[] = [PUBLIC_IP, PUBLIC_IP_2]) {
  const dialed: string[] = [];
  const dial = (address: ResolvedAddress) => {
    dialed.push(address.address);
    if (!allowed.includes(address.address)) {
      throw new Error(`connessione inattesa verso ${address.address}`);
    }
    return { host: "127.0.0.1", port: server.port };
  };
  return { dial, dialed };
}
