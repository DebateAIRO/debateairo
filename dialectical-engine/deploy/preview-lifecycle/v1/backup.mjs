// debateai-preview-backup.service (timer: nightly 03:15 Europe/Bucharest).
//
// Plain words: a nightly copy of the preview database, made by the postgres user over the
// server's own socket, kept in a root-only folder. Each copy is checked with pg_restore --list
// before it counts (that reads the archive's table of contents only; it does not restore the
// data); only after a good new copy are older ones removed, keeping the seven newest. The copy
// just written is never removed, and at least two copies always stay.
// This is a local safety net (for a bad change or a mistaken delete), not an off-site backup.
//
// The online backup (side-by-side spec §12 step 7), run by hand right before the migrations of a side-by-side upload:
//   backup.mjs --online <dir> --env <path> [--env <path>]
// Every database of the preview cluster (pg_dump custom format, each checked with pg_restore --list), the roles
// (pg_dumpall --globals-only), and the key stores the given env files name (one tar, checked with tar -tf), each file
// root-only 0600 and new, then their sums in sha256sum format. The services keep running throughout. It is a last
// resort only (spec §11: going back is a switch, not a restore). It writes only new files and deletes nothing.
import { constants, createReadStream } from 'node:fs';
import { lstat, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LAYOUT, ensureDirectory, logLine, runBounded } from './common.mjs';
import { psqlArgv } from './release-table.mjs';

export const KEEP = 7;
/** Whatever `keep` says, retention never leaves fewer copies than this. */
export const MIN_KEPT = 2;
const DUMP = /^debateai-preview-\d{8}T\d{6}Z\.dump$/;
const PARTIAL = /^\.debateai-preview-\d{8}T\d{6}Z\.dump\.partial$/;

class BackupRefusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new BackupRefusal(code); };

export function backupFileName(at) {
  return `debateai-preview-${at.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z.dump`;
}

/**
 * Names sort by their UTC stamp; everything past the newest `keep` (at least MIN_KEPT) goes.
 * `protect` (the dump just written) always counts as kept, even if a clock that went back made
 * its name sort as the oldest. Unknown names are never touched.
 */
export function selectForDeletion(names, keep, protect) {
  const dumps = names.filter(name => DUMP.test(name));
  const kept = Math.max(Number.isSafeInteger(keep) ? keep : KEEP, MIN_KEPT) - (dumps.includes(protect) ? 1 : 0);
  return dumps.filter(name => name !== protect).sort().reverse().slice(Math.max(0, kept)).sort();
}

const asPostgres = layout => [layout.runuser, '-u', 'postgres', '--', layout.env, '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC'];
/** One database (the nightly's is the preview database); the online backup names each database of the cluster. */
export function dumpArgv({ layout, database = layout.database }) {
  return [...asPostgres(layout), `${layout.pgBin}/pg_dump`, '--format=custom', '--no-password', `--host=${layout.pgSocketDir}`, `--port=${layout.pgPort}`, `--dbname=${database}`];
}
/** The listing reads the archive from stdin, so the postgres user never needs the root-only folder. */
export function restoreListArgv({ layout }) {
  return [...asPostgres(layout), `${layout.pgBin}/pg_restore`, '--list'];
}

