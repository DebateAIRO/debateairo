// Root's read-only release check for the preview (side-by-side spec §12 step 4, §4, §5). Linux, Node v26.8.2, run by the
// operator as root.
//
// Plain words: before an upload starts anything, this tool says which way the upload may go, and afterwards it writes
// down that the old release went away cleanly:
//   - check        the verdict: SIDE_BY_SIDE (every check passes), DRAINED_PATH (a new database step does not say both
//                  `-- n1: expand` and `-- n1: keeps-verifier`: the upload takes the drained path, spec §5's escape
//                  hatch) or NOT_READY (anything else failed: stop and ask). Each check is named, with a plain detail;
//   - status       every pinned release: its state in the release table, its three units and its open work;
//   - receipt      the release retired by itself (spec §4, G4): its RETIRED row, its runner's clean exit and retirement
//                  lines (from systemd, or from the journal once systemd has unloaded the stopped instance), and no
//                  failure email for that runner since the switch, written as a NEW root-only JSON file;
//   - maintenance  infrastructure maintenance (Postgres, Hatchet, Caddy, the gates' software) may be planned only while
//                  no release drains (spec §4): the operator then creates the maintenance-pending flag by hand.
//
//   release-check.mjs check --label <new> --older-manifest <file> --newer-manifest <file> [--gate-rows-reviewed <sha256>] [--lifecycle-reviewed]
//   release-check.mjs status
//   release-check.mjs receipt --label <label> --out <file>
//   release-check.mjs maintenance
//
// The two manifests are the candidate API source manifests (root-owned 0644, release-artifacts.mjs source-manifest) of
// the current release and of the new one. Read-only: the one file this tool writes is the receipt it is asked for.
// Exit 0 for SIDE_BY_SIDE and for the other commands; 2 for a DRAINED_PATH or NOT_READY verdict; 1 on a refusal.
// One JSON line per run: codes, labels, keys, counts, file paths of the source tree and digests only.
import { randomBytes } from 'node:crypto';
import { constants, link, lstat, open, readFile, realpath, statfs, unlink } from 'node:fs/promises';
import { connect } from 'node:net';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strictJson, withPrivateBytes } from '../../preview-auth-dev/v1/custody.mjs';
import { PREVIEW_SLOTS, labelOfSourceRoot, parsePublicArtifactBytes } from '../../preview-auth-dev/v1/launch-plan.mjs';
import { LAYOUT, RELEASE_LABEL, canonicalJson, logLine, runBounded, sha256, unitNameFor } from './common.mjs';
import { addedMigrations, n1Headers } from './migration-steps.mjs';
import { readLock } from './prestart.mjs';
import { GATES, gateState, retiredLinesFound } from './release-retire.mjs';
import { GATE_FILES_SCHEMA, MAINTENANCE_PENDING_NAME, MAX_LABEL_LENGTH, gateFilesDigest, gateFilesPathFor } from './release-switch.mjs';
import { countOpenWork, psqlArgv, readCurrentRelease, readReleaseEvents, readReleaseState } from './release-table.mjs';

/** The checks, in the order the verdict lists them (side-by-side plan D, Task D11). */
export const CHECK_NAMES = Object.freeze(['N1_HEADERS', 'CURRENT_PINNED', 'PREVIOUS_RETIRED', 'GATES_ACTIVE', 'GATE_ROWS_N1', 'CONNECTIONS', 'DISK', 'MEMORY', 'HATCHET', 'NO_MAINTENANCE', 'SLOT_FREE', 'LIFECYCLE_FILES']);
/** Two of everything (plan D, connection budget): the server allows 320 connections and at least 120 are free. */
export const MIN_MAX_CONNECTIONS = 320, MIN_FREE_CONNECTIONS = 120;
/** At least 15 GB free on `/` and 4 GiB of MemAvailable before a second release starts beside the first. */
export const MIN_DISK_FREE_BYTES = 15e9, MIN_MEM_AVAILABLE_BYTES = 4 * 1024 ** 3;
/** Ubuntu's flag for a pending reboot: infrastructure maintenance waits for it (spec §12 step 4). */
export const REBOOT_REQUIRED_PATH = '/run/reboot-required';
/**
 * The operator folders the server runs from one shared copy: a change there needs the owner's review and a folder swap.
 * preview-release/ too: release-switch.mjs imports caddy-slots.mjs from it (controller ruling on D11).
 */
