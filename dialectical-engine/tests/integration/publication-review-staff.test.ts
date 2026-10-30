import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { PostgresPublicationRepository, PostgresStaffRepository, configureContentEncryption, contentCipherFor, createPool, encryptAttestedContentForRun, migrate, type Pool } from "@debateai/db";
import { PublicationReviewRefusal, PublicationReviewRepository, ServeRepository, SynthesisCheckRepository, synthesisTextOf, verdictOfRecord } from "@debateai/serve";
import { createPublicationReviewStaffService, canonicalPublicationReviewBinding } from "../../apps/api/src/publication-review/staff.js";
import { buildPublicDebateBody } from "../../apps/api/src/publications.js";
import { ownerSession, readOwnerAnswer } from "../../apps/api/src/owner-read.js";
import { StaffAccessService } from "../../apps/api/src/staff/access.js";
import { StaffWebAuthnService } from "../../apps/api/src/staff/webauthn.js";
import { withMailLocale } from "../../packages/db/src/mail-locale.js";
import { b64, digest, fixture, key } from "../support/staffWebAuthnFixtures.js";
import type { StaffHttpApplication } from "../../apps/api/src/staff/routes.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner } from "../support/storyEncryptedOwner.js";
import { staffHttpAskApplication } from "../support/staffHttpApplication.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const token = () => randomBytes(32).toString("base64url");
const policyVersion = "synthesis.content-check.v1@0123456789abcdef";
let database: TestDatabase, owner: StoryEncryptedOwner;
let logins: RlsLogins | undefined;
let runtime: Pool;
let reviews: PublicationReviewRepository, checks: SynthesisCheckRepository;
type Actor = { identity: TestHttpIdentity; staffId: string; staffToken: string; staffCsrf: string; capabilities: string[] };
type Debate = { runId: string; answerId: string; questionLine: string; reviewRef: string };

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  // Row-level security S01: bare debateai_runtime carries no account context, so it now sees no account's rows. These
  // statements run where the API runs every statement outside a request: its system login (tests/support/rls-logins.ts).
  logins = await provisionRlsLogins(database);
  runtime = createPool(logins.url("API_SYSTEM_DATABASE_URL"));
  configureContentEncryption(runtime, contentCipherFor(database.pool)!);
  reviews = new PublicationReviewRepository(runtime);
  checks = new SynthesisCheckRepository(runtime);
}, 180_000);

afterAll(async () => {
  await runtime?.end();
  await logins?.end();
  await database?.stop();
  if (owner) await releaseStoryEncryptedOwner(owner);
});

