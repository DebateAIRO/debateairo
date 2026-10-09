import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const tool = await import('../../deploy/' + 'preview-release/v1/release-artifacts.mjs');
const manifestModule = await import('../../deploy/' + 'preview-auth-dev/v1/source-manifest.mjs');
const plans = await import('../../deploy/' + 'preview-auth-dev/v1/launch-plan.mjs');
const environment = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');
const turnstile = await import('../../deploy/' + 'preview-auth-dev/v1/turnstile-custody.mjs');
const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
const prestart = await import('../../deploy/' + 'preview-lifecycle/v1/prestart.mjs');

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const me = { uid: process.getuid!(), gid: process.getgid!() };
const digest = 'a'.repeat(64), revision = 'a'.repeat(40), tree = 'b'.repeat(40), newRevision = 'c'.repeat(40), newTree = 'd'.repeat(40);
const publication = { publicationId: '11111111-1111-4111-8111-111111111111', publicationKind: 'GENERAL', baseRegisterVersion: '8', registerVersion: '9', requestSha256: digest, snapshotSha256: digest, rowCount: 68, recordedAt: '2026-10-06T12:00:00.000Z' };
const OLD_ROOT = '/opt/debateai-v3-preview/releases/auth-dev-candidate-old-api';
const NEW_ROOT = { api: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-api', ui: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-ui', runner: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-runner' } as const;
const OPERATOR = 'dialectical-engine/deploy/preview-auth-dev/v1/';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A throwaway copy of the server's artifact folder, owned by the test user instead of root. */
function server(patch: Record<string, string> = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'preview-release-')));
  roots.push(base);
  const layout = { ...tool.LAYOUT, artifactsRoot: join(base, 'artifacts'), currentDir: join(base, 'artifacts', 'lifecycle-current'), ownerUid: me.uid, ownerGid: me.gid, ...patch };
  const art = join(layout.artifactsRoot, 'auth-dev-new-v1');
  for (const dir of [layout.artifactsRoot, art]) { mkdirSync(dir, { recursive: true }); chmodSync(dir, 0o755); }
  const write = (path: string, value: unknown, mode = 0o644) => { const bytes = typeof value === 'string' ? value : JSON.stringify(value); writeFileSync(path, bytes); chmodSync(path, mode); return { path, sha256: sha(bytes) }; };
  return { base, layout, art, write };
}
const sourceManifest = (role: 'api' | 'ui' | 'runner', patch: Record<string, unknown> = {}) => ({
  schema: 'preview-auth-dev-source-v3', sourceRevision: newRevision, sourceTree: newTree, sourceRoot: NEW_ROOT[role], role, uid: me.uid, nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0',
  files: [
    { path: 'dialectical-engine/apps/api/src/main.ts', sha256: '1'.repeat(64), mode: 0o644 },
    { path: `${OPERATOR}launch-api.mjs`, sha256: '2'.repeat(64), mode: 0o644 },
    { path: `${OPERATOR}native-operator.mjs`, sha256: '3'.repeat(64), mode: 0o644 },
    { path: 'dialectical-engine/deploy/preview-release/v1/release-artifacts.mjs', sha256: '4'.repeat(64), mode: 0o644 }
  ],
  packageLinks: [], dependencyInventory: [], generatedContract: null, nativeSha256: '9'.repeat(64), contractSha256: '8'.repeat(64), promptStoryProviderSha256: digest, packageLockSha256: digest, ...patch
});
const oldPlan = (service: 'api' | 'ui' | 'runner') => ({
  schema: 'preview-auth-dev-launch-v1', service, artifact: 'candidate', sourceRoot: OLD_ROOT, sourceRevision: revision, sourceTree: tree,
  serviceUid: 994, serviceGid: 977, sourceManifest: { path: '/opt/debateai-v3-preview/artifacts/old/api-source.json', sha256: 'c'.repeat(64) },
  nativeAttestation: { path: '/opt/debateai-v3-preview/artifacts/old/native.json', sha256: 'd'.repeat(64) },
  uiBuild: service === 'ui' ? { path: '/opt/debateai-v3-preview/artifacts/old/ui-build.json', sha256: 'e'.repeat(64) } : null,
  publication, operatorManifestSha256: 'f'.repeat(64),
  environment: { path: `/etc/debateai-v3-preview/auth-dev-v1/${service}.env`, root: '/etc/debateai-v3-preview/auth-dev-v1', uid: 0, gid: 977, mode: 0o640, parentUid: 0 },
  apiPort: '3101', uiPort: '3100', mailExecutable: `${OLD_ROOT}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs`, mailFrom: 'noreply@dezbatere.ro'
});
const attestation = (patch: Record<string, unknown> = {}) => ({
  schema: 'preview-auth-dev-native-v1', sourceRevision: newRevision, sourceTree: newTree, nativeSourceSha256: '9'.repeat(64), verifiedAt: '2026-10-09T10:00:00.000Z', postgresMajor: 18,
  executorRole: 'debateai_prod_migrator', executorOid: 16388, ledgerOwnerOid: 16388, billingOwnerOid: 16388, defaultOwnerCount: 6, ledgerCount: 129,
  resolutionCount: 1, forwardCount: 1, catalogSha256: digest, ledgerSha256: digest, resolutionSha256: digest, forwardSha256: digest, cohortCount: 0,
  capabilityCounts: { debateai_runtime: 10 }, currentContractVerified: true, publication, ...patch
});
const oldNativePlan = (patch: Record<string, unknown> = {}) => ({
  schema: 'preview-auth-dev-native-plan-v1', operation: 'verify', sourceRoot: OLD_ROOT, sourceRevision: revision, sourceTree: tree,
  sourceManifest: { path: '/opt/debateai-v3-preview/artifacts/old/api-source.json', sha256: 'c'.repeat(64) }, operatorManifestSha256: 'f'.repeat(64),
  selectedBaseRegisterVersion: '8', selectedBaseSnapshotSha256: digest, publicationId: publication.publicationId,
  approval: { runtimeObservedAt: '2026-10-06T11:00:00.000Z', baseRegisterVersion: '8', baseSnapshotSha256: digest, snapshotSha256: digest, deltaSha256: digest, publication }, ...patch
});
// The reviewed validator admits only the real /opt artifact folder; map the throwaway folder back to it.
const realValidator = (layout: { artifactsRoot: string }) => (plan: any) => {
  const map = (file: any) => (file ? { ...file, path: file.path.replace(layout.artifactsRoot, '/opt/debateai-v3-preview/artifacts') } : file);
  return plans.validateLaunchPlan({ ...plan, sourceManifest: map(plan.sourceManifest), nativeAttestation: map(plan.nativeAttestation), uiBuild: map(plan.uiBuild) });
};
// The reviewed byte-for-byte verifiers need a real installed release; tests that are not about them pass.
const passVerifiers = { verifySourceManifest: async () => true, verifyUiBuildManifest: async () => true };
const run = (argv: string[], layout: any, deps: Record<string, unknown> = {}) => tool.runCommand(argv, { layout, deps: { ...passVerifiers, ...deps } });

