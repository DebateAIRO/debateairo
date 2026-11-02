/**
 * K02 (security-audit run 3, NV-08): the one shared way the API's 30 s erasure pass runs its stages and reports what
 * they leave unsettled. Each stage has its own catch, so a stage that throws (or returns something unreadable) is
 * reported by name and never skips the stages after it; the pass still rejects once at the end, so the single-flight
 * wrapper's [ACCOUNT_ERASURE_RECONCILIATION_PENDING] keeps its meaning. Lines carry counts and bounded tokens only:
 * never an id, an address, a key identity or a cause.
 */

/** K02 (NV-08): the four stages of the API's 30 s erasure pass, in run order. */
export const ERASURE_RECONCILE_CHAIN_STAGES = Object.freeze([
  "erasure-notice", "run-key-provision", "private-run-erasure", "account-erasure"
] as const);
export type ErasureReconcileChainStage = typeof ERASURE_RECONCILE_CHAIN_STAGES[number];
export type ErasureStageOutcome = Readonly<{ outcome: string; diagnosticStage?: string }>;

/** Outcomes that need no operator attention. Everything else is counted in the attention line.
 *  private-run-erasure: completePrepared returns CLEANED, NOT_FOUND, INVALID_EVIDENCE or a FINALIZE outcome; it never
 *  returns ERASED or LEGACY_PLAINTEXT_RETAINED (packages/db/src/account-erasure.ts, completePrepared), so they are not
 *  listed. */
const SETTLED_ERASURE_OUTCOMES: Readonly<Record<ErasureReconcileChainStage, readonly string[]>> = Object.freeze({
  "erasure-notice": Object.freeze(["ACKNOWLEDGED"]),
  "run-key-provision": Object.freeze(["CLEANED"]),
  "private-run-erasure": Object.freeze(["CLEANED"]),
  "account-erasure": Object.freeze(["CLEANED", "CLEANED_WITH_LEGACY_RESIDUAL", "CANCELLED"])
});
const OUTCOME_TOKEN = /^[A-Z][A-Z_]{0,39}$/u;
const DIAGNOSTIC_TOKEN = /^[a-z][a-z-]{0,39}$/u;

/** Counts only: no id, address, cause or key identity. Unknown tokens are bucketed, never echoed. */
export function erasureReconcileAttentionLine(
  stage: ErasureReconcileChainStage, outcomes: readonly ErasureStageOutcome[]
): string | null {
  const settled = SETTLED_ERASURE_OUTCOMES[stage];
  const counts = new Map<string, number>();
  for (const item of outcomes) {
    if (settled.includes(item.outcome)) continue;
    const outcome = OUTCOME_TOKEN.test(item.outcome) ? item.outcome : "UNKNOWN";
    const key = item.diagnosticStage === undefined ? outcome
      : `${outcome}/${DIAGNOSTIC_TOKEN.test(item.diagnosticStage) ? item.diagnosticStage : "unknown"}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const pairs = [...counts.keys()].sort().map((key) => `${key}=${counts.get(key)!}`);
  return `[ERASURE_RECONCILE_ATTENTION] stage=${stage} ${pairs.join(" ")}`;
}

export async function runErasureReconcileChain(
  stages: readonly Readonly<{ stage: ErasureReconcileChainStage; work: () => Promise<readonly ErasureStageOutcome[]> }>[],
  log: (line: string) => void
): Promise<void> {
  let failed = false;
  for (const { stage, work } of stages) {
    let line: string | null;
    // The catch binds nothing: the cause can carry a driver message or a key identity, so it is discarded (as the
    // coordinators' own catches do), and the stage's name is the whole report.
    try { line = erasureReconcileAttentionLine(stage, await work()); }
    catch { failed = true; log(`[ERASURE_RECONCILE_STAGE_FAILED] stage=${stage}`); continue; }
    if (line !== null) log(line);
  }
  if (failed) throw new TypeError("ERASURE_RECONCILE_STAGE_FAILED");
}
