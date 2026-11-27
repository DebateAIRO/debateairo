// The server's restart, in the lifecycle guide (deploy/preview-lifecycle/v1/README.md, "Restarting the server"): four
// steps, RESTART_LOOK (read-only), RESTART_GO, RESTART_BACK and RESTART_UP, each one fenced `sh` block of the runbook's
// form. They live only in the guide, so they are checked here as text and, where a part can run without a server, in
// bash: each block parses, names itself, ends with its own DONE line and stops only with its own NOT_DONE line; it
// carries no working notes (line numbers of other guides, one night's release); it prints no amount and no address; the
// STOP words RESTART_LOOK can print are each explained, and the three it lets the owner accept are the guide's three.
// The owner's runbook (deploy/preview-auth-dev/v1/MAIN-SITE.md) and the release guide point at the section, and the
// runbook's GATESTATE (6.2) shows the four gates' states without an amount.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const lifecycle = read('deploy/preview-lifecycle/v1/README.md');
const runbook = read('deploy/preview-auth-dev/v1/MAIN-SITE.md');
const release = read('deploy/preview-release/v1/README.md');
const flat = (text: string) => text.replace(/\s+/g, ' ');

const RESTART = '## Restarting the server (RESTART_LOOK, RESTART_GO, RESTART_UP)';
const NAMES_LINE = '. /root/preview-archive/main-site/names.sh';
const STEPS = ['RESTART_LOOK', 'RESTART_GO', 'RESTART_BACK', 'RESTART_UP'] as const;

/** The text from `heading` (a whole line) to the next heading of the same or a higher level, fences respected. */
function sectionOf(text: string, heading: string): string {
  const lines = text.split('\n');
  const level = /^#+/.exec(heading)![0].length;
  const at = lines.indexOf(heading);
  if (at < 0) throw new Error(`missing heading: ${heading}`);
  let fenced = false;
  for (let index = at + 1; index < lines.length; index++) {
    if (lines[index]!.startsWith('```')) fenced = !fenced;
    const match = fenced ? null : /^(#+) /.exec(lines[index]!);
    if (match && match[1]!.length <= level) return lines.slice(at, index).join('\n');
  }
  return lines.slice(at).join('\n');
}

/** Every fenced block of a text, in order, as its lines. */
function fencedBlocks(text: string): string[][] {
  const out: string[][] = [];
  let open: string[] | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (open === null) open = [];
      else { out.push(open); open = null; }
    } else if (open !== null) open.push(line);
  }
  if (open !== null) throw new Error('the text ends inside a fenced block');
  return out;
}

const section = sectionOf(lifecycle, RESTART);
/** The one block of `text` with a line `# <step>: …`. */
function named(text: string, step: string): string[] {
  const found = fencedBlocks(text).filter(block => block.some(line => line.startsWith(`# ${step}: `)));
  if (found.length !== 1) throw new Error(`${found.length} blocks name ${step}`);
  return found[0]!;
}
const block = (step: (typeof STEPS)[number]) => named(section, step);
const LOOK = block('RESTART_LOOK');
const GO = block('RESTART_GO');
const BACK = block('RESTART_BACK');
const UP = block('RESTART_UP');
const GATESTATE = named(runbook, 'GATESTATE');

