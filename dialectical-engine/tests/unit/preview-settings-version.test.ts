// Side-by-side spec §13 "Activating a settings version" (Task S15): the preview's root wiring,
// deploy/preview-lifecycle/v1/settings-version.mjs. Fake runners only: no server, no database, no gate, no AI call.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const settings = await import('../../deploy/' + 'preview-lifecycle/v1/settings-version.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');

const { CHECK_HINTS, GATE_CODE_FILES, GATE_HELPER_FILE, HALF_ENTRIES, OPERATOR_ENTRY, OPERATOR_IMPORTS, RECEIPT_SCHEMA, RELEASE_GATE_HELPER, SEATABLE_ENV_SCHEMA, activateSettings,
  checkHalfArgv, checkSettingsGatesLive, checkSettingsVersion, gateHelperDifferences, gateSockets, hintFor, main, operatorArgv, planSettingsForSwitch,
  seatableEnvironmentText, settingsStatus } = settings;
const LAYOUT = common.LAYOUT;
const NODE = '/usr/local/lib/nodejs/bin/node';
// Keys are built from pieces (the secret scanner reads r<n>-<12 hex> as a key).
const OLD_KEY = ['r19', 'd50e33165a1b'].join('-');
const NEW_KEY = ['r20', '0123456789ab'].join('-');
const OLD = 'old-v1', NEW = 'new-v1';
const root = (label: string, service: string) => `/opt/debateai-v3-preview/releases/auth-dev-candidate-${label}-${service}`;
const engine = (label: string, service: string) => `${root(label, service)}/dialectical-engine`;
const loader = (label: string, service: string) => `--import=${pathToFileURL(`${engine(label, service)}/node_modules/tsx/dist/loader.mjs`).href}`;
const SNAPSHOT = 'c'.repeat(64);
const checkLine = (half: string, codes: string[] = [], key = NEW_KEY) =>
  `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ half, releaseKey: key, version: 21, verdict: codes.length ? 'FAIL' : 'PASS', codes, snapshotSha256: SNAPSHOT, checker: 'check-version-v1' })}`;
const ENV_VALUES: Record<string, Record<string, string>> = {
  runner: { NODE_ENV: 'production', RELEASE_KEY: NEW_KEY, DATABASE_URL: ['postgres://runner', 'pw@db/x'].join(':') },
  api: { NODE_ENV: 'production', RELEASE_KEY: NEW_KEY, DATABASE_URL: ['postgres://api', 'pw@db/x'].join(':'),
    PREVIEW_PROVIDER_TEST_CONFIG_JSON: JSON.stringify({ budget_socket: '/run/debateai-v3-preview/deepinfra-budget-v3.sock', anthropic_budget_socket: '/run/debateai-v3-preview/anthropic-budget-v1.sock',
      deployment: 'v3-preview', requested_thinking_level: 'high', scope_id: 'preview-team' }),
    // SA10: root hands the operator each declared target's model (the structure-repair model is seatable when served).
    PROVIDER_DISCOVERY_TARGETS_JSON: JSON.stringify([{ provider_ref: 'preview:fixture-a', model: 'zai-org/GLM-5.3-Flash' },
      { provider_ref: 'preview:fixture-b', model: 'zai-org/GLM-5.3-Flash' }, { provider_ref: 'preview:claude-haiku-5-5', model: 'claude-haiku-5-5' }]) }
};
/**
 * SA10 (addition D21, R65b): one gate code (the helper and the authority), installed in both gate folders, in each
 * release, and recorded by both GO files (helper_sha256, bridge_sha256).
 */
const HELPER = 'print("gate helper v3")\n';
const AUTHORITY = 'print("gate authority v3")\n';
const AUTHORITY_FILE = 'preview_budget_authority.py';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const gateFilesOf = (helper = HELPER, authority = AUTHORITY): Record<string, string> => Object.fromEntries([
  ...LAYOUT.gates.flatMap((gate: { folder: string; go: string }) => [[`${gate.folder}/${GATE_HELPER_FILE}`, helper], [`${gate.folder}/${AUTHORITY_FILE}`, authority],
    [gate.go, JSON.stringify({ helper_sha256: sha(helper), bridge_sha256: sha(authority) })]]),
  ...[OLD, NEW].flatMap(label => [[`${engine(label, 'api')}/${RELEASE_GATE_HELPER}`, helper], [`${engine(label, 'api')}/packages/providers/ops/${AUTHORITY_FILE}`, authority]])
]);
const IDS: Record<string, { uid: number; gid: number }> = { runner: { uid: 1201, gid: 1202 }, api: { uid: 1301, gid: 1302 } };

type Result = { code: number | null; signal: null; error: undefined | Error; timedOut: boolean; overflow: boolean; stdout: Buffer; stderr: Buffer };
const result = (stdout = '', code: number | null = 0, stderr = '', extra: Partial<Result> = {}): Result =>
  ({ code, signal: null, error: undefined, timedOut: false, overflow: false, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), ...extra });
type Call = { argv: string[]; opts: { cwd?: string; env: Record<string, string>; timeoutMs: number; maxOutputBytes: number } };
type Options = Partial<{
  halves: Record<string, Result>;
  operator: (args: string[]) => Result;
  current: string | null;
  remaining: Record<string, string | null>;
  envFails: string[];
  existing: string[];
  // Fix round 1: the release guard (release-guard.mjs verifyReleaseForImport) refuses these source roots.
  guardFails: string[];
  // Fix round 1: the lock's API source root for a label (the operator's folder comes from the lock).
  apiRoots: Record<string, string>;
  // SA10: the gate files and the releases' own helper, by path (absent = unreadable).
  gateFiles: Record<string, string>;
}>;

