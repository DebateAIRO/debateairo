import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBootstrapRegister, canonicalRegisterJson, parseCanonicalRegisterJson, computeRegisterSnapshotSha256 } from '@debateai/register';
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { buildPreviewSourceRows, composePreviewSnapshot } from '../../deploy/preview-auth-dev/v1/publish-register.js';
import {
  buildPreviewSourceRowsV2, composePreviewSnapshotV2, assertBaseIsCurrent, publishPreviewRegisterV2, previewDeltaSha256V2,
  PREVIEW_SOURCE_ROW_KEYS_V2, PREVIEW_BASE_OWNED_KEYS, BASE_NOT_CURRENT, PreviewRegisterBaseNotCurrentError
} from '../../deploy/preview-auth-dev/v1/publish-register-v2.js';

type Row = { rowKey: string; valueJsonText: string; sourceRef: string };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const runtime = { nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0', sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), operatorSha256: 'c'.repeat(64), observedAt: '2026-10-10T12:00:00.000Z' };
const V1_ADDITIONS = ['consumerRecoveryPolicy', 'publicationCheckPolicy', 'taxAuthorities'];
const canonical = (value: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value))) as string;
const owned = () => [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey, 'en'));

/** The two real preview shapes: the 65-row base v1 was written for (live v8) and the 68-row result (live v9). */
async function fixture() {
  const source: Row[] = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime)] as Row[];
  const v8 = sorted([...source.filter(row => !V1_ADDITIONS.includes(row.rowKey)).map(row => row.rowKey === 'nodeRuntimeVersion' ? { ...row, valueJsonText: '"v22.23.1"', sourceRef: 'historical node measurement' } : row), ...owned()]);
  // v9-like: what v1 published on top of v8, with the answer-writer fingerprint still at its v1 value.
  const v9 = sorted([...source.map(row => row.rowKey === 'composerContractHash' ? { ...row, valueJsonText: canonical('d96e7cc959e51339eef149991c58aafd5605542b3bf13b70a9cd722f67e0c866') } : row), ...owned()]);
  return { source, v8, v9 };
}
const compose = (source: Row[], base: Row[], version = '9') => composePreviewSnapshotV2({ sourceRows: source as any, baseRows: base as any, baseRegisterVersion: version, baseSnapshotSha256: computeRegisterSnapshotSha256(base as any) });

