/*
 * The windows a person's usage read names, by plan, as the real API names them (apps/api/src/billing/usage.ts reads the
 * windows the plan counts): the register's Free has a monthly credit only ("Free has a monthly credit only",
 * packages/register/src/billing-plans.ts), so its read names the month alone; a paid plan names its day, week and month.
 * The header's quota circle shows the fullest of the windows the read names and opens one bar per window (the owner's
 * answers of 5 Nov, questions 14 B and 15), so the stand-in names only the windows the plan counts (the wave-4 browser
 * check, 5 Nov: a Free person saw three bars).
 */

/** The windows `plan` counts, from the full set the stand-in computes (in their own order). */
export function windowsForPlan<W extends Readonly<{ scope: string }>>(plan: string, windows: readonly W[]): W[] {
  return plan === "FREE" ? windows.filter((window) => window.scope === "PERSON_MONTH") : [...windows];
}