async function fileSha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function runBackup({ layout = LAYOUT, deps = {}, keep = KEEP }) {
  const uid = layout.ownerUid ?? 0, gid = layout.ownerGid ?? 0;
  const now = deps.now ?? Date.now;
  const dump = deps.dump ?? (fd => runBounded(dumpArgv({ layout }), { env: {}, stdoutFd: fd, timeoutMs: 30 * 60 * 1000, maxOutputBytes: 65536 }));
  const list = deps.list ?? (async path => {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const result = await runBounded(restoreListArgv({ layout }), { env: {}, stdin: handle.fd, timeoutMs: 10 * 60 * 1000, maxOutputBytes: 64 * 1024 * 1024 });
      if (result.timedOut || result.overflow || result.error || result.code !== 0) throw new Error('pg_restore');
      return result.stdout.toString('utf8');
    } finally { await handle.close(); }
  });
  await ensureDirectory(layout.backupDir, { mode: 0o700, uid }).catch(() => refuse('DIRECTORY_REFUSED'));
  for (const entry of await readdir(layout.backupDir, { withFileTypes: true })) if (entry.isFile() && PARTIAL.test(entry.name)) await unlink(join(layout.backupDir, entry.name));

  const name = backupFileName(new Date(now()));
  const finalPath = join(layout.backupDir, name), partialPath = join(layout.backupDir, `.${name}.partial`);
  if (await lstat(finalPath).then(() => true, () => false)) refuse('ALREADY_EXISTS');
  let handle, finished = false;
  try {
    handle = await open(partialPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.chown(uid, gid);
    await handle.chmod(0o600);
    const result = await dump(handle.fd);
    if (result.timedOut || result.overflow || result.error || result.code !== 0) refuse('DUMP_FAILED');
    await handle.sync();
    const bytes = (await handle.stat()).size;
    await handle.close(); handle = undefined;
    if (bytes < 1) refuse('DUMP_FAILED');
    // pg_restore --list proves a readable archive with a table of contents, not restorable data.
    let toc;
    try { toc = await list(partialPath); } catch { refuse('VERIFY_FAILED'); }
    const entries = toc.split('\n').filter(line => line && !line.startsWith(';'));
    if (!/^; Archive created at /m.test(toc) || entries.length < 1) refuse('VERIFY_FAILED');
    await rename(partialPath, finalPath);
    finished = true;
    const folder = await open(layout.backupDir, constants.O_RDONLY);
    try { await folder.sync(); } catch { /* best effort */ } finally { await folder.close(); }
    const sha256 = await fileSha256(finalPath);
    // Retention only after a verified new dump: a failing night never reduces the good copies.
    const dumps = (await readdir(layout.backupDir, { withFileTypes: true })).filter(entry => entry.isFile() && DUMP.test(entry.name)).map(entry => entry.name);
    const removed = selectForDeletion(dumps, keep, name);
    for (const old of removed) await unlink(join(layout.backupDir, old));
    return { event: 'PREVIEW_BACKUP_OK', file: name, bytes, sha256, kept: dumps.length - removed.length, removed };
  } catch (error) {
    if (error instanceof BackupRefusal) throw error;
    return refuse('BACKUP_FAILED');
  } finally {
    await handle?.close().catch(() => undefined);
    if (!finished) await unlink(partialPath).catch(() => undefined);
  }
}

/**
 * The env keys whose values are key-store paths (packages/register runtime environment): the online backup copies
 * exactly the files and folders they name, and only below KEY_ROOTS.
 */
export const KEY_STORE_KEYS = Object.freeze(['USER_DEK_STORE_PATH', 'PUBLICATION_KEY_STORE_PATH', 'AUDIT_KEY_STORE_PATH', 'KEK_PATH', 'CORPUS_KEK_PATH', 'BLIND_INDEX_KEY_PATH', 'AUDIT_SOURCE_IP_SALT_PATH', 'SUPPORT_KEK_PATH', 'RECORDS_KEY_PATH']);
/** The preview's own folders; a key path anywhere else (or one of these folders itself) refuses KEY_PATH_REFUSED. */
export const KEY_ROOTS = Object.freeze(['/etc/debateai-v3-preview/', '/var/lib/debateai-v3-preview/']);
const TAR = '/usr/bin/tar';
/** A plain PostgreSQL database name: safe as a file name part and never read as a connection string by pg_dump. */
const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const LIST_DATABASES = 'SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn ORDER BY 1;\n';
const GLOBALS_FILE = 'online-globals.sql';
const KEYS_FILE = 'online-keys.tar';
const SUMS_FILE = 'online.sha256';
const MAX_ENV_BYTES = 64 * 1024;
const ok = result => Boolean(result) && !result.timedOut && !result.overflow && !result.error && result.code === 0;
const cleanAbsolute = path => typeof path === 'string' && isAbsolute(path) && normalize(path) === path && !/[\0\n\r]/.test(path);

export function globalsArgv({ layout }) {
  return [...asPostgres(layout), `${layout.pgBin}/pg_dumpall`, '--globals-only', '--no-password', `--host=${layout.pgSocketDir}`, `--port=${layout.pgPort}`];
}

/** `out`: an existing real folder (not a link), owned by root, mode exactly 0700. */
async function requireRootOnlyFolder(out, uid) {
  try {
    if (!cleanAbsolute(out)) throw new Error('path');
    const stat = await lstat(out);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o777) !== 0o700 || await realpath(out) !== out) throw new Error('folder');
  } catch { refuse('DIRECTORY_REFUSED'); }
}

