import { createHash, timingSafeEqual } from 'node:crypto';
import type { ActionBinding, InvitationContext, OwnerPossessionContext, StaffCapability, StaffContext, StaffProof } from '@debateai/kernel';
import type { StaffRepository } from '@debateai/db';
import type { AuthenticatedSession, SessionApplication } from '../sessions.js';
/** Internal only: never serialize this wrapper or its CSRF digest. Task2/3 use .context. */
export type StaffAuthentication = Readonly<{
    context: StaffContext;
    baseSession: AuthenticatedSession;
    csrfTokenHash: string;
    expiresAt: Date;
}>;
export interface StaffAccessApplication {
    authenticate(baseSession: AuthenticatedSession, staffToken: string, now?: Date): Promise<StaffAuthentication | null>;
    readInvitationContext(baseSession: AuthenticatedSession, invitationToken: string): Promise<InvitationContext | null>;
    readOwnerPossessionContext(baseSession: AuthenticatedSession, commandId: string, nonce: string, selectedCredentialId: string, prerequisiteHandle: string): Promise<OwnerPossessionContext | null>;
    requireCapability(auth: StaffAuthentication, capability: StaffCapability, binding?: ActionBinding): Promise<void>;
    readActionProof(auth: StaffAuthentication, proofHandle: string, binding: ActionBinding): Promise<StaffProof | null>;
    verifyCsrf(auth: StaffAuthentication, token: string): Promise<boolean>;
    registerPrivilegedConnection(auth: StaffAuthentication, abort: () => void): () => void;
    assertCurrent(auth: StaffAuthentication, signal?: AbortSignal): Promise<void>;
}
const denied = () => new Error('STAFF_AUTHORITY_INVALID');
const hashPattern = /^sha256:[0-9a-f]{64}$/;
/** Same canonical unpadded 32-byte token and SHA256(string) convention as Task3. */
export function staffTokenHash(value: unknown): string | null {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value))
        return null;
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.byteLength !== 32 || bytes.toString('base64url') !== value)
        return null;
    return 'sha256:' + createHash('sha256').update(value).digest('hex');
}
function same(left: string, right: string): boolean {
    const a = Buffer.from(left), b = Buffer.from(right);
    return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}
