// Root's release switch for the preview (side-by-side spec §6 and §11). Linux, Node v26.8.2, run by the operator as root.
//
// Plain words: two releases run side by side. This tool moves the site from the old one to the new one without an
// error page, and back again if needed:
//   - stage   records a new release as STAGED, before its runner, API and website start (prestart starts nothing else);
//   - seed    the transition only: the first current release, when the table has none yet (no edge, no stops);
//   - switch  one database write makes the new release current and the old one draining (break-before-make: the old
//             pair is not-ready at once, the new pair ready from take-traffic-from = the DATABASE clock + 5 s; Caddy holds
//             the requests in between); then the edge must show the new release three times in a row, one more health
//             interval passes, and only then the old website and API stop. The old runner is never stopped: it finishes
//             its own debates and retires by itself (spec §4). The backstop (switch + 27,000 s, an absolute UTC time
//             that survives a reboot) and the boot target are written last;
//   - rollback after a switch: the older release is staged again, its runner starts first (database-ahead mode, prestart),
//             then its API and website, then the same switch the other way; before a switch: the new release goes away.
//
//   release-switch.mjs stage --label <new>
//   release-switch.mjs seed --label <T>
//   release-switch.mjs switch --to <new> --from <old> [--old-pair-stopped]
//   release-switch.mjs rollback --to <older> --from <newer>
//   release-switch.mjs rollback --before-switch --label <new>
//
// Exit 0 with an empty `bad`; 2 when the command finished but a check after the database write failed (`bad` names it);
// 1 on a refusal (nothing after the refusal happened). One JSON line per run: codes, labels, keys, counts and times only,
// never the edge secret and never a response body. Root writes only the release table here, never a debate table.
//
// The edge (controller ruling D10 Q1): root reads readiness through Caddy's loopback listener (127.0.0.1:3090, GET
// /readyz only, caddy-slots.mjs). Every request may wait out Caddy's 10 s hold, so each one gets 12 s. A website's own
// answer always names its release in x-debateai-release, so an answer without that header is one Caddy made itself (no
// slot ready when its hold ran out); those, timeouts and connection errors are the switch's edge failures. A website's
// 503 during the break-before-make gap is an answer, not a failure. The operator watches the public site with a curl
// loop of their own during the switch (the guide, D15); this tool holds no site password.
import { readFile, lstat, readdir, readlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { PREVIEW_SLOTS } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { EDGE_LISTENER } from '../../preview-release/v1/caddy-slots.mjs';
import { LAYOUT, RELEASE_LABEL, atomicWrite, ensureDirectory, logLine, runBounded, sha256, unitNameFor } from './common.mjs';
import { readLock } from './prestart.mjs';
import { GATES, disarmTimers as disarmRetireTimers, gateState } from './release-retire.mjs';
import { RELEASE_KEY_PATTERN, countOpenWork, readCurrentRelease, readReleaseEvents, readReleaseState, recordReleaseEvent, recordReleaseSwitch } from './release-table.mjs';

/** Caddy's health_interval, the switch's take-traffic delay (two intervals + 1 s), the edge budget and the backstop. */
export const HEALTH_INTERVAL_S = 2, TAKE_TRAFFIC_AFTER_S = 5, EDGE_WAIT_MS = 30_000, EDGE_CONFIRMATIONS = 3, BACKSTOP_S = 27_000;
/** One edge request every 500 ms (after the previous one answered), each allowed 12 s: longer than lb_try_duration 10 s. */
export const EDGE_POLL_MS = 500, EDGE_REQUEST_TIMEOUT_MS = 12_000;
/** A release notice code is the label with `_` for `-`, at most 64 characters (alert.mjs, D6): longer labels never stage. */
export const MAX_LABEL_LENGTH = 64;
/** The rollback's waits: a runner's ready line (its prestart verifies first), then an API's (TimeoutStartSec=300 + 30 s). */
export const RUNNER_START_WAIT_MS = 240_000, FRONT_START_WAIT_MS = 330_000;
export const EDGE_URL = `http://${EDGE_LISTENER.bind}:${EDGE_LISTENER.port}/readyz`;
/** Caddy's copy of the edge secret (its health_headers send it); the website's /readyz answers only a request carrying it. */
export const EDGE_SECRET_PATH = '/etc/debateai-v3-preview/ui-edge.caddy.secret';
/** Written by the release check's maintenance gate (D11); while it exists no switch starts. */
export const MAINTENANCE_PENDING_NAME = 'maintenance-pending';
export const GATE_FILES_SCHEMA = 'preview-release-gate-files-v1';
const unitDirOf = layout => layout.systemdUnitDir ?? '/etc/systemd/system';
const targetDropinOf = layout => `${unitDirOf(layout)}/${layout.unitPrefix.replace(/-$/, '')}.target.d/60-current-release.conf`;
/** debateai-preview.target's drop-in naming the current release's website and API, so a boot starts that pair (§10). */
export const TARGET_DROPIN = targetDropinOf(LAYOUT);
/** Where the switch keeps the gate files' digests at the switch, for the release check (D11) to compare. */
export const gateFilesPathFor = (layout, releaseKey) => `${layout.stateDir}/release-${requireKey(releaseKey)}-gate-files.json`;

const RECORDED_BY = 'root:release-switch';
const ROLLBACK_BY = 'root:rollback';
const WAITING_REASONS = Object.freeze(['NOT_CURRENT', 'BEFORE_TAKE_TRAFFIC_FROM']);
const STOPPED = Object.freeze(['inactive', 'failed']);
const UNIT_STATES = Object.freeze(['active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating', 'maintenance', 'refreshing']);
const INVOCATION_ID = /^[0-9a-f]{32}$/;
const EDGE_SECRET_GRAMMAR = /^[A-Za-z0-9_-]{43,512}$/;
const WEBSITE_TIMEOUT_MS = 5000;
const START_POLL_MS = 2000;
/** The invocation's journal is read oldest first; its start line comes within minutes, so the first MiB always holds it. */
const JOURNAL_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_GATE_ENTRIES = 10_000, MAX_GATE_FILE_BYTES = 64 * 1024 * 1024;

class SwitchRefusal extends Error { constructor(code, fields) { super(code); this.name = 'SwitchRefusal'; this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new SwitchRefusal(code, fields); };
const codeOf = error => (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : 'UNEXPECTED');
const own = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined);
function requireKey(value) { return typeof value === 'string' && RELEASE_KEY_PATTERN.test(value) ? value : refuse('RELEASE_KEY_INVALID'); }
/** A release label (D1's RELEASE_LABEL) of at most 64 characters; anything else refuses before a path, unit or row is touched. */
function requireLabel(value) {
  if (typeof value !== 'string' || !RELEASE_LABEL.test(value)) refuse('ARGUMENTS_REFUSED');
  return value.length <= MAX_LABEL_LENGTH ? value : refuse('RELEASE_LABEL_TOO_LONG');
}
/** systemd's calendar form of a UTC instant, rounded UP to the whole second (a timer never fires before it). */
const utcCalendar = ms => new Date(Math.ceil(ms / 1000) * 1000).toISOString().replace('T', ' ').replace(/\.000Z$/, ' UTC');

/** `[Unit] Wants=` the release's API and website instances: what debateai-preview.target starts at boot. */
export function renderTargetDropin(label) {
  requireLabel(label);
  return [
    '# Written by release-switch.mjs at every switch (side-by-side spec §10); never edited by hand.',
    '[Unit]',
    `Wants=${unitNameFor(LAYOUT, 'api', label)} ${unitNameFor(LAYOUT, 'ui', label)}`,
    ''
  ].join('\n');
}

/** The backstop's absolute time (spec §4): a Persistent calendar timer fires after a reboot that skipped it. */
export function renderBackstopDropin({ label, at }) {
  requireLabel(label);
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) refuse('BACKSTOP_TIME_REFUSED');
  return `[Timer]\nOnCalendar=${utcCalendar(at.getTime())}\n`;
}