/** One root-owned env file (not a link, not writable by group or others), read whole and bounded. */
async function readEnvFile(path, uid) {
  let handle;
  try {
    if (!cleanAbsolute(path)) throw new Error('path');
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o022) !== 0 || stat.size > MAX_ENV_BYTES) throw new Error('file');
    return (await handle.readFile()).toString('utf8');
  } catch { return refuse('ENV_FILE_REFUSED'); } finally { await handle?.close().catch(() => undefined); }
}

/** The KEY_STORE_KEYS values of the env files, each a clean absolute path strictly below one of KEY_ROOTS; sorted, once each. */
async function keyStorePaths(envPaths, uid) {
  if (!Array.isArray(envPaths) || envPaths.length < 1) refuse('ENV_FILE_REFUSED');
  const paths = new Set();
  for (const envPath of envPaths) {
    for (const line of (await readEnvFile(envPath, uid)).split('\n')) {
      const at = line.indexOf('=');
      if (at < 1 || !KEY_STORE_KEYS.includes(line.slice(0, at))) continue;
      let value = line.slice(at + 1).trim();
      if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
      // A folder may be written with a trailing slash; the root folders themselves never count as a key store.
      if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
      const below = KEY_ROOTS.some(root => value.startsWith(root) && value.length > root.length);
      if (!cleanAbsolute(value) || !below) refuse('KEY_PATH_REFUSED');
      paths.add(value);
    }
  }
  if (paths.size < 1) refuse('KEY_PATHS_NOT_FOUND');
  return [...paths].sort();
}

/**
 * A new root-only 0600 file (O_EXCL: an existing name refuses ALREADY_EXISTS), filled by `fill(fd, handle)` (a child
 * whose stdout is that file, or a write of our own), synced; then `check(path)` reads it back. Resolves to its name, size and sha256.
 */
async function writeChecked(folder, name, { uid, gid, fill, check, failCode }) {
  const path = join(folder, name);
  let handle;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch (error) { return refuse(error?.code === 'EEXIST' ? 'ALREADY_EXISTS' : 'BACKUP_FAILED'); }
  let bytes;
  try {
    await handle.chown(uid, gid);
    await handle.chmod(0o600);
    if (!ok(await fill(handle.fd, handle))) refuse(failCode);
    await handle.sync();
    bytes = (await handle.stat()).size;
  } catch (error) {
    if (error instanceof BackupRefusal) throw error;
    return refuse('BACKUP_FAILED');
  } finally { await handle.close().catch(() => undefined); }
  if (bytes < 1) refuse(failCode);
  let verified = false;
  try { verified = await check(path); } catch { verified = false; }
  if (!verified) refuse('VERIFY_FAILED');
  return { name, bytes, sha256: await fileSha256(path) };
}

/** Run `argv` with the file at `path` as its stdin (the postgres user never needs the root-only folder). */
async function readBack(path, argv, run, timeoutMs) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const result = await run(argv, { env: {}, stdin: handle.fd, timeoutMs, maxOutputBytes: 64 * 1024 * 1024 });
    return ok(result) ? String(result.stdout) : null;
  } finally { await handle.close(); }
}

/** pg_restore --list proves a readable archive with a table of contents (as the nightly check), not restorable data. */
const listingValid = toc => typeof toc === 'string' && /^; Archive created at /m.test(toc) && toc.split('\n').some(line => line && !line.startsWith(';'));

/**
 * The online backup (side-by-side spec §12 step 7). Order: the folder, the env files and their key paths, the list of
 * databases, a check that no output name exists yet; only then the first file. A failure leaves what was written as
 * it is (it deletes nothing) and writes no sums file, so a half run never looks complete.
 */
