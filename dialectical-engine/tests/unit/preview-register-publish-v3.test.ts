import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBootstrapRegister, canonicalRegisterJson, parseCanonicalRegisterJson, computeRegisterSnapshotSha256, BILLING_POLICY_DEPLOYMENT_REGISTER_ROW, DEBATE_SHAPE_POLICY_ROW_KEY, debateShapePolicyStartValues, QUESTION_LANGUAGE_POLICY_ROW_KEY, questionLanguagePolicyStartValues, LENGTH_GUIDANCE_POLICY_ROW_KEY, lengthGuidancePolicyStartValues, ENGINE_CONTRACT_HASH_ROW_KEY, ENGINE_VERSION_POLICY_ROW_KEY, engineVersionPolicyStartValues, PREVIEW_LINE_UP_POLICY_ROW_KEY } from '@debateai/register';
import { engineContractHash } from '../../apps/runner/src/engine-contracts.js';
import { mapPromptContractHash } from '@debateai/map';
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2, PREVIEW_SOURCE_ROW_KEYS_V2 } from '../../deploy/preview-auth-dev/v1/publish-register-v2.js';
import {
  buildPreviewSourceRowsV3, composePreviewSnapshotV3, publishPreviewRegisterV3, previewHostedBillingChoice, assertHostedPreviewBootRows,
  PREVIEW_SOURCE_ROW_KEYS_V3, PREVIEW_HOSTED_CEILING_BOUNDS, STORY_COST_ENVELOPE_POLICY_ROW_KEY
} from '../../deploy/preview-auth-dev/v1/publish-register-v3.js';
import { assertBaseIsActive, BASE_NOT_ACTIVE, PreviewRegisterBaseNotActiveError } from '../../deploy/preview-auth-dev/v1/publish-register-base.js';

type Row = { rowKey: string; valueJsonText: string; sourceRef: string };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const runtime = { nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0', sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), operatorSha256: 'c'.repeat(64), observedAt: '2026-10-13T12:00:00.000Z' };
const canonical = (value: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value))) as string;
const owned = () => [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey, 'en'));
/** The owner's suggested values (pending confirmation): $3 per debate, $10 per day; the kit's example room-read budget. */
const ON = { billing: 'on', perRunCeilingMicros: 3_000_000, dailyCeilingMicros: 10_000_000, askRoomReads: { limit: 60, windowMs: 60_000, capacity: 65_536 } } as const;
const OFF = { ...ON, billing: 'off' } as const;
const OWNER_KEYS = ['admissionPolicy', 'billingPolicy', 'costEnvelopePolicy'];
/** A register refusal is a TypedDomainError (its code on `.code`) or a TypeError whose message is the code. */
const refusal = (run: () => unknown) => { try { run(); } catch (error: any) { return `${error?.code ?? ''} ${error?.message ?? ''}`; } return 'no refusal'; };
const value = (rows: readonly Row[], key: string) => JSON.parse(rows.find(row => row.rowKey === key)!.valueJsonText);

/** The live register 12 shape: v2's local source plus the two base-owned rows (billing off, no story money row, no ask_room_reads). */
async function fixture() {
  const bootstrap = await loadBootstrapRegister();
  const v2: Row[] = [...await buildPreviewSourceRowsV2(bootstrap, runtime)] as Row[];
  const v12 = sorted([...v2, ...owned()]);
  return { bootstrap, v2, v12 };
}
const compose = (source: readonly Row[], base: Row[], version = '12') => composePreviewSnapshotV3({ sourceRows: source as any, baseRows: base as any, baseRegisterVersion: version, baseSnapshotSha256: computeRegisterSnapshotSha256(base as any) });

