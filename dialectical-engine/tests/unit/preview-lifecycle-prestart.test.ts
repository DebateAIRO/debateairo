import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const prestart = await import('../../deploy/' + 'preview-lifecycle/v1/prestart.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');
const plans = await import('../../deploy/' + 'preview-auth-dev/v1/launch-plan.mjs');
const environment = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');

type Service = 'api' | 'ui' | 'runner';
type Release = { label: string; revision: string; slot: 'A' | 'B' };
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const me = { uid: process.getuid!(), gid: process.getgid!() };
const digest = 'a'.repeat(64), revision = 'a'.repeat(40), tree = 'b'.repeat(40);
const NEW_REV = '0123456789abcdef'.repeat(2) + '01234567';
const publication = { publicationId: '11111111-1111-4111-8111-111111111111', publicationKind: 'GENERAL', baseRegisterVersion: '8', registerVersion: '12', requestSha256: digest, snapshotSha256: digest, rowCount: 68, recordedAt: '2026-10-06T12:00:00.000Z' };
// Side-by-side spec §10: one label per release; the existing models run on label `v1` in slot A.
const V1: Release = { label: 'v1', revision, slot: 'A' };
const OLD: Release = { label: 'old-v1', revision, slot: 'A' };
const NEW: Release = { label: 'new-v1', revision: NEW_REV, slot: 'B' };
const PORTS = { A: { uiPort: '3100', apiPort: '3101' }, B: { uiPort: '3200', apiPort: '3201' } } as const;
const keyOf = (r: Release) => `r12-${r.revision.slice(0, 12)}`;
// Release roots end in their service and each service reads its own release's env file (side-by-side spec §10);
// `root` is the API's folder, where the native operator lives.
const rootOf = (service: Service, label = 'v1') => `/opt/debateai-v3-preview/releases/auth-dev-candidate-${label}-${service}`;
const root = rootOf('api');
const envOf = (service: Service, label = 'v1') => `/etc/debateai-v3-preview/auth-dev-v1/${service}-${label}.env`;
const basePlan = (service: 'api' | 'ui', r: Release = V1) => ({
  schema: 'preview-auth-dev-launch-v1', service, artifact: 'candidate', sourceRoot: rootOf(service, r.label), sourceRevision: r.revision, sourceTree: tree,
  serviceUid: service === 'api' ? 1001 : 1002, serviceGid: service === 'api' ? 1001 : 1002,
  sourceManifest: { path: '/opt/debateai-v3-preview/artifacts/v1/source.json', sha256: 'c'.repeat(64) },
  nativeAttestation: { path: '/opt/debateai-v3-preview/artifacts/v1/native.json', sha256: 'd'.repeat(64) },
  uiBuild: service === 'ui' ? { path: '/opt/debateai-v3-preview/artifacts/v1/ui-build.json', sha256: 'e'.repeat(64) } : null,
  publication, operatorManifestSha256: 'f'.repeat(64),
  environment: { path: envOf(service, r.label), root: '/etc/debateai-v3-preview/auth-dev-v1', uid: 0, gid: service === 'api' ? 1001 : 1002, mode: 0o640, parentUid: 0 },
  ...PORTS[r.slot], mailExecutable: `${rootOf(service, r.label)}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs`, mailFrom: 'noreply@dezbatere.ro'
});
// GAP-RUNNER (2026-10-09): the runner is pinned and refreshed exactly like the API.
const runnerPlan = (r: Release = V1) => ({ ...basePlan('api', r), service: 'runner', serviceUid: 992, serviceGid: 975, sourceRoot: rootOf('runner', r.label),
  mailExecutable: `${rootOf('runner', r.label)}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs`, environment: { ...basePlan('api', r).environment, path: envOf('runner', r.label), gid: 975 } });
const nativePlan = (patch: Record<string, unknown> = {}, r: Release = V1) => ({
  schema: 'preview-auth-dev-native-plan-v1', operation: 'verify', sourceRoot: rootOf('api', r.label), sourceRevision: r.revision, sourceTree: tree,
  sourceManifest: { path: '/opt/debateai-v3-preview/artifacts/v1/source.json', sha256: 'c'.repeat(64) }, operatorManifestSha256: 'f'.repeat(64),
  selectedBaseRegisterVersion: '8', selectedBaseSnapshotSha256: digest, publicationId: publication.publicationId,
  approval: { runtimeObservedAt: '2026-10-06T11:00:00.000Z', baseRegisterVersion: '8', baseSnapshotSha256: digest, snapshotSha256: digest, deltaSha256: digest, publication }, ...patch
});
const attestation = (verifiedAt: string, patch: Record<string, unknown> = {}) => ({
  schema: 'preview-auth-dev-native-v1', sourceRevision: revision, sourceTree: tree, nativeSourceSha256: '9'.repeat(64), verifiedAt, postgresMajor: 18,
  executorRole: 'debateai_prod_migrator', executorOid: 16388, ledgerOwnerOid: 16388, billingOwnerOid: 16388, defaultOwnerCount: 6, ledgerCount: 128,
  resolutionCount: 1, forwardCount: 1, catalogSha256: digest, ledgerSha256: digest, resolutionSha256: digest, forwardSha256: digest, cohortCount: 0,
  capabilityCounts: { debateai_runtime: 10 }, currentContractVerified: true, publication, databaseAhead: null, ...patch
});

/** A throwaway copy of the server layout, owned by the test user instead of root; `releases` get their plans and native plan. */
function server(releases: Release[] = [V1]) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-prestart-')));
  const layout = {
    ...common.LAYOUT, ownerUid: me.uid, ownerGid: me.gid,
    artifactsRoot: join(base, 'artifacts'), lockRoot: join(base, 'lifecycle'), lockPath: join(base, 'lifecycle', 'release-lock.json'), nativePlanRoot: join(base, 'auth-dev-v1')
  };
  const write = (path: string, value: unknown, mode = 0o644) => { const bytes = typeof value === 'string' ? value : JSON.stringify(value); writeFileSync(path, bytes); chmodSync(path, mode); return sha(bytes); };
  const planPath = (service: string, label = 'v1') => join(layout.artifactsRoot, `release-${label}`, `${service}-launch.json`);
  const nativePlanPath = (label = 'v1') => common.nativePlanPathFor(layout, label);
  const currentDir = (label = 'v1') => common.currentDirFor(layout, label);
  for (const dir of [layout.artifactsRoot, layout.nativePlanRoot]) { mkdirSync(dir, { recursive: true }); chmodSync(dir, 0o755); }
  const release = (r: Release) => {
    mkdirSync(join(layout.artifactsRoot, `release-${r.label}`)); chmodSync(join(layout.artifactsRoot, `release-${r.label}`), 0o755);
    for (const service of ['api', 'ui'] as const) write(planPath(service, r.label), basePlan(service, r));
    write(planPath('runner', r.label), runnerPlan(r));
    write(nativePlanPath(r.label), nativePlan({}, r));
  };
  for (const r of releases) release(r);
  const readLock = () => JSON.parse(readFileSync(layout.lockPath, 'utf8'));
  return { base, layout, write, release, planPath, nativePlanPath, currentDir, readLock };
}
type Server = ReturnType<typeof server>;
// Codex's validator only admits the real /opt artifact folder; map the throwaway folder back to it.
const realValidator = (layout: { artifactsRoot: string }) => (plan: { nativeAttestation: { path: string } }) =>
  plans.validateLaunchPlan({ ...plan, nativeAttestation: { ...plan.nativeAttestation, path: plan.nativeAttestation.path.replace(layout.artifactsRoot, '/opt/debateai-v3-preview/artifacts') } });

const pin = (s: Server, service: Service, r: Release = V1, now = Date.parse('2026-10-09T10:00:00Z')) =>
  prestart.pinRelease({ planPath: s.planPath(service, r.label), layout: s.layout, deps: { validateLaunchPlan: plans.validateLaunchPlan }, now: () => now });
async function pinned(s: Server, r: Release = V1, services: Service[] = ['api', 'ui']) {
  for (const service of services) await pin(s, service, r);
  return s.readLock();
}
const state = (value: string) => async () => ({ state: value, frontPairStopped: false, retireRequested: false });
function deps(s: Server, overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  let clock = Date.parse('2026-10-09T10:00:00Z');
  return {
    calls,
    deps: {
      validateLaunchPlan: realValidator(s.layout),
      readSourceNativeSha256: async () => '9'.repeat(64),
      waitForPostgres: async () => ({ waitedMs: 0, attempts: 1 }),
      verifyNative: async ({ sourceRoot }: { sourceRoot: string }) => { calls.push(sourceRoot); clock += 12000; return attestation(new Date(clock).toISOString()); },
      checkRunnerUnit: async () => undefined,
      checkFrontUnit: async () => undefined,
      readReleaseState: state('CURRENT'),
      isActive: async () => false,
      now: () => clock,
      ...overrides
    }
  };
}

