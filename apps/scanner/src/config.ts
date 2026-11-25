import { randomBytes } from "node:crypto";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default("0.0.0.0"),
  RATE_LIMIT_PER_DAY: z.coerce.number().int().min(1).default(2),
  GLOBAL_SCANS_PER_HOUR: z.coerce.number().int().min(1).default(30),
  SCAN_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  SCAN_MAX_QUEUE: z.coerce.number().int().min(0).default(10),
  SCAN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60_000),
  FINGERPRINT_SALT: z.string().default(""),
  DATABASE_PATH: z.string().default("./data/semaforo.sqlite"),
  TRUST_PROXY: bool,
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  BROWSER_ENABLED: z.enum(["true", "false", "1", "0"]).default("true").transform((v) => v === "true" || v === "1"),
  CHROMIUM_SANDBOX: bool,
  CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
});

export interface Config {
  env: string;
  port: number;
  host: string;
  rateLimitPerDay: number;
  globalScansPerHour: number;
  scanConcurrency: number;
  scanMaxQueue: number;
  scanTimeoutMs: number;
  fingerprintSalt: string;
  databasePath: string;
  trustProxy: boolean;
  publicBaseUrl: string;
  userAgent: string;
  browserEnabled: boolean;
  chromiumSandbox: boolean;
  chromiumExecutablePath?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  let salt = parsed.FINGERPRINT_SALT;
  if (salt.length === 0) {
    if (parsed.NODE_ENV === "production") {
      throw new Error("FINGERPRINT_SALT è obbligatorio in produzione (es. openssl rand -hex 32).");
    }
    // In sviluppo un salt casuale per processo: i limiti si azzerano a ogni riavvio.
    salt = randomBytes(32).toString("hex");
  } else if (salt.length < 16) {
    throw new Error("FINGERPRINT_SALT troppo corto: usa almeno 16 caratteri casuali.");
  }
  const base = parsed.PUBLIC_BASE_URL.replace(/\/$/, "");
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    rateLimitPerDay: parsed.RATE_LIMIT_PER_DAY,
    globalScansPerHour: parsed.GLOBAL_SCANS_PER_HOUR,
    scanConcurrency: parsed.SCAN_CONCURRENCY,
    scanMaxQueue: parsed.SCAN_MAX_QUEUE,
    scanTimeoutMs: parsed.SCAN_TIMEOUT_MS,
    fingerprintSalt: salt,
    databasePath: parsed.DATABASE_PATH,
    trustProxy: parsed.TRUST_PROXY,
    publicBaseUrl: base,
    userAgent: `SemaforoBot/1.0 (+${base}/metodologia)`,
    browserEnabled: parsed.BROWSER_ENABLED,
    chromiumSandbox: parsed.CHROMIUM_SANDBOX,
    ...(parsed.CHROMIUM_EXECUTABLE_PATH ? { chromiumExecutablePath: parsed.CHROMIUM_EXECUTABLE_PATH } : {}),
  };
}
