import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const retire = await import('../../deploy/' + 'preview-lifecycle/v1/release-retire.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');

const { GATES, retiredLinesFound, mayStart, recordStop, requestRetire, checkRetire, markDrainedRetired, disarmTimers, main } = retire;
const layout = common.LAYOUT;
const KEY = ['r19', 'd50e33165a1b'].join('-');
const OTHER_KEY = ['r20', '0123456789ab'].join('-');
const INVOCATION = ['5f0c', '9a1e', '77b2', '4c3d', '8e9f', '0a1b', '2c3d', '4e5f'].join('');
const RUNNER = 'debateai-preview-runner@old-v1.service';
const API = 'debateai-preview-api@old-v1.service';
const RETIRE_TIMER = 'debateai-preview-runner-retire@old-v1.timer';
const CHECK_TIMER = 'debateai-preview-runner-retire-check@old-v1.timer';
const CHECK_AT = '/etc/systemd/system/debateai-preview-runner-retire-check@old-v1.timer.d/50-at.conf';
const settings = (text: string) => text.split('\n').filter(line => line !== '' && !line.startsWith('#'));
const retiredJournal = (key = KEY) => ['{"kind":"DEBATEAI_RUNNER_READY"}', `DEBATEAI_RUNNER_RETIRED {"releaseKey":"${key}"}`, 'PREVIEW_RUNNER_RETIRED'].join('\n') + '\n';

const result = (stdout = '', code: number | null = 0) => ({ code, signal: null, error: undefined, timedOut: false, overflow: false, stdout: Buffer.from(stdout), stderr: Buffer.from('') });
type Options = Partial<{
  state: string; frontPairStopped: boolean; retireRequested: boolean; apiActive: boolean; runnerActive: boolean; mainStatus: string;
  journals: string[]; gates: Record<string, [string, string]>; openWork: number; writeFails: 'UNREADABLE' | 'UNREADABLE_BUT_COMMITTED' | 'REFUSED' | null;
  stopFails: boolean; noticeFails: boolean; activateFails: string[]; requestedAgoMs: number | null; apiShow: string; journalStepMs: number;
  timerLoad: Record<string, string>; failVerbs: string[]; writeUnitFails: boolean;
}>;
const START = Date.parse('2026-10-22T08:00:00.000Z');
const MINUTE = 60_000;
/** A fake server: the release table, systemd, the journal and the two gates, all behind `deps`. */
function harness(options: Options = {}) {
  const o = { state: 'DRAINING', frontPairStopped: false, retireRequested: false, apiActive: false, runnerActive: true, mainStatus: '0',
    journals: [retiredJournal()], gates: { deepinfra: ['active', 'active'], anthropic: ['active', 'active'] } as Record<string, [string, string]>,
    openWork: 0, writeFails: null, stopFails: false, noticeFails: false, activateFails: [] as string[], requestedAgoMs: 26 * MINUTE as number | null,
    apiShow: null as string | null, journalStepMs: 0, timerLoad: {} as Record<string, string>, failVerbs: [] as string[], writeUnitFails: false, ...options };
  const table = { state: o.state, frontPairStopped: o.frontPairStopped, retireRequested: o.retireRequested };
  const events: [string, string | null][] = [], systemctl: string[][] = [], shown: string[][] = [], journal: string[][] = [], gateCalls: string[][] = [], slept: number[] = [];
  const written: [string, string][] = [];
  let runnerStopped = false, journalReads = 0, clock = START;
  const timeouts: number[] = [];
  const gateOf = (argv: string[]) => GATES.find((gate: any) => argv.includes(gate.privateDir))!;
  const run = async (argv: string[], opts: any) => {
    expect(opts.env).not.toHaveProperty('NODE_OPTIONS');
    timeouts.push(opts.timeoutMs);
    if (argv[0] === layout.systemctl) {
      const rest = argv.slice(1);
      if (rest[0] === 'show') {
        shown.push(rest);
        const unit = rest[1];
        if (rest.includes('--property=InvocationID,ExecMainStatus,Result')) return result(`InvocationID=${INVOCATION}\nExecMainStatus=${o.mainStatus}\nResult=success\n`);
        if (unit === API && o.apiShow) return result(o.apiShow);
        if (unit === API) return result(o.apiActive ? 'ActiveState=active\nSubState=running\nMainPID=4242\n' : 'ActiveState=deactivating\nSubState=stop-post\nMainPID=0\n');
        if (unit === RUNNER) return result(`ActiveState=${o.runnerActive && !runnerStopped ? 'active' : 'inactive'}\n`);
        if (unit === RETIRE_TIMER || unit === CHECK_TIMER) return result(`LoadState=${o.timerLoad[unit] ?? 'loaded'}\n`);
        return result('', 1);
      }
      systemctl.push(rest);
      if (o.failVerbs.includes(rest[0]!)) return result('', 1);
      if (rest[0] === 'stop') { if (o.stopFails) return result('', 1); runnerStopped = true; }
      if (rest[0] === 'start' && rest[1] === '--no-block' && o.noticeFails) return result('', 1);
      return result();
    }
    if (argv[0] === layout.journalctl) { journal.push(argv.slice(1)); clock += o.journalStepMs; return result(o.journals[Math.min(journalReads++, o.journals.length - 1)]); }
    if (argv[0] === '/usr/bin/python3') {
      const gate = gateOf(argv);
      gateCalls.push([gate.name, argv[3]!]);
      if (argv[3] === 'status') return result(`${JSON.stringify({ state: o.gates[gate.name]![runnerStopped ? 1 : 0], window_open: true })}\n`);
      if (argv[3] === 'activate') return o.activateFails.includes(gate.name) ? result('{"status": "refused"}\n', 2) : result('{"state": "active"}\n');
    }
    throw new Error(`unexpected command ${argv.join(' ')}`);
  };
  const fail = (code: string) => Object.assign(new Error(code), { code });
  const deps: Record<string, any> = {
    run, now: () => clock, sleep: async (ms: number) => { slept.push(ms); clock += ms; },
    writeUnitFile: async (path: string, text: string) => { if (o.writeUnitFails) throw fail('LIFECYCLE_WRITE_REFUSED'); written.push([path, text]); },
    readReleaseEvents: async ({ releaseKey }: { releaseKey: string }) => {
      expect(releaseKey).toBe(KEY);
      const at = (ms: number) => new Date(ms).toISOString();
      return [{ kind: 'DRAINING', recordedAt: at(START - 8 * 60 * MINUTE), reason: null },
        ...(o.requestedAgoMs === null ? [] : [{ kind: 'RETIRE_REQUESTED', recordedAt: at(START - o.requestedAgoMs), reason: 'BACKSTOP' }])];
    },
    readLock: async () => ({ lock: { releases: { 'old-v1': { releaseKey: KEY, slot: 'A' }, 'new-v2': { releaseKey: OTHER_KEY, slot: 'B' } } } }),
    readReleaseState: async ({ releaseKey }: { releaseKey: string }) => { expect(releaseKey).toBe(KEY); return { ...table }; },
    recordReleaseEvent: async ({ releaseKey, kind, recordedBy, reason }: any) => {
      expect(releaseKey).toBe(KEY);
      expect(recordedBy).toBe('root:release-retire');
      if (o.writeFails === 'UNREADABLE' || o.writeFails === 'REFUSED') throw fail(o.writeFails === 'REFUSED' ? 'RELEASE_EVENT_REFUSED' : 'RELEASE_TABLE_UNREADABLE');
      events.push([kind, reason]);
      if (kind === 'RETIRED') table.state = 'RETIRED';
      if (kind === 'FRONT_PAIR_STOPPED') table.frontPairStopped = true;
      if (kind === 'RETIRE_REQUESTED') table.retireRequested = true;
      if (o.writeFails === 'UNREADABLE_BUT_COMMITTED') throw fail('RELEASE_TABLE_UNREADABLE');
    },
    countOpenWork: async ({ releaseKey }: { releaseKey: string }) => { expect(releaseKey).toBe(KEY); return o.openWork; }
  };
  return { deps, events, systemctl, shown, journal, gateCalls, slept, table, timeouts, written };
}
const rejectsWith = async (promise: Promise<unknown>, code: string) => { await expect(promise).rejects.toMatchObject({ code }); };

