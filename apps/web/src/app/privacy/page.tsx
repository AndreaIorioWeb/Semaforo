import type { Metadata } from "next";
import { DEFAULT_LEAD_RETENTION_HOURS, PRIVACY_VERSION } from "@semaforo/shared";
import { dailyLimit, getOwner } from "@/lib/owner";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Come Semaforo tratta i dati: nessun cookie, nessun tracciamento, siti analizzati non salvati.",
};

/**
 * Informativa ai sensi dell'art. 13 del Reg. (UE) 2016/679 (GDPR), coerente con il comportamento reale del servizio.
 * I dati del titolare e dei fornitori sono [PLACEHOLDER] finché non vengono configurati.
 */
export default function PrivacyPage() {
  const owner = getOwner();
  const retention = Number(process.env.LEAD_RETENTION_HOURS) || DEFAULT_LEAD_RETENTION_HOURS;
  const date = new Date(PRIVACY_VERSION).toLocaleDateString("it-IT", { dateStyle: "long" });
  return (
    <div className="container-page py-12">
      <article className="prose-legal max-w-3xl">
        <p className="eyebrow">Informativa</p>
        <h1 className="mt-2 text-4xl">Privacy policy</h1>
        <p className="mt-4 text-lg text-ink-muted">
          Informativa sul trattamento dei dati personali ai sensi dell&apos;art. 13 del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 196/2003 come modificato dal D.Lgs.
          101/2018. Ultimo aggiornamento: {date}.
        </p>

        <h2>In breve</h2>
        <ul>
          <li>Il sito non usa cookie, né tecnici né di profilazione, e nessun sistema di statistica o tracciamento di terze parti.</li>
          <li>Font e risorse sono ospitati sul nostro server: la tua visita non viene comunicata a terzi.</li>
          <li>Gli indirizzi dei siti che analizzi e i report non vengono salvati: restano in memoria per 60 minuti e poi vengono cancellati.</li>
          <li>Se ci scrivi dal modulo contatti, la richiesta resta nel database del servizio al massimo {retention} ore.</li>
        </ul>

        <h2>Titolare del trattamento</h2>
        <p>
          Il titolare del trattamento è {owner.name}, {owner.address}, P.IVA {owner.vat}. Contatti: <a href={`mailto:${owner.email}`}>{owner.email}</a>
          {owner.pec ? `, PEC ${owner.pec}` : ""}.
        </p>

        <h2>Quali dati trattiamo, per quali finalità e con quale base giuridica</h2>
        <p><strong>1. Analisi di un sito.</strong> Quando avvii un controllo trattiamo l&apos;indirizzo del sito indicato e il contenuto pubblico delle sue pagine, che può includere dati personali pubblicati dal sito stesso (ad esempio nome e contatti del titolare). La finalità è produrre il report che hai richiesto; la base giuridica è l&apos;esecuzione del servizio da te richiesto (art. 6, par. 1, lett. b GDPR). Indirizzo e report restano solo in memoria e vengono cancellati dopo 60 minuti.</p>
        <p><strong>2. Limite giornaliero e prevenzione degli abusi.</strong> Per applicare il limite di {dailyLimit()} siti diversi al giorno calcoliamo un codice cifrato e non reversibile (HMAC) a partire dall&apos;indirizzo IP e dal tipo di browser, insieme a un codice cifrato del dominio analizzato. Non conserviamo l&apos;indirizzo IP né l&apos;indirizzo del sito in chiaro. La base giuridica è il legittimo interesse a proteggere il servizio da abusi (art. 6, par. 1, lett. f GDPR). I codici vengono cancellati dopo 24 ore.</p>
        <p><strong>3. Richieste dal modulo contatti.</strong> Trattiamo nome, email, sito ed eventuale messaggio per risponderti. La base giuridica è l&apos;esecuzione di misure precontrattuali adottate su tua richiesta (art. 6, par. 1, lett. b GDPR). Il report non viene allegato né salvato. Non ti iscriviamo ad alcuna newsletter.</p>
        <p><strong>4. Log tecnici.</strong> Il server registra solo dati aggregati (numero di analisi, durata, esito), senza indirizzi IP né indirizzi dei siti analizzati.</p>

        <h2>Conservazione</h2>
        <ul>
          <li>Indirizzo del sito e report: 60 minuti, solo in memoria.</li>
          <li>Codici per il limite giornaliero: 24 ore.</li>
          <li>Richieste dal modulo contatti: al massimo {retention} ore nel database del servizio, il tempo per inoltrarle via email al titolare. La copia ricevuta via email è conservata dal titolare per il tempo necessario a gestire la richiesta e, se segue un incarico, secondo gli obblighi di legge.</li>
        </ul>

        <h2>Destinatari</h2>
        <p>I dati sono trattati dal titolare e dai fornitori che lo supportano, nominati responsabili del trattamento: il fornitore del server ([PLACEHOLDER: nome del fornitore di hosting]) e il fornitore del servizio email ([PLACEHOLDER: nome del provider SMTP]). I dati non sono diffusi né venduti.</p>

        <h2>Trasferimenti fuori dall&apos;Unione europea</h2>
        <p>[PLACEHOLDER: verificare la sede dei server e del provider email.] Se i dati fossero trattati da fornitori in paesi terzi extra UE, il trasferimento avverrebbe solo con le garanzie previste dagli artt. 44 e seguenti del GDPR.</p>

        <h2>Conferimento dei dati</h2>
        <p>Per usare il controllo non devi fornire dati personali. Nel modulo contatti nome ed email sono necessari per risponderti; senza, non possiamo dare seguito alla richiesta.</p>

        <h2>I tuoi diritti (diritti dell&apos;interessato)</h2>
        <p>Puoi chiedere in ogni momento l&apos;accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilità e opporti al trattamento basato sul legittimo interesse (artt. 15-22 GDPR), scrivendo a <a href={`mailto:${owner.email}`}>{owner.email}</a>. Considera che molti dati vengono cancellati automaticamente in poche ore.</p>
        <p>Hai inoltre il diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).</p>

        <h2>Cookie</h2>
        <p>Questo sito non usa cookie né tecnologie simili (come local storage) per tracciare i visitatori. Per questo non trovi alcun banner.</p>

        <h2>Come si presenta Semaforo ai siti analizzati</h2>
        <p>Durante l&apos;analisi Semaforo si identifica come SemaforoBot, guarda solo le pagine pubbliche, non invia moduli e rispetta il file robots.txt per le pagine diverse dalla home.</p>
      </article>
    </div>
  );
}
