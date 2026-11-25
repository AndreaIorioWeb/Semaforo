import { AZIENDA_CHECKS } from "./azienda.js";
import { COOKIE_CHECKS } from "./cookie.js";
import { PRIVACY_CHECKS } from "./privacy.js";
import { PUBBLICO_CHECKS } from "./pubblico.js";
import { SICUREZZA_CHECKS } from "./sicurezza.js";
import type { Check } from "./types.js";
import { VENDITA_CHECKS } from "./vendita.js";

/** Check senza browser (Milestone 2). */
export const STATIC_CHECKS: readonly Check[] = [...AZIENDA_CHECKS, ...PRIVACY_CHECKS, ...PUBBLICO_CHECKS, ...SICUREZZA_CHECKS];

/** Tutti i check: i COOKIE senza browser diventano "non verificabile" o non producono esiti. */
export const ALL_CHECKS: readonly Check[] = [...COOKIE_CHECKS, ...STATIC_CHECKS, ...VENDITA_CHECKS];

export type { Check };
