// Side-by-side spec §12 and "The transition": the preview release guide (deploy/preview-release/v1/README.md) is what the
// operator runs on the live preview server, so its new sections are checked as code here. Each step is one fenced `sh`
// script: `set -euo pipefail`, the release's names file, guards that stop with `<STEP>_NOT_DONE` and `exit 1`, and
// `<STEP>_DONE` as the last line. Every call of a release tool in those sections is handed to that tool's own argument
// parser (with the platform refused, so nothing runs): a flag or a subcommand the tool does not know fails here, not on
// the server. Only the new sections are read; the R19 recipe above them stays as it ran.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8');
const guide = read('deploy/preview-release/v1/README.md');

const TRANSITION = '## Transition release T (one last drained upload)';
const SIDE_BY_SIDE = '## Side-by-side release (from T+1)';
const WAY_BACK = '### The way back, side by side';
const DRAINED = '### Drained upload on the template layout';
const MAINTENANCE = '### Infrastructure maintenance';
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
  'TA0', 'TA1', 'TA8', 'TA_UNITS', 'TA_CADDY', 'TA_ENV', 'TB0', 'TB1', 'TB2', 'TB3', 'TB4', 'TB5', 'TB6', 'TB7', 'TB8', 'TB9', 'RBA_T', 'RBB_T',
  'SB1', 'SB1B', 'SB3', 'SB4', 'SB5', 'SB7', 'SB8', 'SB9', 'SB10', 'SB11', 'SB12', 'SB13', 'SB13B', 'SB14', 'SB15',
  'WB1', 'WB2', 'WB3', 'WB4', 'DR1', 'DR2', 'DR3', 'DR4', 'DR5', 'DR6', 'RBD_A', 'RBD_B', 'MT1', 'MT2'
]);
/** The scripts that make the names file (they cannot read it yet). */
const MAKES_NAMES = Object.freeze(['TA0', 'TA1', 'SB1']);

describe('the preview release guide: transition T, side by side, the way back, the drained path (side-by-side spec §11, §12)', () => {
  it('the guide has the transition, side-by-side, way-back and drained-on-templates sections', () => {
    for (const heading of [TRANSITION, SIDE_BY_SIDE, WAY_BACK, DRAINED, MAINTENANCE]) expect(guide.split('\n'), heading).toContain(heading);
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

  it('names both owner-yes points and what each yes must say', () => {
    const t = sectionOf(guide, TRANSITION);
    expect(t).toMatch(/fresh in the live chat right before TB1/);
    for (const word of ['downtime', 'cold copy', 'max_connections', 'migrations', 'delta', 'release key', 'layout']) expect(t, word).toContain(word);
    const sb6 = sectionOf(guide, sideBySide.split('\n').find(line => line.startsWith('### SB6. '))!);
    for (const word of ['side by side', 'online backup', 'migrations', 'delta', 'release key', 'switch']) expect(sb6, word).toContain(word);
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
  YES: 'ab'.repeat(32), GRR: '01'.repeat(32), LIFE: 'yes'
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

function invocations(): Invocation[] {
  const found: Invocation[] = [];
  for (const block of allBlocks) {
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
