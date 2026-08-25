import { describe,expect,it,vi } from "vitest";
import {
  buildApi,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AskApplication
} from "@debateai/api";
import { RETIRED_DEV_HEADER } from "../support/httpSession.js";
import {
  createSingleFlightErasureReconciler,
  PostgresAccountErasureApplication,
  type AccountErasureApplication
} from "../../apps/api/src/account-erasure.js";
import type {
  AuthenticatedSession,
  SessionApplication
} from "../../apps/api/src/sessions.js";

const ORIGIN="https://app.debateai.test";
const SESSION_TOKEN="s".repeat(43);
const CSRF_TOKEN="c".repeat(43);
const GRANT_TOKEN="g".repeat(43);
const RUN_ID="11111111-1111-4111-8111-111111111111";
const CANCELLATION_REF="55555555-5555-4555-8555-555555555555";
const authenticated=Object.freeze({
  session:Object.freeze({
    asker_id:"owner:22222222-2222-4222-8222-222222222222",
    session_id:"33333333-3333-4333-8333-333333333333",
    caller_scope:"ASKER" as const,
    ownership_provenance:"server_session" as const,
    provisional_identity_model:false as const
  }),
  userId:"44444444-4444-4444-8444-444444444444",
  ownerRef:"22222222-2222-4222-8222-222222222222",
  tokenHash:"sha256:session",csrfTokenHash:"sha256:csrf",authKind:"cookie" as const
}) satisfies AuthenticatedSession;

function application():AskApplication {
  return {
    withContentLease:async (_runId,use)=>use(),
    submit:async ()=>({ run_ref:RUN_ID,status:"QUEUED" }),
    readAnswer:async ()=>null,readRunAnswer:async ()=>null,readRun:async ()=>null,
    readAnswerIndex:async (_session,limit,offset)=>({
      items:[],open_runs:[],limit,offset,total:0
    }),
    readInspection:async ()=>null,readLedgerDigest:async ()=>null,
    readNode:async ()=>null,recordInvestigation:async ()=>null,
    unlinkMemoryLink:async ()=>null,
    readDeployment:async ()=>({
      register:{ register_version:1,rows:[] },scorecards:[],model_ledger:[],
      fleet:{ state:"UNAVAILABLE",reason:"NO_TYPED_FLEET_SOURCE" }
    }),
    events:async function*() {}
  };
}

function sessions():SessionApplication {
  return {
    authenticate:async (token)=>token===SESSION_TOKEN ? authenticated : null,
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
    schedule:async ()=>({
      status:"SCHEDULED",executeAt:new Date("2026-08-31T00:00:00.000Z"),
      cancellationRef:CANCELLATION_REF
    }),
    current:async ()=>({ status:"NONE" }),
    cancel:async ()=>true,
    deletePrivateDebate:async ()=>"CLEANED",
    ...overrides
  };
}

