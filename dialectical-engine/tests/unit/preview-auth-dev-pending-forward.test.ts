import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';
import { loadMigrationPlan, type MigrationPlan } from '../../packages/db/src/migration-lineage.js';
import { NativeVerifyPendingForwardStepError, pendingForwardSteps, refusePendingForwardSteps } from '../../deploy/preview-auth-dev/v1/verify-native.js';

// The preview's verify never applies a database step (ruling PR-57): a step the database lacks is refused before
// migrate() runs; only the native operator's apply-and-plan applies one. F10 (PR-58): dev's 0110 is applied by
// migrate() too (applyForward110). F11 (PR-59): the guard is general: every numbered migration the source holds (the
// list loadMigrationPlan checks for SOURCE_INVENTORY: the recipe's sources, 0108, 0110 and the chain) must be recorded
// in the ledger or as a resolution's logical name, or it is pending.
const NETOPIA_STEP = '0111_billing_netopia.sql';
// The auth DB batch, chained after 0111 (migrations/lineage/README.md).
const BATCH_STEP = '0112_auth_db_batch.sql';
// Part C's step, chained after the auth DB batch (spec 2026-10-05 §2.16.6).
const PART_C_STEP = '0113_billing_price_currencies.sql';
// Role rotation's step, chained after Part C's (spec 2026-10-11 Part 3).
const ROLE_ROTATION_STEP = '0114_role_rotation.sql';
// data-export S01 (V-41): the chain's fifth step.
const EXPORT_STEP = '0115_data_export.sql';
// The mail-locale step (S01-C05): the chain's sixth step, after the export.
const MAIL_LOCALE_STEP = '0116_mail_locale.sql';
// The debate shape's map (spec 2026-10-12 §3.4): the chain's seventh step.
const MAP_STEP = '0117_debate_shape_map.sql';
// The language check's site cost (question-language spec 2026-10-13, P2L Task 19): the chain's eighth step.
const LANGUAGE_CHECK_STEP = '0118_language_check_spend.sql';
// The reclaim resume (spec 2026-10-14-reclaim-resume-design, "The database change"): the chain's ninth step.
const RECLAIM_STEP = '0119_reclaim_resume.sql';
// The reply measures (length guidance LG-A, spec 2026-10-15): the chain's tenth step.
const REPLY_MEASURES_STEP = '0120_reply_measures.sql';
// The engine verdict (engine redesign R2, spec 2026-10-15): the chain's eleventh step.
const ENGINE_VERDICT_STEP = '0121_engine_verdict.sql';
// The engine's map answer step (engine redesign R3, spec 2026-10-15): the chain's twelfth step.
const ENGINE_MAP_CHECK_STEP = '0122_engine_map_check.sql';
// The side-by-side releases (side-by-side uploads, spec 2026-10-21): the chain's thirteenth step.
const SIDE_BY_SIDE_STEP = '0123_side_by_side_releases.sql';
// The settings activation (side-by-side uploads spec §13): the chain's fourteenth step.
const SETTINGS_ACTIVATION_STEP = '0124_settings_activation.sql';
// The Italy-specific approval (mission italy-clause-approval, slice S01): the chain's fifteenth step.
const ITALY_STEP = '0125_italy_specific_approval.sql';
// synthesis-flag's four steps, chained after the Italy-specific approval (S01-S05).
const SYNTHESIS_CHECK_STEP = '0126_synthesis_check.sql';
const PUBLICATION_REVIEW_STEP = '0127_publication_review.sql';
const THREAT_REPORT_STEP = '0128_threat_reports.sql';
const SUPPORT_ANSWER_SCOPE_STEP = '0129_support_answer_scope.sql';
// Row-level security (mission row-level-security, SPEC-v4 R26): the chain's twentieth step.
const RLS_STEP = '0130_row_level_security.sql';
// The security fixes of audit run 3 (one section per issue): the chain's twenty-first step.
const SECURITY_FIXES_STEP = '0131_security_fixes_run3.sql';
// The three recovery notice due indexes (NV-38, outside-transaction steps): the chain's twenty-second to twenty-fourth steps.
const DUE_INDEX_STEPS = ['0132_password_reset_notice_due.sql', '0133_backup_email_notice_due.sql', '0134_mfa_recovery_notice_due.sql'] as const;
// The MFA recovery control user index (NV-15 and NV-16, an outside-transaction step): the chain's twenty-fifth step.
const CONTROL_INDEX_STEP = '0135_mfa_recovery_control_user_started.sql';
const DEV_STEP = '0110_account_erasure_public_debates.sql';
const LEDGER = 'SELECT name FROM public.debateai_schema_migration';
const RESOLUTION_TABLE = "SELECT to_regclass('public.debateai_schema_migration_resolution') IS NOT NULL present";
const RESOLUTIONS = 'SELECT logical_name FROM public.debateai_schema_migration_resolution';
type GuardPlan = Parameters<typeof pendingForwardSteps>[0];
const planOf = (sources: string[], ...chain: string[]) => ({ manifest: { order: sources }, forward108: { name: '0108_x.sql' }, forward110: { name: '0110_dev.sql' },
 forwardChain: chain.map(name => ({ name })) }) as unknown as GuardPlan;
