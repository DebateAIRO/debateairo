import type { ChargeEventRow } from "@debateai/db";

/**
 * A2's call markers and outcomes. Every call is preceded by a committed REQUESTED: the charge's first one (code
 * null) for the first call, `RESEND_STARTED` (the same orderID) for each later one. A call that proves nothing was
 * processed appends a REQUESTED carrying why (`CHARGE_NOT_SENT`, `CHARGE_CREDENTIALS_REFUSED`,
 * `CHARGE_CONFIGURATION_REFUSED`, ruling C-8; D5 5i: the request still stands). Only an outcome that may have reached
 * NETOPIA is a SUBMIT_UNKNOWN (`CHARGE_OUTCOME_UNKNOWN`, `CHARGE_ORDER_EXISTS`, `SUBMIT_INTERRUPTED`), so their count is
 * the count of blind unknowns. Kept apart from renewal.ts (which imports this module, never the other way round), so
 * the send count below and any other reader of the markers need nothing from the renewal service.
 */
export const RESEND_STARTED = "RESEND_STARTED";
/**
 * B1 part 2 (NETOPIA answers 2026-10-21, Q22): the owner's resume command (`pnpm billing:renewal-resume`) released a
 * renewal held by our own setup's refusal for one more send. The marker itself sends nothing, so it is a not-sent
 * marker; the resend that follows writes its own `RESEND_STARTED`.
 */
export const CHARGE_RESUMED = "CHARGE_RESUMED";
export const NOT_SENT_CODES: ReadonlySet<string> = new Set([
  "CHARGE_NOT_SENT", "CHARGE_CREDENTIALS_REFUSED", "CHARGE_CONFIGURATION_REFUSED", CHARGE_RESUMED
]);
/**
 * C-8: the not-sent markers that are our own setup: never closed into the dunning, and the owner is emailed. B1 part 2
 * (Q22): never sent again by itself either (`heldForOwner`).
 */
export const OUR_SETUP_CODES: ReadonlySet<string> = new Set(["CHARGE_CREDENTIALS_REFUSED", "CHARGE_CONFIGURATION_REFUSED"]);

/**
 * B1 part 2 (NETOPIA answers 2026-10-21, Q22: at most 3 saved-card tries a day): whether this charge waits for the
 * owner. Nothing settled it or linked it to a payment (no SUCCEEDED, FAILED or SUBMITTED), and its last call marker or
 * outcome (the last REQUESTED or SUBMIT_UNKNOWN) is NETOPIA's refusal of our own key or settings (`OUR_SETUP_CODES`).
 * Such a renewal is never sent again by itself, since the same setting would refuse it again and spend a try; the
 * owner's resume command (`CHARGE_RESUMED`) releases it for one more send.
 */
export function heldForOwner(events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "errorCode">>): boolean {
  if (events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED" || event.kind === "SUBMITTED")) return false;
  const last = events.filter((event) => event.kind === "REQUESTED" || event.kind === "SUBMIT_UNKNOWN").at(-1);
  return last !== undefined && last.kind === "REQUESTED" && last.errorCode !== null && OUR_SETUP_CODES.has(last.errorCode);
}

/**
 * B1 (NETOPIA answers 2026-10-21, Q22): NETOPIA allows at most 3 saved-card (token) tries a day; we send at most 2 per
 * card in any 24 hours, keeping one spare. Kept inside this module (the source-purity law refuses an exported numeric
 * literal outside a register carrier); `savedCardSendLeft` is how callers ask.
 */
const SAVED_CARD_SENDS_PER_DAY = 2;

/** One charge as `countedSavedCardSends` reads it: its kind and its events in the order the repository returns them. */
export type ChargeSends = Readonly<{ kind: string; events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "errorCode" | "at">> }>;

/**
 * B1 (NETOPIA answers 2026-10-21, Q22): the saved-card sends of these charges since `since` (inclusive). Only RENEWAL
 * charges send a saved card. A send marker is a REQUESTED whose code is null (the charge's first call) or
 * `RESEND_STARTED` (a resend), at or after `since`. It is counted unless the event right after it in the same charge
 * proves nothing reached NETOPIA: a REQUESTED `CHARGE_NOT_SENT` (a transport failure before sending, NETOPIA's HTTP 429,
 * or a preparation that could not read) or a FAILED `CARD_NOT_SAVED` (no call was made). A refusal NETOPIA answered
 * (`CHARGE_CREDENTIALS_REFUSED`, `CHARGE_CONFIGURATION_REFUSED`), an unknown outcome and a marker with nothing after it
 * yet (a call in flight, or a process that died during it) are all counted: the call may have reached NETOPIA.
 */
export function countedSavedCardSends(charges: ReadonlyArray<ChargeSends>, since: Date): number {
  let sends = 0;
  for (const charge of charges) {
    if (charge.kind !== "RENEWAL") continue;
    charge.events.forEach((event, index) => {
      if (event.kind !== "REQUESTED" || (event.errorCode !== null && event.errorCode !== RESEND_STARTED)) return;
      if (event.at.getTime() < since.getTime()) return;
      const next = charge.events[index + 1];
      const neverSent = next !== undefined && ((next.kind === "REQUESTED" && next.errorCode === "CHARGE_NOT_SENT")
        || (next.kind === "FAILED" && next.errorCode === "CARD_NOT_SAVED"));
      if (!neverSent) sends += 1;
    });
  }
  return sends;
}

/** B1 (Q22): whether these charges leave room for one more saved-card send: fewer than 2 counted since `since`. */
export function savedCardSendLeft(charges: ReadonlyArray<ChargeSends>, since: Date): boolean {
  return countedSavedCardSends(charges, since) < SAVED_CARD_SENDS_PER_DAY;
}