describe('per-release paths (side-by-side spec §10)', () => {
  it('derives every per-release file, folder and unit from the label', () => {
    const layout = common.LAYOUT;
    expect(common.nativePlanPathFor(layout, 'v1')).toBe('/etc/debateai-v3-preview/auth-dev-v1/native-plan-v1.json');
    expect(common.currentDirFor(layout, 'v1')).toBe('/opt/debateai-v3-preview/artifacts/lifecycle-current-v1');
    expect(common.databaseAheadPathFor(layout, 'v1')).toBe('/etc/debateai-v3-preview/auth-dev-v1/database-ahead-v1.json');
    expect(common.envPathFor(layout, 'runner', 'v1')).toBe('/etc/debateai-v3-preview/auth-dev-v1/runner-v1.env');
    expect(common.unitNameFor(layout, 'ui', 'd50e33165-r19-v1')).toBe('debateai-preview-ui@d50e33165-r19-v1.service');
    expect(Object.keys(layout)).not.toContain('currentDir');
    expect(Object.keys(layout)).not.toContain('nativePlanPath');
  });
  it.each(['../x', 'V1', 'v1-', '', 'a/b'])('refuses the label %j before naming any path', label => {
    for (const make of [() => common.nativePlanPathFor(common.LAYOUT, label), () => common.currentDirFor(common.LAYOUT, label), () => common.databaseAheadPathFor(common.LAYOUT, label),
      () => common.envPathFor(common.LAYOUT, 'api', label), () => common.unitNameFor(common.LAYOUT, 'api', label)]) expect(make).toThrow(/LIFECYCLE_LABEL_REFUSED/);
    expect(() => common.unitNameFor(common.LAYOUT, 'worker', 'v1')).toThrow(/LIFECYCLE_SERVICE_REFUSED/);
    expect(() => common.envPathFor(common.LAYOUT, '../api', 'v1')).toThrow(/LIFECYCLE_SERVICE_REFUSED/);
  });
  it('keeps the same release label rule as the launch plan', () => {
    expect(common.RELEASE_LABEL.source).toBe(plans.RELEASE_LABEL.source);
    expect(common.RELEASE_LABEL.flags).toBe(plans.RELEASE_LABEL.flags);
  });
});

describe('release lock v2', () => {
  it('pins api and ui from reviewed plans into one strict root-pinned lock, one entry per service per release', async () => {
    const s = server();
    const lock = await pinned(s);
    expect(Object.keys(lock)).toEqual(['schema', 'releases']);
    expect(lock.schema).toBe('preview-lifecycle-release-lock-v2');
    expect(Object.keys(lock.releases)).toEqual(['v1']);
    expect(lock.releases.v1).toMatchObject({ releaseKey: 'r12-aaaaaaaaaaaa', slot: 'A', databaseAhead: null });
    expect(Object.keys(lock.releases.v1)).toEqual(['releaseKey', 'slot', 'databaseAhead', 'services']);
    expect(lock.releases.v1.services.api).toMatchObject({ basePlan: { path: s.planPath('api'), sha256: sha(readFileSync(s.planPath('api'))) }, sourceManifestSha256: 'c'.repeat(64), uiBuildSha256: null, operatorManifestSha256: 'f'.repeat(64), publication, nativePlanSha256: sha(readFileSync(s.nativePlanPath())) });
    expect(lock.releases.v1.services.ui.uiBuildSha256).toBe('e'.repeat(64));
    expect(statSync(s.layout.lockPath).mode & 0o777).toBe(0o644);
    expect(prestart.validateReleaseLock(lock, s.layout)).toEqual(lock);
    expect(lock.releases.v1.releaseKey).toBe(environment.expectedReleaseKey(publication, revision));
  });

  it("pins two releases side by side: a pin adds its own label and never replaces another's", async () => {
    const s = server([OLD, NEW]);
    await pinned(s, OLD, ['api', 'ui', 'runner']);
    const before = s.readLock();
    await pin(s, 'api', NEW);
    const lock = s.readLock();
    expect(Object.keys(lock.releases).sort()).toEqual(['new-v1', 'old-v1']);
    expect(lock.releases['old-v1']).toEqual(before.releases['old-v1']);
    expect(lock.releases['new-v1']).toMatchObject({ releaseKey: 'r12-' + NEW_REV.slice(0, 12), slot: 'B', databaseAhead: null });
    expect(Object.keys(lock.releases['new-v1'].services)).toEqual(['api']);
    // A second pin of the same release adds its own service and keeps the release's key and slot.
    await pin(s, 'ui', NEW);
    const after = s.readLock();
    expect(after.releases['old-v1']).toEqual(before.releases['old-v1']);
    expect(Object.keys(after.releases['new-v1'].services)).toEqual(['api', 'ui']);
    expect(after.releases['new-v1'].services.api).toEqual(lock.releases['new-v1'].services.api);
  });

  it("refuses to pin a service whose slot or revision is not the rest of its release's", async () => {
    const s = server([NEW]);
    await pin(s, 'api', NEW);
    const before = readFileSync(s.layout.lockPath);
    s.write(s.planPath('ui', NEW.label), { ...basePlan('ui', NEW), ...PORTS.A });
    await expect(pin(s, 'ui', NEW)).rejects.toMatchObject({ code: 'PIN_RELEASE_CONFLICT', fields: ['slot'] });
    expect(readFileSync(s.layout.lockPath)).toEqual(before);
  });

  it('refuses to pin into a v1 lock (the transition moves it aside first)', async () => {
    const s = server();
    const v1 = { schema: 'preview-lifecycle-release-lock-v1', services: { api: (await pinned(s)).releases.v1.services.api } };
    s.write(s.layout.lockPath, v1);
    const bytes = readFileSync(s.layout.lockPath);
    await expect(pin(s, 'ui')).rejects.toMatchObject({ code: 'RELEASE_LOCK_INVALID' });
    expect(readFileSync(s.layout.lockPath)).toEqual(bytes);
  });

  it.each([
    ['entry of another label', (l: any) => { l.releases.v2 = l.releases.v1; delete l.releases.v1; }],
    ['release key not of its publication', (l: any) => { l.releases.v1.releaseKey = 'r13-aaaaaaaaaaaa'; }],
    ['two revisions in one release', (l: any) => { l.releases.v1.services.ui.sourceRevision = 'c'.repeat(40); }],
    ['two publications in one release', (l: any) => { l.releases.v1.services.ui.publication = { ...publication, requestSha256: '4'.repeat(64) }; }],
    ['schema v1', (l: any) => { l.schema = 'preview-lifecycle-release-lock-v1'; l.services = l.releases.v1.services; delete l.releases; }],
    ['a label that is not a release label', (l: any) => { l.releases.V1 = l.releases.v1; delete l.releases.v1; }],
    ['a slot other than A or B', (l: any) => { l.releases.v1.slot = 'C'; }],
    ['no release', (l: any) => { l.releases = {}; }],
    ['a release without services', (l: any) => { l.releases.v1.services = {}; }],
    ['a database-ahead file of another label', (l: any) => { l.releases.v1.databaseAhead = { path: l.releases.v1.services.api.basePlan.path, sha256: digest, newerLabel: 'v2' }; }],
    ['a database-ahead record naming itself as newer', (l: any) => { l.releases.v1.databaseAhead = { path: '__AHEAD__', sha256: digest, newerLabel: 'v1' }; }],
    ['a base plan under a lifecycle-current folder', (l: any) => { l.releases.v1.services.api.basePlan.path = l.releases.v1.services.api.basePlan.path.replace('release-v1', 'lifecycle-current-v1'); }],
    ['unknown top-level key', (l: any) => { l.extra = 1; }],
    ['unknown release key', (l: any) => { l.releases.v1.note = 'x'; }],
    ['unknown service', (l: any) => { l.releases.v1.services.worker = l.releases.v1.services.api; }],
    ['ui build on runner', (l: any) => { l.releases.v1.services.runner = { ...l.releases.v1.services.api, basePlan: { ...l.releases.v1.services.api.basePlan, path: l.releases.v1.services.api.basePlan.path.replace('api-launch', 'runner-launch') }, sourceRoot: rootOf('runner'), uiBuildSha256: digest }; }],
    ['runner under another service name', (l: any) => { l.releases.v1.services.api.basePlan.path = l.releases.v1.services.api.basePlan.path.replace('api-launch', 'runner-launch'); }],
    ['unknown entry key', (l: any) => { l.releases.v1.services.api.note = 'x'; }],
    ['short sha', (l: any) => { l.releases.v1.services.api.sourceManifestSha256 = 'abc'; }],
    ['ui build on api', (l: any) => { l.releases.v1.services.api.uiBuildSha256 = digest; }],
    ['ui without build', (l: any) => { l.releases.v1.services.ui.uiBuildSha256 = null; }],
    ['plan outside artifacts', (l: any) => { l.releases.v1.services.api.basePlan.path = '/tmp/api-launch.json'; }],
    ['bad publication', (l: any) => { for (const service of ['api', 'ui']) l.releases.v1.services[service].publication = { ...publication, publicationKind: 'OTHER' }; }],
    ['wrong schema', (l: any) => { l.schema = 'preview-lifecycle-release-lock-v0'; }]
  ])('refuses a lock with %s', async (_name, mutate) => {
    const s = server();
    const lock = await pinned(s);
    mutate(lock);
    if (lock.releases?.v1?.databaseAhead?.path === '__AHEAD__') lock.releases.v1.databaseAhead.path = common.databaseAheadPathFor(s.layout, 'v1');
    expect(() => prestart.validateReleaseLock(lock, s.layout)).toThrow(/RELEASE_LOCK_INVALID/);
  });

  it('holds up to four releases and refuses a fifth', async () => {
    const s = server();
    const lock = await pinned(s);
    // Another release: its own label in every folder name, its own revision, so its own key.
    const as = (label: string, rev: string) => {
      const copy = structuredClone(lock.releases.v1);
      for (const entry of Object.values(copy.services) as any[]) { entry.sourceRoot = entry.sourceRoot.replace('-candidate-v1-', `-candidate-${label}-`); entry.sourceRevision = rev; }
      copy.releaseKey = `r12-${rev.slice(0, 12)}`;
      return copy;
    };
    for (const n of [2, 3, 4]) lock.releases[`v${n}`] = as(`v${n}`, String(n).repeat(40));
    expect(prestart.validateReleaseLock(lock, s.layout)).toEqual(lock);
    lock.releases.v5 = as('v5', '5'.repeat(40));
    expect(() => prestart.validateReleaseLock(lock, s.layout)).toThrow(/RELEASE_LOCK_INVALID/);
  });

  it('refuses two labels that pin the same release key', async () => {
    const s = server([V1, OLD]);
    await pinned(s);
    const bytes = readFileSync(s.layout.lockPath);
    await expect(pin(s, 'api', OLD)).rejects.toMatchObject({ code: 'RELEASE_LOCK_INVALID' });
    expect(readFileSync(s.layout.lockPath)).toEqual(bytes);
  });

  it('refuses to pin a plan whose publication differs from the reviewed verify-only native plan', async () => {
    const s = server();
    s.write(s.nativePlanPath(), nativePlan({ approval: { ...nativePlan().approval, publication: { ...publication, registerVersion: '13' } } }));
    await expect(pin(s, 'api')).rejects.toThrow(/NATIVE_PLAN_MISMATCH/);
    expect(existsSync(s.layout.lockPath)).toBe(false);
  });

  it('refuses to pin against a native plan that would apply or publish instead of verify', async () => {
    const s = server();
    s.write(s.nativePlanPath(), nativePlan({ operation: 'publish' }));
    await expect(pin(s, 'api')).rejects.toMatchObject({ code: 'NATIVE_PLAN_MISMATCH', fields: ['operation'] });
  });

  it("refuses to pin against another release's native plan", async () => {
    const s = server();
    s.write(s.nativePlanPath(), nativePlan({ sourceRoot: rootOf('api', 'other') }));
    await expect(pin(s, 'api')).rejects.toMatchObject({ code: 'NATIVE_PLAN_MISMATCH', fields: ['sourceRoot'] });
  });

  it('refuses to pin a regenerated lifecycle plan itself', async () => {
    const s = server();
    for (const folder of [join(s.layout.artifactsRoot, 'lifecycle-current'), s.currentDir()]) {
      mkdirSync(folder); chmodSync(folder, 0o755);
      s.write(join(folder, 'api-launch.json'), basePlan('api'));
      await expect(prestart.pinRelease({ planPath: join(folder, 'api-launch.json'), layout: s.layout, deps: { validateLaunchPlan: plans.validateLaunchPlan }, now: () => 0 })).rejects.toThrow(/PIN_SOURCE_REFUSED/);
    }
  });
});

