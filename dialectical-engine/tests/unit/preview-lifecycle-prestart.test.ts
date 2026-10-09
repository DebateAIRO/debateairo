import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const prestart = await import('../../deploy/' + 'preview-lifecycle/v1/prestart.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');
const plans = await import('../../deploy/' + 'preview-auth-dev/v1/launch-plan.mjs');

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const me = { uid: process.getuid!(), gid: process.getgid!() };
const digest = 'a'.repeat(64), revision = 'a'.repeat(40), tree = 'b'.repeat(40);
const publication = { publicationId: '11111111-1111-4111-8111-111111111111', publicationKind: 'GENERAL', baseRegisterVersion: '8', registerVersion: '12', requestSha256: digest, snapshotSha256: digest, rowCount: 68, recordedAt: '2026-10-06T12:00:00.000Z' };
const root = '/opt/debateai-v3-preview/releases/auth-dev-candidate-v1';
const basePlan = (service: 'api' | 'ui') => ({
  schema: 'preview-auth-dev-launch-v1', service, artifact: 'candidate', sourceRoot: root, sourceRevision: revision, sourceTree: tree,
  serviceUid: service === 'api' ? 1001 : 1002, serviceGid: service === 'api' ? 1001 : 1002,
  sourceManifest: { path: '/opt/debateai-v3-preview/artifacts/v1/source.json', sha256: 'c'.repeat(64) },
  nativeAttestation: { path: '/opt/debateai-v3-preview/artifacts/v1/native.json', sha256: 'd'.repeat(64) },
  uiBuild: service === 'ui' ? { path: '/opt/debateai-v3-preview/artifacts/v1/ui-build.json', sha256: 'e'.repeat(64) } : null,
  publication, operatorManifestSha256: 'f'.repeat(64),
  environment: { path: `/etc/debateai-v3-preview/auth-dev-v1/${service}.env`, root: '/etc/debateai-v3-preview/auth-dev-v1', uid: 0, gid: service === 'api' ? 1001 : 1002, mode: 0o640, parentUid: 0 },
  apiPort: '3101', uiPort: '3100', mailExecutable: `${root}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs`, mailFrom: 'noreply@dezbatere.ro'
});
const nativePlan = (patch: Record<string, unknown> = {}) => ({
  schema: 'preview-auth-dev-native-plan-v1', operation: 'verify', sourceRoot: root, sourceRevision: revision, sourceTree: tree,
  sourceManifest: { path: '/opt/debateai-v3-preview/artifacts/v1/source.json', sha256: 'c'.repeat(64) }, operatorManifestSha256: 'f'.repeat(64),
  selectedBaseRegisterVersion: '8', selectedBaseSnapshotSha256: digest, publicationId: publication.publicationId,
  approval: { runtimeObservedAt: '2026-10-06T11:00:00.000Z', baseRegisterVersion: '8', baseSnapshotSha256: digest, snapshotSha256: digest, deltaSha256: digest, publication }, ...patch
});
const attestation = (verifiedAt: string, patch: Record<string, unknown> = {}) => ({
  schema: 'preview-auth-dev-native-v1', sourceRevision: revision, sourceTree: tree, nativeSourceSha256: '9'.repeat(64), verifiedAt, postgresMajor: 18,
  executorRole: 'debateai_prod_migrator', executorOid: 16388, ledgerOwnerOid: 16388, billingOwnerOid: 16388, defaultOwnerCount: 6, ledgerCount: 128,
  resolutionCount: 1, forwardCount: 1, catalogSha256: digest, ledgerSha256: digest, resolutionSha256: digest, forwardSha256: digest, cohortCount: 0,
  capabilityCounts: { debateai_runtime: 10 }, currentContractVerified: true, publication, ...patch
});

