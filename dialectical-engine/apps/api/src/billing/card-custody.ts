import { foldSubscription, type PaymentEnvironment, type SubscriptionEvent, type SubscriptionState } from "@debateai/billing-core";
import type {
  BillingJobQueries, BillingReadExecutor, BillingRepository, CardTokenRevocationReason, CardTokenRow, ChargeEventRow, ChargeRow
} from "@debateai/db";
import type { BillingAudit } from "./audit.js";
import { CARD_HOLDING } from "./card-adoption.js";
import { emailJob } from "./email-job.js";
import { enqueueOnce } from "./outbox.js";
import { usableSavedCard } from "./renewal.js";

/** What the sweep knows of one live token when it decides (spec §2.15.4). */
export type CustodyFacts = Readonly<{
  token: CardTokenRow;
  /** NETOPIA, in this API's environment. */
  ours: boolean;
  /** The token's source charge with its events; null for a tool order's token, or a charge we cannot find. */
  charge: (ChargeRow & { events: ReadonlyArray<ChargeEventRow> }) | null;
  /** That charge's subscription, folded, and its history; null with no charge. */
  state: SubscriptionState | null;
  events: ReadonlyArray<SubscriptionEvent>;
  /** The owner's account erasure has committed (0091's `owner_erasure_committed`). */
  erased: boolean;
  now: Date;
}>;

export type CustodySweepReport = Readonly<{
  revoked: number; kept: number; byReason: Readonly<Partial<Record<CardTokenRevocationReason, number>>>;
}>;

const DAY_MS = 86_400_000;
/** Spec §2.15.4: an undecided payment's token is kept this many days (A8 (c)'s late activation). */
const UNDECIDED_KEEP_DAYS = 30;
/** Spec §2.15.4: only tokens older than this are swept (a message after the status read is still being adopted). */
const SWEEP_AFTER_DAYS = 1;
/** Spec §2.15.3: M12 goes this many days or fewer before a renewal. */
const ASK_DAYS = 10;

/**
 * Spec §2.15.4: keep the token, or the reason to revoke it. The current card of a live plan is kept; otherwise, in
 * order: a tool order's card (TOOL_ORDER), another system's (OTHER_SYSTEM), an erased owner's (ERASURE), a token whose
 * charge is not decided yet and is younger than 30 days (KEEP), one no event ever adopted (NOT_ADOPTED), one this live
 * plan adopted once (REPLACED), one of a plan no longer live (PLAN_ENDED). A charge is decided by its SUCCEEDED, and a
 * renewal also by its FAILED (its retry is a new charge); a hosted payment's FAILED is not final (the person may pay on
 * the same page, and a late payment may still activate, A8 (c)). The 30 days run from the token's `created_at`.
 */
export function custodyDecision(facts: CustodyFacts): CardTokenRevocationReason | "KEEP" {
  const { token, charge, state } = facts;
  if (token.sourceToolOrder !== null) return "TOOL_ORDER";
  if (!facts.ours) return "OTHER_SYSTEM";
  if (facts.erased) return "ERASURE";
  if (charge === null || state === null) return "NOT_ADOPTED";
  if (CARD_HOLDING.has(state.status) && state.cardTokenId === token.tokenId) return "KEEP";
  const decided = charge.events.some((event) => event.kind === "SUCCEEDED")
    || (charge.kind === "RENEWAL" && charge.events.some((event) => event.kind === "FAILED"));
  if (!decided && facts.now.getTime() - token.createdAt.getTime() < UNDECIDED_KEEP_DAYS * DAY_MS) return "KEEP";
  if (!facts.events.some((event) => event.cardTokenId === token.tokenId)) return "NOT_ADOPTED";
  return CARD_HOLDING.has(state.status) ? "REPLACED" : "PLAN_ENDED";
}

