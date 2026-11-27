// The clear-out of old release folders, in the release guide (deploy/preview-release/v1/README.md, SB15b): CLEARLOOK
// reads every archive folder and every label the release lock does not pin, and says "may be cleared" or "KEEP"; CLEAR1
// deletes one name for good. Both live only in the guide, so they are run here in bash against scratch folders, with
// the server's commands stood in for (the release table, systemd, the disk's free space, and rm, which checks its own
// options before it deletes in the scratch folder). The traps are run one by one: an empty name, "..", a slash, a glob,
// a link in the path, a mount point on or in a folder (from a stand-in mount table), a pinned label, the current release,
// the Turnstile relay's folder, a label the newest upload's lock copy pins, a name outside the allowed roots, and every
// other fact that keeps a folder.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const guide = readFileSync(resolve(ROOT, 'deploy/preview-release/v1/README.md'), 'utf8');
const NAMES_LINE = '. /root/preview-archive/rNN-names.sh';
const PATHS_LINE = "O=/opt/debateai-v3-preview; PA=/root/preview-archive; MF=/etc/debateai-v3-preview/lifecycle/maintenance-pending; PROC=/proc; UD='/etc/systemd/system /run/systemd/system /run/systemd/transient /usr/lib/systemd/system'; WALK='/ /run'; MI=/proc/self/mountinfo";

/** Every fenced block of the guide, as its lines. */
function fencedBlocks(text: string): string[][] {
  const out: string[][] = [];
  let open: string[] | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (open === null) open = [];
      else { out.push(open); open = null; }
    } else if (open !== null) open.push(line);
  }
  return out;
}
const script = (step: string) => {
  const found = fencedBlocks(guide).filter(block => block.some(line => line.startsWith(`# ${step}: `)));
  if (found.length !== 1) throw new Error(`${found.length} blocks name ${step}`);
  return found[0]!;
};
const CLEARLOOK = script('CLEARLOOK');
const CLEAR1 = script('CLEAR1');
/** The lines both steps share: from the clear-out's first comment to cjudge's closing brace. */
const shared = (lines: readonly string[]) => {
  const start = lines.findIndex(line => line.startsWith("# The clear-out's facts"));
  const judge = lines.findIndex(line => line.startsWith('cjudge() {'));
  const end = lines.findIndex((line, index) => index > judge && line === '}');
  if (start < 0 || judge < 0 || end < 0) throw new Error('no shared part');
  return lines.slice(start, end + 1);
};

const CUR = 'a00000034-r34-v1', BEF = 'a00000033-r33-v1', R32 = 'a00000032-r32-v1', R31 = 'a00000031-r31-v1';
const R29 = 'a00000029-r29-v1-20261126T052817Z', R30 = 'a00000030-r30-v1-20261126T141010Z', R28 = 'a00000028-r28-v1-20261125T170420Z';
const R23 = 'b00000023-r23-v1', R24 = 'b00000024-r24-v1', RELAY = 'f00000000-fiveai-v1';
const S_NAME = 'r34-20261126T130530Z';
/** A label's seven folders: its six release folders, then its artifacts folder. */
const sevenOf = (label: string) => [
  ...['candidate', 'fallback'].flatMap(kind => ['api', 'runner', 'ui'].map(service => `releases/auth-dev-${kind}-${label}-${service}`)),
  `artifacts/auth-dev-${label}`
];
const MIB = 1024 * 1024;

type World = Readonly<{ dir: string; opt: (path: string) => string; file: (path: string) => string }>;

/**
 * The server as a read-only look found it, in small: four pinned releases (r31 to r34, r34 current), two archive folders
 * of releases archived that day and the day before (the newest upload's lock copy still pins r30), and three labels the
 * lock does not pin: two stagings given up before they were pinned, and the October release the Turnstile relay runs from.
 */
