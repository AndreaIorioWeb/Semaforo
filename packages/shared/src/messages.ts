/** Messaggi di errore per l'utente, in italiano, senza dettagli tecnici interni. */
export const ERROR_MESSAGES = {
  INVALID_BODY: "La richiesta non è valida. Controlla i dati inseriti e riprova.",
  INVALID_URL: "L'indirizzo inserito non sembra valido. Scrivi solo il dominio, ad esempio miosito.it.",
  URL_SCHEME: "Puoi analizzare solo siti che iniziano con http:// o https://.",
  URL_PORT: "Puoi analizzare solo siti sulle porte standard (80 o 443).",
  URL_CREDENTIALS: "L'indirizzo non può contenere nome utente o password.",
  URL_BLOCKED: "Questo indirizzo non può essere analizzato perché non è un sito pubblico.",
  DNS_FAILED: "Non riesco a trovare questo dominio. Controlla di averlo scritto correttamente.",
  TOO_MANY_REDIRECTS: "Il sito fa troppi reindirizzamenti, non riesco a raggiungere la pagina finale.",
  RESPONSE_TOO_LARGE: "La pagina è troppo grande per essere analizzata.",
  TIMEOUT: "Il sito ha impiegato troppo tempo a rispondere.",
  FETCH_FAILED: "Non riesco a collegarmi al sito. Potrebbe essere offline.",
  RATE_LIMITED:
    "Hai raggiunto il limite giornaliero di siti analizzabili. Puoi rianalizzare gli stessi siti di oggi oppure riprovare domani.",
  GLOBAL_RATE_LIMITED: "In questo momento ci sono troppe richieste. Riprova tra qualche minuto.",
  QUEUE_FULL: "Il servizio è occupato, riprova tra poco.",
  JOB_NOT_FOUND: "Questa analisi non esiste o è scaduta. Puoi avviarne una nuova.",
  LEAD_INVALID: "Controlla i campi del modulo: nome ed email sono obbligatori.",
  LEAD_CONSENT: "Per inviare la richiesta devi dichiarare di aver letto l'informativa privacy.",
  LEAD_RATE_LIMITED: "Hai già inviato diverse richieste oggi. Ti risponderò al più presto.",
  PDF_UNAVAILABLE: "Il PDF non è disponibile in questo momento. Riprova tra poco.",
  INTERNAL: "Si è verificato un errore imprevisto. Riprova tra poco.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;
