import ipaddr from "ipaddr.js";

/**
 * Reti sempre vietate, in aggiunta alla classificazione di ipaddr.js (difesa in profondità).
 * Qualsiasi indirizzo che non sia unicast pubblico viene rifiutato.
 */
const EXTRA_DENY_V4: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8], // "questa rete", include 0.0.0.0
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local e metadata cloud (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4], // include 255.255.255.255
];

const EXTRA_DENY_V6: ReadonlyArray<[string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7], // ULA
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local deprecato
  ["ff00::", 8], // multicast
  ["64:ff9b::", 96], // NAT64: può incapsulare IPv4 interni
  ["64:ff9b:1::", 48],
  ["2001::", 32], // Teredo
  ["2002::", 16], // 6to4: può incapsulare IPv4 interni
  ["2001:db8::", 32], // documentazione
  ["fd00:ec2::254", 128], // metadata AWS IPv6
];

const GLOBAL_UNICAST_V6 = ipaddr.parseCIDR("2000::/3");

const PARSED_V4 = EXTRA_DENY_V4.map(([a, p]) => [ipaddr.IPv4.parse(a), p] as const);
const PARSED_V6 = EXTRA_DENY_V6.map(([a, p]) => [ipaddr.IPv6.parse(a), p] as const);

/** Rimuove le parentesi quadre di un IPv6 in un hostname di URL e l'eventuale zone id. */
function cleanLiteral(ip: string): string {
  let s = ip.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  return s;
}

/** true se la stringa è un indirizzo IP (v4 in forma canonica a 4 ottetti o v6). */
export function isIpLiteral(value: string): boolean {
  const s = cleanLiteral(value);
  return ipaddr.IPv4.isValidFourPartDecimal(s) || ipaddr.IPv6.isValid(s);
}

/**
 * true solo se l'IP è unicast pubblico e raggiungibile da Internet.
 * Rifiuta loopback, privati, link-local, metadata cloud, CGNAT, ULA, multicast,
 * riservati, 0.0.0.0, IPv4 incapsulati in IPv6 verso reti interne, ecc.
 */
export function isPublicIp(value: string): boolean {
  const s = cleanLiteral(value);
  if (!ipaddr.isValid(s)) return false;
  // Accettiamo solo IPv4 canonici: forme come "0x7f.1" o "2130706433" vanno normalizzate prima (dal parser URL).
  if (!s.includes(":") && !ipaddr.IPv4.isValidFourPartDecimal(s)) return false;

  let addr: ipaddr.IPv4 | ipaddr.IPv6 = ipaddr.parse(s);

  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      addr = v6.toIPv4Address();
    } else {
      if (!v6.match(GLOBAL_UNICAST_V6)) return false;
      if (PARSED_V6.some(([net, prefix]) => v6.match(net, prefix))) return false;
      return v6.range() === "unicast";
    }
  }

  const v4 = addr as ipaddr.IPv4;
  if (PARSED_V4.some(([net, prefix]) => v4.match(net, prefix))) return false;
  return v4.range() === "unicast";
}
