import type { ContractClient } from "@debateai/contract";

/**
 * The person's usage (route B7a), in percent, never in money. It answers 404
 * when billing is off or the site is local, and then no bars are shown, so
 * every failure here is `null`.
 */
export type BillingUsage = Awaited<ReturnType<ContractClient["getBillingUsage"]>>;

export async function readBillingUsage(
  client: Pick<ContractClient, "getBillingUsage"> | undefined
): Promise<BillingUsage | null> {
  try {
    return await client!.getBillingUsage();
  } catch {
    return null;
  }
}