describe('the stop recorder (ExecStopPost, side-by-side spec §4)', () => {
  it("records FRONT_PAIR_STOPPED only when a draining release's API has stopped", async () => {
    for (const [state, recorded] of [['DRAINING', 'FRONT_PAIR_STOPPED'], ['CURRENT', null], ['STAGED', null]] as const) {
      const h = harness({ state, apiActive: false });
      const outcome = await recordStop({ service: 'api', label: 'old-v1', layout, deps: h.deps });
      expect(outcome.recorded).toBe(recorded);
      expect(outcome).toMatchObject({ event: recorded ? 'PREVIEW_RELEASE_STOP_RECORDED' : 'PREVIEW_RELEASE_STOP_IGNORED', service: 'api', label: 'old-v1', releaseKey: KEY, state });
      expect(h.events).toEqual(recorded ? [['FRONT_PAIR_STOPPED', null]] : []);
      expect(Object.isFrozen(outcome)).toBe(true);
    }
  });

  it('ignores an API that is still running, or a front pair already recorded', async () => {
    const running = harness({ apiActive: true });
    expect((await recordStop({ service: 'api', label: 'old-v1', layout, deps: running.deps })).recorded).toBeNull();
    expect(running.shown).toEqual([['show', API, '--property=ActiveState,SubState,MainPID', '--no-pager']]);
    // Still in its own stop (the main process is being signalled), or no main process left but before stop-post.
    for (const apiShow of ['ActiveState=deactivating\nSubState=stop-sigterm\nMainPID=4242\n', 'ActiveState=deactivating\nSubState=stop-sigterm\nMainPID=0\n', 'ActiveState=activating\nSubState=auto-restart\nMainPID=0\n']) {
      const stopping = harness({ apiShow });
      expect((await recordStop({ service: 'api', label: 'old-v1', layout, deps: stopping.deps })).recorded, apiShow).toBeNull();
      expect(stopping.events).toEqual([]);
    }
    for (const apiShow of ['ActiveState=deactivating\nSubState=final-sigterm\nMainPID=0\n', 'ActiveState=inactive\nSubState=dead\nMainPID=0\n', 'ActiveState=failed\nSubState=failed\nMainPID=0\n'])
      expect((await recordStop({ service: 'api', label: 'old-v1', layout, deps: harness({ apiShow }).deps })).recorded, apiShow).toBe('FRONT_PAIR_STOPPED');
    const again = harness({ frontPairStopped: true });
    expect((await recordStop({ service: 'api', label: 'old-v1', layout, deps: again.deps })).event).toBe('PREVIEW_RELEASE_STOP_IGNORED');
    expect(running.events).toEqual([]); expect(again.events).toEqual([]);
  });

  it('records RETIRED only for a clean exit whose own invocation printed both retirement lines', async () => {
    const clean = harness();
    expect(await recordStop({ service: 'runner', label: 'old-v1', layout, deps: clean.deps })).toEqual({
      event: 'PREVIEW_RELEASE_STOP_RECORDED', service: 'runner', label: 'old-v1', releaseKey: KEY, recorded: 'RETIRED', state: 'DRAINING'
    });
    expect(clean.events).toEqual([['RETIRED', 'RUNNER_RETIRED']]);
    expect(clean.shown).toEqual([['show', RUNNER, '--property=InvocationID,ExecMainStatus,Result', '--no-pager']]);
    expect(clean.journal[0]).toEqual(['-u', RUNNER, `_SYSTEMD_INVOCATION_ID=${INVOCATION}`, '-n', '500', '-o', 'cat', '--no-pager']);

    const ignored: Options[] = [
      { journals: ['PREVIEW_RUNNER_RETIRED\n'] },                                  // the runner never said it retired
      { journals: [`DEBATEAI_RUNNER_RETIRED {"releaseKey":"${KEY}"}\n`] },         // the launcher never confirmed
      { journals: [retiredJournal(OTHER_KEY)] },                                   // another release's line
      { mainStatus: '1' },                                                         // not a clean exit
      { state: 'CURRENT' }, { state: 'STAGED' }
    ];
    for (const options of ignored) {
      const h = harness(options);
      expect((await recordStop({ service: 'runner', label: 'old-v1', layout, deps: h.deps })).recorded, JSON.stringify(options)).toBeNull();
      expect(h.events).toEqual([]);
    }
  });

  it('waits for the last journal lines: up to five reads, one second apart', async () => {
    const late = harness({ journals: ['', 'PREVIEW_RUNNER_RETIRED\n', retiredJournal()] });
    expect((await recordStop({ service: 'runner', label: 'old-v1', layout, deps: late.deps })).recorded).toBe('RETIRED');
    expect(late.journal).toHaveLength(3);
    expect(late.slept).toEqual([1000, 1000]);
    const never = harness({ journals: [''] });
    expect((await recordStop({ service: 'runner', label: 'old-v1', layout, deps: never.deps })).recorded).toBeNull();
    expect(never.journal).toHaveLength(5);
    expect(never.slept).toEqual([1000, 1000, 1000, 1000]);
    // ExecStopPost runs inside TimeoutStopSec=30: one 25 s deadline for every read, each child cut to what is left.
    const slow = harness({ journals: [''], journalStepMs: 9000 });
    await rejectsWith(recordStop({ service: 'runner', label: 'old-v1', layout, deps: slow.deps }), 'STOP_RECORD_DEADLINE');
    expect(slow.journal.length).toBeLessThan(5);
    expect(slow.events).toEqual([]);
    expect(slow.timeouts.every(ms => ms <= 25_000)).toBe(true);
    expect(slow.timeouts.at(-1)).toBeLessThan(10_000);
    // A clean exit whose journal cannot be read at all is loud, never a silent "not retired".
    const blind = harness();
    const fake = blind.deps.run;
    blind.deps.run = async (argv: string[], opts: any) => (argv[0] === layout.journalctl ? result('', 1) : fake(argv, opts));
    await rejectsWith(recordStop({ service: 'runner', label: 'old-v1', layout, deps: blind.deps }), 'JOURNAL_UNREADABLE');
    expect(blind.events).toEqual([]);
    // A runner that did not exit cleanly is never read for retirement lines at all.
    const crashed = harness({ mainStatus: '1' });
    await recordStop({ service: 'runner', label: 'old-v1', layout, deps: crashed.deps });
    expect(crashed.journal).toEqual([]);
  });

  it('exits non-zero when the release table cannot be written, so the owner is told', async () => {
    for (const writeFails of ['UNREADABLE', 'REFUSED'] as const) {
      const h = harness({ writeFails });
      const out: string[] = [], err: string[] = [];
      const code = await main(['stopped', '--service', 'runner', '--label', 'old-v1'], { platform: 'linux', uid: 0, layout, deps: h.deps, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) } });
      expect(code).toBe(1);
      expect(out).toEqual([]);
      expect(JSON.parse(err[0]!)).toEqual({ event: 'PREVIEW_RELEASE_STOP_RECORD_FAILED', service: 'runner', label: 'old-v1', reason: writeFails === 'REFUSED' ? 'RELEASE_EVENT_REFUSED' : 'RELEASE_TABLE_UNREADABLE' });
    }
    // An unreadable answer to a write that did commit: re-read before deciding (D3 review), and it was recorded.
    const committed = harness({ writeFails: 'UNREADABLE_BUT_COMMITTED' });
    expect((await recordStop({ service: 'api', label: 'old-v1', layout, deps: committed.deps })).recorded).toBe('FRONT_PAIR_STOPPED');
    const unreadable = harness();
    unreadable.deps.readReleaseState = async () => { throw Object.assign(new Error('x'), { code: 'RELEASE_TABLE_UNREADABLE' }); };
    await rejectsWith(recordStop({ service: 'api', label: 'old-v1', layout, deps: unreadable.deps }), 'RELEASE_TABLE_UNREADABLE');
  });
});

