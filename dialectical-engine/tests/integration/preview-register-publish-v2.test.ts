import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { migrate } from '@debateai/db';
import {
  loadBootstrapRegister, createPostgresRegisterPublicationPort, canonicalRegisterJson, parseRegisterVersionText,
  CALL_CONCURRENCY_POLICY_ROW_KEY, callConcurrencyPolicyFromValue, callConcurrencyPolicyRow, readCallConcurrencyPolicy
} from '@debateai/register';
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2, publishPreviewRegisterV2, readSealedSnapshot } from '../../deploy/preview-auth-dev/v1/publish-register-v2.js';
import { startTestDatabase } from '../support/testDatabase.js';

const observation = { nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0', sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), operatorSha256: 'c'.repeat(64), observedAt: '2026-10-10T12:00:00.000Z' };
const approvalOf = (s: { baseRegisterVersion: string; baseSnapshotSha256: string; snapshotSha256: string; deltaSha256: string }) =>
  ({ baseRegisterVersion: s.baseRegisterVersion, baseSnapshotSha256: s.baseSnapshotSha256, snapshotSha256: s.snapshotSha256, deltaSha256: s.deltaSha256 });

describe('publish kit v2 on PostgreSQL 18 (source evidence, not the Linux operator)', () => {
  it('adds keys, then changes a value on top of the result, replays, and refuses a stale base or a different delta', async () => {
    const db = await startTestDatabase();
    try {
      await migrate(db.pool);
      const pool = db.pool;
      const source = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), observation)];
      const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
      // A historical base with v8's key set: the source without v1's three additions (consumerRecoveryPolicy,
      // publicationCheckPolicy, taxAuthorities) and the role rotation row (answerRoleRotationPolicy; the live v9 lacks only
      // the rotation row), plus the two base-owned rows. Synthetic fixture setup only; the operator never imports history.
      const base = [...source.filter(row => !['consumerRecoveryPolicy', 'publicationCheckPolicy', 'questionCheckPolicy', 'taxAuthorities', 'answerRoleRotationPolicy'].includes(row.rowKey)), ...owned];
      await createPostgresRegisterPublicationPort(pool).importHistorical({ registerVersion: parseRegisterVersionText('4'), rows: base });
      const v4 = await readSealedSnapshot(pool, '4');

      // 1. Four keys added (three from v1, and the role rotation row).
      const first = composePreviewSnapshotV2({ sourceRows: source, baseRows: v4.rows, baseRegisterVersion: '4', baseSnapshotSha256: v4.snapshotSha256 });
      expect(first.addedKeys).toEqual(['answerRoleRotationPolicy', 'consumerRecoveryPolicy', 'publicationCheckPolicy', 'questionCheckPolicy', 'taxAuthorities']);
      const firstInput = { publicationId: randomUUID(), sourceRef: 'publish kit v2 fixture', snapshot: first, approval: approvalOf(first) };
      const v5 = await publishPreviewRegisterV2(pool, firstInput);
      expect(v5).toMatchObject({ registerVersion: '5', baseRegisterVersion: '4', rowCount: 72, snapshotSha256: first.snapshotSha256 });
      // A crashed run re-run with the same plan replays its own receipt.
      expect(await publishPreviewRegisterV2(pool, firstInput)).toEqual(v5);

      // 2. One value changed on top of the 71-row result (v1's composer refuses this base).
      const changed = source.map(row => row.rowKey === 'composerContractHash' ? { ...row, valueJsonText: '"' + 'e'.repeat(64) + '"' } : row) as typeof source;
      const current = await readSealedSnapshot(pool, '5');
      const second = composePreviewSnapshotV2({ sourceRows: changed, baseRows: current.rows, baseRegisterVersion: '5', baseSnapshotSha256: current.snapshotSha256 });
      expect(second.addedKeys).toEqual([]);
      expect(second.changedKeys).toEqual(['composerContractHash']);
      // An approval for a different delta writes nothing.
      await expect(publishPreviewRegisterV2(pool, { publicationId: randomUUID(), sourceRef: 'publish kit v2 fixture', snapshot: second, approval: { ...approvalOf(second), deltaSha256: first.deltaSha256 } })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
      const v6 = await publishPreviewRegisterV2(pool, { publicationId: randomUUID(), sourceRef: 'publish kit v2 fixture', snapshot: second, approval: approvalOf(second) });
      expect(v6).toMatchObject({ registerVersion: '6', baseRegisterVersion: '5', rowCount: 72 });
      const v6Rows = (await readSealedSnapshot(pool, '6')).rows;
      expect(v6Rows.find(row => row.rowKey === 'composerContractHash')!.valueJsonText).toBe('"' + 'e'.repeat(64) + '"');
      for (const row of v6Rows) if (row.rowKey !== 'composerContractHash') expect(row).toEqual(current.rows.find(old => old.rowKey === row.rowKey));

      // 3. A plan made on v5 is stale once v6 exists, even with a matching approval.
      await expect(publishPreviewRegisterV2(pool, { publicationId: randomUUID(), sourceRef: 'publish kit v2 fixture', snapshot: second, approval: approvalOf(second) })).rejects.toThrow('PREVIEW_REGISTER_BASE_NOT_CURRENT');
      // Sealed versions were never edited.
      expect(await readSealedSnapshot(pool, '4')).toEqual(v4);
      expect(await readSealedSnapshot(pool, '5')).toEqual(current);
      // Nothing was written by the refused attempts: no version 7 (an explicit version, never a latest selection).
      expect((await pool.query('SELECT count(*)::int n FROM register.register_version WHERE register_version=$1', ['7'])).rows[0].n).toBe(0);
    } finally { await db.stop(); }
  }, 180000);

  // Parallel calls (spec 2026-10-12 §3.1): the row is optional input to the kit, absent by default.
  it('seals no callConcurrencyPolicy row by default, and seals exactly the built row when the operator supplies one', async () => {
    const db = await startTestDatabase();
    try {
      await migrate(db.pool);
      const pool = db.pool;
      const bootstrap = await loadBootstrapRegister();
      const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
      const absentSource = [...await buildPreviewSourceRowsV2(bootstrap, observation)];
      await createPostgresRegisterPublicationPort(pool).importHistorical({ registerVersion: parseRegisterVersionText('4'), rows: [...absentSource, ...owned] });
      const v4 = await readSealedSnapshot(pool, '4');

      // Absent: the default source carries no such row, so the version the kit seals has none.
      const absent = composePreviewSnapshotV2({ sourceRows: absentSource, baseRows: v4.rows, baseRegisterVersion: '4', baseSnapshotSha256: v4.snapshotSha256 });
      const changedSource = absentSource.map(row => row.rowKey === 'composerContractHash' ? { ...row, valueJsonText: '"' + 'e'.repeat(64) + '"' } : row) as typeof absentSource;
      const absentChanged = composePreviewSnapshotV2({ sourceRows: changedSource, baseRows: v4.rows, baseRegisterVersion: '4', baseSnapshotSha256: v4.snapshotSha256 });
      expect(absent.addedKeys).toEqual([]);
      await publishPreviewRegisterV2(pool, { publicationId: randomUUID(), sourceRef: 'publish kit v2 fixture', snapshot: absentChanged, approval: approvalOf(absentChanged) });
      const v5 = await readSealedSnapshot(pool, '5');
      expect(v5.rows.map(row => row.rowKey)).not.toContain(CALL_CONCURRENCY_POLICY_ROW_KEY);
      await expect(readCallConcurrencyPolicy(pool, 5)).resolves.toEqual({ state: 'ABSENT' });

      // Given: one added row, sealed exactly as callConcurrencyPolicyRow builds it.
      const policy = callConcurrencyPolicyFromValue({ kind: 'CALL_CONCURRENCY_POLICY', perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } });
      const givenSource = [...await buildPreviewSourceRowsV2(bootstrap, observation, undefined, undefined, policy)];
      const given = composePreviewSnapshotV2({ sourceRows: givenSource, baseRows: v5.rows, baseRegisterVersion: '5', baseSnapshotSha256: v5.snapshotSha256 });
      expect(given.addedKeys).toEqual([CALL_CONCURRENCY_POLICY_ROW_KEY]);
      expect(given.changedKeys).toEqual(['composerContractHash']);
      await publishPreviewRegisterV2(pool, { publicationId: randomUUID(), sourceRef: 'publish kit v2 fixture', snapshot: given, approval: approvalOf(given) });
      const sealed = (await readSealedSnapshot(pool, '6')).rows.find(row => row.rowKey === CALL_CONCURRENCY_POLICY_ROW_KEY);
      const expected = callConcurrencyPolicyRow(policy, 'docs/superpowers/specs/2026-10-12-parallel-calls-design.md; owner 2026-10-12');
      expect(sealed).toEqual({ rowKey: expected.rowKey, valueJsonText: expected.valueJsonText, sourceRef: expected.sourceRef });
      await expect(readCallConcurrencyPolicy(pool, 6)).resolves.toEqual({ state: 'SET', policy });
    } finally { await db.stop(); }
  }, 180000);
});
