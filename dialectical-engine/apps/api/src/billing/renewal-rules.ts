import { addBusinessDays, type SubscriptionEvent, type SubscriptionState } from "@debateai/billing-core";

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * Ruling Q-1: how long a renewal waits out an outage (the tax service down, NETOPIA unreachable, a charge whose outcome
 * is still unknown) before the normal dunning starts. A function, not an exported number (the source audit's rule).
 */
export function renewalPendingMs(): number {
  return 72 * 3_600_000;
}

/**
 * Q-1: the instant the outage window of the renewal of the period starting at `periodStart` ends: 72 hours after the
 * renewal fell due, which is that period start (the old period's end), or a notice postponement's end when A7
 * postponed this renewal past it. A postponement of another period, or a state that has moved past this period,
 * never stretches it.
 */
export function renewalPendingUntil(
  state: Pick<SubscriptionState, "currentPeriodEnd" | "renewalPostponedUntil">, periodStart: Date
): Date {
  const postponed = state.renewalPostponedUntil;
  const samePeriod = state.currentPeriodEnd !== null && state.currentPeriodEnd.getTime() === periodStart.getTime();
  const dueAt = samePeriod && postponed !== null && postponed.getTime() > periodStart.getTime() ? postponed : periodStart;
  return new Date(dueAt.getTime() + renewalPendingMs());
}

/**
 * How far back the unverified-renewal pass looks for a period start: the 72 hours of Q-1 past a due instant that A7's
 * notice may have pushed `noticeBusinessDays` business days out (two calendar days per business day and a weekend
 * either side always covers it, with no holiday table, Q-6). `holdPending` decides the exact window per renewal.
 */
export function unverifiedLookBackMs(noticeBusinessDays: number): number {
  return renewalPendingMs() + (2 * noticeBusinessDays + 3) * 86_400_000;
}

/**
 * Where a subscription's dunning stands, read from the history, never from charge rows (Q-1: an attempt the tax
 * service could not price has none): when its first attempt failed (the latest PAST_DUE's `first_failed_at`, else the
 * fold's `pastDueSince`), when the latest attempt failed (that PAST_DUE's own `at`) and how many attempts failed (its
 * `attempt`, else the fold's `retryIndex + 1`). Null while the subscription is not PAST_DUE.
 */
export function dunningProgress(
  events: ReadonlyArray<SubscriptionEvent>, state: Pick<SubscriptionState, "status" | "pastDueSince" | "retryIndex">
): Readonly<{ firstFailedAt: Date; lastFailedAt: Date; failedAttempts: number }> | null {
  if (state.status !== "PAST_DUE" || state.pastDueSince === null) return null;
  const latest = [...events].reverse().find((event) => event.kind === "PAST_DUE");
  if (latest === undefined) return null;
  const recorded = typeof latest.data.first_failed_at === "string" ? new Date(latest.data.first_failed_at) : null;
  const attempt = latest.data.attempt;
  return Object.freeze({
    firstFailedAt: recorded !== null && !Number.isNaN(recorded.getTime()) ? recorded : state.pastDueSince,
    lastFailedAt: latest.at,
    failedAttempts: typeof attempt === "number" && Number.isSafeInteger(attempt) && attempt >= 1 ? attempt : state.retryIndex + 1
  });
}

function netOf(event: SubscriptionEvent): number | null {
  const value = event.data.recurring_net_micros;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Terms §12 / spec §1.8: the subscription's own recurring net price, read from its history, never from the current
 * `billingPlans`. `recurring_net_micros` is written at ACTIVATED (P9b), UPGRADED and DOWNGRADE_SCHEDULED (D6b), next to
 * `announced_total_micros`. `currentMicros` is the net of the plan paid for now (D6b's upgrade proration reads it as
 * its old net); `nextRenewalMicros` is what the next renewal charges (a scheduled downgrade's net, once scheduled).
 * A DOWNGRADED at the renewal, or a RECOVERED at the scheduled plan, makes the scheduled net the current one. Null:
 * the history never recorded one (a writer's bug; P11a charges nothing rather than guess).
 */
export function recurringNetOf(events: ReadonlyArray<SubscriptionEvent>): Readonly<{
  currentMicros: number | null;
  nextRenewalMicros: number | null;
}> {
  let current: number | null = null;
  let scheduled: Readonly<{ planId: SubscriptionEvent["planId"]; micros: number | null }> | null = null;
  // An if chain, not a switch: only four of the kinds move the price (the source audit wants every switch exhaustive).
  for (const event of events) {
    if (event.kind === "ACTIVATED" || event.kind === "UPGRADED") {
      current = netOf(event);
      scheduled = null;
    } else if (event.kind === "DOWNGRADE_SCHEDULED") {
      scheduled = Object.freeze({ planId: event.planId, micros: netOf(event) });
    } else if (event.kind === "DOWNGRADED") {
      if (scheduled !== null) current = scheduled.micros;
      scheduled = null;
    } else if (event.kind === "RECOVERED" && scheduled !== null && event.planId === scheduled.planId) {
      current = scheduled.micros;
      scheduled = null;
    }
  }
  return Object.freeze({ currentMicros: current, nextRenewalMicros: scheduled === null ? current : scheduled.micros });
}

export type RenewalNoticeDecision =
  | Readonly<{ kind: "CHARGE" }>
  | Readonly<{ kind: "NOTICE"; until: Date }>
  | Readonly<{ kind: "WAIT"; until: Date }>;

/**
 * A7's notice rule (kept for NETOPIA until N-23 is answered): a charge whose amount changed needs a notice at least
 * `noticeBusinessDays` business days before it. The announced total is set at activation, upgrade, downgrade and every
 * notice (P2's fold).
 */
export function renewalNoticeDecision(input: Readonly<{
  freshTotalMicros: number;
  announcedTotalMicros: number | null;
  lastNoticeAt: Date | null;
  now: Date;
  noticeBusinessDays: number;
}>): RenewalNoticeDecision {
  if (input.announcedTotalMicros === null || input.freshTotalMicros !== input.announcedTotalMicros) {
    return Object.freeze({ kind: "NOTICE", until: addBusinessDays(input.now, input.noticeBusinessDays) });
  }
  if (input.lastNoticeAt !== null) {
    const earliest = addBusinessDays(input.lastNoticeAt, input.noticeBusinessDays);
    if (earliest.getTime() > input.now.getTime()) return Object.freeze({ kind: "WAIT", until: earliest });
  }
  return Object.freeze({ kind: "CHARGE" });
}

/** The same instant `years` later; a 29 February falls back to the 28th in a common year. */
export function addYearsClamped(from: Date, years: number): Date {
  const target = new Date(Date.UTC(
    from.getUTCFullYear() + years, from.getUTCMonth(), 1,
    from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()
  ));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  return target;
}

/** Terms §12's yearly reminder: the anniversary number when `now` is within `windowDays` after one. */
export function anniversaryDue(activatedAt: Date, now: Date, windowDays: number): number | null {
  let years = now.getUTCFullYear() - activatedAt.getUTCFullYear();
  if (years >= 1 && addYearsClamped(activatedAt, years).getTime() > now.getTime()) years -= 1;
  if (years < 1) return null;
  return now.getTime() < addDays(addYearsClamped(activatedAt, years), windowDays).getTime() ? years : null;
}

/**
 * How long before its period ends a renewal is due (P11a's `dueRenewals` horizon). An upgrade inside this lead
 * could race the renewal charge, so P12b's view and P12c's quote refuse it; one function, so the two never drift.
 */
export function renewalLeadMs(): number {
  return 5 * 60_000;
}