describe('database ahead and unpinning', () => {
  const MANIFEST = { path: '/opt/debateai-v3-preview/artifacts/new-v1/source.json', sha256: 'c'.repeat(64) };
  const ahead = (patch: Record<string, unknown> = {}) => ({ schema: 'preview-database-ahead-v1', olderLabel: 'v1', olderSourceRevision: revision, newerLabel: 'new-v1', newerSourceRevision: NEW_REV,
    newerSourceManifest: MANIFEST, steps: [{ name: '0124_side_next.sql', sha256: digest }],
    newerChain: [{ name: '0123_side_by_side_releases.sql', manifestSha256: digest, sourceSha256: digest, verifierSha256: digest, n1Expand: true, keepsVerifier: true, outsideTransaction: false },
      { name: '0124_side_next.sql', manifestSha256: digest, sourceSha256: digest, verifierSha256: digest, n1Expand: true, keepsVerifier: true, outsideTransaction: false }], ...patch });
  /** The newer release's candidate API source manifest, as readPublicArtifact returns it. */
  const newerManifest = (patch: Record<string, unknown> = {}) => ({ schema: 'preview-auth-dev-source-v3', uid: 0, role: 'api', sourceRoot: rootOf('api', 'new-v1'), sourceRevision: NEW_REV,
    files: [{ path: 'dialectical-engine/migrations/0124_side_next.sql', sha256: digest }], ...patch });
  /**
   * readPublicArtifact on the server: the root-owned bytes at MANIFEST.path hash to MANIFEST.sha256, so any other
   * {path, sha256} pair is refused, as the real reader refuses it (D15 review: accept-ahead verifies the manifest itself).
   */
  const reads = (value: unknown = newerManifest()) => ({
    readSourceManifest: async (file: { path: string; sha256: string }) => {
      if (file.path !== MANIFEST.path || file.sha256 !== MANIFEST.sha256) throw new TypeError('PREVIEW_CUSTODY_REFUSED');
      return value;
    }
  });

  it("records the newer release's database-ahead file on the older release", async () => {
    const s = server([V1, NEW]);
    await pinned(s);
    await pinned(s, NEW);
    const path = common.databaseAheadPathFor(s.layout, 'v1');
    const fileSha = s.write(path, ahead());
    const result = await prestart.acceptAhead({ label: 'v1', fromPath: path, layout: s.layout, deps: reads() });
    const lock = s.readLock();
    expect(lock.releases.v1.databaseAhead).toEqual({ path, sha256: fileSha, newerLabel: 'new-v1' });
    expect(prestart.validateReleaseLock(lock, s.layout)).toEqual(lock);
    expect(result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_DATABASE_AHEAD_PINNED', label: 'v1', newerLabel: 'new-v1', databaseAheadSha256: fileSha });
  });

  it('accepts a newer release that is not pinned yet, against its own source manifest (spec §5 order: accept-ahead, migrations, then the pins)', async () => {
    const s = server([V1, NEW]);
    await pinned(s);
    const path = common.databaseAheadPathFor(s.layout, 'v1');
    const fileSha = s.write(path, ahead());
    const result = await prestart.acceptAhead({ label: 'v1', fromPath: path, layout: s.layout, deps: reads() });
    const lock = s.readLock();
    expect(Object.keys(lock.releases)).toEqual(['v1']);
    expect(lock.releases.v1.databaseAhead).toEqual({ path, sha256: fileSha, newerLabel: 'new-v1' });
    expect(prestart.validateReleaseLock(lock, s.layout)).toEqual(lock);
    expect(result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_DATABASE_AHEAD_PINNED', label: 'v1', newerLabel: 'new-v1', databaseAheadSha256: fileSha });
    // The newer release is pinned later (SB10), and the older release's record stays as it was.
    await pinned(s, NEW);
    expect(s.readLock().releases.v1.databaseAhead).toEqual({ path, sha256: fileSha, newerLabel: 'new-v1' });
  });

  it.each([
    ['a manifest whose bytes are not the sha256 the file names', { newerSourceManifest: { ...MANIFEST, sha256: 'd'.repeat(64) } }, {}],
    ['a manifest elsewhere than the file names', { newerSourceManifest: { ...MANIFEST, path: '/opt/debateai-v3-preview/artifacts/other-v1/source.json' } }, {}],
    ['a manifest of another revision than the file names', {}, { sourceRevision: 'f'.repeat(40) }],
    ['a manifest of another release than the file names', {}, { sourceRoot: rootOf('api', 'other-v1') }],
    ['a manifest that is not an API manifest', {}, { role: 'ui', sourceRoot: rootOf('ui', 'new-v1') }],
    ['a manifest that root does not own', {}, { uid: 1000 }],
    ['a manifest that does not list a step at its bytes', {}, { files: [{ path: 'dialectical-engine/migrations/0124_side_next.sql', sha256: 'e'.repeat(64) }] }]
  ] as const)('refuses a newer release that is not pinned yet with %s', async (_name, filePatch, manifestPatch) => {
    const s = server([V1, NEW]);
    await pinned(s);
    const path = common.databaseAheadPathFor(s.layout, 'v1');
    s.write(path, ahead(filePatch));
    const bytes = readFileSync(s.layout.lockPath);
    await expect(prestart.acceptAhead({ label: 'v1', fromPath: path, layout: s.layout, deps: reads(newerManifest(manifestPatch)) })).rejects.toMatchObject({ code: 'DATABASE_AHEAD_REFUSED' });
    expect(readFileSync(s.layout.lockPath)).toEqual(bytes);
  });

  it("reads the newer manifest with the server's own reader: bytes that are not root's are refused", async () => {
    const s = server([V1, NEW]);
    await pinned(s);
    const path = common.databaseAheadPathFor(s.layout, 'v1');
    const own = join(s.layout.artifactsRoot, 'release-new-v1', 'candidate-api-source.json');
    const manifestSha = s.write(own, newerManifest());
    s.write(path, ahead({ newerSourceManifest: { path: own, sha256: manifestSha } }));
    const bytes = readFileSync(s.layout.lockPath);
    await expect(prestart.acceptAhead({ label: 'v1', fromPath: path, layout: s.layout })).rejects.toMatchObject({ code: 'DATABASE_AHEAD_REFUSED' });
    expect(readFileSync(s.layout.lockPath)).toEqual(bytes);
  });

  it.each([
    ['a file elsewhere', 'elsewhere', {}, 'DATABASE_AHEAD_REFUSED'],
    ['another schema', 'own', { schema: 'preview-database-ahead-v0' }, 'DATABASE_AHEAD_REFUSED'],
    ['another older label', 'own', { olderLabel: 'old-v1' }, 'DATABASE_AHEAD_REFUSED'],
    ["another older revision", 'own', { olderSourceRevision: NEW_REV }, 'DATABASE_AHEAD_REFUSED'],
    ['a newer label that is the release itself', 'own', { newerLabel: 'v1' }, 'DATABASE_AHEAD_REFUSED'],
    // Side-by-side spec §5 (D5): the whole file is checked here too, so a bad file is refused before any restart needs it.
    ['a file without the newer chain', 'own', { newerChain: undefined }, 'DATABASE_AHEAD_REFUSED'],
    ['a step that is not the newer chain\'s last', 'own', { steps: [{ name: '0125_more.sql', sha256: digest }] }, 'DATABASE_AHEAD_REFUSED'],
    ['a group-writable file', 'writable', {}, 'DATABASE_AHEAD_UNREADABLE'],
    // D5 review, kept (D15 review): a newer release that is pinned already must be pinned at the revision the file
    // names; its manifest says that revision too, so only the pin refuses here.
    ['a newer release pinned at another revision', 'own', { newerSourceRevision: 'c'.repeat(40) }, 'DATABASE_AHEAD_REFUSED']
  ] as const)('refuses %s', async (_name, where, patch, code) => {
    const s = server([V1, NEW]);
    await pinned(s);
    await pinned(s, NEW);
    const own = common.databaseAheadPathFor(s.layout, 'v1');
    const path = where === 'elsewhere' ? join(s.layout.nativePlanRoot, 'database-ahead-other.json') : own;
    s.write(path, ahead(patch), where === 'writable' ? 0o664 : 0o644);
    const bytes = readFileSync(s.layout.lockPath);
    const manifest = newerManifest('newerSourceRevision' in patch ? { sourceRevision: patch.newerSourceRevision } : {});
    await expect(prestart.acceptAhead({ label: 'v1', fromPath: path, layout: s.layout, deps: reads(manifest) })).rejects.toMatchObject({ code });
    expect(readFileSync(s.layout.lockPath)).toEqual(bytes);
  });

  it('verifies in database-ahead mode exactly when the lock pins a database-ahead file, and binds the proof to that file', async () => {
    const s = server([V1, NEW]);
    await pinned(s, V1, ['api', 'ui', 'runner']);
    await pinned(s, NEW);
    const at = Date.parse('2026-10-09T10:00:12Z');
    const start = async (databaseAhead: unknown) => {
      const seen: unknown[] = [];
      const { deps: d } = deps(s, { now: () => at, verifyNative: async (input: unknown) => { seen.push(input); return attestation(new Date(at).toISOString(), { databaseAhead }); } });
      const result = await prestart.runPrestart({ service: 'runner', label: 'v1', layout: s.layout, deps: d }).catch((error: unknown) => error);
      return { seen, result };
    };
    const proofOf = (fileSha256: string) => ({ fileSha256, newerLabel: 'new-v1', extraSteps: ['0124_side_next.sql'] });
    const path = common.databaseAheadPathFor(s.layout, 'v1');
    const fileSha = s.write(path, ahead());
    // Not pinned yet: the plain verify, and a proof that claims a database-ahead file is refused.
    let outcome = await start(null);
    expect(outcome.seen).toEqual([{ sourceRoot: root, databaseAhead: false }]);
    expect(outcome.result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_PRESTART_READY' });
    expect((await start(proofOf(fileSha))).result).toMatchObject({ code: 'NATIVE_ATTESTATION_INVALID' });
    await prestart.acceptAhead({ label: 'v1', fromPath: path, layout: s.layout, deps: reads() });
    outcome = await start(proofOf(fileSha));
    expect(outcome.seen).toEqual([{ sourceRoot: root, databaseAhead: true }]);
    expect(outcome.result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_PRESTART_READY' });
    expect((await start(proofOf('f'.repeat(64)))).result).toMatchObject({ code: 'NATIVE_ATTESTATION_INVALID' });
    // Pinned, but the newer release has not moved the database yet: the proof says so and the start goes on.
    expect((await start(null)).result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_PRESTART_READY' });
  });

  it('unpins only a retired release and leaves the other release untouched', async () => {
    const s = server([OLD, NEW]);
    await pinned(s, OLD);
    await pinned(s, NEW);
    const before = s.readLock();
    const asked: string[] = [];
    for (const refused of ['CURRENT', 'DRAINING', 'STAGED', 'UNKNOWN'])
      await expect(prestart.unpinRelease({ label: 'old-v1', layout: s.layout, deps: { readReleaseState: async ({ releaseKey }: { releaseKey: string }) => { asked.push(releaseKey); return (await state(refused)()); } } }))
        .rejects.toMatchObject({ code: 'RELEASE_STATE_REFUSED', fields: { state: refused } });
    expect(asked).toEqual(Array(4).fill(keyOf(OLD)));
    expect(s.readLock()).toEqual(before);
    const result = await prestart.unpinRelease({ label: 'old-v1', layout: s.layout, deps: { readReleaseState: state('RETIRED') } });
    const lock = s.readLock();
    expect(Object.keys(lock.releases)).toEqual(['new-v1']);
    expect(lock.releases['new-v1']).toEqual(before.releases['new-v1']);
    expect(result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_RELEASE_UNPINNED', label: 'old-v1', releaseKey: keyOf(OLD) });
    await expect(prestart.unpinRelease({ label: 'old-v1', layout: s.layout, deps: { readReleaseState: state('RETIRED') } })).rejects.toMatchObject({ code: 'RELEASE_LOCK_RELEASE_MISSING' });
  });
});

describe('the current release label (for the unlock and the creator)', () => {
  it('is the lock label whose release key the release table names as current', async () => {
    const s = server([OLD, NEW]);
    await pinned(s, OLD);
    await pinned(s, NEW);
    const read = (releaseKey: string | null) => async () => (releaseKey ? { releaseKey, takeTrafficFrom: '2026-10-21T10:00:00.000Z' } : null);
    await expect(prestart.currentLabel({ layout: s.layout, readCurrent: read(keyOf(NEW)) })).resolves.toBe('new-v1');
    await expect(prestart.currentLabel({ layout: s.layout, readCurrent: read(keyOf(OLD)) })).resolves.toBe('old-v1');
    await expect(prestart.currentLabel({ layout: s.layout, readCurrent: read('r12-ffffffffffff') })).rejects.toMatchObject({ code: 'CURRENT_RELEASE_UNPINNED' });
    await expect(prestart.currentLabel({ layout: s.layout, readCurrent: read(null) })).rejects.toMatchObject({ code: 'CURRENT_RELEASE_UNPINNED' });
    await expect(prestart.currentLabel({ layout: s.layout, readCurrent: async () => { throw Object.assign(new Error('RELEASE_TABLE_UNREADABLE'), { code: 'RELEASE_TABLE_UNREADABLE' }); } })).rejects.toMatchObject({ code: 'RELEASE_TABLE_UNREADABLE' });
  });
});

describe('prestart', () => {
  it('runs the canonical verifier, then atomically writes a fresh attestation and a regenerated plan with root modes', async () => {
    const s = server();
    await pinned(s);
    const { calls, deps: d } = deps(s);
    const result = await prestart.runPrestart({ service: 'ui', label: 'v1', layout: s.layout, deps: d });
    expect(calls).toEqual([root]);
    expect(readdirSync(s.currentDir()).sort()).toEqual(['ui-launch.json', 'ui-native.json']);
    const nativeBytes = readFileSync(join(s.currentDir(), 'ui-native.json'));
    const plan = JSON.parse(readFileSync(join(s.currentDir(), 'ui-launch.json'), 'utf8'));
    expect(plan).toEqual({ ...basePlan('ui'), nativeAttestation: { path: join(s.currentDir(), 'ui-native.json'), sha256: sha(nativeBytes) } });
    for (const name of ['ui-launch.json', 'ui-native.json']) expect(statSync(join(s.currentDir(), name)).mode & 0o777).toBe(0o644);
    expect(statSync(s.currentDir()).mode & 0o777).toBe(0o755);
    expect(result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_PRESTART_READY', service: 'ui', label: 'v1', releaseKey: 'r12-aaaaaaaaaaaa', registerVersion: '12', attestationAgeMs: 0, verifyMs: 12000 });
  });

  it("writes the proof and plan into the release's own lifecycle-current folder", async () => {
    const s = server([V1, NEW]);
    await pinned(s);
    await pinned(s, NEW);
    const { deps: d } = deps(s);
    await prestart.runPrestart({ service: 'ui', label: 'v1', layout: s.layout, deps: d });
    expect(readdirSync(common.currentDirFor(s.layout, 'v1'))).toEqual(['ui-launch.json', 'ui-native.json']);
    expect(existsSync(common.currentDirFor(s.layout, 'new-v1'))).toBe(false);
    expect(existsSync(join(s.layout.artifactsRoot, 'lifecycle-current'))).toBe(false);
    const newer = deps(s, { verifyNative: async ({ sourceRoot }: { sourceRoot: string }) => { newer.calls.push(sourceRoot); return attestation('2026-10-09T10:00:00.000Z', { sourceRevision: NEW_REV }); } });
    await expect(prestart.runPrestart({ service: 'api', label: 'new-v1', layout: s.layout, deps: newer.deps })).resolves.toMatchObject({ label: 'new-v1', releaseKey: keyOf(NEW) });
    expect(newer.calls).toEqual([rootOf('api', 'new-v1')]);
    expect(readdirSync(common.currentDirFor(s.layout, 'new-v1'))).toEqual(['api-launch.json', 'api-native.json']);
    expect(readdirSync(common.currentDirFor(s.layout, 'v1'))).toEqual(['ui-launch.json', 'ui-native.json']);
  });

  it("refuses to start a draining or retired release's api and ui", async () => {
    const s = server();
    await pinned(s);
    for (const service of ['api', 'ui']) for (const value of ['DRAINING', 'RETIRED', 'UNKNOWN']) {
      const { calls, deps: d } = deps(s, { readReleaseState: state(value) });
      await expect(prestart.runPrestart({ service, label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'RELEASE_STATE_REFUSED', fields: { state: value } });
      expect(calls).toEqual([]);
    }
    for (const value of ['STAGED', 'CURRENT']) await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: deps(s, { readReleaseState: state(value) }).deps })).resolves.toMatchObject({ event: 'PREVIEW_LIFECYCLE_PRESTART_READY' });
  });

  it("lets a draining release's runner start again (database ahead, crash recovery)", async () => {
    const s = server();
    await pinned(s, V1, ['api', 'ui', 'runner']);
    const asked: string[] = [];
    for (const value of ['STAGED', 'CURRENT', 'DRAINING']) {
      const { deps: d } = deps(s, { readReleaseState: async ({ releaseKey }: { releaseKey: string }) => { asked.push(releaseKey); return state(value)(); } });
      await expect(prestart.runPrestart({ service: 'runner', label: 'v1', layout: s.layout, deps: d })).resolves.toMatchObject({ event: 'PREVIEW_LIFECYCLE_PRESTART_READY', service: 'runner', label: 'v1' });
    }
    expect(asked).toEqual(Array(3).fill('r12-aaaaaaaaaaaa'));
    for (const value of ['RETIRED', 'UNKNOWN']) await expect(prestart.runPrestart({ service: 'runner', label: 'v1', layout: s.layout, deps: deps(s, { readReleaseState: state(value) }).deps })).rejects.toMatchObject({ code: 'RELEASE_STATE_REFUSED', fields: { state: value } });
  });

  it('passes a release table it cannot read through as its own refusal', async () => {
    const s = server();
    await pinned(s);
    const { calls, deps: d } = deps(s, { readReleaseState: async () => { throw Object.assign(new Error('RELEASE_TABLE_UNREADABLE'), { code: 'RELEASE_TABLE_UNREADABLE' }); } });
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'RELEASE_TABLE_UNREADABLE' });
    expect(calls).toEqual([]);
  });

  it('refuses a website or API whose slot another live release is using', async () => {
    const SAME = { ...NEW, slot: 'A' as const };
    const s = server([V1, SAME]);
    await pinned(s);
    await pinned(s, SAME, ['api', 'ui', 'runner']);
    const asked: string[] = [];
    const busy = (unit: string) => unit === 'debateai-preview-ui@v1.service';
    for (const service of ['api', 'ui']) {
      const { calls, deps: d } = deps(s, { isActive: async (unit: string) => { asked.push(unit); return busy(unit); } });
      await expect(prestart.runPrestart({ service, label: 'new-v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'SLOT_IN_USE', fields: { label: 'v1' } });
      expect(calls).toEqual([]);
    }
    expect(asked).toEqual(expect.arrayContaining(['debateai-preview-ui@v1.service']));
    expect(asked.some(unit => unit.includes('new-v1'))).toBe(false);
    // Once the other release's website and API are stopped, the slot is free; the runner never asks.
    const free = deps(s, { verifyNative: async () => attestation('2026-10-09T10:00:00.000Z', { sourceRevision: NEW_REV }) });
    await expect(prestart.runPrestart({ service: 'api', label: 'new-v1', layout: s.layout, deps: free.deps })).resolves.toMatchObject({ label: 'new-v1' });
    let runnerAsked = 0;
    const runner = deps(s, { isActive: async () => { runnerAsked++; return true; }, verifyNative: async () => attestation('2026-10-09T10:00:00.000Z', { sourceRevision: NEW_REV }) });
    await expect(prestart.runPrestart({ service: 'runner', label: 'new-v1', layout: s.layout, deps: runner.deps })).resolves.toMatchObject({ service: 'runner' });
    expect(runnerAsked).toBe(0);
    // A release in the other slot never blocks.
    const t = server([V1, NEW]);
    await pinned(t);
    await pinned(t, NEW);
    const other = deps(t, { isActive: async () => true, verifyNative: async () => attestation('2026-10-09T10:00:00.000Z', { sourceRevision: NEW_REV }) });
    await expect(prestart.runPrestart({ service: 'api', label: 'new-v1', layout: t.layout, deps: other.deps })).resolves.toMatchObject({ label: 'new-v1' });
  });

  it('refuses a plan whose ports are not the slot its release was pinned with', async () => {
    const s = server();
    const lock = await pinned(s);
    lock.releases.v1.slot = 'B';
    s.write(s.layout.lockPath, lock);
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'RELEASE_LOCK_MISMATCH', fields: ['slot'] });
    expect(calls).toEqual([]);
  });

  it('refuses a label the lock does not pin, or a service its release does not pin', async () => {
    const s = server();
    await pinned(s);
    await expect(prestart.runPrestart({ service: 'api', label: 'v2', layout: s.layout, deps: deps(s).deps })).rejects.toMatchObject({ code: 'RELEASE_LOCK_RELEASE_MISSING' });
    await expect(prestart.runPrestart({ service: 'runner', label: 'v1', layout: s.layout, deps: deps(s).deps })).rejects.toMatchObject({ code: 'RELEASE_LOCK_SERVICE_MISSING' });
    await expect(prestart.runPrestart({ service: 'api', label: '../v1', layout: s.layout, deps: deps(s).deps })).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
  });

  it.each([
    ['sourceManifestSha256', (e: any) => { e.sourceManifestSha256 = '1'.repeat(64); }],
    ['uiBuildSha256', (e: any) => { e.uiBuildSha256 = '2'.repeat(64); }],
    ['operatorManifestSha256', (e: any) => { e.operatorManifestSha256 = '3'.repeat(64); }]
  ])('refuses before any database work when the plan disagrees with the lock on %s', async (field, mutate) => {
    const s = server();
    const lock = await pinned(s);
    mutate(lock.releases.v1.services.ui);
    s.write(s.layout.lockPath, lock);
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'ui', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'RELEASE_LOCK_MISMATCH', fields: expect.arrayContaining([field]) });
    expect(calls).toEqual([]);
    expect(existsSync(s.currentDir())).toBe(false);
  });

  it.each([
    ['publication', (e: any) => { e.publication = { ...publication, requestSha256: '4'.repeat(64) }; }],
    ['sourceRevision', (e: any) => { e.sourceRevision = '5'.repeat(40); }]
  ])('refuses before any database work when the plans disagree with the lock on %s', async (field, mutate) => {
    const s = server();
    const lock = await pinned(s);
    // One release shares its revision and publication, so the lock changes them for every service at once.
    for (const service of ['api', 'ui']) mutate(lock.releases.v1.services[service]);
    lock.releases.v1.releaseKey = environment.expectedReleaseKey(lock.releases.v1.services.ui.publication, lock.releases.v1.services.ui.sourceRevision);
    s.write(s.layout.lockPath, lock);
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'ui', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'RELEASE_LOCK_MISMATCH', fields: expect.arrayContaining([field]) });
    expect(calls).toEqual([]);
    expect(existsSync(s.currentDir())).toBe(false);
  });

  it('refuses when the pinned base plan bytes changed after pinning', async () => {
    const s = server();
    await pinned(s);
    s.write(s.planPath('api'), { ...basePlan('api'), serviceUid: 1003 });
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'BASE_PLAN_HASH_MISMATCH' });
    expect(calls).toEqual([]);
  });

  it('never runs a native plan that is not the pinned verify-only plan', async () => {
    const s = server();
    await pinned(s);
    s.write(s.nativePlanPath(), nativePlan({ operation: 'apply-and-plan' }));
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'NATIVE_PLAN_HASH_MISMATCH' });
    expect(calls).toEqual([]);
  });

  it('refuses when the native plan changed while the verifier was reading it, and writes nothing', async () => {
    const s = server();
    await pinned(s);
    const { deps: d } = deps(s, { verifyNative: async () => { s.write(s.nativePlanPath(), nativePlan({ operation: 'publish' })); return attestation('2026-10-09T10:00:00.000Z'); } });
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'NATIVE_PLAN_CHANGED' });
    expect(existsSync(join(s.currentDir(), 'api-launch.json'))).toBe(false);
  });

  it('keeps the previous files and refuses when the canonical verifier refuses (tampered release)', async () => {
    const s = server();
    await pinned(s);
    const { deps: d } = deps(s);
    await prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d });
    const before = readFileSync(join(s.currentDir(), 'api-launch.json'));
    const tampered = deps(s, { verifyNative: async () => { throw Object.assign(new Error('NATIVE_VERIFY_REFUSED'), { code: 'NATIVE_VERIFY_REFUSED' }); } });
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: tampered.deps })).rejects.toMatchObject({ code: 'NATIVE_VERIFY_REFUSED' });
    expect(readFileSync(join(s.currentDir(), 'api-launch.json'))).toEqual(before);
  });

  it.each([
    ['another publication', { publication: { ...publication, registerVersion: '13' } }],
    ['another native source', { nativeSourceSha256: '8'.repeat(64) }],
    ['a wrong executor', { executorRole: 'postgres' }]
  ])('refuses an attestation for %s', async (_name, patch) => {
    const s = server();
    await pinned(s);
    const { deps: d } = deps(s, { verifyNative: async () => attestation('2026-10-09T10:00:00.000Z', patch) });
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'NATIVE_ATTESTATION_INVALID' });
    expect(existsSync(join(s.currentDir(), 'api-launch.json'))).toBe(false);
  });

  it('refuses when the proof is already too old to survive the launcher re-hash', async () => {
    const s = server();
    await pinned(s);
    let clock = Date.parse('2026-10-09T10:00:00Z');
    const { deps: d } = deps(s, { now: () => clock, verifyNative: async () => { const verifiedAt = new Date(clock).toISOString(); clock += 61000; return attestation(verifiedAt); } });
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: 'ATTESTATION_TOO_OLD' });
  });

  it.each([
    ['a symlinked lock', (s: Server) => { const real = join(s.base, 'elsewhere.json'); writeFileSync(real, readFileSync(s.layout.lockPath)); chmodSync(real, 0o644); rmSync(s.layout.lockPath); symlinkSync(real, s.layout.lockPath); }],
    ['a group-writable lock', (s: Server) => chmodSync(s.layout.lockPath, 0o664)],
    ['a lock with an unknown key', (s: Server) => { const lock = s.readLock(); lock.releases.v1.services.api.extra = true; s.write(s.layout.lockPath, lock); }],
    ['a lock with a duplicated key', (s: Server) => s.write(s.layout.lockPath, readFileSync(s.layout.lockPath, 'utf8').replace('{"schema":', '{"schema":"x","schema":'))]
  ])('refuses %s', async (_name, damage) => {
    const s = server();
    await pinned(s);
    damage(s);
    const { calls, deps: d } = deps(s);
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: d })).rejects.toMatchObject({ code: expect.stringMatching(/^RELEASE_LOCK_(UNREADABLE|INVALID)$/) });
    expect(calls).toEqual([]);
  });
});

