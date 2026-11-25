import { describe, expect, it } from "vitest";
import { maskSecret, sec001, sec002, sec003, sec004, sec005, sec006, sec007, sec008 } from "../../src/checks/sicurezza.js";
import { detectCms, detectTechnologies } from "../../src/detect/cms.js";
import type { ScanContext } from "../../src/scan/context.js";
import { ctxFrom, FAKE_STRIPE_KEY, fixture, page, runOne } from "../fixtures.js";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toUTCString();
const wp = (): ScanContext => {
  const ctx = ctxFrom(fixture("static/wordpress-old.html"), {}, { url: "https://vecchio-blog.it/" });
  const cms = detectCms(ctx);
  if (cms) ctx.cms = cms;
  ctx.technologies = detectTechnologies(ctx);
  return ctx;
};

describe("maskSecret", () => {
  it("mostra solo i primi 4 e gli ultimi 2 caratteri", () => {
    const masked = maskSecret(FAKE_STRIPE_KEY);
    expect(masked.startsWith("sk_l")).toBe(true);
    expect(masked.endsWith("cd")).toBe(true);
    expect(masked).not.toContain("TestOnly");
    expect(maskSecret("abc12345")).toBe("ab******");
  });
});

describe("SEC-001 HTTPS", () => {
  it("ok con certificato valido e redirect", () => {
    const ctx = ctxFrom(page(""), { tls: { authorized: true, validTo: inDays(60) }, httpRedirectsToHttps: true });
    expect(runOne(sec001, ctx)?.status).toBe("ok");
  });
  it("ko senza HTTPS", () => expect(runOne(sec001, ctxFrom(page(""), {}, { url: "http://a.it/" }))?.status).toBe("ko"));
  it("ko con certificato non valido", () => {
    expect(runOne(sec001, ctxFrom(page(""), { tlsError: "CERT_HAS_EXPIRED" }, { url: "http://a.it/" }))).toMatchObject({ status: "ko", severity: "high" });
  });
  it("warn se scade entro 14 giorni", () => {
    const f = runOne(sec001, ctxFrom(page(""), { tls: { authorized: true, validTo: inDays(5) }, httpRedirectsToHttps: true }));
    expect(f?.status).toBe("warn");
    expect(f?.evidence?.[0]).toMatch(/scade tra [45] giorni/);
  });
  it("warn se http non reindirizza", () => {
    expect(runOne(sec001, ctxFrom(page(""), { tls: { authorized: true, validTo: inDays(60) }, httpRedirectsToHttps: false }))?.status).toBe("warn");
  });
});

describe("SEC-002 header", () => {
  it("warn, mai ko, se mancano", () => expect(runOne(sec002, ctxFrom(page("")))).toMatchObject({ status: "warn", severity: "medium" }));
  it("ok con tutti gli header", () => {
    const headers = {
      "strict-transport-security": "max-age=31536000",
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=()",
    };
    expect(runOne(sec002, ctxFrom(page(""), {}, { headers }))?.status).toBe("ok");
  });
});

describe("SEC-003 SPF e DMARC", () => {
  const dns = (spf: string[], dmarc: string[]) => ({ dns: { domain: "a.it", spf, dmarc, failed: false } });
  it("ok con SPF e DMARC quarantine", () => {
    expect(runOne(sec003, ctxFrom(page(""), dns(["v=spf1 include:_spf.google.com ~all"], ["v=DMARC1; p=quarantine"])))?.status).toBe("ok");
  });
  it("warn con DMARC p=none", () => {
    const f = runOne(sec003, ctxFrom(page(""), dns(["v=spf1 -all"], ["v=DMARC1; p=none"])));
    expect(f).toMatchObject({ status: "warn", severity: "low" });
  });
  it("warn se mancano", () => expect(runOne(sec003, ctxFrom(page(""), dns([], [])))).toMatchObject({ status: "warn", severity: "medium" }));
  it("unverifiable se il DNS fallisce", () => {
    expect(runOne(sec003, ctxFrom(page(""), { dns: { domain: "a.it", spf: [], dmarc: [], failed: true } }))?.status).toBe("unverifiable");
  });
});

