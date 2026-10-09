import { describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const backup = await import('../../deploy/' + 'preview-lifecycle/v1/backup.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');

const me = { uid: process.getuid!(), gid: process.getgid!() };
const listing = ';\n; Archive created at 2026-10-10 03:15:01 EEST\n;     dbname: debateai\n;\n215; 1259 16390 TABLE identity user_account debateai_prod_migrator\n4120; 0 16390 TABLE DATA identity user_account debateai_prod_migrator\n';
function server(existing: string[] = [], dirMode = 0o700) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-backup-')));
  const layout = { ...common.LAYOUT, ownerUid: me.uid, ownerGid: me.gid, backupDir: join(base, 'backups') };
  mkdirSync(layout.backupDir); chmodSync(layout.backupDir, dirMode);
  for (const name of existing) { writeFileSync(join(layout.backupDir, name), 'old'); chmodSync(join(layout.backupDir, name), 0o600); }
  return layout;
}
const at = Date.parse('2026-10-10T00:15:00Z');
const okDeps = (overrides: Record<string, unknown> = {}) => ({
  now: () => at,
  dump: async (fd: number) => { writeSync(fd, 'PGDMP-synthetic'); return { code: 0, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }; },
  list: async () => listing,
  ...overrides
});

describe('nightly preview database backup', () => {
  it('names dumps by UTC time and keeps the seven newest', () => {
    expect(backup.backupFileName(new Date(at))).toBe('debateai-preview-20261010T001500Z.dump');
    const names = ['debateai-preview-20261001T001500Z.dump', 'debateai-preview-20261003T001500Z.dump', 'debateai-preview-20261002T001500Z.dump', 'notes.txt',
      'debateai-preview-20261004T001500Z.dump', 'debateai-preview-20261005T001500Z.dump', 'debateai-preview-20261006T001500Z.dump', 'debateai-preview-20261007T001500Z.dump',
      'debateai-preview-20261008T001500Z.dump', 'debateai-preview-20261009T001500Z.dump'];
    expect(backup.selectForDeletion(names, 7)).toEqual(['debateai-preview-20261001T001500Z.dump', 'debateai-preview-20261002T001500Z.dump']);
    expect(backup.selectForDeletion(names.slice(0, 3), 7)).toEqual([]);
  });

  it('dumps as postgres over the local socket only, never over the network', () => {
    expect(backup.dumpArgv({ layout: common.LAYOUT })).toEqual(['/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC',
      '/usr/lib/postgresql/18/bin/pg_dump', '--format=custom', '--no-password', '--host=/run/debateai-v3-preview/postgresql', '--port=5434', '--dbname=debateai']);
    expect(backup.restoreListArgv({ layout: common.LAYOUT })).toEqual(['/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC',
      '/usr/lib/postgresql/18/bin/pg_restore', '--list']);
  });

  it('writes a verified 0600 dump into a 0700 folder and prunes to the seven newest', async () => {
    const old = Array.from({ length: 7 }, (_, i) => `debateai-preview-2026100${i + 1}T001500Z.dump`);
    const layout = server([...old, 'README.txt']);
    const event = await backup.runBackup({ layout, deps: okDeps() });
    const name = 'debateai-preview-20261010T001500Z.dump';
    expect(readFileSync(join(layout.backupDir, name), 'utf8')).toBe('PGDMP-synthetic');
    expect(statSync(join(layout.backupDir, name)).mode & 0o777).toBe(0o600);
    expect(readdirSync(layout.backupDir).sort()).toEqual(['README.txt', ...old.slice(1), name].sort());
    expect(event).toEqual({ event: 'PREVIEW_BACKUP_OK', file: name, bytes: 15, sha256: createHash('sha256').update('PGDMP-synthetic').digest('hex'), kept: 7, removed: [old[0]] });
  });

  it.each([
    ['the dump fails', { dump: async () => ({ code: 1, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.from('pg_dump: error') }) }, 'DUMP_FAILED'],
    ['the dump is empty', { dump: async () => ({ code: 0, timedOut: false, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) }, 'DUMP_FAILED'],
    ['pg_restore cannot list it', { list: async () => { throw new Error('pg_restore: error: input file does not appear to be a valid archive'); } }, 'VERIFY_FAILED'],
    ['the listing has no archive header', { list: async () => 'garbage\n' }, 'VERIFY_FAILED'],
    ['the listing has no entries', { list: async () => ';\n; Archive created at 2026-10-10\n;\n' }, 'VERIFY_FAILED']
  ])('keeps every earlier dump and leaves no partial file when %s', async (_name, overrides, code) => {
    const old = Array.from({ length: 7 }, (_, i) => `debateai-preview-2026100${i + 1}T001500Z.dump`);
    const layout = server(old);
    await expect(backup.runBackup({ layout, deps: okDeps(overrides) })).rejects.toMatchObject({ code });
    expect(readdirSync(layout.backupDir).sort()).toEqual(old);
  });

  it('removes a partial file left by an earlier crash', async () => {
    const layout = server(['.debateai-preview-20261009T001500Z.dump.partial']);
    await backup.runBackup({ layout, deps: okDeps() });
    expect(readdirSync(layout.backupDir)).toEqual(['debateai-preview-20261010T001500Z.dump']);
  });

  it('refuses a backup folder other users can enter', async () => {
    const layout = server([], 0o755);
    await expect(backup.runBackup({ layout, deps: okDeps() })).rejects.toMatchObject({ code: 'DIRECTORY_REFUSED' });
  });

  it('never deletes a symlink that merely looks like an old dump', async () => {
    const old = Array.from({ length: 7 }, (_, i) => `debateai-preview-2026100${i + 2}T001500Z.dump`);
    const layout = server(old);
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-outside-')));
    writeFileSync(join(outside, 'keep.txt'), 'keep');
    symlinkSync(join(outside, 'keep.txt'), join(layout.backupDir, 'debateai-preview-20261001T001500Z.dump'));
    const event = await backup.runBackup({ layout, deps: okDeps() });
    expect(event.removed).toEqual(['debateai-preview-20261002T001500Z.dump']);
    expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('keep');
  });
});
