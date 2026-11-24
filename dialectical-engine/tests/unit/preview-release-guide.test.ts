// Side-by-side spec §12 and "The transition": the preview release guide (deploy/preview-release/v1/README.md) is what the
// operator runs on the live preview server, so its new sections are checked as code here. Each step is one fenced `sh`
// script: `set -euo pipefail`, the release's names file, guards that stop with `<STEP>_NOT_DONE` and `exit 1`, and
// `<STEP>_DONE` as the last line. Every call of a release tool in those sections is handed to that tool's own argument
// parser (with the platform refused, so nothing runs): a flag or a subcommand the tool does not know fails here, not on
// the server. Only the new sections are read; the R19 recipe above them stays as it ran.
import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  'SB1', 'SB1B', 'SB3', 'SB3B', 'SB3C', 'SB4', 'SB5', 'SB5B', 'SB5C', 'SB5D', 'SB7', 'SB8', 'SB9', 'SB10', 'SB11', 'SB12', 'SB13', 'SB13B', 'LOGOCHECK', 'SB14', 'SB14B', 'SB15',
  'WB1', 'WB2', 'WB3', 'WB4', 'DR1', 'PRECHECK', 'DR2', 'DR3', 'DBBACK', 'DR4', 'DR4AGAIN', 'SWAP', 'DR5', 'DR5RESUME', 'DR6', 'DR6TAIL',
  'AFTERDR6', 'LATELINES', 'DR6AGAIN', 'RBD_A', 'RBD_B', 'AGAINSAME', 'MT1', 'MT2', 'PM1', 'PM2'
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

  it('R21: SB4 and SB7 refuse, before anything is written, when the postgres administrator cannot reach the hatchet database; TA0 prints it', () => {
    const admin = `runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d hatchet -XAt -c 'SELECT 1' >/dev/null`;
    const fix = "'local postgres,debateai postgres peer map=preview_root' becomes 'local postgres,debateai,hatchet postgres peer map=preview_root'";
    for (const step of ['SB4', 'SB7']) {
      const lines = scriptOf(step).lines;
      const count = lines.findIndex(line => line.startsWith('HC=$(psqlq "SELECT count(*) FROM pg_database WHERE datname = \'hatchet\'")') && line.includes(`${step}_NOT_DONE`));
      const check = lines.findIndex(line => line.startsWith(`if [ "$HC" = 1 ]; then ${admin} || { echo "${step}_NOT_DONE: the postgres administrator cannot connect to the hatchet database`));
      // The count, then the check on the next line (after the names line and the step's own settings).
      expect(count, step).toBeGreaterThan(1);
      expect(check, step).toBe(count + 1);
      // The refusal names the pg_hba change R21 made, and the owner's yes it needs.
      expect(lines[check], step).toContain(fix);
      expect(lines[check], step).toContain('pg_hba_file_rules');
      expect(lines[check], step).toContain("the owner's yes first");
    }
    // SB7 checks before it makes its folder; SB4 before the release check.
    const sb7 = scriptOf('SB7').lines;
    expect(sb7.findIndex(line => line.startsWith('if [ "$HC" = 1 ]'))).toBeLessThan(sb7.indexOf('install -d -o root -g root -m 0700 "$OB"'));
    const sb4 = scriptOf('SB4').lines;
    expect(sb4.findIndex(line => line.startsWith('if [ "$HC" = 1 ]'))).toBeLessThan(sb4.findIndex(line => line.includes('lc release-check.mjs check')));
    // TA0 (read-only) prints whether the administrator gets in, right after where Hatchet's database lives.
    const ta0 = scriptOf('TA0').lines;
    const where = ta0.findIndex(line => line.includes('HATCHET_DATABASE_IN_THIS_CLUSTER yes'));
    expect(ta0[where + 1]).toBe(`if grep -qx hatchet "$P/pg-databases"; then if ${admin} 2>&1; then echo "HATCHET_DATABASE_ADMIN_CONNECT yes"; else echo "HATCHET_DATABASE_ADMIN_CONNECT no"; fi; fi`);
    expect(sectionOf(guide, '### TA0. Preflight and captures').replace(/\s+/g, ' ')).toContain('`HATCHET_DATABASE_ADMIN_CONNECT no` means');
    // SB7 records what R21 needed: both server fixes, and that the tool now takes the empty postgres database.
    const sb7Section = sectionOf(guide, '### SB7. The online backup').replace(/\s+/g, ' ');
    expect(sb7Section).toContain('**What R21 needed (23 October 2026).**');
    expect(sb7Section).toContain('`local postgres,debateai,hatchet postgres peer map=preview_root`');
    expect(sb7Section).toContain('COMMENT ON SCHEMA public');
    expect(sb7Section).toContain('`listingValid`');
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
    // DR2's look for a running system upgrade is the one other pgrep, in the same bracket form, and it names the upgrade
    // program's own path, so the always-running shutdown helper (/usr/share/unattended-upgrades/...) does not match.
    const upgrade = scriptOf('DR2').lines.find(line => line.includes('pgrep'))!;
    expect(upgrade).toBe("! pgrep -f '[/]usr/bin/unattended-upgrade' > /dev/null || { echo \"DR2_NOT_DONE: an unattended upgrade of the system runs now (nothing was stopped): wait until it has finished, then DR2 again\"; exit 1; }");
    const upgradePattern = new RegExp(/'([^']+)'/.exec(upgrade)![1]!);
    expect(upgradePattern.test('/usr/bin/python3 /usr/bin/unattended-upgrade')).toBe(true);
    expect(upgradePattern.test('/usr/bin/python3 /usr/share/unattended-upgrades/unattended-upgrade-shutdown --wait-for-signal')).toBe(false);
    expect(upgradePattern.test(`bash -c ${upgrade}`)).toBe(false);
    expect(lines.filter(line => line !== upgrade)).toEqual(["pgrep -f '[r]elease-switch.mjs' || mv /etc/debateai-v3-preview/lifecycle/release-switch.lock \"/root/preview-archive/release-switch.lock.stale-$(date -u +%Y%m%dT%H%M%SZ)\""]);
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

  it('SB5d adds NETOPIA\'s logo id only to a release whose website knows it, before its launch plans, in the id\'s form', () => {
    const sb5d = scriptOf('SB5D').lines;
    expect(sideBySide.indexOf('\n### SB5d. ')).toBeGreaterThan(sideBySide.indexOf('\n### SB5c. '));
    expect(sideBySide.indexOf('\n### SB5d. ')).toBeLessThan(sideBySide.indexOf('\n### SB6. '));
    const at = (needle: string) => { const found = sb5d.findIndex(line => line.includes(needle) && line.includes('SB5D_NOT_DONE')); expect(found, needle).toBeGreaterThan(-1); return found; };
    // The website of a release starts from its own UI folder: that folder's environment.mjs must admit the setting.
    const knows = at('grep -q "\'NETOPIA_LOGO_ID\'" "$CUI/dialectical-engine/deploy/preview-auth-dev/v1/environment.mjs"');
    expect(read('deploy/preview-auth-dev/v1/environment.mjs')).toContain("'NETOPIA_LOGO_ID'");
    const plans = at('[ ! -e "$ART/ui-launch.json" ]');
    const form = at("grep -qxE '[0-9]{1,12}'");
    const before = at('[ ! -e "$S/ui-$LABEL.env.before-logo" ]');
    const edit = sb5d.findIndex(line => line.startsWith('cp -p "$U" "$S/ui-$LABEL.env.before-logo"'));
    const moved = sb5d.findIndex(line => line.startsWith('mv "$U.new" "$U"'));
    const same = sb5d.findIndex(line => line.startsWith('lc release-env.mjs same --labels "$OLABEL,$LABEL" --slots "$OSLOT,$SLOT" ||'));
    for (const guard of [knows, plans, form, before]) expect(guard).toBeLessThan(edit);
    expect(edit).toBeLessThan(moved);
    expect(moved).toBeLessThan(same);
    // Only the new release's own ui file: never the live one an older release reads.
    for (const line of sb5d.filter(code)) expect(line, line).not.toMatch(/\$E\/ui\.env\b/);
    // The id's form, run by bash: what the website and the test site's check (UI_NETOPIA_LOGO_ID) accept, and nothing else.
    const id = (value: string) => {
      try { return execFileSync('bash', ['-c', ['set -euo pipefail', `ID='${value}'`, sb5d[form], 'echo ID_OK'].join('\n')], { encoding: 'utf8' }).trim(); } catch (error) { return String((error as { stdout?: string }).stdout ?? '').trim(); }
    };
    for (const good of ['1', '123456', '000000000001']) expect(id(good), good).toBe('ID_OK');
    for (const bad of ['', '12a', '1234567890123', ' 1', '1 ', '-1', '１２']) expect(id(bad), bad).toMatch(/^SB5D_NOT_DONE: /);
    // The drained path edits after DR1; the marks' steps are skipped while the logo id is set.
    expect(drained.replace(/\s+/g, ' ')).toContain("To set or change NETOPIA's logo id on this path, run SB5d right after DR1.");
    expect(sectionOf(guide, PAYMENT_MARKS).replace(/\s+/g, ' ')).toContain('With it, PM1, SB5b, MT1, PM2 and MT2 are not needed.');
    expect(sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB5b. '))!).replace(/\s+/g, ' '))
      .toContain('With NETOPIA\'s logo id set (SB5d), the website draws none of these marks: skip this step.');
    const table = sideBySide.split('\n');
    expect(table.findIndex(line => line.startsWith('| SB5d |'))).toBe(table.findIndex(line => line.startsWith('| SB5c |')) + 1);
  });

  it('LOGOCHECK only reads, after SB13b: the ui file\'s line, the page\'s policy, each theme\'s logo once while billing is on, NETOPIA\'s two answers', async () => {
    const check = scriptOf('LOGOCHECK').lines;
    expect(sideBySide.indexOf('\n### LOGOCHECK. ')).toBeGreaterThan(sideBySide.indexOf('\n### SB13b. '));
    expect(sideBySide.indexOf('\n### LOGOCHECK. ')).toBeLessThan(sideBySide.indexOf('\n### SB13c. '));
    const table = sideBySide.split('\n');
    expect(table.findIndex(line => line.startsWith('| LOGOCHECK |'))).toBe(table.findIndex(line => line.startsWith('| SB13b |')) + 1);
    expect(drained.replace(/\s+/g, ' ')).toContain('Then SB13b (the team member\'s test debate), LOGOCHECK when this upload ran SB5d, and, later, SB15 as usual.');
    // It changes nothing: no file is written, moved or copied, no service or tool runs.
    for (const line of check.filter(code)) {
      expect(line, line).not.toMatch(/(^|[\s;&|(])(cp|mv|install|chown|chmod|systemctl|lc|rel|pre|cslots|tee)\s/);
      expect(line.replace(/2?>\s*\/dev\/null/g, ''), line).not.toMatch(/[^<2&]>{1,2}\s*["$\/\w]/);
    }
    // The address it looks for is the website's own (paymentMarks.ts netopiaLogoAddress), and the policy line is the CSP's.
    const { netopiaLogoAddress, netopiaLogoOnDark } = await import('../../apps/ui/lib/billing/paymentMarks.js');
    expect(check).toContain('LOGO="https://mny.ro/np-black-0.svg?id=$ID"');
    expect(netopiaLogoAddress({ NETOPIA_LOGO_ID: '42' })).toBe('https://mny.ro/np-black-0.svg?id=42');
    // The dark theme's picture is the website's own swap of the light one (SiteFooter.tsx draws both).
    expect(check).toContain('DARK=${LOGO/np-black-0/np-white-0}');
    expect(netopiaLogoOnDark(netopiaLogoAddress({ NETOPIA_LOGO_ID: '42' })!)).toBe('https://mny.ro/np-white-0.svg?id=42');
    expect(check).toContain('for A in "$LOGO" "$DARK"; do');
    const { FALLBACK_CONTENT_SECURITY_POLICY } = await import('../../apps/ui/' + 'content-security-policy.mjs') as { FALLBACK_CONTENT_SECURITY_POLICY: string };
    expect(check.join('\n')).toContain('grep -qF "img-src \'self\' data: https://mny.ro;" <<<"$P"');
    expect(FALLBACK_CONTENT_SECURITY_POLICY).toContain("img-src 'self' data: https://mny.ro;");
    // Billing is read from the home page's own /pricing link, which shows only while billing is on.
    expect(check).toContain('if grep -qF \'href="/pricing"\' <<<"$H"; then');
    // The home page and NETOPIA's answer, run by bash with curl answered from files: what passes and what stops.
    const dir = mkdtempSync(join(tmpdir(), 'guide-logocheck-'));
    try {
      writeFileSync(join(dir, 'headers.txt'), "HTTP/1.1 200 OK\r\ncontent-security-policy: default-src 'self'; img-src 'self' data: https://mny.ro; font-src 'self'\r\n\r\n");
      const run = (home: string, answer: string, ui = 'PORT=3200\nNETOPIA_LOGO_ID=42\n', dark = answer) => {
        writeFileSync(join(dir, 'ui-rX.env'), ui);
        writeFileSync(join(dir, 'home.html'), home);
        writeFileSync(join(dir, 'answer.txt'), answer);
        writeFileSync(join(dir, 'dark.txt'), dark);
        // curl answered from files: each picture's headers (-sI), the home page's headers (-D -), or the home page.
        const curl = `curl() { case "$*" in *-sI*np-white-0*) cat '${dir}/dark.txt';; *-sI*) cat '${dir}/answer.txt';; *-D*) cat '${dir}/headers.txt';; *) cat '${dir}/home.html';; esac; }`;
        const body = check.slice(2).filter(line => !line.startsWith('ID='));
        try { return execFileSync('bash', ['-c', ['set -euo pipefail', `E='${dir}'; LABEL=rX; UIP=3200; ID='42'`, curl, ...body].join('\n')], { encoding: 'utf8' }).trim().split('\n').at(-1); } catch (error) { return String((error as { stdout?: string }).stdout ?? '').trim().split('\n').at(-1); }
      };
      const OK = 'HTTP/2 200\r\ncontent-type: image/svg+xml\r\ncontent-length: 8592\r\ncache-control: public, max-age=3600\r\n\r\n';
      const light = '<img src="https://mny.ro/np-black-0.svg?id=42" alt="NETOPIA Payments, Visa, Mastercard"/>';
      const logo = `${light}<img src="https://mny.ro/np-white-0.svg?id=42" alt="NETOPIA Payments, Visa, Mastercard"/>`;
      expect(run(`<a href="/pricing">Pricing</a>${logo}`, OK)).toBe('LOGOCHECK_DONE');
      // The dark theme's picture missing from the page, or NETOPIA answering it badly, stops it too.
      expect(run(`<a href="/pricing">Pricing</a>${light}`, OK)).toMatch(/^LOGOCHECK_NOT_DONE: billing is on but the home page does not show the logo exactly once/);
      expect(run(`<a href="/pricing">Pricing</a>${logo}`, OK, undefined, 'HTTP/2 404\r\ncontent-type: text/html\r\n\r\n')).toMatch(/^LOGOCHECK_NOT_DONE: NETOPIA's server did not answer 200 with an SVG for https:\/\/mny\.ro\/np-white-0\.svg\?id=42/);
      expect(run(`<a href="/pricing">Pricing</a>${logo}`, OK, undefined, `${OK.trimEnd()}\r\nlocation: https://example.invalid/\r\n\r\n`)).toMatch(/^LOGOCHECK_NOT_DONE: NETOPIA's server set a cookie or redirected for https:\/\/mny\.ro\/np-white-0/);
      // Billing off: no logo is expected, and the check still ends.
      expect(run('<a href="/legal">Legal</a>', OK)).toBe('LOGOCHECK_DONE');
      expect(run('<a href="/pricing">Pricing</a>', OK)).toMatch(/^LOGOCHECK_NOT_DONE: billing is on but the home page does not show the logo exactly once/);
      expect(run(`<a href="/pricing">Pricing</a>${logo}<img src="/payment-marks/visa.svg"/>`, OK)).toMatch(/^LOGOCHECK_NOT_DONE: the home page still draws the old mark files/);
      expect(run(`<a href="/pricing">Pricing</a>${logo}`, 'HTTP/2 404\r\ncontent-type: text/html\r\n\r\n')).toMatch(/^LOGOCHECK_NOT_DONE: NETOPIA's server did not answer 200 with an SVG/);
      expect(run(`<a href="/pricing">Pricing</a>${logo}`, `${OK.trimEnd()}\r\nset-cookie: a=b\r\n\r\n`)).toMatch(/^LOGOCHECK_NOT_DONE: NETOPIA's server set a cookie or redirected/);
      expect(run(`<a href="/pricing">Pricing</a>${logo}`, OK, 'PORT=3200\n')).toMatch(/^LOGOCHECK_NOT_DONE: ui-rX\.env does not hold the line/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('SB5c adds the proof lines only to a release that knows them, before its launch plans, with matching copies', () => {
    const sb5c = scriptOf('SB5C').lines;
    expect(sideBySide.indexOf('\n### SB5c. ')).toBeGreaterThan(sideBySide.indexOf('\n### SB5b. '));
    expect(sideBySide.indexOf('\n### SB5c. ')).toBeLessThan(sideBySide.indexOf('\n### SB6. '));
    const at = (needle: string) => { const found = sb5c.findIndex(line => line.includes(needle) && line.includes('SB5C_NOT_DONE')); expect(found, needle).toBeGreaterThan(-1); return found; };
    // Each release starts its website from its own UI folder and its API from its own API folder: both must know the key.
    const uiKnows = at('grep -q "\'DIALECTICAL_UI_API_PROOF_PATH\'" "$CUI/dialectical-engine/deploy/preview-auth-dev/v1/environment.mjs"');
    expect(read('deploy/preview-auth-dev/v1/environment.mjs')).toContain("'DIALECTICAL_UI_API_PROOF_PATH'");
    const apiKnows = at('grep -q \'UI_API_PROOF_PATH: z\\.\' "$CAPI/dialectical-engine/packages/register/src/runtime-environment.ts"');
    expect(read('packages/register/src/runtime-environment.ts')).toContain('UI_API_PROOF_PATH: z.');
    const apiPlan = at('[ ! -e "$ART/api-launch.json" ]');
    const uiPlan = at('[ ! -e "$ART/ui-launch.json" ]');
    const users = at('[ -n "$AU" ] && [ "$AU" != root ] && [ -n "$AGRP" ] && [ -n "$UU" ] && [ "$UU" != root ] && [ "$AU" != "$UU" ]');
    const copies = at('cmp -s "$PRF/ui.secret" "$PRF/api/proof.secret"');
    const edit = sb5c.findIndex(line => line.startsWith('cp -p '));
    const moved = sb5c.map((line, index) => line.startsWith('mv "$F.new" "$F"') ? index : -1).filter(index => index >= 0);
    const same = sb5c.findIndex(line => line.startsWith('lc release-env.mjs same --labels "$OLABEL,$LABEL" --slots "$OSLOT,$SLOT" ||'));
    for (const guard of [uiKnows, apiKnows, apiPlan, uiPlan, users, copies]) expect(guard).toBeLessThan(edit);
    expect(moved.length).toBeGreaterThan(0);
    for (const index of moved) { expect(edit).toBeLessThan(index); expect(index).toBeLessThan(same); }
    // Only the new release's own files: never the live ones an older release reads.
    for (const line of sb5c.filter(code)) expect(line, line).not.toMatch(/\$E\/(api|ui)\.env\b/);
    // The users come from the instances (TB5 moved the fixed units aside); AU and AGRP are the names file's.
    expect(sb5c).toContain('UU=$(systemctl show -p User --value "debateai-preview-ui@$OLABEL")');
    expect(sb5c.filter(code).some(line => /(^|[\s;])(AU|AGRP)=/.test(line))).toBe(false);
    for (const line of sb5c.filter(code)) expect(line, line).not.toMatch(/debateai-preview-(api|ui)(?!@)/);
    // The proof folder has its own name; the names file's PD (the DeepInfra authority) is left alone.
    expect(sb5c.some(line => line.startsWith('PRF='))).toBe(true);
    expect(sb5c.filter(code).some(line => /(^|[\s;])PD=/.test(line))).toBe(false);
    const redirect = sb5c.find(line => line.includes('> "$PRF/ui.secret.new"'));
    expect(redirect).toBeDefined();
    expect(redirect).toMatch(/\bset -C\b/);
    expect(drained).toContain('run SB5c right after DR1');
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
  HB_ON: '{"billing":"on","perRunCeilingMicros":3300000,"dailyCeilingMicros":11000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}',
  YES: 'ab'.repeat(32), GRR: '01'.repeat(32), LIFE: 'yes',
  // Side-by-side spec §13 (Task S18): the switch's settings version, and the settings-activation section's names.
  ACT: '18', V: '19', OLDV: '18', BY: 'Stefan Nour', WHY: 'shorter answers for the test team',
  // Final fix wave S10: the active version SB13 and DR6 read, passed to the switch as --expect-active.
  AVN: '17',
  FROM: '/opt/debateai-v3-preview/artifacts/settings-v18/native-plan-verify.json',
  SART: '/opt/debateai-v3-preview/artifacts/settings-20261023t120000z', VART: '/opt/debateai-v3-preview/artifacts/settings-v19',
  HB: '{"billing":"on","perRunCeilingMicros":2200000,"dailyCeilingMicros":11000000,"askRoomReads":{"limit":60,"windowMs":60000,"capacity":65536}}',
  LINEUP: '/opt/debateai-v3-preview/artifacts/settings-20261023t120000z/line-up.json',
  CC: '{"perDebate":12,"perModelPerDebate":3,"perModelPerRunner":{"default":50}}',
  LG: '{"kind":"LENGTH_GUIDANCE_POLICY"}', SHAPE: 'off',
  // S18 fix round 1: the choices a plan does not take from its base, read from the active version's publish plan.
  DS: 'yes', SEATS: '{"writer":"preview:claude-haiku-5-5","checker":"preview:fixture-b"}', ROT: 'off',
  // SB3's two lists: the inputs the upload takes from the owner's file, and the plans whose limits change, up or down.
  NEWNUM: 'billingPlans dailyCeilingMicros', LIMITS: 'PLUS PRO',
  // A4's to A7's loops over the six release folders.
  RELS, KIND: 'candidate', ROLE: 'api'
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
/** QWENOUT, the read-only check before the upload that first carries the partner rule, sits in "Taking Qwen out of the live line-up". */
const SETTINGS_STEPS = Object.freeze(['SV0', 'SV1', 'SV2', 'SV3', 'SV4', 'SV5', 'SV6', 'QWENOUT']);

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
      // SV0 makes the names file; SV6 and QWENOUT run on their own, outside a settings change.
      if (step !== 'SV0' && step !== 'SV6' && step !== 'QWENOUT') expect(block.lines[1], step).toBe('. /root/preview-archive/settings-names.sh');
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

  it('taking Qwen out: an activation first, then the upload (QWENOUT before SB1), then the gate; the refusals and the way back named', () => {
    const qwen = sectionOf(guide, '### Taking Qwen out of the live line-up');
    const prose = qwen.replace(/\s+/g, ' ');
    for (const text of ['First, with the release that runs now, an activation without Qwen', 'Then the upload', 'Last, the gate',
      'PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids:partner_served', 'PREVIEW_REGISTER_SNAPSHOT_REFUSED: answer-seat-partner-served',
      'SETTINGS_GATE_PARTNER_SERVED:Qwen/Qwen3.8-Flash', 'start the upload again from SB1', 'Bringing Qwen back',
      'enabled_models:["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro"]']) expect(prose, text).toContain(text);
    const blocks = blocksOf(qwen);
    // The jq line takes Qwen out of both lists, and its table entry (an empty table becomes null).
    const file = blocks.find(block => block.lines.some(line => line.includes('line-up-no-qwen.json')))!.lines.join('\n');
    expect(file).toContain(`jq -c '.lineUp.free_model_ids -= ["Qwen/Qwen3.8-Flash"] | .lineUp.premium_model_ids -= ["Qwen/Qwen3.8-Flash"]`);
    expect(file).toContain('if . == {} then null else . end');
    expect(file).toContain('"preview:qwen-3-8-flash"');
    // QWENOUT reads only: no write, no activation, and it reads both the lists and the four seats of the active version.
    const check = blocks.find(block => stepOf(block) === 'QWENOUT')!.lines.join('\n');
    expect(check).not.toMatch(/\bactivate\b|INSERT|UPDATE|DELETE|> "\$/u);
    expect(check).toContain("row_key = 'previewLineUpPolicy'");
    expect(check).toContain("row_key IN ('synthesizerRoleRef', 'evaluatorRoleRef', 'storytellerRoleRef', 'storyCheckerRoleRef')");
    // It also reads SV5's open debates by version, and stops while one runs on a version that names Qwen.
    expect(check).toContain("FROM core.run r JOIN core.work_item w ON w.run_id = r.run_id");
    expect(check).toContain("WHERE w.state IN ('READY', 'CLAIMED')");
    expect(check).toContain("(l.value_json->'free_model_ids') ? 'Qwen/Qwen3.8-Flash' OR (l.value_json->'premium_model_ids') ? 'Qwen/Qwen3.8-Flash'");
    expect(check).toContain("s.value_json->>'providerRef' = 'preview:qwen-3-8-flash'");
    // The guide reads for a server where the activation is done: the steps are the record, QWENOUT is the upload's.
    expect(prose).toContain('On the live server this is done');
    expect(prose).toContain('QWENOUT (below) is what that upload runs first, before its SB1');
    // The refusal the owner reads is the native operator's own line above `nat: exit 1` (it prints that code in full).
    expect(prose).toContain('the line the native operator printed just above `nat: exit 1` names the cause, `PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids:partner_served`');
    expect(prose).toContain('a version that keeps Qwen\'s entry in the thinking table while neither list names Qwen is harmless as well');
    // SB3 names the refusal and its remedy, and the side-by-side section points to QWENOUT before SB1.
    expect(scriptOf('SB3').lines.join('\n')).toContain('the active settings version still seats Qwen; the site is unchanged: SB3b, then Taking Qwen out of the live line-up, then this upload again from SB1');
    expect(sectionOf(guide, '## Side-by-side release (from T+1)').replace(/\s+/g, ' ')).toContain('QWENOUT ("Taking Qwen out of the live line-up") must print `QWENOUT_DONE`');
  });

  it('QWENOUT, run by bash with the server answered: done only when neither the active version nor an open debate can call Qwen', () => {
    const block = blocksOf(sectionOf(guide, '### Taking Qwen out of the live line-up')).find(block => stepOf(block) === 'QWENOUT')!;
    // The block as written, with its two server helpers stood in for: the status line names version 27, and psqlq
    // answers the three queries from ROW, SEATED and OPEN (OPEN as psql -XAt prints rows: one per line).
    const body = block.lines.filter(line => !line.startsWith('lc() {') && !line.startsWith('psqlq() {'));
    expect(body).toHaveLength(block.lines.length - 2);
    const run = (row: string, seated: string, open: string) => {
      const stubs = ['lc() { echo \'DEBATEAI_SETTINGS_STATUS {"effectiveActive":"27"}\'; }',
        'psqlq() { case "$1" in *core.work_item*) printf \'%s\' "$OPEN";; *"SELECT value_json::text"*) printf \'%s\\n\' "$ROW";; *"SELECT count(*)"*) echo "$SEATED";; *) echo "unexpected query"; return 1;; esac; }'];
      const result = spawnSync('bash', ['-c', [body[0]!, ...stubs, ...body.slice(1)].join('\n')], { encoding: 'utf8', env: { ...process.env, ROW: row, SEATED: seated, OPEN: open } });
      return { status: result.status, out: result.stdout.trim().split('\n') };
    };
    const value = (premium: readonly string[], table: unknown = null) => JSON.stringify({ kind: 'PREVIEW_LINE_UP_POLICY',
      free_model_ids: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash', 'claude-haiku-5-5'], premium_model_ids: premium, thinking_levels: table });
    // The live shape: no Qwen in the lists, its thinking-table entry kept, no seat on it, no open debate that can call it.
    const live = value(['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash', 'claude-haiku-5-5', 'XiaomiMiMo/MiMo-V2.6-Pro'], { 'Qwen/Qwen3.8-Flash': { level: 'medium' } });
    expect(run(live, '0', '')).toEqual({ status: 0, out: ['active settings version 27: Qwen in the lists 0 time(s), in the answer seats 0 time(s)',
      'open debates on a version that seats Qwen: none', 'QWENOUT_DONE'] });
    // Debates still open on a version that seats Qwen: wait for them.
    expect(run(live, '0', '25 1 (no line-up row: ask)\n26 2')).toEqual({ status: 1, out: ['active settings version 27: Qwen in the lists 0 time(s), in the answer seats 0 time(s)',
      'open debates that can still call Qwen, on version: 25 1 (no line-up row: ask)', 'open debates that can still call Qwen, on version: 26 2',
      'QWENOUT_NOT_DONE: debates on a version that seats Qwen are still open: wait for them to finish, then run QWENOUT again'] });
    // The active version still seats it, in a list or in a seat: take it out first.
    for (const [row, seated] of [[value(['zai-org/GLM-5.3-Flash', 'Qwen/Qwen3.8-Flash']), '0'], [live, '1']] as const) {
      expect(run(row, seated, '').out.at(-1)).toBe('QWENOUT_NOT_DONE: the active version still seats Qwen: take it out first (the steps above)');
    }
    expect(run('', '0', '').out.at(-1)).toBe('QWENOUT_NOT_DONE: the active version 27 has no line-up row: ask');
  });

  it('the legal texts\' day: one command next to the staging steps, and it is the package script', () => {
    const prose = sectionOf(guide, '## Side-by-side release (from T+1)').replace(/\s+/g, ' ');
    expect(prose).toContain('pnpm run legal:redate --date YYYY-MM-DD --dry-run');
    expect(prose).toContain('pnpm run legal:redate --date YYYY-MM-DD # sets the day everywhere');
    expect(prose).toContain('A day before the upload would read as a change made retroactive, which the Terms promise never to do.');
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['legal:redate']).toBe('node apps/ui/scripts/legal-redate.mjs');
  });

  it('the line-up and thinking changes are activations; T+1 moves the line-up out of the env (SA11, addition D15, D23, D24)', () => {
    const prose = section.replace(/\s+/g, ' ');
    // The two plan members, the reviewed menus, and the order for a model the gate has not switched on yet.
    for (const text of ['`lineUp`: exactly `free_model_ids`, `premium_model_ids` and `thinking_levels`', '`answerSeats`: `writer` and `checker`',
      'GLM `high`, `low`; DeepSeek `high`, `low`, `none`; MiMo `default`, `none`; Claude Haiku `high`, `medium`, `low` (Qwen\'s menu, `default`, `low`, `medium`, `none`, stays for the debates recorded with it).',
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
    // Owner 2026-10-23 (R79, R81): that same check is named as the dry check of the stricter one-call rule, before the
    // switch; a PASS tightens the boot in the upload after T+1, a FAIL stops for the owner.
    const t1Prose = t1.replace(/\s+/g, ' ');
    for (const text of ['This is also the dry check of the stricter "run ceiling covers one call" rule',
      '`settings-version.mjs check <label> <site version>` (the block below, before the switch)', 'fails `RUN_CEILING_BELOW_ONE_CALL` if not.',
      'If the check passes, the boot is made just as strict in the upload after T+1 (a follow-up code change, not part of this upload).',
      'If it fails with that code, nothing has started: stop and ask the owner before WB1 or anything else.']) expect(t1Prose, text).toContain(text);
    expect(t1Prose.indexOf('This is also the dry check')).toBeLessThan(t1Prose.indexOf('RC=0; OUT=$(lc settings-version.mjs check "$LABEL" "$V" 2>&1) || RC=$?'));
    // None of these blocks is a step of its own (the settings steps stay SV0-SV6, the upload's stay as STEPS).
    for (const block of t1Blocks) expect(stepOf(block)).toBeNull();
    // The providers page: automatic, one release later to drop a company; the page itself is never edited for a new
    // company (owner 2026-10-23 reworded its promise, superseding R21).
    const providers = sectionOf(guide, '### The providers page').replace(/\s+/g, ' ');
    for (const text of ['A line-up or model change never needs a website upload.', 'Adding a company is an upload',
      'The page itself needs no edit for this: it lists the company by itself, from the new release\'s declared targets, once that release is current',
      'its intro keeps saying "This list is kept up to date automatically. It always shows the companies we currently send data to." (owner, 2026-10-23)',
      'A company leaves the targets one release later.', 'never in that same upload', 'now only sets the new-debate page\'s fallback list']) expect(providers, text).toContain(text);
    // Owner 2026-10-23 (OA2): Privacy Policy 3.5 §14 and §5 stay, so an upload that adds a new AI company tells people
    // first and notes the change in the Register, before its switch; every other upload skips the step.
    for (const text of ['**A new AI company: tell people first, and note it in the Register (only an upload that adds one).**',
      'The Privacy Policy (its sections 14 and 5) makes two promises the owner keeps (2026-10-23), so before that upload\'s switch:',
      '**Privacy Policy §14: tell people before.** Before a new recipient starts receiving data, people are told by email and in the product, and given time to object.',
      'the switch (SB13; on the drained path, the downtime at DR2) waits until the notice has gone out and that time has passed.',
      'There is no tool for this in the release kit: the owner sends the notice.',
      '**Privacy Policy §5: note the change in the Register.** The Register is the `/providers` page; its facts are the reviewed catalogue in `apps/ui/lib/legal/pages.ts`',
      'with its facts checked by a person and its `checkedOn` date (the page shows it as "Last checked")', '`docs/missions/provider-register/FILL-IN.md` lists the fields.',
      'The Register has no version number or change list of its own today, so that dated row is the note',
      'No legal text changes for this step, and no Privacy Policy version.',
      'An upload that adds no new company skips this step: so does every activation (a line-up or model change) and a new model of a company the page already names.'])
      expect(providers, text).toContain(text);
    // The step names no shell block of its own (STEPS unchanged) and sits right after the "adding a company" bullet.
    expect(blocksOf(sectionOf(guide, '### The providers page'))).toHaveLength(0);
    expect(providers.indexOf('Adding a company is an upload')).toBeLessThan(providers.indexOf('A new AI company: tell people first'));
    expect(providers.indexOf('A new AI company: tell people first')).toBeLessThan(providers.indexOf('A company leaves the targets one release later.'));
    // The owner's yes before the switch names it, on both paths (SB6; the drained path's yes before DR2).
    const sb6 = sectionOf(guide, guide.split('\n').find(line => line.startsWith('### SB6. '))!).replace(/\s+/g, ' ');
    expect(sb6).toContain('- only when this upload adds a new AI company: that the Privacy Policy §14 notice went out (by email and in the product, on which date) and its time to object has passed, and that the company\'s dated Register row (§5) is in this release ("The providers page");');
    expect(sb6.indexOf('a new AI company')).toBeLessThan(sb6.indexOf('- the Caddy payment-marks rule (PM2), when this upload adds it.'));
    expect(sectionOf(guide, DRAINED).replace(/\s+/g, ' ')).toContain('When this upload adds a new AI company, the yes before DR2 also names the Privacy Policy §14 notice and the dated Register row (§5), as in SB6.');
    // A company the page lists while no line-up seats its models (the Amazon gate's upload) receives nothing yet: no
    // notice at that upload while only the team's accounts exist, and the notice before the activation that seats it.
    for (const text of ['**A company listed before it receives anything.** A company is added when it starts receiving data.',
      'When only the owner\'s and the team\'s accounts exist at such an upload, it owes no §14 notice: the company receives nothing at it.',
      'The notice is then owed before the activation that first seats one of its models, when any account outside the team exists by then, and that activation waits until the time to object has passed.',
      'When accounts outside the team exist already at such an upload, ask before its yes.',
      'An account outside the team is an account of anyone other than the owner and the team: the owner\'s own test sign-ups (MAIN-SITE.md 4.3) do not count; a friend\'s or NETOPIA\'s tester\'s do.']) expect(providers, text).toContain(text);
    // Every yes that says no notice is owed also says to ask when someone outside the team already has an account.
    expect(sb6).toContain('when someone outside the team already has an account, ask before this yes');
    expect(sectionOf(guide, DRAINED).replace(/\s+/g, ' ')).toContain('When someone outside the team already has an account then, ask before that yes ("The providers page").');
    expect(read('deploy/preview-auth-dev/v1/MAIN-SITE.md').replace(/\s+/g, ' ')).toContain('If someone outside the team already has an account, ask before the yes.');
    expect(providers.indexOf('A company listed before it receives anything')).toBeLessThan(providers.indexOf('A company leaves the targets one release later.'));
    expect(sb6).toContain('- only when this upload lists a company that no line-up seats yet (the upload that brings the Amazon gate): that no §14 notice is owed now, and why,');
    expect(sectionOf(guide, DRAINED).replace(/\s+/g, ' ')).toContain('the yes before DR2 says instead that no notice is owed, and why, and comes after GATEREADY_DONE.');
    // The page's old promise and the step that said no notice goes out stay gone.
    for (const gone of ['Advance notice first', 'We tell you before a new provider receives any data', 'No notice goes out first'])
      expect(guide.replace(/\s+/g, ' '), gone).not.toContain(gone);
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
    // The hosted inputs are the active version's, except where the owner's file is named (the site-inputs tests below).
    expect(sb3.some(line => line.startsWith('  HB=$(jq -c .hostedBilling "$ART/site-inputs.json") && NAMED=$(jq -c .change "$ART/site-inputs.json") && '))).toBe(true);
    expect(sb3).toContain('  HB=$(jq -c .hostedBilling "$FROM"); NAMED=\'[]\'');
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
    // F1, F2c: the page read's fallback line and the boot look's unfinished line are documented beside the alarm.
    for (const code of ['ADMISSION_ACTIVE_VERSION_UNCHECKED', 'ADMISSION_VIEW_FALLBACK']) expect(prose).toContain(code);
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

// ---------------------------------------------------------------------------------------------------------------------
// NV-07: the restore fence. H11 sits before the transition section (so the step order above is unchanged); every restore
// in the guide (rbB, rbB-T, rbD-B) and the lifecycle guide's nightly-dump restore revoke the restored sessions and mark
// the fence before any API starts, and H11 step 4 is the owner's way to release the public hold.
describe('NV-07: the restore fence in the guides', () => {
  const H11 = '### H11. The restore fence (from the release that carries NV-07)';
  const REVOKE = 'psqlq "UPDATE identity.session SET revoked_at = GREATEST(clock_timestamp(), created_at) WHERE revoked_at IS NULL"';
  const FENCE_QUESTION = 'FH=$(psqlq "SELECT to_regclass(\'identity.restore_fence\')';

  it('keeps H10 the NETOPIA alarm and puts H11 after it, before the hosted-base recipe', () => {
    const lines = guide.split('\n');
    expect(lines.filter(line => line.startsWith('### H10. '))).toEqual(['### H10. The alarm on NETOPIA\'s notify address']);
    expect(lines.filter(line => line.startsWith('### H11. The restore fence'))).toEqual([H11]);
    const at = guide.indexOf(`\n${H11}\n`);
    expect(at).toBeGreaterThan(guide.indexOf('\n### H10. '));
    expect(at).toBeLessThan(guide.indexOf('\n## A normal release on a hosted base'));
    expect(at).toBeLessThan(guide.indexOf(`\n${TRANSITION}\n`));
  });

  it('H11: the folder and drop-in, the SB5b-shaped setting, the INITIALISED check, and the read, reconcile and release', () => {
    const h11 = sectionOf(guide, H11);
    // H11's blocks sit inside its numbered steps (three spaces in), as H9's do.
    const blocks = blocksOf(h11.split('\n').map(line => line.replace(/^ {3}/, '')).join('\n'));
    // Step 1 is FENCEDIR, a script of the runbook's form; step 2 is still the one block that ends H11_DONE.
    expect(blocks[0]!.lines.slice(0, 2)).toEqual(['set -euo pipefail', NAMES_LINE]);
    expect(blocks[0]!.lines.at(-1)).toBe('echo FENCEDIR_DONE');
    for (const needle of ['install -d -m 0700 -o "$AU" -g "$AGRP" "$FD"', '/etc/systemd/system/debateai-preview-api@.service.d/zzzzzzzzzz-fence-restore.conf']) {
      expect(blocks[0]!.lines.join('\n'), needle).toContain(needle);
    }
    const step2 = blocks.filter(block => block.lines.at(-1) === 'echo H11_DONE');
    expect(step2).toHaveLength(1);
    const script = step2[0]!.lines;
    expect(script[0]).toBe('set -euo pipefail');
    expect(script[1]).toBe(NAMES_LINE);
    for (const needle of ['A=$E/api-$LABEL.env', '$ART/api-launch.json', "printf 'RESTORE_FENCE_PATH=%s\\n'", 'uniq -d', 'release-env.mjs same']) {
      expect(script.join('\n'), needle).toContain(needle);
    }
    expect(script.find(line => line.includes('H11_NOT_DONE'))).toContain('(SB5 or DR1 first)');
    for (const line of script.filter(code)) if (line.includes('_NOT_DONE')) expect(line, line).toMatch(/exit 1/);
    expect(h11).toContain('after DR1, before DR5');
    expect(h11).toContain('SELECT public_hold_since, last_revoked_at, last_revoked_counts FROM identity.restore_fence');
    expect(h11.split('\n').find(line => line.includes('restore_fence_release_public_hold_v1('))).toContain('# must print t');
    for (const words of ['fresh yes', 'next 60 s settle', 'rbD-B always sets the hold', 'SB7', '"outcome":"INITIALISED"']) expect(h11, words).toContain(words);
  });

  it('rbB-T and rbD-B revoke the restored sessions after the ledger check and before any API starts, then mark the fence', () => {
    for (const step of ['RBB_T', 'RBD_B']) {
      const lines = scriptOf(step).lines;
      const ledger = lines.findIndex(line => line.includes('public.debateai_schema_migration') && line.includes('= "$LEDGER0" ]') && line.includes(`${step}_NOT_DONE: the restored database`));
      const revoke = lines.findIndex(line => line.startsWith(REVOKE));
      const start = lines.findIndex(line => /^systemctl start "?debateai-preview-api/.test(line));
      expect(ledger, step).toBeGreaterThan(-1);
      expect(revoke, step).toBe(ledger + 1);
      expect(lines[revoke + 1]!.startsWith(`FENCE=/var/lib/debateai-v3-preview/api/restore-fence/fence; ${FENCE_QUESTION}`), step).toBe(true);
      expect(lines[revoke + 2], step).toContain('install -m 0600');
      expect(start, step).toBeGreaterThan(revoke + 2);
    }
    // rbB (the drained recipe of the old layout, before the transition) carries the same lines.
    const rbb = guide.slice(guide.indexOf('**rbB: from B3 on'), guide.indexOf('echo RBB_DONE'));
    const lines = rbb.split('\n');
    const revoke = lines.findIndex(line => line.startsWith(REVOKE));
    expect(revoke).toBeGreaterThan(lines.findIndex(line => line.includes('RBB_NOT_DONE: the restored database is not ledger')));
    expect(revoke).toBeLessThan(lines.findIndex(line => line.startsWith('systemctl start debateai-preview-api')));
    for (const line of lines.slice(revoke, revoke + 3)) {
      for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], line).toBe('RBB');
      expect(line, line).toMatch(/exit 1/);
    }
  });

  it('the prose of every restore and of SB5 and DR1 points to H11', () => {
    const paragraph = (start: string, end: string) => guide.slice(guide.indexOf(start), guide.indexOf(end, guide.indexOf(start)));
    expect(paragraph('**rbB: from B3 on', '```sh')).toContain('H11 step 4');
    expect(paragraph('**rbB-T: from TB3 on, at any later point.**', '```sh')).toContain('H11 step 4');
    expect(paragraph('**rbD-B: from DR4 on.**', '```sh')).toContain('H11 step 4');
    expect(sectionOf(guide, '### SB5. The three env files, and the database-ahead file')).toContain('H11 step 2');
    expect(sectionOf(guide, '#### DR1. The three env files')).toContain('H11 step 2');
  });

  it("the lifecycle guide's nightly-dump restore runs the same lines with its own archive, stamp and psqlq", () => {
    const lifecycle = read('deploy/preview-lifecycle/v1/README.md');
    const section = sectionOf(lifecycle, '## Restore a nightly dump');
    expect(section).toContain('H11 step 4');
    expect(section).toContain('rbD-B');
    const block = blocksOf(section).find(candidate => candidate.lines.some(line => line.includes('RESTORE_DONE')));
    expect(block).toBeDefined();
    const text = block!.lines.join('\n');
    for (const needle of ['S=/root/preview-archive/restore-$TS',
      'psqlq() { runuser -u postgres -- /usr/lib/postgresql/18/bin/psql -h /run/debateai-v3-preview/postgresql -p 5434 -d debateai -XAt -c "$1"; }',
      REVOKE, FENCE_QUESTION, 'RESTORE_DONE']) expect(text, needle).toContain(needle);
    for (const line of block!.lines.filter(line => line.includes('RESTORE_NOT_DONE'))) expect(line, line).toMatch(/exit 1/);
    // psqlq is the names file's definition byte for byte.
    expect(guide).toContain(text.split('\n').find(line => line.trimStart().startsWith('psqlq() {'))!.trimStart());
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// SB3's numbers: the owner's server file against the live settings version (site-inputs.mjs). The tool's own rules are
// tested in preview-site-inputs.test.ts and preview-release-artifacts.test.ts; here the guide's lines around them. Every
// number is made up (a multiple of eleven).

describe('SB3 publishes a changed number only where the owner names it, and prints no amount', async () => {
  const sb1 = scriptOf('SB1').lines, sb3 = scriptOf('SB3').lines, sb3b = scriptOf('SB3B').lines, sb3c = scriptOf('SB3C').lines;
  const section = sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB3. '))!);
  const flat = section.replace(/\s+/g, ' ');
  const jq = spawnSync('jq', ['--version']).status === 0;
  const bash = (script: string[]) => { try { return execFileSync('bash', ['-c', script.join('\n')], { encoding: 'utf8' }).trim(); } catch (error) { return String((error as { stdout?: string }).stdout ?? '').trim(); } };
  const INPUTS = ['perRunCeilingMicros', 'dailyCeilingMicros', 'askRoomReads', 'billingPlans', 'abuseLimits'];
  const numbers = (patch: Record<string, unknown> = {}) => ({ billing: 'on', perRunCeilingMicros: 3_300_000, dailyCeilingMicros: 11_000_000, askRoomReads: { limit: 66, windowMs: 66_000, capacity: 65_536 },
    billingPlans: { kind: 'BILLING_PLANS', plans: [{ plan_id: 'FREE', monthly_credit_micros: 440_000 }, { plan_id: 'PLUS', monthly_credit_micros: 7_700_000 }] }, abuseLimits: { kind: 'ABUSE_LIMITS', clarify_per_hour: 11 }, ...patch });
  const check = sb3.findIndex(line => line.startsWith('jq -e --argjson n "$NAMED" '));
  const NORM = 'def norm: if type == "number" then . + 0 elif type == "array" then map(norm) elif type == "object" then map_values(norm) else . end; ';

  it('CI has jq (the lines below are run, not only read)', () => {
    if (process.env.CI) expect(jq).toBe(true);
  });

  it('the two lists are empty unless the owner fills them in, and both reach the tool', () => {
    expect(sb3.find(line => line.startsWith('NEWNUM='))).toMatch(/^NEWNUM=''\s+# the numbers this upload takes from hosted-billing-v1\.json, on purpose: any of perRunCeilingMicros dailyCeilingMicros askRoomReads billingPlans abuseLimits, one space between; empty = the live numbers stay$/);
    expect(sb3.find(line => line.startsWith('LIMITS='))).toMatch(/^LIMITS=''\s+# only with billingPlans in NEWNUM: /);
    const tool = sb3.indexOf('TOOL=$CAPI/dialectical-engine/deploy/preview-release/v1/release-artifacts.mjs');
    const detect = sb3.indexOf('if grep -qF "\'site-inputs\':" "$TOOL"; then');
    const report = sb3.findIndex(line => line.startsWith('  SI=$(rel site-inputs --operation report --from "$FROM" --site "$HB_ON") || { echo "SB3_NOT_DONE: '));
    const compose = sb3.findIndex(line => line.startsWith('  rel site-inputs --operation compose --from "$FROM" --site "$HB_ON" ${NEWNUM:+--change "$NEWNUM"} ${LIMITS:+--limits "$LIMITS"} --out "$ART/site-inputs.json" > /dev/null || { echo "SB3_NOT_DONE: '));
    const plan = sb3.findIndex(line => line.startsWith('rel native-plan --operation plan --from "$FROM" '));
    expect(tool).toBeGreaterThan(sb3.findIndex(line => line.startsWith('if [ "$AV" = "$OSITE" ]; then FROM=')));
    // A release that is not staged yet stops; it is never taken for an older tool.
    expect(sb3[tool + 1]).toMatch(/^\[ -f "\$TOOL" \] \|\| \{ echo "SB3_NOT_DONE: /);
    expect(detect).toBe(tool + 2);
    expect(report).toBe(detect + 1);
    // The lines are printed before anything is decided, so a stop still shows what differs.
    expect(sb3[report + 1]).toBe('  jq -r \'.lines[]\' <<<"$SI"');
    expect(compose).toBe(report + 2);
    expect(plan).toBeGreaterThan(compose);
    // Each refusal the tool can give is explained on a stop line, with what to do.
    for (const code of ['SITE_INPUTS_REFUSED', 'SITE_PLAN_LIST_DIFFERS', 'INPUT_REFUSED', 'FROM_PLAN_INVALID', 'NATIVE_APPROVAL_REQUIRED']) expect(sb3[report], code).toContain(code);
    for (const code of ['ARGUMENTS_REFUSED', 'SITE_CHANGE_NOT_NAMED', 'SITE_CHANGE_NAMED_BUT_SAME', 'SITE_LIMITS_NOT_NAMED', 'SITE_LIMITS_NAMED_BUT_SAME', 'SITE_INPUTS_REFUSED', 'SITE_BILLING_SWITCH_DIFFERS']) expect(sb3[compose], code).toContain(code);
    expect(sb3[compose]).toContain('nothing was written');
    // Nothing of the step exists yet when the numbers are compared: a stop leaves no file behind.
    expect(compose).toBeLessThan(sb3.findIndex(line => line.startsWith('put "$ART/native-plan-plan.json"')));
    expect(sb3.findIndex(line => line.includes('[ ! -e "$ART/site-inputs.json" ]') && line.includes('SB3_NOT_DONE'))).toBeLessThan(detect);
    // The words SB3 looks for are the tool's own: a change of spelling there would send every upload down the old path.
    expect(read('deploy/preview-release/v1/release-artifacts.mjs')).toContain("\n  'site-inputs': { required: ");
    // A file that does not read as JSON must not stop the way back: the names line gives an empty value, and SB3 stops on it.
    expect(sb1).toContain('HB_ON="$(jq -c \'.billing="on"\' /etc/debateai-v3-preview/hosted-billing-v1.json 2>/dev/null || true)"');
    expect(sb3.some(line => line.startsWith('[ "$(jq -r .billing <<<"$HB_ON")" = on ] || { echo "SB3_NOT_DONE: '))).toBe(true);
  });

  it('for a plan named in LIMITS, SB3 says whether an open subscription holds it, and prints no count', () => {
    const read = sb3.findIndex(line => line.startsWith('  HOLD=$(psqlq "SELECT DISTINCT e.plan_id FROM billing.subscription_event e JOIN billing.subscription_latest_v s ON s.subscription_id = e.subscription_id WHERE s.kind NOT IN (\'ENDED\',\'WITHDRAWN\',\'ERASURE_STOPPED\')") || { echo "SB3_NOT_DONE: '));
    expect(sb3[read - 1]).toBe('if [ -n "$LIMITS" ]; then');
    expect(sb3[read + 2]).toBe('fi');
    // Before the tool is asked, so the lines are there when the step then stops, and nothing is written yet.
    expect(read).toBeLessThan(sb3.indexOf('TOOL=$CAPI/dialectical-engine/deploy/preview-release/v1/release-artifacts.mjs'));
    const lines = (limits: string, held: string[], fail = false) => bash(['set -euo pipefail', `LIMITS='${limits}'`,
      `psqlq() { ${fail ? 'return 1' : `printf '%s\\n' ${held.map(plan => `'${plan}'`).join(' ') || "''"}`}; }`, ...sb3.slice(read - 1, read + 3), 'echo READ']).split('\n');
    expect(lines('PLUS PRO FREE', ['PLUS', 'MAX'])).toEqual(['PLUS: HELD by at least one open subscription', 'PRO: nobody holds it now', 'FREE: HELD by everyone without a paid plan', 'READ']);
    expect(lines('MAX', [])).toEqual(['MAX: nobody holds it now', 'READ']);
    // Nothing named: the database is not read at all.
    expect(lines('', [], true)).toEqual(['READ']);
    // A read that fails stops the step by name.
    expect(lines('PLUS', [], true)[0]).toMatch(/^SB3_NOT_DONE: the open subscriptions could not be read/);
  });

  it('no line of SB3, SB3b or SB3c prints a number of the file or of the plan', () => {
    for (const [step, lines] of [['SB3', sb3], ['SB3B', sb3b], ['SB3C', sb3c]] as const) {
      for (const line of lines.filter(code)) {
        // The hosted inputs are only ever handed to a tool or compared; they never reach echo, printf or a bare jq print.
        for (const echoed of line.matchAll(/echo "((?:[^"\\]|\\.)*)"/g)) expect(echoed[1], `${step}: ${line}`).not.toMatch(/\$\{?(HB|HB_ON|NUM|SI)\b|hostedBilling/);
        // The watched-rows line prints member names and counts only; its own test below hands it changed numbers and finds none printed.
        if (/^\s*jq /.test(line) && !/>\s*("\$N"|\/dev\/null)/.test(line)) expect(line, `${step}: ${line}`).toMatch(/^\s*jq -r '\.lines\[\]' <<<"\$SI"$|^jq -c '\{baseRegisterVersion,addedKeys,changedKeys,removedKeys,deltaSha256\}' |^jq -r '\["billingPolicy","costEnvelopePolicy","admissionPolicy",[^|]*\] as \$w \| \.delta\[\] \| .*"watched row /);
      }
    }
    // The one other print reads the record's lines, which hold names only (preview-site-inputs.test.ts).
    expect(sb3.filter(line => /jq -r /.test(line) && line.includes('site-inputs.json')).map(line => /jq -r [^|]*'([^']*)' "\$ART\/site-inputs\.json"/.exec(line)?.[1])).toEqual(['(.lines - $seen)[]']);
    expect(sb3.join('\n')).not.toContain("jq -c '{perRunCeilingMicros}'");
  });

  it('a release older than the site-inputs command publishes no changed number: the file must be the live numbers, whole', () => {
    const start = sb3.indexOf('else'), end = sb3.indexOf('fi', start);
    expect(start).toBeGreaterThan(-1);
    const branch = sb3.slice(start + 1, end).filter(code);
    expect(branch).toHaveLength(2);
    expect(branch[1]!.startsWith(`  [ -z "$NEWNUM$LIMITS" ] && [ "$(jq -cS '${NORM}norm' <<<"$HB")" = "$(jq -cS '${NORM}norm' <<<"$HB_ON")" ] || { echo "SB3_NOT_DONE: this release's tool has no site-inputs command`)).toBe(true);
    if (!jq) return;
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3-'));
    try {
      const run = (file: string, lists: string[] = ['', '']) => {
        writeFileSync(join(dir, 'from.json'), JSON.stringify({ operation: 'verify', hostedBilling: numbers() }));
        return bash(['set -euo pipefail', `FROM='${dir}/from.json'; HB_ON='${file}'; NEWNUM='${lists[0]}'; LIMITS='${lists[1]}'`, ...branch, 'echo "OLD_TOOL_OK $NAMED"']);
      };
      const text = (value: unknown) => JSON.stringify(value);
      // The same numbers, typed in another key order, and with a number spelled another way (jq 1.7 keeps a spelling).
      expect(run(text(Object.fromEntries(Object.entries(numbers()).reverse())))).toBe('OLD_TOOL_OK []');
      expect(run(text(numbers()).replace('11000000', '1.1e7').replace('3300000', '3300000.0'))).toBe('OLD_TOOL_OK []');
      for (const input of INPUTS) expect(run(text(numbers({ [input]: input.endsWith('Micros') ? 2_200_000 : { changed: 11 } }))), input).toMatch(/^SB3_NOT_DONE: /);
      expect(run(text(numbers()), ['billingPlans', ''])).toMatch(/^SB3_NOT_DONE: /);
      expect(run(text(numbers()), ['', 'PLUS'])).toMatch(/^SB3_NOT_DONE: /);
      // An unreadable file (the names line gave nothing) stops too.
      expect(run('')).toMatch(/^SB3_NOT_DONE: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('the proposal must change exactly the numbers named, member by member', () => {
    expect(check).toBeGreaterThan(sb3.findIndex(line => line.startsWith('OUT=$(nat "$ART/register-proposal.json")')));
    expect(check).toBeLessThan(sb3.findIndex(line => line.startsWith('sha256sum "$ART/native-plan-plan.json" "$ART/register-proposal.json" > "$S/plan-proposal.sha256"')));
    expect(sb3[check]).toContain('SB3_NOT_DONE: the numbers the proposal changes are not exactly the inputs NEWNUM names');
    if (!jq) return;
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3-rows-'));
    try {
      const cost = { per_run_ceiling_micros: 3_300_000, daily_ceiling_micros: 11_000_000, band: { close_basis_points: 9900 } };
      const admission = { ask_room_reads: { key: 'owner', limit: 66, window_ms: 66_000, capacity: 65_536 }, sign_in: { limit: 11 } };
      const entry = (rowKey: string, before: unknown, after: unknown, sourceRef = false) => ({ rowKey, change: before === null ? 'added' : 'changed',
        oldValueJsonText: before === null ? null : JSON.stringify(before), newValueJsonText: JSON.stringify(after), oldSourceRef: before === null ? null : 'x', newSourceRef: sourceRef ? 'y' : 'x' });
      const verdict = (named: string[], delta: unknown[]) => {
        writeFileSync(join(dir, 'register-proposal.json'), JSON.stringify({ delta }));
        return bash(['set -euo pipefail', `ART='${dir}'; NAMED='${JSON.stringify(named)}'`, sb3[check]!, 'echo NUMBERS_OK']);
      };
      const code = [entry('nodeRuntimeVersion', { v: 'v26' }, { v: 'v26' }, true), entry('judgeContractHash', { sha256: 'a' }, { sha256: 'b' })];
      expect(verdict([], code)).toBe('NUMBERS_OK');
      // Each input alone, named: passes; the same delta with nothing named, or with another input named, stops.
      const one: Record<string, unknown> = {
        perRunCeilingMicros: entry('costEnvelopePolicy', cost, { ...cost, per_run_ceiling_micros: 2_200_000 }),
        dailyCeilingMicros: entry('costEnvelopePolicy', cost, { ...cost, daily_ceiling_micros: 22_000_000 }),
        askRoomReads: entry('admissionPolicy', admission, { ...admission, ask_room_reads: { ...admission.ask_room_reads, limit: 77 } }),
        billingPlans: entry('billingPlans', numbers().billingPlans, { kind: 'BILLING_PLANS', plans: [] }),
        abuseLimits: entry('abuseLimits', numbers().abuseLimits, { kind: 'ABUSE_LIMITS', clarify_per_hour: 22 })
      };
      for (const input of INPUTS) {
        expect(verdict([input], [...code, one[input]]), input).toBe('NUMBERS_OK');
        expect(verdict([], [...code, one[input]]), input).toMatch(/^SB3_NOT_DONE: /);
        expect(verdict([INPUTS[(INPUTS.indexOf(input) + 1) % INPUTS.length]!], [...code, one[input]]), input).toMatch(/^SB3_NOT_DONE: /);
        // Named, and the proposal does not change it: the change did not take.
        expect(verdict([input], code), input).toMatch(/^SB3_NOT_DONE: /);
      }
      // A code-owned member of the ceilings row or of the admission row may move with nothing named, and beside a named number.
      const band = entry('costEnvelopePolicy', cost, { ...cost, band: { close_basis_points: 9800 } }), scope = entry('admissionPolicy', admission, { ...admission, sign_in: { limit: 22 } });
      expect(verdict([], [...code, band, scope])).toBe('NUMBERS_OK');
      expect(verdict(['costEnvelopePolicy'], [...code, band])).toMatch(/^SB3_NOT_DONE: /);
      // Both ceilings moved and only one is named: stops. Both named: passes.
      const both = entry('costEnvelopePolicy', cost, { ...cost, per_run_ceiling_micros: 2_200_000, daily_ceiling_micros: 22_000_000 });
      expect(verdict(['perRunCeilingMicros'], [...code, both])).toMatch(/^SB3_NOT_DONE: /);
      expect(verdict(['dailyCeilingMicros', 'perRunCeilingMicros'], [...code, both])).toBe('NUMBERS_OK');
      // Only a source reference moved: no number changed. A row added whole counts as its numbers changing.
      expect(verdict([], [...code, entry('billingPlans', numbers().billingPlans, numbers().billingPlans, true)])).toBe('NUMBERS_OK');
      expect(verdict(['abuseLimits'], [...code, entry('abuseLimits', null, numbers().abuseLimits)])).toBe('NUMBERS_OK');
      expect(verdict([], [...code, entry('abuseLimits', null, numbers().abuseLimits)])).toMatch(/^SB3_NOT_DONE: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // The whole path once, with the real pieces: the tool's choice, the register kit's own delta over a base sealed from
  // the live numbers, and the guide's check line on that delta.
  const kit = await import('../../deploy/' + 'preview-auth-dev/v1/publish-register-v3.ts');
  const kitV2 = await import('../../deploy/' + 'preview-auth-dev/v1/publish-register-v2.ts');
  const registerModule = await import('@debateai/register');
  const owned = await import('../../packages/register/src/staff-access-policy.js');
  const operator = await import('../../deploy/' + 'preview-auth-dev/v1/native-operator.mjs');
  const siteInputs = await import('../../deploy/' + 'preview-release/v1/site-inputs.mjs');
  const { TEST_OWNER_LIMIT_ROWS } = await import('../support/hostedRegisterRows.js');

  it('end to end: what the tool chooses is what the register kit changes, and the check line agrees', async () => {
    if (!jq) return;
    const live = { billing: 'on', perRunCeilingMicros: 3_300_000, dailyCeilingMicros: 11_000_000, askRoomReads: { limit: 60, windowMs: 60_000, capacity: 65_536 }, ...TEST_OWNER_LIMIT_ROWS };
    const runtime = (observedAt: string) => ({ nodeVersion: 'v26.8.2', pnpmVersion: '11.20.0', sourceRevision: 'c'.repeat(40), sourceTree: 'd'.repeat(40), operatorSha256: 'e'.repeat(64), observedAt });
    const bootstrap = await registerModule.loadBootstrapRegister();
    const sorted = (rows: any[]) => [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey, 'en'));
    const local = sorted([...await kitV2.buildPreviewSourceRowsV2(bootstrap, runtime('2026-10-12T09:00:00.000Z')),
      ...[owned.STAFF_ACCESS_POLICY_REGISTER_ROW, owned.INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map((row: any) => ({ rowKey: row.rowKey, valueJsonText: registerModule.canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }))]);
    /** A version sealed with `hosted` over `base`: its rows are what the database then holds. */
    const seal = async (hosted: unknown, base: any[], observedAt: string) => kit.composePreviewSnapshotV3({ sourceRows: await kit.buildPreviewSourceRowsV3(bootstrap, runtime(observedAt), hosted),
      baseRows: base, baseRegisterVersion: '12', baseSnapshotSha256: registerModule.computeRegisterSnapshotSha256(base) });
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3-e2e-'));
    try {
      const verdict = (named: readonly string[], delta: unknown) => {
        writeFileSync(join(dir, 'register-proposal.json'), JSON.stringify({ delta }));
        return bash(['set -euo pipefail', `ART='${dir}'; NAMED='${JSON.stringify(named)}'`, sb3[check]!, 'echo NUMBERS_OK']);
      };
      const database = sorted([...(await seal(live, local, '2026-10-13T12:00:00.000Z')).rows]);
      /** SB3 for one owner's file: the tool's choice, then the kit's proposal over the database's rows. */
      const upload = async (file: any, lists: { change?: string; limits?: string } = {}, rows = database) => {
        const chosen = siteInputs.composeSiteInputs(live, file, lists);
        const proposal = await seal(operator.validateHostedBillingChoice(chosen.hostedBilling), rows, '2026-10-20T12:00:00.000Z');
        return { chosen, proposal, verdict: verdict(chosen.change, proposal.delta) };
      };
      // Nothing named, nothing different: only code rows move (the runtime row's time), and the check passes.
      const same = await upload(JSON.parse(JSON.stringify(live)));
      expect(same.proposal.changedKeys).toEqual(['nodeRuntimeVersion']);
      expect(same.verdict).toBe('NUMBERS_OK');
      // A higher day's ceiling, more Plus credit and a higher abuse limit, all three named; Plus is named too, since a
      // raised limit cannot be taken back for a month.
      const file = JSON.parse(JSON.stringify(live));
      file.dailyCeilingMicros += 11_000_000;
      file.billingPlans.plans[1].monthly_credit_micros += 1_100_000;
      file.abuseLimits.flag_per_site_day += 11;
      await expect(upload(file, { change: 'abuseLimits billingPlans dailyCeilingMicros' })).rejects.toMatchObject({ code: 'SITE_LIMITS_NOT_NAMED', fields: ['PLUS'] });
      const changed = await upload(file, { change: 'abuseLimits billingPlans dailyCeilingMicros', limits: 'PLUS' });
      expect([...changed.proposal.changedKeys].sort()).toEqual(['abuseLimits', 'billingPlans', 'costEnvelopePolicy', 'nodeRuntimeVersion']);
      expect(changed.verdict).toBe('NUMBERS_OK');
      // The very same proposal against another list of names stops.
      expect(verdict([], changed.proposal.delta)).toMatch(/^SB3_NOT_DONE: /);
      expect(verdict(['billingPlans', 'dailyCeilingMicros'], changed.proposal.delta)).toMatch(/^SB3_NOT_DONE: /);
      expect(verdict(['abuseLimits', 'billingPlans', 'dailyCeilingMicros', 'perRunCeilingMicros'], changed.proposal.delta)).toMatch(/^SB3_NOT_DONE: /);
      // The kept plan says the live numbers, but the database's version was sealed with another per-debate ceiling:
      // the tool sees nothing to name, the kit's delta moves that ceiling, and the check stops the step.
      const drifted = sorted([...(await seal({ ...live, perRunCeilingMicros: 2_200_000 }, local, '2026-10-13T12:00:00.000Z')).rows]);
      const stale = await upload(JSON.parse(JSON.stringify(live)), {}, drifted);
      expect(stale.chosen.change).toEqual([]);
      expect(stale.proposal.changedKeys).toContain('costEnvelopePolicy');
      expect(stale.verdict).toMatch(/^SB3_NOT_DONE: the numbers the proposal changes are not exactly the inputs NEWNUM names \(\[\]\)/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('the delta line for a number change names the members that differ and prints none of their values', () => {
    const block = blocksOf(section).find(candidate => candidate.lines.some(line => line.includes('members that differ (values not printed)')))!;
    expect(block.lines).toHaveLength(1);
    expect(flat).toContain('With `NEWNUM` not empty, use this line instead of A9\'s first one');
    if (!jq) return;
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3-delta-'));
    try {
      const row = (rowKey: string, before: unknown, after: unknown, reason = 'owner-hosted-billing-input') => ({ rowKey, change: before === null ? 'added' : 'changed', reason,
        oldValueJsonText: before === null ? null : JSON.stringify(before), newValueJsonText: JSON.stringify(after) });
      writeFileSync(join(dir, 'register-proposal.json'), JSON.stringify({ delta: [
        row('billingPlans', numbers().billingPlans, { kind: 'BILLING_PLANS', plans: [{ plan_id: 'FREE', monthly_credit_micros: 550_000 }] }),
        row('costEnvelopePolicy', { per_run_ceiling_micros: 3_300_000, daily_ceiling_micros: 11_000_000, currency: 'USD' }, { per_run_ceiling_micros: 3_300_000, daily_ceiling_micros: 22_000_000, currency: 'USD' }),
        row('abuseLimits', null, { kind: 'ABUSE_LIMITS', clarify_per_hour: 11 }),
        row('judgeContractHash', { sha256: '77777' }, { sha256: '88888' }, 'reviewed-current-source-facet')
      ] }));
      const printed = bash(['set -euo pipefail', `ART='${dir}'`, ...block.lines]).split('\n');
      expect(printed).toEqual([
        'changed billingPlans (owner-hosted-billing-input)', '  members that differ (values not printed): plans',
        'changed costEnvelopePolicy (owner-hosted-billing-input)', '  members that differ (values not printed): daily_ceiling_micros',
        'added abuseLimits (owner-hosted-billing-input)', '  members that differ (values not printed): clarify_per_hour kind',
        'changed judgeContractHash (reviewed-current-source-facet)', '  old: {"sha256":"77777"}', '  new: {"sha256":"88888"}'
      ]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('SB3b sets SB3\'s files aside only while nothing was applied or published from them', () => {
    const guard = sb3b.findIndex(line => line.startsWith('for F in native-plan-apply-and-plan.json native-apply-and-plan.json native-plan-publish.json register-published.json; do [ ! -e "$ART/$F" ] || { echo "SB3B_NOT_DONE: '));
    const move = sb3b.findIndex(line => line.startsWith('for F in "$NP" "$ART/native-plan-plan.json" "$ART/register-proposal.json" "$ART/site-inputs.json" "$S/plan-proposal.sha256"; do [ ! -e "$F" ] || mv "$F" "$D/" || { echo "SB3B_NOT_DONE: '));
    expect(guard).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(guard);
    // Moved into a new folder of the upload's own archive; nothing is deleted, and a second run in the same second stops.
    const folder = sb3b.indexOf('D=$S/sb3-$(date -u +%Y%m%dT%H%M%SZ)');
    expect(sb3b[folder + 1]).toMatch(/^\[ ! -e "\$D" \] \|\| \{ echo "SB3B_NOT_DONE: /);
    expect(sb3b.join('\n')).not.toMatch(/\brm\b/);
    // Every file SB3 refuses to find again is among the ones SB3b moves.
    for (const file of ['"$NP"', '"$ART/native-plan-plan.json"', '"$ART/register-proposal.json"', '"$ART/site-inputs.json"']) expect(sb3.some(line => line.includes(`[ ! -e ${file} ]`) && line.includes('SB3_NOT_DONE')), file).toBe(true);
    if (!jq) return;
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3b-'));
    try {
      const art = join(dir, 'art'), archive = join(dir, 's');
      const run = (extra: string[] = []) => {
        for (const folderPath of [art, archive]) execFileSync('mkdir', ['-p', folderPath]);
        for (const name of ['native-plan-plan.json', 'register-proposal.json', 'site-inputs.json', ...extra]) writeFileSync(join(art, name), '{"p":1}');
        writeFileSync(join(dir, 'np.json'), '{"p":1}'); writeFileSync(join(archive, 'plan-proposal.sha256'), 'x');
        return bash(['set -euo pipefail', `ART='${art}'; S='${archive}'; NP='${dir}/np.json'`, 'install() { mkdir -p "${@: -1}"; }', ...sb3b.slice(2)]).split('\n');
      };
      expect(run().at(-1)).toBe('SB3B_DONE');
      for (const moved of [join(dir, 'np.json'), join(art, 'native-plan-plan.json'), join(art, 'site-inputs.json')]) expect(existsSync(moved), moved).toBe(false);
      // After SB8 or SB9 wrote from the plan, nothing moves.
      expect(run(['native-plan-publish.json'])[0]).toMatch(/^SB3B_NOT_DONE: .*native-plan-publish\.json exists/);
      expect(readFileSync(join(art, 'native-plan-plan.json'), 'utf8')).toBe('{"p":1}');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('SB3c writes only the named inputs into the owner\'s file, keeps the file before, and prints names only', () => {
    expect(sb3c.find(line => line.startsWith('KEEP='))).toMatch(/^KEEP=''\s+# the inputs to write: /);
    const names = sb3c.findIndex(line => line.startsWith('printf \'%s\\n\' "$KEEP" | grep -qxE '));
    const free = sb3c.findIndex(line => line.startsWith('[ ! -e "$B" ] && [ ! -e "$N" ] || { echo "SB3C_NOT_DONE: '));
    const copyLine = sb3c.findIndex(line => line.startsWith('cp -p "$F" "$B" && cmp -s "$F" "$B" || { echo "SB3C_NOT_DONE: '));
    const write = sb3c.findIndex(line => line.startsWith('jq -s --arg keep "$KEEP" '));
    const keys = sb3c.findIndex(line => line.startsWith('[ "$(jq -r \'keys | join(",")\' "$N")" = '));
    const place = sb3c.findIndex(line => line.startsWith('install -o root -g root -m 0600 "$N" "$F.new" && mv "$F.new" "$F" && cmp -s "$N" "$F" || { echo "SB3C_NOT_DONE: '));
    const loop = sb3c.indexOf('for K in perRunCeilingMicros dailyCeilingMicros askRoomReads billingPlans abuseLimits; do');
    expect(names).toBeGreaterThan(-1);
    expect(free).toBeGreaterThan(sb3c.indexOf('umask 077'));
    // The copy of the file before is never written over: a second run in the same second stops first.
    expect([copyLine, write, keys, place, loop]).toEqual([free + 1, free + 2, free + 3, free + 4, free + 6]);
    expect(sb3c).toContain('[ ! -L "$F" ] && [ "$(stat -c \'%a %U %h\' "$F")" = "600 root 1" ] || { echo "SB3C_NOT_DONE: $F is not root\'s own 0600 file: ask"; exit 1; }');
    // The live version by default, read as SB3 reads it, and only while it is still the live one.
    expect(sb3c.join('\n')).toContain('[ "$(jq -r .approval.publication.registerVersion "$SRC")" = "$AV" ] && [ "$(activev)" = "$AV" ] || { echo "SB3C_NOT_DONE: ');
    // The last line says which settings version the numbers came from (a version, never an amount).
    expect(sb3c.at(-2)).toMatch(/^echo "written from settings version \$\(jq -r \.approval\.publication\.registerVersion "\$SRC"\) /);
    if (!jq) return;
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3c-'));
    try {
      const file = numbers({ billing: 'anything', perRunCeilingMicros: 2_200_000, abuseLimits: { kind: 'ABUSE_LIMITS', clarify_per_hour: 22 }, dailyCeilingMicros: 22_000_000 });
      const run = (keep: string, fileText = JSON.stringify(file)) => {
        writeFileSync(join(dir, 'file.json'), fileText);
        writeFileSync(join(dir, 'plan.json'), JSON.stringify({ operation: 'verify', hostedBilling: numbers() }));
        const out = bash(['set -euo pipefail', `F='${dir}/file.json'; N='${dir}/new.json'; SRC='${dir}/plan.json'; KEEP='${keep}'`, sb3c[names]!, sb3c[write]!, sb3c[keys]!, 'mv "$N" "$F"', ...sb3c.slice(loop, loop + 3), 'echo WRITTEN']);
        return { out: out.split('\n'), now: JSON.parse(readFileSync(join(dir, 'file.json'), 'utf8')) };
      };
      const kept = run('perRunCeilingMicros abuseLimits');
      // The two named inputs are the live ones now; the day's ceiling stays the file's own, and so does its billing word.
      expect(kept.now).toEqual({ ...file, perRunCeilingMicros: 3_300_000, abuseLimits: numbers().abuseLimits });
      expect(kept.out).toEqual(['SAME perRunCeilingMicros', 'DIFFERENT dailyCeilingMicros', 'SAME askRoomReads', 'SAME billingPlans', 'SAME abuseLimits', 'WRITTEN']);
      expect(run(INPUTS.join(' ')).now).toEqual({ ...numbers(), billing: 'anything' });
      // A number the file spells another way is still the same number.
      expect(run('abuseLimits', JSON.stringify({ ...numbers(), dailyCeilingMicros: 0 }).replace('"dailyCeilingMicros":0', '"dailyCeilingMicros":1.1e7')).out).toContain('SAME dailyCeilingMicros');
      // A list with two spaces, a tab, a comma or an unknown name stops before anything is written.
      for (const bad of ['perRunCeilingMicros  abuseLimits', ' abuseLimits', 'abuseLimits,askRoomReads', 'billing', '', 'abuseLimits\tbillingPlans']) {
        const stopped = run(bad);
        expect(stopped.out, bad).toEqual(['SB3C_NOT_DONE: KEEP is not input names with one space between']);
        expect(stopped.now, bad).toEqual(file);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('the text says what the owner does, what reaches the people who already have a plan, and how to go back', () => {
    for (const text of [
      '**Nothing changes (most uploads).** Leave `NEWNUM` and `LIMITS` empty.',
      'It never prints an amount',
      'A subscriber\'s renewals keep charging the price recorded for that subscriber when they bought (Terms section 12), after a rise and after a cut alike.',
      '**An upgrade shown before the switch and paid after it.** The person pays the amount they were shown. What the plan is renewed at depends on the release that showed it.',
      '**an upload whose old release is such an older one must not change a plan\'s prices**: no `prices` line may print.',
      'The reading errs to one side only: `HELD` is printed when an open subscription names the plan anywhere in its history',
      '**If the file changes after SB2, by hand or by SB3c, run SB2 again before SB3**',
      'For each plan named there SB3 prints `HELD` or `nobody holds it now`',
      'Each person\'s month keeps the numbers it started with.',
      '**A lower limit** reaches each person when their own next month starts, never before.',
      'No day already used is counted again, nobody is stopped in a month they already started, and no running debate pauses.',
      '**A higher limit** reaches everyone on the plan at the switch.',
      '**A higher limit cannot be taken back inside a month.**',
      'A credit lowered later never makes a refund smaller',
      'A raised reserve does not make new questions stop earlier in a month already started.',
      'The product sends no notice and has no acceptance step for limits.',
      '**a plan whose limits change, up or down, is named in `LIMITS`.**',
      'Naming a plan whose limit goes **lower**, or whose line says `changed`, is the owner\'s statement that the people on that plan were told first (Terms section 12), or that nobody holds it',
      'a paid plan named only because the smallest paid reserve moved is one of these',
      'Naming a plan whose limit goes **higher** is the owner\'s statement that the number was checked twice, because it cannot be taken back for a month.',
      'A day or week cap added where the plan had none is a lower limit',
      'every such line ends "at the switch"',
      'when that smallest one moves, every paid plan must be named',
      'Do not name it (that would publish the old value again). Run SB3c with `KEEP=\'perRunCeilingMicros\'`',
      '**Editing the owner\'s file.**',
      '**A release older than this step.**'
    ]) expect(flat, text).toContain(text);
    const back = sectionOf(guide, WAY_BACK).replace(/\s+/g, ' ');
    expect(back).toContain('A way back that makes the old release current again (WB2) also brings the numbers before back');
    expect(back).toContain('**When the upload had raised a plan\'s limits, WB2 does not take the raise back from the people whose month saw it**');
    expect(back).toContain('When the upload had lowered a limit, WB2 brings the higher number back for everyone at once.');
    // The line that tells whether the old release keeps a month on its own numbers looks for a name the API's composition really has.
    expect(back).toContain('`grep -c createBillingPlansInForce "$OCAPI/dialectical-engine/apps/api/src/main.ts"`');
    expect(read('apps/api/src/main.ts')).toContain('createBillingPlansInForce({');
    // The guide no longer says a lower limit reaches a month already started, or that a way back lowers a raise again.
    for (const gone of ['hit everyone', 'counted again over the days already used', 'WB2 lowers them again', 'do not lower a plan\'s limits while anyone holds']) {
      expect(flat, gone).not.toContain(gone);
      expect(read('deploy/preview-auth-dev/v1/MAIN-SITE.md').replace(/\s+/g, ' '), gone).not.toContain(gone);
    }
    expect(back).toContain('put the numbers before into the owner\'s file with SB3c');
    // The yes names a number change and, for a named plan, that nobody holds it or when its people were told.
    expect(sectionOf(guide, '### SB6. The owner\'s fresh yes').replace(/\s+/g, ' ')).toContain('only when SB3\'s `NEWNUM` is not empty: the inputs it names; and, with plans in `LIMITS`, those plans, and for each one whose limit goes lower or is said to have changed either that nobody holds it or the date the people on it were told, and for each one whose limit goes higher that the number was checked twice');
    // The line that tells whether the old release saves an upgrade's shown price looks for a name the upgrade code really has.
    expect(flat).toContain('`grep -c monthlyQuoteIdOf "$OCAPI/dialectical-engine/apps/api/src/billing/upgrade.ts"`');
    expect(read('apps/api/src/billing/upgrade.ts')).toContain('export function monthlyQuoteIdOf(');
    // The drained path never runs SB6: its own yes names the same, and its numbers have their own way back (no WB2 after DR6).
    const drainedFlat = drained.replace(/\s+/g, ' ');
    expect(drainedFlat).toContain('When SB3\'s `NEWNUM` is not empty, the yes before DR2 names the inputs it names; and, with plans in `LIMITS`, those plans, and for each one whose limit goes lower or is said to have changed either that nobody holds it or the date the people on it were told, and for each one whose limit goes higher that the number was checked twice, as in SB6.');
    // The runbook the owner follows on upload day says the same two statements for its own yes before DR2.
    expect(read('deploy/preview-auth-dev/v1/MAIN-SITE.md').replace(/\s+/g, ' ')).toContain('your yes before DR2 names the inputs in it, and for each plan in `LIMITS`: when its limit goes lower or is said to have changed, either that nobody holds it or the date its people were told; when its limit goes higher, that you checked the number twice.');
    expect(drainedFlat).toContain('**The numbers on the drained path (SB3\'s `NEWNUM`).** DR6 marks the old release retired, so there is no switch back to it (no WB2) once the upload is done.');
    // Both places that send the reader there quote the paragraph's own first words.
    expect(back).toContain('After a drained upload there is no WB2: see "The numbers on the drained path"');
    expect(read('deploy/preview-auth-dev/v1/MAIN-SITE.md')).toContain('The release guide says both under "The numbers on the drained path".');
    // The order table names the two new steps between SB3 and SB4.
    expect(sideBySide).toMatch(/\n\| SB3 \|[^\n]*\n\| SB3b \|[^\n]*\n\| SB3c \|[^\n]*\n\| SB4 \|/);
  });

  it('the file is edited as a checked copy, never in place', () => {
    const block = blocksOf(section).find(candidate => candidate.lines.some(line => line.includes('COPY_READS')))!;
    expect(block.lines).toHaveLength(4);
    expect(block.lines[3]).toBe('install -o root -g root -m 0600 /root/hosted-billing-v1.edit.json /etc/debateai-v3-preview/hosted-billing-v1.json.new && mv /etc/debateai-v3-preview/hosted-billing-v1.json.new /etc/debateai-v3-preview/hosted-billing-v1.json');
    if (!jq) return;
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3-edit-'));
    try {
      const reads = (text: string) => { writeFileSync(join(dir, 'edit.json'), text); return bash(['set -uo pipefail', block.lines[1]!.replaceAll('/root/hosted-billing-v1.edit.json', join(dir, 'edit.json'))]); };
      expect(reads(JSON.stringify(numbers()))).toBe('COPY_READS');
      // A trailing comma, a missing input and an extra one all fail the check.
      expect(reads(JSON.stringify(numbers()).replace(/\}$/, ',}'))).toBe('');
      const { abuseLimits: _dropped, ...five } = numbers();
      expect(reads(JSON.stringify(five))).toBe('');
      expect(reads(JSON.stringify({ ...numbers(), extra: 11 }))).toBe('');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('the upload that brings the Amazon gate: its steps come where the upload meets them, and stop before the downtime', async () => {
  const ROOT = resolve(import.meta.dirname, '../..');
  const bedrock = sectionOf(guide, '## The Amazon Bedrock gate: the upload that brings it');
  const flat = bedrock.replace(/\s+/g, ' ');
  const whole = blocksOf(guide);
  /** The one block of the whole guide whose lines name `step` as `# <step>: …`. */
  const named = (step: string) => {
    const found = whole.filter(block => block.lines.some(line => line.startsWith(`# ${step}: `)));
    expect(found, step).toHaveLength(1);
    return [...found[0]!.lines];
  };
  const NODE = '/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node';
  const { PREVIEW_REVIEWED_PROVIDER_REFS, previewTargetJsonRow } = await import('../../packages/providers/src/preview-models.js');
  const ROWS = PREVIEW_REVIEWED_PROVIDER_REFS.map(ref => previewTargetJsonRow(ref));
  const OPS = join(ROOT, 'packages/providers/ops');
  const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const GATES = [
    ['deepinfra', 'deepinfra-budget-v3', 'provider-deepinfra-authority-v3', 'provider-deepinfra-go-v3'],
    ['anthropic', 'anthropic-budget-v1', 'provider-anthropic-authority-v1', 'provider-anthropic-go-v1'],
    ['perplexity', 'perplexity-budget-v1', 'provider-perplexity-authority-v1', 'provider-perplexity-go-v1'],
    ['bedrock', 'bedrock-budget-v1', 'provider-bedrock-authority-v1', 'provider-bedrock-go-v1']
  ] as const;
  const SOCKETS = { budget_socket: '/run/debateai-v3-preview/budget-v3.sock', deployment: 'preview', requested_thinking_level: 'high', scope_id: 'preview-deepinfra-v3-20261010', anthropic_budget_socket: '/run/debateai-v3-preview/anthropic-budget-v1.sock' };
  type State = 'all right' | 'one gate on old code' | 'the Amazon gate missing' | 'six addresses' | 'the Amazon window closed' | 'a row the code refuses';

  /** A made-up server in a new folder: the four gates, their GOs and states, the Amazon service and the two env files. */
  function server(state: State) {
    const dir = mkdtempSync(join(tmpdir(), 'guide-bedrock-'));
    mkdirSync(join(dir, 'capi'));
    symlinkSync(ROOT, join(dir, 'capi', 'dialectical-engine'));
    mkdirSync(join(dir, 'etc', 'auth-dev-v1'), { recursive: true });
    mkdirSync(join(dir, 'S'));
    for (const [name, folder, privateDir, go] of GATES) {
      if (state === 'the Amazon gate missing' && name === 'bedrock') continue;
      mkdirSync(join(dir, 'operator', folder), { recursive: true });
      mkdirSync(join(dir, 'var', privateDir), { recursive: true });
      for (const file of ['preview_budget_authority.py', 'preview_budget_helper.py']) copyFileSync(join(OPS, file), join(dir, 'operator', folder, file));
      // An older gate's files and GO agree with each other, never with the release.
      if (state === 'one gate on old code' && name === 'anthropic') writeFileSync(join(dir, 'operator', folder, 'preview_budget_helper.py'), `${readFileSync(join(OPS, 'preview_budget_helper.py'), 'utf8')}\n# an older copy\n`);
      writeFileSync(join(dir, 'etc', `${go}.json`), JSON.stringify({ provider: name, bridge_sha256: sha(join(dir, 'operator', folder, 'preview_budget_authority.py')), helper_sha256: sha(join(dir, 'operator', folder, 'preview_budget_helper.py')) }));
      writeFileSync(join(dir, 'var', privateDir, 'state.json'), JSON.stringify({ state: 'active', window_open: !(state === 'the Amazon window closed' && name === 'bedrock') }));
    }
    writeFileSync(join(dir, 'service'), state === 'the Amazon gate missing' ? 'inactive' : 'active');
    // The two env files as BEDROCK_ENV leaves them, or as DR1 leaves them (six addresses, no Amazon socket).
    const six = state === 'six addresses';
    const rows = six ? ROWS.slice(0, 6) : state === 'a row the code refuses' ? ROWS.map((row, index) => index === 2 ? { ...row, context_window_tokens: 1000 } : row) : ROWS;
    const config = six ? SOCKETS : { ...SOCKETS, bedrock_budget_socket: '/run/debateai-v3-preview/bedrock-budget-v1.sock' };
    for (const service of ['api', 'runner']) writeFileSync(join(dir, 'etc', 'auth-dev-v1', `${service}-rX.env`), `REGISTER_VERSION=20\nPREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(config)}\nPROVIDER_DISCOVERY_TARGETS_JSON=${JSON.stringify(rows)}\nNODE_ENV=production\n`, { mode: 0o600 });
    return dir;
  }
  /** A server step run by bash on that made-up server: its own lines after the names file, the paths moved into it, python, systemctl and stat answered from it. */
  function step(dir: string, lines: readonly string[]) {
    const body = lines.slice(2).map(line => line
      .replaceAll('/opt/debateai-v3-preview/operator/', `${dir}/operator/`).replaceAll('/var/lib/debateai-v3-preview/', `${dir}/var/`)
      .replaceAll('/etc/debateai-v3-preview/', `${dir}/etc/`).replaceAll('/usr/bin/python3 -I', 'stubpy').replaceAll(NODE, process.execPath));
    const setup = ['set -euo pipefail', `E='${dir}/etc/auth-dev-v1'; LABEL=rX; CAPI='${dir}/capi'; S='${dir}/S'`,
      'stubpy() { [ -f "$1" ] && cat "$4/state.json"; }',
      `systemctl() { if [ "$(cat '${dir}/service')" = active ]; then echo active; else echo inactive; return 3; fi; }`,
      "stat() { echo '600 root:root'; }"];
    const out = spawnSync('bash', ['-c', [...setup, ...body].join('\n')], { encoding: 'utf8' });
    return out.stdout.trim().split('\n');
  }

  it('the section and the drained path say when each step runs, and nothing of it runs from SB3 to the switch', () => {
    const rows = bedrock.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| When') && !line.startsWith('|---'));
    expect(rows.map(row => row.split('|')[1]!.trim())).toEqual([
      'before SB2, on the Mac', 'after SB2 (in any case after SB1), before SB3', 'right after piece 1, before SB3', 'SB4',
      'right after the env files (SB5; on the drained path, DR1)', 'right before the owner\'s yes (SB6; on the drained path, the yes before DR2)',
      'any day after the upload, on its own'
    ]);
    // GATES4 reads each gate's code and state, never its unit: piece 1's units are checked by step 3a's own lines.
    expect(rows.map(row => row.split('|')[3]!.trim())).toEqual(['LUNAROW', 'step 3a\'s three `active` and six `1` lines, then GATES4', 'GATES4', 'SB4', 'BEDROCK_ENV', 'GATEREADY', 'the probe']);
    expect(named('GATES4').join('\n')).not.toContain('InaccessiblePaths');
    for (const text of ['Pieces 1 and 2 restart gates and run `activate`, so they never run inside an upload\'s window from SB3 to the end of the switch',
      'install no new drop-in (two exceptions: the Amazon gate\'s units and address drop-in, piece 2; the restore fence\'s drop-in, FENCEDIR)',
      'deployed after SB2 and before SB3 (pieces 1 and 2)',
      // The upload needs nothing from the AWS console; the running runner keeps what it read at its start.
      'The AWS console work (`README-bedrock.md`, install step 0: Luna\'s subscription and quota, the key, a budget alert, an AWS account e-mail address somebody reads) belongs to piece 4. The upload does not wait for it.',
      'Install step 0 (the AWS console), step 4 (the key) and step 8 (the probe) wait for piece 4',
      'The gate README\'s paragraph right after its step 6 ("Restart the runner only after BOTH gates are `active`") does not apply here',
      '`deploy/preview-lifecycle/v1/common.mjs` (the tools\' list of gates now holds the Amazon gate) and `alert.mjs`',
      '**No Privacy Policy §14 notice is owed at this upload**', '**Before piece 4 the notice is owed when any account outside the team exists by then**',
      'So the key goes in on piece 4\'s day, right before the owner\'s first probe.', '**It closes itself after 31 days.**', '**After a reboot it is not running.**',
      'every settings activation on the old release is refused (`SETTINGS_GATE_HELPER_DIFFERS`) until a later upload brings this code again.'])
      expect(flat, text).toContain(text);
    for (const gone of ['Piece 1, before SB4', 'Piece 2, before SB4', 'its older tools read two gates', 'are a separate change', 'The release tools count four gates'])
      expect(flat, gone).not.toContain(gone);
    // Piece 4: the notice when it is owed, then the watchers, then the key and the probe, then the activation. From the
    // key on every ask makes a paid check of Luna, so the key never waits through the notice's time to object unwatched.
    // S-5's terminal keeps its ssh -N running, so LUNAROW runs in S-6's second terminal, where P is set again; an scp of
    // S-5 brings the server's settings back.
    const practice = read('tools/preview-practice/README.md').replace(/\s+/g, ' ');
    expect(practice).toContain('Leave the `ssh -N` running in its own terminal.');
    expect(practice).toContain('In a second terminal, from the worktree\'s `dialectical-engine` folder (set `D` and `P` to the same folders as in S-5)');
    for (const text of ['Run it in S-6\'s second terminal, where you set `P` to S-5\'s folder (S-5\'s own terminal is busy with its `ssh -N`): after S-5\'s `scp`, and before S-6\'s `formats`.',
      'or S-5\'s `scp` run again, brings the server\'s six-row `settings.env` back: run LUNAROW again after it.'])
      expect(flat, text).toContain(text);
    expect(flat).not.toContain('in the Terminal where S-5 set `P`');
    // GATEREADY runs inside the window from SB3 to the switch: only piece 3 is done there; a gate is never redeployed,
    // restarted or activated then.
    for (const text of ['- `piece 3` (BEDROCK_ENV not run, or not done): run BEDROCK_ENV, then GATEREADY again.',
      'no yes and no downtime. Do not redeploy, restart or `activate` a gate now: stop and ask.'])
      expect(flat, text).toContain(text);
    // The one exception, which changes no gate: the Amazon gate's service after a reboot, in the same words in both places.
    const reboot = '`MISSING (piece 2): the Amazon gate\'s service is not running` after a reboot (`systemctl show -p Result,NRestarts debateai-preview-bedrock-budget` shows `success` and `0`): run `systemctl start debateai-preview-bedrock-budget`, then GATEREADY again; any other case, stop and ask.';
    expect(flat.split(reboot).length - 1, reboot).toBe(2);
    expect(flat).toContain('Give the yes only after `GATEREADY_DONE` and `GATELIVE_DONE`.');
    for (const gone of ['Do that piece, run GATEREADY again', 'its activate; a gate still active needs its stop first'])
      expect(flat, gone).not.toContain(gone);
    const piece4 = flat.slice(flat.indexOf('**Piece 4, any day after the upload: Luna in the line-up.**'), flat.indexOf('**The way back.**'));
    const order = ['1. When any account outside the team exists', '2. "Switch it on", step 2', 'the key at the hidden prompt', '5. The activation'].map(text => piece4.indexOf(text));
    expect(Math.min(...order), piece4).toBeGreaterThan(0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(drained.replace(/\s+/g, ' ')).toContain('On the upload that brings the Amazon gate, run BEDROCK_ENV (piece 3) right after DR1 too, and GATEREADY right before the yes before DR2');
  });

  it('LUNAROW, GATES2, GATES4, GATESBEFORE, BEDROCK_ENV, GATEREADY and GATELIVE are scripts of the runbook\'s form, and parse', () => {
    for (const name of ['GATES2', 'GATES4', 'GATESBEFORE', 'BEDROCK_ENV', 'GATEREADY', 'GATELIVE']) {
      const lines = named(name);
      expect(lines[0], name).toBe('set -euo pipefail');
      expect(lines[1], name).toBe(NAMES_LINE);
      expect(lines.filter(line => line !== 'exit 0').at(-1), name).toBe(`echo ${name}_DONE`);
      for (const line of lines) {
        for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], `${name}: ${line}`).toBe(name);
        if (line.includes('_NOT_DONE')) expect(line, `${name}: ${line}`).toMatch(/exit 1/);
      }
      expect(spawnSync('bash', ['-n'], { input: lines.join('\n') }).status, name).toBe(0);
    }
    const luna = named('LUNAROW');
    expect(luna.slice(0, 3)).toEqual(['#!/usr/bin/env bash', expect.stringMatching(/^# LUNAROW: /), 'set -euo pipefail']);
    expect(luna.at(-1)).toBe('echo LUNAROW_DONE');
    expect(spawnSync('bash', ['-n'], { input: luna.join('\n') }).status).toBe(0);
    // The practice's row and the server's are printed by the same call of the release's own code.
    expect(luna.join('\n')).toContain('previewTargetJsonRow(\\"preview:gpt-6-luna\\")');
    expect(named('BEDROCK_ENV').join('\n')).toContain('previewTargetJsonRow("preview:gpt-6-luna")');
    // GATES4 and GATEREADY ask for the gates of this release's tools, and for the Perplexity gate the tools do not list.
    for (const name of ['GATES4', 'GATEREADY']) for (const [, folder, privateDir, go] of GATES) for (const part of [folder, privateDir, go]) expect(named(name).join('\n'), `${name} ${part}`).toContain(part);
  });

  it('GATESBEFORE reads the three older gates before piece 1 and changes nothing; GATELIVE asks every gate the new api file names, through the release\'s own reader', async () => {
    const before = named('GATESBEFORE'), live = named('GATELIVE');
    expect(flat.indexOf('# GATESBEFORE: ')).toBeLessThan(flat.indexOf('**Piece 1, after SB2 and before SB3'));
    expect(flat.indexOf('# GATELIVE: ')).toBeGreaterThan(flat.indexOf('# GATEREADY: '));
    // GATESBEFORE runs each gate's own start checks as its unit does (the release's unit files name the same commands).
    for (const [unit, check] of [['debateai-preview-provider-budget.service', 'deepinfra_addresses.py" check --dropin /etc/systemd/system/debateai-preview-provider-budget.service.d/50-deepinfra-addresses.conf'],
      ['debateai-preview-provider-budget.service', 'deepinfra_models.py" check --go /etc/debateai-v3-preview/provider-deepinfra-go-v3.json'], ['debateai-preview-anthropic-budget.service', 'anthropic_addresses.py" check'],
      ['debateai-preview-perplexity-budget.service', 'perplexity_addresses.py" check --dropin /etc/systemd/system/debateai-preview-perplexity-budget.service.d/50-perplexity-addresses.conf']] as const) {
      expect(before.join('\n'), check).toContain(check);
      expect(readFileSync(join(ROOT, 'deploy/preview-gate/v3/systemd', unit), 'utf8'), unit).toContain(check.replace('" ', ' '));
    }
    // Both read only: nothing is copied, moved, written, stopped, started or activated.
    for (const lines of [before, live]) for (const line of lines.filter(code)) {
      expect(line, line).not.toMatch(/(^|[\s;&|(])(cp|mv|install|chown|chmod|tee)\s|systemctl (start|stop|restart|reset-failed)|\b(activate|stop) --private/);
      expect(line.replace(/2?>\s*\/dev\/null/g, ''), line).not.toMatch(/[^<2&]>{1,2}\s*["$\/\w]/);
    }
    // GATELIVE asks with the release's own reader and socket map, which the staged folder loads without any package.
    const reader = await import('../../deploy/' + 'preview-lifecycle/v1/settings-version.mjs');
    expect(typeof reader.readRemaining).toBe('function');
    // The module is named in the environment, not as an argument: as process.argv[1] it would run the tool's own main().
    expect(live.join('\n')).toContain('const { gateSockets, readRemaining } = await import(pathToFileURL(process.env.SV).href); const gates = ["deepinfra", "anthropic", "perplexity", "bedrock"]');
    expect(live.join('\n')).not.toContain('process.argv[1]');
    const config = { ...SOCKETS, perplexity_budget_socket: '/run/debateai-v3-preview/perplexity-budget-v1.sock', bedrock_budget_socket: '/run/debateai-v3-preview/bedrock-budget-v1.sock' };
    const mapped = reader.gateSockets(JSON.stringify(config), ['deepinfra', 'anthropic', 'perplexity', 'bedrock'].map(name => ({ name })));
    expect(mapped).toEqual({ scopeId: SOCKETS.scope_id, sockets: { deepinfra: SOCKETS.budget_socket, anthropic: SOCKETS.anthropic_budget_socket, perplexity: config.perplexity_budget_socket, bedrock: config.bedrock_budget_socket } });
    // It prints no money member of the answer, and it stops unless all four gates were read.
    expect(live.join('\n')).not.toMatch(/remaining_usd|daily_pot|largest_reservation|today_spend/);
    expect(live.join('\n')).toContain('[ "$(grep -cE \'^(deepinfra|anthropic|perplexity|bedrock) \' <<<"$OUT" || true)" = 4 ] || {');
  });

  it('GATES4 and GATEREADY say which piece is missing in each state the server can be in, before the downtime', () => {
    const last = (lines: string[]) => lines.at(-1);
    const cases: ReadonlyArray<readonly [State, string, RegExp]> = [
      ['all right', 'GATES4_DONE', /^GATEREADY_DONE$/],
      ['one gate on old code', 'GATES4_NOT_DONE: not on this release\'s gate code, or not active: anthropic', /^GATEREADY_NOT_DONE: not ready for the downtime: piece 1 \(/],
      ['the Amazon gate missing', 'GATES4_NOT_DONE: not on this release\'s gate code, or not active: bedrock', /^GATEREADY_NOT_DONE: not ready for the downtime: piece 2 \(/],
      ['the Amazon window closed', 'GATES4_DONE', /^GATEREADY_NOT_DONE: not ready for the downtime: piece 2 \(/],
      ['six addresses', 'GATES4_DONE', /^GATEREADY_NOT_DONE: not ready for the downtime: piece 3 \(/],
      ['a row the code refuses', 'GATES4_DONE', /^GATEREADY_NOT_DONE: not ready for the downtime: ask \(/]
    ];
    for (const [state, gates4, ready] of cases) {
      const dir = server(state);
      try {
        expect(last(step(dir, named('GATES4'))), state).toBe(gates4);
        const out = step(dir, named('GATEREADY'));
        expect(last(out), `${state}: ${out.join('\n')}`).toMatch(ready);
        if (state === 'all right') {
          expect(out).toContain('bedrock gate: code this release; state active; window open true');
          expect(out).toContain('api-rX.env: 7 model addresses; Luna\'s address there; the Amazon socket named; this release\'s start check of the addresses: accepted 7');
          expect(last(step(dir, named('GATES2')))).toBe('GATES2_DONE');
        }
        if (state === 'one gate on old code') {
          expect(out).toContain('MISSING (piece 1): the anthropic gate does not run this release\'s gate code');
          expect(last(step(dir, named('GATES2')))).toBe('GATES2_NOT_DONE: not on this release\'s gate code, or not active: anthropic');
        }
        if (state === 'the Amazon gate missing') expect(out).toContain('MISSING (piece 2): the Amazon gate\'s service is not running');
        if (state === 'the Amazon window closed') expect(out).toContain('MISSING (piece 2): the bedrock gate is not active with its window open (its status says why)');
        if (state === 'a row the code refuses') expect(out.join('\n')).toContain('the new api would refuse these addresses at its start (refused PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID)');
        if (state === 'six addresses') {
          // DR1's files, then piece 3: BEDROCK_ENV adds the socket and Luna's row, and GATEREADY passes.
          expect(out).toContain('api-rX.env: 6 model addresses; Luna\'s address MISSING; the Amazon socket MISSING; this release\'s start check of the addresses: refused PROVIDER_DISCOVERY_TARGET_SET_MISMATCH');
          const env = step(dir, named('BEDROCK_ENV'));
          expect(env.slice(-3)).toEqual(['api-rX.env: 7 model addresses, the Amazon socket named', 'runner-rX.env: 7 model addresses, the Amazon socket named', 'BEDROCK_ENV_DONE']);
          expect(last(step(dir, named('GATEREADY')))).toBe('GATEREADY_DONE');
          expect(last(step(dir, named('BEDROCK_ENV')))).toBe('BEDROCK_ENV_DONE');
        }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  }, 120_000);

  it('LUNAROW adds the release\'s own row for Luna, last, to the practice\'s copy of the settings, once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guide-lunarow-'));
    try {
      // zsh is the Mac's login shell (node comes from it there); here bash stands in, with this test's node first on PATH.
      const lines = named('LUNAROW');
      writeFileSync(join(dir, 'luna-row.sh'), [...lines.slice(0, 3), 'zsh() { shift; bash -c "$1"; }', ...lines.slice(3)].join('\n'));
      const env = { ...process.env, PATH: `${resolve(process.execPath, '..')}:${process.env.PATH ?? ''}` };
      const run = (file: string) => spawnSync('bash', [join(dir, 'luna-row.sh'), ROOT, file], { encoding: 'utf8', env }).stdout.trim().split('\n');
      const settings = join(dir, 'settings.env');
      // S-2's copy ends without a newline.
      const before = `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(SOCKETS)}\nPROVIDER_DISCOVERY_TARGETS_JSON=${JSON.stringify(ROWS.slice(0, 6))}\nREGISTER_VERSION=20\nDEBATEAI_DEPLOYMENT_MODE=hosted`;
      writeFileSync(settings, before, { mode: 0o600 });
      expect(run(settings).slice(-2)).toEqual(['settings.env: 7 model addresses, Luna\'s row last', 'LUNAROW_DONE']);
      const targets = (text: string) => JSON.parse(/^PROVIDER_DISCOVERY_TARGETS_JSON=(.*)$/m.exec(text)![1]!);
      expect(targets(readFileSync(settings, 'utf8'))).toEqual(ROWS);
      expect(readFileSync(`${settings}.before-luna`, 'utf8')).toBe(before);
      expect(readFileSync(settings, 'utf8').replace(/^PROVIDER_DISCOVERY_TARGETS_JSON=.*$/m, '')).toBe(`${before.replace(/^PROVIDER_DISCOVERY_TARGETS_JSON=.*$/m, '')}\n`);
      // A second run changes nothing.
      const once = readFileSync(settings, 'utf8');
      expect(run(settings).at(-1)).toBe('LUNAROW_DONE');
      expect(readFileSync(settings, 'utf8')).toBe(once);
      // Luna's row anywhere but last, or the line twice: it stops and changes nothing.
      const moved = join(dir, 'moved.env');
      writeFileSync(moved, `PROVIDER_DISCOVERY_TARGETS_JSON=${JSON.stringify([ROWS[6], ...ROWS.slice(0, 6)])}\n`);
      expect(run(moved).at(-1)).toMatch(/^LUNAROW_NOT_DONE: .* holds another row for Luna, or Luna's row is not last: ask$/);
      writeFileSync(moved, 'PROVIDER_DISCOVERY_TARGETS_JSON=[]\nPROVIDER_DISCOVERY_TARGETS_JSON=[]\n');
      expect(run(moved).at(-1)).toMatch(/^LUNAROW_NOT_DONE: PROVIDER_DISCOVERY_TARGETS_JSON is not in .* exactly once: ask$/);
      expect(existsSync(`${moved}.before-luna`)).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------------------
// The drained path's checks before the yes, its repair blocks and its ways back: each block's guards come before what it
// changes, a repair never moves what a later step compares, and the pieces that decide are run by bash on made-up files.
describe('the drained path: PRECHECK before the yes, a repair block for each stop, and the ways back', () => {
  const bash = (script: string[]) => { const out = spawnSync('bash', ['-c', script.join('\n')], { encoding: 'utf8' }); return `${out.stdout}`.trim(); };
  const at = (lines: readonly string[], needle: string) => { const found = lines.findIndex(line => line.includes(needle)); expect(found, needle).toBeGreaterThan(-1); return found; };
  const READ_ONLY_WRITES = /(^|[\s;&|(])(cp|mv|install|chown|chmod|tee|put|nat|rel|pre)\s|systemctl (start|stop|restart|reset-failed|daemon-reload)/;

  it('the order before the yes, and how the downtime steps run, are written down', () => {
    const flat = drained.replace(/\s+/g, ' ');
    for (const text of ['FENCEDIR (H11 step 1: the fence folder and its drop-in), SB5c (the proof copies and lines), H11 step 2 (the fence line)',
      'PRECHECK (below), GATEREADY and GATELIVE', 'run as MAIN-SITE.md\'s detached run ("How to run a server step")',
      'Never paste a downtime step a second time without reading its log first.', 'It comes after `PRECHECK_DONE`, `GATEREADY_DONE` (on the upload that brings the Amazon gate) and `GATELIVE_DONE`'])
      expect(flat, text).toContain(text);
    // The order table names the repair of each downtime step.
    const rows = drained.split('\n').filter(line => /^\| (DR[2-6]|SWAP) \|/.test(line)).map(line => line.split('|')[5]!.trim());
    expect(rows).toEqual(['–', 'DBBACK', 'DR4AGAIN (only the cases DR4 names)', 'SWAP again', 'DR5RESUME', 'DR6AGAIN first, then LATELINES or FENCEDIR when the journal names them, then DR6; after the switch wrote: WB4 with `drained`, then DR6TAIL']);
    // The long staging steps run as the detached run too: a background job ends with the ssh window.
    expect(guide.replace(/\s+/g, ' ')).toContain('Long steps (A3, A4, A6, A7) run as MAIN-SITE.md\'s detached run ("How to run a server step"), like every downtime step');
    expect(guide).not.toContain('nohup bash "$S/jobs/');
  });

  it('PRECHECK only reads, and asks for each thing DR2 to DR6 and the way back need', () => {
    const lines = scriptOf('PRECHECK').lines;
    for (const line of lines.filter(code)) {
      expect(line, line).not.toMatch(READ_ONLY_WRITES);
      expect(line.replace(/2?>\s*\/dev\/null/g, ''), line).not.toMatch(/[^<2&-]>{1,2}\s*["$\/\w]/);
    }
    const text = lines.join('\n');
    for (const needle of ["grep -qxF \"UI_API_PROOF_PATH=$PRF/api/proof.secret\" \"$A\"", "grep -qxF \"DIALECTICAL_UI_API_PROOF_PATH=$PRF/ui.secret\" \"$U\"",
      "grep -qxF \"RESTORE_FENCE_PATH=$FENCE\" \"$A\"", 'echo "OVERLAP $K"', "grep -c '^PUBLICATION_ENABLED=true$' \"$A\"",
      "to_regprocedure('core.claim_run_key_provision_cleanup(integer)')", "to_regprocedure('identity.authenticate_session_t9(text,text,timestamptz,timestamptz)')",
      "to_regnamespace('erasure_reconcile') IS NULL", 'rolconnlimit <> -1', "state LIKE 'idle in transaction%'", "LC_ALL=C TZ=Europe/Bucharest date +'%-d %B %Y'",
      'pg_tablespace', 'findmnt -n', '[ ! -e "$S/pg18-cold.sha256" ]', 'sha256sum -c --quiet "$S/plan-proposal.sha256"']) expect(text, needle).toContain(needle);
    // DR5's own marks test, word for word, so a stop comes before the yes.
    expect(text).toContain(scriptOf('DR5').lines.find(line => line.startsWith("if grep -q '^PAYMENT_MARKS_AVAILABLE='"))!.split(' || { echo ')[0]!);
    // The day line reads the texts' own form.
    expect(read('apps/ui/legal/en/terms-of-service.md')).toMatch(/\*\*Version [0-9.]+ · Effective [0-9]{1,2} [A-Z][a-z]+ 20[0-9]{2} · /);
    // The key places: a store at or above the fence folder, or a key file directly in a folder above it, is named; one beside it is not.
    const key = lines.filter(line => line.startsWith('for K in ') && line.includes('OVERLAP'));
    expect(key).toHaveLength(2);
    const dir = mkdtempSync(join(tmpdir(), 'guide-precheck-'));
    try {
      const run = (env: string) => { writeFileSync(join(dir, 'api.env'), env); return bash(['set -euo pipefail', `A='${dir}/api.env'; FENCE=/var/lib/debateai-v3-preview/api/restore-fence/fence; NO=0`, ...key, 'echo "overlaps $NO"']).split('\n'); };
      expect(run('USER_DEK_STORE_PATH=/var/lib/debateai-v3-preview/api/user-deks\nKEK_PATH=/etc/debateai-v3-preview/keys/kek\n')).toEqual(['overlaps 0']);
      expect(run('AUDIT_KEY_STORE_PATH=/var/lib/debateai-v3-preview/api/\n')).toEqual(['OVERLAP AUDIT_KEY_STORE_PATH', 'overlaps 1']);
      expect(run('RECORDS_KEY_PATH=/var/lib/debateai-v3-preview/api/records.key\nUSER_DEK_STORE_PATH=/var/lib/debateai-v3-preview/api/restore-fence\n')).toEqual(['OVERLAP USER_DEK_STORE_PATH', 'OVERLAP RECORDS_KEY_PATH', 'overlaps 2']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    // The connection limits: only the API's, the runner's and the scheduler's logins are read. The Hatchet login, the
    // migrator and the staff readiness writer keep their limits on purpose and never stop PRECHECK; a limited API login does.
    const limit = lines.findIndex(line => line.startsWith('CL=$(psqlq '));
    expect(lines[limit]).toContain('rolcanlogin AND rolconnlimit <> -1 AND (');
    const patterns = [...lines[limit]!.matchAll(/rolname LIKE '([^']+)'/g)].map(match => new RegExp(`^${match[1]!.replaceAll('_', '.').replaceAll('%', '.*')}$`));
    expect(patterns).toHaveLength(3);
    const limits = (roles: Array<[string, number]>) => {
      const picked = roles.filter(([name, connlimit]) => connlimit !== -1 && patterns.some(pattern => pattern.test(name))).map(([name]) => name).sort().join(' ');
      return bash(['set -euo pipefail', `psqlq() { printf '%s\n' '${picked}'; }`, "BAD=''; bad() { echo \"BAD ($1): $2\"; BAD=\"$BAD $1\"; }", ...lines.slice(limit, limit + 3), 'echo "BAD=$BAD"']).split('\n');
    };
    const server: Array<[string, number]> = [['debateai_prod_hatchet', 50], ['debateai_prod_migrator', 3], ['debateai_staff_readiness_writer', 2],
      ['debateai_prod_api_runtime', -1], ['debateai_prod_api_system', -1], ['debateai_prod_runner_runtime', -1]];
    expect(limits(server)).toEqual(['connection limits of the API, runner and scheduler logins: no limit set', 'BAD=']);
    expect(limits([...server.filter(([name]) => name !== 'debateai_prod_api_system'), ['debateai_prod_api_system', 12]]).at(-1)).toBe('BAD= database-roles');
    expect(limits([...server.filter(([name]) => name !== 'debateai_prod_runner_runtime'), ['debateai_prod_runner_runtime', 4]]).at(-1)).toBe('BAD= database-roles');
    // When the system's own daily upgrade next runs: read and printed, never a stop; the text says when not to give the yes.
    expect(text).toContain("systemctl list-timers apt-daily-upgrade.timer --no-legend 2>/dev/null | awk 'NR == 1 { print $1, $2, $3, $4 }' || true");
    expect(sectionOf(guide, '#### PRECHECK. Everything that can be read with the site up, right before the yes').replace(/\s+/g, ' ')).toContain('Do not give the yes within an hour before that upgrade time');
    // The data folder's size: a failed du is a BAD line, never a silent end.
    expect(text).toContain('SIZE=$(du -sm "$PGP/v3-preview" 2>/dev/null | cut -f1 || true)');
    expect(text).toContain('[ -n "$SIZE" ] || { bad space "the data folder\'s size is unread"; SIZE=0; }');
    // It comes right after DR1 in the guide and before DR2.
    expect(drained.indexOf('\n#### PRECHECK. ')).toBeGreaterThan(drained.indexOf('\n#### DR1. '));
    expect(drained.indexOf('\n#### PRECHECK. ')).toBeLessThan(drained.indexOf('\n#### DR2. '));
  });

  it('DR2 refuses an earlier cold copy before it stops anything; DR3 records the folders\' modes before its stop and names DBBACK after it', () => {
    const dr2 = scriptOf('DR2').lines;
    const copy = at(dr2, '[ ! -e "$S/pg18-cold.sha256" ] || { echo "DR2_NOT_DONE: an earlier cold copy exists in S (nothing was stopped): AGAINSAME first"');
    expect(copy).toBeLessThan(dr2.findIndex(line => line.startsWith('AVN=$(activev) || ')));
    expect(copy).toBeLessThan(dr2.findIndex(line => line.startsWith('date -u +%s >> "$S/downtime-start-epoch"')));
    expect(at(dr2, "pgrep -f '[/]usr/bin/unattended-upgrade'")).toBeLessThan(dr2.findIndex(line => line.startsWith('date -u +%s >> "$S/downtime-start-epoch"')));
    // No step stops or starts the system's own timers: a running upgrade is waited for, never interrupted.
    for (const block of allBlocks) for (const line of block.lines.filter(code)) expect(line, line).not.toMatch(/systemctl (stop|start|disable|enable|mask) [^|;]*apt-daily/);
    const dr3 = scriptOf('DR3').lines;
    expect(dr3).toContain('[ -n "$SIZE" ] || { echo "DR3_NOT_DONE: the data folder\'s size is unread (nothing was stopped): run DR3 again; then ask"; exit 1; }');
    // The modes are recorded only when both stat calls answered, in the form rbD-B compares.
    const record = dr3.find(line => line.includes('> "$S/pg18-modes"'))!;
    const modes = (stat: string) => bash(['set -euo pipefail', `S=$(mktemp -d); PGP=/x; stat() { ${stat}; }`, record, 'cat "$S/pg18-modes"']);
    expect(modes("echo '700 postgres:postgres'")).toBe('700 postgres:postgres\n700 postgres:postgres');
    expect(modes('return 1')).toMatch(/^DR3_NOT_DONE: the two folders' modes could not be recorded/);
    expect(modes('echo')).toMatch(/^DR3_NOT_DONE: the two folders' modes could not be recorded/);
    const stop = dr3.findIndex(line => line.startsWith('systemctl stop debateai-preview-hatchet-gateway debateai-preview-hatchet debateai-preview-postgresql'));
    expect(at(dr3, '> "$S/pg18-modes"')).toBeLessThan(stop);
    for (const line of dr3.slice(stop)) if (line.includes('DR3_NOT_DONE')) expect(line, line).toMatch(/: DBBACK"; exit 1;/);
    expect(dr3.find(line => line.includes('an earlier cold copy exists in S'))).toContain('AGAINSAME');
  });

  it('DBBACK keeps a checked copy, moves a partial one aside, and starts only what is not running', () => {
    const lines = scriptOf('DBBACK').lines;
    const text = lines.join('\n');
    expect(text).toContain('if [ -e "$S/pg18-cold.sha256" ] && sha256sum -c --quiet "$S/pg18-cold.sha256"; then');
    expect(text).toContain('P=$S/cold-partial-$TS');
    expect(text).toContain('echo "cold copy: no copy yet (DR3 may run again)"');
    for (const unit of ['postgresql', 'hatchet', 'hatchet-gateway']) expect(text, unit).toContain(`if [ "$(systemctl is-active debateai-preview-${unit} || true)" != active ]; then`);
    // It never stops anything, never runs DR3's tar, and moves only the three files of the copy.
    expect(text).not.toMatch(/systemctl stop|tar -C/);
    for (const line of lines.filter(code)) if (/(^|[\s;])mv /.test(line)) expect(line).toContain('mv "$S/$F" "$P/"');
    // The witness's PASS comes before the gateway's start.
    expect(at(lines, 'gateway-route-witness.mjs check')).toBeLessThan(at(lines, 'systemctl start debateai-preview-hatchet-gateway.service'));
  });

  it('DR4 checks the database side, the copy\'s age and open transactions first, and its refusal says how to read the ledger line', () => {
    const lines = scriptOf('DR4').lines;
    const apply = lines.findIndex(line => line.startsWith('rel native-plan --operation apply-and-plan'));
    for (const needle of ['for U in postgresql hatchet hatchet-gateway; do', 'stat -c %Y "$S/pg18-cold.sha256"', "state LIKE 'idle in transaction%'"]) expect(at(lines, needle), needle).toBeLessThan(apply);
    const sanity = lines.findIndex(line => line.startsWith('[ "$(jq -r .operation "$ART/native-plan-apply-and-plan.json")" = apply-and-plan ]'));
    expect(sanity).toBe(apply + 1);
    expect(lines[sanity + 1]).toMatch(/^put "\$ART\/native-plan-apply-and-plan.json"/);
    const refusal = lines.find(line => line.startsWith('[ "$OUT" = "exit 0" ] ||'))!;
    for (const word of ['equal = nothing applied (rbD-A, or DR4AGAIN)', '[MIGRATION_LOCK_RETRY]', 'else rbD-B', 'only the proposal refused: ask']) expect(refusal, word).toContain(word);
  });

  it('DR4AGAIN never moves DR4\'s plan file, and goes on only when the ledger is SB1\'s plus the first new steps in order', () => {
    const lines = scriptOf('DR4AGAIN').lines;
    expect(lines.filter(code).some(line => /mv "\$ART\/native-plan-apply-and-plan\.json"/.test(line))).toBe(false);
    expect(at(lines, 'mv "$ART/native-apply-and-plan.json" "$S/native-apply-and-plan.try-$TS.json"')).toBeLessThan(lines.findIndex(line => line.startsWith('OUT=$(nat ')));
    expect(at(lines, 'cmp -s "$ART/native-plan-apply-and-plan.json" "$NP"')).toBeLessThan(lines.findIndex(line => line.startsWith('OUT=$(nat ')));
    // All applied and only the proposal refused: DR4 says ask, and so does DR4AGAIN.
    expect(at(lines, 'every step is applied already, so only the proposal was refused (as DR4 says): ask')).toBeLessThan(lines.findIndex(line => line.startsWith('OUT=$(nat ')));
    const prefix = [lines.find(line => line.startsWith('K=0; for M in '))!, lines.find(line => line.startsWith('TOPK=$('))!, lines.find(line => line.includes('the first $K of this release\'s migrations in order'))!];
    const dir = mkdtempSync(join(tmpdir(), 'guide-dr4again-'));
    try {
      const OLD = ['0151_a.sql', '0152_b.sql', '0153_c.sql'], NEW = ['0154_d.sql', '0155_e.sql', '0156_f.sql'];
      const run = (ledger: string[]) => {
        writeFileSync(join(dir, 'ledger'), `${ledger.join('\n')}\n`); writeFileSync(join(dir, 'new-migrations.txt'), `${NEW.join('\n')}\n`);
        return bash(['set -euo pipefail', `S='${dir}'; LEDGER0='${OLD.length}|${OLD.at(-1)}'`,
          `psqlq() { case "$1" in *"WHERE name = '"*) N=$(printf '%s' "$1" | sed -n "s/.*name = '\\(.*\\)'.*/\\1/p"); if grep -qxF "$N" "$S/ledger"; then echo 1; else echo 0; fi;; *"max(name)"*) echo "$(grep -c . "$S/ledger")|$(LC_ALL=C sort "$S/ledger" | tail -n 1)";; esac; }`,
          ...prefix, 'echo "PREFIX_OK $K"']);
      };
      expect(run(OLD)).toBe('PREFIX_OK 0');
      expect(run([...OLD, ...NEW.slice(0, 2)])).toBe('PREFIX_OK 2');
      expect(run([...OLD, ...NEW])).toBe('PREFIX_OK 3');
      // A gap, or a step this release does not name: no second run.
      expect(run([...OLD, NEW[1]!])).toMatch(/^DR4AGAIN_NOT_DONE: the ledger is not SB1's plus the first 0 /);
      expect(run([...OLD, NEW[0]!, '0199_z.sql'])).toMatch(/^DR4AGAIN_NOT_DONE: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('SWAP checks DR4 and an earlier swap before it moves the tools folder, and does nothing when the folder already is this release\'s', () => {
    const lines = scriptOf('SWAP').lines;
    const move = lines.findIndex(line => line.startsWith('mv "$OP" "$S/operator-lifecycle-v1.before"'));
    expect(move).toBeGreaterThan(-1);
    for (const needle of ['DR4 is not done', 'no tools change in this release', 'OPERATOR_FOLDER_ALREADY_THIS_RELEASE', '[ ! -e "$S/operator-lifecycle-v1.before" ] && [ ! -e "$NEWOP" ]',
      'diff -r "$NEWOP/dialectical-engine/deploy/$D" "$CAPI/dialectical-engine/deploy/$D"']) expect(at(lines, needle), needle).toBeLessThan(move);
    // The lines that build and swap the folder are SB10's own.
    const sb10 = scriptOf('SB10').lines.join('\n');
    const built = lines.filter(line => line.startsWith('git -C "$ART/source-reference" archive') || line.startsWith('chown -R root:root "$NEWOP"') || line.startsWith('find "$NEWOP"'));
    expect(built).toHaveLength(3);
    for (const line of built) {
      for (const part of line.split(' || {')[0]!.split(' && ')) expect(sb10, part).toContain(part);
      // A failed build line stops by name, with what to do: under pipefail it would otherwise end the script without a word.
      expect(line, line).toContain('|| { echo "SWAP_NOT_DONE: the new tools folder was not built ($NEWOP is a partial copy; nothing was swapped): move $NEWOP into $S, then SWAP again"; exit 1; }');
    }
    // DR5 refuses before it writes anything when DR4 or SWAP is not done.
    const dr5 = scriptOf('DR5').lines;
    const loop = dr5.findIndex(line => line.startsWith('for F in native-plan-publish.json register-published.json native-plan-verify.json'));
    expect(at(dr5, 'DR5_NOT_DONE: DR4 is not done (the ledger is not the old one plus this release\'s migrations)')).toBeLessThan(loop);
    expect(at(dr5, 'DR5_NOT_DONE: the operator folder is not this release\'s (SWAP first; nothing changed)')).toBeLessThan(loop);
    expect(drained.replace(/\s+/g, ' ')).not.toContain('run it by hand from SB10 first');
    // A refused publish says "nothing was published" only when the newest register is still SB1's.
    const refused = dr5.find(line => line.startsWith('[ "$OUT" = "exit 0" ] || { head -c 800 "$ART/register-published.json"'))!;
    const publish = (newest: string) => bash(['set -euo pipefail', `ART=$(mktemp -d); REG0=23; OUT='exit 1'; psqlq() { echo ${newest}; }`, refused, 'echo PUBLISHED_ON']).split('\n').at(-1);
    expect(publish('23')).toBe('DR5_NOT_DONE: the publish was refused (the operator\'s line above says why); nothing was published (the newest register is still 23): ask (the way back is rbD-B)');
    expect(publish('24')).toBe('DR5_NOT_DONE: the operator refused, and the newest register is 24: something WAS published: ask (rbD-B)');
  });

  it('DR5RESUME goes on only while nothing is pinned, and never moves DR4\'s plan file', () => {
    const lines = scriptOf('DR5RESUME').lines;
    const pinned = at(lines, "'.releases | has($l)' \"$LOCK\")\" = false ]");
    for (const [index, line] of lines.entries()) if (code(line) && /^(\s*)(mv|put|rel|install|OUT=\$\(nat|PIN=|SG=)/.test(line)) expect(index, line).toBeGreaterThan(pinned);
    expect(lines.filter(code).some(line => /mv "\$ART\/native-plan-apply-and-plan\.json"/.test(line))).toBe(false);
    // Nothing published: the publish plan moves aside and DR4's plan goes back, so DR5's own first guard passes again.
    expect(lines.join('\n')).toContain('  mv "$ART/native-plan-publish.json" "$DT/" || {');
    expect(lines.join('\n')).toContain('  put "$ART/native-plan-apply-and-plan.json" || {');
    // Published: from the verify plan on, DR5's own command lines.
    const dr5 = scriptOf('DR5').lines.join('\n');
    for (const line of lines.filter(line => /^(rel |  PIN=\$\(pre pin|  pre dropin|SG=\$\(lc release-switch)/.test(line))) expect(dr5, line).toContain(line.split(' || {')[0]!);
  });

  it('DR6 says how to read a stop; LATELINES, DR6AGAIN and DR6TAIL each refuse in the state that is not theirs', () => {
    const dr6 = scriptOf('DR6').lines;
    expect(at(dr6, 'GATE_CAPACITY_UNREAD')).toBeLessThan(dr6.findIndex(line => line.startsWith('T1=$(date +%s)')));
    expect(dr6.find(line => line.startsWith('for i in $(seq 1 80); do') && line.includes('debateai-preview-api@$LABEL'))).toContain('= failed ] && break;');
    expect(at(dr6, 'new website /readyz on $UIP')).toBeLessThan(dr6.findIndex(line => line.startsWith('[ "$RC" = 503 ] ||')));
    const flat = drained.replace(/\s+/g, ' ');
    expect(flat).toContain("MAIN-SITE.md's stage table");
    // LATELINES adds lines only while the old release is CURRENT and the new one STAGED, with its stopped units.
    const late = scriptOf('LATELINES').lines;
    const state = at(late, '= CURRENT ] && [ "$(jq -r --arg l "$LABEL"');
    for (const [index, line] of late.entries()) if (code(line) && /^\s*(cp|mv|addline) /.test(line)) expect(index, line).toBeGreaterThan(state);
    expect(late).toContain('lc release-env.mjs same --labels "$LABEL" --slots "$SLOT" || { echo "LATELINES_NOT_DONE: a SAME check is BAD (above; the files before are in S): ask"; exit 1; }');
    expect(late.join('\n')).toContain('the new $SVC runs or still tries to start: run DR6AGAIN first, then LATELINES again');
    // The new line starts on a line of its own, even when the file's last line has no newline.
    expect(late.join('\n')).toContain('awk 1 "$F" > "$F.new"; printf \'%s=%s\\n\' "$K" "$V" >> "$F.new"');
    // The repair order everywhere: DR6AGAIN first, then the fix, then DR6.
    for (const line of dr6.filter(line => line.includes('DR6_NOT_DONE') && line.includes('DR6AGAIN'))) expect(line, line).toMatch(/DR6AGAIN(, then| first)/);
    expect(flat).not.toMatch(/then DR6AGAIN(,| and) (then )?DR6/);
    const fencedir = sectionOf(guide, '### H11. The restore fence (from the release that carries NV-07)').split('\n').map(line => line.replace(/^ {3}/, ''));
    const guardLine = fencedir.findIndex(line => line.includes('FENCEDIR_NOT_DONE: the new API runs or still tries to start'));
    expect(guardLine).toBeGreaterThan(-1);
    expect(guardLine).toBeLessThan(fencedir.findIndex(line => line.startsWith('install -d -m 0700 -o "$AU" -g "$AGRP" "$FD"')));
    // DR6AGAIN stops nothing when the switch wrote, and clears the start counts after its stops.
    const again = scriptOf('DR6AGAIN').lines;
    const guard = at(again, 'when the switch wrote, WB4 with bash -s -- drained, then DR6TAIL');
    expect(guard).toBeLessThan(again.findIndex(line => line.startsWith('systemctl stop ')));
    expect(at(again, 'systemctl reset-failed')).toBeGreaterThan(again.findIndex(line => line.includes('systemctl stop "debateai-preview-runner@$LABEL"')));
    // DR6TAIL is DR6's own tail, run only once the new release is current.
    const tail = scriptOf('DR6TAIL').lines;
    expect(at(tail, '= CURRENT ] || { echo "DR6TAIL_NOT_DONE')).toBeLessThan(at(tail, 'lc release-retire.mjs mark-retired --label "$OLABEL"'));
    for (const needle of ['echo "DOWNTIME END $(date -u) ($(( $(date +%s) - $(tail -n 1 "$S/downtime-start-epoch") )) s)"', 'systemctl start debateai-preview-backup.timer'])
      expect(dr6.join('\n'), needle).toContain(needle), expect(tail.join('\n'), needle).toContain(needle);
  });

  it('AFTERDR6 only reads; rbD-A and rbD-B keep their order and gain what a second run needs; AGAINSAME only moves, after its guards', () => {
    expect(scriptOf('AFTERDR6').lines.join('\n')).toContain('journalctl -u "debateai-preview-api@$LABEL" --since "@$T0" -o cat --no-pager | grep -c \'"event":"api.restore_fence","outcome":"INITIALISED"\'');
    for (const line of scriptOf('AFTERDR6').lines.filter(code)) {
      expect(line, line).not.toMatch(READ_ONLY_WRITES);
      if (/(^|[\s;(])lc /.test(line)) expect(line).toMatch(/lc release-check\.mjs status/);
    }
    const rba = scriptOf('RBD_A').lines;
    expect(at(rba, 'the old runner never stopped (DR2 stopped before its runner step): nothing to start')).toBeLessThan(rba.findIndex(line => line.startsWith('[ "$(gs "$GD" "$PD" | jq -r .state)" = active ]')));
    expect(rba.join('\n')).toContain('the old API is running already');
    const rbb = scriptOf('RBD_B').lines;
    expect(rbb).toContain('install -d -o root -g root -m 0700 "$S/systemd-new-$TS"');
    expect(rbb.find(line => line.startsWith('if [ -s "$S/pg18-modes" ]; then MODE0=$(sed -n 1p "$S/pg18-modes")'))).toBeDefined();
    const again = scriptOf('AGAINSAME').lines;
    const made = again.findIndex(line => line.startsWith('install -d -o root -g root -m 0700 "$D"'));
    for (const needle of ['= CURRENT ] && [ "$(jq -r --arg l "$LABEL"', 'cmp -s "$S/release-lock.before.json" "$LOCK"', 'sha256sum -c --quiet "$S/plan-proposal.sha256"', '[ -n "$SIZE" ] || { echo "AGAINSAME_NOT_DONE', '$((SIZE * 2 + 2048))'])
      expect(at(again, needle), needle).toBeLessThan(made);
    for (const line of again.filter(code)) expect(line, line).not.toMatch(/(^|[\s;&|(])(cp|tar|rel|nat|lc release-switch)\s|systemctl (start|stop)/);
    expect(at(again, 'put "$ART/native-plan-plan.json"')).toBeGreaterThan(made);
    // Every file a downtime step refuses to find again is among the ones AGAINSAME moves.
    const moved = again.join('\n');
    for (const file of ['pg18-cold.sha256', 'pg18-v3-preview-cold.tgz', 'native-plan-apply-and-plan.json native-apply-and-plan.json native-plan-publish.json register-published.json native-plan-verify.json native-first-verify.json api-launch.json ui-launch.json runner-launch.json', '"$S"/systemd-new*'])
      expect(moved, file).toContain(file);
  });

  it('SB4 names every other BAD check on both paths, so its one expected stop of the day is read right, and a restart still owed is the owner\'s choice', () => {
    const sb4 = scriptOf('SB4').lines;
    // From the line that reads NO_MAINTENANCE's detail, which the stops below use, to the end of the verdict.
    const from = sb4.findIndex(line => line.startsWith('NM=')), to = sb4.indexOf('esac', from);
    expect(from).toBeGreaterThan(sb4.findIndex(line => line.startsWith('jq -r \'.checks[] | select(.name == "LIFECYCLE_FILES")')));
    expect(sb4[to + 1]).toBe('echo SB4_DONE');
    // The owner's choice on a restart still owed is a setting at the top, beside the two reviews.
    expect(sb4.filter(line => /^(GRR|LIFE|REBOOT)=''/.test(line)).map(line => line.split('=')[0])).toEqual(['GRR', 'LIFE', 'REBOOT']);
    const verdict = (checks: Array<[string, boolean, string?]>, name = 'DRAINED_PATH', reboot = '') => bash(['set -euo pipefail', `REBOOT='${reboot}'`,
      `OUT='${JSON.stringify({ event: 'PREVIEW_RELEASE_CHECK', verdict: name, checks: checks.map(([check, ok, detail]) => ({ name: check, ok, detail: detail ?? '' })) })}'`, ...sb4.slice(from, to + 1), 'echo SB4_DONE_REACHED']);
    const waits = 'on the first run GATE_ROWS_N1 and LIFECYCLE_FILES wait for GRR and LIFE (above); anything else: stop and ask';
    const drained = 'SB4_NOT_DONE: DRAINED_PATH (expected on a drained upload): no other check is BAD: use "Drained upload on the template layout"';
    expect(verdict([['N1_HEADERS', false], ['CURRENT_PINNED', true]])).toBe(drained);
    expect(verdict([['N1_HEADERS', false], ['GATE_ROWS_N1', false], ['LIFECYCLE_FILES', false]])).toBe(`SB4_NOT_DONE: DRAINED_PATH, and BAD too: GATE_ROWS_N1 LIFECYCLE_FILES: ${waits}`);
    expect(verdict([['N1_HEADERS', true]], 'SIDE_BY_SIDE')).toBe('SB4_DONE_REACHED');
    // NOT_READY names its BAD checks as DRAINED_PATH does; a verdict SB4 does not know is a stop of its own.
    expect(verdict([['N1_HEADERS', true], ['DISK', false], ['SLOT_FREE', false]], 'NOT_READY')).toBe(`SB4_NOT_DONE: NOT_READY, BAD: DISK SLOT_FREE: ${waits}`);
    expect(verdict([['N1_HEADERS', true]], 'NEW_VERDICT')).toBe('SB4_NOT_DONE: the release check gave no verdict (the lines above): ask');
    // A restart a system update still wants: the last line says what it is, that the owner decides, and how to go on;
    // on both paths, and only when every other BAD check waits for GRR or LIFE. Such a line no longer also says to stop
    // and ask: the owner reads only that line, and it must not say both.
    const restart = "reboot required only says a system update still wants a restart, and nothing else in the upload reads it: going on, or restarting first, is the owner's decision; to go on, run SB4 again with REBOOT='later'";
    const reviews = 'on the first run GATE_ROWS_N1 and LIFECYCLE_FILES wait for GRR and LIFE (above)';
    expect(verdict([['N1_HEADERS', false], ['NO_MAINTENANCE', false, 'reboot required']])).toBe(`SB4_NOT_DONE: DRAINED_PATH, and BAD too: NO_MAINTENANCE: ${restart}`);
    expect(verdict([['N1_HEADERS', false], ['GATE_ROWS_N1', false], ['NO_MAINTENANCE', false, 'reboot required'], ['LIFECYCLE_FILES', false]]))
      .toBe(`SB4_NOT_DONE: DRAINED_PATH, and BAD too: GATE_ROWS_N1 NO_MAINTENANCE LIFECYCLE_FILES: ${reviews}; NO_MAINTENANCE: ${restart}`);
    expect(verdict([['N1_HEADERS', true], ['NO_MAINTENANCE', false, 'reboot required']], 'NOT_READY')).toBe(`SB4_NOT_DONE: NOT_READY, BAD: NO_MAINTENANCE: ${restart}`);
    expect(verdict([['N1_HEADERS', true], ['GATE_ROWS_N1', false], ['NO_MAINTENANCE', false, 'reboot required']], 'NOT_READY')).not.toContain('stop and ask');
    // The block's own comment says which verdicts go on, REBOOT='later' included.
    expect(sb4[2]).toBe("# SB4: the release check. SIDE_BY_SIDE goes on, and so does NOT_READY whose only BAD check is the restart flag, with REBOOT='later'; DRAINED_PATH and every other NOT_READY stop here.");
    // Beside a real stop (DISK, MEMORY) there is no such sentence: that stop is read as a stop.
    expect(verdict([['N1_HEADERS', true], ['DISK', false], ['NO_MAINTENANCE', false, 'reboot required']], 'NOT_READY')).toBe(`SB4_NOT_DONE: NOT_READY, BAD: DISK NO_MAINTENANCE: ${waits}`);
    expect(verdict([['N1_HEADERS', false], ['MEMORY', false], ['NO_MAINTENANCE', false, 'reboot required']])).toBe(`SB4_NOT_DONE: DRAINED_PATH, and BAD too: MEMORY NO_MAINTENANCE: ${waits}`);
    // MT1's flag is not a restart: no sentence, and REBOOT=later does not pass it.
    for (const reboot of ['', 'later']) {
      expect(verdict([['N1_HEADERS', true], ['NO_MAINTENANCE', false, 'maintenance pending, reboot required']], 'NOT_READY', reboot)).toBe(`SB4_NOT_DONE: NOT_READY, BAD: NO_MAINTENANCE: ${waits}`);
      expect(verdict([['N1_HEADERS', true], ['NO_MAINTENANCE', false, 'maintenance pending']], 'NOT_READY', reboot)).toBe(`SB4_NOT_DONE: NOT_READY, BAD: NO_MAINTENANCE: ${waits}`);
    }
    // With REBOOT=later the restart flag alone is not counted, and SB4 says so: SB4_DONE on the side-by-side path, the
    // expected line on the drained path (naming what it did not count); any other BAD check still stops.
    const notCounted = 'NO_MAINTENANCE: reboot required is not counted (REBOOT=later: the owner goes on with the restart still owed)';
    expect(verdict([['N1_HEADERS', true], ['NO_MAINTENANCE', false, 'reboot required']], 'NOT_READY', 'later')).toBe(`${notCounted}\nSB4_DONE_REACHED`);
    expect(verdict([['N1_HEADERS', false], ['NO_MAINTENANCE', false, 'reboot required']], 'DRAINED_PATH', 'later'))
      .toBe(`${notCounted}\nSB4_NOT_DONE: DRAINED_PATH (expected on a drained upload): no other check is BAD but NO_MAINTENANCE (reboot required), not counted (REBOOT=later): use "Drained upload on the template layout"`);
    expect(verdict([['N1_HEADERS', true], ['DISK', false], ['NO_MAINTENANCE', false, 'reboot required']], 'NOT_READY', 'later')).toBe(`${notCounted}\nSB4_NOT_DONE: NOT_READY, BAD: DISK: ${waits}`);
    expect(verdict([['N1_HEADERS', false], ['GATE_ROWS_N1', false], ['NO_MAINTENANCE', false, 'reboot required']], 'DRAINED_PATH', 'later')).toBe(`${notCounted}\nSB4_NOT_DONE: DRAINED_PATH, and BAD too: GATE_ROWS_N1: ${waits}`);
    // Without the flag, REBOOT=later changes nothing.
    expect(verdict([['N1_HEADERS', false], ['CURRENT_PINNED', true]], 'DRAINED_PATH', 'later')).toBe(drained);
    expect(verdict([['N1_HEADERS', true], ['NO_MAINTENANCE', true, 'none']], 'SIDE_BY_SIDE')).toBe('SB4_DONE_REACHED');
    // The guide and the owner's runbook say how to go on, how to restart first, and where to read whether the server restarts by itself.
    const sb4Text = sectionOf(guide, guide.split('\n').find(line => line.startsWith('### SB4. '))!).replace(/\s+/g, ' ');
    expect(sb4Text).toContain("**To go on**, run SB4 again with `REBOOT='later'` at its top.");
    expect(sb4Text).toContain('`SB4_DONE` on the side-by-side path (then SB5)');
    expect(sb4Text).toContain('the lifecycle guide\'s "Boot sequence" (`deploy/preview-lifecycle/v1/README.md`): no runner starts by itself, during a drain SB14b starts the runners again');
    expect(sb4Text).toContain('`apt-config shell AR Unattended-Upgrade::Automatic-Reboot` (read-only)');
    expect(read('deploy/preview-lifecycle/v1/README.md')).toContain('4. **No runner starts at boot.**');
    const ms = read('deploy/preview-auth-dev/v1/MAIN-SITE.md').replace(/\s+/g, ' ');
    expect(ms).toContain("To go on, type `later` between the quotes of `REBOOT=''` at the top of SB4 and run it again");
    expect(ms).toContain('`apt-config shell AR Unattended-Upgrade::Automatic-Reboot` (it changes nothing)');
    // The flag is read by the release check alone: the switch reads only MT1's flag.
    expect(read('deploy/preview-lifecycle/v1/release-switch.mjs')).not.toContain('reboot-required');
    expect(read('deploy/preview-lifecycle/v1/release-check.mjs')).toContain("export const REBOOT_REQUIRED_PATH = '/run/reboot-required';");
  });

  it('DR5 says what SB4 run again does after RELEASE_LOCK_INVALID: with the lock full it changes nothing; past the room check it is a stop', () => {
    const dr5 = sectionOf(guide, guide.split('\n').find(line => line.startsWith('#### DR5. '))!).replace(/\s+/g, ' ');
    expect(dr5).not.toContain('which only reads');
    expect(dr5).toContain('run SB4 again. With the lock full it stops before the release check, changes nothing and names the retired release to archive; if it goes past the room check instead (it then runs the release check again and rewrites its two files in `$S`), stop and ask.');
    // SB4 writes those two files only after its room check, which stops on a full lock.
    const sb4 = scriptOf('SB4').lines;
    const room = sb4.findIndex(line => line === 'echo "release lock: $NL of $MX releases, room for $LABEL"');
    expect(room).toBeGreaterThan(0);
    for (const file of ['> "$S/release-check.json"', '> "$S/lifecycle-files.txt"']) expect(sb4.findIndex(line => line.includes(file)), file).toBeGreaterThan(room);
  });
});

describe('the step before Start, switched on in the upload: SHAPEON, POTS, STEPCHECK, STEPPROOF, and SB2 and SB3 with the row', async () => {
  const START = '## The step before Start, switched on in the upload';
  const ROOT = resolve(import.meta.dirname, '../..');
  const NODE = '/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node';
  const section = sectionOf(guide, START);
  const named = (step: string) => {
    const found = blocksOf(section).filter(block => block.lines.some(line => line.startsWith(`# ${step}: `)));
    expect(found, step).toHaveLength(1);
    return [...found[0]!.lines];
  };
  const bash = (script: string[]) => { const out = spawnSync('bash', ['-c', script.join('\n')], { encoding: 'utf8' }); return `${out.stdout}`.trim(); };
  const shape = await import('../../packages/register/src/debate-shape-policy.js');
  const BASE = shape.debateShapePolicyStartValues();
  const START_VALUES = shape.debateShapeStartStepStartValues();

  it('sits between the Amazon section and the transition (the step list above is unchanged), and its four steps are scripts of the runbook\'s form', async () => {
    expect(guide.indexOf(`\n${START}\n`)).toBeGreaterThan(guide.indexOf('\n## The Amazon Bedrock gate: the upload that brings it\n'));
    expect(guide.indexOf(`\n${START}\n`)).toBeLessThan(guide.indexOf(`\n${TRANSITION}\n`));
    for (const name of ['SHAPEON', 'POTS', 'STEPCHECK', 'STEPPROOF']) {
      const lines = named(name);
      expect(lines.slice(0, 2), name).toEqual(['set -euo pipefail', NAMES_LINE]);
      expect(lines.at(-1), name).toBe(`echo ${name}_DONE`);
      for (const line of lines) {
        for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], `${name}: ${line}`).toBe(name);
        if (line.includes('_NOT_DONE')) expect(line, `${name}: ${line}`).toMatch(/exit 1/);
      }
      expect(spawnSync('bash', ['-n'], { input: lines.join('\n') }).status, name).toBe(0);
    }
    // STEPCHECK's and STEPPROOF's tool calls are the tools' real command lines.
    const wrong: string[] = [];
    for (const call of invocations(blocksOf(section))) { const reason = await parserReason(call); if (reason !== 'ACTOR_REFUSED') wrong.push(`${call.script}: ${reason}: ${call.line.trim()}`); }
    expect(wrong).toEqual([]);
    expect(named('STEPCHECK').join('\n')).toContain('lc settings-version.mjs check "$LABEL" "$ACT"');
    // STEPPROOF reads the start paths the step records (migration 0159's table and columns).
    expect(named('STEPPROOF').join('\n')).toContain("SELECT source||' width '||width||' paths '||path_count FROM core.start_path_set WHERE run_id = '$RID'");
    expect(read('migrations/0159_start_paths.sql')).toMatch(/CREATE TABLE IF NOT EXISTS core\.start_path_set \(\n  run_id uuid PRIMARY KEY,\n  source text NOT NULL[^\n]*'MENU'/);
  });

  it('POTS runs the staged gate code with -I -B and calls only what that code has; it prints no amount outside its screen-only lines', () => {
    const lines = named('POTS');
    expect(lines.join('\n')).toContain('/usr/bin/python3 -I -B - "$OPS" "$GO" <<\'PY\' || {');
    const gate = readFileSync(join(ROOT, 'packages/providers/ops/preview_budget_authority.py'), 'utf8');
    for (const name of ['load_helper', 'in_flight_worst_case', 'profile_of', 'final_writer_slots', 'read_caps', 'other_gate_budget']) {
      expect(lines.join('\n'), name).toContain(`gate.${name}(`);
      expect(gate, name).toContain(`def ${name}(`);
    }
    for (const name of ['GATE_PATHS = {', 'CAPS_OWNER_UID = ']) expect(gate, name).toContain(name);
    expect(lines.join('\n')).toContain("print('on your screen only, never pasted:')");
    expect(lines.join('\n')).toContain('four calls at once fit the Anthropic pot:');
  });

  it('SHAPEON adds only startStep, with the release\'s own start values, and refuses every row that would leave the step off', () => {
    const lines = named('SHAPEON');
    const lineUp = { kind: 'PREVIEW_LINE_UP_POLICY', free_model_ids: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash'], premium_model_ids: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash', 'claude-haiku-5-5'] };
    const good = { debateShapePolicy: BASE, engineVersionPolicy: { kind: 'ENGINE_VERSION_POLICY' }, lengthGuidancePolicy: { kind: 'LENGTH_GUIDANCE_POLICY' }, previewLineUpPolicy: lineUp } as Record<string, unknown>;
    const run = (rows: Record<string, unknown>) => {
      const dir = mkdtempSync(join(tmpdir(), 'guide-shapeon-'));
      try {
        for (const folder of ['S', 'rows', 'oart', 'capi']) mkdirSync(join(dir, folder));
        symlinkSync(ROOT, join(dir, 'capi', 'dialectical-engine'));
        writeFileSync(join(dir, 'S', 'active-before'), '23\n');
        writeFileSync(join(dir, 'S', 'native-plan.before.json'), `${JSON.stringify({ operation: 'verify', pad: 'x'.repeat(3400) })}\n`);
        writeFileSync(join(dir, 'oart', 'native-plan-publish.json'), JSON.stringify({ answerSeats: null, checkerChoice: { checker: 'deepseek' } }));
        for (const [key, value] of Object.entries(rows)) writeFileSync(join(dir, 'rows', `${key}.json`), JSON.stringify(value));
        const body = lines.slice(2).map(line => line.replaceAll(NODE, process.execPath));
        const out = spawnSync('bash', ['-c', ['set -euo pipefail', `S='${dir}/S'; OART='${dir}/oart'; CAPI='${dir}/capi'; R='${dir}/rows'; OKEY=r23-0123456789ab`,
          'activev() { echo 23; }', 'install() { echo "install $*" >> "$S/installs"; }',
          `psqlq() { case "$1" in *gpt-6-luna*) cat "$R"/*.json | grep -c gpt-6-luna || true;; *) K=$(printf '%s' "$1" | sed -n "s/.*row_key = '\\([A-Za-z]*\\)'.*/\\1/p"); if [ -f "$R/$K.json" ]; then cat "$R/$K.json"; fi;; esac; }`,
          ...body].join('\n')], { encoding: 'utf8' });
        const read = (name: string) => existsSync(join(dir, 'S', name)) ? readFileSync(join(dir, 'S', name), 'utf8') : null;
        return { last: out.stdout.trim().split('\n').at(-1), on: read('shape-on.json'), base: read('shape-base.json'), installs: read('installs') };
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    const done = run(good);
    expect(done.last).toBe('SHAPEON_DONE');
    // One line each; the new row is the active one plus the release's own start values, and nothing else.
    expect(done.base!.split('\n')).toHaveLength(2);
    expect(JSON.parse(done.base!)).toEqual(BASE);
    expect(JSON.parse(done.on!)).toEqual({ ...BASE, startStep: START_VALUES });
    expect(shape.parseDebateShapePolicy(JSON.parse(done.on!)).startStep).toEqual(START_VALUES);
    expect(done.installs).toContain('/home/ubuntu/practice/shape-on.json');
    // Each row that would leave the step off stops it, and nothing is written.
    for (const [rows, reason] of [
      [{ ...good, debateShapePolicy: { ...BASE, enabled: false } }, /the debate shape row is absent or off/],
      [{ ...good, debateShapePolicy: undefined }, /the debate shape row is absent or off/],
      [{ ...good, debateShapePolicy: { ...BASE, startStep: START_VALUES } }, /carries startStep already/],
      [{ ...good, engineVersionPolicy: undefined }, /ENGINE_OFF/],
      [{ ...good, engineVersionPolicy: { kind: 'ENGINE_VERSION_POLICY', enabled: false } }, /ENGINE_OFF/],
      [{ ...good, lengthGuidancePolicy: undefined }, /no length row/],
      [{ ...good, modelScorecard: { kind: 'MODEL_SCORECARD' } }, /a scorecard row/],
      [{ ...good, previewLineUpPolicy: { ...lineUp, free_model_ids: ['zai-org/GLM-5.3-Flash', 'zai-org/GLM-5.3-Flash'] } }, /ONE_MAKER/],
      [{ ...good, previewLineUpPolicy: { ...lineUp, premium_model_ids: [...lineUp.premium_model_ids, 'us.openai.gpt-6-luna'] } }, /Luna/]
    ] as const) {
      const stopped = run(Object.fromEntries(Object.entries(rows).filter(([, value]) => value !== undefined)));
      expect(stopped.last, String(reason)).toMatch(/^SHAPEON_NOT_DONE: /);
      expect(stopped.last, String(reason)).toMatch(reason);
      expect(stopped.on, String(reason)).toBeNull();
    }
  }, 120_000);

  it('SB3 hands the row to the plan only with STARTSTEP=yes, and its delta may add the start step and nothing else', () => {
    const sb3 = scriptOf('SB3').lines;
    expect(sb3.find(line => line.startsWith('STARTSTEP='))).toMatch(/^STARTSTEP=''\s+# yes: this upload switches the step before Start on \(SHAPEON ran first\); else empty$/);
    const plan = sb3.find(line => line.startsWith('rel native-plan --operation plan --from "$FROM" '))!;
    expect(plan).toContain('--source-manifest "$ART/candidate-api-source.json" ${SHAPE:+--debate-shape "$SHAPE"} ${DS:+--checker deepseek');
    const choose = sb3.find(line => line.startsWith('case "$STARTSTEP" in'))!;
    const check = sb3.findIndex(line => line.startsWith('if [ -n "$SHAPE" ]; then jq -e --argjson s '));
    expect(check).toBeGreaterThan(sb3.findIndex(line => line.startsWith('jq -e --argjson n "$NAMED" ')));
    expect(check).toBeLessThan(sb3.findIndex(line => line.startsWith('sha256sum "$ART/native-plan-plan.json" "$ART/register-proposal.json" > "$S/plan-proposal.sha256"')));
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3-shape-'));
    try {
      const pick = (startstep: string, file: string | null) => {
        if (file === null) rmSync(join(dir, 'shape-on.json'), { force: true }); else writeFileSync(join(dir, 'shape-on.json'), file);
        return bash(['set -euo pipefail', `S='${dir}'; STARTSTEP='${startstep}'`, choose, 'echo "SHAPE=${SHAPE:-none}"']);
      };
      const on = `${JSON.stringify({ ...BASE, startStep: START_VALUES })}\n`;
      expect(pick('', null)).toBe('SHAPE=none');
      expect(pick('', on)).toBe(`SB3_NOT_DONE: SHAPEON's row exists but STARTSTEP is empty: set STARTSTEP=yes, or move ${dir}/shape-on.json aside first`);
      expect(pick('yes', on)).toBe(`SHAPE=${on.trim()}`);
      expect(pick('yes', null)).toMatch(/^SB3_NOT_DONE: STARTSTEP is yes but /);
      expect(pick('yes', `${on}${on}`)).toMatch(/^SB3_NOT_DONE: STARTSTEP is yes but /);
      expect(pick('maybe', on)).toBe('SB3_NOT_DONE: STARTSTEP is yes or empty');
      const delta = (oldRow: unknown, newRow: unknown, shapeRow: unknown = { ...BASE, startStep: START_VALUES }) => {
        writeFileSync(join(dir, 'register-proposal.json'), JSON.stringify({ delta: [{ rowKey: 'nodeRuntimeVersion', oldValueJsonText: '{}', newValueJsonText: '{}' },
          ...(newRow === null ? [] : [{ rowKey: 'debateShapePolicy', oldValueJsonText: JSON.stringify(oldRow), newValueJsonText: JSON.stringify(newRow) }])] }));
        return bash(['set -euo pipefail', `ART='${dir}'; SHAPE='${JSON.stringify(shapeRow)}'`, sb3[check]!, 'echo SHAPE_CHECKED']).split('\n');
      };
      expect(delta(BASE, { ...BASE, startStep: START_VALUES })).toEqual(['debate shape: only the start step added', 'SHAPE_CHECKED']);
      // A row written without mapStepBounds reads with the default one: that is no change.
      const { mapStepBounds: _bounds, ...withoutBounds } = BASE as Record<string, unknown>;
      expect(delta(withoutBounds, { ...BASE, startStep: START_VALUES })).toEqual(['debate shape: only the start step added', 'SHAPE_CHECKED']);
      const changedPlan = { ...BASE, plans: { ...BASE.plans, free: { ...BASE.plans.free, answers: BASE.plans.free.answers + 1 } }, startStep: START_VALUES };
      expect(delta(BASE, changedPlan)[0]).toMatch(/^SB3_NOT_DONE: the debate shape row changes more than the start step/);
      expect(delta(BASE, { ...BASE, enabled: false, startStep: START_VALUES })[0]).toMatch(/^SB3_NOT_DONE: /);
      expect(delta(BASE, null)[0]).toMatch(/^SB3_NOT_DONE: /);
      expect(delta(BASE, { ...BASE, startStep: { widths: { ...START_VALUES.widths, free: { options: [1], default: 1 } } } })[0]).toMatch(/^SB3_NOT_DONE: /);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('SB3 says in words how each watched row changes, with member names and counts and never a value', () => {
    const sb3 = scriptOf('SB3').lines;
    const at = sb3.findIndex(line => line.startsWith('jq -r \'["billingPolicy","costEnvelopePolicy","admissionPolicy",') && line.includes('watched row'));
    expect(at).toBeGreaterThan(sb3.findIndex(line => line.startsWith('if [ -n "$SHAPE" ]; then jq -e --argjson s ')));
    expect(at).toBeLessThan(sb3.findIndex(line => line.startsWith('sha256sum "$ART/native-plan-plan.json" "$ART/register-proposal.json" > "$S/plan-proposal.sha256"')));
    // The line reads the same watch list as A9's second line.
    const a9 = guide.split('\n').find(line => line.startsWith('jq -r \'["billingPolicy","costEnvelopePolicy"') && line.includes('WATCH_LIST_ABSENT'))!;
    expect(sb3[at]!.slice(0, sb3[at]!.indexOf(' as $w'))).toBe(a9.slice(0, a9.indexOf(' as $w')));
    const dir = mkdtempSync(join(tmpdir(), 'guide-sb3-watch-'));
    try {
      const row = (rowKey: string, change: string, oldValue: unknown, newValue: unknown) => ({ rowKey, change, oldValueJsonText: oldValue === null ? null : JSON.stringify(oldValue), newValueJsonText: JSON.stringify(newValue) });
      const run = (delta: unknown[]) => {
        writeFileSync(join(dir, 'register-proposal.json'), JSON.stringify({ delta }));
        return bash(['set -euo pipefail', `ART='${dir}'`, sb3[at]!, 'echo WATCH_READ']).split('\n');
      };
      expect(run([
        row('admissionPolicy', 'changed', { asks: { limit: 5 }, kind: 'A' }, { asks: { limit: 5 }, kind: 'A', start_step_calls: { limit: 7 } }),
        row('billingPolicy', 'changed', { enabled: true, withdrawal_countries: ['AT', 'US'], withdrawal_days: 14 }, { enabled: true, withdrawal_countries: ['AT', 'US', 'CA', 'AU'], withdrawal_days: 14 }),
        row('countryPolicy', 'changed', { countries: ['AT'] }, { countries: ['AT', 'CA'] }),
        row('debateShapePolicy', 'changed', BASE, { ...BASE, startStep: START_VALUES }),
        row('engineVersionPolicy', 'added', null, { kind: 'E' })
      ])).toEqual([
        'watched row admissionPolicy (changed): members added [start_step_calls], removed [], changed []',
        'watched row billingPolicy (changed): members added [], removed [], changed [withdrawal_countries: +2 -0]',
        'watched row debateShapePolicy (changed): members added [startStep], removed [], changed []',
        'watched row engineVersionPolicy (added): the whole value',
        'WATCH_READ'
      ]);
      // A changed number shows by its member's name only; a dropped member and a dropped country show too.
      const out = run([row('costEnvelopePolicy', 'changed', { daily_ceiling_micros: 11_000_000, kept: 1, gone: 2 }, { daily_ceiling_micros: 12_000_000, kept: 1 }),
        row('billingPolicy', 'changed', { withdrawal_countries: ['AT', 'US'] }, { withdrawal_countries: ['AT', 'CA'] })]);
      expect(out).toEqual(['watched row costEnvelopePolicy (changed): members added [], removed [gone], changed [daily_ceiling_micros]',
        'watched row billingPolicy (changed): members added [], removed [], changed [withdrawal_countries: +1 -1]', 'WATCH_READ']);
      expect(out.join(' ')).not.toMatch(/11000000|12000000/);
      expect(run([row('nodeRuntimeVersion', 'changed', {}, {})])).toEqual(['WATCH_READ']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('SB2 and the hosted-base practice read the hosted billing from the practice folder, give formats the line-up, and practise with SHAPEON\'s row', async () => {
    const sb2 = sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB2. '))!);
    const practice = sectionOf(guide, '### The practice (on the Mac; owner rule: before every upload)');
    for (const text of [sb2, practice]) {
      expect(text).toContain('HB_ON="$(jq -c \'.billing="on"\' "$P/hosted-billing.json")"');
      expect(text).not.toContain('/etc/debateai-v3-preview/hosted-billing-v1.json');
    }
    // Three runs with the row: the debate whose rows must match SB3's, then the step on Free, then on a paid plan.
    const runs = blocksOf(sb2).flatMap(block => block.lines).filter(line => line.includes('practice.ts debate') && line.includes('--shape-policy "$P/shape-on.json"'));
    expect(runs).toHaveLength(3);
    expect(runs.filter(line => line.includes('--start-step free:3 --digs 0')).length).toBe(1);
    expect(runs.filter(line => line.includes('--start-step premium:5 --digs 0') && line.includes('PRACTICE_PERPLEXITY_SOCKET="$D/perplexity.sock"')).length).toBe(1);
    expect(sb2).not.toContain('start-step-shape.json"');
    // formats gets the line-up as a file, written from the export's newest version, kind left out.
    const formats = blocksOf(practice).flatMap(block => block.lines).find(line => line.includes('practice.ts formats'))!;
    expect(formats).toContain('--line-up "$P/line-up.json"');
    const write = blocksOf(practice).flatMap(block => block.lines).find(line => line.startsWith('jq -ce \'.versions[-1].register_version as $v'))!;
    const { parsePracticeLineUpText } = await import('../../tools/preview-practice/practice-settings.js');
    const dir = mkdtempSync(join(tmpdir(), 'guide-lineup-'));
    try {
      const lineUp = { free_model_ids: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash'], premium_model_ids: ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4.1-Flash', 'claude-haiku-5-5'],
        thinking_levels: { 'deepseek-ai/DeepSeek-V4.1-Flash': { level: 'low' } } };
      const exportOf = (newest: string) => JSON.stringify({ schema: 'x', versions: [{ register_version: '22' }, { register_version: newest }],
        rows: [{ register_version: '22', row_key: 'previewLineUpPolicy', value_json: JSON.stringify({ kind: 'PREVIEW_LINE_UP_POLICY', ...lineUp, free_model_ids: ['old'] }) },
          { register_version: '23', row_key: 'previewLineUpPolicy', value_json: JSON.stringify({ kind: 'PREVIEW_LINE_UP_POLICY', ...lineUp }) }] });
      writeFileSync(join(dir, 'register-export.json'), exportOf('23'));
      expect(bash([`P='${dir}'`, write])).toBe('LINE_UP_FILE_WRITTEN');
      expect(JSON.parse(readFileSync(join(dir, 'line-up.json'), 'utf8'))).toEqual({ lineUp });
      expect(parsePracticeLineUpText(readFileSync(join(dir, 'line-up.json'), 'utf8')).free_model_ids).toEqual(lineUp.free_model_ids);
      // No line-up row in the newest version: nothing is printed.
      writeFileSync(join(dir, 'register-export.json'), exportOf('24'));
      expect(bash([`P='${dir}'`, write])).toBe('');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// What an upload with a full release lock, a restart still owed and an archived package store needs before the
// downtime, and the staging's A4, A6 and A7 as scripts of the runbook's form. Every label and path below is made up.
describe('before the downtime: room in the release lock, the package store, and A4 to A7 as scripts', () => {
  const ROOT = resolve(import.meta.dirname, '../..');
  const run = (script: string[]) => { const out = spawnSync('bash', ['-c', script.join('\n')], { encoding: 'utf8' }); return `${out.stdout}`.trim().split('\n').at(-1)!; };
  const between = (lines: readonly string[], first: (line: string) => boolean, last: (line: string) => boolean) => {
    const from = lines.findIndex(first), to = lines.findIndex((line, index) => index > from && last(line));
    expect(from, 'first line').toBeGreaterThan(-1);
    expect(to, 'last line').toBeGreaterThan(from);
    return lines.slice(from, to + 1);
  };

  it('SB4 reads the lock before the release check and, when it is full, names the retired release SB15 may archive', () => {
    const sb4 = scriptOf('SB4').lines;
    const room = between(sb4, line => line.startsWith('# Room in the release lock'), line => line.startsWith('echo "release lock: '));
    expect(sb4.indexOf(room[0]!)).toBeGreaterThan(sb4.findIndex(line => line.startsWith('if [ "$HC" = 1 ]')));
    expect(sb4.indexOf(room.at(-1)!)).toBeLessThan(sb4.findIndex(line => line.includes('lc release-check.mjs check')));
    for (const line of room.filter(code)) expect(line, line).not.toMatch(/(^|[\s;&|(])(cp|mv|install|chown|chmod|tee|put|nat|rel|pre)\s|systemctl (start|stop|restart|daemon-reload)/);
    // The most the lock holds is read from the release's own prestart.mjs, the file whose pin would refuse.
    expect(read('deploy/preview-lifecycle/v1/prestart.mjs')).toMatch(/^const MAX_RELEASES = 4;/m);
    const releases = { 'old1-r20-v1': '2026-10-01', 'old2-r21-v1': '2026-10-08', 'old3-r22-v1': '2026-10-15', 'cur-r23-v1': '2026-10-22' } as Record<string, string>;
    const relayOf = (label: string) => `{ path=/usr/bin/node ; argv[]=/usr/bin/node /opt/debateai-v3-preview/releases/auth-dev-candidate-${label}-api/dialectical-engine/deploy/turnstile/siteverify-relay.mjs ; ignore_errors=no }`;
    const folderOf = (label: string) => `/opt/debateai-v3-preview/releases/auth-dev-candidate-${label}-api/dialectical-engine`;
    const lockRoom = (o: { lock?: Record<string, string>; label?: string; relay?: string; workdir?: string; ownStore?: boolean; storeOf?: string; retired?: string[] }) => {
      const dir = mkdtempSync(join(tmpdir(), 'guide-lockroom-'));
      try {
        const lock = o.lock ?? releases;
        writeFileSync(join(dir, 'lock.json'), JSON.stringify({ schema: 'preview-lifecycle-release-lock-v2', releases: Object.fromEntries(Object.entries(lock).map(([label, day]) => [label,
          { releaseKey: 'r1-000000000000', slot: 'A', databaseAhead: null, services: { api: { pinnedAt: `${day}T10:00:00.000Z` }, ui: { pinnedAt: `${day}T09:00:00.000Z` } } }])) }));
        mkdirSync(join(dir, 'capi'));
        symlinkSync(ROOT, join(dir, 'capi', 'dialectical-engine'));
        if (o.ownStore ?? true) mkdirSync(join(dir, 'store', 'v11'), { recursive: true });
        const retired = o.retired ?? ['old1-r20-v1', 'old2-r21-v1', 'old3-r22-v1'];
        const status = JSON.stringify({ releases: Object.keys(lock).map(label => ({ label, state: label === 'cur-r23-v1' ? 'CURRENT' : retired.includes(label) ? 'RETIRED' : 'DRAINING' })) });
        return run(['set -euo pipefail', `LOCK='${dir}/lock.json'; CAPI='${dir}/capi'; LABEL='${o.label ?? 'new-r24-v1'}'; OLABEL=cur-r23-v1; STORE='${dir}/store'`,
          `OSTORE='/opt/debateai-v3-preview/artifacts/auth-dev-${o.storeOf ?? 'cur-r23-v1'}/pnpm-store'`,
          `lc() { [ "$1 $2" = 'release-check.mjs status' ] && printf '%s\\n' '${status}'; }`,
          // systemctl show -p <property> --value: the relay unit's ExecStart, or its WorkingDirectory (the unit's own is the current API's folder).
          `systemctl() { case "$3" in ExecStart) printf '%s\\n' '${o.relay ?? relayOf('old3-r22-v1')}';; WorkingDirectory) printf '%s\\n' '${o.workdir ?? '/opt/debateai-v3-preview/current-api/dialectical-engine'}';; esac; }`,
          'readlink() { printf \'%s\\n\' "$2"; }', ...room]);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    const archive = (label: string) => `SB4_NOT_DONE: the release lock is full (4 of 4 releases), so this release's pin would be refused (RELEASE_LOCK_INVALID): archive ${label} first with SB15 (PREV='${label}', on the owner's yes; the site stays up), then run SB4 again`;
    // Room: three releases, or this release pinned already (a run again after DR5 or SB10).
    const three = Object.fromEntries(Object.entries(releases).slice(1));
    expect(lockRoom({ lock: three })).toBe('release lock: 3 of 4 releases, room for new-r24-v1');
    expect(lockRoom({ label: 'old1-r20-v1' })).toBe('release lock: 4 of 4 releases, room for old1-r20-v1');
    // Full: the retired release pinned longest ago, never the old release, the relay's or the store's.
    expect(lockRoom({})).toBe(archive('old1-r20-v1'));
    expect(lockRoom({ relay: relayOf('old1-r20-v1') })).toBe(archive('old2-r21-v1'));
    expect(lockRoom({ relay: relayOf('old1-r20-v1'), ownStore: false, storeOf: 'old2-r21-v1' })).toBe(archive('old3-r22-v1'));
    // The store this upload started from stays even when this upload made its own: a staging again from the old release needs it.
    expect(lockRoom({ ownStore: true, storeOf: 'old1-r20-v1' })).toBe(archive('old2-r21-v1'));
    // The relay's working folder holds its release back too, written as the unit writes it or with systemd's optional mark.
    expect(lockRoom({ workdir: folderOf('old1-r20-v1') })).toBe(archive('old2-r21-v1'));
    expect(lockRoom({ workdir: `!${folderOf('old1-r20-v1')}` })).toBe(archive('old2-r21-v1'));
    expect(lockRoom({ relay: relayOf('old1-r20-v1'), workdir: folderOf('old2-r21-v1') })).toBe(archive('old3-r22-v1'));
    expect(lockRoom({ workdir: '' })).toBe(archive('old1-r20-v1'));
    expect(lockRoom({ retired: ['old2-r21-v1', 'old3-r22-v1'] })).toBe(archive('old2-r21-v1'));
    expect(lockRoom({ relay: relayOf('old1-r20-v1'), ownStore: false, storeOf: 'old2-r21-v1', retired: ['old1-r20-v1', 'old2-r21-v1'] }))
      .toBe("SB4_NOT_DONE: the release lock is full (4 of 4 releases), so this release's pin would be refused, and no retired release can be archived: the old release is the way back, and the Turnstile relay's and the package store's releases stay: ask");
    // A relay outside the release folders holds none of them back; an unread one names nothing.
    expect(lockRoom({ relay: '{ path=/usr/bin/node ; argv[]=/usr/bin/node /opt/debateai-v3-preview/turnstile/siteverify-relay.mjs ; }' })).toBe(archive('old1-r20-v1'));
    expect(lockRoom({ relay: '' })).toBe("SB4_NOT_DONE: the release lock is full (4 of 4 releases), and the Turnstile relay's program path is unread, so no release can be named for SB15: ask");
    // PRECHECK, right before the yes, reads the same room again, and a full lock is one of its BAD subjects.
    const precheck = scriptOf('PRECHECK').lines;
    const again = between(precheck, line => line.startsWith('# Room in the release lock for DR5'), line => line.includes('bad release-lock '));
    const roomAgain = (count: number, label = 'new-r24-v1') => {
      const dir = mkdtempSync(join(tmpdir(), 'guide-precheck-room-'));
      try {
        writeFileSync(join(dir, 'lock.json'), JSON.stringify({ releases: Object.fromEntries(Object.keys(releases).slice(0, count).map(name => [name, {}])) }));
        mkdirSync(join(dir, 'capi'));
        symlinkSync(ROOT, join(dir, 'capi', 'dialectical-engine'));
        return spawnSync('bash', ['-c', ['set -euo pipefail', `LOCK='${dir}/lock.json'; CAPI='${dir}/capi'; LABEL='${label}'`,
          "BAD=''; bad() { echo \"BAD ($1): $2\"; BAD=\"$BAD $1\"; }", ...again, 'echo "BAD=$BAD"'].join('\n')], { encoding: 'utf8' }).stdout.trim().split('\n');
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    expect(roomAgain(3)).toEqual(['release lock: 3 of 4 releases', 'BAD=']);
    expect(roomAgain(4, 'old1-r20-v1')).toEqual(['release lock: 4 of 4 releases', 'BAD=']);
    expect(roomAgain(4)).toEqual(['release lock: 4 of 4 releases', "BAD (release-lock): the release lock has no room for this release's pin at DR5: SB4 names the retired release SB15 may archive first", 'BAD= release-lock']);
  });

  it('SB1 takes the old release\'s own store, else the one its upload\'s names file names, and stops when that one is gone', () => {
    const sb1 = scriptOf('SB1').lines;
    expect(sb1.some(line => line.startsWith('OSTORE=\''))).toBe(false);
    const store = between(sb1, line => line.startsWith('# OSTORE, the pnpm store A3 starts from'), line => line.startsWith('echo "pnpm store for A3: '));
    expect(sb1.indexOf(store[0]!)).toBeGreaterThan(sb1.findIndex(line => line.startsWith('OLABEL=$(')));
    expect(sb1.indexOf(store.at(-1)!)).toBeLessThan(sb1.findIndex(line => line.startsWith('{ printf \'REV=%s\\nLABEL=%s\\n')));
    const pick = (o: { own?: boolean; names?: string | null; older?: boolean }) => {
      const dir = mkdtempSync(join(tmpdir(), 'guide-sb1-store-'));
      try {
        const artifacts = join(dir, 'artifacts'), archive = join(dir, 'archive');
        mkdirSync(archive);
        if (o.own) mkdirSync(join(artifacts, 'auth-dev-cur-r23-v1', 'pnpm-store', 'v11'), { recursive: true });
        if (o.older) mkdirSync(join(artifacts, 'auth-dev-old-r22-v1', 'pnpm-store', 'v11'), { recursive: true });
        if (o.names !== null) writeFileSync(join(archive, 'r23-names.sh'), `REV=x\nLABEL=cur-r23-v1\nOSTORE=${o.names ?? `${artifacts}/auth-dev-old-r22-v1/pnpm-store`}\n`);
        writeFileSync(join(archive, 'r22-names.sh'), `REV=y\nLABEL=old-r22-v1\nOSTORE=${artifacts}/auth-dev-older-r21-v1/pnpm-store\n`);
        const body = store.map(line => line.replaceAll('/opt/debateai-v3-preview/artifacts/', `${artifacts}/`).replaceAll('/root/preview-archive/', `${archive}/`));
        return run(['set -euo pipefail', 'OLABEL=cur-r23-v1', ...body]).replaceAll(dir, '<dir>');
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    expect(pick({ own: true, older: true })).toBe('pnpm store for A3: <dir>/artifacts/auth-dev-cur-r23-v1/pnpm-store');
    expect(pick({ older: true })).toBe('pnpm store for A3: <dir>/artifacts/auth-dev-old-r22-v1/pnpm-store');
    expect(pick({})).toBe('SB1_NOT_DONE: no pnpm store to start from: cur-r23-v1 has none of its own, and the one its upload\'s names file names (<dir>/artifacts/auth-dev-old-r22-v1/pnpm-store) is gone (its release archived?): ask');
    expect(pick({ names: null, older: true })).toBe('SB1_NOT_DONE: no pnpm store to start from: cur-r23-v1 has none of its own, and the one its upload\'s names file names (none) is gone (its release archived?): ask');
  });

  it('SB15 never archives the release whose folder holds the store the next upload starts from', () => {
    const sb15 = scriptOf('SB15').lines;
    const guard = sb15.find(line => line.startsWith('[ -d "$STORE/v11" ] || case "$OSTORE" in'))!;
    expect(sb15.indexOf(guard)).toBeLessThan(sb15.findIndex(line => line.startsWith('AR=$(lc release-archive.mjs archive')));
    const check = (o: { own: boolean; storeOf: string }) => {
      const dir = mkdtempSync(join(tmpdir(), 'guide-sb15-store-'));
      try {
        if (o.own) mkdirSync(join(dir, 'store', 'v11'), { recursive: true });
        return run(['set -euo pipefail', `STORE='${dir}/store'; LABEL=new-r24-v1; PREV=old1-r20-v1; OSTORE='/opt/debateai-v3-preview/artifacts/auth-dev-${o.storeOf}/pnpm-store'`, guard, 'echo ARCHIVE_GOES_ON']);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    expect(check({ own: true, storeOf: 'old1-r20-v1' })).toBe('ARCHIVE_GOES_ON');
    expect(check({ own: false, storeOf: 'old2-r21-v1' })).toBe('ARCHIVE_GOES_ON');
    expect(check({ own: false, storeOf: 'old1-r20-v1' })).toMatch(/^SB15_NOT_DONE: new-r24-v1 has no pnpm store of its own and installed from the one in old1-r20-v1's folder /);
    // SB15 takes the label SB4 named; its text and NAME2 read the relay's working folder as well as its program.
    expect(sb15).toContain("PREV='<the label SB4 named, or else the release that was current before OLABEL>'");
    const text = sectionOf(guide, '### SB15. Later, on the owner\'s yes: the archive').replace(/\s+/g, ' ');
    expect(text).toContain('`systemctl show -p WorkingDirectory --value debateai-preview-turnstile`');
    const name2 = read('deploy/preview-auth-dev/v1/MAIN-SITE.md');
    expect(name2).toContain('RW=$(systemctl show -p WorkingDirectory --value debateai-preview-turnstile || true); RWR=$(readlink -f "${RW#!}" 2>/dev/null || true)');
    // A full lock found at DR5 after all: the text names the way on.
    expect(sectionOf(guide, '#### DR5. Publish, verify plan, first proof, launch plans, pins, drop-ins, stage').replace(/\s+/g, ' '))
      .toContain('A pin refused with `RELEASE_LOCK_INVALID` (and nothing pinned) means the lock was full after all');
  });

  it('A4, A6 and A7 are scripts of the runbook\'s form, and their tool calls are the tool\'s real command lines', async () => {
    const section = sectionOf(guide, '### A4-A7. Manifests, build values, UI builds, verify');
    const named = (step: string) => {
      const found = blocksOf(section).filter(block => block.lines.some(line => line.startsWith(`# ${step}: `)));
      expect(found, step).toHaveLength(1);
      return found[0]!;
    };
    for (const step of ['A4', 'A5', 'A6', 'A7']) {
      const { lines } = named(step);
      expect(lines.slice(0, 2), step).toEqual(['set -euo pipefail', NAMES_LINE]);
      expect(lines.at(-1), step).toBe(`echo ${step}_DONE`);
      for (const line of lines) {
        for (const match of line.matchAll(/([A-Z][A-Z0-9_]*)_NOT_DONE/g)) expect(match[1], `${step}: ${line}`).toBe(step);
        if (line.includes('_NOT_DONE')) expect(line, `${step}: ${line}`).toMatch(/exit 1/);
      }
      expect(spawnSync('bash', ['-n'], { input: lines.join('\n') }).status, step).toBe(0);
    }
    const wrong: string[] = [];
    const calls = invocations(['A4', 'A6', 'A7'].map(named));
    expect(calls.map(call => call.argv[0])).toEqual(['source-manifest', 'ui-build', 'verify', 'verify', 'verify', 'operator-digest']);
    for (const call of calls) { const reason = await parserReason(call); if (reason !== 'ACTOR_REFUSED') wrong.push(`${call.script}: ${reason}: ${call.line.trim()}`); }
    expect(wrong).toEqual([]);
    // A6 takes the names file's key on the template layout, and works it out as A5 does on the old one.
    const key = named('A6').lines.find(line => line.startsWith('[ -n "${KEY:-}" ] || KEY='))!;
    const dir = mkdtempSync(join(tmpdir(), 'guide-a6-key-'));
    try {
      writeFileSync(join(dir, 'register-before'), '23\n');
      const rev = '0123456789ab'.padEnd(40, 'c');
      expect(run(['set -euo pipefail', `S='${dir}'; REV=${rev}`, key, 'echo "$KEY"'])).toBe('r24-0123456789ab');
      expect(run(['set -euo pipefail', `S='${dir}'; REV=${rev}; KEY=r30-0123456789ab`, key, 'echo "$KEY"'])).toBe('r30-0123456789ab');
    } finally { rmSync(dir, { recursive: true, force: true }); }
    // The order on the template layout, in the guide and in the owner's runbook.
    expect(section.replace(/\s+/g, ' ')).toContain('so the order there is A4, SB1b, A6, A7');
    expect(read('deploy/preview-auth-dev/v1/MAIN-SITE.md').replace(/\s+/g, ' ')).toContain('A3, A4, SB1b (in place of A5), A6 and A7');
  });
});
