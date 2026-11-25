import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import type { ErrorCode } from "@semaforo/shared";
import { isScanError } from "../src/errors.js";
import { assertPublicUrl } from "../src/security/guard.js";
import { isPublicIp } from "../src/security/ip-policy.js";
import { resolvePublic } from "../src/security/resolver.js";
import { safeFetch } from "../src/security/safe-fetch.js";
import { parseTargetUrl } from "../src/security/url-policy.js";
import { dialTo, fakeResolver, PUBLIC_IP, PUBLIC_IP_2, startServer, type TestServer } from "./helpers.js";

async function expectCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(isScanError(err), `errore inatteso: ${String(err)}`).toBe(true);
    expect((err as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`atteso errore ${code}, nessun errore`);
}

function expectSyncCode(fn: () => unknown, code: ErrorCode): void {
  try {
    fn();
  } catch (err) {
    expect(isScanError(err), `errore inatteso: ${String(err)}`).toBe(true);
    expect((err as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`atteso errore ${code}, nessun errore`);
}

describe("isPublicIp", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "169.254.0.1",
    "100.64.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "fec0::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "2001:db8::1",
    "fd00:ec2::254",
    "[::1]",
    "fe80::1%eth0",
    "non-un-ip",
    "",
  ])("rifiuta %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4001::200e", "::ffff:8.8.8.8"])(
    "accetta l'IP pubblico %s",
    (ip) => {
      expect(isPublicIp(ip)).toBe(true);
    },
  );

  it("rifiuta forme IPv4 non canoniche non normalizzate", () => {
    expect(isPublicIp("2130706433")).toBe(false);
    expect(isPublicIp("0x7f.0.0.1")).toBe(false);
    expect(isPublicIp("127.1")).toBe(false);
  });
});

describe("parseTargetUrl", () => {
  it.each([
    ["localhost", "URL_BLOCKED"],
    ["http://localhost/", "URL_BLOCKED"],
    ["http://LOCALHOST./", "URL_BLOCKED"],
    ["http://app.localhost/", "URL_BLOCKED"],
    ["http://127.0.0.1/", "URL_BLOCKED"],
    ["127.0.0.1", "URL_BLOCKED"],
    ["http://[::1]/", "URL_BLOCKED"],
    ["http://[::ffff:127.0.0.1]/", "URL_BLOCKED"],
    ["http://[::ffff:7f00:1]/", "URL_BLOCKED"],
    ["http://[fc00::1]/", "URL_BLOCKED"],
    ["http://[fe80::1]/", "URL_BLOCKED"],
    ["http://169.254.169.254/latest/meta-data/", "URL_BLOCKED"],
    ["http://metadata.google.internal/", "URL_BLOCKED"],
    ["http://10.0.0.1/", "URL_BLOCKED"],
    ["http://172.16.5.4/", "URL_BLOCKED"],
    ["http://192.168.0.1/", "URL_BLOCKED"],
    ["http://100.64.0.1/", "URL_BLOCKED"],
    ["http://0.0.0.0/", "URL_BLOCKED"],
    ["http://0/", "URL_BLOCKED"],
    ["http://2130706433/", "URL_BLOCKED"],
    ["http://0x7f000001/", "URL_BLOCKED"],
    ["http://0177.0.0.1/", "URL_BLOCKED"],
    ["http://127.1/", "URL_BLOCKED"],
    ["http://intranet/", "URL_BLOCKED"],
    ["http://router.lan/", "URL_BLOCKED"],
    ["http://nas.local/", "URL_BLOCKED"],
    ["http://user:pass@example.com/", "URL_CREDENTIALS"],
    ["https://admin@example.com/", "URL_CREDENTIALS"],
    ["example.com:8080", "URL_PORT"],
    ["http://example.com:22/", "URL_PORT"],
    ["https://example.com:8443/", "URL_PORT"],
    ["http://example.com:6379/", "URL_PORT"],
    ["file:///etc/passwd", "URL_SCHEME"],
    ["file:/etc/passwd", "URL_SCHEME"],
    ["gopher://example.com:70/_GET", "URL_SCHEME"],
    ["ftp://example.com/", "URL_SCHEME"],
    ["javascript:alert(1)", "URL_SCHEME"],
    ["data:text/html,<h1>x</h1>", "URL_SCHEME"],
    ["dict://example.com:11211/", "URL_SCHEME"],
    ["ws://example.com/", "URL_SCHEME"],
    ["", "INVALID_URL"],
    ["http://exa mple.com/", "INVALID_URL"],
    ["http://example.com\\@127.0.0.1/", "INVALID_URL"],
    [`https://${"a".repeat(2100)}.com`, "INVALID_URL"],
  ] as Array<[string, ErrorCode]>)("rifiuta %s con %s", (input, code) => {
    expectSyncCode(() => parseTargetUrl(input), code);
  });

  it("aggiunge https:// e normalizza", () => {
    expect(parseTargetUrl("Miosito.IT").href).toBe("https://miosito.it/");
    expect(parseTargetUrl("  https://miosito.it/chi-siamo#team ").href).toBe("https://miosito.it/chi-siamo");
    expect(parseTargetUrl("http://miosito.it:80/").href).toBe("http://miosito.it/");
    expect(parseTargetUrl("https://miosito.it:443/").href).toBe("https://miosito.it/");
    expect(parseTargetUrl("https://8.8.8.8/").hostname).toBe("8.8.8.8");
  });

  it("accetta i domini internazionalizzati convertendoli in punycode", () => {
    expect(parseTargetUrl("https://caffè.it/").hostname).toBe("xn--caff-8oa.it");
  });
});

