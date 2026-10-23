import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBootstrapRegister, canonicalRegisterJson, parseCanonicalRegisterJson, computeRegisterSnapshotSha256, CALL_CONCURRENCY_POLICY_ROW_KEY, DEBATE_SHAPE_POLICY_ROW_KEY, debateShapePolicyStartValues, QUESTION_LANGUAGE_POLICY_ROW_KEY, questionLanguagePolicyStartValues, LENGTH_GUIDANCE_POLICY_ROW_KEY, lengthGuidancePolicyRow, lengthGuidancePolicyStartValues, ENGINE_CONTRACT_HASH_ROW_KEY, ENGINE_VERSION_POLICY_ROW_KEY, engineVersionPolicyStartValues, PREVIEW_LINE_UP_POLICY_ROW_KEY, previewLineUpPolicyFromValue, previewLineUpPolicyRow } from '@debateai/register';
import { engineContractHash } from '../../apps/runner/src/engine-contracts.js';
import { printLineUp } from '../../tools/preview-practice/check-thinking-levels.js';
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { buildPreviewSourceRows, composePreviewSnapshot } from '../../deploy/preview-auth-dev/v1/publish-register.js';
import {
  buildPreviewSourceRowsV2, composePreviewSnapshotV2, assertBaseIsCurrent, publishPreviewRegisterV2, previewDeltaSha256V2, previewCheckerRoleRef,
  PREVIEW_SOURCE_ROW_KEYS_V2, PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2, PREVIEW_BASE_OWNED_KEYS, BASE_NOT_CURRENT, PreviewRegisterBaseNotCurrentError,
  PREVIEW_SYNTHESIZER_ROLE_REF, PREVIEW_EVALUATOR_ROLE_REF, PREVIEW_DEEPSEEK_CHECKER_ROLE_REF, assertPreviewEngineBootRows
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
/** Role rotation (spec 2026-10-11): the row the v2 source adds on top of every base that predates it (the live v8 and v9 both lack it). */
const ROTATION_KEY = 'answerRoleRotationPolicy';
const PROVIDER_SET_ROW = 'configuredProviderSet';
/** With the explicit DeepSeek checker choice, the checker and the story checker that follows it move too. */
const DEEPSEEK_CHECKER_KEYS = ['configuredProviderSet', 'evaluatorRoleRef', 'providerFamilyMap', 'storyCheckerRoleRef'];
const DEEPSEEK = { checker: 'deepseek', deepseekEnabledOnGate: true } as const;
const REVIEWED_PROVIDER_SET = { kind: 'CONFIGURED_PROVIDER_SET', requiredDistinctMakers: 1, providers: [
  { providerRef: 'preview:fixture-a', adapterKind: 'openai-compatible-http', maker: 'Z.AI' },
  { providerRef: 'preview:fixture-b', adapterKind: 'openai-compatible-http', maker: 'Z.AI' },
  { providerRef: 'preview:deepseek-v4-1-flash', adapterKind: 'openai-compatible-http', maker: 'DeepSeek' },
  { providerRef: 'preview:mimo-v2-6-pro', adapterKind: 'openai-compatible-http', maker: 'Xiaomi' },
  { providerRef: 'preview:qwen-3-8-flash', adapterKind: 'openai-compatible-http', maker: 'Alibaba' },
  // PR B: Anthropic's reviewed ref, on the native Anthropic Messages adapter.
  { providerRef: 'preview:claude-haiku-5-5', adapterKind: 'anthropic-messages-http', maker: 'Anthropic' }
] };
/** The set A's kit published before PR B (DeepInfra's five refs): still a lawful base. */
const DEEPINFRA_PROVIDER_SET = { ...REVIEWED_PROVIDER_SET, providers: REVIEWED_PROVIDER_SET.providers.slice(0, 5) };

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
    expect(rows).toHaveLength(69);
    const v1 = await buildPreviewSourceRows(bootstrap, runtime);
    const differing = rows.filter(row => JSON.stringify(row) !== JSON.stringify(v1.find(old => old.rowKey === row.rowKey))).map(row => row.rowKey);
    expect([...differing].sort()).toEqual([...MULTI_MODEL_KEYS, 'answerRoleRotationPolicy', 'engineContractHash', 'mapContractHash'].sort());
    const value = (key: string) => JSON.parse(rows.find(row => row.rowKey === key)!.valueJsonText);
    expect(value('answerRoleRotationPolicy')).toEqual({ kind: 'ANSWER_ROLE_ROTATION_POLICY', enabled: true, rule: 'LEAST_SHARE_SEEDED_TIE_V1' });
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
      { familyRef: 'Alibaba', providerRefs: ['preview:qwen-3-8-flash'] },
      { familyRef: 'Anthropic', providerRefs: ['preview:claude-haiku-5-5'] }
    ]);
    for (const key of PREVIEW_BASE_OWNED_KEYS) expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(key);
  });
  it('keeps v1\'s runtime gate', async () => {
    await expect(buildPreviewSourceRowsV2(await loadBootstrapRegister(), { ...runtime, nodeVersion: 'v22.23.1' })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
});

describe('publish kit v2: composing from the current version', () => {
  it('from the 65-row base it produces v1\'s snapshot except the two multi-model rows and the role rotation row, reporting the three keys and the rotation row as added', async () => {
    const f = await fixture();
    const v1 = composePreviewSnapshot({ sourceRows: f.v1Source as any, baseRows: f.v8 as any, baseRegisterVersion: '8', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v8 as any) });
    const v2 = compose(f.source, f.v8, '8');
    expect(v2.rows.map(row => row.rowKey)).toEqual([...v1.rows.map(row => row.rowKey), ROTATION_KEY, 'engineContractHash', 'mapContractHash'].sort((a, b) => a.localeCompare(b, 'en')));
    for (const row of v2.rows) if (!MULTI_MODEL_KEYS.includes(row.rowKey) && row.rowKey !== ROTATION_KEY && row.rowKey !== 'mapContractHash' && row.rowKey !== 'engineContractHash') expect(row).toEqual(v1.rows.find(old => old.rowKey === row.rowKey));
    expect(v2.addedKeys).toEqual([ROTATION_KEY, 'consumerRecoveryPolicy', 'engineContractHash', 'mapContractHash', 'publicationCheckPolicy', 'taxAuthorities']);
    expect(v2.changedKeys).toEqual(['configuredProviderSet', 'nodeRuntimeVersion', 'providerFamilyMap']);
    for (const key of V1_ADDITIONS) {
      const entry = v2.delta.find(row => row.rowKey === key)!;
      expect(entry).toMatchObject({ change: 'added', reason: 'added-source-key', oldValueJsonText: null, oldSourceRef: null, oldValueSha256: null, oldSourceRefSha256: null });
      expect(entry.newValueJsonText).toBe(f.source.find(row => row.rowKey === key)!.valueJsonText);
      expect(entry.newValueSha256).toBe(sha(entry.newValueJsonText));
    }
    expect(v2.delta.find(row => row.rowKey === 'nodeRuntimeVersion')).toMatchObject({ change: 'changed', reason: 'observed-node-runtime', oldValueJsonText: '"v22.23.1"', newValueJsonText: '"v26.8.2"' });
  });

  it('changes a value on top of the 68-row two-GLM version that v1 refuses, and the delta shows only that change, the two multi-model rows and the added role rotation row (the role rows stay unchanged)', async () => {
    const f = await fixture();
    expect(() => composePreviewSnapshot({ sourceRows: f.v1Source as any, baseRows: f.v9 as any, baseRegisterVersion: '9', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v9 as any) })).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
    const before = structuredClone(f.v9);
    const plan = compose(f.source, f.v9);
    expect(plan.rows).toHaveLength(71);
    expect(plan.addedKeys).toEqual([ROTATION_KEY, 'engineContractHash', 'mapContractHash']);
    expect(plan.rows.find(row => row.rowKey === ROTATION_KEY)).toEqual(f.source.find(row => row.rowKey === ROTATION_KEY));
    expect(plan.changedKeys).toEqual(['composerContractHash', ...MULTI_MODEL_KEYS]);
    const providerSet = plan.delta.find(row => row.rowKey === PROVIDER_SET_ROW)!;
    const refsOf = (text: string) => JSON.parse(text).providers.map((p: any) => p.providerRef);
    expect(refsOf(providerSet.newValueJsonText))
      .toEqual(['preview:fixture-a', 'preview:fixture-b', 'preview:deepseek-v4-1-flash', 'preview:mimo-v2-6-pro', 'preview:qwen-3-8-flash', 'preview:claude-haiku-5-5']);
    expect(refsOf(providerSet.oldValueJsonText!)).toEqual(['preview:fixture-a', 'preview:fixture-b']);
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
    for (const row of plan.rows) if (row.rowKey !== 'composerContractHash' && row.rowKey !== ROTATION_KEY && row.rowKey !== 'mapContractHash' && row.rowKey !== 'engineContractHash' && !MULTI_MODEL_KEYS.includes(row.rowKey)) expect(row).toEqual(f.v9.find(base => base.rowKey === row.rowKey));
    for (const key of ['synthesizerRoleRef', 'evaluatorRoleRef', 'storytellerRoleRef', 'storyCheckerRoleRef']) expect(plan.delta.map(entry => entry.rowKey)).not.toContain(key);
    expect(f.v9).toEqual(before);
  });

  it('adds a key the current version lacks (how outboundMailPolicy will arrive) while changing another value', async () => {
    const f = await fixture();
    const base = f.v9.filter(row => row.rowKey !== 'taxAuthorities');
    const plan = compose(f.source, base);
    expect(plan.rows).toHaveLength(71);
    expect(plan.addedKeys).toEqual([ROTATION_KEY, 'engineContractHash', 'mapContractHash', 'taxAuthorities']);
    expect(plan.changedKeys).toEqual(['composerContractHash', ...MULTI_MODEL_KEYS]);
    expect(plan.rows.find(row => row.rowKey === 'taxAuthorities')).toEqual(f.source.find(row => row.rowKey === 'taxAuthorities'));
  });

  it('the base may also be a version this kit published (the reviewed five-ref set)', async () => {
    const f = await fixture();
    const first = compose(f.source, f.v9);
    expect(JSON.parse(first.rows.find(row => row.rowKey === 'configuredProviderSet')!.valueJsonText)).toEqual(REVIEWED_PROVIDER_SET);
    expect(() => compose(f.source, [...first.rows] as Row[], '10')).not.toThrow();
    // PR B: a version published with DeepInfra's four refs only (before the Anthropic row) is a lawful base too.
    const deepinfraOnly = patchValue([...first.rows] as Row[], 'configuredProviderSet', (v: any) => { v.providers = DEEPINFRA_PROVIDER_SET.providers.map(p => ({ ...p })); });
    expect(() => compose(f.source, deepinfraOnly, '10')).not.toThrow();
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
    expect([...differing].sort()).toEqual([...DEEPSEEK_CHECKER_KEYS, ROTATION_KEY, 'engineContractHash', 'mapContractHash'].sort());
    expect(ref(source, 'evaluatorRoleRef')).toBe('preview:deepseek-v4-1-flash');
    expect(ref(source, 'storyCheckerRoleRef')).toBe('preview:deepseek-v4-1-flash');
    expect(ref(source, 'synthesizerRoleRef')).toBe('preview:fixture-a');
    expect(ref(source, 'storytellerRoleRef')).toBe('preview:fixture-a');
    const plan = compose(source, f.v9);
    expect(plan.changedKeys).toEqual(['composerContractHash', ...DEEPSEEK_CHECKER_KEYS]);
    expect(plan.addedKeys).toEqual([ROTATION_KEY, 'engineContractHash', 'mapContractHash']);
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

describe('publish kit v2: the role rotation switch (on by default; off is a republish, not a code change)', () => {
  const build = async (roleRotation?: unknown, checker?: unknown) => [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, checker as any, roleRotation as any)] as Row[];
  const rotation = (rows: Row[]) => JSON.parse(rows.find(row => row.rowKey === ROTATION_KEY)!.valueJsonText);

  it('an explicit \'on\' is the default, byte for byte, and the row is enabled', async () => {
    expect(await build('on')).toEqual(await build());
    expect(rotation(await build('on'))).toEqual({ kind: 'ANSWER_ROLE_ROTATION_POLICY', enabled: true, rule: 'LEAST_SHARE_SEEDED_TIE_V1' });
  });

  it('\'off\' keeps the row present (same reviewed key list) and changes only its enabled flag', async () => {
    const on = await build('on'), off = await build('off');
    expect(off.map(row => row.rowKey)).toEqual(on.map(row => row.rowKey));
    expect(rotation(off)).toEqual({ kind: 'ANSWER_ROLE_ROTATION_POLICY', enabled: false, rule: 'LEAST_SHARE_SEEDED_TIE_V1' });
    const differing = off.filter((row, index) => JSON.stringify(row) !== JSON.stringify(on[index])).map(row => row.rowKey);
    expect(differing).toEqual([ROTATION_KEY]);
  });

  it('switching off is one changed row on top of the published on-version, and switching back restores its snapshot', async () => {
    const f = await fixture();
    const first = compose(f.source, f.v9);
    const off = compose(await build('off'), [...first.rows] as Row[], '10');
    expect(off.changedKeys).toEqual([ROTATION_KEY]);
    expect(off.addedKeys).toEqual([]);
    expect(JSON.parse(off.delta.find(entry => entry.rowKey === ROTATION_KEY)!.oldValueJsonText!).enabled).toBe(true);
    expect(JSON.parse(off.delta.find(entry => entry.rowKey === ROTATION_KEY)!.newValueJsonText).enabled).toBe(false);
    const back = compose(await build('on'), [...off.rows] as Row[], '11');
    expect(back.changedKeys).toEqual([ROTATION_KEY]);
    expect(back.snapshotSha256).toBe(first.snapshotSha256);
  });

  it('combines with the DeepSeek checker choice: off moves only the rotation row', async () => {
    const off = await build('off', DEEPSEEK), on = await build('on', DEEPSEEK);
    expect(off.filter((row, index) => JSON.stringify(row) !== JSON.stringify(on[index])).map(row => row.rowKey)).toEqual([ROTATION_KEY]);
  });

  it.each([
    ['upper case', 'OFF'], ['a boolean false', false], ['a boolean true', true], ['null', null], ['another word', 'disabled'], ['an object', { roleRotation: 'off' }]
  ])('refuses %s, by its own rule, before building any row', async (_name, choice) => {
    await expect(build(choice)).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED: role-rotation-choice');
  });
});

describe('publish kit v2: the optional callConcurrencyPolicy row (absent by default)', () => {
  const policy = { perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } };
  const build = async (callConcurrency?: unknown) => [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, callConcurrency as any)] as Row[];

  it('adds exactly one row when supplied and nothing by default; the reviewed key list is unchanged', async () => {
    const absent = await build(), given = await build(policy);
    expect(absent.map(row => row.rowKey)).not.toContain(CALL_CONCURRENCY_POLICY_ROW_KEY);
    expect(await build(null)).toEqual(absent);
    expect(PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2).toEqual([CALL_CONCURRENCY_POLICY_ROW_KEY, DEBATE_SHAPE_POLICY_ROW_KEY, QUESTION_LANGUAGE_POLICY_ROW_KEY, LENGTH_GUIDANCE_POLICY_ROW_KEY, ENGINE_VERSION_POLICY_ROW_KEY, PREVIEW_LINE_UP_POLICY_ROW_KEY]);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(CALL_CONCURRENCY_POLICY_ROW_KEY);
    expect(given.filter(row => row.rowKey !== CALL_CONCURRENCY_POLICY_ROW_KEY)).toEqual(absent);
    expect(JSON.parse(given.find(row => row.rowKey === CALL_CONCURRENCY_POLICY_ROW_KEY)!.valueJsonText)).toEqual({ kind: 'CALL_CONCURRENCY_POLICY', ...policy });
  });

  it('refuses a policy the register parser refuses, before building any row', async () => {
    await expect(build({ ...policy, perDebate: 65 })).rejects.toThrow('CALL_CONCURRENCY_POLICY_INVALID');
    await expect(build({ ...policy, perModelPerRunner: { deepinfra: 150 } })).rejects.toThrow('CALL_CONCURRENCY_POLICY_INVALID');
  });

  it('composes with or without the row: a base without it and a plan without it give no row, as before', async () => {
    const f = await fixture();
    const given = compose(await build(policy), f.v9);
    expect(given.addedKeys).toEqual([ROTATION_KEY, CALL_CONCURRENCY_POLICY_ROW_KEY, 'engineContractHash', 'mapContractHash'].sort((a, b) => a.localeCompare(b, 'en')));
    const absent = compose(f.source, f.v9);
    expect(absent.rows.map(row => row.rowKey)).not.toContain(CALL_CONCURRENCY_POLICY_ROW_KEY);
    expect(absent.delta.map(entry => entry.rowKey)).not.toContain(CALL_CONCURRENCY_POLICY_ROW_KEY);
  });

  it('R19: a plan without a value keeps the base version\'s row unchanged (no delta entry, never base-row-dropped)', async () => {
    const f = await fixture();
    const published = compose(await build(policy), f.v9);
    const base = [...published.rows] as Row[];
    const sealed = base.find(row => row.rowKey === CALL_CONCURRENCY_POLICY_ROW_KEY)!;
    const kept = compose(f.source, base, '10');
    // The very base row, value and source reference byte for byte.
    expect(kept.rows.find(row => row.rowKey === CALL_CONCURRENCY_POLICY_ROW_KEY)).toEqual(sealed);
    expect(kept.delta.map(entry => entry.rowKey)).not.toContain(CALL_CONCURRENCY_POLICY_ROW_KEY);
    // Nothing else changed either: the source on its own result is an empty delta and the same snapshot.
    expect(kept.delta).toEqual([]);
    expect(kept.snapshotSha256).toBe(published.snapshotSha256);
    // A base row that does not parse is refused, never carried.
    const broken = base.map(row => row.rowKey === CALL_CONCURRENCY_POLICY_ROW_KEY ? { ...row, valueJsonText: canonical({ ...JSON.parse(row.valueJsonText), perDebate: 65 }) } : row);
    expect(() => compose(f.source, broken, '10')).toThrow('CALL_CONCURRENCY_POLICY_INVALID');
  });

  it('R19: a plan with a new value replaces the base version\'s row (changed in the delta); the off switch is a value', async () => {
    const f = await fixture();
    const base = [...compose(await build(policy), f.v9).rows] as Row[];
    const off = { perDebate: 1, perModelPerDebate: 1, perModelPerRunner: { default: 1000 } };
    const next = compose(await build(off), base, '10');
    expect(next.changedKeys).toEqual([CALL_CONCURRENCY_POLICY_ROW_KEY]);
    const entry = next.delta.find(row => row.rowKey === CALL_CONCURRENCY_POLICY_ROW_KEY)!;
    expect(JSON.parse(entry.oldValueJsonText!)).toEqual({ kind: 'CALL_CONCURRENCY_POLICY', ...policy });
    expect(JSON.parse(entry.newValueJsonText)).toEqual({ kind: 'CALL_CONCURRENCY_POLICY', ...off });
    // The same value again is no change at all.
    expect(compose(await build(policy), base, '10').delta).toEqual([]);
  });

  it('the native operator hands the plan\'s policy to the builder as its fifth and sixth arguments, so the row is in the reviewed delta', async () => {
    const text = readFileSync(resolve('deploy/preview-auth-dev/v1/native-operator.mjs'), 'utf8');
    const calls = text.split('publisher.buildPreviewSourceRowsV2(');
    expect(calls).toHaveLength(2); // the operator's one builder call
    expect(calls[1]).toMatch(/^await register\.loadBootstrapRegister\(\),\{[^}]*\},plan\.checkerChoice,plan\.roleRotation,plan\.callConcurrency\?\?null,plan\.debateShape\?\?null,plan\.questionLanguage\?\?null,plan\.lengthGuidance\?\?null,null,plan\.lineUp\?\?null,plan\.answerSeats\?\?null\);/);
    // What it hands over is the plan's value exactly as the plan check accepted it.
    const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
    const plan = operator.validateNativePlan({ schema: 'preview-auth-dev-native-plan-v1', operation: 'plan', sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-api',
      sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifest: {}, operatorManifestSha256: 'c'.repeat(64), selectedBaseRegisterVersion: '9', selectedBaseSnapshotSha256: 'd'.repeat(64),
      publicationId: id, approval: null, callConcurrency: JSON.parse(JSON.stringify(policy)) });
    const f = await fixture();
    const snapshot = compose(await build(plan.callConcurrency ?? null), f.v9);
    const entry = snapshot.delta.find((row: any) => row.rowKey === CALL_CONCURRENCY_POLICY_ROW_KEY) as any;
    expect(entry.change).toBe('added');
    expect(JSON.parse(entry.newValueJsonText)).toEqual({ kind: 'CALL_CONCURRENCY_POLICY', ...policy });
    // A plan without the key hands null: the source, and so the delta, is today's.
    expect(compose(await build(null), f.v9).deltaSha256).toBe(compose(f.source, f.v9).deltaSha256);
  });
});

