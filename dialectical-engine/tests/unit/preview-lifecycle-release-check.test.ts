// Side-by-side spec §12 step 4 (the read-only release check), §4 (the receipt of a release that retired by itself, and
// no infrastructure maintenance while a release drains) and §5 (a release whose steps are not all n1 expand takes the
// drained path). Every host read goes through `deps`; nothing here touches a server.
import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const check = await import('../../deploy/' + 'preview-lifecycle/v1/release-check.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');
const releaseSwitch = await import('../../deploy/' + 'preview-lifecycle/v1/release-switch.mjs');

const { releaseCheck, releaseStatus, writeRetirementReceipt, maintenanceAllowed, portRefuses, CHECK_NAMES, RECEIPT_SCHEMA, main } = check;
const LAYOUT = common.LAYOUT;
const { gateFilesPathFor, GATE_FILES_SCHEMA } = releaseSwitch;

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const PREV_KEY = ['r18', '00000000aaaa'].join('-');
const OLD_KEY = ['r19', 'd50e33165a1b'].join('-');
const NEW_KEY = ['r20', '0123456789ab'].join('-');
const PREV = 'prev-v1', OLD = 'old-v1', NEW = 'new-v1';
const U = (service: string, label: string) => `debateai-preview-${service}@${label}.service`;
const SWITCHED_AT = '2026-10-22T03:15:05.000Z';
const RETIRED_AT = '2026-10-22T05:40:12.345Z';
const invocation = 'c'.repeat(32);

// Two candidate API source manifests (repository paths, as source-manifest.mjs writes them).
const apiRoot = (label: string) => `/opt/debateai-v3-preview/releases/auth-dev-candidate-${label}-api`;
const row = (path: string, text: string) => ({ path, sha256: sha(text), mode: 0o644 });
const BASE_FILES = [
  row('dialectical-engine/deploy/preview-auth-dev/v1/launch-api.mjs', 'launch api'),
  row('dialectical-engine/deploy/preview-lifecycle/v1/prestart.mjs', 'prestart'),
  row('dialectical-engine/migrations/0123_side_by_side_releases.sql', '-- n1: drained\nSELECT 1;\n'),
  row('dialectical-engine/packages/db/src/index.ts', 'db'),
  row('package.json', '{}')
];
const manifestOf = (label: string, files: { path: string }[]) => ({
  schema: 'preview-auth-dev-source-v3', sourceRoot: apiRoot(label), role: 'api', uid: 1001,
  files: [...files].sort((a, b) => (a.path < b.path ? -1 : 1))
});
const OLDER = manifestOf(OLD, BASE_FILES);
/** Bytes on the newer release's disk, by absolute path (what the check reads for each added migration). */
const disk: Record<string, string> = {};
function withFiles(files: { path: string; sha256?: string; text?: string }[], base: { path: string }[] = BASE_FILES) {
  const added = files.map(file => {
    if (file.text !== undefined) disk[`${apiRoot(NEW)}/${file.path}`] = file.text;
    return { path: file.path, sha256: file.sha256 ?? sha(file.text ?? ''), mode: 0o644 };
  });
  return manifestOf(NEW, [...base.filter(entry => !added.some(file => file.path === entry.path)), ...added]);
}
const withMigration = (name: string, text: string) => withFiles([{ path: `dialectical-engine/migrations/${name}`, text }]);
const N1 = '-- n1: expand\n-- n1: keeps-verifier\n';
const NEWER = withMigration('0124_side_next.sql', `-- 0124 · next\n${N1}ALTER TABLE core.run ADD COLUMN IF NOT EXISTS x int;\n`);

const DEEPINFRA = Object.freeze({ name: 'deepinfra', goSha256: sha('go-di'), folderSha256: sha('folder-di') });
const ANTHROPIC = Object.freeze({ name: 'anthropic', goSha256: sha('go-an'), folderSha256: sha('folder-an') });
const DIGESTS = Object.freeze([DEEPINFRA, ANTHROPIC]);
const canonical = (value: unknown): string => common.canonicalJson(value);

type Release = { key: string; slot: string; state: string; frontPairStopped?: boolean; retireRequested?: boolean; manifest?: object };
type Options = Partial<{
  releases: Record<string, Release>;
  current: string | null;
  gates: Record<string, string>;
  digests: readonly object[];
  snapshot: object | null | 'unreadable';
  connections: { maxConnections: number; reserved: number; inUse: number };
  diskFree: number;
  memAvailableKb: number;
  units: Record<string, string>;
  paths: string[];
  answering: number[];
  lockFails: boolean;
  events: Record<string, { kind: string; recordedAt: string; reason: string | null }[]>;
  runner: Record<string, string>;
  journal: string | 'unreadable';
  jsonJournal: string | 'unreadable';
  alertJournal: string;
  openWork: Record<string, number>;
}>;
const result = (stdout = '', code: number | null = 0) => ({ code, signal: null, error: undefined, timedOut: false, overflow: false, stdout: Buffer.from(stdout), stderr: Buffer.from('') });
const fail = (code: string) => Object.assign(new Error(code), { code });

