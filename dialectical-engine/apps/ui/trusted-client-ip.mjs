import { timingSafeEqual } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { isIP } from "node:net";

export const TRUSTED_CLIENT_IP_HEADER = "x-debateai-client-ip";
/** C2b: the header a trusted reverse proxy must present alongside x-forwarded-for when a secret is configured. */
export const EDGE_SECRET_HEADER = "x-debateai-edge-secret";
/** NV-03: the UI-to-API proof, sent to the API with every forwarded address and on the readiness fetch. */
export const UI_API_PROOF_HEADER = "x-debateai-ui-proof";
/** NV-03: the API's answer on its /readyz: `accepted` or `refused`, absent when neither side holds a proof. */
export const UI_API_PROOF_VERDICT_HEADER = "x-debateai-ui-proof-verdict";

const FORWARDED_FOR_MAX_LENGTH = 512;
const FORWARDED_FOR_MAX_HOPS = 8;
const EDGE_SECRET_GRAMMAR = /^[A-Za-z0-9_-]{43,512}$/;
const EDGE_SECRET_MAX_FILE_BYTES = 4096;
/** NV-03: the process-wide slot server.mjs installs the checked proof in, shared by every copy of this module. */
const UI_API_PROOF_SLOT = Symbol.for("debateai.ui.apiProof");
let uiApiProofMissingNamed = false;