describe('waiting for PostgreSQL after a boot', () => {
  const answer = (code: number) => ({ code, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
  it('asks pg_isready on the local socket (no shell, empty environment) until the database accepts connections', async () => {
    let clock = 0;
    const seen: any[] = [];
    const run = async (argv: string[], options: any) => { seen.push({ argv, options }); return answer(seen.length < 4 ? 2 : 0); };
    const result = await prestart.waitForPostgres({ layout: common.LAYOUT, run, now: () => clock, sleep: async (ms: number) => { clock += ms; } });
    expect(result).toEqual({ waitedMs: 6000, attempts: 4 });
    expect(seen[0].argv).toEqual(['/usr/lib/postgresql/18/bin/pg_isready', '--host=/run/debateai-v3-preview/postgresql', '--port=5434', '--dbname=debateai', '--timeout=2', '--quiet']);
    expect(seen[0].options.env).toEqual({});
  });

  it('gives up after at most 60 seconds with POSTGRES_NOT_READY', async () => {
    let clock = 0;
    const run = async () => answer(2);
    await expect(prestart.waitForPostgres({ layout: common.LAYOUT, run, now: () => clock, sleep: async (ms: number) => { clock += ms; } })).rejects.toMatchObject({ code: 'POSTGRES_NOT_READY' });
    expect(clock).toBeLessThanOrEqual(60_000);
    expect(clock).toBeGreaterThanOrEqual(56_000);
  });

  it('waits after the cheap checks, reads the release table and the slot, then verifies; never verifies if the database stays down', async () => {
    const s = server();
    await pinned(s);
    const order: string[] = [];
    const ok = deps(s, {
      waitForPostgres: async () => { order.push('wait'); return { waitedMs: 4000, attempts: 3 }; },
      readReleaseState: async () => { order.push('state'); return state('CURRENT')(); },
      isActive: async () => { order.push('slot'); return false; },
      verifyNative: async () => { order.push('verify'); return attestation('2026-10-09T10:00:00.000Z'); }
    });
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: ok.deps })).resolves.toMatchObject({ postgresWaitMs: 4000 });
    // Alone in the lock: no other release can hold the slot, so no unit is asked.
    expect(order).toEqual(['wait', 'state', 'verify']);
    const down = deps(s, { waitForPostgres: async () => { throw Object.assign(new Error('POSTGRES_NOT_READY'), { code: 'POSTGRES_NOT_READY' }); } });
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: down.deps })).rejects.toMatchObject({ code: 'POSTGRES_NOT_READY' });
    expect(down.calls).toEqual([]);
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
    ['ambiguous JSON', { code: 0, stdout: Buffer.from('{"a":1,"a":2}'), stderr: Buffer.alloc(0) }, 'NATIVE_VERIFY_REFUSED'],
    ['a pending-step line with an exit of zero', { code: 0, stdout: Buffer.from('{}'), stderr: Buffer.from('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: 0112_auth_db_batch.sql. Verify never applies a migration; run the native operator with operation apply-and-plan first.\n') }, 'NATIVE_VERIFY_REFUSED'],
    ['a pending-step line followed by more output', { code: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: 0112_auth_db_batch.sql. Verify never applies a migration; run the native operator with operation apply-and-plan first.\nmore\n') }, 'NATIVE_VERIFY_REFUSED']
  ])('refuses %s', async (_name, outcome, code) => {
    const run = async () => ({ timedOut: false, overflow: false, ...outcome });
    await expect(prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, run, timeoutMs: 1000 })).rejects.toMatchObject({ code });
  });

  it('adds --database-ahead to the canonical argv exactly when asked', async () => {
    const argv = prestart.nativeVerifyArgv({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, databaseAhead: true });
    expect(argv.slice(-4)).toEqual([`${root}/dialectical-engine/deploy/preview-auth-dev/v1/native-operator.mjs`, '--credential-fd', '3', '--database-ahead']);
    expect(prestart.nativeVerifyArgv({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root }).slice(-2)).toEqual(['--credential-fd', '3']);
    const seen: string[][] = [];
    const run = async (command: string[]) => { seen.push(command); return { code: 0, timedOut: false, overflow: false, stdout: Buffer.from('{"ok":true}\n'), stderr: Buffer.alloc(0) }; };
    await prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, databaseAhead: true, run, timeoutMs: 1000 });
    expect(seen[0]!.slice(-3)).toEqual(['--credential-fd', '3', '--database-ahead']);
    for (const databaseAhead of ['yes', 1, null]) {
      await expect(prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, databaseAhead, run: async () => { throw new Error('ran'); }, timeoutMs: 1000 })).rejects.toMatchObject({ code: 'NATIVE_VERIFY_REFUSED' });
    }
  });

  it('names a database ahead of the release: the operator pins the newer release\'s database-ahead file first', async () => {
    const line = "PREVIEW_NATIVE_VERIFY_DATABASE_AHEAD: the database has steps this release does not know: 0124_side_next.sql, 0125_more.sql. Pin the newer release's database-ahead file with prestart.mjs accept-ahead first.\n";
    const run = (code: number, stderr: string) => async () => ({ code, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.from(stderr) });
    await expect(prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, run: run(1, line), timeoutMs: 1000 }))
      .rejects.toMatchObject({ code: 'NATIVE_VERIFY_DATABASE_AHEAD', fields: { next: 'accept-ahead', extra: ['0124_side_next.sql', '0125_more.sql'] } });
    for (const [code, stderr] of [[0, line], [1, `${line}more\n`], [1, line.replace('0124_side_next.sql', '0124 side next.sql')]] as const) {
      await expect(prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, run: run(code, stderr), timeoutMs: 1000 })).rejects.toMatchObject({ code: 'NATIVE_VERIFY_REFUSED' });
    }
  });

  it('names a pending forward step: verify never applies one, the operator runs apply-and-plan', async () => {
    const stderr = Buffer.from('PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: 0111_billing_netopia.sql, 0112_auth_db_batch.sql. Verify never applies a migration; run the native operator with operation apply-and-plan first.\n');
    const run = async () => ({ code: 1, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr });
    await expect(prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: root, run, timeoutMs: 1000 }))
      .rejects.toMatchObject({ code: 'NATIVE_VERIFY_PENDING_FORWARD_STEP', fields: { next: 'apply-and-plan', pending: ['0111_billing_netopia.sql', '0112_auth_db_batch.sql'] } });
  });

  it('refuses a source root outside the reviewed release folders', async () => {
    await expect(prestart.runNativeVerify({ layout: common.LAYOUT, nodePath: '/opt/node/bin/node', sourceRoot: '/tmp/x', run: async () => { throw new Error('ran'); }, timeoutMs: 1000 })).rejects.toMatchObject({ code: 'NATIVE_VERIFY_REFUSED' });
  });
});

