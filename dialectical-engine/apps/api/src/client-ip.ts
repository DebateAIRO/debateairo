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
