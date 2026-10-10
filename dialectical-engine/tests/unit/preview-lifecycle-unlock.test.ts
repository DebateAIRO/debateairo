import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const unlock = await import('../../deploy/' + 'preview-lifecycle/v1/unlock-team-tools.mjs');
const actor = await import('../../deploy/' + 'preview-lifecycle/v1/readiness-writer-actor.mjs');
const creator = await import('../../deploy/' + 'preview-lifecycle/v1/jit-creator-actor.mjs');
const capture = await import('../../deploy/' + 'preview-lifecycle/v1/self-capture-actor.mjs');
const guard = await import('../../deploy/' + 'preview-lifecycle/v1/release-guard.mjs');
const sourceManifest = await import('../../deploy/' + 'preview-auth-dev/v1/source-manifest.mjs');
const launchPlan = await import('../../deploy/' + 'preview-auth-dev/v1/launch-plan.mjs');
const custody = await import('../../deploy/' + 'preview-auth-dev/v1/custody.mjs');
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const me = { uid: process.getuid!(), gid: process.getgid!() };

const MINUTE = 60_000;
const start = Date.parse('2026-10-09T10:00:00Z');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ready = (expiresAt: number, n = 1) => ({ configSha256: 'a'.repeat(64), generation: uuid(9), ackAdapterId: 'capture', rehearsalId: uuid(n), evidenceExpiresAt: new Date(expiresAt) });

/** A fake clock that only moves when the loop sleeps, plus recording fakes for both interfaces. */
function harness(options: { evidenceTtlMs?: number; staleAfterRefresh?: boolean; publish?: () => Promise<boolean>; open?: () => Promise<void>; close?: () => Promise<unknown>; abortAfterPublishes?: number; slowExtendMs?: number } = {}) {
  let clock = start;
  const calls: string[] = [], leases: { at: number; until: number }[] = [], logs: any[] = [];
  const controller = new AbortController();
  let current: ReturnType<typeof ready> | null = null, refreshes = 0, publishes = 0;
  const writer = {
    kind: 'interim-recovery-login',
    open: options.open ?? (async ({ validUntil }: { validUntil: Date }) => { calls.push('open'); leases.push({ at: clock, until: validUntil.getTime() }); }),
    extend: async ({ validUntil }: { validUntil: Date }) => {
      calls.push('extend'); leases.push({ at: clock, until: validUntil.getTime() });
      // Like the real actor: the renewal takes time, and a lease already in the past is refused.
      clock += options.slowExtendMs ?? 0;
      if (validUntil.getTime() <= clock) throw Object.assign(new Error('STAFF_JIT_LEASE_REFUSED'), { code: 'STAFF_JIT_LEASE_REFUSED' });
    },
    publish: options.publish ?? (async () => { calls.push('publish'); publishes++; if (publishes === options.abortAfterPublishes) controller.abort(); return true; }),
    revoke: async (generation: string) => { calls.push(`revoke:${generation}`); return true; },
    close: options.close ?? (async () => { calls.push('close'); return { passwordNull: true, expiredMinusInfinity: true, noSessions: true }; })
  };
  const evidence = {
    refresh: async () => { calls.push('refresh'); refreshes++; if (!options.staleAfterRefresh || refreshes === 1) current = ready(clock + (options.evidenceTtlMs ?? 5 * MINUTE), refreshes); },
    current: async () => current
  };
  const deps = {
    now: () => clock, log: (event: unknown) => logs.push(event), signal: controller.signal,
    sleep: async (ms: number) => { clock += ms; }
  };
  return { writer, evidence, deps, calls, leases, logs, controller, clock: () => clock };
}

describe('team tools unlock window', () => {
  it('keeps readiness fresh every ten seconds for exactly the window, then revokes and resets the login', async () => {
    const h = harness();
    const result = await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs: 10 * MINUTE });
    expect(result).toMatchObject({ outcome: 'WINDOW_ENDED', roleReset: true, publishes: 60 });
    expect(h.calls[0]).toBe('open');
    expect(h.calls.slice(-2)).toEqual([`revoke:${uuid(9)}`, 'close']);
    expect(h.clock()).toBe(start + 10 * MINUTE);
    expect(h.logs).toHaveLength(2);
    expect(h.logs[0]).toEqual({ event: 'PREVIEW_TEAM_TOOLS_UNLOCKED', until: '2026-10-09T10:10:00.000Z', writer: 'interim-recovery-login', windowMinutes: 10 });
    expect(h.logs[1]).toMatchObject({ event: 'PREVIEW_TEAM_TOOLS_LOCKED', outcome: 'WINDOW_ENDED', publishes: 60, roleReset: true });
  });

  it('never leases the login more than five minutes ahead (the database JIT rule) nor past the window end', async () => {
    const h = harness();
    await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs: 60 * MINUTE });
    expect(h.leases.length).toBeGreaterThan(25);
    for (const lease of h.leases) {
      expect(lease.until).toBeGreaterThan(lease.at);
      expect(lease.until - lease.at).toBeLessThanOrEqual(4 * MINUTE);
      expect(lease.until).toBeLessThanOrEqual(start + 60 * MINUTE);
    }
    const gaps = h.leases.slice(1).map((lease, index) => lease.at - h.leases[index]!.at);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2 * MINUTE + 10_000);
  });

  it('does not renew the login in the last 30 seconds, so a slow renewal cannot turn the end into a failure', async () => {
    const h = harness({ slowExtendMs: 15_000 });
    const windowMs = 2 * MINUTE + 10_000;
    const result = await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs });
    expect(result).toMatchObject({ outcome: 'WINDOW_ENDED', roleReset: true });
    expect(h.logs[1]).toMatchObject({ event: 'PREVIEW_TEAM_TOOLS_LOCKED', outcome: 'WINDOW_ENDED' });
    for (const lease of h.leases) expect(start + windowMs - lease.at).toBeGreaterThanOrEqual(30_000);
  });

  it('re-captures ACK evidence before it expires', async () => {
    const h = harness({ evidenceTtlMs: 5 * MINUTE });
    await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs: 20 * MINUTE });
    expect(h.calls.filter(call => call === 'refresh').length).toBeGreaterThanOrEqual(5);
  });

  it('locks immediately on SIGTERM: revokes readiness and resets the login', async () => {
    const h = harness({ abortAfterPublishes: 3 });
    const result = await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs: 60 * MINUTE });
    expect(result).toMatchObject({ outcome: 'STOPPED', roleReset: true, publishes: 3 });
    expect(h.calls.slice(-2)).toEqual([`revoke:${uuid(9)}`, 'close']);
    expect(h.logs[1]).toMatchObject({ event: 'PREVIEW_TEAM_TOOLS_LOCKED', outcome: 'STOPPED' });
  });

  it('turns SIGTERM and SIGINT into one abort', () => {
    const fake = new EventEmitter();
    const controller = unlock.installSignalAbort(fake);
    expect(controller.signal.aborted).toBe(false);
    fake.emit('SIGTERM');
    expect(controller.signal.aborted).toBe(true);
    // A second signal must not fall through to Node's default (exit) while the reset is running.
    expect(fake.listenerCount('SIGTERM')).toBe(1);
    expect(fake.listenerCount('SIGINT')).toBe(1);
    const other = unlock.installSignalAbort(new EventEmitter());
    expect(other.signal.aborted).toBe(false);
  });

  it('still resets the login when opening it failed', async () => {
    const h = harness({ open: async () => { throw Object.assign(new Error('STAFF_JIT_OPEN_REFUSED'), { code: 'STAFF_JIT_OPEN_REFUSED' }); } });
    const result = await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs: 60 * MINUTE });
    expect(result).toMatchObject({ outcome: 'FAILED', reason: 'STAFF_JIT_OPEN_REFUSED', publishes: 0, roleReset: true });
    expect(h.calls).toEqual(['close']);
  });

  it('locks with a reason when the database refuses a publication', async () => {
    const h = harness({ publish: async () => false });
    const result = await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs: 60 * MINUTE });
    expect(result).toMatchObject({ outcome: 'FAILED', reason: 'PUBLISH_REFUSED', roleReset: true });
    expect(h.calls.at(-1)).toBe('close');
  });

  it('locks when fresh ACK evidence is not visible after a re-capture (a wrapper that caches)', async () => {
    const h = harness({ evidenceTtlMs: 2 * MINUTE, staleAfterRefresh: true });
    const result = await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs: 60 * MINUTE });
    expect(result).toMatchObject({ outcome: 'FAILED', reason: 'EVIDENCE_UNAVAILABLE', roleReset: true });
  });

  it('reports a failed reset so systemd marks the run failed (ExecStopPost resets again)', async () => {
    const h = harness({ close: async () => { throw new Error('peer down'); } });
    const result = await unlock.runUnlockWindow({ writer: h.writer, evidence: h.evidence, deps: h.deps, windowMs: MINUTE });
    expect(result).toMatchObject({ outcome: 'WINDOW_ENDED', roleReset: false });
    expect(h.logs[1]).toMatchObject({ roleReset: false });
  });

  it('the crash-reset command resets the login without opening anything', async () => {
    const calls: string[] = [], logs: any[] = [];
    const result = await unlock.runReset({ writer: { reset: async () => { calls.push('reset'); return { passwordNull: true, expiredMinusInfinity: true, noSessions: true }; } }, log: (event: unknown) => logs.push(event) });
    expect(calls).toEqual(['reset']);
    expect(result.roleReset).toBe(true);
    expect(logs).toEqual([{ event: 'PREVIEW_TEAM_TOOLS_RESET', roleReset: true }]);
    const failed = await unlock.runReset({ writer: { reset: async () => { throw new Error('x'); } }, log: () => undefined });
    expect(failed.roleReset).toBe(false);
  });

  it('a reset that fails logs its own line and exits non-zero, so systemd marks the unit failed and the alert runs', async () => {
    const logs: any[] = [];
    const failingWriter = { reset: async () => { throw Object.assign(new Error('STAFF_JIT_CLOSE_REFUSED'), { code: 'STAFF_JIT_CLOSE_REFUSED' }); } };
    const code = await unlock.runCommand('reset', { platform: 'linux', uid: 0, resetServer: () => unlock.runReset({ writer: failingWriter, log: (event: unknown) => logs.push(event) }), log: (event: unknown) => logs.push(event) });
    expect(code).toBe(1);
    expect(logs).toEqual([{ event: 'PREVIEW_TEAM_TOOLS_RESET_FAILED', roleReset: false, reason: 'STAFF_JIT_CLOSE_REFUSED' }]);
  });

  it('a reset that cannot even start (lock unreadable, release refused) also logs RESET_FAILED and exits non-zero', async () => {
    const logs: any[] = [];
    const code = await unlock.runCommand('reset', { platform: 'linux', uid: 0, resetServer: async () => { throw Object.assign(new Error('RELEASE_LOCK_UNREADABLE'), { code: 'RELEASE_LOCK_UNREADABLE' }); }, log: (event: unknown) => logs.push(event) });
    expect(code).toBe(1);
    expect(logs).toEqual([{ event: 'PREVIEW_TEAM_TOOLS_RESET_FAILED', roleReset: false, reason: 'RELEASE_LOCK_UNREADABLE' }]);
  });

  // Every actor call re-verifies the whole API release as postgres before importing from it
  // (no cached verdict: a cache would let a file changed after the open be loaded at a renewal).
  // That re-hash is the bulk of each call, so the cap leaves room for a slow disk.
  it('runs the postgres actor through the peer channel with a 120 s cap per call, control on stdin only', async () => {
    const seen: any[] = [];
    const run = async (argv: string[], options: any) => { seen.push({ argv, options: { ...options, stdin: Buffer.from(options.stdin) } }); return { code: 0, timedOut: false, overflow: false, stdout: Buffer.from('{"validUntilExtended":true}\n'), stderr: Buffer.alloc(0) }; };
    const engine = '/opt/debateai-v3-preview/releases/auth-dev-candidate-v1/dialectical-engine';
    const runner = unlock.creatorRunner({ engine, nodePath: '/opt/node/bin/node', run });
    await expect(runner({ mode: 'extend', validUntil: '2026-10-09T10:04:00.000Z' }, null)).resolves.toEqual({ validUntilExtended: true });
    expect(unlock.CREATOR_TIMEOUT_MS).toBe(120_000);
    expect(seen[0].options).toMatchObject({ cwd: engine, env: {}, timeoutMs: unlock.CREATOR_TIMEOUT_MS });
    expect(seen[0].argv.slice(5)).toEqual(['/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/env', '-i', 'PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC', '/opt/node/bin/node', expect.stringMatching(/\/jit-creator-actor\.mjs$/), '--credential-fd', '3']);
    expect(seen[0].options.stdin.toString()).toBe(`${JSON.stringify({ mode: 'extend', validUntil: '2026-10-09T10:04:00.000Z', engine })}\n`);
    const slow = unlock.creatorRunner({ engine, nodePath: '/opt/node/bin/node', run: async () => ({ code: null, timedOut: true, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }) });
    await expect(slow({ mode: 'close' }, null)).rejects.toMatchObject({ code: 'STAFF_JIT_CLOSE_REFUSED' });
  });

  it('a window that ends FAILED exits non-zero even when the reset worked, so OnFailure= alerts', async () => {
    const run = (result: unknown) => unlock.runCommand('run', { platform: 'linux', uid: 0, runServer: async () => result, log: () => undefined });
    expect(await run({ outcome: 'FAILED', reason: 'EVIDENCE_UNAVAILABLE', publishes: 3, roleReset: true })).toBe(1);
    expect(await run({ outcome: 'WINDOW_ENDED', publishes: 360, roleReset: true })).toBe(0);
    expect(await run({ outcome: 'STOPPED', publishes: 3, roleReset: true })).toBe(0);
  });

  it('a successful reset exits 0; a run that could not reset exits non-zero; only root on Linux may run either', async () => {
    const ok = async () => ({ roleReset: true });
    expect(await unlock.runCommand('reset', { platform: 'linux', uid: 0, resetServer: ok, log: () => undefined })).toBe(0);
    expect(await unlock.runCommand('run', { platform: 'linux', uid: 0, runServer: async () => ({ outcome: 'WINDOW_ENDED', roleReset: false }), log: () => undefined })).toBe(1);
    const logs: any[] = [];
    expect(await unlock.runCommand('reset', { platform: 'linux', uid: 1000, resetServer: ok, log: (event: unknown) => logs.push(event) })).toBe(1);
    expect(await unlock.runCommand('other', { platform: 'linux', uid: 0, resetServer: ok, log: () => undefined })).toBe(1);
    expect(logs).toEqual([{ event: 'PREVIEW_TEAM_TOOLS_RESET_FAILED', roleReset: false, reason: 'ACTOR_REFUSED' }]);
  });
});

