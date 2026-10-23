import { describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const backup = await import('../../deploy/' + 'preview-lifecycle/v1/backup.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');

const me = { uid: process.getuid!(), gid: process.getgid!() };
const listing = ';\n; Archive created at 2026-10-10 03:15:01 EEST\n;     dbname: debateai\n;\n215; 1259 16390 TABLE identity user_account debateai_prod_migrator\n4120; 0 16390 TABLE DATA identity user_account debateai_prod_migrator\n';
/**
 * What PostgreSQL 18's `pg_restore --list` prints for a database with no objects (R21's built-in `postgres` database,
 * 2026-10-23: 15 lines, no entry). `TOC Entries` counts the archive's internal entries (encoding, search path), which
 * the listing never shows, so it is not 0. `drop` leaves out the header lines that contain any of its texts.
 */
const emptyListing = (dbname: string, drop: string[] = []) => [
  ';', '; Archive created at 2026-10-23 08:39:28 UTC', `;     dbname: ${dbname}`, ';     TOC Entries: 3', ';     Compression: gzip',
  ';     Dump Version: 1.16-0', ';     Format: CUSTOM', ';     Integer: 4 bytes', ';     Offset: 8 bytes',
  ';     Dumped from database version: 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)', ';     Dumped by pg_dump version: 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)',
  ';', ';', '; Selected TOC Entries:', ';', ''
].filter(line => !drop.some(text => line.includes(text))).join('\n');
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
    ['the listing has no entries', { list: async () => ';\n; Archive created at 2026-10-10\n;\n' }, 'VERIFY_FAILED'],
    // Only the built-in `postgres` database may be empty: an empty archive of the preview database is refused.
    ['the listing is a complete archive with no entries', { list: async () => emptyListing('debateai') }, 'VERIFY_FAILED']
  ])('keeps every earlier dump and leaves no partial file when %s', async (_name, overrides, code) => {
    const old = Array.from({ length: 7 }, (_, i) => `debateai-preview-2026100${i + 1}T001500Z.dump`);
    const layout = server(old);
    await expect(backup.runBackup({ layout, deps: okDeps(overrides) })).rejects.toMatchObject({ code });
    expect(readdirSync(layout.backupDir).sort()).toEqual(old);
  });

  it('never deletes the dump it just wrote, even when older-looking than the rest (clock went back)', async () => {
    const future = Array.from({ length: 7 }, (_, i) => `debateai-preview-2026110${i + 1}T001500Z.dump`);
    const layout = server(future);
    const event = await backup.runBackup({ layout, deps: okDeps() });
    const name = 'debateai-preview-20261010T001500Z.dump';
    expect(readdirSync(layout.backupDir)).toContain(name);
    expect(event.removed).toEqual([future[0]]);
    expect(backup.selectForDeletion([...future, name], 7, name)).toEqual([future[0]]);
  });

  it('never leaves fewer than two dumps, whatever the keep setting', async () => {
    const names = ['debateai-preview-20261008T001500Z.dump', 'debateai-preview-20261009T001500Z.dump', 'debateai-preview-20261010T001500Z.dump'] as const;
    expect(backup.selectForDeletion(names, 1, names[2])).toEqual([names[0]]);
    expect(backup.selectForDeletion(names, 0)).toEqual([names[0]]);
    const layout = server([names[0]]);
    const event = await backup.runBackup({ layout, deps: okDeps(), keep: 1 });
    expect(event).toMatchObject({ kept: 2, removed: [] });
    expect(readdirSync(layout.backupDir).sort()).toEqual([names[0], names[2]]);
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

// Side-by-side spec §12 step 7: before the migrations of a side-by-side upload, every database of the preview cluster,
// the roles, and the key stores the env files name, each checked and summed. A last resort only (spec §11).
describe('online backup before side-by-side migrations', () => {
  const owner = { ...common.LAYOUT, ownerUid: me.uid, ownerGid: me.gid };
  /**
   * A throwaway output folder beside a copy of the preview's two key folders (`keyRoots` points the layout at them): two
   * key files and one store folder. Every path is a real path (the temp folder is resolved first).
   */
  const outFolder = (mode = 0o700) => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-online-')));
    const out = join(base, 'online'); mkdirSync(out); chmodSync(out, mode);
    const etc = join(base, 'etc', 'debateai-v3-preview'), lib = join(base, 'var', 'lib', 'debateai-v3-preview');
    mkdirSync(join(etc, 'keys'), { recursive: true }); mkdirSync(join(lib, 'user-dek-store'), { recursive: true });
    writeFileSync(join(etc, 'keys', 'kek.bin'), 'KEK-bytes'); writeFileSync(join(etc, 'keys', 'support-kek.bin'), 'SUPPORT-bytes');
    writeFileSync(join(lib, 'user-dek-store', 'a.json'), '{"dek":"wrapped"}');
    const keys = { USER_DEK_STORE_PATH: join(lib, 'user-dek-store'), KEK_PATH: join(etc, 'keys', 'kek.bin'), SUPPORT_KEK_PATH: join(etc, 'keys', 'support-kek.bin') };
    return { base, out, etc, lib, keys, layout: { ...owner, keyRoots: [`${etc}/`, `${lib}/`] } };
  };
  type Tree = ReturnType<typeof outFolder>;
  const rel = (path: string) => path.slice(1);
  const envFile = (base: string, name: string, lines: string[]) => { const path = join(base, name); writeFileSync(path, `${lines.join('\n')}\n`); chmodSync(path, 0o640); return path; };
  const done = (stdout = '', code = 0) => ({ code, signal: null, error: undefined, timedOut: false, overflow: false, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) });
  const PG = '/usr/lib/postgresql/18/bin';
  const AS_POSTGRES = ['/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC'];
  /** A `tar -tvf` listing (GNU form) of the tree's three keys and the store's one file. */
  const verbose = (t: Tree) => [`-rw------- root/root 9 2026-10-22 01:00 ${rel(t.keys.KEK_PATH)}`, `-rw------- root/root 13 2026-10-22 01:00 ${rel(t.keys.SUPPORT_KEK_PATH)}`,
    `drwx------ root/root 0 2026-10-22 01:00 ${rel(t.keys.USER_DEK_STORE_PATH)}/`, `-rw------- root/root 17 2026-10-22 01:00 ${rel(t.keys.USER_DEK_STORE_PATH)}/a.json`].join('\n') + '\n';
  /**
   * The preview's commands behind `run`: psql lists the databases, pg_dump/pg_dumpall/tar write to the file they are
   * handed. `realTar` hands tar to this machine's real tar instead (the content must really be stored).
   */
  function fakeServer(t: Tree, options: Partial<{ databases: string; restoreList: string | ((stdin: string) => string); tarList: string; fail: string; realTar: boolean }> = {}) {
    const o = { databases: 'debateai\nhatchet\npostgres\n', restoreList: listing, tarList: '', fail: '', realTar: false, ...options };
    const calls: { argv: string[]; stdin?: string }[] = [];
    const run = async (argv: string[], opts: { env: Record<string, string>; stdin?: Buffer | number; stdoutFd?: number; timeoutMs: number; maxOutputBytes: number }) => {
      expect(opts.env).toEqual({});
      const program = argv.find(part => part.startsWith('/usr/lib/postgresql/') || part === '/usr/bin/tar') ?? '';
      if (o.realTar && program === '/usr/bin/tar') { calls.push({ argv }); return common.runBounded(argv, opts); }
      const stdin = Buffer.isBuffer(opts.stdin) ? opts.stdin.toString('utf8') : typeof opts.stdin === 'number' ? readFileSync(opts.stdin, 'utf8') : undefined;
      calls.push({ argv, ...(stdin === undefined ? {} : { stdin }) });
      if (o.fail && program.endsWith(o.fail)) return done('', 1);
      if (program.endsWith('/psql')) return done(o.databases);
      if (program.endsWith('/pg_dump')) { writeSync(opts.stdoutFd!, `PGDMP-${argv.at(-1)!.slice('--dbname='.length)}`); return done(); }
      if (program.endsWith('/pg_restore')) return done(typeof o.restoreList === 'function' ? o.restoreList(stdin ?? '') : o.restoreList);
      if (program.endsWith('/pg_dumpall')) { writeSync(opts.stdoutFd!, 'CREATE ROLE debateai_runtime;\n'); return done(); }
      if (program === '/usr/bin/tar' && argv.includes('-cf')) { writeSync(opts.stdoutFd!, 'TAR-synthetic'); return done(); }
      if (program === '/usr/bin/tar' && argv.includes('-tvf')) return done(o.tarList || verbose(t));
      throw new Error(`unexpected command ${argv.join(' ')}`);
    };
    return { run, calls };
  }
  const sum = (text: string) => createHash('sha256').update(text).digest('hex');
  const envs = (t: Tree) => [
    envFile(t.base, 'api-v1.env', ['NODE_ENV=production', `KEK_PATH=${t.keys.KEK_PATH}`, `USER_DEK_STORE_PATH="${t.keys.USER_DEK_STORE_PATH}/"`, 'DATABASE_URL=postgresql://x@localhost/debateai']),
    envFile(t.base, 'runner-v1.env', [`KEK_PATH=${t.keys.KEK_PATH}`, `SUPPORT_KEK_PATH=${t.keys.SUPPORT_KEK_PATH}`, '# KEK_PATH=/home/old/kek'])
  ];

  it('dumps every database, the globals and the key stores, each checked and summed', async () => {
    const t = outFolder();
    const { out } = t;
    const server = fakeServer(t);
    const event = await backup.runOnlineBackup({ out, envPaths: envs(t), layout: t.layout, deps: { run: server.run } });
    const argvs = server.calls.map(call => call.argv);
    // The database list is read through the release table's psqlArgv, which gives up connecting after 3 s.
    expect(argvs[0]).toEqual([...AS_POSTGRES, 'PGCONNECT_TIMEOUT=3',
      `${PG}/psql`, '--no-psqlrc', '--no-align', '--tuples-only', '--quiet', '--field-separator=|', '-v', 'ON_ERROR_STOP=1',
      '--host=/run/debateai-v3-preview/postgresql', '--port=5434', '--dbname=debateai', '-f', '-']);
    expect(server.calls[0]!.stdin).toContain('SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn ORDER BY 1;');
    expect(argvs.slice(1)).toEqual([
      ...['debateai', 'hatchet', 'postgres'].flatMap(db => [
        [...AS_POSTGRES, `${PG}/pg_dump`, '--format=custom', '--no-password', '--host=/run/debateai-v3-preview/postgresql', '--port=5434', `--dbname=${db}`],
        [...AS_POSTGRES, `${PG}/pg_restore`, '--list']
      ]),
      [...AS_POSTGRES, `${PG}/pg_dumpall`, '--globals-only', '--no-password', '--host=/run/debateai-v3-preview/postgresql', '--port=5434'],
      ['/usr/bin/tar', '-C', '/', '-cf', '-', rel(t.keys.KEK_PATH), rel(t.keys.SUPPORT_KEK_PATH), rel(t.keys.USER_DEK_STORE_PATH)],
      ['/usr/bin/tar', '-tvf', '-']
    ]);
    // Each check reads the file just written, from its stdin.
    expect(server.calls.filter(call => call.argv.at(-1) === '--list').map(call => call.stdin)).toEqual(['PGDMP-debateai', 'PGDMP-hatchet', 'PGDMP-postgres']);
    expect(server.calls.at(-1)!.stdin).toBe('TAR-synthetic');
    const contents: Record<string, string> = { 'online-debateai.dump': 'PGDMP-debateai', 'online-hatchet.dump': 'PGDMP-hatchet', 'online-postgres.dump': 'PGDMP-postgres', 'online-globals.sql': 'CREATE ROLE debateai_runtime;\n', 'online-keys.tar': 'TAR-synthetic' };
    expect(readdirSync(out).sort()).toEqual([...Object.keys(contents), 'online.sha256'].sort());
    for (const name of readdirSync(out)) expect(statSync(join(out, name)).mode & 0o777, name).toBe(0o600);
    for (const [name, text] of Object.entries(contents)) expect(readFileSync(join(out, name), 'utf8')).toBe(text);
    expect(readFileSync(join(out, 'online.sha256'), 'utf8')).toBe(Object.entries(contents).map(([name, text]) => `${sum(text)}  ${name}\n`).join(''));
    expect(event).toEqual({ event: 'PREVIEW_ONLINE_BACKUP_OK', databases: ['debateai', 'hatchet', 'postgres'], keys: ['USER_DEK_STORE_PATH', 'KEK_PATH', 'SUPPORT_KEK_PATH'],
      files: Object.entries(contents).map(([name, text]) => ({ name, bytes: Buffer.byteLength(text), sha256: sum(text) })) });
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('the server reads its key paths below the two preview folders', async () => {
    expect(backup.KEY_ROOTS).toEqual(['/etc/debateai-v3-preview/', '/var/lib/debateai-v3-preview/']);
    expect(Object.keys(common.LAYOUT)).not.toContain('keyRoots');
  });

  it("refuses a key path outside the preview's folders", async () => {
    const t0 = outFolder();
    for (const value of ['/home/admin/kek.bin', `${t0.etc}/../shadow`, 'keys/kek.bin', `${t0.etc}-other/kek.bin`, `${t0.lib}/`]) {
      const t = outFolder();
      const server = fakeServer(t);
      const env = envFile(t.base, 'api-v1.env', [`KEK_PATH=${t.keys.KEK_PATH}`, `CORPUS_KEK_PATH=${value.replace(t0.base, t.base)}`]);
      await expect(backup.runOnlineBackup({ out: t.out, envPaths: [env], layout: t.layout, deps: { run: server.run } })).rejects.toMatchObject({ code: 'KEY_PATH_REFUSED' });
      expect(server.calls).toEqual([]);
      expect(readdirSync(t.out)).toEqual([]);
    }
  });

  it("D13 ruling: a key link is followed only inside the preview's folders, and the archive stores its content", async () => {
    // Inside → inside: tar is handed the real file, and the archive holds its bytes, never a link.
    const t = outFolder();
    symlinkSync(t.keys.KEK_PATH, join(t.etc, 'keys', 'kek-current'));
    const inside = envFile(t.base, 'api-v1.env', [`KEK_PATH=${join(t.etc, 'keys', 'kek-current')}`, `USER_DEK_STORE_PATH=${t.keys.USER_DEK_STORE_PATH}`]);
    const server = fakeServer(t, { realTar: true });
    const event = await backup.runOnlineBackup({ out: t.out, envPaths: [inside], layout: t.layout, deps: { run: server.run } });
    expect(server.calls.find(call => call.argv.includes('-cf'))!.argv.slice(5)).toEqual([rel(t.keys.KEK_PATH), rel(t.keys.USER_DEK_STORE_PATH)]);
    const archive = join(t.out, 'online-keys.tar');
    expect(spawnSync('/usr/bin/tar', ['-xOf', archive, rel(t.keys.KEK_PATH)], { encoding: 'utf8' }).stdout).toBe('KEK-bytes');
    const listed = spawnSync('/usr/bin/tar', ['-tvf', archive], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    expect(listed.filter(line => line[0] === 'l' || line[0] === 'h')).toEqual([]);
    expect(event.files.find((file: { name: string }) => file.name === 'online-keys.tar')).toBeTruthy();
    // Inside → outside: refused before anything runs or is written.
    const u = outFolder();
    const outside = join(u.base, 'elsewhere.bin');
    writeFileSync(outside, 'NOT-A-PREVIEW-KEY');
    symlinkSync(outside, join(u.etc, 'keys', 'kek-escape'));
    const escape = envFile(u.base, 'api-v1.env', [`KEK_PATH=${join(u.etc, 'keys', 'kek-escape')}`]);
    const refused = fakeServer(u, { realTar: true });
    await expect(backup.runOnlineBackup({ out: u.out, envPaths: [escape], layout: u.layout, deps: { run: refused.run } })).rejects.toMatchObject({ code: 'KEY_PATH_REFUSED' });
    expect(refused.calls).toEqual([]);
    expect(readdirSync(u.out)).toEqual([]);
    // A key path that does not resolve is refused the same way, before anything runs.
    const v = outFolder();
    const gone = envFile(v.base, 'api-v1.env', [`KEK_PATH=${join(v.etc, 'keys', 'missing.bin')}`]);
    const missing = fakeServer(v);
    await expect(backup.runOnlineBackup({ out: v.out, envPaths: [gone], layout: v.layout, deps: { run: missing.run } })).rejects.toMatchObject({ code: 'KEY_PATH_UNREADABLE' });
    expect(missing.calls).toEqual([]);
  });

  it('refuses a key archive in which any entry is a link (a link inside a store folder stores no content)', async () => {
    const t = outFolder();
    symlinkSync(t.keys.KEK_PATH, join(t.keys.USER_DEK_STORE_PATH, 'b.json'));
    const server = fakeServer(t, { realTar: true });
    await expect(backup.runOnlineBackup({ out: t.out, envPaths: envs(t), layout: t.layout, deps: { run: server.run } })).rejects.toMatchObject({ code: 'VERIFY_FAILED' });
    expect(readdirSync(t.out)).not.toContain('online.sha256');
  });

  it('refuses an output folder that is not root-only 0700, or an existing file', async () => {
    const open = outFolder(0o755);
    await expect(backup.runOnlineBackup({ out: open.out, envPaths: envs(open), layout: open.layout, deps: { run: fakeServer(open).run } })).rejects.toMatchObject({ code: 'DIRECTORY_REFUSED' });
    const missing = outFolder();
    await expect(backup.runOnlineBackup({ out: join(missing.base, 'nowhere'), envPaths: envs(missing), layout: missing.layout, deps: { run: fakeServer(missing).run } })).rejects.toMatchObject({ code: 'DIRECTORY_REFUSED' });
    const linked = outFolder();
    symlinkSync(linked.out, join(linked.base, 'link'));
    await expect(backup.runOnlineBackup({ out: join(linked.base, 'link'), envPaths: envs(linked), layout: linked.layout, deps: { run: fakeServer(linked).run } })).rejects.toMatchObject({ code: 'DIRECTORY_REFUSED' });
    await expect(backup.runOnlineBackup({ out: open.out, envPaths: envs(open), layout: { ...open.layout, ownerUid: me.uid + 1 }, deps: { run: fakeServer(open).run } })).rejects.toMatchObject({ code: 'DIRECTORY_REFUSED' });
    // An earlier run's file stays as it was and nothing is written beside it.
    const t = outFolder();
    writeFileSync(join(t.out, 'online-hatchet.dump'), 'earlier'); chmodSync(join(t.out, 'online-hatchet.dump'), 0o600);
    const server = fakeServer(t);
    await expect(backup.runOnlineBackup({ out: t.out, envPaths: envs(t), layout: t.layout, deps: { run: server.run } })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
    expect(readdirSync(t.out)).toEqual(['online-hatchet.dump']);
    expect(readFileSync(join(t.out, 'online-hatchet.dump'), 'utf8')).toBe('earlier');
    expect(server.calls).toHaveLength(1);
  });

  const DUMPS = ['online-debateai.dump', 'online-hatchet.dump', 'online-postgres.dump'];
  /** Each database's listing: `PGDMP-<name>` is what the fake pg_dump wrote, and pg_restore reads it from its stdin. */
  const listingFor = (special: Record<string, string>) => (stdin: string) => special[stdin.slice('PGDMP-'.length)] ?? listing;

  it("R21: accepts the built-in postgres database's archive when it is complete but lists no entry (that database is empty)", async () => {
    const t = outFolder();
    const server = fakeServer(t, { restoreList: listingFor({ postgres: emptyListing('postgres') }) });
    const event = await backup.runOnlineBackup({ out: t.out, envPaths: envs(t), layout: t.layout, deps: { run: server.run } });
    expect(event.event).toBe('PREVIEW_ONLINE_BACKUP_OK');
    expect(event.databases).toEqual(['debateai', 'hatchet', 'postgres']);
    expect(readdirSync(t.out).sort()).toEqual([...DUMPS, 'online-globals.sql', 'online-keys.tar', 'online.sha256'].sort());
  });

  it.each([
    ['an empty archive of a database that must hold objects (hatchet)', { hatchet: emptyListing('hatchet') }, ['online-debateai.dump', 'online-hatchet.dump']],
    ['an empty postgres archive with no header at all', { postgres: 'garbage\n' }, DUMPS],
    ['an empty postgres archive cut short before its "Selected TOC Entries" line', { postgres: emptyListing('postgres', ['Selected TOC Entries']) }, DUMPS],
    ['an empty postgres archive with no format line', { postgres: emptyListing('postgres', ['Format:']) }, DUMPS],
    ['an empty postgres archive with no pg_dump version line', { postgres: emptyListing('postgres', ['Dumped by']) }, DUMPS],
    ['an empty postgres archive with no table-of-contents count', { postgres: emptyListing('postgres', ['TOC Entries: 3']) }, DUMPS],
    ['an empty archive whose header names another database', { postgres: emptyListing('debateai') }, DUMPS],
    ['an empty postgres archive in another format', { postgres: emptyListing('postgres').replace('Format: CUSTOM', 'Format: TAR') }, DUMPS]
  ])('refuses %s (VERIFY_FAILED), keeps what it wrote and writes no sums', async (_name, special, left) => {
    const t = outFolder();
    const server = fakeServer(t, { restoreList: listingFor(special) });
    await expect(backup.runOnlineBackup({ out: t.out, envPaths: envs(t), layout: t.layout, deps: { run: server.run } })).rejects.toMatchObject({ code: 'VERIFY_FAILED' });
    expect(readdirSync(t.out).sort()).toEqual([...left].sort());
  });

  it.each([
    ['a dump that pg_restore cannot list', () => ({ restoreList: 'garbage\n' }), 'VERIFY_FAILED', ['online-debateai.dump']],
    ['a key archive that lacks a key store', (t: Tree) => ({ tarList: `-rw------- root/root 9 2026-10-22 01:00 ${rel(t.keys.KEK_PATH)}\n` }), 'VERIFY_FAILED', [...DUMPS, 'online-globals.sql', 'online-keys.tar']],
    ['a key archive whose key file is listed as a link', (t: Tree) => ({ tarList: verbose(t).replace(`-rw------- root/root 9 2026-10-22 01:00 ${rel(t.keys.KEK_PATH)}`, `lrwxrwxrwx root/root 0 2026-10-22 01:00 ${rel(t.keys.KEK_PATH)} -> x`) }), 'VERIFY_FAILED', [...DUMPS, 'online-globals.sql', 'online-keys.tar']],
    ['a key archive that lists the store folder as a file', (t: Tree) => ({ tarList: verbose(t).replace(`drwx------ root/root 0 2026-10-22 01:00 ${rel(t.keys.USER_DEK_STORE_PATH)}/`, `-rw------- root/root 0 2026-10-22 01:00 ${rel(t.keys.USER_DEK_STORE_PATH)}`) }), 'VERIFY_FAILED', [...DUMPS, 'online-globals.sql', 'online-keys.tar']],
    ['a failing pg_dumpall', () => ({ fail: '/pg_dumpall' }), 'DUMP_FAILED', [...DUMPS, 'online-globals.sql']],
    // Live key stores: GNU tar exits 1 on "file changed as we read it"; the run refuses and the retry takes a new folder.
    ['a key store changing while tar reads it', () => ({ fail: '/usr/bin/tar' }), 'KEYS_FAILED', [...DUMPS, 'online-globals.sql', 'online-keys.tar']],
    ['a database name that is not a plain name', () => ({ databases: 'debateai\nhost=evil\n' }), 'DATABASE_NAME_REFUSED', []],
    ['no database at all', () => ({ databases: '' }), 'DATABASE_LIST_FAILED', []]
  ])('refuses %s, deletes nothing it wrote and writes no sums', async (_name, options, code, left) => {
    const t = outFolder();
    const server = fakeServer(t, options(t));
    await expect(backup.runOnlineBackup({ out: t.out, envPaths: envs(t), layout: t.layout, deps: { run: server.run } })).rejects.toMatchObject({ code });
    expect(readdirSync(t.out).sort()).toEqual([...left].sort());
  });

  it('refuses env files with no key store, or that others may write', async () => {
    const t = outFolder();
    const none = envFile(t.base, 'ui-v1.env', ['NODE_ENV=production']);
    await expect(backup.runOnlineBackup({ out: t.out, envPaths: [none], layout: t.layout, deps: { run: fakeServer(t).run } })).rejects.toMatchObject({ code: 'KEY_PATHS_NOT_FOUND' });
    const loose = envFile(t.base, 'api-v1.env', [`KEK_PATH=${t.keys.KEK_PATH}`]);
    chmodSync(loose, 0o666);
    await expect(backup.runOnlineBackup({ out: t.out, envPaths: [loose], layout: t.layout, deps: { run: fakeServer(t).run } })).rejects.toMatchObject({ code: 'ENV_FILE_REFUSED' });
    await expect(backup.runOnlineBackup({ out: t.out, envPaths: [], layout: t.layout, deps: { run: fakeServer(t).run } })).rejects.toMatchObject({ code: 'ENV_FILE_REFUSED' });
    expect(readdirSync(t.out)).toEqual([]);
  });

  it('the event names files and sums, never a path from the env files', async () => {
    const t = outFolder();
    const event = await backup.runOnlineBackup({ out: t.out, envPaths: envs(t), layout: t.layout, deps: { run: fakeServer(t).run } });
    const text = JSON.stringify(event);
    for (const path of [...Object.values(t.keys), t.base, t.out, 'debateai-v3-preview', 'postgresql://']) expect(text).not.toContain(path);
    expect(event.files.map((file: { name: string }) => file.name)).toEqual(['online-debateai.dump', 'online-hatchet.dump', 'online-postgres.dump', 'online-globals.sql', 'online-keys.tar']);
    // The key-store names found, in KEY_STORE_KEYS order: names only.
    expect(event.keys).toEqual(['USER_DEK_STORE_PATH', 'KEK_PATH', 'SUPPORT_KEK_PATH']);
  });

  it('the CLI takes `--online <dir> --env <path> [--env <path>]` and leaves the nightly invocation as it was', () => {
    const script = new URL('../../deploy/preview-lifecycle/v1/backup.mjs', import.meta.url).pathname;
    const cli = (args: string[]) => spawnSync('/usr/bin/env', ['-i', 'PATH=/usr/sbin:/usr/bin:/sbin:/bin', process.execPath, script, ...args], { encoding: 'utf8' });
    for (const args of [['--online', '/var/backups/x', '--env', '/etc/a.env'], ['--online', '/var/backups/x', '--env', '/etc/a.env', '--env', '/etc/b.env']]) {
      const result = cli(args);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr.trim())).toEqual({ event: 'PREVIEW_ONLINE_BACKUP_FAILED', reason: 'ACTOR_REFUSED' });
    }
    for (const args of [['--online', '/var/backups/x'], ['--online', 'relative', '--env', '/etc/a.env'], ['--online', '/x', '--env', '/a', '--env', '/b', '--env', '/c'], ['--nightly']]) {
      const result = cli(args);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr.trim())).toEqual({ event: 'PREVIEW_BACKUP_FAILED', reason: 'ARGUMENTS_REFUSED' });
    }
    const nightly = cli([]);
    expect(nightly.status).toBe(1);
    expect(JSON.parse(nightly.stderr.trim())).toEqual({ event: 'PREVIEW_BACKUP_FAILED', reason: 'ACTOR_REFUSED' });
  });

  it('leaves the nightly backup exactly as it was', () => {
    expect(backup.KEY_STORE_KEYS).toEqual(['USER_DEK_STORE_PATH', 'PUBLICATION_KEY_STORE_PATH', 'AUDIT_KEY_STORE_PATH', 'KEK_PATH', 'CORPUS_KEK_PATH', 'BLIND_INDEX_KEY_PATH', 'AUDIT_SOURCE_IP_SALT_PATH', 'SUPPORT_KEK_PATH', 'RECORDS_KEY_PATH']);
    expect(backup.KEY_ROOTS).toEqual(['/etc/debateai-v3-preview/', '/var/lib/debateai-v3-preview/']);
    expect(Object.isFrozen(backup.KEY_STORE_KEYS) && Object.isFrozen(backup.KEY_ROOTS)).toBe(true);
    // The nightly dump of the one database keeps its exact argv (the PREVIEW_BACKUP_OK toEqual above is unchanged).
    expect(backup.dumpArgv({ layout: common.LAYOUT }).at(-1)).toBe('--dbname=debateai');
  });
});
