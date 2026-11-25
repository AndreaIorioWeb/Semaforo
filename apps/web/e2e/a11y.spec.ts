import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { scanFromHome } from "./helpers";

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary).toEqual([]);
}

for (const path of ["/", "/metodologia", "/privacy", "/contatti", "/analisi/00000000-0000-0000-0000-000000000000", "/pagina-inesistente"]) {
  test(`axe WCAG 2.1 AA: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("load");
    await page.waitForTimeout(500);
    await axe(page);
  });
}

test("axe WCAG 2.1 AA: report completo, tutte le schede e prompt aperto", async ({ page }) => {
  await scanFromHome(page, "corretto.it");
  for (const name of [/Tutti/, /In regola/, /Non verificabile/, /Da sistemare/]) {
    await page.getByRole("tab", { name }).click();
    await axe(page);
  }
  await page.getByRole("tab", { name: /Tutti/ }).click();
  const summary = page.locator("summary", { hasText: "Mostra il prompt" }).first();
  if (await summary.count()) await summary.click();
  await axe(page);
});

test("tastiera: skip link, focus visibile e lang", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Vai al contenuto" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#contenuto")).toBeFocused();
  // Il campo dominio è raggiungibile e ha un indicatore di focus visibile.
  await page.getByLabel("Indirizzo del sito").focus();
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement?.parentElement as Element).outlineStyle);
  expect(outline).not.toBe("none");
});
