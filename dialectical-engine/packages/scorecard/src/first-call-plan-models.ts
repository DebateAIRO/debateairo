/**
 * PAID PLANS S2 (B9d's hand-off; budget spec §2.10) — THE MODELS A PLAN'S DEBATE
 * CAN SEAT, for the boot check that a run's arguing ceiling holds the first
 * position's own call (RUN_CEILING_BELOW_ONE_CALL, `firstCallsByPlanRoster`).
 *
 * Without a VALID scorecard in force the API keeps each ask's panel to its plan's
 * roster, so the rosters are handed back unchanged. With one, ask admission hands
 * the picker the plan's roster members first and then EVERY other healthy
 * discovered target (`reachableInTodaysOrder`, apps/api/src/ask-model-picker.ts),
 * and a roster member that is not configured refuses nothing. So every plan lists
 * every configured model once: its own roster's members first, in roster order,
 * then the rest in the order given. A list names only models the caller
 * configured, so no plan is left out for a roster member nobody configured.
 *
 * Paid plans S4b (final review P3-I2): a plan named in `ownRosterOnly` is seated
 * from its own roster alone even with a scorecard — on a site that sells plans the
 * API keeps a Free ask to the Free roster — so its list is its configured roster
 * members only. Only a caller that knows billing is on names one (the API's boot
 * and the hosted publish); absent, nothing changes.
 * Pure: the rosters and the models are the caller's.
 */
export function firstCallPlanModels(input: Readonly<{
  scorecardInForce: boolean;
  rosters: Readonly<Record<string, readonly string[]>>;
  models: readonly string[];
  ownRosterOnly?: readonly string[];
}>): Readonly<Record<string, readonly string[]>> {
  if (!input.scorecardInForce) return input.rosters;
  const configured = [...new Set(input.models)];
  const ownRosterOnly = new Set(input.ownRosterOnly ?? []);
  return Object.freeze(Object.fromEntries(Object.entries(input.rosters).map(([plan, roster]) => {
    const own = [...new Set(roster)].filter((model) => configured.includes(model));
    if (ownRosterOnly.has(plan)) return [plan, Object.freeze(own)] as const;
    return [plan, Object.freeze([...own, ...configured.filter((model) => !own.includes(model))])] as const;
  })));
}
