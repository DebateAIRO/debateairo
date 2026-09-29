import { AgeConfirmationStatusSchema } from "@debateai/contract";
import { safeReturnPath } from "@/lib/returnPath";

/**
 * Where the one-time date-of-birth interstitial for existing accounts shows (design document
 * Turn 8 · 8k): the home page renders it in place of itself while the check is owed.
 */
export const AGE_CONFIRMATION_PATH = "/";

/**
 * True when the signed-in account still owes its one-time age check. A failed read answers
 * false: the session itself was already validated, and the interstitial re-reads on arrival.
 * Its own same-origin request, so every page that mocks `@/lib/api` keeps working unchanged.
 */
export async function ageConfirmationRequired(fetchImplementation: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImplementation("/api/v1/auth/age-confirmation", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!response.ok) return false;
    return AgeConfirmationStatusSchema.parse(await response.json()).status === "required";
  } catch {
    return false;
  }
}

/** The interstitial, carrying the reader's destination when it is one sign-in may return to. */
export function ageConfirmationHref(next: string | null | undefined): string {
  const destination = safeReturnPath(next);
  return next === null || next === undefined || destination !== next
    ? AGE_CONFIRMATION_PATH
    : `${AGE_CONFIRMATION_PATH}?next=${encodeURIComponent(next)}`;
}
