import { TypedDomainError, exhaustive } from "@debateai/kernel";
import type { PlanId } from "@debateai/register";
import { periodBoundary } from "./calendar.js";

export type SubscriptionEventKind =
  | "CREATED" | "ACTIVATED" | "RENEWED" | "PAST_DUE" | "RECOVERED" | "UPGRADED" | "DOWNGRADE_SCHEDULED"
  | "DOWNGRADED" | "CANCEL_REQUESTED" | "CANCEL_REVOKED" | "ENDED" | "WITHDRAWN" | "SUSPENDED" | "RESUMED"
  | "CARD_CHANGED" | "ERASURE_STOPPED" | "RENEWAL_POSTPONED" | "RENEWAL_NOTICE_SENT"
  // Spec 2026-10-05 §2.5.5: a saved card adopted after the deciding event (0111's CHECK).
  | "CARD_SAVED";

export const SUBSCRIPTION_EVENT_KINDS: ReadonlyArray<SubscriptionEventKind> = Object.freeze([
  "CREATED", "ACTIVATED", "RENEWED", "PAST_DUE", "RECOVERED", "UPGRADED", "DOWNGRADE_SCHEDULED", "DOWNGRADED",
  "CANCEL_REQUESTED", "CANCEL_REVOKED", "ENDED", "WITHDRAWN", "SUSPENDED", "RESUMED", "CARD_CHANGED",
  "ERASURE_STOPPED", "RENEWAL_POSTPONED", "RENEWAL_NOTICE_SENT", "CARD_SAVED"
]);

export type SubscriptionStatus = "CREATED" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "ENDED" | "WITHDRAWN";
export type EndedCause = "CANCEL" | "DUNNING" | "ERASURE" | "ABANDONED" | "DISPUTE";
export type SubscriptionEventData = Readonly<Record<string, string | number | boolean | null>>;

export type SubscriptionEvent = Readonly<{
  eventId: string; subscriptionId: string; ownerRef: string; kind: SubscriptionEventKind; at: Date; planId: PlanId;
  periodAnchorAt: Date | null;
  /** Spec 2026-10-05 §2.15.2: the saved card an adopting event (ACTIVATED, RENEWED, UPGRADED, CARD_CHANGED, CARD_SAVED) names. */
  cardTokenId: string | null;
  data: SubscriptionEventData;
}>;

export type SubscriptionState = Readonly<{
  subscriptionId: string; ownerRef: string; planId: PlanId; status: SubscriptionStatus;
  periodAnchorAt: Date | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  cancelRequested: boolean; scheduledDowngradePlanId: PlanId | null;
  activatedAt: Date | null; endedCause: EndedCause | null; pastDueSince: Date | null; retryIndex: number;
  renewalPostponedUntil: Date | null;
  /** A7: the recurring total the person was last told about (checkout, upgrade, downgrade, notice M3). */
  announcedTotalMicros: number | null;
  lastNoticeAt: Date | null;
  /**
   * Spec 2026-10-05 §2.5.5: the payment system the subscription was created in, for life — from CREATED's
   * `data.payment_provider` and `data.payment_environment` (an old row: `paymentSystemOf` below). Renewals, charge
   * matching and the other-system guards read both together (§2.5.4).
   */
  paymentProvider: "xmoney" | "netopia";
  paymentEnvironment: "stage" | "sandbox" | "live";
  /** §2.15.2: the card of the newest adopting event that named one; null while none has (§2.15.3 asks for one). */
  cardTokenId: string | null;
}>;

type Working = {
  subscriptionId: string; ownerRef: string; planId: PlanId; status: SubscriptionStatus;
  periodAnchorAt: Date | null; periodIndex: number; periodStart: Date | null; periodEnd: Date | null;
  cancelRequested: boolean; scheduledDowngradePlanId: PlanId | null; activatedAt: Date | null; endedCause: EndedCause | null;
  pastDueSince: Date | null; retryIndex: number; renewalPostponedUntil: Date | null;
  announcedTotalMicros: number | null; lastNoticeAt: Date | null;
  paymentProvider: "xmoney" | "netopia"; paymentEnvironment: "stage" | "sandbox" | "live"; cardTokenId: string | null;
};

const ENDED_CAUSES: ReadonlySet<string> = new Set<EndedCause>(["CANCEL", "DUNNING", "ERASURE", "ABANDONED", "DISPUTE"]);
/** P9b: a live plan paid with a card from a blocked country ends at once, without a cancel request. */
const BLOCKED_CARD_REASON = "CARD_COUNTRY_BLOCKED";

function illegal(detail: string): never {
  throw new TypedDomainError("BILLING_SUBSCRIPTION_EVENTS_INVALID", `subscription events are not a legal history: ${detail}`);
}

/** §2.15.2: the events that may carry the subscription's card (0111's subscription_event_card_token_kinds). */
const CARD_TOKEN_KINDS: ReadonlySet<SubscriptionEventKind> = new Set<SubscriptionEventKind>([
  "ACTIVATED", "RENEWED", "UPGRADED", "CARD_CHANGED", "CARD_SAVED"
]);

