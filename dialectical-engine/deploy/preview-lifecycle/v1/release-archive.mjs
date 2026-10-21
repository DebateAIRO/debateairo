// Move a retired release aside, on the owner's yes (side-by-side spec §10 "Cleanup", §12 step 15). Root only.
//
// Plain words: once an old release has retired and is no longer needed for going back, its folders and files are
// moved into two root-only archive folders, one for the code and builds, one for its /etc files and unit drop-ins.
// Nothing is ever deleted or copied: every move is one rename on the same disk, so it is instant and can be undone by
// moving the folder back. Then the release is dropped from the release lock and systemd reloads its unit files.
//
//   release-archive.mjs archive --label <label>
//
// It refuses (ARCHIVE_REFUSED, with the fields that failed) unless the release table calls the release RETIRED, it is
// not the release that serves the site, none of its three instances (api@, ui@, runner@) nor its two retirement timers
// is active or enabled, and neither archive folder for this run exists yet. It refuses ARCHIVE_CROSS_DEVICE before
// moving anything when a source sits on another disk than its archive folder (a rename cannot cross disks, and a
// half-moved release is worse than none). A source that is not there is skipped and listed. One JSON line per run.
import { chmod, chown, lstat, mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LAYOUT, RELEASE_LABEL, currentDirFor, databaseAheadPathFor, ensureDirectory, envPathFor, logLine, nativePlanPathFor, runBounded, unitNameFor } from './common.mjs';
import { RELEASES_ROOT, readLock, unpinRelease } from './prestart.mjs';
import { readCurrentRelease, readReleaseState } from './release-table.mjs';

const SERVICES = Object.freeze(['api', 'ui', 'runner']);
const RELEASE_KINDS = Object.freeze(['candidate', 'fallback']);
const UNIT_SHOW = Object.freeze(['LoadState', 'ActiveState', 'UnitFileState']);
const ACTIVE_STATES = Object.freeze(['active', 'reloading', 'activating', 'deactivating', 'maintenance', 'refreshing']);
const STOPPED_STATES = Object.freeze(['inactive', 'failed']);
/** systemd's unit-file states that start the unit at boot or on a trigger; the archive refuses any of them. */
const ENABLED_STATES = Object.freeze(['enabled', 'enabled-runtime', 'linked', 'linked-runtime', 'alias', 'generated', 'transient']);
/** The states that never start it by themselves; an empty value is a unit systemd has no file for. */
const NOT_ENABLED_STATES = Object.freeze(['disabled', 'static', 'indirect', 'masked', 'masked-runtime', '']);

class ArchiveRefusal extends Error {
  constructor(code, details) { super(code); this.name = 'ArchiveRefusal'; this.code = code; if (details) Object.assign(this, details); }
}
const refuse = (code, details) => { throw new ArchiveRefusal(code, details); };
const isLabel = value => typeof value === 'string' && RELEASE_LABEL.test(value);
const unitDirOf = layout => layout.systemdUnitDir ?? '/etc/systemd/system';
/** prestart.mjs RELEASES_ROOT on the server; a test layout may point it elsewhere. */
const releasesRootOf = layout => layout.releasesRoot ?? RELEASES_ROOT;
/** The UTC second of the run, `YYYYMMDDTHHMMSSZ`, as in the nightly backup's file names. */
const utcStamp = ms => new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';

/** The release's units the archive requires stopped and not enabled: its three instances and both retirement timers. */
export function unitsOf(layout, label) {
  return Object.freeze([
    ...SERVICES.map(service => unitNameFor(layout, service, label)),
    `${layout.unitPrefix}runner-retire@${label}.timer`,
    `${layout.unitPrefix}runner-retire-check@${label}.timer`
  ]);
}

/**
 * Every path the archive moves, in order. To the code archive: the six release folders, the release's artifacts folder
 * and its lifecycle-current folder. To the config archive: the three env files, the database-check plan, the
 * database-ahead file, the three instance drop-in folders and the two retirement timers' drop-in folders.
 */
