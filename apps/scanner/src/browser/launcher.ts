import { type Browser, chromium } from "playwright";

/**
 * Flag di Chromium per la sicurezza:
 * - il resolver DNS interno è disattivato: ogni richiesta DEVE passare dall'intercettazione
 *   (che usa safeFetch con controllo anti SSRF e IP pinnato). Nulla esce "di lato".
 * - WebRTC non può aprire connessioni UDP dirette; niente servizi in background.
 */
export const CHROMIUM_ARGS: readonly string[] = [
  "--host-resolver-rules=MAP * ~NOTFOUND",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-domain-reliability",
  "--disable-sync",
  "--disable-default-apps",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,AutofillServerCommunication,CertificateTransparencyComponentUpdater",
  "--disable-dev-shm-usage",
  "--mute-audio",
];

export interface BrowserManagerOptions {
  /** Percorso di Chromium, se diverso da quello di Playwright. */
  executablePath?: string;
  /**
   * Sandbox di Chromium. Playwright lo disattiva di default; va attivato in produzione
   * (richiede un container con user namespace o il profilo seccomp di Chromium).
   */
  sandbox?: boolean;
}

/** Un solo Chromium condiviso; ogni scansione usa un contesto nuovo e isolato. */
export class BrowserManager {
  private browser: Promise<Browser> | undefined;

  constructor(private readonly options: BrowserManagerOptions = {}) {}

  async get(): Promise<Browser> {
    if (this.browser) {
      const current = await this.browser.catch(() => undefined);
      if (current?.isConnected()) return current;
    }
    this.browser = chromium.launch({
      headless: true,
      args: [...CHROMIUM_ARGS],
      chromiumSandbox: this.options.sandbox ?? false,
      ...(this.options.executablePath ? { executablePath: this.options.executablePath } : {}),
    });
    return this.browser;
  }

  async close(): Promise<void> {
    const b = await this.browser?.catch(() => undefined);
    this.browser = undefined;
    await b?.close().catch(() => undefined);
  }
}
