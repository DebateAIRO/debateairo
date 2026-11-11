/**
 * The forward chain's steps, in order: the one list the tests keep of them.
 *
 * A test that needs the whole chain, its last step, the steps after one of them or a step's place reads it here, so a
 * new step is one line below and no edit anywhere else in the tests. tests/architecture/migration-forward-chain.test.ts
 * checks this list against the chain itself (the plan's steps, the STEPS literal of
 * packages/db/src/migration-forward-chain.ts and each step's n1 header), so a new step turns that test red on purpose
 * until its line is added here.
 *
 * Each line is the step's file name and its n1 header (side-by-side spec §5, packages/db/src/migration-n1.ts). Steps up
 * to 0122 predate the header ("none"). From 0123 on a step is "expand" or "drained" and keeps the verifier in force,
 * except row-level security's 0130, which brings its own ("drained, own verifier").
 */
export type ForwardStepN1 = "none" | "expand" | "drained" | "drained, own verifier";

const STEPS: ReadonlyArray<readonly [name: string, n1: ForwardStepN1]> = [
  ["0111_billing_netopia.sql", "none"],
  ["0112_auth_db_batch.sql", "none"],
  ["0113_billing_price_currencies.sql", "none"],
  ["0114_role_rotation.sql", "none"],
  ["0115_data_export.sql", "none"],
  ["0116_mail_locale.sql", "none"],
  ["0117_debate_shape_map.sql", "none"],
  ["0118_language_check_spend.sql", "none"],
  ["0119_reclaim_resume.sql", "none"],
  ["0120_reply_measures.sql", "none"],
  ["0121_engine_verdict.sql", "none"],
  ["0122_engine_map_check.sql", "none"],
  ["0123_side_by_side_releases.sql", "drained"],
  ["0124_settings_activation.sql", "expand"],
  ["0125_italy_specific_approval.sql", "expand"],
  ["0126_synthesis_check.sql", "drained"],
  ["0127_publication_review.sql", "drained"],
  ["0128_threat_reports.sql", "drained"],
  ["0129_support_answer_scope.sql", "drained"],
  ["0130_row_level_security.sql", "drained, own verifier"],
  ["0131_v4_account_memory.sql", "expand"],
  ["0132_web_evidence.sql", "expand"],
  ["0133_investigations.sql", "expand"],
  ["0134_dig_model_and_month_pause.sql", "expand"],
  ["0135_dig_picks.sql", "expand"],
  ["0136_investigation_reports.sql", "expand"],
  ["0137_public_debates.sql", "expand"],
  ["0138_tree_updates.sql", "expand"],
  ["0139_passage_retention.sql", "expand"],
  ["0140_internal_spend_kinds.sql", "drained"],
  ["0141_path_suggestions.sql", "expand"],
  ["0142_team_limit.sql", "drained"],
  ["0143_run_handover.sql", "expand"],
  ["0144_ask_clarify_charge.sql", "drained"],
  ["0145_web_researched_unsettled.sql", "expand"],
  ["0146_team_allowances.sql", "drained"],
  ["0147_public_tree.sql", "expand"],
  ["0148_erasure_keeps_public.sql", "drained"],
  ["0149_public_report_team_month.sql", "drained"],
  ["0150_public_review.sql", "drained"],
  ["0151_public_flag.sql", "drained"],
  ["0152_report_export_and_check_usage.sql", "expand"],
  ["0153_dig_tree_settled.sql", "expand"],
  ["0154_region_iceland_liechtenstein.sql", "expand"],
  ["0155_owner_answer_writes.sql", "expand"],
  ["0156_moderation_notice.sql", "expand"],
  ["0157_moderation_statements.sql", "expand"],
  ["0158_pre_start_charge.sql", "drained"],
  ["0159_start_paths.sql", "expand"],
  ["0160_path_results.sql", "expand"],
  ["0161_path_progress.sql", "expand"],
  ["0162_saved_questions.sql", "expand"],
  ["0163_carry_on_session_free_digs.sql", "drained"],
  ["0164_main_answer_path_added.sql", "drained"],
  ["0165_pre_start_release.sql", "drained"],
  ["0166_main_answer_times.sql", "expand"],
  ["0167_public_report_own_carrier.sql", "expand"],
  ["0168_set_aside_continue.sql", "drained"],
  ["0169_piece_settings_version.sql", "expand"],
  ["0170_outbound_mail_limit.sql", "expand"],
  ["0171_security_review_hardening.sql", "drained"],
  ["0172_moderation_notice_fixes.sql", "drained"],
  ["0173_settle_dismissed_flag.sql", "drained"],
  ["0174_public_review_ungrounded_door.sql", "drained"],
  ["0175_statement_ai_read_verdict.sql", "drained"]
];

