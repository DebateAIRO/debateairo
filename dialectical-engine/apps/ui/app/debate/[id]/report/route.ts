import {
  handleReportHeadRequest,
  handleReportRequest,
  interfaceLocaleFromCookieHeader,
  sessionFromCookieHeader,
  type ReportRequestInput
} from "@/lib/report/reportRoute";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";

// The report is made in a worker_threads worker (lib/report/reportRenderWorker.ts, NV-27), which needs Node; the
// worker loads @react-pdf/renderer and the vendored fonts itself, outside this route's bundle.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The same identity as the SSR debate page: the session cookie, the browser's
 * user-agent (the session is bound to it) and the visitor address this UI edge
 * vouches for. Both cookies are read from the request's own header, the /api
 * proxy's rule, rather than from next/headers. Sec-Fetch-Site is passed raw, so
 * a request another site started is refused before any read (NV-06).
 */
async function reportInput(request: Request, context: RouteContext): Promise<ReportRequestInput> {
  const { id } = await context.params;
  const cookieHeader = request.headers.get("cookie");
  const sessionCookie = sessionFromCookieHeader(cookieHeader);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const clientIp = readTrustedClientIp(request.headers);
  return {
    id,
    sessionCookie,
    interfaceLocale: interfaceLocaleFromCookieHeader(cookieHeader),
    now: new Date(),
    // A download the browser abandons stops waiting for a render place, and is never rendered.
    signal: request.signal,
    fetchSite: request.headers.get("sec-fetch-site"),
    client: () => createServerContractClient(fetch, sessionCookie ?? undefined, userAgent, clientIp)
  };
}

/** The owner's full report as a PDF attachment (spec 2026-09-26 §10). */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleReportRequest(await reportInput(request, context));
}

/** GET's status and headers without making the PDF. */
export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return handleReportHeadRequest(await reportInput(request, context));
}
