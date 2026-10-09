// @vitest-environment jsdom
// Owner ruling 2026-10-09 ("don't get locked out"): right after MFA set-up, a person with neither
// recovery codes nor a passkey is offered either, through the existing fresh-proof flows, or Later.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import auth from '../../apps/ui/messages/en/auth.json';
const browser = vi.hoisted(() => ({ register: vi.fn(), cancel: vi.fn() }));
vi.mock('@/lib/consumerWebAuthn', () => ({ createConsumerWebAuthnBrowser: () => browser }));
import { LockoutPrompt } from '../../apps/ui/components/auth/LockoutPrompt';

const TITLE = "Don't get locked out";
const WHY = 'If you lose your phone, these let you back in straight away — without them, getting back in is slower and harder.';
const factor = '11111111-1111-4111-8111-111111111111';
const proof = (action: string) => ({ status: 'step_up_complete', csrf_token: 'c'.repeat(43), step_up_grant: { token: 'g'.repeat(43), action, expires_at: new Date(Date.now() + 300000).toISOString() } });
const methods = (over: Partial<{ passkey: boolean; codes: number }> = {}) => ({
  methods: [over.passkey
    ? { factor_id: factor, type: 'passkey', label: 'My key', created_at: '2026-10-01T10:00:00Z', last_used_at: null, removable: false }
    : { factor_id: factor, type: 'totp', label: null, created_at: '2026-10-01T10:00:00Z', last_used_at: null, removable: false }],
  recovery_codes_remaining: over.codes ?? 0, available_step_up_methods: ['password_totp'], step_up_providers: []
});
const client = (over: Partial<{ passkey: boolean; codes: number }> = {}) => ({
  authMethods: vi.fn().mockResolvedValue(methods(over)),
  stepUp: vi.fn(async (_password: string, _code: string, authorization: { action: string }) => proof(authorization.action)),
  regenerateRecoveryCodes: vi.fn().mockResolvedValue({ codes: Array.from({ length: 10 }, (_, i) => `CODE-${i}-XXXX-XXXX`) }),
  beginPasskeyEnrollment: vi.fn().mockResolvedValue({ challenge_handle: 'p'.repeat(43), options: {} }),
  completePasskeyEnrollment: vi.fn().mockResolvedValue({ status: 'enrolled' }),
  beginTotpEnrollment: vi.fn()
});
let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); document.body.innerHTML = '<div id="root"></div>'; root = createRoot(document.getElementById('root')!); browser.register.mockReset().mockResolvedValue({}); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function mount(c: ReturnType<typeof client>, onDone = vi.fn()) {
  await act(async () => root.render(<LockoutPrompt catalog={auth} client={c as never} onDone={onDone}/>));
  return onDone;
}
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(x => x.textContent?.trim() === text);
async function click(text: string) { const found = button(text); expect(found, text).toBeDefined(); await act(async () => found!.click()); }
async function input(selector: string, value: string) { await act(async () => { const field = document.querySelector<HTMLInputElement>(selector)!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function confirmWithPassword() { await click('Password · 6-digit authentication code'); await input('input[type=password]', 'long password'); await input('input[autocomplete=one-time-code]', '123456'); }

it('is shown when the account has neither recovery codes nor a passkey', async () => {
  const onDone = await mount(client());
  expect(document.body.textContent).toContain(TITLE);
  expect(document.body.textContent).toContain(WHY);
  for (const text of ['Save recovery codes', 'Add a passkey', 'Later']) expect(button(text), text).toBeDefined();
  expect(onDone).not.toHaveBeenCalled();
});
it('is not shown when recovery codes exist', async () => {
  const onDone = await mount(client({ codes: 10 }));
  expect(document.body.textContent).not.toContain(TITLE);
  expect(onDone).toHaveBeenCalledTimes(1);
});
it('is not shown when a passkey exists, even without codes', async () => {
  const onDone = await mount(client({ passkey: true }));
  expect(document.body.textContent).not.toContain(TITLE);
  expect(onDone).toHaveBeenCalledTimes(1);
});
it('a failed read never holds the person back', async () => {
  const c = client(); c.authMethods.mockRejectedValue(new Error('PRIVATE'));
  const onDone = await mount(c);
  expect(document.body.textContent).not.toContain(TITLE);
  expect(onDone).toHaveBeenCalledTimes(1);
});
it('Later moves on and changes nothing', async () => {
  const c = client(); const onDone = await mount(c);
  await click('Later');
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(c.stepUp).not.toHaveBeenCalled();
  expect(c.regenerateRecoveryCodes).not.toHaveBeenCalled();
});
it('Save recovery codes asks for a fresh proof, then shows the new codes until Continue', async () => {
  const c = client(); const onDone = await mount(c);
  await click('Save recovery codes');
  expect(c.regenerateRecoveryCodes).not.toHaveBeenCalled();
  await confirmWithPassword();
  expect(c.stepUp).toHaveBeenCalledWith('long password', '123456', { action: 'REGENERATE_RECOVERY_CODES' });
  expect(c.regenerateRecoveryCodes).toHaveBeenCalledWith('g'.repeat(43));
  expect(document.querySelector('.authRecoveryCode')?.textContent).toContain('CODE-0-XXXX-XXXX');
  expect(onDone).not.toHaveBeenCalled();
  await click('Continue');
  expect(onDone).toHaveBeenCalledTimes(1);
});
it('Add a passkey asks for a fresh proof, then opens only the passkey set-up', async () => {
  const c = client(); const onDone = await mount(c);
  await click('Add a passkey');
  await confirmWithPassword();
  expect(c.stepUp).toHaveBeenCalledWith('long password', '123456', { action: 'ADD_PASSKEY' });
  expect(button('Use an authenticator app instead')).toBeUndefined();
  await click('Create a passkey');
  expect(c.beginPasskeyEnrollment).toHaveBeenCalledWith({ step_up_grant: 'g'.repeat(43) });
  expect(c.completePasskeyEnrollment).toHaveBeenCalledTimes(1);
  expect(c.beginTotpEnrollment).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
  await click('Continue');
  expect(onDone).toHaveBeenCalledTimes(1);
});
it('cancelling a fresh-proof check returns to the three choices', async () => {
  const c = client(); await mount(c);
  await click('Save recovery codes');
  await click('Cancel');
  for (const text of ['Save recovery codes', 'Add a passkey', 'Later']) expect(button(text), text).toBeDefined();
});
it('a failed code generation says so in plain words and returns to the choices', async () => {
  const c = client(); c.regenerateRecoveryCodes.mockRejectedValue(new Error('PRIVATE FAILURE'));
  const onDone = await mount(c);
  await click('Save recovery codes');
  await confirmWithPassword();
  expect(document.body.textContent).toContain('That did not work. Please try again.');
  expect(document.body.textContent).not.toContain('PRIVATE FAILURE');
  for (const text of ['Save recovery codes', 'Add a passkey', 'Later']) expect(button(text), text).toBeDefined();
  expect(onDone).not.toHaveBeenCalled();
});
