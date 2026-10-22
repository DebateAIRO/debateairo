// Root's settings-version tool for the preview (side-by-side spec §13 "Activating a settings version", §11; plan S15).
// Linux, Node v26.8.2, run by the operator as root. Node built-ins only: this file is installed in the root-owned
// operator directory, which has no node_modules of its own.
//
// Plain words: the owner changes debate settings without an upload. A new settings version is published (sealed) first;
// then this tool, in the style of the lifecycle's other actors:
//   - check <label> <version>   the dry boot of release <label> against <version>, both halves, each from the release's
//                               own folder as its unit's user with its own env file: the runner half
//                               (apps/runner/src/settings-check-cli.ts, the file `pnpm settings:check-runner` names) from
//                               the runner folder with runner-<label>.env, the API half (`settings:check-api`) from the API
//                               folder with api-<label>.env. Each half prints one DEBATEAI_SETTINGS_CHECK line; both are kept
//                               as a receipt, lifecycle-current-<label>/settings-check-<v>-<UTC>.json, and the operator
//                               records the verdict (tools/settings-version/cli.ts verdict). A FAIL lists every code with one
//                               plain hint. A half that could not run writes nothing to the database;
//   - activate <version> --by <owner> --reason <text>
//                               reads both spending gates' read-only /remaining (the sockets from the current release's API
//                               env file), saves each answer next to the current release's plans and hands them to
//                               `cli.ts activate`, which checks condition 6 live and moves the pointer; prints its line;
//   - status                    `cli.ts status`: the current release, the pointer, what new asks use, what passed.
// It also plans the release switch's settings step for release-switch.mjs and release-check.mjs (planSettingsForSwitch:
// `cli.ts switch-plan`, ruling R12).
//
// The operator commands run as the release writers' principal: root as `postgres` through the server's own socket (the
// same principal release-table.mjs's psql uses), from a release's API folder (the lock's services.api.sourceRoot, where
// tools/settings-version lives), with PATH, locale, TZ and libpq's PGHOST/PGPORT/PGDATABASE/PGUSER only. The halves run
// with the lock's pinned identity of their unit (serviceUid/serviceGid, the identity the launcher itself asserts,
// launch-plan.mjs) through setpriv with no new privileges, and their env file's values reach them only as the child's
// environment, never on a command line. Before ANY of that code runs, release-guard.mjs's source check passes for its
// release (the launchers' own check: the pinned manifest, byte for byte, and every file it loads root-only up to `/`),
// else RELEASE_UNVERIFIED and nothing runs (the rule jit-creator-actor.mjs follows).
//
// One JSON line per run on stdout (or the operator command's own line), one refusal line on stderr. Exit codes: check 0
// PASS, 2 FAIL, 1 refused (nothing recorded); activate and status: the operator command's own (0 done, 1 refused by
// condition 6 or the version's kind, 2 usage or unavailable, 3 conflict, 4 not passed); 1 for a refusal here.
import { request } from 'node:http';
import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readEnvironmentFile } from '../../preview-auth-dev/v1/environment.mjs';
import { LAYOUT, RELEASE_LABEL, atomicWrite, currentDirFor, envPathFor, logLine, runBounded } from './common.mjs';
import { loadPinnedRelease, readLock } from './prestart.mjs';
import { verifyReleaseForImport } from './release-guard.mjs';
import { RELEASE_KEY_PATTERN, readCurrentRelease } from './release-table.mjs';

/** The operator module's command file, inside a release's engine folder. */
export const OPERATOR_ENTRY = 'tools/settings-version/cli.ts';
/** check-version's two halves: the files the package scripts settings:check-runner and settings:check-api run. */
export const HALF_ENTRIES = Object.freeze({ runner: 'apps/runner/src/settings-check-cli.ts', api: 'apps/api/src/settings-check-cli.ts' });
/** tsx's loader inside a release's engine folder (as jit-creator-actor.mjs loads tsx from the release itself). */
export const TSX_LOADER = 'node_modules/tsx/dist/loader.mjs';
/** What the operator command loads first from the release (the guard checks each is root-only; the manifest covers the rest). */
export const OPERATOR_IMPORTS = Object.freeze([TSX_LOADER, OPERATOR_ENTRY, 'tools/settings-version/settings-operator.ts']);
/** Each half's dry boot reads the register and the site; it makes no AI call. The operator commands are small reads. */
export const HALF_TIMEOUT_MS = 300000, OPERATOR_TIMEOUT_MS = 60000, REMAINING_TIMEOUT_MS = 10000;
export const RECEIPT_SCHEMA = 'preview-settings-check-receipt-v1';
/** `activated_by`'s CHECK in migration 0124, exactly (no colon). */
export const ACTIVATED_BY = /^[A-Za-z0-9][A-Za-z0-9 ._@-]{0,127}$/;

