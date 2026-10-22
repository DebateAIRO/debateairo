// Root's release switch for the preview (side-by-side spec §6 and §11). Linux, Node v26.8.2, run by the operator as root.
//
// Plain words: two releases run side by side. This tool moves the site from the old one to the new one without an
// error page, and back again if needed:
//   - stage   records a new release as STAGED, before its runner, API and website start (prestart starts nothing else);
//   - seed    the transition only: the first current release, when the table has none yet (no edge, no stops);
//   - switch  one database write makes the new release current and the old one draining (break-before-make: the old
//             pair is not-ready at once, the new pair ready from take-traffic-from = the DATABASE clock + 8 s; Caddy holds
//             the requests in between); then the edge must show the new release three times in a row, one more health
//             interval passes, and only then the old website and API stop. While the edge does not show it yet, the new
//             website's own /readyz is read too: a reason that never passes by waiting (anything but BOOTING,
//             NOT_CURRENT or BEFORE_TAKE_TRAFFIC_FROM) switches back at once instead of after the whole 30 s. The old runner is never stopped: it finishes
//             its own debates and retires by itself (spec §4). The backstop (switch + 27,000 s, an absolute UTC time
//             that survives a reboot) and the boot target are written last;
//   - switch --finish: the database write of a switch landed but the command did not get to the end (a crash or a lost
//             ssh session after the write, SWITCH_OUTCOME_UNKNOWN, or BACKSTOP/TARGET in `bad`): the steps after the
//             write run again (each one repeats safely): edge, old pair's stop, its record, backstop, boot target, checks;
//             after a drained switch (`--old-pair-stopped`) it takes the same flag: the old runner is expected stopped;
//   - rollback after a switch: the older release is staged again, its runner starts first (database-ahead mode, prestart),
//             then its API and website, then the same switch the other way; before a switch: the new release goes away.
//
//   release-switch.mjs stage --label <new>
//   release-switch.mjs seed --label <T>
//   release-switch.mjs switch --to <new> --from <old> [--old-pair-stopped]
//   release-switch.mjs switch --finish --to <new> --from <old> [--old-pair-stopped]
//   release-switch.mjs rollback --to <older> --from <newer>
//   release-switch.mjs rollback --before-switch --label <new>
//   switch --to <first>      the public server's first release only (deploy/vps/release.mjs, bootMode 'enable')
//
// The same functions serve the public server (side-by-side plan D16b): deploy/vps/release.mjs calls them with
// common.mjs's VPS_LAYOUT. Everything that differs between the two servers comes from the layout: where a release's
// key and slot are read (release-info.mjs), the slots, the edge listener and Caddy's copy of the edge secret, the gates
// (none there), the start lines, and what starts at boot (the preview's target drop-in, or enabled instances).
//
// One command at a time (D10 review): each takes ${lockRoot}/release-switch.lock (created exclusively, holding its pid,
// removed when it ends); another command meanwhile refuses RELEASE_SWITCH_BUSY. A file left by a process that is gone
// is still refused (the refusal says holderAlive false, and its `next` says how to clear it): the operator moves it
// aside, after checking no switch runs.
//
// Exit 0 with an empty `bad`; 2 when the command finished but a check after the database write failed (`bad` names it);
// 1 on a refusal (nothing after the refusal happened). One JSON line per run: codes, labels, keys, counts and times only,
// never the edge secret and never a response body. Root writes only the release table here, never a debate table.
//
// The edge (controller ruling D10 Q1): root reads readiness through Caddy's loopback listener (127.0.0.1:3090, GET
// /readyz only, caddy-slots.mjs). Every request may wait out Caddy's 12 s hold, so each one gets 15 s. A website's own
// answer always names its release in x-debateai-release, so an answer without that header is one Caddy made itself (no
// slot ready when its hold ran out); those, timeouts and connection errors are the switch's edge failures. A website's
// 503 during the break-before-make gap is an answer, not a failure. There is no background poller (controller ruling,
// D10 review): the edge is read during the confirmations and once after the stop. What a visitor sees during the switch
// is watched by the operator's own curl loop against the public URL, with their own password (the guide, D15); this
// tool holds no site password.
import { constants } from 'node:fs';
import { lstat, open, readFile, readdir, readlink, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { EDGE_LISTENER } from '../../preview-release/v1/caddy-slots.mjs';
import { LAYOUT, RELEASE_LABEL, atomicWrite, ensureDirectory, logLine, runBounded, sha256, unitNameFor } from './common.mjs';
import { releaseInfos, slotsOf } from './release-info.mjs';
import { disarmTimers as disarmRetireTimers, gateState } from './release-retire.mjs';
import { RELEASE_KEY_PATTERN, countOpenWork, readCurrentRelease, readReleaseEvents, readReleaseState, recordReleaseEvent, recordReleaseSwitch } from './release-table.mjs';

/**
 * Caddy's health_interval, the switch's take-traffic delay, the edge budget and the backstop. TAKE_TRAFFIC_AFTER_S (final
 * fix wave P6): the old API may serve on a release read up to 5 s old (its watcher's stale bound, apps/api
 * release-state.ts) before it reads NOT_CURRENT, and Caddy then needs one health interval (2 s) to take the old pair out;
 * one more second of margin: 5 + 2 + 1 = 8 s, so the new pair never takes traffic while the old one still does.
 */
export const HEALTH_INTERVAL_S = 2, TAKE_TRAFFIC_AFTER_S = 8, EDGE_WAIT_MS = 30_000, EDGE_CONFIRMATIONS = 3, BACKSTOP_S = 27_000;
/**
 * One edge request every 500 ms (after the previous one answered), each allowed 15 s: longer than lb_try_duration 12 s
 * (integration M11: the no-slot window of a switch grew to about 10 s with the 8 s take-traffic delay), so a request
 * Caddy holds is answered by Caddy, never cut by this client.
 */
export const EDGE_POLL_MS = 500, EDGE_REQUEST_TIMEOUT_MS = 15_000;
/** A release notice code is the label with `_` for `-`, at most 64 characters (alert.mjs, D6): longer labels never stage. */
export const MAX_LABEL_LENGTH = 64;
/** The rollback's waits: a runner's ready line (its prestart verifies first), then an API's (TimeoutStartSec=300 + 30 s). */
export const RUNNER_START_WAIT_MS = 240_000, FRONT_START_WAIT_MS = 330_000;
export const EDGE_URL = `http://${EDGE_LISTENER.bind}:${EDGE_LISTENER.port}/readyz`;
/** The layout's edge readiness URL: its `edge` listener's /readyz, or the preview's (side-by-side plan D16b). */
export const edgeUrlOf = layout => (layout.edge ? `${layout.edge}/readyz` : EDGE_URL);
/**
 * Caddy's copy of the edge secret (its health_headers send it); the website's /readyz answers only a request carrying it.
 * That alone does not keep visitors out (every request the public route proxies carries it too): the public route
 * refuses /readyz itself (`respond /readyz 404`, final fix wave W2), and root reads it through the loopback listener or,
 * as here, straight at a slot's port.
 */
export const EDGE_SECRET_PATH = '/etc/debateai-v3-preview/ui-edge.caddy.secret';
const edgeSecretPathOf = layout => layout.edgeSecretPath ?? EDGE_SECRET_PATH;
/**
 * The line a service prints once it is up and names its release (`<kind> {json}`): the layout's (common.mjs startedLines).
 * startedLines and gates have no default (a wrong one would be read on the wrong server): withDefaults refuses a layout
 * without them, LAYOUT_REFUSED, before any command reads or writes anything (D16b review).
 */
const startedLineOf = (layout, service) => layout.startedLines[service];
const layoutComplete = layout => Array.isArray(layout.gates) && layout.startedLines !== null && typeof layout.startedLines === 'object'
  && typeof layout.startedLines.runner === 'string' && typeof layout.startedLines.api === 'string';
/** The command the operator re-runs, named in a `next` hint: this file on the preview, release.mjs on the public server. */
const toolOf = layout => layout.toolName ?? 'release-switch.mjs';
/** Where the layout keeps the current release's pair at boot: 'target' (a drop-in, the preview) or 'enable' (instances). */
const enablesUnits = layout => layout.bootMode === 'enable';
const bootStepCode = layout => (enablesUnits(layout) ? 'BOOT' : 'TARGET');
/** Written by the release check's maintenance gate (D11); while it exists no switch starts. */
export const MAINTENANCE_PENDING_NAME = 'maintenance-pending';
export const GATE_FILES_SCHEMA = 'preview-release-gate-files-v1';
/** One release-switch command at a time: this file in the lock folder, created exclusively. */
export const SWITCH_LOCK_NAME = 'release-switch.lock';
const unitDirOf = layout => layout.systemdUnitDir ?? '/etc/systemd/system';
const targetDropinOf = layout => `${unitDirOf(layout)}/${layout.unitPrefix.replace(/-$/, '')}.target.d/60-current-release.conf`;
/** debateai-preview.target's drop-in naming the current release's website and API, so a boot starts that pair (§10). */
export const TARGET_DROPIN = targetDropinOf(LAYOUT);
/** Where the switch keeps the gate files' digests at the switch, for the release check (D11) to compare. */
export const gateFilesPathFor = (layout, releaseKey) => `${layout.stateDir}/release-${requireKey(releaseKey)}-gate-files.json`;

const RECORDED_BY = 'root:release-switch';
const ROLLBACK_BY = 'root:rollback';
const WAITING_REASONS = Object.freeze(['NOT_CURRENT', 'BEFORE_TAKE_TRAFFIC_FROM']);
/** The new website's reasons that pass by waiting during the switch; any other one is definitive (final fix wave X4). */
export const SWITCH_WAITING_REASONS = Object.freeze(['BOOTING', 'NOT_CURRENT', 'BEFORE_TAKE_TRAFFIC_FROM']);
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
async function readEdgeSecret(uid, path) {
  let text;
  try {
    text = await withPrivateBytes(path, { root: dirname(path), uid, mode: [0o600, 0o640], maxBytes: 4096 }, raw => new TextDecoder('utf8', { fatal: true }).decode(raw).trim());
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
 * Each gate's GO file and operator folder (file list and bytes) as sha256 digests, in the layout's gate order. The switch
 * saves them (gateFilesPathFor) and the release check (D11) recomputes them with this same function. GATE_FILES_UNREADABLE otherwise.
 */
export async function gateFilesDigest(gates = LAYOUT.gates) {
  const digests = [];
  try {
    for (const gate of gates) digests.push(Object.freeze({ name: gate.name, goSha256: await fileDigest(gate.go), folderSha256: await folderDigest(gate.folder) }));
  } catch { refuse('GATE_FILES_UNREADABLE'); }
  return Object.freeze(digests);
}

/** The dependencies with the server's defaults; tests replace them. */
function withDefaults(layout, deps) {
  if (!layoutComplete(layout)) refuse('LAYOUT_REFUSED');
  const run = deps.run ?? runBounded;
  const uid = layout.ownerUid ?? 0, gid = layout.ownerGid ?? 0;
  return {
    run,
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))),
    httpGet: deps.httpGet ?? httpGet,
    // Every release's key and slot (release-info.mjs: the lock on the preview, `deps.readLock` in tests; the overlays on the public server).
    releases: () => releaseInfos({ layout, deps }),
    readCurrentRelease: deps.readCurrentRelease ?? (() => readCurrentRelease({ layout, run })),
    readReleaseState: deps.readReleaseState ?? (input => readReleaseState({ ...input, layout, run })),
    readReleaseEvents: deps.readReleaseEvents ?? (input => readReleaseEvents({ ...input, layout, run })),
    countOpenWork: deps.countOpenWork ?? (input => countOpenWork({ ...input, layout, run })),
    recordReleaseSwitch: deps.recordReleaseSwitch ?? (input => recordReleaseSwitch({ ...input, layout, run })),
    recordReleaseEvent: deps.recordReleaseEvent ?? (input => recordReleaseEvent({ ...input, layout, run })),
    gateState: gate => gateState(gate, { run }),
    gateFilesDigest: deps.gateFilesDigest ?? (() => gateFilesDigest(layout.gates)),
    disarmTimers: ({ label }) => disarmRetireTimers({ label, layout, deps: { run } }),
    readEdgeSecret: deps.readEdgeSecret ?? (() => readEdgeSecret(uid, edgeSecretPathOf(layout))),
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
 * The first `<kind> {json}` line of the unit's CURRENT invocation (the layout's startedLines: on the preview the
 * launchers' PREVIEW_RUNNER_STARTED and PREVIEW_API_STARTED, printed once after readiness; on the public server the
 * runner's own DEBATEAI_RUNNER_READY and the API's DEBATEAI_API_READY), or null. Oldest lines first and capped at 1 MiB: a long invocation's read
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
async function readEdge(layout, io) {
  try {
    const { status, release } = await io.httpGet(edgeUrlOf(layout), { headers: {}, timeoutMs: EDGE_REQUEST_TIMEOUT_MS });
    const named = typeof release === 'string' && RELEASE_KEY_PATTERN.test(release) ? release : null;
    return { failed: named === null, status, release: named };
  } catch { return { failed: true, status: null, release: null }; }
}

/** A slot's website /readyz, asked directly with the edge secret: { status, releaseKey, reasons } or null. */
async function readWebsite(slot, secret, layout, io) {
  try {
    const { status, body } = await io.httpGet(`http://127.0.0.1:${slotsOf(layout)[slot].uiPort}/readyz`, { headers: { 'x-debateai-edge-secret': secret }, timeoutMs: WEBSITE_TIMEOUT_MS });
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== 'object' || typeof parsed.releaseKey !== 'string' || !Array.isArray(parsed.reasons) || !parsed.reasons.every(reason => typeof reason === 'string')) return null;
    return { status, releaseKey: parsed.releaseKey, reasons: parsed.reasons };
  } catch { return null; }
}
/** Up and answering for `key`, but not ready only because it is not (yet) the one taking traffic. */
const waitingWebsite = (answer, key, allowed) => answer !== null && answer.status === 503 && answer.releaseKey === key
  && answer.reasons.length > 0 && answer.reasons.every(reason => allowed.includes(reason));