describe('publish kit v2: source closure', () => {
  it('builds exactly the reviewed key list, the same rows v1 builds today', async () => {
    const bootstrap = await loadBootstrapRegister();
    const rows = await buildPreviewSourceRowsV2(bootstrap, runtime);
    expect(rows.map(row => row.rowKey).sort()).toEqual([...PREVIEW_SOURCE_ROW_KEYS_V2].sort());
    expect(rows).toHaveLength(66);
    expect(rows).toEqual(await buildPreviewSourceRows(bootstrap, runtime));
    for (const key of PREVIEW_BASE_OWNED_KEYS) expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(key);
  });
  it('keeps v1\'s runtime gate', async () => {
    await expect(buildPreviewSourceRowsV2(await loadBootstrapRegister(), { ...runtime, nodeVersion: 'v22.23.1' })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
});

describe('publish kit v2: composing from the current version', () => {
  it('from the 65-row base it produces exactly v1\'s snapshot, reporting the three keys as added', async () => {
    const f = await fixture();
    const v1 = composePreviewSnapshot({ sourceRows: f.source as any, baseRows: f.v8 as any, baseRegisterVersion: '8', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v8 as any) });
    const v2 = compose(f.source, f.v8, '8');
    expect(v2.snapshotSha256).toBe(v1.snapshotSha256);
    expect(v2.rows).toEqual(v1.rows);
    expect(v2.addedKeys).toEqual(V1_ADDITIONS);
    for (const key of V1_ADDITIONS) {
      const entry = v2.delta.find(row => row.rowKey === key)!;
      expect(entry).toMatchObject({ change: 'added', reason: 'added-source-key', oldValueJsonText: null, oldSourceRef: null, oldValueSha256: null, oldSourceRefSha256: null });
      expect(entry.newValueJsonText).toBe(f.source.find(row => row.rowKey === key)!.valueJsonText);
      expect(entry.newValueSha256).toBe(sha(entry.newValueJsonText));
    }
    expect(v2.delta.find(row => row.rowKey === 'nodeRuntimeVersion')).toMatchObject({ change: 'changed', reason: 'observed-node-runtime', oldValueJsonText: '"v22.23.1"', newValueJsonText: '"v26.8.2"' });
  });

  it('changes a value on top of the 68-row version that v1 refuses, and the delta shows only that change', async () => {
    const f = await fixture();
    expect(() => composePreviewSnapshot({ sourceRows: f.source as any, baseRows: f.v9 as any, baseRegisterVersion: '9', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v9 as any) })).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
    const before = structuredClone(f.v9);
    const plan = compose(f.source, f.v9);
    expect(plan.rows).toHaveLength(68);
    expect(plan.addedKeys).toEqual([]);
    expect(plan.changedKeys).toEqual(['composerContractHash']);
    expect(plan.delta).toEqual([{
      rowKey: 'composerContractHash', change: 'changed', reason: 'reviewed-current-source-facet',
      oldValueJsonText: '"d96e7cc959e51339eef149991c58aafd5605542b3bf13b70a9cd722f67e0c866"', newValueJsonText: f.source.find(row => row.rowKey === 'composerContractHash')!.valueJsonText,
      oldSourceRef: f.v9.find(row => row.rowKey === 'composerContractHash')!.sourceRef, newSourceRef: f.source.find(row => row.rowKey === 'composerContractHash')!.sourceRef,
      oldValueSha256: sha('"d96e7cc959e51339eef149991c58aafd5605542b3bf13b70a9cd722f67e0c866"'), newValueSha256: sha(f.source.find(row => row.rowKey === 'composerContractHash')!.valueJsonText),
      oldSourceRefSha256: sha(f.v9.find(row => row.rowKey === 'composerContractHash')!.sourceRef), newSourceRefSha256: sha(f.source.find(row => row.rowKey === 'composerContractHash')!.sourceRef)
    }]);
    expect(plan.deltaSha256).toBe(sha(JSON.stringify(plan.delta)));
    expect(plan.deltaSha256).toBe(previewDeltaSha256V2(plan.delta));
    expect(plan.baseRegisterVersion).toBe('9');
    // Every other row, the base-owned ones included, is the base row byte for byte.
    for (const row of plan.rows) if (row.rowKey !== 'composerContractHash') expect(row).toEqual(f.v9.find(base => base.rowKey === row.rowKey));
    expect(f.v9).toEqual(before);
  });

  it('adds a key the current version lacks (how outboundMailPolicy will arrive) while changing another value', async () => {
    const f = await fixture();
    const base = f.v9.filter(row => row.rowKey !== 'taxAuthorities');
    const plan = compose(f.source, base);
    expect(plan.rows).toHaveLength(68);
    expect(plan.addedKeys).toEqual(['taxAuthorities']);
    expect(plan.changedKeys).toEqual(['composerContractHash']);
    expect(plan.rows.find(row => row.rowKey === 'taxAuthorities')).toEqual(f.source.find(row => row.rowKey === 'taxAuthorities'));
  });

  it('an unchanged source on its own result has an empty delta and the same snapshot', async () => {
    const f = await fixture();
    const first = compose(f.source, f.v9);
    const again = compose(f.source, [...first.rows] as Row[], '10');
    expect(again.delta).toEqual([]);
    expect(again.snapshotSha256).toBe(first.snapshotSha256);
  });

  const patchValue = (rows: Row[], key: string, edit: (value: any) => void) => rows.map(row => {
    if (row.rowKey !== key) return row;
    const value = JSON.parse(row.valueJsonText); edit(value); return { ...row, valueJsonText: canonical(value) };
  });
  it.each([
    ['a base row the source no longer builds (silent drop)', (f: any) => ({ base: [...f.v9, { rowKey: 'retiredRow', valueJsonText: 'false', sourceRef: 'fixture' }] }), 'base-row-dropped'],
    ['a base lacking a base-owned policy', (f: any) => ({ base: f.v9.filter((row: Row) => row.rowKey !== 'staffAccessPolicy') }), 'base-owned-row-missing'],
    ['a source carrying a base-owned policy', (f: any) => ({ source: [...f.source, owned()[0]] }), 'base-owned-row-in-source'],
    ['a source key outside the reviewed list', (f: any) => ({ source: [...f.source, { rowKey: 'outboundMailPolicy', valueJsonText: '{}', sourceRef: 'fixture' }] }), 'source-key-list'],
    ['a source missing a reviewed key', (f: any) => ({ source: f.source.filter((row: Row) => row.rowKey !== 'countryPolicy') }), 'source-key-list'],
    ['a support row in the source', (f: any) => ({ source: [...f.source, { rowKey: 'supportActivation', valueJsonText: '{}', sourceRef: 'fixture' }] }), 'support-or-scorecard-row'],
    ['a scorecard row in the base', (f: any) => ({ base: [...f.v9, { rowKey: 'modelScorecard', valueJsonText: '{}', sourceRef: 'fixture' }] }), 'support-or-scorecard-row'],
    ['a scorecard row in the source', (f: any) => ({ source: [...f.source, { rowKey: 'modelScorecard', valueJsonText: '{}', sourceRef: 'fixture' }] }), 'support-or-scorecard-row']
  ])('refuses %s, by its own rule', async (_name, change, rule) => {
    const f = await fixture();
    const { source = f.source, base = f.v9 } = change(f) as { source?: Row[]; base?: Row[] };
    expect(() => compose(source, base)).toThrow(`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`);
  });
  it.each([
    ['a duplicate source row', (f: any) => ({ source: [...f.source, f.source[0]] })],
    ['billing switched on in the base', (f: any) => ({ base: patchValue(f.v9, 'billingPolicy', v => { v.enabled = true; }) })],
    ['billing switched on in the source', (f: any) => ({ source: patchValue(f.source, 'billingPolicy', v => { v.enabled = true; }) })],
    ['a credential in the source provider set', (f: any) => ({ source: patchValue(f.source, 'configuredProviderSet', v => { v.providers[0].authorization = 'secret'; }) })],
    ['another provider ref in the base', (f: any) => ({ base: patchValue(f.v9, 'configuredProviderSet', v => { v.providers[0].providerRef = 'unexpected'; }) })]
  ])('refuses %s', async (_name, change) => {
    const f = await fixture();
    const { source = f.source, base = f.v9 } = change(f) as { source?: Row[]; base?: Row[] };
    expect(() => compose(source, base)).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
  it('refuses an invalid base staff policy (the policy parser\'s own refusal)', async () => {
    const f = await fixture();
    expect(() => compose(f.source, f.v9)).not.toThrow();
    expect(() => compose(f.source, patchValue(f.v9, 'staffAccessPolicy', v => { v.unexpected = true; }))).toThrow();
  });
  it('refuses a base whose snapshot hash is not the one selected', async () => {
    const f = await fixture();
    expect(() => composePreviewSnapshotV2({ sourceRows: f.source as any, baseRows: f.v9 as any, baseRegisterVersion: '9', baseSnapshotSha256: '0'.repeat(64) })).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
});

/** A pool that answers only the currency query and records every statement. */
function fakePool(above: { register_version: string; publication_id: string | null }[]) {
  const statements: string[] = [];
  return { statements, pool: { async query(sql: string) { statements.push(sql); if (/register_version>\$1/.test(sql)) return { rows: above }; throw new Error('unexpected statement'); } } as any };
}
const id = '11111111-1111-4111-8111-111111111111';
describe('publish kit v2: the base must be the current version', () => {
  it('accepts nothing above the base, or only this publication\'s own replay', async () => {
    await expect(assertBaseIsCurrent(fakePool([]).pool, '9', id)).resolves.toBeUndefined();
    await expect(assertBaseIsCurrent(fakePool([{ register_version: '10', publication_id: id }]).pool, '9', id)).resolves.toBeUndefined();
  });
  it.each([
    ['a newer version by another publication', [{ register_version: '10', publication_id: '22222222-2222-4222-8222-222222222222' }]],
    ['a newer historical version', [{ register_version: '10', publication_id: null }]],
    ['two newer versions', [{ register_version: '10', publication_id: id }, { register_version: '11', publication_id: id }]]
  ])('refuses %s', async (_name, above) => {
    await expect(assertBaseIsCurrent(fakePool(above).pool, '9', id)).rejects.toThrow(BASE_NOT_CURRENT);
  });
  it('the native operator prints the stale-base refusal in words, and checks currency before planning', async () => {
    const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
    expect(operator.BASE_NOT_CURRENT_LINE).toBe(BASE_NOT_CURRENT);
    expect(operator.operatorRefusalLine(new PreviewRegisterBaseNotCurrentError())).toBe(`${BASE_NOT_CURRENT}\n`);
    expect(operator.operatorRefusalLine(new TypeError(BASE_NOT_CURRENT))).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
    const text = readFileSync(resolve('deploy/preview-auth-dev/v1/native-operator.mjs'), 'utf8');
    const check = text.indexOf("if(plan.operation==='plan'||plan.operation==='publish')await publisher.assertBaseIsCurrent(pool,base.registerVersion,plan.publicationId);");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(text.indexOf("if(plan.operation==='plan'||plan.operation==='apply-and-plan')return metadata;"));
  });
  it('publish refuses a stale base and a mismatching approval before any publication statement', async () => {
    const f = await fixture();
    const snapshot = compose(f.source, f.v9);
    const approval = { baseRegisterVersion: snapshot.baseRegisterVersion, baseSnapshotSha256: snapshot.baseSnapshotSha256, snapshotSha256: snapshot.snapshotSha256, deltaSha256: snapshot.deltaSha256 };
    const stale = fakePool([{ register_version: '10', publication_id: '22222222-2222-4222-8222-222222222222' }]);
    await expect(publishPreviewRegisterV2(stale.pool, { publicationId: id, sourceRef: 'fixture', snapshot, approval })).rejects.toThrow(BASE_NOT_CURRENT);
    expect(stale.statements).toHaveLength(1);
    for (const key of ['baseRegisterVersion', 'baseSnapshotSha256', 'snapshotSha256', 'deltaSha256'] as const) {
      const current = fakePool([]);
      await expect(publishPreviewRegisterV2(current.pool, { publicationId: id, sourceRef: 'fixture', snapshot, approval: { ...approval, [key]: key === 'baseRegisterVersion' ? '8' : '0'.repeat(64) } })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
      expect(current.statements.some(sql => /publish_register_version/.test(sql))).toBe(false);
    }
    const v1Snapshot = composePreviewSnapshot({ sourceRows: f.source as any, baseRows: f.v8 as any, baseRegisterVersion: '8', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v8 as any) });
    await expect(publishPreviewRegisterV2(fakePool([]).pool, { publicationId: id, sourceRef: 'fixture', snapshot: v1Snapshot as any, approval })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
});
