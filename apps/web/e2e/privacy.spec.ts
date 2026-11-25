import { expect, test } from "@playwright/test";

const PAGES = ["/", "/metodologia", "/privacy", "/contatti", "/analisi/00000000-0000-0000-0000-000000000000"];

test("zero cookie, zero storage, nessuna richiesta esterna, nessuna violazione CSP", async ({ page, context, baseURL }) => {
  const external: string[] = [];
  const cspErrors: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(baseURL ?? "") && !r.url().startsWith("data:")) external.push(r.url());
  });
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text());
  });
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForTimeout(800);
  }
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(external).toEqual([]);
  expect(cspErrors).toEqual([]);
});

test("header di sicurezza e CSP con nonce", async ({ request }) => {
  const a = await request.get("/");
  const b = await request.get("/");
  const csp = a.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).not.toBe(b.headers()["content-security-policy"]);
  expect(a.headers()["x-content-type-options"]).toBe("nosniff");
  expect(a.headers()["x-frame-options"]).toBe("DENY");
  expect(a.headers()["referrer-policy"]).toBe("no-referrer");
  expect(a.headers()["permissions-policy"]).toContain("camera=()");
  expect(a.headers()["strict-transport-security"]).toContain("max-age=");
  expect(a.headers()["set-cookie"]).toBeUndefined();
  expect(a.headers()["x-powered-by"]).toBeUndefined();
});

test("font self-hosted", async ({ page, baseURL }) => {
  const fonts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "font") fonts.push(r.url());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((f) => f.startsWith(baseURL ?? ""))).toBe(true);
});