describe('release drop-in', () => {
  it('renders a later-sorting instance drop-in that resets ExecStart and launches from its own release folder', async () => {
    const s = server();
    const lock = await pinned(s);
    const text = prestart.renderReleaseDropin({ service: 'api', label: 'v1', entry: lock.releases.v1.services.api, lockSha256: digest, nodePath: '/opt/node/bin/node', prestartPath: '/opt/op/prestart.mjs', layout: common.LAYOUT });
    const lines = text.split('\n').filter((line: string) => !line.startsWith('#') && line);
    // `+` runs as root but would inherit the service's Environment=/EnvironmentFile= (NODE_OPTIONS, secrets): env -i drops all of it.
    // The restart settings come first and win over any older drop-in's Restart=no (it sorts before ten z).
    expect(lines).toEqual(['[Unit]', 'StartLimitIntervalSec=900', 'StartLimitBurst=4', 'OnFailure=debateai-preview-alert@%n.service',
      '[Service]', 'Restart=on-failure', 'RestartMode=direct', 'RestartSec=30', 'TimeoutStartSec=300', `WorkingDirectory=${root}/dialectical-engine`, 'ExecStartPre=+/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/node/bin/node /opt/op/prestart.mjs --service api --label v1', 'ExecStart=',
      `ExecStart=/opt/node/bin/node ${root}/dialectical-engine/deploy/preview-auth-dev/v1/launch-api.mjs --plan /opt/debateai-v3-preview/artifacts/lifecycle-current-v1/api-launch.json`]);
    expect(text).toContain('# Install as /etc/systemd/system/debateai-preview-api@v1.service.d/zzzzzzzzzz-lifecycle-release.conf\n');
    expect(prestart.RELEASE_DROPIN_NAME > 'zzzzzzzzz-auth-dev-task12-final.conf').toBe(true);
    const ui = prestart.renderReleaseDropin({ service: 'ui', label: 'v1', entry: lock.releases.v1.services.ui, lockSha256: digest, nodePath: '/opt/node/bin/node', prestartPath: '/opt/op/prestart.mjs', layout: common.LAYOUT });
    expect(ui).toContain(`WorkingDirectory=${rootOf('ui')}/dialectical-engine/apps/ui\n`);
    expect(ui).toContain('launch-ui.mjs --plan /opt/debateai-v3-preview/artifacts/lifecycle-current-v1/ui-launch.json');
    expect(ui).toContain('\n[Service]\nRestart=on-failure\nRestartMode=direct\nRestartSec=30\nTimeoutStartSec=300\n');
  });

  it('renders the instance release drop-in with the label in the prestart and the plan path', async () => {
    const s = server();
    const lock = await pinned(s, V1, ['api', 'ui', 'runner']);
    expect(prestart.renderReleaseDropin({ service: 'runner', label: 'v1', entry: lock.releases.v1.services.runner, lockSha256: digest, nodePath: '/opt/node/bin/node', prestartPath: '/opt/op/prestart.mjs', layout: common.LAYOUT }).split('\n')).toEqual([
      '# Generated by: prestart.mjs dropin --service runner --label v1',
      `# Release lock sha256 ${digest}; source ${revision}; register 12.`,
      '# Install as /etc/systemd/system/debateai-preview-runner@v1.service.d/zzzzzzzzzz-lifecycle-release.conf',
      '# It sorts after every other drop-in of this instance and its template, so the ExecStart= reset below wins.',
      '# The runner keeps Restart=no from its reviewed unit file; it is never restarted automatically.',
      '[Service]',
      `WorkingDirectory=${rootOf('runner')}/dialectical-engine`,
      'ExecStartPre=+/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin /opt/node/bin/node /opt/op/prestart.mjs --service runner --label v1',
      'ExecStart=',
      `ExecStart=/opt/node/bin/node ${rootOf('runner')}/dialectical-engine/deploy/preview-auth-dev/v1/launch-runner.mjs --start --plan /opt/debateai-v3-preview/artifacts/lifecycle-current-v1/runner-launch.json`,
      ''
    ]);
  });

  it("refuses to render a drop-in for a label that is not the entry's release", async () => {
    const s = server();
    const lock = await pinned(s);
    for (const label of ['v2', '../v1', 'V1']) expect(() => prestart.renderReleaseDropin({ service: 'api', label, entry: lock.releases.v1.services.api, lockSha256: digest, nodePath: '/opt/node/bin/node', prestartPath: '/opt/op/prestart.mjs', layout: common.LAYOUT })).toThrow(/DROPIN_REFUSED/);
  });

  it('wins over an older release drop-in that sets Restart=no (systemd: the last file in name order wins)', async () => {
    const s = server();
    const lock = await pinned(s);
    const older = '[Service]\nRestart=no\nRestartSec=5\nTimeoutStartSec=90\n[Unit]\nStartLimitBurst=1\n';
    const ours = prestart.renderReleaseDropin({ service: 'api', label: 'v1', entry: lock.releases.v1.services.api, lockSha256: digest, nodePath: '/opt/node/bin/node', prestartPath: '/opt/op/prestart.mjs', layout: common.LAYOUT });
    // A single-valued key takes the value of the last assignment across drop-ins sorted by file name.
    const files = [['99-provider-high-v1.conf', older], ['zzzzzz-recovery106-v1.conf', older], [prestart.RELEASE_DROPIN_NAME, ours]].sort(([a], [b]) => (a < b ? -1 : 1));
    const effective: Record<string, string> = {};
    for (const [, text] of files) for (const line of text.split('\n')) { const at = line.indexOf('='); if (at > 0 && !line.startsWith('#')) effective[line.slice(0, at)] = line.slice(at + 1); }
    expect(files.at(-1)![0]).toBe(prestart.RELEASE_DROPIN_NAME);
    expect(effective).toMatchObject({ Restart: 'on-failure', RestartMode: 'direct', RestartSec: '30', TimeoutStartSec: '300', StartLimitIntervalSec: '900', StartLimitBurst: '4' });
  });
});

