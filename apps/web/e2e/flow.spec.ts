import { expect, test } from "@playwright/test";
import { scanFromHome } from "./helpers";

test("flusso completo: URL, avanzamento, report, filtri, copia prompt, PDF, lead", async ({ page, request }) => {
  const progress: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/events")) progress.push(r.headers()["content-type"] ?? "");
  });

  const jobId = await scanFromHome(page, "ga-prima.it");
  expect(progress.some((t) => t.includes("text/event-stream"))).toBe(true);

  // Riepilogo: rischio con icona e testo, conteggi.
  await expect(page.getByText("Rischio alto").first()).toBeVisible();
  await expect(page.getByText(/da sistemare/).first()).toBeVisible();

  // Schede: "Da sistemare" selezionata, frecce per spostarsi.
  const todo = page.getByRole("tab", { name: /Da sistemare/ });
  await expect(todo).toHaveAttribute("aria-selected", "true");
  await todo.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Tutti/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Tutti/ })).toBeFocused();
  await page.getByRole("tab", { name: /Da sistemare/ }).click();
  await expect(page.getByRole("heading", { name: "Tracciamento attivo prima del consenso" })).toBeVisible();

  // Copia prompt con feedback visivo e annuncio.
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Tracciamento attivo prima del consenso" }) });
  await card.getByRole("button", { name: "Copia prompt" }).click();
  await expect(card.getByRole("status")).toHaveText(/Prompt copiato/);
  await expect(card.getByRole("button", { name: "Copiato" })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("COOKIE-001");
  expect(clip.trim().endsWith("Le indicazioni legali vanno verificate con un professionista.")).toBe(true);

  // Copia tutti i prompt aperti, ordinati per gravità.
  await page.getByRole("button", { name: "Copia tutti i prompt aperti" }).click();
  const all = await page.evaluate(() => navigator.clipboard.readText());
  expect(all).toMatch(/1\. \[da sistemare, gravità high\]/);

  // Sezione fissa e disclaimer.
  await expect(page.getByRole("heading", { name: "Cosa non si può verificare" })).toBeVisible();
  await expect(page.getByText("non sono consulenza legale").last()).toBeVisible();

  // PDF.
  const pdf = await request.get(`/api/scan/${jobId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // CTA verso il form lead con il sito precompilato.
  await page.getByRole("link", { name: "Fai sistemare a un professionista" }).click();
  await expect(page).toHaveURL(/\/contatti\?sito=ga-prima\.it/);
  await expect(page.getByLabel("Sito")).toHaveValue("ga-prima.it");

  // Consenso non preselezionato: senza spunta il modulo non parte.
  const consent = page.getByRole("checkbox", { name: /Ho letto l'informativa privacy/ });
  await expect(consent).not.toBeChecked();
  await page.getByLabel("Nome e cognome *").fill("Giulia Test");
  await page.getByLabel("Email *").fill("giulia@example.org");
  await page.getByLabel("Messaggio").fill("Vorrei sistemare i cookie");
  let leadRequests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/lead")) leadRequests++;
  });
  await page.getByRole("button", { name: "Invia la richiesta" }).click();
  await page.waitForTimeout(300);
  expect(leadRequests).toBe(0);

  await consent.check();
  await page.getByRole("button", { name: "Invia la richiesta" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Richiesta inviata" })).toBeVisible();
  expect(leadRequests).toBe(1);

  const mails = (await (await request.get("http://127.0.0.1:3102/mails")).json()) as Array<{ text: string; attachments?: unknown }>;
  const mail = mails.at(-1);
  expect(mail?.text).toContain("Giulia Test");
  expect(mail?.text).toContain("Vorrei sistemare i cookie");
  expect(mail?.attachments).toBeUndefined();
});

test("URL bloccato: messaggio chiaro in italiano", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Indirizzo del sito").fill("127.0.0.1");
  await page.getByRole("button", { name: "Controlla il sito" }).click();
  await expect(page.getByText("non è un sito pubblico")).toBeVisible();
  await expect(page.getByLabel("Indirizzo del sito")).toHaveAttribute("aria-invalid", "true");
});

test("job scaduto o inesistente: invito a rilanciare", async ({ page }) => {
  await page.goto("/analisi/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Questa analisi non è più disponibile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Avvia una nuova analisi" })).toBeVisible();
});

test("incollare un indirizzo completo toglie https:// e la barra finale", async ({ page }) => {
  await page.goto("/");
  const field = page.getByLabel("Indirizzo del sito");
  await field.focus();
  await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement;
    const data = new DataTransfer();
    data.setData("text", "https://www.miosito.it/");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(field).toHaveValue("www.miosito.it");
});
