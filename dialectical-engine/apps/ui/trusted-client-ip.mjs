import { isIP } from "node:net";

export const TRUSTED_CLIENT_IP_HEADER = "x-debateai-client-ip";

function mappedIpv4(canonicalIpv6) {
  const match = canonicalIpv6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (match === null) return null;
  const high = Number.parseInt(match[1], 16);
  const low = Number.parseInt(match[2], 16);
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

export function normalizeClientIp(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return null;
  if (value !== value.trim()) return null;
  const family = isIP(value);
  if (family === 4) return value.split(".").map((octet) => String(Number(octet))).join(".");
  if (family !== 6 || value.includes("%")) return null;
  const hostname = new URL(`http://[${value}]/`).hostname;
  const canonical = hostname.slice(1, -1).toLowerCase();
  return mappedIpv4(canonical) ?? canonical;
}

/**
 * Runs on the Node socket before Next performs its caller-preserving `??=`
 * forwarding-header synthesis. No value supplied by the HTTP caller survives.
 *
 * L3-F3 C-3: Next takes the script nonce from the REQUEST
 * `content-security-policy` header and applies middleware rewrites from
 * `x-middleware-*` headers, so a caller may never name either; only
 * apps/ui/middleware.ts does (it sets them after this ran).
 */
export function hardenIncomingProxyHeaders(headers, remoteAddress) {
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    if (lower === "forwarded"
      || lower === "x-real-ip"
      || lower === "cf-connecting-ip"
      || lower === "true-client-ip"
      || lower === TRUSTED_CLIENT_IP_HEADER
      || lower === "content-security-policy"
      || lower === "content-security-policy-report-only"
      || lower === "x-nonce"
      || lower.startsWith("x-forwarded-")
      || lower.startsWith("x-middleware-")) {
      delete headers[name];
    }
  }
  const clientIp = normalizeClientIp(remoteAddress);
  if (clientIp !== null) headers[TRUSTED_CLIENT_IP_HEADER] = clientIp;
}