describe('publish kit v3: the hosted source', () => {
  it('is v2\'s source with the story money row added and only the three owner rows changed', async () => {
    const f = await fixture();
    for (const choice of [ON, OFF]) {
      const rows = [...await buildPreviewSourceRowsV3(f.bootstrap, runtime, choice)] as Row[];
      expect(rows.map(row => row.rowKey).sort()).toEqual([...PREVIEW_SOURCE_ROW_KEYS_V3].sort());
      expect(PREVIEW_SOURCE_ROW_KEYS_V3).toEqual([...PREVIEW_SOURCE_ROW_KEYS_V2, STORY_COST_ENVELOPE_POLICY_ROW_KEY].sort());
      const differing = rows.filter(row => JSON.stringify(row) !== JSON.stringify(f.v2.find(old => old.rowKey === row.rowKey))).map(row => row.rowKey).sort();
      expect(differing).toEqual(choice.billing === 'on' ? [...OWNER_KEYS, STORY_COST_ENVELOPE_POLICY_ROW_KEY] : ['admissionPolicy', 'costEnvelopePolicy', STORY_COST_ENVELOPE_POLICY_ROW_KEY]);
    }
  });

  it('carries the owner\'s ceilings and room-read budget, keeps every other member, and switches billing on with the US withdrawal right', async () => {
    const f = await fixture();
    const rows = [...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON)] as Row[];
    const cost = value(rows, 'costEnvelopePolicy'), oldCost = value(f.v2, 'costEnvelopePolicy');
    expect(cost).toMatchObject({ per_run_ceiling_micros: 3_000_000, daily_ceiling_micros: 10_000_000, provisional: true });
    for (const member of ['admission_close_basis_points', 'finish_up_to_basis_points', 'waiting_line_per_person', 'serve_reserve_basis_points', 'serve_overrun_basis_points', 'currency', 'kind', 'minor_units_per_unit'])
      expect(cost[member]).toEqual(oldCost[member]);
    expect([oldCost.admission_close_basis_points, oldCost.finish_up_to_basis_points, oldCost.waiting_line_per_person]).toEqual([9500, 11500, 1]);
    const admission = value(rows, 'admissionPolicy'), oldAdmission = value(f.v2, 'admissionPolicy');
    expect(oldAdmission.ask_room_reads).toBeUndefined();
    expect(admission).toEqual({ ...oldAdmission, ask_room_reads: { key: 'owner', limit: 60, window_ms: 60_000, capacity: 65_536 } });
    const billing = value(rows, 'billingPolicy');
    expect(billing).toEqual({ ...value(f.v2, 'billingPolicy'), enabled: true, withdrawal_countries: [...BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value.withdrawal_countries, 'US'] });
    expect(rows.find(row => row.rowKey === 'billingPolicy')!.sourceRef).toContain('NETOPIA\'s sandbox');
    expect(value(rows, STORY_COST_ENVELOPE_POLICY_ROW_KEY)).toMatchObject({ kind: 'STORY_COST_ENVELOPE_POLICY', currency: 'USD', per_story_ceiling_micros: 50_000, per_story_overrun_basis_points: 2_000 });
    expect(value([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, OFF)] as Row[], 'billingPolicy')).toEqual(value(f.v2, 'billingPolicy'));
  });

  it('passes the checker, rotation and call-concurrency choices through to v2 (the hosted story rows follow the checker)', async () => {
    const f = await fixture();
    const policy = { perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50, deepinfra: 150 } };
    const rows = [...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON, { checker: 'deepseek', deepseekEnabledOnGate: true }, 'off', policy)] as Row[];
    expect(value(rows, 'storyCheckerRoleRef').providerRef).toBe('preview:deepseek-v4-1-flash');
    expect(value(rows, 'answerRoleRotationPolicy').enabled).toBe(false);
    expect(value(rows, 'callConcurrencyPolicy')).toMatchObject(policy);
  });

  it.each([
    ['no choice', undefined, 'hosted-billing-choice'],
    ['an extra key', { ...ON, extra: true }, 'hosted-billing-choice'],
    ['billing that is not on or off', { ...ON, billing: 'yes' }, 'hosted-billing-choice'],
    ['a per-run ceiling above the day', { ...ON, perRunCeilingMicros: 11_000_000 }, 'hosted-billing-ceilings'],
    ['a zero ceiling', { ...ON, perRunCeilingMicros: 0 }, 'hosted-billing-ceilings'],
    ['a fractional ceiling', { ...ON, dailyCeilingMicros: 10_000_000.5 }, 'hosted-billing-ceilings'],
    ['a ceiling in dollars typed as text', { ...ON, perRunCeilingMicros: '3000000' }, 'hosted-billing-ceilings'],
    ['a per-run ceiling past the sanity bound (an extra digit)', { ...ON, perRunCeilingMicros: PREVIEW_HOSTED_CEILING_BOUNDS.perRunMaxMicros + 1, dailyCeilingMicros: PREVIEW_HOSTED_CEILING_BOUNDS.dailyMaxMicros }, 'hosted-billing-ceilings'],
    ['a daily ceiling past the sanity bound', { ...ON, dailyCeilingMicros: PREVIEW_HOSTED_CEILING_BOUNDS.dailyMaxMicros + 1 }, 'hosted-billing-ceilings'],
    ['a room-read budget without its capacity', { ...ON, askRoomReads: { limit: 60, windowMs: 60_000 } }, 'hosted-billing-ask-room-reads'],
    ['a room-read budget in the register\'s spelling', { ...ON, askRoomReads: { key: 'owner', limit: 60, window_ms: 60_000, capacity: 65_536 } }, 'hosted-billing-ask-room-reads'],
    ['a room-read window over a day', { ...ON, askRoomReads: { ...ON.askRoomReads, windowMs: 86_400_001 } }, 'hosted-billing-ask-room-reads']
  ])('refuses %s before anything is built', async (_name, choice, rule) => {
    const f = await fixture();
    expect(() => previewHostedBillingChoice(choice)).toThrow(`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`);
    await expect(buildPreviewSourceRowsV3(f.bootstrap, runtime, choice)).rejects.toThrow(`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`);
  });

  it('refuses a day that cannot hold one run plus its story (the API\'s own boot rule)', async () => {
    const f = await fixture();
    // 3.00 + the answer's 20% overrun is 3.60, plus the story's 0.06: a 3.65 day holds no full run.
    const tight = [...await buildPreviewSourceRowsV3(f.bootstrap, runtime, { ...ON, dailyCeilingMicros: 3_650_000 })] as Row[];
    expect(refusal(() => compose(tight, f.v12))).toContain('STORY_DAILY_CEILING_INSUFFICIENT');
    await expect(buildPreviewSourceRowsV3(f.bootstrap, runtime, { ...ON, dailyCeilingMicros: 3_660_000 }).then(rows => compose([...rows] as Row[], f.v12))).resolves.toBeTruthy();
  });

  it('keeps v2\'s runtime gate', async () => {
    const f = await fixture();
    await expect(buildPreviewSourceRowsV3(f.bootstrap, { ...runtime, nodeVersion: 'v22.23.1' }, ON)).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
});

