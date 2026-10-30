// @vitest-environment jsdom
// NV-14: the mailed verification link asks the inbox holder for the account's password before it verifies, so the
// password a registrant typed at sign-up never survives the verification. The bearer is taken and scrubbed on mount
// and verified only on submit; a refused password or a busy service keeps the form, and the bearer, for a retry.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ verifyWithPassword: vi.fn(), verify: vi.fn() }));
vi.mock('@/lib/i18n/I18nProvider', () => ({ useChromeI18n: () => ({ locale: 'en', catalog: {} }) }));
vi.mock('@/lib/mfaEnrollment', () => {
  class MfaEnrollmentHttpError extends Error { constructor(readonly code: string, readonly status: number) { super(code); } }
  return { takeFragmentToken: () => 'b'.repeat(43), verifyMfaEmail: state.verify, verifyMfaEmailWithPassword: state.verifyWithPassword, MfaEnrollmentHttpError };
});
vi.mock('@/components/auth/OnboardingEvidence', () => ({ OnboardingEvidence: ({ authority }: { authority: { token: string } }) => <button type="button" data-token={authority.token}>evidence-ready</button> }));
vi.mock('@/components/auth/SecurityEnrollment', () => ({ SecurityEnrollment: () => null }));
import { MfaEnrollmentHttpError } from '@/lib/mfaEnrollment';
import EnrollMfaPage from '../../apps/ui/app/enroll-mfa/page';

const BEARER = 'b'.repeat(43);
const REQUIRED = 'Enter your password.';
const POLICY = 'At least eight characters';
const UNAVAILABLE = 'Verification is temporarily unavailable. Try again shortly.';
const INVALID_LINK = 'This enrolment link is invalid or expired.';
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById('root')!);
  state.verifyWithPassword.mockReset(); state.verify.mockReset();
  window.history.replaceState(null, '', '/verify-email');
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
const field = () => document.querySelector<HTMLInputElement>('#verify-password');
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent?.trim() === text);
const errorSlot = () => document.querySelector('#verify-password-error')?.textContent ?? null;
async function render() { await act(async () => root.render(<EnrollMfaPage/>)); }
async function type(value: string) {
  const input = field()!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() { await act(async () => button('Continue')!.click()); }

it('asks for the password on mount and verifies nothing until it is submitted', async () => {
  await render();
  const input = field();
  expect(input).not.toBeNull();
  expect(input!.type).toBe('password');
  expect(input!.autocomplete).toBe('new-password');
  expect(document.querySelector('label[for="verify-password"]')?.textContent).toBe('Password');
  expect(document.getElementById(input!.getAttribute('aria-describedby')!)?.textContent).toBe(POLICY);
  expect(document.querySelector('form')).toBeNull();
  expect(state.verifyWithPassword).not.toHaveBeenCalled();
  expect(state.verify).not.toHaveBeenCalled();
});

it('refuses an empty password locally and sends nothing', async () => {
  await render();
  await submit();
  expect(errorSlot()).toBe(REQUIRED);
  expect(state.verifyWithPassword).not.toHaveBeenCalled();
  expect(button('evidence-ready')).toBeUndefined();
});

it('keeps the form and the bearer on a policy refusal, then continues on a retry', async () => {
  state.verifyWithPassword.mockRejectedValueOnce(new MfaEnrollmentHttpError('AUTH_INPUT_INVALID', 400)).mockResolvedValueOnce(undefined);
  await render();
  await type('seven77');
  await submit();
  expect(state.verifyWithPassword).toHaveBeenLastCalledWith(BEARER, 'seven77');
  expect(errorSlot()).toBe(POLICY);
  expect(field()).not.toBeNull();
  expect(field()!.getAttribute('aria-describedby')).toBe('verify-password-error');
  await type('Inbox owner pass 1');
  expect(errorSlot()).toBeNull();
  await submit();
  expect(state.verifyWithPassword).toHaveBeenLastCalledWith(BEARER, 'Inbox owner pass 1');
  expect(button('evidence-ready')?.getAttribute('data-token')).toBe(BEARER);
  expect(field()).toBeNull();
});

it.each(['AUTH_INPUT_INVALID', 'MALFORMED_REQUEST'])('shows the policy hint for a password over the ruled maximum (%s)', async (code) => {
  state.verifyWithPassword.mockRejectedValueOnce(new MfaEnrollmentHttpError(code, 400));
  await render();
  await type('p'.repeat(1025));
  await submit();
  expect(errorSlot()).toBe(POLICY);
  expect(field()).not.toBeNull();
});

// NV-14 Revision 3: NOT_FOUND 404 is an API from before verify-email/password (a switch or a rollback); the link still works.
it.each([['AUTH_TEMPORARILY_UNAVAILABLE', 503], ['AUTH_RATE_LIMITED', 429], ['MFA_REQUEST_FAILED', 503], ['NOT_FOUND', 404]] as const)('keeps the form with a retry message when verification is unavailable (%s %d)', async (code, status) => {
  state.verifyWithPassword.mockRejectedValueOnce(new MfaEnrollmentHttpError(code, status));
  await render();
  await type('Inbox owner pass 1');
  await submit();
  expect(errorSlot()).toBe(UNAVAILABLE);
  expect(field()?.value).toBe('Inbox owner pass 1');
  expect(document.querySelector('[role=alert]')).toBeNull();
});

it('continues into enrolment on an already-used link, as before', async () => {
  state.verifyWithPassword.mockRejectedValueOnce(new MfaEnrollmentHttpError('VERIFICATION_TOKEN_INVALID', 400));
  await render();
  await type('Inbox owner pass 1');
  await submit();
  expect(button('evidence-ready')?.getAttribute('data-token')).toBe(BEARER);
});

it('ends in the invalid-link message on any other refusal', async () => {
  state.verifyWithPassword.mockRejectedValueOnce(new MfaEnrollmentHttpError('MFA_RESPONSE_INVALID', 502));
  await render();
  await type('Inbox owner pass 1');
  await submit();
  expect(document.querySelector('[role=alert]')?.textContent).toBe(INVALID_LINK);
  expect(field()).toBeNull();
});

it('disables Continue while the request is in flight and sends it once', async () => {
  let finish!: () => void;
  state.verifyWithPassword.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await render();
  await type('Inbox owner pass 1');
  await submit();
  expect(button('Continue')!.disabled).toBe(true);
  await act(async () => button('Continue')!.click());
  await act(async () => field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(state.verifyWithPassword).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(button('evidence-ready')).toBeDefined();
});

it('submits on Enter in the password field', async () => {
  state.verifyWithPassword.mockResolvedValueOnce(undefined);
  await render();
  await type('Inbox owner pass 1');
  await act(async () => field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(state.verifyWithPassword).toHaveBeenCalledWith(BEARER, 'Inbox owner pass 1');
  expect(button('evidence-ready')).toBeDefined();
});