/** A throwaway copy of the server layout, owned by the test user instead of root. */
function server() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-prestart-')));
  const layout = {
    ...common.LAYOUT, ownerUid: me.uid, ownerGid: me.gid,
    artifactsRoot: join(base, 'artifacts'), lockRoot: join(base, 'lifecycle'), lockPath: join(base, 'lifecycle', 'release-lock.json'),
    nativePlanRoot: join(base, 'auth-dev-v1'), nativePlanPath: join(base, 'auth-dev-v1', 'native-plan.json'), currentDir: join(base, 'artifacts', 'lifecycle-current')
  };
  for (const dir of [layout.artifactsRoot, join(layout.artifactsRoot, 'release-1'), layout.nativePlanRoot]) { mkdirSync(dir, { recursive: true }); chmodSync(dir, 0o755); }
  const write = (path: string, value: unknown, mode = 0o644) => { const bytes = typeof value === 'string' ? value : JSON.stringify(value); writeFileSync(path, bytes); chmodSync(path, mode); return sha(bytes); };
  for (const service of ['api', 'ui'] as const) write(join(layout.artifactsRoot, 'release-1', `${service}-launch.json`), basePlan(service));
  write(layout.nativePlanPath, nativePlan());
  return { base, layout, write, planPath: (service: string) => join(layout.artifactsRoot, 'release-1', `${service}-launch.json`) };
}
// Codex's validator only admits the real /opt artifact folder; map the throwaway folder back to it.
const realValidator = (layout: { currentDir: string }) => (plan: { nativeAttestation: { path: string } }) =>
  plans.validateLaunchPlan({ ...plan, nativeAttestation: { ...plan.nativeAttestation, path: plan.nativeAttestation.path.replace(layout.currentDir, '/opt/debateai-v3-preview/artifacts/lifecycle-current') } });

async function pinned(s: ReturnType<typeof server>, now = Date.parse('2026-10-09T10:00:00Z')) {
  for (const service of ['api', 'ui']) await prestart.pinRelease({ planPath: s.planPath(service), layout: s.layout, deps: { validateLaunchPlan: plans.validateLaunchPlan }, now: () => now });
  return JSON.parse(readFileSync(s.layout.lockPath, 'utf8'));
}
function deps(s: ReturnType<typeof server>, overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  let clock = Date.parse('2026-10-09T10:00:00Z');
  return {
    calls,
    deps: {
      validateLaunchPlan: realValidator(s.layout),
      readSourceNativeSha256: async () => '9'.repeat(64),
      verifyNative: async ({ sourceRoot }: { sourceRoot: string }) => { calls.push(sourceRoot); clock += 12000; return attestation(new Date(clock).toISOString()); },
      now: () => clock,
      ...overrides
    }
  };
}