describe('publish kit v3: composing from the current version', () => {
  it('from the live register 12 shape: the story money row is added and the three owner rows change, each shown with its old and new value', async () => {
    const f = await fixture();
    const before = structuredClone(f.v12);
    const plan = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON)] as Row[], f.v12);
    expect(plan.composer).toBe('preview-register-composer-v3');
    expect(plan.addedKeys).toEqual([STORY_COST_ENVELOPE_POLICY_ROW_KEY]);
    expect(plan.changedKeys).toEqual(OWNER_KEYS);
    expect(plan.rows).toHaveLength(f.v12.length + 1);
    for (const key of OWNER_KEYS) {
      const entry = plan.delta.find(row => row.rowKey === key)!;
      expect(entry).toMatchObject({ change: 'changed', reason: 'owner-hosted-billing-input', oldValueJsonText: f.v12.find(row => row.rowKey === key)!.valueJsonText });
      expect(entry.newValueSha256).toBe(sha(entry.newValueJsonText));
    }
    expect(plan.delta.find(row => row.rowKey === STORY_COST_ENVELOPE_POLICY_ROW_KEY)).toMatchObject({ change: 'added', reason: 'added-source-key', oldValueJsonText: null });
    expect(f.v12).toEqual(before);
  });

  it('a first provider-only publication (billing off) changes only the ceilings and the room-read budget', async () => {
    const f = await fixture();
    const plan = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, OFF)] as Row[], f.v12);
    expect(plan.addedKeys).toEqual([STORY_COST_ENVELOPE_POLICY_ROW_KEY]);
    expect(plan.changedKeys).toEqual(['admissionPolicy', 'costEnvelopePolicy']);
  });

  it('then billing on over that version changes the billing row alone; billing off again is a republish; v2 can no longer compose on it', async () => {
    const f = await fixture();
    const first = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, OFF)] as Row[], f.v12);
    const v13 = [...first.rows] as Row[];
    const on = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON)] as Row[], v13, '13');
    expect(on.addedKeys).toEqual([]);
    expect(on.changedKeys).toEqual(['billingPolicy']);
    const v14 = [...on.rows] as Row[];
    const off = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, OFF)] as Row[], v14, '14');
    expect(off.changedKeys).toEqual(['billingPolicy']);
    expect(value([...off.rows] as Row[], 'billingPolicy').enabled).toBe(false);
    // Kit v2 refuses a hosted base: once the preview is hosted, every later publication goes through v3.
    expect(() => composePreviewSnapshotV2({ sourceRows: f.v2 as any, baseRows: v14 as any, baseRegisterVersion: '14', baseSnapshotSha256: computeRegisterSnapshotSha256(v14 as any) })).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
    expect(() => composePreviewSnapshotV2({ sourceRows: f.v2 as any, baseRows: v13 as any, baseRegisterVersion: '13', baseSnapshotSha256: computeRegisterSnapshotSha256(v13 as any) })).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });

  it('the same inputs on the same base compose the same snapshot (publish recomposes what the owner approved)', async () => {
    const f = await fixture();
    const a = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON)] as Row[], f.v12);
    const b = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON)] as Row[], f.v12);
    expect(b.snapshotSha256).toBe(a.snapshotSha256);
    expect(b.deltaSha256).toBe(a.deltaSha256);
    const other = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, { ...ON, dailyCeilingMicros: 9_000_000 })] as Row[], f.v12);
    expect(other.deltaSha256).not.toBe(a.deltaSha256);
  });

  const edit = (rows: Row[], key: string, change: (value: any) => void) => rows.map(row => row.rowKey === key ? { ...row, valueJsonText: canonical((v => (change(v), v))(JSON.parse(row.valueJsonText))) } : row);
  it.each([
    ['billing on without the sandbox host\'s US withdrawal right', (rows: Row[]) => edit(rows, 'billingPolicy', v => { v.withdrawal_countries = v.withdrawal_countries.filter((c: string) => c !== 'US'); }), 'billing-policy-source'],
    ['billing off with a US withdrawal right', (rows: Row[]) => edit(rows, 'billingPolicy', v => { v.enabled = false; }), 'billing-policy-source'],
    ['a billing row with other rules', (rows: Row[]) => edit(rows, 'billingPolicy', v => { v.quote_ttl_seconds = 600; }), 'billing-policy-source'],
    ['a source without the story money row', (rows: Row[]) => rows.filter(row => row.rowKey !== STORY_COST_ENVELOPE_POLICY_ROW_KEY), 'source-key-list'],
    ['a source with a scorecard row', (rows: Row[]) => [...rows, { rowKey: 'modelScorecard', valueJsonText: '{}', sourceRef: 'x' }], 'support-or-scorecard-row'],
    ['a source with a base-owned row', (rows: Row[]) => [...rows, owned()[0]!], 'base-owned-row-in-source']
  ])('refuses %s', async (_name, tamper, rule) => {
    const f = await fixture();
    const rows = tamper([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON)] as Row[]);
    expect(() => compose(rows, f.v12)).toThrow(`PREVIEW_REGISTER_SNAPSHOT_REFUSED: ${rule}`);
  });

  it.each([
    ['the room-read budget', (rows: Row[]) => edit(rows, 'admissionPolicy', v => { delete v.ask_room_reads; }), 'ASK_ROOM_ADMISSION_UNSEALED'],
    ['the notify budget', (rows: Row[]) => edit(rows, 'admissionPolicy', v => { delete v.billing_notify; }), 'BILLING_ADMISSION_UNSEALED'],
    ['the checkout budget', (rows: Row[]) => edit(rows, 'admissionPolicy', v => { delete v.billing_checkout; }), 'BILLING_ADMISSION_UNSEALED'],
    ['a support budget', (rows: Row[]) => edit(rows, 'admissionPolicy', v => { delete v.support_reads; }), 'SUPPORT_ADMISSION_SCOPES_NOT_SEALED'],
    ['the country gate\'s scope', (rows: Row[]) => edit(rows, 'admissionPolicy', v => { delete v.geo_availability; }), 'GEO_AVAILABILITY_ADMISSION_UNSEALED'],
    ['the budget band', (rows: Row[]) => edit(rows, 'costEnvelopePolicy', v => { delete v.admission_close_basis_points; delete v.finish_up_to_basis_points; delete v.waiting_line_per_person; }), 'BILLING_REQUIRES_ENVELOPE_MEMBERS'],
    ['the story money row', (rows: Row[]) => rows.filter(row => row.rowKey !== STORY_COST_ENVELOPE_POLICY_ROW_KEY), 'hosted-story-money-row'],
    ['the country policy while billing is on', (rows: Row[]) => rows.filter(row => row.rowKey !== 'countryPolicy'), 'BILLING_CONFIGURATION_INCOMPLETE']
  ])('the hosted boot questions refuse a version without %s', async (_name, tamper, code) => {
    const f = await fixture();
    const rows: Row[] = [...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON), ...owned()];
    expect(() => assertHostedPreviewBootRows(rows as any)).not.toThrow();
    expect(refusal(() => assertHostedPreviewBootRows(tamper(rows) as any))).toContain(code);
  });

  it.each([
    ['a base whose billing row is malformed', (rows: Row[]) => edit(rows, 'billingPolicy', v => { v.enabled = 'yes'; }), 'BILLING_POLICY_INVALID'],
    ['a base with a row the source no longer builds', (rows: Row[]) => sorted([...rows, { rowKey: 'outboundMailPolicy', valueJsonText: '{}', sourceRef: 'x' }]), 'base-row-dropped'],
    ['a base without the staff policy', (rows: Row[]) => rows.filter(row => row.rowKey !== 'staffAccessPolicy'), 'base-owned-row-missing'],
    ['a base with a scorecard row', (rows: Row[]) => sorted([...rows, { rowKey: 'modelScorecard', valueJsonText: '{}', sourceRef: 'x' }]), 'support-or-scorecard-row']
  ])('refuses %s', async (_name, tamper, code) => {
    const f = await fixture();
    const source = [...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON)] as Row[];
    expect(refusal(() => compose(source, tamper(f.v12)))).toContain(code);
  });

  it('refuses a base whose snapshot hash is not the selected one', async () => {
    const f = await fixture();
    const source = await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON);
    expect(() => composePreviewSnapshotV3({ sourceRows: source, baseRows: f.v12 as any, baseRegisterVersion: '12', baseSnapshotSha256: 'd'.repeat(64) })).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED: base-snapshot');
  });

  it('publishes only a v3 snapshot', async () => {
    const f = await fixture();
    const v2 = composePreviewSnapshotV2({ sourceRows: f.v2 as any, baseRows: f.v12 as any, baseRegisterVersion: '12', baseSnapshotSha256: computeRegisterSnapshotSha256(f.v12 as any) });
    const pool = { query: async () => { throw new Error('no database call expected'); } } as any;
    await expect(publishPreviewRegisterV3(pool, { publicationId: '11111111-1111-4111-8111-111111111111', sourceRef: 'x', snapshot: v2 as any, approval: { baseRegisterVersion: '12', baseSnapshotSha256: v2.baseSnapshotSha256, snapshotSha256: v2.snapshotSha256, deltaSha256: v2.deltaSha256 } })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
  });
});