async function actor(capabilities: string[] = ["PUBLICATION_REVIEW", "AUDIT_READ"], ownDebate = false, ownerSeat = false): Promise<Actor> {
  const initial = testHttpIdentity(randomUUID());
  const identity: TestHttpIdentity = ownDebate ? {
    ...initial, authenticated: { ...initial.authenticated, userId: owner.userId, ownerRef: owner.ownerRef,
      session: { ...initial.authenticated.session, asker_id: `owner:${owner.ownerRef}`, session_id: owner.sessionId } }
  } : initial;
  const userId = identity.authenticated.userId, sessionId = identity.authenticated.session.session_id;
  if (ownDebate) {
    await database.pool.query("UPDATE identity.session SET token_hash=$2,csrf_token_hash=$3 WHERE session_id=$1",
      [sessionId,identity.authenticated.tokenHash,identity.authenticated.csrfTokenHash]);
  } else {
    await database.pool.query(`INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`,
      [userId,createHash("sha256").update(userId).digest(),`review-${userId}`]);
    await database.pool.query(`INSERT INTO identity.session
      (session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`,
      [sessionId,userId,identity.authenticated.tokenHash,identity.authenticated.csrfTokenHash]);
  }
  await database.pool.query(`INSERT INTO identity.mfa_factor
    (mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`,[randomUUID(),userId]);
  await database.pool.query(`INSERT INTO identity.channel_binding
    (user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,'email','{}','verified',now(),now())`,[userId]);
  const staffId=randomUUID(),privilegeId=randomUUID(),staffToken=token(),staffCsrf=token();
  await database.pool.query("INSERT INTO staff.subject(staff_id,user_id,state,capabilities) VALUES($1,$2,'ACTIVE',$3)",
    [staffId,userId,capabilities]);
  if(ownerSeat) await database.pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)",[staffId]);
  await database.pool.query(`INSERT INTO staff.privilege_session
    (privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,
     security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '8 hours')`,
    [privilegeId,staffId,userId,sessionId,hash(staffToken),hash(staffCsrf)]);
  return {identity,staffId,staffToken,staffCsrf,capabilities};
}
function headers(a: Actor, mutating = false) {
  return {...testSessionHeaders(a.identity,mutating),
    cookie:`${testSessionHeaders(a.identity).cookie}; __Host-debateai-staff=${a.staffToken}; __Host-debateai-staff-csrf=${a.staffCsrf}`,
    ...(mutating?{"x-staff-csrf-token":a.staffCsrf}:{})};
}
async function debate(questionLine=`Private question ${randomUUID()}?`): Promise<Debate> {
  const runId=await createEncryptedStoryRun(database.pool,owner,questionLine);
  const {answerId}=await persistTerminalRun({pool:database.pool,runId,fixtureKey:randomUUID(),
    factBundle:{facts:[],residualObjections:[],badges:[],conditionMarks:["DEFECT"],
      reversalPoint:"No firm conclusion",buildsOnPrevious:{value:false,answerRef:null},memoryDisclosure:null}});
  const {attemptId}=await checks.startPublishAttempt({runId,answerId,answerVersion:1});
  expect(await checks.insertResult({attemptId,runId,answerId,answerVersion:1,synthesisOriginVersion:1,
    outcome:{verdict:"FLAGGED",categories:["HATE_SPEECH"]},modelProviderRef:"fixture",modelId:"fixture",
    policyVersion,callCount:1,deadlineMs:60_000})).toBe("INSERTED");
  const grantTokenHash=hash(randomUUID());
  await database.pool.query(`INSERT INTO identity.step_up_grant
    (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at)
    VALUES($1,$2,$3,$4,'PUBLISH',$5,now(),now()+interval '5 minutes')`,
    [randomUUID(),grantTokenHash,owner.sessionId,owner.userId,runId]);
  expect(await reviews.ask({grantTokenHash,sessionId:owner.sessionId,userId:owner.userId,ownerRef:owner.ownerRef,
    runId,answerId,originVersion:1})).toBe("ASKED");
  const reviewRef=(await database.pool.query<{review_ref:string}>(
    "SELECT review_ref FROM serve.publication_review_request WHERE run_id=$1",[runId])).rows[0]!.review_ref;
  return {runId,answerId,questionLine,reviewRef};
}
async function askAgain(d:Debate):Promise<Debate> {
  const grantTokenHash=hash(randomUUID());
  await database.pool.query(`INSERT INTO identity.step_up_grant
    (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at)
    VALUES($1,$2,$3,$4,'PUBLISH',$5,now(),now()+interval '5 minutes')`,
    [randomUUID(),grantTokenHash,owner.sessionId,owner.userId,d.runId]);
  expect(await reviews.ask({grantTokenHash,sessionId:owner.sessionId,userId:owner.userId,ownerRef:owner.ownerRef,
    runId:d.runId,answerId:d.answerId,originVersion:1})).toBe("ASKED");
  const reviewRef=(await database.pool.query<{review_ref:string}>(
    "SELECT review_ref FROM serve.publication_review_request WHERE run_id=$1 ORDER BY ask_ordinal DESC LIMIT 1",[d.runId])).rows[0]!.review_ref;
  return {...d,reviewRef};
}
async function cloneVersion(d:Debate) {
  const sealed=await encryptAttestedContentForRun(database.pool,d.runId,"serve.answer",`${d.answerId}:2`,{answerForm:null});
  if(sealed===null) throw new Error("TEST_ANSWER_CIPHER_MISSING");
  await database.pool.query(`INSERT INTO serve.answer (
    answer_id,answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,
    answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,
    sealed_at_seq,confidence_band,band_ceiling,reversal_point,builds_on_previous,badges,
    verdict_unavailable,memory_disclosure,content_ciphertext,content_attestation
  ) SELECT answer_id,2,run_id,work_item_id,terminal,serve_state,verdict_state,
    answer_form,condition_marks,fact_bundle_id,composed_text_id,conformance_record_id,
    ledger.allocate_sequence(),confidence_band,band_ceiling,reversal_point,
    builds_on_previous,badges,verdict_unavailable,memory_disclosure,$2::jsonb,$3
    FROM serve.answer WHERE answer_id=$1 AND answer_version=1`,
    [d.answerId,JSON.stringify(sealed.envelope),sealed.attestation]);
}
async function hardware(a:Actor) {
  const f=fixture(key(),1,randomBytes(32)),factorId=randomUUID();
  await withMailLocale(database.pool,"en",c=>c.query(`INSERT INTO identity.mfa_factor
    (mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,
     credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
    VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),'app.debateai.test',$5,true,false,false,$6,0)`,
    [factorId,a.identity.authenticated.userId,f.expected.credentialId,
      JSON.stringify({format:"COSE_KEY_BASE64URL_V1",value:b64(f.k.wire)}),TEST_APP_ORIGIN,
      {v:1,keyId:`passkey-label:${factorId}:v1`,nonce:"AAAAAAAAAAAAAAAA",tag:"AAAAAAAAAAAAAAAAAAAAAA==",ct:"YQ=="}]));
  await database.pool.query("INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256) VALUES($1,$2,$3)",
    [factorId,a.identity.authenticated.userId,digest(f.handle)]);
}
function composition(actors: Actor[]) {
  const sessions=testSessionApplication(actors.map(a=>a.identity));
  const staffRepository=new PostgresStaffRepository(runtime);
  const access=new StaffAccessService(staffRepository,sessions);
  const serve=new ServeRepository(runtime);
  const answerApplication:AskApplication={...staffHttpAskApplication(),
    readAnswer:async(answerId,_session,version,ownership)=>serve.readAnswerProjection(answerId,ownership,version)};
  const synthesisAnswerAccess={stateOf:({runId,answerId,answerVersion}:{runId:string;answerId?:string;answerVersion?:number})=>
    checks.readAnswerAccess({runId,...(answerId===undefined?{}:{answerId}),
      ...(answerVersion===undefined?{}:{answerVersion}),deadlineMs:60_000}),
    removalNoticeExists:async()=>false,takeRemovalNotice:async()=>false};
  const publicationReviews=createPublicationReviewStaffService({repository:reviews,
    readVerdictCategories:async({runId,answerId,originVersion})=>[
      ...(verdictOfRecord(await checks.readRecords({runId,answerId,maxVersion:originVersion}),
        version=>version===originVersion)?.categories??[])],
    readReviewBody:async opened=>{
      const ownership={ownerRef:opened.ownerRef,legacyAskerId:null},session=ownerSession(opened.ownerRef,
        "00000000-0000-0000-0000-000000000000");
      const current=await serve.readAnswerProjection(opened.answerId,ownership);
      const origin=await serve.readAnswerProjection(opened.answerId,ownership,opened.originVersion);
      if(current===null||origin===null) throw new PublicationReviewRefusal("PUBLICATION_REVIEW_NOT_FOUND");
      const originText=synthesisTextOf(origin);
      for(let version=current.answer_version;version>=opened.originVersion;version--) {
        const answer=await readOwnerAnswer({application:answerApplication,synthesisAnswerAccess},
          opened.answerId,version,session,ownership);
        if(answer===null||synthesisTextOf(answer)!==originText) continue;
        return {answerVersion:answer.answer_version,body:await buildPublicDebateBody({runId:opened.runId,answer,
          owner:{userId:opened.ownerUserId,ownerRef:opened.ownerRef},source:{ip:"",userAgent:"",requestId:"review-fixture"},
          readers:{stories:{readStoryShort:async()=>null},repository:new PostgresPublicationRepository(runtime,{
            hashSourceIp:async()=>"1".repeat(64),hashUserAgent:async()=>"2".repeat(64)} as never),
            mapViews:{readMapView:async()=>null}}})};
      }
      throw new PublicationReviewRefusal("PUBLICATION_REVIEW_NOT_FOUND");
    }
  });
  const staff:StaffHttpApplication={access,sessions,repository:staffRepository,
    webauthn:new StaffWebAuthnService(staffRepository,{publicAppUrl:TEST_APP_ORIGIN}),
    intents:{} as StaffHttpApplication["intents"],publicationReviews,
    readiness:{readIndependentAlertReadiness:async()=>"READY"}};
  return buildApi({application:staffHttpAskApplication(),allowedOrigin:TEST_APP_ORIGIN,
    sessions,staffAccess:access,staffPolicyVersion:2,staff});
}
async function inject(api:ReturnType<typeof buildApi>,a:Actor,method:"GET"|"POST",url:string,payload?:unknown) {
  return api.inject({method,url,headers:headers(a,method==="POST"),
    ...(payload===undefined?{}:{payload:payload as Record<string,unknown>})});
}
async function proof(a:Actor,binding:ReturnType<typeof canonicalPublicationReviewBinding>) {
  const proofId=randomUUID(),handle=token();
  const row=(await database.pool.query<{privilege_session_id:string}>(
    "SELECT privilege_session_id FROM staff.privilege_session WHERE staff_id=$1",[a.staffId])).rows[0]!;
  await database.pool.query(`INSERT INTO staff.action_proof
    (proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,
     account_security_epoch,grant_revision,binding,credential_id,expires_at,handle_sha256)
    VALUES($1,$2,$3,$4,$5,0,0,0,$6::jsonb,'fixture-verified-key',now()+interval '5 minutes',$7)`,
    [proofId,a.staffId,a.identity.authenticated.userId,a.identity.authenticated.session.session_id,
      row.privilege_session_id,JSON.stringify(binding),hash(handle)]);
  return handle;
}
async function binding(a:Actor,d:Debate,action:"PUBLICATION_REVIEW_APPROVE"|"PUBLICATION_REVIEW_REFUSE",reason="") {
  const record=await new PostgresStaffRepository(runtime).readAuthentication({
    userId:a.identity.authenticated.userId,ordinarySessionId:a.identity.authenticated.session.session_id,
    ordinaryTokenHash:a.identity.authenticated.tokenHash,staffTokenHash:hash(a.staffToken)});
  expect(record).not.toBeNull();
  const context=record!.context;
  const opened=await reviews.open({context,tokenHash:a.identity.authenticated.tokenHash,reviewRef:d.reviewRef,purpose:"DECIDE"});
  const operation_id=randomUUID();
  const intent=action==="PUBLICATION_REVIEW_APPROVE" ? {action,review_ref:d.reviewRef,operation_id} as const
    : {action,review_ref:d.reviewRef,operation_id,reason} as const;
  return {intent,binding:canonicalPublicationReviewBinding(intent,opened.reasonSalt)};
}

