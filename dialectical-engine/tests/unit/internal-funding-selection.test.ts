import { afterEach,describe,expect,it,vi } from "vitest";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";
import { buildApi } from "@debateai/api";
import { staffHttpAskApplication } from "../support/staffHttpApplication.js";
import { testHttpIdentity,testSessionApplication,testSessionHeaders,TEST_APP_ORIGIN } from "../support/httpSession.js";
const user="11111111-1111-4111-8111-111111111111";
const enrollment={user_id:user,readiness:{account_active:true,email_verified:true,totp_active:true,security_hold:false,verified_credential_count:2,owner_credential_requirement_met:true,delegated_credential_requirement_met:true}};
afterEach(()=>vi.unstubAllGlobals());
describe("server-selected funding is available before the first grant and elevation",()=>{
 it("parses literal enrollment selection and constructs the explicit funded client",async()=>{
  const selected={...enrollment,funding_policy_version:1};
  const elevation={staff_id:user,capabilities:["TEAM_READ","TEAM_INVITE","TEAM_GRANT","TEAM_DISABLE","AUDIT_READ","EMERGENCY_DISABLE","ALLOWANCE_WRITE"],grant_revision:0,expires_at:"2099-01-01T00:00:00.000Z"};
  const client=createStaffApiClient({fetchImplementation:(async(input)=>Response.json(String(input).endsWith("enrollment")?selected:elevation)) as typeof fetch});
  const metadata=await client.enrollment();expect(metadata).toEqual(selected);
  const chosen=(client as any).withFundingPolicyVersion((metadata as any).funding_policy_version);
  await expect(chosen.finishElevation({challenge_handle:"a".repeat(43),credential:{id:"aA",rawId:"aA",type:"public-key",response:{clientDataJSON:"aA",authenticatorData:"aA",signature:"aA",userHandle:null},clientExtensionResults:{}}})).resolves.toEqual(elevation);
 });
 it("refuses malformed, unknown and extra selection metadata while missing marker retains strict CoreA",async()=>{
  for(const payload of [{...enrollment,funding_policy_version:2},{...enrollment,funding_policy_version:null},{...enrollment,funding_policy_version:1,role:"OWNER"}])
   await expect(createStaffApiClient({fetchImplementation:(async()=>Response.json(payload)) as typeof fetch}).enrollment()).rejects.toMatchObject({code:"INVALID_RESPONSE"});
  await expect(createStaffApiClient({fetchImplementation:(async()=>Response.json(enrollment)) as typeof fetch}).enrollment()).resolves.toEqual(enrollment);
 });
 it("cancellation invalidates outstanding selection reads",async()=>{
  let finish!:(value:Response)=>void;const client=createStaffApiClient({fetchImplementation:(async()=>new Promise(resolve=>{finish=resolve;})) as typeof fetch});
  const read=client.enrollment();client.cancel();finish(Response.json({...enrollment,funding_policy_version:1}));await expect(read).rejects.toThrow("STAFF_WEBAUTHN_CANCELLED");
 });
 it("existing self enrollment emits the marker only from mounted validated funding",async()=>{
  const account=testHttpIdentity("task11-selection");
  for(const funded of [false,true]){
   const api=buildApi({application:staffHttpAskApplication(),sessions:testSessionApplication([account]),allowedOrigin:TEST_APP_ORIGIN,staffPolicyVersion:2,
    staff:{sessions:testSessionApplication([account]),repository:{readEnrollment:async()=>({...enrollment,user_id:account.authenticated.userId})},...(funded?{funding:{}}:{})} as never});
   try{const result=await api.inject({method:"GET",url:"/v1/admin/enrollment",headers:testSessionHeaders(account)});expect(result.statusCode).toBe(200);expect(result.json()).toEqual({...enrollment,user_id:account.authenticated.userId,...(funded?{funding_policy_version:1}:{})});}finally{await api.close();}
  }
 });
});