/**
 * One plain hint per check-version code (the part before `:`): what the owner does next. A code with no row here gets
 * the last line. Operator text, English only.
 */
export const CHECK_HINTS = Object.freeze({
  SETTINGS_SITE_MEMBER_DIFFERS: 'a site rule changed: that needs an upload',
  SETTINGS_NEEDS_ENV_CHANGE: 'the release\'s environment would have to change: that needs an upload',
  SETTINGS_HASH_UNDECLARED: 'a prompt fingerprint is missing or differs from this release\'s code: publish the version with this code\'s fingerprints',
  SETTINGS_GATE_UNREVIEWED: 'a role names a model the spending gates never reviewed: choose a reviewed model',
  SETTINGS_ROW_UNCLASSIFIED: 'the version has a row this code does not know: the code must learn it first (an upload)',
  SETTINGS_VERSION_KIND_INVALID: 'only a sealed general settings version can be checked',
  STORY_DAILY_CEILING_INSUFFICIENT: 'the day\'s money cannot hold one full debate with its story: lower the per-debate ceiling',
  DEFAULT: 'the dry boot refused this version: read the code in the receipt and ask'
});
export const hintFor = code => {
  const name = String(code).split(':')[0];
  return Object.hasOwn(CHECK_HINTS, name) && name !== 'DEFAULT' ? CHECK_HINTS[name] : CHECK_HINTS.DEFAULT;
};

const CHECK_LINE = 'DEBATEAI_SETTINGS_CHECK ';
const VERSION = /^[1-9][0-9]{0,15}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SOCKET = /^\/[A-Za-z0-9._/-]{1,200}\.sock$/;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_REMAINING_BYTES = 64 * 1024;

