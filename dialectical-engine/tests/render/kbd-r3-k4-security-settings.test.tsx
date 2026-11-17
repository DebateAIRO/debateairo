// @vitest-environment jsdom
// Keyboard audit round 3 (2026-11-12), K4 / CSS-12: the Security page's `dismiss()` + `returnFocus` effect (the pattern
// PR #204 item 11 copied to the other settings cards) had no test of its own. Closing a confirm card gives focus back to
// the button that opened it; a card nothing on the page opened (a resumed check) gives it to the page title. The site's
// focus guard is NOT started here, so what is pinned is the page's own rule, not the guard's fallback.
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import settings from '../../apps/ui/messages/en/settings.json';
import auth from '../../apps/ui/messages/en/auth.json';
import publicCatalog from '../../apps/ui/messages/en/public.json';
import { SecuritySettings } from '../../apps/ui/components/SecuritySettings.js';

vi.mock('@/lib/consumerWebAuthn', () => ({ createConsumerWebAuthnBrowser: () => ({ register: vi.fn(), authenticate: vi.fn(), cancel: vi.fn(), supportsConditional: async () => false }) }));

const factor = '11111111-1111-4111-8111-111111111111';
const proof = (action: string, target: Record<string, string> = {}) => ({ status: 'step_up_complete', csrf_token: 'c'.repeat(43), step_up_grant: { token: 'g'.repeat(43), action, ...target, expires_at: new Date(Date.now() + 300000).toISOString() } });
const client = () => ({
    authMethods: vi.fn().mockResolvedValue({ methods: [{ factor_id: factor, type: 'passkey', label: 'My key', created_at: '2026-10-01T10:00:00Z', last_used_at: null, removable: true }], recovery_codes_remaining: 10, available_step_up_methods: ['passkey'], step_up_providers: [] }),
    phoneProfile: vi.fn().mockResolvedValue({ phone_present: true, phone_masked: '+40 ••• 678', phone_verified: false, updated_at: null }),
    recoveryEmail: vi.fn().mockResolvedValue({ state: 'verified', email: 'backup@example.com', pending: null }),
    authProviders: vi.fn().mockResolvedValue({ providers: [] }),
    linkedSocialProviders: vi.fn().mockResolvedValue({ providers: [] }),
    removeAuthMethod: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue({ sessions: [] }),
    logout: vi.fn(), revokeAllSessions: vi.fn(), revokeSession: vi.fn(),
    pendingMfaRecovery: vi.fn().mockResolvedValue({ pending: null }),
    cancelPendingMfaRecovery: vi.fn().mockResolvedValue({ status: 'cancelled' })
});

let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById('root')!); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); document.body.replaceChildren(); });

async function settle() { await act(async () => { for (let turn = 0; turn < 8; turn += 1) await Promise.resolve(); }); }
async function mount(resume?: unknown) {
    await act(async () => root.render(<StrictMode><SecuritySettings client={client() as never} catalog={settings} authCatalog={auth} publicCatalog={publicCatalog} locale="en" resume={resume as never}/></StrictMode>));
    await settle();
}
const byText = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label)!;
const card = () => document.querySelector<HTMLElement>('section.setCard');
const cardCancel = () => [...(card()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(button => button.textContent === auth['auth.security.cancel'])!;
/** A keyboard press: the control has focus, Enter goes down on it, and it is activated. */
async function press(control: HTMLElement) {
    await act(async () => { control.focus(); control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); control.click(); });
    await settle();
}

describe('SecuritySettings dismiss(): Cancel on a confirm card returns focus to its opener', () => {
    it.each([
        ['Create a passkey', auth['auth.passkey.create']],
        ['Use an authenticator app instead', auth['auth.enroll.useAuthenticator']],
        ['Generate new recovery codes', settings['settings.security.regenerate']],
        ['Change email (the backup address)', settings['settings.email.change']]
    ])('%s: the card takes focus on its heading, and Cancel gives it back to the button', async (_name, label) => {
        await mount();
        const opener = byText(label);
        expect(opener, label).toBeDefined();
        await press(opener);
        expect(card()).not.toBeNull();
        expect(document.activeElement).toBe(card()!.querySelector('h2.setCardTitle'));
        await press(cardCancel());
        expect(card()).toBeNull();
        expect(document.activeElement).toBe(opener);
    });

    it("the backup address's Remove (a named button in the same list) gets focus back too", async () => {
        await mount();
        const remove = document.querySelector<HTMLButtonElement>(`button[aria-label="${settings['settings.security.removeNamed'].replace('{method}', 'backup@example.com')}"]`)!;
        expect(remove).not.toBeNull();
        await press(remove);
        expect(card()).not.toBeNull();
        await press(cardCancel());
        expect(document.activeElement).toBe(remove);
    });

    it('a resumed card, which no button on this page opened, gives focus to the page title on Cancel', async () => {
        await mount({ authorization: { action: 'REMOVE_AUTH_METHOD', target_factor_id: factor }, initialProof: proof('REMOVE_AUTH_METHOD', { target_factor_id: factor }) });
        expect(document.querySelector('[data-resumed-confirm]')).not.toBeNull();
        await press(cardCancel());
        expect(card()).toBeNull();
        expect(document.activeElement).toBe(document.querySelector('h1.setTitle'));
    });
});
