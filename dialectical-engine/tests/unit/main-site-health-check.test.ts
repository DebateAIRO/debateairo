// Caddy's health check without the edge secret, in the owner's runbook (deploy/preview-auth-dev/v1/MAIN-SITE.md, 5.10):
// HEALTH1 looks and makes the copy, HEALTH2 puts it in place, HEALTHBACK is the way back. The steps live only in the
// runbook, so they are checked here as text and run in bash against throwaway Caddyfiles, with the server's commands
// stood in for: each block parses and names itself; the edit takes out the three health_headers lines of the shared rules
// and nothing else, and refuses every other shape; it prints shapes, never the secret's line; HEALTH2 changes the kept
// copies that later steps compare with or put back, so that PWON brings back a file without the secret; a failed check
// puts the file before back; HEALTHBACK puts everything back. Last, the runbook's words around it, and GATESTATE.
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

function bash(text: string) {
  const out = spawnSync('bash', ['-c', text], { encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` } });
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
    // HEALTH1 and HEALTH2 read the names file; HEALTHBACK reads none, so it works at any time.
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
    return bash(`set -euo pipefail\n${EDIT}\ncd '${dir}'\nif hstrip in > out; then echo stripped; hshape in out; else echo refused; fi`);
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
    const run = bash(`set -euo pipefail\n${EDIT}\ncd '${dir}'\nhshape a b`);
    expect(run.out.trim()).toBe('taken out: 4 lines (other, other, }); added: 0; places: 1');
  }));
});

type Setup = Readonly<{
  /** on: the password asks (no PWOFF1 copies); off: PWOFF2's file is live; between: PWOFF1 ran, PWOFF2 not yet. */
  password?: 'on' | 'off' | 'between';
  repository?: boolean;
  window?: boolean; signups?: boolean; maintenance?: boolean;
  answers?: Readonly<Record<string, string>>;
  /** Answers after Caddy's first restart (`after/<name>`). */
  after?: Readonly<Record<string, string>>;
}>;
type World = Readonly<{ dir: string; file: (path: string) => string; has: (path: string) => boolean; live: () => string }>;

/** The server's commands, stood in for; `after/<name>` answers replace `ans/<name>` once Caddy has restarted. */
const STUBS = [
  `C=$D/Caddyfile; M=$D/m; KEY=${KEY}; UIP=3100; HOST=dezbatere.ro; CAPI=$D/capi`,
  'ans() { if [ -s "$D/restarts" ] && [ -e "$D/after/$1" ]; then cat "$D/after/$1"; else cat "$D/ans/$1"; fi; }',
  'sleep() { :; }',
  'systemctl() { case "$1" in',
  '  list-units) case "$*" in *ms-step*) cat "$D/ms-steps" 2>/dev/null || true;; *) ans failed;; esac;;',
  '  is-active) cat "$D/caddy-state";;',
  '  restart) echo restart >> "$D/restarts"; if [ -e "$D/caddy-dies" ]; then echo failed > "$D/caddy-state"; else echo active > "$D/caddy-state"; fi;;',
  '  esac; }',
  'edgekey() { printf \'%s\\n\' "$(ans edge)"; }',
  'notify() { ans notify; }',
  'install() { local d=no; local -a x; x=(); while [ $# -gt 0 ]; do case "$1" in -d) d=yes; shift;; -o|-g|-m) shift 2;; *) x+=("$1"); shift;; esac; done; if [ "$d" = yes ]; then mkdir -p "${x[@]}"; else cp "${x[0]}" "${x[1]}"; fi; }',
  'curl() { local a p="" u="" w="" h=no k c; for a; do [ "$p" = -w ] && w=$a; [ "$p" = -D ] && h=yes; case "$a" in http*) u=$a;; esac; p=$a; done',
  '  case "$u" in http://127.0.0.1:3100/readyz) k=slot-3100;; http://127.0.0.1:3200/readyz) k=slot-3200;; http://127.0.0.1:3090/readyz) k=listener;; */login) k=login;; */readyz) k=public-readyz;; */) k=home;; *) k=other;; esac',
  '  if [ "$h" = yes ]; then printf \'HTTP/2 200\\r\\nx-debateai-release: %s\\r\\n\\r\\n\' "$(ans release)"; return 0; fi',
  '  c=$(ans "$k")',
  '  case "$w" in \'\\n%{http_code}\') if [ "$c" = 000 ]; then printf \'\\n000\'; else printf \'{"releaseKey":"%s","reasons":[]}\\n%s\' "$(ans "$k-key")" "$c"; fi;; *) printf \'%s\' "$c";; esac; }',
  'cad() { local f=$3 hh=""; case "$1" in validate) [ ! -e "$D/cad-refuses" ];; adapt) if grep -q health_headers "$f"; then hh=\',"headers":{"X-Debateai-Edge-Secret":["x"]}\'; fi; printf \'{"apps":{"http":{"servers":{"a":{"routes":[{"handle":[{"handler":"reverse_proxy","health_checks":{"active":{"uri":"/readyz","passes":1,"fails":1%s}}}]}]},"b":{"routes":[{"handle":[{"handler":"reverse_proxy","health_checks":{"active":{"uri":"/readyz","passes":1,"fails":1%s}}}]}]}}}}}\' "$hh" "$hh";; esac; }'
];

/** The kept copies of the runbook's steps, each told apart by its first line. */
const NAME_COPIES = ['before-dezbatere', 'phase1', 'main'] as const;

function world(setup: Setup): World {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'main-site-health-')));
  for (const sub of ['m/name', 'm/password', 'ans', 'after', 'capi/dialectical-engine/deploy/preview-release/v1/caddy']) mkdirSync(join(dir, sub), { recursive: true });
  cpSync(resolve(ROOT, 'deploy/preview-release/v1/caddy/debateai-slots.caddy'), join(dir, 'capi/dialectical-engine/deploy/preview-release/v1/caddy/debateai-slots.caddy'));
  const password = setup.password ?? 'on';
  const repository = setup.repository ?? false;
  const live = caddyfile({ repository, password: password !== 'off' });
  writeFileSync(join(dir, 'Caddyfile'), setup.window ? `${live}# review window begin: stand-in\n` : live);
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
  for (const [name, text] of Object.entries(setup.after ?? {})) writeFileSync(join(dir, 'after', name), text);
  writeFileSync(join(dir, 'caddy-state'), 'active\n');
  return {
    dir, file: path => readFileSync(join(dir, path), 'utf8'), has: path => existsSync(join(dir, path)),
    live: () => readFileSync(join(dir, 'Caddyfile'), 'utf8')
  };
}
const withWorld = <T>(setup: Setup, body: (w: World) => T): T => {
  const w = world(setup);
  try { return body(w); } finally { rmSync(w.dir, { recursive: true, force: true }); }
};

/** Runs a step in the world: the names file (or a step's own paths) replaced by the stand-ins, the maintenance flag in the world. */
function run(lines: readonly string[], w: World, swap: Readonly<Record<string, string>> = {}) {
  let text = lines.join('\n').replace(NAMES_LINE, [`D='${w.dir}'`, ...STUBS].join('\n'))
    .replaceAll('/etc/debateai-v3-preview/lifecycle/maintenance-pending', '$D/maintenance-pending');
  for (const [from, to] of Object.entries(swap)) {
    expect(text, from).toContain(from);
    text = text.replace(from, to);
  }
  const result = bash(text);
  // Nothing the steps print names the secret's line or its file.
  expect(result.out).not.toContain(SECRET_FILE);
  expect(result.out).not.toContain('X-Debateai-Edge-Secret {');
  return result;
}
/** HEALTHBACK and PWON read no names file: their own paths go to the world, with the stand-ins before them. */
const OWN_PATHS = 'C=/etc/debateai-v3-preview/public/Caddyfile; M=/root/preview-archive/main-site';
const own = (w: World) => ({ [OWN_PATHS]: [`D='${w.dir}'`, ...STUBS].join('\n') });

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
    // The kept copies as they were stay beside the list HEALTHBACK reads.
    const kept = w.file('m/health/last-kept').trim();
    expect(readdirSync(kept).sort()).toEqual(['list', ...NAME_COPIES.flatMap(copy => [`name-Caddyfile.${copy}.after`, `name-Caddyfile.${copy}.before`])].sort());
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
    writeFileSync(join(w.dir, 'after/login'), '401');
    const pwon = run(script('PWON'), w, own(w));
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
      expect(two.last, word).toBe(`HEALTH2_NOT_DONE: a check failed ( ${word}); the file before is back, Caddy restarted on it, and the kept copies are unchanged: ask`);
      expect(w.file('restarts')).toBe('restart\nrestart\n');
      expect(w.live()).toBe(before);
      expect(w.file('m/name/Caddyfile.phase1')).toBe(caddyfile({ mark: 'phase1' }));
      expect(w.has('m/health/last-kept')).toBe(false);
    });
  });

  it('says the site is down when Caddy does not start on the file before either', () => withWorld({ after: { edge: '000 none' } }, w => {
    run(HEALTH1, w);
    writeFileSync(join(w.dir, 'caddy-dies'), '');
    const two = run(HEALTH2, w);
    expect(two.last).toBe('HEALTH2_NOT_DONE: a check failed ( caddy edge); the file before is back, but Caddy did not start on it: the site is DOWN: ask at once');
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
    const back = run(HEALTHBACK, w, own(w));
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
      expect(run(HEALTHBACK, w, own(w)).last).toBe('HEALTHBACK_NOT_DONE: the live Caddyfile is not the one HEALTH2 put in place (a later step changed it); nothing changed: ask');
    });
    withWorld({}, w => {
      run(HEALTH1, w); run(HEALTH2, w);
      writeFileSync(join(w.dir, 'm/name/Caddyfile.phase1'), 'changed\n');
      expect(run(HEALTHBACK, w, own(w)).last).toBe('HEALTHBACK_NOT_DONE: the kept copy name/Caddyfile.phase1 changed since HEALTH2; nothing changed: ask');
      expect(w.live()).toBe(caddyfile({ secret: false }));
    });
  });

  it('when Caddy does not come back on the file before, the file without the secret goes back', () => withWorld({}, w => {
    run(HEALTH1, w); run(HEALTH2, w);
    writeFileSync(join(w.dir, 'after/listener'), '000');
    const back = run(HEALTHBACK, w, own(w));
    expect(back.last).toBe('HEALTHBACK_NOT_DONE: Caddy did not come back on the file before (its readiness listener answered 000); the file without the secret is back and Caddy is active (active: as after HEALTH2; anything else: the site is DOWN): ask at once');
    expect(w.live()).toBe(caddyfile({ secret: false }));
  }));
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
    expect(runbook).toContain('| 5.10 | Caddy\'s health check without the edge secret (at any time outside an upload, on your yes) | as before; Caddy restarts (about a second) | HEALTHBACK |');
    const kept = /^KEPT=\((.*)\)$/m.exec(HEALTH1.join('\n'))![1]!.split(' ').map(path => path.replace(/^"\$M\/|"$/g, ''));
    expect(kept).toEqual(['name/Caddyfile.before-dezbatere', 'name/Caddyfile.phase1', 'name/Caddyfile.main', 'password/Caddyfile.before-open', 'password/Caddyfile.open']);
    for (const path of kept) expect(section, path).toContain(`\`${path}\``);
    const text = flat(section);
    expect(text).toContain('For about a second a page may not load; reloading it helps.');
    expect(text).toContain('Run HEALTH2 only with the owner\'s yes, at a quiet minute.');
    expect(text).toContain('If they kept the secret, PWON or NAME5 would bring it back');
    expect(text).toContain('`grep -c health_headers /etc/debateai-v3-preview/public/Caddyfile` prints `0`.');
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
