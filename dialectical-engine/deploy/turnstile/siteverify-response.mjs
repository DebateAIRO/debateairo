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
