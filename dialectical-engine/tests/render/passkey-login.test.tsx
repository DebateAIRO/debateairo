// @vitest-environment jsdom
import {expect,it,vi} from "vitest";
import {LoginFlow} from "../../apps/ui/components/LoginFlow.js";
import {mount,unmount,click} from "./task11-harness.js";
it("explicit passkey can cancel with usable password fallback and successful passkey has no TOTP",async()=>{const client={beginLogin:vi.fn(),completeLogin:vi.fn(),beginPasskeyLogin:vi.fn().mockResolvedValue({challenge_handle:"a".repeat(43),options:{}}),completePasskeyLogin:vi.fn().mockResolvedValue({status:"authenticated"})};const browser={supportsConditional:vi.fn().mockResolvedValue(false),authenticate:vi.fn().mockRejectedValue(new DOMException("cancel","NotAllowedError")),cancel:vi.fn()};const authenticated=vi.fn();const {host,root}=await mount(<LoginFlow client={client as any} browser={browser as any} onAuthenticated={authenticated}/>);try{await click(host,"Sign in with a passkey");expect(host.querySelector("input[name=password]")).not.toBeNull();expect(host.querySelector(".authRules")).toBeNull();expect(host.textContent).not.toContain("Valid address");browser.authenticate.mockResolvedValue({});await click(host,"Sign in with a passkey");expect(authenticated).toHaveBeenCalledOnce();expect(client.completeLogin).not.toHaveBeenCalled();}finally{await unmount(root,host);}});
import {act} from 'react';
import {input} from './task11-harness.js';
it('aborts conditional authentication before password flow and ignores a late browser resolve',async()=>{let resolve:(credential:any)=>void=()=>{};const conditional=new Promise(r=>resolve=r),browser={supportsConditional:vi.fn().mockResolvedValue(true),authenticate:vi.fn().mockReturnValue(conditional),cancel:vi.fn()},client={beginPasskeyLogin:vi.fn().mockResolvedValue({challenge_handle:'a'.repeat(43),options:{}}),completePasskeyLogin:vi.fn(),beginLogin:vi.fn().mockResolvedValue({status:'mfa_required',challenge_token:'b'.repeat(43),available_methods:['totp']}),completeLogin:vi.fn()},done=vi.fn();const {host,root}=await mount(<LoginFlow client={client as any} browser={browser as any} onAuthenticated={done}/>);try{expect(browser.authenticate).toHaveBeenCalledOnce();const signal=browser.authenticate.mock.calls[0]![1].signal;await input(host,'[name=email]','person@example.test');await input(host,'[name=password]','password');await act(async()=>host.querySelector('form')!.requestSubmit());expect(signal.aborted).toBe(true);await act(async()=>resolve({}));expect(client.completePasskeyLogin).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();expect(host.querySelector('[name=code]')).not.toBeNull();}finally{await unmount(root,host);}});

it('a rejected conditional preparation cannot poison password or a fresh explicit passkey',async()=>{
 const token='a'.repeat(43),done=vi.fn();
 const browser={supportsConditional:vi.fn().mockResolvedValue(true),authenticate:vi.fn().mockResolvedValue({}),cancel:vi.fn()};
 const client={beginPasskeyLogin:vi.fn().mockRejectedValueOnce(new Error('temporary options outage')).mockResolvedValue({challenge_handle:token,options:{}}),completePasskeyLogin:vi.fn().mockResolvedValue({status:'authenticated'}),beginLogin:vi.fn().mockResolvedValue({status:'mfa_required',challenge_token:'b'.repeat(43),available_methods:['passkey','totp']}),completeLogin:vi.fn()};
 const {host,root}=await mount(<LoginFlow client={client as any} browser={browser as any} onAuthenticated={done}/>);
 try{
  await input(host,'[name=email]','person@example.test');
  await input(host,'[name=password]','password');
  await act(async()=>host.querySelector('form')!.requestSubmit());
  expect(client.beginLogin).toHaveBeenCalledOnce();
  await click(host,'Sign in with a passkey');
  expect(client.beginPasskeyLogin).toHaveBeenCalledTimes(2);
  expect(done).toHaveBeenCalledOnce();
 }finally{await unmount(root,host);}
});

it('password waits for deferred conditional preparation settlement and then proceeds after its failure',async()=>{
 let reject!:(reason?:unknown)=>void;
 const pending=new Promise((_resolve,fail)=>{reject=fail;});
 const browser={supportsConditional:vi.fn().mockResolvedValue(true),authenticate:vi.fn(),cancel:vi.fn()};
 const client={beginPasskeyLogin:vi.fn().mockReturnValue(pending),completePasskeyLogin:vi.fn(),beginLogin:vi.fn().mockResolvedValue({status:'mfa_required',challenge_token:'b'.repeat(43),available_methods:['totp']}),completeLogin:vi.fn()};
 const {host,root}=await mount(<LoginFlow client={client as any} browser={browser as any}/>);
 try{
  await input(host,'[name=email]','person@example.test');
  await input(host,'[name=password]','password');
  await act(async()=>host.querySelector('form')!.requestSubmit());
  expect(client.beginLogin).not.toHaveBeenCalled();
  await act(async()=>reject(new Error('temporary options outage')));
  expect(client.beginLogin).toHaveBeenCalledOnce();
 }finally{await unmount(root,host);}
});

it('unmounting while an explicit passkey waits for conditional settlement prevents a fresh request',async()=>{
 let resolve!:(value:any)=>void;
 const pending=new Promise(r=>{resolve=r;});
 const browser={supportsConditional:vi.fn().mockResolvedValue(true),authenticate:vi.fn(),cancel:vi.fn()};
 const client={beginPasskeyLogin:vi.fn().mockReturnValueOnce(pending).mockResolvedValue({challenge_handle:'a'.repeat(43),options:{}}),completePasskeyLogin:vi.fn(),beginLogin:vi.fn(),completeLogin:vi.fn()};
 const {host,root}=await mount(<LoginFlow client={client as any} browser={browser as any}/>);
 await click(host,'Sign in with a passkey');
 expect(client.beginPasskeyLogin).toHaveBeenCalledOnce();
 await act(async()=>root.unmount());
 await act(async()=>resolve({challenge_handle:'a'.repeat(43),options:{}}));
 expect(client.beginPasskeyLogin).toHaveBeenCalledOnce();
 expect(browser.authenticate).not.toHaveBeenCalled();
 host.remove();vi.unstubAllGlobals();
});