/** One GET with a deadline (headers and body); the body is read up to 64 KiB. Resolves { status, release, body } or rejects. */
export async function httpGet(url, { headers = {}, timeoutMs }) {
  const response = await fetch(url, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  const chunks = [];
  let size = 0;
  if (response.body) {
    // Leaving the loop by a throw cancels the stream.
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
      chunks.push(chunk);
    }
  }
  return { status: response.status, release: response.headers.get('x-debateai-release'), body: Buffer.concat(chunks).toString('utf8') };
}

/** Caddy's copy of the edge secret: root-owned, 0600 or 0640 (group caddy), the website's own grammar. Never printed. */
async function readEdgeSecret(uid) {
  let text;
  try {
    text = await withPrivateBytes(EDGE_SECRET_PATH, { root: dirname(EDGE_SECRET_PATH), uid, mode: [0o600, 0o640], maxBytes: 4096 }, raw => new TextDecoder('utf8', { fatal: true }).decode(raw).trim());
  } catch { refuse('EDGE_SECRET_UNREADABLE'); }
  return EDGE_SECRET_GRAMMAR.test(text) ? text : refuse('EDGE_SECRET_UNREADABLE');
}

/** A path that cannot be read counts as present: the maintenance flag fails closed. */
const pathExists = path => lstat(path).then(() => true, error => error?.code !== 'ENOENT');

async function fileDigest(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > MAX_GATE_FILE_BYTES) throw new Error('entry');
  return sha256(await readFile(path));
}

/** Every name under the folder (sorted, links not followed) with each file's bytes and each link's target, as one sha256. */
async function folderDigest(root) {
  const top = await lstat(root);
  if (!top.isDirectory() || top.isSymbolicLink()) throw new Error('folder');
  const records = [];
  const walk = async relative => {
    for (const entry of (await readdir(relative ? join(root, relative) : root)).sort()) {
      if (records.length >= MAX_GATE_ENTRIES) throw new Error('too many');
      const path = relative ? `${relative}/${entry}` : entry;
      const stat = await lstat(join(root, path));
      if (stat.isSymbolicLink()) records.push(['link', path, await readlink(join(root, path))]);
      else if (stat.isDirectory()) { records.push(['folder', path]); await walk(path); }
      else if (stat.isFile()) records.push(['file', path, await fileDigest(join(root, path))]);
      else throw new Error('entry');
    }
  };
  await walk('');
  return sha256(records.map(record => JSON.stringify(record)).join('\n'));
}

/**
 * Each gate's GO file and operator folder (file list and bytes) as sha256 digests, in GATES order. The switch saves them
 * (gateFilesPathFor) and the release check (D11) recomputes them with this same function. GATE_FILES_UNREADABLE otherwise.
 */
export async function gateFilesDigest(gates = GATES) {
  const digests = [];
  try {
    for (const gate of gates) digests.push(Object.freeze({ name: gate.name, goSha256: await fileDigest(gate.go), folderSha256: await folderDigest(gate.folder) }));
  } catch { refuse('GATE_FILES_UNREADABLE'); }
  return Object.freeze(digests);
}

