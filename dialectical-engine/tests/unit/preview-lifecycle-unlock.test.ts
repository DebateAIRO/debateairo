import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const unlock = await import('../../deploy/' + 'preview-lifecycle/v1/unlock-team-tools.mjs');
const creator = await import('../../deploy/' + 'preview-lifecycle/v1/jit-creator-actor.mjs');
const capture = await import('../../deploy/' + 'preview-lifecycle/v1/self-capture-actor.mjs');

const MINUTE = 60_000;
const start = Date.parse('2026-10-09T10:00:00Z');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ready = (expiresAt: number, n = 1) => ({ configSha256: 'a'.repeat(64), generation: uuid(9), ackAdapterId: 'capture', rehearsalId: uuid(n), evidenceExpiresAt: new Date(expiresAt) });

/** A fake clock that only moves when the loop sleeps, plus recording fakes for both interfaces. */
function harness(options: { evidenceTtlMs?: number; staleAfterRefresh?: boolean; publish?: () => Promise<boolean>; open?: () => Promise<void>; close?: () => Promise<unknown>; abortAfterPublishes?: number } = {}) {
  let clock = start;
  const calls: string[] = [], leases: { at: number; until: number }[] = [], logs: any[] = [];
  const controller = new AbortController();
  let current: ReturnType<typeof ready> | null = null, refreshes = 0, publishes = 0;
  const writer = {
    kind: 'interim-recovery-login',
    open: options.open ?? (async ({ validUntil }: { validUntil: Date }) => { calls.push('open'); leases.push({ at: clock, until: validUntil.getTime() }); }),
    extend: async ({ validUntil }: { validUntil: Date }) => { calls.push('extend'); leases.push({ at: clock, until: validUntil.getTime() }); },
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
