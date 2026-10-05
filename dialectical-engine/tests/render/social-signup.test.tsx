// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SignUpFlow } from '../../apps/ui/components/SignUpFlow.js';
import { mount, unmount, click, input } from './task11-harness.js';
const webauthn=vi.hoisted(()=>({browser:{authenticate:vi.fn(),register:vi.fn(),cancel:vi.fn(),supportsConditional:vi.fn()}}));
vi.mock('@/lib/consumerWebAuthn',()=>({createConsumerWebAuthnBrowser:()=>webauthn.browser}));
it('renders only a server-advertised provider and does not advertise unconfigured providers', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const client = { register: vi.fn(), checkAge: vi.fn(), authProviders: async () => ({ providers: [{ id: 'google', name: 'Google' }] }), beginSocialLogin: vi.fn() };
    try {
        await act(async () => root.render(<SignUpFlow client={client}/>));
        const buttons = [...host.querySelectorAll('button')].map(x => x.textContent);
        expect(buttons).toContain('Continue with Google');
        expect(buttons.join(' ')).not.toMatch(/Continue with (Apple|Facebook|X)/);
    }
    finally {
        await act(async () => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    }
});
import { SocialCompleteFlow } from '../../apps/ui/components/auth/SocialCompleteFlow.js';
import type { ContractClient } from '@debateai/contract';
it('scrubs a signup continuation before fetching prefill and renders required manual phone without password or provider phone data', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.history.replaceState(null, '', '/social/complete#kind=signup&token=' + 'a'.repeat(43));
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const client = { socialSignupStatus: async () => { expect(window.location.hash).toBe(''); return { provider: 'apple', email: 'relay@privaterelay.appleid.com', name: '<script>untrusted name</script>', expires_at: new Date(Date.now() + 300000).toISOString() }; } } as unknown as ContractClient;
    try {
        await act(async () => root.render(<SocialCompleteFlow client={client}/>));
        expect(host.querySelector<HTMLInputElement>('input[name=email]')?.value).toBe('relay@privaterelay.appleid.com');
        expect(host.querySelector<HTMLInputElement>('input[name=phone]')?.type).toBe('tel');
        expect(host.querySelector('input[type=password]')).toBeNull();
        expect(host.querySelector('script')).toBeNull();
        expect(host.textContent).toContain('<script>untrusted name</script>');
        expect(host.querySelector('form')?.noValidate).toBe(true);
    }
    finally {
        await act(async () => root.unmount());
        host.remove();
        window.history.replaceState(null, '', '/');
        vi.unstubAllGlobals();
    }
});

it('unmounted social login ignores a late final passkey response',async()=>{
 window.history.replaceState(null,'','/social/complete#kind=login&token='+'a'.repeat(43));
 let release!:(value:any)=>void;
 const completed=new Promise(r=>{release=r;}),done=vi.fn();
 webauthn.browser.authenticate.mockReset().mockResolvedValue({});webauthn.browser.cancel.mockClear();
 const client={beginPasskeyLogin:vi.fn().mockResolvedValue({challenge_handle:'b'.repeat(43),options:{}}),completePasskeyLogin:vi.fn().mockReturnValue(completed)};
 const {host,root}=await mount(<SocialCompleteFlow client={client as any} onAuthenticated={done}/>);
 await click(host,'Use a passkey');
 expect(client.completePasskeyLogin).toHaveBeenCalledOnce();
 await act(async()=>root.unmount());
 await act(async()=>release({status:'authenticated',csrf_token:'c'.repeat(43)}));
 expect(done).not.toHaveBeenCalled();
 host.remove();window.history.replaceState(null,'','/');vi.unstubAllGlobals();
});

it('original provider step-up expiry invalidates a late final passkey response',async()=>{
 vi.useFakeTimers();
 window.history.replaceState(null,'','/social/complete#kind=stepup&token='+'a'.repeat(43));
 let release!:(value:any)=>void;
 const completed=new Promise(r=>{release=r;}),done=vi.fn(),expiresAt=new Date(Date.now()+1000).toISOString();
 webauthn.browser.authenticate.mockReset().mockResolvedValue({});webauthn.browser.cancel.mockClear();
 const client={socialStepUpStatus:vi.fn().mockResolvedValue({authorization:{action:'CHANGE_EMAIL'},expires_at:expiresAt,available_methods:['passkey']}),beginSocialStepUpPasskey:vi.fn().mockResolvedValue({challenge_handle:'b'.repeat(43),options:{}}),completeSocialStepUp:vi.fn().mockReturnValue(completed)};
 const {host,root}=await mount(<SocialCompleteFlow client={client as any} onStepUp={done}/>);
 try{
  await click(host,'Use a passkey');
  expect(client.completeSocialStepUp).toHaveBeenCalledOnce();
  await act(async()=>vi.advanceTimersByTime(1001));
  await act(async()=>{release({status:'step_up_complete',csrf_token:'c'.repeat(43),step_up_grant:{action:'CHANGE_EMAIL',token:'g'.repeat(43),expires_at:new Date(Date.now()+300000).toISOString()}});await Promise.resolve();await Promise.resolve();});
  expect(done).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('Fresh authentication complete');
 }finally{await unmount(root,host);window.history.replaceState(null,'','/');vi.useRealTimers();}
});

it('step-up code method switch invalidates a late final server response',async()=>{
 window.history.replaceState(null,'','/social/complete#kind=stepup&token='+'a'.repeat(43));
 let release!:(value:any)=>void;
 const completed=new Promise(r=>{release=r;}),done=vi.fn();
 webauthn.browser.cancel.mockClear();
 const client={socialStepUpStatus:vi.fn().mockResolvedValue({authorization:{action:'CHANGE_EMAIL'},expires_at:new Date(Date.now()+300000).toISOString(),available_methods:['totp','recovery_code']}),completeSocialStepUp:vi.fn().mockReturnValue(completed)};
 const {host,root}=await mount(<SocialCompleteFlow client={client as any} onStepUp={done}/>);
 try{
  await input(host,'[name=code]','123456');
  expect(client.completeSocialStepUp).toHaveBeenCalledOnce();
  await click(host,'Use a recovery code');
  await act(async()=>{release({status:'step_up_complete',csrf_token:'c'.repeat(43),step_up_grant:{action:'CHANGE_EMAIL',token:'g'.repeat(43),expires_at:new Date(Date.now()+300000).toISOString()}});await Promise.resolve();await Promise.resolve();});
  expect(done).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('Fresh authentication complete');
 }finally{await unmount(root,host);window.history.replaceState(null,'','/');}
});