const chainOf = (...names: string[]) => planOf(['0001_a.sql', '0002_b.sql'], ...names);
const BASE = ['0001_a.sql', '0002_b.sql', '0108_x.sql'];
// A fake pool answering the guard's three read-only SELECTs; resolutions === null means the table does not exist.
const fakePool = (names: readonly string[], resolutions: readonly string[] | null = []) => {
 const queries: string[] = [];
 const pool = { query: async (sql: string) => {
  queries.push(sql);
  if (sql === LEDGER) return { rows: names.map(name => ({ name })) };
  if (sql === RESOLUTION_TABLE) return { rows: [{ present: resolutions !== null }] };
  if (sql === RESOLUTIONS && resolutions !== null) return { rows: resolutions.map(logical_name => ({ logical_name })) };
  throw new Error(`unexpected query: ${sql}`);
 } } as unknown as Pool;
 return { pool, queries };
};
const sourceNames = (plan: MigrationPlan) => [...plan.manifest.order, plan.forward108.name, plan.forward110.name, ...plan.forwardChain.map(step => step.name)];

describe('pendingForwardSteps', () => {
 it('returns the missing names in the plan\'s apply order: the recipe\'s sources, 0108, 0110, then the chain', () => {
  const chain = chainOf('0111_a.sql', '0112_b.sql', '0113_c.sql');
  expect(pendingForwardSteps(chain, new Set([...BASE, '0110_dev.sql', '0112_b.sql']))).toEqual(['0111_a.sql', '0113_c.sql']);
  expect(pendingForwardSteps(chain, new Set())).toEqual(['0001_a.sql', '0002_b.sql', '0108_x.sql', '0110_dev.sql', '0111_a.sql', '0112_b.sql', '0113_c.sql']);
  expect(pendingForwardSteps(chain, new Set(['0002_b.sql', '0110_dev.sql', '0111_a.sql', '0112_b.sql', '0113_c.sql']))).toEqual(['0001_a.sql', '0108_x.sql']);
 });
 it('returns dev\'s 0110 first when the database lacks it', () => {
  expect(pendingForwardSteps(chainOf('0111_a.sql'), new Set([...BASE, '0111_a.sql']))).toEqual(['0110_dev.sql']);
 });
 it('returns none when every name is applied', () => {
  expect(pendingForwardSteps(chainOf('0111_a.sql', '0112_b.sql'), new Set([...BASE, '0110_dev.sql', '0111_a.sql', '0112_b.sql']))).toEqual([]);
 });
 it('reads this source\'s plan: 0110, 0111, 0112, 0113, 0114, 0115, 0116, 0117, 0118, 0119, 0120, 0121, 0122, 0123, 0124, 0125, 0126, 0127, 0128, 0129, 0130, 0131, 0132, 0133, 0134 and 0135 are pending, in that order, on a database complete through 0108', async () => {
  const plan = await loadMigrationPlan();
  expect(plan.forward110.name).toBe(DEV_STEP);
  expect(plan.forwardChain.map(step => step.name)).toEqual([NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name]))).toEqual([DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
 });
 it('reads this source\'s plan: only the chain (0111, 0112, 0113, 0114, 0115, 0116, 0117, 0118, 0119, 0120, 0121, 0122, 0123, 0124, 0125, 0126, 0127, 0128, 0129, 0130, 0131, 0132, 0133, 0134, 0135) is pending on a database complete through dev\'s 0110', async () => {
  const plan = await loadMigrationPlan();
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP]))).toEqual([NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP]))).toEqual([BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP]))).toEqual([PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP]))).toEqual([ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP]))).toEqual([EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP]))).toEqual([MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP]))).toEqual([MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP]))).toEqual([LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP]))).toEqual([RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP]))).toEqual([REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP]))).toEqual([ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP]))).toEqual([ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP]))).toEqual([SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP]))).toEqual([SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP]))).toEqual([ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP]))).toEqual([RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP]))).toEqual([SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP]))).toEqual([...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS]))).toEqual([CONTROL_INDEX_STEP]);
 });
 it('reads this source\'s plan: a recipe source the database lacks is pending, in apply order before 0108', async () => {
  const plan = await loadMigrationPlan();
  const missing = plan.manifest.order[3]!;
  expect(pendingForwardSteps(plan, new Set(sourceNames(plan).filter(name => name !== missing && name !== NETOPIA_STEP)))).toEqual([missing, NETOPIA_STEP]);
 });
 it('covers exactly the numbered migrations the source holds (the SOURCE_INVENTORY list)', async () => {
  const plan = await loadMigrationPlan();
  const discovered = (await readdir(new URL('../../migrations/', import.meta.url))).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  expect([...pendingForwardSteps(plan, new Set())].sort()).toEqual(discovered);
  expect(pendingForwardSteps(plan, new Set())).toEqual(sourceNames(plan));
 });
});

