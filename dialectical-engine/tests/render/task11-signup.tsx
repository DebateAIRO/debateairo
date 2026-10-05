import {act} from 'react';
import {vi} from 'vitest';
import {SignUpFlow} from '../../apps/ui/components/SignUpFlow.js';
import {mount,input} from './task11-harness.js';
vi.mock('@/components/auth/TurnstileChallenge',async()=>{const {useEffect}=await import('react');return {TurnstileChallenge:({onToken}:{onToken:(value:string)=>void})=>{useEffect(()=>onToken('test-proof'),[onToken]);return null;}};});
export async function signup(client:any){return mount(<SignUpFlow turnstile={{siteKey:'test-site',nonce:'test-nonce'}} client={client}/>);}
export async function fillSignup(host:HTMLElement){for(const [name,value] of [['dob-d','01'],['dob-m','01'],['dob-y','1990']])await input(host,`[name=${name}]`,value);for(const [name,value] of [['email','person@example.test'],['phone','+40 712 345 678'],['password','Passw0rd!']])host.querySelector<HTMLInputElement>(`[name=${name}]`)!.value=value;host.querySelector<HTMLInputElement>('[name=privacy-accepted]')!.checked=true;host.querySelector<HTMLInputElement>('[name=terms-accepted]')!.checked=true;}
export async function submitSignup(host:HTMLElement){await act(async()=>host.querySelector('form')!.requestSubmit());}