it("keeps the oldest 100 pending reviews and reports whether more are waiting", async () => {
  const reviewRef = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
  const rows = Array.from({ length: 101 }, (_, index) => ({
    reviewRef: reviewRef(index), askedAt: new Date(Date.UTC(2026, 9, 20, 0, index)), askOrdinal: 1,
    runId: reviewRef(index + 200), answerId: reviewRef(index + 400), originVersion: 1
  }));
  for (const count of [100, 101]) {
    let requestedLimit = 0;
    const service = createPublicationReviewStaffService({
      repository: {
        listPending: async ({ limit }: { limit: number }) => { requestedLimit = limit; return rows.slice(0, count).slice(0, limit); }
      } as never,
      readVerdictCategories: async () => ["HATE_SPEECH"],
      readReviewBody: async () => { throw new Error("not read by the queue"); }
    });
    const result = await service.list({ context: {}, baseSession: { tokenHash: "fixture" } } as never);
    expect(requestedLimit).toBe(101);
    expect(result.items).toHaveLength(100);
    expect(result.items[0]?.review_ref).toBe(reviewRef(0));
    expect(result.items[99]?.review_ref).toBe(reviewRef(99));
    expect((result as { has_more?: boolean }).has_more).toBe(count > 100);
  }
});

describe("staff publication review HTTP over the migrated database", () => {
  it("each route refuses a staff member without PUBLICATION_REVIEW and queue answers an authorized reviewer", async () => {
    expect((await runtime.query<{current_user:string}>("SELECT current_user")).rows[0]?.current_user).toBe("debateai_dev_api_system"); // row-level security X28: the API's system login
    const no=await actor(["TEAM_READ"]),yes=await actor([
      "TEAM_READ","TEAM_INVITE","TEAM_GRANT","TEAM_DISABLE","AUDIT_READ","EMERGENCY_DISABLE","PUBLICATION_REVIEW"
    ],false,true),d=await debate(),api=composition([no,yes]);
    try {
      for(const [method,url,payload] of [["GET","/v1/admin/publication-reviews",undefined],
        ["GET",`/v1/admin/publication-reviews/${d.reviewRef}`,undefined],
        ["POST",`/v1/admin/publication-reviews/${d.reviewRef}/approve`,{proof_handle:token(),operation_id:randomUUID()}],
        ["POST",`/v1/admin/publication-reviews/${d.reviewRef}/refuse`,{proof_handle:token(),operation_id:randomUUID(),reason:"No"}]] as const)
        expect((await inject(api,no,method,url,payload)).statusCode).toBe(403);
      expect((await inject(api,yes,"GET","/v1/admin/publication-reviews")).statusCode).toBe(200);
    } finally {await api.close();}
  });
  it("lists pending requests oldest first with categories and no private identity", async () => {
    const a=await actor(),d1=await debate(),d2=await debate(),api=composition([a]);
    await database.pool.query("UPDATE serve.publication_review_request SET asked_at=now()-interval '1 hour' WHERE review_ref=$1",[d1.reviewRef]);
    try {
      const response=await inject(api,a,"GET","/v1/admin/publication-reviews");expect(response.statusCode).toBe(200);
      const items=response.json().items as {review_ref:string;categories:string[]}[];
      expect(items.findIndex(i=>i.review_ref===d1.reviewRef)).toBeLessThan(items.findIndex(i=>i.review_ref===d2.reviewRef));
      expect(items.find(i=>i.review_ref===d1.reviewRef)?.categories).toEqual(["HATE_SPEECH"]);
      for(const value of [owner.userId,owner.ownerRef,d1.runId,"review-"]) expect(response.body).not.toContain(value);
    } finally {await api.close();}
  });
  it("READ serves a public body with categories and no author pseudonym", async () => {
    const a=await actor(),d=await debate(),api=composition([a]);
    try {
      const response=await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({review_ref:d.reviewRef,question:d.questionLine,categories:["HATE_SPEECH"]});
      expect(response.json()).not.toHaveProperty("author_pseudonym");
    } finally {await api.close();}
  });
  it("READ of a missing ref answers 404 PUBLICATION_REVIEW_NOT_FOUND", async () => {
    const a=await actor(),api=composition([a]);
    try {
      const response=await inject(api,a,"GET",`/v1/admin/publication-reviews/${randomUUID()}`);
      expect(response.statusCode).toBe(404);expect(response.json().error).toBe("PUBLICATION_REVIEW_NOT_FOUND");
    } finally {await api.close();}
  });
  it("READ of a decided request answers 404", async () => {
    const a=await actor(),d=await debate(),api=composition([a]);
    try {const x=await binding(a,d,"PUBLICATION_REVIEW_APPROVE"),handle=await proof(a,x.binding);
      expect((await inject(api,a,"POST",`/v1/admin/publication-reviews/${d.reviewRef}/approve`,
        {proof_handle:handle,operation_id:x.intent.operation_id})).statusCode).toBe(200);
      expect((await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`)).statusCode).toBe(404);}
    finally {await api.close();}
  });
  it("READ after private run erasure answers 404", async () => {
    const a=await actor(),d=await debate(),api=composition([a]);
    await database.pool.query("DELETE FROM core.run_content_attestation_secret WHERE run_id=$1",[d.runId]);
    try {expect((await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`)).statusCode).toBe(404);}
    finally {await api.close();}
  });
  it("READ after account closure answers 404", async () => {
    const a=await actor(),d=await debate(),api=composition([a]);
    await database.pool.query("UPDATE identity.\"user\" SET state='deleted' WHERE user_id=$1",[owner.userId]);
    try {expect((await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`)).statusCode).toBe(404);}
    finally {await database.pool.query("UPDATE identity.\"user\" SET state='active' WHERE user_id=$1",[owner.userId]);await api.close();}
  });
  it("READ and decide on the reviewer's own debate answer 403", async () => {
    const d=await debate(),a=await actor(["PUBLICATION_REVIEW"],true),api=composition([a]);
    try {for(const [method,url,payload] of [["GET",`/v1/admin/publication-reviews/${d.reviewRef}`,undefined],
      ["POST",`/v1/admin/publication-reviews/${d.reviewRef}/approve`,{proof_handle:token(),operation_id:randomUUID()}]] as const) {
      const response=await inject(api,a,method,url,payload);expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("PUBLICATION_REVIEW_OWN_DEBATE");
    }} finally {await api.close();}
  });
  it("Approve with a valid proof records APPROVE and a second decision answers 409", async () => {
    const a=await actor(),d=await debate(),api=composition([a]);
    try {const x=await binding(a,d,"PUBLICATION_REVIEW_APPROVE"),handle=await proof(a,x.binding);
      const url=`/v1/admin/publication-reviews/${d.reviewRef}/approve`;
      const first=await inject(api,a,"POST",url,{proof_handle:handle,operation_id:x.intent.operation_id});
      expect(first.statusCode).toBe(200);expect(first.json().outcome).toBe("APPROVE");
      const second=await inject(api,a,"POST",url,{proof_handle:handle,operation_id:x.intent.operation_id});
      expect(second.statusCode).toBe(409);expect(second.json().error).toBe("PUBLICATION_REVIEW_DECIDED");
      const options=await inject(api,a,"POST","/v1/admin/webauthn/action/options",{intent:x.intent});
      expect(options.statusCode).toBe(409);expect(options.json().error).toBe("PUBLICATION_REVIEW_DECIDED");
    } finally {await api.close();}
  });
  it("Refuse needs a 1..500 reason and a changed proven reason is refused", async () => {
    const a=await actor(),d=await debate(),api=composition([a]),url=`/v1/admin/publication-reviews/${d.reviewRef}/refuse`;
    try {for(const reason of [""," ","x".repeat(501)]) {
      const response=await inject(api,a,"POST",url,{proof_handle:token(),operation_id:randomUUID(),reason});
      expect(response.statusCode).toBe(422);expect(response.json().error).toBe("STAFF_INPUT_INVALID");
    }
      const x=await binding(a,d,"PUBLICATION_REVIEW_REFUSE","First reason"),handle=await proof(a,x.binding);
      const changed=await inject(api,a,"POST",url,{proof_handle:handle,operation_id:x.intent.operation_id,reason:"Different reason"});
      expect(changed.statusCode).toBe(403);expect(changed.json().error).toBe("STAFF_REQUEST_REFUSED");
    } finally {await api.close();}
  });
  it("a decision removes every transient review copy", async () => {
    const a=await actor(),d=await debate(),api=composition([a]);
    try {expect((await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`)).statusCode).toBe(200);
      expect(Number((await database.pool.query<{n:string}>("SELECT count(*) n FROM serve.publication_review_copy WHERE review_ref=$1",[d.reviewRef])).rows[0]!.n)).toBeGreaterThan(0);
      const x=await binding(a,d,"PUBLICATION_REVIEW_APPROVE"),handle=await proof(a,x.binding);
      expect((await inject(api,a,"POST",`/v1/admin/publication-reviews/${d.reviewRef}/approve`,
        {proof_handle:handle,operation_id:x.intent.operation_id})).statusCode).toBe(200);
      await expect(runtime.query("SELECT count(*) n FROM serve.publication_review_copy WHERE review_ref=$1",[d.reviewRef]))
        .rejects.toMatchObject({code:"42501"});
      expect(Number((await database.pool.query<{n:string}>("SELECT count(*) n FROM serve.publication_review_copy WHERE review_ref=$1",[d.reviewRef])).rows[0]!.n)).toBe(0);
      const securityUrl=new URL(database.connectionString);
      securityUrl.searchParams.set("options","-c role=debateai_staff_security_owner");
      const security=createPool(securityUrl.toString());
      try {expect(Number((await security.query<{n:string}>(
        "SELECT count(*) n FROM serve.publication_review_copy WHERE review_ref=$1",[d.reviewRef])).rows[0]!.n)).toBe(0);}
      finally {await security.end();}
    } finally {await api.close();}
  });
  it("queue and READ carry Cache-Control no-store", async () => {
    const a=await actor(),d=await debate(),api=composition([a]);
    try {for(const url of ["/v1/admin/publication-reviews",`/v1/admin/publication-reviews/${d.reviewRef}`])
      expect((await inject(api,a,"GET",url)).headers["cache-control"]).toBe("no-store");
    } finally {await api.close();}
  });
  it("the first refuser cannot open or decide the second request; another reviewer can", async () => {
    const first=await actor(),other=await actor(),d=await debate(),api=composition([first,other]);
    try {const x=await binding(first,d,"PUBLICATION_REVIEW_REFUSE","Insufficient context"),handle=await proof(first,x.binding);
      expect((await inject(api,first,"POST",`/v1/admin/publication-reviews/${d.reviewRef}/refuse`,
        {proof_handle:handle,operation_id:x.intent.operation_id,reason:x.intent.reason})).statusCode).toBe(200);
      const second=await askAgain(d);
      const own=await inject(api,first,"GET",`/v1/admin/publication-reviews/${second.reviewRef}`);
      expect(own.statusCode).toBe(403);expect(own.json().error).toBe("PUBLICATION_REVIEW_SAME_REVIEWER");
      const ownDecision=await inject(api,first,"POST",`/v1/admin/publication-reviews/${second.reviewRef}/approve`,
        {proof_handle:token(),operation_id:randomUUID()});
      expect(ownDecision.statusCode).toBe(403);expect(ownDecision.json().error).toBe("PUBLICATION_REVIEW_SAME_REVIEWER");
      const y=await binding(other,second,"PUBLICATION_REVIEW_APPROVE"),secondHandle=await proof(other,y.binding);
      expect((await inject(api,other,"POST",`/v1/admin/publication-reviews/${second.reviewRef}/approve`,
        {proof_handle:secondHandle,operation_id:y.intent.operation_id})).statusCode).toBe(200);
    } finally {await api.close();}
  });
  it("LIST, READ, APPROVE and REFUSE are visible through audit without content", async () => {
    const a=await actor(),d1=await debate(),d2=await debate(),api=composition([a]);
    try {expect((await inject(api,a,"GET","/v1/admin/publication-reviews")).statusCode).toBe(200);
      expect((await inject(api,a,"GET",`/v1/admin/publication-reviews/${d1.reviewRef}`)).statusCode).toBe(200);
      for(const [d,action,reason] of [[d1,"PUBLICATION_REVIEW_APPROVE",""],[d2,"PUBLICATION_REVIEW_REFUSE","Private reason"]] as const) {
        const x=await binding(a,d,action,reason),handle=await proof(a,x.binding);
        const url=`/v1/admin/publication-reviews/${d.reviewRef}/${action==="PUBLICATION_REVIEW_APPROVE"?"approve":"refuse"}`;
        const response=await inject(api,a,"POST",url,{proof_handle:handle,operation_id:x.intent.operation_id,
          ...(action==="PUBLICATION_REVIEW_REFUSE"?{reason}:{})});
        expect(response.statusCode).toBe(200);
      }
      const audit=await inject(api,a,"GET","/v1/admin/audit?limit=100");expect(audit.statusCode).toBe(200);
      const events=audit.json().events as {event:string;review_ref?:string|null;actor_staff_id:string;recorded_at:string}[];
      for(const event of ["PUBLICATION_REVIEW_LISTED","PUBLICATION_REVIEW_READ","PUBLICATION_REVIEW_APPROVED","PUBLICATION_REVIEW_REFUSED"])
        expect(events.some(row=>row.event===event&&row.actor_staff_id===a.staffId&&!!row.recorded_at)).toBe(true);
      expect(audit.body).not.toContain(d1.questionLine);expect(audit.body).not.toContain("Private reason");
      expect(audit.body).not.toContain("HATE_SPEECH");
    } finally {await api.close();}
  });
  it("READ and Refuse write no private question, synthesis or reason to the application log", async () => {
    const a=await actor(),d=await debate("Never log this question"),api=composition([a]),lines:string[]=[];
    const spy=vi.spyOn(console,"error").mockImplementation((...args)=>{lines.push(args.map(String).join(" "));});
    try {expect((await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`)).statusCode).toBe(200);
      const x=await binding(a,d,"PUBLICATION_REVIEW_REFUSE","Never log this reason"),handle=await proof(a,x.binding);
      expect((await inject(api,a,"POST",`/v1/admin/publication-reviews/${d.reviewRef}/refuse`,
        {proof_handle:handle,operation_id:x.intent.operation_id,reason:x.intent.reason})).statusCode).toBe(200);
      for(const privateText of [d.questionLine,"Never log this reason","No firm conclusion"])
        expect(lines.join("\n")).not.toContain(privateText);
    } finally {spy.mockRestore();await api.close();}
  });
  it("action options starts a challenge for both review intents", async () => {
    const a=await actor(),d1=await debate(),d2=await debate(),api=composition([a]);
    await hardware(a);
    try {for(const [d,action,reason] of [[d1,"PUBLICATION_REVIEW_APPROVE",""],[d2,"PUBLICATION_REVIEW_REFUSE","Explanation"]] as const) {
      const intent=action==="PUBLICATION_REVIEW_APPROVE"
        ? {action,review_ref:d.reviewRef,operation_id:randomUUID()}
        : {action,review_ref:d.reviewRef,operation_id:randomUUID(),reason};
      const response=await inject(api,a,"POST","/v1/admin/webauthn/action/options",{intent});
      expect(response.statusCode).toBe(200);expect(response.json().challenge_handle).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }} finally {await api.close();}
  });
  it("run removal immediately omits the queue item and refuses READ, options and decide", async () => {
    const a=await actor(),d=await debate(),api=composition([a]);
    const result=(await database.pool.query<{result_id:string}>(
      "SELECT result_id FROM serve.synthesis_check_result WHERE answer_id=$1 LIMIT 1",[d.answerId])).rows[0]!;
    await database.pool.query(`INSERT INTO serve.synthesis_check_removal_request
      (request_id,result_id,run_id) VALUES($1,$2,$3)`,[randomUUID(),result.result_id,d.runId]);
    try {const queue=await inject(api,a,"GET","/v1/admin/publication-reviews");
      expect(queue.statusCode).toBe(200);expect(queue.body).not.toContain(d.reviewRef);
      expect((await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`)).statusCode).toBe(404);
      const intent={action:"PUBLICATION_REVIEW_APPROVE",review_ref:d.reviewRef,operation_id:randomUUID()};
      expect((await inject(api,a,"POST","/v1/admin/webauthn/action/options",{intent})).statusCode).toBe(404);
      expect((await inject(api,a,"POST",`/v1/admin/publication-reviews/${d.reviewRef}/approve`,
        {proof_handle:token(),operation_id:intent.operation_id})).statusCode).toBe(404);
    } finally {await api.close();}
  });
  it("READ skips a held newest version and answers 404 when no covered version is SHOW", async () => {
    const a=await actor(),d=await debate();
    await cloneVersion(d);
    expect(await checks.insertRequest({runId:d.runId,answerId:d.answerId,answerVersion:2})).toBe("INSERTED");
    expect(await checks.readAnswerAccess({runId:d.runId,answerId:d.answerId,answerVersion:2,deadlineMs:60_000})).toBe("HELD");
    const api=composition([a]);
    try {
      const response=await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`);
      expect(response.statusCode).toBe(200);
      expect((await database.pool.query<{answer_version:number}>(
        "SELECT answer_version FROM serve.publication_review_copy WHERE review_ref=$1 ORDER BY created_at DESC LIMIT 1",
        [d.reviewRef])).rows[0]?.answer_version).toBe(1);
      const seed=await database.pool.connect();
      try {await seed.query("BEGIN");await seed.query("SET LOCAL session_replication_role=replica");
        await seed.query("DELETE FROM serve.synthesis_check_result WHERE answer_id=$1 AND answer_version=1",[d.answerId]);
        await seed.query("COMMIT");
      } catch(error) {await seed.query("ROLLBACK");throw error;} finally {seed.release();}
      expect(await checks.insertRequest({runId:d.runId,answerId:d.answerId,answerVersion:1})).toBe("INSERTED");
      expect(await checks.readAnswerAccess({runId:d.runId,answerId:d.answerId,answerVersion:1,deadlineMs:60_000})).toBe("HELD");
      const hidden=await inject(api,a,"GET",`/v1/admin/publication-reviews/${d.reviewRef}`);
      expect(hidden.statusCode).toBe(404);expect(hidden.json().error).toBe("PUBLICATION_REVIEW_NOT_FOUND");
    } finally {await api.close();}
    const source=readFileSync(new URL("../../apps/api/src/main.ts",import.meta.url),"utf8");
    const start=source.indexOf("readReviewBody: (opened) =>");
    const end=source.indexOf("const synthesisPublishGate",start);
    const body=source.slice(start,end);
    expect(body).toMatch(/application\.readAnswer\(opened\.answerId, session, undefined, ownership\)/);
    expect(body).toMatch(/readSynthesisAnswer\(opened\.runId, opened\.answerId, opened\.originVersion, opened\.ownerRef\)/);
    expect(body).toMatch(/for \(let version = bound; version >= opened\.originVersion; version--\)/);
    expect(body).toMatch(/candidate === null \|\| synthesisTextOf\(candidate\) !== originText/);
  });
});