export const LIFECYCLE_FOLDERS = Object.freeze(['dialectical-engine/deploy/preview-lifecycle/', 'dialectical-engine/deploy/preview-auth-dev/', 'dialectical-engine/deploy/preview-release/']);
export const RECEIPT_SCHEMA = 'preview-release-retirement-receipt-v1';
const HASH = /^[a-f0-9]{64}$/;
const UNIT_STATES = Object.freeze(['active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating', 'maintenance', 'refreshing']);
const STOPPED = Object.freeze(['inactive', 'failed']);
const INVOCATION_ID = /^[0-9a-f]{32}$/;
const EXIT_STATUS = /^(?:0|[1-9][0-9]{0,2})$/;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_LISTED_PATHS = 20;
const PORT_TIMEOUT_MS = 1000;
const MAX_MIGRATION_BYTES = 16 * 1024 * 1024;
/** Same limits as release-table.mjs: the statement gives up after 10 s, root after 15 s. */
const CONNECTIONS_SQL = [
  "SET statement_timeout = '10s';",
  "SELECT current_setting('max_connections'),",
  "       current_setting('superuser_reserved_connections')::int + coalesce(current_setting('reserved_connections', true)::int, 0),",
  "       (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend');",
  ''
].join('\n');
const COUNTS_ROW = /^([1-9][0-9]{0,5})\|(0|[1-9][0-9]{0,5})\|(0|[1-9][0-9]{0,5})\n$/;
/**
 * The receipt's journal evidence once systemd has unloaded the stopped runner instance (D11 review). The message ids
 * are systemd's (sd-messages.h; `journalctl --list-catalog <id>` prints each one's catalog entry, a server pre-flight
 * check). PID 1 writes them with UNIT=<unit> and INVOCATION_ID=<that run of the unit>:
 *   7ad2d189f7e94e70a38c781354912448  UNIT_SUCCESS            "unit deactivated successfully"
 *   d9b373ed55a64feb8242e02dbe79a49c  UNIT_FAILURE_RESULT     "unit failed"
 *   be02cf6855d2428ba40df7e9d022f03d  UNIT_FAILED             a start job failed
 *   641257651c1b4ec9a8624d7a40a9e1e7  SPAWN_FAILED            a command could not be executed
 *   fe6faa94e7774663a0da52717891d8ef  UNIT_OUT_OF_MEMORY      the kernel or systemd-oomd killed the unit
 *   5eb03494b6584870a536b337290809b3  UNIT_RESTART_SCHEDULED  only after a failure (the runner has Restart=no)
 *   98e322203f7a4ed290d09fe03c09fe15  UNIT_PROCESS_EXIT       EXIT_CODE/EXIT_STATUS of a process; PID 1 writes a
 *                                     successful exit at debug level only, so it is usually absent, and when present
 *                                     it must say exited/0.
 */
export const UNIT_SUCCESS_MESSAGE_ID = '7ad2d189f7e94e70a38c781354912448';
export const UNIT_PROCESS_EXIT_MESSAGE_ID = '98e322203f7a4ed290d09fe03c09fe15';
export const UNIT_FAILURE_MESSAGE_IDS = Object.freeze(['d9b373ed55a64feb8242e02dbe79a49c', 'be02cf6855d2428ba40df7e9d022f03d', '641257651c1b4ec9a8624d7a40a9e1e7', 'fe6faa94e7774663a0da52717891d8ef', '5eb03494b6584870a536b337290809b3']);
/** The newest 1,000 entries of the unit (its last run ends with the retirement lines, the recorder's line and PID 1's). */
const JOURNAL_ENTRIES = '1000';
const JOURNAL_FIELDS = 'MESSAGE,MESSAGE_ID,UNIT,INVOCATION_ID,_SYSTEMD_UNIT,_SYSTEMD_INVOCATION_ID,_PID,_UID,EXIT_CODE,EXIT_STATUS';
const JOURNAL_JSON_BYTES = 4 * 1024 * 1024;

class CheckRefusal extends Error { constructor(code, fields) { super(code); this.name = 'CheckRefusal'; this.code = code; if (fields) this.fields = fields; } }
const refuse = (code, fields) => { throw new CheckRefusal(code, fields); };
const codeOf = error => (typeof error?.code === 'string' && CODE.test(error.code) ? error.code : 'UNEXPECTED');
const own = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined);
const absolute = path => typeof path === 'string' && isAbsolute(path) && normalize(path) === path && !path.includes('\0');
const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
/** A release label the switch can stage (D10: at most 64 characters, the length of a notice code). */
function requireLabel(value) {
  if (!isLabel(value)) refuse('ARGUMENTS_REFUSED');
  return value.length <= MAX_LABEL_LENGTH ? value : refuse('RELEASE_LABEL_TOO_LONG');
}

/** A TCP connect to 127.0.0.1:<port>: true only when the connection is refused (nothing listens there). */
export function portRefuses(port, { timeoutMs = PORT_TIMEOUT_MS } = {}) {
  return new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = refused => { socket.destroy(); resolve(refused); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(false));
    socket.once('error', error => done(error?.code === 'ECONNREFUSED'));
  });
}

/** A path that cannot be read counts as present: the maintenance flags fail closed (as release-switch.mjs reads them). */
const pathExists = path => lstat(path).then(() => true, error => error?.code !== 'ENOENT');

