// Shared helpers for the preview lifecycle operator. Node built-ins only: this file is
// installed in the root-owned operator directory, which has no node_modules of its own.
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { chmod, chown, lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';

/**
 * Server layout of the private preview host. These are the fixed locations the reviewed
 * preview operator already uses on that server; nothing here names a contributor machine.
 * Fields the release tools fall back on when a layout leaves them out (the slots, the edge, Caddy's copy of the edge
 * secret, Hatchet's units, the operator folders) keep their preview values in the module that reads them.
 */
export const LAYOUT = Object.freeze({
  lockRoot: '/etc/debateai-v3-preview/lifecycle',
  lockPath: '/etc/debateai-v3-preview/lifecycle/release-lock.json',
  alertRecipientPath: '/etc/debateai-v3-preview/lifecycle/alert-recipient',
  // The alert's own owner list: SHA-256 fingerprints of the owner addresses the alert may reach.
  // Root-only server data, built on the server by `alert.mjs --install-owner-list`.
  ownerAlertDigestsPath: '/etc/debateai-v3-preview/lifecycle/owner-alert-digests.json',
  // Per-release files live in these roots (side-by-side spec §10): native-plan-<label>.json,
  // database-ahead-<label>.json and <service>-<label>.env here; see nativePlanPathFor and friends.
  nativePlanRoot: '/etc/debateai-v3-preview/auth-dev-v1',
  // The reviewed launchers accept a plan only below /opt/debateai-v3-preview/artifacts/<id>/, so each
  // release's regenerated plan and fresh attestation live in its own lifecycle-current-<label> folder.
  artifactsRoot: '/opt/debateai-v3-preview/artifacts',
  // Template units: debateai-preview-<service>@<label>.service (instance names keep their dashes, %i).
  unitPrefix: 'debateai-preview-',
  stateDir: '/var/lib/debateai-v3-preview/lifecycle',
  backupDir: '/var/backups/debateai-v3-preview',
  // A retired release is moved aside, never deleted (side-by-side spec §10, release-archive.mjs): its folders below
  // archiveRoot (same disk as the releases), its /etc files and unit drop-ins below configArchiveRoot (same disk as /etc).
  archiveRoot: '/opt/debateai-v3-preview/archive',
  configArchiveRoot: '/root/preview-archive',
  postgresCa: '/etc/debateai-v3-preview/postgres-tls/ca.crt',
  peerModule: '/opt/debateai-v3-preview/operator/recovery106-v1/native-common106.mjs',
  pgBin: '/usr/lib/postgresql/18/bin',
  pgSocketDir: '/run/debateai-v3-preview/postgresql',
  pgPort: 5434,
  database: 'debateai',
  sh: '/bin/sh',
  env: '/usr/bin/env',
  runuser: '/usr/sbin/runuser',
  setpriv: '/usr/bin/setpriv',
  sendmail: '/usr/sbin/sendmail',
  journalctl: '/usr/bin/journalctl',
  systemctl: '/usr/bin/systemctl',
  getent: '/usr/bin/getent',
  id: '/usr/bin/id',
  // Exactly the packet the reviewed root actors hand to the postgres-peer channel on FD3.
  peerPacket: '{"peerUrl":"postgresql://postgres@localhost/debateai?host=/run/debateai-v3-preview/postgresql&port=5434"}',
  mailFrom: 'noreply@dezbatere.ro',
  // What the release tools read per layout (side-by-side plan D16b; VPS_LAYOUT below is the public server's):
  // where a release's key and slot come from (release-info.mjs: root's lock here), how the current release's pair
  // starts at boot (the target's drop-in, release-switch.mjs), the two spending gates (deploy/preview-gate/v3, named
  // and placed exactly as alert.mjs's re-open commands), the unit template that emails the owner a release notice
  // (`<template><kind>-<code>.service`, alert.mjs), the journal lines that prove a runner retired (the runner's own
  // keyed line and the launcher's), and the start lines root reads after a start (the launchers print them).
  releaseSource: 'lock',
  bootMode: 'target',
  gates: Object.freeze([
    Object.freeze({ name: 'deepinfra', folder: '/opt/debateai-v3-preview/operator/deepinfra-budget-v3', privateDir: '/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3', go: '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json' }),
    Object.freeze({ name: 'anthropic', folder: '/opt/debateai-v3-preview/operator/anthropic-budget-v1', privateDir: '/var/lib/debateai-v3-preview/provider-anthropic-authority-v1', go: '/etc/debateai-v3-preview/provider-anthropic-go-v1.json' })
  ]),
  noticeTemplate: 'debateai-preview-notice@',
  retiredLines: Object.freeze(['DEBATEAI_RUNNER_RETIRED', 'PREVIEW_RUNNER_RETIRED']),
  startedLines: Object.freeze({ runner: 'PREVIEW_RUNNER_STARTED', api: 'PREVIEW_API_STARTED' })
});

/**
 * Side-by-side spec §10, Phase 3 (plan D16b): the public server's layout, for deploy/vps/release.mjs. The same release
 * tools as the preview, with this server's units (`debateai-<service>@<label>`), PostgreSQL socket and port, slots,
 * edge listener and Caddy's copy of the edge secret (deploy/vps/Caddyfile). A release's key and slot come from its own
 * overlay, /etc/debateai/releases/<label>/api.env (RELEASE_KEY, API_PORT: release-info.mjs); its code is
 * /opt/debateai/releases/<label>. No spending gates and no notice unit on this server. The switch enables the new
 * release's three instances and disables the old API and website; the old runner stays enabled until its stop
 * recorder sees it retired and disables it. The runner runs without a launcher here: its own keyed retirement line
 * proves it retired, and its own ready line (DEBATEAI_RUNNER_READY) and the API's (DEBATEAI_API_READY) are its start lines.
 * The release tools' lock and maintenance flag live in lockRoot (root's, 0700; release.mjs creates it).
 */
export const VPS_LAYOUT = Object.freeze({
  releaseSource: 'overlay',
  releaseOverlayRoot: '/etc/debateai/releases',
  releasesRoot: '/opt/debateai/releases',
  lockRoot: '/etc/debateai/lifecycle',
  stateDir: '/var/lib/debateai/lifecycle',
  unitPrefix: 'debateai-',
  bootMode: 'enable',
  pgBin: '/usr/lib/postgresql/18/bin',
  pgSocketDir: '/var/run/postgresql',
  pgPort: 5432,
  database: 'debateai',
  gates: Object.freeze([]),
  edge: 'http://127.0.0.1:3090',
  edgeSecretPath: '/etc/debateai/ui-edge.caddy.secret',
  slots: Object.freeze({ A: Object.freeze({ uiPort: '3001', apiPort: '8790' }), B: Object.freeze({ uiPort: '3002', apiPort: '8791' }) }),
  retiredLines: Object.freeze(['DEBATEAI_RUNNER_RETIRED']),
  startedLines: Object.freeze({ runner: 'DEBATEAI_RUNNER_READY', api: 'DEBATEAI_API_READY' }),
  hatchetUnits: Object.freeze(['debateai-hatchet.service']),
  // The release tools run from the operator checkout here, never from a release folder (README §5).
  lifecycleFolders: Object.freeze([]),
  toolName: 'release.mjs',
  sh: '/bin/sh',
  env: '/usr/bin/env',
  runuser: '/usr/sbin/runuser',
  journalctl: '/usr/bin/journalctl',
  systemctl: '/usr/bin/systemctl'
});

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fail = code => { throw Object.assign(new Error(code), { code }); };

/**
 * Side-by-side spec §10: a release label names unit instances, /etc files and folders. Same text as
 * `RELEASE_LABEL` in deploy/preview-auth-dev/v1/launch-plan.mjs (kept here so this file stays
 * built-ins only); tests/unit/preview-lifecycle-prestart.test.ts pins the two equal.
 */
export const RELEASE_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,70}[a-z0-9])?$/;
const LIFECYCLE_SERVICES = Object.freeze(['api', 'ui', 'runner']);
const label = value => (typeof value === 'string' && RELEASE_LABEL.test(value) ? value : fail('LIFECYCLE_LABEL_REFUSED'));
const service = value => (LIFECYCLE_SERVICES.includes(value) ? value : fail('LIFECYCLE_SERVICE_REFUSED'));
/** The release's verify-only database-check plan (one per release; side-by-side spec §10). */
export const nativePlanPathFor = (layout, release) => `${layout.nativePlanRoot}/native-plan-${label(release)}.json`;
/** The release's own folder for the regenerated launch plan and fresh proof. */
export const currentDirFor = (layout, release) => `${layout.artifactsRoot}/lifecycle-current-${label(release)}`;
/** The newer release's list of database steps this (older) release may start beside (side-by-side spec §5). */
export const databaseAheadPathFor = (layout, release) => `${layout.nativePlanRoot}/database-ahead-${label(release)}.json`;
/** The release's env file for one service (launch-plan.mjs previewEnvironmentPath names the same file). */
export const envPathFor = (layout, name, release) => `${layout.nativePlanRoot}/${service(name)}-${label(release)}.env`;
/** The release's unit instance for one service. */
export const unitNameFor = (layout, name, release) => `${layout.unitPrefix}${service(name)}@${label(release)}.service`;

