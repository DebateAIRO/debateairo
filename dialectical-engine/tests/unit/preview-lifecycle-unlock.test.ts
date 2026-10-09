import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
const unlock = await import('../../deploy/' + 'preview-lifecycle/v1/unlock-team-tools.mjs');
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
