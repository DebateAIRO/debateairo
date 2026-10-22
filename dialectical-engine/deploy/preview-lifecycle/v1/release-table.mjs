// Root's only door to the release table (side-by-side spec §4). Node built-ins only: this file is
// installed in the root-owned operator directory, which has no node_modules of its own.
//
// Plain words: the root release tools (switch, retire, check, prestart) read and record which
// release serves the site, and how much work each release still holds, through this file and
// nothing else. It runs psql as the postgres user over the server's own socket. The SQL is fixed
// text read from stdin; every value reaches it only as a `-v name=value` variable used as
// `:'name'`, after a strict pattern check, so no value is ever spliced into SQL text. psql's
// error text is never echoed: a refusal is a typed code and nothing else.
//
// The database functions (core.read_current_release, core.read_release_state,
// core.record_release_switch, core.record_release_event, core.release_event, core.run.release_key)
// belong to migration 0123 (side-by-side plan A). CURRENT is written only by the switch, and so is the
// DRAINING of the old current release, in the same transaction. The one plain DRAINING the database
// accepts is a re-staged release that still drains going back to draining (the abandoned re-stage,
// release-switch.mjs's before-switch rollback); the database refuses every other one.
import { LAYOUT, runBounded } from './common.mjs';

/** Same text as `RELEASE_KEY_PATTERN` in deploy/preview-auth-dev/v1/environment.mjs; a test pins the two equal. */
export const RELEASE_KEY_PATTERN = /^r[1-9][0-9]*-[0-9a-f]{12}$/;
/** Every row root writes names the root tool that wrote it, e.g. `root:release-switch`. */
export const RECORDED_BY = /^root:[a-z-]{1,40}$/;
/** The plain events; CURRENT only via the switch, DRAINING only where the database allows it (abandoned re-stage). */
export const EVENT_KINDS = Object.freeze(['STAGED', 'DRAINING', 'FRONT_PAIR_STOPPED', 'RETIRE_REQUESTED', 'RETIRED']);

const REASON = /^[A-Z_]{1,64}$/;
const STATES = Object.freeze(['STAGED', 'CURRENT', 'DRAINING', 'RETIRED']);
const ALL_KINDS = Object.freeze(['STAGED', 'CURRENT', 'DRAINING', 'FRONT_PAIR_STOPPED', 'RETIRE_REQUESTED', 'RETIRED']);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const COUNT = /^(?:0|[1-9][0-9]{0,15})$/;
const EVENT_SEQ = /^[1-9][0-9]{0,18}$/;
const TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
// The database gives up before root does (15 s): psql gives up connecting after 3 s (PGCONNECT_TIMEOUT,
// psqlArgv) and the statement is cancelled by its own 10 s limit, so 3 + 10 s ends before root stops
// waiting, and a timed-out switch is a switch that did not happen. Error texts are the server's untranslated ones
// (lc_messages C), so the `ERROR:  <CODE>` match in query() holds whatever the server's language is.
// A RELEASE_TABLE_UNREADABLE answer to a write can still hide a commit (the reply was lost after it):
// every caller reads the table again before deciding (D3 review).
const PRELUDE = "SET statement_timeout = '10s';\nSET lc_messages = 'C';\n";
const UTC_MS = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

class ReleaseTableRefusal extends Error { constructor(code) { super(code); this.name = 'ReleaseTableRefusal'; this.code = code; } }
const refuse = code => { throw new ReleaseTableRefusal(code); };

const validKey = value => typeof value === 'string' && RELEASE_KEY_PATTERN.test(value);
const requireKey = value => { if (!validKey(value)) refuse('RELEASE_KEY_INVALID'); return value; };
const requireRecordedBy = value => { if (typeof value !== 'string' || !RECORDED_BY.test(value)) refuse('RELEASE_EVENT_REFUSED'); return value; };

/**
 * runuser -u postgres -- /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC PGCONNECT_TIMEOUT=3 <pgBin>/psql
 *   --no-psqlrc --no-align --tuples-only --quiet --field-separator=| -v ON_ERROR_STOP=1
 *   --host=<sock> --port=<port> --dbname=<db> <-v name=value …> -f -
 * `variables` are already checked by the caller; names are fixed identifiers of this file.
 */
