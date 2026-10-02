import { headers } from "next/headers";
import { ContractHttpError } from "@debateai/contract";
import { createServerContractClient, readTrustedClientIp } from "../serverApi.js";

/**
 * P8a's public plans route answers 404 when billing is off or in local mode (spec §2.2 rule 1), and so does every
 * billing page that reads it. Any other failure keeps the page: its own calls then say "try again in a minute".
 */
export async function billingIsOn(): Promise<boolean> {
  const headerStore = await headers();
  try {
    await createServerContractClient(
      fetch, undefined, headerStore.get("user-agent") ?? undefined, readTrustedClientIp(headerStore)
    ).getBillingPlans();
    return true;
  } catch (failure) {
    return !(failure instanceof ContractHttpError && failure.status === 404);
  }
}

/**
 * Spec §2.10: a card page requires sign-in, and a cookie alone is not a session. The page reads it with the person's
 * own session exactly as apps/ui/app/login/page.tsx does. Only a 401 means "not signed in" (an expired or revoked
 * session); any other failure keeps the page, whose own calls then say "try again", just as billingIsOn treats only
 * a 404 as "off". /login shows its form whenever this read fails, so the redirect a page makes on false cannot loop.
 */
export async function sessionConfirmed(sessionToken: string): Promise<boolean> {
  const headerStore = await headers();
  try {
    await createServerContractClient(
      fetch, sessionToken, headerStore.get("user-agent") ?? undefined, readTrustedClientIp(headerStore)
    ).readSession();
    return true;
  } catch (failure) {
    return !(failure instanceof ContractHttpError && failure.status === 401);
  }
}

/**
 * The colleague's age gate (PR #41, 8k; ruling R3-2): an account created before the date-of-birth field owes a
 * one-time check, which the home page, AuthGate and LoginFlow show before anything else. A card page uses no AuthGate,
 * so it asks here, with the person's own session, exactly as apps/ui/app/page.tsx does: a failed read owes nothing
 * (the page has already checked the session itself through sessionConfirmed, and the interstitial re-reads on arrival).
 */
export async function ageConfirmationOwed(sessionToken: string): Promise<boolean> {
  const headerStore = await headers();
  try {
    return (await createServerContractClient(
      fetch, sessionToken, headerStore.get("user-agent") ?? undefined, readTrustedClientIp(headerStore)
    ).readAgeConfirmation()).status === "required";
  } catch {
    return false;
  }
}