export type CardCustodyDeps = Readonly<{
  repository: Pick<BillingRepository,
    | "withTransaction" | "liveCardTokensOlderThan" | "liveCardTokensForCustomer" | "revokeCardToken" | "cardTokenById"
    | "charge" | "subscriptionEvents" | "ownerErasureCommitted" | "customerByOwner" | "enqueue"
    | "purgeRevokedCardTokens" | "purgeShortLived">;
  jobs: Pick<BillingJobQueries, "lockOwner" | "outboxJobExists">;
  /** N8's connectors.paymentEnvironment: the NETOPIA environment whose cards this API keeps. */
  paymentEnvironment: PaymentEnvironment;
  /** R-7: PUBLIC_APP_URL, the origin of M12's card page link. */
  publicAppUrl: string;
  audit: BillingAudit;
}>;

/** Spec §2.15.3–2.15.4: the saved card's life after its message was stored. */
export class CardCustody {
  constructor(private readonly deps: CardCustodyDeps) {}

  /**
   * The daily sweep: every live token older than one day is kept or revoked (`custodyDecision`). A charge token's
   * revocation reads its charge and re-folds its plan under the owner lock first, so a card adopted since the first
   * read is never revoked. One content-free audit line per reason (its count). One token that cannot be decided (a
   * history that does not fold) never stops the others: the first failure is thrown at the end, after the audit lines,
   * so the daily owner job reports BILLING_OWNER_JOBS_PENDING.
   */
  async sweep(now: Date): Promise<CustodySweepReport> {
    const { repository } = this.deps;
    const before = new Date(now.getTime() - SWEEP_AFTER_DAYS * DAY_MS);
    const tokens = await repository.withTransaction((client) => repository.liveCardTokensOlderThan(client, before));
    const byReason: Partial<Record<CardTokenRevocationReason, number>> = {};
    const erasedOwners = new Map<string, boolean>();
    let kept = 0;
    let failure: unknown = undefined;
    for (const token of tokens) {
      try {
        const reason = await this.sweepOne(token, now, erasedOwners);
        if (reason === null) kept += 1;
        else byReason[reason] = (byReason[reason] ?? 0) + 1;
      } catch (error) {
        failure ??= error;
      }
    }
    for (const [reason, count] of Object.entries(byReason)) this.deps.audit("billing.card.revoked", { reason, count });
    if (failure !== undefined) throw failure;
    const revoked = Object.values(byReason).reduce((total, count) => total + (count ?? 0), 0);
    return Object.freeze({ revoked, kept, byReason: Object.freeze({ ...byReason }) });
  }

  /** One token of the sweep: the reason it was revoked with, or null when it is kept. */
  private async sweepOne(
    token: CardTokenRow, now: Date, erasedOwners: Map<string, boolean>
  ): Promise<CardTokenRevocationReason | null> {
    const { repository } = this.deps;
    const sourceChargeId = token.sourceChargeId;
    const first = sourceChargeId === null ? null : await repository.charge(sourceChargeId);
    const ownerRef = first?.ownerRef ?? null;
    if (ownerRef !== null && !erasedOwners.has(ownerRef)) erasedOwners.set(ownerRef, await repository.ownerErasureCommitted(ownerRef));
    const decide = async (executor?: BillingReadExecutor): Promise<CardTokenRevocationReason | "KEEP"> => {
      const charge = executor === undefined || sourceChargeId === null ? first : await repository.charge(sourceChargeId, executor);
      const events = charge === null ? [] : await repository.subscriptionEvents(charge.subscriptionId, executor);
      return custodyDecision({
        token, ours: token.paymentProvider === "netopia" && token.paymentEnvironment === this.deps.paymentEnvironment,
        charge, state: events.length === 0 ? null : foldSubscription(events), events,
        erased: ownerRef !== null && erasedOwners.get(ownerRef) === true, now
      });
    };
    if (await decide() === "KEEP") return null;
    return repository.withTransaction(async (client) => {
      if (ownerRef !== null) await this.deps.jobs.lockOwner(client, ownerRef);
      const decision = await decide(client);
      if (decision === "KEEP") return null;
      await repository.revokeCardToken(client, { tokenId: token.tokenId, at: now, reason: decision });
      return decision;
    });
  }

