import { NextResponse, type NextRequest } from "next/server";
import { createNonce, NONCE_REQUEST_HEADER, nonceContentSecurityPolicy } from "./content-security-policy.mjs";

/**
 * F-08 / L3-F3: every document gets a per-request nonce policy, the checkout and card pages included (spec 2026-10-05
 * §2.18: NETOPIA's page is its own site, reached by a top-level navigation). Next reads the nonce from the REQUEST
 * `content-security-policy` header and stamps it on its scripts; the root layout reads `x-nonce`. The RESPONSE header is
 * the policy the browser enforces; server.mjs strips caller-supplied copies and pre-sets the fallback this replaces.
 */
export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const policy = nonceContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_REQUEST_HEADER, nonce);
  requestHeaders.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  // /api/* carries the static API policy from next.config.mjs; static chunks,
  // the (disabled) image optimizer and the icon are not documents.
  matcher: [{ source: "/((?!api/|_next/static|_next/image|icon.svg).*)" }]
};
