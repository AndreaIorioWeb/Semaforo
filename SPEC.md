# SPEC: Scanner pubblico di conformità e qualità per siti web italiani

Documento di specifica da dare a Claude Code. Lavora per milestone (sezione 14), proponi un piano prima di scrivere codice, scrivi test per ogni check, non passare alla milestone successiva se i test non passano.

Nome del progetto: **Semaforo** (tagline: "Il controllo gratuito del tuo sito"). Dominio: sottodominio del dominio dell'autore, `semaforo.{{DOMINIO}}` (il dominio va fornito dall'autore, non inventarlo).

Identità visiva: il livello di rischio del report usa la metafora del semaforo (rosso = Alto, giallo = Medio, verde = Basso). Non affidare mai il significato al solo colore: ogni stato ha anche icona e testo (accessibilità).

---

## 1. Obiettivo e posizionamento

Strumento web gratuito e pubblico: l'utente inserisce l'URL di un sito, in circa 30-60 secondi riceve un report con problemi di privacy, cookie, dati aziendali, vendita online, "prontezza pubblica" e sicurezza di base. Ogni problema ha: spiegazione in parole semplici, riferimento normativo, evidenza trovata e un **prompt pronto da incollare in un assistente AI** per risolverlo.

Scopo di business per l'autore (sviluppatore web freelance, WordPress custom in PHP):
- **Lead magnet:** dal report parte una CTA "Vuoi che lo sistemi io?" con form di contatto.
- **Credibilità:** dimostra competenza su conformità e qualità tecnica.
- Possibile evoluzione futura: report white-label, monitoraggio periodico a canone.

Esiste già un prodotto simile (InRegola). Questo progetto deve essere **originale**: nome, testi, grafica, logo e struttura delle pagine NON vanno copiati. Le idee funzionali (tipi di controlli) sono lecite, la loro espressione no. Differenziatori da implementare:
1. Prompt di correzione **adattati al CMS rilevato** (WordPress con snippet PHP/hook, Shopify, Wix, Next.js, ecc.).
2. Rilevamento CMS/tecnologie e consigli specifici.
3. CTA commerciale verso l'autore (form lead).
4. Pagina "Metodologia" trasparente con elenco controlli e fonti.

Disclaimer obbligatorio ovunque: strumento automatico, risultati indicativi, non è consulenza legale né certificazione, non sostituisce un professionista.

---

## 2. Stack tecnico

Monorepo (pnpm workspaces), TypeScript ovunque.

- `apps/web`: Next.js (App Router) + Tailwind CSS. Font **self-hosted** (nessun CDN esterno), zero cookie, zero tracker, nessuno script di terze parti.
- `apps/scanner`: servizio Node (Fastify) con Playwright (Chromium headless) e i moduli di check.
- `packages/shared`: tipi condivisi (Finding, Report, ScanRequest), schema Zod, elenco domini tracker.
- Persistenza minima: SQLite (better-sqlite3) solo per rate limit (fingerprint hash con TTL 24h) e lead. **Nessuna persistenza di URL analizzati né di report** (report in memoria con TTL 60 min).
- Coda: in memoria (concorrenza configurabile, default 1), max 10 job in attesa, poi risposta "servizio occupato, riprova tra poco".
- Deploy: Docker Compose su VPS Hostinger esistente (condiviso con n8n), nginx reverse proxy, certbot, sottodominio dedicato. Immagine base Playwright ufficiale. Limiti risorse nel compose (`mem_limit`, `cpus`) per non affamare n8n.

Variabili d'ambiente (`.env.example`): `RATE_LIMIT_PER_DAY=2`, `SCAN_CONCURRENCY=1`, `SCAN_TIMEOUT_MS=60000`, `FINGERPRINT_SALT`, `SMTP_*` (solo per lead), `PAGESPEED_API_KEY` (opzionale), `PUBLIC_BASE_URL`.

---

## 3. Pagine e UX

Mobile first, accessibile (WCAG 2.1 AA), contrasto verificato, focus visibile, skip link, `lang="it"`.

**`/` Home**
- Hero: titolo di valore, sottotitolo con promessa di tempo, form (prefisso `https://` fisso + campo dominio + pulsante).
- Domanda tipo sito: "Vende online a privati?" con opzioni Sì / No (vetrina) / Rileva automaticamente (default).
- Note sotto il form: gratuito, nessuna registrazione, nessun cookie, siti analizzati non salvati, limite giornaliero.
- Sezione "Cosa controlla" (5 categorie), "Come funziona" (3 passi), report di esempio (finto, di un sito inventato), FAQ, footer con disclaimer.