const cookie=`${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
const headers=Object.freeze({
  cookie,origin:ORIGIN,"x-csrf-token":CSRF_TOKEN,"user-agent":"s10-test-browser"
});

describe("S10 erasure HTTP boundary",()=>{
  it("returns the authoritative schedule receipt without a second session-bound read",async ()=>{
    const schedule=vi.fn(async ()=>({
      erasureId:"66666666-6666-4666-8666-666666666666",
      status:"SCHEDULED" as const,
      executeAt:new Date("2026-08-31T00:00:00.000Z"),
      cancellationRef:CANCELLATION_REF
    }));
    const current=vi.fn(async ()=>null);
    const erasureApplication=new PostgresAccountErasureApplication(
      { schedule,current } as never,{} as never
    );
    await expect(erasureApplication.schedule({ authenticated,grantToken:GRANT_TOKEN }))
      .resolves.toEqual({
        status:"SCHEDULED",executeAt:new Date("2026-08-31T00:00:00.000Z"),
        cancellationRef:CANCELLATION_REF
      });
    expect(schedule).toHaveBeenCalledOnce();
    expect(current).not.toHaveBeenCalled();
  });
  it("never overlaps a hung notification backlog and never blocks its caller",async ()=>{
    let release!:()=>void;
    const gate=new Promise<void>((resolve)=>{ release=resolve; });
    const work=vi.fn(async ()=>gate);
    const failed=vi.fn();
    const trigger=createSingleFlightErasureReconciler(work,failed);
    expect(trigger()).toBe(true);
    expect(trigger()).toBe(false);
    expect(work).toHaveBeenCalledTimes(1);
    release();
    await gate;
    await new Promise((resolve)=>setTimeout(resolve,0));
    expect(trigger()).toBe(true);
    expect(work).toHaveBeenCalledTimes(2);
    expect(failed).not.toHaveBeenCalled();
  });
  it("requires cookie auth, CSRF, exact confirmation, and a targetless account grant",async ()=>{
    const schedule=vi.fn<AccountErasureApplication["schedule"]>(async ()=>({
      status:"SCHEDULED",executeAt:new Date("2026-08-31T00:00:00.000Z"),
      cancellationRef:CANCELLATION_REF
    }));
    const api=buildApi({
      application:application(),sessions:sessions(),accountErasure:erasure({ schedule }),
      allowedOrigin:ORIGIN
    });
    const legacy=await api.inject({
      method:"DELETE",url:"/v1/account",headers:{ [RETIRED_DEV_HEADER]:"legacy-user" },
      payload:{ confirmation:"DELETE MY ACCOUNT",step_up_grant:GRANT_TOKEN }
    });
    expect(legacy.statusCode).toBe(401);
    expect(schedule).not.toHaveBeenCalled();
    const noCsrf=await api.inject({
      method:"DELETE",url:"/v1/account",headers:{ cookie,origin:ORIGIN },
      payload:{ confirmation:"DELETE MY ACCOUNT",step_up_grant:GRANT_TOKEN }
    });
    expect(noCsrf.statusCode).toBe(403);
    const wrongPhrase=await api.inject({
      method:"DELETE",url:"/v1/account",headers,
      payload:{ confirmation:"delete my account",step_up_grant:GRANT_TOKEN }
    });
    expect(wrongPhrase.statusCode).toBe(400);
    const scheduled=await api.inject({
      method:"DELETE",url:"/v1/account",headers,
      payload:{ confirmation:"DELETE MY ACCOUNT",step_up_grant:GRANT_TOKEN }
    });
    expect(scheduled.statusCode).toBe(202);
    expect(scheduled.json()).toEqual({
      status:"SCHEDULED",execute_at:"2026-08-31T00:00:00.000Z",
      cancellation_ref:CANCELLATION_REF
    });
    expect(schedule).toHaveBeenCalledWith({ authenticated,grantToken:GRANT_TOKEN });
    await api.close();
  });
  it("rejects every crossed account/run step-up target shape at HTTP parsing",async ()=>{
    const stepUp=vi.fn<SessionApplication["stepUp"]>(sessions().stepUp);
    const api=buildApi({
      application:application(),sessions:{ ...sessions(),stepUp },allowedOrigin:ORIGIN
    });
    for (const authorization of [
      { action:"DELETE_ACCOUNT",target_run_id:RUN_ID },
      { action:"DELETE_ACCOUNT",target_account_id:authenticated.userId },
      { action:"PUBLISH" },
      { action:"PUBLISH",target_run_id:RUN_ID,target_account_id:authenticated.userId }
    ]) {
      const response=await api.inject({
        method:"POST",url:"/v1/auth/step-up",headers,
        payload:{ password:"correct horse battery staple",code:"123456",authorization }
      });
      expect(response.statusCode).toBe(400);
    }
    expect(stepUp).not.toHaveBeenCalled();
    await api.close();
  });

  it("returns a typed configuration conflict when no supported channel can be notified",async ()=>{
    const schedule=vi.fn<AccountErasureApplication["schedule"]>(
      async ()=>"NOTIFICATION_CHANNEL_REQUIRED"
    );
    const api=buildApi({
      application:application(),sessions:sessions(),accountErasure:erasure({ schedule }),
      allowedOrigin:ORIGIN
    });
    const response=await api.inject({
      method:"DELETE",url:"/v1/account",headers,
      payload:{ confirmation:"DELETE MY ACCOUNT",step_up_grant:GRANT_TOKEN }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error:"ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED" });
    expect(schedule).toHaveBeenCalledOnce();
    await api.close();
  });

  it("reads and cancels only the authenticated current request",async ()=>{
    const current=vi.fn<AccountErasureApplication["current"]>(async ()=>({
      status:"DUE",executeAt:new Date("2026-08-31T00:00:00.000Z"),
      cancellationRef:CANCELLATION_REF
    }));
    const cancel=vi.fn<AccountErasureApplication["cancel"]>(async ()=>true);
    const api=buildApi({
      application:application(),sessions:sessions(),accountErasure:erasure({ current,cancel }),
      allowedOrigin:ORIGIN
    });
    const status=await api.inject({
      method:"GET",url:"/v1/account/erasure",headers:{ cookie,"user-agent":"s10-test-browser" }
    });
    expect(status.json()).toEqual({
      status:"DUE",execute_at:"2026-08-31T00:00:00.000Z",
      cancellation_ref:CANCELLATION_REF
    });
    const cancelled=await api.inject({
      method:"POST",url:"/v1/account/erasure/cancel",headers,
      payload:{ cancellation_ref:CANCELLATION_REF }
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toEqual({ status:"CANCELLED" });
    expect(current).toHaveBeenCalledWith(authenticated);
    expect(cancel).toHaveBeenCalledWith({
      authenticated,cancellationRef:CANCELLATION_REF
    });
    await api.close();
  });

  it("uses the suspended scheduling session only for PROCESSING status",async ()=>{
    const authenticateErasureStatus=vi.fn(async (token:string)=>
      token===SESSION_TOKEN ? authenticated : null
    );
    const current=vi.fn<AccountErasureApplication["current"]>(async ()=>({
      status:"PROCESSING",executeAt:new Date("2026-08-31T00:00:00.000Z"),
      cancellationRef:CANCELLATION_REF
    }));
    const api=buildApi({
      application:application(),
      sessions:{ ...sessions(),authenticate:async ()=>null,authenticateErasureStatus },
      accountErasure:erasure({ current }),allowedOrigin:ORIGIN
    });
    const status=await api.inject({
      method:"GET",url:"/v1/account/erasure",
      headers:{ cookie,"user-agent":"s10-test-browser" }
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      status:"PROCESSING",execute_at:"2026-08-31T00:00:00.000Z",
      cancellation_ref:CANCELLATION_REF
    });
    const ordinary=await api.inject({
      method:"GET",url:"/v1/session",headers:{ cookie,"user-agent":"s10-test-browser" }
    });
    expect(ordinary.statusCode).toBe(401);
    expect(authenticateErasureStatus).toHaveBeenCalledOnce();
    expect(current).toHaveBeenCalledWith(authenticated);
    await api.close();
  });

  it("keeps guessed private run ids opaque and returns only typed deletion states",async ()=>{
    const deletePrivateDebate=vi.fn<AccountErasureApplication["deletePrivateDebate"]>(
      async ()=>"CLEANED"
    );
    const api=buildApi({
      application:application(),sessions:sessions(),
      accountErasure:erasure({ deletePrivateDebate }),allowedOrigin:ORIGIN
    });
    const malformed=await api.inject({
      method:"DELETE",url:"/v1/debates/not-a-uuid",headers,
      payload:{ step_up_grant:GRANT_TOKEN }
    });
    expect(malformed.statusCode).toBe(404);
    expect(deletePrivateDebate).not.toHaveBeenCalled();
    const cleaned=await api.inject({
      method:"DELETE",url:`/v1/debates/${RUN_ID}`,headers,
      payload:{ step_up_grant:GRANT_TOKEN }
    });
    expect(cleaned.statusCode).toBe(200);
    expect(cleaned.json()).toEqual({ status:"CLEANED" });
    expect(deletePrivateDebate).toHaveBeenCalledWith(expect.objectContaining({
      runId:RUN_ID,authenticated,grantToken:GRANT_TOKEN
    }));
    await api.close();
  });
});
