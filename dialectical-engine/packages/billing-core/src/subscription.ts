import { TypedDomainError, exhaustive } from "@debateai/kernel";
import type { PlanId } from "@debateai/register";
import { periodBoundary } from "./calendar.js";

export type SubscriptionEventKind =
  | "CREATED" | "ACTIVATED" | "RENEWED" | "PAST_DUE" | "RECOVERED" | "UPGRADED" | "DOWNGRADE_SCHEDULED"
  | "DOWNGRADED" | "CANCEL_REQUESTED" | "CANCEL_REVOKED" | "ENDED" | "WITHDRAWN" | "SUSPENDED" | "RESUMED"
  | "CARD_CHANGED" | "ERASURE_STOPPED" | "RENEWAL_POSTPONED" | "RENEWAL_NOTICE_SENT";

export const SUBSCRIPTION_EVENT_KINDS: ReadonlyArray<SubscriptionEventKind> = Object.freeze([
  "CREATED", "ACTIVATED", "RENEWED", "PAST_DUE", "RECOVERED", "UPGRADED", "DOWNGRADE_SCHEDULED", "DOWNGRADED",
  "CANCEL_REQUESTED", "CANCEL_REVOKED", "ENDED", "WITHDRAWN", "SUSPENDED", "RESUMED", "CARD_CHANGED",
  "ERASURE_STOPPED", "RENEWAL_POSTPONED", "RENEWAL_NOTICE_SENT"
]);

export type SubscriptionStatus = "CREATED" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "ENDED" | "WITHDRAWN";
export type EndedCause = "CANCEL" | "DUNNING" | "ERASURE" | "ABANDONED" | "DISPUTE";
export type SubscriptionEventData = Readonly<Record<string, string | number | boolean | null>>;

export type SubscriptionEvent = Readonly<{
  eventId: string; subscriptionId: string; ownerRef: string; kind: SubscriptionEventKind; at: Date; planId: PlanId;
  periodAnchorAt: Date | null; xmoneyOrderId: string | null; xmoneyCustomerId: string | null; cardRef: string | null;
  data: SubscriptionEventData;
}>;

export type SubscriptionState = Readonly<{
  subscriptionId: string; ownerRef: string; planId: PlanId; status: SubscriptionStatus;
  periodAnchorAt: Date | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  cancelRequested: boolean; scheduledDowngradePlanId: PlanId | null;
  xmoneyOrderId: string | null; xmoneyCustomerId: string | null; cardRef: string | null;
  activatedAt: Date | null; endedCause: EndedCause | null; pastDueSince: Date | null; retryIndex: number;
  renewalPostponedUntil: Date | null;
  /** A7: the recurring total the person was last told about (checkout, upgrade, downgrade, notice M3). */
  announcedTotalMicros: number | null;
  lastNoticeAt: Date | null;
  /**
   * The xMoney system (stage or live) whose order, customer and card ids this subscription holds — from the CREATED
   * event's `data.xmoney_environment`. The two systems number their ids separately, so renewals, charge matching and
   * the stage-to-live switch all read it (P1b, P6a).
   */
  xmoneyEnvironment: "stage" | "live";
}>;

type Working = {
  subscriptionId: string; ownerRef: string; planId: PlanId; status: SubscriptionStatus;
  periodAnchorAt: Date | null; periodIndex: number; periodStart: Date | null; periodEnd: Date | null;
  cancelRequested: boolean; scheduledDowngradePlanId: PlanId | null; xmoneyOrderId: string | null;
  xmoneyCustomerId: string | null; cardRef: string | null; activatedAt: Date | null; endedCause: EndedCause | null;
  pastDueSince: Date | null; retryIndex: number; renewalPostponedUntil: Date | null;
  announcedTotalMicros: number | null; lastNoticeAt: Date | null; xmoneyEnvironment: "stage" | "live";
};