describe('interim writer: the existing recovery login, opened just in time', () => {
  function writerHarness(overrides: Record<string, unknown> = {}) {
    const creator: { control: any; secret: string | null }[] = [], pools: string[] = [], published: unknown[] = [];
    let ended = 0, zeroed: Buffer | null = null;
    const writer = unlock.createInterimLoginWriter({
      randomBytes: (n: number) => { zeroed = Buffer.alloc(n, 7); return zeroed; },
      runCreator: async (control: unknown, secret: Buffer | null) => {
        creator.push({ control, secret: secret ? secret.toString() : null });
        const mode = (control as { mode: string }).mode;
        return mode === 'open' ? { existingRoleOpened: true } : mode === 'extend' ? { validUntilExtended: true } : { passwordNull: true, expiredMinusInfinity: true, noSessions: true };
      },
      createPool: async (password: string) => { pools.push(password); return { end: async () => { ended++; } }; },
      createPublisher: () => ({ publish: async (input: unknown) => { published.push(input); return true; }, revoke: async () => true }),
      now: () => start,
      ...overrides
    });
    return { writer, creator, pools, published, ended: () => ended, zeroed: () => zeroed };
  }

  it('opens with 32 random bytes sent only on the private channel, never in the control message', async () => {
    const h = writerHarness();
    const validUntil = new Date(start + 4 * MINUTE);
    await h.writer.open({ validUntil });
    expect(h.creator).toEqual([{ control: { mode: 'open', validUntil: validUntil.toISOString() }, secret: '07'.repeat(32) }]);
    expect(h.pools).toEqual(['07'.repeat(32)]);
    expect(JSON.stringify(h.creator[0]!.control)).not.toContain('0707');
  });

  it('extends only the expiry and forgets the password when closing', async () => {
    const h = writerHarness();
    await h.writer.open({ validUntil: new Date(start + 4 * MINUTE) });
    await h.writer.extend({ validUntil: new Date(start + 3 * MINUTE) });
    const closed = await h.writer.close();
    expect(h.creator.map(call => [call.control.mode, call.secret])).toEqual([['open', '07'.repeat(32)], ['extend', null], ['close', null]]);
    expect(closed).toEqual({ passwordNull: true, expiredMinusInfinity: true, noSessions: true });
    expect(h.ended()).toBe(1);
    expect(h.zeroed()!.every(byte => byte === 0)).toBe(true);
  });

  it('resets the role even when ending the pool throws', async () => {
    const h = writerHarness({ createPool: async () => ({ end: async () => { throw new Error('socket'); } }) });
    await h.writer.open({ validUntil: new Date(start + 4 * MINUTE) });
    await expect(h.writer.close()).resolves.toMatchObject({ passwordNull: true });
    expect(h.creator.at(-1)!.control.mode).toBe('close');
  });

  it('refuses an unexpected creator answer and a lease longer than five minutes', async () => {
    const h = writerHarness({ runCreator: async () => ({ existingRoleOpened: false }) });
    await expect(h.writer.open({ validUntil: new Date(start + 4 * MINUTE) })).rejects.toThrow(/STAFF_JIT_OPEN_REFUSED/);
    const g = writerHarness();
    await expect(g.writer.open({ validUntil: new Date(start + 6 * MINUTE) })).rejects.toThrow(/STAFF_JIT_LEASE_REFUSED/);
    expect(g.creator).toEqual([]);
  });

  it('crash reset needs no password and no pool', async () => {
    const h = writerHarness();
    await expect(h.writer.reset()).resolves.toMatchObject({ passwordNull: true });
    expect(h.creator).toEqual([{ control: { mode: 'close' }, secret: null }]);
    expect(h.pools).toEqual([]);
  });
});

describe('where the unlock connects as the recovery login', () => {
  it('uses the preview\'s local socket by default (pg_hba allows this login on the socket only), without TLS', () => {
    const target = unlock.resolveStaffDbHost(undefined);
    expect(target).toEqual({ host: '/run/debateai-v3-preview/postgresql', tls: false });
    expect(unlock.resolveStaffDbHost('')).toEqual(target);
    const options = unlock.staffPoolOptions({ target, password: 'x', ca: null });
    expect(options).toMatchObject({ host: '/run/debateai-v3-preview/postgresql', port: 5434, database: 'debateai', user: 'debateai_prod_staff_recovery', password: 'x', max: 1, application_name: 'preview-team-unlock' });
    expect(options.ssl).toBe(false);
  });

  it('can be pointed at loopback TCP, and then always verifies TLS with the preview CA', () => {
    const target = unlock.resolveStaffDbHost('127.0.0.1');
    expect(target).toEqual({ host: '127.0.0.1', tls: true });
    expect(unlock.staffPoolOptions({ target, password: 'x', ca: 'CA' }).ssl).toEqual({ ca: 'CA', rejectUnauthorized: true });
    expect(() => unlock.staffPoolOptions({ target, password: 'x', ca: null })).toThrow(/STAFF_DB_HOST_REFUSED/);
    expect(unlock.resolveStaffDbHost('/run/other/postgresql')).toEqual({ host: '/run/other/postgresql', tls: false });
  });

  it.each(['db.example.test', '10.0.0.5', 'run/postgresql', '/run/../tmp', '/run/x y', 'localhost'])('refuses the host %j', value => {
    expect(() => unlock.resolveStaffDbHost(value)).toThrow(/STAFF_DB_HOST_REFUSED/);
  });
});

const PEER = 'peer-readiness-writer';
const PEER_ROLE = 'debateai_staff_readiness_writer';
const OS_USER = 'debateai-readiness';
const ENGINE = '/opt/debateai-v3-preview/releases/auth-dev-candidate-v1/dialectical-engine';
const PG_PATH = `${ENGINE}/node_modules/.pnpm/pg@8/node_modules/pg/lib/index.js`;
const SOCKET = '/run/debateai-v3-preview/postgresql';
const RESULT_SCHEMA = 'preview-lifecycle-readiness-v1';
const refusal = (code: string) => Object.assign(new Error(code), { code });
/** What the identity query returns when the connection is exactly the readiness writer on the preview socket. */
const peerRow = () => ({ session: PEER_ROLE, role: PEER_ROLE, database: 'debateai', port: 5434, unix_socket: true, can_login: true, no_elevated_powers: true, memberships: 0 });
const interimRow = () => ({ session: 'debateai_prod_staff_recovery', role: 'debateai_prod_staff_recovery', database: 'debateai', port: 5434, bounded: true, no_elevated_powers: true });
/** A stand-in for pg.Pool (the interim writer only): records its options and every query, answers the identity query with `rows`. */
function fakePool(answer: () => Promise<{ rows: unknown[] }>, made: { options: any; sql: string[]; ended: number }[] = []) {
  return class {
    record: { options: any; sql: string[]; ended: number };
    constructor(options: any) { this.record = { options, sql: [], ended: 0 }; made.push(this.record); }
    async query(sql: string) { this.record.sql.push(sql); return answer(); }
    async end() { this.record.ended++; }
  };
}
type ClientRecord = { options: any; sql: string[]; params: unknown[][]; connected: number; ended: number };
/** A stand-in for pg.Client (the readiness child): one per connection; identity rows from `identity`, every write answers `value`. */
function fakeClient(identity: () => Promise<{ rows: unknown[] }>, made: ClientRecord[] = [], { value = true as unknown, connectError = null as unknown } = {}) {
  return class {
    record: ClientRecord;
    constructor(options: any) { this.record = { options, sql: [], params: [], connected: 0, ended: 0 }; made.push(this.record); }
    async connect() { this.record.connected++; if (connectError) throw connectError; }
    async query(sql: string, params: unknown[] = []) { this.record.sql.push(sql); this.record.params.push(params); return /session_user/.test(sql) ? identity() : { rows: [{ value }] }; }
    async end() { this.record.ended++; }
  };
}

