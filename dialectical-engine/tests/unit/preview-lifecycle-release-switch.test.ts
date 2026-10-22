// Side-by-side spec §6 (the break-before-make switch) and §11 (the way back). The switch is one database write, then
// the edge must show the new release before anything stops; the old runner is never stopped by it.
import { afterAll, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const releaseSwitch = await import('../../deploy/' + 'preview-lifecycle/v1/release-switch.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');
const retire = await import('../../deploy/' + 'preview-lifecycle/v1/release-retire.mjs');

const { HEALTH_INTERVAL_S, TAKE_TRAFFIC_AFTER_S, EDGE_WAIT_MS, EDGE_CONFIRMATIONS, BACKSTOP_S, EDGE_REQUEST_TIMEOUT_MS, EDGE_URL, TARGET_DROPIN,
  MAX_LABEL_LENGTH, renderTargetDropin, renderBackstopDropin, stageRelease, seedRelease, switchRelease, finishSwitch, rollbackRelease, gateFilesDigest, gateFilesPathFor, main } = releaseSwitch;
const layout = common.LAYOUT;
const GATES = retire.GATES as readonly { name: string; privateDir: string; folder: string; go: string }[];

const OLD_KEY = ['r19', 'd50e33165a1b'].join('-');
const NEW_KEY = ['r20', '0123456789ab'].join('-');
const OLDER_KEY = ['r18', '00aa11bb22cc'].join('-');
const SECRET = ['edge', 's'.repeat(48)].join('_');
const START = Date.parse('2026-10-22T03:15:00.000Z');
const DAY = 86_400_000;
const U = (service: string, label: string) => `debateai-preview-${service}@${label}.service`;
const KEYS: Record<string, string> = { 'old-v1': OLD_KEY, 'new-v1': NEW_KEY, 'older-v1': OLDER_KEY };
const name = (key: string | null) => (key === OLD_KEY ? 'old' : key === NEW_KEY ? 'new' : key === OLDER_KEY ? 'older' : String(key));
const invocationId = (n: number) => n.toString(16).padStart(32, 'a');
const iso = (ms: number) => new Date(ms).toISOString();

type Site = { status: number; release: string | null; reasons?: string[]; releaseKey?: string };
type Answer = Site | 'timeout' | 'refused';
/** A website's own answer: it always names its release in x-debateai-release. */
const site = (key: string, status = 200, reasons: string[] = []): Site => ({ status, release: key, reasons, releaseKey: key });
/** An answer Caddy made itself (no slot ready, lb_try_duration spent): no release header. */
const caddy = (status = 502): Site => ({ status, release: null });

type Options = Partial<{
  history: [string, string, string?][];
  units: Record<string, string>;
  started: Record<string, Record<string, unknown> | null>;
  website: Answer;
  // The new website's answer once the switch write landed (final fix wave X4); before it, `website` or the default.
  websiteAfter: Answer;
  edgeBefore: Answer;
  edgeAfter: Answer[][];
  gates: Record<string, string>;
  maintenance: boolean;
  // `undefined` through configure(): the table is readable again after a lost write.
  switchFails: 'CONFLICT' | 'UNREADABLE' | 'UNREADABLE_BUT_COMMITTED' | 'UNREADABLE_REREAD_FAILS' | undefined;
  eventFails: Record<string, 'UNREADABLE' | 'UNREADABLE_BUT_COMMITTED' | 'REFUSED'>;
  stopRecorder: boolean;
  slots: Record<string, string>;
  openWork: Record<string, number>;
  startAnnounces: boolean;
  runnerDispatched: number;
  lockLabels: string[];
  historyAt: number;
}>;
const fail = (code: string) => Object.assign(new Error(code), { code });
const result = (stdout = '', code: number | null = 0) => ({ code, signal: null, error: undefined, timedOut: false, overflow: false, stdout: Buffer.from(stdout), stderr: Buffer.from('') });
const DEFAULT_HISTORY: [string, string, string?][] = [[OLD_KEY, 'STAGED'], [OLD_KEY, 'CURRENT'], [NEW_KEY, 'STAGED']];
/** After the forward switch: new serves, old drains with its pair stopped (its runner retired unless `units` says otherwise). */
const AFTER_SWITCH: [string, string, string?][] = [...DEFAULT_HISTORY, [NEW_KEY, 'CURRENT'], [OLD_KEY, 'DRAINING'], [OLD_KEY, 'FRONT_PAIR_STOPPED']];
const AFTER_SWITCH_UNITS = { [U('runner', 'old-v1')]: 'inactive', [U('api', 'old-v1')]: 'inactive', [U('ui', 'old-v1')]: 'inactive' };

/**
 * A fake preview host: the release table (with the database's own transition rules), systemd, the journal, the two
 * websites, the edge listener, the two gates and the files root writes, all behind `deps`. One ordered log holds every
 * read ('read:…'), edge answer ('edge:…'), pause ('sleep …') and write (everything else).
 */
function host(options: Options = {}) {
  const o = { history: DEFAULT_HISTORY, units: {} as Record<string, string>, started: {} as Record<string, Record<string, unknown> | null>, gates: {} as Record<string, string>,
    maintenance: false, eventFails: {} as Record<string, string>, stopRecorder: true, slots: { 'old-v1': 'A', 'new-v1': 'B', 'older-v1': 'A' } as Record<string, string>,
    openWork: {} as Record<string, number>, startAnnounces: true, runnerDispatched: 0, lockLabels: ['old-v1', 'new-v1'], ...options };
  let clock = START, invocations = 0, switchCount = 0;
  const log: string[] = [], switchCalls: (string | null)[][] = [], timeouts: [string, number][] = [];
  const events: { key: string; kind: string; reason: string | null; at: number; ttf: number | null }[] = [];
  const base = o.historyAt ?? START - DAY;
  for (const [key, kind, reason] of o.history) events.push({ key, kind, reason: reason ?? null, at: base + events.length * 1000, ttf: kind === 'CURRENT' ? base + events.length * 1000 + TAKE_TRAFFIC_AFTER_S * 1000 : null });
  const latest = (key: string, kinds: string[]) => { for (let i = events.length - 1; i >= 0; i--) if (events[i]!.key === key && kinds.includes(events[i]!.kind)) return i; return -1; };
  const stateOf = (key: string) => {
    const at = latest(key, ['STAGED', 'CURRENT', 'DRAINING', 'RETIRED']);
    if (at < 0) return { state: 'UNKNOWN', frontPairStopped: false, retireRequested: false };
    const epoch = latest(key, ['STAGED', 'CURRENT', 'DRAINING']);
    const after = (kind: string) => events.some((event, index) => event.key === key && event.kind === kind && index > epoch);
    return { state: events[at]!.kind, frontPairStopped: after('FRONT_PAIR_STOPPED'), retireRequested: after('RETIRE_REQUESTED') };
  };
  const stillDraining = (key: string) => latest(key, ['DRAINING']) > latest(key, ['RETIRED']);
  const currentKey = () => [OLD_KEY, NEW_KEY, OLDER_KEY].find(key => stateOf(key).state === 'CURRENT') ?? null;
  const push = (key: string, kind: string, reason: string | null = null, ttf: number | null = null) => events.push({ key, kind, reason, at: clock, ttf });

  const units: Record<string, string> = {};
  for (const label of ['old-v1', 'new-v1']) for (const service of ['runner', 'api', 'ui']) units[U(service, label)] = 'active';
  Object.assign(units, o.units);
  const invocation: Record<string, number> = {}, journal: Record<string, string> = {};
  const announce = (unit: string, payload: Record<string, unknown> | null) => {
    invocation[unit] = ++invocations;
    const kind = unit.includes('-runner@') ? 'PREVIEW_RUNNER_STARTED' : 'PREVIEW_API_STARTED';
    journal[unit] = ['{"kind":"DEBATEAI_RUNNER_READY"}', ...(payload ? [`${kind} ${JSON.stringify({ schemaVersion: 1, pid: 4242, ...payload })}`] : []), 'a later line'].join('\n') + '\n';
  };
  for (const label of ['old-v1', 'new-v1']) {
    const key = KEYS[label]!;
    for (const unit of [U('runner', label), U('api', label)]) {
      const own = unit.includes('-runner@') ? { releaseKey: key, startupDispatched: 0 } : { releaseKey: key };
      announce(unit, Object.hasOwn(o.started, unit) ? o.started[unit]! : own);
    }
  }
  const portOf: Record<string, string> = { A: '3100', B: '3200' };
  const labelAtPort = (port: string) => ['old-v1', 'new-v1'].find(label => portOf[o.slots[label]!] === port)!;

  const websiteAnswer = (label: string): Answer => {
    if (label === 'new-v1' && o.websiteAfter && switchCount > 0) return o.websiteAfter;
    if (label === 'new-v1' && o.website) return o.website;
    if (units[U('ui', label)] !== 'active') return 'refused';
    const key = KEYS[label]!;
    if (currentKey() !== key) return site(key, 503, ['NOT_CURRENT']);
    const ttf = events[latest(key, ['CURRENT'])]!.ttf!;
    return clock >= ttf ? site(key) : site(key, 503, ['BEFORE_TAKE_TRAFFIC_FROM']);
  };
  const edgeIndex: number[] = [];
  const edgeAnswer = (): Answer => {
    if (switchCount === 0) return o.edgeBefore ?? site(currentKey()!);
    const script = o.edgeAfter?.[switchCount - 1];
    if (!script) return site(currentKey()!);
    const index = edgeIndex[switchCount] ?? 0;
    edgeIndex[switchCount] = index + 1;
    return script[Math.min(index, script.length - 1)]!;
  };
  const tag = (answer: Answer) => (answer === 'timeout' || answer === 'refused' ? answer : answer.release ? `${name(answer.release)}${answer.status === 200 ? '' : ` ${answer.status}`}` : `caddy ${answer.status}`);

  const run = async (argv: string[], opts: any) => {
    expect(opts.env).toEqual({});
    if (argv[0] === layout.systemctl) {
      const rest = argv.slice(1);
      if (rest[0] === 'show') {
        const unit = rest[1]!, properties = rest[2]!.slice('--property='.length).split(',');
        expect(rest[3]).toBe('--no-pager');
        log.push(`read:unit(${unit})`);
        const value = (property: string) => {
          if (property === 'ActiveState') return units[unit] ?? 'inactive';
          if (property === 'InvocationID') return units[unit] === 'active' || units[unit] === 'activating' ? invocationId(invocation[unit] ?? 0) : '';
          if (property === 'LoadState') return 'loaded';
          throw new Error(`unexpected property ${property}`);
        };
        return result(properties.map(property => `${property}=${value(property)}\n`).join(''));
      }
      log.push(`systemctl ${rest.join(' ')}`);
      if (rest[0] === 'stop') {
        for (const unit of rest.slice(1)) {
          units[unit] = 'inactive';
          // D7's stop recorder (ExecStopPost of api@): FRONT_PAIR_STOPPED for a draining release, nobody else.
          const api = /^debateai-preview-api@(.+)\.service$/.exec(unit);
          if (api && o.stopRecorder && stateOf(KEYS[api[1]!]!).state === 'DRAINING' && !stateOf(KEYS[api[1]!]!).frontPairStopped) push(KEYS[api[1]!]!, 'FRONT_PAIR_STOPPED');
        }
      }
      if (rest[0] === 'reset-failed' && units[rest[1]!] === 'failed') units[rest[1]!] = 'inactive';
      if (rest[0] === 'start') {
        expect(rest[1]).toBe('--no-block');
        const unit = rest[2]!, label = /@(.+)\.service$/.exec(unit)![1]!;
        // A start queued on a unit left failed still reads failed until its job runs; reset-failed clears it first.
        if (units[unit] === 'failed') return result();
        units[unit] = 'active';
        if (!unit.includes('-ui@')) announce(unit, o.startAnnounces ? (unit.includes('-runner@') ? { releaseKey: KEYS[label], startupDispatched: o.runnerDispatched } : { releaseKey: KEYS[label] }) : null);
      }
      return result();
    }
    if (argv[0] === layout.journalctl) {
      const unit = argv[2]!;
      log.push(`read:journal(${unit})`);
      expect(argv).toEqual(['/usr/bin/journalctl', '-u', unit, `_SYSTEMD_INVOCATION_ID=${invocationId(invocation[unit] ?? 0)}`, '-o', 'cat', '--no-pager']);
      return result(journal[unit] ?? '');
    }
    if (argv[0] === '/usr/bin/python3') {
      const gate = GATES.find(candidate => argv.includes(candidate.privateDir))!;
      log.push(`read:gate(${gate.name})`);
      return result(`${JSON.stringify({ state: o.gates[gate.name] ?? 'active' })}\n`);
    }
    throw new Error(`unexpected command ${argv.join(' ')}`);
  };

  let switchFailures = 0;
  const deps: Record<string, any> = {
    run, now: () => clock, sleep: async (ms: number) => { log.push(`sleep ${ms}`); clock += ms; },
    httpGet: async (url: string, { headers, timeoutMs }: { headers: Record<string, string>; timeoutMs: number }) => {
      timeouts.push([url, timeoutMs]);
      let answer: Answer;
      if (url === EDGE_URL) {
        expect(headers).toEqual({});
        answer = edgeAnswer();
        log.push(`edge:${tag(answer)}`);
      } else {
        const port = /^http:\/\/127\.0\.0\.1:(\d+)\/readyz$/.exec(url)![1]!;
        expect(headers).toEqual({ 'x-debateai-edge-secret': SECRET });
        const label = labelAtPort(port);
        log.push(`read:website(${label})`);
        answer = websiteAnswer(label);
      }
      if (answer === 'timeout') { clock += timeoutMs; throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }
      if (answer === 'refused') { clock += 1; throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); }
      clock += 20;
      return { status: answer.status, release: answer.release, body: answer.reasons ? JSON.stringify({ ready: answer.status === 200, releaseKey: answer.releaseKey, reasons: answer.reasons }) : 'Bad Gateway' };
    },
    readLock: async () => {
      log.push('read:lock');
      const releases: Record<string, unknown> = {};
      for (const label of o.lockLabels) releases[label] = { releaseKey: KEYS[label], slot: o.slots[label], databaseAhead: null, services: {} };
      return { lock: { schema: 'preview-lifecycle-release-lock-v2', releases }, lockSha256: 'f'.repeat(64) };
    },
    readCurrentRelease: async () => {
      log.push('read:current');
      if (o.switchFails === 'UNREADABLE_REREAD_FAILS' && switchFailures > 0) throw fail('RELEASE_TABLE_UNREADABLE');
      const key = currentKey();
      return key ? { releaseKey: key, takeTrafficFrom: iso(events[latest(key, ['CURRENT'])]!.ttf!) } : null;
    },
    readReleaseState: async ({ releaseKey }: { releaseKey: string }) => { log.push(`read:state(${name(releaseKey)})`); return stateOf(releaseKey); },
    readReleaseEvents: async ({ releaseKey }: { releaseKey: string }) => {
      log.push(`read:events(${name(releaseKey)})`);
      return events.filter(event => event.key === releaseKey).map(event => ({ kind: event.kind, recordedAt: iso(event.at), reason: event.reason }));
    },
    countOpenWork: async ({ releaseKey }: { releaseKey: string }) => { log.push(`read:openWork(${name(releaseKey)})`); return o.openWork[name(releaseKey)] ?? 0; },
    recordReleaseSwitch: async ({ newKey, expectedCurrentKey, takeTrafficAfterSeconds, recordedBy }: any) => {
      log.push(`recordReleaseSwitch(${name(newKey)}→, expect ${name(expectedCurrentKey)}, ${takeTrafficAfterSeconds}s)`);
      expect(recordedBy).toMatch(/^root:(release-switch|rollback)$/);
      switchCalls.push([newKey, expectedCurrentKey]);
      const first = switchCount === 0;
      if (first && o.switchFails === 'CONFLICT') throw fail('RELEASE_SWITCH_CONFLICT');
      if (first && o.switchFails === 'UNREADABLE') { switchFailures += 1; throw fail('RELEASE_TABLE_UNREADABLE'); }
      const current = currentKey();
      if (current !== expectedCurrentKey) throw fail('RELEASE_SWITCH_CONFLICT');
      if (stateOf(newKey).state !== 'STAGED') throw fail('RELEASE_EVENT_REFUSED');
      push(newKey, 'CURRENT', null, clock + takeTrafficAfterSeconds * 1000);
      if (current) push(current, 'DRAINING');
      switchCount += 1;
      if (first && (o.switchFails === 'UNREADABLE_BUT_COMMITTED' || o.switchFails === 'UNREADABLE_REREAD_FAILS')) { switchFailures += 1; throw fail('RELEASE_TABLE_UNREADABLE'); }
    },
    recordReleaseEvent: async ({ releaseKey, kind, recordedBy, reason }: any) => {
      log.push(`event(${name(releaseKey)} ${kind}${reason ? ` ${reason}` : ''})`);
      // release-retire.mjs mark-retired (the drained path, after the switch) writes through the same table.
      expect(recordedBy).toMatch(/^root:(release-switch|rollback|release-retire)$/);
      const failure = o.eventFails[kind];
      if (failure === 'UNREADABLE') throw fail('RELEASE_TABLE_UNREADABLE');
      if (failure === 'REFUSED') throw fail('RELEASE_EVENT_REFUSED');
      const { state } = stateOf(releaseKey);
      const allowed = kind === 'STAGED' ? ['UNKNOWN', 'DRAINING', 'RETIRED'].includes(state)
        : kind === 'DRAINING' ? state === 'STAGED' && stillDraining(releaseKey)
          : kind === 'FRONT_PAIR_STOPPED' ? state !== 'UNKNOWN' && state !== 'CURRENT'
            : kind === 'RETIRED' ? state === 'DRAINING' || (state === 'STAGED' && !stillDraining(releaseKey)) : false;
      if (!allowed) throw fail('RELEASE_EVENT_REFUSED');
      push(releaseKey, kind, reason);
      if (failure === 'UNREADABLE_BUT_COMMITTED') throw fail('RELEASE_TABLE_UNREADABLE');
    },
    readEdgeSecret: async () => { log.push('read:secret'); return SECRET; },
    pathExists: async (path: string) => { log.push(`read:exists(${path})`); return (o.maintenance && path === '/etc/debateai-v3-preview/lifecycle/maintenance-pending') || Object.hasOwn(files, path); },
    acquireLock: async () => async () => undefined,
    gateFilesDigest: async () => { log.push('read:gate-files'); return GATES.map(gate => ({ name: gate.name, goSha256: 'a'.repeat(64), folderSha256: 'b'.repeat(64) })); },
    writeUnitFile: async (path: string, text: string) => { log.push(`unitfile ${path}`); files[path] = text; },
    writeStateFile: async (path: string, text: string) => { log.push(`statefile ${path}`); files[path] = text; }
  };
  const files: Record<string, string> = {};
  const isWrite = (entry: string) => !entry.startsWith('read:') && !entry.startsWith('edge:') && !entry.startsWith('sleep ');
  /** The log with every read before the first write as 'preconditions', each run of equal edge answers as `edge×N <who>` (the 500 ms pauses between polls left out), and the reads after the last write as 'final checks'. */
  const order = () => {
    const first = log.findIndex(isWrite);
    let last = -1;
    log.forEach((entry, index) => { if (isWrite(entry)) last = index; });
    const out: string[] = first > 0 ? ['preconditions'] : [];
    for (let index = Math.max(first, 0); index <= last; index++) {
      const entry = log[index]!;
      if (entry === 'sleep 500') continue;
      const previous = /^edge×(\d+) (.*)$/.exec(out.at(-1) ?? '');
      if (entry.startsWith('edge:') && previous && previous[2] === entry.slice(5)) out[out.length - 1] = `edge×${Number(previous[1]) + 1} ${previous[2]}`;
      else out.push(entry.startsWith('edge:') ? `edge×1 ${entry.slice(5)}` : entry);
    }
    if (first >= 0 && last < log.length - 1) out.push('final checks');
    return out;
  };
  return {
    deps, log, files, order, timeouts, units, stateOf, events, announce,
    configure: (changes: Options) => { Object.assign(o, changes); },
    writes: () => log.filter(isWrite), stops: () => log.filter(entry => entry.startsWith('systemctl stop')), switchCalls: () => switchCalls,
    clock: () => clock, eventLog: () => events.map(event => `${name(event.key)} ${event.kind}${event.reason ? ` ${event.reason}` : ''}`)
  };
}
const refusal = async (promise: Promise<unknown>) => promise.then(() => { throw new Error('expected a refusal'); }, (error: any) => error);