const ENDED_CAUSES: ReadonlySet<string> = new Set<EndedCause>(["CANCEL", "DUNNING", "ERASURE", "ABANDONED", "DISPUTE"]);
/** P9b: a live plan paid with a card from a blocked country ends at once, without a cancel request. */
const BLOCKED_CARD_REASON = "CARD_COUNTRY_BLOCKED";

function illegal(detail: string): never {
  throw new TypedDomainError("BILLING_SUBSCRIPTION_EVENTS_INVALID", `subscription events are not a legal history: ${detail}`);
}

function requireStatus(state: Working, event: SubscriptionEvent, allowed: ReadonlyArray<SubscriptionStatus>): void {
  if (!allowed.includes(state.status)) illegal(`${event.kind} while ${state.status}`);
}

function announced(event: SubscriptionEvent): number {
  const value = event.data.announced_total_micros;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    illegal(`${event.kind} without announced_total_micros`);
  }
  return value;
}

function dateData(event: SubscriptionEvent, key: string): Date | null {
  const value = event.data[key];
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  if (!Number.isFinite(parsed.getTime())) illegal(`${event.kind} carries a malformed ${key}`);
  return parsed;
}

function endedCause(event: SubscriptionEvent): EndedCause {
  const cause = event.data.cause;
  if (typeof cause !== "string" || !ENDED_CAUSES.has(cause)) illegal("ENDED without a known cause");
  return cause as EndedCause;
}

/**
 * One period forward (RENEWED, RECOVERED). The new period is exactly the one P11 charged for when the event
 * carries it (`data.period_start` / `data.period_end`, R-23), otherwise the next anchored month. Either way it
 * must continue the period that just ended and end after it starts.
 */
function advance(state: Working, event: SubscriptionEvent): void {
  const previousEnd = state.periodEnd;
  const anchor = state.periodAnchorAt;
  if (previousEnd === null || anchor === null) illegal(`${event.kind} before the first period`);
  const start = dateData(event, "period_start") ?? previousEnd;
  if (start.getTime() !== previousEnd.getTime()) illegal(`${event.kind} does not continue the period that ended`);
  state.periodIndex += 1;
  const end = dateData(event, "period_end") ?? periodBoundary(anchor, state.periodIndex + 1);
  if (end.getTime() <= start.getTime()) illegal(`${event.kind} carries a period that does not end after it starts`);
  state.periodStart = start;
  state.periodEnd = end;
  state.pastDueSince = null;
  state.retryIndex = 0;
  state.renewalPostponedUntil = null;
}

