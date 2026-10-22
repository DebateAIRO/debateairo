// GAP-RUNNER (2026-10-09): the reviewed start mode of deploy/preview-auth-dev/v1/launch-runner.mjs,
// its content-free startup event, the runner's narrowed environment and its unit template.
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as runtime from '../../packages/register/src/runtime-environment.js';
import { fixtureReleaseKey, validRunnerEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
import { RUNNER_READY_PROCESS_EVENT, announceRunnerReady } from '../../apps/runner/src/runner-ready.js';
import { RUNNER_RETIRED_PROCESS_EVENT } from '../../apps/runner/src/runner-retirement.js';
const execute = promisify(execFile);
const receipt = await import('../../deploy/' + 'preview-auth-dev/v1/runtime-receipt.mjs');
const env = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');
const launcher = await import('../../deploy/' + 'preview-auth-dev/v1/launch-runner.mjs');
const OPERATOR = resolve('deploy/preview-auth-dev/v1');
const hash = 'a'.repeat(64);
const publication = { publicationId: '11111111-1111-4111-8111-111111111111', publicationKind: 'GENERAL', baseRegisterVersion: '8', registerVersion: '12', requestSha256: hash, snapshotSha256: 'b'.repeat(64), rowCount: 68, recordedAt: '2026-10-06T12:00:00.000Z', outcome: 'CREATED' };
const binding = { sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifestSha256: hash, operatorManifestSha256: hash, contractSha256: hash, runnerMainSha256: hash };
const identity = { pid: 123, uid: 992, bootId: '11111111-1111-4111-8111-111111111111', startTicks: '10001' };
// Side-by-side spec §1: the release this runner is, r<register>-<first 12 hex of the plan's source revision>.
const releaseKey = `r${publication.registerVersion}-${binding.sourceRevision.slice(0, 12)}`;
const selection = { REGISTER_VERSION: '12', DEBATEAI_DEPLOYMENT_MODE: 'local', RELEASE_KEY: releaseKey };
const ready = { kind: 'DEBATEAI_RUNNER_READY', worker: 'preview-runner', registerVersion: '12', releaseKey, startupDispatched: 0 };

/** A fake main: announces `message` (or nothing) after a tick, then keeps running until `stop`. */
function fakeMain(message: unknown, options: { failBefore?: boolean; failAfter?: boolean; endBefore?: boolean } = {}) {
  let listener: ((value: unknown) => void) | undefined;
  let stop!: (value?: unknown) => void, fail!: (error: Error) => void;
  const life = new Promise((resolveLife, rejectLife) => { stop = resolveLife; fail = rejectLife; });
  const order: string[] = [];
  return {
    order, stop, fail,
    subscribeReady: (callback: (value: unknown) => void) => { listener = callback; order.push('subscribe'); return () => { listener = undefined; order.push('unsubscribe'); }; },
    importMain: async () => {
      order.push('import');
      await new Promise(r => setTimeout(r, 3));
      if (options.failBefore) throw new Error('boot refused with secret material');
      if (options.endBefore) return;
      if (message !== undefined) listener?.(message);
      if (options.failAfter) setTimeout(() => fail(new Error('later failure')), 3);
      await life;
    }
  };
}

describe('runner startup event (afterRunnerReady)', () => {
  it('emits one content-free event only after the real main announced readiness, while main keeps running', async () => {
    const main = fakeMain({ ...ready, startupDispatched: 2 });
    const events: unknown[] = [];
    const started = await receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: main.subscribeReady, importMain: main.importMain, emit: (event: unknown) => { main.order.push('emit'); events.push(event); } });
    expect(main.order).toEqual(['subscribe', 'import', 'unsubscribe', 'emit']);
    expect(events).toEqual([started.event]);
    expect(started.event).toMatchObject({ ...binding, ...identity, schemaVersion: 'preview-auth-dev-runner-startup-v2', service: 'runner', selectedRegisterVersion: '12', releaseKey, deploymentMode: 'local', nativeRequestSha256: publication.requestSha256, nativeSnapshotSha256: publication.snapshotSha256, startupDispatched: 2 });
    // The worker name (an environment value) and anything path- or secret-like never enter the event.
    expect(JSON.stringify(events)).not.toMatch(/preview-runner"|worker|path|secret|recipient|environment|DATABASE|postgres/i);
    let settled = false; started.running.then(() => { settled = true; });
    await new Promise(r => setTimeout(r, 5)); expect(settled).toBe(false);
    main.stop(); await started.running;
    expect(receipt.parseRunnerRuntimeEvent(`PREVIEW_RUNNER_STARTED ${JSON.stringify(started.event)}`)).toEqual(started.event);
  });

  it('carries the hosted mode into the event (owner rulings 2026-10-13), and refuses a mode that changes during main', async () => {
    const main = fakeMain(ready);
    const started = await receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => ({ ...selection, DEBATEAI_DEPLOYMENT_MODE: 'hosted' }), subscribeReady: main.subscribeReady, importMain: main.importMain, emit: () => undefined });
    expect(started.event.deploymentMode).toBe('hosted');
    expect(receipt.validateRunnerRuntimeEvent(started.event)).toEqual(started.event);
    main.stop(); await started.running;
    let mode = 'local';
    const flipping = fakeMain(ready);
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => ({ ...selection, DEBATEAI_DEPLOYMENT_MODE: mode }), subscribeReady: flipping.subscribeReady, importMain: async () => { mode = 'hosted'; await flipping.importMain(); }, emit: () => undefined })).rejects.toThrow('PREVIEW_RUNTIME_SELECTION_REFUSED');
    flipping.stop();
    expect(() => receipt.validateRunnerRuntimeEvent({ ...started.event, deploymentMode: 'staging' })).toThrow();
  });

  // Side-by-side spec §1: every ready line announces its release, and the event names the plan's own.
  it("the event carries the release key built from the plan's source revision and register version", async () => {
    const main = fakeMain(ready);
    const events: unknown[] = [];
    const started = await receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: main.subscribeReady, importMain: main.importMain, emit: (event: unknown) => events.push(event) });
    main.stop(); await started.running;
    expect(started.event.releaseKey).toBe('r12-aaaaaaaaaaaa');
    expect(events).toEqual([started.event]);
    expect(receipt.parseRunnerRuntimeEvent(`PREVIEW_RUNNER_STARTED ${JSON.stringify(started.event)}`)).toEqual(started.event);
    // The event's key is its own register and source revision, never another release's.
    for (const other of ['r11-aaaaaaaaaaaa', 'r12-bbbbbbbbbbbb', 'r12-000000000000', 'legacy', undefined])
      expect(() => receipt.validateRunnerRuntimeEvent({ ...started.event, releaseKey: other }), String(other)).toThrow('PREVIEW_RUNTIME_RECEIPT_REFUSED');
    // A source revision that is not text refuses with the code, before main, never a raw TypeError.
    let imported = 0;
    await expect(receipt.afterRunnerReady({ binding: { ...binding, sourceRevision: 42 }, publication, identity, readSelection: () => selection, subscribeReady: () => () => undefined, importMain: async () => { imported++; }, emit: () => undefined })).rejects.toThrow(/^PREVIEW_RUNTIME_RECEIPT_REFUSED$/);
    // RELEASE_KEY of the runner's environment that is another revision's refuses before main (the event would name another release).
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => ({ ...selection, RELEASE_KEY: 'r12-bbbbbbbbbbbb' }), subscribeReady: () => () => undefined, importMain: async () => { imported++; }, emit: () => undefined })).rejects.toThrow(/^PREVIEW_RUNTIME_RECEIPT_REFUSED$/);
    expect(imported).toBe(0);
  });

  // Side-by-side spec §1: the selection the launcher reads includes RELEASE_KEY, of the plan's register version.
  it.each([
    ['no RELEASE_KEY', (() => { const { RELEASE_KEY: _dropped, ...rest } = selection; return rest; })()],
    ['a malformed RELEASE_KEY', { ...selection, RELEASE_KEY: 'R12-AAAAAAAAAAAA' }],
    ['the legacy stamp', { ...selection, RELEASE_KEY: 'legacy' }],
    ['another register version\'s key', { ...selection, RELEASE_KEY: 'r11-aaaaaaaaaaaa' }]
  ])('refuses %s before main is imported', async (_name, read) => {
    let imported = 0;
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => read, subscribeReady: () => () => undefined, importMain: async () => { imported++; }, emit: () => undefined })).rejects.toThrow(/^PREVIEW_RUNTIME_SELECTION_REFUSED$/);
    expect(imported).toBe(0);
  });

  it('emits nothing when RELEASE_KEY changes during main', async () => {
    let key = releaseKey;
    const main = fakeMain(ready);
    const events: unknown[] = [];
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => ({ ...selection, RELEASE_KEY: key }), subscribeReady: main.subscribeReady, importMain: async () => { key = 'r12-bbbbbbbbbbbb'; await main.importMain(); }, emit: (x: unknown) => events.push(x) })).rejects.toThrow(/^PREVIEW_RUNTIME_SELECTION_REFUSED$/);
    expect(events).toEqual([]);
    main.stop();
  });

  it.each([
    ['a ready message without releaseKey is not ready', (() => { const { releaseKey: _dropped, ...withoutKey } = ready; return withoutKey; })()],
    ['a ready message naming another release is not ready', { ...ready, releaseKey: 'r12-bbbbbbbbbbbb' }]
  ])('%s', async (_name, message) => {
    const main = fakeMain(message);
    const events: unknown[] = [];
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: main.subscribeReady, importMain: main.importMain, emit: (x: unknown) => events.push(x) })).rejects.toThrow(/^PREVIEW_RUNNER_NOT_READY$/);
    expect(events).toEqual([]);
    main.stop();
  });

  it('hands a failure after readiness to the caller through `running`', async () => {
    const main = fakeMain(ready, { failAfter: true });
    const started = await receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: main.subscribeReady, importMain: main.importMain, emit: () => undefined });
    await expect(started.running).rejects.toThrow('later failure');
  });

  it.each([
    ['main fails before readiness', fakeMain(ready, { failBefore: true })],
    ['main ends without readiness', fakeMain(ready, { endBefore: true })],
    ['wrong register in the message', fakeMain({ ...ready, registerVersion: '11' })],
    ['wrong kind', fakeMain({ ...ready, kind: 'OTHER' })],
    ['an extra key', fakeMain({ ...ready, databaseUrl: 'postgresql://x' })],
    ['a count beyond the start-up bound', fakeMain({ ...ready, startupDispatched: 101 })],
    ['a non-object message', fakeMain('ready')]
  ])('emits nothing when %s', async (_name, main) => {
    const events: unknown[] = [];
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: main.subscribeReady, importMain: main.importMain, emit: (x: unknown) => events.push(x) })).rejects.toThrow(/^PREVIEW_/);
    expect(events).toEqual([]);
    expect(main.order.at(-1)).toBe('unsubscribe');
    main.stop();
  });

  it('refuses without an event when readiness misses the deadline (120 s by default)', async () => {
    expect(receipt.RUNNER_READY_DEADLINE_MS).toBe(120_000);
    const main = fakeMain(undefined);
    const events: unknown[] = [];
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: main.subscribeReady, importMain: main.importMain, emit: (x: unknown) => events.push(x), readyDeadlineMs: 20 })).rejects.toThrow('PREVIEW_RUNNER_NOT_READY');
    expect(events).toEqual([]);
    main.stop();
  });

  it('root readback refuses an event that does not match the live runner unit process', async () => {
    const main = fakeMain(ready);
    const { event } = await receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: main.subscribeReady, importMain: main.importMain, emit: () => undefined });
    main.stop();
    // Side-by-side spec §10: the live unit is this release's instance, debateai-preview-runner@<label>.service.
    const facts = { unit: 'debateai-preview-runner@d50e33165-r19-v1.service', expectedUnit: 'debateai-preview-runner@d50e33165-r19-v1.service', releaseKey, rootMatched: true, mainPidMatched: true, publication };
    expect(receipt.verifyRunnerRuntimeReadback(event, event, facts)).toEqual({ selectionVerified: true, service: 'runner', registerVersion: '12', pid: 123 });
    for (const key of ['pid', 'uid', 'bootId', 'startTicks', 'sourceRevision', 'runnerMainSha256'] as const) {
      const observed = { ...event, [key]: key === 'pid' || key === 'uid' ? 999 : key === 'bootId' ? '22222222-2222-4222-8222-222222222222' : key === 'startTicks' ? '20002' : key === 'sourceRevision' ? 'c'.repeat(40) : 'c'.repeat(64),
        // Another source revision is another release, whose own event names its own key (side-by-side spec §1).
        ...(key === 'sourceRevision' ? { releaseKey: 'r12-cccccccccccc' } : {}) };
      expect(() => receipt.verifyRunnerRuntimeReadback(event, observed, facts), key).toThrow('PREVIEW_RUNTIME_READBACK_REFUSED');
    }
    for (const patch of [{ unit: 'debateai-preview-api.service' }, { expectedUnit: 'debateai-preview-api.service', unit: 'debateai-preview-api.service' }, { rootMatched: false }, { mainPidMatched: false }, { publication: { ...publication, snapshotSha256: 'c'.repeat(64) } }])
      expect(() => receipt.verifyRunnerRuntimeReadback(event, event, { ...facts, ...patch })).toThrow();
    // The single (pre-side-by-side) unit, another instance, a label that is not a release label, or another release's key all refuse.
    for (const patch of [
      { unit: 'debateai-preview-runner.service', expectedUnit: 'debateai-preview-runner.service' },
      { unit: 'debateai-preview-runner@d50e33165-r18-v1.service' },
      { unit: 'debateai-preview-api@d50e33165-r19-v1.service', expectedUnit: 'debateai-preview-api@d50e33165-r19-v1.service' },
      { unit: 'debateai-preview-runner@../x.service', expectedUnit: 'debateai-preview-runner@../x.service' },
      { unit: 'debateai-preview-runner@New-v1.service', expectedUnit: 'debateai-preview-runner@New-v1.service' },
      { releaseKey: 'r12-bbbbbbbbbbbb' },
      { releaseKey: undefined }
    ]) expect(() => receipt.verifyRunnerRuntimeReadback(event, event, { ...facts, ...patch }), JSON.stringify(patch)).toThrow(/^PREVIEW_RUNTIME_READBACK_REFUSED$/);
  });

  it('emits nothing when the register selection changes during main', async () => {
    let version = '12';
    const main = fakeMain(ready);
    const importMain = async () => { version = '11'; await main.importMain(); };
    const events: unknown[] = [];
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => ({ ...selection, REGISTER_VERSION: version }), subscribeReady: main.subscribeReady, importMain, emit: (x: unknown) => events.push(x) })).rejects.toThrow();
    expect(events).toEqual([]);
    main.stop();
  });

  it.each([
    ['binding', { binding: { ...binding, apiMainSha256: hash } }],
    ['identity', { identity: { ...identity, uid: 0 } }],
    // Hosted is a lawful mode since owner rulings 2026-10-13; any other word is not.
    ['selection', { readSelection: () => ({ ...selection, DEBATEAI_DEPLOYMENT_MODE: 'staging' }) }],
    ['publication', { publication: { ...publication, publicationKind: 'OTHER' } }]
  ])('refuses a malformed %s before main is imported', async (_name, patch) => {
    let imported = 0;
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: () => () => undefined, importMain: async () => { imported++; }, emit: () => undefined, ...patch })).rejects.toThrow();
    expect(imported).toBe(0);
  });

  it('keeps the API event schema separate from the runner one', () => {
    const event = { schemaVersion: 'preview-auth-dev-runner-startup-v2', service: 'runner', ...binding, ...identity, selectedRegisterVersion: '12', releaseKey, nativeRequestSha256: hash, nativeSnapshotSha256: hash, deploymentMode: 'local', startupDispatched: 0 };
    expect(receipt.validateRunnerRuntimeEvent(event)).toEqual(event);
    expect(() => receipt.validateRuntimeEvent(event)).toThrow();
    expect(() => receipt.parseRunnerRuntimeEvent(`PREVIEW_API_STARTED ${JSON.stringify(event)}`)).toThrow();
    expect(() => receipt.validateRunnerRuntimeEvent({ ...event, service: 'api' })).toThrow();
    // The v1 event (before the release key reached the API's event too) is no longer admitted.
    expect(() => receipt.validateRunnerRuntimeEvent({ ...event, schemaVersion: 'preview-auth-dev-runner-startup-v1' })).toThrow('PREVIEW_RUNTIME_RECEIPT_REFUSED');
  });
});