describe('retirement lines', () => {
  it('needs both exact lines, the runner one naming this release', () => {
    expect(retiredLinesFound(retiredJournal(), KEY)).toBe(true);
    expect(retiredLinesFound(retiredJournal(), OTHER_KEY)).toBe(false);
    expect(retiredLinesFound('PREVIEW_RUNNER_RETIRED\n', KEY)).toBe(false);
    expect(retiredLinesFound(`DEBATEAI_RUNNER_RETIRED {"releaseKey":"${KEY}"}\n`, KEY)).toBe(false);
    expect(retiredLinesFound(`DEBATEAI_RUNNER_RETIRED {"releaseKey":"${KEY}"} extra\nPREVIEW_RUNNER_RETIRED\n`, KEY)).toBe(false);
    expect(retiredLinesFound(`x DEBATEAI_RUNNER_RETIRED {"releaseKey":"${KEY}"}\nPREVIEW_RUNNER_RETIRED\n`, KEY)).toBe(false);
    expect(retiredLinesFound(`DEBATEAI_RUNNER_RETIRED {"releaseKey":"${KEY}"}\nPREVIEW_RUNNER_RETIRED_SOON\n`, KEY)).toBe(false);
  });
});

describe('the backstop request (side-by-side spec §4)', () => {
  it('requests retirement once, emails the owner and arms the 25-minute check at an absolute time', async () => {
    const h = harness({ state: 'DRAINING', requestedAgoMs: 0 });
    expect(await requestRetire({ label: 'old-v1', layout, deps: h.deps })).toEqual({ event: 'PREVIEW_RELEASE_RETIRE_REQUESTED', label: 'old-v1', releaseKey: KEY });
    expect(h.events).toEqual([['RETIRE_REQUESTED', 'BACKSTOP']]);
    // The request was recorded at 08:00:00 UTC: the check is due 1,500 s later, written as one UTC calendar time that a
    // reboot cannot lose (the timer is Persistent and enabled).
    expect(h.written.map(([path]) => path)).toEqual([CHECK_AT]);
    expect(settings(h.written[0]![1])).toEqual(['[Timer]', 'OnCalendar=2026-10-22 08:25:00 UTC']);
    expect(h.systemctl).toEqual([['start', '--no-block', 'debateai-preview-notice@release-retire-old_v1.service'], ['daemon-reload'], ['enable', CHECK_TIMER], ['restart', CHECK_TIMER]]);
    // Run again (a Persistent timer after a reboot): no second row, the same time is armed again.
    const again = harness({ retireRequested: true, requestedAgoMs: 0 });
    await requestRetire({ label: 'old-v1', layout, deps: again.deps });
    expect(again.events).toEqual([]);
    expect(again.systemctl).toEqual(h.systemctl);
    expect(again.written).toEqual(h.written);
  });

  it('arms the check never earlier than 1,500 s after the latest request (rounded up to the next second)', async () => {
    for (const [agoMs, at] of [[-400, '08:25:01'], [-1000, '08:25:01'], [10 * MINUTE, '08:15:00']] as const) {
      const h = harness({ retireRequested: true, requestedAgoMs: agoMs });
      await requestRetire({ label: 'old-v1', layout, deps: h.deps });
      const line = settings(h.written[0]![1])[1]!;
      expect(line).toBe(`OnCalendar=2026-10-22 ${at} UTC`);
      const due = Date.parse(`${line.slice('OnCalendar='.length, -' UTC'.length).replace(' ', 'T')}Z`);
      expect(due - (START - agoMs)).toBeGreaterThanOrEqual(retire.RETIRE_CHECK_AFTER_MS);
      expect(due - (START - agoMs)).toBeLessThan(retire.RETIRE_CHECK_AFTER_MS + 1000);
    }
  });

  it('arms a request older than 25 minutes (a manual re-run, a second drain) one second from now, never in the past', async () => {
    // The default request is 26 minutes old; its due time 07:59:00 has passed, and a past calendar time never fires.
    const late = harness({ retireRequested: true });
    await requestRetire({ label: 'old-v1', layout, deps: late.deps });
    expect(settings(late.written[0]![1])).toEqual(['[Timer]', 'OnCalendar=2026-10-22 08:00:01 UTC']);
    // Due within the next second: still at least one second ahead (rounded up).
    const close = harness({ retireRequested: true, requestedAgoMs: 25 * MINUTE - 300 });
    await requestRetire({ label: 'old-v1', layout, deps: close.deps });
    expect(settings(close.written[0]![1])[1]).toBe('OnCalendar=2026-10-22 08:00:01 UTC');
  });

  it('writes the drop-in itself, root-style: 0644 file in a 0755 folder under the unit folder', async () => {
    const unitDir = realpathSync(mkdtempSync(join(tmpdir(), 'retire-unit-dir-')));
    const own = { ...layout, systemdUnitDir: unitDir, ownerUid: process.getuid!(), ownerGid: process.getgid!() };
    const h = harness({ requestedAgoMs: 0 });
    delete h.deps.writeUnitFile;
    await requestRetire({ label: 'old-v1', layout: own, deps: h.deps });
    const folder = join(unitDir, 'debateai-preview-runner-retire-check@old-v1.timer.d');
    expect(settings(readFileSync(join(folder, '50-at.conf'), 'utf8'))).toEqual(['[Timer]', 'OnCalendar=2026-10-22 08:25:00 UTC']);
    expect(statSync(join(folder, '50-at.conf')).mode & 0o777).toBe(0o644);
    expect(statSync(folder).mode & 0o777).toBe(0o755);
    // A second request replaces it.
    const again = harness({ retireRequested: true, requestedAgoMs: -2000 });
    delete again.deps.writeUnitFile;
    await requestRetire({ label: 'old-v1', layout: own, deps: again.deps });
    expect(settings(readFileSync(join(folder, '50-at.conf'), 'utf8'))).toEqual(['[Timer]', 'OnCalendar=2026-10-22 08:25:02 UTC']);
  });

  it('refuses loudly when the check cannot be armed', async () => {
    for (const options of [{ writeUnitFails: true }, { failVerbs: ['daemon-reload'] }, { failVerbs: ['enable'] }, { failVerbs: ['restart'] }]) {
      await rejectsWith(requestRetire({ label: 'old-v1', layout, deps: harness(options).deps }), 'RETIRE_CHECK_TIMER_FAILED');
    }
    const missing = harness({ retireRequested: true, requestedAgoMs: null });
    await rejectsWith(requestRetire({ label: 'old-v1', layout, deps: missing.deps }), 'RETIRE_STATE_REFUSED');
    expect(missing.written).toEqual([]);
  });

  it('turns both of its timers off for a retired release, and refuses any other state', async () => {
    const retired = harness({ state: 'RETIRED' });
    expect(await requestRetire({ label: 'old-v1', layout, deps: retired.deps })).toEqual({ event: 'PREVIEW_RELEASE_RETIRE_NOT_NEEDED', label: 'old-v1', releaseKey: KEY });
    expect(retired.systemctl).toEqual([['disable', '--now', RETIRE_TIMER], ['disable', '--now', CHECK_TIMER]]);
    // A check that was never armed has no time and does not load: there is nothing to turn off.
    const unarmed = harness({ state: 'RETIRED', timerLoad: { [CHECK_TIMER]: 'bad-setting' } });
    await requestRetire({ label: 'old-v1', layout, deps: unarmed.deps });
    expect(unarmed.systemctl).toEqual([['disable', '--now', RETIRE_TIMER]]);
    await rejectsWith(requestRetire({ label: 'old-v1', layout, deps: harness({ state: 'RETIRED', failVerbs: ['disable'] }).deps }), 'RETIRE_TIMER_STOP_FAILED');
    for (const state of ['CURRENT', 'STAGED', 'UNKNOWN']) {
      const h = harness({ state });
      await rejectsWith(requestRetire({ label: 'old-v1', layout, deps: h.deps }), 'RETIRE_STATE_REFUSED');
      expect(h.events).toEqual([]); expect(h.systemctl).toEqual([]); expect(h.written).toEqual([]);
    }
  });

  it('fails loudly when the owner email cannot be queued, after arming the check', async () => {
    const h = harness({ noticeFails: true });
    await rejectsWith(requestRetire({ label: 'old-v1', layout, deps: h.deps }), 'NOTICE_START_FAILED');
    expect(h.systemctl.at(-1)).toEqual(['restart', CHECK_TIMER]);
  });
});

