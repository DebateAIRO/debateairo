// Root's retirement tools for one release (side-by-side spec §4). Run as root by systemd units only.
//
// Plain words: after a switch the older release keeps finishing its own debates, then retires by itself. This file
// writes down what root sees on the way, and nothing more:
//   - when the older release's API stops, the website/API pair is gone (FRONT_PAIR_STOPPED);
//   - when its runner exits cleanly after printing both retirement lines, the release is RETIRED;
//   - 7.5 hours after the switch (the backstop timer) it asks the release to retire now and emails the owner;
//   - 25 minutes after that request, if the runner still runs, it stops that one unit, re-opens a spending gate the
//     stop halted, and emails the owner. It never stops anything else, and never a runner without a standing request.
//
//   release-retire.mjs stopped --service api|runner --label <label>     ExecStopPost=+ of api@ / runner@ (D7)
//   release-retire.mjs may-start --service api|ui|runner --label <label> ExecStartPre of the public server units (D16)
//   release-retire.mjs retire-request --label <label>                   debateai-preview-runner-retire@<label>.service
//   release-retire.mjs retire-check --label <label>                     debateai-preview-runner-retire-check@<label>.service
//   release-retire.mjs mark-retired --label <label>                     operator, drained upload path only
//
// Every refusal is one JSON line on stderr and exit 1, so the unit fails and OnFailure= emails the owner: a row that
// should have been written never goes missing silently. Logs carry codes, labels, keys and counts only.
import { pathToFileURL } from 'node:url';
import { LAYOUT, RELEASE_LABEL, logLine, runBounded, unitNameFor } from './common.mjs';
import { STARTABLE, readLock, unitIsActive as prestartUnitIsActive } from './prestart.mjs';
import { countOpenWork, readReleaseState, recordReleaseEvent } from './release-table.mjs';

/** The two spending gates (deploy/preview-gate/v3), named and placed exactly as alert.mjs's re-open commands. */
export const GATES = Object.freeze([
  Object.freeze({ name: 'deepinfra', folder: '/opt/debateai-v3-preview/operator/deepinfra-budget-v3', privateDir: '/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3', go: '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json' }),
  Object.freeze({ name: 'anthropic', folder: '/opt/debateai-v3-preview/operator/anthropic-budget-v1', privateDir: '/var/lib/debateai-v3-preview/provider-anthropic-authority-v1', go: '/etc/debateai-v3-preview/provider-anthropic-go-v1.json' })
]);
const PYTHON = '/usr/bin/python3';
const RECORDED_BY = 'root:release-retire';
/** Side-by-side plan D: the check runs 25 minutes after the request; the stopped runner's last calls settle in 5 s. */
const GATE_SETTLE_MS = 5000;
/** ExecStopPost may run before journald has stored the last lines of the invocation: read up to 5 times, 1 s apart. */
const JOURNAL_TRIES = 5;
const JOURNAL_PAUSE_MS = 1000;
/** Both lines come at the very end of the invocation; the last 500 lines are plenty and keep the read bounded. */
const JOURNAL_LINES = '500';
const INVOCATION_ID = /^[0-9a-f]{32}$/;
const EXIT_STATUS = /^(?:0|[1-9][0-9]{0,2})$/;
const UNIT_STATES = Object.freeze(['active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating', 'maintenance', 'refreshing']);
const NOTICE_CODE = /^[a-z0-9_]{1,64}$/;
const SERVICES = Object.freeze(['api', 'ui', 'runner']);

class RetireRefusal extends Error { constructor(code, fields) { super(code); this.name = 'RetireRefusal'; this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new RetireRefusal(code, fields); };
const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);

/**
 * Both retirement lines, each a whole line of the journal text: the runner's own
 * `DEBATEAI_RUNNER_RETIRED {"releaseKey":"<key>"}` for THIS release, and the launcher's `PREVIEW_RUNNER_RETIRED`.
 */