describe('refusePendingForwardSteps', () => {
 it('refuses, naming 0111, 0112, 0113, 0114, 0115, 0116, 0117, 0118, 0119, 0120, 0121, 0122, 0123, 0124, 0125, 0126, 0127, 0128, 0129, 0130, 0131, 0132, 0133, 0134 and 0135, when the database lacks them, with read-only SELECTs only', async () => {
  const plan = await loadMigrationPlan();
  const { pool, queries } = fakePool([...plan.manifest.order, plan.forward108.name, plan.forward110.name]);
  const refusal = await refusePendingForwardSteps(pool, plan).then(() => undefined, (error: unknown) => error);
  expect(refusal).toBeInstanceOf(NativeVerifyPendingForwardStepError);
  const error = refusal as NativeVerifyPendingForwardStepError;
  expect(error.code).toBe('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP');
  expect(error.name).toBe('NativeVerifyPendingForwardStepError');
  expect(error.pending).toEqual([NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP]);
  expect(Object.isFrozen(error.pending)).toBe(true);
  expect(error.message).toBe(`PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: ${error.pending.join(', ')}. Verify never applies a migration; run the native operator with operation apply-and-plan first.`);
  expect(queries).toEqual([LEDGER, RESOLUTION_TABLE, RESOLUTIONS]);
 });
 it('refuses, naming 0110, 0111, 0112, 0113, 0114, 0115, 0116, 0117, 0118, 0119, 0120, 0121, 0122, 0123, 0124, 0125, 0126, 0127, 0128, 0129, 0130, 0131, 0132, 0133, 0134 and 0135 in that order, on a database complete through 0108 (a plan carrying forward110 not applied)', async () => {
  const plan = await loadMigrationPlan();
  const { pool } = fakePool([...plan.manifest.order, plan.forward108.name]);
  await expect(refusePendingForwardSteps(pool, plan)).rejects.toMatchObject({ code: 'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP', pending: [DEV_STEP, NETOPIA_STEP, BATCH_STEP, PART_C_STEP, ROLE_ROTATION_STEP, EXPORT_STEP, MAIL_LOCALE_STEP, MAP_STEP, LANGUAGE_CHECK_STEP, RECLAIM_STEP, REPLY_MEASURES_STEP, ENGINE_VERDICT_STEP, ENGINE_MAP_CHECK_STEP, SIDE_BY_SIDE_STEP, SETTINGS_ACTIVATION_STEP, ITALY_STEP, SYNTHESIS_CHECK_STEP, PUBLICATION_REVIEW_STEP, THREAT_REPORT_STEP, SUPPORT_ANSWER_SCOPE_STEP, RLS_STEP, SECURITY_FIXES_STEP, ...DUE_INDEX_STEPS, CONTROL_INDEX_STEP] });
 });
 it('refuses, naming 0110, when only 0110 is missing', async () => {
  const plan = await loadMigrationPlan();
  const { pool } = fakePool(sourceNames(plan).filter(name => name !== DEV_STEP));
  await expect(refusePendingForwardSteps(pool, plan)).rejects.toMatchObject({ pending: [DEV_STEP] });
 });
 it('refuses a recipe source recorded in neither the ledger nor the resolutions', async () => {
  const plan = await loadMigrationPlan();
  const missing = plan.manifest.compatibility.logicalName;
  const { pool } = fakePool(sourceNames(plan).filter(name => name !== missing));
  await expect(refusePendingForwardSteps(pool, plan)).rejects.toMatchObject({ pending: [missing] });
 });
 it('counts a resolved logical name as present (the compatibility and the fresh-resolutions lineages)', async () => {
  const plan = await loadMigrationPlan();
  const compatibility = [plan.manifest.compatibility.logicalName];
  const wrappers = plan.manifest.transactionBodies.map(({ logicalName }) => logicalName);
  for (const resolved of [compatibility, wrappers]) {
   const { pool, queries } = fakePool(sourceNames(plan).filter(name => !resolved.includes(name)), resolved);
   await expect(refusePendingForwardSteps(pool, plan)).resolves.toBeUndefined();
   expect(queries).toEqual([LEDGER, RESOLUTION_TABLE, RESOLUTIONS]);
  }
 });
 it('treats a missing resolution table as empty and does not read it', async () => {
  const plan = await loadMigrationPlan();
  const complete = fakePool(sourceNames(plan), null);
  await expect(refusePendingForwardSteps(complete.pool, plan)).resolves.toBeUndefined();
  expect(complete.queries).toEqual([LEDGER, RESOLUTION_TABLE]);
  const wrappers = plan.manifest.transactionBodies.map(({ logicalName }) => logicalName);
  const lacking = fakePool(sourceNames(plan).filter(name => !wrappers.includes(name)), null);
  await expect(refusePendingForwardSteps(lacking.pool, plan)).rejects.toMatchObject({ pending: wrappers });
 });
 it('resolves when every name is applied', async () => {
  const plan = await loadMigrationPlan();
  const { pool, queries } = fakePool(sourceNames(plan));
  await expect(refusePendingForwardSteps(pool, plan)).resolves.toBeUndefined();
  expect(queries).toEqual([LEDGER, RESOLUTION_TABLE, RESOLUTIONS]);
 });
 it('loads the source plan itself when none is given', async () => {
  const plan = await loadMigrationPlan();
  await expect(refusePendingForwardSteps(fakePool([]).pool)).rejects.toMatchObject({ code: 'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP', pending: sourceNames(plan) });
 });
});

