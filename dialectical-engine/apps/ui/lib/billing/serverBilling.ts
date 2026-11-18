import { headers } from "next/headers";
import { ContractHttpError } from "@debateai/contract";
import { createServerContractClient, readTrustedClientIp } from "../serverApi.js";

/** What one plans read tells a billing page: whether billing is on, and whether card payments are test-only. */
export type BillingState = Readonly<{ on: boolean; testMode: boolean }>;

/**
 * P8a's public plans route answers 404 when billing is off or in local mode (spec §2.2 rule 1), and so does every
 * billing page that reads it. Any other failure keeps the page: its own calls then say "try again in a minute".
 * `testMode` is true only when the answer names the sandbox: it is read from the running server at every request,
 * so the test-mode note goes away by itself when the server is switched to live payments. A failed read or an answer
 * that names no environment shows no note.
 */
export async function billingState(): Promise<BillingState> {
  const headerStore = await headers();
  try {
    const answer = await createServerContractClient(
      fetch, undefined, headerStore.get("user-agent") ?? undefined, readTrustedClientIp(headerStore)
    ).getBillingPlans();
    return { on: true, testMode: answer.environment === "sandbox" };
  } catch (failure) {
    return { on: !(failure instanceof ContractHttpError && failure.status === 404), testMode: false };
  }
}

export async function billingIsOn(): Promise<boolean> {
  return (await billingState()).on;
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
