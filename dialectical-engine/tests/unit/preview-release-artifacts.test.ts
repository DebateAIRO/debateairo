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
// Side-by-side spec §1: the new release's key, r<site version>-<first 12 hex of the UI source manifest's revision>.
const NEW_KEY = `r10-${newRevision.slice(0, 12)}`;
const publication = { publicationId: '11111111-1111-4111-8111-111111111111', publicationKind: 'GENERAL', baseRegisterVersion: '8', registerVersion: '9', requestSha256: digest, snapshotSha256: digest, rowCount: 68, recordedAt: '2026-10-06T12:00:00.000Z' };
// Release roots end in their service (side-by-side spec §10): the label is what sits between the kind and the service.
const OLD_ROOT = { api: '/opt/debateai-v3-preview/releases/auth-dev-candidate-old-v1-api', ui: '/opt/debateai-v3-preview/releases/auth-dev-candidate-old-v1-ui', runner: '/opt/debateai-v3-preview/releases/auth-dev-candidate-old-v1-runner' } as const;
const NEW_ROOT = { api: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-v1-api', ui: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-v1-ui', runner: '/opt/debateai-v3-preview/releases/auth-dev-candidate-new-v1-runner' } as const;
const ENV_ROOT = '/etc/debateai-v3-preview/auth-dev-v1';
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
  schema: 'preview-auth-dev-launch-v1', service, artifact: 'candidate', sourceRoot: OLD_ROOT[service], sourceRevision: revision, sourceTree: tree,
  serviceUid: 994, serviceGid: 977, sourceManifest: { path: '/opt/debateai-v3-preview/artifacts/old/api-source.json', sha256: 'c'.repeat(64) },
  nativeAttestation: { path: '/opt/debateai-v3-preview/artifacts/old/native.json', sha256: 'd'.repeat(64) },
  uiBuild: service === 'ui' ? { path: '/opt/debateai-v3-preview/artifacts/old/ui-build.json', sha256: 'e'.repeat(64) } : null,
  publication, operatorManifestSha256: 'f'.repeat(64),
  environment: { path: `${ENV_ROOT}/${service}-old-v1.env`, root: ENV_ROOT, uid: 0, gid: 977, mode: 0o640, parentUid: 0 },
  apiPort: '3101', uiPort: '3100', mailExecutable: `${OLD_ROOT[service]}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs`, mailFrom: 'noreply@dezbatere.ro'
});
const attestation = (patch: Record<string, unknown> = {}) => ({
  schema: 'preview-auth-dev-native-v1', sourceRevision: newRevision, sourceTree: newTree, nativeSourceSha256: '9'.repeat(64), verifiedAt: '2026-10-09T10:00:00.000Z', postgresMajor: 18,
  executorRole: 'debateai_prod_migrator', executorOid: 16388, ledgerOwnerOid: 16388, billingOwnerOid: 16388, defaultOwnerCount: 6, ledgerCount: 129,
  resolutionCount: 1, forwardCount: 1, catalogSha256: digest, ledgerSha256: digest, resolutionSha256: digest, forwardSha256: digest, cohortCount: 0,
  capabilityCounts: { debateai_runtime: 10 }, currentContractVerified: true, publication, databaseAhead: null, ...patch
});
const oldNativePlan = (patch: Record<string, unknown> = {}) => ({
  schema: 'preview-auth-dev-native-plan-v1', operation: 'verify', sourceRoot: OLD_ROOT.api, sourceRevision: revision, sourceTree: tree,
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
    expect(tool.parseArguments(['build-env', '--release-key', NEW_KEY])).toMatchObject({ command: 'build-env' });
    // Side-by-side spec §1: the website is built only for a named release.
    expect(() => tool.parseArguments(['build-env'])).toThrow(/ARGUMENTS_REFUSED/);
    expect(() => tool.parseArguments(['ui-build', '--source', '/x.json', '--out', '/y.json'])).toThrow(/ARGUMENTS_REFUSED/);
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
  const plan = { uiPort: '3100', apiPort: '3101', sourceRevision: newRevision }, pin = { registerVersion: '10' };
  it('are exactly what the reviewed runtime gate demands from ui.env, from the same constants', () => {
    expect(tool.UI_PUBLIC_BUILD_VALUES).toEqual({ NODE_ENV: 'production', PUBLIC_APP_URL: turnstile.PREVIEW_ORIGIN, NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: environment.PREVIEW_FREE_MODEL_IDS_JSON, TURNSTILE_SITE_KEY: turnstile.PREVIEW_SITE_KEY, RELEASE_KEY: tool.RELEASE_KEY_NOT_GIVEN });
    // The template's RELEASE_KEY is never a key: every build names its own (--release-key), and a build given the template refuses.
    expect(environment.RELEASE_KEY_PATTERN.test(tool.UI_PUBLIC_BUILD_VALUES.RELEASE_KEY)).toBe(false);
    expect(tool.uiPublicBuildValues(NEW_KEY, 'glm-only')).toEqual({ ...tool.UI_PUBLIC_BUILD_VALUES, RELEASE_KEY: NEW_KEY });
    expect(tool.UI_MODEL_ROSTERS).toEqual(['glm-only', 'multi-model', 'all-models']);
    for (const models of tool.UI_MODEL_ROSTERS) {
      const values = tool.uiPublicBuildValues(NEW_KEY, models), built = { builtModelRosterFlag: environment.PREVIEW_MODEL_ROSTER_FLAGS[models] };
      expect(values).toEqual({ ...tool.UI_PUBLIC_BUILD_VALUES, NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: environment.PREVIEW_MODEL_ROSTER_FLAGS[models], RELEASE_KEY: NEW_KEY });
      expect(() => environment.narrowEnvironment('ui', { ...values, ...runtimeOnly }, built, pin, plan)).not.toThrow();
      for (const key of Object.keys(values)) {
        expect(() => environment.narrowEnvironment('ui', { ...values, ...runtimeOnly, [key]: 'other' }, built, pin, plan)).toThrow();
      }
    }
    for (const models of ['multi', '', 'GLM-ONLY', 'constructor']) expect(() => tool.uiPublicBuildValues(NEW_KEY, models)).toThrow(/ARGUMENTS_REFUSED/);
    for (const key of [undefined, '', 'legacy', 'R10-CCCCCCCCCCCC', 'r10-cccccccccccc ', ['r0', 'cccccccccccc'].join('-'), tool.RELEASE_KEY_NOT_GIVEN]) expect(() => tool.uiPublicBuildValues(key, 'glm-only'), String(key)).toThrow(/RELEASE_KEY_REFUSED/);
  });

  it('the build child gets only the public values plus fixed tool settings, never a secret path or a stray public flag', () => {
    expect(Object.keys(tool.UI_BUILD_ENVIRONMENT).sort()).toEqual(['CI', 'LANG', 'LC_ALL', 'NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON', 'NEXT_TELEMETRY_DISABLED', 'NODE_ENV', 'PATH', 'PUBLIC_APP_URL', 'RELEASE_KEY', 'TURNSTILE_SITE_KEY', 'TZ']);
    expect(tool.UI_BUILD_ENVIRONMENT.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
  });

  it('build-env prints each value with its sha256 so ui.env can be compared by hash only', async () => {
    const report = await run(['build-env', '--release-key', NEW_KEY], tool.LAYOUT);
    expect(report.values.TURNSTILE_SITE_KEY).toEqual({ value: turnstile.PREVIEW_SITE_KEY, sha256: sha(turnstile.PREVIEW_SITE_KEY) });
    expect(report.values.RELEASE_KEY).toEqual({ value: NEW_KEY, sha256: sha(NEW_KEY) });
    expect(Object.keys(report.values)).toEqual(Object.keys(tool.UI_PUBLIC_BUILD_VALUES));
    expect(report.values.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON.value).toBe(environment.PREVIEW_MODEL_ROSTER_FLAGS['glm-only']);
    const multi = await run(['build-env', '--models', 'multi-model', '--release-key', NEW_KEY], tool.LAYOUT);
    expect(multi.values.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON).toEqual({ value: environment.PREVIEW_MODEL_ROSTER_FLAGS['multi-model'], sha256: sha(environment.PREVIEW_MODEL_ROSTER_FLAGS['multi-model']) });
    const all = await run(['build-env', '--release-key', NEW_KEY, '--models', 'all-models'], tool.LAYOUT);
    expect(all.values.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON).toEqual({ value: environment.PREVIEW_MODEL_ROSTER_FLAGS['all-models'], sha256: sha(environment.PREVIEW_MODEL_ROSTER_FLAGS['all-models']) });
    await expect(run(['build-env', '--models', 'everything', '--release-key', NEW_KEY], tool.LAYOUT)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    for (const key of ['legacy', 'R10-CCCCCCCCCCCC', 'r10-ccccccccccc'])
      await expect(run(['build-env', '--release-key', key], tool.LAYOUT), key).rejects.toMatchObject({ code: 'RELEASE_KEY_REFUSED' });
  });
});

describe('ui-build and verify', () => {
  it('verifies the root, builds with the fixed environment, re-verifies that no source byte changed, then writes', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui'));
    const events: string[] = [];
    const build = { schema: 'preview-auth-dev-ui-build-v1', buildId: 'x', files: [] };
    const out = join(s.art, 'candidate-ui-build.json');
    const result = await run(['ui-build', '--source', source.path, '--release-key', NEW_KEY, '--out', out], s.layout, {
      verifySourceManifest: async (_m: unknown, binding: any) => { events.push(`verify:${binding.manifestSha256}`); },
      buildUiArtifact: async (m: any, env: unknown) => { events.push('build'); expect(m.role).toBe('ui'); expect(env).toEqual({ ...tool.UI_BUILD_ENVIRONMENT, RELEASE_KEY: NEW_KEY, PATH: '/opt/node/bin:/usr/local/bin:/usr/bin:/bin' }); return build; },
      verifyUiBuildManifest: async () => { events.push('verify-build'); }, execPath: '/opt/node/bin/node'
    });
    expect(events).toEqual([`verify:${source.sha256}`, 'build', `verify:${source.sha256}`, 'verify-build']);
    expect(readFileSync(out, 'utf8')).toBe(JSON.stringify(build));
    expect(result.sha256).toBe(sha(JSON.stringify(build)));
  });

  it('--models multi-model builds with the reviewed two-list value; an unknown name refuses before anything runs', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui'));
    let seen: any;
    await run(['ui-build', '--source', source.path, '--models', 'multi-model', '--release-key', NEW_KEY, '--out', join(s.art, 'candidate-ui-build.json')], s.layout, {
      verifySourceManifest: async () => undefined, verifyUiBuildManifest: async () => undefined, execPath: '/opt/node/bin/node',
      buildUiArtifact: async (_m: unknown, env: any) => { seen = env; return { schema: 'preview-auth-dev-ui-build-v1' }; }
    });
    expect(seen).toEqual({ ...tool.UI_BUILD_ENVIRONMENT, NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON: environment.PREVIEW_MODEL_ROSTER_FLAGS['multi-model'], RELEASE_KEY: NEW_KEY, PATH: '/opt/node/bin:/usr/local/bin:/usr/bin:/bin' });
    const never = { verifySourceManifest: async () => { throw new Error('ran'); }, buildUiArtifact: async () => { throw new Error('ran'); } };
    await expect(run(['ui-build', '--source', source.path, '--models', 'all', '--release-key', NEW_KEY, '--out', join(s.art, 'other-ui-build.json')], s.layout, never)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    expect(existsSync(join(s.art, 'other-ui-build.json'))).toBe(false);
  });

  // Side-by-side spec §1, §7: the website bakes its release's code part in when it is built, so the key must be this source's.
  it('--release-key of another revision, or not a release key, refuses RELEASE_KEY_REFUSED before anything is verified or built', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui'));
    const never = { verifySourceManifest: async () => { throw new Error('ran'); }, buildUiArtifact: async () => { throw new Error('ran'); }, verifyUiBuildManifest: async () => { throw new Error('ran'); } };
    for (const key of [`r17-${'d'.repeat(12)}`, ['r10', 'cccccccccccd'].join('-'), 'legacy', 'R10-CCCCCCCCCCCC', 'r10-ccccccccccc', tool.RELEASE_KEY_NOT_GIVEN]) {
      await expect(run(['ui-build', '--source', source.path, '--release-key', key, '--out', join(s.art, 'candidate-ui-build.json')], s.layout, never), key).rejects.toMatchObject({ code: 'RELEASE_KEY_REFUSED' });
    }
    expect(existsSync(join(s.art, 'candidate-ui-build.json'))).toBe(false);
    // Any site version is admitted with this source's 12 hex (the number is checked when the release starts).
    let seen: any;
    await run(['ui-build', '--source', source.path, '--release-key', `r17-${newRevision.slice(0, 12)}`, '--out', join(s.art, 'candidate-ui-build.json')], s.layout, {
      verifySourceManifest: async () => undefined, verifyUiBuildManifest: async () => undefined, execPath: '/opt/node/bin/node',
      buildUiArtifact: async (_m: unknown, env: any) => { seen = env; return { schema: 'preview-auth-dev-ui-build-v1' }; }
    });
    expect(seen.RELEASE_KEY).toBe(`r17-${newRevision.slice(0, 12)}`);
  });

  it('writes nothing when the build changed an inventoried source byte', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-ui-source.json'), sourceManifest('ui'));
    let calls = 0;
    await expect(run(['ui-build', '--source', source.path, '--release-key', NEW_KEY, '--out', join(s.art, 'candidate-ui-build.json')], s.layout, {
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
    await expect(run(['ui-build', '--source', source.path, '--release-key', NEW_KEY, '--out', join(s.art, 'candidate-ui-build.json')], layout, never)).rejects.toMatchObject({ code: 'UI_BUILD_EXISTS' });
    const out = s.write(join(s.art, 'candidate-ui-build.json'), '{}').path;
    await expect(run(['ui-build', '--source', source.path, '--release-key', NEW_KEY, '--out', out], layout, never)).rejects.toMatchObject({ code: 'OUTPUT_EXISTS' });
  });

  it('refuses to build from a non-UI manifest', async () => {
    const s = server();
    const source = s.write(join(s.art, 'candidate-api-source.json'), sourceManifest('api'));
    await expect(run(['ui-build', '--source', source.path, '--release-key', NEW_KEY, '--out', join(s.art, 'b.json')], s.layout, { buildUiArtifact: async () => { throw new Error('built'); } })).rejects.toMatchObject({ code: 'SOURCE_ROLE_REFUSED' });
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
      const flags: Record<string, string | null> = { '--service': service, '--slot': 'A', '--from': from.path, '--root': NEW_ROOT[service], '--source-manifest': source.path, '--native-attestation': attest.path, '--out': join(s.art, `${service}-launch.json`), ...(service === 'ui' ? { '--ui-build': build.path } : {}), ...patch };
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
      operatorManifestSha256: manifestModule.operatorManifestSha256(sourceManifest('api')), mailExecutable: `${NEW_ROOT.api}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs`,
      environment: { ...oldPlan('api').environment, path: `${ENV_ROOT}/api-new-v1.env` } });
    expect(readFileSync(result.path, 'utf8')).toBe(JSON.stringify(plan));
    expect(statSync(result.path).mode & 0o7777).toBe(0o644);
  });

  // Side-by-side spec §6, §10: the slot alone names the ports, the release root alone names the env file.
  it('--slot B writes slot B\'s ports and the new release\'s own env file', async () => {
    const t = staged('api');
    const plan = JSON.parse(readFileSync((await run(t.argv({ '--slot': 'B' }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).path, 'utf8'));
    expect(plan).toMatchObject({ uiPort: '3200', apiPort: '3201', environment: { ...oldPlan('api').environment, path: `${ENV_ROOT}/api-new-v1.env` } });
  });
  it('takes the ports from the slot, never from --from', async () => {
    const t = staged('ui');
    const from = t.s.write(join(t.s.art, 'old-b-ui-launch.json'), { ...oldPlan('ui'), uiPort: '3200', apiPort: '3201' });
    const plan = JSON.parse(readFileSync((await run(t.argv({ '--from': from.path, '--slot': 'A' }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).path, 'utf8'));
    expect(plan).toMatchObject({ uiPort: '3100', apiPort: '3101', environment: { path: `${ENV_ROOT}/ui-new-v1.env` } });
  });
  // The transition (release T): R19's live plans predate per-release env files and name /etc/…/api.env.
  const r19Plan = (service: 'api' | 'ui' | 'runner') => {
    const root = `/opt/debateai-v3-preview/releases/auth-dev-candidate-r19x-${service}`;
    return { ...oldPlan(service), sourceRoot: root, mailExecutable: `${root}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs`,
      environment: { ...oldPlan(service).environment, path: `${ENV_ROOT}/${service}.env` } };
  };
  it.each(['api', 'ui', 'runner'] as const)('accepts an R19-shaped %s plan as --from and writes a valid new plan', async service => {
    const t = staged(service);
    const from = t.s.write(join(t.s.art, `r19-${service}-launch.json`), r19Plan(service));
    const plan = JSON.parse(readFileSync((await run(t.argv({ '--from': from.path }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).path, 'utf8'));
    expect(plan).toMatchObject({ sourceRoot: NEW_ROOT[service], uiPort: '3100', apiPort: '3101', environment: { ...oldPlan(service).environment, path: `${ENV_ROOT}/${service}-new-v1.env` } });
    expect(() => realValidator(t.s.layout)(plan)).not.toThrow();
  });
  it.each([
    ['another sender', { mailFrom: 'x@dezbatere.ro' }], ['a mixed port pair', { uiPort: '3100', apiPort: '3201' }], ['a root of another service', { sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-candidate-r19x-ui' }],
    ['an env file outside the env folder', { environment: { ...r19Plan('api').environment, root: '/etc' } }], ['an env file of the wrong group', { environment: { ...r19Plan('api').environment, gid: 1 } }]
  ])('still refuses an R19-shaped --from with %s', async (_name, patch) => {
    const t = staged('api');
    const from = t.s.write(join(t.s.art, 'r19-api-launch.json'), { ...r19Plan('api'), ...patch });
    await expect(run(t.argv({ '--from': from.path }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).rejects.toMatchObject({ code: 'FROM_PLAN_INVALID' });
    expect(existsSync(join(t.s.art, 'api-launch.json'))).toBe(false);
  });
  it.each([['no --slot', { '--slot': null }], ['--slot C', { '--slot': 'C' }], ['--slot a', { '--slot': 'a' }]])('refuses %s and writes nothing', async (_name, patch) => {
    const t = staged('api');
    await expect(run(t.argv(patch), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    expect(existsSync(join(t.s.art, 'api-launch.json'))).toBe(false);
  });

  it('binds the UI build for the website and a fallback root becomes artifact fallback', async () => {
    const t = staged('ui');
    const plan = JSON.parse(readFileSync((await run(t.argv(), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).path, 'utf8'));
    expect(plan.uiBuild).toEqual({ path: t.build.path, sha256: t.build.sha256 });
    const f = staged('runner');
    const fallbackRoot = '/opt/debateai-v3-preview/releases/auth-dev-fallback-new-v1-runner';
    const source = f.s.write(join(f.s.art, 'fallback-runner-source.json'), sourceManifest('runner', { sourceRoot: fallbackRoot }));
    const fallback = JSON.parse(readFileSync((await run(f.argv({ '--root': fallbackRoot, '--source-manifest': source.path }), f.s.layout, { validateLaunchPlan: realValidator(f.s.layout) })).path, 'utf8'));
    expect(fallback).toMatchObject({ artifact: 'fallback', sourceRoot: fallbackRoot, uiBuild: null, environment: { path: `${ENV_ROOT}/runner-new-v1.env` } });
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
    ['a root of another service', () => ({ '--root': NEW_ROOT.ui }), 'RELEASE_ROOT_REFUSED'],
    ['a root with no label', () => ({ '--root': '/opt/debateai-v3-preview/releases/auth-dev-candidate-api' }), 'RELEASE_ROOT_REFUSED'],
    ['a root whose label ends in a dash', () => ({ '--root': '/opt/debateai-v3-preview/releases/auth-dev-candidate-new--api' }), 'RELEASE_ROOT_REFUSED'],
    ['an out name for another service', (t: any) => ({ '--out': join(t.s.art, 'ui-launch.json') }), 'OUTPUT_PATH_REFUSED']
  ])('refuses %s and writes nothing', async (_name, patch, code) => {
    const t = staged('api');
    await expect(run(t.argv(patch(t)), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).rejects.toMatchObject({ code });
    expect(existsSync(join(t.s.art, 'api-launch.json'))).toBe(false);
  });

  it('refuses a UI plan without a build, or with the build of another root', async () => {
    const t = staged('ui');
    await expect(run(t.argv({ '--ui-build': null }), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    const other = t.s.write(join(t.s.art, 'other-build.json'), { schema: 'preview-auth-dev-ui-build-v1', sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-fallback-new-v1-ui', sourceRevision: newRevision, sourceTree: newTree, contractSha256: '8'.repeat(64) });
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
        environment: { path: '/etc/debateai-v3-preview/auth-dev-v1/runner-new-v1.env', root: '/etc/debateai-v3-preview/auth-dev-v1', uid: 0, gid: 975, mode: 0o640, parentUid: 0 },
        sourceRoot: NEW_ROOT.runner, sourceRevision: newRevision, sourceTree: newTree,
        sourceManifest: { path: t.source.path, sha256: t.source.sha256 }, nativeAttestation: { path: t.attest.path, sha256: t.attest.sha256 },
        operatorManifestSha256: manifestModule.operatorManifestSha256(sourceManifest('runner')), mailExecutable: `${NEW_ROOT.runner}/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs` });
      expect(plan.environment.mode).toBe(416);
    });
    it('a runner plan as --from keeps its own identity and never asks the account', async () => {
      const t = staged('runner');
      const plan = JSON.parse(readFileSync((await run(t.argv(), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout), lookupRunnerAccount: async () => { throw new Error('asked'); } })).path, 'utf8'));
      expect(plan).toMatchObject({ serviceUid: 994, serviceGid: 977, environment: { ...oldPlan('runner').environment, path: `${ENV_ROOT}/runner-new-v1.env` } });
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
    ['publish without a reviewed proposal', {}, {}, 'publish', 'ARGUMENTS_REFUSED']
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

describe('native-plan: publish kit v2 (plan -> owner review -> publish -> verify)', async () => {
  const kit = await import('../../deploy/' + 'preview-auth-dev/v1/publish-register-v2.ts');
  const registerModule = await import('@debateai/register');
  const observedAt = '2026-10-10T12:00:00.000Z';
  const newId = '33333333-3333-4333-8333-333333333333';
  const operatorDigest = manifestModule.operatorManifestSha256(sourceManifest('api'));
  /** A real v2 composition: the live 68-row shape with the answer-writer fingerprint still at v1. */
  async function composed() {
    const sourceRows = [...await kit.buildPreviewSourceRowsV2(await registerModule.loadBootstrapRegister(), { nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0', sourceRevision: newRevision, sourceTree: newTree, operatorSha256: operatorDigest, observedAt })];
    const owned = await import('../../packages/register/src/staff-access-policy.js');
    // The live shape: the answer-writer fingerprint still at v1, and the Node row measured by the previous release.
    const base = [...sourceRows.map((row: any) => row.rowKey === 'composerContractHash' ? { ...row, valueJsonText: '"d96e7cc959e51339eef149991c58aafd5605542b3bf13b70a9cd722f67e0c866"' }
      : row.rowKey === 'nodeRuntimeVersion' ? { ...row, sourceRef: `preview-auth-dev-v1 actual Node v26.8.2; measured 2026-10-08T09:34:59.910Z; source ${revision}/${tree}; operator sha256:${'f'.repeat(64)}` } : row),
      ...[owned.STAFF_ACCESS_POLICY_REGISTER_ROW, owned.INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map((row: any) => ({ rowKey: row.rowKey, valueJsonText: registerModule.canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }))];
    const baseSha = registerModule.computeRegisterSnapshotSha256([...base].sort((a: any, b: any) => a.rowKey.localeCompare(b.rowKey, 'en')));
    return kit.composePreviewSnapshotV2({ sourceRows, baseRows: base, baseRegisterVersion: '9', baseSnapshotSha256: baseSha });
  }
  const read = (result: { path: string }) => JSON.parse(readFileSync(result.path, 'utf8'));
  async function staged() {
    const snapshot = await composed();
    const live = { ...publication, registerVersion: '9', snapshotSha256: snapshot.baseSnapshotSha256 };
    const s = server();
    const from = s.write(join(s.art, 'native-plan-before.json'), oldNativePlan({ approval: { ...oldNativePlan().approval, publication: live } }));
    const source = s.write(join(s.art, 'candidate-api-source.json'), sourceManifest('api'));
    const nativePlan = (operation: string, extra: string[] = [], fromPath = from.path) => ['native-plan', '--operation', operation, '--from', fromPath, '--source-manifest', source.path, ...extra, '--out', join(s.art, `native-plan-${operation}.json`)];
    const plan = read(await run(nativePlan('plan'), s.layout));
    // What native-operator.mjs prints for `plan`, redirected to a file by the root shell (trailing newline).
    const proposalOf = (patch: (p: any) => void = () => {}) => { const p = JSON.parse(JSON.stringify(operator.snapshotProposal({ runtimeObservedAt: observedAt, source: sourceManifest('api'), plan, snapshot }))); patch(p); return p; };
    const writeProposal = (value: unknown, name = 'native-proposal.json') => s.write(join(s.art, name), `${JSON.stringify(value)}\n`);
    const newPublication = { publicationId: newId, publicationKind: 'GENERAL', baseRegisterVersion: '9', registerVersion: '10', requestSha256: digest, snapshotSha256: snapshot.snapshotSha256, rowCount: 68, recordedAt: '2026-10-10T12:05:00.000Z' };
    return { s, from, source, nativePlan, plan, snapshot, live, proposalOf, writeProposal, newPublication };
  }
  const deps = { randomUUID: () => newId };

  it('plan: composes from the publication the preview runs now, derived from the live verify plan', async () => {
    const t = await staged();
    expect(t.plan).toEqual({ ...oldNativePlan(), operation: 'plan', sourceRoot: NEW_ROOT.api, sourceRevision: newRevision, sourceTree: newTree,
      sourceManifest: { path: t.source.path, sha256: t.source.sha256 }, operatorManifestSha256: operatorDigest,
      selectedBaseRegisterVersion: '9', selectedBaseSnapshotSha256: t.live.snapshotSha256, approval: null });
    expect(operator.validateNativePlan(t.plan)).toEqual(t.plan);
  });

  it('publish: the approval is copied from the reviewed proposal, with a fresh publication id, and echoed', async () => {
    const t = await staged();
    const proposal = t.writeProposal(t.proposalOf());
    const result = await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], join(t.s.art, 'native-plan-plan.json')), t.s.layout, deps);
    const approval = { runtimeObservedAt: observedAt, baseRegisterVersion: '9', baseSnapshotSha256: t.snapshot.baseSnapshotSha256, snapshotSha256: t.snapshot.snapshotSha256, deltaSha256: t.snapshot.deltaSha256 };
    expect(read(result)).toEqual({ ...t.plan, operation: 'publish', publicationId: newId, approval });
    expect(result).toMatchObject({ publicationId: newId, approval });
    expect(t.proposalOf().changedKeys).toEqual(['composerContractHash', 'nodeRuntimeVersion']);
    // The approval has exactly the four keys publishPreviewRegister demands, plus runtimeObservedAt.
    const { runtimeObservedAt, ...binding } = read(result).approval;
    expect(Object.keys(binding).sort()).toEqual(['baseRegisterVersion', 'baseSnapshotSha256', 'deltaSha256', 'snapshotSha256']);
    expect(operator.validateNativePlan(read(result))).toBeTruthy();
  });

  it.each([
    ['a shown value changed after hashing', (p: any) => { p.delta[0].newValueJsonText = '"0000"'; }, 'PROPOSAL_REFUSED'],
    ['a shown value changed with its own hash redone (deltaSha256 stale)', (p: any) => { p.delta[0].newValueJsonText = '"0000"'; p.delta[0].newValueSha256 = sha('"0000"'); }, 'PROPOSAL_REFUSED'],
    ['a dropped delta entry', (p: any) => { p.delta = p.delta.slice(1); p.changedKeys = ['nodeRuntimeVersion']; }, 'PROPOSAL_REFUSED'],
    ['a mislabelled added key', (p: any) => { p.addedKeys = ['composerContractHash']; }, 'PROPOSAL_REFUSED'],
    ['an added entry that claims an old value', (p: any) => { p.delta[0].change = 'added'; p.addedKeys = ['composerContractHash']; p.changedKeys = ['nodeRuntimeVersion']; }, 'PROPOSAL_REFUSED'],
    ['a v1 proposal', (p: any) => { p.schema = 'preview-auth-dev-snapshot-proposal-v1'; }, 'PROPOSAL_REFUSED'],
    ['an unknown field', (p: any) => { p.extra = true; }, 'PROPOSAL_REFUSED'],
    ['a runtime time that is not the printed ISO form', (p: any) => { p.runtimeObservedAt = '2026-10-10T12:00:00Z'; }, 'PROPOSAL_REFUSED'],
    ['a runtime time edited after review', (p: any) => { p.runtimeObservedAt = '2026-10-10T12:00:01.000Z'; }, 'PROPOSAL_REFUSED'],
    ['a row count that disagrees with the keys', (p: any) => { p.rowCount = 67; }, 'PROPOSAL_REFUSED'],
    ['another base version', (p: any) => { p.baseRegisterVersion = '8'; }, 'PROPOSAL_MISMATCH'],
    ['another base snapshot', (p: any) => { p.baseSnapshotSha256 = digest; }, 'PROPOSAL_MISMATCH'],
    ['another operator digest', (p: any) => { p.operatorManifestSha256 = digest; }, 'PROPOSAL_MISMATCH'],
    ['another source revision', (p: any) => { p.sourceRevision = revision; }, 'PROPOSAL_MISMATCH']
  ])('publish refuses %s and writes nothing', async (_name, patch, code) => {
    const t = await staged();
    const proposal = t.writeProposal(t.proposalOf(patch));
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], join(t.s.art, 'native-plan-plan.json')), t.s.layout, deps)).rejects.toMatchObject({ code });
    expect(existsSync(join(t.s.art, 'native-plan-publish.json'))).toBe(false);
  });

  it.each([
    ['a publish from the live verify plan (no plan step)', (t: any) => t.from.path, 'FROM_PLAN_INVALID'],
    ['a publish from a plan of another source manifest', (t: any) => t.s.write(join(t.s.art, 'other-plan.json'), { ...t.plan, sourceManifest: { ...t.plan.sourceManifest, sha256: digest } }).path, 'PROPOSAL_MISMATCH'],
    ['a publish from a plan that already holds an approval', (t: any) => t.s.write(join(t.s.art, 'approved-plan.json'), { ...t.plan, approval: oldNativePlan().approval }).path, 'FROM_PLAN_INVALID']
  ])('refuses %s', async (_name, fromPath, code) => {
    const t = await staged();
    const proposal = t.writeProposal(t.proposalOf());
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], fromPath(t)), t.s.layout, deps)).rejects.toMatchObject({ code });
  });

  it('publish needs the owner\'s yes for exactly this delta', async () => {
    const t = await staged();
    const proposal = t.writeProposal(t.proposalOf());
    const planPath = join(t.s.art, 'native-plan-plan.json');
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path], planPath), t.s.layout, deps)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', 'yes'], planPath), t.s.layout, deps)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', digest], planPath), t.s.layout, deps)).rejects.toMatchObject({ code: 'PROPOSAL_NOT_APPROVED' });
    await expect(run(t.nativePlan('verify', ['--approved-delta-sha256', t.snapshot.deltaSha256]), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    expect(existsSync(join(t.s.art, 'native-plan-publish.json'))).toBe(false);
  });

  it('plan refuses an apply-and-plan source plan, a proposal, or a publication flag', async () => {
    const t = await staged();
    const applied = t.s.write(join(t.s.art, 'applied-plan.json'), { ...oldNativePlan(), operation: 'apply-and-plan', approval: null });
    await expect(run(t.nativePlan('plan', [], applied.path).with(-1, join(t.s.art, 'plan-2.json')), t.s.layout)).rejects.toMatchObject({ code: 'FROM_PLAN_INVALID' });
    const proposal = t.writeProposal(t.proposalOf());
    await expect(run(t.nativePlan('plan', ['--proposal', proposal.path]).with(-1, join(t.s.art, 'plan-3.json')), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    await expect(run(t.nativePlan('plan', ['--publication', proposal.path]).with(-1, join(t.s.art, 'plan-4.json')), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    for (const name of ['plan-2.json', 'plan-3.json', 'plan-4.json']) expect(existsSync(join(t.s.art, name))).toBe(false);
  });

  it('verify after publish: carries the new publication, so pin accepts the new launch plans', async () => {
    const t = await staged();
    const proposal = t.writeProposal(t.proposalOf());
    const publishPlan = await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], join(t.s.art, 'native-plan-plan.json')), t.s.layout, deps);
    const published = t.s.write(join(t.s.art, 'native-publish.json'), `${JSON.stringify(attestation({ publication: t.newPublication }))}\n`);
    const verify = read(await run(t.nativePlan('verify', ['--publication', published.path], publishPlan.path), t.s.layout));
    expect(verify).toEqual({ ...read(publishPlan), operation: 'verify', approval: { ...read(publishPlan).approval, publication: t.newPublication } });
    const entry = { sourceRevision: newRevision, sourceTree: newTree, operatorManifestSha256: operatorDigest, publication: t.newPublication };
    expect(prestart.checkNativePlan(verify, entry)).toEqual([]);
    expect(prestart.checkNativePlan(verify, { ...entry, publication: t.live })).toEqual(['publication']);
  });

  it.each([
    ['another publication id', (p: any) => ({ ...p, publicationId: '22222222-2222-4222-8222-222222222222' }), {}],
    ['another snapshot', (p: any) => ({ ...p, snapshotSha256: digest }), {}],
    ['another base', (p: any) => ({ ...p, baseRegisterVersion: '8' }), {}],
    ['another release', (p: any) => p, { sourceRevision: revision }]
  ])('verify refuses a publish output with %s', async (_name, change, attestationPatch) => {
    const t = await staged();
    const proposal = t.writeProposal(t.proposalOf());
    const publishPlan = await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], join(t.s.art, 'native-plan-plan.json')), t.s.layout, deps);
    const published = t.s.write(join(t.s.art, 'native-publish.json'), JSON.stringify(attestation({ publication: change(t.newPublication), ...attestationPatch })));
    await expect(run(t.nativePlan('verify', ['--publication', published.path], publishPlan.path), t.s.layout)).rejects.toMatchObject({ code: 'PUBLICATION_MISMATCH' });
    expect(existsSync(join(t.s.art, 'native-plan-verify.json'))).toBe(false);
  });

  it('verify with a publication refuses a source plan that did not publish', async () => {
    const t = await staged();
    const published = t.s.write(join(t.s.art, 'native-publish.json'), JSON.stringify(attestation({ publication: t.newPublication })));
    await expect(run(t.nativePlan('verify', ['--publication', published.path]), t.s.layout)).rejects.toMatchObject({ code: 'FROM_PLAN_INVALID' });
  });

  it('plan --checker deepseek --deepseek-enabled-on-gate yes: the plan carries the choice, and publish carries it on', async () => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-deepseek.json');
    const plan = read(await run(t.nativePlan('plan', ['--checker', 'deepseek', '--deepseek-enabled-on-gate', 'yes']).with(-1, out), t.s.layout));
    expect(plan).toEqual({ ...t.plan, checkerChoice: { checker: 'deepseek', deepseekEnabledOnGate: true } });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
    const proposal = t.writeProposal(t.proposalOf());
    const publish = read(await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], out), t.s.layout, deps));
    expect(publish.checkerChoice).toEqual({ checker: 'deepseek', deepseekEnabledOnGate: true });
    expect(operator.validateNativePlan(publish)).toEqual(publish);
    // --checker glm is the default: no field at all, the plan is the one without the flag.
    const glm = read(await run(t.nativePlan('plan', ['--checker', 'glm']).with(-1, join(t.s.art, 'native-plan-glm.json')), t.s.layout));
    expect(glm).toEqual(t.plan);
  });

  it.each([
    ['deepseek without the acknowledgement', 'plan', ['--checker', 'deepseek'], 'CHECKER_DEEPSEEK_NOT_ENABLED_ON_GATE'],
    ['deepseek with another acknowledgement', 'plan', ['--checker', 'deepseek', '--deepseek-enabled-on-gate', 'true'], 'CHECKER_DEEPSEEK_NOT_ENABLED_ON_GATE'],
    ['an unknown checker', 'plan', ['--checker', 'mimo', '--deepseek-enabled-on-gate', 'yes'], 'ARGUMENTS_REFUSED'],
    ['the acknowledgement without the checker', 'plan', ['--deepseek-enabled-on-gate', 'yes'], 'ARGUMENTS_REFUSED'],
    ['the acknowledgement with the GLM checker', 'plan', ['--checker', 'glm', '--deepseek-enabled-on-gate', 'yes'], 'ARGUMENTS_REFUSED'],
    ['a checker on verify', 'verify', ['--checker', 'deepseek', '--deepseek-enabled-on-gate', 'yes'], 'ARGUMENTS_REFUSED'],
    ['a checker on apply-and-plan', 'apply-and-plan', ['--checker', 'deepseek', '--deepseek-enabled-on-gate', 'yes'], 'ARGUMENTS_REFUSED']
  ])('refuses %s and writes nothing', async (_name, operation, extra, code) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code });
    expect(existsSync(out)).toBe(false);
  });

  it('the native plan check accepts the DeepSeek choice only exactly, and only on plan and publish', async () => {
    const t = await staged();
    const choice = { checker: 'deepseek', deepseekEnabledOnGate: true };
    expect(operator.validateNativePlan({ ...t.plan, checkerChoice: { deepseekEnabledOnGate: true, checker: 'deepseek' } })).toBeTruthy();
    for (const bad of [{ checker: 'deepseek' }, { checker: 'glm' }, { ...choice, deepseekEnabledOnGate: 'yes' }, { ...choice, extra: 1 }, null, 'deepseek']) {
      expect(() => operator.validateNativePlan({ ...t.plan, checkerChoice: bad })).toThrow();
    }
    for (const operation of ['verify', 'apply-and-plan']) expect(() => operator.validateNativePlan({ ...t.plan, operation, checkerChoice: choice })).toThrow();
  });

  it('plan --role-rotation off: the plan carries the choice, publish carries it on, and on is the default', async () => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-rotation-off.json');
    const plan = read(await run(t.nativePlan('plan', ['--role-rotation', 'off']).with(-1, out), t.s.layout));
    expect(plan).toEqual({ ...t.plan, roleRotation: 'off' });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
    const proposal = t.writeProposal(t.proposalOf());
    const publish = read(await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], out), t.s.layout, deps));
    expect(publish.roleRotation).toBe('off');
    expect(operator.validateNativePlan(publish)).toEqual(publish);
    // --role-rotation on is the default: no field at all, the plan is the one without the flag.
    const on = read(await run(t.nativePlan('plan', ['--role-rotation', 'on']).with(-1, join(t.s.art, 'native-plan-rotation-on.json')), t.s.layout));
    expect(on).toEqual(t.plan);
    // It combines with the DeepSeek checker choice.
    const both = read(await run(t.nativePlan('plan', ['--checker', 'deepseek', '--deepseek-enabled-on-gate', 'yes', '--role-rotation', 'off']).with(-1, join(t.s.art, 'native-plan-both.json')), t.s.layout));
    expect(both).toEqual({ ...t.plan, checkerChoice: { checker: 'deepseek', deepseekEnabledOnGate: true }, roleRotation: 'off' });
    expect(operator.validateNativePlan(both)).toEqual(both);
  });

  it.each([
    ['an unknown value', 'plan', ['--role-rotation', 'no']],
    ['upper case', 'plan', ['--role-rotation', 'OFF']],
    ['a switch on verify', 'verify', ['--role-rotation', 'off']],
    ['a switch on apply-and-plan', 'apply-and-plan', ['--role-rotation', 'off']]
  ])('refuses the role rotation switch with %s and writes nothing', async (_name, operation, extra) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    expect(existsSync(out)).toBe(false);
  });

  it('the native plan check accepts the role rotation choice only as \'off\', and only on plan and publish', async () => {
    const t = await staged();
    expect(operator.validateNativePlan({ ...t.plan, roleRotation: 'off' })).toBeTruthy();
    for (const bad of ['on', 'OFF', false, true, null, { roleRotation: 'off' }]) {
      expect(() => operator.validateNativePlan({ ...t.plan, roleRotation: bad })).toThrow();
    }
    for (const operation of ['verify', 'apply-and-plan']) expect(() => operator.validateNativePlan({ ...t.plan, operation, roleRotation: 'off' })).toThrow();
  });

  /** Parallel calls (Task 16): the owner's start values, and the preview's off switch (values equal to an absent row). */
  const CONCURRENCY = { perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } };
  const CONCURRENCY_OFF = { perDebate: 1, perModelPerDebate: 1, perModelPerRunner: { default: 1000 } };
  /** Malformed values: each one the register's own parser refuses too (checked below). */
  const BAD_CONCURRENCY: [string, unknown][] = [
    ['perDebate above 64', { ...CONCURRENCY, perDebate: 65 }],
    ['perDebate 0', { ...CONCURRENCY, perDebate: 0 }],
    ['a fraction', { ...CONCURRENCY, perDebate: 1.5 }],
    ['a number as text', { ...CONCURRENCY, perDebate: '12' }],
    ['perModelPerDebate above 16', { ...CONCURRENCY, perModelPerDebate: 17 }],
    ['a runner limit above 1000', { ...CONCURRENCY, perModelPerRunner: { default: 1001 } }],
    ['a runner limit of 0', { ...CONCURRENCY, perModelPerRunner: { default: 50, deepinfra: 0 } }],
    ['no default', { ...CONCURRENCY, perModelPerRunner: { deepinfra: 150 } }],
    ['an upper-case vendor', { ...CONCURRENCY, perModelPerRunner: { default: 50, DeepInfra: 150 } }],
    ['a vendor with an underscore', { ...CONCURRENCY, perModelPerRunner: { default: 50, deep_infra: 150 } }],
    ['runner limits as an array', { ...CONCURRENCY, perModelPerRunner: [50] }],
    ['a missing key', { perDebate: 12, perModelPerRunner: { default: 50 } }],
    ['an extra key', { ...CONCURRENCY, perRunner: 5 }],
    ['the row kind inside', { kind: 'CALL_CONCURRENCY_POLICY', ...CONCURRENCY }],
    ['null', null],
    ['an array', [CONCURRENCY]],
    ['a number', 12]
  ];

  it('plan --call-concurrency: the plan carries the policy, publish carries it on, and none is the default', async () => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-concurrency.json');
    const plan = read(await run(t.nativePlan('plan', ['--call-concurrency', JSON.stringify(CONCURRENCY)]).with(-1, out), t.s.layout));
    expect(plan).toEqual({ ...t.plan, callConcurrency: CONCURRENCY });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
    const proposal = t.writeProposal(t.proposalOf());
    const publish = read(await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], out), t.s.layout, deps));
    expect(publish.callConcurrency).toEqual(CONCURRENCY);
    expect(operator.validateNativePlan(publish)).toEqual(publish);
    // The preview's off switch is a value like any other (the row stays, with values equal to absent).
    const off = read(await run(t.nativePlan('plan', ['--call-concurrency', JSON.stringify(CONCURRENCY_OFF)]).with(-1, join(t.s.art, 'native-plan-concurrency-off.json')), t.s.layout));
    expect(off).toEqual({ ...t.plan, callConcurrency: CONCURRENCY_OFF });
    // Spaces and key order as typed do not matter: the plan holds the policy in one fixed order.
    const typed = '{ "perModelPerRunner": { "deepinfra": 150, "anthropic": 50, "default": 50 }, "perModelPerDebate": 3, "perDebate": 12 }';
    const reordered = await run(t.nativePlan('plan', ['--call-concurrency', typed]).with(-1, join(t.s.art, 'native-plan-concurrency-typed.json')), t.s.layout);
    expect(readFileSync(reordered.path, 'utf8')).toBe(readFileSync(out, 'utf8'));
    // It combines with the checker choice and the rotation switch.
    const all = read(await run(t.nativePlan('plan', ['--checker', 'deepseek', '--deepseek-enabled-on-gate', 'yes', '--role-rotation', 'off', '--call-concurrency', JSON.stringify(CONCURRENCY)]).with(-1, join(t.s.art, 'native-plan-all.json')), t.s.layout));
    expect(all).toEqual({ ...t.plan, checkerChoice: { checker: 'deepseek', deepseekEnabledOnGate: true }, roleRotation: 'off', callConcurrency: CONCURRENCY });
    expect(operator.validateNativePlan(all)).toEqual(all);
    // A plan without the option is byte for byte the plan this tool always wrote: no field at all.
    expect(Object.hasOwn(t.plan, 'callConcurrency')).toBe(false);
    const again = await run(t.nativePlan('plan').with(-1, join(t.s.art, 'native-plan-again.json')), t.s.layout);
    expect(readFileSync(again.path, 'utf8')).toBe(JSON.stringify(t.plan));
  });

  it.each([
    ['text that is not JSON', 'plan', ['--call-concurrency', 'perDebate=12']],
    ['JSON with a duplicate key', 'plan', ['--call-concurrency', '{"perDebate":12,"perDebate":13,"perModelPerDebate":3,"perModelPerRunner":{"default":50}}']],
    ...BAD_CONCURRENCY.map(([name, value]) => [name, 'plan', ['--call-concurrency', JSON.stringify(value)]] as [string, string, string[]]),
    ['the option on verify', 'verify', ['--call-concurrency', JSON.stringify(CONCURRENCY)]],
    ['the option on apply-and-plan', 'apply-and-plan', ['--call-concurrency', JSON.stringify(CONCURRENCY)]]
  ])('refuses --call-concurrency with %s and writes nothing', async (_name, operation, extra) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--call-concurrency'] });
    expect(existsSync(out)).toBe(false);
  });

  /** Debate shape (P2b Task 6): the owners' start values, with their kind, as the operator would type them. */
  const SHAPE = JSON.parse(JSON.stringify(registerModule.debateShapePolicyStartValues()));

  it('plan --debate-shape: the plan carries the policy or the word off, publish carries it on, and none is the default', async () => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-shape.json');
    const plan = read(await run(t.nativePlan('plan', ['--debate-shape', JSON.stringify(SHAPE)]).with(-1, out), t.s.layout));
    expect(plan).toEqual({ ...t.plan, debateShape: SHAPE });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
    const proposal = t.writeProposal(t.proposalOf());
    const publish = read(await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], out), t.s.layout, deps));
    expect(publish.debateShape).toEqual(SHAPE);
    const off = read(await run(t.nativePlan('plan', ['--debate-shape', 'off']).with(-1, join(t.s.art, 'native-plan-shape-off.json')), t.s.layout));
    expect(off).toEqual({ ...t.plan, debateShape: 'off' });
    expect(Object.hasOwn(t.plan, 'debateShape')).toBe(false);
  });

  it.each([
    ['text that is neither off nor JSON', 'plan', ['--debate-shape', 'OFF']],
    ['a JSON array', 'plan', ['--debate-shape', '[1]']],
    ['JSON null', 'plan', ['--debate-shape', 'null']],
    ['a JSON string other than off', 'plan', ['--debate-shape', '"on"']],
    ['the option on verify', 'verify', ['--debate-shape', 'off']],
    ['the option on apply-and-plan', 'apply-and-plan', ['--debate-shape', 'off']]
  ])('refuses --debate-shape with %s and writes nothing', async (_name, operation, extra) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--debate-shape'] });
    expect(existsSync(out)).toBe(false);
  });

  /** Question language (P2L Task 12): the owners' start values, with their kind, as the operator would type them. */
  const LANGUAGE = JSON.parse(JSON.stringify(registerModule.questionLanguagePolicyStartValues()));

  it('plan --question-language: the plan carries the policy, publish carries it on, and none is the default', async () => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-language.json');
    const plan = read(await run(t.nativePlan('plan', ['--question-language', JSON.stringify(LANGUAGE)]).with(-1, out), t.s.layout));
    expect(plan).toEqual({ ...t.plan, questionLanguage: LANGUAGE });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
    const proposal = t.writeProposal(t.proposalOf());
    const publish = read(await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], out), t.s.layout, deps));
    expect(publish.questionLanguage).toEqual(LANGUAGE);
    // The fast check switched off is a policy, never a word.
    const off = { ...LANGUAGE, fastCheck: null };
    const offPlan = read(await run(t.nativePlan('plan', ['--question-language', JSON.stringify(off)]).with(-1, join(t.s.art, 'native-plan-language-off.json')), t.s.layout));
    expect(offPlan).toEqual({ ...t.plan, questionLanguage: off });
    expect(Object.hasOwn(t.plan, 'questionLanguage')).toBe(false);
  });

  it.each([
    ['the word off', 'plan', ['--question-language', 'off']],
    ['a JSON array', 'plan', ['--question-language', '[1]']],
    ['JSON null', 'plan', ['--question-language', 'null']],
    ['a JSON string', 'plan', ['--question-language', '"off"']],
    ['the option on verify', 'verify', ['--question-language', '{}']],
    ['the option on apply-and-plan', 'apply-and-plan', ['--question-language', '{}']]
  ])('refuses --question-language with %s and writes nothing', async (_name, operation, extra) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--question-language'] });
    expect(existsSync(out)).toBe(false);
  });

  /** Length guidance (LG-C): the owners' start values, with their kind, as the operator would type them. */
  const LENGTH = JSON.parse(JSON.stringify(registerModule.lengthGuidancePolicyStartValues()));

  it('plan --length-guidance: the plan carries the policy, publish carries it on, and none is the default', async () => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-length.json');
    const plan = read(await run(t.nativePlan('plan', ['--length-guidance', JSON.stringify(LENGTH)]).with(-1, out), t.s.layout));
    expect(plan).toEqual({ ...t.plan, lengthGuidance: LENGTH });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
    const proposal = t.writeProposal(t.proposalOf());
    const publish = read(await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], out), t.s.layout, deps));
    expect(publish.lengthGuidance).toEqual(LENGTH);
    expect(Object.hasOwn(t.plan, 'lengthGuidance')).toBe(false);
  });

  it.each([
    ['text that is not JSON', 'plan', ['--length-guidance', 'on']],
    ['a JSON array', 'plan', ['--length-guidance', '[1]']],
    ['JSON null', 'plan', ['--length-guidance', 'null']],
    // Task 8 review 8: a JSON string (the "off" word does not exist) and the other operation that may not carry it.
    ['a JSON string', 'plan', ['--length-guidance', '"off"']],
    ['the option on verify', 'verify', ['--length-guidance', '{}']],
    ['the option on apply-and-plan', 'apply-and-plan', ['--length-guidance', '{}']]
  ])('refuses --length-guidance with %s and writes nothing', async (_name, operation, extra) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--length-guidance'] });
    expect(existsSync(out)).toBe(false);
  });

  /**
   * Side-by-side spec §13, addition D23 (owner 2026-10-22; fix round 1 of SA9): the line-up and the answer seats. `--line-up`
   * names a root-owned JSON file holding the plan member `check-thinking-levels --print-line-up` prints, or the bare line-up;
   * `--answer-seats` is one JSON object. Both on `plan` only; publish carries the plan's values unchanged.
   */
  const LINE_UP = { free_model_ids: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash'],
    premium_model_ids: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash', 'XiaomiMiMo/MiMo-V2.6-Pro', 'Qwen/Qwen3.8-Flash', 'claude-haiku-5-5'],
    thinking_levels: JSON.parse(`{"zai-org/GLM-5.3-Flash":{"level":"high"},"deepseek-ai/DeepSeek-V4.1-Flash":{"level":"none"},"Qwen/Qwen3.8-Flash":{"level":"medium"},"XiaomiMiMo/MiMo-V2.6-Pro":{"level":"default","steps":{"pros_cons":"none","cross_exchange":"none"}},"claude-haiku-5-5":{"level":"medium","steps":{"judge_panel":"high","reviewer":"high","answer_checker":"high","story_checker":"high","answer_writer":"high","story_writer":"high","slip_fix":"medium"}}}`) };
  const SEATS = { writer: 'preview:claude-haiku-5-5', checker: 'preview:fixture-b' };

  it('plan --line-up <file> and --answer-seats: the plan carries both, publish carries them on, and none is the default', async () => {
    const t = await staged();
    const member = t.s.write(join(t.s.art, 'line-up-member.json'), `${JSON.stringify({ lineUp: LINE_UP })}\n`);
    const out = join(t.s.art, 'native-plan-line-up.json');
    const plan = read(await run(t.nativePlan('plan', ['--line-up', member.path, '--answer-seats', JSON.stringify(SEATS)]).with(-1, out), t.s.layout));
    expect(plan).toEqual({ ...t.plan, lineUp: LINE_UP, answerSeats: SEATS });
    expect(operator.validateNativePlan(plan)).toEqual(plan);
    const proposal = t.writeProposal(t.proposalOf());
    const publish = read(await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], out), t.s.layout, deps));
    expect(publish.lineUp).toEqual(LINE_UP);
    expect(publish.answerSeats).toEqual(SEATS);
    expect(operator.validateNativePlan(publish)).toBeTruthy();
    // The bare line-up object is accepted too, and gives the same plan member.
    const bare = t.s.write(join(t.s.art, 'line-up-bare.json'), JSON.stringify(LINE_UP));
    expect(read(await run(t.nativePlan('plan', ['--line-up', bare.path]).with(-1, join(t.s.art, 'native-plan-bare.json')), t.s.layout))).toEqual({ ...t.plan, lineUp: LINE_UP });
    expect(Object.hasOwn(t.plan, 'lineUp')).toBe(false);
    expect(Object.hasOwn(t.plan, 'answerSeats')).toBe(false);
  });

  it.each([
    ['a member with another key beside lineUp', { lineUp: LINE_UP, extra: true }],
    ['a line-up missing its table member', { free_model_ids: LINE_UP.free_model_ids, premium_model_ids: LINE_UP.premium_model_ids }],
    ['a roster that is not a list', { ...LINE_UP, free_model_ids: 'GLM' }],
    ['a JSON array', [LINE_UP]],
    ['a JSON string', 'off'],
    ['an empty object', {}]
  ])('refuses --line-up with %s and writes nothing', async (_name, value) => {
    const t = await staged();
    const file = t.s.write(join(t.s.art, 'line-up-bad.json'), JSON.stringify(value));
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan('plan', ['--line-up', file.path]).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--line-up'] });
    expect(existsSync(out)).toBe(false);
  });

  it.each([
    ['the option on publish (publish takes them only from its --from plan)', 'publish'], ['the option on verify', 'verify'], ['the option on apply-and-plan', 'apply-and-plan']
  ])('refuses --line-up and --answer-seats on %s and writes nothing', async (_name, operation) => {
    const t = await staged();
    const file = t.s.write(join(t.s.art, 'line-up-member.json'), JSON.stringify({ lineUp: LINE_UP }));
    const review = operation === 'publish' ? ['--proposal', t.writeProposal(t.proposalOf()).path, '--approved-delta-sha256', t.snapshot.deltaSha256] : [];
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, [...review, '--line-up', file.path]).with(-1, out), t.s.layout, deps)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--line-up'] });
    await expect(run(t.nativePlan(operation, [...review, '--answer-seats', JSON.stringify(SEATS)]).with(-1, out), t.s.layout, deps)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--answer-seats'] });
    expect(existsSync(out)).toBe(false);
  });

  it.each([
    ['text that is not JSON', ['--answer-seats', 'haiku']],
    ['JSON null', ['--answer-seats', 'null']],
    ['no checker', ['--answer-seats', JSON.stringify({ writer: SEATS.writer })]],
    ['an extra seat', ['--answer-seats', JSON.stringify({ ...SEATS, judge: SEATS.writer })]],
    // Ruling R27b: one AI must not check its own answer.
    ['the writer as its own checker', ['--answer-seats', JSON.stringify({ writer: SEATS.writer, checker: SEATS.writer })]],
    // Ruling R28 (final fix wave F3): nor the storyteller its own story (storyteller ?? writer vs storyChecker ?? checker).
    ['the storyteller as its own story checker', ['--answer-seats', JSON.stringify({ ...SEATS, storyteller: 'preview:deepseek-v4-1-flash', storyChecker: 'preview:deepseek-v4-1-flash' })]],
    ['a storyteller seated on the checker', ['--answer-seats', JSON.stringify({ ...SEATS, storyteller: SEATS.checker })]],
    // One way to set the checker.
    ['beside --checker', ['--answer-seats', JSON.stringify(SEATS), '--checker', 'glm']],
    ['beside --checker deepseek', ['--answer-seats', JSON.stringify(SEATS), '--checker', 'deepseek', '--deepseek-enabled-on-gate', 'yes']]
  ])('refuses --answer-seats with %s and writes nothing', async (_name, extra) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan('plan', extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--answer-seats'] });
    expect(existsSync(out)).toBe(false);
  });

  it('refuses the option on publish: publish takes the policy only from its --from plan', async () => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-concurrency.json');
    await run(t.nativePlan('plan', ['--call-concurrency', JSON.stringify(CONCURRENCY)]).with(-1, out), t.s.layout);
    const proposal = t.writeProposal(t.proposalOf());
    const refused = join(t.s.art, 'native-plan-publish-refused.json');
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256, '--call-concurrency', JSON.stringify(CONCURRENCY_OFF)], out).with(-1, refused), t.s.layout, deps))
      .rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--call-concurrency'] });
    expect(existsSync(refused)).toBe(false);
  });

  it('publish refuses a --from plan whose policy was edited by hand into a malformed value', async () => {
    const t = await staged();
    const edited = t.s.write(join(t.s.art, 'native-plan-edited.json'), JSON.stringify({ ...t.plan, callConcurrency: { ...CONCURRENCY, perDebate: 65 } }));
    const proposal = t.writeProposal(t.proposalOf());
    const out = join(t.s.art, 'native-plan-publish.json');
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], edited.path), t.s.layout, deps)).rejects.toMatchObject({ code: 'FROM_PLAN_INVALID' });
    expect(existsSync(out)).toBe(false);
  });

  it('the native plan check accepts the call-concurrency policy only well formed, and only on plan and publish', async () => {
    const t = await staged();
    const registerModule = await import('@debateai/register');
    for (const good of [CONCURRENCY, CONCURRENCY_OFF, { perDebate: 64, perModelPerDebate: 16, perModelPerRunner: { default: 1000, 'a-1': 1 } }]) {
      expect(operator.validateNativePlan({ ...t.plan, callConcurrency: good })).toBeTruthy();
      expect(operator.validateNativePlan({ ...t.plan, operation: 'publish', callConcurrency: good })).toBeTruthy();
      // The register's own parser (the authority the publisher checks with again) accepts the same value.
      expect(registerModule.callConcurrencyPolicyFromValue({ kind: 'CALL_CONCURRENCY_POLICY', ...good })).toEqual(good);
    }
    for (const [name, bad] of BAD_CONCURRENCY) {
      expect(() => operator.validateNativePlan({ ...t.plan, callConcurrency: bad }), name).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
      // Never stricter than the authority by accident: the register's parser refuses every one of them too
      // (the row kind inside is the one difference: the plan names the three values, the row adds its kind).
      if (name !== 'the row kind inside') expect(() => registerModule.callConcurrencyPolicyFromValue(bad !== null && typeof bad === 'object' && !Array.isArray(bad) ? { kind: 'CALL_CONCURRENCY_POLICY', ...bad } : bad), name).toThrow('CALL_CONCURRENCY_POLICY_INVALID');
    }
    for (const operation of ['verify', 'apply-and-plan']) {
      expect(() => operator.validateNativePlan({ ...t.plan, operation, callConcurrency: CONCURRENCY })).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
    }
  });

  it('launch-plan --publication: the new publication replaces the old one and the proof must bind to it', async () => {
    const t = await staged();
    const published = t.s.write(join(t.s.art, 'native-publish.json'), JSON.stringify(attestation({ publication: t.newPublication })));
    const from = t.s.write(join(t.s.art, 'old-runner-launch.json'), oldPlan('runner'));
    const source = t.s.write(join(t.s.art, 'candidate-runner-source.json'), sourceManifest('runner'));
    const argv = (proof: string) => ['launch-plan', '--service', 'runner', '--slot', 'A', '--from', from.path, '--root', NEW_ROOT.runner, '--source-manifest', source.path, '--native-attestation', proof, '--publication', published.path, '--out', join(t.s.art, 'runner-launch.json')];
    const stale = t.s.write(join(t.s.art, 'native-old-verify.json'), JSON.stringify(attestation()));
    await expect(run(argv(stale.path), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) })).rejects.toMatchObject({ code: 'NATIVE_ATTESTATION_MISMATCH' });
    const fresh = t.s.write(join(t.s.art, 'native-first-verify.json'), JSON.stringify(attestation({ publication: t.newPublication })));
    const plan = read(await run(argv(fresh.path), t.s.layout, { validateLaunchPlan: realValidator(t.s.layout) }));
    expect(plan.publication).toEqual(t.newPublication);
    expect(plan).toMatchObject({ service: 'runner', sourceRoot: NEW_ROOT.runner, nativeAttestation: { path: fresh.path, sha256: fresh.sha256 } });
  });
});

