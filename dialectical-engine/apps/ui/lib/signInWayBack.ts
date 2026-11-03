import { ContractHttpError } from "@debateai/contract";

/*
 * V4 screen review, 3 Nov (map-f6, wait-f1, journey-d4): a page that finds the person signed out sends them to sign in
 * WITH the way back, so they land on the same page (the same question, its picks and its reading level) afterwards. The
 * sign-in page reads `?next=` and keeps only a path on this site (lib/returnPath.ts, safeReturnPath, which the sign-in
 * page and LoginFlow already apply), so this module only names the page; it never decides what is safe.
 */

/** The sign-in page, with the way back to `returnPath` (a path on this site with its query). */
export function signInHrefFor(returnPath: string): string {
  return `/login?next=${encodeURIComponent(returnPath)}`;
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
