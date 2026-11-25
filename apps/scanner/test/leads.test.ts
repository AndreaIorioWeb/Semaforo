import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Transporter } from "nodemailer";
import { loadConfig } from "../src/config.js";
import type { AppContext } from "../src/context.js";
import { openDatabase } from "../src/rate-limit/db.js";
import { buildServer } from "../src/server.js";

interface Sent { to: unknown; replyTo: unknown; subject: string; text: string; attachments?: unknown }

function fakeTransport(fail = { value: false }) {
  const sent: Sent[] = [];
  const transport = {
    sendMail: async (mail: Sent) => {
      if (fail.value) throw new Error("SMTP giù");
      sent.push(mail);
      return {};
    },
  } as unknown as Transporter;
  return { transport, sent, fail };
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(fail = { value: false }) {
  let now = Date.UTC(2026, 10, 25, 10);
  const db = openDatabase(":memory:");
  const mail = fakeTransport(fail);
  const config = loadConfig({ FINGERPRINT_SALT: "salt-di-test-lungo-abbastanza-123", LEAD_TO: "autore@example.org", SMTP_FROM: "semaforo@example.org" });
  const built = await buildServer({ config, db, logger: false, mailTransport: mail.transport, now: () => now });
  app = built.app;
  return { app: built.app, ctx: built.ctx as AppContext, db, mail, advance: (ms: number) => (now += ms) };
}

const valid = { name: "Mario Rossi", email: "mario@example.org", site: "https://mariorossi.it", message: "Vorrei un preventivo", consent: true };
const post = (a: FastifyInstance, payload: unknown, ua = "UA") =>
  a.inject({ method: "POST", url: "/api/lead", headers: { "user-agent": ua, "x-forwarded-for": "203.0.113.5" }, payload: payload as Record<string, unknown> });

describe("POST /api/lead", () => {
  it("salva, invia all'autore senza allegati e non conserva l'IP", async () => {
    const { app, db, mail } = await setup();
    const res = await post(app, valid);
    expect(res.statusCode).toBe(202);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe("autore@example.org");
    expect(mail.sent[0]?.text).toContain("Vorrei un preventivo");
    expect(mail.sent[0]?.text).toContain("24 ore");
    expect(mail.sent[0]?.attachments).toBeUndefined();
    const row = db.prepare("SELECT * FROM leads").get() as Record<string, unknown>;
    expect(row).toMatchObject({ name: "Mario Rossi", consent_version: expect.any(String) });
    expect(row.emailed_at).not.toBeNull();
    expect(JSON.stringify(db.prepare("SELECT * FROM lead_rate").all())).not.toContain("203.0.113.5");
  });

  it("rifiuta senza consenso esplicito", async () => {
    const { app } = await setup();
    for (const consent of [undefined, false, "true", "on"]) {
      const res = await post(app, { ...valid, consent });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "LEAD_CONSENT" } });
    }
  });

  it("valida i campi e blocca l'iniezione di header nel nome", async () => {
    const { app } = await setup();
    for (const payload of [{ ...valid, email: "non-email" }, { ...valid, name: "" }, { ...valid, name: "A\r\nBcc: x@y.z" }]) {
      expect((await post(app, payload)).json()).toMatchObject({ error: { code: "LEAD_INVALID" } });
    }
  });

  it("campo trappola compilato: risposta ok ma nulla salvato né inviato", async () => {
    const { app, ctx, mail } = await setup();
    expect((await post(app, { ...valid, company: "Spam Srl" })).statusCode).toBe(202);
    expect(ctx.leadStore.count()).toBe(0);
    expect(mail.sent).toHaveLength(0);
  });

  it("massimo 5 richieste al giorno per visitatore", async () => {
    const { app } = await setup();
    for (let i = 0; i < 5; i++) expect((await post(app, valid)).statusCode).toBe(202);
    expect((await post(app, valid)).json()).toMatchObject({ error: { code: "LEAD_RATE_LIMITED" } });
    expect((await post(app, valid, "Altro-UA")).statusCode).toBe(202);
  });

  it("cancella i lead dopo 24 ore, inviati o no", async () => {
    const { app, ctx, advance } = await setup();
    await post(app, valid);
    advance(23 * 3_600_000);
    await ctx.leads.tick();
    expect(ctx.leadStore.count()).toBe(1);
    advance(3_600_000);
    await ctx.leads.tick();
    expect(ctx.leadStore.count()).toBe(0);
  });

  it("se l'SMTP fallisce il lead resta salvato e viene reinviato", async () => {
    const fail = { value: true };
    const { app, ctx, mail } = await setup(fail);
    expect((await post(app, valid)).statusCode).toBe(202);
    expect(mail.sent).toHaveLength(0);
    expect(ctx.leadStore.pending()).toHaveLength(1);
    fail.value = false;
    await ctx.leads.tick();
    expect(mail.sent).toHaveLength(1);
    expect(ctx.leadStore.pending()).toHaveLength(0);
  });
});