describe('release lock', () => {
  it('pins api and ui from reviewed plans into one strict root-pinned lock', async () => {
    const s = server();
    const lock = await pinned(s);
    expect(Object.keys(lock)).toEqual(['schema', 'services']);
    expect(lock.schema).toBe('preview-lifecycle-release-lock-v1');
    expect(lock.services.api).toMatchObject({ basePlan: { path: s.planPath('api'), sha256: sha(readFileSync(s.planPath('api'))) }, sourceManifestSha256: 'c'.repeat(64), uiBuildSha256: null, operatorManifestSha256: 'f'.repeat(64), publication, nativePlanSha256: sha(readFileSync(s.layout.nativePlanPath)) });
    expect(lock.services.ui.uiBuildSha256).toBe('e'.repeat(64));
    expect(statSync(s.layout.lockPath).mode & 0o777).toBe(0o644);
    expect(prestart.validateReleaseLock(lock, s.layout)).toEqual(lock);
  });

  it.each([
    ['unknown top-level key', (l: any) => { l.extra = 1; }],
    ['unknown service', (l: any) => { l.services.runner = l.services.api; }],
    ['unknown entry key', (l: any) => { l.services.api.note = 'x'; }],
    ['short sha', (l: any) => { l.services.api.sourceManifestSha256 = 'abc'; }],
    ['ui build on api', (l: any) => { l.services.api.uiBuildSha256 = digest; }],
    ['ui without build', (l: any) => { l.services.ui.uiBuildSha256 = null; }],
    ['plan outside artifacts', (l: any) => { l.services.api.basePlan.path = '/tmp/api-launch.json'; }],
    ['bad publication', (l: any) => { l.services.api.publication = { ...publication, publicationKind: 'OTHER' }; }],
    ['wrong schema', (l: any) => { l.schema = 'preview-lifecycle-release-lock-v0'; }]
  ])('rejects a lock with %s', async (_name, mutate) => {
    const s = server();
    const lock = await pinned(s);
    mutate(lock);
    expect(() => prestart.validateReleaseLock(lock, s.layout)).toThrow(/RELEASE_LOCK_INVALID/);
  });

  it('refuses to pin a plan whose publication differs from the reviewed verify-only native plan', async () => {
    const s = server();
    s.write(s.layout.nativePlanPath, nativePlan({ approval: { ...nativePlan().approval, publication: { ...publication, registerVersion: '13' } } }));
    await expect(prestart.pinRelease({ planPath: s.planPath('api'), layout: s.layout, deps: { validateLaunchPlan: plans.validateLaunchPlan }, now: () => 0 })).rejects.toThrow(/NATIVE_PLAN_MISMATCH/);
    expect(existsSync(s.layout.lockPath)).toBe(false);
  });

  it('refuses to pin against a native plan that would apply or publish instead of verify', async () => {
    const s = server();
    s.write(s.layout.nativePlanPath, nativePlan({ operation: 'publish' }));
    await expect(prestart.pinRelease({ planPath: s.planPath('api'), layout: s.layout, deps: { validateLaunchPlan: plans.validateLaunchPlan }, now: () => 0 })).rejects.toMatchObject({ code: 'NATIVE_PLAN_MISMATCH', fields: ['operation'] });
  });

  it('refuses to pin the regenerated lifecycle plan itself', async () => {
    const s = server();
    mkdirSync(s.layout.currentDir); chmodSync(s.layout.currentDir, 0o755);
    s.write(join(s.layout.currentDir, 'api-launch.json'), basePlan('api'));
    await expect(prestart.pinRelease({ planPath: join(s.layout.currentDir, 'api-launch.json'), layout: s.layout, deps: { validateLaunchPlan: plans.validateLaunchPlan }, now: () => 0 })).rejects.toThrow(/PIN_SOURCE_REFUSED/);
  });
});