describe('command line', () => {
  it('accepts each subcommand with exactly its flags', () => {
    expect(tool.parseArguments(['build-env'])).toMatchObject({ command: 'build-env' });
    expect(tool.parseArguments(['verify', '--source', '/x.json', '--ui-build', '/y.json']).options['--ui-build']).toBe('/y.json');
  });
  it.each([
    ['no subcommand', []], ['unknown subcommand', ['publish']], ['unknown flag', ['verify', '--source', '/x.json', '--force', 'yes']],
    ['repeated flag', ['verify', '--source', '/x.json', '--source', '/y.json']], ['missing value', ['verify', '--source']],
    ['missing required flag', ['operator-digest']], ['flag as value', ['verify', '--source', '--ui-build']], ['empty value', ['verify', '--source', '']],
    ['positional', ['build-env', 'extra']], ['control byte', ['verify', '--source', '/x\n.json']], ['flag of another subcommand', ['ui-build', '--source', '/x.json', '--out', '/y.json', '--role', 'ui']]
  ])('refuses %s', (_name, argv) => {
    expect(() => tool.parseArguments(argv)).toThrow(/ARGUMENTS_REFUSED/);
  });

  const actor = { platform: 'linux', uid: 0, version: 'v26.8.2', umask: 0o022, env: { PATH: '/usr/local/bin:/usr/bin:/bin', TZ: 'UTC' } };
  it('runs only as root on Linux with Node v26.8.2, umask 022 and an emptied environment', () => {
    expect(() => tool.assertActor(actor)).not.toThrow();
    for (const patch of [{ platform: 'darwin' }, { uid: 1000 }, { version: 'v22.23.1' }, { umask: 0o002 }, { env: { PATH: '/usr/bin', NODE_OPTIONS: '--import=/tmp/x.mjs' } }, { env: { PATH: '/usr/bin', DATABASE_URL: 'x' } }]) {
      expect(() => tool.assertActor({ ...actor, ...patch })).toThrow(/ACTOR_REFUSED/);
    }
  });

  it('refuses on this Mac from the real entry point and prints only a reason code', () => {
    const result = spawnSync(process.execPath, [resolve('deploy/preview-release/v1/release-artifacts.mjs'), 'build-env'], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({ event: 'PREVIEW_RELEASE_REFUSED', reason: 'ACTOR_REFUSED' });
  });

  it('reports reviewed refusal codes and hides every other message', () => {
    expect(tool.reasonOf(new TypeError('PREVIEW_SOURCE_INVENTORY_REFUSED'))).toBe('PREVIEW_SOURCE_INVENTORY_REFUSED');
    expect(tool.reasonOf(new Error('ENOENT: no such file /etc/debateai-v3-preview/auth-dev-v1/api.env'))).toBe('UNEXPECTED');
  });

  it('pins the reviewed server folders and root ownership', () => {
    expect(tool.LAYOUT).toEqual({ artifactsRoot: '/opt/debateai-v3-preview/artifacts', releasesRoot: '/opt/debateai-v3-preview/releases', currentDir: '/opt/debateai-v3-preview/artifacts/lifecycle-current', ownerUid: 0, ownerGid: 0 });
  });
});

describe('writing artifacts', () => {
  it('writes compact JSON with no trailing newline, 0644, and reports path, sha256 and bytes', async () => {
    const s = server();
    const out = join(s.art, 'candidate-api-source.json');
    const result = await tool.writeArtifact(out, { b: 1, a: [2] }, { layout: s.layout });
    expect(readFileSync(out, 'utf8')).toBe('{"b":1,"a":[2]}');
    expect(result).toEqual({ path: out, sha256: sha('{"b":1,"a":[2]}'), bytes: 15 });
    expect(statSync(out).mode & 0o7777).toBe(0o644);
  });

  it('never replaces an existing file (O_EXCL)', async () => {
    const s = server();
    const out = s.write(join(s.art, 'api-launch.json'), 'original').path;
    await expect(tool.writeArtifact(out, { x: 1 }, { layout: s.layout })).rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
    expect(readFileSync(out, 'utf8')).toBe('original');
  });

  it('never follows a link at the target, even a dangling one', async () => {
    const s = server();
    const target = join(s.base, 'elsewhere.json');
    symlinkSync(target, join(s.art, 'api-launch.json'));
    await expect(tool.writeArtifact(join(s.art, 'api-launch.json'), { x: 1 }, { layout: s.layout })).rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
    expect(existsSync(target)).toBe(false);
  });

  it.each([
    ['a relative path', () => 'artifacts/x/y.json'],
    ['a path outside the artifacts folder', (s: any) => join(s.base, 'y.json')],
    ['an upper-case name', (s: any) => join(s.art, 'Api-launch.json')],
    ['a path with ..', (s: any) => `${s.art}/../auth-dev-new-v1/y.json`],
    ['the lifecycle-current folder prestart owns', (s: any) => { mkdirSync(s.layout.currentDir, { mode: 0o755 }); return join(s.layout.currentDir, 'api-launch.json'); }],
    ['a linked release folder', (s: any) => { symlinkSync(s.art, join(s.layout.artifactsRoot, 'linked')); return join(s.layout.artifactsRoot, 'linked', 'y.json'); }],
    ['a group-writable release folder', (s: any) => { chmodSync(s.art, 0o775); return join(s.art, 'y.json'); }]
  ])('refuses %s', async (_name, path) => {
    const s = server();
    const out = path(s);
    await expect(tool.writeArtifact(out, { x: 1 }, { layout: s.layout })).rejects.toMatchObject({ code: 'OUTPUT_PATH_REFUSED' });
  });
});

describe('source-manifest', () => {
  function release(s: ReturnType<typeof server>) {
    const releases = join(s.base, 'releases'), root = join(releases, 'auth-dev-candidate-new-api'), repository = join(s.layout.artifactsRoot, 'auth-dev-new-v1', 'source-reference');
    for (const dir of [releases, root, repository, join(repository, '.git')]) { mkdirSync(dir, { recursive: true }); chmodSync(dir, 0o755); }
    writeFileSync(join(repository, '.git', 'config'), '[core]\n'); chmodSync(join(repository, '.git', 'config'), 0o644);
    return { root, repository, layout: { ...s.layout, releasesRoot: releases } };
  }

  it('calls the reviewed generator with the fixed owner uid and writes its exact result', async () => {
    const s = server(), r = release(s);
    const calls: unknown[] = [];
    const generated = { ...sourceManifest('api'), sourceRoot: r.root, uid: r.layout.ownerUid };
    const out = join(s.art, 'candidate-api-source.json');
    const result = await run(['source-manifest', '--repository', r.repository, '--root', r.root, '--role', 'api', '--out', out], r.layout, { generateSourceManifest: async (input: unknown) => { calls.push(input); return generated; } });
    expect(calls).toEqual([{ repositoryRoot: r.repository, sourceRoot: r.root, role: 'api', uid: r.layout.ownerUid }]);
    expect(readFileSync(out, 'utf8')).toBe(JSON.stringify(generated));
    expect(result).toEqual({ path: out, sha256: sha(JSON.stringify(generated)), bytes: JSON.stringify(generated).length });
  });

  it.each([
    ['a root outside the release folders', (r: any) => ({ root: r.repository })],
    ['an unknown role', () => ({ role: 'worker' })],
    ['a linked root', (r: any, s: any) => { const link = join(s.base, 'releases', 'auth-dev-candidate-link-api'); symlinkSync(r.root, link); return { root: link }; }],
    ['a group-writable root', (r: any) => { chmodSync(r.root, 0o775); return {}; }],
    ['a relative repository', () => ({ repository: 'source-reference' })],
    ['a repository whose git config others can change (git obeys it as root)', (r: any) => { chmodSync(join(r.repository, '.git', 'config'), 0o664); return {}; }],
    ['a repository whose .git is a link', (r: any, s: any) => { rmSync(join(r.repository, '.git'), { recursive: true }); mkdirSync(join(s.base, 'git'), { mode: 0o755 }); symlinkSync(join(s.base, 'git'), join(r.repository, '.git')); return {}; }],
    ['an output that already exists (checked before the long work)', (_r: any, s: any) => { s.write(join(s.art, 'x.json'), '{}'); return {}; }]
  ])('refuses %s before generating anything', async (_name, patch) => {
    const s = server(), r = release(s);
    const input = { root: r.root, repository: r.repository, role: 'api', ...patch(r, s) };
    let called = false;
    await expect(run(['source-manifest', '--repository', input.repository, '--root', input.root, '--role', input.role, '--out', join(s.art, 'x.json')], r.layout, { generateSourceManifest: async () => { called = true; } })).rejects.toThrow();
    expect(called).toBe(false);
  });

  it('refuses a generated manifest for another root, role or owner', async () => {
    const s = server(), r = release(s);
    for (const patch of [{ sourceRoot: '/elsewhere' }, { role: 'ui' }, { uid: me.uid + 1 }]) {
      await expect(run(['source-manifest', '--repository', r.repository, '--root', r.root, '--role', 'api', '--out', join(s.art, 'x.json')], r.layout, { generateSourceManifest: async () => ({ ...sourceManifest('api'), sourceRoot: r.root, ...patch }) })).rejects.toMatchObject({ code: 'SOURCE_MANIFEST_REFUSED' });
    }
  });
});

describe('operator digest', () => {
  it('is the launchers\' own formula over exactly the operator folder; the release tool folder is not part of it', async () => {
    const s = server();
    const manifest = sourceManifest('api');
    const file = s.write(join(s.art, 'candidate-api-source.json'), manifest);
    const result = await run(['operator-digest', '--source', file.path], s.layout);
    const inline = sha(JSON.stringify(manifest.files.filter(f => f.path.startsWith(OPERATOR))));
    expect(result).toEqual({ operatorManifestSha256: inline, operatorFileCount: 2, role: 'api', sourceRevision: newRevision, source: file });
    expect(manifestModule.operatorManifestSha256(manifest)).toBe(inline);
  });

  it('exists once: every launcher, the native operator, the release guard and this tool call the shared function', () => {
    for (const path of ['deploy/preview-auth-dev/v1/launch-plan.mjs', 'deploy/preview-auth-dev/v1/native-operator.mjs', 'deploy/preview-lifecycle/v1/release-guard.mjs', 'deploy/preview-release/v1/release-artifacts.mjs']) {
      const text = readFileSync(resolve(path), 'utf8');
      expect(text).toContain('operatorManifestSha256(');
      expect(text).not.toMatch(/startsWith\(['"]dialectical-engine\/deploy\/preview-auth-dev\/v1\//);
    }
  });
});

describe('UI build values', () => {
  const runtimeOnly = { PORT: '3100', DIALECTICAL_UI_HOST: '127.0.0.1', DIALECTICAL_API_BASE: 'http://127.0.0.1:3101' };
  it('are exactly what the reviewed runtime gate demands from ui.env, from the same constants', () => {
    expect(tool.UI_PUBLIC_BUILD_VALUES).toEqual({ NODE_ENV: 'production', PUBLIC_APP_URL: turnstile.PREVIEW_ORIGIN, NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: environment.PREVIEW_FREE_MODEL_IDS_JSON, TURNSTILE_SITE_KEY: turnstile.PREVIEW_SITE_KEY });
    expect(() => environment.narrowEnvironment('ui', { ...tool.UI_PUBLIC_BUILD_VALUES, ...runtimeOnly }, {}, null, { uiPort: '3100', apiPort: '3101' })).not.toThrow();
    for (const key of Object.keys(tool.UI_PUBLIC_BUILD_VALUES)) {
      expect(() => environment.narrowEnvironment('ui', { ...tool.UI_PUBLIC_BUILD_VALUES, ...runtimeOnly, [key]: 'other' }, {}, null, { uiPort: '3100', apiPort: '3101' })).toThrow();
    }
  });

  it('the build child gets only the public values plus fixed tool settings, never a secret path or a stray public flag', () => {
    expect(Object.keys(tool.UI_BUILD_ENVIRONMENT).sort()).toEqual(['CI', 'LANG', 'LC_ALL', 'NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON', 'NEXT_TELEMETRY_DISABLED', 'NODE_ENV', 'PATH', 'PUBLIC_APP_URL', 'TURNSTILE_SITE_KEY', 'TZ']);
    expect(tool.UI_BUILD_ENVIRONMENT.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
  });

  it('build-env prints each value with its sha256 so ui.env can be compared by hash only', async () => {
    const report = await run(['build-env'], tool.LAYOUT);
    expect(report.values.TURNSTILE_SITE_KEY).toEqual({ value: turnstile.PREVIEW_SITE_KEY, sha256: sha(turnstile.PREVIEW_SITE_KEY) });
    expect(Object.keys(report.values)).toEqual(Object.keys(tool.UI_PUBLIC_BUILD_VALUES));
  });
});

describe('ui-build and verify', () => {
  it('verifies the root, builds with the fixed environment, re-verifies that no source byte changed, then writes', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui'));
    const events: string[] = [];
    const build = { schema: 'preview-auth-dev-ui-build-v1', buildId: 'x', files: [] };
    const out = join(s.art, 'candidate-ui-build.json');
    const result = await run(['ui-build', '--source', source.path, '--out', out], s.layout, {
      verifySourceManifest: async (_m: unknown, binding: any) => { events.push(`verify:${binding.manifestSha256}`); },
      buildUiArtifact: async (m: any, env: unknown) => { events.push('build'); expect(m.role).toBe('ui'); expect(env).toEqual({ ...tool.UI_BUILD_ENVIRONMENT, PATH: '/opt/node/bin:/usr/local/bin:/usr/bin:/bin' }); return build; },
      verifyUiBuildManifest: async () => { events.push('verify-build'); }, execPath: '/opt/node/bin/node'
    });
    expect(events).toEqual([`verify:${source.sha256}`, 'build', `verify:${source.sha256}`, 'verify-build']);
    expect(readFileSync(out, 'utf8')).toBe(JSON.stringify(build));
    expect(result.sha256).toBe(sha(JSON.stringify(build)));
  });

  it('writes nothing when the build changed an inventoried source byte', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui'));
    let calls = 0;
    await expect(run(['ui-build', '--source', source.path, '--out', join(s.art, 'candidate-ui-build.json')], s.layout, {
      verifySourceManifest: async () => { if (++calls === 2) throw new TypeError('PREVIEW_SOURCE_INVENTORY_REFUSED'); },
      buildUiArtifact: async () => ({ schema: 'preview-auth-dev-ui-build-v1' }), verifyUiBuildManifest: async () => undefined
    })).rejects.toThrow('PREVIEW_SOURCE_INVENTORY_REFUSED');
    expect(existsSync(join(s.art, 'candidate-ui-build.json'))).toBe(false);
  });

  it('refuses to rebuild a folder that already has a build, or to build towards an existing output', async () => {
    const s = server();
    const releases = join(s.base, 'releases'), root = join(releases, 'auth-dev-candidate-new-ui');
    mkdirSync(join(root, 'dialectical-engine/apps/ui/.next'), { recursive: true });
    const layout = { ...s.layout, releasesRoot: releases };
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui', { sourceRoot: root }));
    const never = { buildUiArtifact: async () => { throw new Error('built'); }, verifySourceManifest: async () => { throw new Error('verified'); } };
    await expect(run(['ui-build', '--source', source.path, '--out', join(s.art, 'candidate-ui-build.json')], layout, never)).rejects.toMatchObject({ code: 'UI_BUILD_EXISTS' });
    const out = s.write(join(s.art, 'candidate-ui-build.json'), '{}').path;
    await expect(run(['ui-build', '--source', source.path, '--out', out], layout, never)).rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
  });

  it('refuses to build from a non-UI manifest', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-api-source.json'), sourceManifest('api'));
    await expect(run(['ui-build', '--source', source.path, '--out', join(s.art, 'b.json')], s.layout, { buildUiArtifact: async () => { throw new Error('built'); } })).rejects.toMatchObject({ code: 'SOURCE_ROLE_REFUSED' });
  });

  it('verify re-runs the reviewed verifiers against the exact manifest bytes', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui'));
    const build = s.write(join(s.art, 'candidate-ui-build.json'), { schema: 'preview-auth-dev-ui-build-v1', buildId: 'x' });
    const seen: unknown[] = [];
    const result = await run(['verify', '--source', source.path, '--ui-build', build.path], s.layout, {
      verifySourceManifest: async (_m: unknown, binding: unknown) => { seen.push(binding); }, verifyUiBuildManifest: async (b: any, m: any) => { seen.push([b.buildId, m.role]); }
    });
    expect(seen).toEqual([{ sourceRevision: newRevision, sourceTree: newTree, sourceRoot: NEW_ROOT.ui, role: 'ui', manifestSha256: source.sha256 }, ['x', 'ui']]);
    expect(result).toMatchObject({ event: 'PREVIEW_RELEASE_VERIFIED', source, uiBuild: build });
  });

  it.each([
    ['a linked manifest', (s: any, p: string) => { const link = join(s.art, 'linked.json'); symlinkSync(p, link); return link; }, 'INPUT_REFUSED'],
    ['an env-file-like 0640 file', (_s: any, p: string) => { chmodSync(p, 0o640); return p; }, 'INPUT_REFUSED'],
    ['a hard-linked copy', (s: any, p: string) => { const link = join(s.art, 'hard.json'); spawnSync('/bin/ln', [p, link]); return link; }, 'INPUT_REFUSED'],
    ['a non-JSON name', (s: any) => s.write(join(s.art, 'ui.env'), 'X=1').path, 'INPUT_PATH_REFUSED'],
    ['a file outside the artifacts folder', (s: any) => s.write(join(s.base, 'source.json'), sourceManifest('ui')).path, 'INPUT_PATH_REFUSED'],
    ['a manifest of another owner', (s: any) => s.write(join(s.art, 'other.json'), sourceManifest('ui', { uid: me.uid + 1 })).path, 'SOURCE_MANIFEST_REFUSED'],
    ['a manifest outside the release folders', (s: any) => s.write(join(s.art, 'other.json'), sourceManifest('ui', { sourceRoot: '/opt/debateai/dialectical-engine' })).path, 'SOURCE_MANIFEST_REFUSED']
  ])('refuses to read %s', async (_name, input, code) => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui'));
    await expect(run(['verify', '--source', input(s, source.path)], s.layout, { verifySourceManifest: async () => { throw new Error('verified'); } })).rejects.toMatchObject({ code });
  });

  it('refuses a UI build check against a non-UI manifest', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-api-source.json'), sourceManifest('api'));
    await expect(run(['verify', '--source', source.path, '--ui-build', join(s.art, 'b.json')], s.layout, { verifySourceManifest: async () => undefined })).rejects.toMatchObject({ code: 'SOURCE_ROLE_REFUSED' });
  });
});

