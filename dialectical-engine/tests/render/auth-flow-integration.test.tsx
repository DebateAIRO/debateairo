// @vitest-environment jsdom
import {act} from 'react';
import {expect,it,vi} from 'vitest';
import {ContractHttpError} from '@debateai/contract';
import {LoginFlow} from '../../apps/ui/components/LoginFlow.js';
import {SUPPORT_CONVERSATION_STORAGE_KEY} from '../../apps/ui/components/support/conversation.js';
import {mount,unmount,input,click} from './task11-harness.js';
const token='a'.repeat(43),auth={status:'authenticated',csrf_token:'c'.repeat(43)};
async function credentials(host:HTMLElement){await input(host,'[name=email]','person@example.test');await input(host,'[name=password]','existing-password');await act(async()=>host.querySelector('form')!.requestSubmit());}
it('credentials and continuation forms use safe query-free POST fallbacks and only server-offered methods',async()=>{const client={beginLogin:vi.fn().mockResolvedValue({status:'mfa_required',challenge_token:token,available_methods:['totp']}),completeLogin:vi.fn()};const {host,root}=await mount(<LoginFlow client={client}/>);try{expect(host.querySelector('form')?.method).toBe('post');await credentials(host);expect(host.querySelector('form')?.getAttribute('action')).toBe('/login');expect([...host.querySelectorAll('button')].map(button=>button.textContent)).not.toContain('Use a recovery code');expect(host.querySelector('[name=password]')).toBeNull();}finally{await unmount(root,host);}});
it('native malformed login submission associates errors, focuses email and sends nothing',async()=>{const client={beginLogin:vi.fn(),completeLogin:vi.fn()};const {host,root}=await mount(<LoginFlow client={client}/>);try{await act(async()=>host.querySelector('form')!.requestSubmit());expect(document.activeElement).toBe(host.querySelector('[name=email]'));expect(host.querySelector('[name=email]')?.getAttribute('aria-invalid')).toBe('true');expect(client.beginLogin).not.toHaveBeenCalled();}finally{await unmount(root,host);}});
it('rejected credentials use exact short generic copy and suppress server detail',async()=>{const client={beginLogin:vi.fn().mockRejectedValue(new Error('private transport secret')),completeLogin:vi.fn()};const {host,root}=await mount(<LoginFlow client={client}/>);try{await credentials(host);expect(host.querySelector('[role=alert]')?.textContent).toBe('Email or password are incorrect. Please try again.');expect(host.textContent).not.toContain('private transport secret');expect(host.querySelector('.authRules')).toBeNull();}finally{await unmount(root,host);}});
it('ordinary six-digit completion navigates exactly once without requiring recovery codes',async()=>{const done=vi.fn(),client={beginLogin:vi.fn().mockResolvedValue({status:'mfa_required',challenge_token:token,available_methods:['totp','recovery_code']}),completeLogin:vi.fn().mockResolvedValue(auth)};const {host,root}=await mount(<LoginFlow client={client} onAuthenticated={done}/>);try{await credentials(host);await input(host,'[name=code]','12345');expect(client.completeLogin).not.toHaveBeenCalled();await input(host,'[name=code]','123456');expect(done).toHaveBeenCalledOnce();expect(client.completeLogin).toHaveBeenCalledWith(token,'123456');}finally{await unmount(root,host);}});
it('authenticated recovery-code replacement remains ephemeral with one explicit continue and no type-back',async()=>{const done=vi.fn(),client={beginLogin:vi.fn().mockResolvedValue({status:'mfa_required',challenge_token:token,available_methods:['recovery_code']}),completeLogin:vi.fn().mockResolvedValue({...auth,replacement_recovery_code:'NEW-RECOVERY-CODE'})};const {host,root}=await mount(<LoginFlow client={client} onAuthenticated={done}/>);try{await credentials(host);await input(host,'[name=code]','SAVED-CODE');await act(async()=>host.querySelector('form')!.requestSubmit());expect(done).not.toHaveBeenCalled();expect(host.textContent).toContain('NEW-RECOVERY-CODE');expect(host.querySelector('input')).toBeNull();await click(host,'Continue');expect(done).toHaveBeenCalledOnce();}finally{await unmount(root,host);}});
it.each([401,429])('code refusals %i suppress private detail and never authenticate',async status=>{const done=vi.fn(),client={beginLogin:vi.fn().mockResolvedValue({status:'mfa_required',challenge_token:token,available_methods:['totp']}),completeLogin:vi.fn().mockRejectedValue(new ContractHttpError('SERVER_FAILURE',status,'private-detail','PRIVATE'))};const {host,root}=await mount(<LoginFlow client={client} onAuthenticated={done}/>);try{await credentials(host);await input(host,'[name=code]','123456');expect(done).not.toHaveBeenCalled();expect(host.textContent).not.toContain('private-detail');expect(host.textContent).toContain(status===429?'Too many verification attempts':'That authentication code was not accepted');}finally{await unmount(root,host);}});
// REV-S01 p2 SD-N2 (restored as BEHAVIOUR; legal-pages.test.tsx only pins the source shape). A sign-in that the
// server may have completed erases the previous person's help-chat transcript; only a 4xx refusal of the code keeps it.
it.each([
  ['200, authenticated', () => Promise.resolve(auth), 'erased'],
  ['200 whose body the client rejects', () => Promise.reject(new ContractHttpError('INVALID_RESPONSE', 200, 'Invalid response')), 'erased'],
  ['body read dropped', () => Promise.reject(new ContractHttpError('NETWORK_FAILURE', 0, 'Network failure')), 'erased'],
  ['500 after the handler ran', () => Promise.reject(new ContractHttpError('INTERNAL_ERROR', 500, 'boom')), 'erased'],
  ['a non-contract throw', () => Promise.reject(new Error('unexpected')), 'erased'],
  ['401 code rejected', () => Promise.reject(new ContractHttpError('SESSION_REQUIRED', 401, 'no')), 'kept'],
  ['429 attempts locked', () => Promise.reject(new ContractHttpError('RATE_LIMITED', 429, 'no')), 'kept'],
  ['400 malformed code', () => Promise.reject(new ContractHttpError('VALIDATION_FAILED', 400, 'no')), 'kept']
] as const)('erases the help transcript whenever the server may have signed someone in, and keeps it when the code is refused: %s', async (_label, answer, expected) => {
  sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY, JSON.stringify({ language: 'en', identityBound: true, messages: [{ id: 'a', role: 'user', text: 'PERSON-A' }] }));
  const client = { beginLogin: vi.fn().mockResolvedValue({ status: 'mfa_required', challenge_token: token, available_methods: ['totp'] }), completeLogin: vi.fn().mockImplementation(answer) };
  const { host, root } = await mount(<LoginFlow client={client} onAuthenticated={vi.fn()} />);
  try {
    await credentials(host);
    // Typing before the code screen must not touch the transcript.
    expect(sessionStorage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY)).not.toBeNull();
    await input(host, '[name=code]', '123456');
    expect(client.completeLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY) === null ? 'erased' : 'kept').toBe(expected);
  } finally {
    await unmount(root, host);
    sessionStorage.clear();
  }
});