describe('the 25-minute check (side-by-side spec §4)', () => {
  it('reports a request the runner honoured and stops nothing', async () => {
    const h = harness({ state: 'RETIRED', retireRequested: true, runnerActive: false });
    expect(await checkRetire({ label: 'old-v1', layout, deps: h.deps })).toEqual({ event: 'PREVIEW_RELEASE_RETIRE_HONOURED', label: 'old-v1', releaseKey: KEY, openWork: 0, gatesReactivated: [] });
    // The release is retired: its backstop and check timers are turned off (nothing is stopped).
    expect(h.systemctl).toEqual([['disable', '--now', RETIRE_TIMER], ['disable', '--now', CHECK_TIMER]]); expect(h.gateCalls).toEqual([]);
    await rejectsWith(checkRetire({ label: 'old-v1', layout, deps: harness({ state: 'RETIRED', retireRequested: true, runnerActive: false, failVerbs: ['disable'] }).deps }), 'RETIRE_TIMER_STOP_FAILED');
  });

  it('stops the runner and re-opens only a gate that the stop halted', async () => {
    const h = harness({ retireRequested: true, openWork: 2, gates: { deepinfra: ['active', 'halted'], anthropic: ['halted', 'halted'] } });
    const outcome = await checkRetire({ label: 'old-v1', layout, deps: h.deps });
    expect(outcome).toEqual({ event: 'PREVIEW_RELEASE_FORCED_STOP', label: 'old-v1', releaseKey: KEY, openWork: 2, gatesReactivated: ['deepinfra'], gatesReactivationFailed: [], gatesUnknown: [] });
    expect(h.systemctl).toEqual([['stop', RUNNER], ['start', '--no-block', 'debateai-preview-notice@release-forced-old_v1.service']]);
    expect(h.slept).toEqual([5000]);
    expect(h.gateCalls).toEqual([['deepinfra', 'status'], ['anthropic', 'status'], ['deepinfra', 'status'], ['anthropic', 'status'], ['deepinfra', 'activate']]);
    const deepinfra = GATES.find((gate: any) => gate.name === 'deepinfra');
    expect(deepinfra).toEqual({ name: 'deepinfra', folder: '/opt/debateai-v3-preview/operator/deepinfra-budget-v3', privateDir: '/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3', go: '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json' });
    expect(Object.isFrozen(GATES)).toBe(true);
  });

  it('runs the gates exactly as the halt notice tells the owner to', async () => {
    const calls: string[][] = [];
    const h = harness({ retireRequested: true, gates: { deepinfra: ['active', 'halted'], anthropic: ['active', 'active'] } });
    const fake = h.deps.run;
    h.deps.run = async (argv: string[], opts: any) => { if (argv[0] === '/usr/bin/python3') calls.push(argv); return fake(argv, opts); };
    await checkRetire({ label: 'old-v1', layout, deps: h.deps });
    expect(calls[0]).toEqual(['/usr/bin/python3', '-I', '/opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py', 'status', '--private', '/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3']);
    expect(calls.at(-1)).toEqual(['/usr/bin/python3', '-I', '/opt/debateai-v3-preview/operator/deepinfra-budget-v3/preview_budget_authority.py', 'activate', '--private', '/var/lib/debateai-v3-preview/provider-deepinfra-authority-v3', '--go', '/etc/debateai-v3-preview/provider-deepinfra-go-v3.json']);
  });

  it('never re-opens a gate whose state before the stop was unreadable, and exits non-zero for any gate the owner must check', async () => {
    // Unreadable before, halted after: maybe the stop's doing, so the owner looks; never re-opened blind.
    const h = harness({ retireRequested: true, gates: { deepinfra: ['unreadable', 'halted'], anthropic: ['active', 'halted'] }, activateFails: ['anthropic'] });
    expect(await checkRetire({ label: 'old-v1', layout, deps: h.deps })).toMatchObject({ gatesReactivated: [], gatesReactivationFailed: ['anthropic'], gatesUnknown: ['deepinfra'] });
    expect(h.gateCalls.filter(([, phase]) => phase === 'activate')).toEqual([['anthropic', 'activate']]);
    // Active before, unreadable after: the owner looks (exit 1), even with nothing else wrong.
    const after = harness({ retireRequested: true, gates: { deepinfra: ['active', 'unreadable'], anthropic: ['active', 'active'] } });
    const out: string[] = [], err: string[] = [];
    expect(await main(['retire-check', '--label', 'old-v1'], { platform: 'linux', uid: 0, layout, deps: after.deps, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) } })).toBe(1);
    expect(out).toEqual([]);
    expect(JSON.parse(err[0]!)).toMatchObject({ event: 'PREVIEW_RELEASE_FORCED_STOP', gatesReactivated: [], gatesReactivationFailed: [], gatesUnknown: ['deepinfra'] });
    expect(after.gateCalls.filter(([, phase]) => phase === 'activate')).toEqual([]);
    // A re-open that fails exits non-zero too.
    const refused = harness({ retireRequested: true, gates: { deepinfra: ['active', 'active'], anthropic: ['active', 'halted'] }, activateFails: ['anthropic'] });
    expect(await main(['retire-check', '--label', 'old-v1'], { platform: 'linux', uid: 0, layout, deps: refused.deps, stdout: { write: () => undefined }, stderr: { write: () => undefined } })).toBe(1);
    // Halted on both sides, or unreadable on both sides: not the stop's doing, nothing to say.
    const steady = harness({ retireRequested: true, gates: { deepinfra: ['halted', 'halted'], anthropic: ['unreadable', 'unreadable'] } });
    expect(await checkRetire({ label: 'old-v1', layout, deps: steady.deps })).toMatchObject({ gatesReactivated: [], gatesReactivationFailed: [], gatesUnknown: [] });
  });

  it('never stops a runner before 25 minutes have passed since the request', async () => {
    for (const requestedAgoMs of [0, 24 * MINUTE, 25 * MINUTE - 1]) {
      const h = harness({ retireRequested: true, requestedAgoMs });
      await rejectsWith(checkRetire({ label: 'old-v1', layout, deps: h.deps }), 'RETIRE_CHECK_TOO_EARLY');
      expect(h.systemctl).toEqual([]); expect(h.gateCalls).toEqual([]);
    }
    const missing = harness({ retireRequested: true, requestedAgoMs: null });
    await rejectsWith(checkRetire({ label: 'old-v1', layout, deps: missing.deps }), 'RETIRE_STATE_REFUSED');
    expect(missing.systemctl).toEqual([]);
    const due = harness({ retireRequested: true, requestedAgoMs: 25 * MINUTE });
    expect((await checkRetire({ label: 'old-v1', layout, deps: due.deps })).event).toBe('PREVIEW_RELEASE_FORCED_STOP');
  });

  it('reports a stranded release when its runner is already gone', async () => {
    const h = harness({ retireRequested: true, runnerActive: false, openWork: 3 });
    expect(await checkRetire({ label: 'old-v1', layout, deps: h.deps })).toEqual({ event: 'PREVIEW_RELEASE_STRANDED', label: 'old-v1', releaseKey: KEY, openWork: 3, gatesReactivated: [] });
    expect(h.systemctl).toEqual([['start', '--no-block', 'debateai-preview-notice@release-stranded-old_v1.service']]);
    expect(h.gateCalls).toEqual([]);
  });

  it("neither stops nor reports a runner of a release that is not draining under a standing request (a stale timer)", async () => {
    for (const options of [{ state: 'CURRENT', retireRequested: false }, { state: 'STAGED', retireRequested: false }, { state: 'DRAINING', retireRequested: false },
      { state: 'STAGED', retireRequested: false, runnerActive: false }, { state: 'DRAINING', retireRequested: false, runnerActive: false }, { state: 'UNKNOWN', runnerActive: false }]) {
      const h = harness(options);
      await rejectsWith(checkRetire({ label: 'old-v1', layout, deps: h.deps }), 'RETIRE_STATE_REFUSED');
      expect(h.systemctl).toEqual([]); expect(h.gateCalls).toEqual([]);
    }
  });

  it('a failed stop is loud and re-opens nothing', async () => {
    const h = harness({ retireRequested: true, stopFails: true, gates: { deepinfra: ['active', 'halted'], anthropic: ['active', 'active'] } });
    await rejectsWith(checkRetire({ label: 'old-v1', layout, deps: h.deps }), 'RUNNER_STOP_FAILED');
    expect(h.gateCalls.filter(([, phase]) => phase === 'activate')).toEqual([]);
  });
});

