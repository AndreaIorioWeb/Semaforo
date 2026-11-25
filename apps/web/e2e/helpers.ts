import { expect, type Page } from "@playwright/test";

/** Avvia un'analisi dalla home e attende il report. */
export async function scanFromHome(page: Page, domain: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Indirizzo del sito").fill(domain);
  await page.getByRole("button", { name: "Controlla il sito" }).click();
  await page.waitForURL(/\/analisi\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: domain })).toBeVisible({ timeout: 60_000 });
  return page.url().split("/").pop() ?? "";
}
