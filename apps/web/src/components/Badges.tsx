import { RISK_LABELS, type Risk, type Status, STATUS_LABELS } from "@semaforo/shared";
import { RiskLight, StatusIcon } from "./Icon";

export const STATUS_CLASSES: Record<Status, string> = {
  ko: "bg-high-soft text-high-text",
  warn: "bg-medium-soft text-medium-text",
  ok: "bg-low-soft text-low-text",
  unverifiable: "bg-neutral-soft text-neutral-text",
};

export const RISK_TEXT: Record<Risk, string> = {
  high: "text-high-text",
  medium: "text-medium-text",
  low: "text-low-text",
};

export const RISK_BG: Record<Risk, string> = {
  high: "bg-high-soft",
  medium: "bg-medium-soft",
  low: "bg-low-soft",
};

/** Stato con forma dell'icona + testo: mai solo colore. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold ${STATUS_CLASSES[status]}`}>
      <StatusIcon status={status} size={16} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function RiskBadge({ risk, size = "md" }: { risk: Risk; size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${RISK_TEXT[risk]} ${big ? "text-2xl" : "text-base"}`}>
      <RiskLight risk={risk} size={big ? 40 : 22} />
      {RISK_LABELS[risk].label}
    </span>
  );
}
