import { PostgresAskApplication } from "@debateai/api";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, migrate, EntitlementRepository, PostgresInternalAllowanceRepository, RunWaitRepository, recordSpendWaiver, type Pool } from "@debateai/db";
import { PostgresModelSpendStore } from "@debateai/budget";
import * as billing from "@debateai/billing-core";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,billingPlansFromValue } from "@debateai/register";
import { AskRoom } from "../../apps/api/src/ask-room.js";
import { PersonUsageReader } from "../../apps/api/src/billing/usage.js";
import { startTestDatabase,type TestDatabase } from "../support/testDatabase.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { testReleaseKey } from "../support/releaseKey.js";
let database:TestDatabase,runtime:Pool,fixture:ReturnType<typeof internalFundingFixture>;
const plans=billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value,"test:task11");
beforeAll(async()=>{database=await startTestDatabase();await migrate(database.pool);await database.pool.query("CREATE ROLE task11_admission LOGIN PASSWORD 'private-fixture-only' IN ROLE debateai_runtime,debateai_billing_runtime");const url=new URL(database.connectionString);url.username="task11_admission";url.password="private-fixture-only";runtime=createPool(url.toString());fixture=internalFundingFixture(database.pool,runtime);},120000);
afterEach(async()=>{await database.pool.query("INSERT INTO core.run_wait_start(run_id,started_at) SELECT run_id,clock_timestamp() FROM core.run_waiting_v");});
afterAll(async()=>{await runtime?.end();await database?.stop();});
function source(){const C=(billing as unknown as {FundingAwarePersonAllowanceSource:new(input:unknown)=>any}).FundingAwarePersonAllowanceSource;return new C({allowances:new PostgresInternalAllowanceRepository(runtime),entitlements:new EntitlementRepository(runtime),plans,closeBasisPoints:9500});}
const settingsClass={planTier:"premium",compositionBudgetTier:"low",makerCount:2,depth:1} as const;
function room(personAllowance:ReturnType<typeof source>,ceiling=10000000){return new AskRoom({lockPool:database.pool,spend:new PostgresModelSpendStore(runtime),line:new RunWaitRepository(runtime),estimator:{estimateMicros:async()=>1000},personAllowance,entitlements:new EntitlementRepository(runtime),funding:personAllowance,billingPlans:plans,dailyCeilingMicros:ceiling,closeBasisPoints:9500,waitingLinePerPerson:1} as never);}
describe("actual grant-aware room and waiting admission",()=>{
 it("pins an INTERNAL wait at entry and refuses a revoked pin at wake",async()=>{
  const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor);await fixture.configure(actor,command);
  const funding=source(),r=room(funding,1),runId=await fixture.run(actor.ownerRef),access={ownerRef:actor.ownerRef,legacyAskerId:null};
  // Full site day, before any provider can be dispatched.
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)");
  await r.decide({access,settingsClass},async({admission,tx,now})=>{expect(admission.kind).toBe("WAIT");await r.enterWait(tx,runId,now);});
  const pin=await new EntitlementRepository(runtime).readRunFundingBasis(runId);expect(pin).toMatchObject({kind:"INTERNAL",grantId:command.operationId});
  await fixture.revoke(actor,command.operationId);
  const waiting=await new RunWaitRepository(runtime).readWaiting(runId);expect(waiting).not.toBeNull();
  await expect(r.startWaiting(waiting!,async()=>"fake-dispatch")).resolves.toEqual({kind:"FUNDING_FAILED"});
  expect(await new EntitlementRepository(runtime).readRunFundingBasis(runId)).toEqual(pin);
  expect((await database.pool.query("SELECT count(*)::int AS n FROM ledger.model_spend_hold WHERE run_id=$1",[runId])).rows[0].n).toBe(0);
 });
 it("does not charge unrelated subscription spend to the current grant",async()=>{
  const actor=await fixture.fundedActor(),runId=await fixture.run(actor.ownerRef,"free"),entitlements=new EntitlementRepository(runtime),current=await entitlements.current(actor.ownerRef,new Date()),tx=await runtime.connect();
  try{await entitlements.recordRunChargeScope(tx,{runId,ownerRef:actor.ownerRef,planId:current.planId,entitlementEventId:current.eventId,admittedAt:new Date()});}finally{tx.release();}
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'RUN',$1,'fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,500000,1,1)",[runId]);
  const command=fixture.configureCommand(actor);await fixture.configure(actor,command);
  const r=room(source());expect(await r.readRoom({access:{ownerRef:actor.ownerRef,legacyAskerId:null},settingsClass})).toMatchObject({room:"FITS",planId:null,funding:{kind:"INTERNAL"}});
 });
 it("keeps SUBSCRIPTION waiting on customer windows after a later grant, including current upgrade and downgrade rules",async()=>{
  const actor=await fixture.fundedActor(),funding=source(),r=room(funding,1),entitlements=new EntitlementRepository(runtime),access={ownerRef:actor.ownerRef,legacyAskerId:null};
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)");
  const initial=await entitlements.current(actor.ownerRef,new Date()),runId=await fixture.run(actor.ownerRef,"free");
  await r.decide({access,settingsClass:{...settingsClass,planTier:"free"}},async({tx,now})=>r.enterWait(tx,runId,now));
  const pin=await entitlements.readRunFundingBasis(runId);expect(pin).toEqual({kind:"SUBSCRIPTION",planId:"FREE",entitlementEventId:initial.eventId});
  await fixture.configure(actor,fixture.configureCommand(actor));
  const currentWindows=await funding.read(actor.ownerRef,new Date(),{runId});expect(currentWindows.map((w:any)=>w.scope)).toEqual(["PERSON_MONTH"]);
  const waiting=await new RunWaitRepository(runtime).readWaiting(runId);expect((await room(funding).startWaiting(waiting!,async()=>"fake-provider-queued")).kind).toBe("STARTED");expect(await entitlements.readRunFundingBasis(runId)).toEqual(pin);
  // A different ordinary customer's premium waiting run must still follow its current subscription.
  const ordinary=await fixture.fundedActor(),now=new Date(),tx=await runtime.connect();let event:string;
  try{event=await entitlements.append(tx,{ownerRef:ordinary.ownerRef,planId:"PLUS",effectiveAt:now,periodAnchorAt:now,cause:"SUBSCRIBED",subscriptionId:null,paidThrough:new Date(now.getTime()+86400000)});}finally{tx.release();}
  const premium=await fixture.run(ordinary.ownerRef),ordinaryAccess={ownerRef:ordinary.ownerRef,legacyAskerId:null};
  await r.decide({access:ordinaryAccess,settingsClass},async({tx,now})=>r.enterWait(tx,premium,now));
  const premiumPin=await entitlements.readRunFundingBasis(premium);expect(premiumPin).toEqual({kind:"SUBSCRIPTION",planId:"PLUS",entitlementEventId:event!});
  const upgrade=new Date(),upgradeTx=await runtime.connect();try{await entitlements.append(upgradeTx,{ownerRef:ordinary.ownerRef,planId:"PRO",effectiveAt:upgrade,periodAnchorAt:upgrade,cause:"UPGRADED",subscriptionId:null,paidThrough:new Date(upgrade.getTime()+86400000)});}finally{upgradeTx.release();}
  const upgraded=await funding.read(ordinary.ownerRef,new Date(),{runId:premium});expect(upgraded.map((w:any)=>w.scope)).toEqual(["PERSON_DAY","PERSON_WEEK","PERSON_MONTH"]);
  const lapse=new Date(),lapseTx=await runtime.connect();try{await entitlements.append(lapseTx,{ownerRef:ordinary.ownerRef,planId:"FREE",effectiveAt:lapse,periodAnchorAt:lapse,cause:"ENDED_CANCEL",subscriptionId:null,paidThrough:null});}finally{lapseTx.release();}
  expect(await room(funding).startWaiting((await new RunWaitRepository(runtime).readWaiting(premium))!,async()=>"must-not-dispatch")).toEqual({kind:"PLAN_CHANGED"});expect(await entitlements.readRunFundingBasis(premium)).toEqual(premiumPin);
 });
 it("does not debit a revoked internal grant's spend to the ordinary customer allowance",async()=>{
  const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor);await fixture.configure(actor,command);const allowances=new PostgresInternalAllowanceRepository(runtime),grant=(await allowances.current(actor.ownerRef,new Date()))!,runId=await fixture.run(actor.ownerRef),tx=await runtime.connect();
  try{await new EntitlementRepository(runtime).recordRunChargeScope(tx,{runId,ownerRef:actor.ownerRef,basis:{kind:"INTERNAL",grantId:grant.grantId,grantEventId:grant.grantEventId},admittedAt:new Date()});}finally{tx.release();}
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'RUN',$1,'fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,10000,1,1)",[runId]);
  await fixture.revoke(actor,grant.grantId);const window=(await source().read(actor.ownerRef,new Date()))[0];
  expect(await new PostgresModelSpendStore(runtime).readOwnerSpentMicros(actor.ownerRef,window.periodStart,window.resetsAt)).toBe(0);
  expect(await new PostgresModelSpendStore(runtime).readDaySpentMicros(new Date().toISOString().slice(0,10))).toBeGreaterThanOrEqual(10000);
 });

 it("terminal-fails a revoked funded wait through the actual waker, frees the next waiter and preserves private question/pin",async()=>{
  const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor);await fixture.configure(actor,command);const funding=source(),line=new RunWaitRepository(runtime),r=room(funding,1),access={ownerRef:actor.ownerRef,legacyAskerId:null},ended=await fixture.run(actor.ownerRef);
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)");
  await r.decide({access,settingsClass},async({tx,now})=>r.enterWait(tx,ended,now));const pin=await new EntitlementRepository(runtime).readRunFundingBasis(ended),question=(await database.pool.query("SELECT question_line FROM core.run WHERE run_id=$1",[ended])).rows;
  await fixture.revoke(actor,command.operationId);const nextOwner=await fixture.fundedActor(),next=await fixture.run(nextOwner.ownerRef,"free");
  await r.decide({access:{ownerRef:nextOwner.ownerRef,legacyAskerId:null},settingsClass:{...settingsClass,planTier:"free"}},async({tx,now})=>r.enterWait(tx,next,now));
  const pools=[createPool(database.connectionString),createPool(database.connectionString),createPool(database.connectionString)],dispatched:string[]=[];
  try{const app=new PostgresAskApplication(runtime,{dispatch:async({runId})=>{dispatched.push(runId);}}, {releaseKey:testReleaseKey(2),waitingLine:room(funding),registerVersion:2} as never,undefined,pools[0]!,{server:pools[1]!,legacy:pools[2]!});
   expect(await app.wakeWaitingRuns()).toMatchObject({started:1,failed:1,stopped:false});expect(dispatched).toEqual([next]);expect(await line.readWaiting(ended)).toBeNull();
   expect((await database.pool.query("SELECT state,terminal_reason FROM core.work_item WHERE run_id=$1",[ended])).rows).toEqual([{state:"FAILED",terminal_reason:"RUN_SETUP_FAILED:FUNDING_ENDED"}]);
   expect(await new EntitlementRepository(runtime).readRunFundingBasis(ended)).toEqual(pin);expect((await database.pool.query("SELECT question_line FROM core.run WHERE run_id=$1",[ended])).rows).toEqual(question);
  }finally{await Promise.all(pools.map(p=>p.end()));}
 });
 it("keeps held waits on their original pin, nonblocking even when due, then resumes only that pin",async()=>{
  const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor);await fixture.configure(actor,command);const funding=source(),r=room(funding,1),line=new RunWaitRepository(runtime),runId=await fixture.run(actor.ownerRef);
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)");
  await r.decide({access:{ownerRef:actor.ownerRef,legacyAskerId:null},settingsClass},async({tx,now})=>r.enterWait(tx,runId,now));const pin=await new EntitlementRepository(runtime).readRunFundingBasis(runId);
  await database.pool.query("INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)",[actor.userId]);
  expect(await room(funding).startWaiting((await line.readWaiting(runId))!,async()=>"must-not-dispatch")).toEqual({kind:"ACCOUNT_HELD"});
  expect((await line.readWaiting(runId))?.waitsFor).toBe("PERSON");expect(await line.siteLineBlocking(new Date(Date.now()+120000))).toBe(false);
  expect((await database.pool.query("SELECT count(*)::int AS n FROM core.work_item WHERE run_id=$1",[runId])).rows[0].n).toBe(0);
  await database.pool.query("UPDATE identity.account_security_hold SET held=false WHERE user_id=$1",[actor.userId]);
  expect((await room(funding).startWaiting((await line.readWaiting(runId))!,async()=>"fake-same-pin-dispatch")).kind).toBe("STARTED");expect(await new EntitlementRepository(runtime).readRunFundingBasis(runId)).toEqual(pin);
 });
 it("keeps a true transport failure retryable and records no false terminal failure",async()=>{
  const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor);await fixture.configure(actor,command);const funding=source(),r=room(funding,1),line=new RunWaitRepository(runtime),runId=await fixture.run(actor.ownerRef);
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)");
  await r.decide({access:{ownerRef:actor.ownerRef,legacyAskerId:null},settingsClass},async({tx,now})=>r.enterWait(tx,runId,now));
  const failure=vi.spyOn(funding,"assertProviderFundingAdmission").mockRejectedValueOnce(new Error("synthetic network read failure")),pools=[createPool(database.connectionString),createPool(database.connectionString),createPool(database.connectionString)];
  try{const app=new PostgresAskApplication(runtime,{dispatch:async()=>{throw Error("must not dispatch");}}, {releaseKey:testReleaseKey(2),waitingLine:room(funding),registerVersion:2} as never,undefined,pools[0]!,{server:pools[1]!,legacy:pools[2]!});expect(await app.wakeWaitingRuns()).toMatchObject({started:0,failed:1});expect(await line.readWaiting(runId)).not.toBeNull();expect((await database.pool.query("SELECT count(*)::int AS n FROM core.work_item WHERE run_id=$1",[runId])).rows[0].n).toBe(0);
  }finally{failure.mockRestore();await Promise.all(pools.map(p=>p.end()));}
 });

 it("reads line status without waiting for an unrelated subject advisory lock",async()=>{
  const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor);await fixture.configure(actor,command);const r=room(source(),1),line=new RunWaitRepository(runtime),runId=await fixture.run(actor.ownerRef);
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)");
  await r.decide({access:{ownerRef:actor.ownerRef,legacyAskerId:null},settingsClass},async({tx,now})=>r.enterWait(tx,runId,now));
  const lock=await database.pool.connect();let read:Promise<boolean>|undefined;
  try{await lock.query("BEGIN");await lock.query("SELECT identity.lock_security_subjects($1::uuid[])",[[actor.userId]]);read=line.siteLineBlocking(new Date());
   expect(await Promise.race([read.then(()=>"READ"),new Promise(resolve=>setTimeout(()=>resolve("BLOCKED"),750))])).toBe("READ");
  }finally{await lock.query("ROLLBACK");lock.release();await read;}
 });

 it("classifies the exact pin as expired/replaced/erased without adopting another grant or deleting its question",async()=>{
  const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor,{durationMs:2000});await fixture.configure(actor,command);const funding=source(),r=room(funding,1),line=new RunWaitRepository(runtime),runId=await fixture.run(actor.ownerRef);
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)");
  await r.decide({access:{ownerRef:actor.ownerRef,legacyAskerId:null},settingsClass},async({tx,now})=>r.enterWait(tx,runId,now));const pin=await new EntitlementRepository(runtime).readRunFundingBasis(runId),question=(await database.pool.query("SELECT question_line FROM core.run WHERE run_id=$1",[runId])).rows;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(command.expiresAt)-Date.now())+30));
  expect(await new PostgresInternalAllowanceRepository(runtime).readRunState(runId)).toBe("EXPIRED");expect(await room(funding).startWaiting((await line.readWaiting(runId))!,async()=>"must-not-dispatch")).toEqual({kind:"FUNDING_FAILED"});
  await fixture.configure(actor,fixture.configureCommand(actor,{expectedRevision:1,startsAt:new Date().toISOString()}));expect(await new PostgresInternalAllowanceRepository(runtime).readRunState(runId)).toBe("REPLACED");
  await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1',[actor.userId]);expect(await new PostgresInternalAllowanceRepository(runtime).readRunState(runId)).toBe("ERASED");
  expect(await line.readWaiting(runId)).toBeNull();expect(await new EntitlementRepository(runtime).readRunFundingBasis(runId)).toEqual(pin);expect((await database.pool.query("SELECT question_line FROM core.run WHERE run_id=$1",[runId])).rows).toEqual(question);
 });

 it("reads the nonauthorizing hint without waiting on an operator-held selector row",async()=>{
  const actor=await fixture.fundedActor(),command=fixture.configureCommand(actor);await fixture.configure(actor,command);const funding=source(),r=room(funding,1),runId=await fixture.run(actor.ownerRef);
  await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'SUPPORT','fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,1,1,1)");
  await r.decide({access:{ownerRef:actor.ownerRef,legacyAskerId:null},settingsClass},async({tx,now})=>r.enterWait(tx,runId,now));const lock=await database.pool.connect();let read:Promise<string>|undefined;
  try{await lock.query("BEGIN");await lock.query("SELECT singleton FROM staff.funding_policy_selection FOR UPDATE");read=new PostgresInternalAllowanceRepository(runtime).readRunState(runId);
   expect(await Promise.race([read.then(()=>"READ"),new Promise(resolve=>setTimeout(()=>resolve("BLOCKED"),750))])).toBe("READ");
  }finally{await lock.query("ROLLBACK");lock.release();await read;}
 });
 it("side-by-side C17: the API's usage read leaves a waived run out (300 000 waived, 200 000 counted)",async()=>{
  // Spec §9, C10: a debate set aside because of an upload uses none of the person's quota. Plan A's readOwnerSpentMicros
  // leaves a waived run out of every person window, so the usage bars (apps/api/src/billing/usage.ts, composed as
  // main.ts composes it) show 200 000 micros used. PLUS: day 1 000 000, week 2 500 000, month 5 000 000 micros.
  const actor=await fixture.fundedActor(),entitlements=new EntitlementRepository(runtime),anchor=new Date(),plusTx=await runtime.connect();
  try{await entitlements.append(plusTx,{ownerRef:actor.ownerRef,planId:"PLUS",effectiveAt:anchor,periodAnchorAt:anchor,cause:"SUBSCRIBED",subscriptionId:null,paidThrough:new Date(anchor.getTime()+86400000)});}finally{plusTx.release();}
  const current=await entitlements.current(actor.ownerRef,new Date()),waived=await fixture.run(actor.ownerRef),counted=await fixture.run(actor.ownerRef);
  for(const [runId,micros] of [[waived,300000],[counted,200000]] as const){
   const tx=await runtime.connect();
   try{await entitlements.recordRunChargeScope(tx,{runId,ownerRef:actor.ownerRef,planId:current.planId,entitlementEventId:current.eventId,admittedAt:new Date()});}finally{tx.release();}
   await database.pool.query("INSERT INTO ledger.model_spend(spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) VALUES(gen_random_uuid(),'RUN',$1,'fake-provider',(clock_timestamp() AT TIME ZONE 'UTC')::date,$2,1,1)",[runId,micros]);
  }
  const store=new PostgresModelSpendStore(runtime),spent:number[]=[];
  const spend={readOwnerSpentMicros:async(...args:Parameters<PostgresModelSpendStore["readOwnerSpentMicros"]>)=>{const value=await store.readOwnerSpentMicros(...args);spent.push(value);return value;}};
  const funding=source(),reader=new PersonUsageReader({entitlements,allowance:funding,funding,spend});
  // Control: before the waiver both runs count, 500 000 micros in every window.
  expect((await reader.read(actor.ownerRef,new Date())).windows.map(w=>[w.scope,w.percent])).toEqual([["PERSON_DAY",50],["PERSON_WEEK",20],["PERSON_MONTH",10]]);
  expect(spent).toEqual([500000,500000,500000]);
  spent.length=0;
  expect(await recordSpendWaiver(runtime,waived,"BACKSTOP")).toEqual({written:true});
  const usage=await reader.read(actor.ownerRef,new Date());
  expect(usage).toMatchObject({planId:"PLUS"});
  expect(usage.windows.map(w=>[w.scope,w.percent])).toEqual([["PERSON_DAY",20],["PERSON_WEEK",8],["PERSON_MONTH",4]]);
  expect(spent).toEqual([200000,200000,200000]);
  // The site's day still counts the real spend of both.
  expect(await store.readDaySpentMicros(new Date().toISOString().slice(0,10))).toBeGreaterThanOrEqual(500000);
 });

});