/** The dependencies with the server's defaults; tests replace them. */
function withDefaults(layout, deps) {
  const run = deps.run ?? runBounded;
  const uid = layout.ownerUid ?? 0, gid = layout.ownerGid ?? 0;
  return {
    run,
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))),
    httpGet: deps.httpGet ?? httpGet,
    readLock: deps.readLock ?? readLock,
    readCurrentRelease: deps.readCurrentRelease ?? (() => readCurrentRelease({ layout, run })),
    readReleaseState: deps.readReleaseState ?? (input => readReleaseState({ ...input, layout, run })),
    readReleaseEvents: deps.readReleaseEvents ?? (input => readReleaseEvents({ ...input, layout, run })),
    countOpenWork: deps.countOpenWork ?? (input => countOpenWork({ ...input, layout, run })),
    recordReleaseSwitch: deps.recordReleaseSwitch ?? (input => recordReleaseSwitch({ ...input, layout, run })),
    recordReleaseEvent: deps.recordReleaseEvent ?? (input => recordReleaseEvent({ ...input, layout, run })),
    gateState: gate => gateState(gate, { run }),
    gateFilesDigest: deps.gateFilesDigest ?? (() => gateFilesDigest(GATES)),
    disarmTimers: ({ label }) => disarmRetireTimers({ label, layout, deps: { run } }),
    readEdgeSecret: deps.readEdgeSecret ?? (() => readEdgeSecret(uid)),
    pathExists: deps.pathExists ?? pathExists,
    // A root-owned unit drop-in (0644) in a root-owned 0755 folder, replaced atomically (as release-retire.mjs writes them).
    writeUnitFile: deps.writeUnitFile ?? (async (path, text) => {
      await ensureDirectory(dirname(path), { mode: 0o755, uid });
      await atomicWrite(path, Buffer.from(text, 'utf8'), { mode: 0o644, uid, gid });
    }),
    // Root's own state (0600 in the 0700 state folder), replaced at every switch to the same release.
    writeStateFile: deps.writeStateFile ?? (async (path, text) => {
      await ensureDirectory(dirname(path), { mode: 0o700, uid });
      await atomicWrite(path, Buffer.from(text, 'utf8'), { mode: 0o600, uid, gid });
    })
  };
}

/** `systemctl show <unit> --property=<a,b,…>` as key/value pairs; each asked property exactly once. */
async function showUnit(unit, properties, layout, io) {
  const result = await io.run([layout.systemctl, 'show', unit, `--property=${properties.join(',')}`, '--no-pager'], { env: {}, timeoutMs: 5000, maxOutputBytes: 4096 });
  if (!result || result.timedOut || result.overflow || result.error || result.code !== 0) refuse('UNIT_STATE_UNREADABLE');
  const shown = {};
  for (const line of String(result.stdout).split('\n').filter(Boolean)) {
    const at = line.indexOf('=');
    const key = line.slice(0, at);
    if (at < 1 || !properties.includes(key) || Object.hasOwn(shown, key)) refuse('UNIT_STATE_UNREADABLE');
    shown[key] = line.slice(at + 1);
  }
  if (Object.keys(shown).length !== properties.length) refuse('UNIT_STATE_UNREADABLE');
  return shown;
}

/** systemd's ActiveState of one unit, exactly. */
async function unitState(unit, layout, io) {
  const { ActiveState: state } = await showUnit(unit, ['ActiveState'], layout, io);
  return UNIT_STATES.includes(state) ? state : refuse('UNIT_STATE_UNREADABLE');
}

/** `systemctl <args…>`; true when systemd accepted it. A stop waits for the unit's own TimeoutStopSec (30 s) and its recorder. */
async function systemctl(args, layout, io) {
  const result = await io.run([layout.systemctl, ...args], { env: {}, timeoutMs: 90_000, maxOutputBytes: 4096 });
  return Boolean(result) && !result.timedOut && !result.overflow && !result.error && result.code === 0;
}

/**
 * The first `<kind> {json}` line of the unit's CURRENT invocation (PREVIEW_RUNNER_STARTED, PREVIEW_API_STARTED: the
 * launchers print it once, after readiness), or null. Oldest lines first and capped at 1 MiB: a long invocation's read
 * overflows the cap but still holds its start line, which comes within its first minutes.
 */
async function startedEvent(unit, kind, layout, io) {
  const { InvocationID: invocation } = await showUnit(unit, ['InvocationID'], layout, io);
  if (!INVOCATION_ID.test(invocation)) return null;
  const result = await io.run([layout.journalctl, '-u', unit, `_SYSTEMD_INVOCATION_ID=${invocation}`, '-o', 'cat', '--no-pager'], { env: {}, timeoutMs: 10_000, maxOutputBytes: JOURNAL_BYTES });
  if (!result || result.timedOut || result.error || (!result.overflow && result.code !== 0)) return null;
  const prefix = `${kind} `;
  // The last piece is '' after a complete read, or the cut line of an overflowing one: never parsed.
  for (const line of String(result.stdout).split('\n').slice(0, -1)) {
    if (!line.startsWith(prefix) || Buffer.byteLength(line) > 4096) continue;
    try {
      const event = JSON.parse(line.slice(prefix.length));
      if (event !== null && typeof event === 'object' && !Array.isArray(event)) return event;
    } catch { /* not a start line */ }
  }
  return null;
}

/** One read of the edge listener. `failed`: Caddy answered itself (no website release header), or nothing answered. */
async function readEdge(io) {
  try {
    const { status, release } = await io.httpGet(EDGE_URL, { headers: {}, timeoutMs: EDGE_REQUEST_TIMEOUT_MS });
    const named = typeof release === 'string' && RELEASE_KEY_PATTERN.test(release) ? release : null;
    return { failed: named === null, status, release: named };
  } catch { return { failed: true, status: null, release: null }; }
}

