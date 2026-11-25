import http, { type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import https from "node:https";
import type { TLSSocket } from "node:tls";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { ScanError, isScanError } from "../errors.js";
import { assertPublicUrl, type GuardOptions } from "./guard.js";
import { isIpLiteral } from "./ip-policy.js";
import type { ResolvedAddress } from "./resolver.js";
import { bareHostname, effectivePort } from "./url-policy.js";

export const DEFAULT_USER_AGENT = "SemaforoBot/1.0";
export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface SafeFetchOptions extends GuardOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  userAgent?: string;
  /** Massimo numero di redirect seguiti (default 5). */
  maxRedirects?: number;
  /** Massima dimensione del corpo, dopo la decompressione (default 5 MB). */
  maxBytes?: number;
  /** Timeout della singola richiesta, redirect esclusi (default 15 s). */
  timeoutMs?: number;
  /** Segnale del timeout totale della scansione. */
  signal?: AbortSignal;
  /**
   * SOLO PER TEST: devia la connessione verso un server locale dopo che i controlli
   * sono passati sull'IP validato. Mai impostarlo in produzione.
   */
  dial?: (address: ResolvedAddress, port: number) => { host: string; port: number };
}

export interface TlsInfo {
  authorized: boolean;
  authorizationError?: string;
  validFrom?: string;
  validTo?: string;
  issuer?: string;
  subject?: string;
}

export interface RedirectHop {
  url: string;
  status: number;
}

export interface SafeResponse {
  /** URL finale dopo i redirect. */
  url: string;
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  redirects: RedirectHop[];
  /** IP effettivamente usato per la connessione (quello validato). */
  remoteAddress: string;
  tls?: TlsInfo;
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  location?: string;
  tls?: TlsInfo;
}

/**
 * Fetch HTTP pubblico e sicuro:
 * - valida URL, DNS e IP a ogni salto (anche sui redirect)
 * - si connette all'IP validato (pinning, difesa dal DNS rebinding)
 * - limita redirect, dimensione e tempo
 */
export async function safeFetch(input: string | URL, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const redirects: RedirectHop[] = [];
  let current: string | URL = input;

  for (;;) {
    if (options.signal?.aborted) throw new ScanError("TIMEOUT");
    const { url, addresses } = await assertPublicUrl(current, options);
    const address = addresses[0];
    if (!address) throw new ScanError("DNS_FAILED");

    const raw = await requestOnce(url, address, options);

    if (raw.location !== undefined) {
      if (redirects.length >= maxRedirects) throw new ScanError("TOO_MANY_REDIRECTS");
      redirects.push({ url: url.href, status: raw.status });
      try {
        current = new URL(raw.location, url);
      } catch {
        throw new ScanError("FETCH_FAILED");
      }
      continue;
    }

    return {
      url: url.href,
      status: raw.status,
      headers: raw.headers,
      body: raw.body,
      redirects,
      remoteAddress: address.address,
      ...(raw.tls ? { tls: raw.tls } : {}),
    };
  }
}

function requestOnce(url: URL, address: ResolvedAddress, options: SafeFetchOptions): Promise<RawResponse> {
  const isHttps = url.protocol === "https:";
  const port = effectivePort(url);
  const target = options.dial ? options.dial(address, port) : { host: address.address, port };
  const hostname = bareHostname(url);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const method = options.method ?? "GET";

  const headers: Record<string, string> = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "it-IT,it;q=0.9,en;q=0.5",
    "accept-encoding": "gzip, deflate, br",
    ...options.headers,
    host: url.host,
    "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
  };

  return new Promise<RawResponse>((resolve, reject) => {
    let settled = false;
    const finish = (err: unknown, value?: RawResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (err) reject(toScanError(err));
      else resolve(value as RawResponse);
    };

    const requestOptions: https.RequestOptions = {
      // Connessione diretta all'IP già validato: nessuna nuova risoluzione DNS.
      host: target.host,
      port: target.port,
      method,
      path: `${url.pathname}${url.search}`,
      headers,
      agent: false,
      ...(isHttps && !isIpLiteral(hostname) ? { servername: hostname } : {}),
    };

    const req = (isHttps ? https : http).request(requestOptions, (res) => {
      const status = res.statusCode ?? 0;
      const tls = isHttps ? readTls(res) : undefined;
      const location = res.headers.location;

      if (REDIRECT_STATUSES.has(status) && typeof location === "string" && location.length > 0) {
        res.resume();
        finish(null, { status, headers: res.headers, body: Buffer.alloc(0), location, ...(tls ? { tls } : {}) });
        req.destroy();
        return;
      }

      if (method === "HEAD") {
        res.resume();
        finish(null, { status, headers: res.headers, body: Buffer.alloc(0), ...(tls ? { tls } : {}) });
        return;
      }

      const declared = Number(res.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes) {
        req.destroy();
        finish(new ScanError("RESPONSE_TOO_LARGE"));
        return;
      }

      readBody(res, maxBytes).then(
        (body) => finish(null, { status, headers: res.headers, body, ...(tls ? { tls } : {}) }),
        (err: unknown) => {
          req.destroy();
          finish(err);
        },
      );
    });

    const timer = setTimeout(() => {
      req.destroy();
      finish(new ScanError("TIMEOUT"));
    }, timeoutMs);

    const onAbort = () => {
      req.destroy();
      finish(new ScanError("TIMEOUT"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    req.on("error", (err) => finish(err));
    req.end();
  });
}

function decoderFor(res: IncomingMessage): Readable {
  const encoding = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return res.pipe(zlib.createGunzip());
  if (encoding === "deflate") return res.pipe(zlib.createInflate());
  if (encoding === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

/** Legge il corpo con un tetto sui byte decompressi (protegge anche dalle "zip bomb"). */
function readBody(res: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const stream = decoderFor(res);
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        stream.destroy();
        res.destroy();
        reject(new ScanError("RESPONSE_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
    res.on("error", (err) => reject(err));
  });
}

function readTls(res: IncomingMessage): TlsInfo | undefined {
  const socket = res.socket as TLSSocket | null;
  if (!socket || typeof socket.getPeerCertificate !== "function") return undefined;
  const cert = socket.getPeerCertificate();
  const authError = socket.authorizationError;
  return {
    authorized: socket.authorized,
    ...(authError ? { authorizationError: String(authError) } : {}),
    ...(cert?.valid_from ? { validFrom: cert.valid_from } : {}),
    ...(cert?.valid_to ? { validTo: cert.valid_to } : {}),
    ...(cert?.issuer?.O ? { issuer: String(cert.issuer.O) } : {}),
    ...(cert?.subject?.CN ? { subject: String(cert.subject.CN) } : {}),
  };
}

function toScanError(err: unknown): ScanError {
  if (isScanError(err)) return err;
  return new ScanError("FETCH_FAILED", { cause: err });
}
