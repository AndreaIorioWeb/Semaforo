import { expect, test } from "@playwright/test";
import type { Report } from "@semaforo/shared";

/**
 * Dogfooding: Semaforo analizza il proprio sito ("semaforo.test" punta al Next in esecuzione).
 * Criterio: nessun finding "ko". Unica eccezione in locale: SEC-001, perché il test gira in http
 * senza certificato; sul dominio reale va verificato con HTTPS (Milestone 5).
 */
test("Semaforo analizzato da Semaforo: nessun ko", async ({ request }) => {
  const start = await request.post("/api/scan", { data: { url: "semaforo.test", siteType: "auto" } });
  expect(start.status()).toBe(202);
  const { jobId } = (await start.json()) as { jobId: string };

  let report: Report | undefined;
  for (let i = 0; i < 60 && !report; i++) {
    const res = await request.get(`/api/scan/${jobId}`);
    if (res.status() === 200) {
      const body = (await res.json()) as Report & { state?: string };
      expect(body.state).not.toBe("error");
      report = body;
    } else await new Promise((r) => setTimeout(r, 1000));
  }
  expect(report).toBeDefined();
  const r = report as Report;
  const ko = r.findings.filter((f) => f.status === "ko").map((f) => f.id);
  const warn = r.findings.filter((f) => f.status === "warn").map((f) => `${f.id}: ${f.evidence?.join("; ") ?? f.explanation}`);
  console.log("Avvisi (warn) nel dogfooding:\n" + warn.join("\n"));
  expect(ko.filter((id) => id !== "SEC-001")).toEqual([]);
  // Controlli chiave che devono essere in regola.
  const byId = Object.fromEntries(r.findings.map((f) => [f.id, f.status]));
  for (const id of ["COOKIE-001", "COOKIE-002", "COOKIE-006", "PRIV-001", "PRIV-002", "AZ-001", "AZ-004", "PUB-001", "PUB-002", "PUB-005", "SEC-002", "SEC-004"]) {
    expect(byId[id], id).toBe("ok");
  }
});