describe('runner release', () => {
  it('pins and refreshes the runner, checking its unit first', async () => {
    const s = server();
    await pinned(s);
    await pin(s, 'runner', V1, 0);
    const lock = s.readLock();
    expect(Object.keys(lock.releases.v1.services).sort()).toEqual(['api', 'runner', 'ui']);
    expect(lock.releases.v1.services.runner).toMatchObject({ serviceUid: 992, serviceGid: 975, uiBuildSha256: null, sourceRevision: revision });
    const units: string[] = [];
    const { calls, deps: d } = deps(s, { checkRunnerUnit: async () => { units.push('runner'); }, checkFrontUnit: async () => { units.push('front'); } });
    const result = await prestart.runPrestart({ service: 'runner', label: 'v1', layout: s.layout, deps: d });
    expect(calls).toEqual([root]);
    expect(units).toEqual(['runner']);
    expect(readdirSync(s.currentDir()).sort()).toEqual(['runner-launch.json', 'runner-native.json']);
    expect(result).toMatchObject({ event: 'PREVIEW_LIFECYCLE_PRESTART_READY', service: 'runner', label: 'v1' });
  });

  it("refuses a runner whose release is not the native plan's source revision before any database work", async () => {
    const s = server();
    s.write(s.planPath('runner'), { ...runnerPlan(), sourceRevision: 'c'.repeat(40) });
    await expect(pin(s, 'runner', V1, 0)).rejects.toMatchObject({ code: 'NATIVE_PLAN_MISMATCH', fields: ['sourceRevision'] });
  });
});