describe('publish kit v2: the optional debateShapePolicy row (absent by default, spec 2026-10-12 §3.1)', () => {
  const policy = debateShapePolicyStartValues();
  const build = async (debateShape?: unknown) =>
    [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, null, debateShape as any)] as Row[];

  it('adds exactly one row when supplied and nothing by default; it is optional, never in the reviewed closure', async () => {
    const absent = await build(), given = await build(policy);
    expect(absent.map(row => row.rowKey)).not.toContain(DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(await build(null)).toEqual(absent);
    expect(PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2).toEqual([CALL_CONCURRENCY_POLICY_ROW_KEY, DEBATE_SHAPE_POLICY_ROW_KEY, QUESTION_LANGUAGE_POLICY_ROW_KEY, LENGTH_GUIDANCE_POLICY_ROW_KEY, ENGINE_VERSION_POLICY_ROW_KEY, PREVIEW_LINE_UP_POLICY_ROW_KEY]);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(given.filter(row => row.rowKey !== DEBATE_SHAPE_POLICY_ROW_KEY)).toEqual(absent);
    expect(JSON.parse(given.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)!.valueJsonText)).toEqual(JSON.parse(JSON.stringify(policy)));
  });
  it('refuses a policy the register parser refuses, before building any row', async () => {
    const bad = JSON.parse(JSON.stringify(policy));
    bad.plans.free.mapAIs = 10;
    await expect(build(bad)).rejects.toThrow('DEBATE_SHAPE_POLICY_INVALID:plans.free.mapAIs');
  });
  it('R19: a plan without a value keeps the base version\'s row unchanged; a broken base row is refused, never carried', async () => {
    const f = await fixture();
    const published = compose(await build(policy), f.v9);
    expect(published.addedKeys).toEqual([ROTATION_KEY, DEBATE_SHAPE_POLICY_ROW_KEY, 'engineContractHash', 'mapContractHash'].sort((a, b) => a.localeCompare(b, 'en')));
    const base = [...published.rows] as Row[];
    const kept = compose(f.source, base, '10');
    expect(kept.rows.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)).toEqual(base.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY));
    expect(kept.delta).toEqual([]);
    const broken = base.map(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"DEBATE_SHAPE_POLICY"', '"X"') } : row);
    expect(() => compose(f.source, broken, '10')).toThrow('DEBATE_SHAPE_POLICY_INVALID:kind');
  });
  it('"off" publishes the start values disabled, as one changed row; a policy object switches it back on (P2b Task 6)', async () => {
    const off = await build('off');
    expect(JSON.parse(off.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)!.valueJsonText))
      .toEqual({ ...JSON.parse(JSON.stringify(policy)), enabled: false });
    const f = await fixture();
    const on = compose(await build(policy), f.v9);
    const switched = compose(off, [...on.rows] as Row[], '10');
    expect(switched.changedKeys).toEqual([DEBATE_SHAPE_POLICY_ROW_KEY]);
    expect(switched.addedKeys).toEqual([]);
    const back = compose(await build(policy), [...switched.rows] as Row[], '11');
    expect(back.changedKeys).toEqual([DEBATE_SHAPE_POLICY_ROW_KEY]);
    expect(back.snapshotSha256).toBe(on.snapshotSha256);
  });
  it('the native plan check takes the word off or a plain object, on plan and publish only; the parser refuses a bad policy when the rows are built', async () => {
    const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
    const value = JSON.parse(JSON.stringify(policy));
    expect(operator.validateDebateShapeChoice('off')).toBe('off');
    expect(operator.validateDebateShapeChoice(value)).toBe(value);
    for (const bad of ['on', 'OFF', null, [], 7, true]) expect(() => operator.validateDebateShapeChoice(bad)).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const plan = { schema: 'preview-auth-dev-native-plan-v1', operation: 'plan', sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-api',
      sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifest: {}, operatorManifestSha256: 'c'.repeat(64), selectedBaseRegisterVersion: '9',
      selectedBaseSnapshotSha256: 'd'.repeat(64), publicationId: id, approval: null };
    for (const operation of ['plan', 'publish']) for (const debateShape of ['off', value]) expect(operator.validateNativePlan({ ...plan, operation, debateShape })).toBeTruthy();
    for (const operation of ['verify', 'apply-and-plan']) expect(() => operator.validateNativePlan({ ...plan, operation, debateShape: 'off' })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const bad = JSON.parse(JSON.stringify(policy));
    bad.plans.free.mapAIs = 10;
    expect(operator.validateNativePlan({ ...plan, debateShape: bad })).toBeTruthy(); // shape only (pre-flight PF-B20)
    await expect(build(bad)).rejects.toThrow('DEBATE_SHAPE_POLICY_INVALID:plans.free.mapAIs');
  });
});

