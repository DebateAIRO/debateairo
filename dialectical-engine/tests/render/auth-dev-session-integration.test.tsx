// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {ContractHttpError} from '@debateai/contract';
import {SecurityEnrollment} from '../../apps/ui/components/auth/SecurityEnrollment.js';
import {onConversationReset} from '../../apps/ui/components/support/sessionChange.js';
import {mount,unmount,click} from './task11-harness.js';
const key='debateai.support.conversation.v2';
it.each(['authenticated','enrolled','refused','uncertain'] as const)('enrollment %s preserves the session-change transcript boundary',async outcome=>{
 sessionStorage.setItem(key,'prior-person-conversation');const resets:Array<string|null>=[];
 const stop=onConversationReset(reason=>{if(reason==='session-change')resets.push(sessionStorage.getItem(key));});
 const completePasskeyEnrollment=vi.fn().mockImplementation(async()=>{if(outcome==='refused')throw new ContractHttpError('SESSION_REQUIRED',401,'REFUSED');if(outcome==='uncertain')throw new Error('response interrupted');return {status:outcome};});
 const client={beginPasskeyEnrollment:async()=>({challenge_handle:'a'.repeat(43),options:{}}),completePasskeyEnrollment};
 const browser={register:async()=>({}),cancel:vi.fn()};
 const {host,root}=await mount(<SecurityEnrollment authority={{kind:outcome==='enrolled'?'grant':'pending',token:'b'.repeat(43)}} client={client as any} browser={browser as any}/>);
 try {await click(host,'Create a passkey');expect(completePasskeyEnrollment).toHaveBeenCalledOnce();expect(resets).toEqual(outcome==='authenticated'?[null]:[]);expect(sessionStorage.getItem(key)).toBe(outcome==='authenticated'||outcome==='uncertain'?null:'prior-person-conversation');}
 finally{stop();await unmount(root,host);sessionStorage.clear();}
});