describe('prestart', () => {
  it('runs the canonical verifier, then atomically writes a fresh attestation and a regenerated plan with root modes', async () => {
    const s = server();
    await pinned(s);
    const { calls, deps: d } = deps(s);
    const result = await prestart.runPrestart({ service: 'ui', layout: s.layout, deps: d });
    expect(calls).toEqual([root]);
    expect(readdirSync(s.layout.currentDir).sort()).toEqual(['ui-launch.json', 'ui-native.json']);
    const nativeBytes = readFileSync(join(s.layout.currentDir, 'ui-native.json'));
    const plan = JSON.parse(readFileSync(join(s.layout.currentDir, 'ui-launch.json'), 'utf8'));
    expect(plan).toEqual({ ...basePlan('ui'), nativeAttestation: { path: join(s.layout.currentDir, 'ui-native.json'), sha256: sha(nativeBytes) } });
    for (const name of ['ui-launch.json', 'ui-native.json']) expect(statSync(join(s.layout.currentDir, name)).mode & 0o777).toBe(0o644);
    expect(statSync(s.layout.currentDir).mode & 0o777).toBe(0o755);
    expect(result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_PRESTART_READY', service: 'ui', registerVersion: '12', attestationAgeMs: 0, verifyMs: 12000 });
  });

  it.each([
    ['sourceManifestSha256', (e: any) => { e.sourceManifestSha256 = '1'.repeat(64); }],
    ['uiBuildSha256', (e: any) => { e.uiBuildSha256 = '2'.repeat(64); }],
    ['operatorManifestSha256', (e: any) => { e.operatorManifestSha256 = '3'.repeat(64); }],
    ['publication', (e: any) => { e.publication = { ...publication, requestSha256: '4'.repeat(64) }; }],
    ['sourceRevision', (e: any) => { e.sourceRevision = '5'.repeat(40); }]
  ])('refuses before any database work when the plan disagrees with the lock on %s', async (field, mutate) => {
    const s = server();
    const lock = await pinned(s);
    mutate(lock.services.ui);
    s.write(s.layout.lockPath, lock);
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'ui', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'RELEASE_LOCK_MISMATCH', fields: expect.arrayContaining([field]) });
    expect(calls).toEqual([]);
    expect(existsSync(s.layout.currentDir)).toBe(false);
  });

  it('refuses when the pinned base plan bytes changed after pinning', async () => {
    const s = server();
    await pinned(s);
    s.write(s.planPath('api'), { ...basePlan('api'), serviceUid: 1003 });
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'api', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'BASE_PLAN_HASH_MISMATCH' });
    expect(calls).toEqual([]);
  });

  it('never runs a native plan that is not the pinned verify-only plan', async () => {
    const s = server();
    await pinned(s);
    s.write(s.layout.nativePlanPath, nativePlan({ operation: 'apply-and-plan' }));
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'api', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'NATIVE_PLAN_HASH_MISMATCH' });
    expect(calls).toEqual([]);
  });

  it('keeps the previous files and refuses when the canonical verifier refuses (tampered release)', async () => {
    const s = server();
    await pinned(s);
    const { deps: d } = deps(s);
    await prestart.runPrestart({ service: 'api', layout: s.layout, deps: d });
    const before = readFileSync(join(s.layout.currentDir, 'api-launch.json'));
    const tampered = deps(s, { verifyNative: async () => { throw Object.assign(new Error('NATIVE_VERIFY_REFUSED'), { code: 'NATIVE_VERIFY_REFUSED' }); } });
    await expect(prestart.runPrestart({ service: 'api', layout: s.layout, deps: tampered.deps })).rejects.toMatchObject({ code: 'NATIVE_VERIFY_REFUSED' });
    expect(readFileSync(join(s.layout.currentDir, 'api-launch.json'))).toEqual(before);
  });

  it.each([
    ['another publication', { publication: { ...publication, registerVersion: '13' } }],
    ['another native source', { nativeSourceSha256: '8'.repeat(64) }],
    ['a wrong executor', { executorRole: 'postgres' }]
  ])('refuses an attestation for %s', async (_name, patch) => {
    const s = server();
    await pinned(s);
    const { deps: d } = deps(s, { verifyNative: async () => attestation('2026-10-09T10:00:00.000Z', patch) });
    await expect(prestart.runPrestart({ service: 'api', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'NATIVE_ATTESTATION_INVALID' });
    expect(existsSync(join(s.layout.currentDir, 'api-launch.json'))).toBe(false);
  });

  it('refuses when the proof is already too old to survive the launcher re-hash', async () => {
    const s = server();
    await pinned(s);
    let clock = Date.parse('2026-10-09T10:00:00Z');
    const { deps: d } = deps(s, { now: () => clock, verifyNative: async () => { const verifiedAt = new Date(clock).toISOString(); clock += 61000; return attestation(verifiedAt); } });
    await expect(prestart.runPrestart({ service: 'api', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'ATTESTATION_TOO_OLD' });
  });

  it.each([
    ['a symlinked lock', (s: ReturnType<typeof server>) => { const real = join(s.base, 'elsewhere.json'); writeFileSync(real, readFileSync(s.layout.lockPath)); chmodSync(real, 0o644); rmSync(s.layout.lockPath); symlinkSync(real, s.layout.lockPath); }],
    ['a group-writable lock', (s: ReturnType<typeof server>) => chmodSync(s.layout.lockPath, 0o664)],
    ['a lock with an unknown key', (s: ReturnType<typeof server>) => { const lock = JSON.parse(readFileSync(s.layout.lockPath, 'utf8')); lock.services.api.extra = true; s.write(s.layout.lockPath, lock); }],
    ['a lock with a duplicated key', (s: ReturnType<typeof server>) => s.write(s.layout.lockPath, readFileSync(s.layout.lockPath, 'utf8').replace('{"schema":', '{"schema":"x","schema":'))]
  ])('refuses %s', async (_name, damage) => {
    const s = server();
    await pinned(s);
    damage(s);
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'api', layout: s.layout, deps: d })).rejects.toMatchObject({ code: expect.stringMatching(/^RELEASE_LOCK_(UNREADABLE|INVALID)$/) });
    expect(calls).toEqual([]);
  });
});