describe('launch-plan', () => {
  function staged(service: 'api' | 'ui' | 'runner', native: Record<string, unknown> = {}) {
    const s = server();
    const from = s.write(join(s.art, `old-${service}-launch.json`), oldPlan(service));
    const source = s.write(join(s.art, `candidate-${service}-source.json`), sourceManifest(service));
    const attest = s.write(join(s.art, 'native-first-verify.json'), attestation(native));
    const build = s.write(join(s.art, 'candidate-ui-build.json'), { schema: 'preview-auth-dev-ui-build-v1', sourceRoot: NEW_ROOT.ui, sourceRevision: newRevision, sourceTree: newTree, contractSha256: '8'.repeat(64) });
    const argv = (patch: Record<string, string | null> = {}) => {
      const flags: Record<string, string | null> = { '--service': service, '--from': from.path, '--root': NEW_ROOT[service], '--source-manifest': source.path, '--native-attestation': attest.path, '--out': join(s.art, `${service}-launch.json`), ...(service === 'ui' ? { '--ui-build': build.path } : {}), ...patch };
      return ['launch-plan', ...Object.entries(flags).filter(([, v]) => v !== null).flat() as string[]];
    };
    return { s, from, source, attest, build, argv };
  }

  it('derives every changed field from the manifests and keeps the rest of the live plan', async () => {
    const t = staged('api');
    const result = await run(t.argv(), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) });
    const plan = JSON.parse(readFileSync(result.path, 'utf8'));
    expect(plan).toEqual({ ...oldPlan('api'), sourceRoot: NEW_ROOT.api, sourceRevision: newRevision, sourceTree: newTree,
      sourceManifest: { path: t.source.path, sha256: t.source.sha256 }, nativeAttestation: { path: t.attest.path, sha256: t.attest.sha256 },
      operatorManifestSha256: manifestModule.operatorManifestSha256(sourceManifest('api')), mailExecutable: `${NEW_ROOT.api}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs` });
    expect(readFileSync(result.path, 'utf8')).toBe(JSON.stringify(plan));
    expect(statSync(result.path).mode & 0o7777).toBe(0o644);
  });

  it('binds the UI build for the website and a fallback root becomes artifact fallback', async () => {
    const t = staged('ui');
    const plan = JSON.parse(readFileSync((await run(t.argv(), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).path, 'utf8'));
    expect(plan.uiBuild).toEqual({ path: t.build.path, sha256: t.build.sha256 });
    const f = staged('runner');
    const fallbackRoot = '/opt/debateai-v3-preview/releases/auth-dev-fallback-new-runner';
    const source = f.s.write(join(f.s.art, 'fallback-runner-source.json'), sourceManifest('runner', { sourceRoot: fallbackRoot }));
    const fallback = JSON.parse(readFileSync((await run(f.argv({ '--root': fallbackRoot, '--source-manifest': source.path }), f.s.layout, { validateLaunchPlan: realValidator(f.s.layout) })).path, 'utf8'));
    expect(fallback).toMatchObject({ artifact: 'fallback', sourceRoot: fallbackRoot, uiBuild: null });
  });

  it.each([
    ['a manifest of another root', (t: any) => ({ '--root': '/opt/debateai-v3-preview/releases/auth-dev-candidate-other-api' }), 'SOURCE_MANIFEST_MISMATCH'],
    ['a manifest of another role', (t: any) => ({ '--source-manifest': t.s.write(join(t.s.art, 'ui.json'), sourceManifest('ui', { sourceRoot: NEW_ROOT.api })).path }), 'SOURCE_MANIFEST_MISMATCH'],
    ['an old plan of another service', (t: any) => ({ '--from': t.s.write(join(t.s.art, 'old-ui.json'), oldPlan('ui')).path }), 'FROM_PLAN_INVALID'],
    ['an old plan that fails the reviewed check', (t: any) => ({ '--from': t.s.write(join(t.s.art, 'bad.json'), { ...oldPlan('api'), extra: 1 }).path }), 'FROM_PLAN_INVALID'],
    ['a native proof of another revision', (t: any) => ({ '--native-attestation': t.s.write(join(t.s.art, 'n.json'), attestation({ sourceRevision: revision })).path }), 'NATIVE_ATTESTATION_MISMATCH'],
    ['a native proof of another publication', (t: any) => ({ '--native-attestation': t.s.write(join(t.s.art, 'n.json'), attestation({ publication: { ...publication, registerVersion: '10' } })).path }), 'NATIVE_ATTESTATION_MISMATCH'],
    ['a UI build for the API', (t: any) => ({ '--ui-build': t.build.path }), 'ARGUMENTS_REFUSED'],
    ['a root outside the release folders', () => ({ '--root': '/opt/debateai-v3-preview/releases/old106' }), 'RELEASE_ROOT_REFUSED'],
    ['an out name for another service', (t: any) => ({ '--out': join(t.s.art, 'ui-launch.json') }), 'OUTPUT_PATH_REFUSED']
  ])('refuses %s and writes nothing', async (_name, patch, code) => {
    const t = staged('api');
    await expect(run(t.argv(patch(t)), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).rejects.toMatchObject({ code });
    expect(existsSync(join(t.s.art, 'api-launch.json'))).toBe(false);
  });

  it('refuses a UI plan without a build, or with the build of another root', async () => {
    const t = staged('ui');
    await expect(run(t.argv({ '--ui-build': null }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    const other = t.s.write(join(t.s.art, 'other-build.json'), { schema: 'preview-auth-dev-ui-build-v1', sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-fallback-new-ui', sourceRevision: newRevision, sourceTree: newTree, contractSha256: '8'.repeat(64) });
    await expect(run(t.argv({ '--ui-build': other.path }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).rejects.toMatchObject({ code: 'UI_BUILD_MISMATCH' });
  });

  it('re-verifies the release folder and the UI build byte for byte, last, and writes nothing on drift', async () => {
    const t = staged('ui');
    const seen: string[] = [];
    await run(t.argv(), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout), verifySourceManifest: async (_m: unknown, b: any) => { seen.push(`source:${b.manifestSha256}`); }, verifyUiBuildManifest: async () => { seen.push('build'); } });
    expect(seen).toEqual([`source:${t.source.sha256}`, 'build']);
    const d = staged('api');
    await expect(run(d.argv(), d.s.layout, { validateLaunchPlan: realValidator(d.s.layout), verifySourceManifest: async () => { throw new TypeError('PREVIEW_SOURCE_INVENTORY_REFUSED'); } })).rejects.toThrow('PREVIEW_SOURCE_INVENTORY_REFUSED');
    expect(existsSync(join(d.s.art, 'api-launch.json'))).toBe(false);
  });

  // GAP-RUNNER B1: no runner plan exists on the server, so the first one is derived from the API plan.
  describe('runner plan derived from the API plan', () => {
    const account = { uid: 992, gid: 975 };
    function fromApi() {
      const t = staged('runner');
      const api = t.s.write(join(t.s.art, 'live-api-launch.json'), oldPlan('api'));
      return { ...t, api, argv: (patch: Record<string, string | null> = {}) => t.argv({ '--from': api.path, ...patch }) };
    }
    it('takes UID/GID from the runner OS account, the runner env custody, and everything else as for the API', async () => {
      const t = fromApi();
      let lookups = 0;
      const result = await run(t.argv(), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout), lookupRunnerAccount: async () => { lookups++; return account; } });
      const plan = JSON.parse(readFileSync(result.path, 'utf8'));
      expect(lookups).toBe(1);
      expect(plan).toEqual({ ...oldPlan('api'), service: 'runner', serviceUid: 992, serviceGid: 975, uiBuild: null,
        environment: { path: '/etc/debateai-v3-preview/auth-dev-v1/runner.env', root: '/etc/debateai-v3-preview/auth-dev-v1', uid: 0, gid: 975, mode: 0o640, parentUid: 0 },
        sourceRoot: NEW_ROOT.runner, sourceRevision: newRevision, sourceTree: newTree,
        sourceManifest: { path: t.source.path, sha256: t.source.sha256 }, nativeAttestation: { path: t.attest.path, sha256: t.attest.sha256 },
        operatorManifestSha256: manifestModule.operatorManifestSha256(sourceManifest('runner')), mailExecutable: `${NEW_ROOT.runner}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs` });
      expect(plan.environment.mode).toBe(416);
    });
    it('a runner plan as --from keeps its own identity and never asks the account', async () => {
      const t = staged('runner');
      const plan = JSON.parse(readFileSync((await run(t.argv(), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout), lookupRunnerAccount: async () => { throw new Error('asked'); } })).path, 'utf8'));
      expect(plan).toMatchObject({ serviceUid: 994, serviceGid: 977, environment: oldPlan('runner').environment });
    });
    it('refuses a UI plan as --from', async () => {
      const t = fromApi();
      const ui = t.s.write(join(t.s.art, 'live-ui-launch.json'), oldPlan('ui'));
      await expect(run(t.argv({ '--from': ui.path }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout), lookupRunnerAccount: async () => account })).rejects.toMatchObject({ code: 'FROM_PLAN_INVALID' });
      expect(existsSync(join(t.s.art, 'runner-launch.json'))).toBe(false);
    });
    it.each(['RUNNER_ACCOUNT_MISSING', 'RUNNER_ACCOUNT_REFUSED'])('writes nothing when the account lookup refuses (%s)', async code => {
      const t = fromApi();
      await expect(run(t.argv(), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout), lookupRunnerAccount: async () => { throw new tool.Refusal(code); } })).rejects.toMatchObject({ code });
      expect(existsSync(join(t.s.art, 'runner-launch.json'))).toBe(false);
    });
    it('the API plan is not a source for any other service', async () => {
      const t = staged('ui');
      const api = t.s.write(join(t.s.art, 'live-api-launch.json'), oldPlan('api'));
      await expect(run(t.argv({ '--from': api.path }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout), lookupRunnerAccount: async () => account })).rejects.toMatchObject({ code: 'FROM_PLAN_INVALID' });
    });
  });

  describe('runner OS account lookup', () => {
    const PASSWD = 'debateai-preview-runner:x:992:975::/var/lib/debateai-v3-preview/runner:/usr/sbin/nologin\n'; // live 2026-10-09
    const GROUP = 'debateai-preview-runner:x:975:\n';
    const answers = (passwd: { code: number; out: string }, group: { code: number; out: string } = { code: 0, out: GROUP }) => {
      const calls: unknown[] = [];
      const fake = async (argv: string[], options: { env: Record<string, string> }) => {
        calls.push([argv, options.env]);
        const answer = argv[1] === 'passwd' ? passwd : group;
        return { code: answer.code, timedOut: false, overflow: false, stdout: Buffer.from(answer.out), stderr: Buffer.alloc(0) };
      };
      return { calls, fake };
    };
    it('reads passwd and group through getent with an empty environment', async () => {
      const a = answers({ code: 0, out: PASSWD });
      expect(await tool.lookupRunnerAccount({ run: a.fake })).toEqual({ uid: 992, gid: 975 });
      expect(a.calls).toEqual([[['/usr/bin/getent', 'passwd', 'debateai-preview-runner'], {}], [['/usr/bin/getent', 'group', 'debateai-preview-runner'], {}]]);
    });
    it('refuses a missing account', async () => {
      await expect(tool.lookupRunnerAccount({ run: answers({ code: 2, out: '' }).fake })).rejects.toMatchObject({ code: 'RUNNER_ACCOUNT_MISSING' });
      await expect(tool.lookupRunnerAccount({ run: answers({ code: 0, out: PASSWD }, { code: 2, out: '' }).fake })).rejects.toMatchObject({ code: 'RUNNER_ACCOUNT_MISSING' });
    });
    it.each([
      ['root uid', 'debateai-preview-runner:x:0:975::/var/lib/x:/usr/sbin/nologin', GROUP],
      ['root gid', 'debateai-preview-runner:x:992:0::/var/lib/x:/usr/sbin/nologin', 'debateai-preview-runner:x:0:'],
      ['nobody', 'debateai-preview-runner:x:65534:975::/var/lib/x:/usr/sbin/nologin', GROUP],
      ['another name', 'debateai-preview-api:x:994:977::/var/lib/x:/usr/sbin/nologin', GROUP],
      ['a login shell', 'debateai-preview-runner:x:992:975::/var/lib/x:/bin/bash', GROUP],
      ['a group gid that differs', PASSWD, 'debateai-preview-runner:x:976:'],
      ['two entries', PASSWD + PASSWD, GROUP]
    ])('refuses %s', (_name, passwd, group) => {
      expect(() => tool.parseRunnerAccount(passwd, group)).toThrow('RUNNER_ACCOUNT_REFUSED');
    });
  });

  it('runs the reviewed validateLaunchPlan before writing', async () => {
    const t = staged('api');
    await expect(run(t.argv(), t.s.layout, { validateLaunchPlan: (plan: any) => { if (plan.sourceRoot === NEW_ROOT.api) throw new Error('no'); return plan; } })).rejects.toMatchObject({ code: 'LAUNCH_PLAN_INVALID' });
    expect(existsSync(join(t.s.art, 'api-launch.json'))).toBe(false);
  });
});