/** A slot's website /readyz, asked directly with the edge secret: { status, releaseKey, reasons } or null. */
async function readWebsite(slot, secret, io) {
  try {
    const { status, body } = await io.httpGet(`http://127.0.0.1:${PREVIEW_SLOTS[slot].uiPort}/readyz`, { headers: { 'x-debateai-edge-secret': secret }, timeoutMs: WEBSITE_TIMEOUT_MS });
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== 'object' || typeof parsed.releaseKey !== 'string' || !Array.isArray(parsed.reasons) || !parsed.reasons.every(reason => typeof reason === 'string')) return null;
    return { status, releaseKey: parsed.releaseKey, reasons: parsed.reasons };
  } catch { return null; }
}
/** Up and answering for `key`, but not ready only because it is not (yet) the one taking traffic. */
const waitingWebsite = (answer, key, allowed) => answer !== null && answer.status === 503 && answer.releaseKey === key
  && answer.reasons.length > 0 && answer.reasons.every(reason => allowed.includes(reason));

/**
 * Poll the edge until EDGE_CONFIRMATIONS answers in a row are 200 from `key`'s website; null after EDGE_WAIT_MS. Every
 * edge failure on the way is counted in `tally` (controller ruling Q1).
 */
async function confirmEdge(key, tally, io) {
  const startedAt = io.now();
  for (let inARow = 0; ;) {
    const answer = await readEdge(io);
    if (answer.failed) tally.edgeFailures += 1;
    inARow = !answer.failed && answer.status === 200 && answer.release === key ? inARow + 1 : 0;
    if (inARow >= EDGE_CONFIRMATIONS) return io.now() - startedAt;
    if (io.now() - startedAt >= EDGE_WAIT_MS) return null;
    await io.sleep(EDGE_POLL_MS);
  }
}

/**
 * One plain event. A RELEASE_TABLE_UNREADABLE answer may hide a write that did commit (D3 review): read the state again
 * and count the row as written when it shows; otherwise the refusal stands.
 */
async function recordEvent(io, { releaseKey, kind, recordedBy, reason = null, written }) {
  try {
    await io.recordReleaseEvent({ releaseKey, kind, recordedBy, reason });
  } catch (error) {
    if (error?.code !== 'RELEASE_TABLE_UNREADABLE') throw error;
    let after;
    try { after = await io.readReleaseState({ releaseKey }); } catch { throw error; }
    if (!written(after)) throw error;
  }
}

/**
 * The switch write. RELEASE_SWITCH_CONFLICT (and any other typed refusal) passes through untouched. After an unreadable
 * answer the current release is read again before anything is decided: the switch counts as done only if it shows;
 * a re-read that fails too is SWITCH_OUTCOME_UNKNOWN (the operator looks at the release table before anything else).
 */
async function recordSwitch(io, { newKey, expectedCurrentKey, seconds, recordedBy }) {
  try {
    await io.recordReleaseSwitch({ newKey, expectedCurrentKey, takeTrafficAfterSeconds: seconds, recordedBy });
  } catch (error) {
    if (error?.code !== 'RELEASE_TABLE_UNREADABLE') throw error;
    let after;
    try { after = await io.readCurrentRelease(); } catch { refuse('SWITCH_OUTCOME_UNKNOWN'); }
    if (after?.releaseKey !== newKey) throw error;
  }
}

/** True when the release's latest DRAINING has no later RETIRED (the database's own "still drains"). */
function stillDrains(events) {
  const last = kind => events.map(event => event.kind).lastIndexOf(kind);
  return last('DRAINING') > last('RETIRED');
}

/** The backstop of a draining release: its absolute time in the timer drop-in, then reload, enable, (re)start. */
async function armBackstop(label, atMs, layout, io) {
  const timer = `${layout.unitPrefix}runner-retire@${label}.timer`;
  const at = new Date(Math.ceil(atMs / 1000) * 1000);
  await io.writeUnitFile(`${unitDirOf(layout)}/${timer}.d/50-at.conf`, renderBackstopDropin({ label, at }));
  // restart, not start: an instance that already elapsed (a label that drained once before) ignores a start (D7 note).
  for (const args of [['daemon-reload'], ['enable', timer], ['restart', timer]]) if (!await systemctl(args, layout, io)) refuse('BACKSTOP_FAILED');
  return at.toISOString();
}

async function writeTarget(label, layout, io) {
  await io.writeUnitFile(targetDropinOf(layout), renderTargetDropin(label));
  if (!await systemctl(['daemon-reload'], layout, io)) refuse('TARGET_FAILED');
}

/** Stop a release's website and API in one call; true when both read stopped afterwards. */
async function stopPair(label, layout, io) {
  const units = [unitNameFor(layout, 'ui', label), unitNameFor(layout, 'api', label)];
  if (!await systemctl(['stop', ...units], layout, io)) return false;
  for (const unit of units) if (!STOPPED.includes(await unitState(unit, layout, io))) return false;
  return true;
}

/** FRONT_PAIR_STOPPED for a draining release, unless its API's stop recorder (D7's ExecStopPost) already wrote it. */
async function recordPairStopped(releaseKey, recordedBy, io) {
  const { state, frontPairStopped } = await io.readReleaseState({ releaseKey });
  if (state === 'DRAINING' && !frontPairStopped) await recordEvent(io, { releaseKey, kind: 'FRONT_PAIR_STOPPED', recordedBy, written: after => after.frontPairStopped });
}

