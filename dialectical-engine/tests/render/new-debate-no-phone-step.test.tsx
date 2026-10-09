// @vitest-environment jsdom
// Owner ruling 2026-10-09: the phone is optional, so /new never stops a question to ask for one.
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ContractHttpError} from '@debateai/contract';
import NewDebatePage from '../../apps/ui/app/new/NewDebatePageClient';
import catalog from '../../apps/ui/messages/en/newDebate.json';import homeCatalog from '../../apps/ui/messages/en/home.json';import chromeCatalog from '../../apps/ui/messages/en/chrome.json';
const state=vi.hoisted(()=>({create:vi.fn(),push:vi.fn(),read:vi.fn(),phoneProfile:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:state.push}),useSearchParams:()=>new URLSearchParams('topic=My%20original%20question'),usePathname:()=>'/new'}));
vi.mock('@/components/AuthGate',()=>({AuthGate:({children}:any)=>children('session-marker')}));
vi.mock('@/components/support/SupportWidget',()=>({SupportWidget:()=>null}));
vi.mock('@/components/SensitiveDataConsent',()=>({useSensitiveDataConsent:()=>({ensureConsent:async()=>true,modal:null}),isSensitiveDataConsentRefusal:()=>false}));
vi.mock('@/components/CrisisSupport',()=>({useCrisisSupport:()=>({offerIfCrisis:()=>false,flags:()=>false,offer(){},modal:null}),isCrisisSupportRefusal:()=>false}));
vi.mock('@/lib/billing/room',()=>({useAskRoom:()=>[null,()=>{},async()=>null],readAskRoom:async()=>null,waitingRoomOf:()=>null}));
vi.mock('@/lib/api',async(original)=>({...await original<typeof import('../../apps/ui/lib/api')>(),createDebate:state.create,contractClient:{
 readSession:state.read,getBillingUsage:async()=>({plan_id:null,windows:[]}),phoneProfile:state.phoneProfile,
 authMethods:async()=>({methods:[],available_step_up_methods:['password_totp'],step_up_providers:[],recovery_codes_remaining:0})
}}));
let root:Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);document.body.innerHTML='<div id="root"></div>';root=createRoot(document.getElementById('root')!);sessionStorage.clear();
 state.read.mockReset().mockResolvedValue({asker_id:'fixture',session_id:'11111111-1111-4111-8111-111111111111',caller_scope:'ASKER',ownership_provenance:'server_session',provisional_identity_model:false});
 state.create.mockReset();state.push.mockReset();state.phoneProfile.mockReset().mockResolvedValue({phone_present:false,phone_masked:null,phone_verified:false,updated_at:null});});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});
async function submit(){await act(async()=>root.render(<NewDebatePage catalog={catalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog}/>));await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
function noPhoneStep(){
 expect(document.querySelector('input[type=tel]')).toBeNull();
 expect(document.body.textContent).not.toContain('Add your phone');
 expect(state.phoneProfile).not.toHaveBeenCalled();
 expect(sessionStorage.length).toBe(0);
}
it('a person without a phone starts the debate straight away',async()=>{
 state.create.mockResolvedValue({id:'fixture-debate'});
 await submit();
 expect(state.create).toHaveBeenCalledTimes(1);
 expect(state.push).toHaveBeenCalledWith('/debate/fixture-debate?starting=1');
 noPhoneStep();
});
it('an older server that still asks for a phone gets the ordinary failure line, never a phone step',async()=>{
 state.create.mockRejectedValue(new ContractHttpError('UNPROCESSABLE',422,'safe','ACCOUNT_PHONE_REQUIRED'));
 await submit();
 expect(state.create).toHaveBeenCalledTimes(1);
 expect(state.push).not.toHaveBeenCalled();
 expect(document.querySelector('.error')).not.toBeNull();
 expect(document.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('My original question');
 expect(document.querySelector<HTMLButtonElement>('.ndStart')!.disabled).toBe(false);
 noPhoneStep();
});