/** The dependencies with the server's defaults; tests replace them. */
function withDefaults(layout, deps) {
  const run = deps.run ?? runBounded;
  const uid = layout.ownerUid ?? 0, gid = layout.ownerGid ?? 0;
  return {
    run, uid, gid,
    now: deps.now ?? Date.now,
    readLock: deps.readLock ?? readLock,
    readCurrentRelease: deps.readCurrentRelease ?? (() => readCurrentRelease({ layout, run })),
    readReleaseState: deps.readReleaseState ?? (input => readReleaseState({ ...input, layout, run })),
    readReleaseEvents: deps.readReleaseEvents ?? (input => readReleaseEvents({ ...input, layout, run })),
    countOpenWork: deps.countOpenWork ?? (input => countOpenWork({ ...input, layout, run })),
    gateState: deps.gateState ?? (gate => gateState(gate, { run })),
    gateFilesDigest: deps.gateFilesDigest ?? (() => gateFilesDigest(GATES)),
    // The switch's own copy (0600 in root's 0700 state folder); none yet before the first switch on this layout.
    readGateSnapshot: deps.readGateSnapshot ?? (async path => {
      if (!await pathExists(path)) return null;
      try {
        return await withPrivateBytes(path, { root: layout.stateDir, uid, mode: 0o600, maxBytes: 65536 }, raw => strictJson(raw));
      } catch { return refuse('GATE_SNAPSHOT_UNREADABLE'); }
    }),
    readConnections: deps.readConnections ?? (async () => {
      const result = await run(psqlArgv(layout), { env: {}, stdin: Buffer.from(CONNECTIONS_SQL, 'utf8'), timeoutMs: 15_000, maxOutputBytes: 4096 });
      const match = result && !result.error && !result.timedOut && !result.overflow && result.code === 0 ? COUNTS_ROW.exec(String(result.stdout)) : null;
      if (!match) refuse('CONNECTIONS_UNREADABLE');
      return { maxConnections: Number(match[1]), reserved: Number(match[2]), inUse: Number(match[3]) };
    }),
    statfs: deps.statfs ?? (path => statfs(path)),
    readMeminfo: deps.readMeminfo ?? (() => readFile('/proc/meminfo', 'utf8')),
    pathExists: deps.pathExists ?? pathExists,
    portRefuses: deps.portRefuses ?? (port => portRefuses(port)),
    // One source file of a staged release, read as its manifest says it is held (owner, mode, no link).
    readSourceFile: deps.readSourceFile ?? (({ root, path, uid: owner, mode }) => withPrivateBytes(join(root, path),
      { root, uid: owner, mode, maxBytes: MAX_MIGRATION_BYTES }, raw => Buffer.from(raw))),
    readManifest: deps.readManifest ?? (path => withPrivateBytes(path, { root: dirname(path), uid, mode: 0o644, maxBytes: 16_777_216 }, raw => parsePublicArtifactBytes(raw, 'source'))),
    // The receipt: a NEW 0600 file in an existing folder only its owner (root) can enter.
    writeReceipt: deps.writeReceipt ?? (async (path, bytes) => {
      if (!absolute(path)) refuse('RECEIPT_OUTPUT_REFUSED');
      const folder = dirname(path);
      const stat = await lstat(folder).catch(() => refuse('RECEIPT_OUTPUT_REFUSED'));
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o077) !== 0 || await realpath(folder) !== folder) refuse('RECEIPT_OUTPUT_REFUSED');
      await writeNewFile(path, bytes, { mode: 0o600, uid, gid });
    })
  };
}

/**
 * A NEW file, never a replacement. The steps of common.mjs's atomicWrite (a temporary file beside the target, O_EXCL and
 * no link followed, owner and mode set, fsync), but it ends with link(temporary, path) instead of rename: link refuses
 * EEXIST, so a file that appears at `path` after the folder check is kept and the write refuses RECEIPT_OUTPUT_EXISTS
 * (atomicWrite's rename would replace it; D11 review). Only our own temporary name is removed afterwards.
 */
