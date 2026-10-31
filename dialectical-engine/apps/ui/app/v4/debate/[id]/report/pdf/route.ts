import {
  handleInvestigationReportHeadRequest,
  handleInvestigationReportRequest,
  interfaceLocaleFromCookieHeader,
  sessionFromCookieHeader,
  type InvestigationReportRequestInput
} from "@/lib/report/reportRoute";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";

// @react-pdf/renderer and the vendored fonts need Node, as app/debate/[id]/report/route.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** The same identity as the debate's own report: the session cookie, the browser's user-agent and the visitor address. */
async function reportInput(request: Request, context: RouteContext): Promise<InvestigationReportRequestInput> {
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
    signal: request.signal,
    client: () => createServerContractClient(fetch, sessionCookie ?? undefined, userAgent, clientIp)
  };
}

/** The current version of the final report as a PDF attachment (plan 2026-10-31 decision 17). */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleInvestigationReportRequest(await reportInput(request, context));
}

/** GET's status and headers without making the PDF: the page asks it whether to offer the download. */
export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return handleInvestigationReportHeadRequest(await reportInput(request, context));
}
