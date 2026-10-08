import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { StaffContext, ActionBinding } from '@debateai/kernel';
import type { AuthenticatedSession } from '../../apps/api/src/sessions.js';
// The first red explicitly asserts the missing prepared guard, instead of a loader error.
const access = await import('../../apps/api/src/staff/access.js');
const context: StaffContext = { staffId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222', ordinarySessionId: '33333333-3333-4333-8333-333333333333', privilegeSessionId: '44444444-4444-4444-8444-444444444444', designation: 'DELEGATED', securityEpoch: 0, accountSecurityEpoch: 0, grantRevision: 0, capabilities: ['TEAM_READ'] };
const base: AuthenticatedSession = { userId: context.userId, ownerRef: '55555555-5555-4555-8555-555555555555', tokenHash: 'sha256:' + 'a'.repeat(64), csrfTokenHash: 'sha256:' + 'b'.repeat(64), authKind: 'cookie', session: { session_id: context.ordinarySessionId, asker_id: 'owner:55555555-5555-4555-8555-555555555555', caller_scope: 'ASKER', ownership_provenance: 'server_session', provisional_identity_model: false } };
const token = Buffer.alloc(32, 1).toString('base64url'), csrf = Buffer.alloc(32, 2).toString('base64url');
const hash = (s: string) => 'sha256:' + createHash('sha256').update(s).digest('hex');
const binding: ActionBinding = { action: 'CREDENTIAL_REVOKE', targetId: base.userId, bodySha256: 'c'.repeat(64), expectedRevision: 0, operationId: '66666666-6666-4666-8666-666666666666' };
function fixture() {
    let current = true, held = false, failure = false, csrfHash = hash(csrf);
    const expiresAt = new Date(Date.now() + 60000);
    const record = () => current && !held ? { context, csrfTokenHash: csrfHash, expiresAt } : null;
    const repository = { readAuthentication: async (i: any) => {
            if (failure)
                throw new Error('SECRET_DB_DETAIL');
            return i.ordinaryTokenHash === base.tokenHash && i.staffTokenHash === hash(token) ? record() : null;
        }, readCurrentContext: async (i: any) => {
            if (failure)
                throw new Error('SECRET_DB_DETAIL');
            return i.ordinaryTokenHash === base.tokenHash && JSON.stringify(i.context) === JSON.stringify(context) ? record() : null;
        }, authorize: async (i: any) => current && !held && context.capabilities.includes(i.capability), readActionProof: async (i: any) => current && JSON.stringify(i.binding) === JSON.stringify(binding) && i.proofHandleHash === hash(token) ? { proofId: '77777777-7777-4777-8777-777777777777', context, binding, credentialId: 'owned-key', verifiedAt: new Date(), expiresAt } : null, readInvitationContext: async () => null, readOwnerPossessionContext: async () => null };
    const sessions = { assertCurrent: async (s: any) => {
            if (failure || held || s.tokenHash !== base.tokenHash)
                throw new Error('SESSION_REQUIRED');
        } };
    return { service: new access.StaffAccessService(repository as never, sessions as never), revoke: () => { current = false; }, hold: () => { held = true; }, outage: () => { failure = true; }, rotateCsrf: () => { csrfHash = hash(token); } };
}
afterEach(() => vi.useRealTimers());
describe('per-request staff authority', () => {
    it('exports the approved prepared guard before any privileged route is mounted', () => { expect(access).not.toBeNull(); });
    it('denies ordinary/TOTP/recovery tokens and noncanonical staff cookies', async () => {
        const f = fixture();
        for (const supplied of ['', '123456', 'recovery-code', 's'.repeat(43), token + '=', 'A'.repeat(42) + 'B'])
            expect(await f.service.authenticate(base, supplied, new Date())).toBeNull();
        expect(await f.service.authenticate({ ...base, tokenHash: hash('old') }, token, new Date())).toBeNull();
    });
    it('checks persistent authority, capability and ordinary generation every time', async () => { const f = fixture(), c = await f.service.authenticate(base, token, new Date()); expect(c).not.toBeNull(); await expect(f.service.requireCapability(c!, 'AUDIT_READ')).rejects.toThrow('STAFF_AUTHORITY_INVALID'); await expect(f.service.requireCapability({ ...c!, baseSession: { ...base, tokenHash: hash('old') } }, 'TEAM_READ')).rejects.toThrow('STAFF_AUTHORITY_INVALID'); await expect(f.service.requireCapability(c!, 'TEAM_READ')).resolves.toBeUndefined(); f.revoke(); await expect(f.service.assertCurrent(c!)).rejects.toThrow('STAFF_AUTHORITY_INVALID'); });
    it('reads only an exact stored proof and leaves consumption to SQL mutation', async () => {
        const f = fixture(), c = (await f.service.authenticate(base, token, new Date()))!;
        expect((await f.service.readActionProof(c, token, binding))?.binding).toEqual(binding);
        for (const changed of [{ ...binding, targetId: context.staffId }, { ...binding, bodySha256: 'd'.repeat(64) }, { ...binding, expectedRevision: 1 }, { ...binding, operationId: context.staffId }])
            expect(await f.service.readActionProof(c, token, changed)).toBeNull();
        expect(await f.service.readActionProof(c, token, binding)).not.toBeNull();
        f.hold();
        expect(await f.service.readActionProof(c, token, binding)).toBeNull();
    });
    it('fails closed with fixed errors on database outages and stale stored CSRF', async () => { const f = fixture(), c = (await f.service.authenticate(base, token, new Date()))!; expect(await f.service.verifyCsrf(c, csrf)).toBe(true); f.rotateCsrf(); expect(await f.service.verifyCsrf(c, csrf)).toBe(false); f.outage(); expect(await f.service.authenticate(base, token, new Date())).toBeNull(); await expect(f.service.assertCurrent(c)).rejects.toThrow(/^STAFF_AUTHORITY_INVALID$/); });
    it('aborts a stalled check within 1000ms without overlap or late callbacks', async () => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] }); let checks = 0, aborts = 0, release: () => void = () => { }; const dispose = access.monitorAuthority({ check: async () => { checks++; await new Promise<void>(r => { release = r; }); }, abort: () => { aborts++; } }); await vi.advanceTimersByTimeAsync(999); expect(aborts).toBe(0); await vi.advanceTimersByTimeAsync(1); expect(aborts).toBe(1); expect(checks).toBe(1); release(); await vi.advanceTimersByTimeAsync(1000); expect(aborts).toBe(1); dispose(); expect(vi.getTimerCount()).toBe(0); });
    it('uses notifications only to accelerate a persistent check and disposes subscriptions', async () => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] }); let notify: () => void = () => { }, checks = 0, aborts = 0, unsubscribed = 0; const dispose = access.monitorAuthority({ check: async () => { checks++; throw new Error('REVOKED'); }, abort: () => { aborts++; }, subscribe: f => { notify = f; return () => { unsubscribed++; }; } }); notify(); await vi.advanceTimersByTimeAsync(0); expect(checks).toBe(1); expect(aborts).toBe(1); dispose(); expect(unsubscribed).toBe(1); expect(vi.getTimerCount()).toBe(0); });
    it('checks immediately before stream emission and cleans a waiting iterator on peer close', async () => { const peer = new EventEmitter(); let returns = 0, closed = 0, writes = 0, checks = 0, started: () => void = () => { }; const waiting = new Promise<void>(r => { started = r; }); const stream = access.streamAuthorizedEvents({ events: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => { started(); return new Promise<IteratorResult<string>>(() => { }); }, return: async () => { returns++; return { done: true, value: undefined }; } }) }), check: async () => { checks++; }, write: () => { writes++; }, close: () => { closed++; }, peer }); await waiting; peer.emit('close'); await stream; expect(writes).toBe(0); expect(closed).toBe(1); expect(returns).toBe(1); expect(peer.listenerCount('close')).toBe(0); expect(checks).toBeGreaterThanOrEqual(1); });
    it('emits no event after a pre-emission revocation barrier', async () => {
        let checks = 0, writes = 0, closed = 0;
        await access.streamAuthorizedEvents({ events: () => ({ async *[Symbol.asyncIterator]() { yield 'private'; } }), check: async () => {
                if (++checks === 2)
                    throw new Error('HELD');
            }, write: () => { writes++; }, close: () => { closed++; }, peer: new EventEmitter() });
        expect(writes).toBe(0);
        expect(closed).toBe(1);
    });
});
it('cancels the actual finite PostgreSQL event producer after its pending snapshot, before projection or yielding', async () => {
    const { PostgresAskApplication } = await import('../../apps/api/src/index.js');
    let release: () => void = () => { }, started: () => void = () => { }, projections = 0;
    const waiting = new Promise<void>(r => { started = r; }), barrier = new Promise<void>(r => { release = r; });
    const pool = { query: async (sql: string) => {
            if (sql.includes('run_progress_event')) {
                started();
                await barrier;
                return { rows: [{ event_id: 'event:private', kind: 'run.accepted', at_seq: '1', value_json: { secret: 'private' }, content_ciphertext: null }] };
            }
            return { rows: [] };
        } };
    const realPool = { ...pool, connect: async () => ({ ...pool, release: () => { } }) };
    const app = new PostgresAskApplication(realPool as never, {} as never, {} as never, { read: async () => { projections++; return []; } }, {} as never, { server: {} as never, legacy: {} as never });
    const controller = new AbortController(), iterator = app.events('11111111-1111-4111-8111-111111111111', base.session, { ownerRef: base.ownerRef, legacyAskerId: null }, controller.signal)[Symbol.asyncIterator]();
    const pending = iterator.next();
    await waiting;
    const cancelled = expect(pending).rejects.toThrow('PRIVATE_STREAM_CLOSED');
    controller.abort();
    release();
    await cancelled;
    expect(projections).toBe(0);
});
it('aborts a cooperative waiting generator and completes its finally cleanup before private socket closure settles', async () => {
    const peer = new EventEmitter();
    let start: () => void = () => { }, cleaned = 0, closed = 0;
    const waiting = new Promise<void>(r => { start = r; });
    const stream = access.streamAuthorizedEvents({ events: signal => ({ async *[Symbol.asyncIterator]() {
                try {
                    await new Promise<void>(r => { signal.addEventListener('abort', () => r(), { once: true }); start(); });
                    if (!signal.aborted)
                        yield 'secret';
                }
                finally {
                    cleaned++;
                }
            } }), check: async () => { }, write: () => { throw new Error('PRIVATE_EVENT_ESCAPED'); }, close: () => { closed++; }, peer });
    await waiting;
    peer.emit('close');
    await stream;
    await Promise.resolve();
    expect(cleaned).toBe(1);
    expect(closed).toBe(1);
    expect(peer.listenerCount('close')).toBe(0);
});
it('keeps the 1000ms revocation bound when a previously successful check returns late', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    let checks = 0, aborts = 0;
    const dispose = access.monitorAuthority({ check: async () => {
            checks++;
            if (checks === 1)
                await new Promise<void>(r => setTimeout(r, 749));
            else
                await new Promise<void>(() => { });
        }, abort: () => { aborts++; } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(checks).toBe(2);
    await vi.advanceTimersByTimeAsync(249);
    expect(aborts).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(aborts).toBe(1);
    dispose();
    vi.useRealTimers();
});
it('does a new persistent read after a candidate arrives while an earlier positive polling read is pending', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    let releasePoll: () => void = () => { }, emitCandidate: () => void = () => { }, checks = 0, writes = 0, revoked = false;
    const candidate = new Promise<void>(r => { emitCandidate = r; }), peer = new EventEmitter();
    const stream = access.streamAuthorizedEvents({ events: () => ({ async *[Symbol.asyncIterator]() { await candidate; yield 'private'; } }), check: async () => {
            checks++;
            const wasRevoked = revoked;
            if (checks === 2)
                await new Promise<void>(r => { releasePoll = r; });
            if (wasRevoked)
                throw new Error('HELD');
        }, write: () => { writes++; }, close: () => { }, peer });
    await vi.advanceTimersByTimeAsync(250);
    expect(checks).toBe(2);
    emitCandidate();
    await vi.advanceTimersByTimeAsync(0);
    revoked = true;
    releasePoll();
    await vi.advanceTimersByTimeAsync(0);
    await stream;
    expect(writes).toBe(0);
    expect(checks).toBeGreaterThanOrEqual(3);
    vi.useRealTimers();
});
it('refuses whitespace-normalized staff cookie values', () => {
    const name = access.STAFF_COOKIE_NAME;
    for (const value of [' ' + token, token + ' ', token.slice(0, 20) + ' ' + token.slice(20)])
        expect(access.exactStaffCookie(name + '=' + value, name)).toBeNull();
});
it('keeps the browser staff cookie until absolute expiry while SQL owns the sliding idle lifetime', () => {
    const issuedAt = new Date('2026-10-03T00:00:00.000Z');
    const cookies = access.staffCookies({ staffToken: token, staffCsrfToken: csrf, expiresAt: new Date('2026-10-03T08:00:00.000Z') }, issuedAt);
    for (const cookie of cookies)
        expect(cookie).toContain('Max-Age=28800;');
    expect(() => access.staffCookies({ staffToken: token, staffCsrfToken: csrf, expiresAt: issuedAt }, issuedAt)).toThrow('STAFF_AUTHORITY_INVALID');
});