describe('verifyNativeState refuses a pending forward step before migrate() runs', () => {
 it('calls refusePendingForwardSteps after the 0108 check and before migrate(', async () => {
  const text = await readFile(new URL('../../deploy/preview-auth-dev/v1/verify-native.ts', import.meta.url), 'utf8');
  const start = text.indexOf('export async function verifyNativeState(');
  expect(start).toBeGreaterThan(-1);
  const body = text.slice(start);
  const check108 = body.indexOf("name='0108_preview_recovery_verified_bindings.sql'");
  const refusal = body.indexOf('await refusePendingForwardSteps(pool,plan);');
  // Side-by-side spec §5 (D5 review): one replay for every database; on a database ahead it carries the pinned newer chain.
  const replay = body.indexOf('const replayed=await migrate(pool,ahead===null?{}:{newerChain:ahead.newerChain});');
  expect(check108).toBeGreaterThan(-1);
  expect(refusal).toBeGreaterThan(check108);
  expect(replay).toBeGreaterThan(refusal);
  expect(body.indexOf('migrate(')).toBe(replay+'const replayed=await '.length); // the first migrate( of verifyNativeState
  expect(body.split('migrate(')).toHaveLength(2); // and its only one
  // Nothing it applied counts as a verify: a replay that applied a step refuses.
  expect(body).toContain('if(replayed.appliedSteps.length!==0||!sameSteps(replayed.extraSteps,extra))fail();');
 });
});