describe('peer writer: the dedicated password-less readiness role, one child process per database call', () => {
  function peerHarness(answer: (op: string, fields: any) => Promise<unknown> = async () => true) {
    const calls: string[] = [], fields: unknown[] = [];
    const writer = unlock.createPeerReadinessWriter({
      runActor: async (op: string, input: any) => { calls.push(op === 'revoke' ? `revoke:${input.generation}` : op); fields.push(input); return answer(op, input); }
    });
    return { writer, calls, fields };
  }

  it('is chosen by default; the interim login only when it is named exactly', () => {
    expect(unlock.resolveStaffWriterKind(undefined)).toBe(PEER);
    expect(unlock.resolveStaffWriterKind('')).toBe(PEER);
    expect(unlock.resolveStaffWriterKind(PEER)).toBe(PEER);
    expect(unlock.resolveStaffWriterKind('interim-recovery-login')).toBe('interim-recovery-login');
  });

  it.each(['interim', 'INTERIM-RECOVERY-LOGIN', ' interim-recovery-login', 'interim-recovery-login ', 'postgres', 'none'])('refuses the writer %j', value => {
    expect(() => unlock.resolveStaffWriterKind(value)).toThrow(/STAFF_WRITER_REFUSED/);
  });

  it('opens with an identity check that writes nothing, extends nothing, publishes and revokes through the child, then has no connection left', async () => {
    const h = peerHarness();
    expect(h.writer.kind).toBe(PEER);
    await h.writer.open({ validUntil: new Date(start + 4 * MINUTE) });
    await h.writer.extend({ validUntil: new Date(start + 4 * MINUTE) });
    expect(await h.writer.publish(ready(start + MINUTE))).toBe(true);
    expect(await h.writer.revoke(uuid(9))).toBe(true);
    expect(await h.writer.close()).toEqual({ connectionsClosed: true });
    expect(h.calls).toEqual(['check', 'publish', `revoke:${uuid(9)}`]);
    // Only plain fields cross to the child; the expiry as its exact ISO string.
    expect(h.fields).toEqual([{}, { configSha256: 'a'.repeat(64), generation: uuid(9), ackAdapterId: 'capture', rehearsalId: uuid(1), evidenceExpiresAt: new Date(start + MINUTE).toISOString() }, { generation: uuid(9) }]);
  });

  it('counts only an exact `true` from the database as published', async () => {
    const h = peerHarness(async op => (op === 'publish' ? 'true' : true));
    await h.writer.open({ validUntil: new Date(start + MINUTE) });
    expect(await h.writer.publish(ready(start + MINUTE))).toBe(false);
  });

  it('refuses to publish before it is open and after it closed', async () => {
    const h = peerHarness();
    await expect(h.writer.publish(ready(start + MINUTE))).rejects.toMatchObject({ code: 'STAFF_READINESS_NOT_OPEN' });
    await h.writer.open({ validUntil: new Date(start + MINUTE) });
    await h.writer.close();
    await expect(h.writer.publish(ready(start + MINUTE))).rejects.toMatchObject({ code: 'STAFF_READINESS_NOT_OPEN' });
    expect(await h.writer.revoke(uuid(9))).toBe(false);
    expect(h.calls).toEqual(['check']);
  });

  it('does not claim every connection closed while a call is still running', async () => {
    let release: (value: boolean) => void = () => undefined;
    const h = peerHarness(async op => (op === 'publish' ? new Promise<boolean>(resolve => { release = resolve; }) : true));
    await h.writer.open({ validUntil: new Date(start + MINUTE) });
    const pending = h.writer.publish(ready(start + MINUTE));
    expect(await h.writer.close()).toEqual({ connectionsClosed: false });
    release(true);
    await pending;
  });

  it('has nothing to reset: reset starts nothing and says so', async () => {
    const h = peerHarness();
    expect(await h.writer.reset()).toEqual({ nothingToReset: true });
    expect(h.calls).toEqual([]);
  });

  it('a whole window reports `locked`, never a `roleReset` it did not do', async () => {
    const h = harness();
    const p = peerHarness();
    const result = await unlock.runUnlockWindow({ writer: p.writer, evidence: h.evidence, deps: h.deps, windowMs: 10 * MINUTE });
    expect(result).toEqual({ outcome: 'WINDOW_ENDED', publishes: 60, locked: true });
    expect(h.logs[0]).toEqual({ event: 'PREVIEW_TEAM_TOOLS_UNLOCKED', until: '2026-10-09T10:10:00.000Z', writer: PEER, windowMinutes: 10 });
    expect(h.logs[1]).toEqual({ event: 'PREVIEW_TEAM_TOOLS_LOCKED', outcome: 'WINDOW_ENDED', publishes: 60, locked: true, at: '2026-10-09T10:10:00.000Z' });
    expect(p.calls[0]).toBe('check');
    expect(p.calls.at(-1)).toBe(`revoke:${uuid(9)}`);
  });

  it('a window whose identity check failed is still locked (nothing stayed open) and names the reason', async () => {
    const h = harness();
    const p = peerHarness(async () => { throw refusal('STAFF_READINESS_IDENTITY_REFUSED'); });
    const result = await unlock.runUnlockWindow({ writer: p.writer, evidence: h.evidence, deps: h.deps, windowMs: 10 * MINUTE });
    expect(result).toEqual({ outcome: 'FAILED', reason: 'STAFF_READINESS_IDENTITY_REFUSED', publishes: 0, locked: true });
    expect(p.calls).toEqual(['check']);
  });

  it('a window that is not locked again exits non-zero, so the unit fails and the alert runs', async () => {
    expect(await unlock.runCommand('run', { platform: 'linux', uid: 0, runServer: async () => ({ outcome: 'WINDOW_ENDED', publishes: 6, locked: false }), log: () => undefined })).toBe(1);
  });

  it('exit codes: a locked peer window exits 0 unless it FAILED; a peer reset with nothing to reset exits 0', async () => {
    const run = (result: unknown) => unlock.runCommand('run', { platform: 'linux', uid: 0, runServer: async () => result, log: () => undefined });
    expect(await run({ outcome: 'WINDOW_ENDED', publishes: 360, locked: true })).toBe(0);
    expect(await run({ outcome: 'STOPPED', publishes: 3, locked: true })).toBe(0);
    expect(await run({ outcome: 'FAILED', reason: 'PUBLISH_REFUSED', publishes: 3, locked: true })).toBe(1);
    const logs: any[] = [];
    const reset = await unlock.runReset({ writer: peerHarness().writer, log: (event: unknown) => logs.push(event) });
    expect(reset).toEqual({ nothingToReset: true });
    expect(logs).toEqual([{ event: 'PREVIEW_TEAM_TOOLS_RESET', nothingToReset: true }]);
    expect(await unlock.runCommand('reset', { platform: 'linux', uid: 0, resetServer: async () => reset, log: () => undefined })).toBe(0);
  });

  it('a peer reset that does not answer "nothing to reset" logs RESET_FAILED and exits non-zero', async () => {
    for (const [reset, reason] of [[async () => ({ passwordNull: true, expiredMinusInfinity: true }), 'RESET_ANSWER_UNEXPECTED'], [async () => { throw new Error('x'); }, 'UNEXPECTED']] as const) {
      const logs: any[] = [];
      const result = await unlock.runReset({ writer: { ...peerHarness().writer, reset }, log: (event: unknown) => logs.push(event) });
      expect(result).toEqual({ nothingToReset: false });
      expect(logs).toEqual([{ event: 'PREVIEW_TEAM_TOOLS_RESET_FAILED', nothingToReset: false, reason }]);
      expect(await unlock.runCommand('reset', { platform: 'linux', uid: 0, resetServer: async () => result, log: () => undefined })).toBe(1);
    }
  });
});

describe('the dedicated OS user the readiness child runs as (debateai-readiness, never root)', () => {
  const entry = (overrides: Partial<Record<'name' | 'uid' | 'gid' | 'home' | 'shell', string>> = {}) => {
    const e = { name: OS_USER, uid: '998', gid: '997', home: '/nonexistent', shell: '/usr/sbin/nologin', ...overrides };
    return `${e.name}:x:${e.uid}:${e.gid}::${e.home}:${e.shell}\n`;
  };
  function getent(stdout: string, extra: Record<string, unknown> = {}) {
    const seen: any[] = [];
    return { seen, run: async (argv: string[], options: any) => { seen.push({ argv, options }); return { code: 0, timedOut: false, overflow: false, stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), ...extra }; } };
  }

  it('reads exactly that user with getent, given an empty environment', async () => {
    const g = getent(entry());
    await expect(unlock.lookupReadinessUser({ run: g.run })).resolves.toEqual({ name: OS_USER, uid: 998, gid: 997 });
    expect(g.seen).toEqual([{ argv: ['/usr/bin/getent', 'passwd', OS_USER], options: expect.objectContaining({ env: {} }) }]);
    for (const shell of ['/sbin/nologin', '/bin/false', '/usr/bin/false']) {
      await expect(unlock.lookupReadinessUser({ run: getent(entry({ shell })).run })).resolves.toMatchObject({ uid: 998, gid: 997 });
    }
  });

  it('names a missing user as missing (README step 7 creates it)', async () => {
    await expect(unlock.lookupReadinessUser({ run: getent('', { code: 2 }).run })).rejects.toMatchObject({ code: 'STAFF_READINESS_USER_MISSING' });
  });

  it.each([
    ['uid 0 (root)', entry({ uid: '0' })],
    ['gid 0 (the root group)', entry({ gid: '0' })],
    ['the shared nobody uid', entry({ uid: '65534' })],
    ['a login shell', entry({ shell: '/bin/bash' })],
    ['a plain sh', entry({ shell: '/bin/sh' })],
    ['an empty shell (which means /bin/sh)', entry({ shell: '' })],
    ['another name', entry({ name: 'debateai-readines' })],
    ['two entries', entry() + entry()],
    ['a short entry', 'debateai-readiness:x:998\n'],
    ['a uid that is not a number', entry({ uid: '99a' })]
  ])('refuses %s', async (_name, text) => {
    await expect(unlock.lookupReadinessUser({ run: getent(text).run })).rejects.toMatchObject({ code: 'STAFF_READINESS_USER_REFUSED' });
  });

  it.each([
    ['getent failing another way', { code: 1 }],
    ['getent timing out', { code: null, timedOut: true }],
    ['getent writing to stderr', { stderr: Buffer.from('x') }]
  ])('refuses %s', async (_name, extra) => {
    await expect(unlock.lookupReadinessUser({ run: getent(entry(), extra).run })).rejects.toMatchObject({ code: 'STAFF_READINESS_USER_REFUSED' });
  });
});