describe('the drained path', () => {
  it('marks a drained release retired only with no open work and no runner', async () => {
    const busy = harness({ runnerActive: true });
    await rejectsWith(markDrainedRetired({ label: 'old-v1', layout, deps: busy.deps }), 'RELEASE_RUNNER_ACTIVE');
    const open = harness({ runnerActive: false, openWork: 1 });
    await rejectsWith(markDrainedRetired({ label: 'old-v1', layout, deps: open.deps }), 'RELEASE_OPEN_WORK');
    for (const state of ['CURRENT', 'STAGED']) await rejectsWith(markDrainedRetired({ label: 'old-v1', layout, deps: harness({ state, runnerActive: false }).deps }), 'RETIRE_STATE_REFUSED');
    expect([busy, open].flatMap(h => h.events)).toEqual([]);
    const drained = harness({ runnerActive: false });
    expect(await markDrainedRetired({ label: 'old-v1', layout, deps: drained.deps })).toEqual({ event: 'PREVIEW_RELEASE_DRAINED_RETIRED', label: 'old-v1', releaseKey: KEY, openWork: 0 });
    expect(drained.events).toEqual([['RETIRED', 'DRAINED']]);
    // Retired: the backstop is turned off; the check was never armed (no request), so it does not load and is left alone.
    const unarmed = harness({ runnerActive: false, timerLoad: { [CHECK_TIMER]: 'bad-setting' } });
    await markDrainedRetired({ label: 'old-v1', layout, deps: unarmed.deps });
    expect(unarmed.systemctl).toEqual([['disable', '--now', RETIRE_TIMER]]);
    expect(drained.systemctl).toEqual([['disable', '--now', RETIRE_TIMER], ['disable', '--now', CHECK_TIMER]]);
    const done = harness({ state: 'RETIRED', runnerActive: false });
    expect(await markDrainedRetired({ label: 'old-v1', layout, deps: done.deps })).toEqual({ event: 'PREVIEW_RELEASE_RETIRE_NOT_NEEDED', label: 'old-v1', releaseKey: KEY });
    expect(done.events).toEqual([]);
    // Already retired: the timers are turned off again, so a disarm that failed last time is retried.
    expect(done.systemctl).toEqual([['disable', '--now', RETIRE_TIMER], ['disable', '--now', CHECK_TIMER]]);
    await rejectsWith(markDrainedRetired({ label: 'old-v1', layout, deps: harness({ state: 'RETIRED', runnerActive: false, failVerbs: ['disable'] }).deps }), 'RETIRE_TIMER_STOP_FAILED');
  });
});