describe('publish kit v3: the optional debateShapePolicy row and the sealed map hash (ruling L-KIT)', () => {
  const policy = debateShapePolicyStartValues();
  const MAP_HASH_KEY = 'mapContractHash';
  /** No argument = the seventh parameter left out (its default); one argument = passed as the seventh. */
  const v3 = async (...debateShape: [] | [unknown]) =>
    [...await (buildPreviewSourceRowsV3 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), runtime, ON, undefined, undefined, null, ...debateShape)] as Row[];
  const v2 = async (debateShape: unknown) => [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, null, debateShape as any)] as Row[];
  const shapeRow = (rows: readonly Row[]) => rows.find(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY);
  const edit = (rows: Row[], key: string, change: (value: any) => any) => rows.map(row => row.rowKey === key ? { ...row, valueJsonText: canonical(change(JSON.parse(row.valueJsonText))) } : row);

  it('passes the policy through to kit v2: the same row as v2 builds; off = the start values disabled; null or nothing = no row', async () => {
    const given = await v3(policy);
    expect(shapeRow(given)).toEqual(shapeRow(await v2(policy)));
    expect(JSON.parse(shapeRow(given)!.valueJsonText)).toEqual(JSON.parse(JSON.stringify(policy)));
    expect(JSON.parse(shapeRow(await v3('off'))!.valueJsonText)).toEqual({ ...JSON.parse(JSON.stringify(policy)), enabled: false });
    const absent = await v3();
    expect(shapeRow(absent)).toBeUndefined();
    expect(shapeRow(await v3(null))).toBeUndefined();
    expect(await v3(null)).toEqual(absent);
    expect(given.filter(row => row.rowKey !== DEBATE_SHAPE_POLICY_ROW_KEY)).toEqual(absent);
    const bad = JSON.parse(JSON.stringify(policy));
    bad.plans.free.mapAIs = 10;
    await expect(v3(bad)).rejects.toThrow('DEBATE_SHAPE_POLICY_INVALID:plans.free.mapAIs');
  });

  it('the source always holds the sealed map hash, the code\'s own; a malformed one is refused when composing', async () => {
    const f = await fixture();
    for (const rows of [await v3(), await v3(policy), await v3('off')])
      expect(rows.find(row => row.rowKey === MAP_HASH_KEY)!.valueJsonText).toBe(JSON.stringify(mapPromptContractHash()));
    const malformed = edit(await v3(), MAP_HASH_KEY, () => 'not-a-hash');
    expect(refusal(() => compose(malformed, f.v12))).toContain('MAP_CONTRACT_HASH_INVALID');
  });

  it('R19: a base row the source leaves out is carried unchanged, outside the delta; a malformed one is refused, never carried', async () => {
    const f = await fixture();
    const base = sorted([...await v2(policy), ...owned()]);
    const plan = compose(await v3(), base);
    expect(shapeRow([...plan.rows] as Row[])).toEqual(shapeRow(base));
    expect(plan.delta.map(entry => entry.rowKey)).not.toContain(DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(plan.addedKeys).toEqual([STORY_COST_ENVELOPE_POLICY_ROW_KEY]);
    const broken = base.map(row => row.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"DEBATE_SHAPE_POLICY"', '"X"') } : row);
    const source = await v3();
    expect(refusal(() => compose(source, broken))).toContain('DEBATE_SHAPE_POLICY_INVALID');
  });

  it('asks the hosted runner\'s own boot refusals before anything is sealed: a foreign or missing map hash with a shape row', async () => {
    const f = await fixture();
    const rows = [...compose(await v3(policy), f.v12).rows] as Row[];
    expect(shapeRow(rows)).toBeDefined();
    expect(() => assertHostedPreviewBootRows(rows as any)).not.toThrow();
    expect(refusal(() => assertHostedPreviewBootRows(edit(rows, MAP_HASH_KEY, () => 'e'.repeat(64)) as any))).toContain('MAP_CONTRACT_HASH_MISMATCH');
    expect(refusal(() => assertHostedPreviewBootRows(rows.filter(row => row.rowKey !== MAP_HASH_KEY) as any))).toContain('DEBATE_SHAPE_MAP_HASH_UNSEALED');
    // A disabled row still needs its sealed map hash (the runner finishes the shaped runs admitted before the switch).
    const off = [...compose(await v3('off'), f.v12).rows] as Row[];
    expect(refusal(() => assertHostedPreviewBootRows(off.filter(row => row.rowKey !== MAP_HASH_KEY) as any))).toContain('DEBATE_SHAPE_MAP_HASH_UNSEALED');
    // No shape row = today's boot: the map hash row is never read.
    const today = [...compose(await v3(), f.v12).rows] as Row[];
    expect(() => assertHostedPreviewBootRows(today.filter(row => row.rowKey !== MAP_HASH_KEY) as any)).not.toThrow();
    expect(() => assertHostedPreviewBootRows(edit(today, MAP_HASH_KEY, () => 'e'.repeat(64)) as any)).not.toThrow();
  });
});