/** A fake preview host: the lock (two releases), the release table, the env files, the gates, the files root writes, and one runner for every command. */
function host(options: Options = {}) {
  const o = {
    halves: { runner: result(`${checkLine('runner')}\n`, 0), api: result(`> noise\n${checkLine('api')}\n`, 0) } as Record<string, Result>,
    operator: (args: string[]) => (args[0] === 'verdict'
      ? result(`DEBATEAI_SETTINGS_VERDICT ${JSON.stringify({ releaseKey: NEW_KEY, version: '21', verdict: 'PASS', digest: 'd'.repeat(64), codes: [] })}\n`, 0)
      : result(`DEBATEAI_SETTINGS_STATUS {"currentRelease":"${OLD_KEY}","pointer":"19","effectiveActive":"19","passed":["19"]}\n`)),
    current: OLD_KEY as string | null, remaining: { deepinfra: '{"enabled_models":[]}', anthropic: '{"enabled_models":["claude-haiku-5-5"]}' } as Record<string, string | null>,
    envFails: [] as string[], existing: [] as string[], guardFails: [] as string[], apiRoots: {} as Record<string, string>, gateFiles: gateFilesOf(), ...options
  };
  const calls: Call[] = [], log: string[] = [], files: Record<string, string> = {};
  const lockOf = () => {
    const release = (label: string, key: string) => ({ releaseKey: key, slot: label === OLD ? 'A' : 'B', databaseAhead: null, services: Object.fromEntries(['api', 'runner', 'ui'].map(service =>
      [service, { sourceRoot: service === 'api' ? o.apiRoots[label] ?? root(label, service) : root(label, service), serviceUid: IDS[service]?.uid ?? 1401, serviceGid: IDS[service]?.gid ?? 1402 }])) });
    return { schema: 'preview-lifecycle-release-lock-v2', releases: { [OLD]: release(OLD, OLD_KEY), [NEW]: release(NEW, NEW_KEY) } };
  };
  const deps = {
    nodePath: NODE,
    now: () => Date.parse('2026-10-23T01:46:00.123Z'),
    run: async (argv: string[], opts: Call['opts']) => {
      calls.push({ argv, opts });
      if (argv[0] === LAYOUT.setpriv) {
        const half = argv.some(part => part.endsWith(HALF_ENTRIES.runner)) ? 'runner' : 'api';
        log.push(`half ${half}`);
        return o.halves[half]!;
      }
      if (argv[0] === LAYOUT.runuser) {
        const args = argv.slice(argv.findIndex(part => part.endsWith(OPERATOR_ENTRY)) + 1);
        log.push(`operator ${args[0]}`);
        return o.operator(args);
      }
      throw new Error(`unexpected ${argv.join(' ')}`);
    },
    readLock: async () => ({ lock: lockOf(), lockSha256: 'f'.repeat(64) }),
    // prestart.mjs loadPinnedRelease: the lock entry and the release's reviewed launch plan.
    loadPinned: async ({ service, label }: { service: string; label: string }) => {
      const release = lockOf().releases[label as keyof ReturnType<typeof lockOf>['releases']];
      if (!release) throw Object.assign(new Error('missing'), { code: 'RELEASE_LOCK_RELEASE_MISSING' });
      const entry = (release.services as Record<string, { sourceRoot: string; serviceUid: number; serviceGid: number }>)[service]!;
      return { release, entry, plan: { service, sourceRoot: entry.sourceRoot, sourceManifest: { path: `${entry.sourceRoot}.manifest.json` } } };
    },
    guard: async ({ plan, importPaths, role }: { plan: { sourceRoot: string }; importPaths: string[]; role?: string }) => {
      log.push(`guard ${plan.sourceRoot} ${role ?? 'api'} ${importPaths.map(path => path.slice(plan.sourceRoot.length + 1)).join(' ')}`);
      if (o.guardFails.includes(plan.sourceRoot)) throw Object.assign(new Error('guard'), { code: 'RELEASE_PATH_NOT_ROOT_ONLY' });
      return {};
    },
    readCurrentRelease: async () => (o.current === null ? null : { releaseKey: o.current, takeTrafficFrom: '2026-10-22T03:15:05.000Z' }),
    readEnvironment: async (path: string, gid: number) => {
      log.push(`env ${path} gid ${gid}`);
      const service = /\/(api|runner)-[a-z0-9-]+\.env$/.exec(path)![1]!;
      if (o.envFails.includes(service)) throw Object.assign(new Error('refused'), { code: 'PREVIEW_ENVIRONMENT_REFUSED' });
      return ENV_VALUES[service]!;
    },
    pathExists: async (path: string) => o.existing.includes(path),
    readRemaining: async (socket: string, scope: string) => {
      const gate = socket.includes('anthropic') ? 'anthropic' : 'deepinfra';
      log.push(`remaining ${gate} ${scope}`);
      return o.remaining[gate] ?? null;
    },
    writeFile: async (path: string, text: string) => { log.push(`write ${path}`); files[path] = text; },
    ensureCurrentDir: async (path: string) => { log.push(`folder ${path}`); },
    readBytes: async (path: string) => {
      if (!Object.hasOwn(o.gateFiles, path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return Buffer.from(o.gateFiles[path]!);
    }
  };
  return { deps, calls, log, files };
}
const refusal = async (promise: Promise<unknown>) => promise.then(() => { throw new Error('expected a refusal'); }, (error: any) => error);
const operatorCalls = (calls: Call[]) => calls.filter(call => call.argv[0] === LAYOUT.runuser);
const STAMP = '20261023T014600Z';
const CURRENT_NEW = `/opt/debateai-v3-preview/artifacts/lifecycle-current-${NEW}`;

describe('the command lines (side-by-side spec §13, S15)', () => {
  it('runs the operator as postgres through the local socket, from a release folder, with libpq\'s environment only', () => {
    expect(operatorArgv({ layout: LAYOUT, nodePath: NODE, engine: engine(NEW, 'api'), args: ['status'] })).toEqual([
      '/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/env', '-i', 'PATH=/usr/local/lib/nodejs/bin:/usr/local/bin:/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC',
      'TSX_DISABLE_CACHE=1', 'PGHOST=/run/debateai-v3-preview/postgresql', 'PGPORT=5434', 'PGDATABASE=debateai', 'PGUSER=postgres', 'PGCONNECT_TIMEOUT=3',
      NODE, loader(NEW, 'api'), `${engine(NEW, 'api')}/tools/settings-version/cli.ts`, 'status'
    ]);
    expect(() => operatorArgv({ layout: LAYOUT, nodePath: NODE, engine: engine(NEW, 'api'), args: ['a\0b'] })).toThrow(expect.objectContaining({ code: 'ARGUMENTS_REFUSED' }));
  });

  it('runs a half with its unit\'s pinned identity, from its own folder, the version its one argument', () => {
    expect(checkHalfArgv({ layout: LAYOUT, nodePath: NODE, engine: engine(NEW, 'runner'), identity: IDS.runner, half: 'runner', version: 21 })).toEqual([
      '/usr/bin/setpriv', '--reuid=1201', '--regid=1202', '--init-groups', '--inh-caps=-all', '--no-new-privs', '--',
      NODE, loader(NEW, 'runner'), `${engine(NEW, 'runner')}/apps/runner/src/settings-check-cli.ts`, '21'
    ]);
    expect(HALF_ENTRIES).toEqual({ runner: 'apps/runner/src/settings-check-cli.ts', api: 'apps/api/src/settings-check-cli.ts' });
    for (const bad of [{ half: 'ui' }, { identity: { uid: 0, gid: 1 } }, { version: '021' }]) {
      expect(() => checkHalfArgv({ layout: LAYOUT, nodePath: NODE, engine: engine(NEW, 'runner'), identity: IDS.runner, half: 'runner', version: 21, ...bad })).toThrow();
    }
  });
});

describe('check <label> <version>', () => {
  it('runs both halves from their own folders as their own users with their own env files, keeps the lines, records the verdict', async () => {
    const h = host();
    const r = await checkSettingsVersion({ label: NEW, version: 21, layout: LAYOUT, deps: h.deps });
    expect(r).toEqual({ event: 'PREVIEW_SETTINGS_CHECKED', label: NEW, releaseKey: NEW_KEY, version: '21', verdict: 'PASS', digest: 'd'.repeat(64), codes: [], hints: [],
      receipt: `${CURRENT_NEW}/settings-check-21-${STAMP}.json` });
    const [runner, api] = h.calls.filter(call => call.argv[0] === LAYOUT.setpriv);
    for (const [call, half] of [[runner!, 'runner'], [api!, 'api']] as const) {
      expect(call.argv.slice(1, 3)).toEqual([`--reuid=${IDS[half]!.uid}`, `--regid=${IDS[half]!.gid}`]);
      expect(call.argv).toContain(`${engine(NEW, half)}/${HALF_ENTRIES[half]}`);
      expect(call.opts.cwd).toBe(engine(NEW, half));
      // The env file's values reach the half as its environment, never on its command line.
      expect(call.opts.env).toEqual({ ...ENV_VALUES[half], PATH: '/usr/local/lib/nodejs/bin:/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', TSX_DISABLE_CACHE: '1' });
      for (const value of Object.values(ENV_VALUES[half]!)) expect(call.argv.join(' ')).not.toContain(value);
    }
    expect(h.log.filter(line => line.startsWith('env '))).toEqual([
      `env /etc/debateai-v3-preview/auth-dev-v1/runner-${NEW}.env gid 1202`, `env /etc/debateai-v3-preview/auth-dev-v1/api-${NEW}.env gid 1302`
    ]);
    const receipt = JSON.parse(h.files[r.receipt]!);
    expect(receipt).toEqual({ schema: RECEIPT_SCHEMA, label: NEW, releaseKey: NEW_KEY, version: 21, recordedAt: '2026-10-23T01:46:00.123Z',
      runner: { half: 'runner', exitCode: 0, lines: [checkLine('runner')], unavailable: null }, api: { half: 'api', exitCode: 0, lines: [checkLine('api')], unavailable: null } });
    expect(h.files[`${CURRENT_NEW}/settings-check-21-${STAMP}-runner.txt`]).toBe(`${checkLine('runner')}\n`);
    expect(h.files[`${CURRENT_NEW}/settings-check-21-${STAMP}-api.txt`]).toBe(`${checkLine('api')}\n`);
    const [verdict] = operatorCalls(h.calls);
    expect(verdict!.argv.slice(-5)).toEqual(['verdict', '--runner', `${CURRENT_NEW}/settings-check-21-${STAMP}-runner.txt`, '--api', `${CURRENT_NEW}/settings-check-21-${STAMP}-api.txt`]);
    expect(verdict!.argv.slice(0, 4)).toEqual(['/usr/sbin/runuser', '-u', 'postgres', '--']);
    expect([verdict!.opts.cwd, verdict!.opts.env]).toEqual([engine(NEW, 'api'), {}]);
    const LOADER = 'dialectical-engine/node_modules/tsx/dist/loader.mjs';
    expect(h.log).toEqual([
      // The release guard first, for both folders, before any half or operator run (release-guard.mjs rule).
      `guard ${root(NEW, 'runner')} runner ${LOADER} dialectical-engine/apps/runner/src/settings-check-cli.ts`,
      `guard ${root(NEW, 'api')} api ${LOADER} dialectical-engine/apps/api/src/settings-check-cli.ts dialectical-engine/tools/settings-version/cli.ts dialectical-engine/tools/settings-version/settings-operator.ts`,
      `env /etc/debateai-v3-preview/auth-dev-v1/runner-${NEW}.env gid 1202`, 'half runner', `env /etc/debateai-v3-preview/auth-dev-v1/api-${NEW}.env gid 1302`, 'half api',
      `write ${r.receipt}`, `write ${CURRENT_NEW}/settings-check-21-${STAMP}-runner.txt`, `write ${CURRENT_NEW}/settings-check-21-${STAMP}-api.txt`, 'operator verdict'
    ]);
  });

  it('a FAIL lists every code with one plain hint each', async () => {
    const codes = ['SETTINGS_HASH_UNDECLARED:mapContractHash', 'SETTINGS_SITE_MEMBER_DIFFERS:costEnvelopePolicy.daily_ceiling_micros', 'SOMETHING_NEW'];
    const h = host({
      halves: { runner: result(`${checkLine('runner', codes.slice(0, 2))}\n`, 1), api: result(`${checkLine('api', codes.slice(2))}\n`, 1) },
      operator: () => result(`DEBATEAI_SETTINGS_VERDICT ${JSON.stringify({ releaseKey: NEW_KEY, version: '21', verdict: 'FAIL', digest: 'e'.repeat(64), codes })}\n`, 1)
    });
    const r = await checkSettingsVersion({ label: NEW, version: 21, layout: LAYOUT, deps: h.deps });
    expect(r.verdict).toBe('FAIL');
    expect(r.hints).toEqual([
      { code: codes[0], hint: CHECK_HINTS.SETTINGS_HASH_UNDECLARED },
      { code: codes[1], hint: 'a site rule changed: that needs an upload' },
      { code: codes[2], hint: CHECK_HINTS.DEFAULT }
    ]);
    expect(hintFor('SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:preview:x')).toBe('the release\'s environment would have to change: that needs an upload');
    expect(hintFor('DEFAULT')).toBe(CHECK_HINTS.DEFAULT);
  });

  it('no database write when a half could not run: the receipt says why, the operator is never asked', async () => {
    const cases: [Options, Record<string, string>][] = [
      [{ halves: { runner: result('', 2, 'SETTINGS_CHECK_UNAVAILABLE:ECONNREFUSED\n'), api: result(`${checkLine('api')}\n`) } }, { runner: 'ECONNREFUSED' }],
      [{ halves: { runner: result(`${checkLine('runner')}\n`), api: result('', null, '', { timedOut: true }) } }, { api: 'TIMEOUT' }],
      [{ halves: { runner: result('nothing\n', 0), api: result(`${checkLine('api')}\n${checkLine('api')}\n`, 0) } }, { runner: 'REPORT_LINE_MISSING', api: 'REPORT_LINE_COUNT' }],
      [{ envFails: ['api'] }, { api: 'ENVIRONMENT_UNREADABLE' }]
    ];
    for (const [options, halves] of cases) {
      const h = host(options);
      const error = await refusal(checkSettingsVersion({ label: NEW, version: 21, layout: LAYOUT, deps: h.deps }));
      expect(error).toMatchObject({ code: 'SETTINGS_CHECK_HALF_UNAVAILABLE', fields: { halves, receipt: `${CURRENT_NEW}/settings-check-21-${STAMP}.json` } });
      expect(operatorCalls(h.calls)).toEqual([]);
      expect(Object.keys(h.files)).toEqual([`${CURRENT_NEW}/settings-check-21-${STAMP}.json`]);
    }
    // A bad report (the operator refuses it): its code, nothing recorded.
    const bad = host({ operator: () => result('', 2, 'DEBATEAI_SETTINGS_REFUSED {"command":"verdict","code":"SETTINGS_CHECK_REPORT_INVALID"}\n') });
    expect((await refusal(checkSettingsVersion({ label: NEW, version: 21, layout: LAYOUT, deps: bad.deps }))).code).toBe('SETTINGS_CHECK_REPORT_INVALID');
    // An unpinned label refuses before anything runs.
    const unknown = host();
    expect((await refusal(checkSettingsVersion({ label: 'other-v1', version: 21, layout: LAYOUT, deps: unknown.deps }))).code).toBe('RELEASE_LOCK_RELEASE_MISSING');
    expect(unknown.calls).toEqual([]);
  });
});

describe('activate and status', () => {
  it('activate reads both gates\' /remaining from the current release\'s API env sockets, saves each answer, hands them to the operator', async () => {
    const h = host({ operator: () => result(`DEBATEAI_SETTINGS_ACTIVATED {"version":"21","previous":"19","releaseKey":"${OLD_KEY}","activationSeq":"4"}\n`) });
    const out = await activateSettings({ version: 21, by: 'owner', reason: 'longer answers', layout: LAYOUT, deps: h.deps });
    expect(out.code).toBe(0);
    expect(out.stdout).toEqual([`DEBATEAI_SETTINGS_ACTIVATED {"version":"21","previous":"19","releaseKey":"${OLD_KEY}","activationSeq":"4"}`]);
    const folder = `/opt/debateai-v3-preview/artifacts/lifecycle-current-${OLD}`;
    expect(h.log).toEqual([
      `guard ${root(OLD, 'api')} api dialectical-engine/node_modules/tsx/dist/loader.mjs dialectical-engine/tools/settings-version/cli.ts dialectical-engine/tools/settings-version/settings-operator.ts`,
      `env /etc/debateai-v3-preview/auth-dev-v1/api-${OLD}.env gid 1302`,
      `folder ${folder}`,
      `write ${folder}/settings-activate-${STAMP}-seatable-env.json`,
      'remaining deepinfra preview-team', `write ${folder}/settings-activate-${STAMP}-deepinfra-remaining.json`,
      'remaining anthropic preview-team', `write ${folder}/settings-activate-${STAMP}-anthropic-remaining.json`,
      'operator activate'
    ]);
    expect(h.files[`${folder}/settings-activate-${STAMP}-anthropic-remaining.json`]).toBe('{"enabled_models":["claude-haiku-5-5"]}');
    // SA10: the release's line-up (the env text as it is) and its target models, for the operator's seatable set.
    expect(JSON.parse(h.files[`${folder}/settings-activate-${STAMP}-seatable-env.json`]!)).toEqual({ schema: SEATABLE_ENV_SCHEMA,
      previewConfig: ENV_VALUES.api!.PREVIEW_PROVIDER_TEST_CONFIG_JSON, declaredModels: ['zai-org/GLM-5.3-Flash', 'claude-haiku-5-5'] });
    const [call] = operatorCalls(h.calls);
    expect(call!.opts.cwd).toBe(engine(OLD, 'api'));
    expect(call!.argv.slice(call!.argv.indexOf(`${engine(OLD, 'api')}/${OPERATOR_ENTRY}`) + 1)).toEqual(['activate', '21', '--by', 'owner', '--reason', 'longer answers',
      '--seatable-env', `${folder}/settings-activate-${STAMP}-seatable-env.json`,
      '--gate-remaining', `deepinfra=${folder}/settings-activate-${STAMP}-deepinfra-remaining.json`, '--gate-remaining', `anthropic=${folder}/settings-activate-${STAMP}-anthropic-remaining.json`]);
  });

  it('a gate that does not answer gets no file (the operator\'s condition 6 refuses its models); the operator\'s exit code passes through', async () => {
    const h = host({ remaining: { deepinfra: '{"x":1}', anthropic: null },
      operator: () => result('', 1, 'DEBATEAI_SETTINGS_REFUSED {"command":"activate","code":"SETTINGS_GATE_LIVE_CHECK_FAILED","codes":["SETTINGS_GATE_UNANSWERED:anthropic"]}\n') });
    const out = await activateSettings({ version: 21, by: 'owner', reason: 'x', layout: LAYOUT, deps: h.deps });
    expect(out.code).toBe(1);
    const [call] = operatorCalls(h.calls);
    expect(call!.argv.filter(part => part.startsWith('anthropic='))).toEqual([]);
    expect(call!.argv.filter(part => part.startsWith('deepinfra='))).toHaveLength(1);
    expect(gateSockets(ENV_VALUES.api!.PREVIEW_PROVIDER_TEST_CONFIG_JSON!, LAYOUT.gates)).toEqual({ scopeId: 'preview-team',
      sockets: { deepinfra: '/run/debateai-v3-preview/deepinfra-budget-v3.sock', anthropic: '/run/debateai-v3-preview/anthropic-budget-v1.sock' } });
    expect(() => gateSockets('{}', LAYOUT.gates)).toThrow(expect.objectContaining({ code: 'PREVIEW_GATE_SETTINGS_MISSING' }));
    // No current release: nothing is read.
    const none = host({ current: null });
    expect((await refusal(activateSettings({ version: 21, by: 'owner', reason: 'x', layout: LAYOUT, deps: none.deps }))).code).toBe('NO_CURRENT_RELEASE');
    expect(none.calls).toEqual([]);
  });

  it('status is the operator command from the current release\'s API folder', async () => {
    const h = host();
    const out = await settingsStatus({ layout: LAYOUT, deps: h.deps });
    expect(out).toEqual({ code: 0, stdout: [`DEBATEAI_SETTINGS_STATUS {"currentRelease":"${OLD_KEY}","pointer":"19","effectiveActive":"19","passed":["19"]}`], stderr: [] });
    expect(operatorCalls(h.calls)[0]!.opts.cwd).toBe(engine(OLD, 'api'));
  });
});

describe('the gate-code fingerprint and the live check for a switch (addition D21, ruling R60, SA10)', () => {
  const differs = (gate: string) => `SETTINGS_GATE_HELPER_DIFFERS:${gate}`;
  it('activate refuses SETTINGS_GATE_HELPER_DIFFERS:anthropic when that gate\'s helper file has another sha256: no gate asked, nothing written, the operator never run', async () => {
    const anthropic = LAYOUT.gates.find((gate: { name: string }) => gate.name === 'anthropic')!;
    const h = host({ gateFiles: { ...gateFilesOf(), [`${anthropic.folder}/${GATE_HELPER_FILE}`]: 'print("older gate helper")\n' } });
    const error = await refusal(activateSettings({ version: 21, by: 'owner', reason: 'x', layout: LAYOUT, deps: h.deps }));
    expect(error).toMatchObject({ code: 'SETTINGS_GATE_HELPER_DIFFERS', fields: { codes: [differs('anthropic')],
      hints: [{ code: differs('anthropic'), hint: CHECK_HINTS.SETTINGS_GATE_HELPER_DIFFERS }] } });
    expect([operatorCalls(h.calls), h.files, h.log.filter(line => line.startsWith('remaining') || line.startsWith('env'))]).toEqual([[], {}, []]);
  });

  it('the three digests must agree: the gate folder\'s file, the release\'s own copy and the GO\'s helper_sha256', async () => {
    const io = (files: Record<string, string>) => ({ readBytes: async (path: string) => {
      if (!Object.hasOwn(files, path)) throw new Error('ENOENT');
      return Buffer.from(files[path]!);
    } });
    const deepinfra = LAYOUT.gates.find((gate: { name: string }) => gate.name === 'deepinfra')!;
    const engineOld = engine(OLD, 'api');
    expect(await gateHelperDifferences({ engine: engineOld, gates: LAYOUT.gates, io: io(gateFilesOf()) })).toEqual([]);
    // An old gate file with its old GO agree with each other, but not with this release.
    const old = gateFilesOf('print("old")\n');
    expect(await gateHelperDifferences({ engine: engineOld, gates: LAYOUT.gates, io: io({ ...old, [`${engineOld}/${RELEASE_GATE_HELPER}`]: HELPER }) }))
      .toEqual([differs('deepinfra'), differs('anthropic')]);
    // The GO names another digest; the GO is unreadable; the release's own copy is missing (every gate differs).
    expect(await gateHelperDifferences({ engine: engineOld, gates: LAYOUT.gates, io: io({ ...gateFilesOf(), [deepinfra.go]: JSON.stringify({ helper_sha256: 'a'.repeat(64) }) }) }))
      .toEqual([differs('deepinfra')]);
    expect(await gateHelperDifferences({ engine: engineOld, gates: LAYOUT.gates, io: io({ ...gateFilesOf(), [deepinfra.go]: '{' }) })).toEqual([differs('deepinfra')]);
    const noRelease = gateFilesOf();
    delete noRelease[`${engineOld}/${RELEASE_GATE_HELPER}`];
    expect(await gateHelperDifferences({ engine: engineOld, gates: LAYOUT.gates, io: io(noRelease) })).toEqual([differs('deepinfra'), differs('anthropic')]);
    // R65b: the authority (bridge) file the same way: its installed copy, the release's copy and the GO's bridge_sha256.
    const anthropic = LAYOUT.gates.find((gate: { name: string }) => gate.name === 'anthropic')!;
    expect(await gateHelperDifferences({ engine: engineOld, gates: LAYOUT.gates, io: io({ ...gateFilesOf(), [`${anthropic.folder}/${AUTHORITY_FILE}`]: 'older' }) }))
      .toEqual([differs('anthropic')]);
    expect(await gateHelperDifferences({ engine: engineOld, gates: LAYOUT.gates, io: io({ ...gateFilesOf(),
      [anthropic.go]: JSON.stringify({ helper_sha256: sha(HELPER), bridge_sha256: sha('older') }) }) })).toEqual([differs('anthropic')]);
    expect(await gateHelperDifferences({ engine: engineOld, gates: LAYOUT.gates, io: io({ ...gateFilesOf(), [anthropic.go]: JSON.stringify({ helper_sha256: sha(HELPER) }) }) }))
      .toEqual([differs('anthropic')]);
    expect(RELEASE_GATE_HELPER).toBe('packages/providers/ops/preview_budget_helper.py');
    expect(GATE_CODE_FILES).toEqual([{ file: 'preview_budget_helper.py', goMember: 'helper_sha256' }, { file: 'preview_budget_authority.py', goMember: 'bridge_sha256' }]);
  });

  it('the hand-over of the release\'s line-up and target models; an env without readable targets refuses', () => {
    expect(JSON.parse(seatableEnvironmentText(ENV_VALUES.api))).toEqual({ schema: SEATABLE_ENV_SCHEMA,
      previewConfig: ENV_VALUES.api!.PREVIEW_PROVIDER_TEST_CONFIG_JSON, declaredModels: ['zai-org/GLM-5.3-Flash', 'claude-haiku-5-5'] });
    for (const bad of [{ ...ENV_VALUES.api, PROVIDER_DISCOVERY_TARGETS_JSON: undefined }, { ...ENV_VALUES.api, PROVIDER_DISCOVERY_TARGETS_JSON: '[{"provider_ref":"x"}]' },
      { ...ENV_VALUES.api, PREVIEW_PROVIDER_TEST_CONFIG_JSON: undefined }, { ...ENV_VALUES.api, PROVIDER_DISCOVERY_TARGETS_JSON: '[]' }]) {
      expect(() => seatableEnvironmentText(bad)).toThrow(expect.objectContaining({ code: 'SETTINGS_SEATABLE_ENV_UNREADABLE' }));
    }
  });

  it('a forward switch\'s --activate <v>: the NEW release\'s fingerprint, then cli.ts gate-check from its own folder over its own env (read-only)', async () => {
    const h = host({ operator: () => result('DEBATEAI_SETTINGS_GATES_SERVE {"version":"21"}\n') });
    expect(await checkSettingsGatesLive({ label: NEW, version: 21, layout: LAYOUT, deps: h.deps })).toEqual({ version: 21, checked: true });
    expect(h.log).toEqual([
      `guard ${root(NEW, 'api')} api ${OPERATOR_IMPORTS.map((path: string) => `dialectical-engine/${path}`).join(' ')}`,
      `env /etc/debateai-v3-preview/auth-dev-v1/api-${NEW}.env gid 1302`,
      // R65 item 7: the STAGED release's own lifecycle-current folder is made if missing (as prestart makes it), never refused.
      `folder ${CURRENT_NEW}`,
      `write ${CURRENT_NEW}/settings-switch-${STAMP}-seatable-env.json`,
      'remaining deepinfra preview-team', `write ${CURRENT_NEW}/settings-switch-${STAMP}-deepinfra-remaining.json`,
      'remaining anthropic preview-team', `write ${CURRENT_NEW}/settings-switch-${STAMP}-anthropic-remaining.json`,
      'operator gate-check'
    ]);
    const [call] = operatorCalls(h.calls);
    expect(call!.opts.cwd).toBe(engine(NEW, 'api'));
    expect(call!.argv.slice(call!.argv.indexOf(`${engine(NEW, 'api')}/${OPERATOR_ENTRY}`) + 1)).toEqual(['gate-check', '21',
      '--seatable-env', `${CURRENT_NEW}/settings-switch-${STAMP}-seatable-env.json`,
      '--gate-remaining', `deepinfra=${CURRENT_NEW}/settings-switch-${STAMP}-deepinfra-remaining.json`, '--gate-remaining', `anthropic=${CURRENT_NEW}/settings-switch-${STAMP}-anthropic-remaining.json`]);
  });

  it('the switch\'s live check refuses with the operator\'s codes, or the fingerprint\'s, before the switch writes anything; the public server has no gates', async () => {
    const off = host({ operator: () => result('', 1, 'DEBATEAI_SETTINGS_REFUSED {"command":"gate-check","code":"SETTINGS_GATE_LIVE_CHECK_FAILED","codes":["SETTINGS_GATE_MODEL_DISABLED:deepinfra:deepseek-ai/DeepSeek-V4.1-Flash"]}\n') });
    expect(await refusal(checkSettingsGatesLive({ label: NEW, version: 21, layout: LAYOUT, deps: off.deps }))).toMatchObject({ code: 'SETTINGS_GATE_LIVE_CHECK_FAILED',
      fields: { codes: ['SETTINGS_GATE_MODEL_DISABLED:deepinfra:deepseek-ai/DeepSeek-V4.1-Flash'] } });
    const deepinfra = LAYOUT.gates.find((gate: { name: string }) => gate.name === 'deepinfra')!;
    const stale = host({ gateFiles: { ...gateFilesOf(), [`${deepinfra.folder}/${GATE_HELPER_FILE}`]: 'x' } });
    expect(await refusal(checkSettingsGatesLive({ label: NEW, version: 21, layout: LAYOUT, deps: stale.deps }))).toMatchObject({ code: 'SETTINGS_GATE_HELPER_DIFFERS', fields: { codes: [differs('deepinfra')] } });
    expect(operatorCalls(stale.calls)).toEqual([]);
    const silent = host({ operator: () => result('', null, '', { timedOut: true }) });
    expect((await refusal(checkSettingsGatesLive({ label: NEW, version: 21, layout: LAYOUT, deps: silent.deps }))).code).toBe('SETTINGS_OPERATOR_UNAVAILABLE');
    const vps = host();
    expect(await checkSettingsGatesLive({ label: NEW, version: 21, layout: common.VPS_LAYOUT, deps: vps.deps })).toEqual({ version: 21, checked: false });
    expect(vps.calls).toEqual([]);
    // A folder that cannot be made is a refusal before anything is saved or asked.
    const noFolder = host();
    noFolder.deps.ensureCurrentDir = async () => { throw Object.assign(new Error('x'), { code: 'LIFECYCLE_DIRECTORY_REFUSED' }); };
    expect((await refusal(checkSettingsGatesLive({ label: NEW, version: 21, layout: LAYOUT, deps: noFolder.deps }))).code).toBe('CURRENT_DIRECTORY_REFUSED');
    expect([noFolder.files, operatorCalls(noFolder.calls)]).toEqual([{}, []]);
  });

  it('one plain hint line per new code', () => {
    for (const code of ['SETTINGS_GATE_THINKING_UNREVIEWED:Qwen/Qwen3.8-Flash:high', 'SETTINGS_GATE_TOKEN_CEILING:synthesizerCallBound:zai-org/GLM-5.3-Flash',
      'SETTINGS_GATE_HELPER_DIFFERS:anthropic', 'PREVIEW_LINE_UP_REQUIRED', 'SETTINGS_CHECK_DETAIL_UNPRINTABLE',
      'SETTINGS_GATE_MODEL_DISABLED:deepinfra:zai-org/GLM-5.3-Flash', 'SETTINGS_GATE_UNANSWERED:anthropic', 'SETTINGS_GATE_LIVE_CHECK_FAILED']) {
      const hint = hintFor(code);
      expect(hint, code).not.toBe(CHECK_HINTS.DEFAULT);
      expect(hint, code).toMatch(/^[a-z][^\n]*[a-z)]$/u);
    }
    expect(hintFor('SETTINGS_NEEDS_ENV_CHANGE:TARGET:claude-haiku-5-5')).toBe(CHECK_HINTS.SETTINGS_NEEDS_ENV_CHANGE);
    expect(hintFor('SETTINGS_NEEDS_ENV_CHANGE:GATE_SOCKET:anthropic')).toBe(CHECK_HINTS.SETTINGS_NEEDS_ENV_CHANGE);
  });
});

describe('the switch\'s settings plan (ruling R12)', () => {
  const plan = (stdout: string, code = 0, stderr = '') => () => result(stdout, code, stderr);
  it('asks the new release\'s own operator first, else the other release\'s; neither: nothing planned, nothing run', async () => {
    const both = host({ existing: [`${engine(NEW, 'api')}/${OPERATOR_ENTRY}`, `${engine(OLD, 'api')}/${OPERATOR_ENTRY}`],
      operator: plan(`DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"${NEW_KEY}","expectedActiveSettings":"19","activate":null}\n`) });
    expect(await planSettingsForSwitch({ newKey: NEW_KEY, labels: [NEW, OLD], layout: LAYOUT, deps: both.deps })).toEqual({ expectedActiveSettings: 19, activate: null, planned: true });
    const [call] = operatorCalls(both.calls);
    expect(call!.opts.cwd).toBe(engine(NEW, 'api'));
    expect(call!.argv.slice(-2)).toEqual(['switch-plan', NEW_KEY]);
    // A rollback to a release that predates §13: the newer release's operator plans it.
    const older = host({ existing: [`${engine(NEW, 'api')}/${OPERATOR_ENTRY}`],
      operator: plan(`DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"${OLD_KEY}","expectedActiveSettings":"20","activate":"19"}\n`) });
    expect(await planSettingsForSwitch({ newKey: OLD_KEY, labels: [OLD, NEW], activate: 'latest-passed', layout: LAYOUT, deps: older.deps })).toEqual({ expectedActiveSettings: 20, activate: 19, planned: true });
    expect(operatorCalls(older.calls)[0]!.argv.slice(-3)).toEqual(['switch-plan', OLD_KEY, '--latest-passed']);
    const pinned = host({ existing: [`${engine(NEW, 'api')}/${OPERATOR_ENTRY}`],
      operator: plan(`DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"${NEW_KEY}","expectedActiveSettings":"19","activate":"21"}\n`) });
    await planSettingsForSwitch({ newKey: NEW_KEY, labels: [NEW, OLD], activate: 21, layout: LAYOUT, deps: pinned.deps });
    expect(operatorCalls(pinned.calls)[0]!.argv.slice(-4)).toEqual(['switch-plan', NEW_KEY, '--activate', '21']);
    for (const [layout, deps] of [[LAYOUT, host().deps], [common.VPS_LAYOUT, host({ existing: [`${engine(NEW, 'api')}/${OPERATOR_ENTRY}`] }).deps]] as const) {
      expect(await planSettingsForSwitch({ newKey: NEW_KEY, labels: [NEW, OLD], layout, deps })).toEqual({ expectedActiveSettings: null, activate: null, planned: false });
    }
  });

  it('a new release that has not passed the pointer refuses with what it passed; any other answer is SETTINGS_PLAN_UNAVAILABLE', async () => {
    const existing = [`${engine(NEW, 'api')}/${OPERATOR_ENTRY}`];
    const refused = host({ existing, operator: plan('', 4, 'warning\nDEBATEAI_SETTINGS_REFUSED {"command":"switch-plan","code":"SETTINGS_VERSION_NOT_PASSED","passed":["20","21"]}\n') });
    expect(await refusal(planSettingsForSwitch({ newKey: NEW_KEY, labels: [NEW, OLD], layout: LAYOUT, deps: refused.deps })))
      .toMatchObject({ code: 'SETTINGS_VERSION_NOT_PASSED', fields: { passed: ['20', '21'] } });
    for (const answer of [plan('', 2), plan(`DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"${OLD_KEY}","expectedActiveSettings":null,"activate":null}\n`),
      plan('DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"x"\n'), plan(`DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"${NEW_KEY}","expectedActiveSettings":"019","activate":null}\n`)]) {
      const h = host({ existing, operator: answer });
      expect((await refusal(planSettingsForSwitch({ newKey: NEW_KEY, labels: [NEW, OLD], layout: LAYOUT, deps: h.deps }))).code).toMatch(/^SETTINGS_(PLAN|OPERATOR)_UNAVAILABLE$/);
    }
    const timedOut = host({ existing, operator: () => result('', null, '', { timedOut: true }) });
    expect((await refusal(planSettingsForSwitch({ newKey: NEW_KEY, labels: [NEW], layout: LAYOUT, deps: timedOut.deps }))).code).toBe('SETTINGS_OPERATOR_UNAVAILABLE');
  });
});

describe('the release guard and the lock (fix round 1)', () => {
  it('a release that fails the source check runs nothing: no half, no operator, no write (RELEASE_UNVERIFIED)', async () => {
    for (const failing of [root(NEW, 'runner'), root(NEW, 'api')]) {
      const h = host({ guardFails: [failing] });
      expect(await refusal(checkSettingsVersion({ label: NEW, version: 21, layout: LAYOUT, deps: h.deps }))).toMatchObject({ code: 'RELEASE_UNVERIFIED', fields: { cause: 'RELEASE_PATH_NOT_ROOT_ONLY' } });
      expect([h.calls, h.files]).toEqual([[], {}]);
    }
    const activate = host({ guardFails: [root(OLD, 'api')] });
    expect((await refusal(activateSettings({ version: 21, by: 'owner', reason: 'x', layout: LAYOUT, deps: activate.deps }))).code).toBe('RELEASE_UNVERIFIED');
    expect([activate.calls, activate.log.filter(line => line.startsWith('remaining'))]).toEqual([[], []]);
    const status = host({ guardFails: [root(OLD, 'api')] });
    expect((await refusal(settingsStatus({ layout: LAYOUT, deps: status.deps }))).code).toBe('RELEASE_UNVERIFIED');
    expect(status.calls).toEqual([]);
    const plan = host({ guardFails: [root(NEW, 'api')], existing: [`${engine(NEW, 'api')}/${OPERATOR_ENTRY}`] });
    expect((await refusal(planSettingsForSwitch({ newKey: NEW_KEY, labels: [NEW, OLD], layout: LAYOUT, deps: plan.deps }))).code).toBe('RELEASE_UNVERIFIED');
    expect(plan.calls).toEqual([]);
  });

  it('the operator\'s folder is the lock\'s API source root, and the guard covers the files it loads', async () => {
    const fallback = '/opt/debateai-v3-preview/releases/auth-dev-fallback-new-v1-api';
    const h = host({ apiRoots: { [NEW]: fallback }, existing: [`${fallback}/dialectical-engine/${OPERATOR_ENTRY}`],
      operator: () => result(`DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"${NEW_KEY}","expectedActiveSettings":"19","activate":null}\n`) });
    await planSettingsForSwitch({ newKey: NEW_KEY, labels: [NEW, OLD], layout: LAYOUT, deps: h.deps });
    expect(operatorCalls(h.calls)[0]!.opts.cwd).toBe(`${fallback}/dialectical-engine`);
    expect(h.log[0]).toBe(`guard ${fallback} api ${OPERATOR_IMPORTS.map((path: string) => `dialectical-engine/${path}`).join(' ')}`);
    expect(OPERATOR_IMPORTS).toEqual(['node_modules/tsx/dist/loader.mjs', 'tools/settings-version/cli.ts', 'tools/settings-version/settings-operator.ts']);
  });

  it('release-guard.mjs verifies a runner release as role runner (its launcher\'s own check); any other role refuses first', async () => {
    const guard = await import('../../deploy/' + 'preview-lifecycle/v1/release-guard.mjs');
    const roles: string[] = [];
    let reads = 0;
    const readArtifact = async () => { reads += 1; return { uid: 0 }; };
    const verifyManifest = async (_source: unknown, expected: { role: string }) => { roles.push(expected.role); throw new Error('stop'); };
    const plan = { sourceManifest: { sha256: 'a'.repeat(64) }, sourceRevision: 'b'.repeat(40), sourceTree: 'c'.repeat(40), sourceRoot: root(NEW, 'runner') };
    for (const role of ['runner', undefined]) {
      await expect(guard.verifyReleaseForImport({ plan, importPaths: ['/x'], ...(role ? { role } : {}), readArtifact, verifyManifest })).rejects.toMatchObject({ code: 'RELEASE_UNVERIFIED' });
    }
    expect(roles).toEqual(['runner', 'api']);
    await expect(guard.verifyReleaseForImport({ plan, importPaths: ['/x'], role: 'ui', readArtifact, verifyManifest })).rejects.toMatchObject({ code: 'RELEASE_UNVERIFIED' });
    expect(reads).toBe(2);
  });

  it('activate with both gates silent still asks the operator, with no answer at all: its condition 6 refuses (ruling R59)', async () => {
    const h = host({ remaining: { deepinfra: null, anthropic: null },
      operator: () => result('', 1, 'DEBATEAI_SETTINGS_REFUSED {"command":"activate","code":"SETTINGS_GATE_LIVE_CHECK_FAILED","codes":["SETTINGS_GATE_UNANSWERED:anthropic","SETTINGS_GATE_UNANSWERED:deepinfra"]}\n') });
    const out = await activateSettings({ version: 21, by: 'owner', reason: 'x', layout: LAYOUT, deps: h.deps });
    expect(out.code).toBe(1);
    expect(operatorCalls(h.calls)[0]!.argv.filter(part => part === '--gate-remaining')).toEqual([]);
  });
});

describe('settings-version.mjs (root CLI)', () => {
  const sink = () => { const lines: string[] = []; return { lines, stream: { write: (text: string) => { lines.push(text); return true; } } }; };
  const cli = async (argv: string[], deps: Record<string, unknown>, actor: { platform?: string; uid?: number } = {}) => {
    const stdout = sink(), stderr = sink();
    const code = await main(argv, { platform: 'linux', uid: 0, layout: LAYOUT, deps, stdout: stdout.stream, stderr: stderr.stream, ...actor });
    return { code, stdout: stdout.lines.join(''), stderr: stderr.lines.join('') };
  };

  it('check exits 0 on PASS and 2 on FAIL with one line; activate and status print the operator\'s own line and exit with its code', async () => {
    const pass = await cli(['check', NEW, '21'], host().deps);
    expect([pass.code, JSON.parse(pass.stdout).event]).toEqual([0, 'PREVIEW_SETTINGS_CHECKED']);
    const failed = host({ operator: () => result(`DEBATEAI_SETTINGS_VERDICT ${JSON.stringify({ releaseKey: NEW_KEY, version: '21', verdict: 'FAIL', digest: 'e'.repeat(64), codes: ['X_Y'] })}\n`, 1) });
    expect((await cli(['check', NEW, '21'], failed.deps)).code).toBe(2);
    const conflict = host({ operator: () => result('', 3, 'tsx warning\nDEBATEAI_SETTINGS_REFUSED {"command":"activate","code":"SETTINGS_ACTIVATION_CONFLICT"}\n') });
    const activate = await cli(['activate', '21', '--by', 'owner', '--reason', 'a b c'], conflict.deps);
    expect([activate.code, activate.stdout, activate.stderr]).toEqual([3, '', 'DEBATEAI_SETTINGS_REFUSED {"command":"activate","code":"SETTINGS_ACTIVATION_CONFLICT"}\n']);
    const status = await cli(['status'], host().deps);
    expect([status.code, status.stdout]).toEqual([0, `DEBATEAI_SETTINGS_STATUS {"currentRelease":"${OLD_KEY}","pointer":"19","effectiveActive":"19","passed":["19"]}\n`]);
  });

  it('refuses any other argument shape, and anyone but root on Linux, before reading anything', async () => {
    for (const argv of [[], ['check', NEW], ['check', 'Bad', '21'], ['check', NEW, '021'], ['activate', '21', '--by', 'root:owner', '--reason', 'x'],
      ['activate', '21', '--by', 'owner', '--reason', ''], ['activate', '21', '--by', 'owner'], ['activate', '21', '--reason', 'x', '--by', 'owner'], ['status', 'x'], ['frobnicate']]) {
      const h = host();
      const out = await cli(argv, h.deps);
      expect([out.code, JSON.parse(out.stderr).reason], argv.join(' ')).toEqual([1, 'ARGUMENTS_REFUSED']);
      expect(h.calls).toEqual([]);
    }
    for (const actor of [{ uid: 1000 }, { platform: 'darwin' }]) {
      const h = host();
      expect(JSON.parse((await cli(['status'], h.deps, actor)).stderr).reason).toBe('ACTOR_REFUSED');
      expect(h.calls).toEqual([]);
    }
  });
});