const BACKSTOP_DROPIN = '/etc/systemd/system/debateai-preview-runner-retire@old-v1.timer.d/50-at.conf';
const NEW_BACKSTOP_DROPIN = '/etc/systemd/system/debateai-preview-runner-retire@new-v1.timer.d/50-at.conf';
const GATE_FILES = `/var/lib/debateai-v3-preview/lifecycle/release-${NEW_KEY}-gate-files.json`;

describe('the switch (side-by-side spec §6)', () => {
  it('switches break-before-make: record, wait for the edge, then stop the old pair', async () => {
    const h = host();
    const r = await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(h.order()).toEqual([
      'preconditions',
      'recordReleaseSwitch(new→, expect old, 8s)',
      `edge×${EDGE_CONFIRMATIONS} new`,
      'sleep 2500',
      'systemctl stop debateai-preview-ui@old-v1.service debateai-preview-api@old-v1.service',
      `read:unit(${U('ui', 'old-v1')})`, `read:unit(${U('api', 'old-v1')})`, 'read:state(old)',
      'read:current', `unitfile ${BACKSTOP_DROPIN}`, 'systemctl daemon-reload',
      'systemctl enable debateai-preview-runner-retire@old-v1.timer', 'systemctl restart debateai-preview-runner-retire@old-v1.timer',
      `unitfile ${TARGET_DROPIN}`, 'systemctl daemon-reload',
      'read:gate-files', `statefile ${GATE_FILES}`,
      'final checks'
    ]);
    const switchedAtMs = Date.parse(r.switchedAt);
    expect(r).toEqual({
      event: 'PREVIEW_RELEASE_SWITCHED', to: 'new-v1', from: 'old-v1', toKey: NEW_KEY, fromKey: OLD_KEY, switchedAt: r.switchedAt,
      edgeConfirmedMs: r.edgeConfirmedMs, edgeFailures: 0, backstopAt: iso(Math.ceil((switchedAtMs + BACKSTOP_S * 1000) / 1000) * 1000), bad: []
    });
    expect(r.edgeConfirmedMs).toBeGreaterThan(0);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.bad)).toBe(true);
    // One database write made new current and old draining; the old API's own stop recorder wrote FRONT_PAIR_STOPPED.
    expect(h.eventLog().slice(3)).toEqual(['new CURRENT', 'old DRAINING', 'old FRONT_PAIR_STOPPED']);
    // The old runner is never stopped by the switch; it retires by itself (spec §4).
    expect(h.units[U('runner', 'old-v1')]).toBe('active');
    expect(h.files[BACKSTOP_DROPIN]).toBe(renderBackstopDropin({ label: 'old-v1', at: new Date(r.backstopAt) }));
    expect(h.files[TARGET_DROPIN]).toBe(renderTargetDropin('new-v1'));
    const gateFiles = JSON.parse(h.files[GATE_FILES]!);
    expect(gateFiles).toEqual({ schema: 'preview-release-gate-files-v1', releaseKey: NEW_KEY, label: 'new-v1', recordedAt: gateFiles.recordedAt,
      gates: GATES.map(gate => ({ name: gate.name, goSha256: 'a'.repeat(64), folderSha256: 'b'.repeat(64) })) });
    expect(gateFilesPathFor(layout, NEW_KEY)).toBe(GATE_FILES);
  });

  it('takes traffic from the database clock + 8 s and waits one more health interval after three confirmations', async () => {
    // 8 s = the API watcher's 5 s stale bound + one health interval + 1 s (final fix wave P6).
    expect([HEALTH_INTERVAL_S, TAKE_TRAFFIC_AFTER_S, EDGE_WAIT_MS, EDGE_CONFIRMATIONS, BACKSTOP_S, EDGE_REQUEST_TIMEOUT_MS]).toEqual([2, 8, 30_000, 3, 27_000, 12_000]);
    expect(EDGE_URL).toBe('http://127.0.0.1:3090/readyz');
    const h = host();
    await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    // Every edge request may wait out Caddy's 10 s hold (controller ruling D10 Q1); the website itself answers in 5 s.
    expect(new Set(h.timeouts.filter(([url]) => url === EDGE_URL).map(([, ms]) => ms))).toEqual(new Set([12_000]));
    expect(h.timeouts.filter(([url]) => url !== EDGE_URL)).toEqual([['http://127.0.0.1:3200/readyz', 5000]]);
  });

  it('counts only what the edge itself failed: a website 503 in the gap is an answer, a Caddy 502 or a timeout is not', async () => {
    const h = host({ edgeAfter: [[site(OLD_KEY, 503, ['NOT_CURRENT']), caddy(502), 'timeout', site(NEW_KEY)]] });
    const r = await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    // While the edge does not show new, new's own /readyz is read too (X4); it is waiting (BEFORE_TAKE_TRAFFIC_FROM, then ready), never a failure.
    expect(h.order().slice(1, 9)).toEqual(['recordReleaseSwitch(new→, expect old, 8s)', 'edge×1 old 503', 'read:website(new-v1)', 'edge×1 caddy 502', 'read:website(new-v1)',
      'edge×1 timeout', 'read:website(new-v1)', 'edge×3 new']);
    expect(r).toMatchObject({ event: 'PREVIEW_RELEASE_SWITCHED', edgeFailures: 2, bad: ['EDGE_FAILURES'] });
    // A failed check never undoes the switch: the old pair is stopped and the backstop armed.
    expect(h.stops()).toHaveLength(1);
    expect(h.files[BACKSTOP_DROPIN]).toBeDefined();
  });

  it.each([
    ['DRAINING', site(NEW_KEY, 503, ['DRAINING']), ['DRAINING']],
    ['DATABASE_UNREACHABLE', site(NEW_KEY, 503, ['NOT_CURRENT', 'DATABASE_UNREACHABLE']), ['NOT_CURRENT', 'DATABASE_UNREACHABLE']],
    ['another release on its slot', site(OLD_KEY, 503, ['NOT_CURRENT']), ['RELEASE_KEY_MISMATCH']]
  ] as [string, Site, string[]][])('switches back at once when the new website says it will not become ready (%s), without waiting the 30 s (X4)', async (_case, websiteAfter, reasons) => {
    const h = host({ edgeAfter: [[caddy(502)]], websiteAfter });
    const error = await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }));
    expect(error).toMatchObject({ code: 'SWITCH_REVERTED', fields: { reason: 'WEBSITE_NOT_READY', websiteReasons: reasons, edgeFailures: 1 } });
    // One edge read, one website read, then the way back (old staged again and switched to, confirmed by the edge).
    expect(h.order().slice(1, 5)).toEqual(['recordReleaseSwitch(new→, expect old, 8s)', 'edge×1 caddy 502', 'read:website(new-v1)', 'event(old STAGED SWITCH_REVERTED)']);
    expect(h.switchCalls()).toEqual([[NEW_KEY, OLD_KEY], [OLD_KEY, NEW_KEY]]);
    expect(h.clock() - START).toBeLessThan(EDGE_WAIT_MS / 2);
    expect(h.stops()).toEqual([]);
  });

  it.each([['BOOTING'], ['NOT_CURRENT'], ['BEFORE_TAKE_TRAFFIC_FROM']])('keeps waiting while the new website only says %s (X4)', async reason => {
    const h = host({ edgeAfter: [[caddy(502), caddy(502), site(NEW_KEY)]], websiteAfter: site(NEW_KEY, 503, [reason]) });
    const r = await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(r).toMatchObject({ event: 'PREVIEW_RELEASE_SWITCHED', edgeFailures: 2, bad: ['EDGE_FAILURES'] });
    expect(h.log.filter(entry => entry === 'read:website(new-v1)')).toHaveLength(1 + 2);
  });

  it('a website that does not answer is no reason to switch back early: the edge decides (X4)', async () => {
    const h = host({ edgeAfter: [[site(OLD_KEY, 503, ['DRAINING'])]], websiteAfter: 'refused' });
    const error = await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }));
    expect(error).toMatchObject({ code: 'SWITCH_REVERTED', fields: { reason: 'EDGE_NOT_CONFIRMED' } });
    expect(h.clock() - START).toBeGreaterThanOrEqual(EDGE_WAIT_MS);
  });

  const PRECONDITION_CASES: [string, Options, string][] = [
    ['to not STAGED', { history: [[OLD_KEY, 'STAGED'], [OLD_KEY, 'CURRENT']] }, 'state'],
    ['from not current', { history: [[OLD_KEY, 'STAGED'], [NEW_KEY, 'STAGED']] }, 'current'],
    ['same slot', { slots: { 'old-v1': 'A', 'new-v1': 'A' } }, 'slot'],
    ['to is not in the lock', { lockLabels: ['old-v1'] }, 'to'],
    ["to's runner not running", { units: { [U('runner', 'new-v1')]: 'activating' } }, 'runner'],
    ["to's API not running", { units: { [U('api', 'new-v1')]: 'failed' } }, 'api'],
    ["to's website not running", { units: { [U('ui', 'new-v1')]: 'inactive' } }, 'ui'],
    ["the old pair not running", { units: { [U('api', 'old-v1')]: 'inactive' } }, 'oldPair'],
    ["to's runner not started on its key", { started: { [U('runner', 'new-v1')]: { releaseKey: OLD_KEY, startupDispatched: 0 } } }, 'runnerStarted'],
    ["to's runner re-sent work at its start", { started: { [U('runner', 'new-v1')]: { releaseKey: NEW_KEY, startupDispatched: 2 } } }, 'runnerStarted'],
    ["to's runner never announced its start", { started: { [U('runner', 'new-v1')]: null } }, 'runnerStarted'],
    ["to's website already ready", { website: site(NEW_KEY) }, 'website'],
    ["to's website answers for another release", { website: site(OLD_KEY, 503, ['NOT_CURRENT']) }, 'website'],
    ["to's website still booting", { website: site(NEW_KEY, 503, ['BOOTING', 'NOT_CURRENT']) }, 'website'],
    ["to's website does not answer", { website: 'refused' }, 'website'],
    ['the edge does not serve the old release', { edgeBefore: caddy(502) }, 'edge'],
    ['a gate halted', { gates: { anthropic: 'halted' } }, 'gates'],
    ['maintenance pending', { maintenance: true }, 'maintenance'],
    ['another release still drains', { lockLabels: ['old-v1', 'new-v1', 'older-v1'],
      history: [[OLDER_KEY, 'STAGED'], [OLDER_KEY, 'CURRENT'], [OLD_KEY, 'STAGED'], [OLD_KEY, 'CURRENT'], [OLDER_KEY, 'DRAINING'], [NEW_KEY, 'STAGED']] }, 'otherDraining'],
    ['another release was staged again while it still drains', { lockLabels: ['old-v1', 'new-v1', 'older-v1'],
      history: [[OLDER_KEY, 'STAGED'], [OLDER_KEY, 'CURRENT'], [OLD_KEY, 'STAGED'], [OLD_KEY, 'CURRENT'], [OLDER_KEY, 'DRAINING'], [OLDER_KEY, 'STAGED'], [NEW_KEY, 'STAGED']] }, 'otherDraining']
  ];
  it.each(PRECONDITION_CASES)('switch preconditions: refuses when %s, before any write or stop', async (_case, options, field) => {
    const h = host(options);
    const error = await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }));
    expect(error.code).toBe('SWITCH_PRECONDITION_FAILED');
    expect(error.fields).toContain(field);
    expect(h.writes()).toEqual([]);
    expect(h.stops()).toEqual([]);
  });

  it('a third release that retired, or never served, does not block the switch', async () => {
    const h = host({ lockLabels: ['old-v1', 'new-v1', 'older-v1'],
      history: [[OLDER_KEY, 'STAGED'], [OLDER_KEY, 'CURRENT'], [OLD_KEY, 'STAGED'], [OLD_KEY, 'CURRENT'], [OLDER_KEY, 'DRAINING'], [OLDER_KEY, 'RETIRED', 'RUNNER_RETIRED'], [NEW_KEY, 'STAGED']] });
    expect((await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps })).bad).toEqual([]);
  });

  it('starts nothing for the wrong arguments: odd or over-long labels, or the same label twice', async () => {
    const h = host();
    expect((await refusal(switchRelease({ to: '../x', from: 'old-v1', layout, deps: h.deps }))).code).toBe('ARGUMENTS_REFUSED');
    expect((await refusal(switchRelease({ to: 'a'.repeat(MAX_LABEL_LENGTH + 1), from: 'old-v1', layout, deps: h.deps }))).code).toBe('RELEASE_LABEL_TOO_LONG');
    expect((await refusal(switchRelease({ to: 'old-v1', from: 'old-v1', layout, deps: h.deps }))).fields).toEqual(['labels']);
    expect(MAX_LABEL_LENGTH).toBe(64);
    expect(h.log).toEqual([]);
  });

  it('refuses a second run once the switch is done', async () => {
    const h = host();
    await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    const before = h.writes().length;
    for (const oldPairStopped of [false, true]) {
      const error = await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', oldPairStopped, layout, deps: h.deps }));
      expect(error.code).toBe('SWITCH_PRECONDITION_FAILED');
      expect(error.fields).toEqual(expect.arrayContaining(['current', 'state']));
    }
    expect(h.writes()).toHaveLength(before);
  });

  it('with --old-pair-stopped: both old units must be stopped, and the edge is not asked first', async () => {
    const stopped = host({ units: { [U('api', 'old-v1')]: 'inactive', [U('ui', 'old-v1')]: 'failed' }, edgeBefore: caddy(502) });
    const r = await switchRelease({ to: 'new-v1', from: 'old-v1', oldPairStopped: true, layout, deps: stopped.deps });
    expect(r.bad).toEqual([]);
    const running = host({ units: { [U('api', 'old-v1')]: 'inactive' } });
    expect((await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', oldPairStopped: true, layout, deps: running.deps }))).fields).toEqual(['oldPair']);
  });

  it('reverts the switch when the edge never shows the new key', async () => {
    const h = host({ edgeAfter: [[site(OLD_KEY, 503, ['DRAINING'])]] });
    const error = await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }));
    const back = h.events.at(-2)!;
    expect(back).toMatchObject({ key: OLD_KEY, kind: 'CURRENT' });
    expect(error).toMatchObject({ code: 'SWITCH_REVERTED', fields: { reason: 'EDGE_NOT_CONFIRMED', edgeFailures: 0, backstopAt: iso(Math.ceil((back.ttf! - TAKE_TRAFFIC_AFTER_S * 1000 + BACKSTOP_S * 1000) / 1000) * 1000) } });
    expect(h.switchCalls()).toEqual([[NEW_KEY, OLD_KEY], [OLD_KEY, NEW_KEY]]);
    expect(h.stops()).toEqual([]);
    // The database takes a switch only to a STAGED release: old is staged again (with the reason), then switched back.
    // New stays DRAINING with its pair and runner running: anything it admitted finishes on it (controller ruling Q2);
    // like any draining release it gets its backstop.
    expect(h.eventLog().slice(3)).toEqual(['new CURRENT', 'old DRAINING', 'old STAGED SWITCH_REVERTED', 'old CURRENT', 'new DRAINING']);
    expect(h.writes()).toEqual(['recordReleaseSwitch(new→, expect old, 8s)', 'event(old STAGED SWITCH_REVERTED)', 'recordReleaseSwitch(old→, expect new, 8s)',
      `unitfile ${NEW_BACKSTOP_DROPIN}`, 'systemctl daemon-reload', 'systemctl enable debateai-preview-runner-retire@new-v1.timer', 'systemctl restart debateai-preview-runner-retire@new-v1.timer']);
    expect(h.clock() - START).toBeGreaterThanOrEqual(EDGE_WAIT_MS);
    expect(Object.values(h.units).every(state => state === 'active')).toBe(true);
    // Trying again later goes through the rollback: it turns that backstop off, stages new again and switches.
    const again = await rollbackRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(again).toMatchObject({ event: 'PREVIEW_RELEASE_ROLLED_BACK', toKey: NEW_KEY, started: [], bad: [] });
    expect(h.writes().slice(7, 10)).toEqual(['systemctl disable --now debateai-preview-runner-retire@new-v1.timer', 'systemctl disable --now debateai-preview-runner-retire-check@new-v1.timer', 'event(new STAGED)']);
  });

  it('says so loudly when the way back cannot be written, and stops nothing', async () => {
    const h = host({ edgeAfter: [[site(OLD_KEY, 503, ['DRAINING'])]], eventFails: { STAGED: 'UNREADABLE' } });
    const error = await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }));
    expect(error).toMatchObject({ code: 'SWITCH_REVERT_FAILED', fields: { cause: 'RELEASE_TABLE_UNREADABLE', edgeFailures: 0 } });
    expect(h.switchCalls()).toEqual([[NEW_KEY, OLD_KEY]]);
    expect(h.stops()).toEqual([]);
  });

  it('says so loudly when even the way back is not confirmed by the edge', async () => {
    const h = host({ edgeAfter: [[caddy(502)], [caddy(502)]] });
    const error = await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }));
    expect(error.code).toBe('SWITCH_REVERT_UNCONFIRMED');
    expect(error.fields.edgeFailures).toBeGreaterThan(2);
    expect(h.stops()).toEqual([]);
  });

  it('stops nothing when the database refuses the switch', async () => {
    const h = host({ switchFails: 'CONFLICT' });
    expect((await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }))).code).toBe('RELEASE_SWITCH_CONFLICT');
    expect(h.writes()).toEqual(['recordReleaseSwitch(new→, expect old, 8s)']);
    expect(h.log.filter(entry => entry.startsWith('edge:'))).toHaveLength(1);
  });

  it('reads the current release again after an unreadable answer before deciding (D3 review)', async () => {
    const lost = host({ switchFails: 'UNREADABLE' });
    expect((await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: lost.deps }))).code).toBe('RELEASE_TABLE_UNREADABLE');
    expect(lost.writes()).toEqual(['recordReleaseSwitch(new→, expect old, 8s)']);
    expect(lost.log.at(-1)).toBe('read:current');
    const committed = host({ switchFails: 'UNREADABLE_BUT_COMMITTED' });
    expect((await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: committed.deps })).bad).toEqual([]);
    const unknown = host({ switchFails: 'UNREADABLE_REREAD_FAILS' });
    expect(await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: unknown.deps }))).toMatchObject({ code: 'SWITCH_OUTCOME_UNKNOWN',
      fields: { next: `if the release table names ${NEW_KEY} current: release-switch.mjs switch --finish --to new-v1 --from old-v1` } });
    expect(unknown.stops()).toEqual([]);
  });

  it('writes FRONT_PAIR_STOPPED only when the stop recorder did not', async () => {
    const recorded = host();
    await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: recorded.deps });
    expect(recorded.writes().filter(entry => entry.startsWith('event('))).toEqual([]);
    const missed = host({ stopRecorder: false });
    await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: missed.deps });
    expect(missed.writes().filter(entry => entry.startsWith('event('))).toEqual(['event(old FRONT_PAIR_STOPPED)']);
    // A record whose answer was lost but that committed counts as written (re-read).
    const lostAnswer = host({ stopRecorder: false, eventFails: { FRONT_PAIR_STOPPED: 'UNREADABLE_BUT_COMMITTED' } });
    expect((await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: lostAnswer.deps })).bad).toEqual([]);
    const lostWrite = host({ stopRecorder: false, eventFails: { FRONT_PAIR_STOPPED: 'UNREADABLE' } });
    expect((await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: lostWrite.deps })).bad).toEqual(['FRONT_PAIR_STOPPED_RECORD']);
  });

  it('writes an absolute UTC backstop 27,000 s after the switch', () => {
    expect(renderBackstopDropin({ label: 'old-v1', at: new Date('2026-10-22T03:15:00Z') })).toBe('[Timer]\nOnCalendar=2026-10-22 03:15:00 UTC\n');
    // Rounded up to the whole second: a timer never fires before its time.
    expect(renderBackstopDropin({ label: 'old-v1', at: new Date('2026-10-22T03:15:00.001Z') })).toBe('[Timer]\nOnCalendar=2026-10-22 03:15:01 UTC\n');
    expect(() => renderBackstopDropin({ label: '../x', at: new Date() })).toThrow('ARGUMENTS_REFUSED');
    expect(() => renderBackstopDropin({ label: 'old-v1', at: new Date(Number.NaN) })).toThrow('BACKSTOP_TIME_REFUSED');
    expect(TARGET_DROPIN).toBe('/etc/systemd/system/debateai-preview.target.d/60-current-release.conf');
    expect((renderTargetDropin('new-v1') as string).split('\n').filter(line => !line.startsWith('#'))).toEqual(['[Unit]', 'Wants=debateai-preview-api@new-v1.service debateai-preview-ui@new-v1.service', '']);
  });

  it('times the backstop from the database clock: take-traffic-from − 8 s + 27,000 s', async () => {
    const h = host();
    const r = await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    const ttf = h.events.find(event => event.key === NEW_KEY && event.kind === 'CURRENT')!.ttf!;
    expect(r.backstopAt).toBe(iso(Math.ceil((ttf - 8000 + 27_000_000) / 1000) * 1000));
  });

  it('reports every failed step after the switch in bad, and goes on with the others', async () => {
    const h = host({ gates: {} });
    h.deps.writeUnitFile = async (path: string) => { h.log.push(`unitfile ${path}`); throw fail('LIFECYCLE_WRITE_REFUSED'); };
    h.deps.gateFilesDigest = async () => { throw fail('GATE_FILES_UNREADABLE'); };
    const r = await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(r.bad).toEqual(['BACKSTOP', 'TARGET', 'GATE_FILES']);
    expect(r.backstopAt).toBeNull();
    expect(h.stops()).toHaveLength(1);
  });

  it('final checks: both runners and both gates, read after the stop', async () => {
    const h = host();
    const original = h.deps.run;
    let stopped = false;
    h.deps.run = async (argv: string[], opts: any) => {
      if (argv[1] === 'stop') stopped = true;
      if (stopped && argv[0] === '/usr/bin/python3' && argv.includes(GATES[0]!.privateDir)) return result('{"state":"halted"}\n');
      if (stopped && argv[1] === 'show' && argv[2] === U('runner', 'new-v1')) return result('ActiveState=failed\n');
      return original(argv, opts);
    };
    const r = await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(r.bad).toEqual(['RUNNER_TO', `GATE_${GATES[0]!.name.toUpperCase()}`]);
  });

  it('a stop that leaves the old pair running is bad and records nothing', async () => {
    const h = host();
    const original = h.deps.run;
    h.deps.run = async (argv: string[], opts: any) => (argv[1] === 'stop' ? (h.log.push(`systemctl ${argv.slice(1).join(' ')}`), result('', 1)) : original(argv, opts));
    const r = await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(r.bad).toEqual(['OLD_PAIR_STOP']);
    expect(h.writes().filter(entry => entry.startsWith('event('))).toEqual([]);
  });

  it('the old runner may already have retired by the final check', async () => {
    const h = host();
    const original = h.deps.run;
    h.deps.run = async (argv: string[], opts: any) => {
      if (argv[1] === 'show' && argv[2] === U('runner', 'old-v1') && h.stops().length) { h.events.push({ key: OLD_KEY, kind: 'RETIRED', reason: 'RUNNER_RETIRED', at: h.clock(), ttf: null }); return result('ActiveState=inactive\n'); }
      return original(argv, opts);
    };
    expect((await switchRelease({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps })).bad).toEqual([]);
  });
});

