import type { Pool } from "pg";
import { parseReleaseKey, TypedDomainError } from "@debateai/kernel";
import { readBillingPlans, type BillingPlans } from "./billing-plans.js";

/**
 * WHICH PLANS THE SITE SERVED, AND WHEN (owner, 19 November 2026; `@debateai/billing-core` plans-in-force.ts reads this
 * to keep a person's month on the numbers it started with).
 *
 * A plans row goes live with an upload: the release that takes the traffic serves the `billingPlans` row of its own
 * settings version, the number in its release key. The database keeps every such switch with the instant the new
 * release took the traffic from (`core.release_event`, read through migration 0183's `core.read_release_history()`),
 * a way back to an older release included. So "the plans served at an instant" is the row of the release that last
 * took the traffic at or before it.
 */
export type ReleaseSwitch = Readonly<{ siteVersion: number; takeTrafficFrom: Date }>;

/**
 * The settings versions served at any moment from `from` to `to` (both included), oldest first and each once, the one
 * served at `to` last. `switches` are in the order they were recorded. An instant before the first recorded switch is
 * given that first switch's version, the nearest one known. Empty only when nothing was ever recorded.
 */
export function settingsVersionsServedBetween(switches: ReadonlyArray<ReleaseSwitch>, from: Date, to: Date): readonly number[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    throw new TypedDomainError("BILLING_PLANS_SPAN_INVALID", "The span asked about has no valid start and end");
  }
  if (switches.length === 0) return Object.freeze([]);
  let atStart: number | null = null;
  const during: number[] = [];
  for (const each of switches) {
    const at = each.takeTrafficFrom.getTime();
    if (at <= fromMs) atStart = each.siteVersion;
    else if (at <= toMs) during.push(each.siteVersion);
  }
  const served = atStart === null ? during : [atStart, ...during];
  if (served.length === 0) return Object.freeze([switches[0]!.siteVersion]);
  // A version served twice in the span (a way back) keeps its last place, so the last entry is the one served at `to`.
  return Object.freeze(served.filter((version, index) => served.lastIndexOf(version) === index));
}

export type BillingPlansInForce = Readonly<{
  between(from: Date, to: Date): Promise<ReadonlyArray<BillingPlans>>;
}>;

/** PostgreSQL's SQLSTATE for a function that does not exist. */
const UNDEFINED_FUNCTION = "42883";
/** How long one read of the switches is kept. A switch happens with an upload, so a few seconds late is harmless. */
const SWITCHES_KEPT_MS = 15_000;

/**
 * The reader both the API and the runner build at boot. `ownPlans` are the plans of this process's own settings
 * version, `ownVersion`: they are never read again, and they answer whenever the record gives nothing this process can
 * use (no switch recorded yet, as in development; a version that sealed no plans row; a row of a newer release whose
 * shape this code does not know). Sealed rows never change, so each version is read once.
 */
export function createBillingPlansInForce(options: Readonly<{
  pool: Pool; ownVersion: number; ownPlans: BillingPlans; clock?: () => Date;
}>): BillingPlansInForce {
  const clock = options.clock ?? (() => new Date());
  const plansByVersion = new Map<number, BillingPlans | null>([[options.ownVersion, options.ownPlans]]);
  let switches: Readonly<{ readAt: number; rows: ReadonlyArray<ReleaseSwitch> }> | null = null;

  const readSwitches = async (): Promise<ReadonlyArray<ReleaseSwitch>> => {
    const now = clock().getTime();
    if (switches !== null && now - switches.readAt < SWITCHES_KEPT_MS) return switches.rows;
    let recorded: ReadonlyArray<Readonly<{ release_key: string; take_traffic_from: Date }>>;
    try {
      recorded = (await options.pool.query<{ release_key: string; take_traffic_from: Date }>(
        "SELECT release_key, take_traffic_from FROM core.read_release_history() ORDER BY event_seq"
      )).rows;
    } catch (error) {
      // A database that does not have migration 0183 yet (a practice run before the step is applied) has no reader:
      // nothing is known of the switches, so this process's own plans answer, as before 0183.
      if ((error as { code?: unknown } | null)?.code !== UNDEFINED_FUNCTION) throw error;
      recorded = [];
    }
    const rows = Object.freeze(recorded.map((row) => Object.freeze({
      siteVersion: parseReleaseKey(row.release_key).siteVersion, takeTrafficFrom: row.take_traffic_from
    })));
    switches = Object.freeze({ readAt: now, rows });
    return rows;
  };

  const plansOf = async (version: number): Promise<BillingPlans | null> => {
    const known = plansByVersion.get(version);
    if (known !== undefined) return known;
    let plans: BillingPlans | null;
    try {
      plans = await readBillingPlans(options.pool, version);
    } catch (error) {
      if (!(error instanceof TypedDomainError) || error.code !== "BILLING_PLANS_INVALID") throw error;
      plans = null;
    }
    plansByVersion.set(version, plans);
    return plans;
  };

  return Object.freeze({
    async between(from: Date, to: Date): Promise<ReadonlyArray<BillingPlans>> {
      const versions = settingsVersionsServedBetween(await readSwitches(), from, to);
      const served: BillingPlans[] = [];
      for (const version of versions) {
        const plans = await plansOf(version);
        if (plans !== null) served.push(plans);
      }
      return Object.freeze(served.length === 0 ? [options.ownPlans] : served);
    }
  });
}
