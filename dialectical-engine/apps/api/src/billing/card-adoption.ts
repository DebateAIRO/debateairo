import type { PoolClient } from "pg";
import type { SubscriptionEvent, SubscriptionState } from "@debateai/billing-core";
import type { BillingRepository, CardTokenRow, ChargeEventRow, ChargeKind, ChargeRow } from "@debateai/db";
import { exhaustive } from "@debateai/kernel";
import { subscriptionEvent } from "./rows.js";

/** Spec §2.5.5: the events that may carry `card_token_id`; the state's card is the newest one's. */
export type AdoptingKind = "ACTIVATED" | "RENEWED" | "UPGRADED" | "CARD_CHANGED" | "CARD_SAVED";

export type AdoptionInput = Readonly<{
  /** The subscription folded under the owner lock, and the history it was folded from. */
  state: SubscriptionState;
  events: ReadonlyArray<SubscriptionEvent>;
  /** The charge the tokens came from, read on the transaction's own client, events included. */
  charge: ChargeRow & { events: ReadonlyArray<ChargeEventRow> };
  /** The tokens stored from that charge (`cardTokensFromCharge`). */
  tokens: ReadonlyArray<CardTokenRow>;
  /** The subscription's current card (`cardTokenById(state.cardTokenId)`), or null. */
  current: CardTokenRow | null;
  /** The event that would carry the token. */
  adopting: AdoptingKind;
  /** True inside the decision's own transaction, where the SUCCEEDED row is being written. */
  deciding: boolean;
}>;

/** The states whose plan keeps a card (spec §2.15.4: ACTIVE, PAST_DUE, SUSPENDED). */
const CARD_HOLDING: ReadonlySet<string> = new Set(["ACTIVE", "PAST_DUE", "SUSPENDED"]);

/** The source payment's time, else the row's own (spec §2.15.2 orders by `source_paid_at`). */
const paidAt = (token: CardTokenRow): number => (token.sourcePaidAt ?? token.createdAt).getTime();

/**
 * Spec §2.15.2: the newest token of `charge` this subscription may adopt, or null. All must hold: the charge belongs
 * to this subscription and is SUCCEEDED (or is being decided now); it holds no refund request and no second payment
 * (a refusal is always written as a refund request: CARD_CHECK_*, ALREADY_SUBSCRIBED, SUBSCRIPTION_ENDED,
 * UPGRADE_CLOSED, DUPLICATE_PAYMENT); a CARD_CHECK token only through the CARD_CHANGED that names its charge; the token
 * is NETOPIA's, of the subscription's environment, of a customer, not revoked; and its payment is not older than the
 * current card's nor than the latest CARD_CHANGED (a late message from a replaced card never wins back).
 */
export function chooseAdoptableToken(input: AdoptionInput): CardTokenRow | null {
  const { state, charge } = input;
  if (charge.subscriptionId !== state.subscriptionId) return null;
  if (!input.deciding && !charge.events.some((event) => event.kind === "SUCCEEDED")) return null;
  if (charge.events.some((event) => event.kind === "REFUND_REQUESTED" || event.kind === "DUPLICATE_PAYMENT")) return null;
  if (charge.kind === "CARD_CHECK" && input.adopting !== "CARD_CHANGED") return null;
  const latestChange = input.events.filter((event) => event.kind === "CARD_CHANGED")
    .reduce((latest, event) => Math.max(latest, event.at.getTime()), Number.NEGATIVE_INFINITY);
  const floor = Math.max(latestChange, input.current === null ? Number.NEGATIVE_INFINITY : paidAt(input.current));
  const eligible = input.tokens.filter((token) => token.sourceChargeId === charge.chargeId && token.revokedAt === null
    && token.customerId !== null && token.paymentProvider === "netopia"
    && state.paymentEnvironment === token.paymentEnvironment && paidAt(token) >= floor);
  return [...eligible].sort((left, right) => paidAt(right) - paidAt(left)
    || right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
}

/** The event of a charge kind's settlement, which carries the card adopted at the decision. */
export function adoptingKindOf(kind: ChargeKind): AdoptingKind {
  switch (kind) {
    case "INITIAL":
      return "ACTIVATED";
    case "RENEWAL":
      return "RENEWED";
    case "UPGRADE":
      return "UPGRADED";
    case "CARD_CHECK":
      return "CARD_CHANGED";
    default:
      return exhaustive(kind);
  }
}

/**
 * Spec §2.15.2 "after it": CARD_SAVED adopts `token` on a plan that keeps a card, in the caller's transaction under
 * the owner lock. It changes nothing but the card. False when the plan holds no card or already holds this one.
 */
export async function writeCardSaved(
  deps: Readonly<{ repository: Pick<BillingRepository, "appendSubscriptionEvent"> }>, client: PoolClient,
  input: Readonly<{ state: SubscriptionState; token: CardTokenRow; at: Date }>
): Promise<boolean> {
  if (!CARD_HOLDING.has(input.state.status) || input.state.cardTokenId === input.token.tokenId) return false;
  await deps.repository.appendSubscriptionEvent(client, subscriptionEvent(input.state, "CARD_SAVED", input.at, {
    charge_id: input.token.sourceChargeId
  }, { cardTokenId: input.token.tokenId }));
  return true;
}