describe('publish kit v3: the optional questionLanguagePolicy row (ruling L-KIT, P2L Task 12)', () => {
  const policy = questionLanguagePolicyStartValues();
  const shape = debateShapePolicyStartValues();
  /** v3's seventh argument is the debate shape and its eighth the question language (v2's seventh). */
  const v3 = async (debateShape: unknown, ...language: [] | [unknown]) =>
    [...await (buildPreviewSourceRowsV3 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), runtime, ON, undefined, undefined, null, debateShape, ...language)] as Row[];
  const v2 = async (language: unknown) => [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, null, null, language as any)] as Row[];
  const languageRow = (rows: readonly Row[]) => rows.find(row => row.rowKey === QUESTION_LANGUAGE_POLICY_ROW_KEY);

  it('passes the policy through to kit v2: the same row as v2 builds; null or nothing = no row; a malformed policy is refused', async () => {
    const given = await v3(null, policy);
    expect(languageRow(given)).toEqual(languageRow(await v2(policy)));
    expect(JSON.parse(languageRow(given)!.valueJsonText)).toEqual(JSON.parse(JSON.stringify(policy)));
    const absent = await v3(null);
    expect(languageRow(absent)).toBeUndefined();
    expect(await v3(null, null)).toEqual(absent);
    expect(given.filter(row => row.rowKey !== QUESTION_LANGUAGE_POLICY_ROW_KEY)).toEqual(absent);
    await expect(v3(null, { ...policy, version: 2 })).rejects.toThrow('QUESTION_LANGUAGE_POLICY_INVALID:$.version');
  });

  it('R19: a base row the source leaves out is carried unchanged, outside the delta; a malformed one is refused, never carried', async () => {
    const base = sorted([...await v2(policy), ...owned()]);
    const source = await v3(null);
    const plan = compose(source, base);
    expect(languageRow([...plan.rows] as Row[])).toEqual(languageRow(base));
    expect(plan.delta.map(entry => entry.rowKey)).not.toContain(QUESTION_LANGUAGE_POLICY_ROW_KEY);
    const broken = base.map(row => row.rowKey === QUESTION_LANGUAGE_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"QUESTION_LANGUAGE_POLICY"', '"X"') } : row);
    expect(refusal(() => compose(source, broken))).toContain('QUESTION_LANGUAGE_POLICY_INVALID:$.kind');
  });

  it('asks the API\'s question-language boot refusals before anything is sealed, only with the debate shape in force', async () => {
    const f = await fixture();
    const framed = { ...policy, instruction: 'Name it. --- SAFETY FRAME' };
    const offPreview = { ...policy, fastCheck: { ...policy.fastCheck!, model: 'claude-opus-5-5' } };
    // With the shape in force: the start values pass; an owner text carrying a frame token, or a model the preview's
    // Anthropic gate does not review, is refused when composing (the API would refuse to boot on the sealed version).
    const composed = async (debateShape: unknown, language: unknown) => compose(await v3(debateShape, language), f.v12);
    await expect(composed(shape, policy)).resolves.toBeDefined();
    await expect(composed(shape, framed)).rejects.toThrow('QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN');
    await expect(composed(shape, offPreview)).rejects.toThrow('QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW');
    // Without the shape in force (no row, or the row disabled) the API never reads the row at boot: parsed only.
    await expect(composed(null, framed)).resolves.toBeDefined();
    await expect(composed('off', offPreview)).resolves.toBeDefined();
  });

  it('I4: refuses every reserved frame token (the providers\' one rule) and a model the price table does not list, before sealing', async () => {
    const f = await fixture();
    const composed = async (language: unknown) => compose(await v3(shape, language), f.v12);
    for (const token of ['#|DEBATEAI-FENCE-', 'DBAI-CANARY-', 'debateai.prompt-frame.v2 (contract ', '--- SAFETY FRAME', 'CONTENT RULE debateai.content-rule.v1', '--- PER-CALL MARKERS (engine) ---']) {
      await expect(composed({ ...policy, instruction: `Name it. ${token}x` })).rejects.toThrow('QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN');
    }
    // claude-sonnet-5-5 is on no reviewed row: the preview gate does not review it and no price exists for it.
    await expect(composed({ ...policy, fastCheck: { ...policy.fastCheck!, model: 'claude-sonnet-5-5' } })).rejects.toThrow('QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW');
    await expect(composed({ ...policy, fastCheck: null, instruction: 'Name the language.' })).resolves.toBeDefined();
  });
});

describe('publish kit v3: the optional lengthGuidancePolicy row (LG-C, spec 2026-10-15 §3.1)', () => {
  const policy = lengthGuidancePolicyStartValues();
  /** v3's ninth argument is the length guidance (v2's eighth). */
  const v3 = async (...length: [] | [unknown]) =>
    [...await (buildPreviewSourceRowsV3 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), runtime, ON, undefined, undefined, null, null, null, ...length)] as Row[];
  const v2 = async (length: unknown) => [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, undefined, undefined, null, null, null, length as any)] as Row[];
  const lengthRow = (rows: readonly Row[]) => rows.find(row => row.rowKey === LENGTH_GUIDANCE_POLICY_ROW_KEY);

  it('passes the policy through to kit v2: the same row as v2 builds; null or nothing = no row', async () => {
    const given = await v3(policy);
    expect(lengthRow(given)).toEqual(lengthRow(await v2(policy)));
    const absent = await v3();
    expect(lengthRow(absent)).toBeUndefined();
    expect(await v3(null)).toEqual(absent);
    expect(given.filter(row => row.rowKey !== LENGTH_GUIDANCE_POLICY_ROW_KEY)).toEqual(absent);
  });

  it('R19: a base row the source leaves out is carried unchanged, outside the delta; a malformed one is refused, never carried', async () => {
    const base = sorted([...await v2(policy), ...owned()]);
    const source = await v3();
    const plan = compose(source, base);
    expect(lengthRow([...plan.rows] as Row[])).toEqual(lengthRow(base));
    expect(plan.delta.map(entry => entry.rowKey)).not.toContain(LENGTH_GUIDANCE_POLICY_ROW_KEY);
    const broken = base.map(row => row.rowKey === LENGTH_GUIDANCE_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"LENGTH_GUIDANCE_POLICY"', '"X"') } : row);
    expect(refusal(() => compose(source, broken))).toContain('LENGTH_GUIDANCE_POLICY_INVALID:');
  });
});

