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
 * Pure: the rosters and the models are the caller's.
 */
export function firstCallPlanModels(input: Readonly<{
  scorecardInForce: boolean;
  rosters: Readonly<Record<string, readonly string[]>>;
  models: readonly string[];
}>): Readonly<Record<string, readonly string[]>> {
  if (!input.scorecardInForce) return input.rosters;
  const configured = [...new Set(input.models)];
  return Object.freeze(Object.fromEntries(Object.entries(input.rosters).map(([plan, roster]) => {
    const own = [...new Set(roster)].filter((model) => configured.includes(model));
    return [plan, Object.freeze([...own, ...configured.filter((model) => !own.includes(model))])] as const;
  })));
}
