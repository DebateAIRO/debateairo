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
 it('reads this source\'s plan: 0110 and 0111 are pending, in that order, on a database complete through 0108', async () => {
  const plan = await loadMigrationPlan();
  expect(plan.forward110.name).toBe(DEV_STEP);
  expect(plan.forwardChain.map(step => step.name)).toEqual([NETOPIA_STEP]);
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name]))).toEqual([DEV_STEP, NETOPIA_STEP]);
 });
 it('reads this source\'s plan: only 0111 is pending on a database complete through dev\'s 0110', async () => {
  const plan = await loadMigrationPlan();
  expect(pendingForwardSteps(plan, new Set([...plan.manifest.order, plan.forward108.name, DEV_STEP]))).toEqual([NETOPIA_STEP]);
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
 it('refuses, naming 0111, when the database lacks it, with read-only SELECTs only', async () => {
  const plan = await loadMigrationPlan();
  const { pool, queries } = fakePool([...plan.manifest.order, plan.forward108.name, plan.forward110.name]);
  const refusal = await refusePendingForwardSteps(pool, plan).then(() => undefined, (error: unknown) => error);
  expect(refusal).toBeInstanceOf(NativeVerifyPendingForwardStepError);
  const error = refusal as NativeVerifyPendingForwardStepError;
  expect(error.code).toBe('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP');
  expect(error.name).toBe('NativeVerifyPendingForwardStepError');
  expect(error.pending).toEqual([NETOPIA_STEP]);
  expect(Object.isFrozen(error.pending)).toBe(true);
  expect(error.message).toBe(`PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: ${error.pending.join(', ')}. Verify never applies a migration; run the native operator with operation apply-and-plan first.`);
  expect(queries).toEqual([LEDGER, RESOLUTION_TABLE, RESOLUTIONS]);
 });
 it('refuses, naming 0110 and 0111 in that order, on a database complete through 0108 (a plan carrying forward110 not applied)', async () => {
  const plan = await loadMigrationPlan();
  const { pool } = fakePool([...plan.manifest.order, plan.forward108.name]);
  await expect(refusePendingForwardSteps(pool, plan)).rejects.toMatchObject({ code: 'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP', pending: [DEV_STEP, NETOPIA_STEP] });
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
  const replay = body.indexOf('await migrate(pool);');
  expect(check108).toBeGreaterThan(-1);
  expect(refusal).toBeGreaterThan(check108);
  expect(replay).toBeGreaterThan(refusal);
  expect(body.indexOf('migrate(')).toBe(replay+'await '.length); // the first migrate( of verifyNativeState
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
  const publish = body.indexOf('publisher.publishPreviewRegister(');
  expect(planReturn).toBeGreaterThan(-1);
  expect(preCheck).toBeGreaterThan(planReturn);
  expect(publish).toBeGreaterThan(preCheck);
  expect(text.split('migrate(')).toHaveLength(2); // the file's only migrate(
  expect(text).toContain("if(plan.operation==='apply-and-plan')await db.migrate(pool);");
  const applyLine = "if(plan.operation==='apply-and-plan')await db.migrate(pool);";
  expect(text.indexOf('migrate(')).toBe(text.indexOf(applyLine) + applyLine.indexOf('migrate('));
 });
});