describe('the native operator chooses the kit by the plan', () => {
  const text = readFileSync(resolve('deploy/preview-auth-dev/v1/native-operator.mjs'), 'utf8');
  const body = text.slice(text.indexOf('export async function runNativeOperator('));
  it('loads kit v3 only for a plan with the owner\'s hosted inputs, and hands them to the builder', () => {
    expect(body).toContain("const hosted=Object.hasOwn(plan,'hostedBilling');");
    expect(body).toContain("tsImport(hosted?'./publish-register-v3.ts':'./publish-register-v2.ts',import.meta.url)");
    expect(body.split('publisher.buildPreviewSourceRowsV3(')).toHaveLength(2);
    expect(body.split('publisher.buildPreviewSourceRowsV3(')[1]).toMatch(/^await register\.loadBootstrapRegister\(\),observation,plan\.hostedBilling,plan\.checkerChoice,plan\.roleRotation,plan\.callConcurrency\?\?null,plan\.debateShape\?\?null,plan\.questionLanguage\?\?null,plan\.lengthGuidance\?\?null,null,plan\.lineUp\?\?null,plan\.answerSeats\?\?null\)/);
    expect(body).toContain('const snapshot=hosted?publisher.composePreviewSnapshotV3(composition):publisher.composePreviewSnapshotV2(composition);');
  });
  it('publishes with kit v3 only after the pending-forward-step check, like kit v2', () => {
    const preCheck = body.indexOf("if(plan.operation==='publish')await verify.refusePendingForwardSteps(pool);");
    expect(preCheck).toBeGreaterThan(-1);
    expect(body.indexOf('publisher.publishPreviewRegisterV3(')).toBeGreaterThan(preCheck);
    expect(body.indexOf('publisher.publishPreviewRegisterV2(')).toBeGreaterThan(preCheck);
  });
});

describe('publish kit v3: the optional engineVersionPolicy row and the engine seal (engine redesign R1d)', () => {
  const engine = engineVersionPolicyStartValues();
  const length = lengthGuidancePolicyStartValues();
  /** v3's ninth argument is LG-C's length guidance and its tenth the engine row; no tenth = its default. */
  const v3 = async (lengthGuidance: unknown, ...engineVersion: [] | [unknown]) =>
    [...await (buildPreviewSourceRowsV3 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), runtime, ON,
      undefined, undefined, null, null, null, lengthGuidance, ...engineVersion)] as Row[];
  const v2 = async (lengthGuidance: unknown, engineVersion: unknown) =>
    [...await (buildPreviewSourceRowsV2 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), runtime,
      undefined, undefined, null, null, null, lengthGuidance, engineVersion)] as Row[];
  const engineRow = (rows: readonly Row[]) => rows.find(row => row.rowKey === ENGINE_VERSION_POLICY_ROW_KEY);
  const edit = (rows: Row[], key: string, change: (value: any) => any) => rows.map(row => row.rowKey === key ? { ...row, valueJsonText: canonical(change(JSON.parse(row.valueJsonText))) } : row);

  it('passes the policy through to kit v2: the same row v2 builds; off = the start values disabled; null or nothing = no row', async () => {
    const given = await v3(length, engine);
    expect(engineRow(given)).toEqual(engineRow(await v2(length, engine)));
    expect(JSON.parse(engineRow(await v3(length, 'off'))!.valueJsonText)).toEqual({ ...JSON.parse(JSON.stringify(engine)), enabled: false });
    const absent = await v3(length);
    expect(engineRow(absent)).toBeUndefined();
    expect(await v3(length, null)).toEqual(absent);
    expect(given.filter(row => row.rowKey !== ENGINE_VERSION_POLICY_ROW_KEY)).toEqual(absent);
  });

  it('the source always holds the code\'s engine seal; a malformed one is refused when composing', async () => {
    const f = await fixture();
    for (const rows of [await v3(null), await v3(length, engine)]) {
      expect(JSON.parse(rows.find(row => row.rowKey === ENGINE_CONTRACT_HASH_ROW_KEY)!.valueJsonText)).toBe(engineContractHash());
    }
    const malformed = edit(await v3(null), ENGINE_CONTRACT_HASH_ROW_KEY, () => 'not-a-hash');
    expect(refusal(() => compose(malformed, f.v12))).toContain('ENGINE_CONTRACT_HASH_INVALID');
  });

  it('asks the hosted runner\'s engine boot refusals before anything is sealed', async () => {
    const f = await fixture();
    const rows = [...compose(await v3(length, engine), f.v12).rows] as Row[];
    expect(engineRow(rows)).toBeDefined();
    expect(() => assertHostedPreviewBootRows(rows as any)).not.toThrow();
    expect(refusal(() => assertHostedPreviewBootRows(edit(rows, ENGINE_CONTRACT_HASH_ROW_KEY, () => 'e'.repeat(64)) as any))).toContain('ENGINE_CONTRACT_HASH_MISMATCH');
    expect(refusal(() => assertHostedPreviewBootRows(rows.filter(row => row.rowKey !== ENGINE_CONTRACT_HASH_ROW_KEY) as any))).toContain('ENGINE_CONTRACT_HASH_UNSEALED');
    expect(refusal(() => assertHostedPreviewBootRows(rows.filter(row => row.rowKey !== LENGTH_GUIDANCE_POLICY_ROW_KEY) as any))).toContain('ENGINE_REQUIRES_LENGTH_POLICY');
    // A disabled row still needs the length row and its seal (the runner finishes the engine-2 runs admitted before the switch).
    const off = [...compose(await v3(length, 'off'), f.v12).rows] as Row[];
    expect(refusal(() => assertHostedPreviewBootRows(off.filter(row => row.rowKey !== ENGINE_CONTRACT_HASH_ROW_KEY) as any))).toContain('ENGINE_CONTRACT_HASH_UNSEALED');
    // No engine row = engine 1: the seal is never read.
    const today = [...compose(await v3(null), f.v12).rows] as Row[];
    expect(() => assertHostedPreviewBootRows(edit(today, ENGINE_CONTRACT_HASH_ROW_KEY, () => 'e'.repeat(64)) as any)).not.toThrow();
  });
});

/**
 * Side-by-side spec §13, addition D23 (owner 2026-10-22): kit v3 passes the plan's line-up and answer seats through to
 * kit v2's builder (v3's eleventh and twelfth arguments); the hosted story rows follow the chosen seats; a carried
 * previewLineUpPolicy row is re-parsed by the register's own reader.
 */
