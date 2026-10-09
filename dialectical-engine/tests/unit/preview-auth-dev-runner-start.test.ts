// GAP-RUNNER (2026-10-09): the reviewed start mode of deploy/preview-auth-dev/v1/launch-runner.mjs,
// its content-free startup event, the runner's narrowed environment and its unit template.
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import * as runtime from '../../packages/register/src/runtime-environment.js';
import { validRunnerEnvironmentFixture } from '../support/apiEnvironmentFixture.js';
import { RUNNER_READY_PROCESS_EVENT, announceRunnerReady } from '../../apps/runner/src/runner-ready.js';
const execute = promisify(execFile);
const receipt = await import('../../deploy/' + 'preview-auth-dev/v1/runtime-receipt.mjs');
const env = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');
const launcher = await import('../../deploy/' + 'preview-auth-dev/v1/launch-runner.mjs');
const OPERATOR = resolve('deploy/preview-auth-dev/v1');
const hash = 'a'.repeat(64);
const publication = { publicationId: '11111111-1111-4111-8111-111111111111', publicationKind: 'GENERAL', baseRegisterVersion: '8', registerVersion: '12', requestSha256: hash, snapshotSha256: 'b'.repeat(64), rowCount: 68, recordedAt: '2026-10-06T12:00:00.000Z', outcome: 'CREATED' };
const binding = { sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceManifestSha256: hash, operatorManifestSha256: hash, contractSha256: hash, runnerMainSha256: hash };
const identity = { pid: 123, uid: 992, bootId: '11111111-1111-4111-8111-111111111111', startTicks: '10001' };
const selection = { REGISTER_VERSION: '12', DEBATEAI_DEPLOYMENT_MODE: 'local' };
const ready = { kind: 'DEBATEAI_RUNNER_READY', worker: 'preview-runner', registerVersion: '12', startupDispatched: 0 };

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
    expect(started.event).toMatchObject({ ...binding, ...identity, schemaVersion: 'preview-auth-dev-runner-startup-v1', service: 'runner', selectedRegisterVersion: '12', deploymentMode: 'local', nativeRequestSha256: publication.requestSha256, nativeSnapshotSha256: publication.snapshotSha256, startupDispatched: 2 });
    // The worker name (an environment value) and anything path- or secret-like never enter the event.
    expect(JSON.stringify(events)).not.toMatch(/preview-runner"|worker|path|secret|recipient|environment|DATABASE|postgres/i);
    let settled = false; started.running.then(() => { settled = true; });
    await new Promise(r => setTimeout(r, 5)); expect(settled).toBe(false);
    main.stop(); await started.running;
    expect(receipt.parseRunnerRuntimeEvent(`PREVIEW_RUNNER_STARTED ${JSON.stringify(started.event)}`)).toEqual(started.event);
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
    const facts = { unit: 'debateai-preview-runner.service', expectedUnit: 'debateai-preview-runner.service', rootMatched: true, mainPidMatched: true, publication };
    expect(receipt.verifyRunnerRuntimeReadback(event, event, facts)).toEqual({ selectionVerified: true, service: 'runner', registerVersion: '12', pid: 123 });
    for (const key of ['pid', 'uid', 'bootId', 'startTicks', 'sourceRevision', 'runnerMainSha256'] as const) {
      const observed = { ...event, [key]: key === 'pid' || key === 'uid' ? 999 : key === 'bootId' ? '22222222-2222-4222-8222-222222222222' : key === 'startTicks' ? '20002' : key === 'sourceRevision' ? 'c'.repeat(40) : 'c'.repeat(64) };
      expect(() => receipt.verifyRunnerRuntimeReadback(event, observed, facts), key).toThrow('PREVIEW_RUNTIME_READBACK_REFUSED');
    }
    for (const patch of [{ unit: 'debateai-preview-api.service' }, { expectedUnit: 'debateai-preview-api.service', unit: 'debateai-preview-api.service' }, { rootMatched: false }, { mainPidMatched: false }, { publication: { ...publication, snapshotSha256: 'c'.repeat(64) } }])
      expect(() => receipt.verifyRunnerRuntimeReadback(event, event, { ...facts, ...patch })).toThrow();
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
    ['selection', { readSelection: () => ({ ...selection, DEBATEAI_DEPLOYMENT_MODE: 'hosted' }) }],
    ['publication', { publication: { ...publication, publicationKind: 'OTHER' } }]
  ])('refuses a malformed %s before main is imported', async (_name, patch) => {
    let imported = 0;
    await expect(receipt.afterRunnerReady({ binding, publication, identity, readSelection: () => selection, subscribeReady: () => () => undefined, importMain: async () => { imported++; }, emit: () => undefined, ...patch })).rejects.toThrow();
    expect(imported).toBe(0);
  });

  it('keeps the API event schema separate from the runner one', () => {
    const event = { schemaVersion: 'preview-auth-dev-runner-startup-v1', service: 'runner', ...binding, ...identity, selectedRegisterVersion: '12', nativeRequestSha256: hash, nativeSnapshotSha256: hash, deploymentMode: 'local', startupDispatched: 0 };
    expect(receipt.validateRunnerRuntimeEvent(event)).toEqual(event);
    expect(() => receipt.validateRuntimeEvent(event)).toThrow();
    expect(() => receipt.parseRunnerRuntimeEvent(`PREVIEW_API_STARTED ${JSON.stringify(event)}`)).toThrow();
    expect(() => receipt.validateRunnerRuntimeEvent({ ...event, service: 'api' })).toThrow();
  });
});

