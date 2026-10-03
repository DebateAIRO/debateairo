import { WorkItemRepository } from "@debateai/battery";
import { OpenAICompatibleProviderGateway } from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { createPool,migrate,EntitlementRepository,PostgresInternalAllowanceRepository,type Pool } from "@debateai/db";
import { CostEnvelopeGuard,PostgresModelSpendStore } from "@debateai/budget";
import * as billing from "@debateai/billing-core";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,billingPlansFromValue } from "@debateai/register";
import { startTestDatabase,type TestDatabase } from "../support/testDatabase.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
let database:TestDatabase,runtime:Pool,fixture:ReturnType<typeof internalFundingFixture>;
beforeAll(async()=>{database=await startTestDatabase();await migrate(database.pool);await database.pool.query("CREATE ROLE task11_races LOGIN PASSWORD 'private-fixture-only' IN ROLE debateai_runtime");const url=new URL(database.connectionString);url.username="task11_races";url.password="private-fixture-only";runtime=createPool(url.toString());fixture=internalFundingFixture(database.pool,runtime);},120000);
afterAll(async()=>{await runtime?.end();await database?.stop();});
async function pinned(change:Record<string,unknown>={}){const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor,change);await fixture.configure(actor,command);const allowances=new PostgresInternalAllowanceRepository(runtime,{registerVersion:2}),grant=(await allowances.current(actor.ownerRef,new Date()))!;const runId=await fixture.run(actor.ownerRef),entitlements=new EntitlementRepository(runtime),tx=await runtime.connect();try{await entitlements.recordRunChargeScope(tx,{runId,ownerRef:actor.ownerRef,basis:{kind:"INTERNAL",grantId:grant.grantId,grantEventId:grant.grantEventId},admittedAt:new Date()});}finally{tx.release();}return {actor,command,runId,grant,allowances,entitlements};}
const reserve=(call:string,run:string,amount:number)=>runtime.query("SELECT billing.reserve_internal_provider_call($1::uuid,$2::uuid,$3::bigint,'RUN','BODY') AS internal",[call,run,amount]);
const settle=(call:string,amount:number,runId:string)=>runtime.query("SELECT billing.settle_internal_provider_call($1::uuid,$2::uuid,'RUN','BODY','fake-provider',$3::bigint,1::bigint,1::bigint)",[call,runId,amount]);
describe("finite grants serialize fake provider admissions and settle admitted cost once",()=>{
 it("admits only one competing projection and rejects call replay before provider bytes",async()=>{
  const p=await pinned({amountMicros:100,dayMicros:100,weekMicros:100}),a=randomUUID(),b=randomUUID();
  const results=await Promise.allSettled([reserve(a,p.runId,60),reserve(b,p.runId,60)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  const call=results[0].status==="fulfilled"?a:b;
  await expect(reserve(call,p.runId,60)).rejects.toThrow("INTERNAL_PROVIDER_ADMISSION_REPLAY");
  expect((await database.pool.query("SELECT count(*)::int AS n FROM billing.internal_provider_admission WHERE run_id=$1",[p.runId])).rows[0].n).toBe(1);
 });
 it("settles exactly once after revocation and keeps actual cost above projection",async()=>{
  const p=await pinned({amountMicros:100,dayMicros:100,weekMicros:100}),call=randomUUID();await reserve(call,p.runId,60);await fixture.revoke(p.actor,p.grant.grantId);
  await settle(call,110,p.runId);await settle(call,110,p.runId);await expect(settle(call,109,p.runId)).rejects.toThrow("INTERNAL_PROVIDER_SETTLEMENT_CONFLICT");
  expect((await database.pool.query("SELECT charge_micros::text AS amount FROM ledger.model_spend WHERE spend_id=$1",[call])).rows).toEqual([{amount:"110"}]);
  await expect(reserve(randomUUID(),p.runId,1)).rejects.toThrow();
 });
 it("counts late settlements beyond grant expiry in the grant total",async()=>{
  const p=await pinned({durationMs:1500}),call=randomUUID();await reserve(call,p.runId,60);
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(p.command.expiresAt)-Date.now())+30));await settle(call,70,p.runId);
  const spend=new PostgresModelSpendStore(runtime);
  expect(await (spend.readOwnerSpentMicros as any)(p.actor.ownerRef,new Date(p.command.startsAt),new Date(p.command.expiresAt),{kind:"INTERNAL",grantId:p.grant.grantId,grantEventId:p.grant.grantEventId},"PERSON_GRANT")).toBe(70);
  for(const scope of ["PERSON_DAY","PERSON_WEEK"])expect(await (spend.readOwnerSpentMicros as any)(p.actor.ownerRef,new Date(p.command.startsAt),new Date(p.command.expiresAt),{kind:"INTERNAL",grantId:p.grant.grantId,grantEventId:p.grant.grantEventId},scope)).toBe(70);
  await expect(reserve(randomUUID(),p.runId,1)).rejects.toThrow();
 });
 it("denies held/replaced pinned grants, preserving conservative unknown-usage reservation",async()=>{
  const p=await pinned({amountMicros:100,dayMicros:100,weekMicros:100}),call=randomUUID();await reserve(call,p.runId,60);
  await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)",[p.actor.userId]);
  await expect(reserve(randomUUID(),p.runId,1)).rejects.toThrow();await settle(call,30,p.runId);
  await database.pool.query("UPDATE identity.account_security_hold SET held=false WHERE user_id=$1",[p.actor.userId]);
  await fixture.revoke(p.actor,p.grant.grantId);await fixture.configure(p.actor,fixture.configureCommand(p.actor,{expectedRevision:2}));
  await expect(reserve(randomUUID(),p.runId,1)).rejects.toThrow();
  expect(await p.entitlements.readRunFundingBasis(p.runId)).toEqual({kind:"INTERNAL",grantId:p.grant.grantId,grantEventId:p.grant.grantEventId});
 });
 it("walls first-position, SERVE and STORY calls with the same pinned grant and settles after expiry",async()=>{
  const p=await pinned(),C=(billing as any).FundingAwarePersonAllowanceSource,source=new C({allowances:p.allowances,entitlements:p.entitlements,plans:billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value,"test:task11"),registerVersion:2,closeBasisPoints:9500}),store=new PostgresModelSpendStore(runtime);
  const guard=new CostEnvelopeGuard({store,policy:{perRunCeilingMicros:250000,dailyCeilingMicros:10000000,perStoryCeilingMicros:250000},fundingAdmission:source});
  const price={inputMicrosPerMillionTokens:1000000,outputMicrosPerMillionTokens:1000000},projection={requestBytes:2,completionTokenCeiling:1};
  const first=guard.providerSeam({runId:p.runId,price,phase:"BODY",sharedWall:"EXEMPT",requireReportedUsage:true});const admission=await first.assertCallAllowed(projection);
  await fixture.revoke(p.actor,p.grant.grantId);
  await first.recordCall({admission:admission as never,providerRef:"fake-provider",usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},projection});
  await first.recordCall({admission:admission as never,providerRef:"fake-provider",usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},projection});
  for(const seam of [guard.providerSeam({runId:p.runId,price,phase:"SERVE",requireReportedUsage:true}),guard.storySeam({runId:p.runId,price,requireReportedUsage:true})]) await expect(seam.assertCallAllowed(projection)).rejects.toThrow();
  expect((await database.pool.query("SELECT count(*)::int AS n FROM ledger.model_spend WHERE run_id=$1",[p.runId])).rows[0].n).toBe(1);
 });
 it("refuses new SUBSCRIPTION and owned-legacy provider calls on hold or erasure, while settled work stays chargeable",async()=>{
  for(const pinnedSubscription of [true,false]){
   const actor=await fixture.fundedActor(),runId=await fixture.run(actor.ownerRef,"free"),entitlements=new EntitlementRepository(runtime);
   if(pinnedSubscription){const e=await entitlements.current(actor.ownerRef,new Date()),tx=await runtime.connect();try{await entitlements.recordRunChargeScope(tx,{runId,ownerRef:actor.ownerRef,planId:e.planId,entitlementEventId:e.eventId,admittedAt:new Date()});}finally{tx.release();}}
   const guard=new CostEnvelopeGuard({store:new PostgresModelSpendStore(runtime),policy:{perRunCeilingMicros:250000,dailyCeilingMicros:10000000}}),projection={requestBytes:2,completionTokenCeiling:1},seam=guard.providerSeam({runId,phase:"BODY",sharedWall:"EXEMPT",requireReportedUsage:true,price:{inputMicrosPerMillionTokens:1000000,outputMicrosPerMillionTokens:1000000}});
   const admission=await seam.assertCallAllowed(projection);await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)",[actor.userId]);
   await expect(seam.assertCallAllowed(projection)).rejects.toThrow();
   await seam.recordCall({admission:admission as never,providerRef:"fake-provider",usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},projection});
   expect((await database.pool.query("SELECT count(*)::int AS n FROM ledger.model_spend WHERE run_id=$1",[runId])).rows[0].n).toBe(1);
   await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1',[actor.userId]);await expect(seam.assertCallAllowed(projection)).rejects.toThrow();
  }
 });
 it("retains existing unowned legacy zero-cost local calls",async()=>{
  const actor=await fixture.fundedActor(),runId=await fixture.run(actor.ownerRef,"free");
  // A separate actual legacy run has no ownership event or charge pin.
  const {RunRepository}=await import("@debateai/db");const {fixtureDiscoveredPanel,fixtureStructuralCeiling}=await import("../support/discoveredPanel.js");
  const legacy=await new RunRepository(database.pool).startRun({questionLine:"Can a free local fake provider run?",principal:{kind:"legacy",legacyAskerId:`unowned:${randomUUID()}`},sessionId:randomUUID(),callerScope:"ASKER",asOf:new Date(),askerRiskTier:"casual",effectiveRiskTier:"casual",tierSource:"ASKER",tierProvenanceRef:"asker:test",compositionBudgetTier:"low",planTier:"free",depthParams:{depth:1},discoveredPanel:fixtureDiscoveredPanel(2),strangerSampleRate:0,envelopeBasis:fixtureStructuralCeiling(4),registerVersion:2,batteryVersion:"test",askContract:{},batteryRows:[]});
  const guard=new CostEnvelopeGuard({store:new PostgresModelSpendStore(runtime),policy:{perRunCeilingMicros:250000,dailyCeilingMicros:10000000}});
  await expect(guard.providerSeam({runId:legacy,phase:"BODY",requireReportedUsage:false,price:{inputMicrosPerMillionTokens:0,outputMicrosPerMillionTokens:0}}).assertCallAllowed({requestBytes:2,completionTokenCeiling:1})).resolves.toMatchObject({kind:"ORDINARY"});
 });

 it("associates overlapping delayed fake gateway responses with each immutable admission frame",async()=>{
  const p=await pinned(),store=new PostgresModelSpendStore(runtime),guard=new CostEnvelopeGuard({store,policy:{perRunCeilingMicros:250000,dailyCeilingMicros:10000000}}),seam=guard.providerSeam({runId:p.runId,price:{inputMicrosPerMillionTokens:1000000,outputMicrosPerMillionTokens:1000000},phase:"BODY",requireReportedUsage:true});
  const pending:Array<{bytes:number;finish:(r:Response)=>void;completion:number}>=[];let entered!:()=>void;const bothEntered=new Promise<void>(resolve=>{entered=resolve;});
  const gateway=new OpenAICompatibleProviderGateway({endpoint:"https://fake-provider.test/v1",model:"configured/model",maker:"fixture",persistRawArtifact:async a=>a.artifactId,appendLedgerEntry:async()=>"fixture-ledger",assertNoOpenWriteTransaction:()=>{},sleepImplementation:async()=>{},fetchImplementation:(async(_input,init)=>new Promise<Response>(resolve=>{const body=String(init?.body),completion=body.includes("BBBBBBBBBB")?19:1;pending.push({bytes:Buffer.byteLength(body),finish:resolve,completion});if(pending.length===2)entered();})) as typeof fetch});
  const request=(packet:string)=>({runId:p.runId,subjectItemId:"node:test",callSiteKey:"fixture:judge",role:"JUDGE" as const,lane:"served" as const,bound:{maxAttempts:1,tokenCeiling:64,deadlineMs:5000},contractHash:"contract:test",providerRef:"fake-provider",packet:framedFixturePacket(packet),costEnvelope:seam});
  const a=gateway.call(request("A")),b=gateway.call(request("B".repeat(100)));await bothEntered;
  const reply=(completion:number)=>Response.json({id:"fixture",model:"configured/model",usage:{prompt_tokens:1,completion_tokens:completion,total_tokens:completion+1},choices:[{message:{content:'{"ok":true}'},finish_reason:"stop"}]});
  pending[1]!.finish(reply(pending[1]!.completion));await b;pending[0]!.finish(reply(pending[0]!.completion));await a;
  const rows=(await database.pool.query("SELECT a.projected_micros::text AS projected,s.charge_micros::text AS charged FROM billing.internal_provider_admission a LEFT JOIN ledger.model_spend s ON s.spend_id=a.call_id WHERE a.run_id=$1 ORDER BY projected_micros",[p.runId])).rows;
  expect(rows).toEqual(pending.map(call=>({projected:String(Math.ceil(call.bytes/2)+64),charged:String(call.completion+1)})).sort((x,y)=>Number(x.projected)-Number(y.projected)));
 });
 it("does not retry paid bytes when INTERNAL settlement has an unknown committed outcome",async()=>{
  const p=await pinned(),actual=new PostgresModelSpendStore(runtime);let captured:{id:string;entry:any}|undefined,bytes=0;
  const store={recordSpend:actual.recordSpend.bind(actual),readRunSpentMicros:actual.readRunSpentMicros.bind(actual),readRunStorySpentMicros:actual.readRunStorySpentMicros.bind(actual),readDaySpentMicros:actual.readDaySpentMicros.bind(actual),admitNewRun:actual.admitNewRun.bind(actual),reserveInternalCall:actual.reserveInternalCall.bind(actual),settleInternalCall:async(id:string,entry:any)=>{captured={id,entry};await actual.settleInternalCall(id,entry);throw Error("synthetic unknown commit transport");}};
  const guard=new CostEnvelopeGuard({store,policy:{perRunCeilingMicros:250000,dailyCeilingMicros:10000000}}),seam=guard.providerSeam({runId:p.runId,price:{inputMicrosPerMillionTokens:1000000,outputMicrosPerMillionTokens:1000000},phase:"BODY",requireReportedUsage:true});
  const gateway=new OpenAICompatibleProviderGateway({endpoint:"https://fake-provider.test/v1",model:"configured/model",maker:"fixture",persistRawArtifact:async a=>a.artifactId,appendLedgerEntry:async()=>"fixture-ledger",assertNoOpenWriteTransaction:()=>{},sleepImplementation:async()=>{},fetchImplementation:(async()=>{bytes++;return Response.json({id:"fixture",model:"configured/model",usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},choices:[{message:{content:'{"ok":true}'},finish_reason:"stop"}]});}) as typeof fetch});
  await expect(gateway.call({runId:p.runId,subjectItemId:"node:test",callSiteKey:"fixture:judge",role:"JUDGE",lane:"served",bound:{maxAttempts:3,tokenCeiling:64,deadlineMs:5000},contractHash:"contract:test",providerRef:"fake-provider",packet:framedFixturePacket("A"),costEnvelope:seam})).rejects.toMatchObject({code:"INTERNAL_PROVIDER_SETTLEMENT_UNCERTAIN"});
  expect(bytes).toBe(1);expect(captured).toBeDefined();await actual.settleInternalCall(captured!.id,captured!.entry);expect((await database.pool.query("SELECT count(*)::int AS n FROM ledger.model_spend WHERE run_id=$1",[p.runId])).rows[0].n).toBe(1);
 });

 it("refuses foreign or missing frames and binds settlement to run/source/phase",async()=>{
  const p=await pinned(),store=new PostgresModelSpendStore(runtime),guard=new CostEnvelopeGuard({store,policy:{perRunCeilingMicros:250000,dailyCeilingMicros:10000000}}),price={inputMicrosPerMillionTokens:1000000,outputMicrosPerMillionTokens:1000000},projection={requestBytes:2,completionTokenCeiling:1};
  const first=guard.providerSeam({runId:p.runId,price,phase:"BODY",requireReportedUsage:true}),second=guard.providerSeam({runId:p.runId,price,phase:"SERVE",requireReportedUsage:true}),admission=await first.assertCallAllowed(projection);
  const observed={providerRef:"fake-provider",usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},projection};
  await expect(first.recordCall(observed)).rejects.toMatchObject({code:"INTERNAL_PROVIDER_FRAME_INVALID"});
  await expect(second.recordCall({...observed,admission:admission as never})).rejects.toMatchObject({code:"INTERNAL_PROVIDER_FRAME_INVALID"});
  const call=(admission as {callId:string}).callId;
  for(const [runId,source,phase] of [[randomUUID(),"RUN","BODY"],[p.runId,"STORY",null],[p.runId,"RUN","SERVE"]])
   await expect(runtime.query("SELECT billing.settle_internal_provider_call($1::uuid,$2::uuid,$3::text,$4::text,'fake-provider',2::bigint,1::bigint,1::bigint)",[call,runId,source,phase])).rejects.toThrow("INTERNAL_PROVIDER_FRAME_INVALID");
  await first.recordCall({...observed,admission:admission as never});expect((await database.pool.query("SELECT count(*)::int AS n FROM ledger.model_spend WHERE run_id=$1",[p.runId])).rows[0].n).toBe(1);
 });

 it("uses post-security-lock DB time to refuse a grant that expires while admission waits",async()=>{
  const p=await pinned({durationMs:2000}),lock=await database.pool.connect();let outcome:Promise<string>|undefined;
  try{await lock.query("BEGIN");await lock.query("SELECT identity.lock_security_subjects($1::uuid[])",[[p.actor.userId]]);
   outcome=reserve(randomUUID(),p.runId,1).then(()=>"ADMITTED",()=>"REFUSED");
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(p.command.expiresAt)-Date.now())+30));await lock.query("COMMIT");
   expect(await outcome).toBe("REFUSED");expect((await database.pool.query("SELECT count(*)::int AS n FROM billing.internal_provider_admission WHERE run_id=$1",[p.runId])).rows[0].n).toBe(0);
  }finally{await lock.query("ROLLBACK");lock.release();}
 });
 it("counts other-run live hold or outstanding calls once, and conservatively keeps unreported projections",async()=>{
  const p=await pinned({amountMicros:1000,dayMicros:1000,weekMicros:1000}),other=await fixture.run(p.actor.ownerRef),store=new PostgresModelSpendStore(runtime),tx=await runtime.connect(),basis={kind:"INTERNAL",grantId:p.grant.grantId,grantEventId:p.grant.grantEventId} as const;
  try{await p.entitlements.recordRunChargeScope(tx,{runId:other,ownerRef:p.actor.ownerRef,basis,admittedAt:new Date()});await store.openHold(tx,{runId:other,heldMicros:800});}finally{tx.release();}
  await new WorkItemRepository(database.pool).enqueue({runId:other,batteryRowId:"Q1",commandKey:`S00:${other}:Q1`,nodeSet:[]});
  await expect(reserve(randomUUID(),p.runId,201)).rejects.toThrow("INTERNAL_ALLOWANCE_REACHED");await reserve(randomUUID(),other,800);
  expect(await store.readOwnerCountedHoldsMicros(p.actor.ownerRef,basis)).toBe(800);await reserve(randomUUID(),p.runId,200);expect(await store.readOwnerCountedHoldsMicros(p.actor.ownerRef,basis)).toBe(1000);
  await expect(reserve(randomUUID(),p.runId,1)).rejects.toThrow("INTERNAL_ALLOWANCE_REACHED");
 });
 it("keeps the new admission table private, immutable and recovery-closed with exactly five scoped definers",async()=>{
  for(const sql of ["SELECT * FROM billing.internal_provider_admission","INSERT INTO billing.internal_provider_admission(call_id) VALUES(gen_random_uuid())","DELETE FROM billing.internal_provider_admission","TRUNCATE billing.internal_provider_admission"])
   await expect(runtime.query(sql)).rejects.toMatchObject({code:"42501"});
  const functions=(await database.pool.query(`SELECT p.oid::regprocedure::text AS signature,p.proname,pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS definer,p.proconfig AS settings,
   EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public,
   has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime,has_function_privilege('debateai_staff_recovery',p.oid,'EXECUTE') AS recovery
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='billing' AND p.proname=ANY($1::text[]) ORDER BY p.proname`,[['reserve_internal_provider_call','settle_internal_provider_call','read_internal_grant_spent','read_internal_grant_commitments','read_internal_run_state']])).rows;
  expect(functions).toHaveLength(5);for(const f of functions)expect(f).toMatchObject({owner:"debateai_staff_security_owner",definer:true,settings:["search_path=pg_catalog"],public:false,runtime:true,recovery:false});
  await expect(database.pool.query("UPDATE billing.internal_provider_admission SET projected_micros=1")).rejects.toThrow();await expect(database.pool.query("TRUNCATE billing.internal_provider_admission")).rejects.toThrow();
  console.info("[TASK11_SQL_CAPABILITIES]",JSON.stringify(functions));
 });

});