export async function writeNewFile(path, bytes, { mode, uid, gid }) {
  if (!absolute(path) || !Buffer.isBuffer(bytes) || !Number.isInteger(mode)) refuse('RECEIPT_WRITE_FAILED');
  const temporary = join(dirname(path), `.${basename(path)}.${randomBytes(8).toString('hex')}.tmp`);
  let handle, created = false;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    created = true;
    await handle.chown(uid, gid);
    await handle.chmod(mode);
    for (let offset = 0; offset < bytes.length;) offset += (await handle.write(bytes, offset)).bytesWritten;
    await handle.sync();
    await handle.close(); handle = undefined;
    await link(temporary, path).catch(error => (error?.code === 'EEXIST' ? refuse('RECEIPT_OUTPUT_EXISTS') : Promise.reject(error)));
    const folder = await open(dirname(path), constants.O_RDONLY);
    try { await folder.sync(); } catch { /* Some platforms refuse fsync on a directory; the link itself is already atomic. */ } finally { await folder.close(); }
  } catch (error) {
    if (error instanceof CheckRefusal) throw error;
    refuse('RECEIPT_WRITE_FAILED');
  } finally {
    await handle?.close().catch(() => undefined);
    if (created) await unlink(temporary).catch(() => undefined);
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

/** systemd's ActiveState of one unit, exactly. */
async function unitState(unit, layout, io) {
  const { ActiveState: state } = await showUnit(unit, ['ActiveState'], layout, io);
  return UNIT_STATES.includes(state) ? state : refuse('UNIT_STATE_UNREADABLE');
}

/** A candidate API source manifest: the files list and the API folder of one release; its label. */
function manifestLabel(manifest, code) {
  if (manifest === null || typeof manifest !== 'object' || !Array.isArray(manifest.files)) refuse(code);
  try { return labelOfSourceRoot(manifest.sourceRoot, 'api'); } catch { return refuse(code); }
}

/** Every file row under the operator folders, by path, as comparable text. */
function lifecycleRows(manifest) {
  const rows = new Map();
  for (const row of manifest.files) {
    if (row !== null && typeof row === 'object' && typeof row.path === 'string' && LIFECYCLE_FOLDERS.some(folder => row.path.startsWith(folder))) rows.set(row.path, canonicalJson(row));
  }
  return rows;
}

const listed = paths => (paths.length > MAX_LISTED_PATHS ? `${paths.slice(0, MAX_LISTED_PATHS).join(', ')} and ${paths.length - MAX_LISTED_PATHS} more` : paths.join(', '));
const pass = detail => ({ ok: true, detail });
const miss = detail => ({ ok: false, detail });

/**
 * The added migrations with their n1 header lines, read from the newer release's own folder. Every step's bytes must be
 * the bytes the newer manifest names (MIGRATION_BYTES_MISMATCH otherwise); a step that cannot be read refuses
 * MIGRATION_UNREADABLE. Returns the names of the steps without both lines.
 */
async function stepsWithoutN1(added, newerManifest, io) {
  const missing = [];
  for (const { name, sha256: digest } of added) {
    const path = `dialectical-engine/migrations/${name}`;
    const row = newerManifest.files.find(file => file?.path === path);
    let bytes;
    try {
      bytes = await io.readSourceFile({ root: newerManifest.sourceRoot, path, uid: newerManifest.uid, mode: row.mode });
    } catch { refuse('MIGRATION_UNREADABLE', { name }); }
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== digest) refuse('MIGRATION_BYTES_MISMATCH', { name });
    let text;
    try { text = new TextDecoder('utf8', { fatal: true }).decode(bytes); } catch { refuse('MIGRATION_UNREADABLE', { name }); }
    const { expand, keepsVerifier } = n1Headers(text);
    if (!expand || !keepsVerifier) missing.push(name);
  }
  return missing;
}

/**
 * Side-by-side spec §12 step 4: may release `label` (newer manifest) start beside the current release (older manifest)?
 * The manifests are checked first (a refusal, exit 1: they are not these two releases, or the newer one drops or edits an
 * older step); then every check runs, each one failing on its own with a typed detail, never stopping the others.
 * DRAINED_PATH when N1_HEADERS fails, else NOT_READY when any check fails, else SIDE_BY_SIDE.
 */
