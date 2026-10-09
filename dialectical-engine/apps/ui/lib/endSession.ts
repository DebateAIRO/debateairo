import { ContractHttpError, type ContractClient } from '@debateai/contract';
import { clearPhoneCompletionDraft } from './phoneCompletionDraft';
import { announceSessionChange } from '../components/support/sessionChange';
import { clearStoredSupportConversation } from '../components/support/conversation';
export type EndSessionClient = Pick<ContractClient, 'logout'> & Partial<Pick<ContractClient, 'revokeAllSessions'>>;
/**
 * The server answers a logout whose session it no longer has (expired, or revoked from another device)
 * with 401 SESSION_REQUIRED, 409 COOKIE_SESSION_REQUIRED or 404: the person is already signed out, so the
 * tab must say so instead of keeping the account menu (auth UI repair, 2026-10-09).
 */
function sessionAlreadyEnded(failure: unknown): boolean {
    return failure instanceof ContractHttpError
        && (failure.status === 401 || failure.status === 404 || (failure.status === 409 && failure.serverCode === 'COOKIE_SESSION_REQUIRED'));
}
const flights = new WeakMap<object, Partial<Record<'logout' | 'all', Promise<void>>>>();
/** Called only after the server has ended the current session. Rotation uses the same legacy event without this detail. */
export function finishSessionCleanup(redirectTo: string | null = '/login'): void {
    clearStoredSupportConversation();
    announceSessionChange();
    clearPhoneCompletionDraft();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('debateai:staff-session-ended', { detail: { ended: true } }));
        if (redirectTo !== null) window.location.assign(redirectTo);
    }
}
/** One server operation; failure leaves the tab's account state and transcript intact. */
export function endSession(client: EndSessionClient, { all = false, redirectTo = '/login' }: { all?: boolean; redirectTo?: string | null } = {}): Promise<void> {
    const mode = all ? 'all' : 'logout';
    const pending = flights.get(client) ?? {};
    const active = pending[mode];
    if (active) return active;
    const operation = (async () => {
        if (all) {
            if (!client.revokeAllSessions) throw new Error('SESSION_OPERATION_UNAVAILABLE');
            await client.revokeAllSessions();
            finishSessionCleanup(redirectTo);
            return;
        }
        try {
            await client.logout();
            finishSessionCleanup(redirectTo);
        }
        catch (failure) {
            if (!sessionAlreadyEnded(failure)) throw failure;
            finishSessionCleanup(redirectTo);
        }
    })();
    pending[mode] = operation;
    flights.set(client, pending);
    void operation.finally(() => { if (pending[mode] === operation) delete pending[mode]; if (Object.keys(pending).length === 0) flights.delete(client); }).catch(() => {});
    return operation;
}
