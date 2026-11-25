import { checkDefinition, type Finding, type Severity, type Status } from "@semaforo/shared";
import type { ScanContext } from "../scan/context.js";

/** Ogni check è un modulo isolato e puro: run(ctx) → Finding[] (SPEC sezione 6). */
export interface Check {
  id: string;
  run(ctx: ScanContext): Finding[];
}

export interface FindingInput {
  status: Status;
  severity: Severity;
  explanation: string;
  howToFix: string;
  evidence?: string[];
  /** Titolo alternativo, se diverso da quello del catalogo. */
  title?: string;
}

/** Crea un finding prendendo categoria, titolo, fonte e ambito dal catalogo. */
export function finding(id: string, input: FindingInput): Finding {
  const def = checkDefinition(id);
  const evidence = input.evidence?.filter((e) => e.length > 0).slice(0, 10);
  return {
    id,
    category: def.category,
    title: input.title ?? def.title,
    status: input.status,
    severity: input.severity,
    explanation: input.explanation,
    ...(def.legalRef ? { legalRef: def.legalRef } : {}),
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
    howToFix: input.howToFix,
    appliesTo: def.appliesTo,
  };
}

/** Accorcia un testo per l'evidenza. */
export function snippet(s: string, max = 120): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
