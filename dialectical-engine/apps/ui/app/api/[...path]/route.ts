import { previewAskProxyCeiling } from "../../../lib/previewAskProxyCeiling.js";
import {
  AGE_REFUSAL_COOKIE_MAX_AGE_SECONDS,
  AGE_REFUSAL_COOKIE_NAME,
  AGE_REFUSAL_COOKIE_VALUE
} from "@debateai/contract";
import { normalizeClientIp, TRUSTED_CLIENT_IP_HEADER } from "../../../trusted-client-ip.mjs";

type ProxyContext = Readonly<{
  params: Promise<Readonly<{ path: string[] }>>;
}>;

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const BODYLESS_STATUSES = new Set([204, 205, 304]);
const REQUEST_HEADER_ALLOWLIST = Object.freeze([
  "accept",
  "accept-language",
  "cache-control",
  "content-type",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-unmodified-since",
  "last-event-id",
  "origin",
  "range",
  "user-agent",
  "x-csrf-token",
  "x-staff-csrf-token",
  "x-password-reset-csrf-token",
  "x-mfa-recovery-csrf-token"
  ,"x-support-session-token"
  // DL1-F5c/DL3-F4: the case bearer travels in a header now, never in a path.
  ,"x-support-case-token"
  // N9 (spec 2026-10-05 §2.7.1): NETOPIA's signed message rides in this header, to the notify route only.
  ,"verification-token"
] as const);
const RESPONSE_HEADER_ALLOWLIST = Object.freeze([
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
  "retry-after",
  "vary"
] as const);
/** L3-F1: aligned with the API's Fastify bodyLimit (B5); the proxy never buffers more. */
const MAX_PROXY_BODY_BYTES = 1_048_576;
/** L3-F12: ceiling for a non-stream upstream request; event streams are open-ended by design. */
const UPSTREAM_TIMEOUT_MS = 30_000;
/**
 * hate-speech S02 (ruling R-D, V-13): `POST /v1/runs/{id}/publish` runs the content check, whose deadline D is at
 * most 60 000 ms (the register's `publicationCheckPolicy` row, packages/register/src/publication-check-policy.ts,
 * which refuses more: SPEC-v2 R7's cap, ruling R-D2), before the publish itself. Its ceiling is the largest D plus
 * 25 s for the rest of the attempt (preflight, three lease phases, the record, encryption and the transition); every
 * other route keeps UPSTREAM_TIMEOUT_MS.
 */
const PUBLISH_UPSTREAM_TIMEOUT_MS = 85_000;
const RUN_PUBLISH_PATH = /^v1\/runs\/[^/]+\/publish$/u;
const SESSION_COOKIE_NAME = "__Host-debateai-session";
const CSRF_COOKIE_NAME = "__Host-debateai-csrf";
const STAFF_COOKIE_NAME = "__Host-debateai-staff";
const STAFF_CSRF_COOKIE_NAME = "__Host-debateai-staff-csrf";
const PASSWORD_RESET_COOKIE_NAME = "__Host-debateai-password-reset";
const PASSWORD_RESET_CSRF_COOKIE_NAME = "__Host-debateai-password-reset-csrf";
const MFA_RECOVERY_COOKIE_NAME = "__Host-debateai-mfa-recovery";
const MFA_RECOVERY_CSRF_COOKIE_NAME = "__Host-debateai-mfa-recovery-csrf";
const AUTH_COOKIE_NAMES = [SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, STAFF_COOKIE_NAME, STAFF_CSRF_COOKIE_NAME, PASSWORD_RESET_COOKIE_NAME, PASSWORD_RESET_CSRF_COOKIE_NAME, MFA_RECOVERY_COOKIE_NAME, MFA_RECOVERY_CSRF_COOKIE_NAME] as const;
const STAFF_ABSOLUTE_MAX_AGE_SECONDS = 28800;
const SESSION_IDLE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
/** The API's support capability grammar (apps/api/src/support/session.ts CAPABILITY_PATTERN). */
const SUPPORT_SESSION_TOKEN_HEADER = "x-support-session-token";
/** DL1-F5c/DL3-F4: the case bearer, which used to travel in the path. */
const SUPPORT_CASE_TOKEN_HEADER = "x-support-case-token";
const SUPPORT_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** N9: NETOPIA's JWT, forwarded only to NETOPIA's notify route and only when it is of a sane size. */
const VERIFICATION_TOKEN_HEADER = "verification-token";
const NETOPIA_NOTIFY_UI_PATH = "/api/v1/billing/netopia/notify";
const VERIFICATION_TOKEN_MAX_LENGTH = 16_384;
/**
 * L3-F6: server.mjs strips every inbound forwarded header and re-stamps the client
 * address itself, then sets this marker before Next starts. Without the marker (a bare
 * `next start`) the stamped header is client-controlled and is never vouched for.
 */