describe("resolvePublic (DNS)", () => {
  it("blocca un dominio che risolve a un IP privato", async () => {
    const resolver = fakeResolver({ "interno.example.com": ["10.0.0.5"] });
    await expectCode(resolvePublic("interno.example.com", resolver), "URL_BLOCKED");
  });

  it.each(["127.0.0.1", "169.254.169.254", "192.168.1.10", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"])(
    "blocca un dominio che risolve a %s",
    async (ip) => {
      const resolver = fakeResolver({ "evil.example.com": [ip] });
      await expectCode(assertPublicUrl("https://evil.example.com/", { resolver }), "URL_BLOCKED");
    },
  );

  it("blocca se anche uno solo degli IP risolti è interno", async () => {
    const resolver = fakeResolver({ "misto.example.com": [PUBLIC_IP, "127.0.0.1"] });
    await expectCode(resolvePublic("misto.example.com", resolver), "URL_BLOCKED");
  });

  it("segnala un dominio inesistente o senza indirizzi", async () => {
    await expectCode(resolvePublic("nonesiste.example.com", fakeResolver({})), "DNS_FAILED");
    await expectCode(resolvePublic("vuoto.example.com", fakeResolver({ "vuoto.example.com": [] })), "DNS_FAILED");
  });

  it("accetta un dominio pubblico e restituisce gli IP validati", async () => {
    const resolver = fakeResolver({ "miosito.it": [PUBLIC_IP, "2606:4700::1"] });
    const { url, addresses } = await assertPublicUrl("miosito.it", { resolver });
    expect(url.href).toBe("https://miosito.it/");
    expect(addresses.map((a) => a.address)).toEqual([PUBLIC_IP, "2606:4700::1"]);
  });

  it("non interroga il DNS per gli IP letterali", async () => {
    const resolver = fakeResolver({});
    await expectCode(assertPublicUrl("http://127.0.0.1/", { resolver }), "URL_BLOCKED");
    expect(resolver.calls).toEqual([]);
  });
});

describe("safeFetch", () => {
  let server: TestServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("scarica una pagina pubblica connettendosi all'IP validato", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>ciao</h1>");
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial, dialed } = dialTo(server);
    const res = await safeFetch("http://pubblico.example.com/pagina?x=1", { resolver, dial, userAgent: "SemaforoBot/1.0 (+test)" });

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe("<h1>ciao</h1>");
    expect(res.remoteAddress).toBe(PUBLIC_IP);
    expect(dialed).toEqual([PUBLIC_IP]);
    expect(server.requests[0]).toMatchObject({
      path: "/pagina?x=1",
      host: "pubblico.example.com",
      userAgent: "SemaforoBot/1.0 (+test)",
    });
  });

  it.each([
    ["http://127.0.0.1/admin", "URL_BLOCKED"],
    ["http://localhost/", "URL_BLOCKED"],
    ["http://[::1]/", "URL_BLOCKED"],
    ["http://169.254.169.254/latest/meta-data/iam/", "URL_BLOCKED"],
    ["http://10.0.0.1/", "URL_BLOCKED"],
    ["http://interno.example.com/", "URL_BLOCKED"],
    ["http://0x7f000001/", "URL_BLOCKED"],
    ["file:///etc/passwd", "URL_SCHEME"],
    ["gopher://pubblico.example.com/_x", "URL_SCHEME"],
    ["http://pubblico.example.com:6379/", "URL_PORT"],
    ["http://user:pw@pubblico.example.com/", "URL_CREDENTIALS"],
  ] as Array<[string, ErrorCode]>)("blocca il redirect verso %s", async (location, code) => {
    server = await startServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(302, { location });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end("non dovrei essere raggiunto");
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP], "interno.example.com": ["192.168.1.1"] });
    const { dial, dialed } = dialTo(server);

    await expectCode(safeFetch("http://pubblico.example.com/", { resolver, dial }), code);
    expect(dialed).toEqual([PUBLIC_IP]);
    expect(server.requests).toHaveLength(1);
  });

  it("segue redirect relativi e ricontrolla ogni salto", async () => {
    server = await startServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(301, { location: "/nuova" });
        res.end();
      } else if (req.url === "/nuova") {
        res.writeHead(302, { location: "http://altro.example.com/finale" });
        res.end();
      } else {
        res.writeHead(200);
        res.end("ok");
      }
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP], "altro.example.com": [PUBLIC_IP_2] });
    const { dial, dialed } = dialTo(server);
    const res = await safeFetch("http://pubblico.example.com/", { resolver, dial });

    expect(res.status).toBe(200);
    expect(res.url).toBe("http://altro.example.com/finale");
    expect(res.redirects.map((r) => r.status)).toEqual([301, 302]);
    expect(resolver.calls).toEqual(["pubblico.example.com", "pubblico.example.com", "altro.example.com"]);
    expect(dialed).toEqual([PUBLIC_IP, PUBLIC_IP, PUBLIC_IP_2]);
  });

  it("difende dal DNS rebinding: ogni salto usa l'IP appena validato", async () => {
    let call = 0;
    const resolver = fakeResolver({
      // Primo lookup pubblico, poi il dominio "cambia" e punta all'interno.
      "rebind.example.com": () => (call++ === 0 ? [PUBLIC_IP] : ["127.0.0.1"]),
    });
    server = await startServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(302, { location: "/secondo" });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end("interno");
    });
    const { dial, dialed } = dialTo(server);

    await expectCode(safeFetch("http://rebind.example.com/", { resolver, dial }), "URL_BLOCKED");
    expect(dialed).toEqual([PUBLIC_IP]);
    expect(server.requests).toHaveLength(1);
  });

  it("si ferma oltre 5 redirect", async () => {
    server = await startServer((req, res) => {
      const n = Number((req.url ?? "/0").slice(1)) || 0;
      res.writeHead(302, { location: `/${n + 1}` });
      res.end();
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial } = dialTo(server);
    await expectCode(safeFetch("http://pubblico.example.com/0", { resolver, dial }), "TOO_MANY_REDIRECTS");
    expect(server.requests).toHaveLength(6);
  });

  it("accetta esattamente 5 redirect", async () => {
    server = await startServer((req, res) => {
      const n = Number((req.url ?? "/0").slice(1)) || 0;
      if (n >= 5) {
        res.writeHead(200);
        res.end("arrivato");
        return;
      }
      res.writeHead(302, { location: `/${n + 1}` });
      res.end();
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial } = dialTo(server);
    const res = await safeFetch("http://pubblico.example.com/0", { resolver, dial });
    expect(res.body.toString()).toBe("arrivato");
    expect(res.redirects).toHaveLength(5);
  });

  it("rifiuta risposte troppo grandi dichiarate con content-length", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-length": String(6 * 1024 * 1024) });
      res.end();
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial } = dialTo(server);
    await expectCode(safeFetch("http://pubblico.example.com/", { resolver, dial }), "RESPONSE_TOO_LARGE");
  });

  it("rifiuta risposte troppo grandi in streaming", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      const chunk = Buffer.alloc(64 * 1024, 97);
      let sent = 0;
      const push = () => {
        while (sent < 6 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) {
            res.once("drain", push);
            return;
          }
        }
        res.end();
      };
      push();
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial } = dialTo(server);
    await expectCode(safeFetch("http://pubblico.example.com/", { resolver, dial }), "RESPONSE_TOO_LARGE");
  });

  it("limita la dimensione dopo la decompressione (zip bomb)", async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(20 * 1024 * 1024, 0));
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip", "content-length": String(bomb.length) });
      res.end(bomb);
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial } = dialTo(server);
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
    await expectCode(safeFetch("http://pubblico.example.com/", { resolver, dial }), "RESPONSE_TOO_LARGE");
  });

  it("decomprime le risposte gzip normali", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip" });
      res.end(zlib.gzipSync("<p>compresso</p>"));
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial } = dialTo(server);
    const res = await safeFetch("http://pubblico.example.com/", { resolver, dial });
    expect(res.body.toString()).toBe("<p>compresso</p>");
  });

  it("va in timeout se il server non risponde", async () => {
    server = await startServer(() => {
      // Nessuna risposta.
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial } = dialTo(server);
    await expectCode(safeFetch("http://pubblico.example.com/", { resolver, dial, timeoutMs: 200 }), "TIMEOUT");
  });

  it("rispetta il segnale di timeout totale della scansione", async () => {
    server = await startServer(() => {
      // Nessuna risposta.
    });
    const resolver = fakeResolver({ "pubblico.example.com": [PUBLIC_IP] });
    const { dial } = dialTo(server);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    await expectCode(safeFetch("http://pubblico.example.com/", { resolver, dial, signal: controller.signal }), "TIMEOUT");
  });

  it("non interroga mai il DNS né si connette per URL bloccati in partenza", async () => {
    const resolver = fakeResolver({});
    const dialed: string[] = [];
    await expectCode(
      safeFetch("http://169.254.169.254/", {
        resolver,
        dial: (a) => {
          dialed.push(a.address);
          return { host: "127.0.0.1", port: 1 };
        },
      }),
      "URL_BLOCKED",
    );
    expect(resolver.calls).toEqual([]);
    expect(dialed).toEqual([]);
  });
});