describe('native-plan: the hosted preview (publish kit v3, owner rulings 2026-10-13)', async () => {
  const kit = await import('../../deploy/' + 'preview-auth-dev/v1/publish-register-v3.ts');
  const kitV2 = await import('../../deploy/' + 'preview-auth-dev/v1/publish-register-v2.ts');
  const registerModule = await import('@debateai/register');
  const owned = await import('../../packages/register/src/staff-access-policy.js');
  const observedAt = '2026-10-13T12:00:00.000Z';
  const newId = '44444444-4444-4444-8444-444444444444';
  const operatorDigest = manifestModule.operatorManifestSha256(sourceManifest('api'));
  /** The owner's suggested ceilings (pending confirmation): $3 per debate, $10 per day; the kit's example room-read budget. */
  const HOSTED = { billing: 'off', perRunCeilingMicros: 3_000_000, dailyCeilingMicros: 10_000_000, askRoomReads: { limit: 60, windowMs: 60_000, capacity: 65_536 } };
  const HOSTED_ON = { ...HOSTED, billing: 'on' };
  const BAD_HOSTED: [string, unknown][] = [
    ['billing as a boolean', { ...HOSTED, billing: true }],
    ['billing in upper case', { ...HOSTED, billing: 'ON' }],
    ['a per-run ceiling above the day', { ...HOSTED, perRunCeilingMicros: 10_000_001 }],
    ['a zero day', { ...HOSTED, dailyCeilingMicros: 0 }],
    ['a ceiling as text', { ...HOSTED, perRunCeilingMicros: '3000000' }],
    ['a fractional ceiling', { ...HOSTED, perRunCeilingMicros: 2_999_999.5 }],
    ['a day past the sanity bound', { ...HOSTED, dailyCeilingMicros: 200_000_001 }],
    ['a run past the sanity bound', { ...HOSTED, perRunCeilingMicros: 50_000_001, dailyCeilingMicros: 200_000_000 }],
    ['the room read in the register spelling', { ...HOSTED, askRoomReads: { key: 'owner', limit: 60, window_ms: 60_000, capacity: 65_536 } }],
    ['the room read without its window', { ...HOSTED, askRoomReads: { limit: 60, capacity: 65_536 } }],
    ['a room-read capacity past the register bound', { ...HOSTED, askRoomReads: { ...HOSTED.askRoomReads, capacity: 1_048_577 } }],
    ['a missing key', { billing: 'off', perRunCeilingMicros: 3_000_000, askRoomReads: HOSTED.askRoomReads }],
    ['an extra key', { ...HOSTED, stageClockOffsetDays: 31 }],
    ['null', null],
    ['an array', [HOSTED]]
  ];
  const sortedRows = (rows: any[]) => [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey, 'en'));
  /** A real v3 composition over the live register 12 shape (kit v2's local rows, billing off). */
  async function composed(choice: unknown) {
    const runtime = { nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0', sourceRevision: newRevision, sourceTree: newTree, operatorSha256: operatorDigest, observedAt };
    const bootstrap = await registerModule.loadBootstrapRegister();
    const base = sortedRows([...(await kitV2.buildPreviewSourceRowsV2(bootstrap, runtime)).map((row: any) => row.rowKey === 'nodeRuntimeVersion' ? { ...row, sourceRef: `preview-auth-dev-v1 actual Node v26.8.2; measured 2026-10-12T09:00:00.000Z; source ${revision}/${tree}; operator sha256:${'f'.repeat(64)}` } : row),
      ...[owned.STAFF_ACCESS_POLICY_REGISTER_ROW, owned.INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map((row: any) => ({ rowKey: row.rowKey, valueJsonText: registerModule.canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }))]);
    return kit.composePreviewSnapshotV3({ sourceRows: await kit.buildPreviewSourceRowsV3(bootstrap, runtime, choice), baseRows: base, baseRegisterVersion: '12', baseSnapshotSha256: registerModule.computeRegisterSnapshotSha256(base) });
  }
  const read = (result: { path: string }) => JSON.parse(readFileSync(result.path, 'utf8'));
  async function staged(choice: Record<string, unknown> = HOSTED) {
    const snapshot = await composed(choice);
    const live = { ...publication, baseRegisterVersion: '11', registerVersion: '12', snapshotSha256: snapshot.baseSnapshotSha256 };
    const s = server();
    const from = s.write(join(s.art, 'native-plan-before.json'), oldNativePlan({ selectedBaseRegisterVersion: '11', approval: { ...oldNativePlan().approval, baseRegisterVersion: '11', publication: live } }));
    const source = s.write(join(s.art, 'candidate-api-source.json'), sourceManifest('api'));
    const nativePlan = (operation: string, extra: string[] = [], fromPath = from.path) => ['native-plan', '--operation', operation, '--from', fromPath, '--source-manifest', source.path, ...extra, '--out', join(s.art, `native-plan-${operation}.json`)];
    const plan = read(await run(nativePlan('plan', ['--hosted-billing', JSON.stringify(choice)]), s.layout));
    const proposalOf = (patch: (p: any) => void = () => {}) => { const p = JSON.parse(JSON.stringify(operator.snapshotProposal({ runtimeObservedAt: observedAt, source: sourceManifest('api'), plan, snapshot }))); patch(p); return p; };
    const writeProposal = (value: unknown, name = 'native-proposal.json') => s.write(join(s.art, name), `${JSON.stringify(value)}\n`);
    const newPublication = { publicationId: newId, publicationKind: 'GENERAL', baseRegisterVersion: '12', registerVersion: '13', requestSha256: digest, snapshotSha256: snapshot.snapshotSha256, rowCount: snapshot.rows.length, recordedAt: '2026-10-13T12:05:00.000Z' };
    return { s, from, source, nativePlan, plan, snapshot, live, proposalOf, writeProposal, newPublication };
  }
  const deps = { randomUUID: () => newId };

  it('plan --hosted-billing: the plan carries the owner\'s inputs in one key order, and the proposal names kit v3 and the owner rows', async () => {
    const t = await staged();
    expect(t.plan).toEqual({ ...oldNativePlan(), operation: 'plan', sourceRoot: NEW_ROOT.api, sourceRevision: newRevision, sourceTree: newTree,
      sourceManifest: { path: t.source.path, sha256: t.source.sha256 }, operatorManifestSha256: operatorDigest,
      selectedBaseRegisterVersion: '12', selectedBaseSnapshotSha256: t.live.snapshotSha256, approval: null, hostedBilling: HOSTED });
    expect(Object.keys(t.plan.hostedBilling)).toEqual(['billing', 'perRunCeilingMicros', 'dailyCeilingMicros', 'askRoomReads']);
    expect(operator.validateNativePlan(t.plan)).toEqual(t.plan);
    const typed = JSON.stringify({ askRoomReads: { capacity: 65_536, windowMs: 60_000, limit: 60 }, dailyCeilingMicros: 10_000_000, perRunCeilingMicros: 3_000_000, billing: 'off' });
    expect(read(await run(t.nativePlan('plan', ['--hosted-billing', typed]).with(-1, join(t.s.art, 'native-plan-typed.json')), t.s.layout))).toEqual(t.plan);
    const proposal = t.proposalOf();
    expect(proposal.composer).toBe('preview-register-composer-v3');
    expect(proposal.addedKeys).toEqual(['costEstimateStartPolicy', 'storyCostEnvelopePolicy']);
    expect(proposal.changedKeys).toEqual(['admissionPolicy', 'costEnvelopePolicy', 'nodeRuntimeVersion']);
  });

  it('publish carries the inputs on; verify after publish carries them so a restart composes from the hosted base with kit v3', async () => {
    const t = await staged(HOSTED_ON);
    const proposal = t.writeProposal(t.proposalOf());
    const publishPlan = await run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], join(t.s.art, 'native-plan-plan.json')), t.s.layout, deps);
    expect(read(publishPlan)).toEqual({ ...t.plan, operation: 'publish', publicationId: newId,
      approval: { runtimeObservedAt: observedAt, baseRegisterVersion: '12', baseSnapshotSha256: t.snapshot.baseSnapshotSha256, snapshotSha256: t.snapshot.snapshotSha256, deltaSha256: t.snapshot.deltaSha256 } });
    expect(read(publishPlan).hostedBilling).toEqual(HOSTED_ON);
    expect(t.proposalOf().changedKeys).toEqual(['admissionPolicy', 'billingPolicy', 'costEnvelopePolicy', 'nodeRuntimeVersion']);
    const published = t.s.write(join(t.s.art, 'native-publish.json'), `${JSON.stringify(attestation({ publication: t.newPublication }))}\n`);
    const verify = read(await run(t.nativePlan('verify', ['--publication', published.path], publishPlan.path), t.s.layout));
    expect(verify).toEqual({ ...read(publishPlan), operation: 'verify', approval: { ...read(publishPlan).approval, publication: t.newPublication } });
    expect(operator.validateNativePlan(verify)).toEqual(verify);
    expect(prestart.checkNativePlan(verify, { sourceRevision: newRevision, sourceTree: newTree, operatorManifestSha256: operatorDigest, publication: t.newPublication })).toEqual([]);
    // A later release's verify and apply-and-plan, from that verify plan, keep the inputs.
    const verifyPath = t.s.write(join(t.s.art, 'native-plan-verify-kept.json'), verify).path;
    for (const operation of ['verify', 'apply-and-plan']) {
      const next = read(await run(t.nativePlan(operation, [], verifyPath).with(-1, join(t.s.art, `next-${operation}.json`)), t.s.layout));
      expect(next.hostedBilling).toEqual(HOSTED_ON);
      expect(operator.validateNativePlan(next)).toEqual(next);
    }
    // The next register publication from that hosted version must state the owner's inputs again: kit v2 refuses billing on.
    await expect(run(t.nativePlan('plan', [], verifyPath).with(-1, join(t.s.art, 'next-plan.json')), t.s.layout)).rejects.toMatchObject({ code: 'HOSTED_BILLING_REQUIRED' });
    expect(existsSync(join(t.s.art, 'next-plan.json'))).toBe(false);
    const next = read(await run(t.nativePlan('plan', ['--hosted-billing', JSON.stringify(HOSTED)], verifyPath).with(-1, join(t.s.art, 'next-plan-off.json')), t.s.layout));
    expect(next).toMatchObject({ selectedBaseRegisterVersion: '13', selectedBaseSnapshotSha256: t.newPublication.snapshotSha256, hostedBilling: HOSTED });
  });

  it('publish refuses a proposal from the other kit', async () => {
    const t = await staged();
    const planPath = join(t.s.art, 'native-plan-plan.json');
    const v2 = t.writeProposal(t.proposalOf(p => { p.composer = 'preview-register-composer-v2'; }), 'v2-proposal.json');
    await expect(run(t.nativePlan('publish', ['--proposal', v2.path, '--approved-delta-sha256', t.snapshot.deltaSha256], planPath), t.s.layout, deps)).rejects.toMatchObject({ code: 'PROPOSAL_REFUSED' });
    // A v3 proposal for a plan without the hosted inputs: that plan composes with kit v2.
    const { hostedBilling: _dropped, ...local } = t.plan;
    const localPlan = t.s.write(join(t.s.art, 'local-plan.json'), local);
    const v3 = t.writeProposal(t.proposalOf(), 'v3-proposal.json');
    await expect(run(t.nativePlan('publish', ['--proposal', v3.path, '--approved-delta-sha256', t.snapshot.deltaSha256], localPlan.path), t.s.layout, deps)).rejects.toMatchObject({ code: 'PROPOSAL_REFUSED' });
    expect(existsSync(join(t.s.art, 'native-plan-publish.json'))).toBe(false);
  });

  it.each([
    ['text that is not JSON', 'plan', ['--hosted-billing', 'billing=on']],
    ['JSON with a duplicate key', 'plan', ['--hosted-billing', '{"billing":"on","billing":"off","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}']],
    ...BAD_HOSTED.map(([name, value]) => [name, 'plan', ['--hosted-billing', JSON.stringify(value)]] as [string, string, string[]]),
    ['the option on verify', 'verify', ['--hosted-billing', JSON.stringify(HOSTED)]],
    ['the option on apply-and-plan', 'apply-and-plan', ['--hosted-billing', JSON.stringify(HOSTED)]]
  ])('refuses --hosted-billing with %s and writes nothing', async (_name, operation, extra) => {
    const t = await staged();
    const out = join(t.s.art, 'native-plan-refused.json');
    await expect(run(t.nativePlan(operation, extra).with(-1, out), t.s.layout)).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--hosted-billing'] });
    expect(existsSync(out)).toBe(false);
  });

  it('publish takes the inputs only from its plan', async () => {
    const t = await staged();
    const proposal = t.writeProposal(t.proposalOf());
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256, '--hosted-billing', JSON.stringify(HOSTED_ON)], join(t.s.art, 'native-plan-plan.json')), t.s.layout, deps))
      .rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED', fields: ['--hosted-billing'] });
    const edited = t.s.write(join(t.s.art, 'native-plan-edited.json'), { ...t.plan, hostedBilling: { ...HOSTED, dailyCeilingMicros: 1 } });
    await expect(run(t.nativePlan('publish', ['--proposal', proposal.path, '--approved-delta-sha256', t.snapshot.deltaSha256], edited.path), t.s.layout, deps)).rejects.toMatchObject({ code: 'FROM_PLAN_INVALID' });
  });

  it('the native plan check and the kit accept and refuse the same inputs, on every operation', async () => {
    const t = await staged();
    expect(operator.HOSTED_CEILING_BOUNDS).toEqual(kit.PREVIEW_HOSTED_CEILING_BOUNDS);
    expect(operator.BASE_NOT_CURRENT_LINE).toBe(kit.BASE_NOT_CURRENT);
    for (const good of [HOSTED, HOSTED_ON, { ...HOSTED, perRunCeilingMicros: 50_000_000, dailyCeilingMicros: 200_000_000, askRoomReads: { limit: 1_000_000, windowMs: 86_400_000, capacity: 1_048_576 } }]) {
      for (const operation of ['plan', 'publish', 'verify', 'apply-and-plan']) expect(operator.validateNativePlan({ ...t.plan, operation, hostedBilling: good })).toBeTruthy();
      expect(kit.previewHostedBillingChoice(good)).toEqual(good);
    }
    for (const [name, bad] of BAD_HOSTED) {
      expect(() => operator.validateNativePlan({ ...t.plan, hostedBilling: bad }), name).toThrow('PREVIEW_NATIVE_PLAN_REFUSED');
      expect(() => kit.previewHostedBillingChoice(bad), name).toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
    }
  });
});