export function sourcesOf(layout, label) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  const unitDir = unitDirOf(layout);
  return Object.freeze({
    code: Object.freeze([
      ...RELEASE_KINDS.flatMap(kind => SERVICES.map(service => `${releasesRootOf(layout)}/auth-dev-${kind}-${label}-${service}`)),
      `${layout.artifactsRoot}/auth-dev-${label}`,
      currentDirFor(layout, label)
    ]),
    config: Object.freeze([
      ...SERVICES.map(service => envPathFor(layout, service, label)),
      nativePlanPathFor(layout, label),
      databaseAheadPathFor(layout, label),
      ...unitsOf(layout, label).map(unit => `${unitDir}/${unit}.d`)
    ])
  });
}

/** The dependencies with the server's defaults; tests replace them. */
function withDefaults(layout, deps) {
  const run = deps.run ?? runBounded;
  return {
    run,
    lstat: deps.lstat ?? (path => lstat(path)),
    rename: deps.rename ?? ((from, to) => rename(from, to)),
    readLock: deps.readLock ?? readLock,
    readReleaseState: deps.readReleaseState ?? (input => readReleaseState({ ...input, layout, run })),
    readCurrentRelease: deps.readCurrentRelease ?? (() => readCurrentRelease({ layout, run })),
    unpinRelease: deps.unpinRelease ?? unpinRelease
  };
}

/** The lstat of `path`, or null when it is not there; any other error refuses. */
async function present(path, io) {
  try { return await io.lstat(path); } catch (error) { return error?.code === 'ENOENT' ? null : refuse('ARCHIVE_SOURCE_UNREADABLE'); }
}

/** `systemctl show` of the three properties, each exactly once; the problems as fields (`active:<unit>`, `enabled:<unit>`). */
async function unitProblems(unit, layout, io) {
  const result = await io.run([layout.systemctl, 'show', unit, `--property=${UNIT_SHOW.join(',')}`, '--no-pager'], { env: {}, timeoutMs: 5000, maxOutputBytes: 4096 });
  if (!result || result.timedOut || result.overflow || result.error || result.code !== 0) refuse('UNIT_STATE_UNREADABLE');
  const shown = {};
  for (const line of String(result.stdout).split('\n').filter(Boolean)) {
    const at = line.indexOf('=');
    const key = line.slice(0, at);
    if (at < 1 || !UNIT_SHOW.includes(key) || Object.hasOwn(shown, key)) refuse('UNIT_STATE_UNREADABLE');
    shown[key] = line.slice(at + 1);
  }
  if (Object.keys(shown).length !== UNIT_SHOW.length) refuse('UNIT_STATE_UNREADABLE');
  const { ActiveState: active, UnitFileState: file } = shown;
  if (![...ACTIVE_STATES, ...STOPPED_STATES].includes(active) || ![...ENABLED_STATES, ...NOT_ENABLED_STATES].includes(file)) refuse('UNIT_STATE_UNREADABLE');
  return [...(ACTIVE_STATES.includes(active) ? [`active:${unit}`] : []), ...(ENABLED_STATES.includes(file) ? [`enabled:${unit}`] : [])];
}

/** The disk an archive folder will live on: its own when it exists, else its parent's (where it will be made). */
async function deviceOfRoot(root, io) {
  const own = await present(root, io);
  if (own) return own.dev;
  const parent = await present(dirname(root), io);
  return parent ? parent.dev : refuse('ARCHIVE_DIRECTORY_REFUSED');
}

/** A new root-only (0700) folder; mkdir without `recursive` refuses one that appeared since the check. */
async function makeTarget(path, layout) {
  try {
    await mkdir(path, { mode: 0o700 });
    await chown(path, layout.ownerUid ?? 0, layout.ownerGid ?? 0);
    await chmod(path, 0o700);
  } catch { refuse('ARCHIVE_DIRECTORY_REFUSED'); }
}

/**
 * The archive (D12). Every check runs before the first move; then each present source is renamed into its archive
 * folder under its own name, the release is unpinned (prestart.mjs unpinRelease re-checks RETIRED) and systemd
 * reloads. A move, the unpin or the reload failing after the first move refuses with what did move and where it went
 * (`moved`, `to`, `configTo`), so the owner can finish by hand or run the archive again: a second run takes a new stamp,
 * moves what is left and skips what already went.
 */