export async function releaseCheck({ label, olderManifest, newerManifest, gateRowsReviewed = null, lifecycleReviewed = false, layout = LAYOUT, deps = {} }) {
  requireLabel(label);
  if ((gateRowsReviewed !== null && (typeof gateRowsReviewed !== 'string' || !HASH.test(gateRowsReviewed))) || typeof lifecycleReviewed !== 'boolean') refuse('ARGUMENTS_REFUSED');
  if (manifestLabel(newerManifest, 'NEWER_MANIFEST_REFUSED') !== label) refuse('NEWER_MANIFEST_REFUSED');
  if (manifestLabel(olderManifest, 'OLDER_MANIFEST_REFUSED') === label) refuse('OLDER_MANIFEST_REFUSED');
  const io = withDefaults(layout, deps);
  const added = addedMigrations(olderManifest, newerManifest);
  const withoutN1 = await stepsWithoutN1(added, newerManifest, io);

  // Shared reads: each check that needs one fails with its code when it cannot be read.
  const lockRead = io.readLock(layout).then(({ lock }) => lock);
  const currentRead = io.readCurrentRelease();
  lockRead.catch(() => undefined); currentRead.catch(() => undefined);
  const currentLabel = async () => {
    const [lock, current] = [await lockRead, await currentRead];
    if (current === null) refuse('NO_CURRENT_RELEASE');
    const labels = Object.keys(lock.releases).filter(name => lock.releases[name].releaseKey === current.releaseKey);
    return labels.length === 1 ? { lock, current, label: labels[0] } : refuse('CURRENT_NOT_PINNED');
  };

  const bodies = {
    N1_HEADERS: async () => (withoutN1.length ? miss(withoutN1.join(', ')) : pass(added.length ? `new: ${added.map(step => step.name).join(', ')}` : 'no new migrations')),
    // The current release is pinned, and the older manifest is its own API source manifest (the lock holds that digest).
    CURRENT_PINNED: async () => {
      const { lock, label: older } = await currentLabel();
      if (older === label) return miss('LABEL_IS_CURRENT');
      return own(lock.releases[older].services, 'api')?.sourceManifestSha256 === sha256(JSON.stringify(olderManifest)) ? pass(older) : miss('OLDER_MANIFEST_NOT_CURRENT');
    },
    // Every other pinned release (not the current one, not the new one) is RETIRED: at most two releases run at once.
    PREVIOUS_RETIRED: async () => {
      const { lock, label: older } = await currentLabel();
      const notRetired = [];
      for (const [name, release] of Object.entries(lock.releases)) {
        if (name === older || name === label) continue;
        const { state } = await io.readReleaseState({ releaseKey: release.releaseKey });
        if (state !== 'RETIRED') notRetired.push(`${name}: ${state}`);
      }
      return notRetired.length ? miss(notRetired.join(', ')) : pass('all retired');
    },
    GATES_ACTIVE: async () => {
      const states = [];
      for (const gate of GATES) states.push([gate.name, await io.gateState(gate)]);
      const off = states.filter(([, state]) => state !== 'active');
      return off.length ? miss(off.map(([name, state]) => `${name}: ${state}`).join(', ')) : pass('both active');
    },
    // The gates' GO files and operator folders are the bytes the last switch recorded, or the owner reviewed exactly
    // these bytes (the digest printed here is what --gate-rows-reviewed must repeat).
    GATE_ROWS_N1: async () => {
      const digests = await io.gateFilesDigest();
      const reviewable = sha256(canonicalJson(digests));
      let snapshot = null;
      try {
        const current = await currentRead;
        if (current !== null) snapshot = await io.readGateSnapshot(gateFilesPathFor(layout, current.releaseKey));
        if (snapshot !== null && (snapshot?.schema !== GATE_FILES_SCHEMA || snapshot.releaseKey !== current.releaseKey || !Array.isArray(snapshot.gates))) snapshot = null;
      } catch (error) {
        if (gateRowsReviewed === reviewable) return pass(`reviewed ${reviewable}`);
        throw error;
      }
      if (snapshot !== null && canonicalJson(snapshot.gates) === canonicalJson(digests)) return pass('unchanged since the switch');
      if (gateRowsReviewed === reviewable) return pass(`reviewed ${reviewable}`);
      return miss(`${snapshot === null ? 'no snapshot of the switch' : 'changed since the switch'}: review ${reviewable}`);
    },
    CONNECTIONS: async () => {
      const { maxConnections, reserved, inUse } = await io.readConnections();
      const free = maxConnections - reserved - inUse;
      const detail = `max ${maxConnections}, free ${free}`;
      return maxConnections >= MIN_MAX_CONNECTIONS && free >= MIN_FREE_CONNECTIONS ? pass(detail) : miss(detail);
    },
    DISK: async () => {
      const { bavail, bsize } = await io.statfs('/');
      const free = Number(bavail) * Number(bsize);
      if (!Number.isFinite(free)) refuse('DISK_UNREADABLE');
      const detail = `${(free / 1e9).toFixed(1)} GB free`;
      return free >= MIN_DISK_FREE_BYTES ? pass(detail) : miss(detail);
    },
    MEMORY: async () => {
      const match = /^MemAvailable:\s+([0-9]{1,15}) kB$/m.exec(String(await io.readMeminfo()));
      if (!match) refuse('MEMORY_UNREADABLE');
      const available = Number(match[1]) * 1024;
      const detail = `${Math.floor(available / 1024 ** 2)} MiB available`;
      return available >= MIN_MEM_AVAILABLE_BYTES ? pass(detail) : miss(detail);
    },
    HATCHET: async () => {
      const off = [];
      for (const unit of [`${layout.unitPrefix}hatchet.service`, `${layout.unitPrefix}hatchet-gateway.service`]) {
        const state = await unitState(unit, layout, io);
        if (state !== 'active') off.push(`${unit} ${state}`);
      }
      return off.length ? miss(off.join(', ')) : pass('both active');
    },
    NO_MAINTENANCE: async () => {
      const pending = [];
      if (await io.pathExists(`${layout.lockRoot}/${MAINTENANCE_PENDING_NAME}`)) pending.push('maintenance pending');
      if (await io.pathExists(REBOOT_REQUIRED_PATH)) pending.push('reboot required');
      return pending.length ? miss(pending.join(', ')) : pass('none');
    },
    // The slot the current release does not use: nothing listens on its two ports and no unit of `label` runs.
    SLOT_FREE: async () => {
      const { lock, label: older } = await currentLabel();
      const spare = lock.releases[older].slot === 'A' ? 'B' : 'A';
      const busy = [];
      const pinned = own(lock.releases, label);
      if (pinned && pinned.slot !== spare) busy.push(`${label} pinned in slot ${pinned.slot}`);
      for (const port of [PREVIEW_SLOTS[spare].uiPort, PREVIEW_SLOTS[spare].apiPort]) if (!await io.portRefuses(Number(port))) busy.push(`port ${port} answers`);
      for (const service of ['api', 'ui', 'runner']) {
        const unit = unitNameFor(layout, service, label);
        const state = await unitState(unit, layout, io);
        if (!STOPPED.includes(state)) busy.push(`${unit} ${state}`);
      }
      return busy.length ? miss(busy.join(', ')) : pass(`slot ${spare}`);
    },
    // The server runs one shared copy of these folders: a change needs the owner's review (and the folder swap, D15).
    LIFECYCLE_FILES: async () => {
      const older = lifecycleRows(olderManifest), newer = lifecycleRows(newerManifest);
      const changed = [...new Set([...older.keys(), ...newer.keys()])].filter(path => older.get(path) !== newer.get(path)).sort();
      if (changed.length === 0) return pass('unchanged');
      return lifecycleReviewed ? pass(`changed (reviewed): ${changed.length} files`) : miss(`changed: ${listed(changed)}`);
    }
  };

  const checks = [];
  for (const name of CHECK_NAMES) {
    let outcome;
    try { outcome = await bodies[name](); } catch (error) { outcome = miss(codeOf(error)); }
    checks.push(Object.freeze({ name, ok: outcome.ok, detail: outcome.detail }));
  }
  const verdict = !checks[0].ok ? 'DRAINED_PATH' : checks.some(entry => !entry.ok) ? 'NOT_READY' : 'SIDE_BY_SIDE';
  return Object.freeze({ event: 'PREVIEW_RELEASE_CHECK', label, verdict, checks: Object.freeze(checks) });
}

