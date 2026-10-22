// Root's retirement tools for one release (side-by-side spec §4). Run as root by systemd units only.
//
// Plain words: after a switch the older release keeps finishing its own debates, then retires by itself. This file
// writes down what root sees on the way, and nothing more:
//   - when the older release's API stops, the website/API pair is gone (FRONT_PAIR_STOPPED);
//   - when its runner exits cleanly after printing both retirement lines, the release is RETIRED;
//   - 7.5 hours after the switch (the backstop timer) it asks the release to retire now, emails the owner and arms the
//     25-minute check at an absolute UTC time (a drop-in of debateai-preview-runner-retire-check@<label>.timer);
//   - 25 minutes after that request, if the runner still runs, it stops that one unit, re-opens a spending gate the
//     stop halted, and emails the owner. It never stops anything else, and never a runner without a standing request.
//   - once the release is RETIRED, its backstop and check timers are turned off (disabled; their files stay).
//
//   release-retire.mjs stopped --service api|runner --label <label>     ExecStopPost=+ of api@ / runner@ (D7)
//   release-retire.mjs may-start --service api|ui|runner --label <label> ExecStartPre of the public server units (D16)
//   release-retire.mjs retire-request --label <label>                   debateai-preview-runner-retire@<label>.service
//   release-retire.mjs retire-check --label <label>                     debateai-preview-runner-retire-check@<label>.service
//   release-retire.mjs mark-retired --label <label>                     operator, drained upload path only
//
// Every refusal is one JSON line on stderr and exit 1, so the unit fails and OnFailure= emails the owner: a row that
// should have been written never goes missing silently. Logs carry codes, labels, keys and counts only.
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LAYOUT, RELEASE_LABEL, atomicWrite, ensureDirectory, logLine, runBounded, unitNameFor } from './common.mjs';
import { STARTABLE, unitIsActive as prestartUnitIsActive } from './prestart.mjs';
import { releaseInfo } from './release-info.mjs';
import { countOpenWork, readReleaseEvents, readReleaseState, recordReleaseEvent } from './release-table.mjs';

/** The preview's two spending gates (common.mjs LAYOUT.gates); every tool reads the gates of its own layout (`layout.gates`). */
export const GATES = LAYOUT.gates;
const PYTHON = '/usr/bin/python3';
const RECORDED_BY = 'root:release-retire';
/** Side-by-side plan D: the check runs 25 minutes (1,500 s) after the request; the stopped runner's last calls settle in 5 s. */
export const RETIRE_CHECK_AFTER_MS = 1_500_000;
const GATE_SETTLE_MS = 5000;
/**
 * The stop recorder runs as ExecStopPost inside the unit's TimeoutStopSec=30: every read and write it makes shares
 * one 25 s deadline (each child's own timeout is cut to what is left), and running out refuses loudly.
 */
export const STOP_RECORD_DEADLINE_MS = 25_000;
/** ExecStopPost may run before journald has stored the last lines of the invocation: read up to 5 times, 1 s apart. */
const JOURNAL_TRIES = 5;
const JOURNAL_PAUSE_MS = 1000;
/** Both lines come at the very end of the invocation; the last 500 lines are plenty and keep the read bounded. */
const JOURNAL_LINES = '500';
const INVOCATION_ID = /^[0-9a-f]{32}$/;
const EXIT_STATUS = /^(?:0|[1-9][0-9]{0,2})$/;
const UNIT_STATES = Object.freeze(['active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating', 'maintenance', 'refreshing']);
/** systemd's sub-states of a deactivating service after its main process is gone (ExecStopPost and the final kills). */
const AFTER_MAIN_SUBSTATES = Object.freeze(['stop-post', 'final-watchdog', 'final-sigterm', 'final-sigkill']);
const NOTICE_CODE = /^[a-z0-9_]{1,64}$/;
const SERVICES = Object.freeze(['api', 'ui', 'runner']);