describe('publish kit v2: the optional questionLanguagePolicy row (absent by default, question-language spec 2026-10-13)', () => {
  const policy = questionLanguagePolicyStartValues();
  const build = async (questionLanguage?: unknown) =>
    [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, null, null, questionLanguage as any)] as Row[];

  it('adds exactly one row when supplied and nothing by default; it is optional, never in the reviewed closure', async () => {
    const absent = await build(), given = await build(policy);
    expect(absent.map(row => row.rowKey)).not.toContain(QUESTION_LANGUAGE_POLICY_ROW_KEY);
    expect(await build(null)).toEqual(absent);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(QUESTION_LANGUAGE_POLICY_ROW_KEY);
    expect(given.filter(row => row.rowKey !== QUESTION_LANGUAGE_POLICY_ROW_KEY)).toEqual(absent);
    expect(JSON.parse(given.find(row => row.rowKey === QUESTION_LANGUAGE_POLICY_ROW_KEY)!.valueJsonText)).toEqual(JSON.parse(JSON.stringify(policy)));
    // The fast check switched off is a policy value, not a word.
    const off = await build({ ...policy, fastCheck: null });
    expect(JSON.parse(off.find(row => row.rowKey === QUESTION_LANGUAGE_POLICY_ROW_KEY)!.valueJsonText).fastCheck).toBeNull();
  });
  it('refuses a policy the register parser refuses, before building any row', async () => {
    await expect(build({ ...policy, fastCheck: { ...policy.fastCheck!, provider: 'openai' } })).rejects.toThrow('QUESTION_LANGUAGE_POLICY_INVALID:$.fastCheck.provider');
    await expect(build({ ...policy, instruction: ' ' })).rejects.toThrow('QUESTION_LANGUAGE_POLICY_INVALID:$.instruction');
  });
  it('R19: a plan without a value keeps the base version\'s row unchanged; a broken base row is refused, never carried', async () => {
    const f = await fixture();
    const published = compose(await build(policy), f.v9);
    expect(published.addedKeys).toEqual([ROTATION_KEY, QUESTION_LANGUAGE_POLICY_ROW_KEY, 'engineContractHash', 'mapContractHash'].sort((a, b) => a.localeCompare(b, 'en')));
    const base = [...published.rows] as Row[];
    const kept = compose(f.source, base, '10');
    expect(kept.rows.find(row => row.rowKey === QUESTION_LANGUAGE_POLICY_ROW_KEY)).toEqual(base.find(row => row.rowKey === QUESTION_LANGUAGE_POLICY_ROW_KEY));
    expect(kept.delta).toEqual([]);
    const broken = base.map(row => row.rowKey === QUESTION_LANGUAGE_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"QUESTION_LANGUAGE_POLICY"', '"X"') } : row);
    expect(() => compose(f.source, broken, '10')).toThrow('QUESTION_LANGUAGE_POLICY_INVALID:$.kind');
  });
  it('a new value replaces the base version\'s row (changed in the delta); switching the fast check off is one changed row', async () => {
    const f = await fixture();
    const on = compose(await build(policy), f.v9);
    const switched = compose(await build({ ...policy, fastCheck: null }), [...on.rows] as Row[], '10');
    expect(switched.changedKeys).toEqual([QUESTION_LANGUAGE_POLICY_ROW_KEY]);
    expect(switched.addedKeys).toEqual([]);
  });
  it('I4: asks the API\'s question-language boot refusals before anything is sealed, only with the debate shape in force (as kit v3)', async () => {
    const f = await fixture();
    const shape = debateShapePolicyStartValues();
    const both = async (debateShape: unknown, language: unknown) =>
      [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, null, debateShape as any, language as any)] as Row[];
    const framed = { ...policy, instruction: 'Name it. --- SAFETY FRAME' };
    const fenced = { ...policy, instruction: 'Name it. #|DEBATEAI-FENCE-' };
    const unpriced = { ...policy, fastCheck: { ...policy.fastCheck!, model: 'claude-sonnet-5-5' } };
    // With the shape in force: the start values pass; a frame token or a model the preview's Anthropic gate does not
    // review (the price table does not list it either) refuses when composing, as the preview API would refuse to boot.
    const [good, withFrame, withFence, withUnpriced] = await Promise.all([policy, framed, fenced, unpriced].map(language => both(shape, language)));
    expect(() => compose(good!, f.v9)).not.toThrow();
    expect(() => compose(withFrame!, f.v9)).toThrow('QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN');
    expect(() => compose(withFence!, f.v9)).toThrow('QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN');
    expect(() => compose(withUnpriced!, f.v9)).toThrow('QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW');
    // Without the shape in force (no row, or the row disabled) the API never reads the row at boot: parsed only.
    const noShape = await both(null, framed), shapeOff = await both('off', unpriced), shapeOnly = await both(shape, null);
    expect(() => compose(noShape, f.v9)).not.toThrow();
    const disabled = compose(shapeOff, f.v9);
    // A row carried from the base is asked too, once a later source puts the shape in force.
    expect(() => compose(shapeOnly, [...disabled.rows] as Row[], '10')).toThrow('QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW');
  });
  it('the native plan check takes a plain object only, on plan and publish only; the parser refuses a bad policy when the rows are built', async () => {
    const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
    const value = JSON.parse(JSON.stringify(policy));
    expect(operator.validateQuestionLanguageChoice(value)).toBe(value);
    for (const bad of ['off', 'on', null, [], 7, true]) expect(() => operator.validateQuestionLanguageChoice(bad)).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const plan = { schema: 'preview-auth-dev-native-plan-v1', operation: 'plan', sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-api',
      sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifest: {}, operatorManifestSha256: 'c'.repeat(64), selectedBaseRegisterVersion: '9',
      selectedBaseSnapshotSha256: 'd'.repeat(64), publicationId: id, approval: null };
    for (const operation of ['plan', 'publish']) expect(operator.validateNativePlan({ ...plan, operation, questionLanguage: value })).toBeTruthy();
    for (const operation of ['verify', 'apply-and-plan']) expect(() => operator.validateNativePlan({ ...plan, operation, questionLanguage: value })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    expect(() => operator.validateNativePlan({ ...plan, questionLanguage: 'off' })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const bad = { ...value, version: 2 };
    expect(operator.validateNativePlan({ ...plan, questionLanguage: bad })).toBeTruthy(); // shape only
    await expect(build(bad)).rejects.toThrow('QUESTION_LANGUAGE_POLICY_INVALID:$.version');
  });
});

describe('publish kit v2: the optional lengthGuidancePolicy row (LG-C, spec 2026-10-15 §3.1)', () => {
  const policy = lengthGuidancePolicyStartValues();
  const build = async (lengthGuidance?: unknown) =>
    [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, null, null, null, lengthGuidance as any)] as Row[];

  it('adds exactly one row when supplied and nothing by default; optional, never in the reviewed closure', async () => {
    const absent = await build(), given = await build(policy);
    expect(absent.map(row => row.rowKey)).not.toContain(LENGTH_GUIDANCE_POLICY_ROW_KEY);
    expect(await build(null)).toEqual(absent);
    expect(PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2).toContain(LENGTH_GUIDANCE_POLICY_ROW_KEY);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(LENGTH_GUIDANCE_POLICY_ROW_KEY);
    expect(given.filter(row => row.rowKey !== LENGTH_GUIDANCE_POLICY_ROW_KEY)).toEqual(absent);
  });
  it('refuses a policy the register parser refuses, before building any row', async () => {
    const bad = JSON.parse(JSON.stringify(policy));
    bad.tokensPerWord = 9;
    await expect(build(bad)).rejects.toThrow('LENGTH_GUIDANCE_POLICY_INVALID:tokensPerWord');
  });
  // Task 8 review 3: the added row's own content, not only its key.
  it('the added row is the policy itself, in canonical JSON, with the owners\' source line, after every other row', async () => {
    const given = await build(policy);
    const row = given.find(entry => entry.rowKey === LENGTH_GUIDANCE_POLICY_ROW_KEY)!;
    expect(given.at(-1)).toBe(row);
    expect(JSON.parse(row.valueJsonText)).toEqual(JSON.parse(JSON.stringify(policy)));
    expect(row.valueJsonText).toBe(lengthGuidancePolicyRow(policy, row.sourceRef).valueJsonText);
    expect(row.sourceRef).toBe('length guidance spec 2026-10-15 (owner rulings L1-L36); owner 2026-10-15');
  });
  // Task 8 review 4: the operator's check of the plan's lengthGuidance choice.
  it('the native plan check takes a plain object only, on plan and publish only; the parser refuses a bad policy when the rows are built', async () => {
    const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
    const value = JSON.parse(JSON.stringify(policy));
    expect(operator.validateLengthGuidanceChoice(value)).toBe(value);
    for (const bad of ['off', 'on', null, [], [value], 7, true]) expect(() => operator.validateLengthGuidanceChoice(bad)).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const plan = { schema: 'preview-auth-dev-native-plan-v1', operation: 'plan', sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-api',
      sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifest: {}, operatorManifestSha256: 'c'.repeat(64), selectedBaseRegisterVersion: '9',
      selectedBaseSnapshotSha256: 'd'.repeat(64), publicationId: id, approval: null };
    for (const operation of ['plan', 'publish']) expect(operator.validateNativePlan({ ...plan, operation, lengthGuidance: value })).toBeTruthy();
    for (const operation of ['verify', 'apply-and-plan']) expect(() => operator.validateNativePlan({ ...plan, operation, lengthGuidance: value })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    expect(() => operator.validateNativePlan({ ...plan, lengthGuidance: 'off' })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    expect(() => operator.validateNativePlan({ ...plan, lengthGuidance: [value] })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const bad = { ...value, runawayMultiplier: 1 };
    expect(operator.validateNativePlan({ ...plan, lengthGuidance: bad })).toBeTruthy(); // shape only
    await expect(build(bad)).rejects.toThrow('LENGTH_GUIDANCE_POLICY_INVALID:runawayMultiplier');
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

describe('publish kit v2: the optional engineVersionPolicy row (engine redesign R1d, INTERFACE §1.6)', () => {
  const engine = engineVersionPolicyStartValues();
  const length = lengthGuidancePolicyStartValues();
  /** v2's eighth argument is LG-C's length guidance and its ninth the engine row; no ninth = its default. */
  const build = async (lengthGuidance: unknown, ...engineVersion: [] | [unknown]) =>
    [...await (buildPreviewSourceRowsV2 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), runtime,
      undefined, undefined, null, null, null, lengthGuidance, ...engineVersion)] as Row[];
  const engineRow = (rows: readonly Row[]) => rows.find(row => row.rowKey === ENGINE_VERSION_POLICY_ROW_KEY);
  const sealed = (rows: readonly Row[], hex: string) => rows.map(row => row.rowKey === ENGINE_CONTRACT_HASH_ROW_KEY ? { ...row, valueJsonText: canonical(hex) } : row);

  it('adds exactly one row when supplied and nothing by default; optional, never in the closure; the seal is a required key', async () => {
    const absent = await build(length), given = await build(length, engine);
    expect(engineRow(absent)).toBeUndefined();
    expect(await build(length, null)).toEqual(absent);
    expect(PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2).toContain(ENGINE_VERSION_POLICY_ROW_KEY);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(ENGINE_VERSION_POLICY_ROW_KEY);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).toContain(ENGINE_CONTRACT_HASH_ROW_KEY);
    expect(given.filter(row => row.rowKey !== ENGINE_VERSION_POLICY_ROW_KEY)).toEqual(absent);
    expect(JSON.parse(engineRow(given)!.valueJsonText)).toEqual(JSON.parse(JSON.stringify(engine)));
    expect(JSON.parse(given.find(row => row.rowKey === ENGINE_CONTRACT_HASH_ROW_KEY)!.valueJsonText)).toBe(engineContractHash());
  });
  it('"off" builds the start values disabled', async () => {
    expect(JSON.parse(engineRow(await build(length, 'off'))!.valueJsonText)).toEqual({ ...JSON.parse(JSON.stringify(engine)), enabled: false });
  });
  it('refuses a policy the register parser refuses, before building any row', async () => {
    const bad = JSON.parse(JSON.stringify(engine));
    bad.judges.count = 6;
    await expect(build(length, bad)).rejects.toThrow('ENGINE_VERSION_POLICY_INVALID:judges.count');
  });
  it('composing asks the runner\'s engine boot: the row needs the length row and the code\'s seal, enabled or not', async () => {
    const f = await fixture();
    const published = compose(await build(length, engine), f.v9);
    expect(published.addedKeys).toEqual([ROTATION_KEY, 'engineContractHash', ENGINE_VERSION_POLICY_ROW_KEY, LENGTH_GUIDANCE_POLICY_ROW_KEY, 'mapContractHash']
      .sort((a, b) => a.localeCompare(b, 'en')));
    for (const choice of [engine, 'off'] as const) {
      const noLength = await build(null, choice);
      expect(() => compose(noLength, f.v9)).toThrowError(expect.objectContaining({ code: 'ENGINE_REQUIRES_LENGTH_POLICY' }));
    }
    const foreign = sealed(await build(length, engine), 'e'.repeat(64));
    expect(() => compose(foreign, f.v9)).toThrowError(expect.objectContaining({ code: 'ENGINE_CONTRACT_HASH_MISMATCH' }));
    // No engine row = engine 1: the seal is never asked, even a foreign one.
    const engineOneForeign = sealed(await build(length), 'e'.repeat(64));
    expect(() => compose(engineOneForeign, f.v9)).not.toThrow();
    expect(() => assertPreviewEngineBootRows([...published.rows].filter(row => row.rowKey !== ENGINE_CONTRACT_HASH_ROW_KEY)))
      .toThrowError(expect.objectContaining({ code: 'ENGINE_CONTRACT_HASH_UNSEALED' }));
  });
  it('reads the seal only beside the length row, so its refusal is the runner\'s boot\'s (Task 8 review 1, final wave A5)', async () => {
    const f = await fixture();
    const published = compose(await build(length, engine), f.v9).rows;
    const brokenSeal = (rows: typeof published) => rows.map(row => row.rowKey === ENGINE_CONTRACT_HASH_ROW_KEY
      ? { ...row, valueJsonText: '"not a seal"' as typeof row.valueJsonText } : row);
    // No length row: the runner's boot never reads the seal (readEngineRunnerSettings), so neither does the kit.
    const noLength = brokenSeal(published.filter(row => row.rowKey !== LENGTH_GUIDANCE_POLICY_ROW_KEY));
    expect(() => assertPreviewEngineBootRows(noLength)).toThrowError(expect.objectContaining({ code: 'ENGINE_REQUIRES_LENGTH_POLICY' }));
    // Beside the length row the same broken seal is refused by its own parser.
    expect(() => assertPreviewEngineBootRows(brokenSeal(published))).toThrow('ENGINE_CONTRACT_HASH_INVALID');
  });
  it('R19: a plan without a value keeps the base version\'s row unchanged; a broken base row is refused, never carried', async () => {
    const f = await fixture();
    const base = [...compose(await build(length, engine), f.v9).rows] as Row[];
    const lengthOnly = await build(length);
    const kept = compose(lengthOnly, base, '10');
    expect(engineRow([...kept.rows] as Row[])).toEqual(engineRow(base));
    expect(kept.delta.map(entry => entry.rowKey)).not.toContain(ENGINE_VERSION_POLICY_ROW_KEY);
    const broken = base.map(row => row.rowKey === ENGINE_VERSION_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"ENGINE_VERSION_POLICY"', '"X"') } : row);
    expect(() => compose(lengthOnly, broken, '10')).toThrow('ENGINE_VERSION_POLICY_INVALID:kind');
    // A carried engine row with no length row anywhere is refused like a built one.
    const lonely = base.filter(row => row.rowKey !== LENGTH_GUIDANCE_POLICY_ROW_KEY);
    const noRows = await build(null);
    expect(() => compose(noRows, lonely, '10')).toThrowError(expect.objectContaining({ code: 'ENGINE_REQUIRES_LENGTH_POLICY' }));
  });
});

/**
 * Side-by-side spec §13, addition D23 (owner 2026-10-22): the operator's plan may name the preview's line-up (`lineUp`, the
 * optional previewLineUpPolicy row, D12) and the four answer seats (`answerSeats`). Kit v2's tenth and eleventh builder
 * arguments. A plan without either builds exactly what it built before (R19 carries a base line-up row unchanged).
 */
describe('publish kit v2: the optional previewLineUpPolicy row and the answer seats (side-by-side §13 addition D23)', () => {
  const GLM = 'zai-org/GLM-5.3-Flash', DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash', MIMO = 'XiaomiMiMo/MiMo-V2.6-Pro', QWEN = 'Qwen/Qwen3.8-Flash', HAIKU = 'claude-haiku-5-5';
  /** The owner's live table (final, 2026-10-13), pasted verbatim as SA1's and SA2's tests carry it. */
  const OWNER_LIVE_TABLE = JSON.parse(`{"zai-org/GLM-5.3-Flash":{"level":"high"},"deepseek-ai/DeepSeek-V4.1-Flash":{"level":"none"},"Qwen/Qwen3.8-Flash":{"level":"medium"},"XiaomiMiMo/MiMo-V2.6-Pro":{"level":"default","steps":{"pros_cons":"none","cross_exchange":"none"}},"claude-haiku-5-5":{"level":"medium","steps":{"judge_panel":"high","reviewer":"high","answer_checker":"high","story_checker":"high","answer_writer":"high","story_writer":"high","slip_fix":"medium"}}}`) as Record<string, unknown>;
  const LIVE = { free_model_ids: [GLM, DEEPSEEK_MODEL], premium_model_ids: [GLM, DEEPSEEK_MODEL, MIMO, QWEN, HAIKU], thinking_levels: OWNER_LIVE_TABLE };
  const HAIKU_REF = 'preview:claude-haiku-5-5';
  /** v2's tenth argument is the line-up and its eleventh the answer seats; the checker choice is the third. */
  const build = async (lineUp?: unknown, answerSeats?: unknown, checker?: unknown, at = runtime) =>
    [...await (buildPreviewSourceRowsV2 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), at,
      checker, undefined, null, null, null, null, null, lineUp, answerSeats)] as Row[];
  const lineUpRow = (rows: readonly Row[]) => rows.find(row => row.rowKey === PREVIEW_LINE_UP_POLICY_ROW_KEY);
  const ref = (rows: readonly Row[], key: string) => JSON.parse(rows.find(row => row.rowKey === key)!.valueJsonText).providerRef;
  const seats = (rows: readonly Row[]) => ['synthesizerRoleRef', 'evaluatorRoleRef', 'storytellerRoleRef', 'storyCheckerRoleRef'].map(key => ref(rows, key));
  const plan = { schema: 'preview-auth-dev-native-plan-v1', operation: 'plan', sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-api',
    sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifest: {}, operatorManifestSha256: 'c'.repeat(64), selectedBaseRegisterVersion: '9',
    selectedBaseSnapshotSha256: 'd'.repeat(64), publicationId: '11111111-1111-4111-8111-111111111111', approval: null };
  const operator = () => import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');

  it('(1) a plan without lineUp builds no row, byte for byte today\'s source; the key is optional, never in the closure', async () => {
    const f = await fixture();
    expect(lineUpRow(await build())).toBeUndefined();
    expect(await build()).toEqual(f.source);
    expect(await build(null, null)).toEqual(f.source);
    expect(PREVIEW_OPTIONAL_SOURCE_ROW_KEYS_V2).toContain(PREVIEW_LINE_UP_POLICY_ROW_KEY);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).not.toContain(PREVIEW_LINE_UP_POLICY_ROW_KEY);
  });

  it('(1) R19: a plan without lineUp carries the base version\'s row unchanged (no delta entry); a broken base row is refused, never carried', async () => {
    const f = await fixture();
    const published = compose(await build(LIVE), f.v9);
    const base = [...published.rows] as Row[];
    const kept = compose(f.source, base, '10');
    expect(lineUpRow([...kept.rows] as Row[])).toEqual(lineUpRow(base));
    expect(kept.delta).toEqual([]);
    expect(kept.snapshotSha256).toBe(published.snapshotSha256);
    const offMenu = base.map(row => row.rowKey === PREVIEW_LINE_UP_POLICY_ROW_KEY
      ? { ...row, valueJsonText: canonical({ ...JSON.parse(row.valueJsonText), thinking_levels: { [QWEN]: { level: 'high' } } }) } : row);
    expect(() => compose(f.source, offMenu, '10')).toThrow(`PREVIEW_THINKING_LEVELS_INVALID:level:${QWEN}`);
    const wrongKind = base.map(row => row.rowKey === PREVIEW_LINE_UP_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"PREVIEW_LINE_UP_POLICY"', '"X"') } : row);
    expect(() => compose(f.source, wrongKind, '10')).toThrow('PREVIEW_LINE_UP_POLICY_INVALID:kind');
  });

  it('(2) the owner\'s live table builds one row equal to previewLineUpPolicyRow\'s; the delta lists it added, then changed with old and new values', async () => {
    const f = await fixture();
    const given = await build(LIVE);
    const row = lineUpRow(given)!;
    expect(given.filter(entry => entry.rowKey !== PREVIEW_LINE_UP_POLICY_ROW_KEY)).toEqual(f.source);
    const expected = previewLineUpPolicyRow(previewLineUpPolicyFromValue({ kind: 'PREVIEW_LINE_UP_POLICY', ...LIVE }), row.sourceRef);
    expect(row.valueJsonText).toBe(expected.valueJsonText);
    expect(row.sourceRef).toBe('side-by-side spec §13 addition D12, D23 (the operator\'s plan lineUp); owner 2026-10-22');
    expect(JSON.parse(row.valueJsonText)).toEqual({ kind: 'PREVIEW_LINE_UP_POLICY', ...LIVE });
    const added = compose(given, f.v9);
    const entry = added.delta.find(item => item.rowKey === PREVIEW_LINE_UP_POLICY_ROW_KEY)!;
    expect(entry).toMatchObject({ change: 'added', reason: 'added-source-key', oldValueJsonText: null, newValueJsonText: row.valueJsonText, newValueSha256: sha(row.valueJsonText) });
    expect(added.addedKeys).toContain(PREVIEW_LINE_UP_POLICY_ROW_KEY);
    // A new value on top: one changed row, old and new canonical values in the delta.
    const noTable = { ...LIVE, thinking_levels: null };
    const changed = compose(await build(noTable), [...added.rows] as Row[], '10');
    expect(changed.changedKeys).toEqual([PREVIEW_LINE_UP_POLICY_ROW_KEY]);
    const next = changed.delta.find(item => item.rowKey === PREVIEW_LINE_UP_POLICY_ROW_KEY)!;
    expect(JSON.parse(next.oldValueJsonText!)).toEqual({ kind: 'PREVIEW_LINE_UP_POLICY', ...LIVE });
    expect(JSON.parse(next.newValueJsonText)).toEqual({ kind: 'PREVIEW_LINE_UP_POLICY', ...noTable });
    // The same value again is no change at all; the key order of the plan value never changes the sealed bytes.
    const reordered = { thinking_levels: OWNER_LIVE_TABLE, premium_model_ids: LIVE.premium_model_ids, free_model_ids: LIVE.free_model_ids };
    expect(compose(await build(reordered), [...added.rows] as Row[], '10').delta).toEqual([]);
  });

  it('(3) an invalid lineUp (Qwen at high) is refused with the parser\'s message before any row is built', async () => {
    const qwenHigh = { ...LIVE, thinking_levels: { ...OWNER_LIVE_TABLE, [QWEN]: { level: 'high' } } };
    await expect(build(qwenHigh)).rejects.toThrow(`PREVIEW_THINKING_LEVELS_INVALID:level:${QWEN}`);
    // Checked before anything else: even a runtime the gate refuses never gets that far.
    await expect(build(qwenHigh, undefined, undefined, { ...runtime, nodeVersion: 'v22.23.1' })).rejects.toThrow(`PREVIEW_THINKING_LEVELS_INVALID:level:${QWEN}`);
    await expect(build({ ...LIVE, free_model_ids: [GLM] })).rejects.toThrow('PREVIEW_LINE_UP_POLICY_INVALID:maker_rule');
    await expect(build({ ...LIVE, extra: true })).rejects.toThrow('PREVIEW_LINE_UP_POLICY_INVALID:members');
    await expect(build({ free_model_ids: LIVE.free_model_ids, premium_model_ids: LIVE.premium_model_ids })).rejects.toThrow('PREVIEW_LINE_UP_POLICY_INVALID:members');
    await expect(build('off')).rejects.toThrow('PREVIEW_LINE_UP_POLICY_INVALID:value');
  });

  it('(3) the native plan check takes a well-shaped lineUp on plan and publish only; the parser refuses its values when the rows are built', async () => {
    const op = await operator();
    const value = JSON.parse(JSON.stringify(LIVE));
    expect(op.validateLineUpChoice(value)).toBe(value);
    expect(op.validateLineUpChoice({ ...value, thinking_levels: null })).toBeTruthy();
    for (const bad of ['off', null, [], 7, true, { ...value, extra: 1 }, { free_model_ids: value.free_model_ids, premium_model_ids: value.premium_model_ids },
      { ...value, free_model_ids: 'GLM' }, { ...value, premium_model_ids: [7] }, { ...value, thinking_levels: [] }, { ...value, thinking_levels: 'high' }])
      expect(() => op.validateLineUpChoice(bad)).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    for (const operation of ['plan', 'publish']) expect(op.validateNativePlan({ ...plan, operation, lineUp: value })).toBeTruthy();
    for (const operation of ['verify', 'apply-and-plan']) expect(() => op.validateNativePlan({ ...plan, operation, lineUp: value })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    expect(() => op.validateNativePlan({ ...plan, lineUp: 'off' })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const qwenHigh = { ...value, thinking_levels: { ...value.thinking_levels, [QWEN]: { level: 'high' } } };
    expect(op.validateNativePlan({ ...plan, lineUp: qwenHigh })).toBeTruthy(); // shape only: the parser runs where the rows are built
    await expect(build(op.validateNativePlan({ ...plan, lineUp: qwenHigh }).lineUp)).rejects.toThrow(`PREVIEW_THINKING_LEVELS_INVALID:level:${QWEN}`);
  });

  it('(3) Ruling R72: the native operator prints a line-up or seat refusal\'s code (the owner learns why the plan stopped); anything else stays opaque', async () => {
    const op = await operator();
    const thrown = async (run: () => Promise<unknown>) => { try { await run(); } catch (error) { return error; } throw new Error('expected a refusal'); };
    // The real refusals the builder throws, printed as they are.
    for (const [lineUp, seatsChoice, line] of [
      [{ ...LIVE, thinking_levels: { ...OWNER_LIVE_TABLE, [QWEN]: { level: 'high' } } }, undefined, `PREVIEW_THINKING_LEVELS_INVALID:level:${QWEN}`],
      [{ ...LIVE, thinking_levels: { [GLM]: { steps: { cross_exchange: 'low', no_such_step: 'low' } } } }, undefined, `PREVIEW_THINKING_LEVELS_INVALID:step:${GLM}:no_such_step`],
      [{ ...LIVE, free_model_ids: [GLM] }, undefined, 'PREVIEW_LINE_UP_POLICY_INVALID:maker_rule'],
      [{ ...LIVE, premium_model_ids: [GLM, 'not/a-reviewed-model'] }, undefined, 'PREVIEW_LINE_UP_POLICY_INVALID:premium_model_ids:unreviewed'],
      [undefined, { writer: HAIKU_REF, checker: HAIKU_REF }, 'PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seats-writer-is-checker'],
      [undefined, { writer: 'preview:not-reviewed', checker: HAIKU_REF }, 'PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seat-unreviewed']
    ] as const) expect(op.operatorRefusalLine(await thrown(() => build(lineUp, seatsChoice)))).toBe(`${line}\n`);
    // An unrelated failure, a code with a free-text tail, a key-shaped or overlong detail, or a non-error: opaque, as before.
    for (const other of [new TypeError('PREVIEW_REGISTER_SNAPSHOT_REFUSED: hosted-story-rows'), new TypeError('PREVIEW_LINE_UP_POLICY_INVALID:maker_rule and more'),
      new TypeError(`PREVIEW_THINKING_LEVELS_INVALID:model:${'k'.repeat(40)}`), new TypeError('PREVIEW_THINKING_LEVELS_INVALID:model:sk-ant-api03-x'),
      new TypeError(`PREVIEW_THINKING_LEVELS_INVALID:model:${'a/'.repeat(40)}`), new TypeError('PREVIEW_LINE_UP_POLICY_INVALID:x\nsecond line'),
      new TypeError('PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seat unreviewed'), new TypeError('database password=hunter2'), 'PREVIEW_LINE_UP_POLICY_INVALID:value', undefined])
      expect(op.operatorRefusalLine(other)).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
  });

  it('(5) the --print-line-up member, merged into a plan, passes the plan check and the builder seals exactly that row', async () => {
    const env = { deployment: 'v3-preview', requested_thinking_level: 'high', budget_socket: '/run/debateai-v3-preview/deepinfra-budget-v3.sock',
      anthropic_budget_socket: '/run/debateai-v3-preview/anthropic-budget-v1.sock', scope_id: 'preview-kit-unit', ...LIVE };
    const printed = printLineUp(`PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(env)}`);
    expect(printed.exitCode).toBe(0);
    const member = JSON.parse(printed.lines[0]!) as { lineUp: unknown };
    expect(Object.keys(member)).toEqual(['lineUp']);
    const checked = (await operator()).validateNativePlan({ ...plan, ...JSON.parse(JSON.stringify(member)) });
    const row = lineUpRow(await build(checked.lineUp))!;
    expect(row.valueJsonText).toBe(previewLineUpPolicyRow(previewLineUpPolicyFromValue({ kind: 'PREVIEW_LINE_UP_POLICY', ...LIVE }), row.sourceRef).valueJsonText);
  });

  it('(4) answerSeats with the Haiku writer seals the synthesizer and the storyteller to it; absent seats keep today\'s refs byte for byte', async () => {
    const f = await fixture();
    const haikuWriter = await build(null, { writer: HAIKU_REF, checker: PREVIEW_EVALUATOR_ROLE_REF });
    expect(seats(haikuWriter)).toEqual([HAIKU_REF, PREVIEW_EVALUATOR_ROLE_REF, HAIKU_REF, PREVIEW_EVALUATOR_ROLE_REF]);
    const differing = haikuWriter.filter(row => JSON.stringify(row) !== JSON.stringify(f.source.find(old => old.rowKey === row.rowKey))).map(row => row.rowKey).sort();
    expect(differing).toEqual(['storytellerRoleRef', 'synthesizerRoleRef']);
    // Absent seats: today's refs, byte for byte, for either checker choice; today's seats named explicitly change nothing.
    expect(seats(await build())).toEqual([PREVIEW_SYNTHESIZER_ROLE_REF, PREVIEW_EVALUATOR_ROLE_REF, PREVIEW_SYNTHESIZER_ROLE_REF, PREVIEW_EVALUATOR_ROLE_REF]);
    expect(await build(null, null, DEEPSEEK)).toEqual(await build(undefined, undefined, DEEPSEEK));
    expect(seats(await build(null, null, DEEPSEEK))).toEqual([PREVIEW_SYNTHESIZER_ROLE_REF, PREVIEW_DEEPSEEK_CHECKER_ROLE_REF, PREVIEW_SYNTHESIZER_ROLE_REF, PREVIEW_DEEPSEEK_CHECKER_ROLE_REF]);
    expect(await build(null, { writer: PREVIEW_SYNTHESIZER_ROLE_REF, checker: PREVIEW_EVALUATOR_ROLE_REF })).toEqual(f.source);
    expect(await build(null, { writer: PREVIEW_SYNTHESIZER_ROLE_REF, checker: PREVIEW_DEEPSEEK_CHECKER_ROLE_REF })).toEqual(await build(null, null, DEEPSEEK));
    // The two story seats may be chosen on their own; only their two rows move.
    const story = await build(null, { writer: PREVIEW_SYNTHESIZER_ROLE_REF, checker: PREVIEW_EVALUATOR_ROLE_REF, storyteller: HAIKU_REF, storyChecker: PREVIEW_DEEPSEEK_CHECKER_ROLE_REF });
    expect(seats(story)).toEqual([PREVIEW_SYNTHESIZER_ROLE_REF, PREVIEW_EVALUATOR_ROLE_REF, HAIKU_REF, PREVIEW_DEEPSEEK_CHECKER_ROLE_REF]);
    expect(story.filter(row => JSON.stringify(row) !== JSON.stringify(f.source.find(old => old.rowKey === row.rowKey))).map(row => row.rowKey).sort())
      .toEqual(['storyCheckerRoleRef', 'storytellerRoleRef']);
    const storyRow = story.find(row => row.rowKey === 'storytellerRoleRef')!;
    expect(storyRow.sourceRef).toBe(f.source.find(row => row.rowKey === 'storytellerRoleRef')!.sourceRef);
    expect(JSON.parse(storyRow.valueJsonText)).toEqual({ kind: 'STORYTELLER_ROLE_REF', providerRef: HAIKU_REF, provisional: true });
    expect(parseCanonicalRegisterJson(Buffer.from(storyRow.valueJsonText))).toBe(storyRow.valueJsonText);
    // The delta shows the moved seats with old and new values.
    const moved = compose(haikuWriter, [...compose(f.source, f.v9).rows] as Row[], '10');
    expect(moved.changedKeys).toEqual(['storytellerRoleRef', 'synthesizerRoleRef']);
  });

  it.each([
    ['an unreviewed ref', { writer: 'preview:other', checker: PREVIEW_EVALUATOR_ROLE_REF }, 'answer-seat-unreviewed'],
    ['a model id instead of a ref', { writer: HAIKU, checker: PREVIEW_EVALUATOR_ROLE_REF }, 'answer-seat-unreviewed'],
    ['an unreviewed story checker', { writer: HAIKU_REF, checker: PREVIEW_EVALUATOR_ROLE_REF, storyChecker: 'preview:other' }, 'answer-seat-unreviewed'],
    ['no checker', { writer: HAIKU_REF }, 'answer-seats-choice'],
    ['an extra seat', { writer: HAIKU_REF, checker: PREVIEW_EVALUATOR_ROLE_REF, judge: HAIKU_REF }, 'answer-seats-choice'],
    ['a seat that is not text', { writer: HAIKU_REF, checker: 7 }, 'answer-seats-choice'],
    ['a bare string', HAIKU_REF, 'answer-seats-choice'],
    ['an array', [HAIKU_REF], 'answer-seats-choice'],
    // Ruling R27b: one AI must not check its own answer.
    ['the writer as its own checker', { writer: HAIKU_REF, checker: HAIKU_REF }, 'answer-seats-writer-is-checker'],
    ['GLM\'s writer ref as its own checker, with story seats elsewhere', { writer: PREVIEW_SYNTHESIZER_ROLE_REF, checker: PREVIEW_SYNTHESIZER_ROLE_REF, storyteller: HAIKU_REF, storyChecker: PREVIEW_EVALUATOR_ROLE_REF }, 'answer-seats-writer-is-checker']
  ])('(4) refuses %s, by its own rule, before building any row', async (_name, choice, rule) => {
    await expect(build(null, choice)).rejects.toThrow(`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`);
    await expect(build(null, choice, undefined, { ...runtime, nodeVersion: 'v22.23.1' })).rejects.toThrow(`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`);
  });

  it('(4) answerSeats and a checker choice together are refused: one way to set the checker', async () => {
    const both = { writer: HAIKU_REF, checker: PREVIEW_EVALUATOR_ROLE_REF };
    for (const checker of [DEEPSEEK, { checker: 'glm' }])
      await expect(build(null, both, checker)).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seats-with-checker-choice');
    const op = await operator();
    expect(op.validateNativePlan({ ...plan, answerSeats: both })).toBeTruthy();
    expect(() => op.validateNativePlan({ ...plan, answerSeats: both, checkerChoice: { checker: 'deepseek', deepseekEnabledOnGate: true } })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
  });

  it('(4) the native plan check takes well-shaped answerSeats on plan and publish only; the kit checks the refs when the rows are built', async () => {
    const op = await operator();
    const value = { writer: HAIKU_REF, checker: PREVIEW_EVALUATOR_ROLE_REF, storyteller: HAIKU_REF, storyChecker: PREVIEW_EVALUATOR_ROLE_REF };
    expect(op.validateAnswerSeatsChoice(value)).toBe(value);
    expect(op.validateAnswerSeatsChoice({ writer: HAIKU_REF, checker: PREVIEW_EVALUATOR_ROLE_REF })).toBeTruthy();
    for (const bad of ['haiku', null, [], 7, { writer: HAIKU_REF }, { checker: HAIKU_REF }, { ...value, judge: HAIKU_REF }, { writer: HAIKU_REF, checker: '' }, { writer: HAIKU_REF, checker: 7 },
      { writer: HAIKU_REF, checker: HAIKU_REF }]) // Ruling R27b: the writer never checks its own answer
      expect(() => op.validateAnswerSeatsChoice(bad)).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    for (const operation of ['plan', 'publish']) expect(op.validateNativePlan({ ...plan, operation, answerSeats: value })).toBeTruthy();
    for (const operation of ['verify', 'apply-and-plan']) expect(() => op.validateNativePlan({ ...plan, operation, answerSeats: value })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    const unreviewed = { writer: 'preview:other', checker: PREVIEW_EVALUATOR_ROLE_REF };
    expect(op.validateNativePlan({ ...plan, answerSeats: unreviewed })).toBeTruthy(); // shape only
    await expect(build(null, unreviewed)).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seat-unreviewed');
  });
});
