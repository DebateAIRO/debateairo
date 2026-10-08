import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AskRoomResponseSchema, BillingUsageResponseSchema, AskRequestSchema } from "@debateai/contract";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue } from "@debateai/register";
import { resolveBillingAsk, decideRoomSettings } from "../../apps/api/src/ask-billing.js";
import { PersonUsageReader } from "../../apps/api/src/billing/usage.js";
const grantId=randomUUID(),grantEventId=randomUUID(), ownerRef=randomUUID(), now=new Date("2026-10-03T10:00:00Z"), expiresAt=new Date("2026-10-04T00:00:00Z");
const basis={kind:"INTERNAL",grantId,grantEventId} as const;
const plans=billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value,"test:task11");
const windows=[{scope:"PERSON_GRANT",limitMicros:1000,periodStart:new Date("2026-10-01T00:00:00Z"),resetsAt:expiresAt,finishBasisPoints:10000,closeBasisPoints:9500,funding:basis}] as const;
const funding={resolveAskFunding:async()=>basis,read:async()=>windows,readGrant:async()=>({expiresAt,grantId,grantEventId})};
describe("internal funding is explicit in actual ask/usage/wire consumers",()=>{
 it("accepts strict INTERNAL room and usage with null plan, grant scope and expiry; customer payloads stay unchanged",()=>{
  const usage={plan_id:null,funding:{kind:"INTERNAL",expires_at:expiresAt.toISOString()},windows:[{scope:"PERSON_GRANT",percent:100,resets_at:expiresAt.toISOString()}]};
  expect(BillingUsageResponseSchema.parse(usage)).toEqual(usage);
  for(const bad of [{...usage,plan_id:"MAX"},{...usage,funding:{kind:"INTERNAL"}},{...usage,funding:{kind:"INTERNAL",expires_at:expiresAt.toISOString(),grant_id:grantId}}, {...usage,windows:[{...usage.windows[0],percent:101}]}]) expect(BillingUsageResponseSchema.safeParse(bad).success).toBe(false);
  const room={room:"FULL",scope:"PERSON_GRANT",resets_at:expiresAt.toISOString(),waiting_run_ref:null,plan_id:null,funding:{kind:"INTERNAL",expires_at:expiresAt.toISOString()}};
  expect(AskRoomResponseSchema.parse(room)).toEqual(room);
  expect(AskRoomResponseSchema.safeParse({...room,funding:undefined}).success).toBe(false);
  expect(BillingUsageResponseSchema.parse({plan_id:"FREE",windows:[]})).toEqual({plan_id:"FREE",windows:[]});
 });
 it("raises the reviewed roster for a funded FREE customer without changing chosen risk/composition/depth",async()=>{
  const settings={plan_tier:"free",composition_budget_tier:"high",depth_params:{depth:4}} as const;
  const billing={plans,entitlements:{current:async()=>({planId:"FREE",eventId:randomUUID()})},funding,clock:()=>now};
  expect(await decideRoomSettings(settings,ownerRef,billing as never)).toEqual({...settings,plan_tier:"premium"});
 });
 it("counts usage against only the selected grant and reports finite expiry",async()=>{
  const reads:unknown[][]=[];
  const usage=new PersonUsageReader({entitlements:{current:async()=>({planId:"FREE"})},allowance:funding,
   funding,spend:{readOwnerSpentMicros:async(...args:unknown[])=>{reads.push(args);return 999;}}} as never);
  expect(await usage.read(ownerRef,now)).toEqual({planId:null,funding:{kind:"INTERNAL",expiresAt},windows:[{scope:"PERSON_GRANT",percent:99,resetsAt:expiresAt}]});
  expect(reads[0]?.[3]).toEqual(basis);
 });
 it("refuses usage mixing a selected grant with replacement windows",async()=>{
  const usage=new PersonUsageReader({entitlements:{current:async()=>({planId:"FREE"})},funding,allowance:{read:async()=>[{...windows[0],funding:{...basis,grantId:randomUUID()}}]},spend:{readOwnerSpentMicros:async()=>0}} as never);
  await expect(usage.read(ownerRef,now)).rejects.toThrow();
 });

 it("documents strict INTERNAL and unchanged customer usage/room endpoint branches",async()=>{
  const docs=JSON.parse(await readFile("packages/contract/generated/openapi.json","utf8"));
  for(const [path,name] of [["/v1/billing/usage","BillingUsageResponseSchema"],["/v1/asks/room","AskRoomResponseSchema"]] as const){
   expect(docs.paths[path].get.responses["200"].content["application/json"].schema).toEqual({$ref:`#/components/schemas/${name}`});
   const branches=docs.components.schemas[name].anyOf;expect(branches).toHaveLength(2);
   const internal=branches.find((b:any)=>b.required.includes("funding")),customer=branches.find((b:any)=>!b.required.includes("funding"));
   expect(internal.additionalProperties).toBe(false);expect(internal.properties.plan_id.type).toBe("null");expect(internal.properties.funding.required).toEqual(["kind","expires_at"]);
   expect(customer.properties.plan_id).not.toHaveProperty("const","INTERNAL");expect(customer.additionalProperties).toBe(false);
  }
 });

});
