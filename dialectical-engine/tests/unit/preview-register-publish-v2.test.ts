import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBootstrapRegister, canonicalRegisterJson, parseCanonicalRegisterJson, computeRegisterSnapshotSha256 } from '@debateai/register';
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { buildPreviewSourceRows, composePreviewSnapshot } from '../../deploy/preview-auth-dev/v1/publish-register.js';
import {
  buildPreviewSourceRowsV2, composePreviewSnapshotV2, assertBaseIsCurrent, publishPreviewRegisterV2, previewDeltaSha256V2, previewCheckerRoleRef,
  PREVIEW_SOURCE_ROW_KEYS_V2, PREVIEW_BASE_OWNED_KEYS, BASE_NOT_CURRENT, PreviewRegisterBaseNotCurrentError,
  PREVIEW_SYNTHESIZER_ROLE_REF, PREVIEW_EVALUATOR_ROLE_REF, PREVIEW_DEEPSEEK_CHECKER_ROLE_REF
} from '../../deploy/preview-auth-dev/v1/publish-register-v2.js';

type Row = { rowKey: string; valueJsonText: string; sourceRef: string };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const runtime = { nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0', sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), operatorSha256: 'c'.repeat(64), observedAt: '2026-10-10T12:00:00.000Z' };
const V1_ADDITIONS = ['consumerRecoveryPolicy', 'publicationCheckPolicy', 'taxAuthorities'];
const canonical = (value: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value))) as string;
const owned = () => [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey, 'en'));

/**
 * Multi-model (2026-10-10): by default the only rows the reviewed DeepInfra rows change against the sealed
 * two-GLM shape are the provider set (five refs, four makers; Qwen joined 2026-10-10) and the family map that follows it. The
 * writer stays fixture-a and the checker fixture-b (both GLM), as in the sealed version, so the version
 * can be published while the gate has only GLM switched on.
 */
const MULTI_MODEL_KEYS = ['configuredProviderSet', 'providerFamilyMap'];
/** With the explicit DeepSeek checker choice, the checker and the story checker that follows it move too. */
const DEEPSEEK_CHECKER_KEYS = ['configuredProviderSet', 'evaluatorRoleRef', 'providerFamilyMap', 'storyCheckerRoleRef'];
const DEEPSEEK = { checker: 'deepseek', deepseekEnabledOnGate: true } as const;
const REVIEWED_PROVIDER_SET = { kind: 'CONFIGURED_PROVIDER_SET', requiredDistinctMakers: 1, providers: [
  { providerRef: 'preview:fixture-a', adapterKind: 'openai-compatible-http', maker: 'Z.AI' },
  { providerRef: 'preview:fixture-b', adapterKind: 'openai-compatible-http', maker: 'Z.AI' },
  { providerRef: 'preview:deepseek-v4-1-flash', adapterKind: 'openai-compatible-http', maker: 'DeepSeek' },
  { providerRef: 'preview:mimo-v2-6-pro', adapterKind: 'openai-compatible-http', maker: 'Xiaomi' },
  { providerRef: 'preview:qwen-3-8-flash', adapterKind: 'openai-compatible-http', maker: 'Alibaba' }
] };

/** The two real preview shapes (both two-GLM, built by v1): the 65-row base v1 was written for (live v8) and the 68-row result (live v9). */
async function fixture() {
  const bootstrap = await loadBootstrapRegister();
  const source: Row[] = [...await buildPreviewSourceRowsV2(bootstrap, runtime)] as Row[];
  const v1Source: Row[] = [...await buildPreviewSourceRows(bootstrap, runtime)] as Row[];
  const v8 = sorted([...v1Source.filter(row => !V1_ADDITIONS.includes(row.rowKey)).map(row => row.rowKey === 'nodeRuntimeVersion' ? { ...row, valueJsonText: '"v22.23.1"', sourceRef: 'historical node measurement' } : row), ...owned()]);
  // v9-like: what v1 published on top of v8, with the answer-writer fingerprint still at its v1 value.
  const v9 = sorted([...v1Source.map(row => row.rowKey === 'composerContractHash' ? { ...row, valueJsonText: canonical('d96e7cc959e51339eef149991c58aafd5605542b3bf13b70a9cd722f67e0c866') } : row), ...owned()]);
  return { source, v1Source, v8, v9 };
}
const compose = (source: Row[], base: Row[], version = '9') => composePreviewSnapshotV2({ sourceRows: source as any, baseRows: base as any, baseRegisterVersion: version, baseSnapshotSha256: computeRegisterSnapshotSha256(base as any) });

