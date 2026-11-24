import { previewBuyerAdmits, previewBuyerNeedsApproval, type PreviewAsksOpenTo, type PreviewProviderTestConfig } from "@debateai/providers";
import type { BillingBuyerVerdict } from "./billing/refusal.js";

/**
 * The Owner's list of approved buyers as the buyer rule reads it (migration 0186, staff.preview_buyer_listed; main.ts
 * hands PostgresPreviewBuyerRepository on the request login). One yes or no for the signed-in account.
 */
export interface PreviewApprovedBuyers {
  listed(userId: string): Promise<boolean>;
}

/** The one line an unreadable list leaves: content-free, no account, so the morning check can count it. */
export const PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE = JSON.stringify({ event: "api.preview.buyer_check_unavailable" });
/** How long the pay button waits for the list's answer before it refuses. */
const LISTED_TIMEOUT_MS = 3_000;

/**
 * Who may start a purchase on the preview. The team line first, by previewBuyerAdmits, unchanged: a team member or, where
 * anyone may buy, any signed-in account, never reads the database. Where previewBuyerNeedsApproval says the Owner's list
 * counts (everyone-with-listed-buyers on the sandbox, an account not on the team line), the list decides: listed ADMIT,
 * not listed REFUSE. A list that cannot be read (no port, a throw, an answer that is not a plain yes or no, or no answer
 * in time) is UNAVAILABLE, so the purchase is refused and nothing is charged.
 */
export async function previewBuyerVerdict(input: Readonly<{
  config: PreviewProviderTestConfig | undefined;
  teamUserIds: readonly string[] | undefined;
  asksOpenTo: PreviewAsksOpenTo | undefined;
  livePayments: boolean;
  userId: string | undefined;
  approved: PreviewApprovedBuyers | undefined;
  log: (line: string) => void;
  timeoutMs?: number;
}>): Promise<BillingBuyerVerdict> {
  if (previewBuyerAdmits(input.config, input.teamUserIds, input.asksOpenTo, input.livePayments, input.userId)) return "ADMIT";
  if (!previewBuyerNeedsApproval(input.config, input.teamUserIds, input.asksOpenTo, input.livePayments, input.userId)) return "REFUSE";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (input.approved === undefined) throw new Error("PREVIEW_BUYERS_UNAVAILABLE");
    const answer = input.approved.listed(input.userId!);
    const late = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("PREVIEW_BUYERS_UNAVAILABLE")), input.timeoutMs ?? LISTED_TIMEOUT_MS); });
    // A late answer after the refusal is dropped, never read.
    void answer.catch(() => undefined);
    const listed: unknown = await Promise.race([answer, late]);
    if (typeof listed !== "boolean") throw new Error("PREVIEW_BUYERS_UNAVAILABLE");
    return listed ? "ADMIT" : "REFUSE";
  } catch {
    input.log(PREVIEW_BUYER_CHECK_UNAVAILABLE_LINE);
    return "UNAVAILABLE";
  } finally {
    clearTimeout(timer);
  }
}
