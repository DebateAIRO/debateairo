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

// Review fix (2026-10-09): the account check never leaves a blank space and never holds anyone up.
const CHECKING = 'Checking your account…';
it('says it is checking while the account check is pending', async () => {
  const c = client(); c.authMethods.mockReturnValue(new Promise(() => {}));
  const onDone = await mount(c);
  expect(document.querySelector('[role=status]')?.textContent).toBe(CHECKING);
  expect(document.body.textContent).not.toContain(TITLE);
  expect(onDone).not.toHaveBeenCalled();
});
it('a check that hangs for five seconds is skipped, and a late answer changes nothing', async () => {
  vi.useFakeTimers();
  try {
    let answer!: (value: ReturnType<typeof methods>) => void;
    const c = client(); c.authMethods.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const onDone = await mount(c);
    await act(async () => { vi.advanceTimersByTime(4999); });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain(CHECKING);
    await act(async () => answer(methods()));
    expect(document.body.textContent).not.toContain(TITLE);
    expect(onDone).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

// Review fix (2026-10-09): once the fresh proof for "Add a passkey" passes, the person can still go back
// or move on — a browser without passkeys, a cancelled prompt or an expired proof never strands them.
async function toPasskeySetUp(c: ReturnType<typeof client>) {
  await click('Add a passkey');
  await confirmWithPassword();
  expect(button('Create a passkey')).toBeDefined();
}
const CHOICES = ['Save recovery codes', 'Add a passkey', 'Later'];
it('Back from the passkey set-up returns to the three choices', async () => {
  const c = client(); const onDone = await mount(c);
  await toPasskeySetUp(c);
  await click('Back');
  for (const text of CHOICES) expect(button(text), text).toBeDefined();
  expect(button('Create a passkey')).toBeUndefined();
  expect(c.beginPasskeyEnrollment).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
});
it('Later from the passkey set-up moves on without creating anything', async () => {
  const c = client(); const onDone = await mount(c);
  await toPasskeySetUp(c);
  await click('Later');
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(c.beginPasskeyEnrollment).not.toHaveBeenCalled();
});
it.each([
  ['the person cancels the passkey prompt', 'NotAllowedError'],
  ['the browser has no passkey support', 'NotSupportedError']
])('when %s, Back and Later still work', async (_case, name) => {
  browser.register.mockRejectedValue(new DOMException('prompt', name));
  const c = client(); const onDone = await mount(c);
  await toPasskeySetUp(c);
  await click('Create a passkey');
  expect(c.completePasskeyEnrollment).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('The passkey check was not completed.');
  await click('Back');
  for (const text of CHOICES) expect(button(text), text).toBeDefined();
  await click('Add a passkey');
  await confirmWithPassword();
  await click('Create a passkey');
  await click('Later');
  expect(onDone).toHaveBeenCalledTimes(1);
});
it('when the fresh proof expires during the passkey set-up, the card returns to its choices and says so', async () => {
  vi.useFakeTimers();
  try {
    const c = client();
    c.stepUp.mockImplementation(async (_p: string, _code: string, authorization: { action: string }) => ({ ...proof(authorization.action), step_up_grant: { ...proof(authorization.action).step_up_grant, expires_at: new Date(Date.now() + 60_000).toISOString() } }));
    const onDone = await mount(c);
    await toPasskeySetUp(c);
    await act(async () => { vi.advanceTimersByTime(59_999); });
    expect(button('Create a passkey')).toBeDefined();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(button('Create a passkey')).toBeUndefined();
    expect(document.querySelector('[role=alert]')?.textContent).toBe('That took too long — please try again.');
    for (const text of CHOICES) expect(button(text), text).toBeDefined();
    expect(onDone).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

// Review fix (2026-10-09, a11y): the card replaces a set-up form that had focus, so focus moves to its
// heading and a polite live region says it once; every change of step does the same.
const heading = () => document.querySelector<HTMLHeadingElement>('.authLockout h2')!;
const spoken = () => document.querySelector('.authLockout [aria-live=polite]')?.textContent;
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
it('moves focus to the card heading and announces the card once, politely', async () => {
  await mount(client());
  expect(heading().textContent).toBe(TITLE);
  expect(heading().getAttribute('tabindex')).toBe('-1');
  expect(document.activeElement).toBe(heading());
  await settle();
  expect(spoken()).toBe(TITLE);
});
it('each change of step moves focus back to the heading and says the step', async () => {
  await mount(client());
  await settle();
  (document.querySelector<HTMLButtonElement>('.authLockoutActions button'))!.focus();
  await click('Save recovery codes');
  expect(document.activeElement).toBe(heading());
  await settle();
  expect(spoken()).toBe('Save recovery codes');
  await click('Cancel');
  expect(document.activeElement).toBe(heading());
  await settle();
  expect(spoken()).toBe(TITLE);
  await click('Add a passkey');
  await settle();
  expect(spoken()).toBe('Add a passkey');
  await confirmWithPassword();
  expect(document.activeElement).toBe(heading());
});
