// Root's release tool on the public server (side-by-side spec §4, §6, §10, §11, §12; plan D16b). Linux, Node, run as
// root: by the operator, by the units' ExecStartPre=+/ExecStopPost=+ hooks and by the two retirement timers, always
// through `/usr/bin/env -i PATH=…` so nothing from a service's environment reaches it (deploy/vps/systemd/*@.service).
//
// Plain words: the public server swaps releases exactly as the preview does. This file holds no release logic of its
// own: every command is the preview's own function (deploy/preview-lifecycle/v1), called with common.mjs's VPS_LAYOUT:
// this server's units (debateai-<service>@<label>), PostgreSQL socket, slots (website 3001/3002, API 8790/8791), edge
// listener (127.0.0.1:3090) and Caddy's copy of the edge secret; no spending gates and no notice unit; each release's
// key and slot from its own overlay /etc/debateai/releases/<label>/api.env (release-info.mjs); the current release's
// instances enabled at boot (the switch enables the new three and disables the old pair; the stop recorder disables a
// retired runner). It runs from the operator checkout /opt/debateai/dialectical-engine, never from a release folder.
//
//   release.mjs may-start --service api|ui|runner --label <label>   ExecStartPre=+ of the three units (release-retire.mjs)
//   release.mjs stopped --service api|runner --label <label>        ExecStopPost=+ of api@ and runner@ (release-retire.mjs)
//   release.mjs retire-request --label <label>                      debateai-runner-retire@<label>.service (release-retire.mjs)
//   release.mjs retire-check --label <label>                        debateai-runner-retire-check@<label>.service (release-retire.mjs)
//   release.mjs mark-retired --label <old>                          the drained upgrade only, after its switch (release-retire.mjs)
//   release.mjs stage --label <new>                                 (release-switch.mjs)
//   release.mjs switch --to <new> --from <current> [--old-pair-stopped]   (release-switch.mjs)
//   release.mjs switch --finish --to <new> --from <old>             (release-switch.mjs)
//   release.mjs switch --to <first>                                 the first release only: no current release yet
//   release.mjs rollback --to <older> --from <newer>                (release-switch.mjs)
//   release.mjs rollback --before-switch --label <new>              (release-switch.mjs)
//   release.mjs check --label <new>                                 read-only: may <new> start beside the current one (release-check.mjs)
//   release.mjs status                                              every release: state, units, open work (release-check.mjs)
//
// `check` compares the two release folders' own migrations: the current release's (the release table names its key,
// its overlay its label) and the new one's, /opt/debateai/releases/<label>/dialectical-engine/migrations, each file
// read as root holds it (root-owned 0644, no link). `mark-retired` (final fix wave S2) ends a drained upgrade
// (README §5 "A drained upgrade"): the older runner was stopped with nothing open, the switch ran with
// --old-pair-stopped, and the older release is marked RETIRED (reason DRAINED), its timers turned off and its runner
// instance disabled. The preview's other commands (seed, receipt, maintenance) are not this server's and are refused. One JSON line per run, exit codes as the called tool's: 0 done;
// 2 a check verdict other than SIDE_BY_SIDE, or a switch whose later step failed (`bad`); 1 a refusal.
import { lstat, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withPrivateBytes } from '../preview-auth-dev/v1/custody.mjs';
import { RELEASE_LABEL, VPS_LAYOUT, ensureDirectory, logLine, runBounded, sha256 } from '../preview-lifecycle/v1/common.mjs';
import { releaseCheck, main as checkMain } from '../preview-lifecycle/v1/release-check.mjs';
import { releaseInfos } from '../preview-lifecycle/v1/release-info.mjs';
import { main as retireMain } from '../preview-lifecycle/v1/release-retire.mjs';
import { acquireSwitchLock, main as switchMain } from '../preview-lifecycle/v1/release-switch.mjs';
import { readCurrentRelease } from '../preview-lifecycle/v1/release-table.mjs';

/** Which preview tool runs each of this server's commands; any other first word is refused. */
export const COMMANDS = Object.freeze({
  'may-start': 'retire', stopped: 'retire', 'retire-request': 'retire', 'retire-check': 'retire', 'mark-retired': 'retire',
  stage: 'switch', switch: 'switch', rollback: 'switch',
  check: 'check', status: 'check'
});
/** A migration step in a release folder (migration-steps.mjs MIGRATION_FILE's file name). */
const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const MAX_MIGRATION_BYTES = 16 * 1024 * 1024;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