const show = (expectedArgv: string[], lines: string[], code = 0) => async (argv: string[], options: { env: Record<string, string> }) => {
  expect(argv).toEqual(expectedArgv);
  expect(options.env).toEqual({});
  return { code, timedOut: false, overflow: false, stdout: Buffer.from(lines.join('\n') + '\n'), stderr: Buffer.alloc(0) };
};

describe('runner unit check (before any database work)', () => {
  const argv = ['/usr/bin/systemctl', 'show', 'debateai-preview-runner@v1.service', '--property=FragmentPath', '--property=DropInPaths', '--property=IPAddressAllow', '--property=IPAddressDeny', '--property=RestrictAddressFamilies', '--property=MemoryMax', '--no-pager'];
  const good = ['FragmentPath=/etc/systemd/system/debateai-preview-runner@.service', 'DropInPaths=/etc/systemd/system/debateai-preview-runner@v1.service.d/zzzzzzzzzz-lifecycle-release.conf',
    'IPAddressAllow=127.0.0.0/8 ::1/128', 'IPAddressDeny=::/0 0.0.0.0/0', 'RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX', 'MemoryMax=3221225472'];
  it('accepts exactly the reviewed runner template plus the instance release drop-in', async () => {
    await expect(prestart.checkRunnerUnit({ label: 'v1', layout: common.LAYOUT, run: show(argv, good) })).resolves.toBeUndefined();
  });
  it.each([
    ['an old drop-in left beside the release one', 1, 'DropInPaths=/etc/systemd/system/debateai-preview-runner@v1.service.d/42-provider-sdk-interfaces.conf /etc/systemd/system/debateai-preview-runner@v1.service.d/zzzzzzzzzz-lifecycle-release.conf', 'DropInPaths'],
    ['a template drop-in', 1, 'DropInPaths=/etc/systemd/system/debateai-preview-runner@.service.d/99-wide.conf /etc/systemd/system/debateai-preview-runner@v1.service.d/zzzzzzzzzz-lifecycle-release.conf', 'DropInPaths'],
    ["another release's drop-in", 1, 'DropInPaths=/etc/systemd/system/debateai-preview-runner@v2.service.d/zzzzzzzzzz-lifecycle-release.conf', 'DropInPaths'],
    ['no release drop-in', 1, 'DropInPaths=', 'DropInPaths'],
    ['the old single unit', 0, 'FragmentPath=/etc/systemd/system/debateai-preview-runner.service', 'FragmentPath'],
    ['a runtime override fragment', 0, 'FragmentPath=/run/systemd/system/debateai-preview-runner@.service', 'FragmentPath'],
    ['Internet allowed', 2, 'IPAddressAllow=any', 'IPAddressAllow'],
    ['no IP deny', 3, 'IPAddressDeny=', 'IPAddressDeny'],
    ['a widened address family', 4, 'RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX AF_PACKET', 'RestrictAddressFamilies'],
    ['no memory limit', 5, 'MemoryMax=infinity', 'MemoryMax'],
    ['the API memory limit', 5, 'MemoryMax=2147483648', 'MemoryMax']
  ] as const)('refuses %s', async (_name, index, line, field) => {
    const lines: string[] = [...good]; lines[index] = line;
    await expect(prestart.checkRunnerUnit({ label: 'v1', layout: common.LAYOUT, run: show(argv, lines) })).rejects.toMatchObject({ code: 'RUNNER_UNIT_REFUSED', fields: [field] });
  });
  it('refuses an unreadable or ambiguous answer', async () => {
    await expect(prestart.checkRunnerUnit({ label: 'v1', layout: common.LAYOUT, run: show(argv, good, 1) })).rejects.toMatchObject({ code: 'RUNNER_UNIT_UNREADABLE' });
    await expect(prestart.checkRunnerUnit({ label: 'v1', layout: common.LAYOUT, run: show(argv, [...good, good[1]!]) })).rejects.toMatchObject({ code: 'RUNNER_UNIT_UNREADABLE' });
  });
  it('runs before the native plan is read; api and ui get the front unit check instead', async () => {
    const s = server();
    await pinned(s, V1, ['api', 'ui', 'runner']);
    const checks: string[] = [];
    const refusing = deps(s, { checkRunnerUnit: async ({ label }: { label: string }) => { checks.push(`runner:${label}`); throw Object.assign(new Error('x'), { code: 'RUNNER_UNIT_REFUSED' }); } });
    // A native plan that would fail its hash proves the unit check ran first.
    s.write(s.nativePlanPath(), nativePlan({ operation: 'publish' }));
    await expect(prestart.runPrestart({ service: 'runner', label: 'v1', layout: s.layout, deps: refusing.deps })).rejects.toMatchObject({ code: 'RUNNER_UNIT_REFUSED' });
    expect(refusing.calls).toEqual([]);
    const front = deps(s, { checkRunnerUnit: async () => { checks.push('runner'); }, checkFrontUnit: async ({ service, label }: { service: string; label: string }) => { checks.push(`${service}:${label}`); throw Object.assign(new Error('x'), { code: 'FRONT_UNIT_REFUSED' }); } });
    await expect(prestart.runPrestart({ service: 'api', label: 'v1', layout: s.layout, deps: front.deps })).rejects.toMatchObject({ code: 'FRONT_UNIT_REFUSED' });
    await expect(prestart.runPrestart({ service: 'ui', label: 'v1', layout: s.layout, deps: front.deps })).rejects.toMatchObject({ code: 'FRONT_UNIT_REFUSED' });
    expect(checks).toEqual(['runner:v1', 'api:v1', 'ui:v1']);
  });
});

