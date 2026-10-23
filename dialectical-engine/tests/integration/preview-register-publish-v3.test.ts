import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { migrate } from '@debateai/db';
import {
  loadBootstrapRegister, createPostgresRegisterPublicationPort, canonicalRegisterJson, parseRegisterVersionText,
  readBillingPolicy, readCostEnvelopePolicy, readAdmissionPolicy, readStoryPolicyFromRegister, readCostEstimateStartPolicy, costEnvelopeBand
} from '@debateai/register';
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { PREVIEW_REVIEWED_PROVIDER_REFS, previewTargetJsonRow } from '../../packages/providers/src/preview-models.js';
import { verifyHostedRegisterBootReadiness } from '../../apps/runner/src/hosted-register-publish.js';
import { buildPreviewSourceRowsV2 } from '../../deploy/preview-auth-dev/v1/publish-register-v2.js';
import { buildPreviewSourceRowsV3, composePreviewSnapshotV3, publishPreviewRegisterV3, readSealedSnapshot } from '../../deploy/preview-auth-dev/v1/publish-register-v3.js';
import { startTestDatabase } from '../support/testDatabase.js';

const observation = { nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0', sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), operatorSha256: 'c'.repeat(64), observedAt: '2026-10-13T12:00:00.000Z' };
const approvalOf = (s: { baseRegisterVersion: string; baseSnapshotSha256: string; snapshotSha256: string; deltaSha256: string }) =>
  ({ baseRegisterVersion: s.baseRegisterVersion, baseSnapshotSha256: s.baseSnapshotSha256, snapshotSha256: s.snapshotSha256, deltaSha256: s.deltaSha256 });
/** The owner's suggested values (pending confirmation): $3 per debate, $10 per day; the kit's example room-read budget. */
const OFF = { billing: 'off', perRunCeilingMicros: 3_000_000, dailyCeilingMicros: 10_000_000, askRoomReads: { limit: 60, windowMs: 60_000, capacity: 65_536 } } as const;
const ON = { ...OFF, billing: 'on' } as const;
/** The preview's own provider targets, as the hosted boot reads them (every reviewed ref, priced, https). */
const TARGETS = JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow));

describe('publish kit v3 on PostgreSQL 18 (source evidence, not the Linux operator)', () => {
  it('publishes provider-only, then billing on, over the local register-12 shape; each version passes the hosted API\'s boot questions', async () => {
    const db = await startTestDatabase();
    try {
      await migrate(db.pool);
      const pool = db.pool;
      const bootstrap = await loadBootstrapRegister();
      const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
      // The live register 12 shape (imported as historical version 4, the highest an import takes): kit v2's local rows (billing off) and the two base-owned rows. Synthetic fixture setup only.
      await createPostgresRegisterPublicationPort(pool).importHistorical({ registerVersion: parseRegisterVersionText('4'), rows: [...await buildPreviewSourceRowsV2(bootstrap, observation), ...owned] });
      const v4 = await readSealedSnapshot(pool, '4');
      // The local version does not pass the hosted boot: no room-read budget beside the band.
      await expect(verifyHostedRegisterBootReadiness(pool, parseRegisterVersionText('4'), TARGETS)).rejects.toThrow();

      // 1. Provider-only: hosted rows, billing off.
      const first = composePreviewSnapshotV3({ sourceRows: await buildPreviewSourceRowsV3(bootstrap, observation, OFF), baseRows: v4.rows, baseRegisterVersion: '4', baseSnapshotSha256: v4.snapshotSha256 });
      expect(first.addedKeys).toEqual(['costEstimateStartPolicy', 'storyCostEnvelopePolicy']);
      const firstInput = { publicationId: randomUUID(), sourceRef: 'publish kit v3 fixture', snapshot: first, approval: approvalOf(first) };
      const v5 = await publishPreviewRegisterV3(pool, firstInput);
      expect(v5).toMatchObject({ registerVersion: '5', baseRegisterVersion: '4', rowCount: v4.rows.length + 2, snapshotSha256: first.snapshotSha256 });
      expect(await publishPreviewRegisterV3(pool, firstInput)).toEqual(v5);
      await verifyHostedRegisterBootReadiness(pool, parseRegisterVersionText('5'), TARGETS);
      expect((await readBillingPolicy(pool, 5))?.enabled).toBe(false);
      const envelope = await readCostEnvelopePolicy(pool, 5);
      expect([envelope.perRunCeilingMicros, envelope.dailyCeilingMicros]).toEqual([3_000_000, 10_000_000]);
      expect(costEnvelopeBand(envelope)).not.toBeNull();
      expect((await readAdmissionPolicy(pool, 5)).askRoomReads).toEqual({ key: 'owner', limit: 60, windowMs: 60_000, capacity: 65_536 });
      expect((await readStoryPolicyFromRegister(pool, 5))?.perStoryCeilingMicros).toBe(50_000);
      // Fresh-site estimate (owner rulings 2026-10-22): the API's cost-estimate-start-policy stage reads the sealed figures.
      expect((await readCostEstimateStartPolicy(pool, 5))?.minSamples).toBe(5);

      // 2. Billing on, over the provider-only version: the billing row alone changes.
      const current = await readSealedSnapshot(pool, '5');
      const second = composePreviewSnapshotV3({ sourceRows: await buildPreviewSourceRowsV3(bootstrap, observation, ON), baseRows: current.rows, baseRegisterVersion: '5', baseSnapshotSha256: current.snapshotSha256 });
      expect(second.changedKeys).toEqual(['billingPolicy']);
      const v6 = await publishPreviewRegisterV3(pool, { publicationId: randomUUID(), sourceRef: 'publish kit v3 fixture', snapshot: second, approval: approvalOf(second) });
      expect(v6).toMatchObject({ registerVersion: '6', baseRegisterVersion: '5' });
      await verifyHostedRegisterBootReadiness(pool, parseRegisterVersionText('6'), TARGETS);
      const billing = await readBillingPolicy(pool, 6);
      expect(billing?.enabled).toBe(true);
      expect(billing?.withdrawalCountries).toContain('US');

      // 3. A plan made on v5 is stale once v6 exists; sealed versions were never edited.
      await expect(publishPreviewRegisterV3(pool, { publicationId: randomUUID(), sourceRef: 'publish kit v3 fixture', snapshot: second, approval: approvalOf(second) })).rejects.toThrow('PREVIEW_REGISTER_BASE_NOT_CURRENT');
      expect(await readSealedSnapshot(pool, '4')).toEqual(v4);
      expect(await readSealedSnapshot(pool, '5')).toEqual(current);
    } finally { await db.stop(); }
  }, 180000);
});