const EDGE_MARKER_ENV = "DIALECTICAL_UI_EDGE";

function behindOwnEdge(): boolean {
  return process.env[EDGE_MARKER_ENV] === "server.mjs";
}

function readApiBase(): URL {
  const configured = process.env.DIALECTICAL_API_BASE?.trim();
  if (configured === undefined || configured.length === 0) {
    throw new Error("DIALECTICAL_API_BASE_REQUIRED");
  }

  let base: URL;
  try {
    base = new URL(configured);
  } catch {
    throw new Error("DIALECTICAL_API_BASE_INVALID");
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("DIALECTICAL_API_BASE_INVALID");
  }
  return base;
}

function createTargetUrl(request: Request, path: readonly string[]): URL {
  const source = new URL(request.url);
  const target = readApiBase();
  const basePath = target.pathname.replace(/\/+$/, "");
  const forwardedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  target.pathname = `${basePath}/${forwardedPath}`;
  target.search = source.search;
  target.hash = "";
  return target;
}

function createUpstreamHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of REQUEST_HEADER_ALLOWLIST) {
    const value = request.headers.get(name);
    if (value === null) continue;
    // DL3-F5: the support capability travels only in its exact grammar (as the cookies do).
    if ((name === SUPPORT_SESSION_TOKEN_HEADER || name === SUPPORT_CASE_TOKEN_HEADER)
      && !SUPPORT_CAPABILITY_PATTERN.test(value)) continue;
    if (name === VERIFICATION_TOKEN_HEADER
      && (new URL(request.url).pathname !== NETOPIA_NOTIFY_UI_PATH || value.length > VERIFICATION_TOKEN_MAX_LENGTH)) continue;
    headers.set(name, value);
  }
  const cookie = filteredSessionCookies(request.headers.get("cookie"));
  if (cookie !== null) headers.set("cookie", cookie);
  const clientIp = behindOwnEdge() ? normalizeClientIp(request.headers.get(TRUSTED_CLIENT_IP_HEADER)) : null;
  if (clientIp !== null) headers.set("x-forwarded-for", clientIp);
  return headers;
}