function bash(text: string) {
  const out = spawnSync('bash', ['-c', text], { encoding: 'utf8', env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` } });
  return { status: out.status, out: out.stdout, lines: out.stdout.trim().split('\n') };
}
/** The one line of a block that starts with `start`. */
function lineOf(lines: readonly string[], start: string): string {
  const found = lines.filter(line => line.trimStart().startsWith(start));
  if (found.length !== 1) throw new Error(`${found.length} lines start with ${start}`);
  return found[0]!;
}

describe('the restart section of the lifecycle guide', () => {
  it('comes right after "Boot sequence", holds the four steps in their order, and the guide lists its test file', () => {
    const headings = lifecycle.split('\n').filter(line => line.startsWith('## '));
    expect(headings[headings.indexOf('## Boot sequence (what to expect after a reboot)') + 1]).toBe(RESTART);
    const at = (step: string) => section.indexOf(`\n# ${step}: `);
    expect(STEPS.map(at).every(index => index > 0)).toBe(true);
    expect(at('RESTART_LOOK')).toBeLessThan(at('RESTART_GO'));
    expect(at('RESTART_GO')).toBeLessThan(at('RESTART_BACK'));
    expect(at('RESTART_BACK')).toBeLessThan(at('RESTART_UP'));
    expect(sectionOf(lifecycle, '## Unit tests (this repository)')).toContain('tests/unit/preview-lifecycle-restart.test.ts');
  });

  it('each step is a script of the runbook\'s form: it parses, names itself first, ends with its DONE line, and stops only with its own NOT_DONE line', () => {
    for (const [step, lines] of [['RESTART_LOOK', LOOK], ['RESTART_GO', GO], ['RESTART_BACK', BACK], ['RESTART_UP', UP]] as const) {
      expect(lines[0], step).toBe('set -euo pipefail');
      expect(lines.find(line => line.startsWith('#')), step).toMatch(new RegExp(`^# ${step}: \\S`));
      expect(lines.slice(-2), step).toEqual([`echo ${step}_DONE`, 'exit 0']);
      expect(spawnSync('bash', ['-n'], { input: lines.join('\n') }).status, step).toBe(0);
      for (const [index, line] of lines.entries()) {
        for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], `${step}: ${line}`).toBe(step);
        if (line.includes('_NOT_DONE')) expect(`${line}\n${lines[index + 1] ?? ''}`, `${step}: ${line}`).toMatch(/exit 1/);
      }
    }
    // Three read the names file at once; RESTART_UP first waits for PostgreSQL, since the names file reads the release table from it.
    for (const lines of [LOOK, GO, BACK]) expect(lines[1]).toBe(NAMES_LINE);
    const ready = UP.findIndex(line => line.startsWith('/usr/lib/postgresql/18/bin/pg_isready -q -h "$SOCK" -p 5434 ||'));
    expect(ready).toBeGreaterThan(0);
    expect(UP.indexOf(NAMES_LINE)).toBe(ready + 1);
  });

  it('carries no working notes: no line numbers of other guides, no one night\'s release, no hosting company by name', () => {
    for (const lines of [LOOK, GO, BACK, UP]) {
      for (const line of lines) {
        expect(line).not.toMatch(/\b(REL|MS|LC|GB|GD|GA|GP|G2)( |, )\d/);
        expect(line).not.toMatch(/\.(mjs|py) \d/);
        expect(line).not.toMatch(/\btonight\b|\br\d\d\b|\bOVH\b|plan section/i);
      }
    }
    expect(section).not.toMatch(/\btonight\b|\bOVH\b/i);
  });

  it('the values the owner fills in stand empty in the guide', () => {
    expect(lineOf(LOOK, "ACCEPT=''")).toMatch(/^ACCEPT='' +# only on the owner's word, after reading its STOP line: any of hatchet-address bridge-order boot-config, separated by spaces$/);
    expect(lineOf(UP, "RUNNER_AGAIN=''")).toMatch(/^RUNNER_AGAIN='' +# leave empty;/);
    expect(lineOf(UP, "KNOWN_FAILED=''")).toMatch(/^KNOWN_FAILED='' +# on a later run only:/);
  });
});

describe('what the steps print', () => {
  const ALL = [...LOOK, ...GO, ...BACK, ...UP, ...GATESTATE];
  const FIELDS = new Set(['state', 'reason', 'window_open', 'in_flight', 'open_until_utc']);

  it('no amount: each gate status is read through jq for its state, reason, window, calls in flight and closing time only', () => {
    for (const line of ALL) {
      expect(line).not.toMatch(/_usd\b|today_posts|\bgates\b\s*$|\$\(gates\b/);
      if (!/\bgs "\$/.test(line)) continue;
      const filter = /gs "\$[A-Z]+" "\$[A-Z]+" 2>\/dev\/null \| jq (?:-c|-r) '([^']*)'/.exec(line);
      expect(filter, line).not.toBeNull();
      for (const field of filter![1]!.matchAll(/\.([a-z_]+)/g)) expect(FIELDS.has(field[1]!), `${field[1]} in ${line}`).toBe(true);
    }
  });

  it('no address: Hatchet\'s address and the gateway\'s allow list go only into the root-only record, never to the screen', () => {
    // Every use of the address names, taken out: what is left must not name them, so no printed text does.
    const USES = [
      /\[ -n "\$IP0?" \]/g, /\[ "\$IP" = "\$IP0" \]/g, /grep -qF -e " \$IP0?\/32 " -e " \$IP0? " <<<" \$ALLOW "/g,
      /^printf '%s\\n%s\\n' "\$CID0" "\$IP0" > "\$RD\/hatchet"$/
    ];
    const uses = ALL.filter(line => /\$\{?(IP0?|ALLOW)\b/.test(line));
    expect(uses).toHaveLength(4);
    for (const line of uses) expect(USES.reduce((left, use) => left.replace(use, ''), line.trim()), line).not.toMatch(/\$\{?(IP0?|ALLOW)\b/);
    // The gateway witness's output may name an address: it is read for PASS only.
    expect(UP.join('\n')).toContain('the gateway witness did not say PASS (its output stays unprinted: it may name an address)');
    // The runner's refusal lines are printed with any IPv4 address blanked.
    for (const lines of [BACK, UP]) {
      const shown = lineOf(lines, '[ -z "$BADL" ] || { echo "$BADL"');
      const mask = /\| (sed -E '[^']*')/.exec(shown)![1]!;
      expect(bash(`printf '%s\\n' 'PREVIEW_RUNNER_STARTUP_REFUSED {"code":"UNAUTHENTICATED","at":"10.0.12.7:7077"}' | ${mask}`).out)
        .toBe('PREVIEW_RUNNER_STARTUP_REFUSED {"code":"UNAUTHENTICATED","at":"<address>:7077"}\n');
    }
  });

  it('no `grep -q` at the end of a pipeline: under pipefail it can fail on SIGPIPE although the line is there', () => {
    for (const line of ALL) expect(line).not.toMatch(/\|\s*grep -[a-zA-Z]*q/);
    // The allow-list check reads a here-string, and it matches the whole address, never a longer one that starts with it.
    const check = lineOf(LOOK, 'if [ -n "$CID0" ] && [ -n "$IP0" ] && grep -qF');
    const test = /&& (grep -qF [^;]*<<<" \$ALLOW "); then/.exec(check)![1]!;
    const run = (ip: string, allow: string) => bash(`IP0='${ip}'; ALLOW='${allow}'; if ${test}; then echo in; else echo out; fi`).out.trim();
    expect(run('172.18.0.2', '127.0.0.1/32 172.18.0.2/32')).toBe('in');
    expect(run('172.18.0.2', '172.18.0.2')).toBe('in');
    expect(run('172.18.0.2', '127.0.0.1/32 172.18.0.21/32')).toBe('out');
    expect(UP.join('\n')).toContain('grep -qF -e " $IP/32 " -e " $IP " <<<" $ALLOW "');
  });
});

describe('RESTART_LOOK', () => {
  const STOP_WORDS = [...new Set(LOOK.join('\n').match(/\bstop [a-z-]+ "/g)!.map(match => match.split(' ')[1]!))].sort();
  const RISK_WORDS = [...new Set(LOOK.join('\n').match(/\brisk [a-z-]+ "/g)!.map(match => match.split(' ')[1]!))].sort();

  it('each STOP word it can print is explained under "Stop if", and its ACCEPT words are the three of "The ACCEPT words"', () => {
    expect(STOP_WORDS).toHaveLength(25);
    const stopIf = sectionOf(lifecycle, '### Stop if');
    for (const word of STOP_WORDS) expect(stopIf, word).toContain(`\`${word}\``);
    expect(RISK_WORDS).toEqual(['boot-config', 'bridge-order', 'hatchet-address']);
    const accept = sectionOf(lifecycle, '### The ACCEPT words');
    expect([...accept.matchAll(/^- `([a-z-]+)`:/gm)].map(match => match[1]).sort()).toEqual(RISK_WORDS);
  });

  it('an accepted risk is shown and does not stop it; any other STOP does, and the last line names each word once', () => {
    const parts = ['STOPS=', 'risk() {', 'note() {'].map(start => lineOf(LOOK, start));
    const last = LOOK.slice(-3);
    expect(last[0]).toBe('[ -z "$STOPS" ] || { echo "RESTART_LOOK_NOT_DONE: do not restart now:$STOPS (the STOP lines above; nothing changed)"; exit 1; }');
    const run = (accept: string, calls: string[]) => bash(['set -euo pipefail', `ACCEPT='${accept}'`, ...parts, ...calls, ...last].join('\n'));
    const accepted = run('hatchet-address boot-config', ['risk hatchet-address "the address is not fixed"', 'risk boot-config "a file changed"']);
    expect(accepted.lines).toEqual([
      'ACCEPTED (hatchet-address): the address is not fixed (the owner accepted this for this restart)',
      'ACCEPTED (boot-config): a file changed (the owner accepted this for this restart)',
      'RESTART_LOOK_DONE'
    ]);
    const stopped = run('hatchet-address', ['risk boot-config "a file changed"', 'stop timer "a retire timer is due"', 'stop timer "another one"', 'risk hatchet-address "x"']);
    expect(stopped.status).toBe(1);
    expect(stopped.lines.at(-1)).toBe('RESTART_LOOK_NOT_DONE: do not restart now: boot-config timer (the STOP lines above; nothing changed)');
  });

  it('stops when Caddy is not in the boot, and then names the one command that puts it there', () => {
    expect(LOOK.join('\n')).toContain(' core:caddy.service ');
    const hint = lineOf(LOOK, "HINT=''; case");
    const core = lineOf(LOOK, 'core) [ "$AS" = active ]');
    const run = (unit: string, enabled: string) => bash([
      'STOPS=\'\'; stop() { echo "STOP ($1): $2"; }', `en() { printf '%s' '${enabled}'; }`, `U=${unit}; AS=active; AB=no; K=core`,
      hint, 'case "$K" in', core, 'esac'
    ].join('\n')).out.trim();
    expect(run('caddy.service', 'disabled')).toBe("STOP (boot-units): caddy.service runs now, but the boot would not start it (it is disabled: systemctl enable caddy.service, on the owner's yes, puts it in the boot and leaves Caddy running; then RESTART_LOOK again)");
    expect(run('caddy.service', 'enabled')).toBe('STOP (boot-units): caddy.service runs now, but the boot would not start it');
    expect(run('postfix.service', 'disabled')).toBe('STOP (boot-units): postfix.service runs now, but the boot would not start it');
    expect(flat(sectionOf(lifecycle, '### Stop if'))).toContain('For Caddy alone the `boot-units` line names the fix, when Caddy is disabled: `systemctl enable caddy.service`, on the owner\'s yes.');
  });
});

describe('RESTART_GO, RESTART_BACK and RESTART_UP', () => {
  const at = (lines: readonly string[], start: string) => {
    const index = lines.findIndex(line => line.startsWith(start));
    expect(index, start).toBeGreaterThan(0);
    return index;
  };

  it('RESTART_GO checks before it changes anything, keeps the record before it stops the site, and schedules the restart last', () => {
    // Its guards come first: it runs only as a detached run, and only with Ubuntu's flag set.
    expect(at(GO, '[ -n "$SELF" ] || nogo "this step runs only as a detached run')).toBeLessThan(at(GO, 'systemctl start debateai-preview-backup.service'));
    expect(at(GO, '[ -e /run/reboot-required ] || nogo')).toBeLessThan(at(GO, 'systemctl start debateai-preview-backup.service'));
    expect(at(GO, 'systemctl start debateai-preview-backup.service')).toBeLessThan(at(GO, "printf '%s\\n' \"$RD\" > \"$M/restart/last\""));
    expect(at(GO, "printf '%s\\n' \"$RD\" > \"$M/restart/last\"")).toBeLessThan(at(GO, 'systemctl stop "$WEB" "$API"'));
    expect(at(GO, 'systemctl stop "$WEB" "$API"')).toBeLessThan(at(GO, 'systemctl stop "$RUN"'));
    expect(at(GO, 'systemctl stop "$RUN"')).toBeLessThan(at(GO, 'install -o root -g root -m 0600 /dev/null "$MF"'));
    expect(at(GO, 'install -o root -g root -m 0600 /dev/null "$MF"')).toBeLessThan(at(GO, 'systemd-run --quiet --unit=restart-go-reboot --on-active=30'));
    // After the site is down, every stop says so and sends to RESTART_BACK or to the owner.
    const down = GO.slice(at(GO, 'systemctl stop "$WEB" "$API"'));
    for (const line of down.filter(text => text.includes('RESTART_GO_NOT_DONE'))) expect(line).toMatch(/RESTART_BACK|the site is up again|ask now/);
  });

  it('RESTART_BACK runs only in the same boot with no restart scheduled; RESTART_UP only after a restart', () => {
    expect(BACK.join('\n')).toContain('[ "$(cat /proc/sys/kernel/random/boot_id)" = "$(cat "$RD/boot-id-before")" ] || { echo "RESTART_BACK_NOT_DONE: the server restarted since RESTART_GO: run RESTART_UP instead"; exit 1; }');
    expect(BACK.join('\n')).toContain('[ "$(systemctl is-active restart-go-reboot.timer || true)" != active ] || { echo "RESTART_BACK_NOT_DONE: the restart is still scheduled');
    expect(UP.join('\n')).toContain('[ "$(cat /proc/sys/kernel/random/boot_id)" != "$(cat "$RD/boot-id-before")" ] || { echo "RESTART_UP_NOT_DONE: the server has not restarted since RESTART_GO (the same boot)');
    // Both read the record RESTART_GO names in restart/last.
    for (const lines of [BACK, UP]) expect(lines).toContain('RD=$(cat "$M/restart/last" 2>/dev/null || true)');
  });

  it('RESTART_UP starts the gateway only after the witness says PASS, the runner last, and moves the flag only on a run with no BAD line', () => {
    const witness = at(UP, '  if [ "$WX" = 0 ] && grep -q PASS <<<"$W"; then');
    expect(UP[witness]).toContain('systemctl start debateai-preview-hatchet-gateway.service');
    expect(UP.join('\n')).toContain('if [ "$HOK" = yes ] && [ "$(systemctl is-active debateai-preview-hatchet-gateway || true)" != active ]; then');
    const runner = UP.findIndex(line => line.trim() === 'systemctl start "$RUN" || echo "systemctl start $RUN returned non-zero"');
    expect(runner).toBeGreaterThan(witness);
    expect(runner).toBeGreaterThan(at(UP, 'gatesok || bad gates'));
    expect(runner).toBeGreaterThan(at(UP, '[ "$EK" = "200 $KEY" ] || bad edge'));
    expect(at(UP, '[ -z "$BAD" ] || { echo "RESTART_UP_NOT_DONE:$BAD')).toBeLessThan(at(UP, 'if [ -e "$MF" ]; then mv "$MF"'));
  });

  it('RESTART_UP holds the runner, as SB14B does, while a gate it needs is halted or its window is closed', () => {
    // The gate part of RESTART_UP, then its runner decision; the gates' services, sockets and status stood in for.
    const start = at(UP, 'for G in deepinfra:provider-budget:deepinfra-budget-v3 ');
    const end = UP.findIndex((line, index) => index > start && line === 'done');
    const gates = UP.slice(start, end + 1).join('\n').replace('[ -S "/run/debateai-v3-preview/$GK.sock" ]', '[ "$(svc "$GN")" = active ]');
    expect(gates).toContain('[ "$(svc "$GN")" = active ]');
    const run = (halted: Readonly<Record<string, string>>, pxn = 'named', down = '') => bash([
      'set -euo pipefail', lineOf(UP, "BAD=''; bad()"), lineOf(UP, "ASK=''; ask()"), lineOf(UP, "NORUN=''"),
      `PXN='${pxn}'; GD=deepinfra; PD=p; GAN=anthropic; PAN=p; GPX=perplexity; PPX=p; GBR=bedrock; PBR=p`,
      `svc() { case " ${down} " in *" $1 "*) echo inactive;; *) echo active;; esac; }`,
      'systemctl() { case "$2" in debateai-preview-provider-budget) svc deepinfra;; debateai-preview-anthropic-budget) svc anthropic;; debateai-preview-perplexity-budget) svc perplexity;; *) svc bedrock;; esac; }',
      `gs() { case "$1" in ${Object.entries(halted).map(([gate, status]) => `${gate}) printf '%s\\n' '${status}';;`).join(' ')} *) printf '%s\\n' '{"state":"active","window_open":true,"in_flight":0}';; esac; }`,
      `gatesok() { [ -z '${Object.keys(halted).join(' ')}' ]; }`,
      gates, lineOf(UP, 'gatesok || bad gates'),
      lineOf(UP, 'if [ -n "$NORUN" ]; then bad runner'), 'else echo WOULD START THE RUNNER', 'fi'
    ].join('\n'));
    const HALTED = '{"state":"halted","window_open":true,"in_flight":0,"reason":"a reason"}';
    const CLOSED = '{"state":"active","window_open":false,"in_flight":0}';
    const WAITS = 'BAD (runner): not started: it waits for: gates (the BAD lines above come first)';
    expect(run({}).lines.at(-1)).toBe('WOULD START THE RUNNER');
    const deepinfra = run({ deepinfra: HALTED });
    expect(deepinfra.lines).toContain('BAD (gates): the deepinfra gate is halted with its window open true (reason a reason): its reason is read first; it is re-opened only on the owner\'s yes (PWOFF1\'s gatesok needs all four)');
    expect(deepinfra.lines.at(-1)).toBe(WAITS);
    expect(run({ anthropic: CLOSED }).lines.at(-1)).toBe(WAITS);
    expect(run({ perplexity: HALTED }).lines.at(-1)).toBe(WAITS);
    expect(run({ perplexity: HALTED }, 'not named').lines.at(-1)).toBe('WOULD START THE RUNNER');
    // The Amazon gate does not hold the runner: it is not needed for debates before "Switch it on".
    expect(run({ bedrock: CLOSED }).lines.at(-1)).toBe('WOULD START THE RUNNER');
    // A halted gate whose service is also down is named once.
    expect(run({ deepinfra: HALTED }, 'named', 'deepinfra').lines.at(-1)).toBe(WAITS);
  });
});

describe('the guides around it', () => {
  it('"Boot sequence" says what the first restart showed: Caddy only when enabled, Hatchet\'s address and gateway, the gates\' boot drop-ins', () => {
    const boot = flat(sectionOf(lifecycle, '## Boot sequence (what to expect after a reboot)'));
    expect(boot).toContain('5. **Caddy starts at boot only when it is enabled.** Caddy is not in `debateai-preview.target`');
    expect(boot).toContain('it is enabled now (`systemctl enable caddy.service`)');
    expect(boot).toContain('Docker does not give the container a fixed address, and the gateway lets in only the address its allow list names');
    expect(boot).toContain('After the first restart the address was the same, but the gateway did not run, although the target wants it.');
    expect(boot).toContain('7. **The gates.**');
    expect(boot).toContain('After a restart, the server\'s own steps are "Restarting the server", below');
    // The target itself still wants the gateway, and does not start Caddy.
    const target = read('deploy/preview-lifecycle/v1/systemd/debateai-preview.target');
    expect(target).toContain('debateai-preview-hatchet-gateway.service');
    expect(target).not.toContain('caddy');
  });

  it('the section says what it is for, what to have at hand, the order, and what the first restart taught', () => {
    const text = flat(section);
    expect(text).toContain('Ubuntu then writes the flag `/run/reboot-required`');
    expect(text).toContain("**The hosting company's control panel, open**");
    expect(text).toContain('**A quiet hour.**');
    expect(text).toContain("**The owner's yes.** It names the restart, the runner's one start by RESTART_UP, and any `ACCEPT` word");
    expect(text).toContain('4. RESTART_GO, as a detached run. It refuses to run any other way.');
    expect(text).toContain('### If it does not come back');
    const taught = flat(sectionOf(lifecycle, '### What the first restart taught'));
    for (const finding of ['1. **Caddy was disabled.**', '2. **Docker does not give Hatchet a fixed address**', '3. **A cloud-init file had changed and never been through a boot**', '4. **After the boot, Hatchet\'s gateway did not run**'])
      expect(taught).toContain(finding);
  });

  it('the owner\'s runbook and the release guide point at the section instead of "ask"', () => {
    const ms = flat(runbook);
    expect(ms).not.toContain('no step here restarts the server');
    expect(ms).toContain('To restart first: the lifecycle guide\'s "Restarting the server" (`deploy/preview-lifecycle/v1/README.md`) has the steps (RESTART_LOOK, RESTART_GO, RESTART_UP), on your yes');
    const rel = flat(release);
    expect(rel).not.toContain('no step of these guides restarts the server');
    expect(rel).toContain('**To restart first**: the lifecycle guide\'s "Restarting the server" (`deploy/preview-lifecycle/v1/README.md`), on the owner\'s yes');
  });
});

describe('GATESTATE (MAIN-SITE.md 6.2)', () => {
  /** GATESTATE with the names file replaced by the four gates' names and a status that carries amount marks. */
  const run = (status: string) => bash([
    'set -euo pipefail',
    'GD=/g/deepinfra; PD=/p/deepinfra; GAN=/g/anthropic; PAN=/p/anthropic; GPX=/g/perplexity; PPX=/p/perplexity; GBR=/g/bedrock; PBR=/p/bedrock',
    `gs() { case "$1" in /g/perplexity) return 1;; esac; printf '%s\\n' '${status}'; }`,
    ...GATESTATE.filter(line => line !== NAMES_LINE)
  ].join('\n'));

  it('prints each gate\'s state and whether its window is open, never an amount, and unread for a gate it cannot read', () => {
    expect(GATESTATE.slice(0, 3)).toEqual(['set -euo pipefail', NAMES_LINE, '# GATESTATE: the four spending gates, each with its state and whether its window is open; never an amount (read-only).']);
    const out = run(JSON.stringify({ state: 'active', window_open: true, daily_budget_usd: 'amount-mark-daily', today_spend_usd: 'amount-mark-spent', remaining_today_usd: 'amount-mark-left', in_flight: 0 }));
    expect(out.status).toBe(0);
    expect(out.out).not.toContain('amount-mark');
    expect(out.lines).toEqual([
      'deepinfra gate: state active; window open true',
      'anthropic gate: state active; window open true',
      'perplexity gate: unread',
      'bedrock gate: state active; window open true',
      'GATESTATE_DONE'
    ]);
    expect(flat(runbook)).toContain('use GATESTATE instead: for each of the four gates it prints only its state and whether its window is open, never an amount.');
  });
});
