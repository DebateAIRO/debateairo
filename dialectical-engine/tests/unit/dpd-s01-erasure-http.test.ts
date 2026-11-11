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
  cancellation_ref:CANCELLATION_REF
});

describe("R22 decision 21: the erasure route has no public-debate option",()=>{
  it("a plain body schedules, and the 202 names no choice",async ()=>{
    const schedule=vi.fn<AccountErasureApplication["schedule"]>(erasure().schedule);
    const api=buildApi({ application:application(),sessions:sessions(),
      accountErasure:erasure({ schedule }),allowedOrigin:ORIGIN });
    try {
      const response=await api.inject({
        method:"DELETE",url:"/v1/account",headers,payload:basePayload
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual(receipt);
      expect(schedule).toHaveBeenCalledWith({ authenticated,grantToken:GRANT_TOKEN,
        source:{ ip:"127.0.0.1",mailLocale:"en",requestId:"req-1",userAgent:"lightMyRequest" } });
      expect(Object.keys(schedule.mock.calls[0]![0]).sort()).toEqual([
        "authenticated","grantToken","source"
      ]);
    } finally { await api.close(); }
  });

  it("the old option, whatever its value, is the base malformed-body response and never reaches the application",async ()=>{
    const schedule=vi.fn<AccountErasureApplication["schedule"]>(erasure().schedule);
    const api=buildApi({ application:application(),sessions:sessions(),
      accountErasure:erasure({ schedule }),allowedOrigin:ORIGIN });
    try {
      const reference=await api.inject({ method:"DELETE",url:"/v1/account",headers,
        payload:{ confirmation:"delete my account",step_up_grant:GRANT_TOKEN } });
      expect(reference.statusCode).toBe(400);
      for (const value of [true,false,"true",1,null]) {
        const response=await api.inject({ method:"DELETE",url:"/v1/account",headers,
          payload:{ ...basePayload,delete_public_debates:value } });
        expect({ statusCode:response.statusCode,body:response.body }).toEqual({
          statusCode:reference.statusCode,body:reference.body
        });
      }
      expect(schedule).toHaveBeenCalledTimes(0);
    } finally { await api.close(); }
  });

  it("GET /v1/account/erasure names no choice; NONE and the cancel response are unchanged",async ()=>{
    const current=vi.fn<AccountErasureApplication["current"]>(async ()=>({
      status:"DUE",executeAt,cancellationRef:CANCELLATION_REF
    }));
    const api=buildApi({ application:application(),sessions:sessions(),
      accountErasure:erasure({ current }),allowedOrigin:ORIGIN });
    try {
      const status=await api.inject({ method:"GET",url:"/v1/account/erasure",headers:{ cookie } });
      expect(status.json()).toEqual({ status:"DUE",execute_at:executeAt.toISOString(),
        cancellation_ref:CANCELLATION_REF });
      current.mockResolvedValueOnce({ status:"NONE" });
      const none=await api.inject({ method:"GET",url:"/v1/account/erasure",headers:{ cookie } });
      expect(none.json()).toEqual({ status:"NONE" });
      const cancel=await api.inject({ method:"POST",url:"/v1/account/erasure/cancel",headers,
        payload:{ cancellation_ref:CANCELLATION_REF } });
      expect(cancel.json()).toEqual({ status:"CANCELLED" });
    } finally { await api.close(); }
  });

  it("the application asks the repository for no choice",async ()=>{
    const row={
      erasureId:"66666666-6666-4666-8666-666666666666",
      status:"SCHEDULED" as const,executeAt,cancellationRef:CANCELLATION_REF
    };
    const repoSchedule=vi.fn(async (_input:Record<string,unknown>)=>row);
    const app=new PostgresAccountErasureApplication(
      { schedule:repoSchedule,current:vi.fn(async ()=>row) } as never,{} as never
    );
    await expect(app.schedule({ authenticated,grantToken:GRANT_TOKEN })).resolves.toMatchObject({ status:"SCHEDULED" });
    expect(Object.keys(repoSchedule.mock.calls[0]![0])).not.toContain("deletePublicDebates");
  });
});
