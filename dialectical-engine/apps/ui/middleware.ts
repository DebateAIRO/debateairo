import { NextResponse, type NextRequest } from "next/server";
import { createNonce, NONCE_REQUEST_HEADER, nonceContentSecurityPolicy } from "./content-security-policy.mjs";

/**
 * F-08 / L3-F3: every document gets a per-request nonce policy.
 *
 * Next reads the nonce from the REQUEST `content-security-policy` header
 * (app-render) and stamps it on its bootstrap and flight-data scripts; the
 * root layout reads `x-nonce` for the app-owned theme bootstrap. The RESPONSE
 * header is the policy the browser enforces. server.mjs strips any
 * caller-supplied copy of these headers before Next runs and pre-sets a
 * fallback policy that this one replaces.
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