describe('turning a release\'s timers off (exported for the rollback, D10)', () => {
  it('disables both timers of that label and leaves one that cannot load alone', async () => {
    const h = harness();
    await disarmTimers({ label: 'old-v1', layout, deps: h.deps });
    expect(h.systemctl).toEqual([['disable', '--now', RETIRE_TIMER], ['disable', '--now', CHECK_TIMER]]);
    const unarmed = harness({ timerLoad: { [CHECK_TIMER]: 'bad-setting', [RETIRE_TIMER]: 'not-found' } });
    await disarmTimers({ label: 'old-v1', layout, deps: unarmed.deps });
    expect(unarmed.systemctl).toEqual([]);
    await rejectsWith(disarmTimers({ label: 'old-v1', layout, deps: harness({ failVerbs: ['disable'] }).deps }), 'RETIRE_TIMER_STOP_FAILED');
    await rejectsWith(disarmTimers({ label: '../old', layout, deps: h.deps }), 'ARGUMENTS_REFUSED');
  });
});

describe('start gate (public server ExecStartPre)', () => {
  it('starts a website or API only for a staged or current release, a runner also while draining', async () => {
    for (const [service, state, allowed] of [['api', 'CURRENT', true], ['ui', 'STAGED', true], ['api', 'DRAINING', false], ['ui', 'RETIRED', false], ['runner', 'DRAINING', true], ['runner', 'RETIRED', false], ['runner', 'UNKNOWN', false]] as const) {
      const h = harness({ state });
      const started = mayStart({ service, label: 'old-v1', layout, deps: h.deps });
      if (allowed) await expect(started).resolves.toMatchObject({ event: 'PREVIEW_RELEASE_MAY_START', service, label: 'old-v1', releaseKey: KEY, state });
      else await rejectsWith(started, 'RELEASE_STATE_REFUSED');
    }
  });
});

