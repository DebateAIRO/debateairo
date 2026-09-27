import { handleReportRequest, interfaceLocaleFromCookieHeader, sessionFromCookieHeader } from "@/lib/report/reportRoute";
import { createServerContractClient, readTrustedClientIp } from "@/lib/serverApi";

// @react-pdf/renderer and the vendored fonts need Node; Next 15 already keeps
// @react-pdf/renderer external on the server (its built-in serverExternalPackages list).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The owner's full report (spec 2026-09-26 §10). The same identity as the SSR
 * debate page: the session cookie, the browser's user-agent (the session is
 * bound to it) and the visitor address this UI edge vouches for. Both cookies
 * are read from the request's own header, the /api proxy's rule, rather than
 * from next/headers.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const cookieHeader = request.headers.get("cookie");
  const sessionCookie = sessionFromCookieHeader(cookieHeader);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const clientIp = readTrustedClientIp(request.headers);
  return handleReportRequest({
    id,
    sessionCookie,
    interfaceLocale: interfaceLocaleFromCookieHeader(cookieHeader),
    now: new Date(),
    client: () => createServerContractClient(fetch, sessionCookie ?? undefined, userAgent, clientIp)
  });
}