export async function runOnlineBackup({ out, envPaths, layout = LAYOUT, deps = {} }) {
  const uid = layout.ownerUid ?? 0, gid = layout.ownerGid ?? 0;
  const run = deps.run ?? runBounded;
  await requireRootOnlyFolder(out, uid);
  const keyPaths = await keyStorePaths(envPaths, uid);
  const listed = await run(psqlArgv(layout), { env: {}, stdin: Buffer.from(LIST_DATABASES, 'utf8'), timeoutMs: 15_000, maxOutputBytes: 64 * 1024 });
  if (!ok(listed)) refuse('DATABASE_LIST_FAILED');
  const databases = String(listed.stdout).split('\n').filter(Boolean);
  if (databases.length < 1) refuse('DATABASE_LIST_FAILED');
  if (!databases.every(name => DATABASE_NAME.test(name)) || new Set(databases).size !== databases.length) refuse('DATABASE_NAME_REFUSED');
  const dumpNames = databases.map(database => `online-${database}.dump`);
  for (const name of [...dumpNames, GLOBALS_FILE, KEYS_FILE, SUMS_FILE]) if (await lstat(join(out, name)).then(() => true, () => false)) refuse('ALREADY_EXISTS');

  const files = [];
  for (const [index, database] of databases.entries()) {
    files.push(await writeChecked(out, dumpNames[index], {
      uid, gid, failCode: 'DUMP_FAILED',
      fill: fd => run(dumpArgv({ layout, database }), { env: {}, stdoutFd: fd, timeoutMs: 30 * 60 * 1000, maxOutputBytes: 65536 }),
      check: async path => listingValid(await readBack(path, restoreListArgv({ layout }), run, 10 * 60 * 1000))
    }));
  }
  files.push(await writeChecked(out, GLOBALS_FILE, {
    uid, gid, failCode: 'DUMP_FAILED',
    fill: fd => run(globalsArgv({ layout }), { env: {}, stdoutFd: fd, timeoutMs: 5 * 60 * 1000, maxOutputBytes: 65536 }),
    check: async () => true
  }));
  // tar runs as root (the key stores are root's) from /, with paths relative to it, so the archive restores in place.
  const relative = keyPaths.map(path => path.slice(1));
  files.push(await writeChecked(out, KEYS_FILE, {
    uid, gid, failCode: 'KEYS_FAILED',
    fill: fd => run([TAR, '-C', '/', '-cf', '-', ...relative], { env: {}, stdoutFd: fd, timeoutMs: 10 * 60 * 1000, maxOutputBytes: 65536 }),
    check: async path => {
      const names = (await readBack(path, [TAR, '-tf', '-'], run, 10 * 60 * 1000))?.split('\n') ?? [];
      return relative.every(entry => names.includes(entry) || names.includes(`${entry}/`));
    }
  }));
  const sums = Buffer.from(files.map(file => `${file.sha256}  ${file.name}\n`).join(''), 'utf8');
  await writeChecked(out, SUMS_FILE, {
    uid, gid, failCode: 'BACKUP_FAILED',
    fill: async (_fd, handle) => { for (let offset = 0; offset < sums.length;) offset += (await handle.write(sums, offset)).bytesWritten; return { code: 0 }; },
    check: async () => true
  });
  return Object.freeze({ event: 'PREVIEW_ONLINE_BACKUP_OK', databases: Object.freeze(databases), files: Object.freeze(files.map(file => Object.freeze(file))) });
}

/** Exact argv shapes only: none (the nightly timer) or `--online <dir> --env <path> [--env <path>]`. */
function parseArguments(argv) {
  if (argv.length === 0) return { mode: 'nightly' };
  const [flag, out, ...rest] = argv;
  const envPaths = [];
  for (let at = 0; at < rest.length; at += 2) if (rest[at] === '--env' && cleanAbsolute(rest[at + 1])) envPaths.push(rest[at + 1]);
  if (flag === '--online' && cleanAbsolute(out) && rest.length % 2 === 0 && envPaths.length >= 1 && envPaths.length <= 2 && envPaths.length * 2 === rest.length) return { mode: 'online', out, envPaths };
  return refuse('ARGUMENTS_REFUSED');
}

/** One JSON line per run; 0 on success, 1 on any refusal. */
export async function main(argv, { platform = process.platform, uid = process.getuid?.(), stdout = process.stdout, stderr = process.stderr } = {}) {
  let args = null;
  try {
    args = parseArguments(argv);
    if (platform !== 'linux' || uid !== 0) refuse('ACTOR_REFUSED');
    logLine(stdout, args.mode === 'online' ? await runOnlineBackup({ out: args.out, envPaths: args.envPaths }) : await runBackup({}));
    return 0;
  } catch (error) {
    logLine(stderr, { event: args?.mode === 'online' ? 'PREVIEW_ONLINE_BACKUP_FAILED' : 'PREVIEW_BACKUP_FAILED', reason: error instanceof BackupRefusal ? error.code : 'UNEXPECTED' });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