describe('publish kit v3: the optional previewLineUpPolicy row and the answer seats (side-by-side §13 addition D23)', () => {
  const GLM = 'zai-org/GLM-5.3-Flash', DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash', MIMO = 'XiaomiMiMo/MiMo-V2.6-Pro', QWEN = 'Qwen/Qwen3.8-Flash', HAIKU = 'claude-haiku-5-5';
  const OWNER_LIVE_TABLE = JSON.parse(`{"zai-org/GLM-5.3-Flash":{"level":"high"},"deepseek-ai/DeepSeek-V4.1-Flash":{"level":"none"},"Qwen/Qwen3.8-Flash":{"level":"medium"},"XiaomiMiMo/MiMo-V2.6-Pro":{"level":"default","steps":{"pros_cons":"none","cross_exchange":"none"}},"claude-haiku-5-5":{"level":"medium","steps":{"judge_panel":"high","reviewer":"high","answer_checker":"high","story_checker":"high","answer_writer":"high","story_writer":"high","slip_fix":"medium"}}}`) as Record<string, unknown>;
  const LIVE = { free_model_ids: [GLM, DEEPSEEK_MODEL], premium_model_ids: [GLM, DEEPSEEK_MODEL, MIMO, QWEN, HAIKU], thinking_levels: OWNER_LIVE_TABLE };
  const HAIKU_REF = 'preview:claude-haiku-5-5', GLM_B = 'preview:fixture-b', DEEPSEEK_REF = 'preview:deepseek-v4-1-flash';
  const v3 = async (lineUp?: unknown, answerSeats?: unknown, checker?: unknown) =>
    [...await (buildPreviewSourceRowsV3 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), runtime, ON,
      checker, undefined, null, null, null, null, null, lineUp, answerSeats)] as Row[];
  const v2 = async (lineUp?: unknown, answerSeats?: unknown) =>
    [...await (buildPreviewSourceRowsV2 as (...args: unknown[]) => Promise<readonly Row[]>)(await loadBootstrapRegister(), runtime,
      undefined, undefined, null, null, null, null, null, lineUp, answerSeats)] as Row[];
  const lineUpRow = (rows: readonly Row[]) => rows.find(row => row.rowKey === PREVIEW_LINE_UP_POLICY_ROW_KEY);
  const seats = (rows: readonly Row[]) => ['synthesizerRoleRef', 'evaluatorRoleRef', 'storytellerRoleRef', 'storyCheckerRoleRef'].map(key => value(rows, key).providerRef);

  it('passes the line-up through to kit v2: the same row v2 builds; null or nothing = no row, byte for byte today\'s', async () => {
    const given = await v3(LIVE), absent = await v3();
    expect(lineUpRow(given)).toEqual(lineUpRow(await v2(LIVE)));
    expect(lineUpRow(absent)).toBeUndefined();
    expect(await v3(null, null)).toEqual(absent);
    expect(absent).toEqual([...await buildPreviewSourceRowsV3(await loadBootstrapRegister(), runtime, ON)]);
    expect(given.filter(row => row.rowKey !== PREVIEW_LINE_UP_POLICY_ROW_KEY)).toEqual(absent);
    await expect(v3({ ...LIVE, thinking_levels: { [QWEN]: { level: 'high' } } })).rejects.toThrow(`PREVIEW_THINKING_LEVELS_INVALID:level:${QWEN}`);
  });

  it('R19: a base line-up row the source leaves out is carried unchanged, outside the delta; a malformed one is refused, never carried', async () => {
    const f = await fixture();
    const published = compose(await v3(LIVE), f.v12);
    expect(published.addedKeys).toContain(PREVIEW_LINE_UP_POLICY_ROW_KEY);
    const base = [...published.rows] as Row[];
    const kept = compose(await v3(), base, '13');
    expect(lineUpRow([...kept.rows] as Row[])).toEqual(lineUpRow(base));
    expect(kept.delta).toEqual([]);
    const broken = base.map(row => row.rowKey === PREVIEW_LINE_UP_POLICY_ROW_KEY ? { ...row, valueJsonText: row.valueJsonText.replace('"PREVIEW_LINE_UP_POLICY"', '"X"') } : row);
    const source = await v3();
    expect(refusal(() => compose(source, broken, '13'))).toContain('PREVIEW_LINE_UP_POLICY_INVALID:kind');
  });

  it('the answer seats reach the hosted story rows: the Haiku writer seals the synthesizer and the storyteller; the story seats may move alone', async () => {
    const f = await fixture();
    const haiku = await v3(null, { writer: HAIKU_REF, checker: GLM_B });
    expect(seats(haiku)).toEqual([HAIKU_REF, GLM_B, HAIKU_REF, GLM_B]);
    expect(value(haiku, STORY_COST_ENVELOPE_POLICY_ROW_KEY)).toEqual(value(await v3(), STORY_COST_ENVELOPE_POLICY_ROW_KEY));
    expect(() => compose(haiku, f.v12)).not.toThrow();
    const story = await v3(null, { writer: 'preview:fixture-a', checker: DEEPSEEK_REF, storyteller: HAIKU_REF, storyChecker: GLM_B });
    expect(seats(story)).toEqual(['preview:fixture-a', DEEPSEEK_REF, HAIKU_REF, GLM_B]);
    expect(() => compose(story, f.v12)).not.toThrow();
    // Seats equal to today's choice change nothing.
    expect(await v3(null, { writer: 'preview:fixture-a', checker: GLM_B })).toEqual(await v3());
    expect(await v3(null, { writer: 'preview:fixture-a', checker: DEEPSEEK_REF })).toEqual(await v3(null, null, { checker: 'deepseek', deepseekEnabledOnGate: true }));
    await expect(v3(null, { writer: 'preview:other', checker: GLM_B })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seat-unreviewed');
    await expect(v3(null, { writer: HAIKU_REF, checker: GLM_B }, { checker: 'glm' })).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seats-with-checker-choice');
  });
});

/**
 * Side-by-side spec §13 (Task S18): kit v3 composes from the ACTIVE settings version — the pointer, else the current
 * release's own site version, else (no release yet) the old currency rule. The pool answers the settings operator's
 * three status reads (readSettingsStatus) and the old rule's read, and records every statement.
 */
