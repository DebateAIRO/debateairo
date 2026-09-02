/**
 * Content-Security-Policy text for the UI edge. One module so the middleware
 * (per-request nonce), the custom server (fail-closed fallback), next.config
 * (static /api policy) and the tests read the same strings.
 *
 * F-08 / L3-F3: documents get `script-src 'self' 'nonce-…' 'strict-dynamic'`
 * from apps/ui/middleware.ts. 'strict-dynamic' makes CSP3 user agents ignore
 * 'self' and honour only nonced scripts plus the scripts those create
 * (webpack's chunk loader); 'self' stays for CSP2 user agents.
 *
 * Web APIs only (btoa, crypto.getRandomValues): the middleware bundle runs in
 * the Edge runtime, where Buffer is a polyfill (L3 C-4).
 */

const NONCE_GRAMMAR = /^[A-Za-z0-9+/]{22}==$/;

const STATIC_DIRECTIVES = Object.freeze([
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "upgrade-insecure-requests"
]);

/** Request header the middleware sets and the root layout reads. */
export const NONCE_REQUEST_HEADER = "x-nonce";

export function buildContentSecurityPolicy(scriptSources) {
  return `default-src 'self'; script-src ${scriptSources}; ${STATIC_DIRECTIVES.join("; ")}`;
}

/**
 * Exactly the policy the UI served before per-request nonces. server.mjs
 * pre-sets it on every response before Next runs; the middleware replaces it
 * on every route it matches. Nothing is served without a policy (L3-F3 C-2).
 */
export const FALLBACK_CONTENT_SECURITY_POLICY = buildContentSecurityPolicy("'self' 'unsafe-inline'");

/**
 * Proxied /api/* responses are JSON or event streams, never documents. The
 * proxy's response allowlist drops the upstream's own policy, so the UI
 * states one (L3-F3 C-1).
 */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

/** 16 random bytes as 24 base64 characters, fresh per call. */
export function createNonce() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/** The document policy for one request. Refuses anything that is not a nonce this module minted. */
export function nonceContentSecurityPolicy(nonce, development) {
  if (typeof nonce !== "string" || !NONCE_GRAMMAR.test(nonce)) {
    const error = new TypeError("UI_CSP_NONCE_INVALID");
    error.code = "UI_CSP_NONCE_INVALID";
    throw error;
  }
  const sources = development
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  return buildContentSecurityPolicy(sources);
}
