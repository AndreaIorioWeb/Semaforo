# Semaforo

> Il controllo gratuito del tuo sito.

Scanner pubblico di conformità e qualità per siti web italiani (privacy, cookie, dati aziendali, vendita online, prontezza pubblica, sicurezza di base). Specifica completa in `SPEC.md`.

**Stato:** Milestone 1, 2 e 3 completate (fondamenta, check statici, browser). Nessuna UI ancora (Milestone 4).

## Struttura

```
apps/scanner      Servizio Node (Fastify): API, anti SSRF, rate limit, coda, SSE, pipeline, check, browser
  src/security    Guardia anti SSRF e safeFetch
  src/scan        Contesto e pipeline di scansione
  src/browser     Chromium isolato con intercettazione di ogni richiesta
  src/legal       Lettura pagine legali con rispetto di robots.txt
  src/checks      Check COOKIE, PRIV, AZ, VEND, PUB, SEC (uno per modulo, run(ctx) → Finding[])
  src/prompts     Prompt di correzione con varianti per CMS
packages/shared   Tipi, schemi Zod, catalogo dei check, tracker, librerie vulnerabili, calcolo rischio
```

`apps/web` (Next.js) arriverà con la Milestone 4.

## Requisiti

- Node 22 (vedi `.nvmrc`)
- pnpm 10 (`corepack enable`)

## Setup locale

```bash
pnpm install
cp .env.example .env        # opzionale in sviluppo
pnpm dev                    # avvia lo scanner su http://localhost:3001
```

In sviluppo, se `FINGERPRINT_SALT` è vuoto viene generato un salt casuale a ogni avvio (i limiti si azzerano al riavvio). In produzione è obbligatorio.

## Comandi

| Comando | Cosa fa |
| --- | --- |
| `pnpm dev` | Scanner in watch mode (tsx) |
| `pnpm test` | Test unitari e d'integrazione (Vitest) |
| `pnpm test:e2e` | Test e2e con Chromium contro siti fixture locali |
| `pnpm --filter @semaforo/scanner bench` | Misura tempi e memoria della scansione con browser |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript senza emissione |
| `pnpm build` | Compila `packages/shared` e `apps/scanner` in `dist/` |
| `pnpm --filter @semaforo/scanner start` | Avvia la build compilata |

## API

| Metodo | Percorso | Risposta |
| --- | --- | --- |
| `POST` | `/api/scan` | body `{ "url": "miosito.it", "siteType": "auto" }` → `202 { jobId }`. Errori: `400` URL non valido o bloccato, `429` limite, `503` coda piena |
| `GET` | `/api/scan/:jobId/events` | SSE con eventi `progress`, `done`, `error` |
| `GET` | `/api/scan/:jobId` | Report JSON (`202` se ancora in corso, `404` se scaduto) |
| `GET` | `/api/health` | Stato, coda e metriche aggregate |

Esempio:

```bash
curl -s -X POST localhost:3001/api/scan -H 'content-type: application/json' -d '{"url":"example.com"}'
curl -N localhost:3001/api/scan/<jobId>/events
```

Gli errori hanno sempre la forma `{ "error": { "code": "...", "message": "messaggio in italiano" } }`.

## Variabili d'ambiente

| Variabile | Default | Note |
| --- | --- | --- |
| `PORT` / `HOST` | `3001` / `0.0.0.0` | |
| `RATE_LIMIT_PER_DAY` | `2` | Siti diversi per visitatore nelle 24 ore. La rianalisi dello stesso sito non consuma quota |
| `GLOBAL_SCANS_PER_HOUR` | `30` | Limite globale anti abuso (rianalisi comprese) |
| `SCAN_CONCURRENCY` | `1` | Scansioni in parallelo |
| `SCAN_MAX_QUEUE` | `10` | Job in attesa, oltre risponde 503 |
| `SCAN_TIMEOUT_MS` | `60000` | Timeout totale di una scansione |
| `FINGERPRINT_SALT` | | **Obbligatorio in produzione**, almeno 16 caratteri (`openssl rand -hex 32`) |
| `DATABASE_PATH` | `./data/semaforo.sqlite` | SQLite, solo hash per il rate limit |
| `TRUST_PROXY` | `false` | `true` dietro nginx, per leggere l'IP reale |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Usato nello user agent `SemaforoBot/1.0 (+URL/metodologia)` |
| `BROWSER_ENABLED` | `true` | Chromium per i check COOKIE. Se `false` quei check risultano "non verificabili" |
| `CHROMIUM_SANDBOX` | `false` | Sandbox di Chromium, da attivare in produzione con un container adatto |
| `CHROMIUM_EXECUTABLE_PATH` | | Facoltativo |