describe('publish kit v3: composing from the active settings version', () => {
  // Release keys are built from pieces (the secret scanner reads r<n>-<12 hex> as a key).
  const release = (site: number) => [`r${site}`, 'a'.repeat(12)].join('-');
  const id = '11111111-1111-4111-8111-111111111111';
  const statusPool = (state: { release: string | null; pointer: string | null; above?: { register_version: string; publication_id: string | null }[] }) => {
    const statements: string[] = [];
    const pool = { async query(sql: string) {
      statements.push(sql);
      if (/core\.read_current_release\(\)/.test(sql)) return { rows: state.release === null ? [] : [{ release_key: state.release }] };
      if (/register\.read_active_settings_version\(\)/.test(sql)) return { rows: [{ pointer: state.pointer }] };
      if (/register\.read_passed_settings_versions/.test(sql)) return { rows: [] };
      if (/register_version>\$1/.test(sql)) return { rows: state.above ?? [] };
      throw new Error('unexpected statement');
    } } as any;
    return { statements, pool };
  };
  const oldRule = (statements: string[]) => statements.some(sql => /register_version>\$1/.test(sql));

  it('passes when the base is the pointer, with a never-activated candidate sealed above it', async () => {
    const f = statusPool({ release: release(12), pointer: '13', above: [{ register_version: '14', publication_id: '22222222-2222-4222-8222-222222222222' }] });
    await expect(assertBaseIsActive(f.pool, '13', id)).resolves.toBeUndefined();
    expect(oldRule(f.statements)).toBe(false);
  });
  it.each([
    ['an older version than the pointer', { release: release(12), pointer: '13' }, '12'],
    ['a newer candidate than the pointer', { release: release(12), pointer: '13' }, '14'],
    ['a version other than the release\'s site version while nothing was activated', { release: release(12), pointer: null }, '13']
  ])('refuses %s', async (_name, state, base) => {
    const f = statusPool(state);
    await expect(assertBaseIsActive(f.pool, base, id)).rejects.toThrow(BASE_NOT_ACTIVE);
    await expect(assertBaseIsActive(f.pool, base, id)).rejects.toBeInstanceOf(PreviewRegisterBaseNotActiveError);
    expect(oldRule(f.statements)).toBe(false);
  });
  it('with the pointer empty, the current release\'s own site version is the active one (D1)', async () => {
    const f = statusPool({ release: release(12), pointer: null, above: [{ register_version: '13', publication_id: null }] });
    await expect(assertBaseIsActive(f.pool, '12', id)).resolves.toBeUndefined();
    expect(oldRule(f.statements)).toBe(false);
  });
  it('with no release yet, the old rule decides: nothing above the base but this publication\'s replay', async () => {
    await expect(assertBaseIsActive(statusPool({ release: null, pointer: null }).pool, '12', id)).resolves.toBeUndefined();
    await expect(assertBaseIsActive(statusPool({ release: null, pointer: null, above: [{ register_version: '13', publication_id: id }] }).pool, '12', id)).resolves.toBeUndefined();
    const stale = statusPool({ release: null, pointer: null, above: [{ register_version: '13', publication_id: null }] });
    await expect(assertBaseIsActive(stale.pool, '12', id)).rejects.toThrow('PREVIEW_REGISTER_BASE_NOT_CURRENT');
    expect(oldRule(stale.statements)).toBe(true);
  });
  it('kit v3 exports the active rule only; publish checks it before any publication statement', async () => {
    const kit = await import('../../deploy/' + 'preview-auth-dev/v1/publish-register-v3.ts') as Record<string, unknown>;
    expect(kit.assertBaseIsActive).toBe(assertBaseIsActive);
    expect(kit.assertBaseIsCurrent).toBeUndefined();
    const f = await fixture();
    const snapshot = compose([...await buildPreviewSourceRowsV3(f.bootstrap, runtime, ON)] as Row[], f.v12);
    const approval = { baseRegisterVersion: snapshot.baseRegisterVersion, baseSnapshotSha256: snapshot.baseSnapshotSha256, snapshotSha256: snapshot.snapshotSha256, deltaSha256: snapshot.deltaSha256 };
    const stale = statusPool({ release: release(12), pointer: '13' });
    await expect(publishPreviewRegisterV3(stale.pool, { publicationId: id, sourceRef: 'x', snapshot, approval })).rejects.toThrow(BASE_NOT_ACTIVE);
    expect(stale.statements).toHaveLength(3);
    // Base 12 is active (the pointer) with a candidate above it: the check passes and the publication's own reads begin.
    const active = statusPool({ release: release(12), pointer: '12', above: [{ register_version: '13', publication_id: null }] });
    await expect(publishPreviewRegisterV3(active.pool, { publicationId: id, sourceRef: 'x', snapshot, approval })).rejects.toThrow('unexpected statement');
    expect(active.statements).toHaveLength(4);
    expect(oldRule(active.statements)).toBe(false);
  });
  it('the native operator checks the active rule for kit v3 (kit v2 keeps the current rule) and prints its refusal in words', async () => {
    const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
    expect(operator.BASE_NOT_ACTIVE_LINE).toBe(BASE_NOT_ACTIVE);
    expect(operator.operatorRefusalLine(new PreviewRegisterBaseNotActiveError())).toBe(`${BASE_NOT_ACTIVE}\n`);
    expect(operator.operatorRefusalLine(new TypeError(BASE_NOT_ACTIVE))).toBe('PREVIEW_NATIVE_OPERATION_REFUSED\n');
    const text = readFileSync(resolve('deploy/preview-auth-dev/v1/native-operator.mjs'), 'utf8');
    const body = text.slice(text.indexOf('export async function runNativeOperator('));
    const active = body.indexOf("if(hosted&&(plan.operation==='plan'||plan.operation==='publish'))await publisher.assertBaseIsActive(pool,base.registerVersion,plan.publicationId);");
    const current = body.indexOf("else if(plan.operation==='plan'||plan.operation==='publish')await publisher.assertBaseIsCurrent(pool,base.registerVersion,plan.publicationId);");
    expect(active).toBeGreaterThan(-1);
    expect(current).toBeGreaterThan(active);
    expect(current).toBeLessThan(body.indexOf("if(plan.operation==='plan'||plan.operation==='apply-and-plan')return metadata;"));
  });
});
