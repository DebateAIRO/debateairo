// Shared pure response boundary; neither the API nor the relay trusts success alone.
export function deploymentHostname(publicAppUrl) {
  let url;
  try { url = new URL(publicAppUrl); } catch { throw new TypeError("TURNSTILE_PUBLIC_APP_URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !url.hostname) {
    throw new TypeError("TURNSTILE_PUBLIC_APP_URL_INVALID");
  }
  return url.hostname;
}
/**
 * The closed set of widget actions. Sign-in and the three public recovery starts were added on
 * 2026-10-09 (auth API hardening); each proof is bound to exactly one of them.
 */
export const TURNSTILE_ACTIONS = Object.freeze(["signup", "resend-verification", "login", "password-reset", "mfa-recovery", "account-recovery"]);
/**
 * Auth API hardening 2026-10-09: the passed-proof memory is capped per action family — sign-up
 * (sign-up and resend), sign-in, recovery (the three public starts) — so a flood of solved proofs
 * for one family can never refuse the others.
 */
export const TURNSTILE_ACTION_FAMILIES = Object.freeze({
  signup: "sign-up", "resend-verification": "sign-up", login: "sign-in",
  "password-reset": "recovery", "mfa-recovery": "recovery", "account-recovery": "recovery"
});
export const TURNSTILE_PROOF_MEMORY_PER_FAMILY = 10_000;
const PROOF_HOLD_MS = 300_000;
/**
 * Single-use memory of proof digests, shared by the API verifier and the relay. `reserve` answers
 * "held" when any family still holds the digest (a proof is single-use across every action), "full"
 * when this action's family holds its cap of proofs all still inside their window, else reserves it.
 */
export function createProofMemory(capPerFamily = TURNSTILE_PROOF_MEMORY_PER_FAMILY) {
  const families = new Map(Object.values(TURNSTILE_ACTION_FAMILIES).map(family => [family, new Map()]));
  const memoryFor = action => families.get(TURNSTILE_ACTION_FAMILIES[action]);
  return Object.freeze({
    reserve(digest, action, now) {
      const memory = memoryFor(action);
      for (const [held, until] of memory) if (until <= now) memory.delete(held);
      for (const other of families.values()) { const until = other.get(digest); if (until !== undefined && until > now) return "held"; }
      if (memory.size >= capPerFamily) return "full";
      memory.set(digest, now + PROOF_HOLD_MS);
      return "reserved";
    },
    release(digest, action) { memoryFor(action).delete(digest); }
  });
}
export function validProof(input) {
  return input !== null && typeof input === "object" && typeof input.token === "string"
    && input.token.length >= 1 && input.token.length <= 2048 && /\S/u.test(input.token)
    && TURNSTILE_ACTIONS.includes(input.action);
}
export function siteverifyOutcome(value, action, hostname, now = Date.now()) {
  if (!value || typeof value !== "object" || typeof value.success !== "boolean") return "unavailable";
  const errors = value["error-codes"];
  if (errors !== undefined && (!Array.isArray(errors) || errors.some(code => typeof code !== "string"))) return "unavailable";
  if (value.success === false) {
    return Array.isArray(errors) && errors.length > 0 && errors.every(code => ["invalid-input-response", "missing-input-response", "timeout-or-duplicate"].includes(code))
      ? "rejected" : "unavailable";
  }
  if (errors !== undefined && errors.length !== 0) return "unavailable";
  if (typeof value.hostname !== "string" || typeof value.action !== "string" || typeof value.challenge_ts !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value.challenge_ts)) return "unavailable";
  const timestamp = Date.parse(value.challenge_ts);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 19) !== value.challenge_ts.slice(0, 19)) return "unavailable";
  if (value.hostname !== hostname || value.action !== action || timestamp > now || now - timestamp > 300_000) return "rejected";
  return "passed";
}
export function validSocketPath(value) {
  return typeof value === "string" && value.startsWith("/") && Buffer.byteLength(value) <= 103
    && !value.includes("\0") && !value.split("/").some(part => part === "." || part === "..") && value.endsWith(".sock");
}