// The native operator (ruling PR-57, aligned byte for byte with the v3-preview session's 051e77964): only apply-and-plan
// applies SQL; publish refuses a pending forward step before it writes a register version; the command line prints the
// pending-step line and keeps every other failure opaque.
describe('the native operator refuses a pending forward step and names it', () => {
 const operatorPath = new URL('../../deploy/preview-auth-dev/v1/native-operator.mjs', import.meta.url);
 it('prints the pending-step refusal as its one line', async () => {
  const operator = await import('../../deploy/'+'preview-auth-dev/v1/native-operator.mjs');
  const error = new NativeVerifyPendingForwardStepError([NETOPIA_STEP]);
  expect(operator.operatorRefusalLine(error)).toBe(`${error.message}\n`);
 });
 it('keeps every other failure opaque', async () => {
  const operator = await import('../../deploy/'+'preview-auth-dev/v1/native-operator.mjs');
  // A two-line message whose first line is a genuine refusal: the whole message must be that one line.
  const genuine = new NativeVerifyPendingForwardStepError([NETOPIA_STEP]).message;
  const forged = Object.assign(new Error(`${genuine}\nsecond line`), { code: 'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP' });
  for (const other of [new TypeError('PREVIEW_NATIVE_VERIFICATION_REFUSED'), forged, undefined]) {
   expect(operator.operatorRefusalLine(other)).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
  }
 });
 it('refuses a pending step in publish before it writes, and migrates only in apply-and-plan', async () => {
  const text = await readFile(operatorPath, 'utf8');
  const start = text.indexOf('export async function runNativeOperator(');
  expect(start).toBeGreaterThan(-1);
  const body = text.slice(start);
  const planReturn = body.indexOf("if(plan.operation==='plan'||plan.operation==='apply-and-plan')return metadata;");
  const preCheck = body.indexOf("if(plan.operation==='publish')await verify.refusePendingForwardSteps(pool);");
  const publish = body.indexOf('publisher.publishPreviewRegisterV2('); // publish kit v2 (publish-register-v2.ts)
  expect(planReturn).toBeGreaterThan(-1);
  expect(preCheck).toBeGreaterThan(planReturn);
  expect(publish).toBeGreaterThan(preCheck);
  expect(text.split('migrate(')).toHaveLength(2); // the file's only migrate(
  expect(text).toContain("if(plan.operation==='apply-and-plan')await db.migrate(pool);");
  const applyLine = "if(plan.operation==='apply-and-plan')await db.migrate(pool);";
  expect(text.indexOf('migrate(')).toBe(text.indexOf(applyLine) + applyLine.indexOf('migrate('));
 });
});