class RetireRefusal extends Error { constructor(code, fields) { super(code); this.name = 'RetireRefusal'; this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new RetireRefusal(code, fields); };
const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
const unitDirOf = layout => layout.systemdUnitDir ?? '/etc/systemd/system';
const retireTimerOf = (layout, label) => `${layout.unitPrefix}runner-retire@${label}.timer`;
const checkTimerOf = (layout, label) => `${layout.unitPrefix}runner-retire-check@${label}.timer`;
/** systemd's calendar form of a UTC instant, rounded UP to the whole second (a timer never fires before it). */
const utcCalendar = ms => new Date(Math.ceil(ms / 1000) * 1000).toISOString().replace('T', ' ').replace(/\.000Z$/, ' UTC');

/**
 * Every retirement line of the layout (`kinds`, layout.retiredLines), each a whole line of the journal text: the
 * runner's own `DEBATEAI_RUNNER_RETIRED {"releaseKey":"<key>"}` for THIS release, always, and on the preview the
 * launcher's `PREVIEW_RUNNER_RETIRED` too. The public server runs the runner without a launcher: its own line alone.
 */
export function retiredLinesFound(journalText, releaseKey, kinds = LAYOUT.retiredLines) {
  if (typeof journalText !== 'string' || typeof releaseKey !== 'string' || !Array.isArray(kinds) || !kinds.includes('DEBATEAI_RUNNER_RETIRED')) return false;
  const lines = journalText.split('\n');
  return kinds.every(kind => lines.includes(kind === 'DEBATEAI_RUNNER_RETIRED' ? `${kind} ${JSON.stringify({ releaseKey })}` : kind));
}

/** `<code>` of a release notice: the label with `-` as `_`, which alert.mjs accepts only up to 64 characters. */
function noticeCodeOf(label) {
  const code = label.replace(/-/g, '_');
  return NOTICE_CODE.test(code) ? code : refuse('RELEASE_NOTICE_LABEL_REFUSED');
}

/**
 * The dependencies with the server's defaults; tests replace them. With a `deadline` (ms since the epoch), every child
 * process gets at most the time left (the release-table calls run through the same `run`) and every step refuses
 * STOP_RECORD_DEADLINE once it has passed.
 */
function withDefaults(layout, deps, deadline = null) {
  const now = deps.now ?? Date.now;
  const left = () => { const ms = deadline - now(); return ms > 0 ? ms : refuse('STOP_RECORD_DEADLINE'); };
  const baseRun = deps.run ?? runBounded;
  const run = deadline === null ? baseRun : (argv, options) => baseRun(argv, { ...options, timeoutMs: Math.min(options.timeoutMs, left()) });
  const guarded = fn => (deadline === null ? fn : input => { left(); return fn(input); });
  return {
    now, run,
    sleep: deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))),
    // A root-owned unit drop-in (0644) in a root-owned 0755 folder, replaced atomically.
    writeUnitFile: deps.writeUnitFile ?? (async (path, text) => {
      const uid = layout.ownerUid ?? 0, gid = layout.ownerGid ?? 0;
      await ensureDirectory(dirname(path), { mode: 0o755, uid });
      await atomicWrite(path, Buffer.from(text, 'utf8'), { mode: 0o644, uid, gid });
    }),
    releaseInfo: guarded(input => releaseInfo({ ...input, layout, deps })),
    readReleaseState: guarded(deps.readReleaseState ?? (input => readReleaseState({ ...input, layout, run }))),
    recordReleaseEvent: guarded(deps.recordReleaseEvent ?? (input => recordReleaseEvent({ ...input, layout, run }))),
    readReleaseEvents: deps.readReleaseEvents ?? (input => readReleaseEvents({ ...input, layout, run })),
    countOpenWork: deps.countOpenWork ?? (input => countOpenWork({ ...input, layout, run }))
  };
}

/** The release key of a label (release-info.mjs: root's lock on the preview, the release's overlay on the public server). */
async function releaseKeyOf(label, layout, io) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  return (await io.releaseInfo({ label })).releaseKey;
}

/**
 * One plain event. A RELEASE_TABLE_UNREADABLE answer may hide a write that did commit (D3 review): re-read the
 * state and count the row as written when the state shows it; otherwise the refusal stands.
 */