## Sicurezza del fetcher (SPEC sezione 5)

Ogni richiesta passa da `assertPublicUrl` (`apps/scanner/src/security/guard.ts`):

1. **URL**: solo `http`/`https`, solo porte 80 e 443, niente credenziali, niente hostname interni (`localhost`, `.local`, `.internal`, nomi senza punto).
2. **DNS**: tutti gli IP risolti devono essere unicast pubblici. Bloccati loopback, privati, link-local e metadata cloud (`169.254.0.0/16`), CGNAT, ULA IPv6, multicast, riservati, `0.0.0.0`, IPv4 incapsulati in IPv6 (`::ffff:`, NAT64, 6to4).
3. **Pinning**: `safeFetch` si connette all'IP appena validato, senza nuova risoluzione (difesa dal DNS rebinding). SNI e header `Host` restano quelli del dominio.
4. **Redirect**: gestiti a mano, max 5, ognuno ricontrollato dai punti 1 a 3.
5. **Limiti**: 5 MB per risposta (misurati dopo la decompressione), timeout per richiesta e timeout totale.

## Browser (SPEC sezione 5)

- Un Chromium condiviso, **contesto nuovo per ogni scansione** (nessun cookie o storage passa tra scansioni), download disattivati, service worker bloccati, nessun permesso, popup e dialog chiusi.
- **Ogni richiesta del browser è intercettata e servita da `safeFetch`**: stessi controlli anti SSRF, IP pinnato, limiti di dimensione e tempo. Il resolver DNS di Chromium è disattivato (`--host-resolver-rules`), quindi niente può uscire senza passare dall'intercettazione.
- I redirect non vengono mai restituiti al browser (Chromium li seguirebbe senza ripassare dall'intercettazione): li segue `safeFetch` ricontrollando ogni salto.
- Solo osservazione passiva: POST e beacon sono annotati ma **mai inoltrati**, WebSocket chiusi, nessun clic sul banner.
- Massimo 50 sottorisorse scaricate (immagini, font e media sono solo annotati), massimo 6 pagine legali, `robots.txt` rispettato per le pagine non principali.

## Misure (siti fixture locali, Chromium 158)

| Misura | Valore |
| --- | --- |
| Durata scansione completa | ~1,4 s (mediana), max ~1,5 s |
| Picco memoria totale (Node + Chromium) | ~600 MB (max 617 MB) |
| Chromium a riposo, browser già avviato | ~320 MB |

La memoria di Chromium è la somma dell'RSS dei suoi processi (sovrastima la memoria condivisa). Su siti reali i tempi crescono con la rete: il timeout totale resta `SCAN_TIMEOUT_MS`. Per il compose (Milestone 5) un `mem_limit` di almeno 1 GB per lo scanner è un punto di partenza ragionevole.

## Aggiornare le liste

- **Tracker, CDN e incorporamenti**: `packages/shared/src/trackers.ts` (domini, percorsi di invio dati, nomi dei cookie, parole chiave per la cookie policy).
- **Librerie vulnerabili**: `packages/shared/src/vulnerable-libs.ts` (prima versione corretta e advisory). Aggiorna anche `WORDPRESS_MIN_RECOMMENDED` a ogni rilascio maggiore di WordPress.
- **Catalogo dei check e fonti normative**: `packages/shared/src/catalog.ts`. Tutti i riferimenti normativi vanno riverificati prima della pubblicazione.

Dopo ogni modifica: `pnpm test && pnpm test:e2e`.

## Privacy dei dati di servizio

- Il rate limit salva solo `HMAC(IP + user agent)` e `HMAC(dominio)`, cancellati dopo 24 ore. Mai IP o URL in chiaro.
- Job e report solo in memoria, scadono dopo 60 minuti. L'URL viene tolto dal job appena la scansione finisce.
- I log contengono solo metodo, rotta, codice di stato ed esito aggregato.
