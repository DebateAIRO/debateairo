import { describe, expect, it } from 'vitest';
const table = await import('../../deploy/' + 'preview-lifecycle/v1/release-table.mjs');
const common = await import('../../deploy/' + 'preview-lifecycle/v1/common.mjs');
const environment = await import('../../deploy/' + 'preview-auth-dev/v1/environment.mjs');

const { readReleaseState, readCurrentRelease, recordReleaseSwitch, recordReleaseEvent, readReleaseEvents, countOpenWork, countWaiting, psqlArgv } = table;
const LAYOUT = common.LAYOUT;
const KEY = ['r17', 'd50e33165a1b'].join('-');
const OLD = ['r16', '0123456789ab'].join('-');

type Call = { argv: string[]; opts: { env: Record<string, string>; stdin: Buffer; timeoutMs: number; maxOutputBytes: number } };
const result = (fields: Partial<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; overflow: boolean; error: Error }>) => ({
  code: 0, signal: null, error: undefined, timedOut: false, overflow: false, ...fields,
  stdout: Buffer.from(fields.stdout ?? ''), stderr: Buffer.from(fields.stderr ?? '')
});
const ok = (stdout: string) => result({ stdout });
function recorder(answer: ReturnType<typeof result>) {
  const calls: Call[] = [];
  const run = async (argv: string[], opts: Call['opts']) => { calls.push({ argv, opts }); return answer; };
  return { calls, run };
}
const sql = (call: Call | undefined) => call!.opts.stdin.toString('utf8');
const variables = (call: Call | undefined) => call!.argv.flatMap((part, index) => (call!.argv[index - 1] === '-v' && part !== 'ON_ERROR_STOP=1' ? [part] : []));

