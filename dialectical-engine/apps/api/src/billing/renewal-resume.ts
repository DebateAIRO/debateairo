import type { BillingJobQueries, BillingRepository } from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import { queuePaymentAlert } from "./payment-alert.js";
import { hostCommand } from "./refunds.js";
import { CHARGE_RESUMED, heldForOwner, OUR_SETUP_CODES } from "./renewal-markers.js";
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
  for await (const open of openRenewalPages(deps.jobs, deps.paymentEnvironment, now)) {
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
  }
  deps.audit("billing.renewal.resumed", { resumed, busy });
  return Object.freeze({ resumed, busy });
}

type OpenRenewal = Readonly<{ chargeId: string; subscriptionId: string; createdAt: Date }>;

/**
 * The open NETOPIA RENEWAL charges of this environment made in the last 30 days (the renewal pass's own list), in pages
 * of `PAGE`, oldest first, until a short page and at most `MAX_PAGES`.
 */
async function* openRenewalPages(
  jobs: Pick<BillingJobQueries, "openPaymentCharges">, environment: "sandbox" | "live", now: Date
): AsyncGenerator<ReadonlyArray<OpenRenewal>> {
  let after: Readonly<{ createdAt: Date; chargeId: string }> | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const open = await jobs.openPaymentCharges({
      provider: "netopia", environment, kinds: ["RENEWAL"], createdFrom: new Date(now.getTime() - LOOK_BACK_MS), after, limit: PAGE
    });
    yield open;
    const last = open.at(-1);
    if (open.length < PAGE || last === undefined) return;
    after = Object.freeze({ createdAt: last.createdAt, chargeId: last.chargeId });
  }
}

const DAY_MS = 86_400_000;
/** At most this many lines reach one reminder (as the refund reminder's list). */
const REMINDER_LINES = 40;

export type HeldRenewalReminderDeps = Readonly<{
  repository: Pick<BillingRepository, "charge" | "withTransaction" | "enqueue">;
  jobs: Pick<BillingJobQueries, "openPaymentCharges" | "outboxJobExists">;
  /** The NETOPIA environment whose renewals this API renews (the API's NETOPIA_API_BASE_URL). */
  paymentEnvironment: "sandbox" | "live";
}>;
/** A held renewal as the reminder names it: since its refusal, and the last moment the resume command reaches it. */
type HeldLine = Readonly<{ chargeId: string; heldAt: Date; reachEnds: Date }>;

const utcDay = (date: Date): number => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
const minuteOf = (date: Date): string => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * Follow-up of B1 part 2 (NETOPIA answers 2026-10-21, Q22): the daily owner job's reminder of the renewals held for the
 * owner's resume command. The refusal's O3 tells the owner once; after it nothing else would, and the renewal pass and
 * the resume command both reach only the renewals made in the last 30 days (a held one older than that is no longer
 * sent, and the quarterly summary lists it as PAYMENT_UNSETTLED). So while any renewal is held in that reach, one O3
 * `RENEWAL_HELD` a day at most (dedupe ref `RENEWAL_HELD:<UTC day>`), on every third day since a refusal and every day
 * in the last 3 days before a held renewal leaves the reach, as the refund reminder's rhythm (`refundReminderDue`).
 * Reads only: no lease, no marker. Owner-facing English, content-free (our charge ids, dates, the two commands).
 * Returns how many held renewals the queued reminder names (0 when none was queued).
 */
export async function remindHeldRenewals(deps: HeldRenewalReminderDeps, now: Date): Promise<number> {
  const lines: HeldLine[] = [];
  for await (const open of openRenewalPages(deps.jobs, deps.paymentEnvironment, now)) {
    for (const row of open) {
      const charge = await deps.repository.charge(row.chargeId);
      if (charge === null || charge.paymentProvider !== "netopia" || charge.kind !== "RENEWAL") continue;
      if (!heldForOwner(charge.events)) continue;
      const refusal = charge.events.filter((event) => event.kind === "REQUESTED" && event.errorCode !== null
        && OUR_SETUP_CODES.has(event.errorCode)).at(-1)!;
      lines.push(Object.freeze({
        chargeId: charge.chargeId, heldAt: refusal.at, reachEnds: new Date(charge.createdAt.getTime() + LOOK_BACK_MS)
      }));
    }
  }
  const due = lines.some((line) => {
    const days = Math.round((utcDay(now) - utcDay(line.heldAt)) / DAY_MS);
    return (days > 0 && days % 3 === 0) || line.reachEnds.getTime() - now.getTime() <= 3 * DAY_MS;
  });
  if (!due) return 0;
  const oldest = lines[0]!;
  const queued = await queuePaymentAlert(deps, {
    code: "RENEWAL_HELD",
    reference: lines.length === 1 ? `charge ${oldest.chargeId}` : `${lines.length} held renewals, the oldest charge ${oldest.chargeId}`,
    nextSteps: heldRenewalSteps(lines), dedupeRef: `RENEWAL_HELD:${now.toISOString().slice(0, 10)}`, now
  });
  return queued ? lines.length : 0;
}

/** The reminder's steps (owner-facing English; each owner command is README §14.8's host form on its own line). */
function heldRenewalSteps(lines: ReadonlyArray<HeldLine>): string {
  const one = lines.length === 1;
  const shown = lines.slice(0, REMINDER_LINES).map((line) =>
    `  - charge ${line.chargeId}: waiting since ${line.heldAt.toISOString().slice(0, 10)}, can be sent until ${minuteOf(line.reachEnds)}`);
  const rest = lines.length - shown.length;
  return [
    (one ? "A renewal NETOPIA refused because of our own setup is waiting for you."
      : `${String(lines.length)} renewals NETOPIA refused because of our own setup are waiting for you.`)
      + ` NETOPIA refused our API key or a setting of our account, so the site does not try ${one ? "it" : "them"} again by`
      + ` itself. Nothing was charged and the ${one ? "customer was" : "customers were"} not emailed. After a short grace`
      + " (72 hours from the renewal date; for a payment retry, until 8 days after the first failed payment) the paid"
      + " features pause until the renewal goes through. Fix the cause as the first O3 about it said, run the check"
      + " command below as root on the server until every line shows a tick, then run the second command: it sends every"
      + " renewal held like this once more.",
    "The second command reaches a renewal only in the 30 days after it was made: past the time its line gives, it is no"
      + " longer sent, and the quarterly summary lists it with the payments to check (PAYMENT_UNSETTLED). This reminder"
      + " comes every third day while a renewal waits, and every day in the last 3 days before one can no longer be sent.",
    ...shown,
    ...(rest > 0 ? [`  - and ${String(rest)} more`] : []),
    `  ${hostCommand("billing:check")}`,
    `  ${hostCommand("billing:renewal-resume")}`
  ].join("\n");
}