/** A fake preview host behind `deps`: the lock, the release table, systemd, the journal, the gates, the disk and the network. */
function host(options: Options = {}) {
  const o = {
    releases: {
      [PREV]: { key: PREV_KEY, slot: 'B', state: 'RETIRED' },
      [OLD]: { key: OLD_KEY, slot: 'A', state: 'CURRENT', manifest: OLDER }
    } as Record<string, Release>,
    current: OLD_KEY as string | null,
    gates: {} as Record<string, string>, digests: DIGESTS as readonly object[],
    snapshot: { schema: GATE_FILES_SCHEMA, releaseKey: OLD_KEY, label: OLD, recordedAt: SWITCHED_AT, gates: DIGESTS } as object | null | 'unreadable',
    connections: { maxConnections: 320, reserved: 3, inUse: 60 }, diskFree: 40e9, memAvailableKb: 9 * 1024 * 1024,
    units: {} as Record<string, string>, paths: [] as string[], answering: [] as number[], lockFails: false,
    events: {} as Record<string, { kind: string; recordedAt: string; reason: string | null }[]>,
    runner: { Result: 'success', ExecMainStatus: '0', InvocationID: invocation } as Record<string, string>,
    journal: `a line\nDEBATEAI_RUNNER_RETIRED ${JSON.stringify({ releaseKey: OLD_KEY })}\nPREVIEW_RUNNER_RETIRED\n` as string,
    jsonJournal: '' as string, alertJournal: '', openWork: {} as Record<string, number>,
    ...options
  };
  const log: string[] = [];
  const keyOf = (key: string) => Object.values(o.releases).find(release => release.key === key);
  const units: Record<string, string> = { 'debateai-preview-hatchet.service': 'active', 'debateai-preview-hatchet-gateway.service': 'active' };
  for (const [label, release] of Object.entries(o.releases)) for (const service of ['api', 'ui', 'runner']) units[U(service, label)] = release.state === 'CURRENT' ? 'active' : 'inactive';
  Object.assign(units, o.units);
  const run = async (argv: string[], opts: { env: Record<string, string> }) => {
    expect(opts.env).toEqual({});
    if (argv[0] === LAYOUT.systemctl) {
      expect(argv[1]).toBe('show');
      const unit = argv[2]!, properties = argv[3]!.slice('--property='.length).split(',');
      expect(argv[4]).toBe('--no-pager');
      log.push(`show ${unit} ${properties.join(',')}`);
      const value = (property: string) => (property === 'ActiveState' ? units[unit] ?? 'inactive' : o.runner[property]!);
      return result(properties.map(property => `${property}=${value(property)}\n`).join(''));
    }
    if (argv[0] === LAYOUT.journalctl) {
      log.push(`journal ${argv.slice(1).join(' ')}`);
      if (argv[2]!.startsWith('debateai-preview-alert@')) return result(o.alertJournal);
      const text = argv.includes('json') ? o.jsonJournal : o.journal;
      return text === 'unreadable' ? result('', 1) : result(text);
    }
    throw new Error(`unexpected ${argv.join(' ')}`);
  };
  const deps = {
    run,
    now: () => Date.parse('2026-10-22T08:00:00.000Z'),
    readLock: async () => {
      if (o.lockFails) throw fail('RELEASE_LOCK_UNREADABLE');
      const releases: Record<string, object> = {};
      for (const [label, release] of Object.entries(o.releases)) {
        releases[label] = { releaseKey: release.key, slot: release.slot, databaseAhead: null, services: { api: { sourceManifestSha256: sha(JSON.stringify(release.manifest ?? { label })) } } };
      }
      return { lock: { schema: 'preview-lifecycle-release-lock-v2', releases }, lockSha256: sha('lock') };
    },
    readCurrentRelease: async () => (o.current === null ? null : { releaseKey: o.current, takeTrafficFrom: SWITCHED_AT }),
    readReleaseState: async ({ releaseKey }: { releaseKey: string }) => {
      const release = keyOf(releaseKey);
      return release ? { state: release.state, frontPairStopped: release.frontPairStopped ?? false, retireRequested: release.retireRequested ?? false } : { state: 'UNKNOWN', frontPairStopped: false, retireRequested: false };
    },
    readReleaseEvents: async ({ releaseKey }: { releaseKey: string }) => o.events[releaseKey] ?? [],
    countOpenWork: async ({ releaseKey }: { releaseKey: string }) => o.openWork[releaseKey] ?? 0,
    gateState: async (gate: { name: string }) => o.gates[gate.name] ?? 'active',
    gateFilesDigest: async () => o.digests,
    readGateSnapshot: async (path: string) => {
      log.push(`snapshot ${path}`);
      if (o.snapshot === 'unreadable') throw fail('GATE_SNAPSHOT_UNREADABLE');
      return o.snapshot;
    },
    readConnections: async () => o.connections,
    statfs: async (path: string) => { expect(path).toBe('/'); return { bavail: o.diskFree / 4096, bsize: 4096 }; },
    readMeminfo: async () => `MemTotal:       16384000 kB\nMemFree:          100000 kB\nMemAvailable:   ${o.memAvailableKb} kB\n`,
    pathExists: async (path: string) => o.paths.includes(path),
    portRefuses: async (port: number) => { log.push(`port ${port}`); return !o.answering.includes(port); },
    readSourceFile: async ({ root, path }: { root: string; path: string }) => {
      const absolute = `${root}/${path}`;
      if (!Object.hasOwn(disk, absolute)) throw fail('ENOENT');
      return Buffer.from(disk[absolute]!);
    }
  };
  return { deps, log };
}
const input = (overrides: Record<string, unknown> = {}, options: Options = {}) => {
  const fake = host(options);
  return { fake, args: { label: NEW, olderManifest: OLDER, newerManifest: NEWER, gateRowsReviewed: null, lifecycleReviewed: false, layout: LAYOUT, deps: fake.deps, ...overrides } };
};
const run = async (overrides: Record<string, unknown> = {}, options: Options = {}) => {
  const { args } = input(overrides, options);
  return releaseCheck(args);
};
const named = (r: { checks: readonly { name: string }[] }, name: string) => r.checks.find(entry => entry.name === name);
const failing = (r: { checks: readonly { name: string; ok: boolean }[] }) => r.checks.filter(entry => !entry.ok).map(entry => entry.name);