/** Every pinned release, in the lock's order: its key, slot, release-table state, three units and open work. */
export async function releaseStatus({ layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  const { lock } = await io.readLock(layout);
  const rows = [];
  for (const [label, release] of Object.entries(lock.releases)) {
    const { state, frontPairStopped, retireRequested } = await io.readReleaseState({ releaseKey: release.releaseKey });
    const units = {};
    for (const service of ['api', 'ui', 'runner']) units[service] = await unitState(unitNameFor(layout, service, label), layout, io);
    const openWork = await io.countOpenWork({ releaseKey: release.releaseKey });
    rows.push(Object.freeze({ label, releaseKey: release.releaseKey, slot: release.slot, state, frontPairStopped, retireRequested, units: Object.freeze(units), openWork }));
  }
  return Object.freeze(rows);
}

/** release-retire.mjs's own line when, at ExecStopPost, it read ExecMainStatus=0 and both lines and recorded RETIRED. */
function recordedRetired(message, label, releaseKey) {
  let line;
  try { line = JSON.parse(message); } catch { return false; }
  return line !== null && typeof line === 'object' && line.event === 'PREVIEW_RELEASE_STOP_RECORDED' && line.service === 'runner'
    && line.label === label && line.releaseKey === releaseKey && line.recorded === 'RETIRED';
}

/**
 * The runner's last run, from the journal, for a stopped template instance systemd has unloaded (normal after a clean
 * exit: `systemctl show` then prints defaults with an empty InvocationID). Trusted fields only decide whose line it is:
 * the unit's own output is `_SYSTEMD_UNIT=<unit>` with `_SYSTEMD_INVOCATION_ID`; PID 1's messages about it are `_PID=1`
 * with `UNIT=<unit>` and `INVOCATION_ID`. The newest entry names the last run (an entry that is neither refuses); within
 * that run: no failure message, PID 1's UNIT_SUCCESS, both retirement lines, and the stop recorder's RETIRED line written
 * as root (`_UID=0`: it read ExecMainStatus=0 from systemd while the unit was still loaded, the exit status 0 PID 1 does
 * not log). A field that is absent, null (too long) or bytes (not UTF-8) counts as absent; whatever cannot prove a
 * clean end refuses. Returns that run's invocation id.
 */
async function journalEvidence(unit, label, releaseKey, layout, io) {
  const result = await io.run([layout.journalctl, '-u', unit, '-n', JOURNAL_ENTRIES, '-o', 'json', `--output-fields=${JOURNAL_FIELDS}`, '-q', '--no-pager'],
    { env: {}, timeoutMs: 10_000, maxOutputBytes: JOURNAL_JSON_BYTES });
  if (!result || result.error || result.timedOut || result.overflow || result.code !== 0) refuse('RECEIPT_JOURNAL_UNREADABLE');
  const entries = [];
  for (const line of String(result.stdout).split('\n')) {
    if (line === '') continue;
    let entry;
    try { entry = JSON.parse(line); } catch { refuse('RECEIPT_JOURNAL_UNREADABLE'); }
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) refuse('RECEIPT_JOURNAL_UNREADABLE');
    entries.push(entry);
  }
  const text = (entry, name) => (typeof own(entry, name) === 'string' ? entry[name] : undefined);
  const fromUnit = entry => text(entry, '_SYSTEMD_UNIT') === unit;
  const fromPid1 = entry => text(entry, '_PID') === '1' && text(entry, 'UNIT') === unit;
  const invocationOf = entry => (fromUnit(entry) ? text(entry, '_SYSTEMD_INVOCATION_ID') : fromPid1(entry) ? text(entry, 'INVOCATION_ID') : undefined);
  const invocationId = entries.length ? invocationOf(entries.at(-1)) : undefined;
  if (!INVOCATION_ID.test(invocationId ?? '')) refuse('RECEIPT_RUNNER_INVOCATION_UNKNOWN');
  const run = entries.filter(entry => invocationOf(entry) === invocationId);
  const output = run.filter(fromUnit), lifecycle = run.filter(fromPid1);
  const failed = lifecycle.find(entry => UNIT_FAILURE_MESSAGE_IDS.includes(text(entry, 'MESSAGE_ID'))
    || (text(entry, 'MESSAGE_ID') === UNIT_PROCESS_EXIT_MESSAGE_ID && (text(entry, 'EXIT_CODE') !== 'exited' || text(entry, 'EXIT_STATUS') !== '0')));
  if (failed) refuse('RECEIPT_RUNNER_NOT_CLEAN', { source: 'journal', messageId: text(failed, 'MESSAGE_ID') });
  if (!lifecycle.some(entry => text(entry, 'MESSAGE_ID') === UNIT_SUCCESS_MESSAGE_ID)) refuse('RECEIPT_RUNNER_NOT_CLEAN', { source: 'journal', missing: 'UNIT_SUCCESS' });
  if (!retiredLinesFound(output.map(entry => text(entry, 'MESSAGE')).filter(message => message !== undefined).join('\n'), releaseKey)) refuse('RECEIPT_RETIRED_LINES_MISSING');
  if (!output.some(entry => text(entry, '_UID') === '0' && recordedRetired(text(entry, 'MESSAGE'), label, releaseKey))) refuse('RECEIPT_RUNNER_NOT_CLEAN', { source: 'journal', missing: 'STOP_RECORDED' });
  return invocationId;
}

