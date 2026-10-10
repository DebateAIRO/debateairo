// @vitest-environment jsdom
import { act } from "react";
import { createRoot,type Root } from "react-dom/client";
import { beforeEach,afterEach,describe,expect,it,vi } from "vitest";
import { StaffAccessPanel } from "../../apps/ui/components/StaffAccessPanel.js";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";
import { UsageBars } from "../../apps/ui/components/billing/UsageBars.js";
import { RoomNotice } from "../../apps/ui/components/billing/RoomNotice.js";
import english from "../../apps/ui/messages/en/billing.json";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());document.body.replaceChildren();vi.unstubAllGlobals();});
const credential={id:"aA",rawId:"aA",type:"public-key" as const,response:{clientDataJSON:"aA",authenticatorData:"aA",signature:"aA",userHandle:null},clientExtensionResults:{}};
const handle="a".repeat(43),id="11111111-1111-4111-8111-111111111111";
describe("enabled funding renders through actual reviewed UI composition",()=>{
 it("selects funded team/elevation before any grant and clears selection with ordinary session end",async()=>{
  const paths:string[]=[];const client=createStaffApiClient({browser:{authenticate:async()=>credential,register:async()=>{throw Error("unused");},cancel(){}},fetchImplementation:(async(input)=>{const path=String(input);paths.push(path);
   if(path.endsWith("enrollment"))return Response.json({user_id:id,funding_policy_version:1,readiness:{account_active:true,email_verified:true,totp_active:true,security_hold:false,verified_credential_count:2,owner_credential_requirement_met:true,delegated_credential_requirement_met:true}});
   if(path.endsWith("options"))return Response.json({challenge_handle:handle,options:{challenge:handle,rpId:"app.test",timeout:300000,userVerification:"required",allowCredentials:[{id:"aA",type:"public-key"}]}});
   if(path.endsWith("elevation/verify"))return Response.json({staff_id:id,capabilities:["TEAM_READ","TEAM_INVITE","TEAM_GRANT","TEAM_DISABLE","AUDIT_READ","EMERGENCY_DISABLE","ALLOWANCE_WRITE"],grant_revision:0,expires_at:"2099-01-01T00:00:00.000Z"});
   if(path.includes("team?"))return Response.json({members:[],next_cursor:null,order:"CREATED_AT_ID_ASC"});
   return Response.json({events:[],next_cursor:null,order:"RECORDED_AT_ID_ASC"});}) as typeof fetch});
  await act(async()=>root.render(<StaffAccessPanel client={client}/>));
  const button=[...host.querySelectorAll("button")].find(b=>b.textContent?.includes("Verify security key for team access"));expect(button).toBeDefined();
  await act(async()=>button!.click());
  const invite=[...host.querySelectorAll("button")].find(b=>b.textContent?.trim()==="Invite team member");expect(invite).toBeDefined();
  expect(host.querySelector('[data-staff-mutation="invite"]')).toBeNull();
  await act(async()=>invite!.click());expect(host.querySelector('[data-staff-mutation="invite"]')).not.toBeNull();expect(paths.some(p=>p.includes("team?"))).toBe(true);
  expect(paths.some(p=>p.includes("internal-allowances"))).toBe(false);
  await act(async()=>window.dispatchEvent(new Event("debateai:staff-session-ended")));expect(host.querySelector('[data-staff-mutation]')).toBeNull();
 });
 it("labels own grant total/expiry and removes subscription upgrades from internal room",async()=>{
  const expiry="2099-01-01T00:00:00.000Z",usage={plan_id:null,funding:{kind:"INTERNAL",expires_at:expiry},windows:[{scope:"PERSON_DAY",percent:10,resets_at:expiry},{scope:"PERSON_WEEK",percent:20,resets_at:expiry},{scope:"PERSON_GRANT",percent:30,resets_at:expiry}]} as const;
  await act(async()=>root.render(<><UsageBars catalog={english} locale="en" client={{getBillingUsage:async()=>usage} as never}/><RoomNotice catalog={english} locale="en" room={{room:"FULL",scope:"PERSON_GRANT",resets_at:expiry,waiting_run_ref:null,plan_id:null,funding:{kind:"INTERNAL",expires_at:expiry}}}/></>));
  expect(host.textContent).toContain("Internal funding");expect(host.textContent).toContain("Grant total");expect(host.textContent).toContain("Expires");expect(host.textContent).not.toContain("This month");expect(host.querySelector('a[href="/plans"]')).toBeNull();
 });
});
