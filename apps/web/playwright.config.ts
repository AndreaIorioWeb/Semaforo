import { defineConfig, devices } from "@playwright/test";

const WEB = 3100;
const SCANNER = 3101;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB}`,
    trace: "off",
    locale: "it-IT",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], permissions: ["clipboard-read", "clipboard-write"] } },
  ],
  webServer: [
    {
      command: `pnpm --filter @semaforo/scanner exec tsx test/e2e-server.ts`,
      url: `http://127.0.0.1:${SCANNER}/api/health`,
      env: { PORT: String(SCANNER), ADMIN_PORT: "3102", WEB_PORT: String(WEB) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `next start --port ${WEB} --hostname 127.0.0.1`,
      url: `http://127.0.0.1:${WEB}/`,
      env: {
        SCANNER_INTERNAL_URL: `http://127.0.0.1:${SCANNER}`,
        PUBLIC_BASE_URL: "http://semaforo.test",
        OWNER_NAME: "Mario Rossi (ditta individuale)",
        OWNER_VAT: "12345678903",
        OWNER_ADDRESS: "Via Roma 1, 00100 Roma",
        OWNER_EMAIL: "info@mariorossi.example",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