describe('native-plan', () => {
  function staged(fromPatch: Record<string, unknown> = {}, manifestPatch: Record<string, unknown> = {}) {
    const s = server();
    const from = s.write(join(s.art, 'native-plan-before.json'), oldNativePlan(fromPatch));
    const source = s.write(join(s.art, 'candidate-api-source.json'), sourceManifest('api', manifestPatch));
    const argv = (operation: string) => ['native-plan', '--operation', operation, '--from', from.path, '--source-manifest', source.path, '--out', join(s.art, `native-plan-${operation}.json`)];
    return { s, from, source, argv };
  }
  const read = (result: { path: string }) => JSON.parse(readFileSync(result.path, 'utf8'));

  it('apply-and-plan: the new candidate release, the same base selection, no approval', async () => {
    const t = staged();
    const plan = read(await run(t.argv('apply-and-plan'), t.s.layout));
    expect(plan).toEqual({ ...oldNativePlan(), operation: 'apply-and-plan', sourceRoot: NEW_ROOT.api, sourceRevision: newRevision, sourceTree: newTree,
      sourceManifest: { path: t.source.path, sha256: t.source.sha256 }, operatorManifestSha256: manifestModule.operatorManifestSha256(sourceManifest('api')), approval: null });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
  });

  it('verify: carries the approval over unchanged, so pin accepts it against the new launch plans', async () => {
    const t = staged();
    const plan = read(await run(t.argv('verify'), t.s.layout));
    expect(plan.approval).toEqual(oldNativePlan().approval);
    expect(plan.operation).toBe('verify');
    // Exactly the comparison `prestart.mjs pin` makes against the lock entry of a new launch plan.
    const entry = { sourceRevision: newRevision, sourceTree: newTree, operatorManifestSha256: manifestModule.operatorManifestSha256(sourceManifest('api')), publication };
    expect(prestart.checkNativePlan(plan, entry)).toEqual([]);
  });

  it.each([
    ['verify without an approval to carry', { approval: null }, {}, 'verify', 'NATIVE_APPROVAL_REQUIRED'],
    ['verify with an approval lacking runtimeObservedAt', { approval: { publication } }, {}, 'verify', 'NATIVE_APPROVAL_REQUIRED'],
    ['verify with an invalid publication', { approval: { runtimeObservedAt: 'x', publication: { ...publication, publicationKind: 'OTHER' } } }, {}, 'verify', 'NATIVE_APPROVAL_REQUIRED'],
    ['a fallback root', {}, { sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-fallback-new-api' }, 'apply-and-plan', 'NATIVE_ROOT_NOT_CANDIDATE'],
    ['a UI manifest', {}, { role: 'ui', sourceRoot: NEW_ROOT.ui }, 'apply-and-plan', 'SOURCE_ROLE_REFUSED'],
    ['an old plan failing the reviewed schema check', { extra: true }, {}, 'apply-and-plan', 'FROM_PLAN_INVALID'],
    ['publish (not a staging operation)', {}, {}, 'publish', 'ARGUMENTS_REFUSED']
  ])('refuses %s', async (_name, fromPatch, manifestPatch, operation, code) => {
    const t = staged(fromPatch, manifestPatch);
    await expect(run(t.argv(operation), t.s.layout)).rejects.toMatchObject({ code });
    expect(existsSync(join(t.s.art, `native-plan-${operation}.json`))).toBe(false);
  });

  it('re-verifies the candidate API folder before writing', async () => {
    const t = staged();
    await expect(run(t.argv('verify'), t.s.layout, { verifySourceManifest: async () => { throw new TypeError('PREVIEW_SOURCE_INVENTORY_REFUSED'); } })).rejects.toThrow('PREVIEW_SOURCE_INVENTORY_REFUSED');
    expect(existsSync(join(t.s.art, 'native-plan-verify.json'))).toBe(false);
  });

  it('accepts the old plan from a root-only archive folder outside the artifacts folder', async () => {
    const t = staged();
    const archive = join(t.s.base, 'archive');
    mkdirSync(archive, { mode: 0o700 });
    const copy = t.s.write(join(archive, 'native-plan.before.json'), oldNativePlan());
    const plan = read(await run(['native-plan', '--operation', 'verify', '--from', copy.path, '--source-manifest', t.source.path, '--out', join(t.s.art, 'native-plan-verify.json')], t.s.layout));
    expect(plan.approval).toEqual(oldNativePlan().approval);
    expect(lstatSync(join(t.s.art, 'native-plan-verify.json')).isFile()).toBe(true);
  });
});
