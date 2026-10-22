// Side-by-side spec §10: each release reads its own env files, derived from the live ones. Only the keys that must
// differ per release change; every other line is copied byte for byte. The SAME checks prove two releases share the
// spending gates, the scope and the team, and never share a worker identity or a port.
import { afterAll, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const releaseEnv = await import('../../deploy/' + 'preview-lifecycle/v1/release-env.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');

const { DERIVED_KEYS, main } = releaseEnv;
const deriveEnvironmentText = releaseEnv.deriveEnvironmentText as (input: Record<string, unknown>) => string;
const sameChecks = releaseEnv.sameChecks as (releases: readonly unknown[]) => readonly Readonly<{ check: string; ok: boolean }>[];
const me = { uid: process.getuid!(), gid: process.getgid!() };

// Test values that look like secrets are built from pieces (gitleaks).
const SECRET_PATH = ['', 'etc', 'debateai-v3-preview', 'api', ['kek', 'x', '7f3a'].join('-')].join('/');
const DATABASE_URL = ['postgresql://debateai_api', ['pw', 'x', '91c2'].join('-')].join(':') + '@localhost/debateai';
const CONFIG = (overrides: Record<string, unknown> = {}) => JSON.stringify({ deployment: 'v3-preview', free_model_ids: ['zai-org/GLM-5.3-Flash'], requested_thinking_level: 'high',
  budget_socket: '/run/debateai-v3-preview/deepinfra-budget-v3.sock', anthropic_budget_socket: '/run/debateai-v3-preview/anthropic-budget-v1.sock', scope_id: 'preview-team-v2-20261009', ...overrides });
const TEAM = JSON.stringify(['0b9c6c1e-5f3a-4f0e-9d6b-1a2b3c4d5e6f']);
const OLD_MAIL = '/opt/debateai-v3-preview/releases/auth-dev-candidate-r19-api/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs';

const SOURCE_API = [
  'NODE_ENV=production',
  'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro',
  'API_HOST=127.0.0.1',
  'API_PORT=3101',
  '',
  `DATABASE_URL=${DATABASE_URL}`,
  `KEK_PATH=${SECRET_PATH}`,
  'REGISTER_VERSION=17',
  'DEBATEAI_DEPLOYMENT_MODE=hosted',
  `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${CONFIG()}`,
  `PREVIEW_TEAM_USER_IDS_JSON=${TEAM}`,
  'HATCHET_WORKFLOW_NAME=debateai-preview-run',
  `MAIL_SENDMAIL_PATH=${OLD_MAIL}`,
  'MAIL_FROM=noreply@dezbatere.ro',
  ''
].join('\n');
const SOURCE_RUNNER = [
  'NODE_ENV=production',
  `DATABASE_URL=${DATABASE_URL.replace('debateai_api', 'debateai_runner')}`,
  `KEK_PATH=${SECRET_PATH}`,
  'REGISTER_VERSION=17',
  'RUNNER_WORKER_ID=debateai-preview-runner',
  'DEBATEAI_DEPLOYMENT_MODE=hosted',
  `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${CONFIG()}`,
  `PREVIEW_TEAM_USER_IDS_JSON=${TEAM}`,
  'HATCHET_WORKFLOW_NAME=debateai-preview-run',
  'HATCHET_WORKER_NAME=debateai-preview-runner',
  ''
].join('\n');
const SOURCE_UI = [
  'NODE_ENV=production',
  'PUBLIC_APP_URL=https://v3-preview.dezbatere.ro',
  'PORT=3100',
  'DIALECTICAL_UI_HOST=127.0.0.1',
  'DIALECTICAL_API_BASE=http://127.0.0.1:3101',
  'NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON=["zai-org/GLM-5.3-Flash"]',
  ''
].join('\n');
const SOURCES = { api: SOURCE_API, runner: SOURCE_RUNNER, ui: SOURCE_UI } as const;
type Service = keyof typeof SOURCES;
const OLD_KEY = ['r17', 'aaaaaaaaaaaa'].join('-');
const NEW_KEY = ['r18', '0123456789ab'].join('-');

const DERIVED = /^(REGISTER_VERSION|RELEASE_KEY|API_PORT|MAIL_SENDMAIL_PATH)=/;
const parse = (text: string) => Object.fromEntries(text.split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const release = (label: string, slot: 'A' | 'B', releaseKey: string, sources: Record<Service, string> = SOURCES) => ({
  label, slot,
  ...Object.fromEntries((['api', 'runner', 'ui'] as const).map(service => [service, parse(deriveEnvironmentText({ service, sourceText: sources[service], releaseKey, slot, label }))]))
}) as { label: string; slot: 'A' | 'B'; api: Record<string, string>; runner: Record<string, string>; ui: Record<string, string> };
const bad = (results: readonly { check: string; ok: boolean }[]) => results.filter(result => !result.ok).map(result => result.check);

describe('deriveEnvironmentText', () => {
  it('names exactly the keys each service derives', () => {
    expect(DERIVED_KEYS).toEqual({
      api: ['REGISTER_VERSION', 'RELEASE_KEY', 'API_PORT', 'MAIL_SENDMAIL_PATH'],
      runner: ['REGISTER_VERSION', 'RELEASE_KEY', 'RUNNER_WORKER_ID', 'HATCHET_WORKER_NAME'],
      ui: ['RELEASE_KEY', 'PORT', 'DIALECTICAL_API_BASE']
    });
    expect(Object.isFrozen(DERIVED_KEYS)).toBe(true);
  });

  it('changes only the derived keys and keeps every other line byte for byte', () => {
    const text = deriveEnvironmentText({ service: 'api', sourceText: SOURCE_API, releaseKey: NEW_KEY, slot: 'B', label: 'new-v1' });
    expect(text.split('\n').filter(l => !DERIVED.test(l))).toEqual(SOURCE_API.split('\n').filter(l => !DERIVED.test(l)));
    expect(text).toContain('API_PORT=3201\n'); expect(text).toContain('REGISTER_VERSION=18\n');
    expect(text).toContain('MAIL_SENDMAIL_PATH=/opt/debateai-v3-preview/releases/auth-dev-candidate-new-v1-api/dialectical-engine/deploy/preview-auth-dev/v1/mail-handoff.mjs\n');
    // Lines keep their order: each derived line stays where it was; RELEASE_KEY, absent, comes last.
    const lines = text.split('\n');
    expect(lines.indexOf('API_PORT=3201')).toBe(SOURCE_API.split('\n').indexOf('API_PORT=3101'));
    expect(lines.slice(-2)).toEqual([`RELEASE_KEY=${NEW_KEY}`, '']);
  });

  it('replaces a RELEASE_KEY the source already has, in place', () => {
    const source = SOURCE_UI.replace('PORT=3100\n', `PORT=3100\nRELEASE_KEY=${OLD_KEY}\n`);
    const text = deriveEnvironmentText({ service: 'ui', sourceText: source, releaseKey: NEW_KEY, slot: 'B', label: 'new-v1' });
    expect(text).toBe(source.replace('PORT=3100', 'PORT=3200').replace(OLD_KEY, NEW_KEY).replace('http://127.0.0.1:3101', 'http://127.0.0.1:3201'));
  });

  it('appends RELEASE_KEY as the last line when the source has no final newline', () => {
    const text = deriveEnvironmentText({ service: 'ui', sourceText: SOURCE_UI.slice(0, -1), releaseKey: NEW_KEY, slot: 'A', label: 't' });
    expect(text).toBe(`${SOURCE_UI}RELEASE_KEY=${NEW_KEY}`);
  });

  it("gives each release's runner its own worker id and worker name", () => {
    const older = parse(deriveEnvironmentText({ service: 'runner', sourceText: SOURCE_RUNNER, releaseKey: OLD_KEY, slot: 'A', label: 'old-v1' }));
    const newer = parse(deriveEnvironmentText({ service: 'runner', sourceText: SOURCE_RUNNER, releaseKey: NEW_KEY, slot: 'B', label: 'new-v1' }));
    expect([older.RUNNER_WORKER_ID, older.HATCHET_WORKER_NAME]).toEqual([`debateai-preview-runner-${OLD_KEY}`, `debateai-preview-runner-${OLD_KEY}`]);
    expect([newer.RUNNER_WORKER_ID, newer.HATCHET_WORKER_NAME]).toEqual([`debateai-preview-runner-${NEW_KEY}`, `debateai-preview-runner-${NEW_KEY}`]);
    expect([older.REGISTER_VERSION, newer.REGISTER_VERSION]).toEqual(['17', '18']);
    // The runner has no port; everything else is the source's.
    expect({ ...newer, RUNNER_WORKER_ID: '', HATCHET_WORKER_NAME: '', REGISTER_VERSION: '', RELEASE_KEY: '' })
      .toEqual({ ...parse(SOURCE_RUNNER), RUNNER_WORKER_ID: '', HATCHET_WORKER_NAME: '', REGISTER_VERSION: '', RELEASE_KEY: '' });
  });

  it('refuses a bad service, key, slot or label, a source it cannot read, and a source missing a derived key', () => {
    const ok = { service: 'api', sourceText: SOURCE_API, releaseKey: NEW_KEY, slot: 'B', label: 'new-v1' };
    for (const [change, code] of [
      [{ service: 'web' }, 'ARGUMENTS_REFUSED'], [{ releaseKey: ['r0', '0123456789ab'].join('-') }, 'ARGUMENTS_REFUSED'], [{ releaseKey: ['r18', '0123456789AB'].join('-') }, 'ARGUMENTS_REFUSED'],
      [{ slot: 'C' }, 'ARGUMENTS_REFUSED'], [{ slot: 'toString' }, 'ARGUMENTS_REFUSED'], [{ label: 'New' }, 'ARGUMENTS_REFUSED'], [{ label: '../x' }, 'ARGUMENTS_REFUSED'],
      [{ sourceText: 'API_PORT=3101\nAPI_PORT=3102\n' }, 'SOURCE_ENV_REFUSED'], [{ sourceText: 'export API_PORT=3101\n' }, 'SOURCE_ENV_REFUSED'],
      [{ sourceText: SOURCE_API.replace('API_PORT=3101\n', '') }, 'SOURCE_KEY_MISSING']
    ] as const) expect(() => deriveEnvironmentText({ ...ok, ...change })).toThrow(code);
    for (const key of ['RUNNER_WORKER_ID', 'HATCHET_WORKER_NAME', 'REGISTER_VERSION']) {
      expect(() => deriveEnvironmentText({ ...ok, service: 'runner', sourceText: SOURCE_RUNNER.replace(new RegExp(`^${key}=.*\\n`, 'm'), '') })).toThrow('SOURCE_KEY_MISSING');
    }
  });
});

describe('sameChecks', () => {
  it('the SAME checks pass two releases that share gates and scope, and name the key that differs', () => {
    const older = release('old-v1', 'A', OLD_KEY), newer = release('new-v1', 'B', NEW_KEY);
    const results = sameChecks([older, newer]);
    expect(bad(results)).toEqual([]);
    expect(results.map(result => result.check)).toEqual(expect.arrayContaining([
      'SAME_BUDGET_SOCKET', 'SAME_ANTHROPIC_BUDGET_SOCKET', 'SAME_SCOPE_ID', 'SAME_DEBATEAI_DEPLOYMENT_MODE', 'SAME_HATCHET_WORKFLOW_NAME', 'SAME_PREVIEW_TEAM_USER_IDS_JSON',
      'DIFFERENT_RELEASE_KEY', 'DIFFERENT_RUNNER_WORKER_ID', 'DIFFERENT_HATCHET_WORKER_NAME', 'DIFFERENT_API_PORT', 'DIFFERENT_PORT',
      'SAME_API_RUNNER_PREVIEW_PROVIDER_TEST_CONFIG_JSON:new-v1', 'SAME_API_RUNNER_PREVIEW_TEAM_USER_IDS_JSON:old-v1', 'SAME_UI_API_RELEASE_KEY:new-v1', 'SLOT_API_PORT:old-v1', 'SLOT_PORT:new-v1'
    ]));
    expect(Object.isFrozen(results) && results.every(result => Object.isFrozen(result))).toBe(true);

    // The newer release names another scope (in both of its files, so only the cross-release check sees it).
    const otherScope = { ...SOURCES, api: SOURCE_API.replace('preview-team-v2-20261009', 'preview-team-v3'), runner: SOURCE_RUNNER.replace('preview-team-v2-20261009', 'preview-team-v3') };
    expect(bad(sameChecks([older, release('new-v1', 'B', NEW_KEY, otherScope)]))).toEqual(['SAME_SCOPE_ID']);
    // Both runners under one worker id.
    const sameWorker = { ...newer, runner: { ...newer.runner, RUNNER_WORKER_ID: older.runner.RUNNER_WORKER_ID } };
    expect(bad(sameChecks([older, sameWorker]))).toEqual(['DIFFERENT_RUNNER_WORKER_ID']);
    // Another gate socket, one release in another deployment mode.
    const otherGate = { ...newer, api: { ...newer.api, PREVIEW_PROVIDER_TEST_CONFIG_JSON: CONFIG({ anthropic_budget_socket: '/run/x.sock' }) }, runner: { ...newer.runner, PREVIEW_PROVIDER_TEST_CONFIG_JSON: CONFIG({ anthropic_budget_socket: '/run/x.sock' }) } };
    expect(bad(sameChecks([older, otherGate]))).toEqual(['SAME_ANTHROPIC_BUDGET_SOCKET']);
    const otherWorkflow = { ...newer, api: { ...newer.api, HATCHET_WORKFLOW_NAME: 'other' }, runner: { ...newer.runner, HATCHET_WORKFLOW_NAME: 'other' } };
    expect(bad(sameChecks([older, otherWorkflow]))).toEqual(['SAME_HATCHET_WORKFLOW_NAME']);
    // Another team in both of the newer release's files: each release agrees with itself, only the cross check sees it.
    const otherTeam = { ...newer, api: { ...newer.api, PREVIEW_TEAM_USER_IDS_JSON: '[]' }, runner: { ...newer.runner, PREVIEW_TEAM_USER_IDS_JSON: '[]' } };
    expect(bad(sameChecks([older, otherTeam]))).toEqual(['SAME_PREVIEW_TEAM_USER_IDS_JSON']);
    // The same slot twice: both ports collide.
    expect(bad(sameChecks([older, release('new-v1', 'A', NEW_KEY)]))).toEqual(['DIFFERENT_API_PORT', 'DIFFERENT_PORT']);
  });

  it('checks each release on its own: api and runner agree, the website names the same key, the ports are its slot', () => {
    const one = release('t', 'A', NEW_KEY);
    const alone = sameChecks([one]);
    expect(bad(alone)).toEqual([]);
    // One release has nothing to compare across.
    expect(alone.every(result => result.check.endsWith(':t'))).toBe(true);
    expect(bad(sameChecks([{ ...one, runner: { ...one.runner, RELEASE_KEY: OLD_KEY } }]))).toEqual(['SAME_API_RUNNER_RELEASE_KEY:t']);
    expect(bad(sameChecks([{ ...one, runner: { ...one.runner, REGISTER_VERSION: '17' } }]))).toEqual(['SAME_API_RUNNER_REGISTER_VERSION:t']);
    expect(bad(sameChecks([{ ...one, runner: { ...one.runner, PREVIEW_TEAM_USER_IDS_JSON: '[]' } }]))).toEqual(['SAME_API_RUNNER_PREVIEW_TEAM_USER_IDS_JSON:t']);
    expect(bad(sameChecks([{ ...one, runner: { ...one.runner, DEBATEAI_DEPLOYMENT_MODE: 'local' } }]))).toEqual(['SAME_API_RUNNER_DEBATEAI_DEPLOYMENT_MODE:t']);
    expect(bad(sameChecks([{ ...one, ui: { ...one.ui, RELEASE_KEY: OLD_KEY } }]))).toEqual(['SAME_UI_API_RELEASE_KEY:t']);
    expect(bad(sameChecks([{ ...one, slot: 'B' as const }]))).toEqual(['SLOT_API_PORT:t', 'SLOT_PORT:t', 'SLOT_DIALECTICAL_API_BASE:t']);
    const { RELEASE_KEY: _a, ...apiWithoutKey } = one.api, { RELEASE_KEY: _b, ...runnerWithoutKey } = one.runner;
    expect(bad(sameChecks([{ ...one, api: apiWithoutKey, runner: runnerWithoutKey }]))).toEqual(['SAME_API_RUNNER_RELEASE_KEY:t', 'SAME_UI_API_RELEASE_KEY:t']);
  });

  it('a config it cannot read is never the same as anything', () => {
    const older = release('old-v1', 'A', OLD_KEY), newer = release('new-v1', 'B', NEW_KEY);
    const broken = { ...newer, api: { ...newer.api, PREVIEW_PROVIDER_TEST_CONFIG_JSON: '{' }, runner: { ...newer.runner, PREVIEW_PROVIDER_TEST_CONFIG_JSON: '{' } };
    expect(bad(sameChecks([older, broken]))).toEqual(['SAME_BUDGET_SOCKET', 'SAME_ANTHROPIC_BUDGET_SOCKET', 'SAME_SCOPE_ID']);
  });

  it('refuses a list it cannot check', () => {
    const one = release('t', 'A', NEW_KEY);
    for (const releases of [[], [one, one, one], [one, { ...one }], [{ ...one, label: 'T' }], [{ ...one, api: null }]]) expect(() => sameChecks(releases)).toThrow('ARGUMENTS_REFUSED');
  });
});

describe('release-env.mjs (root CLI)', () => {
  // Each setup()'s temp folder, removed when the file's tests end (owner clean-up rule).
  const roots: string[] = [];
  afterAll(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  const sink = () => { const lines: string[] = []; return { lines, stream: { write: (text: string) => { lines.push(text); return true; } } }; };
  const setup = () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'release-env-')));
    roots.push(root);
    const layout = { ...common.LAYOUT, nativePlanRoot: root, ownerUid: me.uid, ownerGid: me.gid };
    for (const service of ['api', 'ui', 'runner'] as const) { writeFileSync(join(root, `${service}.env`), SOURCES[service]); chmodSync(join(root, `${service}.env`), 0o640); }
    const run = async (argv: string[], options: Record<string, unknown> = {}) => {
      const stdout = sink(), stderr = sink();
      const code = await main(argv, { platform: 'linux', uid: 0, layout, stdout: stdout.stream, stderr: stderr.stream, ...options });
      return { code, stdout: stdout.lines.join(''), stderr: stderr.lines.join('') };
    };
    const derive = (service: Service, label: string, slot: 'A' | 'B', releaseKey: string, from = join(root, `${service}.env`)) =>
      run(['derive', '--service', service, '--from', from, '--label', label, '--slot', slot, '--release-key', releaseKey]);
    return { root, layout, run, derive };
  };

  it("writes the release's env file with the source's owner, group and mode, and prints only what it derived", async () => {
    const { root, derive } = setup();
    const result = await derive('api', 'new-v1', 'B', NEW_KEY);
    expect(result).toEqual({ code: 0, stderr: '', stdout: expect.any(String) });
    const out = join(root, 'api-new-v1.env');
    expect(readFileSync(out, 'utf8')).toBe(deriveEnvironmentText({ service: 'api', sourceText: SOURCE_API, releaseKey: NEW_KEY, slot: 'B', label: 'new-v1' }));
    const [source, written] = [statSync(join(root, 'api.env')), statSync(out)];
    expect([written.uid, written.gid, written.mode & 0o777]).toEqual([source.uid, source.gid, 0o640]);
    expect(JSON.parse(result.stdout)).toEqual({ event: 'PREVIEW_RELEASE_ENV_WRITTEN', service: 'api', label: 'new-v1',
      changed: ['REGISTER_VERSION', 'RELEASE_KEY', 'API_PORT', 'MAIL_SENDMAIL_PATH'], registerVersion: '18', releaseKey: NEW_KEY, ports: { uiPort: '3200', apiPort: '3201' } });
    // The source file is not touched.
    expect(readFileSync(join(root, 'api.env'), 'utf8')).toBe(SOURCE_API);
  });

  it('never prints a value it did not derive', async () => {
    const { derive, run } = setup();
    const outputs: string[] = [];
    for (const service of ['api', 'ui', 'runner'] as const) { const result = await derive(service, 'new-v1', 'B', NEW_KEY); outputs.push(result.stdout, result.stderr); }
    const same = await run(['same', '--labels', 'new-v1']);
    outputs.push(same.stdout, same.stderr);
    // A refusal names codes only, even when the source is one it cannot use.
    const { root, derive: deriveAgain } = setup();
    writeFileSync(join(root, 'api.env'), `${SOURCE_API}KEK_PATH=${SECRET_PATH}\n`);
    const refused = await deriveAgain('api', 'new-v1', 'B', NEW_KEY);
    expect(refused.code).toBe(1);
    outputs.push(refused.stdout, refused.stderr);
    const printed = outputs.join('\n');
    for (const value of [SECRET_PATH, DATABASE_URL, 'preview-team-v2-20261009', 'deepinfra-budget-v3.sock', TEAM, 'debateai-preview-run', OLD_MAIL]) expect(printed).not.toContain(value);
  });

  it('refuses a written file that does not read back as derived', async () => {
    const { root, run } = setup();
    const write = async (path: string, bytes: Buffer, owner: { uid: number; gid: number; mode: number }) => common.atomicWrite(path, Buffer.from(bytes.toString('utf8').replace('API_PORT=3201', 'API_PORT=3101')), owner);
    const result = await run(['derive', '--service', 'api', '--from', join(root, 'api.env'), '--label', 'new-v1', '--slot', 'B', '--release-key', NEW_KEY], { deps: { write } });
    expect([result.code, JSON.parse(result.stderr).reason]).toEqual([1, 'WRITE_VERIFY_FAILED']);
    // The file is kept for the operator to look at and move aside; until then a rerun refuses.
    expect(existsSync(join(root, 'api-new-v1.env'))).toBe(true);
    expect(JSON.parse((await run(['derive', '--service', 'api', '--from', join(root, 'api.env'), '--label', 'new-v1', '--slot', 'B', '--release-key', NEW_KEY])).stderr).reason).toBe('OUTPUT_EXISTS');
  });

  it('refuses to overwrite an existing env file', async () => {
    const { root, derive } = setup();
    writeFileSync(join(root, 'api-new-v1.env'), 'KEEP=me\n'); chmodSync(join(root, 'api-new-v1.env'), 0o640);
    const result = await derive('api', 'new-v1', 'B', NEW_KEY);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({ event: 'PREVIEW_RELEASE_ENV_REFUSED', command: 'derive', reason: 'OUTPUT_EXISTS' });
    expect(readFileSync(join(root, 'api-new-v1.env'), 'utf8')).toBe('KEEP=me\n');
    // A release derived from its own file is the same case.
    expect(JSON.parse((await derive('api', 'new-v1', 'B', NEW_KEY, join(root, 'api-new-v1.env'))).stderr).reason).toBe('OUTPUT_EXISTS');
  });

  it('derives from an older release file of the same service, and refuses any other source', async () => {
    const { root, derive } = setup();
    expect((await derive('runner', 'old-v1', 'A', OLD_KEY)).code).toBe(0);
    expect((await derive('runner', 'new-v1', 'B', NEW_KEY, join(root, 'runner-old-v1.env'))).code).toBe(0);
    expect(parse(readFileSync(join(root, 'runner-new-v1.env'), 'utf8')).RUNNER_WORKER_ID).toBe(`debateai-preview-runner-${NEW_KEY}`);
    writeFileSync(join(root, 'notes.env'), SOURCE_API); chmodSync(join(root, 'notes.env'), 0o640);
    writeFileSync(join(root, 'api-loose.env'), SOURCE_API); chmodSync(join(root, 'api-loose.env'), 0o644);
    for (const [from, reason] of [
      [join(root, 'ui.env'), 'ARGUMENTS_REFUSED'], [join(root, 'notes.env'), 'ARGUMENTS_REFUSED'], [join(root, 'api-Old.env'), 'ARGUMENTS_REFUSED'],
      [`${root}/sub/../api.env`, 'ARGUMENTS_REFUSED'], ['/tmp/api.env', 'ARGUMENTS_REFUSED'], [join(root, 'api-loose.env'), 'SOURCE_ENV_REFUSED'], [join(root, 'api-missing.env'), 'SOURCE_ENV_REFUSED']
    ] as const) {
      const result = await derive('api', 'new-v1', 'B', NEW_KEY, from);
      expect([result.code, JSON.parse(result.stderr).reason]).toEqual([1, reason]);
    }
    expect(existsSync(join(root, 'api-new-v1.env'))).toBe(false);
  });

  it('refuses wrong arguments and anyone but root on Linux before reading anything', async () => {
    const { run, derive } = setup();
    for (const argv of [[], ['derive'], ['derive', '--service', 'api'], ['same', '--labels', 'a,b,c'], ['same', '--labels', 'a,a'], ['same', '--labels', 'A'], ['same', '--labels', 'a', '--x', 'y'], ['other'],
      ['same', '--slots', 'A'], ['same', '--labels', 'a,b', '--slots', 'A'], ['same', '--labels', 'a', '--slots', 'A,B'], ['same', '--labels', 'a,b', '--slots', 'A,A'],
      ['same', '--labels', 'a', '--slots', 'C'], ['same', '--labels', 'a', '--slots', 'toString'], ['same', '--labels', 'a', '--slots', 'A', '--slots', 'A'], ['same', '--labels', 'a', '--slots'],
      ['derive', '--service', 'api', '--from', '/x', '--label', 'n', '--slot', 'A', '--release-key', NEW_KEY, '--slots', 'A']]) {
      expect(JSON.parse((await run(argv)).stderr).reason).toBe('ARGUMENTS_REFUSED');
    }
    expect(JSON.parse((await derive('api', 'new-v1', 'C' as 'A', NEW_KEY)).stderr).reason).toBe('ARGUMENTS_REFUSED');
    expect(JSON.parse((await run(['derive', '--service', 'api', '--from', '/x', '--label', 'n', '--slot', 'A', '--release-key', NEW_KEY], { uid: 1000 })).stderr).reason).toBe('ARGUMENTS_REFUSED');
    expect(JSON.parse((await run(['same', '--labels', 'n'], { uid: 1000 })).stderr).reason).toBe('ACTOR_REFUSED');
    expect(JSON.parse((await run(['same', '--labels', 'n'], { platform: 'darwin' })).stderr).reason).toBe('ACTOR_REFUSED');
  });

  it('same --slots checks each release against the slot the operator expects', async () => {
    const { derive, run } = setup();
    for (const service of ['api', 'ui', 'runner'] as const) { await derive(service, 'old-v1', 'A', OLD_KEY); await derive(service, 'new-v1', 'B', NEW_KEY); }
    const good = await run(['same', '--labels', 'old-v1,new-v1', '--slots', 'A,B']);
    expect(good.code).toBe(0);
    expect(good.stdout).toBe((await run(['same', '--labels', 'old-v1,new-v1'])).stdout);
    // The releases' files are each in their own slot, but not the ones expected: every slot check of both is BAD.
    const swapped = await run(['same', '--slots', 'B,A', '--labels', 'old-v1,new-v1']);
    expect(swapped.code).toBe(1);
    expect(swapped.stdout.split('\n').filter(line => line.startsWith('BAD '))).toEqual(['old-v1', 'new-v1'].flatMap(label =>
      ['SLOT_API_PORT', 'SLOT_PORT', 'SLOT_DIALECTICAL_API_BASE'].map(check => `BAD ${check}:${label}`)));
    // One release alone, in the slot it was derived for and in the other.
    expect((await run(['same', '--labels', 'new-v1', '--slots', 'B'])).code).toBe(0);
    expect((await run(['same', '--labels', 'new-v1', '--slots', 'A'])).code).toBe(1);
  });

  it('same prints one OK or BAD line per check, and exits 1 on any BAD', async () => {
    const { root, derive, run } = setup();
    for (const service of ['api', 'ui', 'runner'] as const) { await derive(service, 'old-v1', 'A', OLD_KEY); await derive(service, 'new-v1', 'B', NEW_KEY); }
    const good = await run(['same', '--labels', 'old-v1,new-v1']);
    expect(good.code).toBe(0);
    const expected = sameChecks([release('old-v1', 'A', OLD_KEY), release('new-v1', 'B', NEW_KEY)]);
    expect(good.stdout).toBe(expected.map(result => `OK ${result.check}\n`).join(''));
    // A runner file with the other release's worker id (written by hand): BAD, exit 1, the other lines still printed.
    const path = join(root, 'runner-new-v1.env');
    writeFileSync(path, readFileSync(path, 'utf8').replace(`RUNNER_WORKER_ID=debateai-preview-runner-${NEW_KEY}`, `RUNNER_WORKER_ID=debateai-preview-runner-${OLD_KEY}`));
    const result = await run(['same', '--labels', 'old-v1,new-v1']);
    expect(result.code).toBe(1);
    expect(result.stdout.split('\n').filter(line => line.startsWith('BAD '))).toEqual(['BAD DIFFERENT_RUNNER_WORKER_ID']);
    expect(result.stdout.split('\n').filter(Boolean)).toHaveLength(expected.length);
    // An API port that is no slot's: the release's slot is unknown, so nothing is checked.
    const api = join(root, 'api-new-v1.env');
    writeFileSync(api, readFileSync(api, 'utf8').replace('API_PORT=3201', 'API_PORT=3999'));
    expect(JSON.parse((await run(['same', '--labels', 'old-v1,new-v1'])).stderr)).toEqual({ event: 'PREVIEW_RELEASE_ENV_REFUSED', command: 'same', reason: 'RELEASE_SLOT_UNKNOWN', fields: { label: 'new-v1' } });
    // Told each release's slot, the slot checks are real: a port that is no slot's is one BAD line, not a refusal.
    const told = await run(['same', '--labels', 'old-v1,new-v1', '--slots', 'A,B']);
    expect([told.code, told.stderr]).toEqual([1, '']);
    expect(told.stdout.split('\n').filter(line => line.startsWith('BAD '))).toEqual(['BAD SLOT_API_PORT:new-v1', 'BAD DIFFERENT_RUNNER_WORKER_ID']);
    // A missing file refuses and names the file's service and label.
    expect(JSON.parse((await run(['same', '--labels', 'old-v1,gone'])).stderr)).toEqual({ event: 'PREVIEW_RELEASE_ENV_REFUSED', command: 'same', reason: 'ENV_FILE_UNREADABLE', fields: { service: 'api', label: 'gone' } });
  });
});