describe('the readiness child: spawned as the dedicated user with an empty environment, never as root', () => {
  const user = { name: OS_USER, uid: 998, gid: 997 };
  type ChildResult = { code: number | null; timedOut: boolean; overflow: boolean; stdout: Buffer; stderr: Buffer };
  const answer = (value: unknown, code = 0, stderr = ''): (() => Promise<ChildResult>) => async () => ({ code, timedOut: false, overflow: false, stdout: Buffer.from(`${JSON.stringify(value)}\n`), stderr: Buffer.from(stderr) });
  function runner(result: () => Promise<ChildResult> = answer({ schema: RESULT_SCHEMA, ok: true, value: true })) {
    const seen: any[] = [];
    const run = async (argv: string[], options: any) => { seen.push({ argv, options: { ...options, stdin: JSON.parse(Buffer.from(options.stdin).toString()) } }); return result(); };
    return { seen, call: unlock.readinessActorRunner({ user, host: SOCKET, engine: ENGINE, pgPath: PG_PATH, nodePath: '/opt/node/bin/node', run }) };
  }

  it('drops to that uid and gid with setpriv (no groups, no capabilities, no new privileges) and starts node through env -i with nothing set', async () => {
    const r = runner();
    await expect(r.call('check', {})).resolves.toBe(true);
    const { argv, options } = r.seen[0];
    expect(argv).toEqual(['/usr/bin/setpriv', '--reuid=998', '--regid=997', '--clear-groups', '--inh-caps=-all', '--no-new-privs', '--', '/usr/bin/env', '-i', '/opt/node/bin/node', expect.stringMatching(/\/deploy\/preview-lifecycle\/v1\/readiness-writer-actor\.mjs$/)]);
    expect(options).toMatchObject({ cwd: '/', env: {}, timeoutMs: unlock.READINESS_ACTOR_TIMEOUT_MS });
    expect(options.stdin).toEqual({ op: 'check', engine: ENGINE, pgPath: PG_PATH, host: SOCKET });
    expect(argv.join(' ')).not.toMatch(/--reuid=0\b|--regid=0\b|runuser|postgres|PATH=/);
  });

  it('one fresh child per call; the call\'s fields travel on stdin only', async () => {
    const r = runner();
    const fields = { configSha256: 'a'.repeat(64), generation: uuid(9), ackAdapterId: 'capture', rehearsalId: uuid(1), evidenceExpiresAt: '2026-10-09T10:05:00.000Z' };
    await r.call('publish', fields);
    await r.call('revoke', { generation: uuid(9) });
    expect(r.seen).toHaveLength(2);
    expect(r.seen[0].options.stdin).toEqual({ op: 'publish', engine: ENGINE, pgPath: PG_PATH, host: SOCKET, ...fields });
    expect(r.seen[1].options.stdin).toEqual({ op: 'revoke', engine: ENGINE, pgPath: PG_PATH, host: SOCKET, generation: uuid(9) });
    for (const { argv } of r.seen) expect(JSON.stringify(argv)).not.toContain(uuid(9));
  });

  it.each([['uid 0', { ...user, uid: 0 }], ['gid 0', { ...user, gid: 0 }], ['no uid', { name: OS_USER, gid: 997 }], ['another name', { ...user, name: 'root' }]])('never starts anything for a user with %s', (_name, bad) => {
    let ran = 0;
    const run = async () => { ran++; return answer({ schema: RESULT_SCHEMA, ok: true, value: true })(); };
    expect(() => unlock.readinessActorRunner({ user: bad, host: SOCKET, engine: ENGINE, pgPath: PG_PATH, nodePath: '/opt/node/bin/node', run })).toThrow(/STAFF_READINESS_USER_REFUSED/);
    expect(ran).toBe(0);
  });

  it('passes the child\'s own refusal on by name', async () => {
    const r = runner(answer({ schema: RESULT_SCHEMA, ok: false, code: 'STAFF_READINESS_PEER_AUTH_REFUSED' }, 1));
    await expect(r.call('check', {})).rejects.toMatchObject({ code: 'STAFF_READINESS_PEER_AUTH_REFUSED' });
  });

  it('returns a false write as false', async () => {
    const r = runner(answer({ schema: RESULT_SCHEMA, ok: true, value: false }));
    await expect(r.call('revoke', { generation: uuid(9) })).resolves.toBe(false);
  });

  it.each([
    ['anything on stderr', answer({ schema: RESULT_SCHEMA, ok: true, value: true }, 0, 'warning')],
    ['a timeout', async () => ({ code: null, timedOut: true, overflow: false, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) })],
    ['too much output', async () => ({ code: 0, timedOut: false, overflow: true, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) })],
    ['another schema', answer({ schema: 'x', ok: true, value: true })],
    ['an extra key', answer({ schema: RESULT_SCHEMA, ok: true, value: true, extra: 1 })],
    ['a value that is not a boolean', answer({ schema: RESULT_SCHEMA, ok: true, value: 'true' })],
    ['a success with a non-zero exit', answer({ schema: RESULT_SCHEMA, ok: true, value: true }, 1)],
    ['a refusal with exit 0', answer({ schema: RESULT_SCHEMA, ok: false, code: 'STAFF_READINESS_IDENTITY_REFUSED' }, 0)],
    ['a refusal code from outside the readiness family', answer({ schema: RESULT_SCHEMA, ok: false, code: 'RELEASE_UNVERIFIED' }, 1)],
    ['output that is not JSON', async () => ({ code: 0, timedOut: false, overflow: false, stdout: Buffer.from('ok\n'), stderr: Buffer.alloc(0) })]
  ])('refuses %s as STAFF_READINESS_ACTOR_REFUSED', async (_name, result) => {
    await expect(runner(result).call('check', {})).rejects.toMatchObject({ code: 'STAFF_READINESS_ACTOR_REFUSED' });
  });
});

