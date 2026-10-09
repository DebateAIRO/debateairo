import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { loadMigrationPlan, type MigrationPlan } from '../../packages/db/src/migration-lineage.js';
import { NativeVerifyPendingForwardStepError, pendingForwardSteps, refusePendingForwardSteps } from '../../deploy/preview-auth-dev/v1/verify-native.js';

// The preview's verify never applies a database step (ruling PR-57): a forward step the ledger lacks is refused
// before migrate() runs; only the native operator's apply-and-plan applies one. F10 (PR-58): dev's 0110 is applied by
// migrate() too (applyForward110), so a pending 0110 is refused like a pending chain step (0111, NETOPIA).
const NETOPIA_STEP = '0111_billing_netopia.sql';
const DEV_STEP = '0110_account_erasure_public_debates.sql';
const chainOf = (...names: string[]) => ({ forward110: { name: '0110_dev.sql' }, forwardChain: names.map(name => ({ name })) }) as unknown as Pick<MigrationPlan, 'forwardChain' | 'forward110'>;
const fakePool = (names: readonly string[]) => {
 const queries: string[] = [];
 const pool = { query: async (sql: string) => { queries.push(sql); return { rows: names.map(name => ({ name })) }; } } as unknown as Pool;
 return { pool, queries };
};

describe('pendingForwardSteps', () => {
 it('returns the missing names in chain order', () => {
  const chain = chainOf('0111_a.sql', '0112_b.sql', '0113_c.sql');
  expect(pendingForwardSteps(chain, new Set(['0110_dev.sql', '0112_b.sql']))).toEqual(['0111_a.sql', '0113_c.sql']);
  expect(pendingForwardSteps(chain, new Set())).toEqual(['0110_dev.sql', '0111_a.sql', '0112_b.sql', '0113_c.sql']);
 });
 it('returns dev\'s 0110 first when the ledger lacks it', () => {
  expect(pendingForwardSteps(chainOf('0111_a.sql'), new Set(['0108_x.sql', '0111_a.sql']))).toEqual(['0110_dev.sql']);
 });
 it('returns none when every step is applied', () => {
  expect(pendingForwardSteps(chainOf('0111_a.sql', '0112_b.sql'), new Set(['0108_x.sql', '0110_dev.sql', '0111_a.sql', '0112_b.sql']))).toEqual([]);
 });
 it('reads this source\'s plan: 0110 and 0111 are pending on a database that has only 0108', async () => {
  const plan = await loadMigrationPlan();
  expect(plan.forward110.name).toBe(DEV_STEP);
  expect(plan.forwardChain.map(step => step.name)).toEqual([NETOPIA_STEP]);
  expect(pendingForwardSteps(plan, new Set([plan.forward108.name]))).toEqual([DEV_STEP, NETOPIA_STEP]);
 });
 it('reads this source\'s plan: only 0111 is pending on a database at dev\'s 0108 and 0110', async () => {
  const plan = await loadMigrationPlan();
  expect(pendingForwardSteps(plan, new Set([plan.forward108.name, DEV_STEP]))).toEqual([NETOPIA_STEP]);
 });
});

describe('refusePendingForwardSteps', () => {
 it('refuses, naming 0111, when the ledger lacks it, with one read-only SELECT', async () => {
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
  expect(queries).toEqual(['SELECT name FROM public.debateai_schema_migration']);
 });
 it('refuses, naming 0110 and 0111, on a database at 0108 only (migrate() would apply dev\'s 0110 too)', async () => {
  const plan = await loadMigrationPlan();
  const { pool, queries } = fakePool([...plan.manifest.order, plan.forward108.name]);
  await expect(refusePendingForwardSteps(pool, plan)).rejects.toMatchObject({ code: 'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP', pending: [DEV_STEP, NETOPIA_STEP] });
  expect(queries).toHaveLength(1);
 });
 it('refuses, naming 0110, when only 0110 is missing', async () => {
  const plan = await loadMigrationPlan();
  const { pool } = fakePool([...plan.manifest.order, plan.forward108.name, ...plan.forwardChain.map(step => step.name)]);
  await expect(refusePendingForwardSteps(pool, plan)).rejects.toMatchObject({ pending: [DEV_STEP] });
 });
 it('resolves when every forward step is in the ledger', async () => {
  const plan = await loadMigrationPlan();
  const { pool, queries } = fakePool([...plan.manifest.order, plan.forward108.name, plan.forward110.name, ...plan.forwardChain.map(step => step.name)]);
  await expect(refusePendingForwardSteps(pool, plan)).resolves.toBeUndefined();
  expect(queries).toHaveLength(1);
 });
 it('loads the source plan itself when none is given', async () => {
  await expect(refusePendingForwardSteps(fakePool([]).pool)).rejects.toMatchObject({ code: 'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP' });
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