function world(): World {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'release-clear-out-')));
  const opt = (path: string) => join(dir, 'opt', path);
  const put = (path: string, text: string | Buffer) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
  for (const sub of ['opt/archive', 'opt/releases', 'opt/artifacts', 'pa', 'proc', 'systemd', 'elsewhere']) mkdirSync(join(dir, sub), { recursive: true });
  for (const label of [CUR, BEF, R32, R31, R23, R24, RELAY]) {
    for (const path of sevenOf(label)) put(opt(`${path}/dialectical-engine/package.json`), '{}\n');
    put(opt(`artifacts/auth-dev-${label}/pnpm-store/v11/files/00/a`), Buffer.alloc(MIB, 'x'));
  }
  // An archive folder holds the six release folders, the artifacts folder and the lifecycle-current folder of its release.
  for (const name of [R29, R30, R28]) {
    const label = name.replace(/-\d{8}T\d{6}Z$/, '');
    for (const path of sevenOf(label)) put(opt(`archive/${name}/${path.split('/')[1]}/dialectical-engine/package.json`), '{}\n');
    put(opt(`archive/${name}/auth-dev-${label}/pnpm-store/v11/files/00/a`), Buffer.alloc(2 * MIB, 'y'));
    put(opt(`archive/${name}/auth-dev-${label}/site-inputs.json`), JSON.stringify({ schema: 'preview-site-inputs-v1', change: [] }));
  }
  // r29's release folders installed from its own store: hard links inside the archive folder are counted once.
  linkSync(opt(`archive/${R29}/auth-dev-a00000029-r29-v1/pnpm-store/v11/files/00/a`), opt(`archive/${R29}/auth-dev-candidate-a00000029-r29-v1-api/dialectical-engine/a`));
  // r28 shares a store file with r29 by a hard link: r29 alone does not free that file.
  put(opt(`archive/${R29}/auth-dev-a00000029-r29-v1/pnpm-store/v11/files/00/shared`), Buffer.alloc(3 * MIB, 'z'));
  linkSync(opt(`archive/${R29}/auth-dev-a00000029-r29-v1/pnpm-store/v11/files/00/shared`), opt(`archive/${R28}/auth-dev-a00000028-r28-v1/shared`));
  // The relay runs its program from the October release's API folder; its unit names that folder.
  const relay = opt(`releases/auth-dev-candidate-${RELAY}-api/dialectical-engine/deploy/turnstile/siteverify-relay.mjs`);
  put(relay, '// relay\n');
  put(join(dir, 'relay-exec'), `{ path=/usr/bin/node ; argv[]=/usr/bin/node ${relay} ; ignore_errors=no ; start_time=[n/a] }\n`);
  put(join(dir, 'relay-wd'), '\n');
  put(join(dir, 'systemd', 'debateai-preview-turnstile.service'), `[Service]\nExecStart=/usr/bin/node ${relay}\n`);
  // A pnpm store keeps a record of the projects it installed: r32's store records r23's folder, as if r23 had installed from it.
  put(opt(`artifacts/auth-dev-${R32}/pnpm-store/v11/projects/.keep`), '');
  symlinkSync(opt(`releases/auth-dev-candidate-${R23}-api/dialectical-engine`), opt(`artifacts/auth-dev-${R32}/pnpm-store/v11/projects/1f26efaa`));
  // The lock pins r31 to r34; the newest upload's lock copy (r34's SB1) still pins r30 and not r34.
  const lock = (labels: string[]) => JSON.stringify({ schema: 'preview-lifecycle-release-lock-v2', releases: Object.fromEntries(labels.map(label => [label, { releaseKey: 'r1-000000000000' }])) });
  put(join(dir, 'lock.json'), lock([CUR, BEF, R32, R31]));
  put(join(dir, 'pa', S_NAME, 'release-lock.before.json'), lock(['a00000030-r30-v1', BEF, R32, R31]));
  put(join(dir, 'pa', 'r34-S.txt'), `${join(dir, 'pa', S_NAME)}\n`);
  put(join(dir, 'pa', 'r33-S.txt'), `${join(dir, 'pa', 'r33-20261125T203621Z')}\n`);
  put(join(dir, 'pa', 'r34-names.sh'), `REV=x\nLABEL=${CUR}\nOSTORE=${opt(`artifacts/auth-dev-${BEF}/pnpm-store`)}\n`);
  put(join(dir, 'pa', 'r33-names.sh'), `REV=y\nLABEL=${BEF}\nOSTORE=${opt(`artifacts/auth-dev-${R32}/pnpm-store`)}\n`);
  put(join(dir, 'status.json'), JSON.stringify({ releases: [[R31, 'RETIRED'], [R32, 'RETIRED'], [BEF, 'RETIRED'], [CUR, 'CURRENT']].map(([label, state]) => ({ label, state })) }));
  put(join(dir, 'release-table'), ['r34-a00000034abc CURRENT 20261126141500', 'r33-a00000033abc RETIRED 20261125210000', 'r32-a00000032abc RETIRED 20261125170000',
    'r31-a00000031abc RETIRED 20261125140000', 'r30-a00000030abc RETIRED 20261125110000', 'r29-a00000029abc RETIRED 20261124230000', 'r28-a00000028abc RETIRED 20261124170000', ''].join('\n'));
  put(join(dir, 'units'), 'debateai-preview-api@a00000034-r34-v1.service loaded active running API\ndebateai-preview-api@a00000029-r29-v1.service loaded inactive dead API\n');
  put(join(dir, 'ms-steps'), '');
  // Free space in KB; the stand-in rm adds 1 MB for each folder it deletes.
  put(join(dir, 'avail'), '15000000\n');
  // The mount table, as /proc/self/mountinfo has it: the root disk, /proc, /run, and a bind mount whose path only starts
  // like an archive folder's (the name, then more letters): it is not inside that folder.
  put(join(dir, 'mountinfo'), [
    '29 1 252:1 / / rw,relatime shared:1 - ext4 /dev/vda1 rw,errors=remount-ro',
    '30 29 0:5 / /proc rw,nosuid,nodev,noexec,relatime shared:12 - proc proc rw',
    '31 29 0:25 / /run rw,nosuid,nodev,noexec,relatime shared:5 - tmpfs tmpfs rw,size=401508k,mode=755',
    `120 29 252:1 /srv/old ${opt(`archive/${R28}`)}-old rw,relatime shared:1 - ext4 /dev/vda1 rw,errors=remount-ro`,
    ''
  ].join('\n'));
  // One process: the website of the current release, with its program, folder, an argument and an open file there.
  const proc = join(dir, 'proc', '4242');
  mkdirSync(join(proc, 'fd'), { recursive: true });
  symlinkSync('/usr/bin/node', join(proc, 'exe'));
  symlinkSync(opt(`releases/auth-dev-candidate-${CUR}-ui/dialectical-engine`), join(proc, 'cwd'));
  writeFileSync(join(proc, 'cmdline'), ['/usr/bin/node', `--plan=${opt(`artifacts/auth-dev-${CUR}/ui-launch.json`)}`, ''].join('\0'));
  symlinkSync(opt(`releases/auth-dev-candidate-${CUR}-ui/dialectical-engine/package.json`), join(proc, 'fd', '3'));
  writeFileSync(join(proc, 'maps'), '7f00-7f01 r-xp 00000000 08:01 1 /usr/lib/libc.so.6\n');
  return { dir, opt: path => opt(path), file: path => readFileSync(join(dir, path), 'utf8') };
}
const withWorld = <T>(body: (w: World) => T): T => {
  const w = world();
  try { return body(w); } finally { rmSync(w.dir, { recursive: true, force: true }); }
};