export function psqlArgv(layout, variables = []) {
  return [
    layout.runuser, '-u', 'postgres', '--', layout.env, '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', 'PGCONNECT_TIMEOUT=3',
    `${layout.pgBin}/psql`, '--no-psqlrc', '--no-align', '--tuples-only', '--quiet', '--field-separator=|', '-v', 'ON_ERROR_STOP=1',
    `--host=${layout.pgSocketDir}`, `--port=${layout.pgPort}`, `--dbname=${layout.database}`,
    ...variables.flatMap(([name, value]) => ['-v', `${name}=${value}`]),
    '-f', '-'
  ];
}

/**
 * One psql call; resolves to the output rows (fields split on `|`). Any failure is
 * RELEASE_TABLE_UNREADABLE, except that a write the database refused by name keeps that meaning
 * (`refusals` maps a database code to ours). stderr is read for that one name only, never echoed.
 */
async function query({ sql, variables = [], layout = LAYOUT, run = runBounded, refusals = {} }) {
  let result;
  try {
    result = await run(psqlArgv(layout, variables), { env: {}, stdin: Buffer.from(PRELUDE + sql, 'utf8'), timeoutMs: TIMEOUT_MS, maxOutputBytes: MAX_OUTPUT_BYTES });
  } catch { refuse('RELEASE_TABLE_UNREADABLE'); }
  if (!result || result.error || result.timedOut || result.overflow || !Buffer.isBuffer(result.stdout)) refuse('RELEASE_TABLE_UNREADABLE');
  if (result.code !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : '';
    for (const [databaseCode, code] of Object.entries(refusals)) if (new RegExp(`\\bERROR:\\s+${databaseCode}\\b`).test(stderr)) refuse(code);
    refuse('RELEASE_TABLE_UNREADABLE');
  }
  const text = result.stdout.toString('utf8');
  if (text === '') return [];
  if (!text.endsWith('\n')) refuse('RELEASE_TABLE_UNREADABLE');
  return text.slice(0, -1).split('\n').map(line => line.split('|'));
}

const oneRowOrNone = rows => { if (rows.length > 1) refuse('RELEASE_TABLE_UNREADABLE'); return rows[0] ?? null; };
const flag = value => (value === 't' ? true : value === 'f' ? false : refuse('RELEASE_TABLE_UNREADABLE'));
const count = rows => {
  const row = oneRowOrNone(rows);
  if (row === null || row.length !== 1 || !COUNT.test(row[0])) refuse('RELEASE_TABLE_UNREADABLE');
  const value = Number(row[0]);
  return Number.isSafeInteger(value) ? value : refuse('RELEASE_TABLE_UNREADABLE');
};
const eventSeq = rows => {
  const row = oneRowOrNone(rows);
  if (row === null || row.length !== 1 || !EVENT_SEQ.test(row[0])) refuse('RELEASE_TABLE_UNREADABLE');
};

/** The release's state; a release the table has never heard of is UNKNOWN (no row). */
export async function readReleaseState({ releaseKey, layout = LAYOUT, run = runBounded }) {
  requireKey(releaseKey);
  const row = oneRowOrNone(await query({
    sql: "SELECT state, front_pair_stopped, retire_requested FROM core.read_release_state(:'release_key');\n",
    variables: [['release_key', releaseKey]], layout, run
  }));
  if (row === null) return Object.freeze({ state: 'UNKNOWN', frontPairStopped: false, retireRequested: false });
  if (row.length !== 3 || !STATES.includes(row[0])) refuse('RELEASE_TABLE_UNREADABLE');
  return Object.freeze({ state: row[0], frontPairStopped: flag(row[1]), retireRequested: flag(row[2]) });
}

/** The release that serves the site and when it takes traffic (UTC, milliseconds), or null before the first switch. */
export async function readCurrentRelease({ layout = LAYOUT, run = runBounded }) {
  const row = oneRowOrNone(await query({
    sql: `SELECT served.release_key, to_char(served.take_traffic_from AT TIME ZONE 'UTC', ${UTC_MS}) FROM core.read_current_release() AS served;\n`,
    layout, run
  }));
  if (row === null) return null;
  if (row.length !== 2 || !validKey(row[0]) || !TIMESTAMP.test(row[1])) refuse('RELEASE_TABLE_UNREADABLE');
  return Object.freeze({ releaseKey: row[0], takeTrafficFrom: row[1] });
}

