// @vitest-environment jsdom
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { beforeEach,afterEach,expect,it,vi } from "vitest";
import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import catalog from "../../apps/ui/messages/en/newDebate.json";
import homeCatalog from "../../apps/ui/messages/en/home.json";
import chromeCatalog from "../../apps/ui/messages/en/chrome.json";
const state=vi.hoisted(()=>({expiry:"",tierReads:[] as string[]}));
vi.mock("next/navigation",()=>({useRouter:()=>({push(){}}),useSearchParams:()=>new URLSearchParams("topic=Synthetic%20funded%20question")}));
vi.mock("@/components/AuthGate",()=>({AuthGate:({children}:{children:(token:string)=>React.ReactNode})=>children("fixture-token")}));
vi.mock("@/lib/api",async(importOriginal)=>({...await importOriginal<typeof import("../../apps/ui/lib/api.js")>(),contractClient:{
 readSession:async()=>({asker_id:"owner:fixture",session_id:"11111111-1111-4111-8111-111111111111",caller_scope:"ASKER",ownership_provenance:"server_session",provisional_identity_model:false}),
 readSensitiveDataConsent:async()=>({status:"given"}),
 getAskRoom:async(query:{plan_tier:string})=>{state.tierReads.push(query.plan_tier);return {room:"FITS",scope:null,resets_at:null,waiting_run_ref:null,plan_id:null,funding:{kind:"INTERNAL",expires_at:state.expiry}};},
 getBillingUsage:async()=>({plan_id:null,funding:{kind:"INTERNAL",expires_at:state.expiry},windows:[{scope:"PERSON_DAY",percent:0,resets_at:state.expiry},{scope:"PERSON_WEEK",percent:0,resets_at:state.expiry},{scope:"PERSON_GRANT",percent:0,resets_at:state.expiry}]})
}}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);state.expiry=new Date(Date.now()+31*86400000).toISOString();state.tierReads=[];host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());document.body.replaceChildren();vi.unstubAllGlobals();});
it("shows funded premium selection with no fictitious subscription or tier chooser for a full-lifetime grant",async()=>{
 await act(async()=>root.render(<NewDebatePage catalog={catalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog}/>));
 expect(host.querySelector('[role="radiogroup"][aria-label="Plan tier"]')).toBeNull();
 expect(host.querySelector('.ndTier')).toBeNull();expect(host.querySelector('.ndPlanCurrent')?.textContent).toContain("Internal funding");
 expect(state.tierReads).toContain("premium");expect(host.textContent).not.toContain("newDebate.plan.current.MAX");
});