type Names = Readonly<{ label?: string; olabel?: string; s?: string }>;
/** The names file (by default the newest upload's, r34's) and the server's commands, stood in for. */
function stubs(w: World, names: Names = {}): string[] {
  return [
    `D='${w.dir}'; S="$D/pa/${names.s ?? S_NAME}"; LABEL=${names.label ?? CUR}; OLABEL=${names.olabel ?? BEF}; OSTORE="$D/opt/artifacts/auth-dev-${BEF}/pnpm-store"; LOCK="$D/lock.json"`,
    `N='${process.execPath}'; L='${resolve(ROOT, 'deploy/preview-lifecycle/v1')}'`,
    'lc() { [ "$1 $2" = \'release-check.mjs status\' ] || return 9; cat "$D/status.json"; }',
    'psqlq() { [ ! -e "$D/table-unread" ] || return 1; cat "$D/release-table"; }',
    'systemctl() { case "$1" in show) case "$3" in ExecStart) cat "$D/relay-exec";; WorkingDirectory) cat "$D/relay-wd";; esac;; list-units) case "$*" in *ms-step*) cat "$D/ms-steps";; *) cat "$D/units";; esac;; esac; }',
    // The server's readlink (uutils) differs from GNU's and BSD's in two answers. For an empty path it answers the folder
    // it runs in, where they fail: the steps must never ask it one. Given several paths it stops at the first it cannot
    // read and prints none of the rest, where they read on: the steps must ask it one path at a time.
    'readlink() { local f=no a; if [ "${1-}" = -f ]; then f=yes; shift; fi; for a in "$@"; do if [ "$f" = yes ]; then if [ -z "$a" ]; then pwd; else command readlink -f "$a" || return 1; fi; else command readlink "$a" || return 1; fi; done; }',
    'df() { printf \'Filesystem 1024-blocks Used Available Capacity Mounted on\\nscratch 100000000 1 %s 1%% /\\n\' "$(cat "$D/avail")"; }',
    'rm() { printf \'%s\\n\' "$*" >> "$D/rm-calls"; [ ! -e "$D/rm-refuses" ] || return 1; if [ "$#" = 5 ] && [ "$1 $2 $3 $4" = \'-rf --one-file-system --preserve-root=all --\' ]; then echo $(( $(cat "$D/avail") + 1024 )) > "$D/avail"; command rm -rf -- "$5"; else return 97; fi; }'
  ];
}
const OWN_PATHS = 'O="$D/opt"; PA="$D/pa"; MF="$D/maintenance-pending"; PROC="$D/proc"; UD="$D/systemd"; WALK="$D/opt $D/pa $D/elsewhere"; MI="$D/mountinfo"';

function run(lines: readonly string[], w: World, fill: Readonly<Record<string, string>> = {}, names: Names = {}) {
  let text = lines.join('\n');
  expect(text).toContain(NAMES_LINE);
  expect(text).toContain(PATHS_LINE);
  text = text.replace(NAMES_LINE, () => stubs(w, names).join('\n')).replace(PATHS_LINE, () => OWN_PATHS);
  for (const [name, value] of Object.entries(fill)) {
    const line = new RegExp(`^${name}=''( .*)?$`, 'm');
    expect(text, name).toMatch(line);
    text = text.replace(line, () => `${name}=${value}`);
  }
  const out = spawnSync('bash', ['-c', text], { encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` } });
  const lines2 = out.stdout.trim().split('\n');
  return { status: out.status, out: out.stdout, err: out.stderr, lines: lines2, last: lines2.at(-1)!, of: (name: string) => lines2.find(line => line.includes(` ${name}: `)) ?? '' };
}
/** CLEAR1 with a name typed once and the owner's yes for the same name. */
const clear = (w: World, name: string, more: Readonly<Record<string, string>> = {}, names: Names = {}) => run(CLEAR1, w, { NAME: `'${name}'`, YES: `'${name}'`, ...more }, names);
const rmCalls = (w: World) => (existsSync(join(w.dir, 'rm-calls')) ? w.file('rm-calls').trim().split('\n') : []);

describe('the two steps', () => {
  it('each is a script of the guide\'s form, and both share the same lines for their facts', () => {
    for (const [step, lines] of [['CLEARLOOK', CLEARLOOK], ['CLEAR1', CLEAR1]] as const) {
      expect(lines.slice(0, 2), step).toEqual(['set -euo pipefail', NAMES_LINE]);
      expect(lines[2], step).toMatch(new RegExp(`^# ${step}: \\S`));
      expect(lines.at(-1), step).toBe(`echo ${step}_DONE`);
      expect(spawnSync('bash', ['-n'], { input: lines.join('\n') }).status, step).toBe(0);
      for (const line of lines) {
        for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], line).toBe(step);
        if (line.includes('_NOT_DONE')) expect(line, line).toMatch(/exit 1/);
      }
    }
    expect(shared(CLEAR1)).toEqual(shared(CLEARLOOK));
    expect(shared(CLEARLOOK)).toContain(PATHS_LINE);
  });

  it('CLEARLOOK only reads; CLEAR1 deletes with one guarded rm and says first that nothing is kept', () => {
    const code = (lines: readonly string[]) => lines.filter(line => !line.trimStart().startsWith('#'));
    for (const line of code(CLEARLOOK)) expect(line, line).not.toMatch(/(^|[\s;&|(`])(rm|rmdir|unlink|mv|cp|install|chmod|chown|truncate|shred)\s|-delete\b|\s>>?\s*"?\$/);
    expect(CLEAR1[2]).toBe("# CLEAR1: deletes ONE archive folder, or the seven folders of ONE unused label, that CLEARLOOK said may be cleared, on the owner's yes. NOTHING is kept: it cannot be undone.");
    const removals = code(CLEAR1).filter(line => /(^|[\s;&|(`])(rm|rmdir|unlink|shred|truncate)\s|-delete\b/.test(line));
    expect(removals).toEqual(['  rm -rf --one-file-system --preserve-root=all -- "$X" || GONE=no']);
    // Each path is held to the three roots on the line before the rm, inside the same loop over the folders the name stands for.
    const at = CLEAR1.indexOf(removals[0]!);
    expect(CLEAR1[at - 1]).toBe('  case "$X" in "$O"/archive/?*|"$O"/releases/auth-dev-?*|"$O"/artifacts/auth-dev-?*) ;; *) echo "CLEAR1_NOT_DONE: $X lies outside the archive, releases and artifacts: nothing more deleted: ask"; exit 1;; esac');
    expect(CLEAR1[at - 2]).toBe('for X in "$@"; do');
    // The deletion comes after every check: the name, the roots, the facts and the judgement.
    for (const before of ['[ -n "$NAME" ] ||', 'case "$NAME" in */*)', '[ "$YES" = "$NAME" ] ||', 'cfacts CLEAR1', 'cjudge "$NAME"', '[ "$CV" = ok ] ||']) {
      expect(CLEAR1.findIndex(line => line.startsWith(before)), before).toBeGreaterThan(-1);
      expect(CLEAR1.findIndex(line => line.startsWith(before)), before).toBeLessThan(at);
    }
  });
});