export async function archiveRelease({ label, layout = LAYOUT, deps = {}, now = Date.now }) {
  if (!isLabel(label)) refuse('ARGUMENTS_REFUSED');
  const io = withDefaults(layout, deps);
  const { lock } = await io.readLock(layout);
  const release = Object.hasOwn(lock.releases, label) ? lock.releases[label] : refuse('RELEASE_LOCK_RELEASE_MISSING');
  const { releaseKey } = release;

  const fields = [];
  const { state } = await io.readReleaseState({ releaseKey });
  if (state !== 'RETIRED') fields.push('state');
  const current = await io.readCurrentRelease();
  if (current?.releaseKey === releaseKey) fields.push('current');
  for (const unit of unitsOf(layout, label)) fields.push(...await unitProblems(unit, layout, io));
  const stamp = utcStamp(now());
  const to = `${layout.archiveRoot}/${label}-${stamp}`;
  const configTo = `${layout.configArchiveRoot}/${label}-config-${stamp}`;
  if (await present(to, io)) fields.push('to');
  if (await present(configTo, io)) fields.push('configTo');
  if (fields.length) refuse('ARCHIVE_REFUSED', { fields });

  const sources = sourcesOf(layout, label);
  const plan = [], skipped = [], crossing = [];
  for (const [list, root, target] of [[sources.code, layout.archiveRoot, to], [sources.config, layout.configArchiveRoot, configTo]]) {
    const device = await deviceOfRoot(root, io);
    for (const source of list) {
      const stat = await present(source, io);
      if (!stat) { skipped.push(source); continue; }
      if (stat.dev !== device) crossing.push(source);
      plan.push([source, join(target, basename(source))]);
    }
  }
  if (crossing.length) refuse('ARCHIVE_CROSS_DEVICE', { fields: crossing });

  const uid = layout.ownerUid ?? 0;
  for (const root of [layout.archiveRoot, layout.configArchiveRoot]) await ensureDirectory(root, { mode: 0o700, uid }).catch(() => refuse('ARCHIVE_DIRECTORY_REFUSED'));
  await makeTarget(to, layout);
  await makeTarget(configTo, layout);
  const moved = [];
  for (const [source, target] of plan) {
    try { await io.rename(source, target); } catch { refuse('ARCHIVE_MOVE_FAILED', { moved, to, configTo }); }
    moved.push(source);
  }
  let lockSha256;
  try {
    ({ lockSha256 } = await io.unpinRelease({ label, layout, deps: { readReleaseState: io.readReleaseState } }));
  } catch { refuse('ARCHIVE_UNPIN_FAILED', { moved, to, configTo }); }
  const reload = await io.run([layout.systemctl, 'daemon-reload'], { env: {}, timeoutMs: 90_000, maxOutputBytes: 4096 });
  if (!reload || reload.timedOut || reload.overflow || reload.error || reload.code !== 0) refuse('DAEMON_RELOAD_FAILED', { moved, to, configTo });
  return Object.freeze({ event: 'PREVIEW_RELEASE_ARCHIVED', label, releaseKey, to, configTo, moved: Object.freeze(moved), skipped: Object.freeze(skipped), lockSha256 });
}

/** Exact argv shape only; a label that is not a release label refuses before any path, unit or database is touched. */
function parseArguments(argv) {
  if (argv.length === 3 && argv[0] === 'archive' && argv[1] === '--label' && isLabel(argv[2])) return { label: argv[2] };
  return refuse('ARGUMENTS_REFUSED');
}
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** One JSON line per run; 0 on success, 1 on any refusal. */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = LAYOUT, deps = {}, now = Date.now, stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    logLine(stdout, await archiveRelease({ label: args.label, layout, deps, now }));
    return 0;
  } catch (error) {
    const details = error instanceof ArchiveRefusal
      ? { ...(error.fields ? { fields: error.fields } : {}), ...(error.moved ? { moved: error.moved, to: error.to, configTo: error.configTo } : {}) }
      : {};
    logLine(stderr, { event: 'PREVIEW_RELEASE_ARCHIVE_REFUSED', ...(args ? { label: args.label } : {}), reason: typeof error?.code === 'string' && CODE.test(error.code) ? error.code : 'UNEXPECTED', ...details });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
