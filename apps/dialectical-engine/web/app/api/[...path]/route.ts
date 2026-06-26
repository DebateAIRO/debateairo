const COORDINATOR_URL = process.env.DIALECTICAL_COORDINATOR_URL || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const LOGGER_MODULE = "../../../lib/observability/logger";
const MAX_RESPONSE_SNIPPET_LENGTH = 1024;

type ProxyLogger = {
  warn: (event: string, payload: Record<string, unknown>) => void | Promise<void>;
  error: (event: string, payload: Record<string, unknown>) => void | Promise<void>;
};

type ProxyLogPayload = {
  method: string;
  path: string;
  upstream: string;
  upstreamPath: string;
  status?: number;
  statusText?: string;
  responseSnippet?: string;
  error?: string;
  stack?: string;
};

function shouldLogProxyBoundary() {
  return process.env.NODE_ENV !== "production";
}

function redactSearchParams(searchParams: URLSearchParams) {
  const redacted = new URLSearchParams();
  const secretPattern = /token|secret|key|password|authorization|credential|session/i;

  for (const [key, value] of searchParams.entries()) {
    redacted.append(key, secretPattern.test(key) ? "[redacted]" : value);
  }

  return redacted.toString();
}

function safeUrlParts(url: URL) {
  const redactedSearch = redactSearchParams(url.searchParams);
  const upstreamPath = `${url.pathname}${redactedSearch ? `?${redactedSearch}` : ""}`;

  return {
    upstream: `${url.origin}${upstreamPath}`,
    upstreamPath,
  };
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      error: error.message,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
  };
}

async function loadLogger(): Promise<ProxyLogger | null> {
  try {
    const loggerModulePath = LOGGER_MODULE;
    const module = (await import(loggerModulePath)) as { Logger?: ProxyLogger };
    return module.Logger ?? null;
  } catch {
    return null;
  }
}

async function logProxyNonOk(payload: ProxyLogPayload) {
  if (!shouldLogProxyBoundary()) {
    return;
  }

  const logger = await loadLogger();
  if (typeof payload.status === "number" && payload.status >= 500) {
    await logger?.error("api.proxy.non_ok", payload);
    return;
  }

  await logger?.warn("api.proxy.non_ok", payload);
}

async function logProxyError(payload: ProxyLogPayload) {
  if (!shouldLogProxyBoundary()) {
    return;
  }

  const logger = await loadLogger();
  await logger?.error("api.proxy.fetch_failed", payload);
}

async function readSafeResponseSnippet(response: Response) {
  try {
    return (await response.clone().text()).slice(0, MAX_RESPONSE_SNIPPET_LENGTH);
  } catch (error) {
    return `[unavailable: ${normalizeError(error).error}]`;
  }
}

async function proxyApi(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${path.join("/")}${sourceUrl.search}`, COORDINATOR_URL);
  const proxiedPath = safeUrlParts(new URL(`/api/${path.join("/")}${sourceUrl.search}`, sourceUrl.origin)).upstreamPath;
  const { upstream, upstreamPath } = safeUrlParts(targetUrl);
  const headers = new Headers(request.headers);
  headers.delete("host");

  let response: Response;

  try {
    response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
    });
  } catch (error) {
    await logProxyError({
      method: request.method,
      path: proxiedPath,
      upstream,
      upstreamPath,
      ...normalizeError(error),
    });
    throw error;
  }

  if (!response.ok) {
    await logProxyNonOk({
      method: request.method,
      path: proxiedPath,
      upstream,
      upstreamPath,
      status: response.status,
      statusText: response.statusText,
      responseSnippet: await readSafeResponseSnippet(response),
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyApi(request, context);
}

export function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyApi(request, context);
}

export function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyApi(request, context);
}

export function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyApi(request, context);
}

export function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxyApi(request, context);
}