describe('the readiness child: every connection proves who it is before it writes', () => {
  const control = (op: string, fields: Record<string, unknown> = {}) => ({ op, host: SOCKET, ...fields });
  const publish = { configSha256: 'a'.repeat(64), generation: uuid(9), ackAdapterId: 'capture', rehearsalId: uuid(1), evidenceExpiresAt: '2026-10-09T10:05:00.000Z' };

  it('connects on the preview socket as the readiness role, and its password is a refusal, never a string', () => {
    const options = actor.readinessClientOptions({ host: SOCKET });
    expect(options).toMatchObject({ host: SOCKET, port: 5434, database: 'debateai', user: PEER_ROLE, ssl: false, application_name: 'preview-team-unlock' });
    expect(typeof options.password).toBe('function');
    expect(() => options.password()).toThrow(/STAFF_READINESS_PASSWORD_REQUESTED/);
  });

  it.each(['127.0.0.1', '::1', 'localhost', 'run/postgresql', '/run/../tmp', '/run/x y'])('refuses the host %j (peer logins exist only on the socket)', host => {
    expect(() => actor.readinessClientOptions({ host })).toThrow(/STAFF_DB_HOST_REFUSED/);
  });

  it('a fresh connection per call: the identity check first on each, then exactly one call, then the connection ends', async () => {
    const made: ClientRecord[] = [];
    const Client = fakeClient(async () => ({ rows: [peerRow()] }), made);
    await expect(actor.runReadinessOperation({ Client, control: control('check') })).resolves.toBe(true);
    await expect(actor.runReadinessOperation({ Client, control: control('publish', publish) })).resolves.toBe(true);
    await expect(actor.runReadinessOperation({ Client, control: control('revoke', { generation: uuid(9) }) })).resolves.toBe(true);
    expect(made).toHaveLength(3);
    for (const record of made) {
      expect(record).toMatchObject({ connected: 1, ended: 1 });
      expect(record.options.user).toBe(PEER_ROLE);
      expect(record.sql[0]).toMatch(/session_user/);
    }
    expect(made[0]!.sql).toHaveLength(1);
    expect(made[1]!.sql.slice(1)).toEqual(['SELECT staff.publish_independent_alert_readiness($1,$2,$3,$4,$5) AS value']);
    expect(made[1]!.params[1]).toEqual(['a'.repeat(64), uuid(9), 'capture', uuid(1), '2026-10-09T10:05:00.000Z']);
    expect(made[2]!.sql.slice(1)).toEqual(['SELECT staff.revoke_independent_alert_readiness($1) AS value']);
    expect(made[2]!.params[1]).toEqual([uuid(9)]);
  });

  it('checks again on every connection: a later connection that is someone else is refused and writes nothing', async () => {
    const made: ClientRecord[] = [];
    let n = 0;
    const Client = fakeClient(async () => ({ rows: [n++ === 0 ? peerRow() : { ...peerRow(), session: 'postgres', role: 'postgres' }] }), made);
    await expect(actor.runReadinessOperation({ Client, control: control('publish', publish) })).resolves.toBe(true);
    await expect(actor.runReadinessOperation({ Client, control: control('publish', publish) })).rejects.toMatchObject({ code: 'STAFF_READINESS_IDENTITY_REFUSED' });
    expect(made[1]!.sql).toHaveLength(1);
    expect(made[1]!.ended).toBe(1);
  });

  it.each([
    ['another login', (row: any) => ({ ...row, session: 'debateai_prod_staff_recovery', role: 'debateai_prod_staff_recovery' })],
    ['a SET ROLE away from the login (current_user)', (row: any) => ({ ...row, role: 'debateai_staff_recovery' })],
    ['another session user under the same current role', (row: any) => ({ ...row, session: 'postgres' })],
    ['another database', (row: any) => ({ ...row, database: 'postgres' })],
    ['another cluster port', (row: any) => ({ ...row, port: 5432 })],
    ['a TCP connection', (row: any) => ({ ...row, unix_socket: false })],
    ['a role that cannot log in', (row: any) => ({ ...row, can_login: false })],
    ['an elevated attribute', (row: any) => ({ ...row, no_elevated_powers: false })],
    ['a role membership', (row: any) => ({ ...row, memberships: 1 })]
  ])('refuses %s, writes nothing and ends the connection', async (_name, mutate) => {
    const made: ClientRecord[] = [];
    const Client = fakeClient(async () => ({ rows: [mutate(peerRow())] }), made);
    await expect(actor.runReadinessOperation({ Client, control: control('publish', publish) })).rejects.toMatchObject({ code: 'STAFF_READINESS_IDENTITY_REFUSED' });
    expect(made[0]!.sql).toHaveLength(1);
    expect(made[0]!.ended).toBe(1);
  });

  it('refuses no row or two rows', async () => {
    for (const rows of [[], [peerRow(), peerRow()]]) {
      await expect(actor.runReadinessOperation({ Client: fakeClient(async () => ({ rows })), control: control('check') })).rejects.toMatchObject({ code: 'STAFF_READINESS_IDENTITY_REFUSED' });
    }
  });

  it('answers a write the database refused as false, not as a refusal', async () => {
    const Client = fakeClient(async () => ({ rows: [peerRow()] }), [], { value: false });
    await expect(actor.runReadinessOperation({ Client, control: control('revoke', { generation: uuid(9) }) })).resolves.toBe(false);
  });

  it('names a peer authentication refusal (the pg_ident/pg_hba lines missing, or the wrong OS user) in plain terms', async () => {
    const made: ClientRecord[] = [];
    const Client = fakeClient(async () => ({ rows: [peerRow()] }), made, { connectError: refusal('28000') });
    await expect(actor.runReadinessOperation({ Client, control: control('check') })).rejects.toMatchObject({ code: 'STAFF_READINESS_PEER_AUTH_REFUSED' });
    expect(made[0]!.sql).toEqual([]);
  });

  it('names any other failure to connect as the database being unavailable', async () => {
    const Client = fakeClient(async () => ({ rows: [peerRow()] }), [], { connectError: refusal('ECONNREFUSED') });
    await expect(actor.runReadinessOperation({ Client, control: control('check') })).rejects.toMatchObject({ code: 'STAFF_READINESS_DATABASE_UNAVAILABLE' });
  });

  /**
   * The real pg driver against a stand-in server on a Unix socket that asks for a password (as a
   * server would whose pg_hba still sends this role to a scram/password line): the driver sends
   * nothing back but its startup message, and the call fails with a named refusal.
   */
  it.each([['cleartext', 3], ['SCRAM-SHA-256', 10]])('with the real pg driver: a server that asks for a %s password gets none', async (_name, authCode) => {
    const pg = createRequire(import.meta.url)('pg');
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-peer-')));
    const received: Buffer[] = [], sockets: Socket[] = [];
    const int32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
    const server = createServer(socket => {
      sockets.push(socket);
      socket.on('error', () => undefined);
      socket.once('data', () => {
        const body = authCode === 10 ? Buffer.concat([int32(10), Buffer.from('SCRAM-SHA-256\0\0')]) : int32(authCode);
        socket.write(Buffer.concat([Buffer.from('R'), int32(4 + body.length), body]));
      });
      socket.on('data', chunk => received.push(Buffer.from(chunk)));
    });
    await new Promise<void>(done => server.listen(join(dir, '.s.PGSQL.5434'), done));
    try {
      await expect(actor.runReadinessOperation({ Client: pg.Client, control: { op: 'check', host: dir } })).rejects.toMatchObject({ code: 'STAFF_READINESS_PASSWORD_REQUESTED' });
      const bytes = Buffer.concat(received);
      const startupLength = bytes.readInt32BE(0);
      const startup = bytes.subarray(0, startupLength).toString('latin1');
      expect(startup).toContain(`user\0${PEER_ROLE}\0`);
      expect(startup).toContain('database\0debateai\0');
      // Every later message, if any, is typed; none is a password ('p') message.
      const types: string[] = [];
      for (let at = startupLength; at < bytes.length; at += 1 + bytes.readInt32BE(at + 1)) types.push(String.fromCharCode(bytes[at]!));
      expect(types.filter(type => type === 'p')).toEqual([]);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise(done => server.close(done));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const input = (value: unknown) => Buffer.from(JSON.stringify(value));
  const base = { engine: ENGINE, pgPath: PG_PATH, host: SOCKET };
  it('accepts exactly the three calls and their fields', () => {
    expect(actor.parseReadinessControl(input({ op: 'check', ...base }))).toEqual({ op: 'check', ...base });
    expect(actor.parseReadinessControl(input({ op: 'publish', ...base, ...publish }))).toEqual({ op: 'publish', ...base, ...publish });
    expect(actor.parseReadinessControl(input({ op: 'revoke', ...base, generation: uuid(9) }))).toEqual({ op: 'revoke', ...base, generation: uuid(9) });
  });

  it.each([
    ['an unknown call', { op: 'grant', ...base }],
    ['an extra key', { op: 'check', ...base, role: 'postgres' }],
    ['a missing field', { op: 'revoke', ...base }],
    ['an engine outside the releases', { op: 'check', ...base, engine: '/tmp/dialectical-engine' }],
    ['a pg path outside the engine', { op: 'check', ...base, pgPath: '/tmp/pg/lib/index.js' }],
    ['a pg path that climbs out', { op: 'check', ...base, pgPath: `${ENGINE}/node_modules/../../x.js` }],
    ['a TCP host', { op: 'check', ...base, host: '127.0.0.1' }],
    ['a bad hash', { op: 'publish', ...base, ...publish, configSha256: 'x' }],
    ['a bad generation', { op: 'revoke', ...base, generation: 'not-a-uuid' }],
    ['an expiry that is not an exact time', { op: 'publish', ...base, ...publish, evidenceExpiresAt: 'tomorrow' }],
    ['an adapter id with a newline', { op: 'publish', ...base, ...publish, ackAdapterId: 'a\nb' }]
  ])('refuses %s', (_name, value) => {
    expect(() => actor.parseReadinessControl(input(value))).toThrow(/STAFF_READINESS_INPUT_REFUSED/);
  });

  it('names a release pg the dedicated user cannot read (it has no groups), instead of a bare failure', () => {
    expect(() => actor.requirePg(`${ENGINE}/node_modules/pg/lib/index.js`)).toThrow(/STAFF_READINESS_RELEASE_UNREADABLE/);
    expect(actor.requirePg(PG_PATH, () => ({ Client: 'C' }))).toEqual({ Client: 'C' });
  });

  it('the child itself refuses to run off the server, as root or with any environment, and says so in its one line', () => {
    const script = join(dirname(fileURLToPath(import.meta.url)), '../../deploy/preview-lifecycle/v1/readiness-writer-actor.mjs');
    for (const env of [{}, { PATH: '/usr/bin:/bin' }]) {
      const result = spawnSync(process.execPath, [script], { env, input: JSON.stringify({ op: 'check', ...base }), encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({ schema: RESULT_SCHEMA, ok: false, code: 'STAFF_READINESS_ACTOR_REFUSED' });
    }
  });
});

describe('which writer the unlock builds (PREVIEW_LIFECYCLE_STAFF_WRITER, from the unit\'s own env -i line only)', () => {
  const publisher = () => ({ publish: async () => true, revoke: async () => true });
  /** peer: what the dedicated-user path does today ('works', the user 'missing', or the child 'refused'). */
  function spies(peer: 'works' | 'missing' | 'refused' = 'missing') {
    const seen = { creator: [] as unknown[], random: 0, ca: 0, lookups: 0, children: [] as any[] };
    return {
      seen,
      runCreator: async (control: { mode: string }) => { seen.creator.push(control); return control.mode === 'open' ? { existingRoleOpened: true } : { passwordNull: true, expiredMinusInfinity: true, noSessions: true }; },
      randomBytes: (n: number) => { seen.random++; return Buffer.alloc(n, 7); },
      readCa: async () => { seen.ca++; return 'CA'; },
      lookupReadinessUser: async () => { seen.lookups++; if (peer === 'missing') throw refusal('STAFF_READINESS_USER_MISSING'); return { name: OS_USER, uid: 998, gid: 997 }; },
      readinessRunner: ({ user, host }: { user: unknown; host: string }) => async (op: string, fields: unknown) => {
        seen.children.push({ user, host, op, fields });
        if (peer === 'refused') throw refusal('STAFF_READINESS_PEER_AUTH_REFUSED');
        return true;
      }
    };
  }

  it('by default builds the peer writer: every database call is a child as the dedicated user; root opens no pool, runs no creator, draws no password', async () => {
    const s = spies('works'), made: any[] = [];
    const writer = await unlock.buildStaffWriter({ env: {}, Pool: fakePool(async () => ({ rows: [peerRow()] }), made), createPublisher: publisher, ...s });
    expect(writer.kind).toBe(PEER);
    const h = harness();
    const result = await unlock.runUnlockWindow({ writer, evidence: h.evidence, deps: h.deps, windowMs: 10 * MINUTE });
    expect(result).toEqual({ outcome: 'WINDOW_ENDED', publishes: 60, locked: true });
    expect(await writer.reset()).toEqual({ nothingToReset: true });
    expect(s.seen).toMatchObject({ creator: [], random: 0, ca: 0, lookups: 1 });
    expect(made).toEqual([]);
    expect(s.seen.children.map((child: any) => child.op)).toEqual(['check', ...Array(60).fill('publish'), 'revoke']);
    for (const child of s.seen.children) expect(child).toMatchObject({ user: { name: OS_USER, uid: 998, gid: 997 }, host: SOCKET });
  });

  it('the default stops before any child or pool when the dedicated user is missing', async () => {
    const s = spies('missing'), made: any[] = [];
    await expect(unlock.buildStaffWriter({ env: {}, Pool: fakePool(async () => ({ rows: [] }), made), createPublisher: publisher, ...s })).rejects.toMatchObject({ code: 'STAFF_READINESS_USER_MISSING' });
    expect(s.seen.children).toEqual([]);
    expect(made).toEqual([]);
  });

  it.each([['missing', 0], ['refused', 1]] as const)('builds the interim recovery-login writer when it is named and the peer path is %s, with its identity check unchanged', async (peer, probes) => {
    const s = spies(peer), made: any[] = [];
    const writer = await unlock.buildStaffWriter({ env: { PREVIEW_LIFECYCLE_STAFF_WRITER: 'interim-recovery-login' }, Pool: fakePool(async () => ({ rows: [interimRow()] }), made), createPublisher: publisher, ...s, now: () => start });
    expect(writer.kind).toBe('interim-recovery-login');
    expect(s.seen.children.map((child: any) => [child.op, child.host])).toEqual(Array(probes).fill(['check', SOCKET]));
    await writer.open({ validUntil: new Date(start + 4 * MINUTE) });
    expect(s.seen.creator).toEqual([{ mode: 'open', validUntil: new Date(start + 4 * MINUTE).toISOString() }]);
    expect(made[0].options).toMatchObject({ user: 'debateai_prod_staff_recovery', password: '07'.repeat(32), ssl: false });
    expect(made[0].sql[0]).toMatch(/rolvaliduntil/);
    await expect(writer.close()).resolves.toMatchObject({ passwordNull: true, expiredMinusInfinity: true });
  });

  it('refuses the fallback when the peer writer already works (STAFF_WRITER_FALLBACK_NOT_NEEDED), before opening anything', async () => {
    const s = spies('works'), made: any[] = [];
    await expect(unlock.buildStaffWriter({ env: { PREVIEW_LIFECYCLE_STAFF_WRITER: 'interim-recovery-login' }, Pool: fakePool(async () => ({ rows: [interimRow()] }), made), createPublisher: publisher, ...s })).rejects.toMatchObject({ code: 'STAFF_WRITER_FALLBACK_NOT_NEEDED' });
    expect(s.seen).toMatchObject({ creator: [], random: 0, ca: 0 });
    expect(s.seen.children.map((child: any) => [child.op, child.host])).toEqual([['check', SOCKET]]);
    expect(made).toEqual([]);
  });

  it('a fallback pointed at loopback TLS still probes the peer writer on the preview socket', async () => {
    const env = { PREVIEW_LIFECYCLE_STAFF_WRITER: 'interim-recovery-login', PREVIEW_LIFECYCLE_STAFF_DB_HOST: '127.0.0.1' };
    const works = spies('works');
    await expect(unlock.buildStaffWriter({ env, Pool: fakePool(async () => ({ rows: [] })), createPublisher: publisher, ...works })).rejects.toMatchObject({ code: 'STAFF_WRITER_FALLBACK_NOT_NEEDED' });
    expect(works.seen.children.map((child: any) => child.host)).toEqual([SOCKET]);
    const missing = spies('missing');
    await unlock.buildStaffWriter({ env, Pool: fakePool(async () => ({ rows: [] })), createPublisher: publisher, ...missing });
    expect(missing.seen.ca).toBe(1);
  });

  it.each([
    ['another login', (row: any) => ({ ...row, session: PEER_ROLE, role: PEER_ROLE })],
    ['an expiry beyond five minutes', (row: any) => ({ ...row, bounded: false })],
    ['an elevated attribute', (row: any) => ({ ...row, no_elevated_powers: false })],
    ['another port', (row: any) => ({ ...row, port: 5432 })]
  ])('the interim writer still refuses %s', async (_name, mutate) => {
    const s = spies(), made: any[] = [];
    const writer = await unlock.buildStaffWriter({ env: { PREVIEW_LIFECYCLE_STAFF_WRITER: 'interim-recovery-login' }, Pool: fakePool(async () => ({ rows: [mutate(interimRow())] }), made), createPublisher: publisher, ...s, now: () => start });
    await expect(writer.open({ validUntil: new Date(start + 4 * MINUTE) })).rejects.toMatchObject({ code: 'STAFF_JIT_IDENTITY_REFUSED' });
    expect(made[0].ended).toBe(1);
  });

  it.each([
    ['an unknown writer', { PREVIEW_LIFECYCLE_STAFF_WRITER: 'interim' }, 'STAFF_WRITER_REFUSED'],
    ['the peer writer over TCP', { PREVIEW_LIFECYCLE_STAFF_DB_HOST: '127.0.0.1' }, 'STAFF_DB_HOST_REFUSED']
  ])('refuses %s before building anything', async (_name, env, code) => {
    const s = spies('works'), made: any[] = [];
    await expect(unlock.buildStaffWriter({ env, Pool: fakePool(async () => ({ rows: [] }), made), createPublisher: publisher, ...s })).rejects.toMatchObject({ code });
    expect(made).toEqual([]);
    expect(s.seen).toEqual({ creator: [], random: 0, ca: 0, lookups: 0, children: [] });
  });
});

describe('ACK evidence refresh', () => {
  const wrapper = (path: string) => `import {createAdapters} from '/opt/debateai-v3-preview/operator/staff-alerts/adapters.mjs';\nexport async function createStaffAlertOperatorAdapters(){return createAdapters({evidencePath:${JSON.stringify(path)},adapterId:'capture'});}\n`;
  it('finds the one evidence path the installed wrapper reads', () => {
    expect(unlock.findEvidencePath(wrapper('/etc/debateai-v3-preview/auth-dev-v1/capture-evidence-0123456789abcdef0123456789abcdef.json'))).toBe('/etc/debateai-v3-preview/auth-dev-v1/capture-evidence-0123456789abcdef0123456789abcdef.json');
  });
  it.each([
    ['no evidence path', 'export const x=1;'],
    ['two evidence paths', `${wrapper('/etc/a.json')}const evidencePath='/etc/b.json';`],
    ['a relative path', wrapper('evidence.json')],
    ['a computed path', 'createAdapters({evidencePath:base+"/x.json"})']
  ])('refuses a wrapper with %s', (_name, text) => {
    expect(() => unlock.findEvidencePath(text)).toThrow(/EVIDENCE_PATH_REFUSED/);
  });

  function evidenceFiles() {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-evidence-')));
    mkdirSync(join(base, 'etc')); chmodSync(join(base, 'etc'), 0o755);
    const path = join(base, 'etc', 'capture-evidence.json');
    writeFileSync(path, JSON.stringify({ schema: 'preview-capture-evidence-v1', configSha256: 'a'.repeat(64), generation: uuid(9), rehearsalId: uuid(1), expiresAt: '2026-10-08T00:00:00.000Z', probeDeliveryId: `${uuid(2)}:INDEPENDENT_METADATA_ALERT`, probeMessageSha256: 'b'.repeat(64) }));
    chmodSync(path, 0o640);
    mkdirSync(join(base, 'state')); chmodSync(join(base, 'state'), 0o700);
    return { base, path, archive: join(base, 'state', 'evidence-archive') };
  }
  const proof = (now: number) => ({ configSha256: 'c'.repeat(64), generation: uuid(9), rehearsalId: uuid(3), expiresAt: new Date(now + 5 * MINUTE).toISOString(), probeDeliveryId: `${uuid(4)}:INDEPENDENT_METADATA_ALERT`, probeMessageSha256: 'd'.repeat(64) });

  it('writes the genuine new proof where the wrapper reads it, keeping its schema and permissions, after archiving the old one once', async () => {
    const f = evidenceFiles();
    const now = Date.now();
    const evidence = unlock.createSelfCaptureEvidence({
      readWrapperText: async () => wrapper(f.path), runSelfCapture: async () => proof(now), readCurrent: async () => null,
      archiveDir: f.archive, owner: { uid: process.getuid!(), gid: process.getgid!() }, now: () => now
    });
    await evidence.refresh();
    await evidence.refresh();
    const written = JSON.parse(readFileSync(f.path, 'utf8'));
    expect(Object.keys(written)).toEqual(['schema', 'configSha256', 'generation', 'rehearsalId', 'expiresAt', 'probeDeliveryId', 'probeMessageSha256']);
    expect(written).toEqual({ schema: 'preview-capture-evidence-v1', ...proof(now) });
    expect(statSync(f.path).mode & 0o777).toBe(0o640);
    const archived = readdirSync(f.archive);
    expect(archived).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(f.archive, archived[0]!), 'utf8')).rehearsalId).toBe(uuid(1));
    expect(statSync(join(f.archive, archived[0]!)).mode & 0o777).toBe(0o600);
  });

  it.each([
    ['a folder others can write', (f: ReturnType<typeof evidenceFiles>) => { chmodSync(dirname(f.path), 0o777); return f.path; }],
    ['a path through a linked folder', (f: ReturnType<typeof evidenceFiles>) => { symlinkSync(dirname(f.path), join(f.base, 'alias')); return join(f.base, 'alias', 'capture-evidence.json'); }],
    ['a linked evidence file', (f: ReturnType<typeof evidenceFiles>) => { const real = join(f.base, 'etc', 'real.json'); writeFileSync(real, readFileSync(f.path)); chmodSync(real, 0o640); const link = join(f.base, 'etc', 'linked.json'); symlinkSync(real, link); return link; }],
    ['a group-writable evidence file', (f: ReturnType<typeof evidenceFiles>) => { chmodSync(f.path, 0o660); return f.path; }]
  ])('refuses to read or rewrite an evidence file in %s', async (_name, arrange) => {
    const f = evidenceFiles();
    const path = arrange(f);
    const now = Date.now();
    let captured = 0;
    const evidence = unlock.createSelfCaptureEvidence({
      readWrapperText: async () => wrapper(path), runSelfCapture: async () => { captured++; return proof(now); }, readCurrent: async () => null,
      archiveDir: f.archive, owner: { uid: process.getuid!(), gid: process.getgid!() }, now: () => now
    });
    await expect(evidence.refresh()).rejects.toThrow(/EVIDENCE_FILE_REFUSED/);
    expect(captured).toBe(0);
  });

  it.each([
    ['an expiry beyond five minutes', (p: any, now: number) => ({ ...p, expiresAt: new Date(now + 6 * MINUTE).toISOString() })],
    ['an expired proof', (p: any, now: number) => ({ ...p, expiresAt: new Date(now - 1).toISOString() })],
    ['an extra field', (p: any) => ({ ...p, recipient: 'x' })],
    ['a wrong delivery id', (p: any) => ({ ...p, probeDeliveryId: uuid(4) })]
  ])('refuses a self-capture result with %s and leaves the evidence file alone', async (_name, mutate) => {
    const f = evidenceFiles();
    const before = readFileSync(f.path);
    const now = Date.now();
    const evidence = unlock.createSelfCaptureEvidence({
      readWrapperText: async () => wrapper(f.path), runSelfCapture: async () => mutate(proof(now), now), readCurrent: async () => null,
      archiveDir: f.archive, owner: { uid: process.getuid!(), gid: process.getgid!() }, now: () => now
    });
    await expect(evidence.refresh()).rejects.toThrow(/SELF_CAPTURE_REFUSED/);
    expect(readFileSync(f.path)).toEqual(before);
  });
});

describe('postgres-peer creator actor input', () => {
  const engine = '/opt/debateai-v3-preview/releases/auth-dev-candidate-v1/dialectical-engine';
  const at = Date.parse('2026-10-09T10:00:00Z');
  const input = (header: unknown, rest = '') => Buffer.from(`${JSON.stringify(header)}\n${rest}`);
  it('accepts open with exactly 64 hex characters on the second line and returns them as bytes', () => {
    const parsed = creator.parseCreatorInput(input({ mode: 'open', validUntil: '2026-10-09T10:04:00.000Z', engine }, `${'ab'.repeat(32)}\n`), at);
    expect(parsed).toMatchObject({ mode: 'open', validUntil: '2026-10-09T10:04:00.000Z', engine });
    expect(Buffer.isBuffer(parsed.password) && parsed.password.toString()).toBe('ab'.repeat(32));
  });
  it('accepts extend and close without any secret', () => {
    expect(creator.parseCreatorInput(input({ mode: 'extend', validUntil: '2026-10-09T10:03:00.000Z', engine }), at)).toEqual({ mode: 'extend', validUntil: '2026-10-09T10:03:00.000Z', engine, password: null });
    expect(creator.parseCreatorInput(input({ mode: 'close', engine }), at)).toEqual({ mode: 'close', validUntil: null, engine, password: null });
  });
  it.each([
    ['an unknown mode', input({ mode: 'grant', engine })],
    ['a lease beyond five minutes', input({ mode: 'extend', validUntil: '2026-10-09T10:06:00.000Z', engine })],
    ['a lease in the past', input({ mode: 'extend', validUntil: '2026-10-09T09:59:00.000Z', engine })],
    ['open without a password', input({ mode: 'open', validUntil: '2026-10-09T10:04:00.000Z', engine })],
    ['a short password', input({ mode: 'open', validUntil: '2026-10-09T10:04:00.000Z', engine }, 'abcd\n')],
    ['a secret on close', input({ mode: 'close', engine }, `${'ab'.repeat(32)}\n`)],
    ['an engine outside the releases', input({ mode: 'close', engine: '/tmp/dialectical-engine' })],
    ['an extra key', input({ mode: 'close', engine, role: 'postgres' })]
  ])('refuses %s', (_name, bytes) => {
    expect(() => creator.parseCreatorInput(bytes, at)).toThrow(/STAFF_JIT_INPUT_REFUSED/);
  });
});

describe('the interim login password never appears in SQL text', () => {
  // RFC 7677 section 3 (SCRAM-SHA-256): user "user", password "pencil", this salt, 4096 iterations.
  const RFC = {
    salt: 'W22ZaJ0SNY7soEsUEjb6gQ==',
    authMessage: 'n=user,r=rOprNGfwEbeRWgbNEkqO,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096,c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0',
    clientProof: 'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=',
    serverSignature: '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4='
  };
  const parse = (verifier: string) => {
    const match = /^SCRAM-SHA-256\$4096:([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/.exec(verifier);
    expect(match).not.toBeNull();
    return { salt: match![1]!, storedKey: Buffer.from(match![2]!, 'base64'), serverKey: Buffer.from(match![3]!, 'base64') };
  };
  /** Exactly what the server does with a stored verifier: recover ClientKey from the proof and hash it. */
  const serverAccepts = (verifier: string, authMessage: string, clientProof: Buffer) => {
    const { storedKey } = parse(verifier);
    const signature = createHmac('sha256', storedKey).update(authMessage).digest();
    const clientKey = Buffer.from(clientProof.map((byte, index) => byte ^ signature[index]!));
    return createHash('sha256').update(clientKey).digest().equals(storedKey);
  };

  it('builds the PostgreSQL SCRAM-SHA-256 verifier that the RFC 7677 exchange authenticates against', () => {
    const verifier = creator.scramSha256Verifier(Buffer.from('pencil'), { salt: Buffer.from(RFC.salt, 'base64') });
    const { salt, serverKey } = parse(verifier);
    expect(salt).toBe(RFC.salt);
    expect(serverAccepts(verifier, RFC.authMessage, Buffer.from(RFC.clientProof, 'base64'))).toBe(true);
    expect(createHmac('sha256', serverKey).update(RFC.authMessage).digest('base64')).toBe(RFC.serverSignature);
    expect(serverAccepts(creator.scramSha256Verifier(Buffer.from('pencil!'), { salt: Buffer.from(RFC.salt, 'base64') }), RFC.authMessage, Buffer.from(RFC.clientProof, 'base64'))).toBe(false);
  });

  it('uses a fresh 16-byte salt each time', () => {
    const a = parse(creator.scramSha256Verifier(Buffer.from('ab'.repeat(32)))), b = parse(creator.scramSha256Verifier(Buffer.from('ab'.repeat(32))));
    expect(Buffer.from(a.salt, 'base64')).toHaveLength(16);
    expect(a.salt).not.toBe(b.salt);
    expect(a.storedKey).toHaveLength(32);
  });

  it('opens the login with ALTER ROLE ... PASSWORD <verifier>: the plaintext is in no statement and no parameter', async () => {
    const seen: { sql: string; params: unknown[] }[] = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        seen.push({ sql, params });
        if (sql.includes("current_setting('cluster_name')")) return { rows: [{ session: 'postgres', role: 'debateai_prod_migrator', database: 'debateai', port: 5434, cluster: 'debateai-v3-preview-15fccd74', directory: '/var/lib/postgresql/18/v3-preview', major: 18 }] };
        if (sql.includes('pg_authid')) return { rows: [{ rolcanlogin: true, rolinherit: true, no_elevated_powers: true, password_null: true, expired_minus_infinity: true, open_now: false, sessions: 0, memberships: 1, exact_capability: 1, members: 0 }] };
        if (sql.includes("format('ALTER ROLE")) return { rows: [{ statement: `ALTER ROLE debateai_prod_staff_recovery PASSWORD '${String(params[0])}' VALID UNTIL '${String(params[1])}'` }] };
        if (/\bok\b/.test(sql)) return { rows: [{ ok: true }] };
        return { rows: [] };
      }
    };
    const plaintext = 'cd'.repeat(32), password = Buffer.from(plaintext);
    await expect(creator.openLogin(client, password, '2026-10-09T10:04:00.000Z')).resolves.toMatchObject({ existingRoleOpened: true });
    for (const call of seen) expect(JSON.stringify(call)).not.toContain(plaintext);
    const alter = seen.find(call => call.sql.startsWith('ALTER ROLE'))!;
    const verifier = /PASSWORD '([^']+)'/.exec(alter.sql)![1]!;
    const { salt, storedKey } = parse(verifier);
    // First principles (RFC 5802): SaltedPassword = PBKDF2-SHA256(password, salt, 4096); StoredKey = SHA256(HMAC(SaltedPassword, "Client Key")).
    const salted = (await import('node:crypto')).pbkdf2Sync(plaintext, Buffer.from(salt, 'base64'), 4096, 32, 'sha256');
    expect(createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest().equals(storedKey)).toBe(true);
    expect(password.every(byte => byte === 0)).toBe(true);
  });
});