describe("SEC-004 segreti", () => {
  it("ko con chiave Stripe live, evidenza mascherata", () => {
    const f = runOne(sec004, wp());
    expect(f).toMatchObject({ status: "ko", severity: "high" });
    const ev = f?.evidence?.join(" ") ?? "";
    expect(ev).toContain("Stripe");
    expect(ev).not.toContain(FAKE_STRIPE_KEY);
    expect(JSON.stringify(f)).not.toContain(FAKE_STRIPE_KEY);
  });
  it("cerca anche negli script dello stesso sito", () => {
    const akia = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
    const ctx = ctxFrom(page(""), { scripts: [{ url: "https://esempio-sito.it/app.js", sameOrigin: true, content: `const k="${akia}"` }] });
    expect(runOne(sec004, ctx)?.status).toBe("ko");
  });
  it("riconosce solo i JWT Supabase service_role", () => {
    const jwt = (role: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url")}.c2lnbmF0dXJlLXRlc3Q`;
    expect(runOne(sec004, ctxFrom(page(`<script>const k="${jwt("anon")}"</script>`)))?.status).toBe("ok");
    expect(runOne(sec004, ctxFrom(page(`<script>const k="${jwt("service_role")}"</script>`)))?.status).toBe("ko");
  });
  it("warn per chiave Google (può essere pubblica se limitata)", () => {
    const key = ["AIza", "SyD-TestOnlyKey_0000000000000000000"].join("");
    expect(runOne(sec004, ctxFrom(page(`<script>maps("${key}")</script>`)))?.status).toBe("warn");
  });
  it("ok senza segreti", () => expect(runOne(sec004, ctxFrom(fixture("static/clean-home.html")))?.status).toBe("ok"));
});

describe("SEC-005 librerie vulnerabili", () => {
  it("warn per jQuery 1.12.4", () => {
    const f = runOne(sec005, wp());
    expect(f?.status).toBe("warn");
    expect(f?.evidence?.[0]).toContain("jquery 1.12.4");
  });
  it("legge la versione dall'intestazione del file", () => {
    const ctx = ctxFrom(page(""), { scripts: [{ url: "https://a.it/vendor.js", sameOrigin: true, content: "/*! jQuery v3.7.1 | (c) OpenJS */" }] });
    expect(runOne(sec005, ctx)?.status).toBe("ok");
  });
  it("nessun esito se non riconosce librerie", () => expect(sec005.run(ctxFrom(page("")))).toEqual([]));
});

describe("SEC-006 WordPress", () => {
  it("warn con versione vecchia e plugin esposti", () => {
    const f = runOne(sec006, wp());
    expect(f).toMatchObject({ status: "warn", severity: "medium" });
    const ev = f?.evidence?.join(" ") ?? "";
    expect(ev).toContain("5.8.2");
    expect(ev).toContain("contact-form-7 5.4.2");
  });
  it("non si applica ad altri CMS", () => expect(sec006.run(ctxFrom(page("")))).toEqual([]));
});

describe("SEC-007 Supabase/Firebase", () => {
  it("unverifiable se usa Supabase", () => {
    const ctx = ctxFrom(page('<script>createClient("https://abcdefghijklmnopqrst.supabase.co")</script>'));
    ctx.technologies = detectTechnologies(ctx);
    expect(runOne(sec007, ctx)?.status).toBe("unverifiable");
  });
  it("nessun esito altrimenti", () => expect(sec007.run(ctxFrom(page("")))).toEqual([]));
});

describe("SEC-008 contenuto misto", () => {
  it("ko con stile in http", () => expect(runOne(sec008, wp())).toMatchObject({ status: "ko" }));
  it("warn con sola immagine in http", () => {
    expect(runOne(sec008, ctxFrom(page('<img src="http://a.it/x.jpg" alt="x">')))?.status).toBe("warn");
  });
  it("ok senza risorse http", () => expect(runOne(sec008, ctxFrom(fixture("static/clean-home.html")))?.status).toBe("ok"));
  it("non si applica a pagine http", () => expect(sec008.run(ctxFrom(page(""), {}, { url: "http://a.it/" }))).toEqual([]));
});
