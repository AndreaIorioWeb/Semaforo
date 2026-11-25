# Semaforo

> Il controllo gratuito del tuo sito.

Scanner pubblico di conformità e qualità per siti web italiani (privacy, cookie, dati aziendali, vendita online, prontezza pubblica, sicurezza di base). Specifica completa in `SPEC.md`.

**Stato:** Milestone 1 (fondamenta). La scansione è **simulata**: nessun check reale sul sito, nessuna UI.

## Struttura

```
apps/scanner      Servizio Node (Fastify): API, anti SSRF, rate limit, coda, SSE
packages/shared   Tipi, schemi Zod, messaggi di errore in italiano
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
| `pnpm test` | Tutti i test (Vitest) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript senza emissione |
| `pnpm build` | Compila `packages/shared` e `apps/scanner` in `dist/` |
| `pnpm --filter @semaforo/scanner start` | Avvia la build compilata |

## API (Milestone 1)

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

## Sicurezza del fetcher (SPEC sezione 5)

Ogni richiesta passa da `assertPublicUrl` (`apps/scanner/src/security/guard.ts`):

1. **URL**: solo `http`/`https`, solo porte 80 e 443, niente credenziali, niente hostname interni (`localhost`, `.local`, `.internal`, nomi senza punto).
2. **DNS**: tutti gli IP risolti devono essere unicast pubblici. Bloccati loopback, privati, link-local e metadata cloud (`169.254.0.0/16`), CGNAT, ULA IPv6, multicast, riservati, `0.0.0.0`, IPv4 incapsulati in IPv6 (`::ffff:`, NAT64, 6to4).
3. **Pinning**: `safeFetch` si connette all'IP appena validato, senza nuova risoluzione (difesa dal DNS rebinding). SNI e header `Host` restano quelli del dominio.
4. **Redirect**: gestiti a mano, max 5, ognuno ricontrollato dai punti 1 a 3.
5. **Limiti**: 5 MB per risposta (misurati dopo la decompressione), timeout per richiesta e timeout totale.

## Privacy dei dati di servizio

- Il rate limit salva solo `HMAC(IP + user agent)` e `HMAC(dominio)`, cancellati dopo 24 ore. Mai IP o URL in chiaro.
- Job e report solo in memoria, scadono dopo 60 minuti. L'URL viene tolto dal job appena la scansione finisce.
- I log contengono solo metodo, rotta, codice di stato ed esito aggregato.
