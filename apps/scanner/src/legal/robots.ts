import { robotsGroups } from "../checks/pubblico.js";

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/**
 * true se robots.txt consente all'agente di leggere il percorso.
 * Regola più specifica (più lunga) vince; a parità vince Allow (come Google).
 */
export function isAllowedByRobots(robots: string | null | undefined, pathAndQuery: string, agent = "semaforobot"): boolean {
  if (!robots) return true;
  const groups = robotsGroups(robots);
  const group =
    groups.find((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a))) ?? groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { length: number; allow: boolean } | undefined;
  const consider = (rules: string[], allow: boolean) => {
    for (const rule of rules) {
      if (!patternToRegExp(rule).test(pathAndQuery)) continue;
      const length = rule.length;
      if (!best || length > best.length || (length === best.length && allow)) best = { length, allow };
    }
  };
  consider(group.disallow, false);
  consider(group.allow, true);
  return best ? best.allow : true;
}
