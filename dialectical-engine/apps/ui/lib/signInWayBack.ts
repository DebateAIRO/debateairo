import { ContractHttpError } from "@debateai/contract";
import { signInHref } from "./returnPath.js";

/*
 * V4 screen review, 3 Nov (map-f6, wait-f1, journey-d4): a page that finds the person signed out sends them to sign in
 * WITH the way back, so they land on the same page (the same question, its picks and its reading level) afterwards.
 * lib/returnPath.ts decides which addresses sign-in may return to (signInHref, ask-f1 and public-f13: /v4, a V4 debate's
 * map or report, and the other allow-listed pages, with their query); this module only names this page, so the gate,
 * the map page and the report page share that one rule. The sign-in page applies safeReturnPath again.
 */

/** The sign-in page, with the way back to `returnPath` (a path on this site with its query) when sign-in may return there. */
export function signInHrefFor(returnPath: string): string {
  return signInHref(returnPath);
}

/** This page's own path and query: the way back after signing in ("/" without a window). */
export function currentReturnPath(): string {
  if (typeof window === "undefined") return "/";
  const { pathname, search } = window.location;
  return `${pathname}${search}`;
}

/** The sign-in page with the way back to this page. */
export function signInHrefHere(): string {
  return signInHrefFor(currentReturnPath());
}

/** wait-f1: the server said the person is not signed in (their sign-in ended): a 401, never a lost connection. */
export function isSignedOut(failure: unknown): boolean {
  return failure instanceof ContractHttpError && failure.code === "SESSION_REQUIRED";
}
