import { describe, it, expect, vi, onTestFinished } from 'vitest';
import { RegistrationService, InProcessAuthRateLimiter, RESEND_PUBLIC_RESPONSE } from '../../apps/api/src/registration.js';
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows, type AuthPolicy } from '@debateai/register';
const base = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
function deferred<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture(waitMs = 150) {
    const policy = { ...base, verification: { ...base.verification, enumerationResponseFloorMs: 10 }, channel: { ...base.channel, maxConcurrentVerificationDispatches: 1, maxQueuedVerificationDispatches: 1, mailDispatchActivationSpacingMs: 1, mailDispatchMinimumReservationMs: 60, mailDispatchPreTransportWorkBudgetMs: 10, mailDispatchNoSendEqualWorkMs: 40, mailDispatchQueueWaitTimeoutMs: waitMs } } as unknown as AuthPolicy;
    const counters = { lookup: 0, token: 0 };
    const service = new RegistrationService({ repository: { findAuditIdentityByBlindIndex: async () => null, prepareVerificationResend: async () => { counters.lookup++; return { status: 'ignored' }; } } as never, mail: { sendVerification: async () => { } }, dekStore: { store: async () => { }, destroy: async () => 'ALREADY_ABSENT' }, blindIndexKey: Buffer.alloc(32, 4), policy, limiter: new InProcessAuthRateLimiter(policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs), argon2: {} as never, verificationTokenFactory: () => { counters.token++; return 'a'.repeat(43); } });
    return { service, counters };
}
const tick = () => new Promise<void>(r => setTimeout(r, 2));
function expectedCapacityDiagnostic() {
    const messages:string[]=[];const original=console.error.bind(console);
    const spy=vi.spyOn(console,'error').mockImplementation((...args:unknown[])=>{
        if(args.length===1 && typeof args[0]==='string' && /^\[AUTH_MAIL_CAPACITY_EXHAUSTED\] correlation=[0-9a-f-]{36} code=MAIL_DISPATCH_CAPACITY window=\d{4}-\d{2}-\d{2}T.*Z count=1$/.test(args[0]))messages.push(args[0]);
        else original(...args);
    });
    onTestFinished(()=>spy.mockRestore());
    return ()=>expect(messages).toHaveLength(1);
}
describe('shared bounded consumer recovery mail handoff', () => {
    it('uses the selected existing dispatcher values rather than a new pool or numeric quota', () => { expect(base.channel).toMatchObject({ maxConcurrentVerificationDispatches: 32, maxQueuedVerificationDispatches: 96, mailDispatchActivationSpacingMs: 60, mailDispatchQueueWaitTimeoutMs: 18000, mailDispatchMinimumReservationMs: 5700, mailDispatchPreTransportWorkBudgetMs: 600, mailDispatchNoSendEqualWorkMs: 5000 }); });
    it('returns before slow transport and retains the same minimum lease for an eligible and no-send branch', async () => {
        for (const eligible of [true, false]) {
            const { service } = fixture(), transport = deferred();
            let sent = 0;
            await service.dispatchRecoveryMail(async () => eligible ? async () => { sent++; await transport.promise; } : null);
            expect(service.mailDispatchOccupancy().inFlight).toBe(1);
            await tick();
            expect(sent).toBe(eligible ? 1 : 0);
            transport.resolve();
            await service.drainMailDispatches();
            expect(service.mailDispatchOccupancy().inFlight).toBe(0);
        }
    });
    it('shares capacity with actual resend work and refuses before recovery preparation when the common queue is full', async () => {
        const assertDiagnostic=expectedCapacityDiagnostic();
        const { service, counters } = fixture(), transport = deferred();
        await service.dispatchRecoveryMail(async () => async () => { await transport.promise; });
        const resend = service.resendVerification({ email: 'person@example.test' }, { ip: '192.0.2.1', userAgent: 'mixed', requestId: 'mixed' });
        await tick();
        expect(service.mailDispatchOccupancy().queued).toBe(1);
        expect(counters.lookup).toBe(0);
        expect(counters.token).toBe(0);
        let prepared = 0;
        await expect(service.dispatchRecoveryMail(async () => { prepared++; return null; })).rejects.toMatchObject({ code: 'AUTH_MAIL_BUSY' });
        expect(prepared).toBe(0);
        transport.resolve();
        expect(await resend).toEqual(RESEND_PUBLIC_RESPONSE);
        await service.drainMailDispatches();
        service.drainMailCapacitySignals();
        assertDiagnostic();
        expect(counters.lookup).toBe(1);
        expect(counters.token).toBe(1);
        expect(service.mailDispatchOccupancy()).toMatchObject({ inFlight: 0, queued: 0 });
    });
    it('times out an exact waiting ticket before token/lookup work and releases it once', async () => {
        const assertDiagnostic=expectedCapacityDiagnostic();
        const { service } = fixture(20), transport = deferred();
        await service.dispatchRecoveryMail(async () => async () => { await transport.promise; });
        let prepared = 0;
        await expect(service.dispatchRecoveryMail(async () => { prepared++; return null; })).rejects.toMatchObject({ code: 'AUTH_MAIL_BUSY' });
        expect(prepared).toBe(0);
        expect(service.mailDispatchOccupancy().queued).toBe(0);
        transport.resolve();
        await service.drainMailDispatches();
        service.drainMailCapacitySignals();
        assertDiagnostic();
        expect(service.mailDispatchOccupancy().inFlight).toBe(0);
    });
    it('shutdown joins an admitted late preparation and its eventual transport and refuses new work', async () => {
        const { service } = fixture(), prepared = deferred<(() => Promise<void>) | null>(), entered = deferred(), transport = deferred();
        const response = service.dispatchRecoveryMail(async () => { entered.resolve(); return prepared.promise; });
        await entered.promise;
        await service.drainRegistrationAdmissions();
        let drained = false;
        const drain = service.drainMailDispatches().then(() => { drained = true; });
        await tick();
        expect(drained).toBe(false);
        let late = 0;
        await expect(service.dispatchRecoveryMail(async () => { late++; return null; })).rejects.toMatchObject({ code: 'AUTH_MAIL_BUSY' });
        expect(late).toBe(0);
        prepared.resolve(async () => { await transport.promise; });
        await response;
        await tick();
        expect(drained).toBe(false);
        transport.resolve();
        await drain;
        expect(service.mailDispatchOccupancy().inFlight).toBe(0);
    });
    it('releases failed preparation and transport ownership without retry or secret-bearing diagnostics', async () => {
        const { service } = fixture(), original=console.error.bind(console), errors = vi.spyOn(console, 'error').mockImplementation((...args:unknown[]) => { if(args.length!==1 || args[0]!=="[AUTH_CONSUMER_RECOVERY_DISPATCH_FAILED]")original(...args); });
        try {
            await expect(service.dispatchRecoveryMail(async () => { throw new Error('PREPARATION_FAILED'); })).rejects.toThrow('PREPARATION_FAILED');
            await service.drainMailDispatches();
            let sends = 0;
            await service.dispatchRecoveryMail(async () => async () => { sends++; throw new Error('private-token-value'); });
            await service.drainMailDispatches();
            expect(sends).toBe(1);
            expect(JSON.stringify(errors.mock.calls)).not.toContain('private-token-value');
            expect(errors.mock.calls).toEqual([["[AUTH_CONSUMER_RECOVERY_DISPATCH_FAILED]"]]);
            expect(service.mailDispatchOccupancy().inFlight).toBe(0);
        }
        finally {
            errors.mockRestore();
        }
    });
});