export function retiredLinesFound(journalText, releaseKey) {
  if (typeof journalText !== 'string' || typeof releaseKey !== 'string') return false;
  const lines = journalText.split('\n');
  return lines.includes(`DEBATEAI_RUNNER_RETIRED ${JSON.stringify({ releaseKey })}`) && lines.includes('PREVIEW_RUNNER_RETIRED');
}

/** `<code>` of a release notice: the label with `-` as `_`, which alert.mjs accepts only up to 64 characters. */
function noticeCodeOf(label) {
  const code = label.replace(/-/g, '_');
  return NOTICE_CODE.test(code) ? code : refuse('RELEASE_NOTICE_LABEL_REFUSED');
}

/** The dependencies with the server's defaults; tests replace them. */
function withDefaults(layout, deps) {
  return {
    run: deps.run ?? runBounded,
    sleep: deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))),
    readLock: deps.readLock ?? readLock,
    readReleaseState: deps.readReleaseState ?? (input => readReleaseState({ ...input, layout })),
    recordReleaseEvent: deps.recordReleaseEvent ?? (input => recordReleaseEvent({ ...input, layout })),
    countOpenWork: deps.countOpenWork ?? (input => countOpenWork({ ...input, layout }))
  };
}

/** The pinned release key of a label (the lock is root's record of what each label runs). */
async function releaseKeyOf(label, layout, io) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  const { lock } = await io.readLock(layout);
  const release = Object.hasOwn(lock.releases, label) ? lock.releases[label] : refuse('RELEASE_LOCK_RELEASE_MISSING');
  return release.releaseKey;
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
 * stop-post), so that counts as stopped once no main process is left; a later manual call sees inactive or failed.
 */
async function apiHasStopped(unit, layout, io) {
  const { ActiveState: state, MainPID: pid } = await showUnit(unit, ['ActiveState', 'SubState', 'MainPID'], layout, io);
  if (!UNIT_STATES.includes(state) || !/^[0-9]{1,10}$/.test(pid)) refuse('UNIT_STATE_UNREADABLE');
  return pid === '0' && ['inactive', 'failed', 'deactivating'].includes(state);
}

/** `systemctl <args…>`; true when systemd accepted it. A stop waits for the unit's own TimeoutStopSec (30 s). */
async function systemctl(args, layout, io) {
  const result = await io.run([layout.systemctl, ...args], { env: {}, timeoutMs: 90_000, maxOutputBytes: 4096 });
  return Boolean(result) && !result.timedOut && !result.overflow && !result.error && result.code === 0;
}

const noticeUnit = (layout, kind, code) => `${layout.unitPrefix}notice@${kind}-${code}.service`;

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
    if (readable && retiredLinesFound(String(result.stdout), releaseKey)) return true;
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
 * - runner: RETIRED only for a DRAINING release whose invocation exited 0 and printed both retirement lines.
 * A failed read or write rejects: the CLI exits 1 (PREVIEW_RELEASE_STOP_RECORD_FAILED) and OnFailure emails.
 */
export async function recordStop({ service, label, layout = LAYOUT, deps = {} }) {
  if (service !== 'api' && service !== 'runner') refuse('ARGUMENTS_REFUSED');
  const io = withDefaults(layout, deps);
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
    }
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
    if (!await systemctl(['disable', '--now', `${layout.unitPrefix}runner-retire@${label}.timer`], layout, io)) refuse('RETIRE_TIMER_STOP_FAILED');
    return Object.freeze({ event: 'PREVIEW_RELEASE_RETIRE_NOT_NEEDED', label, releaseKey });
  }
  if (state !== 'DRAINING') refuse('RETIRE_STATE_REFUSED', { state });
  if (!retireRequested) await recordEvent({ releaseKey, kind: 'RETIRE_REQUESTED', reason: 'BACKSTOP', written: after => after.retireRequested, io });
  const noticed = await systemctl(['start', '--no-block', noticeUnit(layout, 'release-retire', code)], layout, io);
  if (!await systemctl(['start', `${layout.unitPrefix}runner-retire-check@${label}.timer`], layout, io)) refuse('RETIRE_CHECK_TIMER_FAILED');
  if (!noticed) refuse('NOTICE_START_FAILED');
  return Object.freeze({ event: 'PREVIEW_RELEASE_RETIRE_REQUESTED', label, releaseKey });
}

