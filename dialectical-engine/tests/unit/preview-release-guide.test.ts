// Side-by-side spec §12 and "The transition": the preview release guide (deploy/preview-release/v1/README.md) is what the
// operator runs on the live preview server, so its new sections are checked as code here. Each step is one fenced `sh`
// script: `set -euo pipefail`, the release's names file, guards that stop with `<STEP>_NOT_DONE` and `exit 1`, and
// `<STEP>_DONE` as the last line. Every call of a release tool in those sections is handed to that tool's own argument
// parser (with the platform refused, so nothing runs): a flag or a subcommand the tool does not know fails here, not on
// the server. Only the new sections are read; the R19 recipe above them stays as it ran.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');
const guide = read('deploy/preview-release/v1/README.md');

const TRANSITION = '## Transition release T (one last drained upload)';
const SIDE_BY_SIDE = '## Side-by-side release (from T+1)';
const WAY_BACK = '### The way back, side by side';
const DRAINED = '### Drained upload on the template layout';
const MAINTENANCE = '### Infrastructure maintenance';
const PAYMENT_MARKS = '### Payment marks: the files and Caddy\'s rule';
const NAMES_LINE = '. /root/preview-archive/rNN-names.sh';

type Block = Readonly<{ lines: readonly string[]; heading: string; start: number }>;

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

