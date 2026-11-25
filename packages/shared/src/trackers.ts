/**
 * Elenco dei domini tracker (analytics, pubblicità, pixel social).
 * Verrà popolato nella Milestone 3 (COOKIE-001).
 */
export interface TrackerDefinition {
  name: string;
  domains: string[];
  category: "analytics" | "ads" | "social" | "session-recording" | "other";
}

export const TRACKERS: readonly TrackerDefinition[] = [];