describe('self-capture actor input', () => {
  const control = { engine: '/opt/debateai-v3-preview/releases/auth-dev-candidate-v1/dialectical-engine', configPath: '/etc/debateai-v3-preview/auth-dev-v1/staff-alert.json', operatorPath: '/opt/debateai-v3-preview/operator/auth-dev-task12-v1/wrapper.mjs', operatorSha256: 'a'.repeat(64) };
  it('accepts the exact control object', () => {
    expect(capture.parseSelfCaptureControl(Buffer.from(JSON.stringify(control)))).toEqual(control);
  });
  it.each([
    ['a relative config path', { ...control, configPath: 'staff.json' }],
    ['a bad operator hash', { ...control, operatorSha256: 'x' }],
    ['an extra key', { ...control, recipient: 'someone@example.test' }],
    ['an engine outside the releases', { ...control, engine: '/home/x/dialectical-engine' }]
  ])('refuses %s', (_name, value) => {
    expect(() => capture.parseSelfCaptureControl(Buffer.from(JSON.stringify(value)))).toThrow(/SELF_CAPTURE_INPUT_REFUSED/);
  });
  it('only ever probes the local capture address', () => {
    const config = { schema: 'staff-independent-alert-config-v1', generation: uuid(9), executable: '/opt/x/capture-sendmail.mjs', from: 'noreply@dezbatere.ro', recipient: 'preview-security@capture.invalid', ackAdapterId: 'capture' };
    expect(capture.assertLocalCaptureConfig(config)).toBe(config);
    expect(() => capture.assertLocalCaptureConfig({ ...config, recipient: 'owner@example.test' })).toThrow(/SELF_CAPTURE_NOT_LOCAL/);
  });
});

