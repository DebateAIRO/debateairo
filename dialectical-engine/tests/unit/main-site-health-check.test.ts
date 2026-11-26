// Caddy's health check without the edge secret, in the owner's runbook (deploy/preview-auth-dev/v1/MAIN-SITE.md, 5.10):
// HEALTH1 looks and makes the copy, HEALTH2 puts it in place, HEALTHBACK is the way back. The steps live only in the
// runbook, so they are checked here as text and run in bash against throwaway Caddyfiles, with the server's commands
// stood in for: each block parses and names itself; the edit takes out the three health_headers lines of the shared rules
// and nothing else, and refuses every other shape; it prints shapes, never the secret's line; HEALTH2 changes the kept
// copies that later steps compare with or put back, so that PWON brings back a file without the secret; a failed check
// puts the file before back, says what was checked after it, and comes within about a minute; a run cut off at any point
// is finished by HEALTH2 again or undone by HEALTHBACK, which keeps the guards a way back needs. Last, the runbook's
// words around it, the morning look's count of the secret's lines, and GATESTATE.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const runbook = read('deploy/preview-auth-dev/v1/MAIN-SITE.md');
const flat = (text: string) => text.replace(/\s+/g, ' ');
const NAMES_LINE = '. /root/preview-archive/main-site/names.sh';

/** Every fenced block of the runbook, in order, as its lines. */
function fencedBlocks(text: string): string[][] {
  const out: string[][] = [];
  let open: string[] | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (open === null) open = [];
      else { out.push(open); open = null; }
    } else if (open !== null) open.push(line);
  }
  if (open !== null) throw new Error('the runbook ends inside a fenced block');
  return out;
}
const blocks = fencedBlocks(runbook);
/** The one block with a line `# <step>: …`. */
function script(step: string): string[] {
  const found = blocks.filter(block => block.some(line => line.startsWith(`# ${step}: `)));
  if (found.length !== 1) throw new Error(`${found.length} blocks name ${step}`);
  return found[0]!;
}
const HEALTH1 = script('HEALTH1');
const HEALTH2 = script('HEALTH2');
const HEALTHBACK = script('HEALTHBACK');
const STEPS = [['HEALTH1', HEALTH1], ['HEALTH2', HEALTH2], ['HEALTHBACK', HEALTHBACK]] as const;

/** The lines from the first one starting with `from` to the first line at or after it that equals `last`. */
function part(lines: readonly string[], from: string, last: string): string[] {
  const start = lines.findIndex(line => line.startsWith(from));
  const end = lines.findIndex((line, index) => index > start && line === last);
  if (start < 0 || end < 0) throw new Error(`no part from ${from}`);
  return lines.slice(start, end + 1);
}
const shared = (lines: readonly string[]) => part(lines, "# The health check's secret", '}');
const lineOf = (lines: readonly string[], start: string) => {
  const found = lines.filter(line => line.startsWith(start));
  if (found.length !== 1) throw new Error(`${found.length} lines start with ${start}`);
  return found[0]!;
};

/**
 * Runs shell text. A scratch folder reaches it as the variable `D` (and, with `cwd`, as the folder it runs in), never as
 * a path written into the text: a folder name with a quote in it could otherwise end the text's own quoting.
 */
function bash(text: string, scratch: Readonly<{ dir?: string; cwd?: boolean }> = {}) {
  const out = spawnSync('bash', ['-c', text], {
    encoding: 'utf8', ...(scratch.dir !== undefined && scratch.cwd ? { cwd: scratch.dir } : {}),
    env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`, ...(scratch.dir !== undefined ? { D: scratch.dir } : {}) }
  });
  return { status: out.status, out: out.stdout, err: out.stderr, lines: out.stdout.trim().split('\n'), last: out.stdout.trim().split('\n').at(-1) };
}

const SECRET_FILE = '/etc/debateai-v3-preview/ui-edge.caddy.secret';
const SECRET = `X-Debateai-Edge-Secret {file.${SECRET_FILE}}`;
const KEY = ['8f7e6d5c4b3a', 'r33', 'v1'].join('-');

type Shape = Readonly<{ secret?: boolean; repository?: boolean; password?: boolean; unit?: string; mark?: string; extra?: readonly string[] }>;
/**
 * A Caddyfile in the shape of the server's after the rename: the shared rules after the global block, dezbatere.ro with
 * its notice pass-through and main proxy, the test name's notice pass-through, and the loopback readiness listener; four
 * proxies, each sending the edge secret once. `repository` gives the shared rules the repository's timing, `password`
 * the basic_auth block, `mark` a first comment line that tells kept copies apart.
 */
function caddyfile(shape: Shape = {}): string {
  const u = shape.unit ?? '    ';
  const [u2, u3] = [u.repeat(2), u.repeat(3)];
  const proxy = (indent: string) => [`${indent}reverse_proxy 127.0.0.1:3100 127.0.0.1:3200 {`, `${indent}${u}import debateai_slots`,
    `${indent}${u}header_up X-Forwarded-Proto https`, `${indent}${u}header_up ${SECRET}`, `${indent}}`];
  const notify = (indent: string) => [`${indent}@netopia_notify {`, `${indent}${u}method POST`, `${indent}${u}path /api/v1/billing/netopia/notify`,
    `${indent}}`, `${indent}handle @netopia_notify {`, ...proxy(`${indent}${u}`), `${indent}}`];
  return [
    ...(shape.mark ? [`# ${shape.mark}`] : []),
    '{', `${u}admin off`, '}', '',
    '(debateai_slots) {', `${u}lb_policy first`, `${u}lb_try_duration 12s`, `${u}lb_try_interval 250ms`, `${u}health_uri /readyz`,
    `${u}health_interval ${shape.repository ? '1s' : '2s'}`, `${u}health_timeout ${shape.repository ? '3s' : '1s'}`, `${u}health_status 200`,
    `${u}health_passes 1`, `${u}health_fails ${shape.repository ? '2' : '1'}`,
    ...(shape.secret === false ? [] : [`${u}health_headers {`, `${u2}${SECRET}`, `${u}}`]),
    ...(shape.extra ?? []),
    '}', '',
    'dezbatere.ro {', `${u}route {`, ...notify(u2), `${u2}respond /readyz 404`,
    ...(shape.password === false ? [] : [`${u2}basic_auth {`, `${u3}{$PREVIEW_BASIC_AUTH_USER} {$PREVIEW_BASIC_AUTH_HASH}`, `${u2}}`]),
    ...proxy(u2), `${u}}`, '}', '',
    'v3-preview.dezbatere.ro {', `${u}route {`, ...notify(u2), `${u2}redir https://dezbatere.ro{uri} 308`, `${u}}`, '}', '',
    ':3090 {', `${u}bind 127.0.0.1`, `${u}@readyz {`, `${u2}method GET`, `${u2}path /readyz`, `${u}}`, `${u}handle @readyz {`,
    `${u2}rewrite * /readyz?`, ...proxy(u2), `${u}}`, `${u}handle {`, `${u2}respond 404`, `${u}}`, '}', ''
  ].join('\n');
}

describe('the three steps', () => {
  it('each is a script of the runbook\'s form: it parses, names itself first, ends with its DONE line, and stops only with its own NOT_DONE line', () => {
    for (const [step, lines] of STEPS) {
      expect(lines[0], step).toBe('set -euo pipefail');
      expect(lines.find(line => line.startsWith('#')), step).toMatch(new RegExp(`^# ${step}: \\S`));
      expect(lines.slice(-2), step).toEqual([`echo ${step}_DONE`, 'exit 0']);
      expect(spawnSync('bash', ['-n'], { input: lines.join('\n') }).status, step).toBe(0);
      for (const [index, line] of lines.entries()) {
        for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], `${step}: ${line}`).toBe(step);
        if (line.includes('_NOT_DONE')) expect(`${line}\n${lines[index + 1] ?? ''}`, `${step}: ${line}`).toMatch(/exit 1/);
      }
    }
    // HEALTH1 and HEALTH2 read the names file; HEALTHBACK reads none.
    expect(HEALTH1[1]).toBe(NAMES_LINE);
    expect(HEALTH2[1]).toBe(NAMES_LINE);
    expect(HEALTHBACK).not.toContain(NAMES_LINE);
    // The guards' NOT_DONE lines name the step that calls them.
    expect(HEALTH1).toContain('hguards HEALTH1');
    expect(HEALTH2).toContain('hguards HEALTH2');
  });

  it('the edit, its shapes, the kept copies, the readiness question and the guards are the same text in HEALTH1 and HEALTH2', () => {
    expect(shared(HEALTH2)).toEqual(shared(HEALTH1));
    expect(shared(HEALTH1).at(-1)).toBe('}');
    expect(shared(HEALTH1).some(line => line.startsWith('hguards() {'))).toBe(true);
  });

  it('carries no working notes, and no `grep -q` at the end of a pipeline', () => {
    for (const [, lines] of STEPS) {
      for (const line of lines) {
        expect(line).not.toMatch(/\b(REL|MS|LC)( |, )\d/);
        expect(line).not.toMatch(/\btonight\b|\br\d\d\b/i);
        expect(line).not.toMatch(/\|\s*grep -[a-zA-Z]*q/);
      }
    }
  });

  it('HEALTH2 validates with the guides\' own caddy command, and reads the health check as the release guide\'s TA-caddy does', () => {
    expect(HEALTH2).toContain('cad validate --config "$HA" --adapter caddyfile >/dev/null 2>&1 || { echo "HEALTH2_NOT_DONE: caddy validate refused the copy: ask; nothing changed"; exit 1; }');
    const ta = read('deploy/preview-release/v1/README.md').split('\n').find(line => line.startsWith('HC=$(jq -r '))!;
    const filter = /jq -r '([^']*)'/.exec(ta)![1]!;
    expect(lineOf(HEALTH2, 'hc() {')).toContain(`jq -r '${filter}'`);
  });
});

