// @vitest-environment jsdom
// Keyboard audit round 4 (2026-11-12), D1: a security check whose time limit runs out must not take focus from where the
// person has gone since. On expiry, focus moves to the message only when it was inside the card or step that went away,
// or when nothing holds focus (`focusIsLost()`); otherwise it stays, and the alert already on the page says why.
// Three places: SecuritySettings' grant expiry, LockoutPrompt's passkey proof expiry, SecurityEnrollment's own limit.
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import settings from '../../apps/ui/messages/en/settings.json';
import auth from '../../apps/ui/messages/en/auth.json';
import publicCatalog from '../../apps/ui/messages/en/public.json';
const browser = vi.hoisted(() => ({ register: vi.fn(), authenticate: vi.fn(), cancel: vi.fn(), supportsConditional: async () => false }));
vi.mock('@/lib/consumerWebAuthn', () => ({ createConsumerWebAuthnBrowser: () => browser }));
import { SecuritySettings } from '../../apps/ui/components/SecuritySettings.js';
import { LockoutPrompt } from '../../apps/ui/components/auth/LockoutPrompt.js';
import { SecurityEnrollment } from '../../apps/ui/components/auth/SecurityEnrollment.js';

const factor = '11111111-1111-4111-8111-111111111111';
const LIMIT = 60_000;
const soon = () => new Date(Date.now() + LIMIT).toISOString();
const proof = (action: string, target: Record<string, string> = {}) => ({ status: 'step_up_complete', csrf_token: 'c'.repeat(43), step_up_grant: { token: 'g'.repeat(43), action, ...target, expires_at: soon() } });
const settingsClient = () => ({
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
let outside: HTMLButtonElement;
beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    document.body.innerHTML = '<div id="root"></div><button type="button" id="outside">Elsewhere</button>';
    outside = document.getElementById('outside') as HTMLButtonElement;
    root = createRoot(document.getElementById('root')!);
    browser.register.mockReset().mockResolvedValue({});
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

async function settle() { await act(async () => { for (let turn = 0; turn < 8; turn += 1) await Promise.resolve(); }); }
async function runOut() { await act(async () => { vi.advanceTimersByTime(LIMIT + 10); }); await settle(); }
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent?.trim() === text);

describe('SecuritySettings: the grant behind a resumed confirm card runs out', () => {
    async function mountResumed() {
        await act(async () => root.render(<StrictMode><SecuritySettings client={settingsClient() as never} catalog={settings} authCatalog={auth} publicCatalog={publicCatalog} locale="en"
            resume={{ authorization: { action: 'REMOVE_AUTH_METHOD', target_factor_id: factor }, initialProof: proof('REMOVE_AUTH_METHOD', { target_factor_id: factor }) } as never}/></StrictMode>));
        await settle();
        expect(document.querySelector('[data-resumed-confirm]')).not.toBeNull();
    }
    const errorLine = () => document.querySelector<HTMLElement>('p[role=alert].setError');

    it("focus on the backup address's Change button stays there; the alert still says it", async () => {
        await mountResumed();
        const change = button(settings['settings.email.change'])!;
        await act(async () => change.focus());
        await runOut();
        expect(document.querySelector('section.setCard')).toBeNull();
        expect(errorLine()?.textContent).toBe(auth['auth.security.expired']);
        expect(document.activeElement).toBe(change);
    });

    it('focus on a control outside the page body (a box the person is typing in) stays there', async () => {
        await mountResumed();
        await act(async () => outside.focus());
        await runOut();
        expect(errorLine()?.textContent).toBe(auth['auth.security.expired']);
        expect(document.activeElement).toBe(outside);
    });

    it('focus inside the card that went away moves to the message', async () => {
        await mountResumed();
        const confirm = document.querySelector<HTMLButtonElement>('[data-resumed-confirm]')!;
        await act(async () => confirm.focus());
        await runOut();
        expect(document.activeElement).toBe(errorLine());
    });

    it('nothing focused: focus moves to the message', async () => {
        await mountResumed();
        await act(async () => (document.activeElement as HTMLElement | null)?.blur());
        expect(document.activeElement).toBe(document.body);
        await runOut();
        expect(document.activeElement).toBe(errorLine());
    });
});

describe('LockoutPrompt: the fresh proof for "Add a passkey" runs out', () => {
    const lockoutClient = () => ({
        authMethods: vi.fn().mockResolvedValue({ methods: [{ factor_id: factor, type: 'totp', label: null, created_at: '2026-10-01T10:00:00Z', last_used_at: null, removable: false }], recovery_codes_remaining: 0, available_step_up_methods: ['password_totp'], step_up_providers: [] }),
        stepUp: vi.fn(async (_password: string, _code: string, authorization: { action: string }) => proof(authorization.action)),
        regenerateRecoveryCodes: vi.fn(),
        beginPasskeyEnrollment: vi.fn().mockResolvedValue({ challenge_handle: 'p'.repeat(43), options: {} }),
        completePasskeyEnrollment: vi.fn().mockResolvedValue({ status: 'enrolled' }),
        beginTotpEnrollment: vi.fn()
    });
    async function input(selector: string, value: string) { await act(async () => { const field = document.querySelector<HTMLInputElement>(selector)!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); }); }
    async function toPasskeySetUp() {
        await act(async () => root.render(<LockoutPrompt catalog={auth} client={lockoutClient() as never} onDone={vi.fn()}/>));
        await settle();
        await act(async () => button('Add a passkey')!.click());
        await act(async () => button('Password · 6-digit authentication code')!.click());
        await input('input[type=password]', 'long password');
        await input('input[autocomplete=one-time-code]', '123456');
        await settle();
        expect(button('Create a passkey')).toBeDefined();
    }
    const heading = () => document.querySelector<HTMLHeadingElement>('.authLockout h2')!;

    it('focus outside the card stays there; the card says why', async () => {
        await toPasskeySetUp();
        await act(async () => outside.focus());
        await runOut();
        expect(button('Create a passkey')).toBeUndefined();
        expect(document.querySelector('.authLockout [role=alert]')?.textContent).toBe(auth['auth.lockout.expired']);
        expect(document.activeElement).toBe(outside);
    });

    it('focus on the step that went away (Back) moves to the heading', async () => {
        await toPasskeySetUp();
        await act(async () => button('Back')!.focus());
        await runOut();
        expect(document.activeElement).toBe(heading());
    });

    it('nothing focused: focus moves to the heading', async () => {
        await toPasskeySetUp();
        await act(async () => (document.activeElement as HTMLElement | null)?.blur());
        await runOut();
        expect(document.activeElement).toBe(heading());
    });
});

