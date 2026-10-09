// debateai-preview-backup.service (timer: nightly 03:15 Europe/Bucharest).
//
// Plain words: a nightly copy of the preview database, made by the postgres user over the
// server's own socket, kept in a root-only folder. Each copy is checked with pg_restore before
// it counts; only after a good new copy are older ones removed, keeping the seven newest.
// This is a local safety net (for a bad change or a mistaken delete), not an off-site backup.
import { constants, createReadStream } from 'node:fs';
import { lstat, open, readdir, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LAYOUT, ensureDirectory, logLine, runBounded } from './common.mjs';

export const KEEP = 7;
const DUMP = /^debateai-preview-\d{8}T\d{6}Z\.dump$/;
const PARTIAL = /^\.debateai-preview-\d{8}T\d{6}Z\.dump\.partial$/;

class BackupRefusal extends Error { constructor(code) { super(code); this.code = code; } }
const refuse = code => { throw new BackupRefusal(code); };

export function backupFileName(at) {
  return `debateai-preview-${at.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z.dump`;
}

/** Names sort by their UTC stamp; everything past the newest `keep` goes. Unknown names are never touched. */
export function selectForDeletion(names, keep) {
  return names.filter(name => DUMP.test(name)).sort().reverse().slice(keep).sort();
}

const asPostgres = layout => [layout.runuser, '-u', 'postgres', '--', layout.env, '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC'];
export function dumpArgv({ layout }) {
  return [...asPostgres(layout), `${layout.pgBin}/pg_dump`, '--format=custom', '--no-password', `--host=${layout.pgSocketDir}`, `--port=${layout.pgPort}`, `--dbname=${layout.database}`];
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
    const removed = selectForDeletion(dumps, keep);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.platform !== 'linux' || process.getuid?.() !== 0 || process.argv.length !== 2) refuse('ACTOR_REFUSED');
    logLine(process.stdout, await runBackup({}));
  } catch (error) {
    logLine(process.stderr, { event: 'PREVIEW_BACKUP_FAILED', reason: error instanceof BackupRefusal ? error.code : 'UNEXPECTED' });
    process.exitCode = 1;
  }
}