describe('release table door (side-by-side spec §4)', () => {
  it('runs psql as postgres on the preview socket with the SQL on stdin and the key only as a variable', async () => {
    const calls: any[] = []; const run = async (argv: string[], opts: any) => { calls.push({ argv, opts }); return ok('CURRENT|t|f\n'); };
    expect(await readReleaseState({ releaseKey: KEY, layout: LAYOUT, run })).toEqual({ state: 'CURRENT', frontPairStopped: true, retireRequested: false });
    expect(calls[0].argv.slice(0, 4)).toEqual(['/usr/sbin/runuser', '-u', 'postgres', '--']);
    expect(calls[0].argv).toContain(`release_key=${KEY}`);
    expect(calls[0].opts.stdin.toString()).toMatch(/core\.read_release_state\(:'release_key'\)/);
    expect(calls[0].opts.stdin.toString()).not.toContain(KEY);
    expect(calls[0].opts.env).toEqual({});
  });

  it('builds exactly the reviewed psql command line, variables before the stdin script', async () => {
    expect(psqlArgv(LAYOUT)).toEqual([
      '/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', 'PGCONNECT_TIMEOUT=3',
      '/usr/lib/postgresql/18/bin/psql', '--no-psqlrc', '--no-align', '--tuples-only', '--quiet', '--field-separator=|', '-v', 'ON_ERROR_STOP=1',
      '--host=/run/debateai-v3-preview/postgresql', '--port=5434', '--dbname=debateai', '-f', '-'
    ]);
    const { calls, run } = recorder(ok('CURRENT|t|f\n'));
    await readReleaseState({ releaseKey: KEY, layout: LAYOUT, run });
    expect(calls[0]!.argv).toEqual([...psqlArgv(LAYOUT).slice(0, -2), '-v', `release_key=${KEY}`, '-f', '-']);
    expect(calls[0]!.opts.timeoutMs).toBe(15_000);
    expect(calls[0]!.opts.maxOutputBytes).toBe(64 * 1024);
    expect(Buffer.isBuffer(calls[0]!.opts.stdin)).toBe(true);
  });

  it('lets the database give up before root does, so no write lands after a timeout', async () => {
    const { calls, run } = recorder(ok('41\n'));
    await recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 5, recordedBy: 'root:release-switch', expectedActiveSettings: null, layout: LAYOUT, run });
    expect(sql(calls[0])).toMatch(/^SET statement_timeout = '10s';\n/);
  });

  it("reads the server's error codes untranslated and gives up connecting after 3 s (connect 3 s + statement 10 s < root's 15 s)", async () => {
    const { calls, run } = recorder(ok('41\n'));
    await recordReleaseEvent({ releaseKey: KEY, kind: 'STAGED', recordedBy: 'root:release-switch', reason: null, layout: LAYOUT, run });
    expect(sql(calls[0])).toMatch(/^SET statement_timeout = '10s';\nSET lc_messages = 'C';\nSELECT core\.record_release_event/);
    expect(calls[0]!.argv.slice(0, calls[0]!.argv.indexOf(`${LAYOUT.pgBin}/psql`))).toContain('PGCONNECT_TIMEOUT=3');
    expect(calls[0]!.opts.timeoutMs).toBeGreaterThan(3_000 + 10_000);
  });

  it('reads a release with no row as UNKNOWN', async () => {
    const { run } = recorder(ok(''));
    expect(await readReleaseState({ releaseKey: KEY, layout: LAYOUT, run })).toEqual({ state: 'UNKNOWN', frontPairStopped: false, retireRequested: false });
  });

  it('returns frozen results', async () => {
    expect(Object.isFrozen(await readReleaseState({ releaseKey: KEY, layout: LAYOUT, run: recorder(ok('DRAINING|f|t\n')).run }))).toBe(true);
    expect(Object.isFrozen(await readCurrentRelease({ layout: LAYOUT, run: recorder(ok(`${KEY}|2026-10-21T10:00:05.000Z\n`)).run }))).toBe(true);
    const events = await readReleaseEvents({ releaseKey: KEY, layout: LAYOUT, run: recorder(ok('STAGED|2026-10-21T09:00:00.000Z|\n')).run });
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(events[0])).toBe(true);
  });

  it('maps a refused switch to RELEASE_SWITCH_CONFLICT and nothing else leaks', async () => {
    const stderr = `psql:<stdin>:2: ERROR:  RELEASE_SWITCH_CONFLICT current is ${OLD}\nCONTEXT:  PL/pgSQL function core.record_release_switch secret-detail\n`;
    const { run } = recorder(result({ code: 3, stderr }));
    const error = await recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: null, takeTrafficAfterSeconds: 5, recordedBy: 'root:release-switch', expectedActiveSettings: null, layout: LAYOUT, run }).catch((caught: any) => caught);
    expect(error.code).toBe('RELEASE_SWITCH_CONFLICT');
    expect(error.message).toBe('RELEASE_SWITCH_CONFLICT');
    expect(JSON.stringify({ ...error, message: error.message, stack: error.stack })).not.toMatch(/secret-detail|current is|psql/);
  });

  it('maps an event the database refuses to RELEASE_EVENT_REFUSED and any other failure to RELEASE_TABLE_UNREADABLE', async () => {
    const refused = recorder(result({ code: 3, stderr: 'ERROR:  RELEASE_EVENT_INVALID RETIRED after RETIRED\n' }));
    await expect(recordReleaseEvent({ releaseKey: KEY, kind: 'RETIRED', recordedBy: 'root:release-retire', reason: 'DRAINED', layout: LAYOUT, run: refused.run })).rejects.toMatchObject({ code: 'RELEASE_EVENT_REFUSED', message: 'RELEASE_EVENT_REFUSED' });
    const broken = [
      result({ code: 2, stderr: 'psql: error: connection to server on socket failed\n' }),
      result({ code: null, timedOut: true }),
      result({ code: 0, overflow: true, stdout: '41\n' }),
      result({ code: null, error: new Error('ENOENT spawn') }),
      result({ code: 3, stderr: 'ERROR:  function core.record_release_event does not exist\n' })
    ];
    for (const answer of broken) {
      await expect(recordReleaseEvent({ releaseKey: KEY, kind: 'STAGED', recordedBy: 'root:release-switch', reason: null, layout: LAYOUT, run: recorder(answer).run })).rejects.toMatchObject({ code: 'RELEASE_TABLE_UNREADABLE', message: 'RELEASE_TABLE_UNREADABLE' });
      await expect(readReleaseState({ releaseKey: KEY, layout: LAYOUT, run: recorder(answer).run })).rejects.toMatchObject({ code: 'RELEASE_TABLE_UNREADABLE' });
    }
    // A read never turns a database refusal into anything but unreadable.
    await expect(readReleaseState({ releaseKey: KEY, layout: LAYOUT, run: recorder(result({ code: 3, stderr: 'ERROR:  RELEASE_SWITCH_CONFLICT\n' })).run })).rejects.toMatchObject({ code: 'RELEASE_TABLE_UNREADABLE' });
    // A thrown runner is unreadable too, and its text does not leak.
    await expect(countWaiting({ layout: LAYOUT, run: async () => { throw new Error('secret-detail'); } })).rejects.toMatchObject({ code: 'RELEASE_TABLE_UNREADABLE', message: 'RELEASE_TABLE_UNREADABLE' });
  });

  it('refuses an output line that does not parse', async () => {
    const bad: Array<[string, (run: any) => Promise<unknown>]> = [
      ['CURRENT|t\n', run => readReleaseState({ releaseKey: KEY, layout: LAYOUT, run })],
      ['UNKNOWN|f|f\n', run => readReleaseState({ releaseKey: KEY, layout: LAYOUT, run })],
      ['CURRENT|t|f\nCURRENT|t|f\n', run => readReleaseState({ releaseKey: KEY, layout: LAYOUT, run })],
      ['current|t|f\n', run => readReleaseState({ releaseKey: KEY, layout: LAYOUT, run })],
      ['CURRENT|true|f\n', run => readReleaseState({ releaseKey: KEY, layout: LAYOUT, run })],
      ['legacy|2026-10-21T10:00:05.000Z\n', run => readCurrentRelease({ layout: LAYOUT, run })],
      [`${KEY}|\n`, run => readCurrentRelease({ layout: LAYOUT, run })],
      [`${KEY}|2026-10-21 10:00:05+00\n`, run => readCurrentRelease({ layout: LAYOUT, run })],
      [`${KEY}|2026-10-21T10:00:05.000Z\n${OLD}|2026-10-21T10:00:05.000Z\n`, run => readCurrentRelease({ layout: LAYOUT, run })],
      ['BOGUS|2026-10-21T09:00:00.000Z|\n', run => readReleaseEvents({ releaseKey: KEY, layout: LAYOUT, run })],
      ['RETIRED|2026-10-21T09:00:00.000Z|drained; really\n', run => readReleaseEvents({ releaseKey: KEY, layout: LAYOUT, run })],
      ['-1\n', run => countOpenWork({ releaseKey: KEY, layout: LAYOUT, run })],
      ['07\n', run => countWaiting({ layout: LAYOUT, run })],
      ['', run => countWaiting({ layout: LAYOUT, run })],
      ['3\n4\n', run => countWaiting({ layout: LAYOUT, run })],
      ['', run => recordReleaseEvent({ releaseKey: KEY, kind: 'STAGED', recordedBy: 'root:rollback', reason: null, layout: LAYOUT, run })],
      ['abc\n', run => recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 5, recordedBy: 'root:release-switch', expectedActiveSettings: null, layout: LAYOUT, run })],
      // S15: with an activation the transaction prints two rows (event_seq, activation_seq); one is not the answer.
      ['41\n', run => recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 5, recordedBy: 'root:release-switch', expectedActiveSettings: 16,
        activation: { version: 17, activatedBy: 'root release-switch', reason: `release switch to ${KEY}` }, layout: LAYOUT, run })]
    ];
    for (const [stdout, call] of bad) await expect(call(recorder(ok(stdout)).run), JSON.stringify(stdout)).rejects.toMatchObject({ code: 'RELEASE_TABLE_UNREADABLE' });
  });

  it('refuses an invalid release key before running psql', async () => {
    for (const bad of ['legacy', ['r17', 'D50E33165A1B'].join('-'), "r1-0'; drop", ['r0', '000000000000'].join('-'), 'r17-d50e33165a1', `${KEY}\n`, ` ${KEY}`, undefined, 17]) {
      const { calls, run } = recorder(ok('CURRENT|t|f\n'));
      await expect(readReleaseState({ releaseKey: bad, layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_KEY_INVALID' });
      await expect(readReleaseEvents({ releaseKey: bad, layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_KEY_INVALID' });
      await expect(countOpenWork({ releaseKey: bad, layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_KEY_INVALID' });
      await expect(recordReleaseEvent({ releaseKey: bad, kind: 'STAGED', recordedBy: 'root:rollback', reason: null, layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_KEY_INVALID' });
      await expect(recordReleaseSwitch({ newKey: bad, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 5, recordedBy: 'root:release-switch', layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_KEY_INVALID' });
      await expect(recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: bad, takeTrafficAfterSeconds: 5, recordedBy: 'root:release-switch', layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_KEY_INVALID' });
      expect(calls).toEqual([]);
    }
  });

  it('refuses CURRENT as a plain event; DRAINING goes to the database, which takes it only for an abandoned re-stage', async () => {
    for (const kind of ['CURRENT', 'draining', 'staged', 'STAGED ', '', undefined]) {
      const { calls, run } = recorder(ok('9\n'));
      await expect(recordReleaseEvent({ releaseKey: KEY, kind, recordedBy: 'root:release-switch', reason: null, layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_EVENT_REFUSED' });
      expect(calls).toEqual([]);
    }
    expect(table.EVENT_KINDS).toEqual(['STAGED', 'DRAINING', 'FRONT_PAIR_STOPPED', 'RETIRE_REQUESTED', 'RETIRED']);
    expect(Object.isFrozen(table.EVENT_KINDS)).toBe(true);
    const accepted = recorder(ok('9\n'));
    await recordReleaseEvent({ releaseKey: KEY, kind: 'DRAINING', recordedBy: 'root:rollback', reason: 'RESTAGE_ABANDONED', layout: LAYOUT, run: accepted.run });
    expect(variables(accepted.calls[0])).toEqual([`release_key=${KEY}`, 'kind=DRAINING', 'recorded_by=root:rollback', 'reason=RESTAGE_ABANDONED']);
    // Any other DRAINING (not a re-staged release that still drains) is the database's RELEASE_EVENT_INVALID.
    const refused = recorder(result({ code: 3, stderr: 'ERROR:  RELEASE_EVENT_INVALID\n' }));
    await expect(recordReleaseEvent({ releaseKey: KEY, kind: 'DRAINING', recordedBy: 'root:rollback', reason: null, layout: LAYOUT, run: refused.run })).rejects.toMatchObject({ code: 'RELEASE_EVENT_REFUSED' });
  });

  it('refuses a bad recorder, reason or wait before running psql', async () => {
    const { calls, run } = recorder(ok('9\n'));
    for (const recordedBy of ['root', 'root:', 'Root:x', 'root:release_switch', 'root:a b', `root:${'a'.repeat(41)}`, 'staff:release-switch', 'root:x\n', undefined]) {
      await expect(recordReleaseEvent({ releaseKey: KEY, kind: 'STAGED', recordedBy, reason: null, layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_EVENT_REFUSED' });
      await expect(recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 5, recordedBy, layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_EVENT_REFUSED' });
    }
    for (const reason of ['', 'drained', 'NOT SWITCHED', "X'Y", 'A'.repeat(65), 'A\n', undefined, 7]) {
      await expect(recordReleaseEvent({ releaseKey: KEY, kind: 'RETIRED', recordedBy: 'root:release-retire', reason, layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_EVENT_REFUSED' });
    }
    for (const takeTrafficAfterSeconds of [-1, 61, 1.5, '5', NaN, undefined]) {
      await expect(recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds, recordedBy: 'root:release-switch', layout: LAYOUT, run })).rejects.toMatchObject({ code: 'RELEASE_EVENT_REFUSED' });
    }
    expect(calls).toEqual([]);
    expect(table.RECORDED_BY.test(`root:${'a'.repeat(40)}`)).toBe(true);
  });

  it('records an event with every value as a variable', async () => {
    const { calls, run } = recorder(ok('57\n'));
    expect(await recordReleaseEvent({ releaseKey: KEY, kind: 'RETIRED', recordedBy: 'root:rollback', reason: 'NOT_SWITCHED', layout: LAYOUT, run })).toBeUndefined();
    expect(variables(calls[0])).toEqual([`release_key=${KEY}`, 'kind=RETIRED', 'recorded_by=root:rollback', 'reason=NOT_SWITCHED']);
    expect(sql(calls[0])).toContain("SELECT core.record_release_event(:'release_key', :'kind', :'recorded_by', NULLIF(:'reason', ''));");
    for (const value of [KEY, 'RETIRED', 'root:rollback', 'NOT_SWITCHED']) expect(sql(calls[0])).not.toContain(value);
    const empty = recorder(ok('58\n'));
    await recordReleaseEvent({ releaseKey: KEY, kind: 'STAGED', recordedBy: 'root:rollback', reason: null, layout: LAYOUT, run: empty.run });
    expect(variables(empty.calls[0])).toEqual([`release_key=${KEY}`, 'kind=STAGED', 'recorded_by=root:rollback', 'reason=']);
  });

  it('asks the database clock for the take-traffic time, in one READ COMMITTED transaction that passes the settings pointer (S15)', async () => {
    const { calls, run } = recorder(ok('41\n'));
    expect(await recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 5, recordedBy: 'root:release-switch', expectedActiveSettings: 16, layout: LAYOUT, run })).toBeUndefined();
    expect(sql(calls[0])).toContain([
      'BEGIN ISOLATION LEVEL READ COMMITTED;',
      "SELECT core.record_release_switch(:'new_key', NULLIF(:'expected_current', ''), clock_timestamp() + make_interval(secs => :'seconds'), :'recorded_by', NULLIF(:'expected_active', '')::bigint);",
      'COMMIT;'
    ].join('\n'));
    expect(sql(calls[0])).not.toContain('activate_settings_version');
    expect(calls[0]!.argv).toContain('seconds=5');
    expect(calls[0]!.argv).toContain('ON_ERROR_STOP=1');
    expect(variables(calls[0])).toEqual([`new_key=${KEY}`, `expected_current=${OLD}`, 'seconds=5', 'recorded_by=root:release-switch', 'expected_active=16']);
    for (const value of [KEY, OLD, 'root:release-switch']) expect(sql(calls[0])).not.toContain(value);
    // No current release yet, and no pointer yet: both reach the functions as NULL.
    const first = recorder(ok('1\n'));
    await recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: null, takeTrafficAfterSeconds: 0, recordedBy: 'root:release-switch', expectedActiveSettings: null, layout: LAYOUT, run: first.run });
    expect(variables(first.calls[0])).toEqual([`new_key=${KEY}`, 'expected_current=', 'seconds=0', 'recorded_by=root:release-switch', 'expected_active=']);
  });

  it('activates a settings version in the same transaction, right after the switch, every value a variable (S15, ruling R12)', async () => {
    const { calls, run } = recorder(ok('41\n3\n'));
    const activation = { version: 17, activatedBy: 'root release-switch', reason: `release switch to ${KEY}` };
    await recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 8, recordedBy: 'root:release-switch', expectedActiveSettings: null, activation, layout: LAYOUT, run });
    expect(sql(calls[0])).toContain([
      'BEGIN ISOLATION LEVEL READ COMMITTED;',
      "SELECT core.record_release_switch(:'new_key', NULLIF(:'expected_current', ''), clock_timestamp() + make_interval(secs => :'seconds'), :'recorded_by', NULLIF(:'expected_active', '')::bigint);",
      "SELECT register.activate_settings_version(:'activate'::bigint, NULLIF(:'expected_active', '')::bigint, :'new_key', :'activated_by', :'activation_reason');",
      'COMMIT;'
    ].join('\n'));
    expect(variables(calls[0])).toEqual([`new_key=${KEY}`, `expected_current=${OLD}`, 'seconds=8', 'recorded_by=root:release-switch', 'expected_active=',
      'activate=17', 'activated_by=root release-switch', `activation_reason=release switch to ${KEY}`]);
    for (const value of ['root release-switch', 'release switch to']) expect(sql(calls[0])).not.toContain(value);
  });

  it('requires the settings pointer at every switch and refuses a bad activation before psql runs (S15)', async () => {
    const base = { newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 8, recordedBy: 'root:release-switch', layout: LAYOUT };
    const bad: Record<string, unknown>[] = [
      {}, { expectedActiveSettings: undefined }, { expectedActiveSettings: 0 }, { expectedActiveSettings: '17' }, { expectedActiveSettings: 1.5 },
      { expectedActiveSettings: null, activation: { version: 0, activatedBy: 'root release-switch', reason: 'x' } },
      { expectedActiveSettings: null, activation: { version: 17, activatedBy: 'root:release-switch', reason: 'x' } },
      { expectedActiveSettings: null, activation: { version: 17, activatedBy: 'root release-switch', reason: '' } },
      { expectedActiveSettings: null, activation: { version: 17, activatedBy: 'root release-switch', reason: 'two\nlines' } }
    ];
    for (const extra of bad) {
      const { calls, run } = recorder(ok('41\n'));
      await expect(recordReleaseSwitch({ ...base, ...extra, run }), JSON.stringify(extra)).rejects.toMatchObject({ code: 'RELEASE_EVENT_REFUSED' });
      expect(calls).toEqual([]);
    }
  });

  it("keeps the database's settings refusals by name, the COMMIT's deferred one included (S15)", async () => {
    for (const code of ['SETTINGS_ACTIVATION_CONFLICT', 'SETTINGS_VERSION_NOT_PASSED', 'SETTINGS_ACTIVATION_UNCHANGED', 'SETTINGS_VERSION_KIND_INVALID']) {
      const { run } = recorder(result({ code: 3, stderr: `psql:<stdin>:6: ERROR:  ${code}\nCONTEXT:  secret-detail\n` }));
      const error = await recordReleaseSwitch({ newKey: KEY, expectedCurrentKey: OLD, takeTrafficAfterSeconds: 8, recordedBy: 'root:release-switch', expectedActiveSettings: 16,
        activation: { version: 17, activatedBy: 'root release-switch', reason: 'x' }, layout: LAYOUT, run }).catch((caught: any) => caught);
      expect([error.code, error.message]).toEqual([code, code]);
    }
  });

  it('reads the current release and its take-traffic time, or null when there is none', async () => {
    const { calls, run } = recorder(ok(`${KEY}|2026-10-21T10:00:05.123Z\n`));
    expect(await readCurrentRelease({ layout: LAYOUT, run })).toEqual({ releaseKey: KEY, takeTrafficFrom: '2026-10-21T10:00:05.123Z' });
    expect(sql(calls[0])).toMatch(/FROM core\.read_current_release\(\)/);
    expect(sql(calls[0])).toContain(`AT TIME ZONE 'UTC'`);
    expect(variables(calls[0])).toEqual([]);
    expect(await readCurrentRelease({ layout: LAYOUT, run: recorder(ok('')).run })).toBeNull();
  });

  it('reads one release\'s events in order', async () => {
    const { calls, run } = recorder(ok('STAGED|2026-10-21T09:00:00.000Z|\nCURRENT|2026-10-21T10:00:00.000Z|\nDRAINING|2026-10-21T11:00:00.000Z|\nRETIRED|2026-10-21T12:00:00.000Z|DRAINED\n'));
    expect(await readReleaseEvents({ releaseKey: KEY, layout: LAYOUT, run })).toEqual([
      { kind: 'STAGED', recordedAt: '2026-10-21T09:00:00.000Z', reason: null },
      { kind: 'CURRENT', recordedAt: '2026-10-21T10:00:00.000Z', reason: null },
      { kind: 'DRAINING', recordedAt: '2026-10-21T11:00:00.000Z', reason: null },
      { kind: 'RETIRED', recordedAt: '2026-10-21T12:00:00.000Z', reason: 'DRAINED' }
    ]);
    expect(sql(calls[0])).toMatch(/FROM core\.release_event[\s\S]*WHERE event\.release_key = :'release_key'[\s\S]*ORDER BY event\.event_seq/);
    expect(variables(calls[0])).toEqual([`release_key=${KEY}`]);
    expect(await readReleaseEvents({ releaseKey: KEY, layout: LAYOUT, run: recorder(ok('')).run })).toEqual([]);
  });

  it('counts only the release\'s own open work', async () => {
    const { calls, run } = recorder(ok('3\n'));
    expect(await countOpenWork({ releaseKey: KEY, layout: LAYOUT, run })).toBe(3);
    expect(sql(calls[0])).toMatch(/FROM core\.work_item AS item\s+JOIN core\.run AS run ON run\.run_id = item\.run_id/);
    expect(sql(calls[0])).toMatch(/item\.state IN \('READY', 'CLAIMED'\)/);
    expect(sql(calls[0])).toMatch(/run\.release_key = :'release_key'/);
    expect(variables(calls[0])).toEqual([`release_key=${KEY}`]);
    const all = recorder(ok('0\n'));
    expect(await countOpenWork({ releaseKey: null, layout: LAYOUT, run: all.run })).toBe(0);
    expect(sql(all.calls[0])).toMatch(/FROM core\.work_item AS item\s+WHERE item\.state IN \('READY', 'CLAIMED'\)/);
    expect(sql(all.calls[0])).not.toMatch(/release_key/);
    expect(variables(all.calls[0])).toEqual([]);
  });

  it('counts the waiting line', async () => {
    const { calls, run } = recorder(ok('12\n'));
    expect(await countWaiting({ layout: LAYOUT, run })).toBe(12);
    expect(sql(calls[0])).toContain('SELECT count(*) FROM core.run_waiting_v;');
    expect(variables(calls[0])).toEqual([]);
  });

  it('its release-key pattern is environment.mjs\'s', () => {
    expect(table.RELEASE_KEY_PATTERN.source).toBe(environment.RELEASE_KEY_PATTERN.source);
    expect(table.RELEASE_KEY_PATTERN.flags).toBe(environment.RELEASE_KEY_PATTERN.flags);
    expect(table.RELEASE_KEY_PATTERN.source).toBe('^r[1-9][0-9]*-[0-9a-f]{12}$');
  });
});
