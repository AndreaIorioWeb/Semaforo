import { lookup } from "node:dns/promises";
import { ScanError } from "../errors.js";
import { isIpLiteral, isPublicIp } from "./ip-policy.js";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/** Risolve un hostname in tutti i suoi indirizzi. Iniettabile per i test. */
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

export type IpPolicy = (ip: string) => boolean;

/**
 * Risolve e valida: TUTTI gli indirizzi devono essere pubblici, altrimenti si blocca
 * (un dominio che risolve anche a un IP interno è sospetto, tipico del DNS rebinding).
 * Restituisce gli indirizzi validati: la connessione va fatta su uno di questi (pinning).
 */
export async function resolvePublic(
  hostname: string,
  resolver: Resolver = systemResolver,
  ipPolicy: IpPolicy = isPublicIp,
): Promise<ResolvedAddress[]> {
  if (isIpLiteral(hostname)) {
    if (!ipPolicy(hostname)) throw new ScanError("URL_BLOCKED");
    return [{ address: hostname, family: hostname.includes(":") ? 6 : 4 }];
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolver(hostname);
  } catch (err) {
    throw new ScanError("DNS_FAILED", { cause: err });
  }
  if (addresses.length === 0) throw new ScanError("DNS_FAILED");
  if (addresses.some((a) => !ipPolicy(a.address))) throw new ScanError("URL_BLOCKED");
  return addresses;
}
