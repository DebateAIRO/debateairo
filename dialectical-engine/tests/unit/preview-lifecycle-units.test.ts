import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const folder = resolve(import.meta.dirname, '../../deploy/preview-lifecycle/v1');
const unit = (name: string) => readFileSync(join(folder, 'systemd', name), 'utf8');
/** key -> every value, in order, ignoring comments; a section prefix keeps [Unit]/[Service] apart. */
function parse(text: string) {
  const out: Record<string, string[]> = {};
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) { section = line; continue; }
    const at = line.indexOf('=');
    const key = `${section}${line.slice(0, at)}`;
    (out[key] ??= []).push(line.slice(at + 1));
  }
  return out;
}
const OPERATOR = '/opt/debateai-v3-preview/operator/lifecycle-v1';
const NODE = '/opt/debateai-toolchain/node-v26.8.2-linux-x64/bin/node';
// Like the API/UI prestart: root starts node with PATH only, never the manager's or the unit's environment.
const CLEAN_ENV = '/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin';
const SUPPORTING = ['debateai-preview-postgresql.service', 'debateai-preview-hatchet.service', 'debateai-preview-hatchet-gateway.service', 'debateai-preview-capture.service', 'debateai-preview-provider-budget.service', 'debateai-preview-turnstile.service'];
const RETIRE = `${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/release-retire.mjs`;
const runnerTemplate = () => readFileSync(resolve(folder, '../../preview-auth-dev/v1/debateai-preview-runner@.service'), 'utf8');