/** Every step's file name, in chain order. */
export const FORWARD_STEPS: readonly string[] = Object.freeze(STEPS.map(([name]) => name));
/** The chain's last step: the head this code migrates a database to. */
export const LAST_STEP: string = FORWARD_STEPS.at(-1)!;

/** The step whose file name starts with `step` ("0132" or "0132_web_evidence.sql"); a name the list lacks throws. */
export function forwardStep(step: string): string {
  const found = FORWARD_STEPS.filter((name) => name.startsWith(step));
  if (found.length !== 1) throw new Error(`FORWARD_STEPS has no single step ${step} (tests/support/forward-chain-steps.ts)`);
  return found[0]!;
}
/** The step's place in the chain, counted from 0 (0111 is 0). */
export const stepIndex = (step: string): number => FORWARD_STEPS.indexOf(forwardStep(step));
/** The step and every step after it, in order. */
export const stepsFrom = (step: string): readonly string[] => FORWARD_STEPS.slice(stepIndex(step));
/** Every step after it, in order. */
export const stepsAfter = (step: string): readonly string[] => FORWARD_STEPS.slice(stepIndex(step) + 1);
/** Every step before it, in order. */
export const stepsBefore = (step: string): readonly string[] => FORWARD_STEPS.slice(0, stepIndex(step));

/** The entry of `chain` (a plan's forward chain, receipts, names) that sits at the step's place in this list. */
export function atStep<T>(chain: readonly T[], step: string): T {
  const entry = chain[stepIndex(step)];
  if (entry === undefined) throw new Error(`the chain has no entry at ${forwardStep(step)}'s place`);
  return entry;
}

/** What the step's n1 header declares, as the plan parses it (packages/db/src/migration-n1.ts): no header is all false. */
export function n1Of(step: string): Readonly<{ expand: boolean; drained: boolean; keepsVerifier: boolean }> {
  const n1 = STEPS[stepIndex(step)]![1];
  if (n1 === "none") return Object.freeze({ expand: false, drained: false, keepsVerifier: false });
  return Object.freeze({ expand: n1 === "expand", drained: n1 !== "expand", keepsVerifier: n1 !== "drained, own verifier" });
}

/** The step's loader in packages/db/src/migration-forward-chain.ts: loadForward0132; the first steps kept older names. */
export function loaderOf(step: string): string {
  const name = forwardStep(step);
  const older: Readonly<Record<string, string>> = {
    "0111_billing_netopia.sql": "loadForward111", "0112_auth_db_batch.sql": "loadForwardAuthDbBatch", "0115_data_export.sql": "loadForward115"
  };
  return older[name] ?? `loadForward${name.slice(0, 4)}`;
}
/** How STEPS in packages/db/src/migration-forward-chain.ts reads from this step to its end: "loadForward0132,…,loadForward0175]);". */
export const stepsLiteralFrom = (step: string): string => `${stepsFrom(step).map(loaderOf).join(",")}]);`;

/** A probe step's name, `offset` numbers after `after` (this chain's last step unless given): stepNameAfter(1, "probe") is "0176_probe.sql" while 0175 is last. */
export function stepNameAfter(offset: number, label: string, after: string = LAST_STEP): string {
  return `${String(Number(after.slice(0, 4)) + offset).padStart(4, "0")}_${label}.sql`;
}