/**
 * A small release frozen exactly like a real one (same manifest schema, same verifier), owned by the
 * test user instead of root. The launcher's reader insists on uid 0, so the test reader is the same
 * custody read with the test user's uid.
 */
async function frozenRelease() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-release-')));
  const root = join(base, 'release'), artifacts = join(base, 'artifacts'), engine = join(root, 'dialectical-engine');
  mkdirSync(root, { mode: 0o755 }); mkdirSync(artifacts, { mode: 0o755 });
  const files: Record<string, string> = {
    'package.json': '{"private":true}', 'tsconfig.json': '{}',
    'packages/contract/package.json': '{"type":"module"}', 'packages/contract/src/generate.ts': '// fixture producer\n',
    'packages/contract/generated/client.ts': '{}', 'packages/contract/generated/field-inventory.json': '{}', 'packages/contract/generated/openapi.json': '{}',
    'node_modules/tsx/dist/loader.mjs': 'export {};\n', 'node_modules/tsx/dist/esm/api/index.mjs': 'export const tsImport = () => { throw new Error("fixture"); };\n',
    'packages/db/src/index.ts': 'export const db = 1;\n', 'apps/api/src/staff/alerts.ts': 'export const alerts = 1;\n',
    'deploy/preview-auth-dev/v1/launch-api.mjs': '// fixture launcher\n'
  };
  for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(engine, rel)), { recursive: true, mode: 0o755 }); writeFileSync(join(engine, rel), text, { mode: 0o644 }); }
  const generatedDir = 'dialectical-engine/packages/contract/generated';
  const tracked = await sourceManifest.buildInventory(root, me.uid, { excludedDirectories: [generatedDir] });
  const dependencyInventory = [{ path: 'dialectical-engine/node_modules', files: await sourceManifest.buildInventory(join(engine, 'node_modules'), me.uid, { dependencies: true, allowedRoot: root }) }];
  const generated = (await sourceManifest.buildInventory(join(root, generatedDir), me.uid, { complete: true })).map((file: any) => ({ ...file, path: `${generatedDir}/${file.path}` }));
  const executable = realpathSync(process.execPath), node = lstatSync(executable);
  const runtime = { nodeVersion: process.version, pnpmVersion: '11.20.0', platform: process.platform, arch: process.arch, nodeExecutable: executable,
    nodeIdentitySha256: sha(JSON.stringify([node.dev, node.ino, node.uid, node.gid, node.mode, node.nlink, node.size, node.mtimeMs, node.ctimeMs])), tsxLoader: 'dialectical-engine/node_modules/tsx/dist/loader.mjs' };
  const outputSha256 = sha(JSON.stringify(generated));
  const manifest = {
    schema: 'preview-auth-dev-source-v3', sourceRevision: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceRoot: root, role: 'api', uid: me.uid, nodeVersion: process.version, pnpmVersion: '11.20.0',
    files: tracked, packageLinks: [], dependencyInventory,
    generatedContract: { schema: 'preview-auth-dev-generated-contract-v1', producer: 'dialectical-engine/packages/contract/src/generate.ts', files: generated, runtime,
      inputSha256: sha(JSON.stringify({ producer: 'dialectical-engine/packages/contract/src/generate.ts', files: tracked, dependencies: dependencyInventory, packageLinks: [], runtime })), outputSha256, reproductions: [outputSha256, outputSha256] },
    nativeSha256: '9'.repeat(64), contractSha256: outputSha256, promptStoryProviderSha256: 'e'.repeat(64), packageLockSha256: 'f'.repeat(64)
  };
  const bytes = JSON.stringify(manifest), manifestPath = join(artifacts, 'source.json');
  writeFileSync(manifestPath, bytes, { mode: 0o644 });
  const plan = { sourceRoot: root, sourceRevision: manifest.sourceRevision, sourceTree: manifest.sourceTree, sourceManifest: { path: manifestPath, sha256: sha(bytes) },
    operatorManifestSha256: sha(JSON.stringify(tracked.filter((file: any) => file.path.startsWith('dialectical-engine/deploy/preview-auth-dev/v1/')))) };
  const readArtifact = (file: { path: string; sha256: string }, kind: string) => custody.withPrivateBytes(file.path, { root: dirname(file.path), uid: me.uid, mode: 0o644, maxBytes: 16777216 },
    (raw: Uint8Array) => { if (sha(Buffer.from(raw)) !== file.sha256) throw new Error('hash'); return launchPlan.parsePublicArtifactBytes(raw, kind); });
  const importPaths = [join(engine, 'node_modules/tsx/dist/esm/api/index.mjs'), join(engine, 'packages/db/src/index.ts'), join(engine, 'apps/api/src/staff/alerts.ts')];
  return { base, root, engine, plan, readArtifact, importPaths };
}