**`/analisi/[jobId]` Avanzamento e report**
- Stato in tempo reale (SSE) con passi leggibili: "Apro il sito come un nuovo visitatore", "Leggo le pagine legali", "Controllo la sicurezza di base", ecc.
- Report: riepilogo (livello di rischio Basso/Medio/Alto + conteggi), filtri a schede (Da sistemare / Tutti / In regola / Non verificabile), card per finding, pulsante "Copia prompt", pulsante "Scarica PDF", CTA "Fai sistemare a un professionista" (apre form lead), pulsante "Controlla un altro sito".
- Se il job è scaduto: messaggio chiaro e invito a rilanciare.

**`/metodologia`** elenco di tutti i check con ID, cosa verifica, fonte normativa, limiti. Dichiara cosa NON si può verificare automaticamente.

**`/privacy`** informativa del tool stesso (art. 13 GDPR), coerente col comportamento reale.

**`/contatti`** form lead (vedi 9).

Direzione visiva: sobria, rassicurante, "da studio professionale ma umano". Palette calda neutra con un solo colore di accento, tipografia leggibile, molta aria, nessun effetto gratuito. Usare la skill di frontend design se disponibile e scegliere identità propria, diversa da qualsiasi competitor.

---

## 4. API

- `POST /api/scan` body `{ url, siteType: "shop" | "showcase" | "auto" }` → `{ jobId }` oppure errore (429 limite, 400 URL non valido o bloccato, 503 coda piena).
- `GET /api/scan/:jobId/events` SSE con eventi `progress`, `done`, `error`.
- `GET /api/scan/:jobId` report JSON (finché non scade).
- `GET /api/scan/:jobId/pdf` report in PDF.
- `POST /api/lead` form contatto (con consenso esplicito).
- `GET /api/health`.

Validazione con Zod. Risposte errore con messaggi in italiano pensati per l'utente.

---

## 5. Sicurezza del servizio (priorità alta, è un fetcher pubblico)

Questo è il rischio principale: chiunque può far fare richieste al nostro server.

