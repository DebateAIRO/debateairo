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

describe('preview lifecycle systemd templates', () => {
  // systemd >= 254 runs OnFailure= on EVERY failed attempt unless RestartMode=direct: without it a
  // crash that heals itself would still email "gave up". direct = OnFailure only when it gives up.
  it.each([
    ['debateai-preview-api.service.d', '30'], ['debateai-preview-ui.service.d', '30'], ['debateai-preview-postgresql.service.d', '10']
  ])('%s/50-lifecycle.conf restarts directly (RestartMode=direct), so OnFailure fires only when the start limit gives up', (folderName, restartSec) => {
    const value = parse(unit(`${folderName}/50-lifecycle.conf`));
    expect(value).toMatchObject({
      '[Unit]StartLimitIntervalSec': ['900'], '[Unit]StartLimitBurst': ['4'], '[Unit]OnFailure': ['debateai-preview-alert@%n.service'],
      '[Service]Restart': ['on-failure'], '[Service]RestartMode': ['direct'], '[Service]RestartSec': [restartSec], '[Service]TimeoutStartSec': ['300']
    });
    expect(Object.keys(value).filter(key => /ExecStart|Requires|BindsTo|Requisite/.test(key))).toEqual([]);
  });

  it.each(['debateai-preview-api.service.d', 'debateai-preview-ui.service.d'])('%s: the release drop-in repeats exactly the restart settings of 50-lifecycle.conf', async folderName => {
    const { LIFECYCLE_RESTART } = await import('../../deploy/' + 'preview-lifecycle/v1/prestart.mjs');
    const value = parse(unit(`${folderName}/50-lifecycle.conf`));
    const restartKeys = Object.keys(value).filter(key => /^\[(Unit|Service)\](Restart|StartLimit|OnFailure|TimeoutStart)/.test(key));
    const repeated = [...LIFECYCLE_RESTART.unit.map(([key, v]: string[]) => [`[Unit]${key}`, v]), ...LIFECYCLE_RESTART.service.map(([key, v]: string[]) => [`[Service]${key}`, v])];
    expect(repeated.map(([key]) => key).sort()).toEqual(restartKeys.sort());
    for (const [key, v] of repeated) expect(value[key!]).toEqual([v]);
  });

  it('API: hard dependencies become soft (Wants + After), never Requires', () => {
    const value = parse(unit('debateai-preview-api.service.d/50-lifecycle.conf'));
    expect(value['[Unit]Wants']!.join(' ').split(' ').sort()).toEqual([...SUPPORTING].sort());
    expect(value['[Unit]After']!.join(' ').split(' ').sort()).toEqual([...SUPPORTING].sort());
  });

  it('UI starts after the API and wants it', () => {
    const value = parse(unit('debateai-preview-ui.service.d/50-lifecycle.conf'));
    expect(value['[Unit]Wants']).toEqual(['debateai-preview-api.service']);
    expect(value['[Unit]After']).toEqual(['debateai-preview-api.service']);
  });

  it('one target brings the whole preview up at boot', () => {
    const value = parse(unit('debateai-preview.target'));
    expect(value['[Install]WantedBy']).toEqual(['multi-user.target']);
    expect(value['[Unit]Wants']!.join(' ').split(' ').sort()).toEqual(['network-online.target', ...SUPPORTING, 'debateai-preview-api.service', 'debateai-preview-ui.service'].sort());
    expect(JSON.stringify(value)).not.toContain('runner');
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
    for (const name of ['debateai-preview-alert@.service', 'debateai-preview-backup.service', 'debateai-preview-team-unlock.service']) {
      const value = parse(unit(name));
      const commands = Object.entries(value).filter(([key]) => /^\[Service\]Exec(Start|StartPre|StartPost|Stop|StopPost|Reload|Condition)$/.test(key)).flatMap(([, lines]) => lines);
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) expect(command.startsWith(`${CLEAN_ENV} ${NODE} `)).toBe(true);
    }
  });

  it.each([
    ['debateai-preview-team-unlock.service', 'ExecStart'], ['debateai-preview-team-unlock.service', 'ExecStopPost'],
    ['debateai-preview-alert@.service', 'ExecStart'], ['debateai-preview-backup.service', 'ExecStart']
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

  it('every script a template names exists in this folder', () => {
    const all = ['debateai-preview-alert@.service', 'debateai-preview-backup.service', 'debateai-preview-team-unlock.service'].map(unit).join('\n');
    const scripts = [...all.matchAll(/deploy\/preview-lifecycle\/v1\/([a-z-]+\.mjs)/g)].map(match => match[1]!);
    expect(scripts.length).toBeGreaterThanOrEqual(4);
    for (const script of scripts) expect(existsSync(join(folder, script))).toBe(true);
  });
});