/** `activated_by`'s CHECK in migration 0124 (no colon): the switch's activation names its root tool in this form. */
export const ACTIVATED_BY = /^[A-Za-z0-9][A-Za-z0-9 ._@-]{0,127}$/;
const SETTINGS_VERSION = /^[1-9][0-9]{0,15}$/;
/** The database's refusals of the switch transaction, each kept by name (0123's and 0124's codes). */
const SWITCH_REFUSALS = Object.freeze({
  RELEASE_SWITCH_CONFLICT: 'RELEASE_SWITCH_CONFLICT', RELEASE_EVENT_INVALID: 'RELEASE_EVENT_REFUSED',
  SETTINGS_ACTIVATION_CONFLICT: 'SETTINGS_ACTIVATION_CONFLICT', SETTINGS_VERSION_NOT_PASSED: 'SETTINGS_VERSION_NOT_PASSED',
  SETTINGS_ACTIVATION_UNCHANGED: 'SETTINGS_ACTIVATION_UNCHANGED', SETTINGS_VERSION_KIND_INVALID: 'SETTINGS_VERSION_KIND_INVALID'
});

/**
 * The switch transaction's fixed text (side-by-side spec §13 and §11, ruling R12): one psql call, ON_ERROR_STOP=1, every
 * value a `-v` variable. `core.record_release_switch` gets the pointer the operator saw as `p_expected_active_settings`
 * (NULL = never activated; 0124's hook refuses any other value); with `activation`, the same transaction then activates
 * that version for the new release (`register.activate_settings_version`), so 0124's deferred check (the current release
 * has passed the active version) holds at COMMIT. Prints the switch's event_seq, then the activation_seq.
 */
export function releaseSwitchSql({ activation }) {
  return [
    'BEGIN ISOLATION LEVEL READ COMMITTED;',
    "SELECT core.record_release_switch(:'new_key', NULLIF(:'expected_current', ''), clock_timestamp() + make_interval(secs => :'seconds'), :'recorded_by', NULLIF(:'expected_active', '')::bigint);",
    ...(activation ? ["SELECT register.activate_settings_version(:'activate'::bigint, NULLIF(:'expected_active', '')::bigint, :'new_key', :'activated_by', :'activation_reason');"] : []),
    'COMMIT;',
    ''
  ].join('\n');
}

/**
 * Make `newKey` CURRENT and the present current DRAINING in one database transaction.
 * The take-traffic time is the database's own clock plus `takeTrafficAfterSeconds`, never this
 * host's clock. `expectedCurrentKey` null means "no current release yet". The database refuses
 * RELEASE_SWITCH_CONFLICT when the current release is not the expected one.
 * Side-by-side spec §13 (S15): `expectedActiveSettings` is required — the settings pointer the switch saw (null = never
 * activated; tools/settings-version/cli.ts switch-plan reads it) — and `activation`, null or { version, activatedBy,
 * reason }, activates that version in the same transaction (releaseSwitchSql). The database's settings refusals keep
 * their names: SETTINGS_ACTIVATION_CONFLICT (the pointer moved), SETTINGS_VERSION_NOT_PASSED (at COMMIT: the new release
 * has not passed the active version), SETTINGS_ACTIVATION_UNCHANGED, SETTINGS_VERSION_KIND_INVALID.
 */
