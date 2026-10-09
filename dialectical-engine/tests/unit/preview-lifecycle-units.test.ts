import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
    expect(value['[Service]ExecStart']).toEqual([`${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/alert.mjs --unit %i`]);
    expect(value['[Unit]OnFailure']).toBeUndefined();
  });

  it('backup runs nightly at 03:15 Bucharest time and catches up after downtime', () => {
    const timer = parse(unit('debateai-preview-backup.timer'));
    expect(timer['[Timer]OnCalendar']).toEqual(['*-*-* 03:15:00 Europe/Bucharest']);
    expect(timer['[Timer]Persistent']).toEqual(['true']);
    expect(timer['[Install]WantedBy']).toEqual(['timers.target']);
    const service = parse(unit('debateai-preview-backup.service'));
    expect(service['[Service]Type']).toEqual(['oneshot']);
    expect(service['[Service]ExecStart']).toEqual([`${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/backup.mjs`]);
    expect(service['[Service]UMask']).toEqual(['0077']);
    expect(service['[Unit]OnFailure']).toEqual(['debateai-preview-alert@%n.service']);
  });

  it('team unlock is on demand only, capped at one hour, and resets the login after any exit', () => {
    const value = parse(unit('debateai-preview-team-unlock.service'));
    expect(value['[Service]ExecStart']).toEqual([`${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/unlock-team-tools.mjs run`]);
    expect(value['[Service]ExecStopPost']).toEqual([`${NODE} ${OPERATOR}/dialectical-engine/deploy/preview-lifecycle/v1/unlock-team-tools.mjs reset`]);
    expect(Number(value['[Service]RuntimeMaxSec']![0])).toBeLessThanOrEqual(3720);
    expect(value['[Service]Restart']).toEqual(['no']);
    expect(Object.keys(value).some(key => key.startsWith('[Install]'))).toBe(false);
  });

  it('every script a template names exists in this folder', () => {
    const all = ['debateai-preview-alert@.service', 'debateai-preview-backup.service', 'debateai-preview-team-unlock.service'].map(unit).join('\n');
    const scripts = [...all.matchAll(/deploy\/preview-lifecycle\/v1\/([a-z-]+\.mjs)/g)].map(match => match[1]!);
    expect(scripts.length).toBeGreaterThanOrEqual(4);
    for (const script of scripts) expect(existsSync(join(folder, script))).toBe(true);
  });
});
