// @vitest-environment jsdom
// Owner ruling 2026-10-09: the "don't get locked out" card meets a person on their first arrival
// after MFA set-up, before they are sent on; with codes or a passkey they are sent on at once.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ assign: vi.fn(), authMethods: vi.fn() }));
vi.mock('@/lib/i18n/I18nProvider', () => ({ useChromeI18n: () => ({ locale: 'en', catalog: {} }) }));
vi.mock('@/lib/mfaEnrollment', () => ({ takeFragmentToken: () => 't'.repeat(43), verifyMfaEmail: async () => undefined, MfaEnrollmentHttpError: class extends Error {} }));
vi.mock('@/components/auth/OnboardingEvidence', () => ({ OnboardingEvidence: ({ onReady }: { onReady: () => void }) => <button type="button" onClick={onReady}>evidence-ready</button> }));
vi.mock('@/components/auth/SecurityEnrollment', () => ({ SecurityEnrollment: ({ onAuthenticated }: { onAuthenticated: (r: unknown) => void }) => <button type="button" onClick={() => onAuthenticated({ status: 'authenticated' })}>enrolled</button> }));
vi.mock('@/lib/api', async (original) => ({ ...await original<typeof import('../../apps/ui/lib/api')>(), contractClient: { authMethods: state.authMethods } }));
// Social sign-up: the form's own checks, region, date of birth and bot check are other tests' business.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/authFormValidation', () => ({ validateSignup: () => ({}) }));
vi.mock('@debateai/kernel', async (original) => ({ ...await original<typeof import('@debateai/kernel')>(), declaredRegionFromPick: () => ({ country: 'RO' }), dobToIso: () => '1990-01-01' }));
vi.mock('@/components/auth/TurnstileChallenge', async () => { const { useEffect } = await import('react'); return { TurnstileChallenge: ({ onToken }: { onToken: (token: string) => void }) => { useEffect(() => onToken('proof'), []); return null; } }; });
import EnrollMfaPage from '../../apps/ui/app/enroll-mfa/page';
import { SocialCompleteFlow } from '../../apps/ui/components/auth/SocialCompleteFlow';

const TITLE = "Don't get locked out";
const totp = (codes: number) => ({ methods: [{ factor_id: '11111111-1111-4111-8111-111111111111', type: 'totp', label: null, created_at: '2026-10-01T10:00:00Z', last_used_at: null, removable: false }], recovery_codes_remaining: codes, available_step_up_methods: ['password_totp'], step_up_providers: [] });
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById('root')!);
  state.assign.mockReset(); state.authMethods.mockReset();
  const native = window;
  const location = { get href() { return native.location.href; }, get origin() { return native.location.origin; }, get pathname() { return native.location.pathname; }, get search() { return native.location.search; }, get hash() { return native.location.hash; }, assign: state.assign };
  vi.stubGlobal('window', new Proxy(native, { get(target, key) { if (key === 'location') return location; const value = Reflect.get(target, key, target); return typeof value === 'function' && ['addEventListener', 'removeEventListener', 'dispatchEvent', 'getComputedStyle', 'setTimeout', 'clearTimeout'].includes(String(key)) ? value.bind(target) : value; } }));
  native.history.replaceState(null, '', '/enroll-mfa?next=%2Fnew');
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
const click = async (text: string) => { const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent?.trim() === text); expect(found, text).toBeDefined(); await act(async () => found!.click()); };
async function enroll() {
  await act(async () => root.render(<EnrollMfaPage/>));
  await click('evidence-ready');
  await click('enrolled');
}
const cardHeading = () => document.querySelector<HTMLHeadingElement>('.authLockout h2');
it('shows the card after set-up when neither recovery codes nor a passkey exist, and Later sends the person on', async () => {
  state.authMethods.mockResolvedValue(totp(0));
  await enroll();
  expect(document.body.textContent).toContain(TITLE);
  expect(document.activeElement).toBe(cardHeading());
  expect(state.assign).not.toHaveBeenCalled();
  await click('Later');
  expect(state.assign).toHaveBeenCalledWith('/new');
});
it('sends the person straight on when recovery codes already exist', async () => {
  state.authMethods.mockResolvedValue(totp(10));
  await enroll();
  expect(document.body.textContent).not.toContain(TITLE);
  expect(state.assign).toHaveBeenCalledWith('/new');
});
// Review fix (2026-10-09): a behaviour test, not a pattern over the source.
async function socialSignUpThroughSetUp(client: Record<string, unknown>) {
  window.history.replaceState(null, '', '/social/complete#kind=signup&next=%2Fsettings');
  await act(async () => root.render(<SocialCompleteFlow client={client as never} turnstile={{ siteKey: 'site', nonce: 'nonce' } as never}/>));
  await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(client.completeSocialSignup).toHaveBeenCalledTimes(1);
  await click('enrolled');
}
const socialClient = (codes: number) => ({
  socialSignupStatus: vi.fn().mockResolvedValue({ provider: 'google', email: 'person@example.com', name: 'Person', expires_at: new Date(Date.now() + 300000).toISOString() }),
  completeSocialSignup: vi.fn().mockResolvedValue({ status: 'enrollment_required', enrollment_token: 'e'.repeat(43), expires_at: new Date(Date.now() + 300000).toISOString() }),
  authMethods: vi.fn().mockResolvedValue(totp(codes))
});
it('social sign-up shows the same card after its own set-up, under the set-up heading, before sending the person on', async () => {
  const client = socialClient(0);
  await socialSignUpThroughSetUp(client);
  expect(document.body.textContent).toContain(TITLE);
  expect(document.querySelector('h1')?.textContent).toBe('Protect your account');
  expect(document.body.textContent).not.toContain('Two-step verification');
  expect(document.body.textContent).not.toContain('Back to sign in');
  expect(document.activeElement).toBe(cardHeading());
  expect(state.assign).not.toHaveBeenCalled();
  await click('Later');
  expect(state.assign).toHaveBeenCalledWith('/settings');
});
it('social sign-up sends the person straight on when recovery codes already exist', async () => {
  const client = socialClient(10);
  await socialSignUpThroughSetUp(client);
  expect(document.body.textContent).not.toContain(TITLE);
  expect(state.assign).toHaveBeenCalledWith('/settings');
});