describe('CLEARLOOK on the server\'s shape', () => {
  it('lists every archive folder and every unpinned label, with its facts and its last word', () => withWorld(w => {
    const look = run(CLEARLOOK, w);
    expect(look.last, look.err).toBe('CLEARLOOK_DONE');
    expect(look.lines[0]).toBe('free on /: 15.4 GB; the release check (DISK, at SB4, after the staging) needs 15.0 GB; a staging takes about 4 GB');
    expect(look.lines).toContain(`the current release: ${CUR}; the one before it: ${BEF}; pinned in the release lock (not listed below): ${[CUR, R31, R32, BEF].sort().join(' ')} `);
    expect(look.lines).toContain('an upload under way: releases staged or draining 0; the maintenance flag no; a detached step running no (CLEAR1 refuses while any of these is there)');
    // r29: its own store linked from its release folder is counted once (2 MB); the file it shares with r28 stays (not counted).
    expect(look.of(R29)).toBe(`archive folder ${R29}: frees 2 MB; pinned no; release table RETIRED; systemd names it 0; process paths in it 0; links into it 0 (pnpm store records 0); the Turnstile relay runs from it no; a change of numbers recorded no; the newest upload's lock copy names it no; may be cleared`);
    expect(look.of(R30)).toMatch(/; the newest upload's lock copy names it yes; KEEP: the newest upload's lock copy pins it \(rbD-B would put that lock back\) \(until the owner declares the newest upload over: OVER=yes in CLEAR1\)$/);
    expect(look.of(R23)).toBe(`unused label ${R23}: folders 7 of 7; frees 1 MB; pinned no; release table unknown; systemd names it 0; process paths in it 0; links into it 0 (pnpm store records 1); the Turnstile relay runs from it no; a change of numbers recorded no; the newest upload's lock copy names it no; may be cleared`);
    expect(look.of(R24)).toMatch(/; may be cleared$/);
    expect(look.of(RELAY)).toMatch(/; systemd names it 1; .*; the Turnstile relay runs from it yes; .*; KEEP: systemd names it \(1 unit files, drop-ins, enabled instances or units not inactive\); the Turnstile relay runs from it \(sign-up needs it\)$/);
    // The pinned releases are not listed.
    for (const label of [CUR, BEF, R32, R31]) expect(look.lines.filter(line => line.startsWith(`unused label ${label}:`)), label).toEqual([]);
    expect(look.of(R28)).toMatch(/^archive folder .*: frees 2 MB; .*; may be cleared$/);
    expect(look.lines.at(-2)).toBe('may be cleared: 4 names, 6 MB in all (each counted alone; names that share files free more together)');
    // It changed nothing.
    expect(rmCalls(w)).toEqual([]);
    for (const name of [R29, R30, R28]) expect(existsSync(w.opt(`archive/${name}`)), name).toBe(true);
  }));

  it('lists an archive entry that is no archive folder, or a link, as KEEP, and follows no link', () => withWorld(w => {
    writeFileSync(w.opt('archive/notes.txt'), 'x\n');
    mkdirSync(join(w.dir, 'elsewhere', 'precious'));
    symlinkSync(join(w.dir, 'elsewhere', 'precious'), w.opt('archive/a00000027-r27-v1-20261125T135638Z'));
    mkdirSync(w.opt('archive/.hidden'));
    const look = run(CLEARLOOK, w);
    expect(look.last, look.err).toBe('CLEARLOOK_DONE');
    expect(look.lines).toContain('archive entry notes.txt: not an archive folder\'s name (CLEAR1 does not take it); KEEP: ask');
    expect(look.lines).toContain('archive entry .hidden: not an archive folder\'s name (CLEAR1 does not take it); KEEP: ask');
    expect(look.of('a00000027-r27-v1-20261125T135638Z')).toMatch(/^archive folder a00000027-r27-v1-20261125T135638Z: frees 0 MB; .*; KEEP: archive\/a00000027-r27-v1-20261125T135638Z is a link, or no real folder; no real folder directly under the archive$/);
  }));

  it('stops when a newer upload\'s names file exists, or the newest upload\'s lock copy is unread', () => withWorld(w => {
    writeFileSync(join(w.dir, 'pa', 'r35-S.txt'), `${join(w.dir, 'pa', 'r35-20261127T090000Z')}\n`);
    expect(run(CLEARLOOK, w).last).toBe('CLEARLOOK_NOT_DONE: r35-S.txt names a newer upload\'s archive folder: fill in that upload\'s rNN; nothing changed');
    rmSync(join(w.dir, 'pa', 'r35-S.txt'));
    rmSync(join(w.dir, 'pa', S_NAME, 'release-lock.before.json'));
    expect(run(CLEARLOOK, w).last).toMatch(/^CLEARLOOK_NOT_DONE: the newest upload's lock copy \(.*\/release-lock\.before\.json\) is unread: ask; nothing changed$/);
  }));
});

describe('CLEAR1 deletes one name for good', () => {
  it('an archive folder: its line again, what goes, the guarded rm, the free space before and after, and the record', () => withWorld(w => {
    const one = clear(w, R29);
    expect(one.last, one.err).toBe('CLEAR1_DONE');
    expect(one.lines).toContain(`archive folder ${R29}: frees 2 MB; pinned no; release table RETIRED; systemd names it 0; process paths in it 0; links into it 0 (pnpm store records 0); the Turnstile relay runs from it no; a change of numbers recorded no; the newest upload's lock copy names it no; may be cleared`);
    expect(one.lines.filter(line => line.startsWith('to delete: '))).toEqual([expect.stringMatching(new RegExp(`^to delete: archive/${R29}, \\d+ MB as it stands$`))]);
    expect(one.lines).toContain(`NOTHING of ${R29} is kept, and this cannot be undone; it frees about 2 MB`);
    expect(rmCalls(w)).toEqual([`-rf --one-file-system --preserve-root=all -- ${w.opt(`archive/${R29}`)}`]);
    expect(existsSync(w.opt(`archive/${R29}`))).toBe(false);
    // The other archive folders, and r28's file r29 shared, are still there.
    expect(existsSync(w.opt(`archive/${R28}/auth-dev-a00000028-r28-v1/shared`))).toBe(true);
    expect(existsSync(w.opt(`archive/${R30}`))).toBe(true);
    expect(one.lines.at(-2)).toBe(`deleted for good: ${R29}; 1 MB freed; free on / now 15.4 GB (before: 15.4 GB); two lines added to ${w.dir}/pa/clear-out.log (started, then deleted)`);
    const record = w.file('pa/clear-out.log').trim().split('\n');
    expect(record).toHaveLength(2);
    expect(record[0]).toMatch(new RegExp(`^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ ${R29} started: about 2 MB to free$`));
    expect(record[1]).toMatch(new RegExp(`^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ ${R29} deleted: 1 MB freed$`));
    // A second run finds nothing to delete.
    expect(clear(w, R29).last).toMatch(/^CLEAR1_NOT_DONE: a00000029-r29-v1-20261126T052817Z may not be cleared now/);
    expect(rmCalls(w)).toHaveLength(1);
  }));

  it('a folder rm does not remove: not wholly deleted, said as it is, with both lines in the record; run again, it goes', () => withWorld(w => {
    writeFileSync(join(w.dir, 'rm-refuses'), '');
    const one = clear(w, R29);
    expect(one.status).toBe(1);
    expect(one.last).toBe(`CLEAR1_NOT_DONE: ${R29} is not wholly deleted (0 MB freed; what was removed is not kept, and the rest is still there): run CLEARLOOK, then CLEAR1 again with the same name for what is left; if it stops again: ask`);
    expect(existsSync(w.opt(`archive/${R29}`))).toBe(true);
    const record = w.file('pa/clear-out.log').trim().split('\n');
    expect(record).toHaveLength(2);
    expect(record[0]).toMatch(new RegExp(`^\\S+ ${R29} started: about 2 MB to free$`));
    expect(record[1]).toMatch(new RegExp(`^\\S+ ${R29} not wholly deleted: 0 MB freed$`));
    rmSync(join(w.dir, 'rm-refuses'));
    expect(clear(w, R29).last).toBe('CLEAR1_DONE');
    expect(existsSync(w.opt(`archive/${R29}`))).toBe(false);
    expect(w.file('pa/clear-out.log').trim().split('\n')).toHaveLength(4);
  }));

  it('an unused label: its seven folders, and nothing of another label', () => withWorld(w => {
    const one = clear(w, R23);
    expect(one.last, one.err).toBe('CLEAR1_DONE');
    expect(rmCalls(w)).toEqual(sevenOf(R23).map(path => `-rf --one-file-system --preserve-root=all -- ${w.opt(path)}`));
    for (const path of sevenOf(R23)) expect(existsSync(w.opt(path)), path).toBe(false);
    for (const path of sevenOf(R24)) expect(existsSync(w.opt(path)), path).toBe(true);
    expect(one.lines.at(-2)).toMatch(new RegExp(`^deleted for good: ${R23}; 7 MB freed; `));
  }));

  it('a label the newest upload\'s lock copy pins goes only once the owner declared that upload over', () => withWorld(w => {
    expect(clear(w, R30).last).toBe(`CLEAR1_NOT_DONE: ${R30} may not be cleared now (the line above says why); nothing deleted`);
    expect(clear(w, R30, { OVER: "'maybe'" }).last).toBe('CLEAR1_NOT_DONE: OVER is yes or empty; nothing deleted');
    const over = clear(w, R30, { OVER: "'yes'" });
    expect(over.of(R30)).toMatch(/; may be cleared \(the owner declared the newest upload over\)$/);
    expect(over.last).toBe('CLEAR1_DONE');
    expect(existsSync(w.opt(`archive/${R30}`))).toBe(false);
  }));

  it('a label cut off half way: refused as it is, taken once the record says CLEAR1 started on it', () => withWorld(w => {
    for (const path of sevenOf(R24).slice(0, 3)) rmSync(w.opt(path), { recursive: true });
    expect(clear(w, R24).lines).toContainEqual(expect.stringMatching(/: folders 4 of 7; .*KEEP: 4 of its 7 folders are there$/));
    writeFileSync(join(w.dir, 'pa', 'clear-out.log'), `2026-11-27T10:00:00Z ${R24} started: about 7 MB to free\n`);
    const again = clear(w, R24);
    expect(again.last, again.err).toBe('CLEAR1_DONE');
    expect(rmCalls(w)).toHaveLength(4);
    for (const path of sevenOf(R24)) expect(existsSync(w.opt(path)), path).toBe(false);
  }));
});

describe('CLEAR1 refuses, with nothing deleted', () => {
  const refused = (w: World, name: string, last: string | RegExp, more: Readonly<Record<string, string>> = {}) => {
    const out = run(CLEAR1, w, { NAME: name, YES: name, ...more });
    expect(out.status, `${name}: ${out.out}${out.err}`).toBe(1);
    if (typeof last === 'string') expect(out.last, name).toBe(last); else expect(out.last, name).toMatch(last);
    expect(rmCalls(w), name).toEqual([]);
    expect(existsSync(join(w.dir, 'pa', 'clear-out.log')), name).toBe(false);
    return out;
  };

  it('a name that is empty, "..", a path, a glob, a line break, or neither kind of name', () => withWorld(w => {
    refused(w, "''", 'CLEAR1_NOT_DONE: NAME is empty: fill in one name as CLEARLOOK printed it; nothing deleted');
    const odd = 'CLEAR1_NOT_DONE: NAME holds a character no name has (a name is letters, digits and dashes: never . or .., a glob, a space or a line break); nothing deleted';
    refused(w, "'..'", odd);
    refused(w, "'.'", odd);
    refused(w, "'*'", odd);
    refused(w, "'a00000029-r29-v1-*'", odd);
    refused(w, `$'${R23}\\n..'`, odd);
    refused(w, `'${R23} '`, odd);
    refused(w, "'/'", 'CLEAR1_NOT_DONE: NAME holds a slash: it is a name, never a path; nothing deleted');
    refused(w, "'../../etc'", 'CLEAR1_NOT_DONE: NAME holds a slash: it is a name, never a path; nothing deleted');
    refused(w, `'archive/${R29}'`, 'CLEAR1_NOT_DONE: NAME holds a slash: it is a name, never a path; nothing deleted');
    refused(w, "'-rf'", 'CLEAR1_NOT_DONE: NAME is neither an archive folder\'s name nor a release label; nothing deleted');
    refused(w, "'A00000029-R29-V1'", 'CLEAR1_NOT_DONE: NAME is neither an archive folder\'s name nor a release label; nothing deleted');
  }));

  it('a yes that is not the same name', () => withWorld(w => {
    refused(w, `'${R29}'`, 'CLEAR1_NOT_DONE: YES is not the same name again (the owner\'s yes for this one name); nothing deleted', { YES: `'${R28}'` });
    refused(w, `'${R29}'`, 'CLEAR1_NOT_DONE: YES is not the same name again (the owner\'s yes for this one name); nothing deleted', { YES: "''" });
  }));

  it('a name outside the allowed roots: no such folders there', () => withWorld(w => {
    // "etc", "root" and "opt" are names of the right shape; their seven folders are not there, so nothing goes.
    for (const name of ['etc', 'root', 'opt']) refused(w, `'${name}'`, `CLEAR1_NOT_DONE: ${name} may not be cleared now (the line above says why); nothing deleted`);
    refused(w, "'a00000027-r27-v1-20261125T135638Z'", 'CLEAR1_NOT_DONE: a00000027-r27-v1-20261125T135638Z may not be cleared now (the line above says why); nothing deleted');
  }));

  it('a link in the path: the folder, a label\'s folder or a root is a link', () => withWorld(w => {
    // An archive "folder" that is a link to a folder elsewhere: never followed, never deleted.
    mkdirSync(join(w.dir, 'elsewhere', 'precious'));
    writeFileSync(join(w.dir, 'elsewhere', 'precious', 'keep'), 'keep\n');
    symlinkSync(join(w.dir, 'elsewhere', 'precious'), w.opt('archive/a00000027-r27-v1-20261125T135638Z'));
    const out = refused(w, "'a00000027-r27-v1-20261125T135638Z'", /may not be cleared now/);
    expect(out.lines.join('\n')).toContain('KEEP: archive/a00000027-r27-v1-20261125T135638Z is a link, or no real folder; no real folder directly under the archive');
    expect(existsSync(join(w.dir, 'elsewhere', 'precious', 'keep'))).toBe(true);
    // One of a label's seven folders is a link out of the releases folder.
    rmSync(w.opt(`releases/auth-dev-fallback-${R24}-ui`), { recursive: true });
    symlinkSync(join(w.dir, 'elsewhere', 'precious'), w.opt(`releases/auth-dev-fallback-${R24}-ui`));
    expect(refused(w, `'${R24}'`, /may not be cleared now/).lines.join('\n')).toContain(`releases/auth-dev-fallback-${R24}-ui is a link, or no real folder`);
  }));

  it('a mount point on the archive folder itself, or inside one of a label\'s folders: rm\'s own checks would not stop it', () => withWorld(w => {
    const mounts = w.file('mountinfo');
    // A bind mount of another folder of the same disk on the archive folder itself: the same device number as its parent,
    // so neither --one-file-system nor --preserve-root=all, nor the count of entries on another file system, sees it.
    writeFileSync(join(w.dir, 'mountinfo'), `${mounts}121 29 252:1 /opt/debateai-v3-preview/releases/live ${w.opt(`archive/${R29}`)} rw,relatime shared:1 - ext4 /dev/vda1 rw\n`);
    const look = run(CLEARLOOK, w);
    expect(look.last, look.err).toBe('CLEARLOOK_DONE');
    expect(look.of(R29)).toMatch(/; KEEP: 1 mount points on it or in it \(the deletion would go through them\)$/);
    // A mount whose path only starts like r28's archive folder is not in it.
    expect(look.of(R28)).toMatch(/; may be cleared$/);
    expect(refused(w, `'${R29}'`, /may not be cleared now/).of(R29)).toMatch(/; KEEP: 1 mount points on it or in it \(the deletion would go through them\)$/);
    expect(existsSync(w.opt(`archive/${R29}/auth-dev-a00000029-r29-v1/site-inputs.json`))).toBe(true);
    // Another disk mounted inside one of a label's seven folders.
    writeFileSync(join(w.dir, 'mountinfo'), `${mounts}122 29 259:3 / ${w.opt(`releases/auth-dev-fallback-${R24}-runner`)}/dialectical-engine/cache rw,relatime shared:40 - ext4 /dev/vdb1 rw\n`);
    expect(run(CLEARLOOK, w).of(R24)).toMatch(/; KEEP: 1 mount points on it or in it \(the deletion would go through them\)$/);
    expect(refused(w, `'${R24}'`, /may not be cleared now/).of(R24)).toMatch(/; KEEP: 1 mount points on it or in it \(the deletion would go through them\)$/);
    for (const path of sevenOf(R24)) expect(existsSync(w.opt(path)), path).toBe(true);
  }));

  it('an unread mount table keeps every name', () => withWorld(w => {
    rmSync(join(w.dir, 'mountinfo'));
    expect(refused(w, `'${R29}'`, /may not be cleared now/).of(R29)).toMatch(/; KEEP: the mount table is unread$/);
    expect(run(CLEARLOOK, w).lines.at(-2)).toBe('may be cleared: 0 names, 0 MB in all (each counted alone; names that share files free more together)');
  }));

  it('a root that is a link', () => withWorld(w => {
    const real = join(w.dir, 'elsewhere', 'archive');
    mkdirSync(real);
    rmSync(w.opt('archive'), { recursive: true });
    symlinkSync(real, w.opt('archive'));
    refused(w, `'${R23}'`, `CLEAR1_NOT_DONE: ${w.opt('archive')} is not a real folder (a link on the way to it?): ask; nothing deleted`);
  }));

  it('a pinned label, the current release, the one before it, and the Turnstile relay\'s release', () => withWorld(w => {
    expect(refused(w, `'${R32}'`, /may not be cleared now/).of(R32)).toContain('; KEEP: pinned in the release lock; the newest upload\'s lock copy pins it');
    expect(refused(w, `'${CUR}'`, /may not be cleared now/).of(CUR)).toContain('; KEEP: pinned in the release lock; the current release; the release table holds its commit as CURRENT; ');
    expect(refused(w, `'${CUR}'`, /may not be cleared now/).of(CUR)).toContain('; running processes use it (3 paths)');
    const before = refused(w, `'${BEF}'`, /may not be cleared now/).of(BEF);
    expect(before).toContain('the release before the current one (the way back)');
    expect(before).toContain('it holds the pnpm store the next staging starts from');
    expect(refused(w, `'${RELAY}'`, /may not be cleared now/).of(RELAY)).toContain('the Turnstile relay runs from it (sign-up needs it)');
    // The relay's working folder holds its release back too, and an unread relay keeps every name.
    writeFileSync(join(w.dir, 'relay-wd'), `!${w.opt(`releases/auth-dev-candidate-${R24}-api/dialectical-engine`)}\n`);
    expect(refused(w, `'${R24}'`, /may not be cleared now/).of(R24)).toContain('the Turnstile relay runs from it (sign-up needs it)');
    writeFileSync(join(w.dir, 'relay-exec'), '\n');
    expect(refused(w, `'${R23}'`, /may not be cleared now/).of(R23)).toContain("the Turnstile relay's program path is unread");
  }));

  it('a commit the release table holds as anything but RETIRED, or an unread table', () => withWorld(w => {
    writeFileSync(join(w.dir, 'release-table'), `${w.file('release-table')}r23-b00000023abc STAGED -\n`);
    expect(refused(w, `'${R23}'`, /may not be cleared now/).of(R23)).toContain('release table STAGED; ');
    writeFileSync(join(w.dir, 'table-unread'), '');
    expect(refused(w, `'${R29}'`, /may not be cleared now/).of(R29)).toContain('the release table is unread');
  }));

  it('a unit, a drop-in or an enabled instance that names it', () => withWorld(w => {
    mkdirSync(join(w.dir, 'systemd', `debateai-preview-api@${R24}.service.d`));
    expect(refused(w, `'${R24}'`, /may not be cleared now/).of(R24)).toContain('systemd names it (1 unit files, drop-ins, enabled instances or units not inactive)');
    // An inactive unit that only carries the label does not keep it; one that runs does.
    writeFileSync(join(w.dir, 'units'), `debateai-preview-runner@${R23}.service loaded active running runner\n`);
    expect(refused(w, `'${R23}'`, /may not be cleared now/).of(R23)).toContain('systemd names it (1 ');
  }));

  it('a running process that uses it', () => withWorld(w => {
    const proc = join(w.dir, 'proc', '777');
    mkdirSync(join(proc, 'fd'), { recursive: true });
    symlinkSync('/usr/bin/bash', join(proc, 'exe'));
    symlinkSync(w.opt(`archive/${R29}`), join(proc, 'cwd'));
    writeFileSync(join(proc, 'cmdline'), '-bash\0');
    expect(refused(w, `'${R29}'`, /may not be cleared now/).of(R29)).toContain('running processes use it (1 paths)');
    // A process whose program is unread (it is ending) still has its working folder and its open files read, and a
    // file closed between the listing and the reading does not hide the open files after it.
    rmSync(join(proc, 'exe'));
    expect(refused(w, `'${R29}'`, /may not be cleared now/).of(R29)).toContain('running processes use it (1 paths)');
    symlinkSync('/usr/bin/bash', join(proc, 'exe'));
    rmSync(join(proc, 'cwd'));
    symlinkSync('/', join(proc, 'cwd'));
    writeFileSync(join(proc, 'fd', '3'), '');
    symlinkSync(w.opt(`archive/${R28}/auth-dev-a00000028-r28-v1/shared`), join(proc, 'fd', '4'));
    expect(refused(w, `'${R28}'`, /may not be cleared now/).of(R28)).toContain('running processes use it (1 paths)');
    rmSync(join(proc, 'fd', '3'));
    rmSync(join(proc, 'fd', '4'));
    // An argument with the path after an = sign, or a mapped file, counts too.
    rmSync(join(proc, 'cwd'));
    writeFileSync(join(proc, 'cmdline'), ['node', `--root=${w.opt(`releases/auth-dev-fallback-${R23}-api`)}`, ''].join('\0'));
    expect(refused(w, `'${R23}'`, /may not be cleared now/).of(R23)).toContain('running processes use it (1 paths)');
  }));

  it('a link outside it that points into it; a pnpm store\'s project record does not keep it', () => withWorld(w => {
    symlinkSync(w.opt(`archive/${R29}/auth-dev-a00000029-r29-v1`), join(w.dir, 'elsewhere', 'old-store'));
    expect(refused(w, `'${R29}'`, /may not be cleared now/).of(R29)).toContain('1 links outside it point into it');
    // A relative link names the folder too.
    symlinkSync(`../releases/auth-dev-candidate-${R24}-api/dialectical-engine`, w.opt('artifacts/r24-current'));
    expect(refused(w, `'${R24}'`, /may not be cleared now/).of(R24)).toContain('1 links outside it point into it');
  }));

  it('a numbers record with a change of numbers, naming the upload', () => withWorld(w => {
    writeFileSync(w.opt(`archive/${R29}/auth-dev-a00000029-r29-v1/site-inputs.json`), JSON.stringify({ change: ['perRunCeilingMicros'] }));
    const line = refused(w, `'${R29}'`, /may not be cleared now/).of(R29);
    expect(line).toContain('; a change of numbers recorded yes; ');
    expect(line).toMatch(/; KEEP: its numbers record names a change of numbers: SB3c, the first half of the way back from them, reads the plan that record names \(upload a00000029-r29-v1\)$/);
  }));

  it('the pnpm store the next staging starts from', () => withWorld(w => {
    writeFileSync(join(w.dir, 'pa', 'r34-names.sh'), `REV=x\nLABEL=${CUR}\nOSTORE=${w.opt(`artifacts/auth-dev-${R24}/pnpm-store`)}\n`);
    expect(refused(w, `'${R24}'`, /may not be cleared now/).of(R24)).toContain('it holds the pnpm store the next staging starts from');
  }));

  it('the newest upload\'s own release while it is not current, until the owner declares that upload over', () => withWorld(w => {
    // r35's staging made r24's folders, and nothing of it is pinned yet: its names file is the newest, its lock copy the lock.
    const s35 = 'r35-20261127T090000Z';
    mkdirSync(join(w.dir, 'pa', s35));
    writeFileSync(join(w.dir, 'pa', s35, 'release-lock.before.json'), w.file('lock.json'));
    writeFileSync(join(w.dir, 'pa', 'r35-S.txt'), `${join(w.dir, 'pa', s35)}\n`);
    const names = { label: R24, olabel: CUR, s: s35 };
    // r34's names file is not the newest any more.
    refused(w, `'${R24}'`, 'CLEAR1_NOT_DONE: r35-S.txt names a newer upload\'s archive folder: fill in that upload\'s rNN; nothing changed');
    const own = run(CLEAR1, w, { NAME: `'${R24}'`, YES: `'${R24}'` }, names);
    expect(own.last).toBe(`CLEAR1_NOT_DONE: ${R24} may not be cleared now (the line above says why); nothing deleted`);
    expect(own.of(R24)).toMatch(/; KEEP: the newest upload's own release, not current \(that upload may be under way\) \(until the owner declares the newest upload over: OVER=yes in CLEAR1\)$/);
    expect(rmCalls(w)).toEqual([]);
    // The archive folder r34's lock copy pinned is no longer pinned by the newest copy, r35's.
    expect(clear(w, R30, {}, names).last).toBe('CLEAR1_DONE');
    const over = clear(w, R24, { OVER: "'yes'" }, names);
    expect(over.last, over.err).toBe('CLEAR1_DONE');
    for (const path of sevenOf(R24)) expect(existsSync(w.opt(path)), path).toBe(false);
  }));

  it('while an upload is under way: a release staged or draining, the maintenance flag, a detached step', () => withWorld(w => {
    const status = w.file('status.json');
    writeFileSync(join(w.dir, 'status.json'), status.replace('"RETIRED"', '"DRAINING"'));
    refused(w, `'${R29}'`, 'CLEAR1_NOT_DONE: a release is staged or draining (an upload is under way): wait until it is over; nothing deleted');
    writeFileSync(join(w.dir, 'status.json'), status);
    writeFileSync(join(w.dir, 'maintenance-pending'), '');
    refused(w, `'${R29}'`, 'CLEAR1_NOT_DONE: the maintenance flag is there (a restart of the server, or other maintenance, is under way): wait until it is over; nothing deleted');
    rmSync(join(w.dir, 'maintenance-pending'));
    writeFileSync(join(w.dir, 'ms-steps'), 'ms-step-101500.service loaded active running /bin/bash /root/ms-step.sh\n');
    refused(w, `'${R29}'`, 'CLEAR1_NOT_DONE: a detached step still runs (read its log first); nothing deleted');
  }));
});

describe('the guides\' words', () => {
  const flat = (text: string) => text.replace(/\s+/g, ' ');
  const runbook = readFileSync(resolve(ROOT, 'deploy/preview-auth-dev/v1/MAIN-SITE.md'), 'utf8');

  it('SB15b comes right after SB15; SB4\'s disk text, SB15\'s text, the order table and the owner\'s runbook point to it', () => {
    const at = guide.indexOf('\n### SB15b. When the disk is short: old folders deleted for good (CLEARLOOK, CLEAR1)\n');
    expect(at).toBeGreaterThan(guide.indexOf('\n### SB15. '));
    expect(at).toBeLessThan(guide.indexOf('\n### The way back, side by side\n'));
    const text = flat(guide);
    expect(text).toContain('SB15 frees no room: the archive keeps every release it moved there (about 4.5 GB each) until CLEAR1 deletes it for good, one at a time, on the owner\'s yes (SB15b, next).');
    expect(text).toContain('| CLEARLOOK, CLEAR1 | later, when the disk is short, on the owner\'s yes: one archive folder, or the seven folders of one unused label, deleted for good (SB15b) | up | none: NOTHING is kept |');
    expect(text).toContain('**`DISK`**');
    expect(text).toContain('CLEARLOOK and CLEAR1 (SB15b)');
    expect(text).toContain('NOTHING of it is kept, and it cannot be undone. One name per run, on purpose');
    // Each run of CLEAR1 adds two lines to its record, and the text says so; rm's own checks are not promised to stop a mount.
    expect(text).toContain('So each run adds two lines: the first lets a run cut off half way take what is left of a label\'s folders.');
    expect(text).toContain('a bind mount from the same disk would not stop it, which is why a name with a mount point on it or inside it is never cleared');
    expect(text).not.toContain('refuses `/` and a mount point');
    expect(text).not.toContain('adds one line (the time, the name, the MB freed)');
    const main = flat(runbook);
    expect(main).toContain('the release guide\'s CLEARLOOK');
    expect(main.match(/CLEARLOOK/g)!.length).toBeGreaterThanOrEqual(3);
  });
});
