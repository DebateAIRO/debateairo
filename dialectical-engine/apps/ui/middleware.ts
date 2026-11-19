import { NextResponse, type NextRequest } from "next/server";
import { createNonce, NONCE_REQUEST_HEADER, nonceContentSecurityPolicy } from "./content-security-policy.mjs";
import { firstVisitLocale } from "./lib/i18n/acceptLanguage.js";
import { isLocale, LOCALE_COOKIE } from "./lib/i18n/locales.js";

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
  // A visitor who has not picked a language in the language list sees the one the browser prefers: Romanian for a
  // browser that ranks Romanian above English, English otherwise. Every page reads the language from the locale cookie,
  // so this request alone carries it as that cookie, added last because Next's cookie store keeps the last of two.
  // Nothing is stored and no cookie is set: the language list's own cookie, once written, always wins.
  const browserLocale = isLocale(request.cookies.get(LOCALE_COOKIE)?.value)
    ? null
    : firstVisitLocale(request.headers.get("accept-language"));
  if (browserLocale !== null) {
    const cookie = request.headers.get("cookie")?.trim() ?? "";
    requestHeaders.set("cookie", `${cookie === "" ? "" : `${cookie}; `}${LOCALE_COOKIE}=${browserLocale}`);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", policy);
  // The same address answers in either language, so a cache must never hand one browser's page to another.
  response.headers.append("vary", "Accept-Language");
  return response;
}

export const config = {
  // /api/* carries the static API policy from next.config.mjs; static chunks,
  // the (disabled) image optimizer and the icon are not documents.
  matcher: [{ source: "/((?!api/|_next/static|_next/image|icon.svg).*)" }]
};
