import nodemailer, { type Transporter } from "nodemailer";
import type { StoredLead } from "./store.js";

export interface MailConfig {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from?: string;
  to?: string;
}

export interface Mailer {
  send(lead: StoredLead): Promise<void>;
  readonly configured: boolean;
}

/** Testo dell'email all'autore: solo i dati del modulo, nessun report allegato. */
export function leadEmail(lead: StoredLead): { subject: string; text: string } {
  const site = lead.site ? lead.site : "(non indicato)";
  return {
    subject: `Semaforo: nuova richiesta da ${lead.name}`.slice(0, 150),
    text: [
      "Nuova richiesta dal modulo contatti di Semaforo.",
      "",
      `Nome: ${lead.name}`,
      `Email: ${lead.email}`,
      `Sito: ${site}`,
      "",
      "Messaggio:",
      lead.message || "(nessun messaggio)",
      "",
      `Informativa accettata (versione ${lead.consentVersion}) il ${new Date(lead.consentAt).toISOString()}.`,
      "Il lead viene cancellato da Semaforo entro 24 ore dalla ricezione.",
    ].join("\n"),
  };
}

export function createMailer(config: MailConfig, transport?: Transporter): Mailer {
  const configured = Boolean(transport ?? (config.host && config.to && config.from));
  const transporter =
    transport ??
    (configured
      ? nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          ...(config.user ? { auth: { user: config.user, pass: config.pass ?? "" } } : {}),
        })
      : undefined);
  return {
    configured,
    async send(lead) {
      if (!transporter) throw new Error("SMTP non configurato");
      const { subject, text } = leadEmail(lead);
      await transporter.sendMail({
        from: config.from ?? "semaforo@localhost",
        to: config.to ?? "autore@localhost",
        replyTo: { name: lead.name, address: lead.email },
        subject,
        text,
      });
    },
  };
}
