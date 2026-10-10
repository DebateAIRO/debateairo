// @vitest-environment jsdom
import { StrictMode, act } from 'react';
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
it('scrubs a signup continuation before fetching prefill and renders the optional manual phone without password or provider phone data', async () => {
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
        expect(host.querySelector<HTMLInputElement>('input[name=phone]')?.required).toBe(false);
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
 const client={socialLoginStatus:vi.fn().mockResolvedValue({expires_at:new Date(Date.now()+300000).toISOString(),available_methods:['passkey']}),beginPasskeyLogin:vi.fn().mockResolvedValue({challenge_handle:'b'.repeat(43),options:{}}),completePasskeyLogin:vi.fn().mockReturnValue(completed)};
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

it('step-up code dispatch disables method switching and retains a completed grant',async()=>{
 window.history.replaceState(null,'','/social/complete#kind=stepup&token='+'a'.repeat(43));
 let release!:(value:any)=>void;
 const completed=new Promise(r=>{release=r;}),done=vi.fn();
 webauthn.browser.cancel.mockClear();
 const client={socialStepUpStatus:vi.fn().mockResolvedValue({authorization:{action:'CHANGE_EMAIL'},expires_at:new Date(Date.now()+300000).toISOString(),available_methods:['totp','recovery_code']}),completeSocialStepUp:vi.fn().mockReturnValue(completed)};
 const {host,root}=await mount(<SocialCompleteFlow client={client as any} onStepUp={done}/>);
 try{
  await input(host,'[name=code]','123456');
  expect(client.completeSocialStepUp).toHaveBeenCalledOnce();
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Use a recovery code')?.disabled).toBe(true);
  await click(host,'Use a recovery code');
  await act(async()=>{release({status:'step_up_complete',csrf_token:'c'.repeat(43),step_up_grant:{action:'CHANGE_EMAIL',token:'g'.repeat(43),expires_at:new Date(Date.now()+300000).toISOString()}});await Promise.resolve();await Promise.resolve();});
  expect(done).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Fresh authentication complete');
  await click(host,'‹ Settings');
  expect(done).toHaveBeenCalledOnce();
 }finally{await unmount(root,host);window.history.replaceState(null,'','/');}
});

it('social login remains usable after Strict Mode effect replay',async()=>{
 window.history.replaceState(null,'','/social/complete#kind=login&token='+'a'.repeat(43));
 webauthn.browser.authenticate.mockReset().mockResolvedValue({});webauthn.browser.cancel.mockClear();
 const done=vi.fn(),client={socialLoginStatus:vi.fn().mockResolvedValue({expires_at:new Date(Date.now()+300000).toISOString(),available_methods:['passkey']}),beginPasskeyLogin:vi.fn().mockResolvedValue({challenge_handle:'b'.repeat(43),options:{}}),completePasskeyLogin:vi.fn().mockResolvedValue({status:'authenticated',csrf_token:'c'.repeat(43)})};
 const {host,root}=await mount(<StrictMode><SocialCompleteFlow client={client as any} onAuthenticated={done}/></StrictMode>);
 try{
  await click(host,'Use a passkey');
  expect(client.beginPasskeyLogin).toHaveBeenCalledOnce();
  expect(done).toHaveBeenCalledOnce();
 }finally{await unmount(root,host);window.history.replaceState(null,'','/');}
});

it('Strict Mode replays signup status from the scrubbed in-memory authority',async()=>{
 window.history.replaceState(null,'','/social/complete#kind=signup&token='+'a'.repeat(43));
 const client={socialSignupStatus:vi.fn().mockResolvedValue({provider:'apple',email:'relay@privaterelay.appleid.com',name:'Person',expires_at:new Date(Date.now()+300000).toISOString()})};
 const {host,root}=await mount(<StrictMode><SocialCompleteFlow client={client as any}/></StrictMode>);
 try{
  expect(window.location.hash).toBe('');
  expect(host.querySelector<HTMLInputElement>('[name=email]')?.value).toBe('relay@privaterelay.appleid.com');
  expect(host.querySelector<HTMLInputElement>('[name=phone]')?.disabled).toBe(false);
 }finally{await unmount(root,host);window.history.replaceState(null,'','/');}
});

it('Strict Mode replays provider step-up status from the scrubbed in-memory authority',async()=>{
 window.history.replaceState(null,'','/social/complete#kind=stepup&token='+'a'.repeat(43));
 const client={socialStepUpStatus:vi.fn().mockResolvedValue({authorization:{action:'CHANGE_EMAIL'},expires_at:new Date(Date.now()+300000).toISOString(),available_methods:['totp']})};
 const {host,root}=await mount(<StrictMode><SocialCompleteFlow client={client as any}/></StrictMode>);
 try{
  expect(window.location.hash).toBe('');
  expect(host.querySelector<HTMLInputElement>('[name=code]')).not.toBeNull();
  expect(host.querySelector<HTMLInputElement>('[name=code]')?.disabled).toBe(false);
 }finally{await unmount(root,host);window.history.replaceState(null,'','/');}
});

it.each([['passkey'],['totp'],['recovery_code']] as const)('social login offers only bound server methods %j',async(methods)=>{
 window.history.replaceState(null,'','/social/complete#kind=login&token='+'a'.repeat(43));
 const client={socialLoginStatus:vi.fn().mockResolvedValue({expires_at:new Date(Date.now()+300000).toISOString(),available_methods:methods})};
 const {host,root}=await mount(<SocialCompleteFlow client={client as any}/>);
 try{
  expect(host.textContent?.includes('Use a passkey')).toBe(methods.includes('passkey' as never));
  expect(!!host.querySelector('[name=code]')).toBe(!methods.includes('passkey' as never));
  expect(host.textContent).not.toContain('Use a recovery code');
  if(methods.includes('recovery_code' as never))expect(host.querySelector('[name=code]')?.getAttribute('inputmode')).toBe('text');
 }finally{await unmount(root,host);window.history.replaceState(null,'','/');}
});
it.each(['login','stepup'] as const)('social %s refusal unlocks an edited-code retry without discarding dispatched state',async(kind)=>{
 window.history.replaceState(null,'','/social/complete#kind='+kind+'&token='+'a'.repeat(43));
 let reject!:(e:Error)=>void;const pending=new Promise((_r,no)=>reject=no),done=vi.fn();
 const status={expires_at:new Date(Date.now()+300000).toISOString(),available_methods:['totp','recovery_code'],authorization:{action:'CHANGE_EMAIL'}};
 const result=kind==='login'?{status:'authenticated'}:{status:'step_up_complete',csrf_token:'c'.repeat(43),step_up_grant:{action:'CHANGE_EMAIL',token:'g'.repeat(43),expires_at:status.expires_at}};
 const complete=vi.fn().mockReturnValueOnce(pending).mockResolvedValue(result);
 const client={socialLoginStatus:async()=>status,socialStepUpStatus:async()=>status,completeLogin:complete,completeSocialStepUp:complete};
 const {host,root}=await mount(<SocialCompleteFlow client={client as any} onAuthenticated={done} onStepUp={done}/>);
 try{
  await input(host,'[name=code]','123456');const alternate=[...host.querySelectorAll('button')].find(b=>b.textContent==='Use a recovery code')!;expect(alternate.disabled).toBe(true);
  await act(async()=>reject(new Error('refused')));expect(host.querySelector('[role=alert]')).not.toBeNull();expect(alternate.disabled).toBe(false);
  await input(host,'[name=code]','654321');if(kind==='stepup')await click(host,'‹ Settings');expect(done).toHaveBeenCalledOnce();
 }finally{await unmount(root,host);window.history.replaceState(null,'','/');}
});

it('provider prompt cancellation before dispatch permits a current method and fences the old failure',async()=>{
 window.history.replaceState(null,'','/social/complete#kind=login&token='+'a'.repeat(43));let rejectPrompt!:(e:Error)=>void,finish!:(v:any)=>void;const prompt=new Promise((_r,no)=>rejectPrompt=no),completion=new Promise(r=>finish=r),done=vi.fn();
 webauthn.browser.authenticate.mockReset().mockReturnValue(prompt);const client={socialLoginStatus:async()=>({expires_at:new Date(Date.now()+300000).toISOString(),available_methods:['passkey','totp','recovery_code']}),beginPasskeyLogin:async()=>({challenge_handle:'b'.repeat(43),options:{}}),completePasskeyLogin:vi.fn(),completeLogin:()=>completion};
 const {host,root}=await mount(<SocialCompleteFlow client={client as any} onAuthenticated={done}/>);
 try{await click(host,'Use a passkey');await click(host,'Use a recovery code');await input(host,'[name=code]','saved-code');await act(async()=>host.querySelector('form')!.requestSubmit());await act(async()=>rejectPrompt(new Error('cancelled old prompt')));expect(host.querySelector<HTMLInputElement>('[name=code]')?.disabled).toBe(true);expect(host.querySelector('[role=alert]')).toBeNull();await act(async()=>finish({status:'authenticated'}));expect(done).toHaveBeenCalledOnce();expect(client.completePasskeyLogin).not.toHaveBeenCalled();}finally{await unmount(root,host);window.history.replaceState(null,'','/');}
});
