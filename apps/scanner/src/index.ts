import { BrowserManager, createBrowserRunner } from "./browser/index.js";
import { loadConfig } from "./config.js";
import { createPdfRenderer } from "./pdf/render.js";
import { buildServer } from "./server.js";

const config = loadConfig();

const browserManager = config.browserEnabled
  ? new BrowserManager({
      sandbox: config.chromiumSandbox,
      ...(config.chromiumExecutablePath ? { executablePath: config.chromiumExecutablePath } : {}),
    })
  : undefined;

const { app } = await buildServer({
  config,
  pipeline: browserManager ? { browser: createBrowserRunner(browserManager, { botUserAgent: config.userAgent }) } : {},
  ...(browserManager ? { pdf: createPdfRenderer(browserManager) } : {}),
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "arresto in corso");
  await app.close();
  await browserManager?.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: config.host });