function apply(state: Working, event: SubscriptionEvent): void {
  switch (event.kind) {
    case "CREATED":
      illegal("CREATED twice");
    case "ACTIVATED": {
      if (!(state.status === "CREATED" || (state.status === "ENDED" && state.endedCause === "ABANDONED"))) {
        illegal(`ACTIVATED while ${state.status}`);
      }
      if (event.xmoneyOrderId === null) illegal("ACTIVATED without an xMoney order");
      state.announcedTotalMicros = announced(event);
      const anchor = event.periodAnchorAt ?? event.at;
      state.status = "ACTIVE";
      state.endedCause = null;
      state.planId = event.planId;
      state.periodAnchorAt = anchor;
      state.periodIndex = 0;
      state.periodStart = anchor;
      state.periodEnd = periodBoundary(anchor, 1);
      state.activatedAt = event.at;
      state.xmoneyOrderId = event.xmoneyOrderId;
      state.xmoneyCustomerId = event.xmoneyCustomerId ?? state.xmoneyCustomerId;
      state.cardRef = event.cardRef ?? state.cardRef;
      return;
    }
    case "RENEWED":
      requireStatus(state, event, ["ACTIVE"]);
      if (event.planId !== state.planId) illegal("RENEWED changed the plan");
      advance(state, event);
      return;
    case "DOWNGRADED":
      // The scheduled lower plan takes over at the renewal; the RENEWED/RECOVERED written next moves the period.
      requireStatus(state, event, ["ACTIVE", "PAST_DUE"]);
      if (state.scheduledDowngradePlanId === null || event.planId !== state.scheduledDowngradePlanId) {
        illegal("DOWNGRADED without that downgrade scheduled");
      }
      state.planId = event.planId;
      state.scheduledDowngradePlanId = null;
      return;
    case "RECOVERED":
      requireStatus(state, event, ["PAST_DUE"]);
      if (event.planId !== state.planId && event.planId !== state.scheduledDowngradePlanId) {
        illegal("RECOVERED at a plan that is neither current nor scheduled");
      }
      if (event.planId === state.scheduledDowngradePlanId) state.scheduledDowngradePlanId = null;
      state.planId = event.planId;
      state.status = "ACTIVE";
      advance(state, event);
      return;
    case "PAST_DUE":
      requireStatus(state, event, ["ACTIVE", "PAST_DUE"]);
      if (state.status === "ACTIVE") {
        state.status = "PAST_DUE";
        state.pastDueSince = event.at;
        state.retryIndex = 0;
      } else {
        state.retryIndex += 1;
      }
      state.renewalPostponedUntil = null;
      return;
    case "UPGRADED":
      requireStatus(state, event, ["ACTIVE"]);
      if (event.planId === state.planId) illegal("UPGRADED to the same plan");
      state.announcedTotalMicros = announced(event);
      state.planId = event.planId;
      state.scheduledDowngradePlanId = null;
      return;
    case "DOWNGRADE_SCHEDULED":
      requireStatus(state, event, ["ACTIVE"]);
      if (event.planId === state.planId) illegal("DOWNGRADE_SCHEDULED to the same plan");
      state.announcedTotalMicros = announced(event);
      state.scheduledDowngradePlanId = event.planId;
      return;
    case "CANCEL_REQUESTED":
      // W7 (P2-I10): SUSPENDED too, for an account deletion's renewal stop (a person's own cancel never reaches it:
      // `requestCancelLocked` refuses a suspended plan). RESUMED keeps the flag, so the plan then ends at its period end.
      requireStatus(state, event, ["ACTIVE", "PAST_DUE", "SUSPENDED"]);
      if (state.cancelRequested) illegal("CANCEL_REQUESTED twice");
      state.cancelRequested = true;
      return;
    case "CANCEL_REVOKED":
      requireStatus(state, event, ["ACTIVE", "PAST_DUE"]);
      if (!state.cancelRequested) illegal("CANCEL_REVOKED with no cancel pending");
      state.cancelRequested = false;
      return;
    case "ENDED": {
      const cause = endedCause(event);
      switch (cause) {
        case "CANCEL":
          requireStatus(state, event, ["ACTIVE", "PAST_DUE"]);
          if (!state.cancelRequested && event.data.reason !== BLOCKED_CARD_REASON) {
            illegal("ENDED(CANCEL) with no cancel pending");
          }
          break;
        case "DUNNING":
          requireStatus(state, event, ["PAST_DUE"]);
          break;
        case "DISPUTE":
          requireStatus(state, event, ["SUSPENDED"]);
          break;
        case "ABANDONED":
          requireStatus(state, event, ["CREATED"]);
          break;
        case "ERASURE":
          illegal("an erasure is written as ERASURE_STOPPED");
        default:
          exhaustive(cause);
      }
      state.status = "ENDED";
      state.endedCause = cause;
      return;
    }
    case "WITHDRAWN":
      requireStatus(state, event, ["ACTIVE", "PAST_DUE"]);
      state.status = "WITHDRAWN";
      return;
    case "SUSPENDED":
      requireStatus(state, event, ["ACTIVE", "PAST_DUE"]);
      state.status = "SUSPENDED";
      return;
    case "RESUMED":
      requireStatus(state, event, ["SUSPENDED"]);
      state.status = "ACTIVE";
      return;
    case "CARD_CHANGED":
      requireStatus(state, event, ["ACTIVE", "PAST_DUE"]);
      if (event.xmoneyOrderId === null) illegal("CARD_CHANGED without the new order");
      state.xmoneyOrderId = event.xmoneyOrderId;
      state.xmoneyCustomerId = event.xmoneyCustomerId ?? state.xmoneyCustomerId;
      state.cardRef = event.cardRef;
      return;
    case "ERASURE_STOPPED":
      requireStatus(state, event, ["CREATED", "ACTIVE", "PAST_DUE", "SUSPENDED"]);
      state.status = "ENDED";
      state.endedCause = "ERASURE";
      return;
    case "RENEWAL_POSTPONED": {
      requireStatus(state, event, ["ACTIVE"]);
      const until = dateData(event, "until");
      if (until === null) illegal("RENEWAL_POSTPONED without data.until");
      state.renewalPostponedUntil = until;
      return;
    }
    case "RENEWAL_NOTICE_SENT":
      requireStatus(state, event, ["ACTIVE", "PAST_DUE"]);
      state.announcedTotalMicros = announced(event);
      state.lastNoticeAt = dateData(event, "sent_at") ?? event.at;
      return;
    default:
      exhaustive(event.kind);
  }
}