describe('website and API unit check (before any database work)', () => {
  const dir = '/etc/systemd/system';
  const apiArgv = ['/usr/bin/systemctl', 'show', 'debateai-preview-api@v1.service', '--property=FragmentPath', '--property=DropInPaths', '--no-pager'];
  const uiArgv = ['/usr/bin/systemctl', 'show', 'debateai-preview-ui@v1.service', '--property=FragmentPath', '--property=DropInPaths', '--property=BindsTo', '--no-pager'];
  const fragment = (service: string) => `FragmentPath=${dir}/debateai-preview-${service}@.service`;
  const release = (service: string) => `${dir}/debateai-preview-${service}@v1.service.d/zzzzzzzzzz-lifecycle-release.conf`;
  it('accepts the template drop-ins plus the instance release drop-in', async () => {
    await expect(prestart.checkFrontUnit({ service: 'api', label: 'v1', layout: common.LAYOUT, run: show(apiArgv, [fragment('api'), `DropInPaths=${dir}/debateai-preview-api@.service.d/50-lifecycle.conf ${dir}/debateai-preview-api@.service.d/60-memory.conf ${release('api')}`]) })).resolves.toBeUndefined();
    await expect(prestart.checkFrontUnit({ service: 'api', label: 'v1', layout: common.LAYOUT, run: show(apiArgv, [fragment('api'), `DropInPaths=${release('api')}`]) })).resolves.toBeUndefined();
    await expect(prestart.checkFrontUnit({ service: 'ui', label: 'v1', layout: common.LAYOUT, run: show(uiArgv, [fragment('ui'), `DropInPaths=${dir}/debateai-preview-ui@.service.d/50-lifecycle.conf ${release('ui')}`, 'BindsTo=debateai-preview-api@v1.service']) })).resolves.toBeUndefined();
  });
  it.each([
    ['a drop-in of its own other than the release drop-in', `${dir}/debateai-preview-api@v1.service.d/99-provider-high-v1.conf ${release('api')}`],
    ['no release drop-in', `${dir}/debateai-preview-api@.service.d/50-lifecycle.conf`],
    ['a prefix drop-in for every preview unit', `${dir}/debateai-preview-.service.d/10-wide.conf ${release('api')}`],
    ['a runtime drop-in', `/run/systemd/system/debateai-preview-api@v1.service.d/override.conf ${release('api')}`],
    ['a drop-in nested below the template folder', `${dir}/debateai-preview-api@.service.d/x/50-lifecycle.conf ${release('api')}`],
    ["the website's template drop-in", `${dir}/debateai-preview-ui@.service.d/50-lifecycle.conf ${release('api')}`]
  ])('refuses an api instance with %s', async (_name, paths) => {
    await expect(prestart.checkFrontUnit({ service: 'api', label: 'v1', layout: common.LAYOUT, run: show(apiArgv, [fragment('api'), `DropInPaths=${paths}`]) })).rejects.toMatchObject({ code: 'FRONT_UNIT_REFUSED', fields: ['DropInPaths'] });
  });
  // D4 review: like the runner, the instance must load the reviewed template file itself, not a unit of the same name elsewhere.
  it.each([
    ['the old single unit', 'api', `FragmentPath=${dir}/debateai-preview-api.service`],
    ['a runtime override fragment', 'api', 'FragmentPath=/run/systemd/system/debateai-preview-api@.service'],
    ['an instance file of its own', 'api', `FragmentPath=${dir}/debateai-preview-api@v1.service`],
    ["the website's template", 'api', `FragmentPath=${dir}/debateai-preview-ui@.service`],
    ['no file at all (not loaded)', 'api', 'FragmentPath='],
    ['the old single website unit', 'ui', `FragmentPath=${dir}/debateai-preview-ui.service`]
  ] as const)('refuses an instance loaded from %s', async (_name, service, line) => {
    const lines = service === 'api' ? [line, `DropInPaths=${release('api')}`] : [line, `DropInPaths=${release('ui')}`, 'BindsTo=debateai-preview-api@v1.service'];
    await expect(prestart.checkFrontUnit({ service, label: 'v1', layout: common.LAYOUT, run: show(service === 'api' ? apiArgv : uiArgv, lines) })).rejects.toMatchObject({ code: 'FRONT_UNIT_REFUSED', fields: ['FragmentPath'] });
  });
  it.each([['another release', 'BindsTo=debateai-preview-api@v2.service'], ['the old single unit', 'BindsTo=debateai-preview-api.service'], ['nothing', 'BindsTo='], ['two units', 'BindsTo=debateai-preview-api@v1.service debateai-preview-api@v2.service']])('refuses a website bound to %s', async (_name, line) => {
    await expect(prestart.checkFrontUnit({ service: 'ui', label: 'v1', layout: common.LAYOUT, run: show(uiArgv, [fragment('ui'), `DropInPaths=${release('ui')}`, line]) })).rejects.toMatchObject({ code: 'FRONT_UNIT_REFUSED', fields: ['BindsTo'] });
  });
  it('refuses an unreadable or ambiguous answer, and any service but api or ui', async () => {
    await expect(prestart.checkFrontUnit({ service: 'api', label: 'v1', layout: common.LAYOUT, run: show(apiArgv, [fragment('api'), `DropInPaths=${release('api')}`], 1) })).rejects.toMatchObject({ code: 'FRONT_UNIT_UNREADABLE' });
    await expect(prestart.checkFrontUnit({ service: 'api', label: 'v1', layout: common.LAYOUT, run: show(apiArgv, [fragment('api'), `DropInPaths=${release('api')}`, `DropInPaths=${release('api')}`]) })).rejects.toMatchObject({ code: 'FRONT_UNIT_UNREADABLE' });
    await expect(prestart.checkFrontUnit({ service: 'runner', label: 'v1', layout: common.LAYOUT, run: async () => { throw new Error('ran'); } })).rejects.toMatchObject({ code: 'SERVICE_REFUSED' });
  });
});

describe('unit activity (the slot gate)', () => {
  const argv = ['/usr/bin/systemctl', 'show', 'debateai-preview-api@v1.service', '--property=ActiveState', '--no-pager'];
  it.each([['active', true], ['activating', true], ['reloading', true], ['deactivating', true], ['inactive', false], ['failed', false]] as const)('reads %s as in use: %s', async (value, inUse) => {
    await expect(prestart.unitIsActive({ unit: 'debateai-preview-api@v1.service', layout: common.LAYOUT, run: show(argv, [`ActiveState=${value}`]) })).resolves.toBe(inUse);
  });
  it('refuses an unreadable answer', async () => {
    await expect(prestart.unitIsActive({ unit: 'debateai-preview-api@v1.service', layout: common.LAYOUT, run: show(argv, ['ActiveState=active'], 1) })).rejects.toMatchObject({ code: 'UNIT_STATE_UNREADABLE' });
    await expect(prestart.unitIsActive({ unit: 'debateai-preview-api@v1.service', layout: common.LAYOUT, run: show(argv, ['ActiveState=']) })).rejects.toMatchObject({ code: 'UNIT_STATE_UNREADABLE' });
  });
});

describe('command line', () => {
  it('the CLI refuses a label that is not a release label', async () => {
    const asRoot = { platform: 'linux', uid: 0 };
    for (const label of ['../x', 'V1', 'v1-', '', '-v1', 'v1/..', 'a'.repeat(73)]) {
      for (const argv of [['--service', 'api', '--label', label], ['dropin', '--service', 'api', '--label', label], ['accept-ahead', '--label', label, '--from', '/etc/x.json'], ['unpin', '--label', label]])
        await expect(prestart.main(argv, asRoot)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    }
    for (const argv of [['--service', 'worker', '--label', 'v1'], ['--service', 'api'], ['--service', 'api', '--label', 'v1', 'extra'], ['pin', '--from'], ['unpin'], []])
      await expect(prestart.main(argv, asRoot)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    // Well-formed arguments still need root on Linux.
    for (const argv of [['--service', 'api', '--label', 'v1'], ['pin', '--from', '/opt/x/api-launch.json'], ['dropin', '--service', 'runner', '--label', 'd50e33165-r19-v1'], ['accept-ahead', '--label', 'v1', '--from', '/etc/x.json'], ['unpin', '--label', 'v1']])
      await expect(prestart.main(argv, { platform: 'darwin', uid: 501 })).rejects.toMatchObject({ code: 'ACTOR_REFUSED' });
  });
});