class SettingsVersionRefusal extends Error { constructor(code, fields) { super(code); this.name = 'SettingsVersionRefusal'; this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new SettingsVersionRefusal(code, fields); };
const codeOf = error => (typeof error?.code === 'string' && CODE.test(error.code) ? error.code : 'UNEXPECTED');
const own = (object, key) => (object !== null && typeof object === 'object' && Object.hasOwn(object, key) ? object[key] : undefined);
const requireLabel = value => (typeof value === 'string' && RELEASE_LABEL.test(value) ? value : refuse('ARGUMENTS_REFUSED'));
const requireVersion = value => {
  const version = typeof value === 'string' && VERSION.test(value) ? Number(value) : Number.isSafeInteger(value) && value > 0 ? value : NaN;
  return Number.isSafeInteger(version) ? version : refuse('ARGUMENTS_REFUSED');
};
const reasonOk = value => typeof value === 'string' && value.length >= 1 && value.length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
/** A compact UTC instant for file names: 20261023T014600Z. */
const utcStamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/**
 * runuser -u postgres -- /usr/bin/env -i PATH=<node>:/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC
 *   TSX_DISABLE_CACHE=1 PGHOST=<sock> PGPORT=<port> PGDATABASE=<db> PGUSER=postgres PGCONNECT_TIMEOUT=3
 *   <node> --import=<engine>/node_modules/tsx/dist/loader.mjs <engine>/tools/settings-version/cli.ts <args…>
 */
export function operatorArgv({ layout, nodePath, engine, args }) {
  if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string' && !arg.includes('\0'))) refuse('ARGUMENTS_REFUSED');
  return [
    layout.runuser, '-u', 'postgres', '--', layout.env, '-i', `PATH=${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`, 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC',
    'TSX_DISABLE_CACHE=1', `PGHOST=${layout.pgSocketDir}`, `PGPORT=${layout.pgPort}`, `PGDATABASE=${layout.database}`, 'PGUSER=postgres', 'PGCONNECT_TIMEOUT=3',
    nodePath, `--import=${pathToFileURL(`${engine}/${TSX_LOADER}`).href}`, `${engine}/${OPERATOR_ENTRY}`, ...args
  ];
}

/**
 * setpriv --reuid=<uid> --regid=<gid> --init-groups --inh-caps=-all --no-new-privs -- <node> --import=<tsx loader> <engine>/<half entry> <v>
 * The unit's pinned identity; its env file's values come as the child's environment (checkHalfEnvironment). The lock pins
 * no supplementary groups (prestart.mjs ENTRY_KEYS), so the user's own groups (--init-groups) stand in for them: a half
 * reads what its unit's user may read (its env file's group, the database CA), nothing more.
 */
export function checkHalfArgv({ layout, nodePath, engine, identity, half, version }) {
  if (!Object.hasOwn(HALF_ENTRIES, half) || !Number.isSafeInteger(identity?.uid) || identity.uid < 1 || !Number.isSafeInteger(identity?.gid) || identity.gid < 1) refuse('ARGUMENTS_REFUSED');
  return [layout.setpriv, `--reuid=${identity.uid}`, `--regid=${identity.gid}`, '--init-groups', '--inh-caps=-all', '--no-new-privs', '--',
    nodePath, `--import=${pathToFileURL(`${engine}/${TSX_LOADER}`).href}`, `${engine}/${HALF_ENTRIES[half]}`, String(requireVersion(version))];
}
/** The half's environment: its env file's values, then PATH, locale, TZ and tsx's no-cache (these win). */
export const checkHalfEnvironment = (values, nodePath) => Object.freeze({
  ...values, PATH: `${dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', TSX_DISABLE_CACHE: '1'
});

const outputLines = buffer => (Buffer.isBuffer(buffer) ? buffer.toString('utf8') : '').split('\n').filter(Boolean);
const finished = result => Boolean(result) && !result.error && !result.timedOut && !result.overflow && Number.isInteger(result.code);

/** The dependencies with the server's defaults; tests replace them. */
function withDefaults(layout, deps) {
  const run = deps.run ?? runBounded;
  const uid = layout.ownerUid ?? 0, gid = layout.ownerGid ?? 0;
  return {
    run,
    now: deps.now ?? Date.now,
    nodePath: deps.nodePath ?? process.execPath,
    readLock: deps.readLock ?? (() => readLock(layout)),
    // A pinned release's lock entry and its reviewed launch plan (prestart.mjs), what the guard verifies against.
    loadPinned: deps.loadPinned ?? (({ service, label }) => loadPinnedRelease({ service, label, layout })),
    guard: deps.guard ?? verifyReleaseForImport,
    readCurrentRelease: deps.readCurrentRelease ?? (() => readCurrentRelease({ layout, run })),
    // A per-release env file: root-owned 0640 with the service's group (deploy/preview-auth-dev/v1/README.md).
    readEnvironment: deps.readEnvironment ?? ((path, serviceGid) => readEnvironmentFile(path, { root: layout.nativePlanRoot, uid, gid: serviceGid, mode: 0o640 })),
    pathExists: deps.pathExists ?? (path => lstat(path).then(stat => stat.isFile(), () => false)),
    readRemaining: deps.readRemaining ?? readRemaining,
    // Root-owned 0644 in the release's 0755 lifecycle-current folder: the operator (postgres) reads the answers back.
    writeFile: deps.writeFile ?? ((path, text) => atomicWrite(path, Buffer.from(text, 'utf8'), { mode: 0o644, uid, gid }))
  };
}

/** One operator command from `engine`; resolves { code, stdout lines, stderr lines } or refuses SETTINGS_OPERATOR_UNAVAILABLE. */
async function runOperator(io, layout, engine, args) {
  const result = await io.run(operatorArgv({ layout, nodePath: io.nodePath, engine, args }), { cwd: engine, env: {}, timeoutMs: OPERATOR_TIMEOUT_MS, maxOutputBytes: MAX_OUTPUT_BYTES });
  if (!finished(result)) refuse('SETTINGS_OPERATOR_UNAVAILABLE');
  return { code: result.code, stdout: outputLines(result.stdout), stderr: outputLines(result.stderr) };
}
/**
 * The release guard before any release code runs (release-guard.mjs): the release's pinned manifest and plan, each listed
 * file root-only. Any failure is RELEASE_UNVERIFIED (its own code in `cause`). Resolves the engine folder.
 */
async function verified(io, { entry, plan }, role, relativePaths) {
  const engine = `${entry.sourceRoot}/dialectical-engine`;
  try {
    await io.guard({ plan, role, importPaths: relativePaths.map(path => `${engine}/${path}`) });
  } catch (error) { refuse('RELEASE_UNVERIFIED', { cause: codeOf(error) }); }
  return engine;
}
/** A pinned release's API folder (the lock's services.api.sourceRoot): where its operator module lives. */
const apiEngineOf = pinned => `${pinned.entry.sourceRoot}/dialectical-engine`;

/** The one `<kind> <json>` line of an output, parsed; null when there is not exactly one. */
function oneLine(lines, kind) {
  const found = lines.filter(line => line.startsWith(`${kind} `));
  if (found.length !== 1) return null;
  try {
    const value = JSON.parse(found[0].slice(kind.length + 1));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
const versionOrNull = value => (value === null ? null : typeof value === 'string' && VERSION.test(value) ? Number(value) : refuse('SETTINGS_OPERATOR_UNAVAILABLE'));

/**
 * The release switch's settings step (ruling R12): `cli.ts switch-plan <newKey> [--activate <v> | --latest-passed]`, from
 * the first of `labels` whose folder carries the operator module (the new release's own, else the other one: a rollback
 * to a release that predates §13). Resolves { expectedActiveSettings, activate, planned }. Neither carries it, or the
 * public server: nothing to plan (the pointer cannot have been set by these releases' code), { null, null, false }: the
 * switch still passes NULL, and 0124's hook refuses SETTINGS_ACTIVATION_CONFLICT should a pointer exist after all.
 * SETTINGS_VERSION_NOT_PASSED (with `passed`) when the new release has not passed the pointer (or `activate`).
 */
export async function planSettingsForSwitch({ newKey, labels, activate = null, layout = LAYOUT, deps = {} }) {
  if (typeof newKey !== 'string' || !RELEASE_KEY_PATTERN.test(newKey) || !Array.isArray(labels) || labels.length < 1) refuse('ARGUMENTS_REFUSED');
  if (activate !== null && activate !== 'latest-passed') requireVersion(activate);
  // The public server (release-info 'overlay') has no settings operator until Phase 3 adopts these commands (plan D11).
  if (layout.releaseSource === 'overlay') return Object.freeze({ expectedActiveSettings: null, activate: null, planned: false });
  const io = withDefaults(layout, deps);
  let pinned = null;
  for (const label of labels) {
    const candidate = await io.loadPinned({ service: 'api', label: requireLabel(label) });
    if (await io.pathExists(`${apiEngineOf(candidate)}/${OPERATOR_ENTRY}`)) { pinned = candidate; break; }
  }
  if (pinned === null) return Object.freeze({ expectedActiveSettings: null, activate: null, planned: false });
  const engine = await verified(io, pinned, 'api', OPERATOR_IMPORTS);
  const mode = activate === null ? [] : activate === 'latest-passed' ? ['--latest-passed'] : ['--activate', String(activate)];
  const out = await runOperator(io, layout, engine, ['switch-plan', newKey, ...mode]);
  if (out.code === 4) {
    const refused = oneLine(out.stderr, 'DEBATEAI_SETTINGS_REFUSED');
    const passed = Array.isArray(refused?.passed) && refused.passed.every(value => typeof value === 'string' && VERSION.test(value)) ? refused.passed : [];
    refuse('SETTINGS_VERSION_NOT_PASSED', { passed });
  }
  const plan = out.code === 0 ? oneLine(out.stdout, 'DEBATEAI_SETTINGS_SWITCH_PLAN') : null;
  if (plan === null || plan.releaseKey !== newKey) refuse('SETTINGS_PLAN_UNAVAILABLE');
  return Object.freeze({ expectedActiveSettings: versionOrNull(plan.expectedActiveSettings), activate: versionOrNull(plan.activate), planned: true });
}

/**
 * The settings line of the release check: `cli.ts status` from release `label`'s API folder (null on the public server
 * or when the folder carries no operator module). Resolves { pointer, effectiveActive, passed } or null when nothing could be asked.
 */
export async function readSettingsStatus({ label, layout = LAYOUT, deps = {} }) {
  if (layout.releaseSource === 'overlay') return null;
  const io = withDefaults(layout, deps);
  const pinned = await io.loadPinned({ service: 'api', label: requireLabel(label) });
  if (!await io.pathExists(`${apiEngineOf(pinned)}/${OPERATOR_ENTRY}`)) return null;
  const out = await runOperator(io, layout, await verified(io, pinned, 'api', OPERATOR_IMPORTS), ['status']);
  const status = out.code === 0 ? oneLine(out.stdout, 'DEBATEAI_SETTINGS_STATUS') : null;
  if (status === null) refuse('SETTINGS_OPERATOR_UNAVAILABLE');
  return Object.freeze({ pointer: versionOrNull(status.pointer), effectiveActive: versionOrNull(status.effectiveActive), currentRelease: status.currentRelease ?? null });
}

/** A gate's read-only POST /remaining on its socket (Contract A §5): the raw reply body, or null on any failure. */
export function readRemaining(socketPath, scopeId) {
  return new Promise(resolve => {
    const body = JSON.stringify({ scope_id: scopeId });
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };
    const req = request({ socketPath, path: '/remaining', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > MAX_REMAINING_BYTES) { response.destroy(); done(null); } else chunks.push(chunk); });
      response.on('end', () => done(response.statusCode === 200 ? Buffer.concat(chunks).toString('utf8') : null));
      response.on('error', () => done(null));
    });
    req.setTimeout(REMAINING_TIMEOUT_MS, () => { req.destroy(); done(null); });
    req.on('error', () => done(null));
    req.end(body);
  });
}

/** The pinned release of `label` (prestart.mjs loadPinnedRelease): its key, and its runner and API entries with their plans. */
async function pinnedRelease(io, label) {
  const halves = {};
  for (const half of ['runner', 'api']) {
    const pinned = await io.loadPinned({ service: half, label });
    const entry = pinned?.entry;
    if (typeof entry?.sourceRoot !== 'string' || !Number.isSafeInteger(entry.serviceUid) || !Number.isSafeInteger(entry.serviceGid)) refuse('RELEASE_LOCK_RELEASE_MISSING');
    halves[half] = pinned;
  }
  return { releaseKey: halves.api.release?.releaseKey, services: { runner: halves.runner.entry, api: halves.api.entry }, pinned: halves };
}
/** The current release's label (the release table names its key; root's lock pins exactly one label for it). */
async function currentRelease(io) {
  const current = await io.readCurrentRelease();
  if (current === null) refuse('NO_CURRENT_RELEASE');
  const { lock } = await io.readLock();
  const labels = Object.keys(lock?.releases ?? {}).filter(name => lock.releases[name]?.releaseKey === current.releaseKey);
  if (labels.length !== 1) refuse('CURRENT_NOT_PINNED');
  return { label: labels[0], releaseKey: current.releaseKey, api: await io.loadPinned({ service: 'api', label: labels[0] }) };
}

/** One half: run it, keep its DEBATEAI_SETTINGS_CHECK lines; `unavailable` names why it could not report (content-free). */
async function runHalf(io, layout, label, release, half, version) {
  const entry = release.services[half];
  const engine = `${entry.sourceRoot}/dialectical-engine`;
  let values;
  try { values = await io.readEnvironment(envPathFor(layout, half, label), entry.serviceGid); } catch { return { half, exitCode: null, lines: [], unavailable: 'ENVIRONMENT_UNREADABLE' }; }
  const result = await io.run(checkHalfArgv({ layout, nodePath: io.nodePath, engine, identity: { uid: entry.serviceUid, gid: entry.serviceGid }, half, version }),
    { cwd: engine, env: checkHalfEnvironment(values, io.nodePath), timeoutMs: HALF_TIMEOUT_MS, maxOutputBytes: MAX_OUTPUT_BYTES });
  const lines = outputLines(result?.stdout).filter(line => line.startsWith(CHECK_LINE));
  if (!finished(result)) return { half, exitCode: null, lines, unavailable: result?.timedOut ? 'TIMEOUT' : 'NOT_RUN' };
  // Exit 2 is the half's "could not check" (SETTINGS_CHECK_USAGE / SETTINGS_CHECK_UNAVAILABLE:<reason> on stderr).
  const reason = /^SETTINGS_CHECK_UNAVAILABLE:([A-Z][A-Z0-9_]{0,63})$/.exec(outputLines(result.stderr).find(line => line.startsWith('SETTINGS_CHECK_')) ?? '');
  if (result.code !== 0 && result.code !== 1) return { half, exitCode: result.code, lines, unavailable: reason ? reason[1] : 'CHECK_UNAVAILABLE' };
  if (lines.length !== 1) return { half, exitCode: result.code, lines, unavailable: lines.length === 0 ? 'REPORT_LINE_MISSING' : 'REPORT_LINE_COUNT' };
  return { half, exitCode: result.code, lines, unavailable: null };
}

/**
 * `check <label> <version>` (spec §13): both halves, the receipt, then the verdict through the operator command. A half
 * that could not run refuses SETTINGS_CHECK_HALF_UNAVAILABLE after the receipt is written; nothing reaches the database.
 */
export async function checkSettingsVersion({ label, version, layout = LAYOUT, deps = {} }) {
  requireLabel(label);
  const v = requireVersion(version);
  const io = withDefaults(layout, deps);
  const release = await pinnedRelease(io, label);
  // The guard for both folders before anything runs: the runner half's files, and the API folder's half and operator.
  await verified(io, release.pinned.runner, 'runner', [TSX_LOADER, HALF_ENTRIES.runner]);
  await verified(io, release.pinned.api, 'api', [TSX_LOADER, HALF_ENTRIES.api, ...OPERATOR_IMPORTS.slice(1)]);
  const runner = await runHalf(io, layout, label, release, 'runner', v);
  const api = await runHalf(io, layout, label, release, 'api', v);
  const folder = currentDirFor(layout, label);
  const stamp = utcStamp(io.now());
  const receipt = `${folder}/settings-check-${v}-${stamp}.json`;
  await io.writeFile(receipt, `${JSON.stringify({ schema: RECEIPT_SCHEMA, label, releaseKey: release.releaseKey, version: v, recordedAt: new Date(io.now()).toISOString(), runner, api })}\n`);
  const unavailable = [runner, api].filter(half => half.unavailable !== null);
  if (unavailable.length) refuse('SETTINGS_CHECK_HALF_UNAVAILABLE', { halves: Object.fromEntries(unavailable.map(half => [half.half, half.unavailable])), receipt });
  const files = { runner: `${folder}/settings-check-${v}-${stamp}-runner.txt`, api: `${folder}/settings-check-${v}-${stamp}-api.txt` };
  await io.writeFile(files.runner, `${runner.lines[0]}\n`);
  await io.writeFile(files.api, `${api.lines[0]}\n`);
  const out = await runOperator(io, layout, `${release.services.api.sourceRoot}/dialectical-engine`, ['verdict', '--runner', files.runner, '--api', files.api]);
  const recorded = out.code === 0 || out.code === 1 ? oneLine(out.stdout, 'DEBATEAI_SETTINGS_VERDICT') : null;
  if (recorded === null) {
    const refused = oneLine(out.stderr, 'DEBATEAI_SETTINGS_REFUSED');
    refuse(typeof refused?.code === 'string' && CODE.test(refused.code) ? refused.code : 'SETTINGS_OPERATOR_UNAVAILABLE', { receipt });
  }
  const codes = Array.isArray(recorded.codes) ? recorded.codes.filter(code => typeof code === 'string') : [];
  return Object.freeze({
    event: 'PREVIEW_SETTINGS_CHECKED', label, releaseKey: recorded.releaseKey, version: recorded.version, verdict: recorded.verdict, digest: recorded.digest,
    codes, hints: codes.map(code => Object.freeze({ code, hint: hintFor(code) })), receipt
  });
}

/** The gate sockets the current release's API env names (PREVIEW_PROVIDER_TEST_CONFIG_JSON): gate name → socket. */
export function gateSockets(configText, gates) {
  let config;
  try { config = JSON.parse(configText); } catch { refuse('PREVIEW_GATE_SETTINGS_MISSING'); }
  if (config === null || typeof config !== 'object' || typeof config.scope_id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(config.scope_id)) refuse('PREVIEW_GATE_SETTINGS_MISSING');
  const sockets = {};
  for (const gate of gates) {
    const socket = gate.name === 'deepinfra' ? config.budget_socket : config[`${gate.name}_budget_socket`];
    if (typeof socket === 'string' && SOCKET.test(socket)) sockets[gate.name] = socket;
  }
  return { scopeId: config.scope_id, sockets };
}

/**
 * `activate <version> --by <owner> --reason <text>` (spec §13): the gates' live answers, then `cli.ts activate` from the
 * current release's API folder. A gate that does not answer gets no file: condition 6 then refuses the models it serves.
 * Resolves { code, stdout, stderr } of the operator command (its line is the receipt).
 */
export async function activateSettings({ version, by, reason, layout = LAYOUT, deps = {} }) {
  const v = requireVersion(version);
  if (typeof by !== 'string' || !ACTIVATED_BY.test(by) || !reasonOk(reason)) refuse('ARGUMENTS_REFUSED');
  const io = withDefaults(layout, deps);
  const { label, api: pinned } = await currentRelease(io);
  const engine = await verified(io, pinned, 'api', OPERATOR_IMPORTS);
  const environment = await io.readEnvironment(envPathFor(layout, 'api', label), pinned.entry.serviceGid).catch(() => refuse('ENVIRONMENT_UNREADABLE'));
  const { scopeId, sockets } = gateSockets(own(environment, 'PREVIEW_PROVIDER_TEST_CONFIG_JSON'), layout.gates);
  // SA10 (addition D21): the gate-code fingerprint check over layout.gates runs here, before any answer is read.
  const stamp = utcStamp(io.now());
  const args = ['activate', String(v), '--by', by, '--reason', reason];
  for (const gate of layout.gates) {
    if (!Object.hasOwn(sockets, gate.name)) continue;
    const answer = await io.readRemaining(sockets[gate.name], scopeId);
    if (typeof answer !== 'string') continue;
    const path = `${currentDirFor(layout, label)}/settings-activate-${stamp}-${gate.name}-remaining.json`;
    await io.writeFile(path, answer);
    args.push('--gate-remaining', `${gate.name}=${path}`);
  }
  return runOperator(io, layout, engine, args);
}

/** `status`: the operator command from the current release's API folder. */
export async function settingsStatus({ layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  const { api } = await currentRelease(io);
  return runOperator(io, layout, await verified(io, api, 'api', OPERATOR_IMPORTS), ['status']);
}

/** Exact argv shapes only; anything else refuses before a file, a unit or the database is touched. */
function parseArguments(argv) {
  const [a, b, c, d, e, f] = argv;
  const n = argv.length;
  if (n === 3 && a === 'check' && typeof b === 'string' && RELEASE_LABEL.test(b) && VERSION.test(c ?? '')) return { command: 'check', label: b, version: Number(c) };
  if (n === 6 && a === 'activate' && VERSION.test(b ?? '') && c === '--by' && typeof d === 'string' && e === '--reason' && typeof f === 'string') {
    if (!ACTIVATED_BY.test(d) || !reasonOk(f)) refuse('ARGUMENTS_REFUSED');
    return { command: 'activate', version: Number(b), by: d, reason: f };
  }
  if (n === 1 && a === 'status') return { command: 'status' };
  return refuse('ARGUMENTS_REFUSED');
}
const FAILED_EVENT = Object.freeze({ check: 'PREVIEW_SETTINGS_CHECK_REFUSED', activate: 'PREVIEW_SETTINGS_ACTIVATE_REFUSED', status: 'PREVIEW_SETTINGS_STATUS_REFUSED' });

/** One line per run (see the header); returns the exit code. */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    if (args.command === 'check') {
      const result = await checkSettingsVersion({ label: args.label, version: args.version, layout, deps });
      logLine(stdout, result);
      return result.verdict === 'PASS' ? 0 : 2;
    }
    const out = args.command === 'activate'
      ? await activateSettings({ version: args.version, by: args.by, reason: args.reason, layout, deps })
      : await settingsStatus({ layout, deps });
    for (const line of out.stdout) stdout.write(`${line}\n`);
    for (const line of out.stderr.filter(text => text.startsWith('DEBATEAI_SETTINGS_'))) stderr.write(`${line}\n`);
    return out.code;
  } catch (error) {
    logLine(stderr, { event: args ? FAILED_EVENT[args.command] : 'PREVIEW_SETTINGS_REFUSED', ...(args?.label ? { label: args.label } : {}), reason: codeOf(error), ...(error instanceof SettingsVersionRefusal && error.fields ? { fields: error.fields } : {}) });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
