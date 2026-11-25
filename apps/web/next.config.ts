import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
/**
 * Indirizzo interno dello scanner. ATTENZIONE: le rewrites sono calcolate alla BUILD.
 * In produzione /api è instradato da nginx direttamente allo scanner; questa regola serve in sviluppo e nei test.
 */
const scanner = process.env.SCANNER_INTERNAL_URL ?? "http://127.0.0.1:3001";

/** Header di sicurezza per tutte le risposte. La CSP con nonce è in src/proxy.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  turbopack: { root: fileURLToPath(new URL("../../", import.meta.url)) },
  poweredByHeader: false,
  reactStrictMode: true,
  // La compressione la fa nginx; qui la disattiviamo anche per non bufferizzare l'SSE.
  compress: false,
  transpilePackages: ["@semaforo/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${scanner}/api/:path*` }];
  },
};

export default config;