/** Every read-only condition of the switch (spec §6); SWITCH_PRECONDITION_FAILED names each one that fails. */
async function preconditions({ to, from, oldPairStopped, rollback, layout, io }) {
  const { lock } = await io.readLock(layout);
  const toRelease = own(lock.releases, to), fromRelease = own(lock.releases, from);
  const fields = [];
  if (!toRelease) fields.push('to');
  if (!fromRelease) fields.push('from');
  if (fields.length) refuse('SWITCH_PRECONDITION_FAILED', fields);
  const toKey = toRelease.releaseKey, fromKey = fromRelease.releaseKey;
  if (toRelease.slot === fromRelease.slot) fields.push('slot');
  if ((await io.readCurrentRelease())?.releaseKey !== fromKey) fields.push('current');
  if ((await io.readReleaseState({ releaseKey: toKey })).state !== 'STAGED') fields.push('state');
  const runnerActive = await unitState(unitNameFor(layout, 'runner', to), layout, io) === 'active';
  if (!runnerActive) fields.push('runner');
  for (const service of ['api', 'ui']) if (await unitState(unitNameFor(layout, service, to), layout, io) !== 'active') fields.push(service);
  const oldPair = [await unitState(unitNameFor(layout, 'api', from), layout, io), await unitState(unitNameFor(layout, 'ui', from), layout, io)];
  if (!oldPair.every(state => (oldPairStopped ? STOPPED.includes(state) : state === 'active'))) fields.push('oldPair');
  if (runnerActive) {
    // A new release's runner re-sends nothing at its start (no work carries its key yet). In a rollback the older
    // runner may have restarted in database-ahead mode and re-sent its own lapsed work: any count is fine there.
    const started = await startedEvent(unitNameFor(layout, 'runner', to), 'PREVIEW_RUNNER_STARTED', layout, io);
    const dispatched = started?.startupDispatched;
    if (started?.releaseKey !== toKey || !Number.isSafeInteger(dispatched) || (rollback ? dispatched < 0 : dispatched !== 0)) fields.push('runnerStarted');
  }
  let secret = null;
  try { secret = await io.readEdgeSecret(); } catch { fields.push('edgeSecret'); }
  if (secret !== null && !waitingWebsite(await readWebsite(toRelease.slot, secret, io), toKey, WAITING_REASONS)) fields.push('website');
  if (!oldPairStopped) {
    const edge = await readEdge(io);
    if (edge.failed || edge.status !== 200 || edge.release !== fromKey) fields.push('edge');
  }
  let gatesActive = true;
  for (const gate of GATES) if (await io.gateState(gate) !== 'active') gatesActive = false;
  if (!gatesActive) fields.push('gates');
  if (await io.pathExists(`${layout.lockRoot}/${MAINTENANCE_PENDING_NAME}`)) fields.push('maintenance');
  if (fields.length) refuse('SWITCH_PRECONDITION_FAILED', fields);
  return { toKey, fromKey };
}

/**
 * The edge never showed the new release (controller ruling D10 Q2): the old release takes traffic again. The database
 * switches only to a STAGED release, so the old one is staged again (reason SWITCH_REVERTED) and then switched to. The
 * new release stays DRAINING with its website, API and runner running: nothing is stopped, and anything it admitted in
 * the meantime finishes on it (O1). Like every draining release it gets its backstop (from the switch back's own
 * database time); once its pair is stopped, its runner retires by itself. Always refuses; `backstopAt` null = not armed.
 * The guide (D15): retry with `rollback --to <to> --from <from>` (it disarms that backstop, stages <to> again and
 * switches); give up with `systemctl stop` of <to>'s website and API.
 */
async function revert({ to, toKey, fromKey, recordedBy, tally, layout, io }) {
  try {
    await recordEvent(io, { releaseKey: fromKey, kind: 'STAGED', recordedBy, reason: 'SWITCH_REVERTED', written: after => after.state === 'STAGED' });
    await recordSwitch(io, { newKey: fromKey, expectedCurrentKey: toKey, seconds: TAKE_TRAFFIC_AFTER_S, recordedBy });
  } catch (error) { refuse('SWITCH_REVERT_FAILED', { cause: codeOf(error), edgeFailures: tally.edgeFailures }); }
  let backstopAt = null;
  try {
    const current = await io.readCurrentRelease();
    if (current?.releaseKey === fromKey) backstopAt = await armBackstop(to, Date.parse(current.takeTrafficFrom) - TAKE_TRAFFIC_AFTER_S * 1000 + BACKSTOP_S * 1000, layout, io);
  } catch { /* reported as backstopAt null */ }
  if (await confirmEdge(fromKey, tally, io) === null) refuse('SWITCH_REVERT_UNCONFIRMED', { edgeFailures: tally.edgeFailures, backstopAt });
  refuse('SWITCH_REVERTED', { reason: 'EDGE_NOT_CONFIRMED', edgeFailures: tally.edgeFailures, backstopAt });
}

/**
 * The switch itself, in order: preconditions; the one database write; the edge (three confirmations, then one more
 * health interval: every Caddy proxy block has its own checker, so the public route may lag the listener by one);
 * the old pair's stop; the backstop; the boot target; the gate files; the final checks. Everything after the database
 * write is done even when a step fails: a failed step is named in `bad`, never a reason to leave the rest undone.
 */
