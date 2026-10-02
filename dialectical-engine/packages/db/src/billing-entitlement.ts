import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";

/**
 * PAID PLANS, Part 1b (spec 2026-09-29 §2.4.2-§2.4.3; R1 A6, A8, A20) — WHO HAS
 * WHICH PLAN (migration 0084).
 *
 * `packages/db` may not import `@debateai/register`, so the plan ids are
 * restated here as `EntitlementPlanId`. They are structurally identical to
 * register's `PlanId`: tests/unit/b5-allowance-source.test.ts assigns this
 * repository, and its `readOnlyPort()`, to billing-core's `EntitlementPort`
 * (whose `planId` is a `PlanId`), so `pnpm run typecheck` refuses any drift.
 */
export const ENTITLEMENT_PLAN_IDS = Object.freeze(["FREE", "PLUS", "PRO", "MAX"] as const);
export type EntitlementPlanId = typeof ENTITLEMENT_PLAN_IDS[number];

/**
 * The contract's eleven causes, plus three that exist only to extend a paid
 * plan's `paid_through` (A8a), and that 0084 refuses on a FREE row:
 *  - RENEWAL_POSTPONED (R-22): a renewal waiting for its notice (A7);
 *  - PAST_DUE_GRACE (R-22): a charge being retried (dunning);
 *  - RENEWAL_PENDING (ruling Q-1): a renewal waiting out an xMoney or tax-service
 *    outage, at most 72 h past the period end (P11a owns that bound).
 */
export const ENTITLEMENT_CAUSES = Object.freeze([
  "SIGNED_UP_FREE", "SUBSCRIBED", "UPGRADED", "DOWNGRADED", "RENEWED", "ENDED_CANCEL",
  "ENDED_WITHDRAWAL", "ENDED_DUNNING", "SUSPENDED_CHARGEBACK", "RESUMED", "ERASURE_STOPPED",
  "RENEWAL_POSTPONED", "PAST_DUE_GRACE", "RENEWAL_PENDING"
] as const);
export type EntitlementCause = typeof ENTITLEMENT_CAUSES[number];

export type Entitlement = Readonly<{
  ownerRef: string;
  planId: EntitlementPlanId;
  periodAnchorAt: Date;
  cause: EntitlementCause;
  /** The latest event in force, also when it lapsed (A8): the run's charge scope names it. */
  eventId: string;
  /** A6: the current period's prorated month credit; null = the plan's own credit. */
  monthCreditOverrideMicros: number | null;
  /** A8: when paid access ends; null for Free, including a lapsed paid plan. */
  paidThrough: Date | null;
  /** A8: a paid plan read past `paid_through`, and therefore FREE, anchored at that instant. */
  lapsed: boolean;
}>;

/**
 * One event to append (R-22). `paidThrough` is always stated (null for Free).
 * `monthCreditOverrideMicros` is A6's prorated month credit; only an upgrade
 * sets it, so every other writer may leave it out, and absent means null.
 */
