import type { Lead } from "@semaforo/shared";
import { PRIVACY_VERSION } from "@semaforo/shared";
import type { Mailer } from "./mailer.js";
import type { LeadStore, StoredLead } from "./store.js";

const RETRY_INTERVAL_MS = 10 * 60_000;

/** Salva, inoltra e ripulisce i lead. Se l'invio fallisce riprova finché il lead non scade. */
export class LeadService {
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly store: LeadStore,
    private readonly mailer: Mailer,
    private readonly log: (event: Record<string, unknown>) => void = () => undefined,
  ) {
    this.timer = setInterval(() => void this.tick(), RETRY_INTERVAL_MS);
    this.timer.unref();
  }

  async submit(lead: Lead): Promise<StoredLead> {
    const stored = this.store.save(lead, PRIVACY_VERSION);
    await this.deliver(stored);
    return stored;
  }

  /** Riprova gli invii falliti e cancella i lead scaduti. */
  async tick(): Promise<void> {
    const removed = this.store.purge();
    if (removed > 0) this.log({ event: "leads_purged", count: removed });
    for (const lead of this.store.pending()) await this.deliver(lead);
  }

  close(): void {
    clearInterval(this.timer);
  }

  private async deliver(lead: StoredLead): Promise<void> {
    try {
      await this.mailer.send(lead);
      this.store.markEmailed(lead.id);
      this.log({ event: "lead_emailed" });
    } catch {
      // Nessun dato del lead nei log: solo l'esito.
      this.log({ event: "lead_email_failed" });
    }
  }
}