export async function recordReleaseSwitch({ newKey, expectedCurrentKey, takeTrafficAfterSeconds, recordedBy, expectedActiveSettings, activation = null, layout = LAYOUT, run = runBounded }) {
  requireKey(newKey);
  if (expectedCurrentKey !== null) requireKey(expectedCurrentKey);
  requireRecordedBy(recordedBy);
  if (!Number.isInteger(takeTrafficAfterSeconds) || takeTrafficAfterSeconds < 0 || takeTrafficAfterSeconds > 60) refuse('RELEASE_EVENT_REFUSED');
  if (expectedActiveSettings !== null && !(Number.isSafeInteger(expectedActiveSettings) && SETTINGS_VERSION.test(String(expectedActiveSettings)))) refuse('RELEASE_EVENT_REFUSED');
  if (activation !== null && (typeof activation !== 'object' || !Number.isSafeInteger(activation.version) || !SETTINGS_VERSION.test(String(activation.version))
    || typeof activation.activatedBy !== 'string' || !ACTIVATED_BY.test(activation.activatedBy)
    || typeof activation.reason !== 'string' || !/^[ -~]{1,512}$/.test(activation.reason))) refuse('RELEASE_EVENT_REFUSED');
  const rows = await query({
    sql: releaseSwitchSql({ activation: activation !== null }),
    variables: [['new_key', newKey], ['expected_current', expectedCurrentKey ?? ''], ['seconds', String(takeTrafficAfterSeconds)], ['recorded_by', recordedBy],
      ['expected_active', expectedActiveSettings === null ? '' : String(expectedActiveSettings)],
      ...(activation !== null ? [['activate', String(activation.version)], ['activated_by', activation.activatedBy], ['activation_reason', activation.reason]] : [])],
    layout, run, refusals: SWITCH_REFUSALS
  });
  // One row per SELECT: the switch's event_seq, then (with an activation) the activation_seq.
  if (rows.length !== (activation !== null ? 2 : 1)) refuse('RELEASE_TABLE_UNREADABLE');
  rows.forEach(row => eventSeq([row]));
}

/** One plain event (STAGED, DRAINING, FRONT_PAIR_STOPPED, RETIRE_REQUESTED, RETIRED); `reason` is null or an upper-case code. */
export async function recordReleaseEvent({ releaseKey, kind, recordedBy, reason, layout = LAYOUT, run = runBounded }) {
  requireKey(releaseKey);
  if (typeof kind !== 'string' || !EVENT_KINDS.includes(kind)) refuse('RELEASE_EVENT_REFUSED');
  requireRecordedBy(recordedBy);
  if (reason !== null && (typeof reason !== 'string' || !REASON.test(reason))) refuse('RELEASE_EVENT_REFUSED');
  eventSeq(await query({
    sql: "SELECT core.record_release_event(:'release_key', :'kind', :'recorded_by', NULLIF(:'reason', ''));\n",
    variables: [['release_key', releaseKey], ['kind', kind], ['recorded_by', recordedBy], ['reason', reason ?? '']],
    layout, run, refusals: { RELEASE_EVENT_INVALID: 'RELEASE_EVENT_REFUSED' }
  }));
}

/** Every event of one release, oldest first; times in UTC with milliseconds. */
export async function readReleaseEvents({ releaseKey, layout = LAYOUT, run = runBounded }) {
  requireKey(releaseKey);
  const rows = await query({
    sql: `SELECT event.kind, to_char(event.recorded_at AT TIME ZONE 'UTC', ${UTC_MS}), event.reason\n  FROM core.release_event AS event\n WHERE event.release_key = :'release_key'\n ORDER BY event.event_seq;\n`,
    variables: [['release_key', releaseKey]], layout, run
  });
  return Object.freeze(rows.map(row => {
    if (row.length !== 3 || !ALL_KINDS.includes(row[0]) || !TIMESTAMP.test(row[1]) || (row[2] !== '' && !REASON.test(row[2]))) refuse('RELEASE_TABLE_UNREADABLE');
    return Object.freeze({ kind: row[0], recordedAt: row[1], reason: row[2] === '' ? null : row[2] });
  }));
}

/** READY or CLAIMED work items of one release (through core.run.release_key), or of every release when `releaseKey` is null. */
export async function countOpenWork({ releaseKey, layout = LAYOUT, run = runBounded }) {
  if (releaseKey === null) {
    return count(await query({ sql: "SELECT count(*) FROM core.work_item AS item\n WHERE item.state IN ('READY', 'CLAIMED');\n", layout, run }));
  }
  requireKey(releaseKey);
  return count(await query({
    sql: "SELECT count(*) FROM core.work_item AS item\n  JOIN core.run AS run ON run.run_id = item.run_id\n WHERE item.state IN ('READY', 'CLAIMED')\n   AND run.release_key = :'release_key';\n",
    variables: [['release_key', releaseKey]], layout, run
  }));
}

/** Debates in the waiting line (core.run_waiting_v; superseded runs are not waiting). */
export async function countWaiting({ layout = LAYOUT, run = runBounded }) {
  return count(await query({ sql: 'SELECT count(*) FROM core.run_waiting_v;\n', layout, run }));
}