class ReleaseToolRefusal extends Error { constructor(code) { super(code); this.name = 'ReleaseToolRefusal'; this.code = code; } }
const refuse = code => { throw new ReleaseToolRefusal(code); };
const codeOf = error => (typeof error?.code === 'string' && CODE.test(error.code) ? error.code : 'UNEXPECTED');

/**
 * A release folder's migrations as a source manifest for release-check.mjs: `{ sourceRoot, uid, files }`, one row per
 * step (`dialectical-engine/migrations/<name>`, its sha256 and mode). Each file is read as root holds it (owner
 * layout.ownerUid, 0644, no link, every folder up to the release folder root's and not group- or world-writable);
 * anything else refuses MIGRATION_UNREADABLE. The check reads the new steps again, by these digests, for their n1 lines.
 */
export async function folderManifest(layout, label) {
  if (typeof label !== 'string' || !RELEASE_LABEL.test(label)) refuse('ARGUMENTS_REFUSED');
  const sourceRoot = `${layout.releasesRoot}/${label}`;
  const folder = join(sourceRoot, 'dialectical-engine', 'migrations');
  const uid = layout.ownerUid ?? 0;
  const files = [];
  try {
    const stat = await lstat(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('folder');
    for (const name of (await readdir(folder)).filter(entry => MIGRATION_NAME.test(entry)).sort()) {
      const digest = await withPrivateBytes(join(folder, name), { root: sourceRoot, uid, mode: 0o644, maxBytes: MAX_MIGRATION_BYTES }, raw => sha256(raw));
      files.push(Object.freeze({ path: `dialectical-engine/migrations/${name}`, sha256: digest, mode: 0o644 }));
    }
  } catch { refuse('MIGRATION_UNREADABLE'); }
  return Object.freeze({ sourceRoot, uid, files: Object.freeze(files) });
}

/**
 * `check --label <new>`: the current release (the release table's current key, found among the overlays) against the
 * new one, by release-check.mjs's releaseCheck with this server's layout. No current release (before the first
 * release's switch): NO_CURRENT_RELEASE; a current key no overlay names: CURRENT_NOT_PINNED.
 */
async function check(label, layout, deps) {
  const run = deps.run ?? runBounded;
  const current = await (deps.readCurrentRelease ?? (() => readCurrentRelease({ layout, run })))();
  if (current === null) refuse('NO_CURRENT_RELEASE');
  const releases = await releaseInfos({ layout, deps });
  const older = Object.keys(releases).filter(name => releases[name].releaseKey === current.releaseKey);
  if (older.length !== 1) refuse('CURRENT_NOT_PINNED');
  const olderManifest = await folderManifest(layout, older[0]);
  const newerManifest = await folderManifest(layout, label);
  return releaseCheck({ label, olderManifest, newerManifest, gateRowsReviewed: null, lifecycleReviewed: false, layout, deps });
}

/**
 * The switch family's lock lives in this server's lock folder, root's and 0700, created on first use: only after the
 * switch tool has accepted the arguments and the actor (it takes the lock after both), never before.
 */
const lockInOwnFolder = layout => async (path, tool) => {
  await ensureDirectory(dirname(path), { mode: 0o700, uid: layout.ownerUid ?? 0 });
  return acquireSwitchLock(path, tool);
};

/** One JSON line per run; the exit code is the called tool's (0, 1 or 2), or 1 for a refusal here. */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), layout = VPS_LAYOUT, deps = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  const tool = Array.isArray(argv) && Object.hasOwn(COMMANDS, argv[0] ?? '') ? COMMANDS[argv[0]] : null;
  const context = { platform, uid, layout, stdout, stderr };
  if (tool === 'retire') return retireMain(argv, { ...context, deps });
  if (tool === 'switch') return switchMain(argv, { ...context, deps: { acquireLock: lockInOwnFolder(layout), ...deps } });
  if (tool === 'check' && argv[0] === 'status') return checkMain(argv, { ...context, deps });
  const label = argv?.[0] === 'check' && argv.length === 3 && argv[1] === '--label' && typeof argv[2] === 'string' && RELEASE_LABEL.test(argv[2]) ? argv[2] : null;
  try {
    if (label === null) refuse('ARGUMENTS_REFUSED');
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    const result = await check(label, layout, deps);
    logLine(stdout, result);
    return result.verdict === 'SIDE_BY_SIDE' ? 0 : 2;
  } catch (error) {
    logLine(stderr, { event: tool === 'check' ? 'PREVIEW_RELEASE_CHECK_REFUSED' : 'RELEASE_COMMAND_REFUSED', ...(label ? { label } : {}), reason: codeOf(error), ...(error?.fields ? { fields: error.fields } : {}) });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