/**
 * Side-by-side spec §4 and G4: the receipt of a release that retired by itself. Written only when every part holds:
 * the release is RETIRED after a switch made it DRAINING; its runner's last invocation ended cleanly and printed both
 * retirement lines; no debateai-preview-alert@ run for that runner since the switch. `systemctl show` is the first
 * source (an InvocationID, Result=success, ExecMainStatus=0, then that invocation's lines); when systemd has unloaded
 * the instance (an empty InvocationID) the journal is (journalEvidence). The receipt says which (`evidence`).
 */
export async function writeRetirementReceipt({ label, out, layout = LAYOUT, deps = {} }) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  const io = withDefaults(layout, deps);
  const { lock } = await io.readLock(layout);
  const release = own(lock.releases, label) ?? refuse('RELEASE_LOCK_RELEASE_MISSING');
  const releaseKey = release.releaseKey;
  const { state } = await io.readReleaseState({ releaseKey });
  if (state !== 'RETIRED') refuse('RECEIPT_NOT_RETIRED', { state });
  const events = await io.readReleaseEvents({ releaseKey });
  const retired = events.filter(event => event.kind === 'RETIRED').at(-1);
  const retiredIndex = events.lastIndexOf(retired);
  const drained = events.slice(0, retiredIndex).filter(event => event.kind === 'DRAINING').at(-1);
  const switchedAt = Date.parse(drained?.recordedAt ?? '');
  if (!retired || !Number.isFinite(switchedAt)) refuse('RECEIPT_NO_SWITCH');

  const unit = unitNameFor(layout, 'runner', label);
  const shown = await showUnit(unit, ['Result', 'ExecMainStatus', 'InvocationID'], layout, io);
  // A unit systemd has forgotten reads Result=success and ExecMainStatus=0 by default and an empty InvocationID: its
  // evidence comes from the journal. Any other InvocationID must be a well-formed one.
  const forgotten = shown.InvocationID === '';
  if (!forgotten && !INVOCATION_ID.test(shown.InvocationID)) refuse('RECEIPT_RUNNER_INVOCATION_UNKNOWN');
  if (shown.Result !== 'success' || !EXIT_STATUS.test(shown.ExecMainStatus) || shown.ExecMainStatus !== '0') refuse('RECEIPT_RUNNER_NOT_CLEAN', { result: shown.Result, execMainStatus: shown.ExecMainStatus });
  let invocationId = shown.InvocationID;
  if (forgotten) {
    invocationId = await journalEvidence(unit, label, releaseKey, layout, io);
  } else {
    const journal = await io.run([layout.journalctl, '-u', unit, `_SYSTEMD_INVOCATION_ID=${invocationId}`, '-n', '500', '-o', 'cat', '--no-pager'], { env: {}, timeoutMs: 10_000, maxOutputBytes: 1024 * 1024 });
    if (!journal || journal.error || journal.timedOut || journal.overflow || journal.code !== 0) refuse('RECEIPT_JOURNAL_UNREADABLE');
    if (!retiredLinesFound(String(journal.stdout), releaseKey)) refuse('RECEIPT_RETIRED_LINES_MISSING');
  }
  // OnFailure=debateai-preview-alert@%n.service: any journal line of that instance since the switch is a run of it.
  const alertUnit = `${layout.unitPrefix}alert@${unit}.service`;
  const alerts = await io.run([layout.journalctl, '-u', alertUnit, `--since=@${Math.floor(switchedAt / 1000)}`, '-q', '-o', 'cat', '--no-pager'], { env: {}, timeoutMs: 10_000, maxOutputBytes: 64 * 1024 });
  if (!alerts || alerts.error || alerts.timedOut || alerts.overflow || alerts.code !== 0) refuse('RECEIPT_JOURNAL_UNREADABLE');
  if (String(alerts.stdout).trim() !== '') refuse('RECEIPT_ALERT_SENT');

  const receipt = {
    schema: RECEIPT_SCHEMA, label, releaseKey, switchedAt: new Date(switchedAt).toISOString(), retiredAt: retired.recordedAt, retiredReason: retired.reason,
    runner: { unit, invocationId, evidence: forgotten ? 'journal' : 'systemd', result: 'success', execMainStatus: 0, retiredLines: true },
    alertRunsSinceSwitch: 0, writtenAt: new Date(io.now()).toISOString()
  };
  const text = `${JSON.stringify(receipt)}\n`;
  await io.writeReceipt(out, Buffer.from(text, 'utf8'));
  return Object.freeze({ event: 'PREVIEW_RELEASE_RECEIPT_WRITTEN', label, releaseKey, out, sha256: sha256(text) });
}

