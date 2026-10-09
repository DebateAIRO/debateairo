import { describe,expect,it,vi } from "vitest";
import { buildApi,CSRF_COOKIE_NAME,SESSION_COOKIE_NAME,type AskApplication } from "@debateai/api";
import {
  PostgresAccountErasureApplication,
  type AccountErasureApplication
} from "../../apps/api/src/account-erasure.js";
import type { AuthenticatedSession,SessionApplication } from "../../apps/api/src/sessions.js";

const ORIGIN="https://app.debateai.test";
const SESSION_TOKEN="s".repeat(43);
const CSRF_TOKEN="c".repeat(43);
const GRANT_TOKEN="g".repeat(43);
const CANCELLATION_REF="55555555-5555-4555-8555-555555555555";
const executeAt=new Date("2026-08-31T00:00:00.000Z");
const authenticated=Object.freeze({
  session:Object.freeze({
    asker_id:"owner:22222222-2222-4222-8222-222222222222",
    session_id:"33333333-3333-4333-8333-333333333333",
    caller_scope:"ASKER" as const,ownership_provenance:"server_session" as const,
    provisional_identity_model:false as const
  }),
  userId:"44444444-4444-4444-8444-444444444444",
  ownerRef:"22222222-2222-4222-8222-222222222222",
  tokenHash:"sha256:session",csrfTokenHash:"sha256:csrf",authKind:"cookie" as const
}) satisfies AuthenticatedSession;
function application():AskApplication {
  return {
    withContentLease:async (_runId,use)=>use(),
    submit:async ()=>({ run_ref:"11111111-1111-4111-8111-111111111111",status:"QUEUED" }),
    readAnswer:async ()=>null,readRunAnswer:async ()=>null,readRun:async ()=>null,
    readAnswerIndex:async (_session,limit,offset)=>({ items:[],open_runs:[],limit,offset,total:0 }),
    readInspection:async ()=>null,readLedgerDigest:async ()=>null,readNode:async ()=>null,
    recordInvestigation:async ()=>null,unlinkMemoryLink:async ()=>null,
    readDeployment:async ()=>({
      register:{ register_version:1,rows:[] },scorecards:[],model_ledger:[],
      fleet:{ state:"UNAVAILABLE",reason:"NO_TYPED_FLEET_SOURCE" }
    }),
    events:async function*() {}
  };
}
function sessions():SessionApplication {
  return {
    authenticate:async token=>token===SESSION_TOKEN ? authenticated : null,
    verifyCsrf:(_session,token)=>token===CSRF_TOKEN,
    beginLogin:async ()=>({ status:"mfa_required",challengeToken:"m".repeat(43) }),
    completeLogin:async ()=>({
      status:"authenticated",sessionToken:SESSION_TOKEN,csrfToken:CSRF_TOKEN,
      session:authenticated.session
    }),
    logout:async ()=>true,listSessions:async ()=>[],revokeSession:async ()=>true,
    revokeAllSessions:async ()=>1,
    stepUp:async ()=>({ sessionToken:SESSION_TOKEN,csrfToken:CSRF_TOKEN })
  };
}
function erasure(overrides:Partial<AccountErasureApplication>={}):AccountErasureApplication {
  return {
    schedule:async ()=>({ status:"SCHEDULED",executeAt,cancellationRef:CANCELLATION_REF }),
    current:async ()=>({ status:"NONE" }),cancel:async ()=>true,
    deletePrivateDebate:async ()=>"CLEANED",...overrides
  };
}
const cookie=`${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
const headers=Object.freeze({ cookie,origin:ORIGIN,"x-csrf-token":CSRF_TOKEN });
const basePayload=Object.freeze({ confirmation:"DELETE MY ACCOUNT",step_up_grant:GRANT_TOKEN });
const receipt=Object.freeze({
  status:"SCHEDULED",execute_at:"2026-08-31T00:00:00.000Z",
  cancellation_ref:CANCELLATION_REF,delete_public_debates:false
});

describe("DPD-S01 erasure HTTP choice",()=>{
  it("R9a a body without the key schedules as base and the 202 carries delete_public_debates false",async ()=>{
    const schedule=vi.fn<AccountErasureApplication["schedule"]>(erasure().schedule);
    const api=buildApi({ application:application(),sessions:sessions(),
      accountErasure:erasure({ schedule }),allowedOrigin:ORIGIN });
    try {
      const response=await api.inject({
        method:"DELETE",url:"/v1/account",headers,payload:basePayload
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual(receipt);
      expect(schedule).toHaveBeenCalledWith({ authenticated,grantToken:GRANT_TOKEN });
      expect(Object.keys(schedule.mock.calls[0]![0]).sort()).toEqual([
        "authenticated","grantToken"
      ]);
    } finally { await api.close(); }
  });

  it("R9b true reaches the application and the 202 echoes the stored choice",async ()=>{
    const schedule=vi.fn<AccountErasureApplication["schedule"]>(async ()=>({
      status:"SCHEDULED",executeAt,cancellationRef:CANCELLATION_REF,deletePublicDebates:true
    }));
    const api=buildApi({ application:application(),sessions:sessions(),
      accountErasure:erasure({ schedule }),allowedOrigin:ORIGIN });
    try {
      const response=await api.inject({ method:"DELETE",url:"/v1/account",headers,
        payload:{ ...basePayload,delete_public_debates:true } });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ ...receipt,delete_public_debates:true });
      expect(schedule).toHaveBeenCalledWith({
        authenticated,grantToken:GRANT_TOKEN,deletePublicDebates:true
      });
      schedule.mockClear();
      await api.inject({ method:"DELETE",url:"/v1/account",headers,
        payload:{ ...basePayload,delete_public_debates:false } });
      expect(Object.keys(schedule.mock.calls[0]![0]).sort()).toEqual([
        "authenticated","grantToken"
      ]);
    } finally { await api.close(); }
  });

  it("R9c R9d a non-boolean or an unknown key gets the base malformed-body response and never reaches the application",async ()=>{
    const schedule=vi.fn<AccountErasureApplication["schedule"]>(erasure().schedule);
    const api=buildApi({ application:application(),sessions:sessions(),
      accountErasure:erasure({ schedule }),allowedOrigin:ORIGIN });
    try {
      const reference=await api.inject({ method:"DELETE",url:"/v1/account",headers,
        payload:{ confirmation:"delete my account",step_up_grant:GRANT_TOKEN } });
      expect(reference.statusCode).toBe(400);
      for (const payload of [
        { ...basePayload,delete_public_debates:"true" },
        { ...basePayload,delete_public_debates:1 },
        { ...basePayload,delete_public_debates:null },
        { ...basePayload,delete_public_debates:true,extra:1 }
      ]) {
        const response=await api.inject({ method:"DELETE",url:"/v1/account",headers,payload });
        expect({ statusCode:response.statusCode,body:response.body }).toEqual({
          statusCode:reference.statusCode,body:reference.body
        });
      }
      expect(schedule).toHaveBeenCalledTimes(0);
    } finally { await api.close(); }
  });

  it("R11 GET /v1/account/erasure carries the stored choice; NONE and the cancel response are unchanged",async ()=>{
    const current=vi.fn<AccountErasureApplication["current"]>(async ()=>({
      status:"DUE",executeAt,cancellationRef:CANCELLATION_REF,deletePublicDebates:true
    }));
    const api=buildApi({ application:application(),sessions:sessions(),
      accountErasure:erasure({ current }),allowedOrigin:ORIGIN });
    try {
      const status=await api.inject({ method:"GET",url:"/v1/account/erasure",headers:{ cookie } });
      expect(status.json()).toEqual({ status:"DUE",execute_at:executeAt.toISOString(),
        cancellation_ref:CANCELLATION_REF,delete_public_debates:true });
      current.mockResolvedValueOnce({ status:"NONE" });
      const none=await api.inject({ method:"GET",url:"/v1/account/erasure",headers:{ cookie } });
      expect(none.json()).toEqual({ status:"NONE" });
      const cancel=await api.inject({ method:"POST",url:"/v1/account/erasure/cancel",headers,
        payload:{ cancellation_ref:CANCELLATION_REF } });
      expect(cancel.json()).toEqual({ status:"CANCELLED" });
    } finally { await api.close(); }
  });

  it("R9 R11 the application forwards the choice to the repository and maps it back",async ()=>{
    const row={
      erasureId:"66666666-6666-4666-8666-666666666666",
      status:"SCHEDULED" as const,executeAt,cancellationRef:CANCELLATION_REF,
      deletePublicDebates:true
    };
    const repoSchedule=vi.fn(async (_input:{ deletePublicDebates?:boolean })=>row);
    const repoCurrent=vi.fn(async (_input:unknown)=>row);
    const app=new PostgresAccountErasureApplication(
      { schedule:repoSchedule,current:repoCurrent } as never,{} as never
    );
    await expect(app.schedule({
      authenticated,grantToken:GRANT_TOKEN,deletePublicDebates:true
    })).resolves.toMatchObject({ deletePublicDebates:true });
    expect(repoSchedule.mock.calls[0]![0]).toMatchObject({ deletePublicDebates:true });
    await expect(app.schedule({ authenticated,grantToken:GRANT_TOKEN }))
      .resolves.toMatchObject({ deletePublicDebates:true });
    expect(repoSchedule.mock.calls[1]![0]).toMatchObject({ deletePublicDebates:false });
    await expect(app.current(authenticated)).resolves.toMatchObject({
      deletePublicDebates:true
    });
    expect(repoCurrent).toHaveBeenCalledOnce();
  });
});
