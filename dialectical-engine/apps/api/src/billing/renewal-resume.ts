import type { BillingJobQueries, BillingRepository } from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import { CHARGE_RESUMED, heldForOwner } from "./renewal-markers.js";
import { chargeEvent } from "./rows.js";

/** One page of the open charges; the command pages until a short page, at most `MAX_PAGES` (the renewal pass's own). */
const PAGE = 50;
const MAX_PAGES = 20;
/** How far back the renewal pass looks for an open renewal (§2.14's horizon); a held renewal older than this is not its. */
const LOOK_BACK_MS = 30 * 86_400_000;

export type RenewalResumeDeps = Readonly<{
  repository: Pick<BillingRepository, "charge" | "withTransaction" | "appendChargeEvent">;
  jobs: Pick<BillingJobQueries, "openPaymentCharges" | "withSubscriptionLease">;
  /** The NETOPIA environment whose renewals this API renews (the API's NETOPIA_API_BASE_URL). */
  paymentEnvironment: "sandbox" | "live";
  clock: () => Date;
  audit: BillingAudit;
}>;
export type RenewalResumeResult = Readonly<{ resumed: number; busy: number }>;

/**
 * B1 part 2 (NETOPIA answers 2026-10-21, Q22: at most 3 saved-card tries a day): the owner's resume command
 * (`pnpm billing:renewal-resume`). A renewal NETOPIA refused for our own key or settings is never sent again by itself
 * (`heldForOwner`); once the owner fixed the cause, this releases every such renewal for ONE more send. It pages the
 * open NETOPIA RENEWAL charges of this environment made in the last 30 days (the renewal pass's own list) and, under
 * each charge's subscription lease (so the renewal tick never acts on it at the same moment), reads the charge again and
 * appends a REQUESTED `CHARGE_RESUMED` while it is still held. Nothing is sent here: the next renewal tick, within a
 * minute, resends it through its usual path (the daily cap, the card and the payer still apply) with a fresh 24-hour
 * window. A charge whose lease is taken is counted `busy` and left for a second run. A second run finds nothing held
 * (Review Focus 5). One content-free audit line with the two counts.
 */
export async function resumeHeldRenewals(deps: RenewalResumeDeps): Promise<RenewalResumeResult> {
  const now = deps.clock();
  let resumed = 0;
  let busy = 0;
  let after: Readonly<{ createdAt: Date; chargeId: string }> | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const open = await deps.jobs.openPaymentCharges({
      provider: "netopia", environment: deps.paymentEnvironment, kinds: ["RENEWAL"],
      createdFrom: new Date(now.getTime() - LOOK_BACK_MS), after, limit: PAGE
    });
    for (const row of open) {
      const leased = await deps.jobs.withSubscriptionLease(row.subscriptionId, async (): Promise<boolean> => {
        const charge = await deps.repository.charge(row.chargeId);
        if (charge === null || charge.paymentProvider !== "netopia" || charge.kind !== "RENEWAL") return false;
        if (!heldForOwner(charge.events)) return false;
        const inserted = await deps.repository.withTransaction((client) => deps.repository.appendChargeEvent(client,
          chargeEvent(charge.chargeId, "REQUESTED", deps.clock(), {
            providerPaymentId: null, amountMicros: charge.totalMicros, errorCode: CHARGE_RESUMED
          })));
        return inserted === "INSERTED";
      });
      if (leased.kind === "BUSY") busy += 1;
      else if (leased.value) resumed += 1;
    }
    const last = open.at(-1);
    if (open.length < PAGE || last === undefined) break;
    after = Object.freeze({ createdAt: last.createdAt, chargeId: last.chargeId });
  }
  deps.audit("billing.renewal.resumed", { resumed, busy });
  return Object.freeze({ resumed, busy });
}
