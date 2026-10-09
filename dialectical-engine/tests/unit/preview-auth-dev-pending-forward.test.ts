import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { loadMigrationPlan, type MigrationPlan } from '../../packages/db/src/migration-lineage.js';
import { NativeVerifyPendingForwardStepError, pendingForwardSteps, refusePendingForwardSteps } from '../../deploy/preview-auth-dev/v1/verify-native.js';

// The preview's verify never applies a database step (ruling PR-57): a forward step the ledger lacks is refused
// before migrate() runs; only the native operator's apply-and-plan applies one.
const NETOPIA_STEP = '0109_billing_netopia.sql';
const chainOf = (...names: string[]) => ({ forwardChain: names.map(name => ({ name })) }) as unknown as Pick<MigrationPlan, 'forwardChain'>;
const fakePool = (names: readonly string[]) => {
 const queries: string[] = [];
 const pool = { query: async (sql: string) => { queries.push(sql); return { rows: names.map(name => ({ name })) }; } } as unknown as Pool;
 return { pool, queries };
};

describe('pendingForwardSteps', () => {
 it('returns the missing names in chain order', () => {
  const chain = chainOf('0109_a.sql', '0110_b.sql', '0111_c.sql');
  expect(pendingForwardSteps(chain, new Set(['0110_b.sql']))).toEqual(['0109_a.sql', '0111_c.sql']);
  expect(pendingForwardSteps(chain, new Set())).toEqual(['0109_a.sql', '0110_b.sql', '0111_c.sql']);
 });
 it('returns none when every step is applied', () => {
  expect(pendingForwardSteps(chainOf('0109_a.sql', '0110_b.sql'), new Set(['0108_x.sql', '0109_a.sql', '0110_b.sql']))).toEqual([]);
 });
 it('reads this source\'s chain: 0109 is pending on a database that has only 0108', async () => {
  const plan = await loadMigrationPlan();
  expect(plan.forwardChain.map(step => step.name)).toContain(NETOPIA_STEP);
  expect(pendingForwardSteps(plan, new Set([plan.forward108.name]))).toEqual(plan.forwardChain.map(step => step.name));
 });
});

describe('refusePendingForwardSteps', () => {
 it('refuses, naming 0109, when the ledger lacks it, with one read-only SELECT', async () => {
  const plan = await loadMigrationPlan();
  const { pool, queries } = fakePool([...plan.manifest.order, plan.forward108.name]);
  const refusal = await refusePendingForwardSteps(pool, plan).then(() => undefined, (error: unknown) => error);
  expect(refusal).toBeInstanceOf(NativeVerifyPendingForwardStepError);
  const error = refusal as NativeVerifyPendingForwardStepError;
  expect(error.code).toBe('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP');
  expect(error.name).toBe('NativeVerifyPendingForwardStepError');
  expect(error.pending).toContain(NETOPIA_STEP);
  expect(Object.isFrozen(error.pending)).toBe(true);
  expect(error.message).toBe(`PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: ${error.pending.join(', ')}. Verify never applies a migration; run the native operator with operation apply-and-plan first.`);
  expect(queries).toEqual(['SELECT name FROM public.debateai_schema_migration']);
 });
 it('resolves when every forward step is in the ledger', async () => {
  const plan = await loadMigrationPlan();
  const { pool, queries } = fakePool([...plan.manifest.order, plan.forward108.name, ...plan.forwardChain.map(step => step.name)]);
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