/** Sorted-key JSON: equal values always compare equal, whatever order they were written in. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** One compact JSON line per event, nothing else, so the journal stays greppable. */
export function logLine(stream, event) { stream.write(`${JSON.stringify(event)}\n`); }

function absolute(path) { return typeof path === 'string' && isAbsolute(path) && normalize(path) === path && !path.includes('\0'); }

/** Write next to the target, fsync, then rename: readers see the old bytes or the new bytes, never a mix. */
export async function atomicWrite(path, bytes, { mode, uid, gid }) {
  if (!absolute(path) || !Buffer.isBuffer(bytes) || !Number.isInteger(mode)) fail('LIFECYCLE_WRITE_REFUSED');
  const existing = await lstat(path).catch(error => (error.code === 'ENOENT' ? null : fail('LIFECYCLE_WRITE_REFUSED')));
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) fail('LIFECYCLE_WRITE_REFUSED');
  const temporary = join(dirname(path), `.${basename(path)}.${randomBytes(8).toString('hex')}.tmp`);
  let handle, created = false;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    created = true;
    if (uid !== undefined || gid !== undefined) await handle.chown(uid ?? -1, gid ?? -1);
    await handle.chmod(mode);
    for (let offset = 0; offset < bytes.length;) offset += (await handle.write(bytes, offset)).bytesWritten;
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(temporary, path); created = false;
    const folder = await open(dirname(path), constants.O_RDONLY);
    try { await folder.sync(); } catch { /* Some platforms refuse fsync on a directory; the rename itself is already atomic. */ } finally { await folder.close(); }
  } catch (error) {
    if (error?.code === 'LIFECYCLE_WRITE_REFUSED') throw error;
    fail('LIFECYCLE_WRITE_REFUSED');
  } finally {
    await handle?.close().catch(() => undefined);
    if (created) await unlink(temporary).catch(() => undefined);
  }
}