describe('the release check (side-by-side spec §12 step 4)', () => {
  it('says SIDE_BY_SIDE only when every check passes', async () => {
    const { fake, args } = input();
    const r = await releaseCheck(args);
    expect(r.event).toBe('PREVIEW_RELEASE_CHECK');
    expect(r.label).toBe(NEW);
    expect(r.verdict).toBe('SIDE_BY_SIDE');
    expect(r.checks.map((entry: { name: string }) => entry.name)).toEqual(CHECK_NAMES);
    expect(CHECK_NAMES).toEqual(['N1_HEADERS', 'CURRENT_PINNED', 'PREVIOUS_RETIRED', 'GATES_ACTIVE', 'GATE_ROWS_N1', 'CONNECTIONS', 'DISK', 'MEMORY', 'HATCHET', 'NO_MAINTENANCE', 'SLOT_FREE', 'LIFECYCLE_FILES']);
    expect(failing(r)).toEqual([]);
    expect(named(r, 'N1_HEADERS')).toEqual({ name: 'N1_HEADERS', ok: true, detail: 'new: 0124_side_next.sql' });
    expect(named(r, 'SLOT_FREE')).toMatchObject({ ok: true, detail: 'slot B' });
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.checks)).toBe(true);
    expect(Object.isFrozen(r.checks[0])).toBe(true);
    // The spare slot is the one the current release does not use; its two ports are asked, nothing else is.
    expect(fake.log.filter(line => line.startsWith('port '))).toEqual(['port 3200', 'port 3201']);
    expect(fake.log).toContain(`snapshot ${gateFilesPathFor(LAYOUT, OLD_KEY)}`);
    // Read-only: systemctl is only ever asked to show, and nothing is written.
    expect(fake.log.every(line => line.startsWith('show ') || line.startsWith('port ') || line.startsWith('snapshot '))).toBe(true);
  });

  it('passes a release that adds no migration', async () => {
    const r = await run({ newerManifest: manifestOf(NEW, BASE_FILES) });
    expect(r.verdict).toBe('SIDE_BY_SIDE');
    expect(named(r, 'N1_HEADERS')).toEqual({ name: 'N1_HEADERS', ok: true, detail: 'no new migrations' });
  });

  it('sends a release with a migration that is not n1: expand to the drained path, naming it', async () => {
    const r = await run({ newerManifest: withMigration('0124_drop_old.sql', '-- n1: keeps-verifier\nDROP TABLE x;') });
    expect(r.verdict).toBe('DRAINED_PATH');
    expect(r.checks.find((c: { name: string }) => c.name === 'N1_HEADERS')).toMatchObject({ ok: false, detail: '0124_drop_old.sql' });
  });

  it('names every added migration that lacks either line, and wins over any other failing check', async () => {
    const r = await run({
      newerManifest: withFiles([
        { path: 'dialectical-engine/migrations/0124_ok.sql', text: `${N1}SELECT 1;` },
        { path: 'dialectical-engine/migrations/0125_no_verifier.sql', text: '-- n1: expand\nSELECT 1;' },
        { path: 'dialectical-engine/migrations/0126_late_header.sql', text: `SELECT 1;\n${N1}` }
      ])
    }, { gates: { deepinfra: 'halted' } });
    expect(r.verdict).toBe('DRAINED_PATH');
    expect(named(r, 'N1_HEADERS')).toMatchObject({ ok: false, detail: '0125_no_verifier.sql, 0126_late_header.sql' });
    expect(failing(r)).toEqual(['N1_HEADERS', 'GATES_ACTIVE']);
  });

  it('refuses migration bytes on disk that are not the bytes the newer manifest names', async () => {
    const path = 'dialectical-engine/migrations/0124_swapped.sql';
    disk[`${apiRoot(NEW)}/${path}`] = `${N1}DROP TABLE x;`;
    const newer = withFiles([{ path, sha256: sha(`${N1}SELECT 1;`) }]);
    await expect(run({ newerManifest: newer })).rejects.toMatchObject({ code: 'MIGRATION_BYTES_MISMATCH' });
    await expect(run({ newerManifest: withFiles([{ path: 'dialectical-engine/migrations/0124_missing.sql', sha256: sha('x') }]) })).rejects.toMatchObject({ code: 'MIGRATION_UNREADABLE' });
  });

  it('refuses a newer release that drops or edits a migration of the older one', async () => {
    const edited = withFiles([{ path: 'dialectical-engine/migrations/0123_side_by_side_releases.sql', text: '-- n1: drained\nSELECT 2;\n' }]);
    await expect(run({ newerManifest: edited })).rejects.toMatchObject({ code: 'DATABASE_AHEAD_NOT_A_SUPERSET' });
  });

  it('refuses inputs that are not this release, a label, a reviewed hash or a yes', async () => {
    await expect(run({ newerManifest: manifestOf('other-v1', BASE_FILES) })).rejects.toMatchObject({ code: 'NEWER_MANIFEST_REFUSED' });
    await expect(run({ newerManifest: { ...NEWER, sourceRoot: `${apiRoot(NEW).slice(0, -4)}-ui` } })).rejects.toMatchObject({ code: 'NEWER_MANIFEST_REFUSED' });
    await expect(run({ olderManifest: { ...OLDER, sourceRoot: '/tmp/x' } })).rejects.toMatchObject({ code: 'OLDER_MANIFEST_REFUSED' });
    await expect(run({ olderManifest: manifestOf(NEW, BASE_FILES) })).rejects.toMatchObject({ code: 'OLDER_MANIFEST_REFUSED' });
    await expect(run({ label: 'New_v1' })).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    await expect(run({ label: 'a'.repeat(65) })).rejects.toMatchObject({ code: 'RELEASE_LABEL_TOO_LONG' });
    await expect(run({ gateRowsReviewed: 'abc' })).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
    await expect(run({ lifecycleReviewed: 'yes' })).rejects.toMatchObject({ code: 'ARGUMENTS_REFUSED' });
  });

  it('NOT_READY when CURRENT_PINNED fails: no current release, a current release nobody pinned, or an older manifest that is not its own', async () => {
    for (const [overrides, options, detail] of [
      [{}, { current: null }, 'NO_CURRENT_RELEASE'],
      [{}, { current: ['r21', 'ffffffffffff'].join('-') }, 'CURRENT_NOT_PINNED'],
      [{ olderManifest: { ...OLDER, uid: 1002 } }, {}, 'OLDER_MANIFEST_NOT_CURRENT']
    ] as [Record<string, unknown>, Options, string][]) {
      const r = await run(overrides, options);
      expect(r.verdict).toBe('NOT_READY');
      expect(named(r, 'CURRENT_PINNED')).toMatchObject({ ok: false, detail });
    }
  });

  const breaks: Record<string, Options | { overrides: Record<string, unknown> }> = {
    PREVIOUS_RETIRED: { releases: { [PREV]: { key: PREV_KEY, slot: 'B', state: 'DRAINING' }, [OLD]: { key: OLD_KEY, slot: 'A', state: 'CURRENT', manifest: OLDER } } },
    GATES_ACTIVE: { gates: { anthropic: 'halted' } },
    GATE_ROWS_N1: { digests: [{ ...DEEPINFRA, goSha256: sha('changed go') }, ANTHROPIC] },
    CONNECTIONS: { connections: { maxConnections: 200, reserved: 3, inUse: 10 } },
    DISK: { diskFree: 14.9e9 },
    MEMORY: { memAvailableKb: 4 * 1024 * 1024 - 1 },
    HATCHET: { units: { 'debateai-preview-hatchet-gateway.service': 'activating' } },
    NO_MAINTENANCE: { paths: ['/etc/debateai-v3-preview/lifecycle/maintenance-pending'] },
    SLOT_FREE: { answering: [3201] },
    LIFECYCLE_FILES: { overrides: { newerManifest: withFiles([{ path: 'dialectical-engine/deploy/preview-lifecycle/v1/prestart.mjs', text: 'prestart 2' }], NEWER.files) } }
  };
  it.each(['PREVIOUS_RETIRED', 'GATES_ACTIVE', 'GATE_ROWS_N1', 'CONNECTIONS', 'DISK', 'MEMORY', 'HATCHET', 'NO_MAINTENANCE', 'SLOT_FREE', 'LIFECYCLE_FILES'])('NOT_READY when %s fails', async name => {
    const broken = breaks[name]!;
    const r = 'overrides' in broken ? await run(broken.overrides as Record<string, unknown>) : await run({}, broken as Options);
    expect(r.verdict).toBe('NOT_READY');
    expect(failing(r)).toEqual([name]);
  });

  it('reads each failing condition into a plain detail', async () => {
    const draining = await run({}, { releases: { [PREV]: { key: PREV_KEY, slot: 'B', state: 'DRAINING' }, [OLD]: { key: OLD_KEY, slot: 'A', state: 'CURRENT', manifest: OLDER } } });
    expect(named(draining, 'PREVIOUS_RETIRED')).toMatchObject({ detail: `${PREV}: DRAINING` });
    expect(named(await run({}, { gates: { deepinfra: 'halted', anthropic: 'unknown' } }), 'GATES_ACTIVE')).toMatchObject({ detail: 'deepinfra: halted, anthropic: unknown' });
    expect(named(await run({}, { connections: { maxConnections: 320, reserved: 3, inUse: 198 } }), 'CONNECTIONS')).toMatchObject({ ok: false, detail: 'max 320, free 119' });
    expect(named(await run({}, { connections: { maxConnections: 320, reserved: 3, inUse: 197 } }), 'CONNECTIONS')).toMatchObject({ ok: true, detail: 'max 320, free 120' });
    expect(named(await run({}, { diskFree: 15e9 }), 'DISK')).toMatchObject({ ok: true });
    expect(named(await run({}, { memAvailableKb: 4 * 1024 * 1024 }), 'MEMORY')).toMatchObject({ ok: true });
    expect(named(await run({}, { paths: ['/run/reboot-required'] }), 'NO_MAINTENANCE')).toMatchObject({ ok: false, detail: 'reboot required' });
    const busy = await run({}, { answering: [3200], units: { [U('runner', NEW)]: 'activating' } });
    expect(named(busy, 'SLOT_FREE')).toMatchObject({ ok: false, detail: `port 3200 answers, ${U('runner', NEW)} activating` });
    expect(named(await run({}, { lockFails: true }), 'PREVIOUS_RETIRED')).toMatchObject({ ok: false, detail: 'RELEASE_LOCK_UNREADABLE' });
  });

  it('takes the spare slot from the current release, and refuses a new label pinned in the current one', async () => {
    const onB = await run({}, { releases: { [PREV]: { key: PREV_KEY, slot: 'A', state: 'RETIRED' }, [OLD]: { key: OLD_KEY, slot: 'B', state: 'CURRENT', manifest: OLDER } } });
    expect(named(onB, 'SLOT_FREE')).toMatchObject({ ok: true, detail: 'slot A' });
    const pinned = await run({}, { releases: { [OLD]: { key: OLD_KEY, slot: 'A', state: 'CURRENT', manifest: OLDER }, [NEW]: { key: NEW_KEY, slot: 'A', state: 'STAGED' } } });
    expect(failing(pinned)).toEqual(['SLOT_FREE']);
    expect(named(pinned, 'SLOT_FREE')).toMatchObject({ detail: `${NEW} pinned in slot A` });
  });

  it('accepts changed gate rows only with the reviewed hash of exactly these files', async () => {
    const changed = [{ ...DEEPINFRA, folderSha256: sha('new gate code') }, ANTHROPIC];
    const reviewed = sha(canonical(changed));
    const refused = await run({}, { digests: changed });
    expect(named(refused, 'GATE_ROWS_N1')).toEqual({ name: 'GATE_ROWS_N1', ok: false, detail: `changed since the switch: review ${reviewed}` });
    const accepted = await run({ gateRowsReviewed: reviewed }, { digests: changed });
    expect(accepted.verdict).toBe('SIDE_BY_SIDE');
    expect(named(accepted, 'GATE_ROWS_N1')).toMatchObject({ ok: true, detail: `reviewed ${reviewed}` });
    // A hash reviewed for other bytes does not cover these.
    const other = await run({ gateRowsReviewed: sha(canonical(DIGESTS)) }, { digests: changed });
    expect(named(other, 'GATE_ROWS_N1')).toMatchObject({ ok: false });
    // Unchanged since the switch needs no review.
    expect(named(await run(), 'GATE_ROWS_N1')).toMatchObject({ ok: true, detail: 'unchanged since the switch' });
  });

  it('without a snapshot of the last switch, only the reviewed hash passes the gate rows', async () => {
    const reviewed = sha(canonical(DIGESTS));
    for (const snapshot of [null, { schema: GATE_FILES_SCHEMA, releaseKey: PREV_KEY, label: PREV, recordedAt: SWITCHED_AT, gates: DIGESTS }, { schema: 'other', gates: DIGESTS }] as const) {
      expect(named(await run({}, { snapshot }), 'GATE_ROWS_N1')).toMatchObject({ ok: false, detail: `no snapshot of the switch: review ${reviewed}` });
      expect(named(await run({ gateRowsReviewed: reviewed }, { snapshot }), 'GATE_ROWS_N1')).toMatchObject({ ok: true });
    }
    expect(named(await run({}, { snapshot: 'unreadable' }), 'GATE_ROWS_N1')).toMatchObject({ ok: false, detail: 'GATE_SNAPSHOT_UNREADABLE' });
  });

  it('passes changed lifecycle files only once the owner reviewed them', async () => {
    const newer = withFiles([
      { path: 'dialectical-engine/deploy/preview-auth-dev/v1/launch-api.mjs', text: 'launch api 2' },
      { path: 'dialectical-engine/deploy/preview-lifecycle/v1/release-check.mjs', text: 'new file' },
      // release-switch.mjs imports caddy-slots.mjs from the release folder: the server runs it from the same shared copy.
      { path: 'dialectical-engine/deploy/preview-release/v1/caddy-slots.mjs', text: 'caddy slots 2' },
      { path: 'dialectical-engine/packages/db/src/index.ts', text: 'db 2' }
    ], NEWER.files);
    expect(check.LIFECYCLE_FOLDERS).toEqual(['dialectical-engine/deploy/preview-lifecycle/', 'dialectical-engine/deploy/preview-auth-dev/', 'dialectical-engine/deploy/preview-release/']);
    const refused = await run({ newerManifest: newer });
    expect(named(refused, 'LIFECYCLE_FILES')).toEqual({ name: 'LIFECYCLE_FILES', ok: false,
      detail: 'changed: dialectical-engine/deploy/preview-auth-dev/v1/launch-api.mjs, dialectical-engine/deploy/preview-lifecycle/v1/release-check.mjs, dialectical-engine/deploy/preview-release/v1/caddy-slots.mjs' });
    const removed = await run({ newerManifest: manifestOf(NEW, NEWER.files.filter(file => !file.path.endsWith('prestart.mjs'))) });
    expect(named(removed, 'LIFECYCLE_FILES')).toMatchObject({ ok: false, detail: 'changed: dialectical-engine/deploy/preview-lifecycle/v1/prestart.mjs' });
    const reviewed = await run({ newerManifest: newer, lifecycleReviewed: true });
    expect(reviewed.verdict).toBe('SIDE_BY_SIDE');
    expect(named(reviewed, 'LIFECYCLE_FILES')).toMatchObject({ ok: true, detail: 'changed (reviewed): 3 files' });
    expect(named(await run(), 'LIFECYCLE_FILES')).toMatchObject({ ok: true, detail: 'unchanged' });
  });

  it('reads the connection headroom through psql as postgres, the SQL on stdin', async () => {
    const calls: { argv: string[]; stdin: string }[] = [];
    const { args } = input();
    const deps: Record<string, unknown> = { ...args.deps };
    delete deps.readConnections;
    const baseRun = deps.run as (argv: string[], opts: { env: Record<string, string> }) => Promise<unknown>;
    deps.run = async (argv: string[], opts: { env: Record<string, string>; stdin?: Buffer }) => {
      if (!argv.includes('postgres')) return baseRun(argv, opts);
      calls.push({ argv, stdin: opts.stdin!.toString('utf8') });
      return result('320|3|42\n');
    };
    expect(named(await releaseCheck({ ...args, deps }), 'CONNECTIONS')).toMatchObject({ ok: true, detail: 'max 320, free 275' });
    expect(calls[0]!.argv.slice(0, 4)).toEqual(['/usr/sbin/runuser', '-u', 'postgres', '--']);
    expect(calls[0]!.stdin).toContain("current_setting('max_connections')");
    deps.run = async (argv: string[], opts: { env: Record<string, string> }) => (argv.includes('postgres') ? result('SET\n320|3|42\n') : baseRun(argv, opts));
    expect(named(await releaseCheck({ ...args, deps }), 'CONNECTIONS')).toMatchObject({ ok: false, detail: 'CONNECTIONS_UNREADABLE' });
  });

  it('asks a port with a real loopback connect: a listener answers, a closed port refuses', async () => {
    const server = createServer(socket => socket.destroy());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    expect(await portRefuses(port)).toBe(false);
    await new Promise<void>(resolve => server.close(() => resolve()));
    expect(await portRefuses(port)).toBe(true);
  });
});