describe("SecurityEnrollment: the set-up's own limit runs out", () => {
    const enrollClient = () => ({ beginPasskeyEnrollment: vi.fn(), completePasskeyEnrollment: vi.fn(), beginTotpEnrollment: vi.fn(), completeTotpEnrollment: vi.fn(), beginRecoveryEnrollment: vi.fn(), completeRecoveryEnrollment: vi.fn() });
    async function mountRecovery() {
        await act(async () => root.render(<SecurityEnrollment catalog={auth} client={enrollClient() as never} browser={browser as never}
            authority={{ kind: 'recovery', token: 'r'.repeat(43), expiresAt: soon(), availableMethods: ['passkey', 'totp'] }}/>));
        await settle();
    }
    const message = () => document.querySelector<HTMLElement>('.authEnrollment > p[role=alert]')!;

    it('focus outside the set-up stays there; the alert says it', async () => {
        await mountRecovery();
        await act(async () => outside.focus());
        await runOut();
        expect(message().textContent).toBe(auth['auth.enroll.timedOut']);
        expect(document.activeElement).toBe(outside);
    });

    it('focus inside the set-up moves to the message', async () => {
        await mountRecovery();
        await act(async () => button('Create a passkey')!.focus());
        await runOut();
        expect(document.activeElement).toBe(message());
    });

    it('nothing focused: focus moves to the message', async () => {
        await mountRecovery();
        await runOut();
        expect(document.activeElement).toBe(message());
    });
});