type GuardRepository = Pick<StaffRepository, 'readAuthentication' | 'readCurrentContext' | 'readActionProof' | 'authorize' | 'readInvitationContext' | 'readOwnerPossessionContext' | 'subscribeRevocations'>;
export class StaffAccessService implements StaffAccessApplication {
    constructor(private readonly repository: GuardRepository, private readonly sessions: Pick<SessionApplication, 'assertCurrent'>) { }
    private async base(base: AuthenticatedSession, signal?: AbortSignal): Promise<void> {
        if (base?.authKind !== 'cookie' || base.session?.caller_scope !== 'ASKER' || !hashPattern.test(base.tokenHash)
            || this.sessions.assertCurrent === undefined)
            throw denied();
        await this.sessions.assertCurrent(base, signal);
    }
    private validRecord(record: Awaited<ReturnType<GuardRepository['readCurrentContext']>>, base: AuthenticatedSession): boolean {
        return record !== null && record.context?.userId === base.userId && record.context?.ordinarySessionId === base.session.session_id
            && Array.isArray(record.context.capabilities) && hashPattern.test(record.csrfTokenHash)
            && record.expiresAt instanceof Date && Number.isFinite(record.expiresAt.getTime());
    }
    async authenticate(baseSession: AuthenticatedSession, staffToken: string, _now?: Date): Promise<StaffAuthentication | null> {
        try {
            const staffHash = staffTokenHash(staffToken);
            if (staffHash === null)
                return null;
            await this.base(baseSession);
            const record = await this.repository.readAuthentication({ userId: baseSession.userId, ordinarySessionId: baseSession.session.session_id, ordinaryTokenHash: baseSession.tokenHash, staffTokenHash: staffHash });
            if (!this.validRecord(record, baseSession) || record === null)
                return null;
            return Object.freeze({ ...record, baseSession });
        }
        catch {
            return null;
        }
    }
    private async current(auth: StaffAuthentication, signal?: AbortSignal) {
        await this.base(auth.baseSession, signal);
        if (auth.context?.userId !== auth.baseSession.userId || auth.context?.ordinarySessionId !== auth.baseSession.session.session_id)
            throw denied();
        const record = await this.repository.readCurrentContext({ context: auth.context, ordinaryTokenHash: auth.baseSession.tokenHash }, signal);
        if (!this.validRecord(record, auth.baseSession) || record === null)
            throw denied();
        return record;
    }
    async assertCurrent(auth: StaffAuthentication, signal?: AbortSignal): Promise<void> {
        try {
            await this.current(auth, signal);
        }
        catch {
            throw denied();
        }
    }
    async requireCapability(auth: StaffAuthentication, capability: StaffCapability, binding?: ActionBinding): Promise<void> {
        try {
            await this.current(auth);
            if (!await this.repository.authorize({ context: auth.context, capability }))
                throw denied();
            // This optional binding describes server business input, never a consumed proof.
            if (binding !== undefined && (!/^[0-9a-f]{64}$/.test(binding.bodySha256) || !Number.isSafeInteger(binding.expectedRevision) || binding.expectedRevision < 0))
                throw denied();
        }
        catch {
            throw denied();
        }
    }
    async readActionProof(auth: StaffAuthentication, proofHandle: string, binding: ActionBinding): Promise<StaffProof | null> {
        try {
            const handle = staffTokenHash(proofHandle);
            if (handle === null)
                return null;
            await this.current(auth);
            return await this.repository.readActionProof({ context: auth.context, ordinaryTokenHash: auth.baseSession.tokenHash, proofHandleHash: handle, binding });
        }
        catch {
            return null;
        }
    }
    async verifyCsrf(auth: StaffAuthentication, token: string): Promise<boolean> {
        try {
            const supplied = staffTokenHash(token);
            return supplied !== null && same((await this.current(auth)).csrfTokenHash, supplied);
        }
        catch {
            return false;
        }
    }
    async readInvitationContext(baseSession: AuthenticatedSession, invitationToken: string): Promise<InvitationContext | null> {
        try {
            const token = staffTokenHash(invitationToken);
            if (token === null)
                return null;
            await this.base(baseSession);
            return await this.repository.readInvitationContext({ targetUserId: baseSession.userId, ordinarySessionId: baseSession.session.session_id, invitationTokenHash: token });
        }
        catch {
            return null;
        }
    }
    async readOwnerPossessionContext(baseSession: AuthenticatedSession, commandId: string, nonce: string, selectedCredentialId: string, prerequisiteHandle: string): Promise<OwnerPossessionContext | null> {
        try {
            const nonceHash = staffTokenHash(nonce), prerequisiteHandleHash = staffTokenHash(prerequisiteHandle);
            if (nonceHash === null || prerequisiteHandleHash === null || !/^[0-9a-f-]{36}$/i.test(commandId) || !/^[A-Za-z0-9_-]{1,1024}$/.test(selectedCredentialId))
                return null;
            await this.base(baseSession);
            return await this.repository.readOwnerPossessionContext({ userId: baseSession.userId, ordinarySessionId: baseSession.session.session_id, commandId, nonceHash, credentialId: selectedCredentialId, prerequisiteHandleHash });
        }
        catch {
            return null;
        }
    }
    registerPrivilegedConnection(auth: StaffAuthentication, abort: () => void): () => void {
        return monitorAuthority({ check: signal => this.assertCurrent(auth, signal), abort,
            ...(this.repository.subscribeRevocations === undefined ? {} : { subscribe: listener => this.repository.subscribeRevocations!(listener) }) });
    }
}
/** Prepared Task7 policy. No production Admin route is mounted in Task4. */
export function staffRoutePolicy(capability: Exclude<StaffCapability, 'ALLOWANCE_WRITE'>) {
    return { config: { auth: 'staff' as const, staffCapability: capability } };
}
export const STAFF_COOKIE_NAME = '__Host-debateai-staff' as const;
export const STAFF_CSRF_COOKIE_NAME = '__Host-debateai-staff-csrf' as const;
export const STAFF_CSRF_HEADER = 'x-staff-csrf-token' as const;
function cookie(value: string, name: string, httpOnly: boolean, maxAge: number): string {
    return `${name}=${value}; Path=/; Max-Age=${maxAge};${httpOnly ? ' HttpOnly;' : ''} Secure; SameSite=Strict`;
}
/** Trusted Task3 elevation transport only; the returned strings belong solely in Set-Cookie. */
export function staffCookies(issued: Readonly<{
    staffToken: string;
    staffCsrfToken: string;
    expiresAt: Date;
}>, now = new Date()): readonly string[] {
    if (staffTokenHash(issued.staffToken) === null || staffTokenHash(issued.staffCsrfToken) === null || !Number.isFinite(issued.expiresAt.getTime()))
        throw denied();
    // Browser expiry follows absolute expiry; SQL independently enforces and slides15-minute idle.
    const age = Math.min(28800, Math.floor((issued.expiresAt.getTime() - now.getTime()) / 1000));
    if (age <= 0)
        throw denied();
    return Object.freeze([cookie(issued.staffToken, STAFF_COOKIE_NAME, true, age), cookie(issued.staffCsrfToken, STAFF_CSRF_COOKIE_NAME, false, age)]);
}
export function clearStaffCookies(): readonly string[] {
    return Object.freeze([cookie('', STAFF_COOKIE_NAME, true, 0), cookie('', STAFF_CSRF_COOKIE_NAME, false, 0)]);
}
export function exactStaffCookie(raw: unknown, name: string): string | null {
    if (typeof raw !== 'string' || /[\r\n\0]/.test(raw))
        return null;
    const values = raw.split(';').filter(member => member.slice(0, member.indexOf('=')).trim() === name)
        .map(member => member.slice(member.indexOf('=') + 1));
    return values.length === 1 && staffTokenHash(values[0]) !== null ? values[0]! : null;
}
export function exactStaffCsrfPair(header: unknown, csrfCookie: string | null): string | null {
    return typeof header === 'string' && csrfCookie !== null && staffTokenHash(header) !== null && same(header, csrfCookie) ? header : null;
}
/** 250ms poll + 750ms local deadline seals the 1000ms revocation bound.
 * Notifications schedule a persistent check only; no successful result is cached. */