describe('the real readiness seam', () => {
  it('the launcher listens for exactly the event the runner announces, in-process', () => {
    expect(launcher.RUNNER_READY_PROCESS_EVENT).toBe(RUNNER_READY_PROCESS_EVENT);
    const heard: unknown[] = [];
    const listener = (value: unknown) => heard.push(value);
    process.once(RUNNER_READY_PROCESS_EVENT, listener);
    announceRunnerReady(ready as never);
    expect(heard).toEqual([ready]);
    expect(Object.isFrozen(heard[0])).toBe(true);
  });

  it('runner main announces readiness only after the team gate, the worker and the start-up re-dispatch', async () => {
    const source = await readFile(resolve('apps/runner/src/main.ts'), 'utf8');
    const gate = source.indexOf('await refusePreviewOutsiderWork('), worker = source.indexOf('await hatchet.worker('),
      start = source.indexOf('worker.start()'), reconcile = source.indexOf('await reconcileRunnerStartupWork('), announce = source.indexOf('announceRunnerReady({');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(worker); expect(worker).toBeLessThan(start); expect(start).toBeLessThan(reconcile); expect(reconcile).toBeLessThan(announce);
    expect(source).not.toContain('process.send(');
  });
});

describe('launch-runner.mjs: start mirrors launch-api.mjs, prepare-only stays the default', () => {
  it('runs the API launcher sequence in the same order for role runner', async () => {
    const code = await readFile(resolve(OPERATOR, 'launch-runner.mjs'), 'utf8');
    const start = code.slice(code.indexOf('export async function launchRunner'));
    const steps = ["prepareLaunch(argv,'runner',import.meta.url)", 'readEnvironmentFile(plan.environment.path,plan.environment)', "narrowEnvironment('runner',configured,runtime,plan.publication,plan)",
      'verify.assertSelectedRunnerConnection(configured,plan.publication)', "refuse('PREVIEW_RUNNER_MAIN_UNBOUND')", 'installNarrowEnvironment(selected.environment)', 'afterRunnerReady(', 'importMain:()=>tsImport(entry,import.meta.url)'];
    const at = steps.map(step => start.indexOf(step));
    expect(at.every(index => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(start).toContain("file.path==='dialectical-engine/apps/runner/src/main.ts'");
    expect(code).toContain("if(argv[0]==='--start')");
    // The prepare-only function starts nothing.
    const prepare = code.slice(code.indexOf('export async function prepareRunner'), code.indexOf('export async function launchRunner'));
    expect(prepare).not.toMatch(/installNarrowEnvironment\(|tsImport\(entry|apps\/runner\/src\/main/);
    expect(prepare).toContain('started:false');
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
  it('every end of a started runner prints one fixed code and exits 1', () => {
    const events: Record<string, (value?: unknown) => void> = {}, written: string[] = [], exits: number[] = [];
    const target = { on: (name: string, handler: () => void) => { events[name] = handler; }, stderr: { write: (text: string) => written.push(text) }, exit: (code: number) => exits.push(code) };
    const stop = launcher.installRunnerFailureCodes(target);
    events.uncaughtException!(new Error('secret text')); events.unhandledRejection!(new Error('secret text')); stop();
    expect(written).toEqual(Array(3).fill('PREVIEW_RUNNER_STOPPED_ON_FAILURE\n'));
    expect(exits).toEqual([1, 1, 1]);
    return readFile(resolve(OPERATOR, 'launch-runner.mjs'), 'utf8').then(code => {
      expect(code.indexOf('const stop=installRunnerFailureCodes();')).toBeLessThan(code.indexOf('started=await launchRunner('));
      expect(code).toContain('await started.running.then(stop,stop);');
    });
  });

  it.each([
    [['--plan', '/opt/debateai-v3-preview/artifacts/x/runner-launch.json'], 'PREVIEW_RUNNER_PREPARATION_REFUSED\n'],
    [['--start', '--plan', '/opt/debateai-v3-preview/artifacts/x/runner-launch.json'], 'PREVIEW_RUNNER_STARTUP_REFUSED\n']
  ])('the executable prints only a code on refusal (%j)', async (argv, expected) => {
    const result = await execute(process.execPath, [resolve(OPERATOR, 'launch-runner.mjs'), ...argv], { cwd: process.cwd(), env: { PATH: process.env.PATH ?? '' } }).then(() => null, (error: { code: number; stdout: string; stderr: string }) => error);
    expect(result).toMatchObject({ code: 1, stdout: '', stderr: expected });
  });
});

describe('runner environment narrowing', () => {
  const approved = { apiPort: '3101', uiPort: '3100', mailExecutable: '/opt/release/mail-handoff.mjs', mailFrom: 'noreply@dezbatere.ro' };
  const preview = JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high', budget_socket: '/run/debateai-v3-preview/team-budget-v2.sock', scope_id: 'preview-team-v2-20261009' });
  const configured = (): Record<string, string> => {
    const { VLLM_BASE_URL: _a, VLLM_MODEL: _b, VLLM_MAKER: _c, ...rest } = validRunnerEnvironmentFixture();
    return { ...rest, NODE_ENV: 'production', REGISTER_VERSION: '12', DEBATEAI_DEPLOYMENT_MODE: 'local', PREVIEW_PROVIDER_TEST_CONFIG_JSON: preview, PREVIEW_TEAM_USER_IDS_JSON: '["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e"]' };
  };
  it('keeps the team list and only source runner keys, with the fixed PATH', () => {
    const result = env.narrowEnvironment('runner', configured(), runtime, { registerVersion: '12' }, approved);
    expect(result.environment.PREVIEW_TEAM_USER_IDS_JSON).toBe('["0b7c6f1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e"]');
    expect(result.environment.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
    expect(result.selectedRegisterVersion).toBe('12');
    expect(Object.keys(result.environment).sort()).toEqual([...Object.keys(configured()), 'PATH'].sort());
  });
  it.each([{ NODE_EXTRA_CA_CERTS: '/etc/ca.crt' }, { NODE_OPTIONS: '--require x' }, { REGISTER_VERSION: '11' }, { DEBATEAI_DEPLOYMENT_MODE: 'hosted' }, { NODE_ENV: 'development' }, { PREVIEW_TEAM_USER_IDS_JSON: '["not-a-uuid"]' }, { TURNSTILE_SOCKET_PATH: '/run/x.sock' }])('refuses %j without emitting values', patch => {
    expect(() => env.narrowEnvironment('runner', { ...configured(), ...patch }, runtime, { registerVersion: '12' }, approved)).toThrow(/^PREVIEW_ENVIRONMENT_REFUSED$/);
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

describe('debateai-preview-runner.service template', () => {
  it('is the confined runner identity with soft ordering on the four supporting units and no fixtures', async () => {
    const unit = parseUnit(await readFile(resolve(OPERATOR, 'debateai-preview-runner.service'), 'utf8'));
    const supporting = ['debateai-preview-postgresql.service', 'debateai-preview-hatchet.service', 'debateai-preview-hatchet-gateway.service', 'debateai-preview-provider-budget.service'];
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
    const unit = parseUnit(await readFile(resolve(OPERATOR, 'debateai-preview-runner.service'), 'utf8'));
    expect(unit['[Service]EnvironmentFile']).toEqual(['']);
    expect(unit['[Service]PassEnvironment']).toEqual(['']);
    expect(unit['[Service]UnsetEnvironment']).toEqual(['', 'LD_LIBRARY_PATH LD_PRELOAD NODE_OPTIONS NODE_PATH']);
    expect(unit['[Service]Environment']).toEqual(['', 'PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=production NODE_EXTRA_CA_CERTS=/etc/debateai-v3-preview/hatchet-tls/ca.crt']);
  });

  it('keeps the API base unit hardening, loopback-only IP and the three deliberate differences', async () => {
    const unit = parseUnit(await readFile(resolve(OPERATOR, 'debateai-preview-runner.service'), 'utf8'));
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
});
