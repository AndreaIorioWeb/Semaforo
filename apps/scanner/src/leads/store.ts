import type { Lead } from "@semaforo/shared";
import type { Db } from "../rate-limit/db.js";

export interface StoredLead extends Lead {
  id: number;
  consentAt: number;
  consentVersion: string;
  createdAt: number;
}

/**
 * Lead conservati solo per il tempo necessario a inoltrarli all'autore (default 24 ore),
 * poi cancellati, inviati o no. Nessun report, nessun IP.
 */
export class LeadStore {
  constructor(
    private readonly db: Db,
    private readonly retentionMs: number,
    private readonly now: () => number = Date.now,
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        email           TEXT NOT NULL,
        site            TEXT NOT NULL,
        message         TEXT NOT NULL,
        consent_at      INTEGER NOT NULL,
        consent_version TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        emailed_at      INTEGER
      );
      CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
      CREATE TABLE IF NOT EXISTS lead_rate (
        fingerprint TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lead_rate_fp ON lead_rate(fingerprint, created_at);
    `);
  }

  save(lead: Lead, consentVersion: string): StoredLead {
    const now = this.now();
    const info = this.db
      .prepare(
        "INSERT INTO leads (name, email, site, message, consent_at, consent_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(lead.name, lead.email, lead.site, lead.message, now, consentVersion, now);
    return { ...lead, id: Number(info.lastInsertRowid), consentAt: now, consentVersion, createdAt: now };
  }

  markEmailed(id: number): void {
    this.db.prepare("UPDATE leads SET emailed_at = ? WHERE id = ?").run(this.now(), id);
  }

  /** Lead non ancora inoltrati (e non scaduti). */
  pending(): StoredLead[] {
    const rows = this.db
      .prepare("SELECT * FROM leads WHERE emailed_at IS NULL AND created_at > ? ORDER BY id")
      .all(this.now() - this.retentionMs) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      email: String(r.email),
      site: String(r.site),
      message: String(r.message),
      consent: true,
      company: "",
      consentAt: Number(r.consent_at),
      consentVersion: String(r.consent_version),
      createdAt: Number(r.created_at),
    }));
  }

  /** Cancella i lead oltre la conservazione e i contatori anti abuso oltre 24 ore. */
  purge(): number {
    const now = this.now();
    const removed = this.db.prepare("DELETE FROM leads WHERE created_at <= ?").run(now - this.retentionMs).changes;
    this.db.prepare("DELETE FROM lead_rate WHERE created_at <= ?").run(now - 24 * 3_600_000);
    return removed;
  }

  /** Massimo `max` invii per fingerprint nelle 24 ore. Registra l'invio se consentito. */
  allow(fingerprint: string, max: number): boolean {
    const now = this.now();
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM lead_rate WHERE fingerprint = ? AND created_at > ?")
      .get(fingerprint, now - 24 * 3_600_000) as { n: number };
    if (row.n >= max) return false;
    this.db.prepare("INSERT INTO lead_rate (fingerprint, created_at) VALUES (?, ?)").run(fingerprint, now);
    return true;
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM leads").get() as { n: number }).n;
  }
}