/** One gate's `state` from its read-only status (initialized, active or halted); anything unreadable is `unknown`. */
async function gateState(gate, io) {
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
 * 25 minutes after the request. RETIRED: honoured. Runner already gone without retiring: stranded, owner emailed,
 * nothing stopped. Runner still running under a standing request of a DRAINING release: read both gates, stop that
 * one unit, wait 5 s, read them again, re-open only a gate that was active before and is halted after, email the
 * owner. A running runner of any other release state is refused untouched (a stale timer after a rollback).
 */
export async function checkRetire({ label, layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  const releaseKey = await releaseKeyOf(label, layout, io);
  const code = noticeCodeOf(label);
  const { state, retireRequested } = await io.readReleaseState({ releaseKey });
  const unit = unitNameFor(layout, 'runner', label);
  const finish = async (event, kind, extra = {}) => {
    const noticed = kind === null || await systemctl(['start', '--no-block', noticeUnit(layout, kind, code)], layout, io);
    const openWork = await io.countOpenWork({ releaseKey });
    if (!noticed) refuse('NOTICE_START_FAILED', { event, openWork });
    return Object.freeze({ event, label, releaseKey, openWork, gatesReactivated: Object.freeze(extra.reactivated ?? []), ...(extra.failed ? { gatesReactivationFailed: Object.freeze(extra.failed) } : {}) });
  };
  if (state === 'RETIRED') return finish('PREVIEW_RELEASE_RETIRE_HONOURED', null);
  if (!await unitIsActive(unit, layout, io)) return finish('PREVIEW_RELEASE_STRANDED', 'release-stranded');
  if (state !== 'DRAINING' || !retireRequested) refuse('RETIRE_STATE_REFUSED', { state });
  const before = [];
  for (const gate of GATES) before.push(await gateState(gate, io));
  if (!await systemctl(['stop', unit], layout, io)) refuse('RUNNER_STOP_FAILED');
  await io.sleep(GATE_SETTLE_MS);
  const after = [];
  for (const gate of GATES) after.push(await gateState(gate, io));
  const reactivated = [], failed = [];
  for (const [index, gate] of GATES.entries()) {
    if (before[index] !== 'active' || after[index] !== 'halted') continue;
    (await activateGate(gate, io) ? reactivated : failed).push(gate.name);
  }
  return finish('PREVIEW_RELEASE_FORCED_STOP', 'release-forced', { reactivated, failed });
}

/**
 * The drained upload path only (D15 guide): the old release's runner is stopped and none of its work is READY or
 * CLAIMED, so it is RETIRED with reason DRAINED. Its runner never printed the retirement lines (it was stopped with
 * nothing to do), so the stop recorder could not have written it.
 */
export async function markDrainedRetired({ label, layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  const releaseKey = await releaseKeyOf(label, layout, io);
  const { state } = await io.readReleaseState({ releaseKey });
  if (state === 'RETIRED') return Object.freeze({ event: 'PREVIEW_RELEASE_RETIRE_NOT_NEEDED', label, releaseKey, openWork: 0 });
  if (state !== 'DRAINING') refuse('RETIRE_STATE_REFUSED', { state });
  if (await unitIsActive(unitNameFor(layout, 'runner', label), layout, io)) refuse('RELEASE_RUNNER_ACTIVE');
  const openWork = await io.countOpenWork({ releaseKey });
  if (openWork !== 0) refuse('RELEASE_OPEN_WORK', { openWork });
  await recordEvent({ releaseKey, kind: 'RETIRED', reason: 'DRAINED', written: after => after.state === 'RETIRED', io });
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

/** One JSON line per run; 0 on success, 1 on any refusal (and on a forced stop that left a gate halted). */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    const result = await COMMANDS[args.command]({ service: args.service, label: args.label, layout, deps });
    // A gate the stop halted and that would not re-open is the owner's to look at: the unit fails so OnFailure emails.
    if (result.gatesReactivationFailed?.length) { logLine(stderr, result); return 1; }
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