describe('the real readiness seam', () => {
  it('the launcher listens for exactly the event the runner announces, in-process', () => {
    expect(launcher.RUNNER_READY_PROCESS_EVENT).toBe(RUNNER_READY_PROCESS_EVENT);
    const heard: unknown[] = [];
    const listener = (value: unknown) => heard.push(value);
    process.once(RUNNER_READY_PROCESS_EVENT, listener);
    const announced = { ...ready, registerVersion: '1', releaseKey: 'r1-0123456789ab' };
    announceRunnerReady(announced as never);
    expect(heard).toEqual([announced]);
    expect((heard[0] as { releaseKey?: unknown }).releaseKey).toBe('r1-0123456789ab');
    expect(Object.isFrozen(heard[0])).toBe(true);
  });

  // Side-by-side spec §10 (D16b): on the public server the runner runs without a launcher, and root's release tool reads
  // its start from the unit's journal: the runner's own `DEBATEAI_RUNNER_READY {json}` line (VPS_LAYOUT.startedLines).
  it('the runner prints its ready message on stdout as the line the public server reads, beside the in-process event', async () => {
    const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');
    const lines: string[] = [];
    const heard: unknown[] = [];
    const listener = (value: unknown) => heard.push(value);
    process.once(RUNNER_READY_PROCESS_EVENT, listener);
    const announced = { ...ready, registerVersion: '20', releaseKey: 'r20-0123456789ab', startupDispatched: 2 };
    announceRunnerReady(announced as never, line => lines.push(line));
    expect(heard).toEqual([announced]);
    expect(lines).toHaveLength(1);
    const prefix = `${common.VPS_LAYOUT.startedLines.runner} `;
    expect(lines[0]!.startsWith(prefix)).toBe(true);
    expect(lines[0]!.endsWith('\n')).toBe(true);
    expect(lines[0]!.slice(0, -1)).not.toContain('\n');
    expect(JSON.parse(lines[0]!.slice(prefix.length))).toEqual(announced);
    // The preview keeps its own start line: its launcher's PREVIEW_RUNNER_STARTED, never this one.
    expect(common.LAYOUT.startedLines.runner).toBe('PREVIEW_RUNNER_STARTED');
  });

  it('by default the ready line goes to stdout', () => {
    const written: unknown[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { written.push(chunk); return true; });
    const listener = () => {};
    process.once(RUNNER_READY_PROCESS_EVENT, listener);
    try {
      announceRunnerReady({ ...ready, releaseKey: 'r12-0123456789ab' } as never);
    } finally {
      spy.mockRestore();
    }
    expect(written).toEqual([`DEBATEAI_RUNNER_READY ${JSON.stringify({ ...ready, releaseKey: 'r12-0123456789ab' })}\n`]);
  });

  // Side-by-side spec §4: the launcher hears the runner's self-retirement as the same in-process event it emits.
  it('the launcher listens for exactly the retirement event the runner emits', () => {
    expect(launcher.RUNNER_RETIRED_PROCESS_EVENT).toBe(RUNNER_RETIRED_PROCESS_EVENT);
    expect(launcher.RUNNER_RETIRED_PROCESS_EVENT).toBe('debateai:runner-retired');
  });

  it('runner main announces readiness only after the team gate, the worker and the start-up re-dispatch', async () => {
    const source = await readFile(resolve('apps/runner/src/main.ts'), 'utf8');
    const gate = source.indexOf('await refusePreviewOutsiderWork('), worker = source.indexOf('await hatchet.worker('),
      start = source.indexOf('worker.start()'), reconcile = source.indexOf('await reconcileRunnerStartupWork('), announce = source.indexOf('announceRunnerReady({');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(worker); expect(worker).toBeLessThan(start); expect(start).toBeLessThan(reconcile); expect(reconcile).toBeLessThan(announce);
    expect(source).not.toContain('process.send(');
  });

  // Side-by-side spec §4: the retirement monitor starts only once the runner is ready, and both timers stop once the worker ended.
  it('runner main starts the retirement monitor after readiness and stops both timers after the worker ended', async () => {
    const source = await readFile(resolve('apps/runner/src/main.ts'), 'utf8');
    const announce = source.indexOf('announceRunnerReady({'), resend = source.indexOf('startLapsedClaimResend({'),
      retire = source.indexOf('startRunnerRetirement({'), ended = source.indexOf('await started;');
    expect(announce).toBeGreaterThan(0);
    expect(announce).toBeLessThan(resend); expect(resend).toBeLessThan(retire); expect(retire).toBeLessThan(ended);
    expect(source.slice(ended)).toContain('lapsedResend.stop();\nretirement.stop();');
    expect(source).toContain('stopWorker: async () => { lapsedResend.stop(); await worker.stop(); }');
  });

  // X2 (final review): a standing retire request is read once BEFORE the worker starts; under it both stops are on before
  // the first claim and the start-up re-send is skipped (it would only hand the runner work to refuse).
  it('runner main honours a standing retire request before the worker starts, and then skips the start-up re-send', async () => {
    const source = await readFile(resolve('apps/runner/src/main.ts'), 'utf8');
    const store = source.indexOf('const retirementStore = postgresRunnerRetirementStore(pool, workFence);'),
      standing = source.indexOf('const retireRequestStanding = await honourStandingRetireRequest({'),
      start = source.indexOf('worker.start()'), reconcile = source.indexOf('await reconcileRunnerStartupWork(');
    expect(store).toBeGreaterThan(0);
    expect(store).toBeLessThan(standing); expect(standing).toBeLessThan(start); expect(start).toBeLessThan(reconcile);
    expect(source.slice(standing, start)).toContain('store: retirementStore,');
    expect(source.slice(standing, start)).toContain('signal: retirementSignal,');
    expect(source).toContain('const startupReconciliation = retireRequestStanding\n  ? Object.freeze({ dispatched: 0 })\n  : await reconcileRunnerStartupWork({');
    expect(source.slice(source.indexOf('startRunnerRetirement({'))).toContain('store: retirementStore,');
    expect(source.match(/postgresRunnerRetirementStore\(/g)).toHaveLength(1);
  });

  // R1 (final review): the backstop reads the runner's own model-call accounting before this release ends itself. Every
  // call the runner and the story make goes through a provider member, and a claim probe is a call through the gate too.
  it('runner main counts every model call (each provider member, each claim probe) and hands the count to the backstop', async () => {
    const source = await readFile(resolve('apps/runner/src/main.ts'), 'utf8');
    expect(source).toContain('const modelCalls = createModelCallCounter();');
    expect(source.match(/createRunnerProviderTopology\(/g)).toHaveLength(1);
    expect(source).toContain('(target) => countModelCalls(\n    withStructureRepair(targetGateways.get(target.providerRef)!, structureRepairRoute), modelCalls));');
    const probe = source.slice(source.indexOf('function observeClaimTarget('), source.indexOf('const workFence ='));
    expect(probe).toContain('const leave = modelCalls.enter();');
    expect(probe).toContain('}).finally(leave);');
    expect(source.slice(source.indexOf('startRunnerRetirement({'))).toContain('calls: modelCalls,');
  });
});

describe('launch-runner.mjs: start mirrors launch-api.mjs, prepare-only stays the default', () => {
  it('runs the API launcher sequence in the same order for role runner', async () => {
    const code = await readFile(resolve(OPERATOR, 'launch-runner.mjs'), 'utf8');
    const start = code.slice(code.indexOf('export async function launchRunner'));
    const steps = ["prepareLaunch(argv,'runner',import.meta.url)", 'readEnvironmentFile(plan.environment.path,plan.environment)', "narrowEnvironment('runner',configured,runtime,plan.publication,plan)",
      'verify.assertSelectedRunnerConnection(configured,plan.publication)', "refuse('PREVIEW_RUNNER_MAIN_UNBOUND')", 'assertRunnerReleaseKey(configured,plan,source)', 'installNarrowEnvironment(selected.environment)', 'afterRunnerReady(', 'importMain:()=>tsImport(entry,import.meta.url)'];
    const at = steps.map(step => start.indexOf(step));
    expect(at.every(index => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(start).toContain("file.path==='dialectical-engine/apps/runner/src/main.ts'");
    // Side-by-side spec §1: the selection checked before and after main includes the runner's own RELEASE_KEY.
    expect(start).toContain('readSelection:()=>({REGISTER_VERSION:process.env.REGISTER_VERSION,DEBATEAI_DEPLOYMENT_MODE:process.env.DEBATEAI_DEPLOYMENT_MODE,RELEASE_KEY:process.env.RELEASE_KEY})');
    expect(code).toContain("if(argv[0]==='--start')");
    // The prepare-only function starts nothing.
    const prepare = code.slice(code.indexOf('export async function prepareRunner'), code.indexOf('export async function launchRunner'));
    expect(prepare).not.toMatch(/installNarrowEnvironment\(|tsImport\(entry|apps\/runner\/src\/main/);
    expect(prepare).toContain('started:false');
    // Side-by-side spec §1: prepare-only checks the release key right after the narrowed environment, as the start does.
    const narrowed = prepare.indexOf("narrowEnvironment('runner',configured,runtime,plan.publication,plan)"), keyed = prepare.indexOf('assertRunnerReleaseKey(configured,plan,source)');
    expect(narrowed).toBeGreaterThan(0); expect(keyed).toBeGreaterThan(narrowed);
  });

  // Side-by-side spec §1: the preview launcher ties RELEASE_KEY to the plan's register pin and source revision.
  it('assertRunnerReleaseKey admits only r<plan register>-<first 12 hex of the plan source revision>', () => {
    const plan = { publication: { registerVersion: '12' } }, source = { sourceRevision: '0123456789ab'.padEnd(40, 'c') };
    expect(() => launcher.assertRunnerReleaseKey({ RELEASE_KEY: 'r12-0123456789ab' }, plan, source)).not.toThrow();
    for (const other of ['r11-0123456789ab', 'r12-cccccccccccc', 'r12-000000000000', 'R12-0123456789AB', 'r12-0123456789ab ', 'legacy', '', undefined])
      expect(() => launcher.assertRunnerReleaseKey({ RELEASE_KEY: other }, plan, source), String(other)).toThrow(/^PREVIEW_RUNNER_RELEASE_KEY_MISMATCH$/);
  });

  // Pretend to be the reviewed Linux/Node so each case proves the argv check itself, on every CI host.
  async function asReviewedLinux(run: () => Promise<void>) {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!, version = Object.getOwnPropertyDescriptor(process, 'version')!;
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
    Object.defineProperty(process, 'version', { ...version, value: 'v26.8.2' });
    try { await run(); } finally { Object.defineProperty(process, 'platform', platform); Object.defineProperty(process, 'version', version); }
  }
  const PLAN = '/opt/debateai-v3-preview/artifacts/x/runner-launch.json';
  it.each([
    ['no plan path', ['--plan']],
    ['a plan outside the artifacts folder', ['--plan', '/tmp/runner-launch.json']],
    ['a plan with another name', ['--plan', '/opt/debateai-v3-preview/artifacts/x/runner.json']],
    ['--start passed to the function', ['--start', '--plan', PLAN]],
    ['an extra argument', ['--plan', PLAN, '--start']],
    ['another flag', ['--config', PLAN]]
  ])('both modes refuse %s at the argv check, before any read', async (_name, argv) => {
    await asReviewedLinux(async () => {
      await expect(launcher.prepareRunner(argv)).rejects.toThrow('PREVIEW_LAUNCH_INPUT_REFUSED');
      await expect(launcher.launchRunner(argv)).rejects.toThrow('PREVIEW_LAUNCH_INPUT_REFUSED');
    });
  });
  it('control: a well-formed argv passes the argv check and stops at plan custody', async () => {
    await asReviewedLinux(async () => {
      await expect(launcher.prepareRunner(['--plan', PLAN])).rejects.toThrow('PREVIEW_CUSTODY_REFUSED');
      await expect(launcher.launchRunner(['--plan', PLAN])).rejects.toThrow('PREVIEW_CUSTODY_REFUSED');
    });
  });
  it('a start requires the preview configuration and a non-empty team, checked before any connection', async () => {
    const code = await readFile(resolve(OPERATOR, 'launch-runner.mjs'), 'utf8');
    const start = code.slice(code.indexOf('export async function launchRunner'));
    const check = start.indexOf("refuse('PREVIEW_RUNNER_TEAM_REQUIRED')");
    expect(start).toContain('parsed.PREVIEW_PROVIDER_TEST_CONFIG===undefined||!Array.isArray(parsed.PREVIEW_TEAM_USER_IDS)||parsed.PREVIEW_TEAM_USER_IDS.length===0');
    expect(check).toBeGreaterThan(start.indexOf("narrowEnvironment('runner'"));
    expect(check).toBeLessThan(start.indexOf('assertSelectedRunnerConnection'));
  });
  it('every failure of a started runner prints one fixed code and exits 1', () => {
    const events: Record<string, (value?: unknown) => void> = {}, written: string[] = [], exits: number[] = [];
    const target = { on: (name: string, handler: () => void) => { events[name] = handler; }, stderr: { write: (text: string) => written.push(text) }, exit: (code: number) => exits.push(code) };
    const stop = launcher.installRunnerFailureCodes(target);
    events.uncaughtException!(new Error('secret text')); events.unhandledRejection!(new Error('secret text')); stop();
    expect(written).toEqual(Array(3).fill('PREVIEW_RUNNER_STOPPED_ON_FAILURE\n'));
    expect(exits).toEqual([1, 1, 1]);
  });

  it.each([
    [['--plan', '/opt/debateai-v3-preview/artifacts/x/runner-launch.json'], 'PREVIEW_RUNNER_PREPARATION_REFUSED\n'],
    [['--start', '--plan', '/opt/debateai-v3-preview/artifacts/x/runner-launch.json'], 'PREVIEW_RUNNER_STARTUP_REFUSED\n']
  ])('the executable prints only a code on refusal (%j)', async (argv, expected) => {
    const result = await execute(process.execPath, [resolve(OPERATOR, 'launch-runner.mjs'), ...argv], { cwd: process.cwd(), env: { PATH: process.env.PATH ?? '' } }).then(() => null, (error: { code: number; stdout: string; stderr: string }) => error);
    expect(result).toMatchObject({ code: 1, stdout: '', stderr: expected });
  });
});

// 2026-10-16: every planned `systemctl stop debateai-preview-runner` since 2026-10-10 ended with
// PREVIEW_RUNNER_STOPPED_ON_FAILURE and status 1, so OnFailure= emailed the owner "runner failed".
// These run the real start mode (startRunner) in a child process with real signals; only the
// worker is a stand-in. Like the Hatchet worker (worker-internal.js: process.on('SIGTERM'|'SIGINT')
// -> exitGracefully -> the listener ends and start() returns), it ends main shortly after a signal.
const CHILD = `
const { startRunner } = await import(process.env.LAUNCHER_URL);
const worker = JSON.parse(process.env.FAKE_WORKER);
setInterval(() => {}, 1000); // the worker's open connection keeps a real runner alive
await startRunner([], async () => {
  if (worker.uncaughtWhileStarting) { setTimeout(() => { throw new Error('secret text'); }, 1); return new Promise(() => {}); }
  let end, fail;
  const running = new Promise((resolveRun, rejectRun) => { end = resolveRun; fail = rejectRun; });
  // 'hangs': like a Hatchet worker.stop() that never settles, main never ends.
  const finish = () => setTimeout(() => worker.end === 'fails' ? fail(new Error('secret text')) : worker.end === 'hangs' ? undefined : end(), 5);
  if (worker.listensForSignals) { process.on('SIGTERM', finish); process.on('SIGINT', finish); }
  if (worker.endsAlone) finish();
  // Like PREVIEW_RUNNER_STARTED, printed before startRunner listens. With no listener at all the OS
  // ends the process at once, so a worker that does not listen announces after startRunner does.
  if (worker.listensForSignals) process.stdout.write('READY\\n');
  else setImmediate(() => process.stdout.write('READY\\n'));
  // Like runner-retirement.ts: the retired event first, then the worker stops (main ends after it).
  if (worker.retires) setTimeout(() => { process.emit('debateai:runner-retired', { releaseKey: 'r1-aaaaaaaaaaaa' }); finish(); }, 1);
  return { event: {}, running };
}, worker.retiredSettleMs === undefined ? undefined : { retiredSettleMs: worker.retiredSettleMs });
`;
type FakeWorker = { listensForSignals?: boolean; endsAlone?: boolean; retires?: boolean; retiredSettleMs?: number; end?: 'returns' | 'fails' | 'hangs'; uncaughtWhileStarting?: boolean };
function startFakeRunner(worker: FakeWorker, signal: NodeJS.Signals | null) {
  return new Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', CHILD], {
      env: { PATH: process.env.PATH ?? '', LAUNCHER_URL: pathToFileURL(resolve(OPERATOR, 'launch-runner.mjs')).href, FAKE_WORKER: JSON.stringify(worker) }
    });
    let stdout = '', stderr = '', pending = signal;
    const guard = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (pending && stdout.includes('READY\n')) { child.kill(pending); pending = null; }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', rejectRun);
    child.on('close', (code, closedBy) => { clearTimeout(guard); resolveRun({ code, signal: closedBy, stdout, stderr }); });
  });
}

describe('how a started runner ends (startRunner, real process and signals)', () => {
  it.each([
    ['systemctl stop (SIGTERM)', 'SIGTERM'],
    ['Ctrl-C (SIGINT)', 'SIGINT']
  ] as const)('a stop someone asked for, %s, prints PREVIEW_RUNNER_STOPPED and exits 0', async (_name, signal) => {
    const result = await startFakeRunner({ listensForSignals: true, end: 'returns' }, signal);
    expect(result).toEqual({ code: 0, signal: null, stdout: 'READY\nPREVIEW_RUNNER_STOPPED\n', stderr: '' });
  });
  it('an asked stop with no worker listening for the signal still ends at once, exit 0', async () => {
    const result = await startFakeRunner({ listensForSignals: false }, 'SIGTERM');
    expect(result).toEqual({ code: 0, signal: null, stdout: 'READY\nPREVIEW_RUNNER_STOPPED\n', stderr: '' });
  });
  it.each([
    ['main returns with no stop asked (the listener ended on its own)', { listensForSignals: true, endsAlone: true, end: 'returns' }, null],
    ['main fails with no stop asked (Hatchet refused)', { listensForSignals: true, endsAlone: true, end: 'fails' }, null],
    ['main fails during an asked stop', { listensForSignals: true, end: 'fails' }, 'SIGTERM']
  ] as const)('%s: prints only PREVIEW_RUNNER_STOPPED_ON_FAILURE and exits 1', async (_name, worker, signal) => {
    const result = await startFakeRunner(worker, signal);
    expect(result).toEqual({ code: 1, signal: null, stdout: 'READY\n', stderr: 'PREVIEW_RUNNER_STOPPED_ON_FAILURE\n' });
  });
  it('an uncaught error while starting prints only PREVIEW_RUNNER_STOPPED_ON_FAILURE and exits 1', async () => {
    const result = await startFakeRunner({ uncaughtWhileStarting: true }, null);
    expect(result).toEqual({ code: 1, signal: null, stdout: '', stderr: 'PREVIEW_RUNNER_STOPPED_ON_FAILURE\n' });
  });
  // Side-by-side spec §4: a release that drained (or was asked to retire) stops its own worker; that is an asked end too.
  it('a runner that retired by itself prints PREVIEW_RUNNER_RETIRED and exits 0, so OnFailure= sends no email', async () => {
    const result = await startFakeRunner({ listensForSignals: true, retires: true, end: 'returns' }, null);
    expect(result).toEqual({ code: 0, signal: null, stdout: 'READY\nPREVIEW_RUNNER_RETIRED\n', stderr: '' });
  });
  it('a runner that retired and whose main then failed is a failure', async () => {
    const result = await startFakeRunner({ listensForSignals: true, retires: true, end: 'fails' }, null);
    expect(result).toEqual({ code: 1, signal: null, stdout: 'READY\n', stderr: 'PREVIEW_RUNNER_STOPPED_ON_FAILURE\n' });
  });
  // B10 review: the retired event comes before Hatchet's worker.stop(); a stop that never settles must not leave the launcher up.
  it('a runner that retired and whose main never ends still prints PREVIEW_RUNNER_RETIRED and exits 0, after the settle bound', async () => {
    const bound = 400, began = Date.now();
    const result = await startFakeRunner({ listensForSignals: true, retires: true, end: 'hangs', retiredSettleMs: bound }, null);
    expect(result).toEqual({ code: 0, signal: null, stdout: 'READY\nPREVIEW_RUNNER_RETIRED\n', stderr: '' });
    expect(Date.now() - began).toBeGreaterThanOrEqual(bound);
  });
  it('production passes no settle override: the executable uses RETIRED_SETTLE_MS (30 s)', async () => {
    expect(launcher.RETIRED_SETTLE_MS).toBe(30_000);
    const code = await readFile(resolve(OPERATOR, 'launch-runner.mjs'), 'utf8');
    expect(code).toContain('{retiredSettleMs=RETIRED_SETTLE_MS}={}');
    expect(code).toContain('await startRunner(argv.slice(1));');
  });
});

describe('runner environment narrowing', () => {
  // The plan's source revision starts with the fixture key's 12 hex (side-by-side spec §1), so fixtureReleaseKey('12') is its key.
  const approved = { apiPort: '3101', uiPort: '3100', mailExecutable: '/opt/release/mail-handoff.mjs', mailFrom: 'noreply@dezbatere.ro', sourceRevision: '0123456789ab'.padEnd(40, 'c') };
  const preview = JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high', budget_socket: '/run/debateai-v3-preview/team-budget-v2.sock', scope_id: 'preview-team-v2-20261009' });
  const configured = (): Record<string, string> => {
    const { VLLM_BASE_URL: _a, VLLM_MODEL: _b, VLLM_MAKER: _c, ...rest } = validRunnerEnvironmentFixture();
    const worker = `debateai-preview-runner-${fixtureReleaseKey('12')}`;
    return { ...rest, NODE_ENV: 'production', REGISTER_VERSION: '12', RELEASE_KEY: fixtureReleaseKey('12'), RUNNER_WORKER_ID: worker, HATCHET_WORKER_NAME: worker, DEBATEAI_DEPLOYMENT_MODE: 'local', PREVIEW_PROVIDER_TEST_CONFIG_JSON: preview, PREVIEW_TEAM_USER_IDS_JSON: '["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e"]' };
  };
  it('keeps the team list and only source runner keys, with the fixed PATH', () => {
    const result = env.narrowEnvironment('runner', configured(), runtime, { registerVersion: '12' }, approved);
    expect(result.environment.PREVIEW_TEAM_USER_IDS_JSON).toBe('["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e"]');
    expect(result.environment.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
    expect(result.selectedRegisterVersion).toBe('12');
    expect(Object.keys(result.environment).sort()).toEqual([...Object.keys(configured()), 'PATH'].sort());
  });
  it.each([{ NODE_EXTRA_CA_CERTS: '/etc/ca.crt' }, { NODE_OPTIONS: '--require x' }, { REGISTER_VERSION: '11', RELEASE_KEY: fixtureReleaseKey('11') }, { DEBATEAI_DEPLOYMENT_MODE: 'staging' }, { NODE_ENV: 'development' }, { PREVIEW_TEAM_USER_IDS_JSON: '["not-a-uuid"]' }, { TURNSTILE_SOCKET_PATH: '/run/x.sock' }, { HTTPS_PROXY: 'http://127.0.0.1:3180' }])('refuses %j without emitting values', patch => {
    expect(() => env.narrowEnvironment('runner', { ...configured(), ...patch }, runtime, { registerVersion: '12' }, approved)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/);
  });
  // Owner rulings 2026-10-13: the runner runs hosted beside a hosted API, only on the preview's own configuration.
  it('admits hosted with the preview configuration and refuses it without', () => {
    const result = env.narrowEnvironment('runner', { ...configured(), DEBATEAI_DEPLOYMENT_MODE: 'hosted' }, runtime, { registerVersion: '12' }, approved);
    expect(result.deploymentMode).toBe('hosted');
    const bare: Record<string, string> = { ...configured(), DEBATEAI_DEPLOYMENT_MODE: 'hosted' };
    delete bare.PREVIEW_PROVIDER_TEST_CONFIG_JSON; delete bare.PREVIEW_TEAM_USER_IDS_JSON;
    expect(() => env.narrowEnvironment('runner', bare, runtime, { registerVersion: '12' }, approved)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/);
    expect(() => env.narrowEnvironment('runner', { ...configured(), DEBATEAI_DEPLOYMENT_MODE: 'hosted', BILLING_STAGE_CLOCK_OFFSET_DAYS: '31' }, runtime, { registerVersion: '12' }, approved)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/);
  });
});

/** systemd unit text -> `[Section]Key` -> values, in file order. */
function parseUnit(text: string) {
  const out: Record<string, string[]> = {}; let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) { section = line; continue; }
    const at = line.indexOf('='); (out[section + line.slice(0, at)] ??= []).push(line.slice(at + 1));
  }
  return out;
}

// Side-by-side spec §10: one runner instance per release, debateai-preview-runner@<label>.service.
describe('debateai-preview-runner@.service template', () => {
  it('is the confined runner identity with soft ordering on the five supporting units (both spending gates) and no fixtures', async () => {
    const unit = parseUnit(await readFile(resolve(OPERATOR, 'debateai-preview-runner@.service'), 'utf8'));
    const supporting = ['debateai-preview-postgresql.service', 'debateai-preview-hatchet.service', 'debateai-preview-hatchet-gateway.service', 'debateai-preview-provider-budget.service', 'debateai-preview-anthropic-budget.service'];
    expect(unit['[Unit]Wants']!.join(' ').split(' ').sort()).toEqual([...supporting].sort());
    expect(unit['[Unit]After']!.join(' ').split(' ').sort()).toEqual([...supporting].sort());
    expect(Object.keys(unit).filter(key => /Requires|BindsTo|Requisite|PartOf|ExecStart|\[Install\]/.test(key))).toEqual([]);
    expect(JSON.stringify(unit)).not.toContain('fixture');
    expect(unit['[Service]User']).toEqual(['debateai-preview-runner']);
    expect(unit['[Service]Group']).toEqual(['debateai-preview-runner']);
    expect(unit['[Service]SupplementaryGroups']).toEqual(['debateai-preview-custody']);
    expect(unit['[Service]Restart']).toEqual(['no']);
  });

  it('loads no environment file, unsets loader variables and sets only PATH, NODE_ENV and the Hatchet CA', async () => {
    const unit = parseUnit(await readFile(resolve(OPERATOR, 'debateai-preview-runner@.service'), 'utf8'));
    expect(unit['[Service]EnvironmentFile']).toEqual(['']);
    expect(unit['[Service]PassEnvironment']).toEqual(['']);
    expect(unit['[Service]UnsetEnvironment']).toEqual(['', 'LD_LIBRARY_PATH LD_PRELOAD NODE_OPTIONS NODE_PATH']);
    expect(unit['[Service]Environment']).toEqual(['', 'PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=production NODE_EXTRA_CA_CERTS=/etc/debateai-v3-preview/hatchet-tls/ca.crt']);
  });

  it('keeps the API base unit hardening, loopback-only IP and the three deliberate differences', async () => {
    const unit = parseUnit(await readFile(resolve(OPERATOR, 'debateai-preview-runner@.service'), 'utf8'));
    const api: Record<string, string> = { ProtectSystem: 'strict', ProtectHome: 'true', PrivateTmp: 'true', UMask: '0077', NoNewPrivileges: 'true', ProtectProc: 'invisible',
      ProtectKernelTunables: 'true', ProtectKernelModules: 'true', ProtectKernelLogs: 'true', ProtectControlGroups: 'true', ProtectClock: 'true', RestrictNamespaces: 'true',
      RestrictRealtime: 'true', RestrictSUIDSGID: 'true', LockPersonality: 'true', CapabilityBoundingSet: '', AmbientCapabilities: '', SystemCallArchitectures: 'native',
      IPAddressDeny: 'any', IPAddressAllow: 'localhost', KillMode: 'mixed' };
    for (const [key, value] of Object.entries(api)) expect(unit[`[Service]${key}`], key).toEqual([value]);
    expect(unit['[Service]SystemCallFilter']).toEqual(['@system-service', '~@privileged @resources @obsolete']);
    expect(unit['[Service]ProcSubset']).toEqual(['all']);
    expect(unit['[Service]RestrictAddressFamilies']).toEqual(['AF_UNIX AF_INET AF_INET6 AF_NETLINK']);
    expect(JSON.stringify(unit)).not.toMatch(/fchown|RestrictSUIDSGID":\["false/);
    const denied = unit['[Service]InaccessiblePaths']!.join(' ');
    for (const path of ['/etc/debateai-v3-preview/api', '/var/lib/debateai-v3-preview/api/audit-keys', '/var/lib/debateai-v3-preview/provider-team-authority-v2', '/var/lib/debateai-v3-preview/provider-test-authority']) expect(denied).toContain(path);
  });

  it("reads only its own release's env file", async () => {
    const unit = parseUnit(await readFile(resolve(OPERATOR, 'debateai-preview-runner@.service'), 'utf8'));
    const readable = unit['[Service]ReadOnlyPaths']!.join(' ').split(' ');
    expect(readable.filter(path => path.includes('.env'))).toEqual(['/etc/debateai-v3-preview/auth-dev-v1/runner-%i.env']);
  });
});