describe('finishing a switch whose database write landed (D10 review)', () => {
  // The write made new current and old draining, then the command died (crash, ssh drop) before the stop.
  const WRITTEN: [string, string, string?][] = [...DEFAULT_HISTORY, [NEW_KEY, 'CURRENT'], [OLD_KEY, 'DRAINING']];

  it('finish after a crash between the write and the stop: edge, stop, backstop, target, gate files, final checks', async () => {
    const h = host({ history: WRITTEN, historyAt: START - 60_000 });
    const r = await finishSwitch({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(h.writes()).toEqual([
      'systemctl stop debateai-preview-ui@old-v1.service debateai-preview-api@old-v1.service',
      `unitfile ${BACKSTOP_DROPIN}`, 'systemctl daemon-reload',
      'systemctl enable debateai-preview-runner-retire@old-v1.timer', 'systemctl restart debateai-preview-runner-retire@old-v1.timer',
      `unitfile ${TARGET_DROPIN}`, 'systemctl daemon-reload', `statefile ${GATE_FILES}`
    ]);
    // The edge first (three confirmations, then one more health interval), and only then the stop.
    const stopAt = h.log.indexOf('systemctl stop debateai-preview-ui@old-v1.service debateai-preview-api@old-v1.service');
    expect(h.log.slice(0, stopAt).filter(entry => entry.startsWith('edge:'))).toEqual(Array(EDGE_CONFIRMATIONS).fill('edge:new'));
    expect(h.log[stopAt - 1]).toBe('sleep 2500');
    const ttf = h.events.find(event => event.key === NEW_KEY && event.kind === 'CURRENT')!.ttf!;
    expect(r).toEqual({ event: 'PREVIEW_RELEASE_SWITCH_FINISHED', to: 'new-v1', from: 'old-v1', toKey: NEW_KEY, fromKey: OLD_KEY, edgeConfirmedMs: r.edgeConfirmedMs,
      edgeFailures: 0, backstopAt: iso(Math.ceil((ttf - TAKE_TRAFFIC_AFTER_S * 1000 + BACKSTOP_S * 1000) / 1000) * 1000), bad: [] });
    expect(h.stateOf(OLD_KEY)).toEqual({ state: 'DRAINING', frontPairStopped: true, retireRequested: false });
    expect(h.switchCalls()).toEqual([]);
  });

  it('finish repeats only what is missing: the gate files of the switch are kept, a retired old release gets no backstop', async () => {
    const h = host({ history: [...WRITTEN, [OLD_KEY, 'FRONT_PAIR_STOPPED'], [OLD_KEY, 'RETIRED', 'RUNNER_RETIRED']],
      units: { [U('api', 'old-v1')]: 'inactive', [U('ui', 'old-v1')]: 'inactive', [U('runner', 'old-v1')]: 'inactive' } });
    h.files[GATE_FILES] = '{"kept":true}\n';
    const r = await finishSwitch({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(h.writes()).toEqual(['systemctl stop debateai-preview-ui@old-v1.service debateai-preview-api@old-v1.service', `unitfile ${TARGET_DROPIN}`, 'systemctl daemon-reload']);
    expect(r).toMatchObject({ backstopAt: null, bad: [] });
    expect(h.files[GATE_FILES]).toBe('{"kept":true}\n');
  });

  it('a backstop time already in the past is armed one second from now (it asks at once)', async () => {
    const h = host({ history: WRITTEN });
    const ttf = h.events.find(event => event.key === NEW_KEY && event.kind === 'CURRENT')!.ttf!;
    h.deps.now = () => ttf + 2 * BACKSTOP_S * 1000;
    const r = await finishSwitch({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps });
    expect(r.backstopAt).toBe(iso(Math.ceil((ttf + 2 * BACKSTOP_S * 1000 + 1000) / 1000) * 1000));
  });

  it('finish refuses when the table does not name `to` current, or `from` does not drain, before anything is written', async () => {
    const h = host();
    expect(await refusal(finishSwitch({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }))).toMatchObject({ code: 'FINISH_PRECONDITION_FAILED', fields: ['current', 'state'] });
    expect((await refusal(finishSwitch({ to: 'new-v1', from: 'new-v1', layout, deps: h.deps }))).fields).toEqual(['labels']);
    expect(h.writes()).toEqual([]);
  });

  it('finish stops nothing while the edge does not show `to`', async () => {
    const h = host({ history: WRITTEN, edgeBefore: caddy(502) });
    expect(await refusal(finishSwitch({ to: 'new-v1', from: 'old-v1', layout, deps: h.deps }))).toMatchObject({ code: 'FINISH_EDGE_UNCONFIRMED' });
    expect(h.writes()).toEqual([]);
  });
});

describe('stage and seed', () => {
  it('stages a release the table has never heard of, once', async () => {
    const h = host({ history: [[OLD_KEY, 'STAGED'], [OLD_KEY, 'CURRENT']] });
    expect(await stageRelease({ label: 'new-v1', layout, deps: h.deps })).toEqual({ event: 'PREVIEW_RELEASE_STAGED', label: 'new-v1', releaseKey: NEW_KEY, recorded: true });
    expect(await stageRelease({ label: 'new-v1', layout, deps: h.deps })).toEqual({ event: 'PREVIEW_RELEASE_STAGED', label: 'new-v1', releaseKey: NEW_KEY, recorded: false });
    expect(h.writes()).toEqual(['event(new STAGED)']);
  });

  it('never stages the current release, a draining one or a retired one (the rollback does that)', async () => {
    for (const label of ['old-v1']) {
      const h = host();
      expect(await refusal(stageRelease({ label, layout, deps: h.deps }))).toMatchObject({ code: 'STAGE_STATE_REFUSED', fields: { state: 'CURRENT' } });
      expect(h.writes()).toEqual([]);
    }
    const drained = host({ history: AFTER_SWITCH });
    expect((await refusal(stageRelease({ label: 'old-v1', layout, deps: drained.deps }))).fields).toEqual({ state: 'DRAINING' });
    expect((await refusal(stageRelease({ label: 'gone-v1', layout, deps: drained.deps }))).code).toBe('RELEASE_LOCK_RELEASE_MISSING');
    expect((await refusal(stageRelease({ label: 'x'.repeat(65), layout, deps: drained.deps }))).code).toBe('RELEASE_LABEL_TOO_LONG');
    expect(drained.writes()).toEqual([]);
  });

  it('counts a STAGED row whose answer was lost as written, and refuses one that never landed', async () => {
    const committed = host({ history: [[OLD_KEY, 'STAGED'], [OLD_KEY, 'CURRENT']], eventFails: { STAGED: 'UNREADABLE_BUT_COMMITTED' } });
    expect((await stageRelease({ label: 'new-v1', layout, deps: committed.deps })).recorded).toBe(true);
    const lost = host({ history: [[OLD_KEY, 'STAGED'], [OLD_KEY, 'CURRENT']], eventFails: { STAGED: 'UNREADABLE' } });
    expect((await refusal(stageRelease({ label: 'new-v1', layout, deps: lost.deps }))).code).toBe('RELEASE_TABLE_UNREADABLE');
  });

  it('seed refuses when a current release already exists', async () => {
    const h = host();
    expect(await refusal(seedRelease({ label: 'new-v1', layout, deps: h.deps }))).toMatchObject({ code: 'SEED_REFUSED', fields: ['current'] });
    expect(h.writes()).toEqual([]);
  });

  it('seeds the first current release: STAGED, then a switch with no expected current, traffic at once, and the boot target', async () => {
    const h = host({ history: [] });
    const r = await seedRelease({ label: 'new-v1', layout, deps: h.deps });
    expect(h.writes()).toEqual(['event(new STAGED)', 'recordReleaseSwitch(new→, expect null, 0s)', `unitfile ${TARGET_DROPIN}`, 'systemctl daemon-reload']);
    expect(r).toEqual({ event: 'PREVIEW_RELEASE_SEEDED', label: 'new-v1', releaseKey: NEW_KEY, takeTrafficFrom: r.takeTrafficFrom, bad: [] });
    expect(r.takeTrafficFrom).toBe(iso(h.events.at(-1)!.ttf!));
    expect(h.files[TARGET_DROPIN]).toBe(renderTargetDropin('new-v1'));
    // Nothing is started, stopped or asked of the edge: seed runs before T's website and API start.
    expect(h.log.some(entry => entry.startsWith('edge:') || entry.startsWith('systemctl st'))).toBe(false);
  });

  it('the boot target writer touches only 60-current-release.conf: the Anthropic gate\'s drop-in beside it stays (final fix wave S1)', async () => {
    // The live preview already has debateai-preview.target.d with 50-anthropic-gate.conf (README-anthropic.md "Switch it on").
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'release-switch-target-')));
    try {
      const folder = join(root, 'debateai-preview.target.d');
      mkdirSync(folder); chmodSync(folder, 0o755);
      const gate = '[Unit]\nWants=debateai-preview-anthropic-budget.service\nWants=debateai-preview-anthropic-halt-watch.timer debateai-preview-anthropic-addresses.timer\n';
      writeFileSync(join(folder, '50-anthropic-gate.conf'), gate, { mode: 0o644 });
      const before = statSync(join(folder, '50-anthropic-gate.conf'));
      // The server's own writer (no writeUnitFile stand-in): ensureDirectory + atomicWrite into the layout's unit folder.
      const local = { ...layout, systemdUnitDir: root, ownerUid: process.getuid!(), ownerGid: process.getgid!() };
      const h = host({ history: [] });
      delete h.deps.writeUnitFile;
      expect((await seedRelease({ label: 'new-v1', layout: local, deps: h.deps })).bad).toEqual([]);
      expect(readdirSync(folder).sort()).toEqual(['50-anthropic-gate.conf', '60-current-release.conf']);
      expect(readFileSync(join(folder, '60-current-release.conf'), 'utf8')).toBe(renderTargetDropin('new-v1'));
      expect(readFileSync(join(folder, '50-anthropic-gate.conf'), 'utf8')).toBe(gate);
      const after = statSync(join(folder, '50-anthropic-gate.conf'));
      expect([after.ino, after.mode, after.mtimeMs]).toEqual([before.ino, before.mode, before.mtimeMs]);
      expect(statSync(folder).mode & 0o777).toBe(0o755);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('the way back (side-by-side spec §11)', () => {
  const rollbackHost = (options: Options = {}) => host({ history: AFTER_SWITCH, units: AFTER_SWITCH_UNITS, ...options });

  it('rollback starts the old runner before the old pair, and the pair before the switch', async () => {
    // The old runner restarts in database-ahead mode and re-sends its own lapsed work (startupDispatched 3).
    const h = rollbackHost({ runnerDispatched: 3 });
    const r = await rollbackRelease({ to: 'old-v1', from: 'new-v1', layout, deps: h.deps });
    expect(h.writes()).toEqual([
      // Requirement 3: the older release's stale backstop and 25-minute check can never fire.
      'systemctl disable --now debateai-preview-runner-retire@old-v1.timer', 'systemctl disable --now debateai-preview-runner-retire-check@old-v1.timer',
      'event(old STAGED)',
      'systemctl start --no-block debateai-preview-runner@old-v1.service',
      'systemctl start --no-block debateai-preview-api@old-v1.service',
      'systemctl start --no-block debateai-preview-ui@old-v1.service',
      'recordReleaseSwitch(old→, expect new, 8s)',
      'systemctl stop debateai-preview-ui@new-v1.service debateai-preview-api@new-v1.service',
      `unitfile ${NEW_BACKSTOP_DROPIN}`, 'systemctl daemon-reload',
      'systemctl enable debateai-preview-runner-retire@new-v1.timer', 'systemctl restart debateai-preview-runner-retire@new-v1.timer',
      `unitfile ${TARGET_DROPIN}`, 'systemctl daemon-reload',
      `statefile /var/lib/debateai-v3-preview/lifecycle/release-${OLD_KEY}-gate-files.json`
    ]);
    expect(r).toMatchObject({ event: 'PREVIEW_RELEASE_ROLLED_BACK', to: 'old-v1', from: 'new-v1', toKey: OLD_KEY, fromKey: NEW_KEY, started: ['runner', 'api', 'ui'], edgeFailures: 0, bad: [] });
    // The new runner keeps finishing what it started (O1): never stopped.
    expect(h.units[U('runner', 'new-v1')]).toBe('active');
    expect(h.stateOf(NEW_KEY)).toEqual({ state: 'DRAINING', frontPairStopped: true, retireRequested: false });
    // Each start waited for its own proof first: the runner's start line, the API's, then the website's NOT_CURRENT.
    const at = (entry: string) => h.log.indexOf(entry);
    expect(at(`read:journal(${U('runner', 'old-v1')})`)).toBeLessThan(at(`systemctl start --no-block ${U('api', 'old-v1')}`));
    expect(at(`read:journal(${U('api', 'old-v1')})`)).toBeLessThan(at(`systemctl start --no-block ${U('ui', 'old-v1')}`));
    expect(at('read:website(old-v1)')).toBeLessThan(at('recordReleaseSwitch(old→, expect new, 8s)'));
  });

  it('starts only what is not running, and a half-done rollback can be run again', async () => {
    // The old runner never retired (still draining); an earlier rollback re-staged the release and then stopped.
    const h = rollbackHost({ history: [...AFTER_SWITCH, [OLD_KEY, 'STAGED']], units: { [U('api', 'old-v1')]: 'inactive', [U('ui', 'old-v1')]: 'inactive' } });
    const r = await rollbackRelease({ to: 'old-v1', from: 'new-v1', layout, deps: h.deps });
    expect(r.started).toEqual(['api', 'ui']);
    expect(h.writes().filter(entry => entry.startsWith('event(') || entry.includes('runner@old'))).toEqual([]);
  });

  it('a half-done rollback of a RETIRED older release runs again once its runner has announced its start', async () => {
    const h = rollbackHost({ history: [...AFTER_SWITCH, [OLD_KEY, 'RETIRED', 'RUNNER_RETIRED']], startAnnounces: false });
    expect((await refusal(rollbackRelease({ to: 'old-v1', from: 'new-v1', layout, deps: h.deps }))).code).toBe('ROLLBACK_RUNNER_NOT_STARTED');
    expect(h.stateOf(OLD_KEY).state).toBe('STAGED');
    // The runner was only slow (its prestart verifies first): its start line comes after the 240 s.
    h.announce(U('runner', 'old-v1'), { releaseKey: OLD_KEY, startupDispatched: 0 });
    h.configure({ startAnnounces: true });
    const before = h.writes().length;
    const r = await rollbackRelease({ to: 'old-v1', from: 'new-v1', layout, deps: h.deps });
    expect(r).toMatchObject({ event: 'PREVIEW_RELEASE_ROLLED_BACK', started: ['api', 'ui'], bad: [] });
    expect(h.writes().slice(before).filter(entry => entry.startsWith('event('))).toEqual([]);
  });

  it('clears a failed unit before starting it, so a queued start is not read as failed', async () => {
    const h = rollbackHost({ units: { ...AFTER_SWITCH_UNITS, [U('runner', 'old-v1')]: 'failed' } });
    const r = await rollbackRelease({ to: 'old-v1', from: 'new-v1', layout, deps: h.deps });
    expect(r.started).toEqual(['runner', 'api', 'ui']);
    const writes = h.writes();
    expect(writes.slice(writes.indexOf('event(old STAGED)') + 1, writes.indexOf('event(old STAGED)') + 3)).toEqual([
      'systemctl reset-failed debateai-preview-runner@old-v1.service', 'systemctl start --no-block debateai-preview-runner@old-v1.service']);
    // A unit that is merely stopped is started without it.
    expect(writes.filter(entry => entry.startsWith('systemctl reset-failed'))).toHaveLength(1);
  });

  it.each([
    ['to is the current release', { history: DEFAULT_HISTORY, units: {} }, ['current', 'state']],
    ['to was never switched to', { history: [[NEW_KEY, 'STAGED'], [NEW_KEY, 'CURRENT'], [OLD_KEY, 'STAGED']] }, ['state']],
    ['a gate halted', { gates: { deepinfra: 'halted' } }, ['gates']],
    ['the same slot', { slots: { 'old-v1': 'B', 'new-v1': 'B' } }, ['slot']]
  ] as [string, Options, string[]][])('rollback refuses when %s, before anything is disarmed, written or started', async (_case, options, fields) => {
    const h = rollbackHost(options);
    const error = await refusal(rollbackRelease({ to: 'old-v1', from: 'new-v1', layout, deps: h.deps }));
    expect(error.code).toBe('ROLLBACK_PRECONDITION_FAILED');
    expect(error.fields).toEqual(fields);
    expect(h.writes()).toEqual([]);
  });

  it('stops at an old runner that never announces its start, and starts nothing after it', async () => {
    const h = rollbackHost({ startAnnounces: false });
    const error = await refusal(rollbackRelease({ to: 'old-v1', from: 'new-v1', layout, deps: h.deps }));
    expect(error.code).toBe('ROLLBACK_RUNNER_NOT_STARTED');
    expect(h.clock() - START).toBeGreaterThanOrEqual(240_000);
    expect(h.writes().filter(entry => entry.startsWith('systemctl st'))).toEqual(['systemctl start --no-block debateai-preview-runner@old-v1.service']);
    expect(h.switchCalls()).toEqual([]);
  });

  it('rollback before the switch stops only the new release and never switches', async () => {
    const h = host();
    const r = await rollbackRelease({ from: 'new-v1', beforeSwitch: true, layout, deps: h.deps });
    expect(h.writes()).toEqual(['systemctl stop debateai-preview-runner@new-v1.service debateai-preview-ui@new-v1.service debateai-preview-api@new-v1.service', 'event(new RETIRED NOT_SWITCHED)']);
    expect(r).toEqual({ event: 'PREVIEW_RELEASE_ROLLED_BACK', beforeSwitch: true, label: 'new-v1', releaseKey: NEW_KEY, outcome: 'RETIRED', backstopAt: null, bad: [] });
    expect(h.switchCalls()).toEqual([]);
    expect([U('runner', 'old-v1'), U('api', 'old-v1'), U('ui', 'old-v1')].map(unit => h.units[unit])).toEqual(['active', 'active', 'active']);
  });

  it('rollback before the switch refuses a release with open work, or one that is not STAGED', async () => {
    const busy = host({ openWork: { new: 1 } });
    expect((await refusal(rollbackRelease({ from: 'new-v1', beforeSwitch: true, layout, deps: busy.deps }))).fields).toEqual(['openWork']);
    expect((await refusal(rollbackRelease({ from: 'old-v1', beforeSwitch: true, layout, deps: busy.deps }))).fields).toEqual(['state']);
    expect(busy.writes()).toEqual([]);
  });

  it('rollback before the switch on a re-staged release that still drains: back to DRAINING, website and API stopped, runner kept, backstop armed', async () => {
    // A half-done rollback: old was staged again (its runner still owns work) and is now given up (controller ruling Q3).
    const h = rollbackHost({ history: [...AFTER_SWITCH, [OLD_KEY, 'STAGED']], units: { [U('runner', 'old-v1')]: 'active' }, openWork: { old: 2 } });
    const r = await rollbackRelease({ from: 'old-v1', beforeSwitch: true, layout, deps: h.deps });
    const OLD_DROPIN = BACKSTOP_DROPIN;
    expect(h.writes()).toEqual([
      'event(old DRAINING RESTAGE_ABANDONED)',
      'systemctl stop debateai-preview-ui@old-v1.service debateai-preview-api@old-v1.service',
      `unitfile ${OLD_DROPIN}`, 'systemctl daemon-reload',
      'systemctl enable debateai-preview-runner-retire@old-v1.timer', 'systemctl restart debateai-preview-runner-retire@old-v1.timer'
    ]);
    const drainedAt = [...h.events].reverse().find(event => event.key === OLD_KEY && event.kind === 'DRAINING')!.at;
    expect(r).toEqual({ event: 'PREVIEW_RELEASE_ROLLED_BACK', beforeSwitch: true, label: 'old-v1', releaseKey: OLD_KEY, outcome: 'DRAINING', backstopAt: iso(Math.ceil((drainedAt + BACKSTOP_S * 1000) / 1000) * 1000), bad: [] });
    expect(h.units[U('runner', 'old-v1')]).toBe('active');
    expect(h.stateOf(OLD_KEY)).toEqual({ state: 'DRAINING', frontPairStopped: true, retireRequested: false });
    expect(h.switchCalls()).toEqual([]);
  });
});

describe('the way back when the database refuses', () => {
  it('rollback before the switch stops nothing when the database refuses DRAINING', async () => {
    const h = host({ history: [...AFTER_SWITCH, [OLD_KEY, 'STAGED']], units: { [U('runner', 'old-v1')]: 'active' }, eventFails: { DRAINING: 'REFUSED' } });
    expect((await refusal(rollbackRelease({ from: 'old-v1', beforeSwitch: true, layout, deps: h.deps }))).code).toBe('RELEASE_EVENT_REFUSED');
    expect(h.writes()).toEqual(['event(old DRAINING RESTAGE_ABANDONED)']);
    expect(h.stateOf(OLD_KEY).state).toBe('STAGED');
  });
});

describe('gate files (D11 compares them)', () => {
  const roots: string[] = [];
  afterAll(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  const gateAt = (root: string) => {
    mkdirSync(join(root, 'op', 'lib'), { recursive: true });
    writeFileSync(join(root, 'op', 'preview_budget_authority.py'), 'print(1)\n');
    writeFileSync(join(root, 'op', 'lib', 'helper.py'), 'X = 1\n');
    writeFileSync(join(root, 'go.json'), '{"go":true}\n');
    return [{ name: 'deepinfra', folder: join(root, 'op'), go: join(root, 'go.json'), privateDir: join(root, 'private') }];
  };
  it('changes when a byte, a file name or a link changes, and only then', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'release-switch-gates-')));
    roots.push(root);
    const gates = gateAt(root);
    const first = await gateFilesDigest(gates);
    expect(first).toEqual([{ name: 'deepinfra', goSha256: expect.stringMatching(/^[0-9a-f]{64}$/), folderSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(await gateFilesDigest(gates)).toEqual(first);
    writeFileSync(join(root, 'op', 'lib', 'helper.py'), 'X = 2\n');
    const second = await gateFilesDigest(gates);
    expect(second[0].folderSha256).not.toBe(first[0].folderSha256);
    expect(second[0].goSha256).toBe(first[0].goSha256);
    writeFileSync(join(root, 'op', 'lib', 'extra.py'), '');
    const third = await gateFilesDigest(gates);
    expect(third[0].folderSha256).not.toBe(second[0].folderSha256);
    symlinkSync('helper.py', join(root, 'op', 'lib', 'link.py'));
    expect((await gateFilesDigest(gates))[0].folderSha256).not.toBe(third[0].folderSha256);
    writeFileSync(join(root, 'go.json'), '{"go":false}\n');
    expect((await gateFilesDigest(gates))[0].goSha256).not.toBe(first[0].goSha256);
    expect(Object.isFrozen(first)).toBe(true);
  });
  it('refuses a missing GO file or folder', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'release-switch-gates-')));
    roots.push(root);
    const [gate] = gateAt(root);
    await expect(gateFilesDigest([{ ...gate!, go: join(root, 'missing.json') }])).rejects.toMatchObject({ code: 'GATE_FILES_UNREADABLE' });
    await expect(gateFilesDigest([{ ...gate!, folder: join(root, 'missing') }])).rejects.toMatchObject({ code: 'GATE_FILES_UNREADABLE' });
  });
});

describe('the HTTP reader', () => {
  const servers: import('node:http').Server[] = [];
  afterAll(() => { for (const server of servers.splice(0)) server.close(); });
  const serve = async (handler: import('node:http').RequestListener) => {
    const { createServer } = await import('node:http');
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/readyz`;
  };
  it('returns the status, the release header and the body, and sends only the headers it is given', async () => {
    let seen: Record<string, unknown> = {};
    const url = await serve((request, response) => { seen = request.headers; response.writeHead(503, { 'x-debateai-release': NEW_KEY }); response.end('{"ready":false}'); });
    expect(await releaseSwitch.httpGet(url, { headers: { 'x-debateai-edge-secret': SECRET }, timeoutMs: 2000 })).toEqual({ status: 503, release: NEW_KEY, body: '{"ready":false}' });
    expect(seen['x-debateai-edge-secret']).toBe(SECRET);
    const bare = await serve((_request, response) => { response.writeHead(502); response.end(); });
    expect(await releaseSwitch.httpGet(bare, { headers: {}, timeoutMs: 2000 })).toEqual({ status: 502, release: null, body: '' });
  });
  it('rejects a request that outlives its deadline, and a body over 64 KiB', async () => {
    const slow = await serve(() => { /* never answers */ });
    await expect(releaseSwitch.httpGet(slow, { headers: {}, timeoutMs: 100 })).rejects.toThrow();
    const large = await serve((_request, response) => { response.writeHead(200); response.end('x'.repeat(65 * 1024)); });
    await expect(releaseSwitch.httpGet(large, { headers: {}, timeoutMs: 2000 })).rejects.toThrow('BODY_TOO_LARGE');
  });
});

describe('release-switch.mjs (root CLI)', () => {
  const sink = () => { const lines: string[] = []; return { lines, stream: { write: (text: string) => { lines.push(text); return true; } } }; };
  const cli = async (argv: string[], deps: Record<string, any>, actor: { platform?: string; uid?: number } = {}, cliLayout: Record<string, unknown> = layout) => {
    const stdout = sink(), stderr = sink();
    const code = await main(argv, { platform: 'linux', uid: 0, layout: cliLayout, deps, stdout: stdout.stream, stderr: stderr.stream, ...actor });
    return { code, stdout: stdout.lines.join(''), stderr: stderr.lines.join('') };
  };

  it('exits 0 with one result line for a clean switch', async () => {
    const h = host();
    const out = await cli(['switch', '--to', 'new-v1', '--from', 'old-v1'], h.deps);
    expect([out.code, out.stderr]).toEqual([0, '']);
    expect(JSON.parse(out.stdout)).toMatchObject({ event: 'PREVIEW_RELEASE_SWITCHED', bad: [] });
    expect(out.stdout.endsWith('}\n')).toBe(true);
  });

  it('exits 2 when the switch finished with a bad check (an edge failure seen during the switch)', async () => {
    const h = host({ edgeAfter: [[caddy(504), site(NEW_KEY)]] });
    const out = await cli(['switch', '--to', 'new-v1', '--from', 'old-v1'], h.deps);
    expect(out.code).toBe(2);
    expect(JSON.parse(out.stdout)).toMatchObject({ edgeFailures: 1, bad: ['EDGE_FAILURES'] });
  });

  it('the drained path (guide DR6): with --old-pair-stopped the old runner stopped on purpose is fine, exit 0, and mark-retired then runs', async () => {
    // DR2 stopped the old website, API and runner (nothing open); the edge had no healthy slot before the switch.
    const h = host({ units: AFTER_SWITCH_UNITS, edgeBefore: caddy(502) });
    const out = await cli(['switch', '--to', 'new-v1', '--from', 'old-v1', '--old-pair-stopped'], h.deps);
    expect([out.code, out.stderr]).toEqual([0, '']);
    expect(JSON.parse(out.stdout)).toMatchObject({ event: 'PREVIEW_RELEASE_SWITCHED', toKey: NEW_KEY, fromKey: OLD_KEY, edgeFailures: 0, bad: [] });
    expect(h.stateOf(OLD_KEY).state).toBe('DRAINING');
    const retired = { out: [] as string[], err: [] as string[] };
    const code = await retire.main(['mark-retired', '--label', 'old-v1'], { platform: 'linux', uid: 0, layout, deps: h.deps,
      stdout: { write: (line: string) => retired.out.push(line) }, stderr: { write: (line: string) => retired.err.push(line) } });
    expect([code, retired.err]).toEqual([0, []]);
    expect(JSON.parse(retired.out.join(''))).toMatchObject({ event: 'PREVIEW_RELEASE_DRAINED_RETIRED', label: 'old-v1', releaseKey: OLD_KEY, openWork: 0 });
    expect(h.eventLog().slice(-1)).toEqual(['old RETIRED DRAINED']);
    // The backstop the switch armed for the old release is turned off again.
    expect(h.log.filter(entry => entry.startsWith('systemctl disable'))).toEqual(['systemctl disable --now debateai-preview-runner-retire@old-v1.timer', 'systemctl disable --now debateai-preview-runner-retire-check@old-v1.timer']);
  });

  it('the drained path after SWITCH_OUTCOME_UNKNOWN: switch --finish --old-pair-stopped expects the old runner stopped, exit 0, and mark-retired then runs', async () => {
    const h = host({ units: AFTER_SWITCH_UNITS, edgeBefore: caddy(502), switchFails: 'UNREADABLE_REREAD_FAILS' });
    const lost = await cli(['switch', '--to', 'new-v1', '--from', 'old-v1', '--old-pair-stopped'], h.deps);
    expect([lost.code, JSON.parse(lost.stderr).reason]).toEqual([1, 'SWITCH_OUTCOME_UNKNOWN']);
    expect(JSON.parse(lost.stderr).fields.next).toBe(`if the release table names ${NEW_KEY} current: release-switch.mjs switch --finish --to new-v1 --from old-v1 --old-pair-stopped`);
    // The write landed (new CURRENT, old DRAINING) and the table is readable again.
    h.configure({ switchFails: undefined });
    expect(h.eventLog().slice(-2)).toEqual(['new CURRENT', 'old DRAINING']);
    // Without the flag the finish cannot know the old runner was stopped on purpose.
    const plain = await cli(['switch', '--finish', '--to', 'new-v1', '--from', 'old-v1'], h.deps);
    expect([plain.code, JSON.parse(plain.stdout).bad]).toEqual([2, ['RUNNER_FROM']]);
    const out = await cli(['switch', '--finish', '--to', 'new-v1', '--from', 'old-v1', '--old-pair-stopped'], h.deps);
    expect([out.code, out.stderr]).toEqual([0, '']);
    expect(JSON.parse(out.stdout)).toMatchObject({ event: 'PREVIEW_RELEASE_SWITCH_FINISHED', toKey: NEW_KEY, fromKey: OLD_KEY, edgeFailures: 0, bad: [] });
    const code = await retire.main(['mark-retired', '--label', 'old-v1'], { platform: 'linux', uid: 0, layout, deps: h.deps, stdout: { write: () => true }, stderr: { write: () => true } });
    expect(code).toBe(0);
    expect(h.eventLog().slice(-1)).toEqual(['old RETIRED DRAINED']);
  });

  it('on any other path an old runner that is not running and not retired is still a bad check', async () => {
    const h = host({ units: { [U('runner', 'old-v1')]: 'inactive' } });
    const out = await cli(['switch', '--to', 'new-v1', '--from', 'old-v1'], h.deps);
    expect(out.code).toBe(2);
    expect(JSON.parse(out.stdout).bad).toEqual(['RUNNER_FROM']);
  });

  it('exits 1 with one content-free refusal line', async () => {
    const h = host({ maintenance: true });
    const out = await cli(['switch', '--to', 'new-v1', '--from', 'old-v1'], h.deps);
    expect([out.code, out.stdout]).toEqual([1, '']);
    expect(JSON.parse(out.stderr)).toEqual({ event: 'PREVIEW_RELEASE_SWITCH_REFUSED', to: 'new-v1', from: 'old-v1', reason: 'SWITCH_PRECONDITION_FAILED', fields: ['maintenance'] });
    expect(out.stderr).not.toContain(SECRET);
  });

  it('runs every command shape', async () => {
    expect((await cli(['stage', '--label', 'new-v1'], host({ history: [] }).deps)).code).toBe(0);
    expect((await cli(['seed', '--label', 'new-v1'], host({ history: [] }).deps)).code).toBe(0);
    expect((await cli(['rollback', '--to', 'old-v1', '--from', 'new-v1'], host({ history: AFTER_SWITCH, units: AFTER_SWITCH_UNITS }).deps)).code).toBe(0);
    const before = await cli(['rollback', '--before-switch', '--label', 'new-v1'], host().deps);
    expect([before.code, JSON.parse(before.stdout).outcome]).toEqual([0, 'RETIRED']);
    const finished = await cli(['switch', '--finish', '--to', 'new-v1', '--from', 'old-v1'], host({ history: [...DEFAULT_HISTORY, [NEW_KEY, 'CURRENT'], [OLD_KEY, 'DRAINING']] }).deps);
    expect([finished.code, JSON.parse(finished.stdout).event]).toEqual([0, 'PREVIEW_RELEASE_SWITCH_FINISHED']);
    const refused = await cli(['rollback', '--before-switch', '--label', 'old-v1'], host().deps);
    expect(JSON.parse(refused.stderr)).toEqual({ event: 'PREVIEW_RELEASE_ROLLBACK_REFUSED', label: 'old-v1', reason: 'ROLLBACK_PRECONDITION_FAILED', fields: ['state'] });
  });

  it('runs one command at a time: a lock file holding its pid, refused while held, removed when it ends', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'release-switch-lock-')));
    try {
      const lockPath = join(root, 'release-switch.lock');
      const h = host({ history: [] });
      const deps: Record<string, any> = { ...h.deps };
      delete deps.acquireLock;
      let heldDuring: string | null = null;
      const readLock = deps.readLock;
      deps.readLock = async () => { heldDuring = readFileSync(lockPath, 'utf8'); return readLock(); };
      const done = await cli(['stage', '--label', 'new-v1'], deps, {}, { ...layout, lockRoot: root });
      expect([done.code, heldDuring]).toEqual([0, `${process.pid}\n`]);
      expect(existsSync(lockPath)).toBe(false);
      // A refused command lets go too.
      expect((await cli(['stage', '--label', 'gone-v1'], deps, {}, { ...layout, lockRoot: root })).code).toBe(1);
      expect(existsSync(lockPath)).toBe(false);
      // Held by a live process: refused, and the holder's file stays as it was.
      writeFileSync(lockPath, `${process.pid}\n`, { mode: 0o600 });
      const busy = await cli(['stage', '--label', 'new-v1'], deps, {}, { ...layout, lockRoot: root });
      expect([busy.code, JSON.parse(busy.stderr)]).toEqual([1, { event: 'PREVIEW_RELEASE_STAGE_REFUSED', label: 'new-v1', reason: 'RELEASE_SWITCH_BUSY', fields: { holderPid: process.pid, holderAlive: true } }]);
      expect(readFileSync(lockPath, 'utf8')).toBe(`${process.pid}\n`);
      // Left by a process that is gone (an ssh drop skips the release): still refused, and the refusal says how to clear it.
      writeFileSync(lockPath, '2147483646\n');
      expect(JSON.parse((await cli(['stage', '--label', 'new-v1'], deps, {}, { ...layout, lockRoot: root })).stderr).fields).toEqual({
        holderPid: 2147483646, holderAlive: false,
        next: `no release-switch.mjs is running (check: pgrep -f release-switch.mjs); move ${lockPath} aside, then re-run`
      });
      expect(readFileSync(lockPath, 'utf8')).toBe('2147483646\n');
      // An empty file: another command has just created it and not yet written its pid. Never "move it aside" first.
      writeFileSync(lockPath, '');
      expect(JSON.parse((await cli(['stage', '--label', 'new-v1'], deps, {}, { ...layout, lockRoot: root })).stderr).fields).toEqual({
        holderPid: null, holderAlive: false,
        next: `re-run in a few seconds (another release-switch.mjs is taking the lock); only if it is still refused and none is `
          + `running (check: pgrep -f release-switch.mjs), move ${lockPath} aside`
      });
      expect(readFileSync(lockPath, 'utf8')).toBe('');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('refuses wrong arguments and anyone but root on Linux, before touching anything', async () => {
    const h = host();
    for (const argv of [[], ['switch'], ['switch', '--to', 'new-v1'], ['switch', '--from', 'old-v1', '--to', 'new-v1'], ['switch', '--to', 'New', '--from', 'old-v1'],
      ['switch', '--to', 'new-v1', '--from', 'old-v1', '--force'], ['stage', '--label', '../x'], ['stage', '--label', 'a-'], ['seed'], ['rollback', '--to', 'old-v1'],
      ['rollback', '--before-switch', '--to', 'new-v1'], ['rollback', '--label', 'new-v1', '--before-switch'], ['retire', '--label', 'new-v1'],
      ['switch', '--finish', '--to', 'new-v1'], ['switch', '--to', 'new-v1', '--from', 'old-v1', '--finish'], ['switch', '--finish', '--old-pair-stopped', '--to', 'new-v1', '--from', 'old-v1'],
      ['switch', '--finish', '--to', 'new-v1', '--from', 'old-v1', '--old-pair-stopped', '--old-pair-stopped'], ['switch', '--finish', '--to', 'new-v1', '--from', 'old-v1', '--force']]) {
      const out = await cli(argv, h.deps);
      expect([argv, out.code, JSON.parse(out.stderr).reason]).toEqual([argv, 1, 'ARGUMENTS_REFUSED']);
    }
    for (const actor of [{ uid: 1000 }, { platform: 'darwin' }]) {
      expect(JSON.parse((await cli(['stage', '--label', 'new-v1'], h.deps, actor)).stderr).reason).toBe('ACTOR_REFUSED');
    }
    expect(h.log).toEqual([]);
  });

  // D16b review: a layout's start lines and gate list are required (VPS_LAYOUT has `gates: []`); without them every
  // command refuses before it reads or writes anything, never a TypeError after the database write.
  it('refuses a layout without its start lines or its gate list, before touching anything', async () => {
    const { startedLines: _lines, ...noLines } = layout;
    const { gates: _gates, ...noGates } = layout;
    const broken = [noLines, noGates, { ...layout, startedLines: { api: 'PREVIEW_API_STARTED' } }, { ...layout, gates: null }];
    for (const bad of broken) {
      const h = host();
      expect((await refusal(switchRelease({ to: 'new-v1', from: 'old-v1', layout: bad, deps: h.deps }))).code).toBe('LAYOUT_REFUSED');
      expect((await refusal(stageRelease({ label: 'new-v1', layout: bad, deps: h.deps }))).code).toBe('LAYOUT_REFUSED');
      expect((await refusal(rollbackRelease({ to: 'old-v1', from: 'new-v1', layout: bad, deps: h.deps }))).code).toBe('LAYOUT_REFUSED');
      expect(h.log).toEqual([]);
      expect(h.switchCalls()).toEqual([]);
    }
  });
});