function refuse(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

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
 * R2 / C2: `DIALECTICAL_UI_TRUSTED_PROXIES` — comma-separated exact IP
 * literals of the reverse proxies whose x-forwarded-for may name the client.
 * Unset or empty means no proxy is trusted (every client is its socket
 * address). CIDRs, hostnames, ports, zone ids and whitespace-only entries are
 * refused fail-closed: trust is never guessed at.
 */
export function parseTrustedProxies(text) {
  if (text === undefined || text === "") return Object.freeze([]);
  if (typeof text !== "string") throw refuse("DIALECTICAL_UI_TRUSTED_PROXIES_INVALID");
  const normalized = text.split(",").map((entry) => normalizeClientIp(entry.trim()));
  if (normalized.some((entry) => entry === null)) throw refuse("DIALECTICAL_UI_TRUSTED_PROXIES_INVALID");
  return Object.freeze(normalized);
}

/**
 * C2b: `DIALECTICAL_UI_EDGE_SECRET_PATH` — a file only the UI user may read
 * (no group/other bits) holding >= 32 random bytes as base64url (>= 43
 * characters; `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`). The
 * reverse proxy sends the same text in `x-debateai-edge-secret`
 * (Caddy: `header_up X-Debateai-Edge-Secret {file./etc/debateai/ui-edge.caddy.secret}`, its own 0640 root:caddy copy of the same bytes).
 * Read once at boot; unset means no secret is required; anything else that
 * is not exactly right refuses to start.
 */
export function readEdgeSecret(path) {
  return readSecretText(path, "DIALECTICAL_UI_EDGE_SECRET_INVALID");
}

/**
 * NV-03: `DIALECTICAL_UI_API_PROOF_PATH` — the UI's copy of the UI-to-API proof (0400 to the UI user), read once at
 * boot with the edge secret's rules; the API holds the same bytes. Unset means none; anything not exactly right
 * refuses DIALECTICAL_UI_API_PROOF_INVALID.
 */
export function readUiApiProof(path) {
  return readSecretText(path, "DIALECTICAL_UI_API_PROOF_INVALID");
}

/** A regular file with no group or other bits, at most 4096 bytes, holding the base64url grammar; null when unset. */
function readSecretText(path, code) {
  if (path === undefined || path === "") return null;
  if (typeof path !== "string" || path.trim() !== path) throw refuse(code);
  let descriptor;
  try {
    descriptor = openSync(path, "r");
  } catch {
    throw refuse(code);
  }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > EDGE_SECRET_MAX_FILE_BYTES) {
      throw refuse(code);
    }
    const text = readFileSync(descriptor, "utf8").trim();
    if (!EDGE_SECRET_GRAMMAR.test(text)) throw refuse(code);
    return text;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * NV-03, at boot: outside `--dev` a website that trusts a proxy forwards visitors' addresses, so it must hold a proof
 * to send with them (DIALECTICAL_UI_API_PROOF_REQUIRED: without it every visitor would be the loopback peer to the
 * API). The proof must differ from the edge secret, which Caddy's group can read
 * (DIALECTICAL_UI_API_PROOF_REUSES_EDGE_SECRET).
 */
export function assertUiApiProofPolicy({ development, trustedProxies, edgeSecret, uiApiProof }) {
  if (development !== true && trustedProxies.length > 0 && uiApiProof === null) throw refuse("DIALECTICAL_UI_API_PROOF_REQUIRED");
  if (edgeSecret !== null && uiApiProof !== null && edgeSecret === uiApiProof) {
    throw refuse("DIALECTICAL_UI_API_PROOF_REUSES_EDGE_SECRET");
  }
}

/**
 * NV-03: installs the boot-checked proof (or null) for this process, once, after server.mjs's checks. It lives in a
 * frozen `{ value }` record under a registry symbol on globalThis, so the route code Next bundles with its own copy
 * of this module sees the same one; it is never put in the environment, so no child process or worker inherits it.
 * Tests reset it with `installUiApiProof(null)` (installed, none), or delete
 * `globalThis[Symbol.for("debateai.ui.apiProof")]` (never installed).
 */
export function installUiApiProof(value) {
  if (value !== null && (typeof value !== "string" || !EDGE_SECRET_GRAMMAR.test(value))) {
    throw refuse("DIALECTICAL_UI_API_PROOF_INVALID");
  }
  globalThis[UI_API_PROOF_SLOT] = Object.freeze({ value });
}

/**
 * NV-03: the proof server.mjs installed, or null. A forwarder that finds no record at all behind server.mjs says so
 * once (one content-free line per module copy) and sends none, so a bundle that does not share server.mjs's globals
 * fails closed and visibly.
 */
export function installedUiApiProof() {
  const record = globalThis[UI_API_PROOF_SLOT];
  if (record !== null && typeof record === "object") return typeof record.value === "string" ? record.value : null;
  if (process.env.DIALECTICAL_UI_EDGE === "server.mjs" && !uiApiProofMissingNamed) {
    uiApiProofMissingNamed = true;
    console.error(JSON.stringify({ event: "ui.api_proof.not_installed" }));
  }
  return null;
}

function edgeSecretMatches(expected, supplied) {
  if (expected === null) return true;
  if (typeof supplied !== "string") return false;
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

/**
 * The LAST hop of x-forwarded-for, i.e. the address the trusted peer itself
 * observed (Caddy overwrites the header; nginx's $proxy_add_x_forwarded_for
 * appends). A client-supplied prefix can never move it. Node has already
 * lowercased the name and comma-joined duplicate lines. Over-long headers,
 * too many hops, ports, brackets, zone ids and empty hops all fall back to
 * the socket address — safe, never spoofable.
 */
function lastForwardedHop(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > FORWARDED_FOR_MAX_LENGTH) return null;
  const hops = value.split(",");
  if (hops.length > FORWARDED_FOR_MAX_HOPS) return null;
  return normalizeClientIp(hops[hops.length - 1].trim());
}

/**
 * Runs on the Node socket before Next performs its caller-preserving `??=`
 * forwarding-header synthesis. No value supplied by the HTTP caller survives;
 * the only client-address fact Next and the API proxy ever see is
 * TRUSTED_CLIENT_IP_HEADER, stamped here.
 *
 * Trust rule (R2 / C2, L3-F11): the socket address is the client unless it
 * is one of `trustedProxies` — and, when an `edgeSecret` is configured, the
 * request also carries it (C2b) — in which case the last x-forwarded-for hop
 * is the client. x-forwarded-proto and every other forwarded header are
 * discarded in both cases.
 *
 * L3-F3 C-3: Next takes the script nonce from the REQUEST
 * `content-security-policy` header and applies middleware rewrites from
 * `x-middleware-*` headers, so a caller may never name either; only
 * apps/ui/middleware.ts does (it sets them after this ran).
 */
export function hardenIncomingProxyHeaders(headers, remoteAddress, trustedProxies = [], edgeSecret = null) {
  const forwardedFor = headers["x-forwarded-for"];
  const suppliedSecret = headers[EDGE_SECRET_HEADER];
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    if (lower === "forwarded"
      || lower === "x-real-ip"
      || lower === "cf-connecting-ip"
      || lower === "true-client-ip"
      || lower === TRUSTED_CLIENT_IP_HEADER
      || lower === EDGE_SECRET_HEADER
      || lower === UI_API_PROOF_HEADER
      || lower === "content-security-policy"
      || lower === "content-security-policy-report-only"
      || lower === "x-nonce"
      || lower.startsWith("x-forwarded-")
      || lower.startsWith("x-middleware-")) {
      delete headers[name];
    }
  }
  const socketIp = normalizeClientIp(remoteAddress);
  let clientIp = socketIp;
  if (socketIp !== null && trustedProxies.includes(socketIp) && edgeSecretMatches(edgeSecret, suppliedSecret)) {
    const lastHop = lastForwardedHop(forwardedFor);
    if (lastHop !== null) clientIp = lastHop;
  }
  if (clientIp !== null) headers[TRUSTED_CLIENT_IP_HEADER] = clientIp;
}
