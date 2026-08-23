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
  "range",
  "x-user-dev-token"
] as const);

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
  const clientIp = normalizeClientIp(request.headers.get(TRUSTED_CLIENT_IP_HEADER));
  if (clientIp !== null) headers.set("x-forwarded-for", clientIp);
  return headers;
}

async function proxyApi(request: Request, context: ProxyContext): Promise<Response> {
  const { path } = await context.params;
  const target = createTargetUrl(request, path);
  const headers = createUpstreamHeaders(request);

  const init: RequestInit = BODYLESS_METHODS.has(request.method)
    ? { method: request.method, headers, cache: "no-store" }
    : { method: request.method, headers, body: await request.arrayBuffer(), cache: "no-store" };
  const response = await fetch(target, init);

  return new Response(
    request.method === "HEAD" || BODYLESS_STATUSES.has(response.status) ? null : response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
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
