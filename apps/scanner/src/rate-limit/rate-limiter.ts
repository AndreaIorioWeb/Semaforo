import type { Db } from "./db.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export interface RateLimiterOptions {
  /** Siti diversi al giorno per visitatore (default 2). */
  perDay: number;
  /** Scansioni totali all'ora, tutti i visitatori (anti abuso). */
  globalPerHour: number;
  /** Orologio iniettabile per i test. */
  now?: () => number;
}

export type RateDecision =
  | { allowed: true; rescan: boolean; remaining: number }
  | { allowed: false; reason: "visitor" | "global"; retryAfterSeconds: number };

/**
 * Limite giornaliero per visitatore con finestra mobile di 24 ore dalla prima analisi di ciascun sito.
 * Rianalizzare un sito già analizzato nelle ultime 24 ore non consuma quota.
 */
export class RateLimiter {
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    private readonly options: RateLimiterOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** Verifica senza registrare nulla. */
  check(fingerprint: string, site: string): RateDecision {
    const now = this.now();
    this.purge(now);

    const globalCount = this.countGlobal(now);
    if (globalCount >= this.options.globalPerHour) {
      return { allowed: false, reason: "global", retryAfterSeconds: this.globalRetryAfter(now) };
    }

    const known = this.db
      .prepare("SELECT 1 FROM rate_visits WHERE fingerprint = ? AND site_key = ? AND created_at > ?")
      .get(fingerprint, site, now - DAY_MS);
    const used = this.countVisitor(fingerprint, now);

    if (known) return { allowed: true, rescan: true, remaining: Math.max(0, this.options.perDay - used) };
    if (used >= this.options.perDay) {
      return { allowed: false, reason: "visitor", retryAfterSeconds: this.visitorRetryAfter(fingerprint, now) };
    }
    return { allowed: true, rescan: false, remaining: this.options.perDay - used - 1 };
  }

  /** Verifica e, se consentito, registra la scansione (in modo atomico). */
  consume(fingerprint: string, site: string): RateDecision {
    const tx = this.db.transaction((): RateDecision => {
      const decision = this.check(fingerprint, site);
      if (!decision.allowed) return decision;
      const now = this.now();
      if (!decision.rescan) {
        this.db
          .prepare("INSERT OR REPLACE INTO rate_visits (fingerprint, site_key, created_at) VALUES (?, ?, ?)")
          .run(fingerprint, site, now);
      }
      this.db.prepare("INSERT INTO rate_global (created_at) VALUES (?)").run(now);
      return decision;
    });
    return tx.immediate();
  }

  /** Cancella i dati scaduti (fingerprint oltre 24 ore, contatori globali oltre 1 ora). */
  purge(now: number = this.now()): void {
    this.db.prepare("DELETE FROM rate_visits WHERE created_at <= ?").run(now - DAY_MS);
    this.db.prepare("DELETE FROM rate_global WHERE created_at <= ?").run(now - HOUR_MS);
  }

  private countVisitor(fingerprint: string, now: number): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM rate_visits WHERE fingerprint = ? AND created_at > ?")
      .get(fingerprint, now - DAY_MS) as { n: number };
    return row.n;
  }

  private countGlobal(now: number): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM rate_global WHERE created_at > ?").get(now - HOUR_MS) as {
      n: number;
    };
    return row.n;
  }

  private visitorRetryAfter(fingerprint: string, now: number): number {
    const row = this.db
      .prepare("SELECT MIN(created_at) AS t FROM rate_visits WHERE fingerprint = ? AND created_at > ?")
      .get(fingerprint, now - DAY_MS) as { t: number | null };
    return row.t === null ? 0 : Math.max(1, Math.ceil((row.t + DAY_MS - now) / 1000));
  }

  private globalRetryAfter(now: number): number {
    const row = this.db.prepare("SELECT MIN(created_at) AS t FROM rate_global WHERE created_at > ?").get(now - HOUR_MS) as {
      t: number | null;
    };
    return row.t === null ? 0 : Math.max(1, Math.ceil((row.t + HOUR_MS - now) / 1000));
  }
}