/**
 * The website's own answer says it will not become ready by waiting (final fix wave X4): another release answers on its
 * slot, or a reason other than BOOTING, NOT_CURRENT and BEFORE_TAKE_TRAFFIC_FROM (DRAINING, DATABASE_UNREACHABLE, …).
 * No answer, or a 200, is not definitive: the edge decides those.
 */
const definitiveRefusal = (answer, key) => answer !== null && answer.status !== 200
  && (answer.releaseKey !== key || answer.reasons.some(reason => !SWITCH_WAITING_REASONS.includes(reason)));

/**
 * Poll the edge until EDGE_CONFIRMATIONS answers in a row are 200 from `key`'s website; null after EDGE_WAIT_MS. Every
 * edge failure on the way is counted in `tally` (controller ruling Q1). `watch` (the switch only: `{ slot, secret }` of
 * `key`'s release): while the edge does not show `key`, that website's own /readyz is read too, and a definitive refusal
 * ends the wait at once (null, its reasons in `tally.websiteReasons`) instead of after the whole EDGE_WAIT_MS.
 */
async function confirmEdge(key, tally, layout, io, watch = null) {
  const startedAt = io.now();
  for (let inARow = 0; ;) {
    const answer = await readEdge(layout, io);
    if (answer.failed) tally.edgeFailures += 1;
    const confirmed = !answer.failed && answer.status === 200 && answer.release === key;
    inARow = confirmed ? inARow + 1 : 0;
    if (inARow >= EDGE_CONFIRMATIONS) return io.now() - startedAt;
    if (!confirmed && watch !== null) {
      const website = await readWebsite(watch.slot, watch.secret, layout, io);
      if (definitiveRefusal(website, key)) {
        tally.websiteReasons = Object.freeze(website.releaseKey === key ? [...website.reasons] : ['RELEASE_KEY_MISMATCH']);
        return null;
      }
    }
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

/**
 * The backstop of a draining release: its absolute time in the timer drop-in, then reload, enable, (re)start. A time
 * already past (a finish run more than 7.5 hours after the write) becomes one second from now: systemd never fires a
 * calendar time that was past when it was armed, and the backstop is due.
 */
async function armBackstop(label, atMs, layout, io) {
  const timer = `${layout.unitPrefix}runner-retire@${label}.timer`;
  const at = new Date(Math.ceil(Math.max(atMs, io.now() + 1000) / 1000) * 1000);
  await io.writeUnitFile(`${unitDirOf(layout)}/${timer}.d/50-at.conf`, renderBackstopDropin({ label, at }));
  // restart, not start: an instance that already elapsed (a label that drained once before) ignores a start (D7 note).
  for (const args of [['daemon-reload'], ['enable', timer], ['restart', timer]]) if (!await systemctl(args, layout, io)) refuse('BACKSTOP_FAILED');
  return at.toISOString();
}

async function writeTarget(label, layout, io) {
  await io.writeUnitFile(targetDropinOf(layout), renderTargetDropin(label));
  if (!await systemctl(['daemon-reload'], layout, io)) refuse('TARGET_FAILED');
}

/**
 * What starts at boot from now on (side-by-side spec §10). The preview: the target's drop-in names `to`'s pair. The
 * public server (bootMode 'enable'): `to`'s API, website and runner are enabled, and `from`'s API and website disabled;
 * `from`'s runner stays enabled until its stop recorder sees it retired (release-retire.mjs). `from` null: nothing to
 * disable (the first release). Both repeat safely.
 */
async function bootStep(to, from, layout, io) {
  if (!enablesUnits(layout)) return writeTarget(to, layout, io);
  if (!await systemctl(['enable', ...['api', 'ui', 'runner'].map(service => unitNameFor(layout, service, to))], layout, io)) refuse('BOOT_FAILED');
  if (from !== null && !await systemctl(['disable', ...['api', 'ui'].map(service => unitNameFor(layout, service, from))], layout, io)) refuse('BOOT_FAILED');
}

/** Stop a release's website and API in one call; true when both read stopped afterwards. */
async function stopPair(label, layout, io) {
  const units = [unitNameFor(layout, 'ui', label), unitNameFor(layout, 'api', label)];
  if (!await systemctl(['stop', ...units], layout, io)) return false;
  for (const unit of units) if (!STOPPED.includes(await unitState(unit, layout, io))) return false;
  return true;
}

/** FRONT_PAIR_STOPPED for a draining release, unless its API's stop recorder (D7's ExecStopPost) already wrote it. Returns the state read. */
async function recordPairStopped(releaseKey, recordedBy, io) {
  const { state, frontPairStopped } = await io.readReleaseState({ releaseKey });
  if (state === 'DRAINING' && !frontPairStopped) await recordEvent(io, { releaseKey, kind: 'FRONT_PAIR_STOPPED', recordedBy, written: after => after.frontPairStopped });
  return state;
}

/** Every read-only condition of the switch (spec §6); SWITCH_PRECONDITION_FAILED names each one that fails. */
async function preconditions({ to, from, oldPairStopped, rollback, layout, io }) {
  const releases = await io.releases();
  const toRelease = own(releases, to), fromRelease = own(releases, from);
  const fields = [];
  if (!toRelease) fields.push('to');
  if (!fromRelease) fields.push('from');
  if (fields.length) refuse('SWITCH_PRECONDITION_FAILED', fields);
  const toKey = toRelease.releaseKey, fromKey = fromRelease.releaseKey;
  if (toRelease.slot === fromRelease.slot) fields.push('slot');
  if ((await io.readCurrentRelease())?.releaseKey !== fromKey) fields.push('current');
  if ((await io.readReleaseState({ releaseKey: toKey })).state !== 'STAGED') fields.push('state');
  // At most two releases are live (0123): another pinned release that still drains (DRAINING, or staged again while it
  // still drains) would make the database refuse RELEASE_SWITCH_CONFLICT; name it here instead (D10 review).
  for (const other of Object.keys(releases).filter(label => label !== to && label !== from)) {
    const otherKey = releases[other].releaseKey;
    const { state } = await io.readReleaseState({ releaseKey: otherKey });
    if (state === 'DRAINING' || (state === 'STAGED' && stillDrains(await io.readReleaseEvents({ releaseKey: otherKey })))) { fields.push('otherDraining'); break; }
  }
  const runnerActive = await unitState(unitNameFor(layout, 'runner', to), layout, io) === 'active';
  if (!runnerActive) fields.push('runner');
  for (const service of ['api', 'ui']) if (await unitState(unitNameFor(layout, service, to), layout, io) !== 'active') fields.push(service);
  const oldPair = [await unitState(unitNameFor(layout, 'api', from), layout, io), await unitState(unitNameFor(layout, 'ui', from), layout, io)];
  if (!oldPair.every(state => (oldPairStopped ? STOPPED.includes(state) : state === 'active'))) fields.push('oldPair');
  if (runnerActive) {
    // A new release's runner re-sends nothing at its start (no work carries its key yet). In a rollback the older
    // runner may have restarted in database-ahead mode and re-sent its own lapsed work: any count is fine there.
    const started = await startedEvent(unitNameFor(layout, 'runner', to), startedLineOf(layout, 'runner'), layout, io);
    const dispatched = started?.startupDispatched;
    if (started?.releaseKey !== toKey || !Number.isSafeInteger(dispatched) || (rollback ? dispatched < 0 : dispatched !== 0)) fields.push('runnerStarted');
  }
  let secret = null;
  try { secret = await io.readEdgeSecret(); } catch { fields.push('edgeSecret'); }
  if (secret !== null && !waitingWebsite(await readWebsite(toRelease.slot, secret, layout, io), toKey, WAITING_REASONS)) fields.push('website');
  if (!oldPairStopped) {
    const edge = await readEdge(layout, io);
    if (edge.failed || edge.status !== 200 || edge.release !== fromKey) fields.push('edge');
  }
  let gatesActive = true;
  for (const gate of layout.gates) if (await io.gateState(gate) !== 'active') gatesActive = false;
  if (!gatesActive) fields.push('gates');
  if (await io.pathExists(`${layout.lockRoot}/${MAINTENANCE_PENDING_NAME}`)) fields.push('maintenance');
  if (fields.length) refuse('SWITCH_PRECONDITION_FAILED', fields);
  return { toKey, fromKey, watch: Object.freeze({ slot: toRelease.slot, secret }) };
}

/**
 * The edge never showed the new release (controller ruling D10 Q2), or the new website said it never will (X4): the old
 * release takes traffic again. The database
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
  if (await confirmEdge(fromKey, tally, layout, io) === null) refuse('SWITCH_REVERT_UNCONFIRMED', { edgeFailures: tally.edgeFailures, backstopAt });
  // WEBSITE_NOT_READY: the new website itself said it will not become ready (X4), so the switch went back without waiting.
  refuse('SWITCH_REVERTED', tally.websiteReasons
    ? { reason: 'WEBSITE_NOT_READY', websiteReasons: tally.websiteReasons, edgeFailures: tally.edgeFailures, backstopAt }
    : { reason: 'EDGE_NOT_CONFIRMED', edgeFailures: tally.edgeFailures, backstopAt });
}

/**
 * Everything after the database write (the switch, and `switch --finish` again later), after the edge confirmations:
 * one more health interval (every Caddy proxy block has its own checker, so the public route may lag the listener by
 * one); the old pair's stop and its record; the backstop (none for an old release that already RETIRED); the boot
 * target; the gate files (a finish keeps the ones the switch wrote); the final checks. Every step repeats safely, and
 * each one runs even when an earlier one failed: a failed step is named in `bad`, never a reason to leave the rest undone.
 * `oldPairStopped` (the drained path only, D15 review: `switch --old-pair-stopped` and its `switch --finish
 * --old-pair-stopped`): the operator stopped the old runner on purpose with nothing open, and marks the old release
 * RETIRED only after the switch (release-retire.mjs mark-retired), so a stopped old runner is fine there; everywhere
 * else it must still run or its release must have RETIRED.
 */
async function afterWrite({ to, from, toKey, fromKey, recordedBy, tally, keepGateFiles, oldPairStopped = false, layout, io }) {
  await io.sleep(HEALTH_INTERVAL_S * 1000 + 500);
  const bad = [];
  const step = async (code, body) => { try { if (await body() === false) bad.push(code); } catch { bad.push(code); } };
  // The old website and API only; the old runner keeps finishing its debates and retires by itself (spec §4).
  let pairStopped = false, fromState = null;
  await step('OLD_PAIR_STOP', async () => (pairStopped = await stopPair(from, layout, io)));
  if (pairStopped) await step('FRONT_PAIR_STOPPED_RECORD', async () => { fromState = await recordPairStopped(fromKey, recordedBy, io); });
  let backstopAt = null;
  await step('BACKSTOP', async () => {
    fromState ??= (await io.readReleaseState({ releaseKey: fromKey })).state;
    if (fromState === 'RETIRED') return true;
    const current = await io.readCurrentRelease();
    if (current?.releaseKey !== toKey) return false;
    // The database clock: take-traffic-from is the switch's own clock_timestamp() + TAKE_TRAFFIC_AFTER_S.
    backstopAt = await armBackstop(from, Date.parse(current.takeTrafficFrom) - TAKE_TRAFFIC_AFTER_S * 1000 + BACKSTOP_S * 1000, layout, io);
    return true;
  });
  await step(bootStepCode(layout), () => bootStep(to, from, layout, io));
  await step('GATE_FILES', async () => {
    // No gates (the public server): nothing to keep for the release check, which then has none to compare either.
    if (layout.gates.length === 0) return;
    const path = gateFilesPathFor(layout, toKey);
    if (keepGateFiles && await io.pathExists(path)) return;
    const gates = await io.gateFilesDigest();
    await io.writeStateFile(path, `${JSON.stringify({ schema: GATE_FILES_SCHEMA, releaseKey: toKey, label: to, recordedAt: new Date(io.now()).toISOString(), gates })}\n`);
  });
  // Final checks (spec §12 step 13.6). The old runner may already have retired (no open work left): that is fine.
  await step('RUNNER_FROM', async () => {
    const runnerFrom = await unitState(unitNameFor(layout, 'runner', from), layout, io);
    return runnerFrom === 'active' || (oldPairStopped && STOPPED.includes(runnerFrom))
      || (await io.readReleaseState({ releaseKey: fromKey })).state === 'RETIRED';
  });
  await step('RUNNER_TO', async () => await unitState(unitNameFor(layout, 'runner', to), layout, io) === 'active');
  for (const gate of layout.gates) await step(`GATE_${gate.name.toUpperCase()}`, async () => await io.gateState(gate) === 'active');
  await step('EDGE_AFTER_STOP', async () => {
    const answer = await readEdge(layout, io);
    if (answer.failed) tally.edgeFailures += 1;
    return !answer.failed && answer.status === 200 && answer.release === toKey;
  });
  if (tally.edgeFailures !== 0) bad.push('EDGE_FAILURES');
  return { backstopAt, bad: Object.freeze(bad) };
}

/**
 * The switch itself, in order: preconditions; the one database write; the edge (three confirmations, or the revert);
 * then afterWrite. A write whose outcome stays unknown names the finish command.
 */
async function runSwitch({ to, from, oldPairStopped, rollback, layout, io }) {
  requireLabel(to); requireLabel(from);
  if (to === from) refuse('SWITCH_PRECONDITION_FAILED', ['labels']);
  const recordedBy = rollback ? ROLLBACK_BY : RECORDED_BY;
  const { toKey, fromKey, watch } = await preconditions({ to, from, oldPairStopped, rollback, layout, io });
  const tally = { edgeFailures: 0 };
  try {
    await recordSwitch(io, { newKey: toKey, expectedCurrentKey: fromKey, seconds: TAKE_TRAFFIC_AFTER_S, recordedBy });
  } catch (error) {
    if (error?.code === 'SWITCH_OUTCOME_UNKNOWN') refuse('SWITCH_OUTCOME_UNKNOWN', { next: `if the release table names ${toKey} current: ${toolOf(layout)} switch --finish --to ${to} --from ${from}${oldPairStopped ? ' --old-pair-stopped' : ''}` });
    throw error;
  }
  const switchedAt = new Date(io.now()).toISOString();
  const edgeConfirmedMs = await confirmEdge(toKey, tally, layout, io, watch);
  if (edgeConfirmedMs === null) await revert({ to, toKey, fromKey, recordedBy, tally, layout, io });
  const { backstopAt, bad } = await afterWrite({ to, from, toKey, fromKey, recordedBy, tally, keepGateFiles: false, oldPairStopped, layout, io });
  return Object.freeze({ event: 'PREVIEW_RELEASE_SWITCHED', to, from, toKey, fromKey, switchedAt, edgeConfirmedMs, edgeFailures: tally.edgeFailures, backstopAt, bad });
}

/**
 * `switch --finish` (D10 review): the release table already names `to` current and `from` drains (or already retired),
 * but the switch command did not get to its end. Read-only preconditions (FINISH_PRECONDITION_FAILED), then the edge must
 * show `to` three times in a row (FINISH_EDGE_UNCONFIRMED otherwise, nothing stopped; there is no revert here: the
 * database decided), then afterWrite. Never writes the release switch itself. `oldPairStopped`: the switch it finishes
 * was the drained one (`--old-pair-stopped`), so the old runner is expected stopped (D15 review).
 */
export async function finishSwitch({ to, from, oldPairStopped = false, layout = LAYOUT, deps = {} }) {
  requireLabel(to); requireLabel(from);
  if (to === from) refuse('FINISH_PRECONDITION_FAILED', ['labels']);
  const io = withDefaults(layout, deps);
  const releases = await io.releases();
  const toRelease = own(releases, to), fromRelease = own(releases, from);
  const fields = [];
  if (!toRelease) fields.push('to');
  if (!fromRelease) fields.push('from');
  if (fields.length) refuse('FINISH_PRECONDITION_FAILED', fields);
  const toKey = toRelease.releaseKey, fromKey = fromRelease.releaseKey;
  if (toRelease.slot === fromRelease.slot) fields.push('slot');
  if ((await io.readCurrentRelease())?.releaseKey !== toKey) fields.push('current');
  const { state } = await io.readReleaseState({ releaseKey: fromKey });
  if (state !== 'DRAINING' && state !== 'RETIRED') fields.push('state');
  if (fields.length) refuse('FINISH_PRECONDITION_FAILED', fields);
  const tally = { edgeFailures: 0 };
  const edgeConfirmedMs = await confirmEdge(toKey, tally, layout, io);
  if (edgeConfirmedMs === null) refuse('FINISH_EDGE_UNCONFIRMED', { edgeFailures: tally.edgeFailures });
  const { backstopAt, bad } = await afterWrite({ to, from, toKey, fromKey, recordedBy: RECORDED_BY, tally, keepGateFiles: true, oldPairStopped: oldPairStopped === true, layout, io });
  return Object.freeze({ event: 'PREVIEW_RELEASE_SWITCH_FINISHED', to, from, toKey, fromKey, edgeConfirmedMs, edgeFailures: tally.edgeFailures, backstopAt, bad });
}

/** Side-by-side spec §6: switch the site from release `from` (current) to release `to` (STAGED, its three units up). */
export async function switchRelease({ to, from, oldPairStopped = false, layout = LAYOUT, deps = {} }) {
  return runSwitch({ to, from, oldPairStopped: oldPairStopped === true, rollback: false, layout, io: withDefaults(layout, deps) });
}

/**
 * The first release of a server that starts the current release by enabled instances (bootMode 'enable', the public
 * server; deploy/vps/README.md §5 "The first release": stage, then install and `enable --now` its units, then this).
 * There is no older release: nothing is stopped, nothing drains, no backstop. Read-only preconditions first
 * (SWITCH_PRECONDITION_FAILED names each one): no current release yet; `to` STAGED; its runner, API and website active;
 * its runner's start line names its key with nothing re-sent; its website up but not ready only because it is not
 * current; no gate off; no maintenance pending. Then the one database write (no expected current; traffic from the
 * database clock + 8 s), then the edge must show `to` three times in a row, then its three instances are enabled.
 * Caddy answers by itself until the new pair is ready (nothing served before), so those answers are counted in
 * `edgeFailures` but are not a fault here; an edge that never shows `to` is EDGE_NOT_CONFIRMED in `bad`, and every
 * later step still runs (there is nothing to revert to). Run again after a write whose outcome was unknown, or after a
 * `bad`: a release the table already names current skips the write and repeats the steps after it.
 */
export async function firstSwitchRelease({ to, layout = LAYOUT, deps = {} }) {
  requireLabel(to);
  if (!enablesUnits(layout)) refuse('ARGUMENTS_REFUSED');
  const io = withDefaults(layout, deps);
  const toRelease = own(await io.releases(), to) ?? refuse('SWITCH_PRECONDITION_FAILED', ['to']);
  const toKey = toRelease.releaseKey;
  const current = await io.readCurrentRelease();
  const again = current?.releaseKey === toKey;
  const fields = [];
  if (current !== null && !again) fields.push('current');
  if (!again && (await io.readReleaseState({ releaseKey: toKey })).state !== 'STAGED') fields.push('state');
  const runnerActive = await unitState(unitNameFor(layout, 'runner', to), layout, io) === 'active';
  if (!runnerActive) fields.push('runner');
  for (const service of ['api', 'ui']) if (await unitState(unitNameFor(layout, service, to), layout, io) !== 'active') fields.push(service);
  if (runnerActive) {
    // A runner restarted after the write may have re-sent work admitted since: any count is fine on a run again.
    const started = await startedEvent(unitNameFor(layout, 'runner', to), startedLineOf(layout, 'runner'), layout, io);
    const dispatched = started?.startupDispatched;
    if (started?.releaseKey !== toKey || !Number.isSafeInteger(dispatched) || (again ? dispatched < 0 : dispatched !== 0)) fields.push('runnerStarted');
  }
  if (!again) {
    let secret = null;
    try { secret = await io.readEdgeSecret(); } catch { fields.push('edgeSecret'); }
    if (secret !== null && !waitingWebsite(await readWebsite(toRelease.slot, secret, layout, io), toKey, WAITING_REASONS)) fields.push('website');
  }
  let gatesActive = true;
  for (const gate of layout.gates) if (await io.gateState(gate) !== 'active') gatesActive = false;
  if (!gatesActive) fields.push('gates');
  if (await io.pathExists(`${layout.lockRoot}/${MAINTENANCE_PENDING_NAME}`)) fields.push('maintenance');
  if (fields.length) refuse('SWITCH_PRECONDITION_FAILED', fields);
  if (!again) {
    try {
      await recordSwitch(io, { newKey: toKey, expectedCurrentKey: null, seconds: TAKE_TRAFFIC_AFTER_S, recordedBy: RECORDED_BY });
    } catch (error) {
      if (error?.code === 'SWITCH_OUTCOME_UNKNOWN') refuse('SWITCH_OUTCOME_UNKNOWN', { next: `if the release table names ${toKey} current: ${toolOf(layout)} switch --to ${to} (again)` });
      throw error;
    }
  }
  const tally = { edgeFailures: 0 };
  const edgeConfirmedMs = await confirmEdge(toKey, tally, layout, io);
  const bad = [];
  if (edgeConfirmedMs === null) bad.push('EDGE_NOT_CONFIRMED');
  const step = async (code, body) => { try { if (await body() === false) bad.push(code); } catch { bad.push(code); } };
  await step(bootStepCode(layout), () => bootStep(to, null, layout, io));
  await step('RUNNER_TO', async () => await unitState(unitNameFor(layout, 'runner', to), layout, io) === 'active');
  for (const gate of layout.gates) await step(`GATE_${gate.name.toUpperCase()}`, async () => await io.gateState(gate) === 'active');
  return Object.freeze({ event: 'PREVIEW_RELEASE_FIRST_SWITCHED', to, toKey, recorded: !again, edgeConfirmedMs, edgeFailures: tally.edgeFailures, bad: Object.freeze(bad) });
}

/** The release of a label (release-info.mjs): RELEASE_LOCK_RELEASE_MISSING when the server does not know it. */
async function pinned(label, layout, io) {
  requireLabel(label);
  return own(await io.releases(), label) ?? refuse('RELEASE_LOCK_RELEASE_MISSING');
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
  try { await bootStep(label, null, layout, io); } catch { bad.push(bootStepCode(layout)); }
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
 * release already staged again (STAGED, and it drained before: it was switched away from once, whether it retired since
 * or not) is accepted, and only what is not running is started.
 */
async function rollbackAfterSwitch({ to, from, layout, io }) {
  requireLabel(to); requireLabel(from);
  if (to === from) refuse('ROLLBACK_PRECONDITION_FAILED', ['labels']);
  const releases = await io.releases();
  const toRelease = own(releases, to), fromRelease = own(releases, from);
  const fields = [];
  if (!toRelease) fields.push('to');
  if (!fromRelease) fields.push('from');
  if (fields.length) refuse('ROLLBACK_PRECONDITION_FAILED', fields);
  const toKey = toRelease.releaseKey, fromKey = fromRelease.releaseKey;
  if (toRelease.slot === fromRelease.slot) fields.push('slot');
  if ((await io.readCurrentRelease())?.releaseKey !== fromKey) fields.push('current');
  const { state } = await io.readReleaseState({ releaseKey: toKey });
  // A half-done rollback left it STAGED; it drained before, and may have RETIRED in between (D10 review).
  const restaged = state === 'STAGED' && (await io.readReleaseEvents({ releaseKey: toKey })).some(event => event.kind === 'DRAINING');
  if (state !== 'DRAINING' && state !== 'RETIRED' && !restaged) fields.push('state');
  let gatesActive = true;
  for (const gate of layout.gates) if (await io.gateState(gate) !== 'active') gatesActive = false;
  if (!gatesActive) fields.push('gates');
  if (await io.pathExists(`${layout.lockRoot}/${MAINTENANCE_PENDING_NAME}`)) fields.push('maintenance');
  if (fields.length) refuse('ROLLBACK_PRECONDITION_FAILED', fields);

  await io.disarmTimers({ label: to });
  if (state !== 'STAGED') await recordEvent(io, { releaseKey: toKey, kind: 'STAGED', recordedBy: ROLLBACK_BY, written: after => after.state === 'STAGED' });
  const started = [];
  const unit = service => unitNameFor(layout, service, to);
  const start = async (service, ready, waitMs, code) => {
    const before = await unitState(unit(service), layout, io);
    if (before === 'active') return;
    // A unit left failed would still read failed while its start job waits in the queue: clear that first (D10 review).
    if (before === 'failed' && !await systemctl(['reset-failed', unit(service)], layout, io)) refuse('ROLLBACK_START_FAILED', { service });
    if (!await systemctl(['start', '--no-block', unit(service)], layout, io)) refuse('ROLLBACK_START_FAILED', { service });
    await waitUntilReady({ unit: unit(service), ready, waitMs, code, layout, io });
    started.push(service);
  };
  const announced = (service, kind) => async () => (await startedEvent(unit(service), kind, layout, io))?.releaseKey === toKey;
  await start('runner', announced('runner', startedLineOf(layout, 'runner')), RUNNER_START_WAIT_MS, 'ROLLBACK_RUNNER_NOT_STARTED');
  await start('api', announced('api', startedLineOf(layout, 'api')), FRONT_START_WAIT_MS, 'ROLLBACK_API_NOT_STARTED');
  await start('ui', async () => {
    let secret;
    try { secret = await io.readEdgeSecret(); } catch { return false; }
    return waitingWebsite(await readWebsite(toRelease.slot, secret, layout, io), toKey, ['NOT_CURRENT']);
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
  // A retired release never starts at boot (bootMode 'enable': a first release's instances were enabled before its switch).
  const bad = enablesUnits(layout) && !await systemctl(['disable', ...units], layout, io) ? ['BOOT'] : [];
  return Object.freeze({ event: 'PREVIEW_RELEASE_ROLLED_BACK', beforeSwitch: true, label, releaseKey, outcome: 'RETIRED', backstopAt: null, bad: Object.freeze(bad) });
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

/**
 * Exact argv shapes only; anything that is not a release label refuses before a path, unit or row is touched. The
 * first release's `switch --to <label>` (no `--from`) is a shape only where the layout enables instances (the public
 * server); the preview's first release is its transition's `seed`.
 */
function parseArguments(argv, layout) {
  const [a, b, c, d, e, f, g] = argv;
  const n = argv.length;
  const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
  if (n === 3 && (a === 'stage' || a === 'seed') && b === '--label' && isLabel(c)) return { command: a, label: c };
  if (n === 3 && a === 'switch' && b === '--to' && isLabel(c) && enablesUnits(layout)) return { command: 'switch', to: c, first: true };
  if ((n === 5 || (n === 6 && f === '--old-pair-stopped')) && a === 'switch' && b === '--to' && isLabel(c) && d === '--from' && isLabel(e)) return { command: 'switch', to: c, from: e, oldPairStopped: n === 6 };
  if ((n === 6 || (n === 7 && g === '--old-pair-stopped')) && a === 'switch' && b === '--finish' && c === '--to' && isLabel(d) && e === '--from' && isLabel(f)) return { command: 'switch', to: d, from: f, finish: true, oldPairStopped: n === 7 };
  if (n === 5 && a === 'rollback' && b === '--to' && isLabel(c) && d === '--from' && isLabel(e)) return { command: 'rollback', to: c, from: e };
  if (n === 4 && a === 'rollback' && b === '--before-switch' && c === '--label' && isLabel(d)) return { command: 'rollback', label: d, beforeSwitch: true };
  return refuse('ARGUMENTS_REFUSED');
}
const COMMANDS = Object.freeze({
  stage: (args, layout, deps) => stageRelease({ label: args.label, layout, deps }),
  seed: (args, layout, deps) => seedRelease({ label: args.label, layout, deps }),
  switch: (args, layout, deps) => (args.first ? firstSwitchRelease({ to: args.to, layout, deps })
    : args.finish ? finishSwitch({ to: args.to, from: args.from, oldPairStopped: args.oldPairStopped, layout, deps })
      : switchRelease({ to: args.to, from: args.from, oldPairStopped: args.oldPairStopped, layout, deps })),
  rollback: (args, layout, deps) => (args.beforeSwitch ? rollbackRelease({ from: args.label, beforeSwitch: true, layout, deps }) : rollbackRelease({ to: args.to, from: args.from, layout, deps }))
});
const FAILED_EVENT = Object.freeze({ stage: 'PREVIEW_RELEASE_STAGE_REFUSED', seed: 'PREVIEW_RELEASE_SEED_REFUSED', switch: 'PREVIEW_RELEASE_SWITCH_REFUSED', rollback: 'PREVIEW_RELEASE_ROLLBACK_REFUSED' });

const PID_LINE = /^([1-9][0-9]{0,9})\n$/;
/** The pid in a lock file, or null; and whether that process exists (EPERM: it exists, owned by someone else). */
async function lockHolder(path) {
  const text = await readFile(path, 'utf8').catch(() => '');
  const match = PID_LINE.exec(text.slice(0, 32));
  if (!match) return { holderPid: null, holderAlive: false };
  const holderPid = Number(match[1]);
  try { process.kill(holderPid, 0); return { holderPid, holderAlive: true }; } catch (error) { return { holderPid, holderAlive: error?.code === 'EPERM' }; }
}

/**
 * Take the switch lock: create `path` exclusively (no symlink followed, 0600) with this process's pid. Resolves to the
 * function that lets go: it removes the file only while it still holds this pid (if the operator moved it aside, the
 * file now there is another command's). RELEASE_SWITCH_BUSY when the file exists; RELEASE_SWITCH_LOCK_FAILED otherwise.
 * A file whose holder is gone (an ssh drop skips the release, often right when the operator needs `switch --finish`)
 * is still refused, with `next`: how to clear it (D10 re-review). A file with no pid yet is another command between
 * creating it and writing its pid: its `next` says to re-run in a few seconds, and to move it aside only if that keeps
 * failing with no command running (D10 parked minor).
 */
export async function acquireSwitchLock(path, tool = 'release-switch.mjs') {
  // `[r]elease-switch.mjs`: a pattern that cannot match the shell running the check itself (`bash -c "pgrep -f …"`
  // holds the plain name on its own command line, so `pgrep -f release-switch.mjs` always finds one; final fix wave S7).
  const check = `pgrep -f '[${tool[0]}]${tool.slice(1)}'`;
  let handle;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const holder = await lockHolder(path);
      if (holder.holderAlive) refuse('RELEASE_SWITCH_BUSY', holder);
      refuse('RELEASE_SWITCH_BUSY', { ...holder, next: holder.holderPid !== null
        ? `no ${tool} is running (check: ${check}); move ${path} aside, then re-run`
        : `re-run in a few seconds (another ${tool} is taking the lock); only if it is still refused and none is running `
          + `(check: ${check}), move ${path} aside` });
    }
    refuse('RELEASE_SWITCH_LOCK_FAILED');
  }
  const token = `${process.pid}\n`;
  try {
    await handle.write(token);
    await handle.sync();
  } catch {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    refuse('RELEASE_SWITCH_LOCK_FAILED');
  }
  await handle.close();
  return async () => { if (await readFile(path, 'utf8').catch(() => null) === token) await unlink(path).catch(() => undefined); };
}

/** One JSON line per run: the result on stdout (exit 0, or 2 when `bad` is not empty), or one refusal on stderr (exit 1). */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv, layout);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    const release = await (deps.acquireLock ?? acquireSwitchLock)(`${layout.lockRoot}/${SWITCH_LOCK_NAME}`, toolOf(layout));
    let result;
    try { result = await COMMANDS[args.command](args, layout, deps); } finally { await release(); }
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