/** The edit's functions alone, from HEALTH1. */
const EDIT = [lineOf(HEALTH1, 'hstrip() {'), lineOf(HEALTH1, 'hshape() {'), lineOf(HEALTH1, 'HS=')].join('\n');

describe('the edit', () => {
  const withFiles = <T>(body: (dir: string) => T): T => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-health-edit-')));
    try { return body(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const strip = (dir: string, text: string) => {
    writeFileSync(join(dir, 'in'), text);
    return bash(`set -euo pipefail\n${EDIT}\nif hstrip in > out; then echo stripped; hshape in out; else echo refused; fi`, { dir, cwd: true });
  };

  it('takes out the three lines, whatever the indentation, and nothing else; the shape is the one both steps accept', () => withFiles(dir => {
    for (const unit of ['    ', '\t']) {
      const run = strip(dir, caddyfile({ unit }));
      expect(run.lines).toEqual(['stripped', 'taken out: 3 lines (health_headers {, the secret\'s line, }); added: 0; places: 1']);
      expect(readFileSync(join(dir, 'out'), 'utf8')).toBe(caddyfile({ unit, secret: false }));
    }
    expect(bash(`${EDIT}\necho "$HS"`).out.trim()).toBe('taken out: 3 lines (health_headers {, the secret\'s line, }); added: 0; places: 1');
  }));

  it('refuses every other shape: none, two, outside the shared rules, another header, a longer block, the one-line form, another mention', () => withFiles(dir => {
    const live = caddyfile();
    const cases: Readonly<Record<string, string>> = {
      none: caddyfile({ secret: false }),
      two: caddyfile({ extra: ['    health_headers {', `        ${SECRET}`, '    }'] }),
      outside: caddyfile({ secret: false }).replace('dezbatere.ro {\n', `dezbatere.ro {\n    health_headers {\n        ${SECRET}\n    }\n`),
      other: live.replace(`        ${SECRET}`, '        X-Other {file./etc/x}'),
      longer: live.replace(`        ${SECRET}\n`, `        ${SECRET}\n        X-Other yes\n`),
      oneline: live.replace(`    health_headers {\n        ${SECRET}\n    }`, `    health_headers ${SECRET}`),
      comment: `# health_headers came out with 5.10\n${live}`
    };
    for (const [name, text] of Object.entries(cases)) expect(strip(dir, text).lines, name).toEqual(['refused']);
  }));

  it('a copy that takes out more than the three lines has another shape', () => withFiles(dir => {
    writeFileSync(join(dir, 'a'), caddyfile());
    writeFileSync(join(dir, 'b'), caddyfile({ secret: false }).replace('    health_fails 1\n', ''));
    const run = bash(`set -euo pipefail\n${EDIT}\nhshape a b`, { dir, cwd: true });
    expect(run.out.trim()).toBe('taken out: 4 lines (other, other, }); added: 0; places: 1');
  }));
});

type Setup = Readonly<{
  /** on: the password asks (no PWOFF1 copies); off: PWOFF2's file is live; between: PWOFF1 ran, PWOFF2 not yet. */
  password?: 'on' | 'off' | 'between';
  repository?: boolean;
  window?: boolean; signups?: boolean; maintenance?: boolean;
  answers?: Readonly<Record<string, string>>;
  /** Answers from Caddy's first restart on (`after1/<name>`), and from its second (`after2/<name>`); else `ans/<name>`. */
  after?: Readonly<Record<string, string>>;
  after2?: Readonly<Record<string, string>>;
}>;
type World = Readonly<{ dir: string; file: (path: string) => string; has: (path: string) => boolean; live: () => string }>;

/**
 * The server's commands, stood in for. An answer comes from `after<n>/<name>` once Caddy has restarted n times, else from
 * `ans/<name>`: a put-back's restart (the second) answers as before the change unless a test says otherwise. A restart
 * that Caddy survives copies the live file to `caddy-runs`: the file Caddy runs.
 */
const STUBS = [
  `C=$D/Caddyfile; M=$D/m; KEY=${KEY}; UIP=3100; HOST=dezbatere.ro; CAPI=$D/capi`,
  'ans() { local n; n=$(grep -c . "$D/restarts" 2>/dev/null || true); if [ -e "$D/after${n:-0}/$1" ]; then cat "$D/after${n:-0}/$1"; else cat "$D/ans/$1"; fi; }',
  'sleep() { :; }',
  'systemctl() { case "$1" in',
  '  list-units) case "$*" in *ms-step*) cat "$D/ms-steps" 2>/dev/null || true;; *) ans failed;; esac;;',
  '  is-active) cat "$D/caddy-state";;',
  '  restart) echo restart >> "$D/restarts"; if [ -e "$D/caddy-dies" ]; then echo failed > "$D/caddy-state"; else echo active > "$D/caddy-state"; cp "$C" "$D/caddy-runs"; fi;;',
  '  esac; }',
  'edgekey() { printf \'%s\\n\' "$(ans edge)"; }',
  'notify() { ans notify; }',
  'install() { local d=no; local -a x; x=(); while [ $# -gt 0 ]; do case "$1" in -d) d=yes; shift;; -o|-g|-m) shift 2;; *) x+=("$1"); shift;; esac; done; if [ "$d" = yes ]; then mkdir -p "${x[@]}"; elif grep -qxF "${x[1]%.new}" "$D/install-fails" 2>/dev/null; then return 1; else cp "${x[0]}" "${x[1]}"; fi; }',
  'curl() { local a p="" u="" w="" h=no k c; for a; do [ "$p" = -w ] && w=$a; [ "$p" = -D ] && h=yes; case "$a" in http*) u=$a;; esac; p=$a; done',
  '  case "$u" in http://127.0.0.1:3100/readyz) k=slot-3100;; http://127.0.0.1:3200/readyz) k=slot-3200;; http://127.0.0.1:3090/readyz) k=listener;; */login) k=login;; */readyz) k=public-readyz;; */notify) k=notify;; */) k=home;; *) k=other;; esac',
  // With -D (headers): the loopback listener's status and release, as `edge` says (000: no answer), or the Log in page's release.
  '  if [ "$h" = yes ]; then if [ "$k" = listener ]; then c=$(ans edge); [ "${c%% *}" != 000 ] || return 7; printf \'HTTP/1.1 %s\\r\\nx-debateai-release: %s\\r\\n\\r\\n\' "${c%% *}" "${c#* }"; else printf \'HTTP/2 200\\r\\nx-debateai-release: %s\\r\\n\\r\\n\' "$(ans release)"; fi; return 0; fi',
  '  c=$(ans "$k")',
  '  case "$w" in \'\\n%{http_code}\') if [ "$c" = 000 ]; then printf \'\\n000\'; else printf \'{"releaseKey":"%s","reasons":[]}\\n%s\' "$(ans "$k-key")" "$c"; fi;; *) printf \'%s\' "$c";; esac; }',
  'cad() { local f=$3 hh=""; case "$1" in validate) [ ! -e "$D/cad-refuses" ];; adapt) if grep -q health_headers "$f"; then hh=\',"headers":{"X-Debateai-Edge-Secret":["x"]}\'; fi; printf \'{"apps":{"http":{"servers":{"a":{"routes":[{"handle":[{"handler":"reverse_proxy","health_checks":{"active":{"uri":"/readyz","passes":1,"fails":1%s}}}]}]},"b":{"routes":[{"handle":[{"handler":"reverse_proxy","health_checks":{"active":{"uri":"/readyz","passes":1,"fails":1%s}}}]}]}}}}}\' "$hh" "$hh";; esac; }'
];

/** The kept copies of the runbook's steps, each told apart by its first line. */
const NAME_COPIES = ['before-dezbatere', 'phase1', 'main'] as const;

function world(setup: Setup): World {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-health-')));
  for (const sub of ['m/name', 'm/password', 'ans', 'after1', 'after2', 'capi/dialectical-engine/deploy/preview-release/v1/caddy']) mkdirSync(join(dir, sub), { recursive: true });
  cpSync(resolve(ROOT, 'deploy/preview-release/v1/caddy/debateai-slots.caddy'), join(dir, 'capi/dialectical-engine/deploy/preview-release/v1/caddy/debateai-slots.caddy'));
  const password = setup.password ?? 'on';
  const repository = setup.repository ?? false;
  const live = caddyfile({ repository, password: password !== 'off' });
  writeFileSync(join(dir, 'Caddyfile'), setup.window ? `${live}# review window begin: stand-in\n` : live);
  cpSync(join(dir, 'Caddyfile'), join(dir, 'caddy-runs'));
  writeFileSync(join(dir, 'm/name/Caddyfile.before-dezbatere'), caddyfile({ repository, mark: 'before-dezbatere' }));
  writeFileSync(join(dir, 'm/name/Caddyfile.phase1'), caddyfile({ repository, mark: 'phase1' }));
  writeFileSync(join(dir, 'm/name/Caddyfile.main'), caddyfile({ repository }));
  if (password !== 'on') {
    writeFileSync(join(dir, 'm/password/Caddyfile.before-open'), caddyfile({ repository }));
    writeFileSync(join(dir, 'm/password/Caddyfile.open'), live);
  }
  if (setup.signups) writeFileSync(join(dir, 'm/password/Caddyfile.signups'), live);
  if (setup.maintenance) writeFileSync(join(dir, 'maintenance-pending'), '');
  const asks = password === 'off' ? '200' : '401';
  const answers: Record<string, string> = {
    'slot-3100': '200', 'slot-3100-key': KEY, 'slot-3200': '000', listener: '200', edge: `200 ${KEY}`, login: asks, home: asks,
    'public-readyz': '404', notify: '400', release: KEY, failed: '', ...setup.answers
  };
  for (const [name, text] of Object.entries(answers)) writeFileSync(join(dir, 'ans', name), text);
  for (const [name, text] of Object.entries(setup.after ?? {})) writeFileSync(join(dir, 'after1', name), text);
  for (const [name, text] of Object.entries(setup.after2 ?? {})) writeFileSync(join(dir, 'after2', name), text);
  writeFileSync(join(dir, 'caddy-state'), 'active\n');
  // The release table, as release-check.mjs status prints it (HEALTHBACK reads it itself).
  writeFileSync(join(dir, 'status.json'), JSON.stringify({ releases: [{ label: 'old-r32-v1', state: 'RETIRED' }, { label: 'cur-r33-v1', state: 'CURRENT' }] }));
  return {
    dir, file: path => readFileSync(join(dir, path), 'utf8'), has: path => existsSync(join(dir, path)),
    live: () => readFileSync(join(dir, 'Caddyfile'), 'utf8')
  };
}
const withWorld = <T>(setup: Setup, body: (w: World) => T): T => {
  const w = world(setup);
  try { return body(w); } finally { rmSync(w.dir, { recursive: true, force: true }); }
};

/** Whether Caddy started on the live file: read from Caddy's start time and the file's time on the server (tested alone below), from the file Caddy runs here. */
const CNEW = lineOf(HEALTHBACK, 'cnew() {');
const CNEW_HERE = 'cnew() { [ "$(cat "$D/caddy-state")" = active ] && cmp -s "$C" "$D/caddy-runs"; }';

/** Runs a step in the world: the names file (or a step's own paths) replaced by the stand-ins, the maintenance flag in the world. */
function run(lines: readonly string[], w: World, swap: Readonly<Record<string, string>> = {}) {
  let text = lines.join('\n').replace(NAMES_LINE, () => STUBS.join('\n'))
    .replaceAll('/etc/debateai-v3-preview/lifecycle/maintenance-pending', '$D/maintenance-pending')
    .replaceAll(CNEW, () => CNEW_HERE);
  for (const [from, to] of Object.entries(swap)) {
    expect(text, from).toContain(from);
    text = text.replace(from, () => to);
  }
  const result = bash(text, { dir: w.dir });
  // Nothing the steps print names the secret's line or its file.
  expect(result.out).not.toContain(SECRET_FILE);
  expect(result.out).not.toContain('X-Debateai-Edge-Secret {');
  return result;
}
/** HEALTHBACK and PWON read no names file: their own paths go to the world, with the stand-ins before them. */
const OWN_PATHS = 'C=/etc/debateai-v3-preview/public/Caddyfile; M=/root/preview-archive/main-site';
const own = () => ({ [OWN_PATHS]: STUBS.join('\n') });
/** HEALTHBACK also reads the release table itself, through the lifecycle tools: stood in for by the world's status.json. */
const ownBack = (w: World) => ({ ...own(), [lineOf(HEALTHBACK, 'lc() {')]: 'lc() { [ "$1 $2" = \'release-check.mjs status\' ] || return 9; cat "$D/status.json"; }' });

describe('HEALTH1 and HEALTH2 on the server\'s shape', () => {
  it('with the password on: the live file and NAME1\'s and NAME2\'s copies lose the three lines, and nothing else', () => withWorld({}, w => {
    const one = run(HEALTH1, w);
    expect(one.last).toBe('HEALTH1_DONE');
    expect(one.lines).toContain('health_headers: one block of three lines, inside the shared rules, naming only X-Debateai-Edge-Secret');
    expect(one.lines).toContain('proxies: 4; their header_up lines with the edge secret: 4, from 1 file');
    expect(one.lines).toContain('this release\'s website (port 3100), asked with no secret: 200; it names this release: yes');
    expect(one.lines).toContain('the other slot\'s website (port 3200): 000 (000: nothing listens there, as in an empty slot)');
    expect(one.lines).toContain('the edit, on the copy only: taken out: 3 lines (health_headers {, the secret\'s line, }); added: 0; places: 1');
    for (const copy of NAME_COPIES) expect(one.lines).toContain(`kept copy name/Caddyfile.${copy}: one health_headers block (HEALTH2 takes it out there too)`);
    expect(one.lines).toContain('the shared rules without the secret are this release\'s debateai-slots.caddy: no; the settings that differ: health_fails health_interval health_timeout (HEALTH2 changes none of them)');
    expect(w.live()).toBe(caddyfile());
    expect(w.file('m/health/Caddyfile.health')).toBe(caddyfile({ secret: false }));

    const two = run(HEALTH2, w);
    expect(two.last).toBe('HEALTH2_DONE');
    expect(two.lines).toContain('the health check as Caddy reads it, before: /readyz passes 1 fails 1 secret true; after: /readyz passes 1 fails 1 secret false');
    expect(two.lines).toContain('kept copies that get the same edit after the checks: 3');
    expect(w.file('restarts')).toBe('restart\n');
    expect(w.live()).toBe(caddyfile({ secret: false }));
    expect(w.file('m/name/Caddyfile.before-dezbatere')).toBe(caddyfile({ secret: false, mark: 'before-dezbatere' }));
    expect(w.file('m/name/Caddyfile.phase1')).toBe(caddyfile({ secret: false, mark: 'phase1' }));
    // REVIEW_OPEN's guard: the live file is still the one NAME3 put in place.
    expect(w.file('m/name/Caddyfile.main')).toBe(w.live());
    // The kept copies as they were stay beside the list HEALTHBACK reads, with the answers before the change and the mark
    // that every check passed (a run again reads how far this one got).
    const kept = w.file('m/health/last-kept').trim();
    expect(readdirSync(kept).sort()).toEqual(['before', 'checked', 'failed-before', 'list', ...NAME_COPIES.flatMap(copy => [`name-Caddyfile.${copy}.after`, `name-Caddyfile.${copy}.before`])].sort());
    expect(readFileSync(join(kept, 'name-Caddyfile.phase1.before'), 'utf8')).toBe(caddyfile({ mark: 'phase1' }));

    // Run again: nothing to do, nothing changed.
    expect(run(HEALTH1, w).last).toBe('HEALTH1_NOT_DONE: the live Caddyfile has no health_headers line: its health check sends no secret already, and HEALTH2 is not needed; nothing changed');
    expect(run(HEALTH2, w).last).toBe('HEALTH2_NOT_DONE: the copy without the secret is live already (HEALTH2 ran before); nothing changed');
  }));

  it('with the password off: PWOFF1\'s copies get the edit too, so PWON brings back the password without the secret', () => withWorld({ password: 'off', repository: true }, w => {
    const one = run(HEALTH1, w);
    expect(one.last).toBe('HEALTH1_DONE');
    expect(one.lines).toContain('the site password is off (PWOFF2\'s file is live): PWOFF1\'s two copies get the same edit');
    expect(one.lines).toContain('the shared rules without the secret are this release\'s debateai-slots.caddy: yes');
    const two = run(HEALTH2, w);
    expect(two.last).toBe('HEALTH2_DONE');
    expect(two.lines).toContain('kept copies changed: 5 (each one as it was is in ' + w.file('m/health/last-kept').trim() + ')');
    // OPENCHECK's and SIGNUPS's guard: the live file is PWOFF2's copy.
    expect(w.file('m/password/Caddyfile.open')).toBe(w.live());
    expect(w.file('m/password/Caddyfile.before-open')).toBe(caddyfile({ repository: true, secret: false }));

    // PWON, as the runbook has it: the password back, from the kept copy, and no secret in the health check.
    rmSync(join(w.dir, 'restarts'));
    writeFileSync(join(w.dir, 'after1/login'), '401');
    const pwon = run(script('PWON'), w, own());
    expect(pwon.last).toBe('PWON_DONE');
    expect(w.live()).toBe(caddyfile({ repository: true, secret: false }));
    expect(w.live()).not.toContain('health_headers');
  }));

  it('a failed check after the restart puts the file before back, and leaves the kept copies as they were', () => {
    const failures: Readonly<Record<string, Setup>> = {
      edge: { after: { edge: '000 none' } },
      website: { after: { 'slot-3100': '503' } },
      login: { after: { login: '502' } },
      readyz: { after: { 'public-readyz': '200' } },
      notify: { after: { notify: '502' } },
      'failed-units': { after: { failed: 'debateai-preview-hatchet-gateway.service' } },
      // With the site open, the Log in page names the release that serves it.
      release: { password: 'off', after: { release: 'another-release' } }
    };
    for (const [word, setup] of Object.entries(failures)) withWorld(setup, w => {
      const before = w.live();
      expect(run(HEALTH1, w).last).toBe('HEALTH1_DONE');
      const two = run(HEALTH2, w);
      expect(two.status, word).toBe(1);
      const asks = setup.password === 'off' ? '200' : '401';
      expect(two.last, word).toBe(`HEALTH2_NOT_DONE: a check failed (${word}); the file before is back (the live file is the file before: yes), Caddy restarted on it and is active, the loopback listener answers 200 from this release: yes, the Log in page answers as before (${asks}): yes; the kept copies are unchanged: ask`);
      expect(w.file('restarts')).toBe('restart\nrestart\n');
      expect(w.live()).toBe(before);
      expect(w.file('m/name/Caddyfile.phase1')).toBe(caddyfile({ mark: 'phase1' }));
      // The record was written before the copy went live; HEALTHBACK finds nothing to put back.
      expect(w.has('m/health/last-kept')).toBe(true);
      expect(run(HEALTHBACK, w, ownBack(w)).lines.slice(-2)).toEqual(['the live Caddyfile is the one from before HEALTH2 already, and no kept copy has HEALTH2\'s edit (HEALTH2 did not get that far, or put the file back itself); nothing changed', 'HEALTHBACK_DONE']);
    });
  });

  it('after a put-back it says plainly what it checked: the file, Caddy, the listener and the Log in page', () => withWorld({ after: { edge: '000 none' }, after2: { edge: '000 none', login: '502' } }, w => {
    run(HEALTH1, w);
    expect(run(HEALTH2, w).last).toBe('HEALTH2_NOT_DONE: a check failed (edge); the file before is back (the live file is the file before: yes), Caddy restarted on it and is active, the loopback listener answers 200 from this release: no, the Log in page answers as before (401): no; the kept copies are unchanged: ask');
  }));

  it('after the restart every question is cut short, so the file before is back within about a minute', () => {
    const after = HEALTH2.slice(HEALTH2.findIndex(line => line.trim().startsWith('systemctl restart caddy')));
    // The helpers ask with the limit CM, 15 before the restart and 4 after it; the listener is asked for at most about 30 seconds.
    for (const name of ['code() {', 'pubkey() {', 'ek() {', 'nt() {']) expect(lineOf(HEALTH2, name), name).toContain('-m "$CM"');
    expect(HEALTH2).toContain('CM=15');
    expect(after[1]).toBe('  CM=4; T1=$(( $(date +%s) + 30 ))');
    expect(after[2]).toBe('  EK1=\'000 none\'; for i in $(seq 1 15); do EK1=$(ek); [ "$EK1" != "200 $KEY" ] || break; [ "$(date +%s)" -lt "$T1" ] || break; sleep 1; done');
    // No question after the restart goes through a helper without a limit.
    for (const line of after.slice(0, after.findIndex(line => line.includes('if [ -n "$BAD" ]')))) expect(line, line).not.toMatch(/\$\((edgekey|notify)\b/);
  });

  it('says the site is down when Caddy does not start on the file before either', () => withWorld({ after: { edge: '000 none' } }, w => {
    run(HEALTH1, w);
    writeFileSync(join(w.dir, 'caddy-dies'), '');
    const two = run(HEALTH2, w);
    expect(two.last).toBe('HEALTH2_NOT_DONE: a check failed (caddy edge); the file before is back (the live file is the file before: yes), but Caddy did not start on it: the site is DOWN: ask at once');
  }));

  it('refuses before the change, with nothing changed and Caddy not restarted', () => {
    const refusals: Readonly<Record<string, readonly [Setup, string]>> = {
      window: [{ window: true }, 'HEALTH1_NOT_DONE: the NETOPIA review window is open: REVIEW_CLOSE (5.8) first, then HEALTH1 and HEALTH2, then REVIEW_OPEN again; nothing changed'],
      between: [{ password: 'between' }, 'HEALTH1_NOT_DONE: PWOFF1\'s copies are there, but the live Caddyfile is not the one PWOFF2 put in place (between PWOFF1 and PWOFF2?): finish PWOFF2, or run PWON; nothing changed'],
      signups: [{ signups: true }, 'HEALTH1_NOT_DONE: an edited copy for SIGNUPS waits: finish SIGNUPS (6.5 (c)), or move $M/password/Caddyfile.signups aside; nothing changed'],
      maintenance: [{ maintenance: true }, 'HEALTH1_NOT_DONE: the maintenance flag is there (a restart of the server, or other maintenance, is under way): wait until it is over; nothing changed'],
      website: [{ answers: { 'slot-3100': '503' } }, 'HEALTH1_NOT_DONE: this release\'s website does not answer its readiness 200 to a request with no secret, so Caddy would take it out: ask; nothing changed'],
      other: [{ answers: { 'slot-3200': '503', 'slot-3200-key': 'x' } }, 'HEALTH1_NOT_DONE: something answers on the other slot\'s website port, while no release is staged or draining: ask; nothing changed'],
      readyz: [{ answers: { 'public-readyz': '200' } }, 'HEALTH1_NOT_DONE: the public route answers /readyz with 200, not 404: ask; nothing changed']
    };
    for (const [name, [setup, last]] of Object.entries(refusals)) withWorld(setup, w => {
      const before = w.live();
      const one = run(HEALTH1, w);
      expect(one.status, name).toBe(1);
      expect(one.last?.replace(w.dir, '$D').replace('$D/m/', '$M/'), name).toBe(last);
      expect(w.live(), name).toBe(before);
      expect(w.has('m/health/Caddyfile.health'), name).toBe(false);
    });
  });

  it('HEALTH2 refuses a live file or a copy changed since HEALTH1, and a file Caddy reads no secret in', () => {
    withWorld({}, w => {
      run(HEALTH1, w);
      writeFileSync(join(w.dir, 'Caddyfile'), `${w.live()}# a hand edit\n`);
      expect(run(HEALTH2, w).last).toBe('HEALTH2_NOT_DONE: the live Caddyfile changed since HEALTH1: run HEALTH1 again; nothing changed');
    });
    withWorld({}, w => {
      run(HEALTH1, w);
      writeFileSync(join(w.dir, 'm/health/Caddyfile.health'), caddyfile({ secret: false }).replace('    health_fails 1\n', ''));
      expect(run(HEALTH2, w).last).toBe('HEALTH2_NOT_DONE: the copy is not the file before with only the health_headers block taken out (edited since HEALTH1?): run HEALTH1 again; nothing changed');
      expect(w.has('restarts')).toBe(false);
    });
    withWorld({}, w => {
      run(HEALTH1, w);
      writeFileSync(join(w.dir, 'cad-refuses'), '');
      expect(run(HEALTH2, w).last).toBe('HEALTH2_NOT_DONE: caddy validate refused the copy: ask; nothing changed');
      expect(w.live()).toBe(caddyfile());
    });
  });

  it('HEALTH1 again before HEALTH2 moves its earlier copies aside and makes them anew', () => withWorld({}, w => {
    run(HEALTH1, w);
    const again = run(HEALTH1, w);
    expect(again.last).toBe('HEALTH1_DONE');
    expect(again.lines.some(line => /^an earlier HEALTH1's copies moved aside \(\.\d{8}T\d{6}Z\)$/.test(line))).toBe(true);
    expect(w.file('m/health/Caddyfile.health')).toBe(caddyfile({ secret: false }));
  }));
});

describe('HEALTHBACK', () => {
  it('puts back the file and the kept copies, and HEALTH1 can run again', () => withWorld({ password: 'off' }, w => {
    run(HEALTH1, w);
    expect(run(HEALTH2, w).last).toBe('HEALTH2_DONE');
    const back = run(HEALTHBACK, w, ownBack(w));
    expect(back.last).toBe('HEALTHBACK_DONE');
    expect(w.live()).toBe(caddyfile({ password: false }));
    expect(w.file('m/password/Caddyfile.open')).toBe(w.live());
    expect(w.file('m/password/Caddyfile.before-open')).toBe(caddyfile());
    expect(w.file('m/name/Caddyfile.phase1')).toBe(caddyfile({ mark: 'phase1' }));
    expect(w.has('m/health/Caddyfile.before-health')).toBe(false);
    expect(run(HEALTH1, w).last).toBe('HEALTH1_DONE');
  }));

  it('refuses, with nothing changed, once a later step changed the live file or a kept copy', () => {
    withWorld({}, w => {
      run(HEALTH1, w); run(HEALTH2, w);
      writeFileSync(join(w.dir, 'Caddyfile'), `${w.live()}# a later step\n`);
      expect(run(HEALTHBACK, w, ownBack(w)).last).toBe('HEALTHBACK_NOT_DONE: the live Caddyfile is neither the one HEALTH2 put in place nor the one before it (a later step changed it); nothing changed: ask');
    });
    withWorld({}, w => {
      run(HEALTH1, w); run(HEALTH2, w);
      writeFileSync(join(w.dir, 'm/name/Caddyfile.phase1'), 'changed\n');
      expect(run(HEALTHBACK, w, ownBack(w)).last).toBe('HEALTHBACK_NOT_DONE: the kept copy name/Caddyfile.phase1 changed since HEALTH2; nothing changed: ask');
      expect(w.live()).toBe(caddyfile({ secret: false }));
    });
  });

  it('when Caddy does not come back on the file before, the file without the secret goes back', () => withWorld({}, w => {
    run(HEALTH1, w); run(HEALTH2, w);
    // HEALTHBACK's restart is Caddy's second; the third, on the file without the secret, answers as before.
    writeFileSync(join(w.dir, 'after2/public-readyz'), '000');
    const back = run(HEALTHBACK, w, ownBack(w));
    expect(back.last).toBe('HEALTHBACK_NOT_DONE: Caddy did not come back on the file before (Caddy active; the public /readyz 000, where Caddy\'s own refusal is 404); the file without the secret is back (the live file is HEALTH2\'s copy: yes), and Caddy is active and refuses /readyz itself: yes (active and yes: as after HEALTH2; anything else: the site is DOWN): ask at once');
    expect(w.live()).toBe(caddyfile({ secret: false }));
    expect(w.file('restarts')).toBe('restart\nrestart\nrestart\n');
    // Everything is still there for a run again.
    expect(w.has('m/health/Caddyfile.before-health') && w.has('m/health/last-kept')).toBe(true);
  }));

  it('judges Caddy by its own answer, so it works while the website is stopped (the listener only as information)', () => withWorld({}, w => {
    run(HEALTH1, w); run(HEALTH2, w);
    // The website stopped, as in the drained upload's downtime: the listener passes the request on and gets no answer.
    writeFileSync(join(w.dir, 'after2/listener'), '503');
    const back = run(HEALTHBACK, w, ownBack(w));
    expect(back.lines).toContain('after the restart: Caddy active; the public /readyz 404 (404: Caddy\'s own refusal); the loopback listener 503 (through Caddy to the website: 200 while the website runs; information only)');
    expect(back.last).toBe('HEALTHBACK_DONE');
    expect(w.live()).toBe(caddyfile());
  }));

  it('says the site is down when Caddy does not run after the restart', () => withWorld({}, w => {
    run(HEALTH1, w); run(HEALTH2, w);
    writeFileSync(join(w.dir, 'caddy-dies'), '');
    const back = run(HEALTHBACK, w, ownBack(w));
    expect(back.last).toBe('HEALTHBACK_NOT_DONE: Caddy did not come back on the file before (Caddy failed; the public /readyz 404, where Caddy\'s own refusal is 404); the file without the secret is back (the live file is HEALTH2\'s copy: yes), and Caddy is failed and refuses /readyz itself: yes (active and yes: as after HEALTH2; anything else: the site is DOWN): ask at once');
  }));

  it('keeps the guards a way back needs, and refuses with nothing changed', () => {
    const refusals: Readonly<Record<string, readonly [(w: World) => void, string]>> = {
      'detached step': [w => writeFileSync(join(w.dir, 'ms-steps'), 'ms-step-101500.service loaded active running /bin/bash /root/ms-step.sh\n'), 'HEALTHBACK_NOT_DONE: a detached step still runs (read its log first); nothing changed'],
      maintenance: [w => writeFileSync(join(w.dir, 'maintenance-pending'), ''), 'HEALTHBACK_NOT_DONE: the maintenance flag is there (a restart of the server, or other maintenance, is under way): wait until it is over; nothing changed'],
      upload: [w => writeFileSync(join(w.dir, 'status.json'), JSON.stringify({ releases: [{ label: 'new-r34-v1', state: 'STAGED' }, { label: 'cur-r33-v1', state: 'CURRENT' }] })), 'HEALTHBACK_NOT_DONE: a release is staged or draining (an upload is under way): wait until it is over; nothing changed'],
      'release table': [w => writeFileSync(join(w.dir, 'status.json'), ''), 'HEALTHBACK_NOT_DONE: a release is staged or draining (an upload is under way): wait until it is over; nothing changed'],
      signups: [w => writeFileSync(join(w.dir, 'm/password/Caddyfile.signups'), 'x\n'), 'HEALTHBACK_NOT_DONE: an edited copy for SIGNUPS waits: finish SIGNUPS (6.5 (c)), or move $M/password/Caddyfile.signups aside; nothing changed'],
      window: [w => writeFileSync(join(w.dir, 'Caddyfile'), `${w.live()}# review window begin: stand-in\n`), 'HEALTHBACK_NOT_DONE: the NETOPIA review window is open: REVIEW_CLOSE (5.8) first, then HEALTHBACK; nothing changed']
    };
    for (const [name, [make, last]] of Object.entries(refusals)) withWorld({}, w => {
      run(HEALTH1, w); run(HEALTH2, w);
      make(w);
      const live = w.live();
      const out = run(HEALTHBACK, w, ownBack(w));
      expect(out.status, name).toBe(1);
      expect(out.last?.replace(`${w.dir}/m/`, '$M/'), name).toBe(last);
      expect(w.live(), name).toBe(live);
      expect(w.file('restarts'), name).toBe('restart\n');
      expect(w.file('m/name/Caddyfile.phase1'), name).toBe(caddyfile({ secret: false, mark: 'phase1' }));
    });
    // It does not ask for Caddy running: a Caddy that does not run is a reason to go back.
    withWorld({}, w => {
      run(HEALTH1, w); run(HEALTH2, w);
      writeFileSync(join(w.dir, 'caddy-state'), 'failed\n');
      expect(run(HEALTHBACK, w, ownBack(w)).last).toBe('HEALTHBACK_DONE');
      expect(w.live()).toBe(caddyfile());
    });
    // HEALTH2 never ran, and Caddy has not started on the live file: not HEALTHBACK's to mend.
    withWorld({}, w => {
      run(HEALTH1, w);
      writeFileSync(join(w.dir, 'caddy-state'), 'failed\n');
      expect(run(HEALTHBACK, w, ownBack(w)).last).toBe('HEALTHBACK_NOT_DONE: the live Caddyfile is the one from before HEALTH2, and HEALTH2 left no record of kept copies, but Caddy (failed) has not started since that file was written: ask; nothing changed');
      expect(w.has('restarts')).toBe(false);
      writeFileSync(join(w.dir, 'caddy-state'), 'active\n');
      expect(run(HEALTHBACK, w, ownBack(w)).lines.slice(-2)).toEqual(['the live Caddyfile is the one from before HEALTH2 already, and HEALTH2 left no record of kept copies (it did not get that far); nothing changed', 'HEALTHBACK_DONE']);
    });
    // PWOFF1's copies made after HEALTH2 are not on its record: PWON first.
    withWorld({}, w => {
      run(HEALTH1, w); run(HEALTH2, w);
      writeFileSync(join(w.dir, 'm/password/Caddyfile.before-open'), w.live());
      writeFileSync(join(w.dir, 'm/password/Caddyfile.open'), caddyfile({ secret: false, password: false }));
      expect(run(HEALTHBACK, w, ownBack(w)).last).toBe('HEALTHBACK_NOT_DONE: PWOFF1\'s copies were made after HEALTH2 (they are not on its record): run PWON first (the password still asks, so it only moves them aside), then HEALTHBACK; nothing changed');
      expect(w.live()).toBe(caddyfile({ secret: false }));
    });
  });
});

/** A step cut off right before one of its lines (the window lost, or the server restarted, there). */
const cutAt = (line: string) => ({ [line]: 'exit 9' });
const RESTART_LINE = "  systemctl restart caddy || echo 'systemctl restart of Caddy returned non-zero'; sleep 3";
const PUT_BACK_RESTART = '    systemctl restart caddy || true; sleep 3';

describe('a run cut off at any point is finished by HEALTH2 again, or undone by HEALTHBACK', () => {
  it('cut after the copy went live, before the restart: HEALTH1 and PWON refuse, HEALTH2 again restarts, checks and finishes', () => withWorld({ password: 'off' }, w => {
    run(HEALTH1, w);
    expect(run(HEALTH2, w, cutAt(RESTART_LINE)).status).toBe(9);
    // The record of the kept copies and the answers before the change were written before the copy went live.
    expect(w.live()).toBe(caddyfile({ password: false, secret: false }));
    const kept = w.file('m/health/last-kept').trim();
    expect(readFileSync(join(kept, 'before'), 'utf8')).toBe('200\n' + KEY + '\n400\n');
    expect(w.has('restarts')).toBe(false);
    expect(run(HEALTH1, w).last).toBe('HEALTH1_NOT_DONE: HEALTH2 was cut off after its copy without the secret went live: run HEALTH2 again (it finishes), or HEALTHBACK (it puts everything back); nothing changed');
    // PWON refuses here (the live file is not PWOFF2's any more): the reason this run must be finished first.
    expect(run(script('PWON'), w, own()).last).toMatch(/^PWON_NOT_DONE: the live Caddyfile is not the one PWOFF2 put in place/);
    const again = run(HEALTH2, w);
    expect(again.lines).toContain('HEALTH2 was cut off after its copy went live, before every check after the restart had passed: Caddy restarts again on it, and the checks run against the answers kept before the change');
    expect(again.lines).toContain('kept copies on the record of the run that was cut off: 5');
    expect(again.last).toBe('HEALTH2_DONE');
    expect(w.file('restarts')).toBe('restart\n');
    expect(w.file('m/password/Caddyfile.open')).toBe(w.live());
    expect(w.file('m/name/Caddyfile.phase1')).toBe(caddyfile({ secret: false, mark: 'phase1' }));
    expect(run(HEALTH2, w).last).toBe('HEALTH2_NOT_DONE: the copy without the secret is live already (HEALTH2 ran before); nothing changed');
  }));

  it('cut there, a failed check on the run again still puts the file before back', () => withWorld({ after: { login: '502' } }, w => {
    run(HEALTH1, w);
    run(HEALTH2, w, cutAt(RESTART_LINE));
    expect(run(HEALTH2, w).last).toBe('HEALTH2_NOT_DONE: a check failed (login); the file before is back (the live file is the file before: yes), Caddy restarted on it and is active, the loopback listener answers 200 from this release: yes, the Log in page answers as before (401): yes; the kept copies are unchanged: ask');
    expect(w.live()).toBe(caddyfile());
  }));

  it('cut there, HEALTHBACK undoes it: the file before back, the kept copies as they were', () => withWorld({ password: 'off' }, w => {
    run(HEALTH1, w);
    run(HEALTH2, w, cutAt(RESTART_LINE));
    const back = run(HEALTHBACK, w, ownBack(w));
    expect(back.last).toBe('HEALTHBACK_DONE');
    expect(w.live()).toBe(caddyfile({ password: false }));
    expect(w.file('m/password/Caddyfile.open')).toBe(w.live());
    expect(w.file('m/name/Caddyfile.phase1')).toBe(caddyfile({ mark: 'phase1' }));
    expect(run(HEALTH1, w).last).toBe('HEALTH1_DONE');
  }));

  it('cut after every check passed, before the kept copies: HEALTH2 again only gives them the edit', () => withWorld({ password: 'off' }, w => {
    run(HEALTH1, w);
    expect(run(HEALTH2, w, cutAt("KB=''")).status).toBe(9);
    expect(w.file('m/password/Caddyfile.open')).toBe(caddyfile({ password: false }));
    const again = run(HEALTH2, w);
    expect(again.lines).toContain('HEALTH2 was cut off after every check had passed: the kept copies still as they were get the edit now');
    expect(again.last).toBe('HEALTH2_DONE');
    // No second restart.
    expect(w.file('restarts')).toBe('restart\n');
    expect(w.file('m/password/Caddyfile.open')).toBe(w.live());
  }));

  it('cut half way through the kept copies: HEALTH2 again finishes them, or HEALTHBACK takes a copy still as it was as one HEALTH2 never changed', () => {
    const cutHalfWay = (w: World) => {
      run(HEALTH1, w);
      expect(run(HEALTH2, w).last).toBe('HEALTH2_DONE');
      const kept = w.file('m/health/last-kept').trim();
      // As if the run had stopped after NAME1's copy: phase1 and main are still as they were.
      for (const copy of ['phase1', 'main']) writeFileSync(join(w.dir, `m/name/Caddyfile.${copy}`), readFileSync(join(kept, `name-Caddyfile.${copy}.before`), 'utf8'));
    };
    withWorld({}, w => {
      cutHalfWay(w);
      expect(run(HEALTH1, w).last).toMatch(/^HEALTH1_NOT_DONE: HEALTH2 was cut off after its copy without the secret went live/);
      const again = run(HEALTH2, w);
      expect(again.last).toBe('HEALTH2_DONE');
      expect(w.file('restarts')).toBe('restart\n');
      expect(w.file('m/name/Caddyfile.phase1')).toBe(caddyfile({ secret: false, mark: 'phase1' }));
    });
    withWorld({}, w => {
      cutHalfWay(w);
      expect(run(HEALTHBACK, w, ownBack(w)).last).toBe('HEALTHBACK_DONE');
      for (const copy of NAME_COPIES) expect(w.file(`m/name/Caddyfile.${copy}`), copy).toBe(caddyfile(copy === 'main' ? {} : { mark: copy }));
      expect(w.live()).toBe(caddyfile());
    });
  });

  it('a kept copy that does not take the edit: the line names it, says PWON refuses meanwhile, and HEALTH2 again repairs it', () => withWorld({ password: 'off' }, w => {
    run(HEALTH1, w);
    writeFileSync(join(w.dir, 'install-fails'), `${w.dir}/m/password/Caddyfile.open\n`);
    const two = run(HEALTH2, w);
    expect(two.last).toBe('HEALTH2_NOT_DONE: Caddy\'s health check sends no secret now and every check passed, but these kept copies did not get the edit: password/Caddyfile.open. Until they do, a step that puts one back would bring the secret back, and while password/Caddyfile.open is among them PWON refuses and OPENCHECK and SIGNUPS fail (the live file is no longer that copy). The repair: run HEALTH2 again, which changes only the kept copies still as they were; or HEALTHBACK, which puts everything back. If HEALTH2 names a copy again: ask');
    rmSync(join(w.dir, 'install-fails'));
    expect(run(HEALTH2, w).last).toBe('HEALTH2_DONE');
    expect(w.file('m/password/Caddyfile.open')).toBe(w.live());
    expect(w.file('restarts')).toBe('restart\n');
  }));

  // The words HEALTH1 and HEALTH2 stop with while a put-back cut off half way waits for HEALTHBACK.
  const copyEdited = (step: string) => `${step}_NOT_DONE: the file before HEALTH2 is live again, but the kept copy name/Caddyfile.before-dezbatere still has HEALTH2's edit (a HEALTHBACK cut off after it put the file back?): run HEALTHBACK again (it finishes); nothing changed`;
  const notRestarted = (step: string) => `${step}_NOT_DONE: the file before HEALTH2 is live again, but Caddy has not restarted since it was put in place (a put-back cut off before its restart), so Caddy still runs the file it replaced: run HEALTHBACK (it restarts Caddy on the file before); nothing changed`;
  const RESTARTS_HERE = 'the live Caddyfile is the one from before HEALTH2 already, but Caddy (active) has not started since it was put in place (a put-back cut off before its restart): Caddy restarts on it now';

  it('HEALTHBACK cut after the file before went back: HEALTH1 and HEALTH2 say to run it again; run again, it puts back the kept copies, and only then moves its copies aside', () => {
    const copiesBack = HEALTHBACK.find(line => line.startsWith('while read -r F T; do if [ -e "$F" ] && cmp -s "$F" "$KD/$T.after"; then'))!;
    for (const password of ['on', 'off'] as const) withWorld({ password }, w => {
      run(HEALTH1, w); run(HEALTH2, w);
      expect(run(HEALTHBACK, w, { ...ownBack(w), ...cutAt(copiesBack) }).status, password).toBe(9);
      const before = caddyfile({ password: password === 'on' });
      expect(w.live(), password).toBe(before);
      expect(w.file('caddy-runs'), password).toBe(before);
      expect(w.file('m/name/Caddyfile.phase1'), password).toBe(caddyfile({ secret: false, mark: 'phase1' }));
      // HEALTH1 would move HEALTH2's record aside, and the copies could not go back any more; with the password off, the
      // advice would be PWOFF2's or PWON's, and PWON refuses here too.
      for (const [step, lines] of [['HEALTH1', HEALTH1], ['HEALTH2', HEALTH2]] as const) expect(run(lines, w).last, `${password} ${step}`).toBe(copyEdited(step));
      expect(w.has('m/health/last-kept'), password).toBe(true);
      const again = run(HEALTHBACK, w, ownBack(w));
      expect(again.lines, password).toContain('the live Caddyfile is the one from before HEALTH2 already, and Caddy has started on it: only the kept copies go back');
      expect(again.last, password).toBe('HEALTHBACK_DONE');
      // No third restart: Caddy restarted on the file before already.
      expect(w.file('restarts'), password).toBe('restart\nrestart\n');
      expect(w.file('m/name/Caddyfile.phase1'), password).toBe(caddyfile({ mark: 'phase1' }));
      if (password === 'off') expect(w.file('m/password/Caddyfile.open')).toBe(w.live());
      expect(w.has('m/health/Caddyfile.before-health') || w.has('m/health/last-kept'), password).toBe(false);
      expect(run(HEALTH1, w).last, password).toBe('HEALTH1_DONE');
    });
    // The check that every copy is back comes before the moves aside.
    const check = HEALTHBACK.findIndex(line => line.startsWith("KB=''; while read -r F T; do"));
    expect(check).toBeGreaterThan(HEALTHBACK.indexOf(copiesBack));
    expect(check).toBeLessThan(HEALTHBACK.findIndex(line => line.startsWith('mv "$HB" "$HB.back-$TS"')));
  });

  it('HEALTHBACK cut after it put the file before in place, before its restart: HEALTH1 and HEALTH2 name it; run again, it restarts Caddy on that file and finishes', () => {
    for (const password of ['on', 'off'] as const) withWorld({ password }, w => {
      run(HEALTH1, w); expect(run(HEALTH2, w).last, password).toBe('HEALTH2_DONE');
      expect(run(HEALTHBACK, w, { ...ownBack(w), ...cutAt(RESTART_LINE) }).status, password).toBe(9);
      // The file before is live, and Caddy still runs the file without the secret.
      const before = caddyfile({ password: password === 'on' });
      expect(w.live(), password).toBe(before);
      expect(w.file('caddy-runs'), password).toBe(caddyfile({ password: password === 'on', secret: false }));
      for (const [step, lines] of [['HEALTH1', HEALTH1], ['HEALTH2', HEALTH2]] as const) expect(run(lines, w).last, `${password} ${step}`).toBe(copyEdited(step));
      const again = run(HEALTHBACK, w, ownBack(w));
      expect(again.lines, password).toContain(RESTARTS_HERE);
      expect(again.lines, password).toContain('after the restart: Caddy active; the public /readyz 404 (404: Caddy\'s own refusal); the loopback listener 200 (through Caddy to the website: 200 while the website runs; information only)');
      expect(again.last, password).toBe('HEALTHBACK_DONE');
      expect(w.file('restarts'), password).toBe('restart\nrestart\n');
      expect(w.file('caddy-runs'), password).toBe(before);
      expect(w.file('m/name/Caddyfile.phase1'), password).toBe(caddyfile({ mark: 'phase1' }));
      if (password === 'off') expect(w.file('m/password/Caddyfile.open')).toBe(w.live());
      expect(run(HEALTH1, w).last, password).toBe('HEALTH1_DONE');
    });
  });

  it('HEALTH2 cut while it put the file before back, before Caddy restarted on it: HEALTH1 and HEALTH2 name HEALTHBACK, which restarts Caddy on the file before', () => withWorld({ after: { edge: '000 none' } }, w => {
    run(HEALTH1, w);
    expect(run(HEALTH2, w, cutAt(PUT_BACK_RESTART)).status).toBe(9);
    // The file before is back, and Caddy still runs the copy whose checks failed.
    expect(w.live()).toBe(caddyfile());
    expect(w.file('caddy-runs')).toBe(caddyfile({ secret: false }));
    expect(run(HEALTH1, w).last).toBe(notRestarted('HEALTH1'));
    expect(run(HEALTH2, w).last).toBe(notRestarted('HEALTH2'));
    expect(w.file('restarts')).toBe('restart\n');
    const back = run(HEALTHBACK, w, ownBack(w));
    expect(back.lines).toContain(RESTARTS_HERE);
    expect(back.last).toBe('HEALTHBACK_DONE');
    expect(w.file('restarts')).toBe('restart\nrestart\n');
    expect(w.file('caddy-runs')).toBe(caddyfile());
    expect(w.file('m/name/Caddyfile.phase1')).toBe(caddyfile({ mark: 'phase1' }));
    expect(run(HEALTH1, w).last).toBe('HEALTH1_DONE');
  }));

  it('HEALTH2\'s own put-back that restarted is not taken for a cut-off one: HEALTHBACK changes nothing, and HEALTH1 runs', () => withWorld({ after: { edge: '000 none' } }, w => {
    run(HEALTH1, w);
    expect(run(HEALTH2, w).last).toMatch(/^HEALTH2_NOT_DONE: a check failed \(edge\); the file before is back/);
    expect(w.file('caddy-runs')).toBe(caddyfile());
    expect(run(HEALTHBACK, w, ownBack(w)).last).toBe('HEALTHBACK_DONE');
    expect(w.file('restarts')).toBe('restart\nrestart\n');
    expect(run(HEALTH1, w).last).toBe('HEALTH1_DONE');
  }));
});

describe('whether Caddy started on the live file (cnew)', () => {
  it('is the same line in the three steps, and compares Caddy\'s start time with the file\'s time', () => {
    expect(lineOf(HEALTH1, 'cnew() {')).toBe(CNEW);
    expect(lineOf(HEALTH2, 'cnew() {')).toBe(CNEW);
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-health-cnew-')));
    try {
      const ask = (state: string, since: string, mtime: string) => {
        writeFileSync(join(dir, 'state'), state); writeFileSync(join(dir, 'since'), since); writeFileSync(join(dir, 'mtime'), mtime);
        return bash([
          'C="$D/Caddyfile"',
          'systemctl() { case "$1" in is-active) cat "$D/state";; show) [ "$*" = \'show -p ActiveEnterTimestamp --value caddy\' ] && cat "$D/since";; esac; }',
          // date -d reads the time systemd prints; the stand-in takes it as @<seconds>, and refuses anything else, as date does a time it cannot read.
          'date() { if [ "$1" = -d ]; then case "$2" in @[0-9]*) echo "${2#@}";; *) return 1;; esac; else command date "$@"; fi; }',
          'stat() { [ "$1 $2 $3" = "-c %Y $C" ] && cat "$D/mtime"; }',
          CNEW, 'if cnew; then echo yes; else echo no; fi'
        ].join('\n'), { dir }).out.trim();
      };
      expect(ask('active', '@1000', '990')).toBe('yes');
      // The same second counts as after: a put-back comes seconds after Caddy's last start.
      expect(ask('active', '@1000', '1000')).toBe('yes');
      expect(ask('active', '@990', '1000')).toBe('no');
      expect(ask('failed', '@1000', '990')).toBe('no');
      for (const unread of ['n/a', '', 'not a time']) expect(ask('active', unread, '990'), unread).toBe('no');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the runbook\'s words', () => {
  const section = (() => {
    const lines = runbook.split('\n');
    const start = lines.indexOf('### 5.10 Caddy\'s health check without the edge secret (HEALTH1, HEALTH2, HEALTHBACK)');
    const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
    expect(start).toBeGreaterThan(0);
    return lines.slice(start, end).join('\n');
  })();

  it('5.10 comes after 5.9b and before part 6, in the order table too, and names every kept copy HEALTH2 changes', () => {
    expect(runbook.indexOf('### 5.9b')).toBeLessThan(runbook.indexOf('### 5.10 '));
    expect(runbook.indexOf('### 5.10 ')).toBeLessThan(runbook.indexOf('## 6. Friends\' test'));
    expect(runbook).toContain('| 5.10 | Caddy\'s health check without the edge secret (at any time outside an upload, on your yes) | as before; Caddy restarts (usually about a second; see 5.10) | HEALTHBACK |');
    const kept = /^KEPT=\((.*)\)$/m.exec(HEALTH1.join('\n'))![1]!.split(' ').map(path => path.replace(/^"\$M\/|"$/g, ''));
    expect(kept).toEqual(['name/Caddyfile.before-dezbatere', 'name/Caddyfile.phase1', 'name/Caddyfile.main', 'password/Caddyfile.before-open', 'password/Caddyfile.open']);
    for (const path of kept) expect(section, path).toContain(`\`${path}\``);
    const text = flat(section);
    expect(text).toContain('A restart usually takes about a second: Caddy stops once the requests still open have ended (or its unit\'s stop limit has passed), and starts again from the Caddyfile and the certificates it keeps on disk. For that time a page may not load; reloading it helps.');
    expect(text).toContain('So the file before is back at most about a minute after the restart, and HEALTH2\'s last line comes at most about half a minute after that');
    expect(text).toContain('**If HEALTH2 was cut off**');
    expect(text).toContain('It skips two of their guards: it does not need Caddy running');
    expect(text).toContain('HEALTH1 and HEALTH2 then refuse and name HEALTHBACK, which restarts Caddy on the file before.');
    expect(text).toContain('With the file before live, it restarts Caddy when Caddy has not started since that file was put in place (it compares Caddy\'s start time with the file\'s time)');
    expect(text).toContain('While a HEALTHBACK cut off half way is not finished, HEALTH1 and HEALTH2 refuse and say to run HEALTHBACK again');
    expect(text).toContain('Run HEALTH2 only with the owner\'s yes, at a quiet minute.');
    expect(text).toContain('If they kept the secret, PWON or NAME5 would bring it back');
    expect(text).toContain('`grep -c health_headers /etc/debateai-v3-preview/public/Caddyfile` prints `0`.');
  });

  it('the morning look of 6b counts the secret\'s lines in the live Caddyfile, so an older copy put back by hand is noticed', () => {
    const line = 'echo "health_headers lines in the live Caddyfile: $(grep -c health_headers /etc/debateai-v3-preview/public/Caddyfile || true)"';
    expect(runbook).toContain(`\`${line}\``);
    const daily = flat(runbook.slice(runbook.indexOf('Every morning while 6b is open: OPENCHECK'), runbook.indexOf('### 6b.3 Add or remove a buyer on the Team page')));
    expect(daily).toContain('Once HEALTH2 has run (5.10), the morning look also counts the health check\'s secret lines in the live Caddyfile');
    expect(daily).toContain('It must print `0`.');
    // The line reads only, and prints a count.
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-health-daily-')));
    try {
      writeFileSync(join(dir, 'Caddyfile'), caddyfile());
      expect(bash(line.replace('/etc/debateai-v3-preview/public/Caddyfile', '"$D/Caddyfile"'), { dir }).out).toBe('health_headers lines in the live Caddyfile: 1\n');
      writeFileSync(join(dir, 'Caddyfile'), caddyfile({ secret: false }));
      expect(bash(line.replace('/etc/debateai-v3-preview/public/Caddyfile', '"$D/Caddyfile"'), { dir }).out).toBe('health_headers lines in the live Caddyfile: 0\n');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('every word a failed check of HEALTH2 can print is explained under the block', () => {
    const words = [...new Set([...HEALTH2.join('\n').matchAll(/BAD="\$BAD ([a-z-]+)"/g)].map(match => match[1]!))];
    expect(words.sort()).toEqual(['caddy', 'edge', 'failed-units', 'file', 'login', 'notify', 'readyz', 'release', 'website']);
    const explained = flat(section.slice(section.indexOf('The words in a failed check\'s brackets')));
    for (const word of words) expect(explained, word).toContain(`\`${word}\` (`);
  });

  it('every Caddyfile copy a step of the runbook keeps under name/ or password/ is one HEALTH2 changes, or a record no step reads', () => {
    const named = new Set([...runbook.matchAll(/(?:\$M|main-site)\/(?:name|password)\/Caddyfile\.([a-z0-9]+(?:-[a-z0-9]+)*-?)/g)].map(match => match[1]!));
    const kept = new Set(['before-dezbatere', 'phase1', 'main', 'before-open', 'open']);
    // NAME2's step between the two files it keeps, SIGNUPS's edited copy (refused while it waits), and the records with a time in their name.
    const records = new Set(['renamed', 'signups', 'before-signups-', 'before-name5-']);
    expect([...named].filter(name => !kept.has(name) && !records.has(name))).toEqual([]);
    expect([...kept].filter(name => !named.has(name))).toEqual([]);
  });

  it('the upload notes, part 5, 5.6, 6b.1 and part 7 point at 5.10', () => {
    const text = flat(runbook);
    expect(text).not.toContain('Decide before NAME1 whether that step comes first.');
    expect(text).toContain('The secret comes out with HEALTH1 and HEALTH2 (5.10), before NAME1 or after it');
    expect(text).toContain('The secret comes out with its own reviewed step, HEALTH1 and HEALTH2 (5.10), outside an upload');
    expect(text).toContain('Only the steps of this document change it (NAME3, REVIEW_OPEN, REVIEW_CLOSE, PWOFF2, PWON, SIGNUPS, HEALTH2, HEALTHBACK).');
    expect(text).toContain('(NV-51, NV-55\'s port reservation and its health check without the edge secret, NV-56, NV-57) are applied or recorded');
    expect(text).toContain('The health check\'s step is HEALTH1 and HEALTH2 (5.10); it is applied when `grep -c health_headers /etc/debateai-v3-preview/public/Caddyfile` prints `0`.');
  });
});

describe('GATESTATE (6.2) and the morning look of 6b', () => {
  const GATESTATE = script('GATESTATE');
  const runGates = (status: string) => bash([
    'set -euo pipefail',
    'GD=/g/deepinfra; PD=/p/deepinfra; GAN=/g/anthropic; PAN=/p/anthropic; GPX=/g/perplexity; PPX=/p/perplexity; GBR=/g/bedrock; PBR=/p/bedrock',
    `gs() { case "$1" in /g/bedrock) printf '%s\\n' '{"window_open":true,"today_spend_usd":"amount-mark"}';; *) printf '%s\\n' '${status}';; esac; }`,
    ...GATESTATE.filter(line => line !== NAMES_LINE)
  ].join('\n'));

  it('a status without its state or window reads as unread, and no amount is printed', () => {
    const out = runGates(JSON.stringify({ state: 'halted', window_open: false, today_spend_usd: 'amount-mark' }));
    expect(out.out).not.toContain('amount-mark');
    expect(out.lines).toEqual([
      'deepinfra gate: state halted; window open false',
      'anthropic gate: state halted; window open false',
      'perplexity gate: state halted; window open false',
      'bedrock gate: unread',
      'GATESTATE_DONE'
    ]);
  });

  it('the morning list says that an assistant uses GATESTATE and the owner may use GATES', () => {
    expect(flat(runbook)).toContain('Every morning while 6b is open: OPENCHECK, the four spending gates (6.2), AICHECK (6b.1), the Public tab and the report mails. An assistant that runs the morning look uses GATESTATE, which prints no amount; you may use GATES, whose amounts stay on your screen.');
  });
});
