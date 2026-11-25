import type { BrowserRunner } from "../scan/pipeline.js";
import { BrowserManager, type BrowserManagerOptions } from "./launcher.js";
import { observePage } from "./observe.js";
import { MemoryMonitor } from "./resources.js";

export { BrowserManager };

/** User agent di Chromium con l'identificativo dichiarato del bot in coda (SPEC sezione 5). */
export function browserUserAgent(botUserAgent: string, chromiumVersion: string): string {
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromiumVersion} Safari/537.36 ${botUserAgent}`;
}

export interface BrowserRunnerOptions extends BrowserManagerOptions {
  botUserAgent: string;
  navigationTimeoutMs?: number;
  idleCapMs?: number;
}

export function createBrowserRunner(manager: BrowserManager, options: BrowserRunnerOptions): BrowserRunner {
  return async (url, { fetch, signal }) => {
    const browser = await manager.get();
    const monitor = new MemoryMonitor();
    try {
      const observation = await observePage(browser, url, {
        fetch,
        signal,
        userAgent: browserUserAgent(options.botUserAgent, browser.version()),
        ...(options.navigationTimeoutMs ? { navigationTimeoutMs: options.navigationTimeoutMs } : {}),
        ...(options.idleCapMs ? { idleCapMs: options.idleCapMs } : {}),
      });
      return { ...observation, memory: monitor.stop() };
    } finally {
      monitor.stop();
    }
  };
}