async function runSwitch({ to, from, oldPairStopped, rollback, layout, io }) {
  requireLabel(to); requireLabel(from);
  if (to === from) refuse('SWITCH_PRECONDITION_FAILED', ['labels']);
  const recordedBy = rollback ? ROLLBACK_BY : RECORDED_BY;
  const { toKey, fromKey } = await preconditions({ to, from, oldPairStopped, rollback, layout, io });
  const tally = { edgeFailures: 0 };
  await recordSwitch(io, { newKey: toKey, expectedCurrentKey: fromKey, seconds: TAKE_TRAFFIC_AFTER_S, recordedBy });
  const switchedAt = new Date(io.now()).toISOString();
  const edgeConfirmedMs = await confirmEdge(toKey, tally, io);
  if (edgeConfirmedMs === null) await revert({ to, toKey, fromKey, recordedBy, tally, layout, io });
  await io.sleep(HEALTH_INTERVAL_S * 1000 + 500);
  const bad = [];
  const step = async (code, body) => { try { if (await body() === false) bad.push(code); } catch { bad.push(code); } };
  // The old website and API only; the old runner keeps finishing its debates and retires by itself (spec §4).
  let pairStopped = false;
  await step('OLD_PAIR_STOP', async () => (pairStopped = await stopPair(from, layout, io)));
  if (pairStopped) await step('FRONT_PAIR_STOPPED_RECORD', () => recordPairStopped(fromKey, recordedBy, io));
  let backstopAt = null;
  await step('BACKSTOP', async () => {
    const current = await io.readCurrentRelease();
    if (current?.releaseKey !== toKey) return false;
    // The database clock: take-traffic-from is the switch's own clock_timestamp() + 5 s.
    backstopAt = await armBackstop(from, Date.parse(current.takeTrafficFrom) - TAKE_TRAFFIC_AFTER_S * 1000 + BACKSTOP_S * 1000, layout, io);
  });
  await step('TARGET', () => writeTarget(to, layout, io));
  await step('GATE_FILES', async () => {
    const gates = await io.gateFilesDigest();
    await io.writeStateFile(gateFilesPathFor(layout, toKey), `${JSON.stringify({ schema: GATE_FILES_SCHEMA, releaseKey: toKey, label: to, recordedAt: new Date(io.now()).toISOString(), gates })}\n`);
  });
  // Final checks (spec §12 step 13.6). The old runner may already have retired (no open work left): that is fine.
  await step('RUNNER_FROM', async () => await unitState(unitNameFor(layout, 'runner', from), layout, io) === 'active'
    || (await io.readReleaseState({ releaseKey: fromKey })).state === 'RETIRED');
  await step('RUNNER_TO', async () => await unitState(unitNameFor(layout, 'runner', to), layout, io) === 'active');
  for (const gate of GATES) await step(`GATE_${gate.name.toUpperCase()}`, async () => await io.gateState(gate) === 'active');
  await step('EDGE_AFTER_STOP', async () => {
    const answer = await readEdge(io);
    if (answer.failed) tally.edgeFailures += 1;
    return !answer.failed && answer.status === 200 && answer.release === toKey;
  });
  if (tally.edgeFailures !== 0) bad.push('EDGE_FAILURES');
  return Object.freeze({ event: 'PREVIEW_RELEASE_SWITCHED', to, from, toKey, fromKey, switchedAt, edgeConfirmedMs, edgeFailures: tally.edgeFailures, backstopAt, bad: Object.freeze(bad) });
}

/** Side-by-side spec §6: switch the site from release `from` (current) to release `to` (STAGED, its three units up). */
export async function switchRelease({ to, from, oldPairStopped = false, layout = LAYOUT, deps = {} }) {
  return runSwitch({ to, from, oldPairStopped: oldPairStopped === true, rollback: false, layout, io: withDefaults(layout, deps) });
}

/** The pinned release of a label, from root's lock. */
async function pinned(label, layout, io) {
  requireLabel(label);
  const { lock } = await io.readLock(layout);
  return own(lock.releases, label) ?? refuse('RELEASE_LOCK_RELEASE_MISSING');
}

/** Record a new release as STAGED (before its units start: prestart starts only a STAGED or CURRENT release). Once only. */
export async function stageRelease({ label, layout = LAYOUT, deps = {} }) {
  requireLabel(label);
  const io = withDefaults(layout, deps);
  const { releaseKey } = await pinned(label, layout, io);
  const { state } = await io.readReleaseState({ releaseKey });
  if (state === 'STAGED') return Object.freeze({ event: 'PREVIEW_RELEASE_STAGED', label, releaseKey, recorded: false });
  // A current, draining or retired release is staged again only by the rollback, which also restarts what it needs.
  if (state !== 'UNKNOWN') refuse('STAGE_STATE_REFUSED', { state });
  await recordEvent(io, { releaseKey, kind: 'STAGED', recordedBy: RECORDED_BY, written: after => after.state === 'STAGED' });
  return Object.freeze({ event: 'PREVIEW_RELEASE_STAGED', label, releaseKey, recorded: true });
}

/**
 * The transition only (side-by-side plan D15): the table has no current release yet. Stage the release if needed, make it
 * current with no expected current and traffic at once (nothing else serves through the table yet), and name its pair in
 * the boot target. Runs before its website and API start: no edge, no stops, no backstop.
 */
export async function seedRelease({ label, layout = LAYOUT, deps = {} }) {
  requireLabel(label);
  const io = withDefaults(layout, deps);
  const { releaseKey } = await pinned(label, layout, io);
  if (await io.readCurrentRelease() !== null) refuse('SEED_REFUSED', ['current']);
  const { state } = await io.readReleaseState({ releaseKey });
  if (state === 'UNKNOWN') await recordEvent(io, { releaseKey, kind: 'STAGED', recordedBy: RECORDED_BY, written: after => after.state === 'STAGED' });
  else if (state !== 'STAGED') refuse('SEED_REFUSED', ['state']);
  await recordSwitch(io, { newKey: releaseKey, expectedCurrentKey: null, seconds: 0, recordedBy: RECORDED_BY });
  const bad = [];
  try { await writeTarget(label, layout, io); } catch { bad.push('TARGET'); }
  const current = await io.readCurrentRelease().catch(() => null);
  return Object.freeze({ event: 'PREVIEW_RELEASE_SEEDED', label, releaseKey, takeTrafficFrom: current?.releaseKey === releaseKey ? current.takeTrafficFrom : null, bad: Object.freeze(bad) });
}