async function recordEvent({ releaseKey, kind, reason, written, io }) {
  try {
    await io.recordReleaseEvent({ releaseKey, kind, recordedBy: RECORDED_BY, reason });
  } catch (error) {
    if (error?.code !== 'RELEASE_TABLE_UNREADABLE') throw error;
    if (!written(await io.readReleaseState({ releaseKey }))) throw error;
  }
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

/** prestart's reading: true unless systemd says inactive or failed (a starting or stopping runner still runs). */
const unitIsActive = (unit, layout, io) => prestartUnitIsActive({ unit, layout, run: io.run });

/**
 * The API's process is gone. ExecStopPost runs while systemd still calls the unit `deactivating` (sub-state
 * stop-post), so that counts as stopped once no main process is left and the sub-state is one that comes after the
 * main process (stop-post or a final kill); a later manual call sees inactive or failed.
 */
async function apiHasStopped(unit, layout, io) {
  const { ActiveState: state, SubState: subState, MainPID: pid } = await showUnit(unit, ['ActiveState', 'SubState', 'MainPID'], layout, io);
  if (!UNIT_STATES.includes(state) || !/^[0-9]{1,10}$/.test(pid)) refuse('UNIT_STATE_UNREADABLE');
  if (pid !== '0') return false;
  return state === 'inactive' || state === 'failed' || (state === 'deactivating' && AFTER_MAIN_SUBSTATES.includes(subState));
}

/** `systemctl <args…>`; true when systemd accepted it. A stop waits for the unit's own TimeoutStopSec (30 s). */
async function systemctl(args, layout, io) {
  const result = await io.run([layout.systemctl, ...args], { env: {}, timeoutMs: 90_000, maxOutputBytes: 4096 });
  return Boolean(result) && !result.timedOut && !result.overflow && !result.error && result.code === 0;
}

/**
 * Email the owner a release notice: start the layout's notice unit (`<noticeTemplate><kind>-<code>.service`). True when
 * systemd accepted it; null when the layout has no notice unit (the public server: no failure mail, README §9), which
 * the result says in its content-free `notice` field.
 */
async function startNotice(kind, code, layout, io) {
  if (typeof layout.noticeTemplate !== 'string') return null;
  return systemctl(['start', '--no-block', `${layout.noticeTemplate}${kind}-${code}.service`], layout, io);
}
const NOTICE_SKIPPED = Object.freeze({ notice: 'NO_NOTICE_UNIT' });

/** The time of the latest RETIRE_REQUESTED row (ms since the epoch); none is a state this tool refuses. */
async function latestRequestAt(releaseKey, io) {
  const requests = (await io.readReleaseEvents({ releaseKey })).filter(event => event.kind === 'RETIRE_REQUESTED');
  const requestedAt = requests.length ? Date.parse(requests.at(-1).recordedAt) : Number.NaN;
  return Number.isFinite(requestedAt) ? requestedAt : refuse('RETIRE_STATE_REFUSED', { state: 'DRAINING' });
}

/**
 * Arm the 25-minute check at an absolute UTC time (D7 review): a Persistent, enabled calendar timer survives a reboot,
 * where a relative one would be lost. The time is the latest request + 1,500 s, or one second from now when that has
 * already passed (a manual re-run, a second drain of the same label): systemd never fires a calendar time that was in
 * the past when it was armed. Rounded up to the second either way. The drop-in is replaced on every request, and
 * restart (not start) re-arms an instance that already fired or is still waiting.
 */
async function armCheck(label, requestedAt, layout, io) {
  const timer = checkTimerOf(layout, label);
  const at = Math.max(requestedAt + RETIRE_CHECK_AFTER_MS, io.now() + 1000);
  const text = [
    '# Written by release-retire.mjs retire-request (side-by-side spec §4); replaced by the next request, never edited by hand.',
    `# The 25-minute check of release ${label}: 1,500 s after its latest RETIRE_REQUESTED (${new Date(requestedAt).toISOString()}), never in the past.`,
    '[Timer]',
    `OnCalendar=${utcCalendar(at)}`,
    ''
  ].join('\n');
  try { await io.writeUnitFile(`${unitDirOf(layout)}/${timer}.d/50-at.conf`, text); } catch { refuse('RETIRE_CHECK_TIMER_FAILED'); }
  for (const args of [['daemon-reload'], ['enable', timer], ['restart', timer]]) if (!await systemctl(args, layout, io)) refuse('RETIRE_CHECK_TIMER_FAILED');
}

/**
 * A RETIRED release needs neither its backstop nor its check: disable and stop both. A timer systemd cannot load (a
 * check that was never armed has no time) has nothing to stop and is left alone. The rollback (D10) uses the exported
 * disarmTimers for the older label.
 */
async function disarmWith(label, layout, io) {
  for (const timer of [retireTimerOf(layout, label), checkTimerOf(layout, label)]) {
    const { LoadState: loadState } = await showUnit(timer, ['LoadState'], layout, io);
    if (loadState === 'loaded' && !await systemctl(['disable', '--now', timer], layout, io)) refuse('RETIRE_TIMER_STOP_FAILED');
  }
}

/**
 * The runner's own end: did THIS invocation exit cleanly after printing both retirement lines? Reads the invocation
 * id and exit status first, then only that invocation's journal lines (up to 5 reads, 1 s apart).
 */
async function runnerRetiredCleanly(unit, releaseKey, layout, io) {
  const shown = await showUnit(unit, ['InvocationID', 'ExecMainStatus', 'Result'], layout, io);
  if (!INVOCATION_ID.test(shown.InvocationID) || !EXIT_STATUS.test(shown.ExecMainStatus)) refuse('UNIT_STATE_UNREADABLE');
  if (shown.ExecMainStatus !== '0') return false;
  let readable = false;
  for (let attempt = 1; attempt <= JOURNAL_TRIES; attempt++) {
    const result = await io.run([layout.journalctl, '-u', unit, `_SYSTEMD_INVOCATION_ID=${shown.InvocationID}`, '-n', JOURNAL_LINES, '-o', 'cat', '--no-pager'],
      { env: {}, timeoutMs: 10_000, maxOutputBytes: 1024 * 1024 });
    readable = Boolean(result) && !result.timedOut && !result.overflow && !result.error && result.code === 0;
    if (readable && retiredLinesFound(String(result.stdout), releaseKey, layout.retiredLines)) return true;
    // Past the deadline the next read refuses STOP_RECORD_DEADLINE (loud), never a silent "not retired".
    if (attempt < JOURNAL_TRIES) await io.sleep(JOURNAL_PAUSE_MS);
  }
  // A clean exit whose lines could not be read at all is not "no retirement": the owner must look (exit 1).
  if (!readable) refuse('JOURNAL_UNREADABLE');
  return false;
}

/**
 * ExecStopPost of api@<label> and runner@<label>.
 * - api: FRONT_PAIR_STOPPED only for a DRAINING release whose API process is gone and not yet recorded; a CURRENT
 *   release (crash restart) and a STAGED one (stopped before the switch) are ignored.
 * - runner: RETIRED only for a DRAINING release whose invocation exited 0 and printed its retirement lines. Where the
 *   layout starts the current release by enabled instances (bootMode 'enable', the public server), its runner instance
 *   is then disabled, so a retired runner never starts at boot again (its may-start would refuse it). A stop of a runner
 *   already RETIRED disables it again there (safe to repeat), so a disable that failed when RETIRED was recorded is
 *   retried at its next stop (a boot start its may-start refuses ends in this recorder too).
 * A failed read or write rejects: the CLI exits 1 (PREVIEW_RELEASE_STOP_RECORD_FAILED) and OnFailure emails.
 */
export async function recordStop({ service, label, layout = LAYOUT, deps = {} }) {
  if (service !== 'api' && service !== 'runner') refuse('ARGUMENTS_REFUSED');
  const io = withDefaults(layout, deps, (deps.now ?? Date.now)() + STOP_RECORD_DEADLINE_MS);
  const releaseKey = await releaseKeyOf(label, layout, io);
  const { state, frontPairStopped } = await io.readReleaseState({ releaseKey });
  const unit = unitNameFor(layout, service, label);
  let recorded = null;
  if (state === 'DRAINING') {
    if (service === 'api' && !frontPairStopped && await apiHasStopped(unit, layout, io)) {
      await recordEvent({ releaseKey, kind: 'FRONT_PAIR_STOPPED', reason: null, written: after => after.state !== 'DRAINING' || after.frontPairStopped, io });
      recorded = 'FRONT_PAIR_STOPPED';
    } else if (service === 'runner' && await runnerRetiredCleanly(unit, releaseKey, layout, io)) {
      await recordEvent({ releaseKey, kind: 'RETIRED', reason: 'RUNNER_RETIRED', written: after => after.state === 'RETIRED', io });
      recorded = 'RETIRED';
      if (layout.bootMode === 'enable' && !await systemctl(['disable', unit], layout, io)) refuse('RUNNER_DISABLE_FAILED');
    }
  } else if (state === 'RETIRED' && service === 'runner' && layout.bootMode === 'enable') {
    if (!await systemctl(['disable', unit], layout, io)) refuse('RUNNER_DISABLE_FAILED');
  }
  return Object.freeze({ event: recorded ? 'PREVIEW_RELEASE_STOP_RECORDED' : 'PREVIEW_RELEASE_STOP_IGNORED', service, label, releaseKey, recorded, state });
}

/** ExecStartPre of the public server's units (D16): the same state rule as prestart's release-state gate. */
export async function mayStart({ service, label, layout = LAYOUT, deps = {} }) {
  if (!SERVICES.includes(service)) refuse('ARGUMENTS_REFUSED');
  const io = withDefaults(layout, deps);
  const releaseKey = await releaseKeyOf(label, layout, io);
  const { state } = await io.readReleaseState({ releaseKey });
  if (!STARTABLE[service].includes(state)) refuse('RELEASE_STATE_REFUSED', { state });
  return Object.freeze({ event: 'PREVIEW_RELEASE_MAY_START', service, label, releaseKey, state });
}

/**
 * The backstop (switch + 7.5 hours). RETIRED: nothing to ask, the backstop timer is turned off. DRAINING: record
 * RETIRE_REQUESTED (reason BACKSTOP) once, email the owner, arm the 25-minute check. Any other state is refused.
 */
export async function requestRetire({ label, layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  const releaseKey = await releaseKeyOf(label, layout, io);
  const code = noticeCodeOf(label);
  const { state, retireRequested } = await io.readReleaseState({ releaseKey });
  if (state === 'RETIRED') {
    await disarmWith(label, layout, io);
    return Object.freeze({ event: 'PREVIEW_RELEASE_RETIRE_NOT_NEEDED', label, releaseKey });
  }
  if (state !== 'DRAINING') refuse('RETIRE_STATE_REFUSED', { state });
  if (!retireRequested) await recordEvent({ releaseKey, kind: 'RETIRE_REQUESTED', reason: 'BACKSTOP', written: after => after.retireRequested, io });
  // The check is timed from the row itself (a re-run arms the same time), so it is never earlier than the check allows.
  const requestedAt = await latestRequestAt(releaseKey, io);
  const noticed = await startNotice('release-retire', code, layout, io);
  await armCheck(label, requestedAt, layout, io);
  if (noticed === false) refuse('NOTICE_START_FAILED');
  return Object.freeze({ event: 'PREVIEW_RELEASE_RETIRE_REQUESTED', label, releaseKey, ...(noticed === null ? NOTICE_SKIPPED : {}) });
}

/** Disable and stop both retirement timers of one release label (the rollback's call, D10); typed refusals as above. */
export async function disarmTimers({ label, layout = LAYOUT, deps = {} }) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  await disarmWith(label, layout, withDefaults(layout, deps));
  return Object.freeze({ event: 'PREVIEW_RELEASE_TIMERS_DISARMED', label });
}

/**
 * One gate's `state` from its read-only status (initialized, active or halted); anything unreadable is `unknown`.
 * `io` needs only `run`; release-switch.mjs (D10) reads both gates through this too.
 */
export async function gateState(gate, io) {
  const result = await io.run([PYTHON, '-I', `${gate.folder}/preview_budget_authority.py`, 'status', '--private', gate.privateDir],
    { env: {}, timeoutMs: 30_000, maxOutputBytes: 64 * 1024 });
  if (!result || result.timedOut || result.overflow || result.error || result.code !== 0) return 'unknown';
  try {
    const { state } = JSON.parse(String(result.stdout));
    return ['initialized', 'active', 'halted'].includes(state) ? state : 'unknown';
  } catch { return 'unknown'; }
}

async function activateGate(gate, io) {
  const result = await io.run([PYTHON, '-I', `${gate.folder}/preview_budget_authority.py`, 'activate', '--private', gate.privateDir, '--go', gate.go],
    { env: {}, timeoutMs: 30_000, maxOutputBytes: 64 * 1024 });
  return Boolean(result) && !result.timedOut && !result.overflow && !result.error && result.code === 0;
}

/**
 * 25 minutes after the request. RETIRED: honoured (its backstop and check timers are turned off). Anything but a DRAINING release under a standing request is
 * refused untouched (a stale timer after a rollback). Runner already gone without retiring: stranded, owner emailed,
 * nothing stopped. Runner still running: only once 25 minutes have passed since the latest RETIRE_REQUESTED row (a
 * manual or mis-armed run never stops a busy runner early), read both gates, stop that one unit, wait 5 s, read them
 * again, re-open only a gate that was active before and is halted after, email the owner. A gate whose state could
 * not be read on either side of the stop (and that might be halted) is listed in gatesUnknown for the owner. Where the
 * layout starts releases by enabled instances (bootMode 'enable', the public server; no gates there), the stopped
 * runner's instance is disabled too, or it would start again at the next boot (a DRAINING release's runner may start).
 */
export async function checkRetire({ label, layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  const releaseKey = await releaseKeyOf(label, layout, io);
  const code = noticeCodeOf(label);
  const { state, retireRequested } = await io.readReleaseState({ releaseKey });
  const unit = unitNameFor(layout, 'runner', label);
  const finish = async (event, kind, gates = null) => {
    const noticed = kind === null || await startNotice(kind, code, layout, io);
    const openWork = await io.countOpenWork({ releaseKey });
    if (noticed === false) refuse('NOTICE_START_FAILED', { event, openWork });
    return Object.freeze({
      event, label, releaseKey, openWork, gatesReactivated: Object.freeze(gates?.reactivated ?? []),
      ...(gates ? { gatesReactivationFailed: Object.freeze(gates.failed), gatesUnknown: Object.freeze(gates.unknown) } : {}),
      ...(noticed === null ? NOTICE_SKIPPED : {})
    });
  };
  if (state === 'RETIRED') {
    await disarmWith(label, layout, io);
    return finish('PREVIEW_RELEASE_RETIRE_HONOURED', null);
  }
  if (state !== 'DRAINING' || !retireRequested) refuse('RETIRE_STATE_REFUSED', { state });
  if (!await unitIsActive(unit, layout, io)) return finish('PREVIEW_RELEASE_STRANDED', 'release-stranded');
  const requestedAt = await latestRequestAt(releaseKey, io);
  if (io.now() - requestedAt < RETIRE_CHECK_AFTER_MS) refuse('RETIRE_CHECK_TOO_EARLY');
  // The layout's own gates (none on the public server): only those can have been halted by the stop.
  const gates = layout.gates;
  const before = [];
  for (const gate of gates) before.push(await gateState(gate, io));
  if (!await systemctl(['stop', unit], layout, io)) refuse('RUNNER_STOP_FAILED');
  if (layout.bootMode === 'enable' && !await systemctl(['disable', unit], layout, io)) refuse('RUNNER_DISABLE_FAILED');
  await io.sleep(GATE_SETTLE_MS);
  const after = [];
  for (const gate of gates) after.push(await gateState(gate, io));
  const reactivated = [], failed = [], unknown = [];
  for (const [index, gate] of gates.entries()) {
    if (before[index] === 'active' && after[index] === 'halted') (await activateGate(gate, io) ? reactivated : failed).push(gate.name);
    // Active before and unreadable after, or unreadable before and halted after: the stop may have halted it.
    else if ((before[index] === 'active' && after[index] === 'unknown') || (before[index] === 'unknown' && after[index] === 'halted')) unknown.push(gate.name);
  }
  return finish('PREVIEW_RELEASE_FORCED_STOP', 'release-forced', { reactivated, failed, unknown });
}

/**
 * The drained upload path only (D15 guide; the public server's README §5 "A drained upgrade", final fix wave S2): the
 * old release's runner is stopped and none of its work is READY or CLAIMED, so it is RETIRED with reason DRAINED. Its
 * runner never printed the retirement lines (it was stopped with nothing to do), so the stop recorder could not have
 * written it. Where the layout starts releases by enabled instances (bootMode 'enable'), the stopped runner's instance
 * is disabled too (the switch disables only the old API and website), or the next boot would start a retired runner.
 */
export async function markDrainedRetired({ label, layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  const releaseKey = await releaseKeyOf(label, layout, io);
  const unit = unitNameFor(layout, 'runner', label);
  const disable = async () => { if (layout.bootMode === 'enable' && !await systemctl(['disable', unit], layout, io)) refuse('RUNNER_DISABLE_FAILED'); };
  const { state } = await io.readReleaseState({ releaseKey });
  if (state === 'RETIRED') {
    // Already retired: turn the timers off (and the instance's boot start) again, so one that failed before is retried.
    await disarmWith(label, layout, io);
    await disable();
    return Object.freeze({ event: 'PREVIEW_RELEASE_RETIRE_NOT_NEEDED', label, releaseKey });
  }
  if (state !== 'DRAINING') refuse('RETIRE_STATE_REFUSED', { state });
  if (await unitIsActive(unit, layout, io)) refuse('RELEASE_RUNNER_ACTIVE');
  const openWork = await io.countOpenWork({ releaseKey });
  if (openWork !== 0) refuse('RELEASE_OPEN_WORK', { openWork });
  await recordEvent({ releaseKey, kind: 'RETIRED', reason: 'DRAINED', written: after => after.state === 'RETIRED', io });
  await disarmWith(label, layout, io);
  await disable();
  return Object.freeze({ event: 'PREVIEW_RELEASE_DRAINED_RETIRED', label, releaseKey, openWork });
}

/** Exact argv shapes only; a label that is not a release label refuses before any unit, path or database is touched. */
function parseArguments(argv) {
  const [first, second, third, fourth, fifth] = argv;
  const n = argv.length;
  if (n === 5 && first === 'stopped' && second === '--service' && (third === 'api' || third === 'runner') && fourth === '--label' && isLabel(fifth)) return { command: first, service: third, label: fifth };
  if (n === 5 && first === 'may-start' && second === '--service' && SERVICES.includes(third) && fourth === '--label' && isLabel(fifth)) return { command: first, service: third, label: fifth };
  if (n === 3 && ['retire-request', 'retire-check', 'mark-retired'].includes(first) && second === '--label' && isLabel(third)) return { command: first, label: third };
  return refuse('ARGUMENTS_REFUSED');
}
const FAILED_EVENT = Object.freeze({
  stopped: 'PREVIEW_RELEASE_STOP_RECORD_FAILED', 'may-start': 'PREVIEW_RELEASE_START_REFUSED',
  'retire-request': 'PREVIEW_RELEASE_RETIRE_REFUSED', 'retire-check': 'PREVIEW_RELEASE_RETIRE_CHECK_FAILED', 'mark-retired': 'PREVIEW_RELEASE_RETIRE_REFUSED'
});
const COMMANDS = Object.freeze({ stopped: recordStop, 'may-start': mayStart, 'retire-request': requestRetire, 'retire-check': checkRetire, 'mark-retired': markDrainedRetired });
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** One JSON line per run; 0 on success, 1 on any refusal (and on a forced stop that may have left a gate halted). */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    const result = await COMMANDS[args.command]({ service: args.service, label: args.label, layout, deps });
    // A gate the stop halted that would not re-open, or one whose state could not be read, is the owner's to look at:
    // the unit fails so OnFailure emails (the forced-stop notice says this email may follow).
    if (result.gatesReactivationFailed?.length || result.gatesUnknown?.length) { logLine(stderr, result); return 1; }
    logLine(stdout, result);
    return 0;
  } catch (error) {
    const context = args ? { ...(args.service ? { service: args.service } : {}), label: args.label } : {};
    logLine(stderr, { event: args ? FAILED_EVENT[args.command] : 'PREVIEW_RELEASE_RETIRE_REFUSED', ...context, reason: typeof error?.code === 'string' && CODE.test(error.code) ? error.code : 'UNEXPECTED', ...(error instanceof RetireRefusal && error.fields ? { fields: error.fields } : {}) });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
