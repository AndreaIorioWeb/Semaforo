import type { IncomingMessage, ServerResponse } from "node:http";
import { fixture } from "./fixtures.js";
import { dialTo, fakeResolver, PUBLIC_IP, startServer, type TestServer } from "./helpers.js";

export type Route = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Server di siti fixture: un solo server locale, risposte diverse in base all'header Host.
 * I domini sono risolti da un resolver finto verso un IP "pubblico" e deviati qui con dial.
 */
export async function startSites(sites: Record<string, Record<string, Route | string>>) {
  const server: TestServer = await startServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0] ?? "";
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    const routes = sites[host];
    const route = routes?.[path];
    if (route === undefined) {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<h1>Non trovato</h1>");
      return;
    }
    if (typeof route === "string") {
      const type = path.endsWith(".js") ? "application/javascript" : path.endsWith(".txt") ? "text/plain" : path.endsWith(".xml") ? "application/xml" : "text/html; charset=utf-8";
      res.writeHead(200, { "content-type": type });
      res.end(route.startsWith("@") ? fixture(route.slice(1)) : route);
      return;
    }
    route(req, res);
  });
  const table = Object.fromEntries(Object.keys(sites).map((h) => [h, [PUBLIC_IP]]));
  const resolver = fakeResolver(table);
  const { dial } = dialTo(server);
  return { server, resolver, dial };
}

export const fakeTxt = (records: Record<string, string[]>) => async (name: string) => {
  const r = records[name];
  if (!r) {
    const err = new Error("ENODATA") as Error & { code: string };
    err.code = "ENODATA";
    throw err;
  }
  return r.map((x) => [x]);
};
