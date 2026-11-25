import type { Finding, Risk, Severity } from "./types.js";

/**
 * Calcolo del rischio (documentato in /metodologia).
 * Punti per finding: peso della gravità, pieno per "ko", metà per "warn".
 * "ok", "unverifiable" e gravità "info" non contano.
 */
export const SEVERITY_WEIGHTS: Readonly<Record<Severity, number>> = {
  high: 10,
  medium: 4,
  low: 1,
  info: 0,
};

export const WARN_FACTOR = 0.5;

export const RISK_THRESHOLDS = {
  /** Da questo punteggio il rischio è Alto. Anche un solo "ko" di gravità alta porta ad Alto. */
  high: 20,
  /** Da questo punteggio il rischio è Medio. */
  medium: 6,
} as const;

export function riskScore(findings: readonly Finding[]): number {
  let score = 0;
  for (const f of findings) {
    const weight = SEVERITY_WEIGHTS[f.severity];
    if (f.status === "ko") score += weight;
    else if (f.status === "warn") score += weight * WARN_FACTOR;
  }
  return score;
}

export function computeRisk(findings: readonly Finding[]): Risk {
  if (findings.some((f) => f.status === "ko" && f.severity === "high")) return "high";
  const score = riskScore(findings);
  if (score >= RISK_THRESHOLDS.high) return "high";
  if (score >= RISK_THRESHOLDS.medium) return "medium";
  return "low";
}