- **Anti SSRF:** risolvere il DNS prima di ogni richiesta e rifiutare IP privati, loopback, link-local, metadata cloud (`169.254.0.0/16`), ULA IPv6, `0.0.0.0`, ecc. Ripetere il controllo a **ogni redirect** e su ogni sottorichiesta del browser (intercettazione route di Playwright). Difendersi dal DNS rebinding (usare l'IP risolto per la connessione).
- Solo schemi `http`/`https`, solo porte 80 e 443. Niente credenziali nell'URL.
- Limiti: max 5 redirect, max dimensione risposta (es. 5 MB per pagina), timeout per richiesta e timeout totale scan, max 6 pagine legali lette, max 50 richieste di sottorisorse rilevanti.
- Playwright: contesto isolato nuovo per ogni scan, downloads disabilitati, service worker bloccati, nessun permesso (geolocalizzazione, notifiche), user agent dichiarato e identificabile (es. `SemaforoBot/1.0 (+URL pagina informativa)`), rispetto di `robots.txt` per la lettura delle pagine non principali.
- Solo controlli **passivi**: nessun tentativo di accesso, nessuna richiesta a percorsi sensibili per "provare" (niente probing di `.env`, `.git`, `wp-admin`, backup). Si guarda ciò che vede un visitatore. Eccezioni consentite: `robots.txt`, `sitemap.xml`, `/.well-known/security.txt`.
- Eventuali chiavi/segreti trovati nel codice pubblico: **mostrare sempre mascherati** (primi 4 e ultimi 2 caratteri), mai salvarli.
- Rate limit: default **2 siti/giorno** per visitatore (configurabile), con possibilità di rianalizzare lo stesso sito nella giornata per verificare le correzioni (non consuma quota). Fingerprint = HMAC(IP + user agent, salt) conservato 24h, mai l'IP in chiaro. Limite globale aggiuntivo anti abuso (scansioni totali/ora) e protezione da bot (es. Cloudflare Turnstile opzionale, valutare impatto privacy).
- Logging: nessun URL scansito nei log applicativi; solo metriche aggregate (conteggio, durata, esito).
- Header di sicurezza sul nostro sito (CSP restrittiva, HSTS, ecc.).

---

## 6. Pipeline di scansione

1. Normalizza e valida URL, applica anti SSRF, rate limit.
2. **Fetch iniziale** (HTTP): header, redirect, certificato TLS, HTML grezzo.
3. **Browser**: apri la home in contesto pulito **senza interagire col banner cookie**. Registra: cookie impostati, richieste di rete verso domini terzi, storage, banner rilevato (testo, pulsanti, presenza e prominenza di "Rifiuta"). Attendi idle di rete con tetto massimo.
4. **Scoperta pagine legali**: dai link di footer/menu e da pattern (privacy, cookie, termini, condizioni di vendita, recesso, note legali, contatti). Scarica e analizza (testo).
5. **Rilevamento tecnologie/CMS** (WordPress via meta generator, percorsi `wp-content`, ecc.; Shopify; Wix; Squarespace; Webflow; Next.js; Joomla; PrestaShop; WooCommerce).
6. **Rilevamento tipo sito** se `auto`: indizi di e-commerce (carrello, checkout, prezzi, schema.org Product/Offer, WooCommerce/Shopify).
7. **Check DNS** per dominio email: SPF, DMARC (e opzionalmente DKIM selector comuni).
8. Esegui tutti i check, produci finding.
9. Calcola rischio, genera prompt per finding, chiudi job.

Ogni check è un modulo isolato con interfaccia `run(ctx): Finding[]`, con test su fixture HTML.

---

## 7. Modello dati

```ts
type Status = "ko" | "warn" | "ok" | "unverifiable";
type Severity = "high" | "medium" | "low" | "info";

interface Finding {
  id: string;              // es. "COOKIE-001"
  category: "privacy" | "cookie" | "azienda" | "vendita" | "pubblico" | "sicurezza";
  title: string;           // breve, in italiano
  status: Status;
  severity: Severity;
  explanation: string;     // parole semplici, 2-3 frasi
  legalRef?: string;       // es. "Provv. Garante 10/06/2021"
  evidence?: string[];     // URL, nomi cookie, snippet mascherati
  howToFix: string;        // passi concreti
  fixPrompt?: string;      // prompt copiabile, con [PLACEHOLDER] per dati utente
  appliesTo: "all" | "shop";
}

interface Report {
  jobId: string;
  scannedAt: string;
  siteType: "shop" | "showcase";
  cms?: string;
  risk: "low" | "medium" | "high";
  findings: Finding[];
  unverifiable: string[];  // cosa un controllo automatico non può vedere
  expiresAt: string;
}
```

Rischio: pesi per severità sui finding `ko` e `warn`. Soglie documentate in `/metodologia` e coperte da test.

---

## 8. Catalogo dei check (versione iniziale)

Tutti i riferimenti normativi vanno **riverificati** dall'autore prima della pubblicazione (norme e provvedimenti cambiano). Ogni check cita la fonte in `legalRef`.

### Cookie e tracciamento
- **COOKIE-001** Tracker/cookie non tecnici attivi **prima** del consenso (analytics, pubblicità, pixel social). Lista domini in `packages/shared/trackers.ts` (Google Analytics/Tag Manager, Meta Pixel, TikTok, Hotjar, Clarity, LinkedIn, ecc.). Gravità alta. Fonte: art. 122 Codice Privacy, Linee guida cookie del Garante (10/06/2021).
- **COOKIE-002** Banner assente pur con tracker rilevati.
- **COOKIE-003** Presenza di pulsante "Rifiuta" o chiusura equivalente allo stesso livello dell'accettazione (stessa prominenza visiva, euristica su dimensioni/stile).
- **COOKIE-004** Scelta per categoria/finalità disponibile.
- **COOKIE-005** Cookie policy presente e coerente con servizi rilevati (confronto domini rilevati vs testo).
- **COOKIE-006** Font o risorse da CDN esterni che trasmettono l'IP (es. Google Fonts caricati da `fonts.googleapis.com`): warning, suggerire self-hosting.
- **COOKIE-007** Incorporamenti terzi (YouTube, Maps, ecc.) senza blocco preventivo.

### Privacy
- **PRIV-001** Informativa privacy raggiungibile da home (link in footer).
- **PRIV-002** Completezza minima art. 13 GDPR: titolare, contatti, finalità, basi giuridiche, destinatari, tempi di conservazione, diritti, reclamo al Garante, eventuali trasferimenti extra UE. Verifica per parole chiave, esito `warn` se mancano elementi, mai `ok` assoluto.
- **PRIV-003** Riferimenti normativi obsoleti (es. citazione di normativa abrogata come Dir. 95/46/CE o vecchio D.Lgs. 196/2003 non aggiornato).
- **PRIV-004** Form di contatto/newsletter: link all'informativa vicino al form, caselle di consenso **non preselezionate**.
- **PRIV-005** Checkbox marketing separata dal consenso al trattamento per la richiesta.

### Dati aziendali
- **AZ-001** Partita IVA in home/footer (formato 11 cifre, controllo cifra di controllo). Fonte: art. 7 D.Lgs. 70/2003, art. 35 DPR 633/72.
- **AZ-002** Ragione sociale/denominazione e sede (indirizzo). Per società: art. 2250 c.c.
- **AZ-003** Per società di capitali: numero REA, ufficio registro imprese, capitale sociale, eventuale stato di liquidazione/socio unico.
- **AZ-004** Contatti raggiungibili (email o PEC, telefono se presente).
- **AZ-005** Se professioni regolamentate: ordine/albo, numero iscrizione (warn informativo).

### Vendita online (solo se `shop`)
- **VEND-001** Condizioni generali di vendita raggiungibili. Fonte: Codice del Consumo (D.Lgs. 206/2005), art. 49.
- **VEND-002** Informazioni sul diritto di recesso (14 giorni) e modulo/istruzioni.
- **VEND-003** Funzione di recesso online ("pulsante di recesso"): **verificare con fonte aggiornata** lo stato del recepimento italiano della Dir. (UE) 2023/2673 (applicabile dal 19/06/2026) prima di renderlo `ko`; fino ad allora `warn` informativo.
- **VEND-004** Garanzia legale di conformità (24 mesi) citata.
- **VEND-005** Spese e tempi di spedizione, prezzi con indicazione delle imposte.
- **VEND-006** Riferimenti obsoleti: link alla piattaforma ODR europea (dismessa), da segnalare come da rimuovere (**verificare data e fonte** prima del rilascio).
- **VEND-007** Metodi di pagamento e sicurezza dichiarati, informazioni sul venditore coerenti con AZ-*.

### Prontezza pubblica
- **PUB-001** Sito nascosto ai motori di ricerca (meta `noindex`, header `X-Robots-Tag`, `Disallow: /` in robots.txt).
- **PUB-002** Titoli/descrizioni residui di generatori (es. "Create Next App", "Vite + React", "Just another WordPress site", "Sample Page").
- **PUB-003** Testo segnaposto (lorem ipsum, "Titolo qui", "example.com", "TODO").
- **PUB-004** Accessibilità di base: `lang` sulla pagina, `alt` sulle immagini, label sui campi form, gerarchia titoli, un solo `h1`, contrasto grossolano. Nota: esito indicativo, non una verifica completa di accessibilità (riferimento: European Accessibility Act / D.Lgs. 82/2022 per i soggetti obbligati, da verificare l'ambito).
- **PUB-005** Meta tag essenziali (title, description, viewport, Open Graph), favicon, 404 gestita.
- **PUB-006** Sitemap e robots.txt presenti e coerenti.
- **PUB-007** (opzionale) Performance di base via PageSpeed Insights API (non eseguire Lighthouse in locale sul VPS).

### Sicurezza di base
- **SEC-001** HTTPS attivo, redirect da http, certificato valido e non in scadenza (soglia 14 giorni).
- **SEC-002** Header: HSTS, CSP, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy. `warn` per mancanza, mai `ko`.
- **SEC-003** SPF e DMARC sul dominio (anti spoofing email); DMARC con policy `none` = warn.
- **SEC-004** Chiavi/segreti esposti nel codice pubblico (pattern per Stripe secret `sk_live_`, AWS, Google API key con contesto, token generici, chiavi private). Gravità alta, evidenza **mascherata**.
- **SEC-005** Librerie JS vecchie con vulnerabilità note (confronto versioni rilevate con elenco curato, es. jQuery molto vecchie).
- **SEC-006** WordPress: versione esposta e obsoleta, `readme.html` pubblico, generator meta, plugin con versioni visibili nei percorsi asset (solo ciò che è già pubblico).
- **SEC-007** Promemoria (non verificabili da fuori) per Supabase/Firebase: controllare regole di accesso/RLS. Stato `unverifiable`.
- **SEC-008** Contenuto misto (risorse http in pagina https).

### Cosa non si può verificare (sezione fissa nel report)
Comportamento dopo l'accettazione dei cookie, carrello e checkout, registro dei trattamenti, nomine a responsabile, contratti con fornitori, sicurezza di server e database, misure organizzative. Un esito positivo non è una certificazione.

---

## 9. Prompt di correzione (`fixPrompt`)

Per ogni finding `ko` o `warn`, genera un prompt in italiano, autosufficiente, che l'utente può incollare in un assistente AI. Regole:
- Spiega il problema, il contesto (CMS rilevato, URL, evidenze) e il risultato atteso.
- **Non inventa dati**: dove servono informazioni dell'utente (ragione sociale, P.IVA, indirizzo, ecc.) inserisce `[PLACEHOLDER: descrizione]`.
- Chiede all'AI di spiegare i passi e di segnalare cosa richiede revisione di un professionista.
- Varianti per CMS: WordPress (suggerire hook/snippet `functions.php` o plugin, mai modifiche al core), Shopify, Wix/Squarespace (impostazioni dell'editor), sito custom (HTML/JS).
- Sempre una riga finale: "Le indicazioni legali vanno verificate con un professionista".

Pulsante "Copia prompt" con feedback visivo. Opzione "Copia tutti i prompt dei problemi aperti" (un unico prompt ordinato per gravità).

---

## 10. Lead e CTA commerciale

- Form: nome, email, sito (precompilato se disponibile), messaggio facoltativo, **checkbox di consenso esplicita non preselezionata** con link all'informativa.
- Invio email all'autore via SMTP; salvataggio lead su SQLite con data e consenso, retention dichiarata (es. 12 mesi).
- Il report NON viene allegato né salvato senza consenso. Se si vuole inviare il report via email, farlo come funzione separata con consenso dedicato.
- Nessuna iscrizione automatica a newsletter.

---

## 11. Privacy del tool (deve superare il proprio controllo)

- Nessun cookie, nessun analytics di terze parti, font self-hosted, nessuna risorsa esterna. Se si vogliono metriche: solo contatori aggregati lato server.
- Informativa `/privacy` che descrive: fingerprint hash 24h per limite giornaliero, URL non salvati, lead con consenso, base giuridica, titolare (dati dell'autore come `[PLACEHOLDER]`), diritti, contatti.
- Dogfooding: il sito del tool, analizzato dal tool stesso, deve risultare senza problemi `ko`. Criterio di accettazione.

---

## 12. Test

- Unit test per ogni check con fixture HTML (casi ok, ko, ambigui).
- Test SSRF obbligatori: `localhost`, `127.0.0.1`, `[::1]`, `169.254.169.254`, IP privati, redirect verso IP interni, DNS che risolve a IP privato, URL con credenziali, porte non standard, schemi `file://` e `gopher://`.
- Test rate limit (limite, reset 24h, rianalisi dello stesso sito).
- Test e2e (Playwright) del flusso completo contro un sito fixture locale.
- Test sul calcolo del rischio e sulla generazione dei prompt (placeholder presenti, nessun dato inventato).
- Lint, typecheck e CI su GitHub Actions.

---

## 13. Deploy e operatività

- `docker-compose.yml`: servizi `web`, `scanner`, rete interna, volume nominato per SQLite (attenzione: usare **volumi nominati** per non perdere dati), healthcheck, restart policy, limiti risorse.
- nginx: reverse proxy, TLS con certbot, rate limit a livello nginx, timeout adeguati per SSE (`proxy_buffering off`).
- Script di backup del DB lead.
- README con setup locale, variabili d'ambiente, comandi di deploy, procedura di aggiornamento delle liste (tracker, librerie vulnerabili).
- Monitoraggio uptime esterno e alert su Telegram (via n8n già presente).

---

## 14. Milestone

1. **Fondamenta:** monorepo, fetcher sicuro anti SSRF con test, validazione URL, rate limit, API base, SSE finto.
2. **Check statici:** AZ, PRIV, PUB, SEC (senza browser), rilevamento CMS e tipo sito, calcolo rischio.
3. **Browser:** Playwright, COOKIE-*, rilevamento tracker pre-consenso, pagine legali.
4. **UI:** home, avanzamento SSE, report con filtri, prompt copiabili, PDF, metodologia, privacy, form lead.
5. **Rifinitura e rilascio:** dogfooding, accessibilità, Docker, nginx, deploy su sottodominio, monitoraggio.

Per ogni milestone: elenco file toccati, come testare, cosa resta aperto.

---

## 15. Fuori scope (per ora)

Account utente, pagamenti, storico dei report, monitoraggio periodico, report white-label, scansioni autenticate o dietro login, controlli attivi di vulnerabilità, qualsiasi giudizio legale vincolante.

---

## 16. Decisioni aperte (da chiedere all'autore prima di partire)

1. Dominio definitivo su cui creare il sottodominio `semaforo.` (nome progetto già deciso: Semaforo). Verificare prima che il nome non confligga con marchi o servizi esistenti.
2. Limite giornaliero (2 consigliato) e uso o meno di Turnstile anti bot.
3. Dati del titolare per informativa e footer.
4. Se salvare i lead e per quanto tempo.
5. Se inviare il report via email (richiede consenso e funzione separata).
6. Stato aggiornato della normativa su VEND-003 e VEND-006 (da verificare con fonti ufficiali).
