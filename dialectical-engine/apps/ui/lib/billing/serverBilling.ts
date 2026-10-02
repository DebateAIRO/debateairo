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
 * The colleague's age gate (PR #41, 8k; ruling R3-2): an account created before the date-of-birth field owes a
 * one-time check, which the home page, AuthGate and LoginFlow show before anything else. A card page uses no AuthGate,
 * so it asks here, with the person's own session, exactly as apps/ui/app/page.tsx does: a failed read owes nothing
 * (the session itself was already validated, and the interstitial re-reads on arrival).
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