describe('canonical native verifier invocation', () => {
  it('runs the release native-operator as postgres over the FD3 peer pipe with the exact minimal environment', async () => {
    const seen: any[] = [];
    const run = async (argv: string[], options: any) => { seen.push({ argv, options }); return { code: 0, timedOut: false, overflow: false, stdout: Buffer.from(JSON.stringify({ ok: true }) + '\n'), stderr: Buffer.alloc(0) }; };
    const value = await prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, run, timeoutMs: 150000 });
    expect(value).toEqual({ ok: true });
    expect(seen[0].argv).toEqual(['/bin/sh', '-c', common.PEER_SHIM_SCRIPT, 'sh', common.LAYOUT.peerPacket,
      '/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/env', '-i', 'PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC',
      '/opt/node/bin/node', `${root}/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs`, '--credential-fd', '3']);
    expect(seen[0].options).toMatchObject({ cwd: `${root}/dialectical-engine`, env: {}, timeoutMs: 150000 });
  });

  it.each([
    ['a non-zero exit', { code: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('PREVIEW_NATIVE_OPERATION_REFUSED\n') }, 'NATIVE_VERIFY_REFUSED'],
    ['any stderr', { code: 0, stdout: Buffer.from('{}'), stderr: Buffer.from('warning') }, 'NATIVE_VERIFY_REFUSED'],
    ['a timeout', { code: null, timedOut: true, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }, 'NATIVE_VERIFY_TIMEOUT'],
    ['ambiguous JSON', { code: 0, stdout: Buffer.from('{"a":1,"a":2}'), stderr: Buffer.alloc(0) }, 'NATIVE_VERIFY_REFUSED']
  ])('refuses %s', async (_name, outcome, code) => {
    const run = async () => ({ timedOut: false, overflow: false, ...outcome });
    await expect(prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, run, timeoutMs: 1000 })).rejects.toMatchObject({ code });
  });

  it('refuses a source root outside the reviewed release folders', async () => {
    await expect(prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: '/tmp/x', run: async () => { throw new Error('ran'); }, timeoutMs: 1000 })).rejects.toMatchObject({ code: 'NATIVE_VERIFY_REFUSED' });
  });
});

describe('release drop-in', () => {
  it('renders a later-sorting drop-in that resets ExecStart and launches from the fixed plan', async () => {
    const s = server();
    const lock = await pinned(s);
    const text = prestart.renderReleaseDropin({ service: 'api', entry: lock.services.api, lockSha256: digest, nodePath: '/opt/node/bin/node', prestartPath: '/opt/op/prestart.mjs', layout: common.LAYOUT });
    const lines = text.split('\n').filter((line: string) => !line.startsWith('#') && line);
    expect(lines).toEqual(['[Service]', `WorkingDirectory=${root}/dialectical-engine`, 'ExecStartPre=+/opt/node/bin/node /opt/op/prestart.mjs --service api', 'ExecStart=',
      `ExecStart=/opt/node/bin/node ${root}/dialectical-engine/deploy/preview-auth-dev/v1/launch-api.mjs --plan /opt/debateai-v3-preview/artifacts/lifecycle-current/api-launch.json`]);
    expect(prestart.RELEASE_DROPIN_NAME > 'zzzzzzzzz-auth-dev-task12-final.conf').toBe(true);
    const ui = prestart.renderReleaseDropin({ service: 'ui', entry: lock.services.ui, lockSha256: digest, nodePath: '/opt/node/bin/node', prestartPath: '/opt/op/prestart.mjs', layout: common.LAYOUT });
    expect(ui).toContain(`WorkingDirectory=${root}/dialectical-engine/apps/ui\n`);
    expect(ui).toContain('launch-ui.mjs --plan /opt/debateai-v3-preview/artifacts/lifecycle-current/ui-launch.json');
  });
});