  /**
   * Spec §2.15.4: an erasure commit revokes every live token of the owner at once (reason ERASURE), whatever state
   * the plan is in. Returns how many were revoked.
   */
  async revokeForErasure(ownerRef: string, now: Date): Promise<number> {
    const { repository } = this.deps;
    const customer = await repository.customerByOwner(ownerRef);
    if (customer === null) return 0;
    const count = await repository.withTransaction(async (client) => {
      const tokens = await repository.liveCardTokensForCustomer(client, customer.customerId);
      for (const token of tokens) await repository.revokeCardToken(client, { tokenId: token.tokenId, at: now, reason: "ERASURE" });
      return tokens.length;
    });
    if (count > 0) this.deps.audit("billing.card.revoked", { reason: "ERASURE", count });
    return count;
  }

  /**
   * Spec §2.15.4 / §2.5.2: the two sanctioned delete paths, run after the sweep by the daily owner job: revoked tokens
   * (one day after their revocation, by the database's own clock) and the short-lived rows (raw messages and the
   * quarantine after 14 days). Returns the rows deleted.
   */
  async purge(now: Date): Promise<number> {
    const tokens = await this.deps.repository.purgeRevokedCardTokens(now);
    const shortLived = await this.deps.repository.purgeShortLived(now);
    this.deps.audit("billing.card.purged", { tokens, shortLived });
    return tokens + shortLived;
  }

  /**
   * Spec §2.15.3, from A7's daily look-ahead: ten days or less before an ACTIVE NETOPIA plan of this environment renews,
   * a plan with no usable card at the renewal (`usableSavedCard`: none, revoked, another system's, or its expiry month
   * ends before then) gets M12 once per period: "the card we have expires before then" when a card of this system is
   * held, not revoked, with a known expiry, else "we couldn't keep your card from your last payment". Returns whether
   * M12 was queued.
   */
  async askForCard(state: SubscriptionState, now: Date): Promise<boolean> {
    const renewAt = state.currentPeriodEnd;
    if (state.status !== "ACTIVE" || state.cancelRequested || renewAt === null) return false;
    if (state.paymentProvider !== "netopia" || state.paymentEnvironment !== this.deps.paymentEnvironment) return false;
    const until = renewAt.getTime() - now.getTime();
    if (until <= 0 || until > ASK_DAYS * DAY_MS) return false;
    const { repository } = this.deps;
    if (await usableSavedCard(repository, state, renewAt) !== null) return false;
    const heldId = state.cardTokenId;
    const held = heldId === null ? null : await repository.withTransaction((client) => repository.cardTokenById(client, heldId));
    const expiring = held !== null && held.revokedAt === null && held.paymentProvider === "netopia"
      && held.paymentEnvironment === state.paymentEnvironment && held.expMonth !== null && held.expYear !== null;
    const customer = await repository.customerByOwner(state.ownerRef);
    if (customer === null) return false;
    const queued = await repository.withTransaction((client) => enqueueOnce({ repository, jobs: this.deps.jobs }, client, emailJob({
      template: "M12", recipient: { kind: "CUSTOMER", customerId: customer.customerId },
      dedupeRef: `${state.subscriptionId}:${renewAt.toISOString()}`,
      params: {
        plan: state.planId, renewDate: renewAt.toISOString(),
        cardPageUrl: new URL("/settings/card", this.deps.publicAppUrl).toString(), cardExpiring: expiring ? "true" : "false"
      },
      notBefore: now
    })));
    if (queued) this.deps.audit("billing.card.reminder", { line: expiring ? "EXPIRING" : "MISSING" });
    return queued;
  }
}