/** Spec 2026-10-05 §2.5.5: only an adopting event carries a card, and only on a NETOPIA plan. */
function checkPaymentFields(state: Pick<Working, "paymentProvider">, event: SubscriptionEvent): void {
  if (event.cardTokenId !== null) {
    if (!CARD_TOKEN_KINDS.has(event.kind)) illegal(`${event.kind} carries a card`);
    if (state.paymentProvider !== "netopia") illegal(`${event.kind} carries a card on another payment system's plan`);
  }
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
      // §2.5.5: a NETOPIA plan starts with or without a saved card.
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
      // SUSPENDED too: an account deletion's renewal stop (W7, P2-I10) and the person's own cancel in Settings or through
      // the emailed link (P2-W10, the owner's ruling of 3 October 2026: a plan paused by a card dispute can be
      // cancelled). RESUMED keeps the flag, so a plan whose dispute is won ends at its period end instead of renewing.
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
      // §2.5.5: a NETOPIA plan's new card is the token the card check saved.
      if (state.paymentProvider === "netopia" && event.cardTokenId === null) illegal("CARD_CHANGED without the new card");
      return;
    case "CARD_SAVED":
      // §2.5.5 / §2.15.2: a saved card that arrived after the deciding event; it changes nothing but the card.
      requireStatus(state, event, ["ACTIVE", "PAST_DUE", "SUSPENDED"]);
      if (event.planId !== state.planId) illegal("CARD_SAVED changed the plan");
      if (event.cardTokenId === null) illegal("CARD_SAVED without a card");
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

/**
 * Spec 2026-10-05 §2.5.5: the payment system comes from CREATED. A NETOPIA row names `data.payment_provider` and
 * `data.payment_environment`; an older row names only `data.xmoney_environment` (0085's CHECK) and folds as provider
 * "xmoney", which no code acts on any more (every reader treats it as another payment system).
 */
function paymentSystemOf(data: SubscriptionEvent["data"]): Pick<SubscriptionState, "paymentProvider" | "paymentEnvironment"> {
  if (data.payment_provider === "netopia" && (data.payment_environment === "sandbox" || data.payment_environment === "live")) {
    return { paymentProvider: "netopia", paymentEnvironment: data.payment_environment };
  }
  if (data.payment_provider === undefined && (data.xmoney_environment === "stage" || data.xmoney_environment === "live")) {
    return { paymentProvider: "xmoney", paymentEnvironment: data.xmoney_environment };
  }
  throw new TypedDomainError("BILLING_SUBSCRIPTION_EVENTS_INVALID", "CREATED must name its payment system");
}

export function foldSubscription(events: ReadonlyArray<SubscriptionEvent>): SubscriptionState {
  const first = events[0];
  if (first === undefined || first.kind !== "CREATED") illegal("the first event is not CREATED");
  const system = paymentSystemOf(first.data);
  if (first.cardTokenId !== null) illegal("CREATED carries a card");
  checkPaymentFields(system, first);
  const state: Working = {
    subscriptionId: first.subscriptionId, ownerRef: first.ownerRef, planId: first.planId, status: "CREATED",
    periodAnchorAt: null, periodIndex: 0, periodStart: null, periodEnd: null, cancelRequested: false,
    scheduledDowngradePlanId: null, activatedAt: null, endedCause: null, pastDueSince: null, retryIndex: 0,
    renewalPostponedUntil: null, announcedTotalMicros: null, lastNoticeAt: null,
    paymentProvider: system.paymentProvider, paymentEnvironment: system.paymentEnvironment, cardTokenId: null
  };
  for (const event of events.slice(1)) {
    if (event.subscriptionId !== state.subscriptionId || event.ownerRef !== state.ownerRef) {
      illegal("an event names another subscription or owner");
    }
    if (state.status === "WITHDRAWN" || (state.status === "ENDED" && state.endedCause !== "ABANDONED")) {
      illegal(`${event.kind} after the subscription ended`);
    }
    checkPaymentFields(state, event);
    apply(state, event);
    // §2.15.2: the newest adopting event that names a card is the subscription's card.
    if (event.cardTokenId !== null) state.cardTokenId = event.cardTokenId;
  }
  return Object.freeze({
    subscriptionId: state.subscriptionId, ownerRef: state.ownerRef, planId: state.planId, status: state.status,
    periodAnchorAt: state.periodAnchorAt, currentPeriodStart: state.periodStart, currentPeriodEnd: state.periodEnd,
    cancelRequested: state.cancelRequested, scheduledDowngradePlanId: state.scheduledDowngradePlanId,
    activatedAt: state.activatedAt, endedCause: state.endedCause, pastDueSince: state.pastDueSince,
    retryIndex: state.retryIndex, renewalPostponedUntil: state.renewalPostponedUntil,
    announcedTotalMicros: state.announcedTotalMicros, lastNoticeAt: state.lastNoticeAt,
    paymentProvider: state.paymentProvider, paymentEnvironment: state.paymentEnvironment, cardTokenId: state.cardTokenId
  });
}

export function entitlementPlanOf(state: SubscriptionState): PlanId | "FREE" {
  return state.status === "ACTIVE" || state.status === "PAST_DUE" ? state.planId : "FREE";
}
