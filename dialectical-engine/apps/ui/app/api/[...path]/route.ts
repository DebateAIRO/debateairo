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
  "x-csrf-token"
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
const SESSION_COOKIE_NAME = "__Host-debateai-session";
const CSRF_COOKIE_NAME = "__Host-debateai-csrf";
const SESSION_IDLE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

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
    if (value !== null) headers.set(name, value);
  }
  const cookie = filteredSessionCookies(request.headers.get("cookie"));
  if (cookie !== null) headers.set("cookie", cookie);
  const clientIp = normalizeClientIp(request.headers.get(TRUSTED_CLIENT_IP_HEADER));
  if (clientIp !== null) headers.set("x-forwarded-for", clientIp);
  return headers;
}

function filteredSessionCookies(raw: string | null): string | null {
  if (raw === null || /[\r\n\0]/.test(raw)) return null;
  const selected = new Map<string, string>();
  for (const member of raw.split(";")) {
    const index = member.indexOf("=");
    if (index < 1) continue;
    const name = member.slice(0, index).trim();
    if (name !== SESSION_COOKIE_NAME && name !== CSRF_COOKIE_NAME) continue;
    const value = member.slice(index + 1).trim();
    if (selected.has(name) || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    selected.set(name, value);
  }
  const pairs = [SESSION_COOKIE_NAME, CSRF_COOKIE_NAME].flatMap((name) => {
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

function createDownstreamHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_HEADER_ALLOWLIST) {
    const value = upstream.get(name);
    if (value !== null) headers.set(name, value);
  }
  const setCookies = typeof upstream.getSetCookie === "function"
    ? upstream.getSetCookie() : [];
  for (const value of setCookies) {
    if (lawfulSetCookie(value)) headers.append("set-cookie", value);
  }
  return headers;
}

async function proxyApi(request: Request, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  const target = createTargetUrl(request, path);
  const headers = createUpstreamHeaders(request);

  // exactOptionalPropertyTypes: a bodyless method must OMIT body, not pass
  // `undefined` for it, so the two shapes are built separately.
  const init: RequestInit = BODYLESS_METHODS.has(request.method)
    ? { method: request.method, headers, cache: "no-store" }
    : { method: request.method, headers, body: await request.arrayBuffer(), cache: "no-store" };

  let response: Response;
  try {
    response = await fetch(target, init);
  } catch {
    // fetch rejected before an HTTP response existed. 502 states only the
    // observed proxy fact; it never fabricates an API-side verdict (DR-115).
    return Response.json({
      error: "API_UPSTREAM_UNREACHABLE",
      message: "The API upstream did not answer the proxy request."
    }, { status: 502 });
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
