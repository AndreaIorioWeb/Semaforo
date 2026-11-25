import { z } from "zod";

export const statusSchema = z.enum(["ko", "warn", "ok", "unverifiable"]);
export const severitySchema = z.enum(["high", "medium", "low", "info"]);
export const categorySchema = z.enum(["privacy", "cookie", "azienda", "vendita", "pubblico", "sicurezza"]);
export const siteTypeInputSchema = z.enum(["shop", "showcase", "auto"]);
export const siteTypeSchema = z.enum(["shop", "showcase"]);
export const riskSchema = z.enum(["low", "medium", "high"]);

/** Corpo di POST /api/scan. La validazione profonda dell'URL (SSRF) avviene nello scanner. */
export const scanRequestSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  siteType: siteTypeInputSchema.default("auto"),
});

export const findingSchema = z.object({
  id: z.string().regex(/^[A-Z]+-\d{3}$/),
  category: categorySchema,
  title: z.string().min(1),
  status: statusSchema,
  severity: severitySchema,
  explanation: z.string().min(1),
  legalRef: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  howToFix: z.string().min(1),
  fixPrompt: z.string().optional(),
  appliesTo: z.enum(["all", "shop"]),
});

export const reportSchema = z.object({
  jobId: z.string().min(1),
  siteUrl: z.string().url().optional(),
  scannedAt: z.string().datetime(),
  siteType: siteTypeSchema,
  cms: z.string().optional(),
  risk: riskSchema,
  findings: z.array(findingSchema),
  unverifiable: z.array(z.string()),
  expiresAt: z.string().datetime(),
});

export type ScanRequestInput = z.input<typeof scanRequestSchema>;
