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
 */
export const LAYOUT = Object.freeze({
  lockRoot: '/etc/debateai-v3-preview/lifecycle',
  lockPath: '/etc/debateai-v3-preview/lifecycle/release-lock.json',
  alertRecipientPath: '/etc/debateai-v3-preview/lifecycle/alert-recipient',
  // The preview mail's recipient allow-list (deploy/preview-mail/v4-20261005), root-owned server data.
  mailRecipientInstallationPath: '/etc/debateai/preview-mail-recipient-installation.json',
  nativePlanRoot: '/etc/debateai-v3-preview/auth-dev-v1',
  nativePlanPath: '/etc/debateai-v3-preview/auth-dev-v1/native-plan.json',
  // The reviewed launchers accept a plan only below /opt/debateai-v3-preview/artifacts/<id>/,
  // so the regenerated plan and fresh attestation live in this one fixed artifact folder.
  currentDir: '/opt/debateai-v3-preview/artifacts/lifecycle-current',
  stateDir: '/var/lib/debateai-v3-preview/lifecycle',
  backupDir: '/var/backups/debateai-v3-preview',
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
  mailFrom: 'noreply@dezbatere.ro'
});

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fail = code => { throw Object.assign(new Error(code), { code }); };

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
