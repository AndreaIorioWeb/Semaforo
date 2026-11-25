import { z } from "zod";

/** Versione del testo dell'informativa accettata con il modulo contatti (aggiornare se cambia /privacy). */
export const PRIVACY_VERSION = "2026-11-25";

/** Durata massima di conservazione dei lead nel database: il tempo per inoltrarli all'autore. */
export const DEFAULT_LEAD_RETENTION_HOURS = 24;

const noNewlines = (s: string) => !/[\r\n]/.test(s);

export const leadSchema = z.object({
  name: z.string().trim().min(1).max(100).refine(noNewlines),
  email: z.string().trim().max(254).email(),
  site: z.string().trim().max(300).optional().default(""),
  message: z.string().trim().max(3000).optional().default(""),
  /** Consenso esplicito: deve essere true (casella non preselezionata). */
  consent: z.literal(true),
  /** Campo trappola per i bot: deve restare vuoto. */
  company: z.string().max(0).optional().default(""),
});

export type LeadInput = z.input<typeof leadSchema>;
export type Lead = z.output<typeof leadSchema>;