function filteredSessionCookies(raw: string | null): string | null {
  if (raw === null || /[\r\n\0]/.test(raw)) return null;
  const selected = new Map<string, string>();
  for (const member of raw.split(";")) {
    const index = member.indexOf("=");
    if (index < 1) {
      if ([...AUTH_COOKIE_NAMES, AGE_REFUSAL_COOKIE_NAME].some((name) => member.trim() === name)) return null;
      continue;
    }
    const name = member.slice(0, index).trim();
    const rawValue = member.slice(index + 1);
    const value = name === STAFF_COOKIE_NAME || name === STAFF_CSRF_COOKIE_NAME ? rawValue : rawValue.trim();
    // Age gate (8j): the lockout travels only in its one constant value.
    if (name === AGE_REFUSAL_COOKIE_NAME) {
      if (selected.has(name) || value !== AGE_REFUSAL_COOKIE_VALUE) return null;
      selected.set(name, value);
      continue;
    }
    if (!AUTH_COOKIE_NAMES.some((allowed) => allowed === name)) continue;
    if (selected.has(name) || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    selected.set(name, value);
  }
  const pairs = [...AUTH_COOKIE_NAMES, AGE_REFUSAL_COOKIE_NAME].flatMap((name) => {
    const value = selected.get(name);
    return value === undefined ? [] : [`${name}=${value}`];
  });
  return pairs.length === 0 ? null : pairs.join("; ");
}

function lawfulSetCookie(value: string): boolean {
  if (/[\r\n\0]/.test(value)) return false;
  const members = value.split(";").map((member) => member.trim());
  const pair = members[0] ?? "";
  const pairSeparator = pair.indexOf("=");
  if (pairSeparator < 1) return false;
  const name = pair.slice(0, pairSeparator);
  if (name === AGE_REFUSAL_COOKIE_NAME) {
    // Age gate (8j): exactly the API's lockout, nothing else under this name.
    return value === `${AGE_REFUSAL_COOKIE_NAME}=${AGE_REFUSAL_COOKIE_VALUE}; Path=/; `
      + `Max-Age=${AGE_REFUSAL_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
  }
  if (name === STAFF_COOKIE_NAME || name === STAFF_CSRF_COOKIE_NAME) {
    if (value.split(";", 1)[0] !== pair) return false;
    const cookieValue = pair.slice(pairSeparator + 1);
    const attributes = members.slice(1);
    const age = attributes[1]?.match(/^Max-Age=(0|[1-9][0-9]{0,4})$/u);
    if (age === undefined || age === null) return false;
    const seconds = Number(age[1]);
    const expected = ["Path=/", `Max-Age=${seconds}`, ...(name === STAFF_COOKIE_NAME ? ["HttpOnly"] : []), "Secure", "SameSite=Strict"];
    return (cookieValue === "" ? seconds === 0 : /^[A-Za-z0-9_-]{43}$/.test(cookieValue) && seconds > 0 && seconds <= STAFF_ABSOLUTE_MAX_AGE_SECONDS)
      && attributes.length === expected.length && attributes.every((attribute, index) => attribute === expected[index]);
  }
  if ([PASSWORD_RESET_COOKIE_NAME,PASSWORD_RESET_CSRF_COOKIE_NAME,MFA_RECOVERY_COOKIE_NAME,MFA_RECOVERY_CSRF_COOKIE_NAME].some(allowed=>allowed===name)) {
    if(value.split(";",1)[0]!==pair) return false;
    const cookieValue=pair.slice(pairSeparator+1),attributes=members.slice(1);
    const match=attributes[1]?.match(/^Max-Age=(0|[1-9][0-9]{0,4})$/u);
    if(!match) return false;
    const seconds=Number(match[1]),reset=name===PASSWORD_RESET_COOKIE_NAME||name===PASSWORD_RESET_CSRF_COOKIE_NAME;
    const expected=["Path=/",`Max-Age=${seconds}`,...(name===PASSWORD_RESET_COOKIE_NAME||name===MFA_RECOVERY_COOKIE_NAME?["HttpOnly"]:[]),"Secure","SameSite=Strict"];
    return (cookieValue===""?seconds===0:/^[A-Za-z0-9_-]{43}$/.test(cookieValue)&&seconds>0&&seconds<=(reset?1800:299))&&attributes.length===expected.length&&attributes.every((attribute,index)=>attribute===expected[index]);
  }
  if (name !== SESSION_COOKIE_NAME && name !== CSRF_COOKIE_NAME) return false;
  const cookieValue = pair.slice(pairSeparator + 1);
  const attributes = members.slice(1).map((member) => member.toLowerCase());
  const securityAttributes = name === SESSION_COOKIE_NAME ? ["httponly", "secure"] : ["secure"];
  const expected = cookieValue === ""
    ? ["path=/", "max-age=0", "expires=thu, 01 jan 1970 00:00:00 gmt", ...securityAttributes, "samesite=lax"]
    : ["path=/", `max-age=${SESSION_IDLE_MAX_AGE_SECONDS}`, ...securityAttributes, "samesite=lax"];
  return (cookieValue === "" || /^[A-Za-z0-9_-]{43}$/.test(cookieValue))
    && attributes.length === expected.length
    && attributes.every((attribute, index) => attribute === expected[index]);
}

/** A success body cannot claim a cookie ceremony completed after transport rejected it. */
function invalidAuthSetCookies(upstream: Headers): boolean {
  const seen = new Set<string>();
  for (const value of upstream.getSetCookie()) {
    const name = value.split("=", 1)[0]?.trim() ?? "";
    if (![...AUTH_COOKIE_NAMES, AGE_REFUSAL_COOKIE_NAME].some((allowed) => allowed === name)) continue;
    if (seen.has(name) || !lawfulSetCookie(value)) return true;
    seen.add(name);
  }
  return false;
}

function createDownstreamHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_HEADER_ALLOWLIST) {
    const value = upstream.get(name);
    if (value !== null) headers.set(name, value);
  }
  // L3-F7: fetch hands the proxy a DECODED body while content-length described the
  // encoded one; forwarding that length would frame the response wrong.
  if (upstream.has("content-encoding")) headers.delete("content-length");
  const setCookies = typeof upstream.getSetCookie === "function"
    ? upstream.getSetCookie() : [];
  const counts = new Map<string, number>();
  for (const value of setCookies) {
    const name = value.split("=", 1)[0]?.trim() ?? "";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const value of setCookies) {
    const name = value.split("=", 1)[0]?.trim() ?? "";
    if (counts.get(name) === 1 && lawfulSetCookie(value)) headers.append("set-cookie", value);
  }
  return headers;
}

function payloadTooLarge(): Response {
  return Response.json({
    error: "PAYLOAD_TOO_LARGE",
    message: `The request body exceeds the proxy limit of ${MAX_PROXY_BODY_BYTES} bytes.`
  }, { status: 413 });
}

/**
 * L3-F1: a declared content-length over the cap is refused before a byte is
 * read; every other body is read through a counting loop that cancels the
 * stream the moment the cap is passed, so a chunked or lying-length body can
 * never be materialised in memory. Returns null once the cap is exceeded.
 */
async function readBoundedBody(request: Request): Promise<BufferSource | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d{1,15}$/.test(declared) && Number(declared) > MAX_PROXY_BODY_BYTES) return null;
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROXY_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * L3-F12: the upstream request never outlives the client's. The run event
 * feed (accept: text/event-stream, or a path ending in /events) follows the
 * client signal alone; everything else also gets a 30 s ceiling.
 */
function upstreamSignal(request: Request, path: readonly string[]): AbortSignal {
  const streaming = (request.headers.get("accept") ?? "").includes("text/event-stream")
    || path[path.length - 1] === "events";
  const ceiling = request.method === "POST" && RUN_PUBLISH_PATH.test(path.join("/"))
    ? PUBLISH_UPSTREAM_TIMEOUT_MS : previewAskProxyCeiling({method:request.method,path,origin:request.headers.get("origin")},process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON) ?? UPSTREAM_TIMEOUT_MS;
  return streaming
    ? request.signal
    : AbortSignal.any([request.signal, AbortSignal.timeout(ceiling)]);
}

async function proxyApi(request: Request, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  const target = createTargetUrl(request, path);
  const headers = createUpstreamHeaders(request);

  // exactOptionalPropertyTypes: a bodyless method must OMIT body, not pass
  // `undefined` for it, so the two shapes are built separately.
  const signal = upstreamSignal(request, path);
  let init: RequestInit;
  if (BODYLESS_METHODS.has(request.method)) {
    init = { method: request.method, headers, cache: "no-store", signal };
  } else {
    const body = await readBoundedBody(request);
    if (body === null) return payloadTooLarge();
    init = { method: request.method, headers, body, cache: "no-store", signal };
  }

  let response: Response;
  try {
    response = await fetch(target, init);
  } catch (failure) {
    // fetch rejected before an HTTP response existed. 502/504 state only the
    // observed proxy fact; they never fabricate an API-side verdict (DR-115).
    if (failure instanceof Error && failure.name === "TimeoutError") {
      return Response.json({
        error: "API_UPSTREAM_TIMEOUT",
        message: "The API upstream did not answer the proxy request in time."
      }, { status: 504 });
    }
    return Response.json({
      error: "API_UPSTREAM_UNREACHABLE",
      message: "The API upstream did not answer the proxy request."
    }, { status: 502 });
  }

  if (invalidAuthSetCookies(response.headers)) {
    await response.body?.cancel();
    return Response.json({ error: "UPSTREAM_AUTH_COOKIES_INVALID" }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  return new Response(
    request.method === "HEAD" || BODYLESS_STATUSES.has(response.status) ? null : response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers: createDownstreamHeaders(response.headers)
    }
  );
}

export function GET(request: Request, context: ProxyContext) {
  return proxyApi(request, context);
}

export function HEAD(request: Request, context: ProxyContext) {
  return proxyApi(request, context);
}

export function POST(request: Request, context: ProxyContext) {
  return proxyApi(request, context);
}

export function PUT(request: Request, context: ProxyContext) {
  return proxyApi(request, context);
}

export function PATCH(request: Request, context: ProxyContext) {
  return proxyApi(request, context);
}

export function DELETE(request: Request, context: ProxyContext) {
  return proxyApi(request, context);
}

export function OPTIONS(request: Request, context: ProxyContext) {
  return proxyApi(request, context);
}