/** Every fenced block, with the nearest heading above it (fences respected: a `# comment` inside a block is no heading). */
function blocksOf(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let heading = '', open: { start: number; body: string[] } | null = null;
  for (const [index, line] of lines.entries()) {
    if (open) {
      if (line.startsWith('```')) { blocks.push(Object.freeze({ lines: Object.freeze(open.body), heading, start: open.start })); open = null; } else open.body.push(line);
      continue;
    }
    if (line.startsWith('```')) { open = { start: index, body: [] }; continue; }
    if (/^#+ /.test(line)) heading = line;
  }
  if (open) throw new Error(`an open fence at line ${open.start + 1}`);
  return blocks;
}

const newSections = guide.slice(Math.max(0, guide.indexOf(`\n${TRANSITION}\n`) + 1));
const sideBySide = sectionOf(guide, SIDE_BY_SIDE);
const drained = sectionOf(guide, DRAINED);
const allBlocks = blocksOf(newSections);
/** A script is a block that stops with `<STEP>_NOT_DONE` or ends with `<STEP>_DONE`. */
const scripts = allBlocks.filter(block => block.lines.some(line => /_NOT_DONE|_DONE\b/.test(line)));
const stepOf = (block: Block) => /^echo ([A-Z][A-Z0-9_]*)_DONE$/.exec(block.lines.at(-1) ?? '')?.[1] ?? null;
const scriptOf = (step: string) => {
  const found = scripts.filter(block => stepOf(block) === step);
  expect(found, step).toHaveLength(1);
  return found[0]!;
};
const code = (line: string) => !line.trimStart().startsWith('#');

/** The steps, in the order the guide runs them. */
const STEPS = Object.freeze([
  'TA0', 'TA1', 'TA8', 'TA_UNITS', 'TA_CADDY', 'TA_ENV', 'TA_OP', 'TB0', 'TB1', 'TB2', 'TB3', 'TB4', 'TB5', 'TB6', 'TB7', 'TB8', 'TB9', 'RBA_T', 'RBB_T',
  'SB1', 'SB1B', 'SB3', 'SB4', 'SB5', 'SB5B', 'SB7', 'SB8', 'SB9', 'SB10', 'SB11', 'SB12', 'SB13', 'SB13B', 'SB14', 'SB14B', 'SB15',
  'WB1', 'WB2', 'WB3', 'WB4', 'DR1', 'DR2', 'DR3', 'DR4', 'DR5', 'DR6', 'RBD_A', 'RBD_B', 'MT1', 'MT2', 'PM1', 'PM2'
]);
/** The scripts that make the names file (they cannot read it yet). */
const MAKES_NAMES = Object.freeze(['TA0', 'TA1', 'SB1']);

describe('the preview release guide: transition T, side by side, the way back, the drained path (side-by-side spec §11, §12)', () => {
  it('the guide has the transition, side-by-side, way-back and drained-on-templates sections', () => {
    for (const heading of [TRANSITION, SIDE_BY_SIDE, WAY_BACK, DRAINED, MAINTENANCE, PAYMENT_MARKS]) expect(guide.split('\n'), heading).toContain(heading);
    // The new sections come after the R19 recipe's way back, and its intro points to them.
    expect(guide.indexOf(TRANSITION)).toBeGreaterThan(guide.indexOf('### The way back\n'));
    const old = sectionOf(guide, '## A normal release on a hosted base (since R19, 21 October 2026)');
    expect(old).toContain('drained recipe of the old layout');
    for (const name of ['Transition release T (one last drained upload)', 'Side-by-side release (from T+1)', 'Drained upload on the template layout']) expect(old).toContain(name);
    // Spec §12 steps 1 to 15 each have their own heading in the side-by-side section.
    for (let step = 1; step <= 15; step++) expect(sideBySide, `SB${step}`).toMatch(new RegExp(`\\n### SB${step}\\. `));
    // Every step of the order has exactly one script, in the guide's order.
    expect(scripts.map(stepOf)).toEqual([...STEPS]);
  });

  it('every script in them starts with set -euo pipefail and ends with its _DONE line', () => {
    expect(scripts.length).toBe(STEPS.length);
    for (const block of scripts) {
      const step = stepOf(block);
      expect(step, `block at line ${block.start + 1}`).not.toBeNull();
      expect(block.lines[0], `${step}`).toBe('set -euo pipefail');
      if (!MAKES_NAMES.includes(step!)) expect(block.lines[1], `${step}`).toBe(NAMES_LINE);
      for (const line of block.lines) {
        // Every stop names its own step and leaves the script on the same line.
        for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], `${step}: ${line}`).toBe(step);
        if (line.includes('_NOT_DONE')) expect(line, `${step}: ${line}`).toMatch(/exit 1/);
        for (const match of line.matchAll(/\becho "?([A-Z][A-Z0-9_]*)_(DONE|SKIPPED)\b/g)) if (!match[1]!.endsWith('_NOT')) expect(match[1], `${step}: ${line}`).toBe(step);
      }
    }
  });

  it('every nat call is captured and tested, never chained', () => {
    let calls = 0;
    for (const block of allBlocks) {
      for (const [index, line] of block.lines.entries()) {
        if (!code(line) || !/(^|[^\w-])nat\s/.test(line)) continue;
        calls += 1;
        expect(line, line).toMatch(/^\s*OUT=\$\(nat "[^"]+"\); echo "nat: \$OUT"$/);
        expect(line).not.toMatch(/nat [^\n]*&&/);
        expect(block.lines.slice(index + 1).some(later => later.includes('[ "$OUT" = "exit 0" ]')), line).toBe(true);
      }
    }
    // T and side by side each run the plan, the migrations, the publish and the first proof; the drained path too.
    expect(calls).toBeGreaterThanOrEqual(11);
  });

  it('the transition\'s drain guard counts waiting debates', () => {
    const tb1 = scriptOf('TB1').lines;
    const guard = '[ "$(psqlq "SELECT count(*) FROM core.run_waiting_v")" = 0 ] || { echo "TB1_NOT_DONE: a debate is waiting in line (nothing was stopped): ask"; exit 1; }';
    expect(tb1).toContain(guard);
    // The guard comes before the first stop.
    expect(tb1.indexOf(guard)).toBeLessThan(tb1.findIndex(line => line.includes('systemctl stop')));
    expect(scriptOf('TA0').lines.join('\n')).toContain('core.run_waiting_v');
  });

  it('the online backup comes before the migrations, and side by side never makes a cold copy', () => {
    const sb7 = scriptOf('SB7').lines.join('\n'), sb8 = scriptOf('SB8').lines.join('\n');
    expect(sb7).toContain('lc backup.mjs --online "$OB" --env "$E/api-$OLABEL.env" --env "$E/runner-$OLABEL.env"');
    expect(sb8).toContain('--operation apply-and-plan');
    // SB8 refuses unless the online backup's sums check out.
    expect(sb8.indexOf('sha256sum -c --quiet online.sha256')).toBeGreaterThan(-1);
    expect(sb8.indexOf('sha256sum -c --quiet online.sha256')).toBeLessThan(sb8.indexOf('--operation apply-and-plan'));
    expect(sideBySide.indexOf('lc backup.mjs --online')).toBeLessThan(sideBySide.indexOf('--operation apply-and-plan'));
    const withoutDrained = sideBySide.replace(drained, '');
    for (const cold of ['pg18-v3-preview-cold.tgz', 'systemctl stop debateai-preview-hatchet-gateway debateai-preview-hatchet debateai-preview-postgresql', 'tar -C "$PGP"']) expect(withoutDrained, cold).not.toContain(cold);
  });

  it('caddy is restarted, never reloaded, and its env file is loaded with systemd-run', () => {
    const cad = 'cad() { systemd-run --quiet --pipe --wait --collect -p EnvironmentFile=/etc/debateai-v3-preview/public/caddy.env /usr/bin/caddy "$@"; }';
    for (const step of ['TA1', 'SB1']) expect(scriptOf(step).lines, step).toContain(cad);
    let restarts = 0, validations = 0;
    for (const block of allBlocks) {
      for (const line of block.lines.filter(code)) {
        expect(line, line).not.toMatch(/reload caddy|caddy reload|systemctl reload/);
        expect(line, line).not.toMatch(/\bcaddy (validate|adapt|run|start)\b/);
        expect(line, line).not.toMatch(/(^|[\s;&|])(\.|source) \S*caddy\.env/);
        if (/systemctl restart caddy/.test(line)) restarts += 1;
        if (/\bcad (validate|adapt) /.test(line)) validations += 1;
      }
    }
    expect(restarts).toBeGreaterThanOrEqual(2);
    expect(validations).toBeGreaterThanOrEqual(2);
  });

  it('the public route refuses /readyz: TA-caddy checks the adapted route and TB7 the live answer (final fix wave W2)', () => {
    const ta = scriptOf('TA_CADDY').lines.join('\n'), tb7 = scriptOf('TB7').lines;
    expect(ta).toContain('[ "$PR" = "static_response 404" ] || { echo "TA_CADDY_NOT_DONE:');
    // The handler order check leaves out only that one route; everything else must still match the live file.
    expect(ta).toContain('select([.match[]?.path[]?] != ["/readyz"])');
    const rp = tb7.findIndex(line => line.startsWith("RP=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://v3-preview.dezbatere.ro/readyz"));
    expect(rp).toBeGreaterThan(-1);
    expect(tb7[rp + 1]).toMatch(/^\[ "\$RP" = 404 \] \|\| back /);
  });

  it('after a reboot or a runner crash during a drain: status stops the steps, and SB14b starts the draining runner, then the current one (final fix wave X1)', () => {
    const sb14b = scriptOf('SB14B').lines;
    const gates = sb14b.findIndex(line => line.includes('jq -r .state)" = active ]') && line.includes('SB14B_NOT_DONE'));
    const loop = sb14b.indexOf('for RL in "$OLABEL" "$LABEL"; do');
    expect(gates).toBeGreaterThan(-1);
    expect(gates).toBeLessThan(loop);
    expect(sb14b).toContain('  systemctl start "$RU" || echo "systemctl start $RU returned non-zero"');
    expect(sb14b.join('\n')).not.toContain('systemctl stop');
    expect(sb14b.at(-2)).toMatch(/^\[ "\$SX" = 0 \] \|\| \{ echo "\$ST"; echo "SB14B_NOT_DONE: /);
    expect(sideBySide).toContain('\n### SB14b. After a reboot or a runner crash during a drain\n');
    // Every status read stops on a bad list (exit 2), except the two rollbacks that start that very runner first, SB14b
    // itself, and TB9 and DR2 (which only read a field and go on).
    const allowed = new Map([['WB2', '"$OLABEL"'], ['WB3', '"$LABEL"']]);
    for (const block of scripts) {
      const step = stepOf(block)!;
      for (const line of block.lines.filter(code)) {
        if (!line.includes('lc release-check.mjs status')) continue;
        if (step === 'TB9' || step === 'DR2') continue;
        if (allowed.has(step) || step === 'SB14B') {
          expect(line, step).toBe('SX=0; ST=$(lc release-check.mjs status 2>&1) || SX=$?');
          if (allowed.has(step)) expect(block.lines.join('\n'), step).toContain(`[.bad[].label] | unique | join(" ")' <<<"$ST" 2>/dev/null)" = ${allowed.get(step)} ]; }`);
          continue;
        }
        expect(line.startsWith(`ST=$(lc release-check.mjs status 2>&1) || { echo "$ST"; echo "${step}_NOT_DONE: release-check.mjs status refused, or its bad list names a draining runner stopped with open work`), `${step}: ${line}`).toBe(true);
      }
    }
  });

  it('the drain names the runner lines: a call in flight waits for the forced stop, a standing request claims nothing (integration M4)', () => {
    const paragraphOf = (text: string, needle: string) => text.split('\n\n').find(paragraph => paragraph.includes(needle)) ?? '';
    const sb14 = sectionOf(guide, '### SB14. Later: the old release retired, and its receipt');
    const sb14b = sectionOf(guide, '### SB14b. After a reboot or a runner crash during a drain');
    // R1: after the 20-minute settle a model call may still run; the runner then does not retire, and root's forced stop
    // (25 minutes after the backstop's request) ends it and re-opens a gate it halted.
    for (const [name, section] of [['SB14', sb14], ['SB14b', sb14b]] as const) {
      const inFlight = paragraphOf(section, '`RUNNER_BACKSTOP_CALL_IN_FLIGHT`');
      expect(inFlight, name).toMatch(/25\s+minutes/);
      expect(inFlight, name).toMatch(/forced\s+stop/);
    }
    // X2: a runner started under a standing retire request claims nothing and goes straight to the backstop.
    expect(paragraphOf(sb14b, '`RETIRE_REQUEST_STANDING`')).toMatch(/claims\s+nothing/);
  });

  it('the N-1 baseline names the live release after TB9 and after SB13b, and SB4 checks it (final fix wave A2)', () => {
    for (const [heading, before, after] of [['### TB10. ', '### TB9. ', '### The way back from T'], ['### SB13c. ', '### SB13b. ', '### SB14. ']] as const) {
      const at = newSections.indexOf(`\n${heading}`);
      expect(at, heading).toBeGreaterThan(newSections.indexOf(`\n${before}`));
      expect(at, heading).toBeLessThan(newSections.indexOf(`\n${after}`));
      const section = sectionOf(guide, guide.split('\n').find(line => line.startsWith(heading))!);
      expect(section).toContain(`jq --arg c "$REV" --arg r "$LABEL" '.commit = $c | .reason = $r | .knownRed = []' dialectical-engine/tests/n1-baseline.json`);
      expect(section).toContain('[ "$(node dialectical-engine/tools/n1-baseline.mjs commit)" = "$REV" ]');
      expect(section).toContain('git push -u origin "chore/n1-baseline-$NN" && gh pr create --base dev');
      // On the Mac: not a server script (no names file, no step guards).
      expect(section).not.toMatch(/_NOT_DONE|_DONE\b|rNN-names\.sh/);
      // Integration M10: a failed read-back never commits (the commit is chained to it, never on a line of its own).
      expect(section).toContain('[ "$(node dialectical-engine/tools/n1-baseline.mjs commit)" = "$REV" ] && git diff --stat'
        + ' && git add dialectical-engine/tests/n1-baseline.json && git commit -m "chore(n1): the N-1 baseline names $LABEL ($NN)"');
      expect(section.split('\n').filter(line => line.startsWith('git add '))).toEqual([]);
    }
    const sb4 = sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB4. '))!);
    expect(sb4).toContain('`N1_BASELINE`');
    expect(sb4).toContain('`N1_BASELINE` fails with `set the N-1 baseline first`');
  });

  it('SB8 accepts the old ledger plus the database-ahead file\'s steps it did not hold yet: the abort-then-fix sequence (final fix wave A1)', () => {
    const sb8 = scriptOf('SB8').lines;
    const pick = (prefix: string) => { const found = sb8.filter(line => line.startsWith(prefix)); expect(found, prefix).toHaveLength(1); return found[0]!; };
    const steps = pick('NEWSTEPS=$(for M in $(jq -r \'.steps[].name\' "$DA")'), top = pick('TOP=$('), check = pick('[ "$LEDGER" = "$(( ${LEDGER0%%|*} + ');
    expect(sb8.indexOf(steps)).toBeLessThan(sb8.findIndex(line => line.startsWith('OUT=$(nat ')));
    expect(sb8.join('\n')).not.toContain('grep -c . "$S/new-migrations.txt"');
    // The three lines, run by bash with the database as a list of names (psqlq answers the one count they ask).
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb8-'));
    try {
      const ledger = (before: string[], newer: string[], after: string[]) => {
        writeFileSync(join(dir, 'before'), `${before.join('\n')}\n`);
        writeFileSync(join(dir, 'da.json'), JSON.stringify({ steps: newer.map(name => ({ name })) }));
        const summary = (names: string[]) => `${names.length}|${[...names].sort().at(-1)}`;
        const script = ['set -euo pipefail', `D='${dir}'; DA="$D/da.json"; LEDGER0='${summary(before)}'; LEDGER='${summary(after)}'`,
          `psqlq() { N=$(printf '%s' "$1" | sed -n "s/.*name = '\\(.*\\)'.*/\\1/p"); if grep -qxF "$N" "$D/before"; then echo 1; else echo 0; fi; }`,
          steps, top, check, 'echo LEDGER_OK'].join('\n');
        try { return execFileSync('bash', ['-c', script], { encoding: 'utf8' }).trim(); } catch (error) { return String((error as { stdout?: string }).stdout ?? '').trim(); }
      };
      const OLD = ['0121_engine_verdict.sql', '0122_engine_map_check.sql', '0123_side_by_side_releases.sql'];
      // A plain upload: one new step.
      expect(ledger(OLD, ['0124_a.sql'], [...OLD, '0124_a.sql'])).toBe('LEDGER_OK');
      // T+1 applied 0124 and was rolled back; the fix release keeps 0124 and adds 0125: only 0125 is new to the ledger.
      expect(ledger([...OLD, '0124_a.sql'], ['0124_a.sql', '0125_b.sql'], [...OLD, '0124_a.sql', '0125_b.sql'])).toBe('LEDGER_OK');
      // A step that did not land, or one the file does not name, still stops SB8.
      expect(ledger(OLD, ['0124_a.sql', '0125_b.sql'], [...OLD, '0124_a.sql'])).toMatch(/^SB8_NOT_DONE: the ledger is not the old one plus exactly/);
      expect(ledger(OLD, ['0124_a.sql'], [...OLD, '0124_a.sql', '0125_b.sql'])).toMatch(/^SB8_NOT_DONE: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('TA-units counts the multi-valued properties and stops on a one-value property printed twice, before the downtime (final fix wave S5)', async () => {
    const templates = await import('../../deploy/' + 'preview-lifecycle/v1/unit-templates.mjs');
    const lines = scriptOf('TA_UNITS').lines;
    const one = /^ONE='([A-Za-z ]+)'$/.exec(lines.find(line => line.startsWith('ONE=')) ?? '')?.[1]?.split(' ');
    // Exactly what compare reads with one value each: Id, LoadState and the compared properties minus the five lists.
    expect(one).toEqual(['Id', 'LoadState', ...templates.COMPARED_PROPERTIES.filter((name: string) => !templates.MULTI_VALUED_PROPERTIES.includes(name))]);
    expect(lines.join('\n')).toContain(`for K in ${templates.MULTI_VALUED_PROPERTIES.join(' ')}; do`);
    const guard = lines.findIndex(line => line.includes('TA_UNITS_NOT_DONE: $SVC.show holds a one-value property twice'));
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(lines.findIndex(line => line.startsWith('install -d -o root -g root -m 0700 "$S/templates"')));
  });

  it('the stale-lock line\'s pgrep cannot match its own shell (final fix wave S7)', () => {
    const lines = allBlocks.flatMap(block => block.lines).filter(line => code(line) && line.includes('pgrep'));
    expect(lines).toEqual(["pgrep -f '[r]elease-switch.mjs' || mv /etc/debateai-v3-preview/lifecycle/release-switch.lock \"/root/preview-archive/release-switch.lock.stale-$(date -u +%Y%m%dT%H%M%SZ)\""]);
    // pgrep -f matches its pattern (an extended regex) against every process's whole command line: the bracket form
    // finds a running switch, but not the shell that runs this line (`bash -c "<line>"`); the plain name found both.
    const switchProcess = '/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node /opt/debateai-v3-preview/operator/lifecycle-v1/dialectical-engine/deploy/preview-lifecycle/v1/release-switch.mjs switch --finish --to a-v1 --from b-v1';
    const pattern = /^pgrep -f '([^']+)'/.exec(lines[0]!)![1]!;
    expect(new RegExp(pattern).test(switchProcess)).toBe(true);
    expect(new RegExp(pattern).test(`bash -c ${lines[0]}`)).toBe(false);
    expect(new RegExp('release-switch.mjs').test('bash -c pgrep -f release-switch.mjs || mv …')).toBe(true);
  });

  it('the caddy step restores the old file on a failed check', () => {
    const tb7 = scriptOf('TB7').lines;
    const restoreLine = 'install -o root -g root -m 0644 "$S/Caddyfile.before-two-slot" "$C.new"';
    const back = tb7.findIndex(line => line.startsWith('back() {'));
    expect(back).toBeGreaterThan(-1);
    // The one way out after the new file is in: the old file back, Caddy restarted, and only then the stop line.
    expect(tb7[back]!.indexOf(restoreLine)).toBeGreaterThan(-1);
    expect(tb7[back]!.indexOf(restoreLine)).toBeLessThan(tb7[back]!.indexOf('systemctl restart caddy'));
    expect(tb7[back]!.indexOf('systemctl restart caddy')).toBeLessThan(tb7[back]!.indexOf('TB7_NOT_DONE'));
    // The old file is kept before the new one goes in, and every check after that goes through the restore.
    const install = tb7.findIndex(line => line.startsWith('install -o root -g root -m 0644 "$S/Caddyfile.two-slot" "$C.new"'));
    expect(tb7.findIndex(line => line.startsWith('cp -p "$C" "$S/Caddyfile.before-two-slot"'))).toBeLessThan(install);
    expect(back).toBeLessThan(install);
    const afterInstall = tb7.slice(install, -1);
    expect(afterInstall.filter(line => / \|\| back /.test(line)).length).toBeGreaterThanOrEqual(8);
    for (const line of afterInstall) {
      expect(line, line).not.toContain('_NOT_DONE');
      if (/\] \|\||cmp -s [^|]*\|\|/.test(line)) expect(line, line).toMatch(/\|\| back /);
    }
  });

  it('the payment marks: PM2 runs the marks command inside the maintenance flag and restores the old file on a failed check', async () => {
    const { PAYMENT_MARKS: MARKS } = await import('../../deploy/' + 'preview-release/v1/caddy-slots.mjs');
    // SB1's names file defines cslots exactly as TA1's does: the new release's own tool (it knows add-payment-marks).
    const cslots = 'cslots() { /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin TZ=UTC /opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node "$CAPI/dialectical-engine/deploy/preview-release/v1/caddy-slots.mjs" "$@"; }';
    for (const step of ['TA1', 'SB1']) expect(scriptOf(step).lines, step).toContain(cslots);
    expect(read('deploy/preview-release/v1/caddy-slots.mjs')).toContain('add-payment-marks');
    // The section comes right after the maintenance scripts, and PM1 and PM2 use the folder the tool's rule serves.
    expect(guide.indexOf(`\n${PAYMENT_MARKS}\n`)).toBeGreaterThan(guide.indexOf(`\n${MAINTENANCE}\n`));
    for (const step of ['PM1', 'PM2']) expect(scriptOf(step).lines, step).toContain(`PMD=${MARKS.folder}`);
    const pm2 = scriptOf('PM2').lines;
    const flag = pm2.findIndex(line => line.startsWith('[ -e /etc/debateai-v3-preview/lifecycle/maintenance-pending ] ||') && line.includes('PM2_NOT_DONE'));
    const knows = pm2.findIndex(line => line.startsWith('grep -q \'add-payment-marks\' "$CAPI/dialectical-engine/deploy/preview-release/v1/caddy-slots.mjs" ||') && line.includes('PM2_NOT_DONE'));
    const run = pm2.findIndex(line => line.startsWith('TR=$(cslots add-payment-marks --in "$C" --out "$S/Caddyfile.payment-marks" 2>&1) || {'));
    expect(flag).toBeGreaterThan(-1);
    expect(knows).toBeGreaterThan(flag);
    expect(run).toBeGreaterThan(knows);
    // Before anything changes, the site answers 200 at the edge.
    const healthy = pm2.findIndex(line => line.startsWith('[ "${EK%% *}" = 200 ] || {') && line.includes('PM2_NOT_DONE: the site is not healthy before PM2'));
    expect(pm2[healthy - 1]).toMatch(/^EK=\$\(edgekey\); /);
    expect(healthy).toBeGreaterThan(knows);
    // The copy of the live file is taken before the tool reads it, after the guard that no earlier copy exists.
    const fresh = pm2.findIndex(line => line.startsWith('[ ! -e "$S/Caddyfile.payment-marks" ] && [ ! -e "$S/Caddyfile.before-payment-marks" ] ||'));
    const copy = pm2.findIndex(line => line.startsWith('cp -p "$C" "$S/Caddyfile.before-payment-marks"'));
    expect(healthy).toBeLessThan(fresh);
    expect(fresh).toBeLessThan(copy);
    expect(copy).toBeLessThan(run);
    // The refusal never claims the rule is in place: the live file merely mentions payment-marks.
    expect(pm2[run]).toContain('CADDY_ALREADY_PAYMENT_MARKS: the live file mentions payment-marks already');
    // The handler order leaves out exactly the marks route, with TA-caddy's filter; one route serves the three paths.
    const text = pm2.join('\n');
    expect(text).toContain(`PMJ='${JSON.stringify(MARKS.files.map((file: string) => `/payment-marks/${file}`))}'`);
    expect(text).toContain('select([.match[]?.path[]?] != $m)');
    const restoreLine = 'install -o root -g root -m 0644 "$S/Caddyfile.before-payment-marks" "$C.new"';
    const back = pm2.findIndex(line => line.startsWith('back() {'));
    expect(back).toBeGreaterThan(-1);
    // The one way out after the new file is in: the old file back, Caddy restarted, and only then the stop line.
    expect(pm2[back]!.indexOf(restoreLine)).toBeGreaterThan(-1);
    expect(pm2[back]!.indexOf(restoreLine)).toBeLessThan(pm2[back]!.indexOf('systemctl restart caddy'));
    expect(pm2[back]!.indexOf('systemctl restart caddy')).toBeLessThan(pm2[back]!.indexOf('PM2_NOT_DONE'));
    const install = pm2.findIndex(line => line.startsWith('install -o root -g root -m 0644 "$S/Caddyfile.payment-marks" "$C.new"'));
    expect(copy).toBeLessThan(install);
    expect(run).toBeLessThan(install);
    // Right before the install: the live file is still the copy back() restores, or nothing is installed.
    expect(pm2[install - 1]).toBe('cmp -s "$C" "$S/Caddyfile.before-payment-marks" || { echo "PM2_NOT_DONE: the live Caddyfile changed during PM2 (nothing changed): ask"; exit 1; }');
    expect(back).toBeLessThan(install);
    const afterInstall = pm2.slice(install, -1);
    expect(afterInstall.filter(line => / \|\| back /.test(line)).length).toBeGreaterThanOrEqual(7);
    for (const line of afterInstall) {
      expect(line, line).not.toContain('_NOT_DONE');
      if (/\] \|\||cmp -s [^|]*\|\|/.test(line)) expect(line, line).toMatch(/\|\| back /);
    }
    // The marks sit behind the password: without it, visa.svg answers 401 like the site.
    const vc = pm2.findIndex(line => line.startsWith("VC=$(curl -s -o /dev/null -m 15 -w '%{http_code}' https://v3-preview.dezbatere.ro/payment-marks/visa.svg"));
    expect(vc).toBeGreaterThan(install);
    expect(pm2[vc + 1]).toMatch(/^\[ "\$VC" = 401 \] \|\| back /);
    // The owner's yes names PM2, and the first time runs it between MT1 and MT2.
    expect(sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB6. '))!)).toContain('- the Caddy payment-marks rule (PM2), when this upload adds it.');
    expect(sectionOf(guide, PAYMENT_MARKS)).toMatch(/MT1, PM2, MT2/);
    // The order table has the marks window after the yes, and a stopped PM2 never lets the list reach SB7.
    const row = '| MT1, PM2, MT2 | only the first upload that lists the marks: Caddy\'s rule (see "Payment marks: the files and Caddy\'s rule") | up (one Caddy restart, about a second) | PM2 puts the old Caddyfile back itself |';
    const table = sideBySide.split('\n');
    expect(table.indexOf(row)).toBe(table.findIndex(line => line.startsWith('| SB6 |')) + 1);
    expect(sectionOf(guide, PAYMENT_MARKS).replace(/\s+/g, ' ')).toContain('If PM2 stops, do not go on to SB7 (or DR2) with the list in place: run PM2 again once the cause is fixed');
    expect(sectionOf(guide, PAYMENT_MARKS).replace(/\s+/g, ' ')).toContain('If it does not show, stop here, before SB7 (or DR2), and ask.');
  });

  it('SB10 and DR5 make no launch plan while the ui file names marks that Caddy does not serve', async () => {
    const { PAYMENT_MARKS: MARKS } = await import('../../deploy/' + 'preview-release/v1/caddy-slots.mjs');
    const matcher = `@paymentMarks path ${MARKS.files.map((file: string) => `/payment-marks/${file}`).join(' ')}`;
    expect(read('deploy/preview-release/v1/caddy-slots.mjs')).toContain('`@paymentMarks path ${');
    for (const step of ['SB10', 'DR5']) {
      const lines = scriptOf(step).lines;
      const guard = `if grep -q '^PAYMENT_MARKS_AVAILABLE=' "$E/ui-$LABEL.env"; then grep -qF '${matcher}' "$C" || { echo "${step}_NOT_DONE: ui-$LABEL.env names payment marks but Caddy does not serve them (PM2 first, or put $S/ui-$LABEL.env.before-marks back); nothing changed"; exit 1; }; fi`;
      const at = lines.indexOf(guard);
      expect(at, step).toBeGreaterThan(-1);
      const firstPlan = lines.findIndex(line => line.startsWith('rel launch-plan '));
      expect(firstPlan, step).toBeGreaterThan(at);
      // Before anything changes: no put, publish, pin or stage comes before it.
      for (const line of lines.slice(0, at).filter(code)) expect(line, `${step}: ${line}`).not.toMatch(/^(rel |put |OUT=|PIN=|SG=)/);
    }
    // The guard reads the line through bash: a ui file with the list and a Caddyfile without the rule stops, and
    // either a Caddyfile with the rule or a ui file without the list goes on.
    const guard = scriptOf('SB10').lines.find(line => line.startsWith("if grep -q '^PAYMENT_MARKS_AVAILABLE='"))!;
    const dir = mkdtempSync(join(tmpdir(), 'guide-marks-guard-'));
    try {
      const run = (ui: string, caddy: string) => {
        writeFileSync(join(dir, 'ui-rX.env'), ui); writeFileSync(join(dir, 'Caddyfile'), caddy);
        try { return execFileSync('bash', ['-c', ['set -euo pipefail', `E='${dir}'; C='${dir}/Caddyfile'; S='${dir}'; LABEL=rX`, guard, 'echo GUARD_OK'].join('\n')], { encoding: 'utf8' }).trim(); } catch (error) { return String((error as { stdout?: string }).stdout ?? '').trim(); }
      };
      expect(run('PORT=3200\nPAYMENT_MARKS_AVAILABLE=visa\n', 'v3-preview.dezbatere.ro {\n}\n')).toMatch(/^SB10_NOT_DONE: /);
      expect(run('PORT=3200\nPAYMENT_MARKS_AVAILABLE=visa\n', `v3-preview.dezbatere.ro {\n\t${matcher}\n}\n`)).toBe('GUARD_OK');
      expect(run('PORT=3200\n', 'v3-preview.dezbatere.ro {\n}\n')).toBe('GUARD_OK');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('PM1 copies only an SVG with no script in it, and its marks list is built without ending the script', () => {
    const pm1 = scriptOf('PM1').lines;
    const unsafe = pm1.find(line => line.trimStart().startsWith("if grep -qiE '<script|javascript:|<foreignObject|[[:space:]]on[a-z]+[[:space:]]*=' \"$F\"; then echo \"PM1_NOT_DONE: "))!;
    expect(unsafe).toBeDefined();
    // `[ … ] && printf` inside $(…) ends a set -e script when the test is false: the list is built with an if.
    for (const line of pm1.filter(code)) expect(line, line).not.toMatch(/\$\([^)]*\] && printf/);
    expect(pm1.join('\n')).toContain('524288');
    const dir = mkdtempSync(join(tmpdir(), 'guide-pm1-'));
    try {
      const check = (svg: string) => {
        writeFileSync(join(dir, 'mark.svg'), svg);
        try { return execFileSync('bash', ['-c', ['set -euo pipefail', `F='${join(dir, 'mark.svg')}'`, unsafe.trim(), 'echo SVG_OK'].join('\n')], { encoding: 'utf8' }).trim(); } catch (error) { return String((error as { stdout?: string }).stdout ?? '').trim(); }
      };
      expect(check('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe('SVG_OK');
      for (const bad of ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
        // XML allows spaces around `=`: the handler is still refused.
        '<svg xmlns="http://www.w3.org/2000/svg" onload = "alert(1)"/>',
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="JavaScript:alert(1)"/></svg>', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>']) expect(check(bad), bad).toMatch(/^PM1_NOT_DONE: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('SB5b adds the list only to a release whose website knows it, before its launch plans, with the files in place', () => {
    const sb5b = scriptOf('SB5B').lines;
    expect(sideBySide.indexOf('\n### SB5b. ')).toBeGreaterThan(sideBySide.indexOf('\n### SB5. '));
    expect(sideBySide.indexOf('\n### SB5b. ')).toBeLessThan(sideBySide.indexOf('\n### SB6. '));
    const at = (needle: string) => { const found = sb5b.findIndex(line => line.includes(needle) && line.includes('SB5B_NOT_DONE')); expect(found, needle).toBeGreaterThan(-1); return found; };
    // The website of a release starts from its own UI folder: that folder's environment.mjs must admit the setting.
    const knows = at('grep -q "\'PAYMENT_MARKS_AVAILABLE\'" "$CUI/dialectical-engine/deploy/preview-auth-dev/v1/environment.mjs"');
    expect(read('deploy/preview-auth-dev/v1/environment.mjs')).toContain("'PAYMENT_MARKS_AVAILABLE'");
    const plans = at('[ ! -e "$ART/ui-launch.json" ]');
    const files = at('[ -f "$PMD/$M.svg" ]');
    const form = at("grep -qxE '(netopia|visa|mastercard)(,(netopia|visa|mastercard)){0,2}'");
    const repeat = at('uniq -d');
    const edit = sb5b.findIndex(line => line.startsWith('cp -p "$U" "$S/ui-$LABEL.env.before-marks"'));
    const moved = sb5b.findIndex(line => line.startsWith('mv "$U.new" "$U"'));
    const same = sb5b.findIndex(line => line.startsWith('lc release-env.mjs same --labels "$OLABEL,$LABEL" --slots "$OSLOT,$SLOT" ||'));
    for (const guard of [knows, plans, files, form, repeat]) expect(guard).toBeLessThan(edit);
    expect(edit).toBeLessThan(moved);
    expect(moved).toBeLessThan(same);
    // The list's form, run by bash: what the test site's check (UI_PAYMENT_MARKS_AVAILABLE) calls OK, and nothing else.
    const marks = (value: string) => {
      try { return execFileSync('bash', ['-c', ['set -euo pipefail', `MARKS='${value}'`, sb5b[form], sb5b[repeat], 'echo MARKS_OK'].join('\n')], { encoding: 'utf8' }).trim(); } catch (error) { return String((error as { stdout?: string }).stdout ?? '').trim(); }
    };
    for (const good of ['visa', 'visa,mastercard', 'mastercard,netopia,visa']) expect(marks(good), good).toBe('MARKS_OK');
    for (const bad of ['', 'visa,visa', 'amex', 'visa,', 'Visa', 'visa, mastercard', 'netopia,visa,mastercard,visa']) expect(marks(bad), bad).toMatch(/^SB5B_NOT_DONE: /);
    // An empty value is refused by the settings reader: no marks means no line. The drained path edits after DR1.
    expect(sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB5b. '))!)).toMatch(/leave the\s+line out/);
    expect(drained).toContain('To change the payment marks on this path, run SB5b right after DR1.');
  });

  it('no script stops a runner instance outside the drained and before-switch blocks', () => {
    const rbbT = scriptOf('RBB_T');
    for (const block of allBlocks) {
      for (const [index, line] of block.lines.entries()) {
        if (!code(line) || !/systemctl stop/.test(line) || !/runner/.test(line)) continue;
        if (/runner@/.test(line)) {
          // Only on the drained path (and T's own way back, which is drained too), and only after a zero-open-work guard.
          expect(drained.includes(line) || block === rbbT, line).toBe(true);
          expect(block.lines.slice(0, index).some(earlier => earlier.includes("state IN ('READY', 'CLAIMED')")), line).toBe(true);
        } else {
          // R19's fixed runner, stopped by TB1 after its drain guards.
          expect(block, line).toBe(scriptOf('TB1'));
        }
      }
    }
    // The before-switch way back stops nothing itself: the switch tool stops the new release (zero open work only).
    expect(scriptOf('WB1').lines.join('\n')).toContain('lc release-switch.mjs rollback --before-switch --label "$LABEL"');
    expect(scriptOf('WB1').lines.join('\n')).not.toContain('systemctl stop');
  });

  it('nothing is removed: no rm, no unlink, no shred in the new sections', () => {
    for (const block of allBlocks) {
      for (const line of block.lines.filter(code)) {
        expect(line, line).not.toMatch(/(^|[\s;&|(`])(rm|rmdir|unlink|shred|truncate)(\s|$)/);
        expect(line, line).not.toMatch(/\s-delete(\s|$)/);
      }
    }
  });

  it('nothing is overwritten: a unit file or the boot target goes in only after the one in its place moved into S', () => {
    const tb5 = scriptOf('TB5').lines;
    const inst = tb5.find(line => line.startsWith('inst() {'))!;
    expect(inst).toBeDefined();
    // inst(): the file in the way moves aside first, and a failed move ends inst before anything is installed.
    const exists = inst.indexOf('[ -e "$UD/$2" ] || [ -L "$UD/$2" ]');
    const aside = inst.indexOf('mv "$UD/$2" "$S/systemd-old/$2" || return 1;');
    const install = inst.indexOf('install -o root -g root -m 0644 "$1" "$UD/$2"');
    expect(exists).toBeGreaterThan(-1);
    expect(exists).toBeLessThan(aside);
    expect(aside).toBeLessThan(install);
    expect(inst).toMatch(/printf '%s\\n' "\$2" >> "\$S\/systemd-old\.txt" \|\| return 1;/);
    // Every file TB5 installs at the top of /etc/systemd/system goes through inst (drop-ins go into folders TB5 made).
    expect(tb5.filter(code).filter(line => line !== inst && /install -o root -g root -m 0644 \S+ "\$UD\/[^"/]+"/.test(line))).toEqual([]);
    // rbD-B: SB1's boot target drop-in goes back only after the current one moved into S.
    const rbd = scriptOf('RBD_B').lines;
    const moved = rbd.findIndex(line => line.includes('mv "$TG" "$S/60-current-release.conf.after-$TS"'));
    const restored = rbd.findIndex(line => line.includes('"$TG" || { echo "RBD_B_NOT_DONE'));
    expect(moved).toBeGreaterThan(-1);
    expect(moved).toBeLessThan(restored);
  });

  it('the R19 traps are carried: no runner prepare-only, the all-models build, migrations before any start', () => {
    for (const block of allBlocks) for (const line of block.lines.filter(code)) if (/launch-runner\.mjs/.test(line)) expect(line).toMatch(/--start/);
    expect(scriptOf('SB1B').lines.join('\n')).toContain('rel build-env --models all-models --release-key "$KEY"');
    // A release's migrations go in before its first start, in T and side by side.
    expect(newSections.indexOf('### TB3. ')).toBeLessThan(newSections.indexOf('### TB6. '));
    expect(sideBySide.indexOf('### SB8. ')).toBeLessThan(sideBySide.indexOf('### SB11. '));
    // T is recorded current before its API starts (a hosted API with no current release treats itself as draining).
    const tb6 = scriptOf('TB6').lines;
    expect(tb6.findIndex(line => line.includes('lc release-switch.mjs seed --label "$LABEL"'))).toBeLessThan(tb6.findIndex(line => line.includes('systemctl start "debateai-preview-api@$LABEL"')));
  });

  it('names the switch\'s take-traffic delay as the tool sets it (final fix wave P6), and its early way back (X4)', async () => {
    const { TAKE_TRAFFIC_AFTER_S } = await import('../../deploy/' + 'preview-lifecycle/v1/release-switch.mjs');
    expect(TAKE_TRAFFIC_AFTER_S).toBe(8);
    const sb13 = sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB13. '))!);
    expect(sb13).toContain(`take traffic from the database clock + ${TAKE_TRAFFIC_AFTER_S} s`);
    expect(guide).not.toMatch(/database clock \+ 5 s/);
    expect(sb13).toContain('`SWITCH_REVERTED` with reason `WEBSITE_NOT_READY`');
  });

  it('names both owner-yes points and what each yes must say', () => {
    const t = sectionOf(guide, TRANSITION);
    // The gate redeploy (TB0g) runs right before the downtime on the same yes (final fix wave S4).
    expect(t).toMatch(/fresh in the live chat right before TB0g \(or TB1 when TA10 listed no gate file\)/);
    for (const word of ['downtime', 'cold copy', 'max_connections', 'migrations', 'delta', 'release key', 'layout']) expect(t, word).toContain(word);
    const sb6 = sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB6. '))!);
    for (const word of ['side by side', 'online backup', 'migrations', 'delta', 'release key', 'switch']) expect(sb6, word).toContain(word);
  });
});

describe('the boot target\'s drop-in folder is shared with the Anthropic gate (final fix wave S1, S3, S4)', () => {
  const TD = '/etc/systemd/system/debateai-preview.target.d';
  const FILE = 'debateai-preview.target.d/60-current-release.conf';

  it('no script stops on the folder, lists it for the way back, or moves it whole: only the switch\'s own file', () => {
    for (const block of allBlocks) {
      for (const line of block.lines.filter(code)) {
        // The live preview already has the folder (README-anthropic.md "Switch it on": 50-anthropic-gate.conf).
        expect(line, line).not.toMatch(/\[ ! -e [^\]]*debateai-preview\.target\.d \]/);
        expect(line, line).not.toMatch(/debateai-preview\.target\.d >> "\$S\/systemd-T\.list"/);
        expect(line, line).not.toMatch(/\bmv [^|]*debateai-preview\.target\.d["\s]/);
      }
    }
    expect(scriptOf('TA0').lines).toContain(`[ ! -e ${TD}/60-current-release.conf ] || { echo "TA0_NOT_DONE: debateai-preview.target.d/60-current-release.conf exists already (look first)"; exit 1; }`);
    expect(scriptOf('TB0').lines.join('\n')).toContain(`[ ! -e ${TD}/60-current-release.conf ]`);
    expect(scriptOf('TB5').lines.find(line => line.startsWith('for N in debateai-preview-api@.service '))).toContain(` ${FILE}; do [ ! -e "$UD/$N" ]`);
    // TB6 lists the file it lets the seed write, never the folder; the seed comes after the listing.
    const tb6 = scriptOf('TB6').lines;
    const listed = tb6.indexOf(`printf '%s\\n' ${FILE} >> "$S/systemd-T.list"`);
    expect(listed).toBeGreaterThan(-1);
    expect(listed).toBeLessThan(tb6.findIndex(line => line.includes('lc release-switch.mjs seed --label "$LABEL"')));
  });

  it('TA1 copies the boot target and its folder; TA0 stops on a live boot target line R19\'s copy lacks, and TB0 on any change since', () => {
    expect(scriptOf('TA1').lines.join('\n')).toContain('tar -czf "$S/systemd-before.tgz" debateai-preview-* debateai-preview.target debateai-preview.target.d ) || { echo "TA1_NOT_DONE:');
    const ta0 = scriptOf('TA0').lines;
    const rt = ta0.findIndex(line => line.includes('RT=$RAPI/dialectical-engine/deploy/preview-lifecycle/v1/systemd/debateai-preview.target'));
    const extra = ta0.findIndex(line => line.startsWith('XT=$(LC_ALL=C comm -13 <(unitlines "$RT") <(unitlines "$LT"))'));
    const stop = ta0.findIndex(line => line.startsWith('[ -z "$XT" ] ||') && /TA0_NOT_DONE: .*ask \(\$P exists: move it aside\)"; exit 1; }$/.test(line));
    expect(ta0.findIndex(line => line.startsWith('RAPI=$(jq -r .services.api.sourceRoot "$LOCK")'))).toBeLessThan(rt);
    expect(rt).toBeLessThan(extra);
    expect(extra).toBeLessThan(stop);
    expect(ta0).toContain('cp -p "$LT" "$P/debateai-preview.target.live"');
    expect(scriptOf('TA1').lines.join('\n')).toContain('[ -s "$P/debateai-preview.target.live" ]');
    expect(scriptOf('TB0').lines.join('\n')).toContain('cmp -s /etc/systemd/system/debateai-preview.target "$S/preflight/debateai-preview.target.live" || { echo "TB0_NOT_DONE:');
  });

  it('TA0 stops, before its capture folder exists, on a drop-in folder the switch\'s writer would refuse (integration M8)', () => {
    const ta0 = scriptOf('TA0').lines;
    const folder = ta0.indexOf(`[ "$(stat -c '%F %U %a' ${TD})" = "directory root 755" ] && [ "$(realpath ${TD})" = ${TD} ]`
      + ` || { echo "TA0_NOT_DONE: the boot target's drop-in folder is not root 0755 (the switch's writer refuses it): ask"; exit 1; }`);
    expect(folder).toBeGreaterThan(-1);
    expect(folder).toBeLessThan(ta0.indexOf('install -d -o root -g root -m 0700 "$P"'));
  });

  it('a stop after a folder was made says to move it aside before the step runs again (integration M9)', () => {
    const ta0 = scriptOf('TA0').lines;
    const made = ta0.indexOf('install -d -o root -g root -m 0700 "$P"');
    for (const start of ['[ -f "$LT" ] && [ -f "$RT" ] ||', '[ -z "$XT" ] ||']) {
      const at = ta0.findIndex(line => line.startsWith(start));
      expect(at, start).toBeGreaterThan(made);
      expect(ta0[at], start).toMatch(/TA0_NOT_DONE: [^"]*\(\$P exists: move it aside\)"; exit 1; }$/);
    }
    const tar = scriptOf('TA1').lines.find(line => line.includes('tar -czf "$S/systemd-before.tgz"'))!;
    expect(tar).toContain('(the names file and S exist: move them aside before running TA1 again)"; exit 1; }');
  });

  it('rbB-T makes the folder in S before its move loop, reads the links list only when TB5 wrote it, and names the state at every failed move', () => {
    const rbb = scriptOf('RBB_T').lines;
    const made = rbb.indexOf('  install -d -o root -g root -m 0700 "$S/systemd-T" "$S/systemd-T/debateai-preview.target.d"');
    const loop = rbb.findIndex(line => line.includes('done < "$S/systemd-T.list"'));
    expect(made).toBeGreaterThan(-1);
    expect(made).toBeLessThan(loop);
    const wants = rbb.findIndex(line => line.includes('done < "$S/systemd-old-wants.txt"'));
    expect(rbb[wants - 1]).toBe('  if [ -e "$S/systemd-old-wants.txt" ]; then');
    // Every mv in rbB-T has its own stop line (set -e alone would end the script without saying what is left where).
    for (const line of rbb.filter(code)) {
      const moves = line.match(/(^|[\s;&|])mv /g)?.length ?? 0;
      if (moves) expect(line.match(/\|\| \{ echo "RBB_T_NOT_DONE: /g)?.length ?? 0, line).toBeGreaterThanOrEqual(moves);
    }
  });

  it('T\'s operator folder is built and compared before the downtime; the gate redeploy runs right before it (S4)', () => {
    const op = scriptOf('TA_OP').lines.join('\n'), tb5 = scriptOf('TB5').lines.join('\n');
    expect(op).toContain('git -C "$ART/source-reference" archive --format=tar "$REV" dialectical-engine/deploy/preview-lifecycle dialectical-engine/deploy/preview-auth-dev dialectical-engine/deploy/preview-release | tar -x -C "$NEWOP"');
    expect(op).toContain('diff -r "$NEWOP/dialectical-engine/deploy/$D" "$CAPI/dialectical-engine/deploy/$D"');
    // TB5 (inside the downtime) builds nothing: it compares again and swaps.
    expect(tb5).not.toContain('git -C "$ART/source-reference" archive');
    expect(tb5).toContain('diff -r "$NEWOP/dialectical-engine/deploy/$D" "$CAPI/dialectical-engine/deploy/$D"');
    expect(tb5.indexOf('diff -r "$NEWOP')).toBeLessThan(tb5.indexOf('mv "$OP" "$S/operator-lifecycle-v1.before"'));
    expect(scriptOf('TB0').lines.join('\n')).toContain('diff -r "$NEWOP/dialectical-engine/deploy/$D"');
    const t = sectionOf(guide, TRANSITION);
    expect(t.indexOf('\n### TA-op. ')).toBeLessThan(t.indexOf('\n### TB0. '));
    expect(t.indexOf('\n### TB0. ')).toBeLessThan(t.indexOf('\n### TB0g. '));
    expect(t.indexOf('\n### TB0g. ')).toBeLessThan(t.indexOf('\n### TB1. '));
    expect(t).not.toContain('TB1g');
    expect(scriptOf('TB1').lines.join('\n')).toContain('jq -r .state)" = active ]');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The tools' own parsers. Each invocation's words are expanded with the sample values below (a variable this map lacks
// fails the test, so a misspelled name is caught too) and handed to the tool with the platform refused: a call the tool
// accepts answers ACTOR_REFUSED, a call it does not understand answers ARGUMENTS_REFUSED.

const LABEL = 'd50e33165-r20-v1', OLABEL = '0f1e2d3c4-r19-v1';
const ART = `/opt/debateai-v3-preview/artifacts/auth-dev-${LABEL}`, OART = `/opt/debateai-v3-preview/artifacts/auth-dev-${OLABEL}`;
const RELS = '/opt/debateai-v3-preview/releases';
const S = '/root/preview-archive/r20-20261022T000000Z';
const VARS: Readonly<Record<string, string>> = Object.freeze({
  LABEL, OLABEL, PREV: '9a8b7c6d5-r18-v1', ART, OART, S, OB: `${S}/online`,
  KEY: ['r18', 'd50e33165a1b'].join('-'), SLOT: 'B', OSLOT: 'A', SVC: 'api',
  E: '/etc/debateai-v3-preview/auth-dev-v1', C: '/etc/debateai-v3-preview/public/Caddyfile',
  CAPI: `${RELS}/auth-dev-candidate-${LABEL}-api`, CUI: `${RELS}/auth-dev-candidate-${LABEL}-ui`, CRUN: `${RELS}/auth-dev-candidate-${LABEL}-runner`,
  OLDA: `${OART}/api-launch.json`, OLDU: `${OART}/ui-launch.json`, OLDR: `${OART}/runner-launch.json`, PLAN: `${ART}/api-launch.json`,
  HB_ON: '{"billing":"on","perRunCeilingMicros":3000000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}',
  YES: 'ab'.repeat(32), GRR: '01'.repeat(32), LIFE: 'yes',
  // Side-by-side spec §13 (Task S18): the switch's settings version, and the settings-activation section's names.
  ACT: '18', V: '19', OLDV: '18', BY: 'Stefan Nour', WHY: 'shorter answers for the test team',
  // Final fix wave S10: the active version SB13 and DR6 read, passed to the switch as --expect-active.
  AVN: '17',
  FROM: '/opt/debateai-v3-preview/artifacts/settings-v18/native-plan-verify.json',
  SART: '/opt/debateai-v3-preview/artifacts/settings-20261023t120000z', VART: '/opt/debateai-v3-preview/artifacts/settings-v19',
  HB: '{"billing":"on","perRunCeilingMicros":2500000,"dailyCeilingMicros":10000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}',
  LINEUP: '/opt/debateai-v3-preview/artifacts/settings-20261023t120000z/line-up.json',
  CC: '{"perDebate":12,"perModelPerDebate":3,"perModelPerRunner":{"default":50}}',
  LG: '{"kind":"LENGTH_GUIDANCE_POLICY"}', SHAPE: 'off',
  // S18 fix round 1: the choices a plan does not take from its base, read from the active version's publish plan.
  DS: 'yes', SEATS: '{"writer":"preview:claude-haiku-5-5","checker":"preview:fixture-b"}', ROT: 'off'
});

type Invocation = Readonly<{ tool: string; script: string; argv: readonly string[]; line: string }>;
const FUNCTIONS: Readonly<Record<string, string>> = Object.freeze({ lc: 'lifecycle', tl: 'lifecycle', pre: 'prestart', rel: 'release-artifacts', cslots: 'caddy-slots' });

function expand(text: string, line: string): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_whole, braced: string | undefined, bare: string | undefined) => {
    const name = (braced ?? bare)!;
    if (!Object.hasOwn(VARS, name)) throw new Error(`no sample value for $${name} in: ${line}`);
    return VARS[name]!;
  });
}

/**
 * The words of one shell command starting at `text` (after the function name), up to `)`, `|`, `;`, `&`, `<`, `>`, a
 * `2>` or an unquoted `#`. "…" expands variables, '…' is literal, and an unquoted `${NAME:+words}` yields two variants
 * (without and with its words), as the shell does for an empty and a set NAME.
 */
function commandWords(text: string, line: string): string[][] {
  let variants: string[][] = [[]];
  let index = 0;
  const push = (words: string[][]) => { variants = variants.flatMap(variant => words.map(extra => [...variant, ...extra])); };
  while (index < text.length) {
    while (text[index] === ' ') index++;
    if (index >= text.length || ')|;&<>#'.includes(text[index]!) || /^[0-9]>/.test(text.slice(index))) break;
    if (text.startsWith('${', index) && /^\$\{[A-Za-z_][A-Za-z0-9_]*:\+/.test(text.slice(index))) {
      const close = text.indexOf('}', text.indexOf(':+', index));
      const inner = text.slice(text.indexOf(':+', index) + 2, close);
      push([[], ...commandWords(inner, line)]);
      index = close + 1;
      continue;
    }
    let word = '';
    while (index < text.length && text[index] !== ' ' && !')|;&<>'.includes(text[index]!)) {
      if (text[index] === '"') { const end = text.indexOf('"', index + 1); word += expand(text.slice(index + 1, end), line); index = end + 1; } else if (text[index] === "'") { const end = text.indexOf("'", index + 1); word += text.slice(index + 1, end); index = end + 1; } else {
        const run = /^[^\s"')|;&<>]+/.exec(text.slice(index))![0];
        word += expand(run, line); index += run.length;
      }
    }
    push([[word]]);
  }
  return variants;
}

function invocations(blocks: readonly Block[] = allBlocks): Invocation[] {
  const found: Invocation[] = [];
  for (const block of blocks) {
    const script = stepOf(block) ?? `block at line ${block.start + 1}`;
    for (const line of block.lines.filter(code)) {
      for (const match of line.matchAll(/(?:^|[\s;&|(`])(lc|tl|pre|rel|cslots) (?=\S)/g)) {
        const name = match[1]!;
        const rest = line.slice(match.index! + match[0].length);
        for (const argv of commandWords(rest, line)) {
          const first = name === 'lc' || name === 'tl' ? argv.shift()! : name;
          found.push(Object.freeze({ tool: FUNCTIONS[name] === 'lifecycle' ? first : FUNCTIONS[name]!, script, argv: Object.freeze(argv), line }));
        }
      }
    }
  }
  return found;
}

const sink = () => { const out: string[] = []; return { out, stream: { write: (chunk: string) => { out.push(String(chunk)); return true; } } }; };
const reasonOf = (lines: string[]) => { try { return JSON.parse(lines.join('').trim().split('\n').at(-1)!).reason as string; } catch { return 'NO_JSON_LINE'; } };

/** The reason the tool gives when the platform is refused; ACTOR_REFUSED means every word passed its parser. */
async function parserReason(call: Invocation): Promise<string> {
  const { stream: stdout } = sink(), err = sink();
  if (call.tool === 'release-artifacts') {
    const tool = await import('../../deploy/' + 'preview-release/v1/release-artifacts.mjs');
    // D5 is merged here: `database-ahead` goes through the tool's own parser like every other command.
    try { tool.parseArguments([...call.argv]); } catch (error) { return (error as { code: string }).code; }
    const slot = call.argv[call.argv.indexOf('--slot') + 1];
    if (call.argv[0] === 'launch-plan' && slot !== 'A' && slot !== 'B') return 'SLOT_REFUSED';
    // D5: the database-ahead file is written under the older release's own name (release-artifacts.mjs refuses any other).
    if (call.argv[0] === 'database-ahead' && !call.argv[call.argv.indexOf('--out') + 1]!.endsWith(`/database-ahead-${OLABEL}.json`)) return 'OUTPUT_PATH_REFUSED';
    return 'ACTOR_REFUSED';
  }
  if (call.tool === 'caddy-slots') {
    const tool = await import('../../deploy/' + 'preview-release/v1/caddy-slots.mjs');
    await tool.main([...call.argv], { actor: { platform: 'darwin' }, stdout, stderr: err.stream });
    return reasonOf(err.out);
  }
  if (call.tool === 'prestart') {
    const tool = await import('../../deploy/' + 'preview-lifecycle/v1/prestart.mjs');
    try { await tool.main([...call.argv], { platform: 'darwin', uid: 0 }); } catch (error) { return (error as { code: string }).code; }
    return 'NOT_REFUSED';
  }
  if (!/^[a-z-]+\.mjs$/.test(call.tool)) return `UNKNOWN_TOOL ${call.tool}`;
  const tool = await import('../../deploy/' + `preview-lifecycle/v1/${call.tool}`);
  await tool.main([...call.argv], { platform: 'darwin', uid: 0, stdout, stderr: err.stream });
  return reasonOf(err.out);
}

describe('the guide\'s commands are the tools\' real command lines (D1-D13)', () => {
  const calls = invocations();

  it('finds the calls of every tool family in the new sections', () => {
    const tools = new Set(calls.map(call => call.tool));
    for (const tool of ['release-artifacts', 'prestart', 'caddy-slots', 'release-switch.mjs', 'release-check.mjs', 'release-env.mjs', 'release-retire.mjs',
      'release-archive.mjs', 'unit-templates.mjs', 'backup.mjs']) expect(tools, tool).toContain(tool);
    expect(calls.length).toBeGreaterThanOrEqual(60);
  });

  it('every call passes the tool\'s own argument parser', async () => {
    const wrong: string[] = [];
    for (const call of calls) {
      const reason = await parserReason(call);
      if (reason !== 'ACTOR_REFUSED') wrong.push(`${call.script}: ${reason}: ${call.line.trim()}`);
    }
    expect(wrong).toEqual([]);
  });

  it('the database-ahead file is made for the older release, installed as its own file and pinned on it before the migrations (D5)', () => {
    const sb5 = scriptOf('SB5').lines.join('\n'), sb8 = scriptOf('SB8').lines;
    expect(sb5).toContain('rel database-ahead --older-source-manifest "$OART/candidate-api-source.json" --newer-source-manifest "$ART/candidate-api-source.json" --out "$ART/database-ahead-$OLABEL.json"');
    const install = sb8.findIndex(line => line.includes('install -o root -g root -m 0644 "$ART/database-ahead-$OLABEL.json" "$E/database-ahead-$OLABEL.json"'));
    const pin = sb8.findIndex(line => line.includes('pre accept-ahead --label "$OLABEL" --from "$E/database-ahead-$OLABEL.json"'));
    const apply = sb8.findIndex(line => line.includes('--operation apply-and-plan'));
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(pin);
    expect(pin).toBeLessThan(apply);
    // The newer manifest the file names is checked before the pin (accept-ahead verifies it: the new release is pinned
    // only in SB10, after the migrations).
    const check = sb8.findIndex(line => line.includes('.newerSourceManifest.sha256') && line.includes('sha256sum "$NM"'));
    expect(check).toBeGreaterThan(install);
    expect(check).toBeLessThan(pin);
    expect(sb8.findIndex(line => line.includes('"api $CAPI $REV 0"'))).toBeLessThan(pin);
    // D5 is in T's commit (the integration branch carries it): one plain line says so, and no step is marked as waiting for it.
    expect(sectionOf(guide, TRANSITION)).toContain("**T's commit must contain D5**");
    expect(newSections).not.toContain('needs D5');
  });

  it('the drained switch must end with nothing in bad before the old release is marked retired, and its way back undoes what the switch armed', () => {
    const dr6 = scriptOf('DR6').lines;
    const sw = dr6.findIndex(line => line.includes('lc release-switch.mjs switch --to "$LABEL" --from "$OLABEL" --old-pair-stopped'));
    const bad = dr6.findIndex(line => line.includes('(.bad | length)') && line.includes('"PREVIEW_RELEASE_SWITCHED $KEY $OKEY 0"'));
    const retired = dr6.findIndex(line => line.includes('lc release-retire.mjs mark-retired --label "$OLABEL"'));
    expect(sw).toBeGreaterThan(-1);
    expect(sw).toBeLessThan(bad);
    expect(bad).toBeLessThan(retired);
    // After SWITCH_OUTCOME_UNKNOWN the finish carries the same flag (WB4 with `drained`).
    expect(dr6.join('\n')).toContain('after SWITCH_OUTCOME_UNKNOWN: WB4 with bash -s -- drained');
    expect(scriptOf('WB4').lines.join('\n')).toContain('lc release-switch.mjs switch --finish --to "$LABEL" --from "$OLABEL" ${DRAINED:+--old-pair-stopped}');
    const rbd = scriptOf('RBD_B').lines;
    const timers = rbd.findIndex(line => line.includes('"debateai-preview-runner-retire@$OLABEL.timer" "debateai-preview-runner-retire-check@$OLABEL.timer"') && line.includes('systemctl disable --now "$TM"'));
    const target = rbd.findIndex(line => line.includes('tar -C "$TGC" -xzf "$S/systemd-before.tgz" debateai-preview.target.d/60-current-release.conf'));
    const reload = rbd.findIndex(line => line === 'systemctl daemon-reload');
    expect(timers).toBeGreaterThan(-1);
    expect(target).toBeGreaterThan(-1);
    expect(Math.max(timers, target)).toBeLessThan(reload);
    // SB1's copy holds the boot target and its drop-in (the debateai-preview-* glob does not match debateai-preview.target).
    expect(scriptOf('SB1').lines.join('\n')).toContain('tar -czf "$S/systemd-before.tgz" debateai-preview-* debateai-preview.target debateai-preview.target.d');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Side-by-side spec §13 (Task S18): settings activation replaces the re-pin and restart. Its section sits before the
// transition (so the step order above is unchanged); its scripts follow the same rules and its calls the same parsers.

const SETTINGS = '## Changing debate settings without an upload (settings activation)';
const SETTINGS_STEPS = Object.freeze(['SV0', 'SV1', 'SV2', 'SV3', 'SV4', 'SV5', 'SV6']);

describe('settings activation: the guide (side-by-side spec §13)', async () => {
  const section = sectionOf(guide, SETTINGS);
  const blocks = blocksOf(section);
  const steps = blocks.filter(block => stepOf(block) !== null);
  const { BASE_NOT_ACTIVE } = await import('../../deploy/' + 'preview-auth-dev/v1/publish-register-base.ts');

  it('sits before the transition, after the hosted-base recipe, and its steps run in order with their own guards', () => {
    expect(guide.indexOf(`\n${SETTINGS}\n`)).toBeGreaterThan(guide.indexOf('### The way back\n'));
    expect(guide.indexOf(`\n${SETTINGS}\n`)).toBeLessThan(guide.indexOf(`\n${TRANSITION}\n`));
    expect(steps.map(stepOf)).toEqual([...SETTINGS_STEPS]);
    for (const block of steps) {
      const step = stepOf(block)!;
      expect(block.lines[0], step).toBe('set -euo pipefail');
      if (step !== 'SV0' && step !== 'SV6') expect(block.lines[1], step).toBe('. /root/preview-archive/settings-names.sh');
      for (const line of block.lines) {
        for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], `${step}: ${line}`).toBe(step);
        if (line.includes('_NOT_DONE')) expect(line, `${step}: ${line}`).toMatch(/exit 1/);
      }
    }
  });

  it('every settings-version.mjs, release-check.mjs and release-artifacts.mjs call passes its tool\'s own parser', async () => {
    const calls = invocations(blocks);
    expect(new Set(calls.map(call => call.tool))).toEqual(new Set(['release-check.mjs', 'settings-version.mjs', 'release-artifacts']));
    const wrong: string[] = [];
    for (const call of calls) {
      const reason = await parserReason(call);
      if (reason !== 'ACTOR_REFUSED') wrong.push(`${call.script}: ${reason}: ${call.line.trim()}`);
    }
    expect(wrong).toEqual([]);
    const lines = blocks.flatMap(block => block.lines);
    for (const command of ['lc settings-version.mjs check "$LABEL" "$V"', 'lc settings-version.mjs activate "$V" --by "$BY" --reason "$WHY"',
      'lc settings-version.mjs activate "$OLDV" --by "$BY" --reason "$WHY"', 'lc settings-version.mjs status']) {
      expect(lines.some(line => line.includes(command)), command).toBe(true);
    }
  });

  it('plans from the active version, puts the verify plan back at once, and keeps each published version\'s verify plan', () => {
    const sv0 = steps.find(block => stepOf(block) === 'SV0')!.lines.join('\n');
    expect(sv0).toContain("jq -r '.effectiveActive // empty'");
    expect(sv0).toContain('FROM=/opt/debateai-v3-preview/artifacts/settings-v$AV/native-plan-verify.json');
    for (const step of ['SV1', 'SV2']) {
      const lines = steps.find(block => stepOf(block) === step)!.lines;
      const nat = lines.findIndex(line => line.startsWith('OUT=$(nat '));
      // The very next line puts the release's own verify plan back, before the result is even read.
      expect(lines[nat + 1], step).toMatch(/^put "\$S\/native-plan\.before\.json" \|\| /);
    }
    const sv2 = steps.find(block => stepOf(block) === 'SV2')!.lines.join('\n');
    expect(sv2).toContain('VART=/opt/debateai-v3-preview/artifacts/settings-v$V');
    expect(sv2).toContain('--out "$VART/native-plan-verify.json"');
    expect(section).toContain(BASE_NOT_ACTIVE);
  });

  it('names the owner\'s fresh yes, what cannot change by activation, and every settings journal line', () => {
    expect(section).toMatch(/fresh in\s+the live chat/);
    // Prose may wrap anywhere: the owner's words are read with the line breaks folded.
    const prose = section.replace(/\s+/g, ' ');
    expect(prose).toContain('A settings-only change of a site rule (logins, rate limits, countries, plan prices, the daily budget, funding) is refused and needs an upload.');
    expect(prose).toContain('already carries the call-concurrency row, so the per-debate lane limits can change by activation');
    for (const line of ['DEBATEAI_SETTINGS_CHECK', 'DEBATEAI_SETTINGS_VERDICT', 'DEBATEAI_SETTINGS_ACTIVATED', 'DEBATEAI_RUNNER_SETTINGS {',
      '{"kind":"DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED","version"', '{"kind":"DEBATEAI_RUNNER_SETTINGS_UNSUPPORTED","runId"', 'ADMISSION_SETTINGS_UNSUPPORTED',
      'ADMISSION_ESTIMATOR_FALLBACK', 'ADMISSION_SETTINGS_NOT_PASSED', 'SETTINGS_GATE_UNANSWERED', '--seatable-env']) expect(section, line).toContain(line);
    // The line-up file: root 0644 under umask 022, printed by the release's own checker into the artifacts folder.
    expect(section).toContain('( umask 022; cd "$CAPI/dialectical-engine" && ');
    expect(section).toContain('tools/preview-practice/check-thinking-levels.ts --print-line-up --settings "$E/api-$LABEL.env" > "$TMP" )');
    expect(section).toContain('TMP=$SART/line-up.json.printing');
    // The line-up task (SA11) appends to this section: the examples, the T+1 env migration and the providers page.
    for (const heading of ['### The line-up, the thinking levels and the answer seats (side-by-side spec §13 addition)',
      '### The first upload with this change (T+1)', '### The providers page']) expect(section.split('\n'), heading).toContain(heading);
  });

  it('the line-up and thinking changes are activations; T+1 moves the line-up out of the env (SA11, addition D15, D23, D24)', () => {
    const prose = section.replace(/\s+/g, ' ');
    // The two plan members, the reviewed menus, and the order for a model the gate has not switched on yet.
    for (const text of ['`lineUp`: exactly `free_model_ids`, `premium_model_ids` and `thinking_levels`', '`answerSeats`: `writer` and `checker`',
      'GLM `high`, `low`; DeepSeek `high`, `low`, `none`; Qwen `default`, `low`, `medium`, `none`; MiMo `default`, `none`; Claude Haiku `high`, `medium`, `low`.',
      'Root switches it on at its spending gate', 'This stays root\'s step, and it comes first.']) expect(prose, text).toContain(text);
    const t1 = sectionOf(guide, '### The first upload with this change (T+1)');
    const t1Blocks = blocksOf(t1);
    // Step 1, before SB3: today's line-up printed by the new release's checker from the OLD release's API env file.
    expect(t1Blocks[0]!.lines.join('\n')).toContain('tools/preview-practice/check-thinking-levels.ts --print-line-up --settings "$E/api-$OLABEL.env" > "$TMP" )');
    expect(t1Blocks[0]!.lines).toContain('mv "$TMP" "$ART/line-up.json"');
    // Step 2: SB3 takes it (and only then: empty by default).
    const sb3 = scriptOf('SB3').lines;
    expect(sb3).toContain('LINEUP=\'\'                                                 # the first upload with the line-up row (T+1) only: "$ART/line-up.json"; else empty');
    expect(sb3.find(line => line.startsWith('rel native-plan --operation plan --from "$FROM" '))).toContain('--hosted-billing "$HB" ${LINEUP:+--line-up "$LINEUP"} --out');
    // Step 3, after SB5: the new release's two env files keep only the gate part, checked, and no other line changes.
    const sockets = t1Blocks[1]!.lines.join('\n');
    expect(sockets).toContain('jq -ce \'{budget_socket, deployment, requested_thinking_level, scope_id} + (if has("anthropic_budget_socket") then {anthropic_budget_socket} else {} end)');
    expect(sockets).toContain('diff <(grep -v "^$K=" "$D") <(grep -v "^$K=" "$F.sockets") > /dev/null');
    expect(sockets).toContain("grep -q 'No line-up in this setting'");
    expect(prose).toContain('PREVIEW_LINE_UP_ENV_CONFLICT');
    // Step 4, before SB11: both halves check the new release's own site version.
    expect(t1Blocks[2]!.lines).toContain('RC=0; OUT=$(lc settings-version.mjs check "$LABEL" "$V" 2>&1) || RC=$?');
    // None of these blocks is a step of its own (the settings steps stay SV0-SV6, the upload's stay as STEPS).
    for (const block of t1Blocks) expect(stepOf(block)).toBeNull();
    // The providers page: automatic, one release later to drop a company, a manual notice before adding one.
    const providers = sectionOf(guide, '### The providers page').replace(/\s+/g, ' ');
    for (const text of ['A line-up or model change never needs a website upload.', 'Adding a company is an upload', 'Advance notice first (manual).',
      'A company leaves the targets one release later.', 'now only sets the new-debate page\'s fallback list']) expect(providers, text).toContain(text);
  });

  it('the switch activates the new release\'s own site version (SB13, DR6), and the old re-pin sections point to the activation', () => {
    for (const step of ['SB13', 'DR6']) {
      const lines = scriptOf(step).lines;
      const act = lines.indexOf(lines.find(line => line.startsWith('ACT=${KEY%%-*}; ACT=${ACT#r}'))!);
      const sw = lines.findIndex(line => line.includes('lc release-switch.mjs switch --to "$LABEL" --from "$OLABEL"'));
      expect(act, step).toBeGreaterThan(-1);
      expect(sw, step).toBeGreaterThan(act);
      // Final fix wave S10: the switch also refuses if the active version moved after the step's own read (AVN).
      expect(lines[sw], step).toContain('--activate "$ACT" --expect-active "$AVN" 2>&1) || SC=$?');
    }
    const kitV2 = sectionOf(guide, '## Publishing a new register version on the preview (publish kit v2)');
    expect(kitV2.indexOf('steps 5 and 6 are not how a settings change')).toBeLessThan(kitV2.indexOf('5. **Point both environment files at the new version.**'));
    const b5 = sectionOf(guide, '### B5. The two env edits');
    expect(b5.indexOf('B5 to B7 are not how a settings change')).toBeLessThan(b5.indexOf('```sh'));
    expect(sectionOf(guide, WAY_BACK)).toContain('**The settings each way back activates (side-by-side spec §11, §13).**');
  });

  it('an upload follows the active version: SB1 records it, SB3 plans from it, SB9 and DR5 publish only on it (ruling R69 fix round)', () => {
    const sb1 = scriptOf('SB1').lines;
    const activev = sb1.find(line => line.startsWith('activev() { '))!;
    expect(activev).toContain('if [ -f "$L/settings-version.mjs" ] && [ -f "$OCAPI/dialectical-engine/tools/settings-version/cli.ts" ]; then lc settings-version.mjs status');
    expect(activev).toContain('else printf \'%s\\n\' "${o#r}"; fi; }');
    expect(sb1.findIndex(line => line.startsWith('activev > "$S/active-before" || '))).toBeGreaterThan(sb1.indexOf('. "$NAMES"'));
    const sb3 = scriptOf('SB3').lines;
    const from = sb3.findIndex(line => line.startsWith('if [ "$AV" = "$OSITE" ]; then FROM=$S/native-plan.before.json; CP=$OART/native-plan-publish.json; else FROM=/opt/debateai-v3-preview/artifacts/settings-v$AV/native-plan-verify.json;'));
    const plan = sb3.findIndex(line => line.startsWith('rel native-plan --operation plan --from "$FROM" '));
    expect(from).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(from);
    expect(sb3[plan]).toContain('${DS:+--checker deepseek --deepseek-enabled-on-gate yes} ${SEATS:+--answer-seats "$SEATS"} ${ROT:+--role-rotation "$ROT"} --hosted-billing "$HB"');
    expect(sb3).toContain('HB=$(jq -c .hostedBilling "$FROM")');
    expect(sb3.join('\n')).toContain('[ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$AV" ] && cmp -s "$S/native-plan.before.json" "$ONP"');
    expect(scriptOf('SB9').lines.join('\n')).toContain('[ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$AV" ]');
    expect(scriptOf('SB9').lines.join('\n')).toContain('PREVIEW_REGISTER_BASE_NOT_ACTIVE');
    expect(scriptOf('DR5').lines.join('\n')).toContain('[ "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" = "$(cat "$S/active-before")" ]');
    // REG0 still names the key and guards that nothing was published meanwhile.
    expect(scriptOf('SB9').lines.join('\n')).toContain('the newest register is not $REG0');
  });

  it('SB13 and DR6 stop when settings were activated since SB3, before the switch (ruling R70)', () => {
    for (const step of ['SB13', 'DR6']) {
      const lines = scriptOf(step).lines;
      const read = lines.findIndex(line => line.startsWith('AVN=$(activev) || '));
      const guard = lines.findIndex(line => line.startsWith('[ "$AVN" = "$(cat "$S/active-before")" ] && [ "$AVN" = "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" ] || '));
      const sw = lines.findIndex(line => line.includes('lc release-switch.mjs switch --to "$LABEL" --from "$OLABEL"'));
      expect(read, step).toBeGreaterThan(-1);
      expect(guard, step).toBe(read + 1);
      expect(lines[guard], step).toContain(`${step}_NOT_DONE: settings were activated since SB3`);
      expect(sw, step).toBeGreaterThan(guard);
    }
    expect(section.replace(/\s+/g, ' ')).toContain('Never activate while an upload is between its SB3 and its SB13');
  });

  it('final fix wave S7: the drained path reads the active version before DR2 starts the downtime; DR6\'s guard names the downtime and rbD-B', () => {
    const dr2 = scriptOf('DR2').lines;
    const read = dr2.findIndex(line => line.startsWith('AVN=$(activev) || '));
    const guard = dr2.findIndex(line => line.startsWith('[ "$AVN" = "$(cat "$S/active-before")" ] && [ "$AVN" = "$(jq -r .baseRegisterVersion "$ART/register-proposal.json")" ] || '));
    const downtime = dr2.findIndex(line => line.startsWith('date -u +%s >> "$S/downtime-start-epoch"'));
    expect(read).toBeGreaterThan(-1);
    expect(guard).toBe(read + 1);
    expect(guard).toBeLessThan(downtime);
    expect(dr2[guard]).toContain('DR2_NOT_DONE: settings were activated since SB3 (active $AVN; nothing was stopped)');
    const dr6 = scriptOf('DR6').lines;
    const dr6Guard = dr6.find(line => line.startsWith('[ "$AVN" = "$(cat "$S/active-before")" ] && '))!;
    expect(dr6Guard).toContain('the site is DOWN since DR2');
    expect(dr6Guard).toContain('rbD-B');
  });

  it('SV1 keeps the active version\'s hosted inputs and choices; SV2 keeps the publish plan; the line-up draft never blocks a re-run', () => {
    const sv1 = steps.find(block => stepOf(block) === 'SV1')!.lines;
    expect(sv1).toContain('HB=$(jq -c .hostedBilling "$FROM")                         # the active version\'s hosted inputs; only perRunCeilingMicros may change');
    expect(sv1.join('\n')).toContain('.hostedBilling | {billing,dailyCeilingMicros,askRoomReads}');
    expect(sv1.find(line => line.startsWith('rel native-plan --operation plan --from "$FROM" '))).toContain('${DS:+--checker deepseek --deepseek-enabled-on-gate yes} ${SEATS:+--answer-seats "$SEATS"} ${ROT:+--role-rotation "$ROT"}');
    // Final fix wave S7: each install line of SV2 carries its own SV2_NOT_DONE marker.
    const sv2 = steps.find(block => stepOf(block) === 'SV2')!.lines;
    const copy = sv2.find(line => line.startsWith('install -o root -g root -m 0644 "$SART/native-plan-publish.json" "$VART/native-plan-publish.json" || '));
    expect(copy).toContain('SV2_NOT_DONE: ');
    expect(sv2.find(line => line.startsWith('install -d -o root -g root -m 0755 "$VART" || '))).toContain('SV2_NOT_DONE: ');
    const lineUp = blocks.find(block => block.lines.some(line => line.includes('--print-line-up')))!.lines;
    expect(lineUp.find(line => line.includes('--print-line-up'))).toContain('> "$TMP" )');
    expect(lineUp.at(-2)).toBe('mv "$TMP" "$SART/line-up.json"');
  });

  it('final fix wave: the guide says what F2, F7, F8, S15 and S16 changed, in plain words', () => {
    const prose = section.replace(/\s+/g, ' ');
    // F2d (ruling R77): re-checking the active version can only record PASS; how to recover when new debates wait.
    const sv3 = sectionOf(guide, '### SV3. The check (the dry boot) and its verdict').replace(/\s+/g, ' ');
    expect(sv3).toContain('Re-checking the active version can only record PASS.');
    expect(sv3).toContain('SETTINGS_VERDICT_ACTIVE_PAIR');
    const uploads = sectionOf(guide, '### Settings and uploads').replace(/\s+/g, ' ');
    expect(uploads).toContain('**If new debates wait ("switching") and do not start.**');
    expect(uploads).toContain('activate a passed version');
    expect(prose).toContain('ADMISSION_ACTIVE_VERSION_UNAVAILABLE');
    // F7 (ruling R78): the rollback's order, in both places that describe it.
    for (const text of [uploads, sectionOf(guide, WAY_BACK).replace(/\s+/g, ' ')]) {
      expect(text).toContain('keeps the active version when');
      expect(text).toContain('never a version it only checked');
    }
    // F8 (ruling R80): the switch's live gate check also covers the new release's own site version.
    expect(uploads).toContain('whenever the version the switch activates differs from the active one');
    // S15: two API processes may disagree for about a second.
    expect(prose).toContain('for about a second after an activation two processes may disagree on the active version');
    // S16 (ruling R28, built in this wave): the storyteller as its own story checker is refused, seats left out included.
    expect(prose).toContain('answer-seats-storyteller-is-story-checker');
    expect(prose).toContain('counting a seat left out as the seat it follows');
  });
});