export function foldSubscription(events: ReadonlyArray<SubscriptionEvent>): SubscriptionState {
  const first = events[0];
  if (first === undefined || first.kind !== "CREATED") illegal("the first event is not CREATED");
  const environment = first.data.xmoney_environment;
  if (environment !== "stage" && environment !== "live") illegal("CREATED names no xMoney environment");
  const state: Working = {
    subscriptionId: first.subscriptionId, ownerRef: first.ownerRef, planId: first.planId, status: "CREATED",
    periodAnchorAt: null, periodIndex: 0, periodStart: null, periodEnd: null, cancelRequested: false,
    scheduledDowngradePlanId: null, xmoneyOrderId: first.xmoneyOrderId, xmoneyCustomerId: first.xmoneyCustomerId,
    cardRef: first.cardRef, activatedAt: null, endedCause: null, pastDueSince: null, retryIndex: 0,
    renewalPostponedUntil: null, announcedTotalMicros: null, lastNoticeAt: null, xmoneyEnvironment: environment
  };
  for (const event of events.slice(1)) {
    if (event.subscriptionId !== state.subscriptionId || event.ownerRef !== state.ownerRef) {
      illegal("an event names another subscription or owner");
    }
    if (state.status === "WITHDRAWN" || (state.status === "ENDED" && state.endedCause !== "ABANDONED")) {
      illegal(`${event.kind} after the subscription ended`);
    }
    apply(state, event);
  }
  return Object.freeze({
    subscriptionId: state.subscriptionId, ownerRef: state.ownerRef, planId: state.planId, status: state.status,
    periodAnchorAt: state.periodAnchorAt, currentPeriodStart: state.periodStart, currentPeriodEnd: state.periodEnd,
    cancelRequested: state.cancelRequested, scheduledDowngradePlanId: state.scheduledDowngradePlanId,
    xmoneyOrderId: state.xmoneyOrderId, xmoneyCustomerId: state.xmoneyCustomerId, cardRef: state.cardRef,
    activatedAt: state.activatedAt, endedCause: state.endedCause, pastDueSince: state.pastDueSince,
    retryIndex: state.retryIndex, renewalPostponedUntil: state.renewalPostponedUntil,
    announcedTotalMicros: state.announcedTotalMicros, lastNoticeAt: state.lastNoticeAt,
    xmoneyEnvironment: state.xmoneyEnvironment
  });
}

export function entitlementPlanOf(state: SubscriptionState): PlanId | "FREE" {
  return state.status === "ACTIVE" || state.status === "PAST_DUE" ? state.planId : "FREE";
}
