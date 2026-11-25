import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDatabase } from "../src/rate-limit/db.js";
import { siteKey, visitorFingerprint } from "../src/rate-limit/fingerprint.js";
import { DAY_MS, HOUR_MS, RateLimiter } from "../src/rate-limit/rate-limiter.js";

const SALT = "test-salt-abbastanza-lungo-1234567890";

describe("fingerprint", () => {
  it("è un hash HMAC e non contiene l'IP in chiaro", () => {
    const fp = visitorFingerprint("203.0.113.7", "Mozilla/5.0", SALT);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain("203.0.113.7");
  });

  it("cambia con IP, user agent o salt", () => {
    const base = visitorFingerprint("203.0.113.7", "UA", SALT);
    expect(visitorFingerprint("203.0.113.8", "UA", SALT)).not.toBe(base);
    expect(visitorFingerprint("203.0.113.7", "UA2", SALT)).not.toBe(base);
    expect(visitorFingerprint("203.0.113.7", "UA", `${SALT}x`)).not.toBe(base);
    expect(visitorFingerprint("203.0.113.7", "UA", SALT)).toBe(base);
  });

  it("la chiave del sito ignora maiuscole, www e punto finale", () => {
    const k = siteKey("miosito.it", SALT);
    expect(siteKey("WWW.Miosito.IT.", SALT)).toBe(k);
    expect(siteKey("altro.it", SALT)).not.toBe(k);
    expect(k).not.toContain("miosito");
  });
});

describe("RateLimiter", () => {
  let db: Db;
  let now: number;
  let limiter: RateLimiter;
  const fp = visitorFingerprint("203.0.113.7", "UA", SALT);
  const siteA = siteKey("a.it", SALT);
  const siteB = siteKey("b.it", SALT);
  const siteC = siteKey("c.it", SALT);

  beforeEach(() => {
    db = openDatabase(":memory:");
    now = Date.UTC(2026, 10, 25, 9, 0, 0);
    limiter = new RateLimiter(db, { perDay: 2, globalPerHour: 100, now: () => now });
  });

  afterEach(() => db.close());

  it("consente 2 siti diversi al giorno e blocca il terzo", () => {
    expect(limiter.consume(fp, siteA)).toEqual({ allowed: true, rescan: false, remaining: 1 });
    expect(limiter.consume(fp, siteB)).toEqual({ allowed: true, rescan: false, remaining: 0 });
    const third = limiter.consume(fp, siteC);
    expect(third.allowed).toBe(false);
    if (!third.allowed) {
      expect(third.reason).toBe("visitor");
      expect(third.retryAfterSeconds).toBe(DAY_MS / 1000);
    }
  });

  it("la rianalisi dello stesso sito non consuma quota", () => {
    limiter.consume(fp, siteA);
    limiter.consume(fp, siteB);
    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(fp, siteA)).toMatchObject({ allowed: true, rescan: true });
      expect(limiter.consume(fp, siteB)).toMatchObject({ allowed: true, rescan: true });
    }
    expect(limiter.consume(fp, siteC).allowed).toBe(false);
  });

  it("la rianalisi non allunga la finestra di 24 ore", () => {
    limiter.consume(fp, siteA);
    now += 23 * HOUR_MS;
    expect(limiter.consume(fp, siteA)).toMatchObject({ allowed: true, rescan: true });
    now += 2 * HOUR_MS;
    // Passate 25 ore dalla prima analisi: torna una nuova analisi che consuma quota.
    expect(limiter.consume(fp, siteA)).toMatchObject({ allowed: true, rescan: false });
  });

  it("si azzera dopo 24 ore", () => {
    limiter.consume(fp, siteA);
    limiter.consume(fp, siteB);
    now += DAY_MS - 1;
    expect(limiter.consume(fp, siteC).allowed).toBe(false);
    now += 1;
    expect(limiter.consume(fp, siteC)).toMatchObject({ allowed: true, rescan: false });
  });

  it("i dati oltre 24 ore vengono cancellati dal database", () => {
    limiter.consume(fp, siteA);
    now += DAY_MS + 1;
    limiter.purge();
    const row = db.prepare("SELECT COUNT(*) AS n FROM rate_visits").get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("visitatori diversi hanno quote separate", () => {
    const other = visitorFingerprint("203.0.113.99", "UA", SALT);
    limiter.consume(fp, siteA);
    limiter.consume(fp, siteB);
    expect(limiter.consume(other, siteA)).toMatchObject({ allowed: true, rescan: false });
  });

  it("check non consuma quota", () => {
    for (let i = 0; i < 5; i++) expect(limiter.check(fp, siteA).allowed).toBe(true);
    limiter.consume(fp, siteA);
    limiter.consume(fp, siteB);
    expect(limiter.check(fp, siteC).allowed).toBe(false);
  });

  it("rispetta un limite giornaliero configurato diverso", () => {
    const l5 = new RateLimiter(db, { perDay: 5, globalPerHour: 100, now: () => now });
    for (let i = 0; i < 5; i++) expect(l5.consume(fp, siteKey(`s${i}.it`, SALT)).allowed).toBe(true);
    expect(l5.consume(fp, siteKey("s6.it", SALT)).allowed).toBe(false);
  });

  it("applica il limite globale orario, rianalisi comprese", () => {
    const global = new RateLimiter(db, { perDay: 100, globalPerHour: 3, now: () => now });
    expect(global.consume(fp, siteA).allowed).toBe(true);
    expect(global.consume(fp, siteA).allowed).toBe(true);
    expect(global.consume(visitorFingerprint("1.2.3.4", "x", SALT), siteB).allowed).toBe(true);
    const blocked = global.consume(visitorFingerprint("5.6.7.8", "y", SALT), siteC);
    expect(blocked).toMatchObject({ allowed: false, reason: "global" });
    now += HOUR_MS;
    expect(global.consume(visitorFingerprint("5.6.7.8", "y", SALT), siteC).allowed).toBe(true);
  });
});