describe('command line', () => {
  const quiet = { write: () => undefined };
  it('refuses anything but the five exact shapes, a release label, and root on Linux', async () => {
    const h = harness();
    for (const argv of [[], ['stopped', '--service', 'ui', '--label', 'old-v1'], ['stopped', '--service', 'api', '--label', '../x'], ['retire-check', '--label', 'Old'], ['retire-check', '--label', 'old-'],
      ['retire-request', '--label', 'old-v1', '--force'], ['may-start', '--service', 'worker', '--label', 'old-v1'], ['mark-retired', '--label', 'a/b']]) {
      const err: string[] = [];
      expect(await main(argv, { platform: 'linux', uid: 0, layout, deps: h.deps, stdout: quiet, stderr: { write: (s: string) => err.push(s) } }), argv.join(' ')).toBe(1);
      expect(JSON.parse(err[0]!)).toMatchObject({ reason: 'ARGUMENTS_REFUSED' });
    }
    const err: string[] = [];
    expect(await main(['retire-check', '--label', 'old-v1'], { platform: 'darwin', uid: 0, layout, deps: h.deps, stdout: quiet, stderr: { write: (s: string) => err.push(s) } })).toBe(1);
    expect(JSON.parse(err[0]!)).toMatchObject({ reason: 'ACTOR_REFUSED' });
    expect(h.systemctl).toEqual([]); expect(h.events).toEqual([]);
  });

  it('prints one line per run and exits 0 on success', async () => {
    const out: string[] = [];
    expect(await main(['retire-request', '--label', 'old-v1'], { platform: 'linux', uid: 0, layout, deps: harness().deps, stdout: { write: (s: string) => out.push(s) }, stderr: quiet })).toBe(0);
    expect(out.map(line => JSON.parse(line))).toEqual([{ event: 'PREVIEW_RELEASE_RETIRE_REQUESTED', label: 'old-v1', releaseKey: KEY }]);
  });

  it('refuses a label whose notice name would not fit before touching anything', async () => {
    const long = `a${'-b'.repeat(32)}`;
    expect(long.length).toBe(65);
    const h = harness();
    h.deps.readLock = async () => ({ lock: { releases: { [long]: { releaseKey: KEY, slot: 'A' } } } });
    await rejectsWith(requestRetire({ label: long, layout, deps: h.deps }), 'RELEASE_NOTICE_LABEL_REFUSED');
    await rejectsWith(checkRetire({ label: long, layout, deps: h.deps }), 'RELEASE_NOTICE_LABEL_REFUSED');
    expect(h.events).toEqual([]); expect(h.systemctl).toEqual([]);
  });

  it('refuses a label the lock does not pin', async () => {
    await rejectsWith(requestRetire({ label: 'gone-v0', layout, deps: harness().deps }), 'RELEASE_LOCK_RELEASE_MISSING');
  });
});
