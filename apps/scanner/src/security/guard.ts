import { isPublicIp } from "./ip-policy.js";
import { type IpPolicy, type ResolvedAddress, type Resolver, resolvePublic, systemResolver } from "./resolver.js";
import { bareHostname, parseTargetUrl, type UrlPolicyOptions } from "./url-policy.js";

export interface GuardOptions extends UrlPolicyOptions {
  resolver?: Resolver;
  ipPolicy?: IpPolicy;
}

export interface GuardResult {
  url: URL;
  addresses: ResolvedAddress[];
}

/**
 * Controllo unico anti SSRF: validazione URL + DNS + IP pubblici.
 * Da usare prima di OGNI richiesta: URL iniziale, ogni redirect e,
 * dalla Milestone 3, ogni sottorichiesta del browser (route di Playwright).
 */
export async function assertPublicUrl(input: string | URL, options: GuardOptions = {}): Promise<GuardResult> {
  const url = parseTargetUrl(input, options);
  const addresses = await resolvePublic(
    bareHostname(url),
    options.resolver ?? systemResolver,
    options.ipPolicy ?? isPublicIp,
  );
  return { url, addresses };
}