/** Wait until `unit` is active and `ready()` holds; `code` when it fails, or when `waitMs` pass first. */
async function waitUntilReady({ unit, ready, waitMs, code, layout, io }) {
  const deadline = io.now() + waitMs;
  for (;;) {
    const state = await unitState(unit, layout, io);
    if (state === 'failed') refuse(code);
    if (state === 'active' && await ready()) return;
    if (io.now() >= deadline) refuse(code);
    await io.sleep(START_POLL_MS);
  }
}

/**
 * Side-by-side spec §11, after a switch: the older release `to` serves again. Order: read-only preconditions; its stale
 * backstop and 25-minute check are turned off (a stale one could ask a busy runner to retire after a later drain); it is
 * staged again; its runner starts FIRST (prestart runs it in database-ahead mode) and must print its start line; then its
 * API (its start line) and its website (503, only NOT_CURRENT); then the switch with the roles reversed. The newer
 * release's runner keeps finishing what it started (O1). A rollback that stopped half way can be run again: an older
 * release already staged again (it still drains) is accepted, and only what is not running is started.
 */
async function rollbackAfterSwitch({ to, from, layout, io }) {
  requireLabel(to); requireLabel(from);
  if (to === from) refuse('ROLLBACK_PRECONDITION_FAILED', ['labels']);
  const { lock } = await io.readLock(layout);
  const toRelease = own(lock.releases, to), fromRelease = own(lock.releases, from);
  const fields = [];
  if (!toRelease) fields.push('to');
  if (!fromRelease) fields.push('from');
  if (fields.length) refuse('ROLLBACK_PRECONDITION_FAILED', fields);
  const toKey = toRelease.releaseKey, fromKey = fromRelease.releaseKey;
  if (toRelease.slot === fromRelease.slot) fields.push('slot');
  if ((await io.readCurrentRelease())?.releaseKey !== fromKey) fields.push('current');
  const { state } = await io.readReleaseState({ releaseKey: toKey });
  const restaged = state === 'STAGED' && stillDrains(await io.readReleaseEvents({ releaseKey: toKey }));
  if (state !== 'DRAINING' && state !== 'RETIRED' && !restaged) fields.push('state');
  let gatesActive = true;
  for (const gate of GATES) if (await io.gateState(gate) !== 'active') gatesActive = false;
  if (!gatesActive) fields.push('gates');
  if (await io.pathExists(`${layout.lockRoot}/${MAINTENANCE_PENDING_NAME}`)) fields.push('maintenance');
  if (fields.length) refuse('ROLLBACK_PRECONDITION_FAILED', fields);

  await io.disarmTimers({ label: to });
  if (state !== 'STAGED') await recordEvent(io, { releaseKey: toKey, kind: 'STAGED', recordedBy: ROLLBACK_BY, written: after => after.state === 'STAGED' });
  const started = [];
  const unit = service => unitNameFor(layout, service, to);
  const start = async (service, ready, waitMs, code) => {
    if (await unitState(unit(service), layout, io) === 'active') return;
    if (!await systemctl(['start', '--no-block', unit(service)], layout, io)) refuse('ROLLBACK_START_FAILED', { service });
    await waitUntilReady({ unit: unit(service), ready, waitMs, code, layout, io });
    started.push(service);
  };
  const announced = (service, kind) => async () => (await startedEvent(unit(service), kind, layout, io))?.releaseKey === toKey;
  await start('runner', announced('runner', 'PREVIEW_RUNNER_STARTED'), RUNNER_START_WAIT_MS, 'ROLLBACK_RUNNER_NOT_STARTED');
  await start('api', announced('api', 'PREVIEW_API_STARTED'), FRONT_START_WAIT_MS, 'ROLLBACK_API_NOT_STARTED');
  await start('ui', async () => {
    let secret;
    try { secret = await io.readEdgeSecret(); } catch { return false; }
    return waitingWebsite(await readWebsite(toRelease.slot, secret, io), toKey, ['NOT_CURRENT']);
  }, FRONT_START_WAIT_MS, 'ROLLBACK_UI_NOT_READY');
  const result = await runSwitch({ to, from, oldPairStopped: false, rollback: true, layout, io });
  return Object.freeze({ ...result, event: 'PREVIEW_RELEASE_ROLLED_BACK', started: Object.freeze(started) });
}

/**
 * Side-by-side spec §11, before a switch: release `label` (STAGED) goes away and nothing user-facing changes.
 * - Never served, or every drain of it ended: it must have no open work; its runner, website and API stop (a runner with
 *   no work of its release is the one runner this may stop) and it is RETIRED with reason NOT_SWITCHED.
 * - Staged again while it still drains (a rollback given up half way; controller ruling D10 Q3): it goes back to
 *   DRAINING (the database's abandoned re-stage), its website and API stop, its runner is never touched (it may still
 *   own debates), and its backstop is armed again 27,000 s after that DRAINING row, so a fresh RETIRE_REQUESTED follows
 *   if it has not retired by itself by then.
 * recordReleaseSwitch is never called.
 */