// Side-by-side spec §5 (G6): the newer release's list of the database steps it adds, which the older release's native verify
// accepts only once root pinned it (prestart.mjs accept-ahead).
describe('database-ahead', () => {
  const migrationText = (name: string, header = '-- n1: expand\n-- n1: keeps-verifier\n') => `-- ${name}\n${header}\nCREATE TABLE x_${name.slice(0, 4)} (id int);\n`;
  const SEALED = ['0122_engine_map_check.sql', '0123_side_by_side_releases.sql'];
  const row = (name: string, text = migrationText(name)) => ({ path: `dialectical-engine/migrations/${name}`, sha256: sha(text), mode: 0o644 });
  const chainEntry = (name: string, sourceSha256: string, patch: Record<string, unknown> = {}) => ({ name, manifestSha256: '5'.repeat(64), sourceSha256, verifierSha256: '6'.repeat(64), n1Expand: true, keepsVerifier: true, outsideTransaction: false, ...patch });
  function staged({ added = ['0124_side_next.sql', '0125_more.sql'], texts = {} as Record<string, string>, onDisk = {} as Record<string, string>, chain }: { added?: string[]; texts?: Record<string, string>; onDisk?: Record<string, string>; chain?: unknown[] } = {}) {
    const s = server();
    const text = (name: string) => texts[name] ?? migrationText(name);
    const base = sourceManifest('api').files;
    const older = s.write(join(s.art, 'old-api-source.json'), sourceManifest('api', { sourceRoot: OLD_ROOT.api, sourceRevision: revision, sourceTree: tree, files: [...base, ...SEALED.map(name => row(name))] }));
    const newer = s.write(join(s.art, 'candidate-api-source.json'), sourceManifest('api', { files: [...base, ...SEALED.map(name => row(name)), ...added.map(name => row(name, text(name)))] }));
    const newerChain = chain ?? [chainEntry('0111_billing_netopia.sql', '4'.repeat(64)), ...SEALED.map(name => chainEntry(name, sha(migrationText(name)))), ...added.map(name => chainEntry(name, sha(text(name))))];
    const reads: string[] = [];
    const children: { argv: string[]; options: Record<string, unknown> }[] = [];
    const deps = {
      readMigration: async (root: string, name: string) => { reads.push(`${root}|${name}`); return Buffer.from(onDisk[name] ?? text(name)); },
      execPath: '/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node',
      // The newer release describes its own chain in a child process (D5 review); this stands in for that child.
      runBounded: async (argv: string[], options: Record<string, unknown>) => {
        reads.push(`chain|${options.cwd}`); children.push({ argv, options });
        return { code: 0, timedOut: false, overflow: false, stdout: Buffer.from(JSON.stringify(newerChain)), stderr: Buffer.alloc(0) };
      }
    };
    const out = join(s.art, 'database-ahead-old-v1.json');
    const argv = ['database-ahead', '--older-source-manifest', older.path, '--newer-source-manifest', newer.path, '--out', out];
    return { s, older, newer, newerChain, deps, reads, children, out, argv, text };
  }

  it('writes the exact file: both releases, the newer manifest, the added steps and the newer release\'s own chain', async () => {
    const t = staged();
    const result = await run(t.argv, t.s.layout, t.deps);
    const written = JSON.parse(readFileSync(t.out, 'utf8'));
    expect(written).toEqual({
      schema: 'preview-database-ahead-v1', olderLabel: 'old-v1', olderSourceRevision: revision, newerLabel: 'new-v1', newerSourceRevision: newRevision,
      newerSourceManifest: { path: t.newer.path, sha256: t.newer.sha256 },
      steps: [{ name: '0124_side_next.sql', sha256: sha(t.text('0124_side_next.sql')) }, { name: '0125_more.sql', sha256: sha(t.text('0125_more.sql')) }],
      newerChain: t.newerChain
    });
    expect(result).toMatchObject({ path: t.out, sha256: sha(readFileSync(t.out)) });
    expect(statSync(t.out).mode & 0o7777).toBe(0o644);
    // Each step's bytes come from the newer release's own folder; the chain is the newer release's description of itself.
    expect(t.reads).toEqual([`${NEW_ROOT.api}|0124_side_next.sql`, `${NEW_ROOT.api}|0125_more.sql`, `chain|${NEW_ROOT.api}/dialectical-engine`]);
    // prestart.mjs accept-ahead takes exactly this file for the older release.
    expect(tool.parseArguments(t.argv)).toMatchObject({ command: 'database-ahead' });
  });

  it('root never loads the newer code: a bounded child as nobody, from the verified engine, with no tsx cache and its own tsconfig', async () => {
    const t = staged();
    await run(t.argv, t.s.layout, t.deps);
    const engine = `${NEW_ROOT.api}/dialectical-engine`, node = t.deps.execPath;
    expect(t.children).toHaveLength(1);
    expect(t.children[0]!.argv).toEqual(['/usr/sbin/runuser', '-u', 'nobody', '--', '/usr/bin/env', '-i',
      'PATH=/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin:/usr/bin:/bin', 'TSX_DISABLE_CACHE=1', `TSX_TSCONFIG_PATH=${engine}/tsconfig.json`,
      node, '--import', `${engine}/node_modules/tsx/dist/loader.mjs`, '--input-type=module', '-e', tool.DESCRIBE_CHAIN_SCRIPT, `${engine}/packages/db/src/migration-ahead.ts`]);
    expect(t.children[0]!.options).toEqual({ cwd: engine, env: {}, timeoutMs: 60_000, maxOutputBytes: 262_144 });
    expect(tool.describeChainArgv({ sourceRoot: NEW_ROOT.api, execPath: node })).toEqual(t.children[0]!.argv);
  });

  it.each([
    ['a non-zero exit', { code: 1 }], ['any stderr', { stderr: Buffer.from('warning') }], ['a timeout', { timedOut: true }], ['an output overflow', { overflow: true }],
    ['a spawn error', { error: new Error('ENOENT') }], ['output that is not strict JSON', { stdout: Buffer.from('[{"a":1,"a":2}]') }]
  ])('refuses a chain child with %s, and writes nothing', async (_name, outcome) => {
    const t = staged();
    const runBounded = async () => ({ code: 0, timedOut: false, overflow: false, stdout: Buffer.from(JSON.stringify(t.newerChain)), stderr: Buffer.alloc(0), ...outcome });
    await expect(run(t.argv, t.s.layout, { ...t.deps, runBounded })).rejects.toMatchObject({ code: 'DATABASE_AHEAD_CHAIN_UNREADABLE' });
    expect(existsSync(t.out)).toBe(false);
  });

  it('refuses a step without both header lines and names every such step', async () => {
    const t = staged({ texts: { '0124_side_next.sql': '-- 0124\n-- n1: expand\nCREATE TABLE y (id int);\n', '0125_more.sql': '-- 0125\nCREATE TABLE z (id int);\n-- n1: expand\n-- n1: keeps-verifier\n' } });
    await expect(run(t.argv, t.s.layout, t.deps)).rejects.toMatchObject({ code: 'MIGRATION_NOT_N1_EXPAND', fields: ['0124_side_next.sql', '0125_more.sql'] });
    expect(existsSync(t.out)).toBe(false);
  });

  it('refuses step bytes that differ from the newer manifest', async () => {
    const t = staged({ onDisk: { '0125_more.sql': migrationText('0125_more.sql', '-- n1: expand\n-- n1: keeps-verifier\n-- edited\n') } });
    await expect(run(t.argv, t.s.layout, t.deps)).rejects.toMatchObject({ code: 'MIGRATION_BYTES_MISMATCH', fields: ['0125_more.sql'] });
    expect(existsSync(t.out)).toBe(false);
  });

  it('refuses when the newer release adds no migration, and writes nothing', async () => {
    const t = staged({ added: [] });
    await expect(run(t.argv, t.s.layout, t.deps)).rejects.toMatchObject({ code: 'DATABASE_AHEAD_NOT_NEEDED' });
    expect(existsSync(t.out)).toBe(false);
    expect(t.reads).toEqual([]);
  });

  it('refuses a newer chain whose last steps are not exactly the added steps, as declared', async () => {
    for (const chain of [
      [chainEntry('0124_side_next.sql', '1'.repeat(64)), chainEntry('0125_more.sql', '2'.repeat(64))].slice(0, 1),
      [chainEntry('0123_side_by_side_releases.sql', '3'.repeat(64)), chainEntry('0125_more.sql', sha(migrationText('0125_more.sql'))), chainEntry('0124_side_next.sql', sha(migrationText('0124_side_next.sql')))],
      [chainEntry('0124_side_next.sql', sha(migrationText('0124_side_next.sql'))), chainEntry('0125_more.sql', sha(migrationText('0125_more.sql')), { n1Expand: false })],
      [chainEntry('0124_side_next.sql', sha(migrationText('0124_side_next.sql'))), chainEntry('0125_more.sql', '2'.repeat(64))]
    ]) {
      const t = staged({ chain });
      await expect(run(t.argv, t.s.layout, t.deps)).rejects.toThrow('PREVIEW_DATABASE_AHEAD_REFUSED');
      expect(existsSync(t.out)).toBe(false);
    }
  });

  it('re-verifies the newer release folder before reading anything from it', async () => {
    const t = staged();
    await expect(run(t.argv, t.s.layout, { ...t.deps, verifySourceManifest: async () => { throw new TypeError('PREVIEW_SOURCE_INVENTORY_REFUSED'); } })).rejects.toThrow('PREVIEW_SOURCE_INVENTORY_REFUSED');
    expect(t.reads).toEqual([]);
    expect(existsSync(t.out)).toBe(false);
  });

  it.each([
    ['an older manifest of the same release', 'older', { sourceRoot: NEW_ROOT.api }, 'DATABASE_AHEAD_LABELS_REFUSED'],
    ['a UI manifest', 'newer', { role: 'ui', sourceRoot: NEW_ROOT.ui }, 'SOURCE_ROLE_REFUSED'],
    ['a fallback root', 'older', { sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-fallback-old-v1-api' }, 'NATIVE_ROOT_NOT_CANDIDATE']
  ] as const)('refuses %s', async (_name, which, patch, code) => {
    const t = staged();
    const path = which === 'older' ? t.older.path : t.newer.path;
    const current = JSON.parse(readFileSync(path, 'utf8'));
    rmSync(path);
    t.s.write(path, { ...current, ...patch });
    await expect(run(t.argv, t.s.layout, t.deps)).rejects.toMatchObject({ code });
    expect(existsSync(t.out)).toBe(false);
  });

  it('refuses a newer release that drops or edits a step of the older one', async () => {
    const t = staged();
    const current = JSON.parse(readFileSync(t.newer.path, 'utf8'));
    rmSync(t.newer.path);
    t.s.write(t.newer.path, { ...current, files: current.files.filter((file: { path: string }) => !file.path.endsWith('0122_engine_map_check.sql')) });
    await expect(run(t.argv, t.s.layout, t.deps)).rejects.toMatchObject({ code: 'DATABASE_AHEAD_NOT_A_SUPERSET' });
  });

  it('writes only the older release\'s own file name', async () => {
    const t = staged();
    const argv = [...t.argv.slice(0, -1), join(t.s.art, 'database-ahead-new-v1.json')];
    await expect(run(argv, t.s.layout, t.deps)).rejects.toMatchObject({ code: 'OUTPUT_PATH_REFUSED' });
  });
});