describe('status, maintenance and the retirement receipt (side-by-side spec §4)', () => {
  it('lists every pinned release with its state, units and open work', async () => {
    const { deps } = host({
      releases: { [OLD]: { key: OLD_KEY, slot: 'A', state: 'DRAINING', frontPairStopped: true, retireRequested: false }, [NEW]: { key: NEW_KEY, slot: 'B', state: 'CURRENT' } },
      units: { [U('runner', OLD)]: 'active' }, openWork: { [OLD_KEY]: 3 }
    });
    const status = await releaseStatus({ layout: LAYOUT, deps });
    expect(status).toEqual([
      { label: OLD, releaseKey: OLD_KEY, slot: 'A', state: 'DRAINING', frontPairStopped: true, retireRequested: false, units: { api: 'inactive', ui: 'inactive', runner: 'active' }, openWork: 3 },
      { label: NEW, releaseKey: NEW_KEY, slot: 'B', state: 'CURRENT', frontPairStopped: false, retireRequested: false, units: { api: 'active', ui: 'active', runner: 'active' }, openWork: 0 }
    ]);
    expect(Object.isFrozen(status)).toBe(true);
    expect(Object.isFrozen(status[0])).toBe(true);
  });

  it('refuses infrastructure maintenance while a release is draining', async () => {
    const { deps } = host({ releases: { [OLD]: { key: OLD_KEY, slot: 'A', state: 'DRAINING' }, [NEW]: { key: NEW_KEY, slot: 'B', state: 'CURRENT' } } });
    await expect(maintenanceAllowed({ layout: LAYOUT, deps })).rejects.toMatchObject({ code: 'MAINTENANCE_REFUSED_DRAINING', fields: { labels: [OLD] } });
    const quiet = host({ releases: { [OLD]: { key: OLD_KEY, slot: 'A', state: 'RETIRED' }, [NEW]: { key: NEW_KEY, slot: 'B', state: 'CURRENT' } } });
    expect(await maintenanceAllowed({ layout: LAYOUT, deps: quiet.deps })).toEqual({ event: 'PREVIEW_MAINTENANCE_ALLOWED', releases: [{ label: OLD, state: 'RETIRED' }, { label: NEW, state: 'CURRENT' }] });
  });

  const folders: string[] = [];
  afterAll(() => { for (const folder of folders) rmSync(folder, { recursive: true, force: true }); });
  const uid = process.getuid!(), gid = process.getgid!();
  const ownLayout = { ...LAYOUT, ownerUid: uid, ownerGid: gid };
  function rootOnlyFolder(mode = 0o700) {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'release-check-receipt-')));
    folders.push(base);
    const folder = join(base, 'session');
    mkdirSync(folder, { mode });
    chmodSync(folder, mode);
    return folder;
  }
  const RETIRED_EVENTS = [
    { kind: 'STAGED', recordedAt: '2026-10-20T01:00:00.000Z', reason: null },
    { kind: 'CURRENT', recordedAt: '2026-10-20T01:10:00.000Z', reason: null },
    { kind: 'DRAINING', recordedAt: SWITCHED_AT, reason: null },
    { kind: 'FRONT_PAIR_STOPPED', recordedAt: '2026-10-22T03:15:20.000Z', reason: null },
    { kind: 'RETIRED', recordedAt: RETIRED_AT, reason: 'RUNNER_RETIRED' }
  ];
  const retiredHost = (options: Options = {}) => host({
    releases: { [OLD]: { key: OLD_KEY, slot: 'A', state: 'RETIRED' }, [NEW]: { key: NEW_KEY, slot: 'B', state: 'CURRENT' } },
    events: { [OLD_KEY]: RETIRED_EVENTS }, ...options
  });

  it('writes a retirement receipt only for a cleanly retired release', async () => {
    const out = join(rootOnlyFolder(), 'retirement-receipt.json');
    const { deps, log } = retiredHost();
    const written = await writeRetirementReceipt({ label: OLD, out, layout: ownLayout, deps });
    const bytes = readFileSync(out);
    expect(written).toEqual({ event: 'PREVIEW_RELEASE_RECEIPT_WRITTEN', label: OLD, releaseKey: OLD_KEY, out, sha256: sha(bytes.toString('utf8')) });
    expect(statSync(out).mode & 0o777).toBe(0o600);
    expect(JSON.parse(bytes.toString('utf8'))).toEqual({
      schema: RECEIPT_SCHEMA, label: OLD, releaseKey: OLD_KEY, switchedAt: SWITCHED_AT, retiredAt: RETIRED_AT, retiredReason: 'RUNNER_RETIRED',
      runner: { unit: U('runner', OLD), invocationId: invocation, evidence: 'systemd', result: 'success', execMainStatus: 0, retiredLines: true },
      alertRunsSinceSwitch: 0, writtenAt: '2026-10-22T08:00:00.000Z'
    });
    expect(log).toContain(`journal -u ${U('runner', OLD)} _SYSTEMD_INVOCATION_ID=${invocation} -n 500 -o cat --no-pager`);
    expect(log).toContain(`journal -u debateai-preview-alert@${U('runner', OLD)}.service --since=@${Date.parse(SWITCHED_AT) / 1000} -q -o cat --no-pager`);
  });

  it.each([
    ['a release that is not retired', { releases: { [OLD]: { key: OLD_KEY, slot: 'A', state: 'DRAINING' } } }, 'RECEIPT_NOT_RETIRED'],
    ['a release that never drained (retired before a switch)', { events: { [OLD_KEY]: [{ kind: 'STAGED', recordedAt: SWITCHED_AT, reason: null }, { kind: 'RETIRED', recordedAt: RETIRED_AT, reason: 'NOT_SWITCHED' }] } }, 'RECEIPT_NO_SWITCH'],
    ['a runner that failed', { runner: { Result: 'exit-code', ExecMainStatus: '1', InvocationID: invocation } }, 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a runner that exited 0 but was stopped by a signal result', { runner: { Result: 'signal', ExecMainStatus: '0', InvocationID: invocation } }, 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a runner systemd no longer remembers and the journal has no entry of', { runner: { Result: 'success', ExecMainStatus: '0', InvocationID: '' } }, 'RECEIPT_RUNNER_INVOCATION_UNKNOWN'],
    ['a runner whose invocation id is not one', { runner: { Result: 'success', ExecMainStatus: '0', InvocationID: 'not-an-id' } }, 'RECEIPT_RUNNER_INVOCATION_UNKNOWN'],
    ['a runner without its retirement lines (the drained path)', { journal: 'a line\n' }, 'RECEIPT_RETIRED_LINES_MISSING'],
    ['a journal that cannot be read', { journal: 'unreadable' }, 'RECEIPT_JOURNAL_UNREADABLE'],
    ['a runner that sent the owner a failure email since the switch', { alertJournal: 'Started debateai-preview-alert@….\n' }, 'RECEIPT_ALERT_SENT']
  ] as [string, Options, string][])('refuses the receipt for %s', async (_case, options, code) => {
    const out = join(rootOnlyFolder(), 'retirement-receipt.json');
    const { deps } = retiredHost(options);
    await expect(writeRetirementReceipt({ label: OLD, out, layout: ownLayout, deps })).rejects.toMatchObject({ code });
    expect(() => statSync(out)).toThrow();
  });

  // systemd unloads a stopped template instance after a clean exit: `systemctl show` then prints defaults with an empty
  // InvocationID, and the evidence comes from the journal (D11 review). Entries as `journalctl -o json` prints them.
  const RUNNER = U('runner', OLD);
  const LAST = 'd'.repeat(32), EARLIER = 'e'.repeat(32), NEXT = 'a'.repeat(32);
  const SUCCESS_ID = '7ad2d189f7e94e70a38c781354912448', FAILED_ID = 'd9b373ed55a64feb8242e02dbe79a49c', EXIT_ID = '98e322203f7a4ed290d09fe03c09fe15';
  const STARTED_ID = '39f53479d3a045ac8e11786248231fbf', RESOURCES_ID = 'ae8f7b866b0347b9af31fe1c80b127c0';
  const entry = (fields: Record<string, unknown>) => JSON.stringify({ __CURSOR: 's=1;i=2', __REALTIME_TIMESTAMP: '1761103212345678', _BOOT_ID: 'f'.repeat(32), ...fields });
  const out_ = (message: unknown, extra: Record<string, unknown> = {}) => entry({ _SYSTEMD_UNIT: RUNNER, _SYSTEMD_INVOCATION_ID: LAST, _PID: '4242', _UID: '998', MESSAGE: message, ...extra });
  const pid1 = (messageId: string, message: string, extra: Record<string, unknown> = {}) => entry({ _PID: '1', _UID: '0', _SYSTEMD_UNIT: 'init.scope', UNIT: RUNNER, INVOCATION_ID: LAST, MESSAGE_ID: messageId, MESSAGE: `${RUNNER}: ${message}`, ...extra });
  const recorded = (fields: Record<string, unknown> = {}) => JSON.stringify({ event: 'PREVIEW_RELEASE_STOP_RECORDED', service: 'runner', label: OLD, releaseKey: OLD_KEY, recorded: 'RETIRED', state: 'DRAINING', ...fields });
  const RETIRED_LINE = out_(`DEBATEAI_RUNNER_RETIRED ${JSON.stringify({ releaseKey: OLD_KEY })}`), PREVIEW_LINE = out_('PREVIEW_RUNNER_RETIRED');
  const STOP_RECORDED = out_(recorded(), { _PID: '4300', _UID: '0' });
  const SUCCESS = pid1(SUCCESS_ID, 'Deactivated successfully.');
  const CLEAN_RUN = [
    pid1(STARTED_ID, 'Started debateai-preview-runner@old-v1.service.'),
    out_('a line'), out_([104, 105]), out_(null), entry({ _SYSTEMD_UNIT: RUNNER, _SYSTEMD_INVOCATION_ID: LAST }),
    RETIRED_LINE, PREVIEW_LINE, STOP_RECORDED, SUCCESS, pid1(RESOURCES_ID, 'Consumed 2min 3.456s CPU time.')
  ];
  const EARLIER_FAILED_RUN = [out_('an earlier run', { _SYSTEMD_INVOCATION_ID: EARLIER }), pid1(FAILED_ID, 'Failed with result \'exit-code\'.', { INVOCATION_ID: EARLIER })];
  const without = (...dropped: string[]) => CLEAN_RUN.filter(line => !dropped.includes(line));
  const forgotten = (entries: string[] | 'unreadable', runner: Record<string, string> = {}): Options => ({
    runner: { Result: 'success', ExecMainStatus: '0', InvocationID: '', ...runner },
    jsonJournal: entries === 'unreadable' ? entries : `${entries.join('\n')}\n`
  });

  it('takes the evidence from the journal when systemd has unloaded the stopped runner', async () => {
    const out = join(rootOnlyFolder(), 'retirement-receipt.json');
    const { deps, log } = retiredHost(forgotten([...EARLIER_FAILED_RUN, ...CLEAN_RUN]));
    await writeRetirementReceipt({ label: OLD, out, layout: ownLayout, deps });
    expect(JSON.parse(readFileSync(out, 'utf8')).runner).toEqual({ unit: RUNNER, invocationId: LAST, evidence: 'journal', result: 'success', execMainStatus: 0, retiredLines: true });
    expect(log).toContain(`journal -u ${RUNNER} -n 1000 -o json --output-fields=MESSAGE,MESSAGE_ID,UNIT,INVOCATION_ID,_SYSTEMD_UNIT,_SYSTEMD_INVOCATION_ID,_PID,_UID,EXIT_CODE,EXIT_STATUS -q --no-pager`);
    expect(log.some(line => line.includes('_SYSTEMD_INVOCATION_ID='))).toBe(false);
    expect(log).toContain(`journal -u debateai-preview-alert@${RUNNER}.service --since=@${Date.parse(SWITCHED_AT) / 1000} -q -o cat --no-pager`);
  });

  it.each([
    ['a journal showing the unit failed', [...without(SUCCESS), pid1(FAILED_ID, 'Failed with result \'exit-code\'.')], 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a main process that exited 1', [...without(SUCCESS), pid1(EXIT_ID, 'Main process exited, code=exited, status=1/FAILURE', { EXIT_CODE: 'exited', EXIT_STATUS: '1' }), SUCCESS], 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a main process a signal ended (systemd still says success)', [...without(SUCCESS), pid1(EXIT_ID, 'Main process exited, code=killed, status=15/TERM', { EXIT_CODE: 'killed', EXIT_STATUS: '15' }), SUCCESS], 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a last run without PID 1\'s success message', without(SUCCESS), 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a success message of an earlier run only', [pid1(SUCCESS_ID, 'Deactivated successfully.', { INVOCATION_ID: EARLIER }), ...without(SUCCESS)], 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a success message the runner wrote itself', [...without(SUCCESS), out_('Deactivated successfully.', { UNIT: RUNNER, INVOCATION_ID: LAST, MESSAGE_ID: SUCCESS_ID })], 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a last run the stop recorder did not record as RETIRED', without(STOP_RECORDED), 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a RETIRED record the runner printed itself (not root)', [...without(STOP_RECORDED, SUCCESS), out_(recorded()), SUCCESS], 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a RETIRED record of another release', [...without(STOP_RECORDED, SUCCESS), out_(recorded({ releaseKey: NEW_KEY }), { _UID: '0' }), SUCCESS], 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a last run without its retirement lines', without(RETIRED_LINE, PREVIEW_LINE), 'RECEIPT_RETIRED_LINES_MISSING'],
    ['retirement lines of an earlier run only', [out_('PREVIEW_RUNNER_RETIRED', { _SYSTEMD_INVOCATION_ID: EARLIER }), out_(`DEBATEAI_RUNNER_RETIRED ${JSON.stringify({ releaseKey: OLD_KEY })}`, { _SYSTEMD_INVOCATION_ID: EARLIER }), ...without(RETIRED_LINE, PREVIEW_LINE)], 'RECEIPT_RETIRED_LINES_MISSING'],
    ['a clean run followed by a newer run that has not ended', [...CLEAN_RUN, pid1(STARTED_ID, 'Started debateai-preview-runner@old-v1.service.', { INVOCATION_ID: NEXT }), out_('starting', { _SYSTEMD_INVOCATION_ID: NEXT })], 'RECEIPT_RUNNER_NOT_CLEAN'],
    ['a newest entry that is no run of the unit (a core dump)', [...CLEAN_RUN, entry({ _PID: '777', _UID: '0', _SYSTEMD_UNIT: 'systemd-coredump@0-777-0.service', COREDUMP_UNIT: RUNNER, MESSAGE_ID: 'fc2e22bc6ee647b6b90729ab34a250b1', MESSAGE: 'Process 4242 (node) dumped core.' })], 'RECEIPT_RUNNER_INVOCATION_UNKNOWN'],
    ['a newest PID 1 entry without an invocation id', [...CLEAN_RUN, entry({ _PID: '1', UNIT: RUNNER, MESSAGE: 'no id' })], 'RECEIPT_RUNNER_INVOCATION_UNKNOWN'],
    ['a journal that cannot be read', 'unreadable', 'RECEIPT_JOURNAL_UNREADABLE'],
    ['a journal line that is not JSON', [...CLEAN_RUN.slice(0, -1), 'not json'], 'RECEIPT_JOURNAL_UNREADABLE'],
    ['a journal line that is not an entry', [...CLEAN_RUN, '[1,2]'], 'RECEIPT_JOURNAL_UNREADABLE']
  ] as [string, string[] | 'unreadable', string][])('refuses the receipt from the journal for %s', async (_case, entries, code) => {
    const out = join(rootOnlyFolder(), 'retirement-receipt.json');
    const { deps } = retiredHost(forgotten(entries));
    await expect(writeRetirementReceipt({ label: OLD, out, layout: ownLayout, deps })).rejects.toMatchObject({ code });
    expect(() => statSync(out)).toThrow();
  });

  it('names the failure message it found, and still refuses a forgotten unit whose defaults are not clean', async () => {
    const out = join(rootOnlyFolder(), 'retirement-receipt.json');
    const failed = retiredHost(forgotten([...without(SUCCESS), pid1(FAILED_ID, 'Failed with result \'exit-code\'.')]));
    await expect(writeRetirementReceipt({ label: OLD, out, layout: ownLayout, deps: failed.deps })).rejects.toMatchObject({ code: 'RECEIPT_RUNNER_NOT_CLEAN', fields: { source: 'journal', messageId: FAILED_ID } });
    const notClean = retiredHost(forgotten(CLEAN_RUN, { Result: 'exit-code', ExecMainStatus: '1' }));
    await expect(writeRetirementReceipt({ label: OLD, out, layout: ownLayout, deps: notClean.deps })).rejects.toMatchObject({ code: 'RECEIPT_RUNNER_NOT_CLEAN', fields: { result: 'exit-code', execMainStatus: '1' } });
  });

  it('never replaces a file that appears after the folder check (link, not rename)', async () => {
    const folder = rootOnlyFolder();
    const out = join(folder, 'retirement-receipt.json');
    writeFileSync(out, 'kept');
    const options = { mode: 0o600, uid, gid };
    await expect(check.writeNewFile(out, Buffer.from('new'), options)).rejects.toMatchObject({ code: 'RECEIPT_OUTPUT_EXISTS' });
    expect(readFileSync(out, 'utf8')).toBe('kept');
    const dangling = join(folder, 'dangling.json');
    symlinkSync(join(folder, 'nowhere.json'), dangling);
    await expect(check.writeNewFile(dangling, Buffer.from('new'), options)).rejects.toMatchObject({ code: 'RECEIPT_OUTPUT_EXISTS' });
    expect(lstatSync(dangling).isSymbolicLink() && readlinkSync(dangling)).toBe(join(folder, 'nowhere.json'));
    const fresh = join(folder, 'fresh.json');
    await check.writeNewFile(fresh, Buffer.from('new'), options);
    expect(readFileSync(fresh, 'utf8')).toBe('new');
    expect(statSync(fresh).mode & 0o777).toBe(0o600);
    expect(readdirSync(folder).sort()).toEqual(['dangling.json', 'fresh.json', 'retirement-receipt.json']);
  });

  it('a written receipt stays written when the folder cannot be opened for its fsync (best effort after the link)', async () => {
    // A write-and-search-only folder (0300): the link succeeds, opening the folder itself to fsync it does not.
    const folder = rootOnlyFolder();
    const out = join(folder, 'retirement-receipt.json');
    chmodSync(folder, 0o300);
    try {
      await check.writeNewFile(out, Buffer.from('new'), { mode: 0o600, uid, gid });
    } finally { chmodSync(folder, 0o700); }
    expect(readFileSync(out, 'utf8')).toBe('new');
    expect(readdirSync(folder)).toEqual(['retirement-receipt.json']);
  });

  it('writes the receipt only as a new file in a folder only its owner can read', async () => {
    const open = join(rootOnlyFolder(0o755), 'retirement-receipt.json');
    await expect(writeRetirementReceipt({ label: OLD, out: open, layout: ownLayout, deps: retiredHost().deps })).rejects.toMatchObject({ code: 'RECEIPT_OUTPUT_REFUSED' });
    const existing = join(rootOnlyFolder(), 'retirement-receipt.json');
    writeFileSync(existing, 'kept');
    await expect(writeRetirementReceipt({ label: OLD, out: existing, layout: ownLayout, deps: retiredHost().deps })).rejects.toMatchObject({ code: 'RECEIPT_OUTPUT_EXISTS' });
    expect(readFileSync(existing, 'utf8')).toBe('kept');
    await expect(writeRetirementReceipt({ label: OLD, out: 'relative.json', layout: ownLayout, deps: retiredHost().deps })).rejects.toMatchObject({ code: 'RECEIPT_OUTPUT_REFUSED' });
  });
});