describe('release check before any import from the release tree', () => {
  it('accepts the pinned, untouched release with root-only import paths', async () => {
    const r = await frozenRelease();
    await expect(guard.verifyReleaseForImport({ plan: r.plan, importPaths: r.importPaths, rootUid: me.uid, ceiling: r.base, readArtifact: r.readArtifact })).resolves.toMatchObject({ sourceRoot: r.root, role: 'api' });
  });

  it.each([
    ['a changed source file', (r: any) => writeFileSync(join(r.engine, 'packages/db/src/index.ts'), 'export const db = 2; // tampered\n')],
    ['a planted extra file', (r: any) => writeFileSync(join(r.engine, 'apps/api/src/staff/injected.ts'), 'process.exit(0);\n', { mode: 0o644 })],
    ['a changed dependency (the tsx loader root imports first)', (r: any) => writeFileSync(join(r.engine, 'node_modules/tsx/dist/esm/api/index.mjs'), 'export const tsImport = 1;\n')],
    ['a different operator digest', (r: any) => { r.plan.operatorManifestSha256 = '0'.repeat(64); }],
    ['a source manifest the pin does not name', (r: any) => { r.plan.sourceManifest.sha256 = '0'.repeat(64); }]
  ])('refuses %s before anything is imported', async (_name, tamper) => {
    const r = await frozenRelease();
    tamper(r);
    await expect(guard.verifyReleaseForImport({ plan: r.plan, importPaths: r.importPaths, rootUid: me.uid, ceiling: r.base, readArtifact: r.readArtifact })).rejects.toMatchObject({ code: 'RELEASE_UNVERIFIED' });
  });

  it('refuses a source manifest that is not owned by the root identity', async () => {
    const r = await frozenRelease();
    await expect(guard.verifyReleaseForImport({ plan: r.plan, importPaths: r.importPaths, rootUid: me.uid + 1, ceiling: r.base, readArtifact: r.readArtifact })).rejects.toMatchObject({ code: 'RELEASE_UNVERIFIED' });
  });

  // The path check stands on its own: here the manifest check is stubbed to pass.
  const passing = async () => true;
  it.each([
    ['a directory others can write', (r: any) => chmodSync(join(r.engine, 'packages/db/src'), 0o777)],
    ['a group-writable import file', (r: any) => chmodSync(join(r.engine, 'packages/db/src/index.ts'), 0o664)],
    ['a group-writable release root', (r: any) => chmodSync(r.root, 0o775)],
    ['a link that leaves the release', (r: any) => { const outside = join(r.base, 'outside.ts'); writeFileSync(outside, 'x', { mode: 0o644 }); const path = join(r.engine, 'apps/api/src/staff/alerts.ts'); rmSync(path); symlinkSync(outside, path); }],
    ['a path outside the release', (r: any) => { r.importPaths.push(join(r.base, 'artifacts/source.json')); }]
  ])('refuses an import path with %s', async (_name, damage) => {
    const r = await frozenRelease();
    damage(r);
    await expect(guard.verifyReleaseForImport({ plan: r.plan, importPaths: r.importPaths, rootUid: me.uid, ceiling: r.base, readArtifact: r.readArtifact, verifyManifest: passing })).rejects.toMatchObject({ code: 'RELEASE_PATH_NOT_ROOT_ONLY' });
  });

  it('follows a package link inside the release (pnpm layout) and checks where it lands', async () => {
    const r = await frozenRelease();
    mkdirSync(join(r.engine, 'node_modules/.pnpm/pg@8/node_modules/pg/lib'), { recursive: true, mode: 0o755 });
    writeFileSync(join(r.engine, 'node_modules/.pnpm/pg@8/node_modules/pg/lib/index.js'), 'module.exports = 1;\n', { mode: 0o644 });
    symlinkSync('.pnpm/pg@8/node_modules/pg', join(r.engine, 'node_modules/pg'));
    const path = join(r.engine, 'node_modules/pg/lib/index.js');
    await expect(guard.verifyReleaseForImport({ plan: r.plan, importPaths: [path], rootUid: me.uid, ceiling: r.base, readArtifact: r.readArtifact, verifyManifest: passing })).resolves.toBeTruthy();
    chmodSync(join(r.engine, 'node_modules/.pnpm/pg@8/node_modules/pg/lib'), 0o777);
    await expect(guard.verifyReleaseForImport({ plan: r.plan, importPaths: [path], rootUid: me.uid, ceiling: r.base, readArtifact: r.readArtifact, verifyManifest: passing })).rejects.toMatchObject({ code: 'RELEASE_PATH_NOT_ROOT_ONLY' });
  });

  /** base/opt/releases/rel/dialectical-engine/x.mjs, all owned by the test user; `base` stands in for `/`. */
  function nestedRelease() {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'lifecycle-ancestors-')));
    const sourceRoot = join(base, 'opt', 'releases', 'rel'), path = join(sourceRoot, 'dialectical-engine', 'x.mjs');
    mkdirSync(join(sourceRoot, 'dialectical-engine', 'node_modules'), { recursive: true, mode: 0o755 });
    for (const folder of [base, join(base, 'opt'), join(base, 'opt', 'releases')]) chmodSync(folder, 0o755);
    writeFileSync(path, 'export {};\n', { mode: 0o644 });
    return { base, sourceRoot, path, check: (options: Record<string, unknown> = {}) => guard.assertRootOnlyImport(path, { sourceRoot, rootUid: me.uid, ceiling: base, ...options }) };
  }

  it('checks every folder above the release root too: root-only, and no node_modules there (inside the release is fine)', async () => {
    await expect(nestedRelease().check()).resolves.toBeUndefined();
  });

  it.each([['0777', 0o777], ['1777', 0o1777], ['0775', 0o775]])('refuses a folder above the release root with mode %s (no sticky /tmp exception)', async (_name, mode) => {
    const r = nestedRelease();
    chmodSync(join(r.base, 'opt'), mode);
    await expect(r.check()).rejects.toMatchObject({ code: 'RELEASE_ANCESTOR_NOT_ROOT_ONLY' });
  });

  it.each([
    ['folder', (at: string) => mkdirSync(at)],
    ['file', (at: string) => writeFileSync(at, '')],
    ['link', (at: string) => symlinkSync('/nonexistent', at)]
  ])('refuses a node_modules %s in any folder above the release root (Node would climb into it)', async (_kind, make) => {
    for (const above of ['opt/releases', 'opt', '.']) {
      const r = nestedRelease();
      make(join(r.base, above, 'node_modules'));
      await expect(r.check()).rejects.toMatchObject({ code: 'RELEASE_ANCESTOR_NODE_MODULES' });
    }
  });

  it('walks all the way to / unless a test names another top (this temp folder sits under folders root owns, or under a world-writable /tmp)', async () => {
    const r = nestedRelease();
    await expect(guard.assertRootOnlyImport(r.path, { sourceRoot: r.sourceRoot, rootUid: me.uid })).rejects.toMatchObject({ code: 'RELEASE_ANCESTOR_NOT_ROOT_ONLY' });
    await expect(r.check({ ceiling: r.sourceRoot })).rejects.toMatchObject({ code: 'RELEASE_PATH_NOT_ROOT_ONLY' });
    await expect(r.check({ ceiling: join(r.base, 'elsewhere') })).rejects.toMatchObject({ code: 'RELEASE_PATH_NOT_ROOT_ONLY' });
  });

  it('root unlock: imports nothing when the release check refuses, and checks every module it would load', async () => {
    const loaded: string[][] = [], checked: any[] = [];
    const refuse = async (input: any) => { checked.push(input); throw Object.assign(new Error('RELEASE_UNVERIFIED'), { code: 'RELEASE_UNVERIFIED' }); };
    const engine = '/opt/debateai-v3-preview/releases/auth-dev-candidate-v1/dialectical-engine';
    await expect(unlock.loadReleaseModules({ plan: { sourceRoot: 'x' }, engine, resolvePg: () => `${engine}/node_modules/.pnpm/pg@8/node_modules/pg/lib/index.js`, guard: refuse, load: async (paths: string[]) => { loaded.push(paths); } })).rejects.toMatchObject({ code: 'RELEASE_UNVERIFIED' });
    expect(loaded).toEqual([]);
    expect(checked[0].importPaths).toEqual([`${engine}/node_modules/tsx/dist/esm/api/index.mjs`, `${engine}/packages/db/src/index.ts`, `${engine}/apps/api/src/staff/alerts.ts`, `${engine}/apps/api/src/staff/runtime.ts`, `${engine}/node_modules/.pnpm/pg@8/node_modules/pg/lib/index.js`]);
    expect(checked[0].plan).toEqual({ sourceRoot: 'x' });
    // After the check, the verified pg path is handed on: the readiness child requires exactly that file.
    const pgPath = `${engine}/node_modules/.pnpm/pg@8/node_modules/pg/lib/index.js`;
    await expect(unlock.loadReleaseModules({ plan: { sourceRoot: 'x' }, engine, resolvePg: () => pgPath, guard: async () => true, load: async () => ({ pg: 'PG' }) })).resolves.toEqual({ pg: 'PG', pgPath });
  });

  it('postgres creator actor: verifies the pinned API release itself and refuses another engine before importing', async () => {
    const entry = { sourceRoot: '/opt/debateai-v3-preview/releases/auth-dev-candidate-v1' }, plan = { sourceRoot: entry.sourceRoot };
    const checked: any[] = [];
    const deps = { loadPinned: async () => ({ entry, plan }), guard: async (input: any) => { checked.push(input); return true; } };
    await expect(creator.verifyCreatorRelease({ engine: '/opt/debateai-v3-preview/releases/auth-dev-candidate-v2/dialectical-engine', ...deps })).rejects.toMatchObject({ code: 'STAFF_JIT_RELEASE_REFUSED' });
    expect(checked).toEqual([]);
    const engine = `${entry.sourceRoot}/dialectical-engine`;
    await expect(creator.verifyCreatorRelease({ engine, ...deps })).resolves.toEqual([`${engine}/node_modules/tsx/dist/esm/api/index.mjs`, `${engine}/packages/db/src/migration-lineage.ts`, `${engine}/deploy/preview-auth-dev/v1/native-peer.mjs`]);
    expect(checked[0]).toEqual({ plan, importPaths: [`${engine}/node_modules/tsx/dist/esm/api/index.mjs`, `${engine}/packages/db/src/migration-lineage.ts`, `${engine}/deploy/preview-auth-dev/v1/native-peer.mjs`] });
    await expect(creator.verifyCreatorRelease({ engine, ...deps, guard: async () => { throw Object.assign(new Error('RELEASE_UNVERIFIED'), { code: 'RELEASE_UNVERIFIED' }); } })).rejects.toMatchObject({ code: 'STAFF_JIT_RELEASE_REFUSED' });
  });
});
