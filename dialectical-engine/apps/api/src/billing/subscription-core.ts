import type { PoolClient } from "pg";
import {
  foldSubscription,
  type SubscriptionEvent,
  type SubscriptionEventKind,
  type SubscriptionState
} from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository } from "@debateai/db";
import type { PlanId } from "@debateai/register";
import { BillingRefusal, type BillingRefusalCode, type BillingRefusalStatus } from "./refusal.js";
import { subscriptionEvent } from "./rows.js";

export function refuse(status: BillingRefusalStatus, code: BillingRefusalCode): never {
  throw new BillingRefusal(status, code);
}

export type LockedSubscription = Readonly<{ state: SubscriptionState; events: ReadonlyArray<SubscriptionEvent> }>;

/**
 * The owner's subscription, folded AFTER the owner lock (A3b) is held, so no other action interleaves. Both reads
 * go through `client`, the connection that holds the lock: an action under the lock never asks the pool for a
 * second connection (with ten such actions at once the API's pool would otherwise deadlock).
 */
export async function lockedSubscription(
  deps: Readonly<{
    billing: Pick<BillingRepository, "subscriptionForOwner" | "subscriptionEvents">;
    jobs: Pick<BillingJobQueries, "lockOwner">;
  }>,
  client: PoolClient,
  ownerRef: string
): Promise<LockedSubscription | null> {
  await deps.jobs.lockOwner(client, ownerRef);
  const current = await deps.billing.subscriptionForOwner(ownerRef, client);
  if (current === null) return null;
  const events = await deps.billing.subscriptionEvents(current.subscriptionId, client);
  return Object.freeze({ state: foldSubscription(events), events: Object.freeze([...events]) });
}

export type NextEvent = Readonly<{
  kind: SubscriptionEventKind;
  at: Date;
  planId?: PlanId;
  xmoneyOrderId?: string;
  xmoneyCustomerId?: string;
  cardRef?: string | null;
  data?: Readonly<Record<string, string | number | boolean | null>>;
}>;

/**
 * Appends one subscription event (built by P8c's `subscriptionEvent`) only when the fold accepts it after the events
 * already written (P2 throws BILLING_SUBSCRIPTION_EVENTS_INVALID otherwise), so an illegal transition never reaches
 * the append-only table. A caller that appends a second event in the same transaction passes a `locked` that
 * already contains the first (see `requestCancelLocked`).
 */
export async function appendChecked(
  billing: Pick<BillingRepository, "appendSubscriptionEvent">,
  client: PoolClient,
  locked: LockedSubscription,
  next: NextEvent
): Promise<SubscriptionEvent> {
  const event = subscriptionEvent(locked.state, next.kind, next.at, next.data ?? {}, {
    ...(next.planId === undefined ? {} : { planId: next.planId }),
    ...(next.xmoneyOrderId === undefined ? {} : { xmoneyOrderId: next.xmoneyOrderId }),
    ...(next.xmoneyCustomerId === undefined ? {} : { xmoneyCustomerId: next.xmoneyCustomerId }),
    ...(next.cardRef === undefined ? {} : { cardRef: next.cardRef })
  });
  foldSubscription([...locked.events, event]);
  await billing.appendSubscriptionEvent(client, event);
  return event;
}

/** The locked view after `event` was appended: the fold of every event so far. */
export function lockedAfter(locked: LockedSubscription, event: SubscriptionEvent): LockedSubscription {
  const events = Object.freeze([...locked.events, event]);
  return Object.freeze({ state: foldSubscription(events), events });
}