describe('the command line', () => {
  const lines = () => { const text: string[] = []; return { text, stream: { write: (chunk: string) => { text.push(chunk); return true; } } }; };
  const manifests: Record<string, object> = { '/opt/debateai-v3-preview/artifacts/old/api-source.json': OLDER, '/opt/debateai-v3-preview/artifacts/new/api-source.json': NEWER };
  const cli = async (argv: string[], options: Options = {}, env: { platform?: string; uid?: number } = {}) => {
    const { deps } = host(options);
    const out = lines(), err = lines();
    const code = await main(argv, { platform: env.platform ?? 'linux', uid: env.uid ?? 0, layout: LAYOUT, deps: { ...deps, readManifest: async (path: string) => manifests[path] ?? Promise.reject(fail('MANIFEST_UNREADABLE')) }, stdout: out.stream, stderr: err.stream });
    return { code, out: out.text.map(line => JSON.parse(line)), err: err.text.map(line => JSON.parse(line)) };
  };
  const CHECK = ['check', '--label', NEW, '--older-manifest', '/opt/debateai-v3-preview/artifacts/old/api-source.json', '--newer-manifest', '/opt/debateai-v3-preview/artifacts/new/api-source.json'];

  it('exits 0 only for SIDE_BY_SIDE, 2 for any other verdict', async () => {
    const good = await cli(CHECK);
    expect(good.code).toBe(0);
    expect(good.out[0]).toMatchObject({ event: 'PREVIEW_RELEASE_CHECK', verdict: 'SIDE_BY_SIDE' });
    const notReady = await cli(CHECK, { gates: { deepinfra: 'halted' } });
    expect(notReady.code).toBe(2);
    expect(notReady.out[0]).toMatchObject({ verdict: 'NOT_READY' });
  });

  it('takes the reviewed hash and the lifecycle yes', async () => {
    const changed = [{ ...DEEPINFRA, goSha256: sha('x') }, ANTHROPIC];
    const reviewed = sha(canonical(changed));
    expect((await cli([...CHECK, '--gate-rows-reviewed', reviewed, '--lifecycle-reviewed'], { digests: changed })).code).toBe(0);
    expect((await cli([...CHECK, '--lifecycle-reviewed'], { digests: changed })).code).toBe(2);
  });

  it('prints status, maintenance and receipt results as one line each', async () => {
    const status = await cli(['status']);
    expect(status.code).toBe(0);
    expect(status.out[0].event).toBe('PREVIEW_RELEASE_STATUS');
    expect(status.out[0].releases.map((release: { label: string }) => release.label)).toEqual([PREV, OLD]);
    expect((await cli(['maintenance'])).code).toBe(0);
    const refused = await cli(['maintenance'], { releases: { [OLD]: { key: OLD_KEY, slot: 'A', state: 'DRAINING' } } });
    expect(refused.code).toBe(1);
    expect(refused.err[0]).toEqual({ event: 'PREVIEW_MAINTENANCE_REFUSED', reason: 'MAINTENANCE_REFUSED_DRAINING', fields: { labels: [OLD] } });
    const receipt = await cli(['receipt', '--label', OLD, '--out', '/root/preview-archive/x/retirement-receipt.json'], { releases: { [OLD]: { key: OLD_KEY, slot: 'A', state: 'DRAINING' } } });
    expect(receipt.code).toBe(1);
    expect(receipt.err[0]).toEqual({ event: 'PREVIEW_RELEASE_RECEIPT_REFUSED', label: OLD, reason: 'RECEIPT_NOT_RETIRED', fields: { state: 'DRAINING' } });
  });

  it('refuses any other argument shape, and anyone but root on Linux, before reading anything', async () => {
    for (const argv of [[], ['check'], [...CHECK.slice(0, 5)], [...CHECK, '--gate-rows-reviewed', 'nothex'], [...CHECK, '--lifecycle-reviewed', '--gate-rows-reviewed', sha('x')],
      ['check', '--label', 'Bad', ...CHECK.slice(3)], ['check', '--label', NEW, '--older-manifest', 'relative.json', ...CHECK.slice(5)], ['status', 'extra'], ['receipt', '--label', OLD], ['frobnicate']]) {
      const r = await cli(argv);
      expect(r.code).toBe(1);
      expect(r.err[0].reason).toBe('ARGUMENTS_REFUSED');
    }
    expect((await cli(['status'], {}, { uid: 1000 })).err[0].reason).toBe('ACTOR_REFUSED');
    expect((await cli(['status'], {}, { platform: 'darwin' })).err[0].reason).toBe('ACTOR_REFUSED');
  });
});
