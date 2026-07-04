import { Logger } from "../../../lib/observability/logger";
import { recordSuspiciousScoringResponse } from "../../../lib/scoringResponse";

const COORDINATOR_URL = process.env.DIALECTICAL_COORDINATOR_URL || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const MAX_RESPONSE_SNIPPET_LENGTH = 1024;

type ProxyLogPayload = {
  method: string;
  path: string;
  upstream: string;
  upstreamPath: string;
  requestId: string;
  debateId?: string;
  traceId?: string;
  status?: number;
  statusText?: string;
  responseSnippet?: string;
  error?: string;
  code?: string;
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
    const errorWithCode = error as Error & { code?: unknown };
    const code = typeof errorWithCode.code === "string" ? errorWithCode.code : undefined;

    return {
      error: error.message,
      code,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
  };
}

async function logProxyNonOk(payload: ProxyLogPayload) {
  if (!shouldLogProxyBoundary()) {
    return;
  }

  if (typeof payload.status === "number" && payload.status >= 500) {
    Logger.error("api.proxy.non_ok", {
      source: "api-proxy",
      message: "Upstream API proxy returned a non-OK server response.",
      context: payload,
    });
    return;
  }

  Logger.warn("api.proxy.non_ok", {
    source: "api-proxy",
    message: "Upstream API proxy returned a non-OK response.",
    context: payload,
  });
}

async function logProxyError(payload: ProxyLogPayload) {
  if (!shouldLogProxyBoundary()) {
    return;
  }

  try {
    Logger.error("api.proxy.fetch_failed", {
      source: "api-proxy",
      message: "Upstream API proxy fetch failed.",
      context: payload,
    });
  } catch {
    // Logging failures must never replace the original fetch exception.
  }
}

async function readSafeResponseSnippet(response: Response) {
  try {
    return (await response.clone().text()).slice(0, MAX_RESPONSE_SNIPPET_LENGTH);
  } catch (error) {
    return `[unavailable: ${normalizeError(error).error}]`;
  }
}

async function recordSuspiciousScoringProxyResponse(response: Response, path: string[], request: Request) {
  if (request.method !== "GET" || path.length !== 3 || path[0] !== "debates" || path[2] !== "scoring") {
    return;
  }

  try {
    await recordSuspiciousScoringResponse(
      await response.clone().json(),
      {
        debateId: path[1],
        operation: "api.proxy.debate_scoring",
      },
      Logger
    );
  } catch {
    // Suspicious-response logging must never consume or alter the proxied response.
  }
}

function getRequestCorrelation(request: Request, path: string[]) {
  const requestId = request.headers.get("x-request-id") || request.headers.get("request-id") || crypto.randomUUID();
  const traceId = request.headers.get("x-trace-id") || request.headers.get("traceparent") || undefined;
  const debateId = path.length >= 2 && path[0] === "debates" ? path[1] : undefined;

  return {
    requestId,
    ...(debateId ? { debateId } : {}),
    ...(traceId ? { traceId } : {}),
  };
}

async function proxyApi(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${path.join("/")}${sourceUrl.search}`, COORDINATOR_URL);
  const proxiedPath = safeUrlParts(new URL(`/api/${path.join("/")}${sourceUrl.search}`, sourceUrl.origin)).upstreamPath;
  const { upstream, upstreamPath } = safeUrlParts(targetUrl);
  const correlation = getRequestCorrelation(request, path);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("expect");

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
      ...correlation,
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
      ...correlation,
      status: response.status,
      statusText: response.statusText,
      responseSnippet: await readSafeResponseSnippet(response),
    });
  } else {
    await recordSuspiciousScoringProxyResponse(response, path, request);
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
