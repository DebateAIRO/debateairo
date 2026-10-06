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
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
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

/**
 * AMENDMENTS-R1 A11 — the card form's documents. xMoney's card fields live in xMoney's own iframes, so only these
 * three pages may frame and talk to xMoney. /settings itself (account deletion, 2-step settings) never does.
 */
const CARD_FORM_PATHS = Object.freeze(["/checkout", "/checkout/return", "/settings/card"]);
const ORIGIN_GRAMMAR = /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/;
const XMONEY_API_ORIGIN_FOR_SDK_HOST = Object.freeze({
  "secure-stage.xmoney.com": "https://api-stage.xmoney.com",
  "secure.xmoney.com": "https://api.xmoney.com"
});

function refuseOrigin() {
  const error = new TypeError("UI_XMONEY_SDK_ORIGIN_INVALID");
  error.code = "UI_XMONEY_SDK_ORIGIN_INVALID";
  throw error;
}

export function isCardFormPath(pathname) {
  return CARD_FORM_PATHS.includes(pathname);
}

/**
 * XMONEY_SDK_ORIGIN → the origins the card form needs. Unset is null: no billing additions anywhere. A malformed
 * value fails loudly, and only on the three card pages (the middleware reads it for those alone).
 */
export function cardFormOrigins(sdkOrigin) {
  if (typeof sdkOrigin !== "string" || sdkOrigin.trim() === "") return null;
  const sdk = sdkOrigin.trim();
  if (!ORIGIN_GRAMMAR.test(sdk)) refuseOrigin();
  const host = new URL(sdk).host;
  return Object.freeze({ sdk, api: Object.hasOwn(XMONEY_API_ORIGIN_FOR_SDK_HOST, host) ? XMONEY_API_ORIGIN_FOR_SDK_HOST[host] : null });
}

/**
 * Today's nonce policy plus xMoney in four directives. The SDK script itself is admitted by the page nonce
 * ('strict-dynamic'); the host source in script-src is only for CSP2 user agents, which ignore 'strict-dynamic'.
 */
export function cardFormContentSecurityPolicy(nonce, development, origins) {
  if (origins === null || typeof origins !== "object"
    || typeof origins.sdk !== "string" || !ORIGIN_GRAMMAR.test(origins.sdk)
    || (origins.api !== null && (typeof origins.api !== "string" || !ORIGIN_GRAMMAR.test(origins.api)))) {
    refuseOrigin();
  }
  const base = nonceContentSecurityPolicy(nonce, development);
  const additions={
    "script-src":[origins.sdk],
    "connect-src":[origins.sdk,...(origins.api===null?[]:[origins.api])],
    "frame-src":["'self'",origins.sdk],
    "form-action":[origins.sdk]
  };
  return base.split("; ").map(directive=>{
    const [name,...sources]=directive.split(" ");
    if(!Object.hasOwn(additions,name))return directive;
    return [name,...new Set([...sources,...additions[name]])].join(" ");
  }).join("; ");
}
