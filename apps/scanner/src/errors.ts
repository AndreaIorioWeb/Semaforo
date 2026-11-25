import { ERROR_MESSAGES, type ErrorCode } from "@semaforo/shared";

const HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  INVALID_BODY: 400,
  INVALID_URL: 400,
  URL_SCHEME: 400,
  URL_PORT: 400,
  URL_CREDENTIALS: 400,
  URL_BLOCKED: 400,
  DNS_FAILED: 400,
  TOO_MANY_REDIRECTS: 502,
  RESPONSE_TOO_LARGE: 502,
  TIMEOUT: 504,
  FETCH_FAILED: 502,
  RATE_LIMITED: 429,
  GLOBAL_RATE_LIMITED: 429,
  QUEUE_FULL: 503,
  JOB_NOT_FOUND: 404,
  INTERNAL: 500,
};

/** Errore con codice stabile e messaggio in italiano pronto per l'utente. */
export class ScanError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, options?: { cause?: unknown }) {
    super(ERROR_MESSAGES[code], options);
    this.name = "ScanError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code] ?? 500;
  }
}

export function isScanError(err: unknown): err is ScanError {
  return err instanceof ScanError;
}