describe('preview lifecycle systemd templates', () => {
  // systemd >= 254 runs OnFailure= on EVERY failed attempt unless RestartMode=direct: without it a
  // crash that heals itself would still email "gave up". direct = OnFailure only when it gives up.
  // Side-by-side spec §10: the website and the API are template units, one instance per release
  // (debateai-preview-api@<label>.service); their repo drop-in lives in the template's folder.
  it.each([
    ['debateai-preview-api@.service.d', '30', [] as string[]], ['debateai-preview-ui@.service.d', '30', ['[Unit]BindsTo']], ['debateai-preview-postgresql.service.d', '10', [] as string[]]
  ])('%s/50-lifecycle.conf restarts directly (RestartMode=direct), so OnFailure fires only when the start limit gives up', (folderName, restartSec, bound) => {
    const value = parse(unit(`${folderName}/50-lifecycle.conf`));
    expect(value).toMatchObject({
      '[Unit]StartLimitIntervalSec': ['900'], '[Unit]StartLimitBurst': ['4'], '[Unit]OnFailure': ['debateai-preview-alert@%n.service'],
      '[Service]Restart': ['on-failure'], '[Service]RestartMode': ['direct'], '[Service]RestartSec': [restartSec], '[Service]TimeoutStartSec': ['300']
    });
    // Only the website is bound (to its own release's API); nothing starts a process from this drop-in.
    expect(Object.keys(value).filter(key => /ExecStart|Requires|BindsTo|Requisite/.test(key))).toEqual(bound);
  });

  it('the old fixed API and website drop-in folders are gone from the repo', () => {
    expect(existsSync(join(folder, 'systemd/debateai-preview-api.service.d'))).toBe(false);
    expect(existsSync(join(folder, 'systemd/debateai-preview-ui.service.d'))).toBe(false);
    expect(existsSync(resolve(folder, '../../preview-auth-dev/v1/debateai-preview-runner.service'))).toBe(false);
  });

  it.each(['debateai-preview-api@.service.d', 'debateai-preview-ui@.service.d'])('%s: the release drop-in repeats exactly the restart settings of 50-lifecycle.conf', async folderName => {
    const { LIFECYCLE_RESTART } = await import('../../deploy/' + 'preview-lifecycle/v1/prestart.mjs');
    const value = parse(unit(`${folderName}/50-lifecycle.conf`));
    const restartKeys = Object.keys(value).filter(key => /^\[(Unit|Service)\](Restart|StartLimit|OnFailure|TimeoutStart)/.test(key));
    const repeated = [...LIFECYCLE_RESTART.unit.map(([key, v]: string[]) => [`[Unit]${key}`, v]), ...LIFECYCLE_RESTART.service.map(([key, v]: string[]) => [`[Service]${key}`, v])];
    expect(repeated.map(([key]) => key).sort()).toEqual(restartKeys.sort());
    for (const [key, v] of repeated) expect(value[key!]).toEqual([v]);
  });

  it('API: hard dependencies become soft (Wants + After) on both spending gates too, never Requires', () => {
    const value = parse(unit('debateai-preview-api@.service.d/50-lifecycle.conf'));
    const wanted = [...SUPPORTING, 'debateai-preview-anthropic-budget.service'].sort();
    expect(value['[Unit]Wants']!.join(' ').split(' ').sort()).toEqual(wanted);
    expect(value['[Unit]After']!.join(' ').split(' ').sort()).toEqual(wanted);
  });

  it('the API instance caps its memory and records its own stop as root', () => {
    const value = parse(unit('debateai-preview-api@.service.d/50-lifecycle.conf'));
    expect(value['[Service]MemoryMax']).toEqual(['2G']);
    expect(value['[Service]ExecStopPost']).toEqual([`+${CLEAN_ENV} ${NODE} ${RETIRE} stopped --service api --label %i`]);
  });

  it('the website instance is bound to its own slot\'s API', () => {
    const value = parse(unit('debateai-preview-ui@.service.d/50-lifecycle.conf'));
    expect(value['[Unit]BindsTo']).toEqual(['debateai-preview-api@%i.service']);
    expect(value['[Unit]After']).toEqual(['debateai-preview-api@%i.service']);
    expect(value['[Unit]Wants']).toBeUndefined();
    expect(value['[Service]MemoryMax']).toEqual(['1G']);
    expect(value['[Service]ExecStopPost']).toBeUndefined();
    expect(JSON.stringify(value)).not.toContain('debateai-preview-api.service');
  });

  it('the runner template wants both gates, caps its memory and records its stop', () => {
    const value = parse(runnerTemplate());
    expect(value['[Unit]Wants']).toEqual(['debateai-preview-postgresql.service debateai-preview-hatchet.service debateai-preview-hatchet-gateway.service debateai-preview-provider-budget.service debateai-preview-anthropic-budget.service']);
    expect(value['[Unit]After']).toEqual(value['[Unit]Wants']);
    expect(value['[Service]MemoryMax']).toEqual(['3G']);
    expect(value['[Service]ExecStopPost']).toEqual([`+${CLEAN_ENV} ${NODE} ${RETIRE} stopped --service runner --label %i`]);
    expect(value['[Service]ReadOnlyPaths']![0]!.split(' ')[0]).toBe('/etc/debateai-v3-preview/auth-dev-v1/runner-%i.env');
    expect(value['[Service]Restart']).toEqual(['no']);
    expect(Object.keys(value).filter(key => /^\[Service\]ExecStart|^\[Install\]/.test(key))).toEqual([]);
  });

  it('the stop recorder fits inside each unit\'s stop timeout (its own deadline is 25 s)', async () => {
    const { STOP_RECORD_DEADLINE_MS } = await import('../../deploy/' + 'preview-lifecycle/v1/release-retire.mjs');
    expect(Number(parse(runnerTemplate())['[Service]TimeoutStopSec']![0]) * 1000).toBeGreaterThan(STOP_RECORD_DEADLINE_MS);
    // The API's TimeoutStopSec comes from its live base unit (unit-templates.mjs compare keeps it unchanged); this drop-in never lowers it.
    expect(parse(unit('debateai-preview-api@.service.d/50-lifecycle.conf'))['[Service]TimeoutStopSec']).toBeUndefined();
  });

  it.each([
    ['debateai-preview-api@.service.d/50-lifecycle.conf', 'api'], ['runner template', 'runner']
  ])('%s ExecStopPost, run as written, hands node no inherited NODE_OPTIONS or NODE_PATH', (name, service) => {
    const text = service === 'runner' ? runnerTemplate() : unit(name);
    const line = parse(text)['[Service]ExecStopPost']![0]!;
    // `+` = full privileges (root, no sandbox); systemd strips it before running the command.
    expect(line.startsWith('+')).toBe(true);
    const probe = join(mkdtempSync(join(tmpdir(), 'lifecycle-unit-env-')), 'probe.mjs');
    writeFileSync(probe, 'process.stdout.write(JSON.stringify({ env: process.env, execArgv: process.execArgv, argv: process.argv.slice(2) }));\n');
    const argv = line.slice(1).split(' ').map(part => (part === NODE ? process.execPath : part === RETIRE ? probe : part));
    const result = spawnSync(argv[0]!, argv.slice(1), { env: { ...process.env, NODE_OPTIONS: '--require=/nonexistent-preload.cjs', NODE_PATH: '/nonexistent-modules' }, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const seen = JSON.parse(result.stdout);
    delete seen.env.__CF_USER_TEXT_ENCODING;
    expect(seen).toEqual({ env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' }, execArgv: [], argv: ['stopped', '--service', service, '--label', '%i'] });
  });

  it('the backstop timer has no relative time and survives a reboot', () => {
    const timer = parse(unit('debateai-preview-runner-retire@.timer'));
    // The switch writes debateai-preview-runner-retire@<label>.timer.d/50-at.conf with the absolute UTC OnCalendar=.
    expect(Object.keys(timer).filter(key => /^\[Timer\]On/.test(key))).toEqual([]);
    expect(timer['[Timer]Unit']).toEqual(['debateai-preview-runner-retire@%i.service']);
    expect(timer['[Timer]Persistent']).toEqual(['true']);
    expect(timer['[Timer]AccuracySec']).toEqual(['1s']);
    expect(timer['[Install]WantedBy']).toEqual(['timers.target']);
    const service = parse(unit('debateai-preview-runner-retire@.service'));
    expect(service['[Service]Type']).toEqual(['oneshot']);
    expect(service['[Service]ExecStart']).toEqual([`${CLEAN_ENV} ${NODE} ${RETIRE} retire-request --label %i`]);
    expect(service['[Unit]OnFailure']).toEqual(['debateai-preview-alert@%n.service']);
    expect(service['[Service]TimeoutStartSec']).toEqual(['120']);
    expect(Object.keys(service).some(key => key.startsWith('[Install]'))).toBe(false);
  });

  it('the 25-minute check is an absolute time that survives a reboot and can be armed again', () => {
    const timer = parse(unit('debateai-preview-runner-retire-check@.timer'));
    // retire-request writes debateai-preview-runner-retire-check@<label>.timer.d/50-at.conf with OnCalendar = the
    // latest RETIRE_REQUESTED + 1,500 s in UTC (pinned in preview-lifecycle-release-retire.test.ts), then enables it.
    expect(Object.keys(timer).filter(key => /^\[Timer\]On/.test(key))).toEqual([]);
    expect(timer['[Timer]Unit']).toEqual(['debateai-preview-runner-retire-check@%i.service']);
    expect(timer['[Timer]Persistent']).toEqual(['true']);
    expect(timer['[Timer]AccuracySec']).toEqual(['1s']);
    // Once elapsed the timer goes inactive, so a later arm (a second drain after a rollback) starts it again.
    expect(timer['[Timer]RemainAfterElapse']).toEqual(['false']);
    expect(timer['[Install]WantedBy']).toEqual(['timers.target']);
    const service = parse(unit('debateai-preview-runner-retire-check@.service'));
    expect(service['[Service]Type']).toEqual(['oneshot']);
    expect(service['[Service]ExecStart']).toEqual([`${CLEAN_ENV} ${NODE} ${RETIRE} retire-check --label %i`]);
    expect(service['[Unit]OnFailure']).toEqual(['debateai-preview-alert@%n.service']);
    expect(service['[Service]TimeoutStartSec']).toEqual(['300']);
  });

  it('the check service has room for a runner stop, the 5 s settle and both gate reads and re-opens', () => {
    // systemctl stop waits up to 90 s, the gate calls 30 s each (2 reads before, 2 after, up to 2 re-opens), plus the settle.
    const service = parse(unit('debateai-preview-runner-retire-check@.service'));
    expect(Number(service['[Service]TimeoutStartSec']![0])).toBeGreaterThanOrEqual(90 + 5 + 6 * 30);
  });

  it('debateai-preview.target no longer wants a fixed API or website', () => {
    const value = parse(unit('debateai-preview.target'));
    expect(value['[Install]WantedBy']).toEqual(['multi-user.target']);
    expect(value['[Unit]Wants']!.join(' ').split(' ').sort()).toEqual(['network-online.target', ...SUPPORTING,
      'debateai-preview-gate-halt-watch.timer', 'debateai-preview-gate-addresses.timer'].sort());
    expect(JSON.stringify(value)).not.toContain('runner');
    // The switch (D10) names the current release's instances in a drop-in of the target.
    expect(unit('debateai-preview.target')).toContain('debateai-preview.target.d/60-current-release.conf');
  });

  it('the team unlock no longer orders itself after a fixed API unit', () => {
    const value = parse(unit('debateai-preview-team-unlock.service'));
    expect(value['[Unit]After']!.join(' ').split(' ')).toEqual(['debateai-preview-postgresql.service', 'debateai-preview-capture.service']);
  });

  it('alert template runs the reviewed alert script for the failed unit', () => {
    const value = parse(unit('debateai-preview-alert@.service'));
    expect(value['[Service]Type']).toEqual(['oneshot']);
    expect(value['[Service]ExecStart']).toEqual([`${CLEAN_ENV} ${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/alert.mjs --unit %i`]);
    expect(value['[Unit]OnFailure']).toBeUndefined();
  });

  it('backup runs nightly at 03:15 Bucharest time and catches up after downtime', () => {
    const timer = parse(unit('debateai-preview-backup.timer'));
    expect(timer['[Timer]OnCalendar']).toEqual(['*-*-* 03:15:00 Europe/Bucharest']);
    expect(timer['[Timer]Persistent']).toEqual(['true']);
    expect(timer['[Install]WantedBy']).toEqual(['timers.target']);
    const service = parse(unit('debateai-preview-backup.service'));
    expect(service['[Service]Type']).toEqual(['oneshot']);
    expect(service['[Service]ExecStart']).toEqual([`${CLEAN_ENV} ${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/backup.mjs`]);
    expect(service['[Service]UMask']).toEqual(['0077']);
    expect(service['[Unit]OnFailure']).toEqual(['debateai-preview-alert@%n.service']);
  });

  it('team unlock is on demand only, capped at one hour, and resets the login after any exit', () => {
    const value = parse(unit('debateai-preview-team-unlock.service'));
    expect(value['[Service]ExecStart']).toEqual([`${CLEAN_ENV} ${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/unlock-team-tools.mjs run`]);
    expect(value['[Service]ExecStopPost']).toEqual([`${CLEAN_ENV} ${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/unlock-team-tools.mjs reset`]);
    expect(Number(value['[Service]RuntimeMaxSec']![0])).toBeLessThanOrEqual(3720);
    expect(value['[Service]Restart']).toEqual(['no']);
    expect(Object.keys(value).some(key => key.startsWith('[Install]'))).toBe(false);
  });

  it('every root node command of the lifecycle units goes through env -i with PATH only', () => {
    for (const name of ['debateai-preview-alert@.service', 'debateai-preview-notice@.service', 'debateai-preview-backup.service', 'debateai-preview-team-unlock.service', 'debateai-preview-runner-retire@.service', 'debateai-preview-runner-retire-check@.service']) {
      const value = parse(unit(name));
      const commands = Object.entries(value).filter(([key]) => /^\[Service\]Exec(Start|StartPre|StartPost|Stop|StopPost|Reload|Condition)$/.test(key)).flatMap(([, lines]) => lines);
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) expect(command.startsWith(`${CLEAN_ENV} ${NODE} `)).toBe(true);
    }
  });

  it.each([
    ['debateai-preview-team-unlock.service', 'ExecStart'], ['debateai-preview-team-unlock.service', 'ExecStopPost'],
    ['debateai-preview-alert@.service', 'ExecStart'], ['debateai-preview-notice@.service', 'ExecStart'], ['debateai-preview-backup.service', 'ExecStart'],
    ['debateai-preview-runner-retire@.service', 'ExecStart'], ['debateai-preview-runner-retire-check@.service', 'ExecStart']
  ])('%s %s, run as written, hands node no inherited NODE_OPTIONS or NODE_PATH', (name, key) => {
    const line = parse(unit(name))[`[Service]${key}`]![0]!;
    const probe = join(mkdtempSync(join(tmpdir(), 'lifecycle-unit-env-')), 'probe.mjs');
    writeFileSync(probe, 'process.stdout.write(JSON.stringify({ env: process.env, execArgv: process.execArgv }));\n');
    // The unit's own argv, with only the server node and script swapped for this machine's node and a probe.
    const argv = line.split(' ').map(part => (part === NODE ? process.execPath : part.startsWith(`${OPERATOR}/`) && part.endsWith('.mjs') ? probe : part));
    const result = spawnSync(argv[0]!, argv.slice(1), { env: { ...process.env, NODE_OPTIONS: '--require=/nonexistent-preload.cjs', NODE_PATH: '/nonexistent-modules', PREVIEW_LIFECYCLE_STAFF_DB_HOST: '127.0.0.1' }, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const seen = JSON.parse(result.stdout);
    // macOS itself adds __CF_USER_TEXT_ENCODING to every process; Linux adds nothing.
    delete seen.env.__CF_USER_TEXT_ENCODING;
    expect(seen).toEqual({ env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin' }, execArgv: [] });
  });

  // Off the server (not Linux root) each script refuses at once; this proves it loads, imports
  // and reports with nothing but PATH in its environment.
  it.each([
    ['unlock-team-tools.mjs', ['reset'], 1, 'stderr', { event: 'PREVIEW_TEAM_TOOLS_RESET_FAILED', roleReset: false }],
    ['alert.mjs', ['--unit', 'debateai-preview-api.service'], 0, 'stdout', { event: 'PREVIEW_LIFECYCLE_ALERT_FAILED', reason: 'ACTOR_REFUSED' }],
    ['alert.mjs', ['--install-owner-list'], 1, 'stdout', { event: 'PREVIEW_LIFECYCLE_OWNER_LIST_FAILED', reason: 'ACTOR_REFUSED' }],
    ['backup.mjs', [], 1, 'stderr', { event: 'PREVIEW_BACKUP_FAILED', reason: 'ACTOR_REFUSED' }]
  ] as const)('%s loads and refuses cleanly with no environment but PATH', (script, args, status, stream, event) => {
    const result = spawnSync('/usr/bin/env', ['-i', 'PATH=/usr/sbin:/usr/bin:/sbin:/bin', process.execPath, join(folder, script), ...args], { encoding: 'utf8' });
    expect(result.status).toBe(status);
    expect(JSON.parse(result[stream].trim())).toMatchObject(event);
  });

  it('team unlock gives the main process and the reset each room for one 120 s database actor call when stopping', async () => {
    const unlock = await import('../../deploy/' + 'preview-lifecycle/v1/unlock-team-tools.mjs');
    const value = parse(unit('debateai-preview-team-unlock.service'));
    expect(Number(value['[Service]TimeoutStopSec']![0]) * 1000).toBeGreaterThan(unlock.CREATOR_TIMEOUT_MS);
  });

  it('team unlock emails when the run or the reset fails, and never writes a core dump of the process holding the password', () => {
    const value = parse(unit('debateai-preview-team-unlock.service'));
    expect(value['[Unit]OnFailure']).toEqual(['debateai-preview-alert@%n.service']);
    expect(value['[Service]LimitCORE']).toEqual(['0']);
  });

  it('offers no repeated-crash email: with RestartMode=direct, OnFailure never runs on an automatic restart', () => {
    const texts = [unit('debateai-preview-alert@.service'), readFileSync(join(folder, 'README.md'), 'utf8'), readFileSync(join(folder, 'alert.mjs'), 'utf8')];
    for (const text of texts) expect(text).not.toMatch(/crash-alert-after|crashAlertAfter/);
  });

  // The peer readiness writer is the default (no writer named on the ExecStart line). The interim
  // recovery login is a fallback the operator installs as one drop-in and removes again.
  const FALLBACK = 'fallback/50-interim-recovery-login.conf';
  const FALLBACK_RUN = `${CLEAN_ENV} PREVIEW_LIFECYCLE_STAFF_WRITER=interim-recovery-login ${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/unlock-team-tools.mjs run`;

  it('team unlock names no writer by default, so the unlock uses the peer readiness writer', () => {
    expect(unit('debateai-preview-team-unlock.service')).not.toMatch(/^\s*[^#\s].*PREVIEW_LIFECYCLE_STAFF_WRITER/m);
  });

  it('the interim fallback drop-in only replaces ExecStart, naming the writer on its own env -i line', () => {
    const value = parse(unit(FALLBACK));
    expect(Object.keys(value)).toEqual(['[Service]ExecStart']);
    expect(value['[Service]ExecStart']).toEqual(['', FALLBACK_RUN]);
  });

  it('the fallback ExecStart, run as written, hands node exactly PATH and the writer name', () => {
    const probe = join(mkdtempSync(join(tmpdir(), 'lifecycle-unit-env-')), 'probe.mjs');
    writeFileSync(probe, 'process.stdout.write(JSON.stringify({ env: process.env, execArgv: process.execArgv }));\n');
    const line = parse(unit(FALLBACK))['[Service]ExecStart']!.at(-1)!;
    const argv = line.split(' ').map(part => (part === NODE ? process.execPath : part.startsWith(`${OPERATOR}/`) && part.endsWith('.mjs') ? probe : part));
    const result = spawnSync(argv[0]!, argv.slice(1), { env: { ...process.env, NODE_OPTIONS: '--require=/nonexistent-preload.cjs', PREVIEW_LIFECYCLE_STAFF_DB_HOST: '127.0.0.1' }, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const seen = JSON.parse(result.stdout);
    delete seen.env.__CF_USER_TEXT_ENCODING;
    expect(seen).toEqual({ env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', PREVIEW_LIFECYCLE_STAFF_WRITER: 'interim-recovery-login' }, execArgv: [] });
  });

  it('the README installs the fallback drop-in by its real name', () => {
    const readme = readFileSync(join(folder, 'README.md'), 'utf8');
    expect(readme).toContain(`systemd/${FALLBACK}`);
    expect(readme).toContain('/etc/systemd/system/debateai-preview-team-unlock.service.d/50-interim-recovery-login.conf');
    expect(readme).toMatch(/CONNECTION LIMIT 2/);
  });

  /**
   * The readiness login is reached by peer authentication from ONE dedicated OS user, never root:
   * any process the kernel reports as uid 0 (a root container on the same socket, say) would
   * otherwise get in. The production templates (deploy/postgres) carry no such line; the preview's
   * lines live only in this README.
   */
  it('the README creates the dedicated no-login OS user and maps only it (never root), with the pg_hba line first', () => {
    const readme = readFileSync(join(folder, 'README.md'), 'utf8');
    const collapsed = readme.replace(/[ \t]+/g, ' ');
    expect(readme).toContain('useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin debateai-readiness');
    expect(collapsed).toContain('readiness debateai-readiness debateai_staff_readiness_writer');
    expect(collapsed).toContain('local debateai debateai_staff_readiness_writer peer map=readiness');
    expect(collapsed).not.toMatch(/readiness root debateai_staff_readiness_writer/);
    // The scripted edits: the pg_ident line names the dedicated user; the pg_hba line goes in as line 1.
    expect(readme).toContain("printf '%s\\n' 'readiness  debateai-readiness  debateai_staff_readiness_writer' >> \"$IDENT\"");
    expect(readme).toContain("sed -i '1i local  debateai  debateai_staff_readiness_writer  peer  map=readiness' \"$HBA\"");
    // Verification: the dedicated user gets in; root, the same command, does not.
    expect(readme).toContain("runuser -u debateai-readiness -- /usr/bin/env -i /usr/lib/postgresql/18/bin/psql -w --host=/run/debateai-v3-preview/postgresql --port=5434 --username=debateai_staff_readiness_writer -d debateai -XAtc 'SELECT session_user, current_user'");
    expect(readme).toContain("/usr/bin/env -i /usr/lib/postgresql/18/bin/psql -w --host=/run/debateai-v3-preview/postgresql --port=5434 --username=debateai_staff_readiness_writer -d debateai -XAtc 'SELECT session_user'");
    expect(readme).toContain('STAFF_WRITER_FALLBACK_NOT_NEEDED');
  });

  it('names the batch step by what it is, never by a migration number that may still change', () => {
    for (const text of [unit('debateai-preview-team-unlock.service'), unit(FALLBACK), readFileSync(join(folder, 'README.md'), 'utf8'), readFileSync(join(folder, 'unlock-team-tools.mjs'), 'utf8'), readFileSync(join(folder, 'readiness-writer-actor.mjs'), 'utf8')]) {
      expect(text).not.toMatch(/\b0109\b/);
    }
  });

  it('every script a template names exists in this folder', () => {
    const all = ['debateai-preview-alert@.service', 'debateai-preview-notice@.service', 'debateai-preview-backup.service', 'debateai-preview-team-unlock.service', FALLBACK,
      'debateai-preview-runner-retire@.service', 'debateai-preview-runner-retire-check@.service', 'debateai-preview-api@.service.d/50-lifecycle.conf'].map(unit).join('\n') + runnerTemplate();
    const scripts = [...all.matchAll(/deploy\/preview-lifecycle\/v1\/([a-z-]+\.mjs)/g)].map(match => match[1]!);
    expect(scripts.length).toBeGreaterThanOrEqual(8);
    for (const script of scripts) expect(existsSync(join(folder, script))).toBe(true);
  });
});