export type EntitlementAppend = Readonly<{
  ownerRef: string;
  planId: EntitlementPlanId;
  periodAnchorAt: Date;
  cause: EntitlementCause;
  effectiveAt: Date;
  subscriptionId: string | null;
  monthCreditOverrideMicros?: number | null;
  paidThrough: Date | null;
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type EntitlementRow = Readonly<{
  entitlement_event_id: string;
  plan_id: string;
  period_anchor_at: Date;
  month_credit_override_micros: string | null;
  paid_through: Date | null;
  cause: string;
  lapsed: boolean;
}>;

const ENTITLEMENT_COLUMNS = "entitlement_event_id, plan_id, period_anchor_at, month_credit_override_micros,"
  + " paid_through, cause, lapsed";

function ownerRefOf(ownerRef: string): string {
  if (typeof ownerRef !== "string" || !UUID_V4.test(ownerRef)) {
    throw new TypedDomainError("BILLING_OWNER_REF_INVALID", "An owner reference is a UUID v4");
  }
  return ownerRef;
}

function entitlementFrom(ownerRef: string, row: EntitlementRow): Entitlement {
  const planId = ENTITLEMENT_PLAN_IDS.find((candidate) => candidate === row.plan_id);
  const cause = ENTITLEMENT_CAUSES.find((candidate) => candidate === row.cause);
  const override = row.month_credit_override_micros === null ? null : Number(row.month_credit_override_micros);
  if (planId === undefined || cause === undefined || (override !== null && !Number.isSafeInteger(override))) {
    throw new TypedDomainError("BILLING_ENTITLEMENT_ROW_INVALID", "An entitlement row is outside its declared shape");
  }
  return Object.freeze({
    ownerRef,
    planId,
    periodAnchorAt: row.period_anchor_at,
    cause,
    eventId: row.entitlement_event_id,
    monthCreditOverrideMicros: override,
    paidThrough: row.paid_through,
    lapsed: row.lapsed
  });
}

export class EntitlementRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * The entitlement in force at `now`. An owner with no event yet (an account
   * from before billing) is Free, anchored at `identity."user".created_at`. That
   * SIGNED_UP_FREE event is appended the first time it is read, and at most
   * once: concurrent readers collide on the partial unique index and all read
   * back the same row. The account's `state` is not read: every state
   * (0077's `age_frozen` included) is Free from `created_at`, and only an
   * `active` account reaches this through a signed-in ask.
   */
  async current(ownerRef: string, now: Date): Promise<Entitlement> {
    const owner = ownerRefOf(ownerRef);
    const found = await this.#at(owner, now);
    if (found !== null) return found;
    await this.pool.query(
      `INSERT INTO billing.entitlement_event (
         event_id, owner_ref, plan_id, effective_at, period_anchor_at, cause,
         subscription_id, month_credit_override_micros, paid_through
       )
       SELECT $2::uuid, identity_user.owner_ref, 'FREE', identity_user.created_at, identity_user.created_at,
         'SIGNED_UP_FREE', NULL, NULL, NULL
       FROM identity."user" AS identity_user
       WHERE identity_user.owner_ref = $1::uuid
       ON CONFLICT (owner_ref) WHERE cause = 'SIGNED_UP_FREE' DO NOTHING`,
      [owner, randomUUID()]
    );
    const created = await this.#at(owner, now);
    if (created === null) {
      throw new TypedDomainError("BILLING_OWNER_UNKNOWN", "No account holds this owner reference");
    }
    return created;
  }

  async #at(ownerRef: string, now: Date): Promise<Entitlement | null> {
    const result = await this.pool.query<EntitlementRow>(
      `SELECT ${ENTITLEMENT_COLUMNS} FROM billing.entitlement_at($1::uuid, $2::timestamptz)`,
      [ownerRef, now]
    );
    const row = result.rows[0];
    return row === undefined ? null : entitlementFrom(ownerRef, row);
  }

  /**
   * A20: the runner's read, through `billing.person_windows_v` at the
   * database's own clock. It never writes; an owner with no event reads `null`.
   * A run admitted with billing on always has one, written at its admission.
   */
  async readWindowsView(ownerRef: string): Promise<Entitlement | null> {
    const owner = ownerRefOf(ownerRef);
    const result = await this.pool.query<EntitlementRow>(
      `SELECT ${ENTITLEMENT_COLUMNS} FROM billing.person_windows_v WHERE owner_ref = $1::uuid`,
      [owner]
    );
    const row = result.rows[0];
    return row === undefined ? null : entitlementFrom(owner, row);
  }

  /**
   * The runner's `entitlements` port for `BillingPersonAllowanceSource` (A20,
   * R-12): read-only, at the view's clock. The runner builds
   * `new BillingPersonAllowanceSource({ entitlements: repository.readOnlyPort(), … })`,
   * never the repository itself, so it never reaches the lazy Free append. The
   * caller's `now` is not passed on: the view resolves at the database's own
   * clock, and the allowance source builds the windows at max(now, anchor), so
   * an anchor just after the runner's clock never throws.
   */
  readOnlyPort(): Readonly<{ current(ownerRef: string, now: Date): Promise<Entitlement | null> }> {
    return Object.freeze({ current: (ownerRef: string) => this.readWindowsView(ownerRef) });
  }

  async append(client: PoolClient, event: EntitlementAppend): Promise<string> {
    const owner = ownerRefOf(event.ownerRef);
    if (!ENTITLEMENT_PLAN_IDS.includes(event.planId) || !ENTITLEMENT_CAUSES.includes(event.cause)
      || (event.subscriptionId !== null && !UUID_V4.test(event.subscriptionId))) {
      throw new TypedDomainError("BILLING_ENTITLEMENT_APPEND_INVALID", "An entitlement event is outside its declared shape");
    }
    const eventId = randomUUID();
    await client.query(
      `INSERT INTO billing.entitlement_event (
         event_id, owner_ref, plan_id, effective_at, period_anchor_at, cause,
         subscription_id, month_credit_override_micros, paid_through
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid, $8, $9)`,
      [eventId, owner, event.planId, event.effectiveAt, event.periodAnchorAt, event.cause,
        event.subscriptionId, event.monthCreditOverrideMicros ?? null, event.paidThrough]
    );
    return eventId;
  }

  async recordRunChargeScope(client: PoolClient, input: Readonly<{
    runId: string;
    ownerRef: string;
    planId: EntitlementPlanId;
    entitlementEventId: string;
    admittedAt: Date;
  }>): Promise<void> {
    await client.query(
      `INSERT INTO billing.run_charge_scope (run_id, owner_ref, plan_id, entitlement_event_id, admitted_at)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5)`,
      [input.runId, ownerRefOf(input.ownerRef), input.planId, input.entitlementEventId, input.admittedAt]
    );
  }
}
