import { isIP } from "node:net";

/**
 * The API is loopback-bound and the executable Next server is its only proxy
 * hop. Do not widen this to `true`, a hop count, or a private-network range:
 * those make a deployment change silently redefine which caller headers are
 * authoritative.
 */
export const TRUSTED_UI_PROXY_NETWORKS = Object.freeze([
  "127.0.0.1/32",
  "::1/128"
] as const);

function mappedIpv4(canonicalIpv6: string): string | null {
  const match = canonicalIpv6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (match === null) return null;
  const high = Number.parseInt(match[1]!, 16);
  const low = Number.parseInt(match[2]!, 16);
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

/** The eight hextets of a canonical IPv6 literal, `::` expanded, zeroes kept. */
function ipv6Hextets(canonical: string): readonly string[] | null {
  const [head = "", tail] = canonical.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  const missing = 8 - headGroups.length - tailGroups.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [
    ...headGroups,
    ...Array.from({ length: tail === undefined ? 0 : missing }, () => "0"),
    ...tailGroups
  ];
  // A canonical literal carries no embedded IPv4 form; refuse rather than guess.
  return groups.every((group) => /^[0-9a-f]{1,4}$/u.test(group)) ? groups : null;
}

/**
 * DL5-F3. The network a canonical address belongs to, for per-source counting.
 *
 * An IPv4 address is its own scope. An IPv6 address is its /64: a single
 * residential or hosting allocation is one /64, so counting the full 128 bits
 * let one holder mint an unlimited number of distinct "sources" and walk around
 * every per-source window — and, in the two append-only support tables, write
 * an unlimited number of distinct pseudonyms for one actor. Anything that is
 * not an address (the `"unknown"` fallback) is its own scope and is never
 * merged with a real one.
 */
export function clientIpNetworkScope(canonical: string): string {
  if (typeof canonical !== "string" || isIP(canonical) !== 6) return canonical;
  const hextets = ipv6Hextets(canonical);
  return hextets === null ? canonical : `${hextets.slice(0, 4).join(":")}::/64`;
}

/** Returns one canonical IP literal, never a hostname, list, zone id or port. */
export function normalizeClientIp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return null;
  if (value !== value.trim()) return null;
  const family = isIP(value);
  if (family === 4) return value.split(".").map((octet) => String(Number(octet))).join(".");
  if (family !== 6 || value.includes("%")) return null;
  const hostname = new URL(`http://[${value}]/`).hostname;
  const canonical = hostname.slice(1, -1).toLowerCase();
  return mappedIpv4(canonical) ?? canonical;
}