/** Create (if missing) and then require: a real directory, not a link, exact owner and exact mode. */
export async function ensureDirectory(path, { mode, uid }) {
  if (!absolute(path)) fail('LIFECYCLE_DIRECTORY_REFUSED');
  try {
    const before = await lstat(path).catch(error => (error.code === 'ENOENT' ? null : fail('LIFECYCLE_DIRECTORY_REFUSED')));
    if (before === null) {
      await mkdir(path, { mode });
      await chown(path, uid, -1);
      await chmod(path, mode);
    }
    const after = await lstat(path);
    if (!after.isDirectory() || after.isSymbolicLink() || after.uid !== uid || (after.mode & 0o777) !== mode || await realpath(path) !== path) fail('LIFECYCLE_DIRECTORY_REFUSED');
  } catch { fail('LIFECYCLE_DIRECTORY_REFUSED'); }
}

/**
 * Run a child in its own process group with a hard deadline and a hard output cap.
 * stdin is a Buffer (piped), an open file descriptor, or absent (/dev/null).
 * No shell is involved unless argv[0] is one. The whole group is killed on timeout or
 * overflow, and once more after exit so no grandchild outlives the call.
 */
export function runBounded(argv, { cwd, env = {}, stdin, stdoutFd, timeoutMs, maxOutputBytes, graceMs = 1000 }) {
  return new Promise(resolve => {
    const stdout = [], stderr = [];
    let size = 0, timedOut = false, overflow = false, settled = false, child, timer, killTimer;
    const killGroup = signal => { if (Number.isInteger(child?.pid)) { try { process.kill(-child.pid, signal); } catch { /* group already gone */ } } };
    const stop = () => { killGroup('SIGTERM'); killTimer = setTimeout(() => killGroup('SIGKILL'), graceMs); };
    const finish = (code, signal, error) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(killTimer); killGroup('SIGKILL');
      resolve({ code, signal, error, timedOut, overflow, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    };
    const collect = target => chunk => {
      if (overflow) return;
      if (size + chunk.length > maxOutputBytes) { overflow = true; target.push(chunk.subarray(0, Math.max(0, maxOutputBytes - size))); size = maxOutputBytes; stop(); return; }
      size += chunk.length; target.push(chunk);
    };
    try {
      const stdinMode = stdin === undefined ? 'ignore' : Number.isInteger(stdin) ? stdin : 'pipe';
      child = spawn(argv[0], argv.slice(1), { cwd, env, shell: false, detached: true, stdio: [stdinMode, stdoutFd ?? 'pipe', 'pipe'] });
    } catch (error) { finish(null, null, error); return; }
    child.once('error', error => finish(null, null, error));
    child.stdout?.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('close', (code, signal) => finish(code, signal));
    timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    if (Buffer.isBuffer(stdin)) { child.stdin.on('error', () => undefined); child.stdin.end(stdin); }
  });
}

/**
 * The reviewed postgres-peer reader expects the peer packet on a real pipe at FD3, exactly as
 * the root actors used with os.pipe(). /bin/sh builds that pipe; the actor's stdin stays the
 * caller's private channel (never argv or environment). The packet itself holds no secret.
 */
export const PEER_SHIM_SCRIPT = 'exec 5<&0; p=$1; shift; printf %s "$p" 5<&- | "$@" 3<&0 0<&5 5<&-';
export function peerShimArgv({ sh, packet, command }) {
  if (!absolute(sh) || typeof packet !== 'string' || !packet || !Array.isArray(command) || command.length < 1 || !command.every(part => typeof part === 'string')) fail('LIFECYCLE_PEER_COMMAND_REFUSED');
  return [sh, '-c', PEER_SHIM_SCRIPT, 'sh', packet, ...command];
}
