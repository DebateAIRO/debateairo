import {
  handleReportHeadRequest,
  handleReportRequest,
  interfaceLocaleFromCookieHeader,
  sessionFromCookieHeader,
  type ReportRequestInput
} from "@/lib/report/reportRoute";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";

// @react-pdf/renderer and the vendored fonts need Node; Next 15 already keeps
// @react-pdf/renderer external on the server (its built-in serverExternalPackages list).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The same identity as the SSR debate page: the session cookie, the browser's
 * user-agent (the session is bound to it) and the visitor address this UI edge
 * vouches for. Both cookies are read from the request's own header, the /api
 * proxy's rule, rather than from next/headers.
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
