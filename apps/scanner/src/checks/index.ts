import { AZIENDA_CHECKS } from "./azienda.js";
import { PRIVACY_CHECKS } from "./privacy.js";
import { PUBBLICO_CHECKS } from "./pubblico.js";
import { SICUREZZA_CHECKS } from "./sicurezza.js";
import type { Check } from "./types.js";

/** Check della Milestone 2 (senza browser). */
export const STATIC_CHECKS: readonly Check[] = [...AZIENDA_CHECKS, ...PRIVACY_CHECKS, ...PUBBLICO_CHECKS, ...SICUREZZA_CHECKS];

export type { Check };
