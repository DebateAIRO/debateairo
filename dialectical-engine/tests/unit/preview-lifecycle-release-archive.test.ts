import { describe, expect, it } from 'vitest';
import { chmodSync, chownSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { lstat as fsLstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const archive = await import('../../deploy/' + 'preview-lifecycle/v1/release-archive.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');
const environment = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');

// Side-by-side spec §10: after retirement, on the owner's yes, a release's folders and files are moved aside, never deleted.
const me = { uid: process.getuid!(), gid: process.getgid!() };
const digest = 'a'.repeat(64);
const OLD_REV = 'a'.repeat(40), NEW_REV = '0123456789abcdef'.repeat(2) + '01234567';
const publication = { publicationId: '11111111-1111-4111-8111-111111111111', publicationKind: 'GENERAL', baseRegisterVersion: '8', registerVersion: '12', requestSha256: digest, snapshotSha256: digest, rowCount: 68, recordedAt: '2026-10-06T12:00:00.000Z' };
const OLD = 'old-v1', NEW = 'new-v1';
const OLD_KEY = environment.expectedReleaseKey(publication, OLD_REV) as string;
const NEW_KEY = environment.expectedReleaseKey(publication, NEW_REV) as string;
const NOW = Date.parse('2026-10-22T09:30:15.000Z');
const STAMP = '20261022T093015Z';
const SERVICES = ['api', 'ui', 'runner'] as const;
const RELEASE_FOLDERS = (label: string) => ['candidate', 'fallback'].flatMap(kind => SERVICES.map(service => `auth-dev-${kind}-${label}-${service}`));

/** A throwaway copy of the server layout (owned by the test user), holding two pinned releases and every per-release file. */
function server() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-archive-')));
  const dir = (path: string, mode = 0o755) => { mkdirSync(path, { recursive: true }); chmodSync(path, mode); return path; };
  const layout = {
    ...common.LAYOUT, ownerUid: me.uid, ownerGid: me.gid,
    artifactsRoot: dir(join(base, 'opt', 'artifacts')), releasesRoot: dir(join(base, 'opt', 'releases')), archiveRoot: join(base, 'opt', 'archive'),
    nativePlanRoot: dir(join(base, 'etc', 'auth-dev-v1')), systemdUnitDir: dir(join(base, 'etc', 'systemd')), configArchiveRoot: join(base, 'root', 'preview-archive'),
    lockRoot: dir(join(base, 'etc', 'lifecycle')), lockPath: join(base, 'etc', 'lifecycle', 'release-lock.json')
  };
  dir(join(base, 'root'), 0o700);
  const file = (path: string, text = 'x\n') => { writeFileSync(path, text); chmodSync(path, 0o644); return path; };
  const entry = (label: string, revision: string) => ({
    basePlan: { path: `${layout.artifactsRoot}/release-${label}/api-launch.json`, sha256: digest }, nativePlanSha256: digest,
    sourceRoot: `/opt/debateai-v3-preview/releases/auth-dev-candidate-${label}-api`, sourceRevision: revision, sourceTree: 'b'.repeat(40),
    serviceUid: 1001, serviceGid: 1001, sourceManifestSha256: digest, uiBuildSha256: null, operatorManifestSha256: digest, publication, pinnedAt: '2026-10-09T10:00:00.000Z'
  });
  const lock = {
    schema: 'preview-lifecycle-release-lock-v2',
    releases: {
      [OLD]: { releaseKey: OLD_KEY, slot: 'A', databaseAhead: null, services: { api: entry(OLD, OLD_REV) } },
      [NEW]: { releaseKey: NEW_KEY, slot: 'B', databaseAhead: null, services: { api: entry(NEW, NEW_REV) } }
    }
  };
  file(layout.lockPath, `${JSON.stringify(lock)}\n`);
  chownSync(layout.lockPath, me.uid, me.gid);
  for (const label of [OLD, NEW]) {
    for (const name of RELEASE_FOLDERS(label)) file(join(dir(join(layout.releasesRoot, name)), 'package.json'));
    file(join(dir(join(layout.artifactsRoot, `auth-dev-${label}`)), 'source.json'));
    file(join(dir(common.currentDirFor(layout, label)), 'api-launch.json'));
    for (const service of SERVICES) file(common.envPathFor(layout, service, label));
    file(common.nativePlanPathFor(layout, label));
    file(common.databaseAheadPathFor(layout, label));
    for (const service of SERVICES) file(join(dir(join(layout.systemdUnitDir, `${common.unitNameFor(layout, service, label)}.d`)), 'zzzzzzzzzz-lifecycle-release.conf'));
    file(join(dir(join(layout.systemdUnitDir, `debateai-preview-runner-retire@${label}.timer.d`)), '50-at.conf'));
    file(join(dir(join(layout.systemdUnitDir, `debateai-preview-runner-retire-check@${label}.timer.d`)), '50-at.conf'));
  }
  /** Every path below `base`, so a test can prove nothing appeared, vanished or changed place. */
  const tree = () => {
    const out: string[] = [];
    const walk = (path: string) => { for (const name of readdirSync(path).sort()) { const full = join(path, name); out.push(full.slice(base.length)); if (lstatSync(full).isDirectory()) walk(full); } };
    walk(base);
    return out;
  };
  return { base, layout, tree, readLock: () => JSON.parse(readFileSync(layout.lockPath, 'utf8')) };
}

const ok = (stdout = '') => ({ code: 0, signal: null, error: undefined, timedOut: false, overflow: false, stdout: Buffer.from(stdout), stderr: Buffer.from('') });
type Options = Partial<{ state: string; current: string | null; units: Record<string, string>; lstat: (path: string) => Promise<unknown>; reloadFails: boolean }>;
/** systemd and the release table behind `deps`; every unit is inactive and disabled unless `units` says otherwise. */
function fakes(s: ReturnType<typeof server>, options: Options = {}) {
  const o = { state: 'RETIRED', current: NEW_KEY as string | null, units: {} as Record<string, string>, reloadFails: false, ...options };
  const shown: string[] = [], systemctl: string[][] = [], asked: string[] = [];
  const run = async (argv: string[], opts: { env: Record<string, string> }) => {
    expect(argv[0]).toBe(common.LAYOUT.systemctl);
    expect(opts.env).toEqual({});
    if (argv[1] === 'show') {
      shown.push(argv[2]!);
      expect(argv.slice(3)).toEqual(['--property=LoadState,ActiveState,UnitFileState', '--no-pager']);
      return ok(o.units[argv[2]!] ?? 'LoadState=loaded\nActiveState=inactive\nUnitFileState=disabled\n');
    }
    systemctl.push(argv.slice(1));
    return o.reloadFails ? { ...ok(), code: 1 } : ok();
  };
  const deps: Record<string, unknown> = {
    run,
    readReleaseState: async ({ releaseKey }: { releaseKey: string }) => { asked.push(releaseKey); return { state: o.state, frontPairStopped: true, retireRequested: false }; },
    readCurrentRelease: async () => (o.current === null ? null : { releaseKey: o.current, takeTrafficFrom: '2026-10-22T01:00:05.000Z' }),
    ...(o.lstat ? { lstat: o.lstat } : {})
  };
  return { deps, shown, systemctl, asked };
}

describe('release-archive.mjs (side-by-side spec §10, plan D12)', () => {
  it("moves exactly the release's folders and files and unpins it", async () => {
    const s = server();
    const f = fakes(s);
    const newBefore = s.tree().filter(path => path.includes(NEW));
    const result = await archive.archiveRelease({ label: OLD, layout: s.layout, deps: f.deps, now: () => NOW });
    const to = `${s.layout.archiveRoot}/${OLD}-${STAMP}`, configTo = `${s.layout.configArchiveRoot}/${OLD}-config-${STAMP}`;
    expect(result).toMatchObject({ event: 'PREVIEW_RELEASE_ARCHIVED', label: OLD, releaseKey: OLD_KEY, to, configTo, skipped: [] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(readdirSync(to).sort()).toEqual([...RELEASE_FOLDERS(OLD), `auth-dev-${OLD}`, `lifecycle-current-${OLD}`].sort());
    expect(readdirSync(configTo).sort()).toEqual([
      `api-${OLD}.env`, `ui-${OLD}.env`, `runner-${OLD}.env`, `native-plan-${OLD}.json`, `database-ahead-${OLD}.json`,
      `debateai-preview-api@${OLD}.service.d`, `debateai-preview-ui@${OLD}.service.d`, `debateai-preview-runner@${OLD}.service.d`,
      `debateai-preview-runner-retire@${OLD}.timer.d`, `debateai-preview-runner-retire-check@${OLD}.timer.d`
    ].sort());
    expect(result.moved).toHaveLength(18);
    // The moved folders keep their contents; both targets are root-only.
    expect(readFileSync(join(to, `auth-dev-candidate-${OLD}-api`, 'package.json'), 'utf8')).toBe('x\n');
    for (const target of [to, configTo]) expect(statSync(target).mode & 0o777).toBe(0o700);
    // Nothing of the other release moved.
    expect(s.tree().filter(path => path.includes(OLD) && !path.includes('/archive/') && !path.includes('/preview-archive/'))).toEqual([]);
    expect(s.tree().filter(path => path.includes(NEW))).toEqual(newBefore);
    expect(newBefore).toHaveLength(31);
    expect(Object.keys(s.readLock().releases)).toEqual([NEW]);
    expect(f.asked.every(key => key === OLD_KEY)).toBe(true);
    expect(f.systemctl).toEqual([['daemon-reload']]);
    expect(f.shown).toEqual([...SERVICES.map(service => `debateai-preview-${service}@${OLD}.service`), `debateai-preview-runner-retire@${OLD}.timer`, `debateai-preview-runner-retire-check@${OLD}.timer`]);
  });

  it('skips and lists a missing source', async () => {
    // A release that never ran beside a newer database has no database-ahead file.
    const s = server();
    const missing = common.databaseAheadPathFor(s.layout, OLD);
    await import('node:fs/promises').then(fs => fs.rename(missing, join(s.base, 'aside.json')));
    const result = await archive.archiveRelease({ label: OLD, layout: s.layout, deps: fakes(s).deps, now: () => NOW });
    expect(result.skipped).toEqual([missing]);
    expect(result.moved).toHaveLength(17);
    expect(result.moved).not.toContain(missing);
  });

  const refusals: [string, (s: ReturnType<typeof server>) => Options, string, (s: ReturnType<typeof server>) => Record<string, unknown>][] = [
    ['not retired', () => ({ state: 'DRAINING' }), 'ARCHIVE_REFUSED', () => ({ fields: ['state'] })],
    ['the current release', () => ({ current: OLD_KEY }), 'ARCHIVE_REFUSED', () => ({ fields: ['current'] })],
    ['an active unit', () => ({ units: { [`debateai-preview-runner@${OLD}.service`]: 'LoadState=loaded\nActiveState=deactivating\nUnitFileState=disabled\n' } }), 'ARCHIVE_REFUSED', () => ({ fields: [`active:debateai-preview-runner@${OLD}.service`] })],
    ['an enabled timer', () => ({ units: { [`debateai-preview-runner-retire@${OLD}.timer`]: 'LoadState=loaded\nActiveState=inactive\nUnitFileState=enabled\n' } }), 'ARCHIVE_REFUSED', () => ({ fields: [`enabled:debateai-preview-runner-retire@${OLD}.timer`] })],
    ['an existing target', s => { mkdirSync(join(s.layout.configArchiveRoot, `${OLD}-config-${STAMP}`), { recursive: true, mode: 0o700 }); chmodSync(s.layout.configArchiveRoot, 0o700); return {}; }, 'ARCHIVE_REFUSED', () => ({ fields: ['configTo'] })],
    ['another device', s => {
      const other = common.envPathFor(s.layout, 'runner', OLD);
      return { lstat: async (path: string) => { const stat = await fsLstat(path); return path === other ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { dev: stat.dev + 1 }) : stat; } };
    }, 'ARCHIVE_CROSS_DEVICE', s => ({ fields: [common.envPathFor(s.layout, 'runner', OLD)] })]
  ];
  it.each(refusals)('refuses %s and moves nothing', async (_name, setup, code, extra) => {
    const s = server();
    const options = setup(s);
    const before = s.tree();
    const lockBefore = readFileSync(s.layout.lockPath, 'utf8');
    const f = fakes(s, options);
    await expect(archive.archiveRelease({ label: OLD, layout: s.layout, deps: f.deps, now: () => NOW })).rejects.toMatchObject({ code, ...extra(s) });
    expect(s.tree()).toEqual(before);
    expect(readFileSync(s.layout.lockPath, 'utf8')).toBe(lockBefore);
    expect(f.systemctl).toEqual([]);
  });

  it('a move failing mid-way names what moved and where, changes nothing else, and a second run finishes the job', async () => {
    const s = server();
    const fs = await import('node:fs/promises');
    let calls = 0;
    const f = fakes(s);
    const flaky = async (from: string, to: string) => { if (++calls === 3) throw Object.assign(new Error('EIO'), { code: 'EIO' }); return fs.rename(from, to); };
    const lockBefore = readFileSync(s.layout.lockPath, 'utf8');
    const to = `${s.layout.archiveRoot}/${OLD}-${STAMP}`, configTo = `${s.layout.configArchiveRoot}/${OLD}-config-${STAMP}`;
    const [first, second, ...rest] = [...archive.sourcesOf(s.layout, OLD).code, ...archive.sourcesOf(s.layout, OLD).config];
    await expect(archive.archiveRelease({ label: OLD, layout: s.layout, deps: { ...f.deps, rename: flaky }, now: () => NOW }))
      .rejects.toMatchObject({ code: 'ARCHIVE_MOVE_FAILED', moved: [first, second], to, configTo });
    expect(readdirSync(to).sort()).toEqual([first!, second!].map(path => path.split('/').at(-1)).sort());
    expect(readdirSync(configTo)).toEqual([]);
    for (const path of rest) expect(existsSync(path), path).toBe(true);
    for (const path of [first!, second!]) expect(existsSync(path), path).toBe(false);
    expect(readFileSync(s.layout.lockPath, 'utf8')).toBe(lockBefore);
    expect(f.systemctl).toEqual([]);
    // Run again a second later: a new stamp, the two already moved are skipped, the rest moves, the label is unpinned.
    const again = fakes(s);
    const result = await archive.archiveRelease({ label: OLD, layout: s.layout, deps: again.deps, now: () => NOW + 1000 });
    expect(result).toMatchObject({ to: `${s.layout.archiveRoot}/${OLD}-20261022T093016Z`, skipped: [first, second], moved: rest });
    for (const path of rest) expect(existsSync(path), path).toBe(false);
    expect(Object.keys(s.readLock().releases)).toEqual([NEW]);
    expect(again.systemctl).toEqual([['daemon-reload']]);
  });

  it('a failed unpin or reload after the moves names every moved source and both targets', async () => {
    const s = server();
    const reload = fakes(s, { reloadFails: true });
    const all = [...archive.sourcesOf(s.layout, OLD).code, ...archive.sourcesOf(s.layout, OLD).config];
    await expect(archive.archiveRelease({ label: OLD, layout: s.layout, deps: reload.deps, now: () => NOW }))
      .rejects.toMatchObject({ code: 'DAEMON_RELOAD_FAILED', moved: all, to: `${s.layout.archiveRoot}/${OLD}-${STAMP}`, configTo: `${s.layout.configArchiveRoot}/${OLD}-config-${STAMP}` });
    expect(all).toHaveLength(18);
    // The unpin ran before the reload, so the label is already gone from the lock.
    expect(Object.keys(s.readLock().releases)).toEqual([NEW]);
    const t = server();
    const unpin = fakes(t);
    const lockBefore = readFileSync(t.layout.lockPath, 'utf8');
    await expect(archive.archiveRelease({ label: OLD, layout: t.layout, deps: { ...unpin.deps, unpinRelease: async () => { throw Object.assign(new Error('RELEASE_LOCK_UNREADABLE'), { code: 'RELEASE_LOCK_UNREADABLE' }); } }, now: () => NOW }))
      .rejects.toMatchObject({ code: 'ARCHIVE_UNPIN_FAILED', detail: 'RELEASE_LOCK_UNREADABLE', moved: all.map(path => path.replace(s.base, t.base)), to: `${t.layout.archiveRoot}/${OLD}-${STAMP}`, configTo: `${t.layout.configArchiveRoot}/${OLD}-config-${STAMP}` });
    expect(readFileSync(t.layout.lockPath, 'utf8')).toBe(lockBefore);
    expect(unpin.systemctl).toEqual([]);
  });

  it('refuses an unreadable unit state, a label that is not a release label, and an unpinned label', async () => {
    const s = server();
    const odd = fakes(s, { units: { [`debateai-preview-api@${OLD}.service`]: 'LoadState=loaded\nActiveState=inactive\nUnitFileState=surprising\n' } });
    await expect(archive.archiveRelease({ label: OLD, layout: s.layout, deps: odd.deps, now: () => NOW })).rejects.toMatchObject({ code: 'UNIT_STATE_UNREADABLE' });
    for (const label of ['../x', 'Old-v1', 'old-', 'a/b', '']) {
      await expect(archive.archiveRelease({ label, layout: s.layout, deps: fakes(s).deps, now: () => NOW })).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    }
    await expect(archive.archiveRelease({ label: 'gone-v1', layout: s.layout, deps: fakes(s).deps, now: () => NOW })).rejects.toMatchObject({ code: 'RELEASE_LOCK_RELEASE_MISSING' });
    expect(existsSync(s.layout.archiveRoot)).toBe(false);
  });

  it('never deletes or copies', async () => {
    const text = readFileSync(new URL('../../deploy/preview-lifecycle/v1/release-archive.mjs', import.meta.url), 'utf8');
    expect(text).not.toMatch(/\b(?:unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|copyFile|copyFileSync|cp|cpSync|truncate|writeFile)\b/u);
    const s = server();
    const renames: [string, string][] = [];
    const fs = await import('node:fs/promises');
    const f = fakes(s);
    const result = await archive.archiveRelease({ label: OLD, layout: s.layout, deps: { ...f.deps, rename: async (from: string, to: string) => { renames.push([from, to]); return fs.rename(from, to); } }, now: () => NOW });
    expect(renames.map(([from]) => from)).toEqual(result.moved);
    for (const [from, to] of renames) expect(to.endsWith(`/${from.split('/').at(-1)}`)).toBe(true);
  });

  it('the CLI takes exactly `archive --label <label>` and refuses anyone but root on Linux', async () => {
    const lines: string[] = [];
    const stream = { write: (line: string) => { lines.push(line); return true; } };
    for (const argv of [['archive'], ['archive', '--label', '../x'], ['archive', '--label', 'v1', 'extra'], ['move', '--label', 'v1'], []]) {
      expect(await archive.main(argv, { platform: 'linux', uid: 0, stdout: stream, stderr: stream })).toBe(1);
    }
    expect(await archive.main(['archive', '--label', 'v1'], { platform: 'darwin', uid: 0, stdout: stream, stderr: stream })).toBe(1);
    expect(lines.map(line => JSON.parse(line).reason)).toEqual(['ARGUMENTS_REFUSED', 'ARGUMENTS_REFUSED', 'ARGUMENTS_REFUSED', 'ARGUMENTS_REFUSED', 'ARGUMENTS_REFUSED', 'ACTOR_REFUSED']);
    expect(lines.every(line => JSON.parse(line).event === 'PREVIEW_RELEASE_ARCHIVE_REFUSED')).toBe(true);
    const s = server();
    lines.length = 0;
    expect(await archive.main(['archive', '--label', OLD], { platform: 'linux', uid: 0, layout: s.layout, deps: fakes(s).deps, now: () => NOW, stdout: stream, stderr: stream })).toBe(0);
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: 'PREVIEW_RELEASE_ARCHIVED', label: OLD });
  });

  it('names the two archive roots in the server layout and moves from prestart\'s releases folder', async () => {
    const prestart = await import('../../deploy/' + 'preview-lifecycle/v1/prestart.mjs');
    expect(archive.sourcesOf(common.LAYOUT, OLD).code[0]).toBe(`${prestart.RELEASES_ROOT}/auth-dev-candidate-${OLD}-api`);
    expect(common.LAYOUT.archiveRoot).toBe('/opt/debateai-v3-preview/archive');
    expect(common.LAYOUT.configArchiveRoot).toBe('/root/preview-archive');
  });
});
