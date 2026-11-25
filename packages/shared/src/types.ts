export type Status = "ko" | "warn" | "ok" | "unverifiable";
export type Severity = "high" | "medium" | "low" | "info";
export type Category = "privacy" | "cookie" | "azienda" | "vendita" | "pubblico" | "sicurezza";
export type SiteTypeInput = "shop" | "showcase" | "auto";
export type SiteType = "shop" | "showcase";
export type Risk = "low" | "medium" | "high";

export interface Finding {
  /** es. "COOKIE-001" */
  id: string;
  category: Category;
  /** breve, in italiano */
  title: string;
  status: Status;
  severity: Severity;
  /** parole semplici, 2-3 frasi */
  explanation: string;
  /** es. "Provv. Garante 10/06/2021" */
  legalRef?: string;
  /** URL, nomi cookie, snippet mascherati */
  evidence?: string[];
  /** passi concreti */
  howToFix: string;
  /** prompt copiabile, con [PLACEHOLDER] per dati utente */
  fixPrompt?: string;
  appliesTo: "all" | "shop";
}

export interface Report {
  jobId: string;
  scannedAt: string;
  siteType: SiteType;
  cms?: string;
  risk: Risk;
  findings: Finding[];
  /** cosa un controllo automatico non può vedere */
  unverifiable: string[];
  expiresAt: string;
}

export interface ScanRequest {
  url: string;
  siteType: SiteTypeInput;
}

export type ScanEventType = "progress" | "done" | "error";

export interface ProgressEvent {
  step: string;
  label: string;
  index: number;
  total: number;
}

export interface ErrorEvent {
  code: string;
  message: string;
}

export type JobState = "queued" | "running" | "done" | "error";