describe('publish kit v2: source closure', () => {
  it('builds exactly the reviewed key list: v1\'s rows except the two multi-model rows', async () => {
    const bootstrap = await loadBootstrapRegister();
    const rows = await buildPreviewSourceRowsV2(bootstrap, runtime);
    expect(rows.map(row => row.rowKey).sort()).toEqual([...PREVIEW_SOURCE_ROW_KEYS_V2].sort());
    expect(rows).toHaveLength(66);
    const v1 = await buildPreviewSourceRows(bootstrap, runtime);
    const differing = rows.filter(row => JSON.stringify(row) !== JSON.stringify(v1.find(old => old.rowKey === row.rowKey))).map(row => row.rowKey);
    expect(differing).toEqual(MULTI_MODEL_KEYS);
    const value = (key: string) => JSON.parse(rows.find(row => row.rowKey === key)!.valueJsonText);
    expect(value('configuredProviderSet')).toEqual(REVIEWED_PROVIDER_SET);
    expect(value('synthesizerRoleRef').providerRef).toBe('preview:fixture-a');
    expect(value('storytellerRoleRef').providerRef).toBe('preview:fixture-a');
    expect(value('evaluatorRoleRef').providerRef).toBe('preview:fixture-b');
    expect(value('storyCheckerRoleRef').providerRef).toBe('preview:fixture-b');
    expect([PREVIEW_SYNTHESIZER_ROLE_REF, PREVIEW_EVALUATOR_ROLE_REF, PREVIEW_DEEPSEEK_CHECKER_ROLE_REF]).toEqual(['preview:fixture-a', 'preview:fixture-b', 'preview:deepseek-v4-1-flash']);
    expect(value('providerFamilyMap').families).toEqual([
      { familyRef: 'Z.AI', providerRefs: ['preview:fixture-a', 'preview:fixture-b'] },
      { familyRef: 'DeepSeek', providerRefs: ['preview:deepseek-v4-1-flash'] },
      { familyRef: 'Xiaomi', providerRefs: ['preview:mimo-v2-6-pro'] },
      { familyRef: 'Alibaba', providerRefs: ['preview:qwen-3-8-flash'] }
    ]);
    for (const key of PREVIEW_BASE_OWNED_KEYS) expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(key);
  });
  it('keeps v1\'s runtime gate', async () => {
    await expect(buildPreviewSourceRowsV2(await loadBootstrapRegister(), { ...runtime, nodeVersion: 'v22.23.1' })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
});

describe('publish kit v2: composing from the current version', () => {
  it('from the 65-row base it produces v1\'s snapshot except the two multi-model rows, reporting the three keys as added', async () => {
    const f = await fixture();
    const v1 = composePreviewSnapshot({ sourceRows: f.v1Source as any, baseRows: f.v8 as any, baseRegisterVersion: '8', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v8 as any) });
    const v2 = compose(f.source, f.v8, '8');
    expect(v2.rows.map(row => row.rowKey)).toEqual(v1.rows.map(row => row.rowKey));
    for (const row of v2.rows) if (!MULTI_MODEL_KEYS.includes(row.rowKey)) expect(row).toEqual(v1.rows.find(old => old.rowKey === row.rowKey));
    expect(v2.addedKeys).toEqual(V1_ADDITIONS);
    expect(v2.changedKeys).toEqual(['configuredProviderSet', 'nodeRuntimeVersion', 'providerFamilyMap']);
    for (const key of V1_ADDITIONS) {
      const entry = v2.delta.find(row => row.rowKey === key)!;
      expect(entry).toMatchObject({ change: 'added', reason: 'added-source-key', oldValueJsonText: null, oldSourceRef: null, oldValueSha256: null, oldSourceRefSha256: null });
      expect(entry.newValueJsonText).toBe(f.source.find(row => row.rowKey === key)!.valueJsonText);
      expect(entry.newValueSha256).toBe(sha(entry.newValueJsonText));
    }
    expect(v2.delta.find(row => row.rowKey === 'nodeRuntimeVersion')).toMatchObject({ change: 'changed', reason: 'observed-node-runtime', oldValueJsonText: '"v22.23.1"', newValueJsonText: '"v26.8.2"' });
  });

  it('changes a value on top of the 68-row two-GLM version that v1 refuses, and the delta shows only that change plus the two multi-model rows (the role rows stay unchanged)', async () => {
    const f = await fixture();
    expect(() => composePreviewSnapshot({ sourceRows: f.v1Source as any, baseRows: f.v9 as any, baseRegisterVersion: '9', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v9 as any) })).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
    const before = structuredClone(f.v9);
    const plan = compose(f.source, f.v9);
    expect(plan.rows).toHaveLength(68);
    expect(plan.addedKeys).toEqual([]);
    expect(plan.changedKeys).toEqual(['composerContractHash', ...MULTI_MODEL_KEYS]);
    expect(JSON.parse(plan.delta.find(row => row.rowKey === 'configuredProviderSet')!.newValueJsonText).providers.map((p: any) => p.providerRef))
      .toEqual(['preview:fixture-a', 'preview:fixture-b', 'preview:deepseek-v4-1-flash', 'preview:mimo-v2-6-pro', 'preview:qwen-3-8-flash']);
    expect(JSON.parse(plan.delta.find(row => row.rowKey === 'configuredProviderSet')!.oldValueJsonText!).providers.map((p: any) => p.providerRef))
      .toEqual(['preview:fixture-a', 'preview:fixture-b']);
    for (const key of MULTI_MODEL_KEYS) {
      const entry = plan.delta.find(row => row.rowKey === key)!;
      expect(entry).toMatchObject({ change: 'changed', reason: 'reviewed-current-source-facet',
        oldValueJsonText: f.v9.find(row => row.rowKey === key)!.valueJsonText, newValueJsonText: f.source.find(row => row.rowKey === key)!.valueJsonText });
    }
    expect(plan.delta.filter(row => row.rowKey === 'composerContractHash')).toEqual([{
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
    for (const row of plan.rows) if (row.rowKey !== 'composerContractHash' && !MULTI_MODEL_KEYS.includes(row.rowKey)) expect(row).toEqual(f.v9.find(base => base.rowKey === row.rowKey));
    for (const key of ['synthesizerRoleRef', 'evaluatorRoleRef', 'storytellerRoleRef', 'storyCheckerRoleRef']) expect(plan.delta.map(entry => entry.rowKey)).not.toContain(key);
    expect(f.v9).toEqual(before);
  });

  it('adds a key the current version lacks (how outboundMailPolicy will arrive) while changing another value', async () => {
    const f = await fixture();
    const base = f.v9.filter(row => row.rowKey !== 'taxAuthorities');
    const plan = compose(f.source, base);
    expect(plan.rows).toHaveLength(68);
    expect(plan.addedKeys).toEqual(['taxAuthorities']);
    expect(plan.changedKeys).toEqual(['composerContractHash', ...MULTI_MODEL_KEYS]);
    expect(plan.rows.find(row => row.rowKey === 'taxAuthorities')).toEqual(f.source.find(row => row.rowKey === 'taxAuthorities'));
  });

  it('the base may also be a version this kit published (the reviewed five-ref set)', async () => {
    const f = await fixture();
    const first = compose(f.source, f.v9);
    expect(JSON.parse(first.rows.find(row => row.rowKey === 'configuredProviderSet')!.valueJsonText)).toEqual(REVIEWED_PROVIDER_SET);
    expect(() => compose(f.source, [...first.rows] as Row[], '10')).not.toThrow();
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
    ['another provider ref in the base', (f: any) => ({ base: patchValue(f.v9, 'configuredProviderSet', v => { v.providers[0].providerRef = 'unexpected'; }) })],
    ['a base with the reviewed refs reordered', (f: any) => ({ base: patchValue(f.v9, 'configuredProviderSet', v => { v.providers = [...REVIEWED_PROVIDER_SET.providers].reverse(); }) })],
    ['a source with a wrong maker for a reviewed ref', (f: any) => ({ source: patchValue(f.source, 'configuredProviderSet', v => { v.providers[2].maker = 'Z.AI'; }) })],
    ['a source missing a reviewed ref', (f: any) => ({ source: patchValue(f.source, 'configuredProviderSet', v => { v.providers.pop(); }) })],
    ['a source with an unreviewed ref', (f: any) => ({ source: patchValue(f.source, 'configuredProviderSet', v => { v.providers[3].providerRef = 'preview:other'; }) })],
    ['a source with Qwen under another maker', (f: any) => ({ source: patchValue(f.source, 'configuredProviderSet', v => { v.providers[4].maker = 'Qwen'; }) })],
    ['a base with the reviewed set before Qwen (never published)', (f: any) => ({ base: patchValue(f.v9, 'configuredProviderSet', v => { v.providers = REVIEWED_PROVIDER_SET.providers.slice(0, 4); }) })],
    ['a source requiring two makers', (f: any) => ({ source: patchValue(f.source, 'configuredProviderSet', v => { v.requiredDistinctMakers = 2; }) })]
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

describe('publish kit v2: the checker choice (GLM by default, DeepSeek only on the operator\'s word)', () => {
  const build = async (choice?: unknown) => [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, choice as any)] as Row[];
  const ref = (rows: Row[], key: string) => JSON.parse(rows.find(row => row.rowKey === key)!.valueJsonText).providerRef;

  it('an explicit {checker:\'glm\'} is the default, byte for byte', async () => {
    expect(await build({ checker: 'glm' })).toEqual(await build());
    expect(previewCheckerRoleRef()).toBe(PREVIEW_EVALUATOR_ROLE_REF);
  });

  it('with checker deepseek and the acknowledgement, the delta against the sealed two-GLM v9 also moves the checker and the story checker', async () => {
    const f = await fixture();
    const source = await build(DEEPSEEK);
    const differing = source.filter(row => JSON.stringify(row) !== JSON.stringify(f.v1Source.find(old => old.rowKey === row.rowKey))).map(row => row.rowKey);
    expect(differing).toEqual(DEEPSEEK_CHECKER_KEYS);
    expect(ref(source, 'evaluatorRoleRef')).toBe('preview:deepseek-v4-1-flash');
    expect(ref(source, 'storyCheckerRoleRef')).toBe('preview:deepseek-v4-1-flash');
    expect(ref(source, 'synthesizerRoleRef')).toBe('preview:fixture-a');
    expect(ref(source, 'storytellerRoleRef')).toBe('preview:fixture-a');
    const plan = compose(source, f.v9);
    expect(plan.changedKeys).toEqual(['composerContractHash', ...DEEPSEEK_CHECKER_KEYS]);
    expect(plan.addedKeys).toEqual([]);
    expect(JSON.parse(plan.delta.find(entry => entry.rowKey === 'evaluatorRoleRef')!.oldValueJsonText!).providerRef).toBe('preview:fixture-b');
    expect(JSON.parse(plan.delta.find(entry => entry.rowKey === 'evaluatorRoleRef')!.newValueJsonText).providerRef).toBe('preview:deepseek-v4-1-flash');
  });

  it('switching on in two versions: the default five-ref version first, then the DeepSeek checker (only the two role rows), and back', async () => {
    const f = await fixture();
    const first = compose(f.source, f.v9);
    const second = compose(await build(DEEPSEEK), [...first.rows] as Row[], '10');
    expect(second.changedKeys).toEqual(['evaluatorRoleRef', 'storyCheckerRoleRef']);
    const back = compose(f.source, [...second.rows] as Row[], '11');
    expect(back.changedKeys).toEqual(['evaluatorRoleRef', 'storyCheckerRoleRef']);
    expect(back.snapshotSha256).toBe(first.snapshotSha256);
  });

  it.each([
    ['deepseek without the acknowledgement', { checker: 'deepseek' }, 'checker-deepseek-not-enabled-on-gate'],
    ['deepseek with the acknowledgement false', { checker: 'deepseek', deepseekEnabledOnGate: false }, 'checker-deepseek-not-enabled-on-gate'],
    ['deepseek with the acknowledgement as text', { checker: 'deepseek', deepseekEnabledOnGate: 'true' }, 'checker-deepseek-not-enabled-on-gate'],
    ['an unknown checker', { checker: 'mimo' }, 'checker-choice'],
    ['Qwen as checker (the default stays GLM)', { checker: 'qwen' }, 'checker-choice'],
    ['an unknown checker with the acknowledgement', { checker: 'mimo', deepseekEnabledOnGate: true }, 'checker-choice'],
    ['glm with a stray acknowledgement', { checker: 'glm', deepseekEnabledOnGate: true }, 'checker-choice'],
    ['deepseek with an extra field', { ...DEEPSEEK, maker: 'DeepSeek' }, 'checker-choice'],
    ['a bare string', 'deepseek', 'checker-choice'],
    ['null', null, 'checker-choice'],
    ['an array', [DEEPSEEK], 'checker-choice']
  ])('refuses %s, by its own rule, before building any row', async (_name, choice, rule) => {
    await expect(build(choice)).rejects.toThrow(`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`);
    expect(() => previewCheckerRoleRef(choice)).toThrow(`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`);
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
    const v1Snapshot = composePreviewSnapshot({ sourceRows: f.v1Source as any, baseRows: f.v8 as any, baseRegisterVersion: '8', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v8 as any) });
    await expect(publishPreviewRegisterV2(fakePool([]).pool, { publicationId: id, sourceRef: 'fixture', snapshot: v1Snapshot as any, approval })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
});
