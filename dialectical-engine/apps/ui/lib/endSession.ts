import type { ContractClient } from '@debateai/contract';
import { clearPhoneCompletionDraft } from './phoneCompletionDraft';
import { clearStoredSupportConversation } from '../components/support/conversation';
export type EndSessionClient = Pick<ContractClient, 'logout'> & Partial<Pick<ContractClient, 'revokeAllSessions'>>;
const flights = new WeakMap<object, Partial<Record<'logout' | 'all', Promise<void>>>>();
/** Called only after the server has ended the current session. Rotation uses the same legacy event without this detail. */
export function finishSessionCleanup(redirectTo: string | null = '/login'): void {
    clearStoredSupportConversation();
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
        } else await client.logout();
        finishSessionCleanup(redirectTo);
    })();
    pending[mode] = operation;
    flights.set(client, pending);
    void operation.finally(() => { if (pending[mode] === operation) delete pending[mode]; if (Object.keys(pending).length === 0) flights.delete(client); }).catch(() => {});
    return operation;
}