async function rollbackBeforeSwitch({ label, layout, io }) {
  const { releaseKey } = await pinned(label, layout, io);
  if ((await io.readReleaseState({ releaseKey })).state !== 'STAGED') refuse('ROLLBACK_PRECONDITION_FAILED', ['state']);
  if (stillDrains(await io.readReleaseEvents({ releaseKey }))) {
    await recordEvent(io, { releaseKey, kind: 'DRAINING', recordedBy: ROLLBACK_BY, reason: 'RESTAGE_ABANDONED', written: after => after.state === 'DRAINING' });
    const bad = [];
    let pairStopped = false;
    try { pairStopped = await stopPair(label, layout, io); } catch { /* reported below */ }
    if (!pairStopped) bad.push('FRONT_PAIR_STOP');
    else try { await recordPairStopped(releaseKey, ROLLBACK_BY, io); } catch { bad.push('FRONT_PAIR_STOPPED_RECORD'); }
    let backstopAt = null;
    try {
      const drained = (await io.readReleaseEvents({ releaseKey })).filter(event => event.kind === 'DRAINING').at(-1);
      const drainedAt = Date.parse(drained?.recordedAt ?? '');
      if (!Number.isFinite(drainedAt)) throw new Error('drain');
      backstopAt = await armBackstop(label, drainedAt + BACKSTOP_S * 1000, layout, io);
    } catch { bad.push('BACKSTOP'); }
    return Object.freeze({ event: 'PREVIEW_RELEASE_ROLLED_BACK', beforeSwitch: true, label, releaseKey, outcome: 'DRAINING', backstopAt, bad: Object.freeze(bad) });
  }
  if (await io.countOpenWork({ releaseKey }) !== 0) refuse('ROLLBACK_PRECONDITION_FAILED', ['openWork']);
  const units = ['runner', 'ui', 'api'].map(service => unitNameFor(layout, service, label));
  if (!await systemctl(['stop', ...units], layout, io)) refuse('ROLLBACK_STOP_FAILED');
  for (const unit of units) if (!STOPPED.includes(await unitState(unit, layout, io))) refuse('ROLLBACK_STOP_FAILED');
  await recordEvent(io, { releaseKey, kind: 'RETIRED', recordedBy: ROLLBACK_BY, reason: 'NOT_SWITCHED', written: after => after.state === 'RETIRED' });
  return Object.freeze({ event: 'PREVIEW_RELEASE_ROLLED_BACK', beforeSwitch: true, label, releaseKey, outcome: 'RETIRED', backstopAt: null, bad: Object.freeze([]) });
}

/**
 * Side-by-side spec §11. After a switch: `to` is the older release, `from` the current newer one. Before a switch
 * (`beforeSwitch`): `from` is the new release that goes away, and there is no `to`.
 */
export async function rollbackRelease({ to, from, beforeSwitch = false, layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  if (beforeSwitch === true) {
    if (to !== undefined) refuse('ARGUMENTS_REFUSED');
    requireLabel(from);
    return rollbackBeforeSwitch({ label: from, layout, io });
  }
  return rollbackAfterSwitch({ to, from, layout, io });
}

/** Exact argv shapes only; anything that is not a release label refuses before a path, unit or row is touched. */
function parseArguments(argv) {
  const [a, b, c, d, e, f] = argv;
  const n = argv.length;
  const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
  if (n === 3 && (a === 'stage' || a === 'seed') && b === '--label' && isLabel(c)) return { command: a, label: c };
  if ((n === 5 || (n === 6 && f === '--old-pair-stopped')) && a === 'switch' && b === '--to' && isLabel(c) && d === '--from' && isLabel(e)) return { command: 'switch', to: c, from: e, oldPairStopped: n === 6 };
  if (n === 5 && a === 'rollback' && b === '--to' && isLabel(c) && d === '--from' && isLabel(e)) return { command: 'rollback', to: c, from: e };
  if (n === 4 && a === 'rollback' && b === '--before-switch' && c === '--label' && isLabel(d)) return { command: 'rollback', label: d, beforeSwitch: true };
  return refuse('ARGUMENTS_REFUSED');
}
const COMMANDS = Object.freeze({
  stage: (args, layout, deps) => stageRelease({ label: args.label, layout, deps }),
  seed: (args, layout, deps) => seedRelease({ label: args.label, layout, deps }),
  switch: (args, layout, deps) => switchRelease({ to: args.to, from: args.from, oldPairStopped: args.oldPairStopped, layout, deps }),
  rollback: (args, layout, deps) => (args.beforeSwitch ? rollbackRelease({ from: args.label, beforeSwitch: true, layout, deps }) : rollbackRelease({ to: args.to, from: args.from, layout, deps }))
});
const FAILED_EVENT = Object.freeze({ stage: 'PREVIEW_RELEASE_STAGE_REFUSED', seed: 'PREVIEW_RELEASE_SEED_REFUSED', switch: 'PREVIEW_RELEASE_SWITCH_REFUSED', rollback: 'PREVIEW_RELEASE_ROLLBACK_REFUSED' });

/** One JSON line per run: the result on stdout (exit 0, or 2 when `bad` is not empty), or one refusal on stderr (exit 1). */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    const result = await COMMANDS[args.command](args, layout, deps);
    logLine(stdout, result);
    return result.bad?.length ? 2 : 0;
  } catch (error) {
    const context = args ? Object.fromEntries(['label', 'to', 'from'].filter(key => args[key] !== undefined).map(key => [key, args[key]])) : {};
    logLine(stderr, { event: args ? FAILED_EVENT[args.command] : 'PREVIEW_RELEASE_SWITCH_REFUSED', ...context, reason: codeOf(error), ...(error instanceof SwitchRefusal && error.fields ? { fields: error.fields } : {}) });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