/** Side-by-side spec §4: Hatchet, Postgres and the gates are shared, so no infrastructure maintenance while a release drains. */
export async function maintenanceAllowed({ layout = LAYOUT, deps = {} }) {
  const io = withDefaults(layout, deps);
  const { lock } = await io.readLock(layout);
  const releases = [];
  for (const [label, release] of Object.entries(lock.releases)) releases.push(Object.freeze({ label, state: (await io.readReleaseState({ releaseKey: release.releaseKey })).state }));
  const draining = releases.filter(release => release.state === 'DRAINING').map(release => release.label);
  if (draining.length) refuse('MAINTENANCE_REFUSED_DRAINING', { labels: draining });
  return Object.freeze({ event: 'PREVIEW_MAINTENANCE_ALLOWED', releases: Object.freeze(releases) });
}

/** Exact argv shapes only; a label or path that is not one refuses before anything is read. */
function parseArguments(argv) {
  const n = argv.length;
  const [a, b, c, d, e, f, g] = argv;
  if (n === 1 && (a === 'status' || a === 'maintenance')) return { command: a };
  if (n === 5 && a === 'receipt' && b === '--label' && isLabel(c) && d === '--out' && absolute(e)) return { command: a, label: c, out: e };
  if (n >= 7 && a === 'check' && b === '--label' && isLabel(c) && d === '--older-manifest' && absolute(e) && f === '--newer-manifest' && absolute(g)) {
    const rest = argv.slice(7);
    let gateRowsReviewed = null;
    if (rest[0] === '--gate-rows-reviewed') {
      if (!HASH.test(rest[1] ?? '')) refuse('ARGUMENTS_REFUSED');
      gateRowsReviewed = rest[1];
      rest.splice(0, 2);
    }
    const lifecycleReviewed = rest[0] === '--lifecycle-reviewed';
    if (lifecycleReviewed) rest.shift();
    if (rest.length === 0) return { command: a, label: c, older: e, newer: g, gateRowsReviewed, lifecycleReviewed };
  }
  return refuse('ARGUMENTS_REFUSED');
}
const FAILED_EVENT = Object.freeze({ check: 'PREVIEW_RELEASE_CHECK_REFUSED', status: 'PREVIEW_RELEASE_STATUS_REFUSED', receipt: 'PREVIEW_RELEASE_RECEIPT_REFUSED', maintenance: 'PREVIEW_MAINTENANCE_REFUSED' });

/** One JSON line per run: the result on stdout (exit 0, or 2 for a verdict other than SIDE_BY_SIDE), or one refusal on stderr (exit 1). */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    if (args.command === 'check') {
      const io = withDefaults(layout, deps);
      const read = async path => { try { return await io.readManifest(path); } catch { return refuse('MANIFEST_UNREADABLE'); } };
      const result = await releaseCheck({ label: args.label, olderManifest: await read(args.older), newerManifest: await read(args.newer),
        gateRowsReviewed: args.gateRowsReviewed, lifecycleReviewed: args.lifecycleReviewed, layout, deps });
      logLine(stdout, result);
      return result.verdict === 'SIDE_BY_SIDE' ? 0 : 2;
    }
    const result = args.command === 'status' ? Object.freeze({ event: 'PREVIEW_RELEASE_STATUS', releases: await releaseStatus({ layout, deps }) })
      : args.command === 'receipt' ? await writeRetirementReceipt({ label: args.label, out: args.out, layout, deps })
        : await maintenanceAllowed({ layout, deps });
    logLine(stdout, result);
    return 0;
  } catch (error) {
    logLine(stderr, { event: args ? FAILED_EVENT[args.command] : 'PREVIEW_RELEASE_CHECK_REFUSED', ...(args?.label ? { label: args.label } : {}), reason: codeOf(error), ...(error instanceof CheckRefusal && error.fields ? { fields: error.fields } : {}) });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