export function monitorAuthority(input: Readonly<{
    check: (signal: AbortSignal) => Promise<void>;
    abort: () => void;
    subscribe?: (listener: () => void) => () => void;
}>): () => void {
    let stopped = false, busy = false, timer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
    let unsubscribe: (() => void) | undefined;
    let previousCheckDeadline: number | undefined;
    const dispose = () => {
        if (stopped)
            return;
        stopped = true;
        clearTimeout(timer);
        clearTimeout(deadline);
        controller?.abort();
        unsubscribe?.();
    };
    const fail = () => {
        if (stopped)
            return;
        dispose();
        input.abort();
    };
    const schedule = (delay: number) => {
        if (stopped || busy)
            return;
        clearTimeout(timer);
        timer = setTimeout(check, delay);
    };
    const check = () => {
        if (stopped || busy)
            return;
        const started = performance.now();
        const budget = previousCheckDeadline === undefined ? 750 : Math.min(750, previousCheckDeadline - started);
        if (budget <= 0) {
            fail();
            return;
        }
        busy = true;
        controller = new AbortController();
        deadline = setTimeout(fail, budget);
        void Promise.resolve().then(() => input.check(controller!.signal)).then(() => {
            if (stopped)
                return;
            clearTimeout(deadline);
            busy = false;
            // Bound staleness from invocation, not receipt of a potentially late success.
            previousCheckDeadline = started + 1000;
            schedule(Math.max(0, 250 - (performance.now() - started)));
        }, fail);
    };
    unsubscribe = input.subscribe?.(() => schedule(0));
    schedule(250);
    return dispose;
}
interface StreamPeer {
    once(event: 'close', listener: () => void): unknown;
    off(event: 'close', listener: () => void): unknown;
}
/** Owns iterator, check, timer and peer cleanup even if next() is still awaiting data. */
export async function streamAuthorizedEvents<T>(input: Readonly<{
    events: (signal: AbortSignal) => AsyncIterable<T>;
    check: (signal: AbortSignal) => Promise<void>;
    write: (event: T) => void;
    close: () => void;
    peer: StreamPeer;
}>): Promise<void> {
    const controller = new AbortController();
    let iterator: AsyncIterator<T> | undefined, pending: Promise<void> | undefined;
    let stopMonitor: (() => void) | undefined;
    let wake: () => void = () => { };
    const aborted = new Promise<never>((_resolve, reject) => { wake = () => reject(denied()); });
    const stop = () => {
        if (!controller.signal.aborted) {
            controller.abort();
            wake();
        }
    };
    // Mark the cancellation promise handled before peer/monitor callbacks can run.
    void aborted.catch(() => undefined);
    input.peer.once('close', stop);
    const check = () => {
        if (pending === undefined) {
            pending = input.check(controller.signal).finally(() => { pending = undefined; });
        }
        return Promise.race([pending, aborted]);
    };
    stopMonitor = monitorAuthority({ check: async () => { await check(); }, abort: stop });
    try {
        await check();
        if (controller.signal.aborted)
            return;
        iterator = input.events(controller.signal)[Symbol.asyncIterator]();
        while (!controller.signal.aborted) {
            const event = await Promise.race([iterator.next(), aborted]);
            if (event.done)
                break;
            // Wait for any older polling work, then start a fresh persistent check for this candidate.
            if (pending !== undefined)
                await Promise.race([pending, aborted]);
            await check();
            if (controller.signal.aborted)
                break;
            input.write(event.value);
        }
    }
    catch { /* A raw private stream ends without emitting an exception/terminal payload. */ }
    finally {
        stopMonitor();
        controller.abort();
        input.peer.off('close', stop);
        // Generators receive the abort signal. A hostile iterator cannot keep socket/timer cleanup waiting.
        if (iterator?.return !== undefined)
            void Promise.resolve(iterator.return()).catch(() => undefined);
        input.close();
    }
}
