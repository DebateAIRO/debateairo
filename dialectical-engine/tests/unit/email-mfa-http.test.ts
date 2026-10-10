import { afterEach, expect, it, vi } from "vitest";
import type { Argon2Executor } from "@debateai/crypto";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { MfaRecoveryService } from "../../apps/api/src/email-mfa-recovery.js";
import { RECOVERY_START_PUBLIC_RESPONSE } from "../../apps/api/src/recovery.js";
import { ENUMERATION_FLOOR_MS, mfaRecoveryPolicy, recoveryAuthPolicy, recoveryMfaPolicy, recoveryStartStorage, type StorageCostHooks } from "../support/recoveryStartStorage.js";
const origin = "https://preview.example.test", KNOWN = "owned@example.test", UNKNOWN = "nobody-here@example.test";
const source = { ip: "203.0.113.9", userAgent: "unit", requestId: "r" };

/** The REAL MfaRecoveryService; only its database repository and DEK store are in memory. */
function realMfaRecovery(hooks: StorageCostHooks = {}) {
  const storage = recoveryStartStorage(hooks);
  storage.enrol(KNOWN);
  const service = new MfaRecoveryService({
    repository: storage.mfaRecoveryRepository, users: storage.users, argon2: {} as Argon2Executor,
    authPolicy: recoveryAuthPolicy, mfaPolicy: recoveryMfaPolicy, policy: mfaRecoveryPolicy, blindIndexKey: storage.blindIndexKey
  });
  return { service, storage };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("exposes a separate origin-bound MFA start without ordinary session authority, identical for known and unknown addresses", async () => {
  const { service, storage } = realMfaRecovery();
  const api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, mfaRecovery: service });
  try {
    const start = (email: string, from = origin) => api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/start", headers: { origin: from }, payload: { email, destination: "primary" } });
    // The real floor applies here (two waits of ENUMERATION_FLOOR_MS of wall time).
    const known = await start(KNOWN), unknown = await start(UNKNOWN);
    for (const response of [known, unknown]) {
      expect(response.statusCode).toBe(202);
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(response.json()).toEqual(RECOVERY_START_PUBLIC_RESPONSE);
    }
    expect(unknown.body).toBe(known.body);
    const { date: _knownDate, ...knownHeaders } = known.headers, { date: _unknownDate, ...unknownHeaders } = unknown.headers;
    expect(unknownHeaders).toEqual(knownHeaders);
    expect(storage.starts.map((row) => row.candidateId === null)).toEqual([false, true]);
    expect((await start(KNOWN, "https://evil.example.test")).statusCode).toBe(403);
    expect(storage.starts).toHaveLength(2);
  } finally {
    await api.close();
  }
});

it("holds known and unknown MFA recovery starts to the same enumeration floor on a controlled clock", async () => {
  // The service reads performance.now() from node:perf_hooks (the same object as the global) and
  // waits with setTimeout; both run on the fake clock so storage cost and the floor share one timeline.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: 0 });
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  // A matching account costs 180 ms of storage work (on the fake clock); a miss costs nothing.
  const { service } = realMfaRecovery({ onLookup: (found) => found ? new Promise<void>((resolve) => setTimeout(resolve, 180)) : undefined });
  async function settledAt(email: string): Promise<number> {
    const began = performance.now();
    let settled: number | undefined;
    const pending = service.start({ email, destination: "primary" }, source).then((response) => {
      expect(response).toEqual(RECOVERY_START_PUBLIC_RESPONSE);
      settled = performance.now() - began;
    });
    await vi.advanceTimersByTimeAsync(ENUMERATION_FLOOR_MS - 1);
    expect(settled, `${email} answered before the floor`).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    return settled!;
  }
  expect(await settledAt(KNOWN)).toBe(ENUMERATION_FLOOR_MS);
  expect(await settledAt(UNKNOWN)).toBe(ENUMERATION_FLOOR_MS);
});
// Owner ruling 2026-10-09: completing starts a 24-hour wait; the emailed finish link plus the current password finishes it.
import{describe}from"vitest";import{EmailRecoveryError}from"../../apps/api/src/email-mfa-recovery.js";
describe("the 24-hour wait over HTTP",()=>{
 const origin="https://preview.example.test",TOKEN="F".repeat(43),SESSION="S".repeat(43),CSRF="X".repeat(43);
 function api(mfa:Record<string,unknown>){return buildApi({application:{}as AskApplication,allowedOrigin:origin,mfaRecovery:{assertCsrf:async()=>undefined,...mfa}as never});}
 it("answers complete with the waiting state and the time it can be finished",async()=>{const complete=vi.fn(async()=>({status:"waiting",not_before:"2026-10-10T12:00:00.000Z"})),a=api({complete});try{const r=await a.inject({method:"POST",url:"/v1/auth/mfa-recovery/complete",headers:{origin,cookie:`__Host-debateai-mfa-recovery=${SESSION}; __Host-debateai-mfa-recovery-csrf=${CSRF}`,"x-mfa-recovery-csrf-token":CSRF},payload:{}});expect(r.statusCode).toBe(200);expect(r.json()).toEqual({status:"waiting",not_before:"2026-10-10T12:00:00.000Z"});expect(complete).toHaveBeenCalledWith({sessionToken:SESSION},expect.objectContaining({userAgent:expect.any(String)}));}finally{await a.close();}});
 it("reads a finish link from a trusted origin only, without any cookie",async()=>{const prepareFinish=vi.fn(async()=>({status:"waiting",not_before:"2026-10-10T12:00:00.000Z"})),a=api({prepareFinish});try{const r=await a.inject({method:"POST",url:"/v1/auth/mfa-recovery/finish/status",headers:{origin},payload:{token:TOKEN}});expect(r.statusCode).toBe(200);expect(r.headers["cache-control"]).toBe("no-store");expect(r.json()).toEqual({status:"waiting",not_before:"2026-10-10T12:00:00.000Z"});expect(prepareFinish).toHaveBeenCalledWith({token:TOKEN},expect.anything());expect((await a.inject({method:"POST",url:"/v1/auth/mfa-recovery/finish/status",headers:{origin:"https://evil.example.test"},payload:{token:TOKEN}})).statusCode).toBe(403);expect((await a.inject({method:"POST",url:"/v1/auth/mfa-recovery/finish/status",headers:{origin},payload:{token:"short"}})).statusCode).toBe(400);expect(prepareFinish).toHaveBeenCalledTimes(1);}finally{await a.close();}});
 it("finishes with the finish link and the current password",async()=>{const finish=vi.fn(async()=>({status:"completed"})),a=api({finish});try{const r=await a.inject({method:"POST",url:"/v1/auth/mfa-recovery/finish",headers:{origin},payload:{token:TOKEN,password:"current password"}});expect(r.statusCode).toBe(200);expect(r.json()).toEqual({status:"completed"});expect(r.headers["set-cookie"]).toBeUndefined();expect(finish).toHaveBeenCalledWith({token:TOKEN,password:"current password"},expect.anything());expect((await a.inject({method:"POST",url:"/v1/auth/mfa-recovery/finish",headers:{origin},payload:{token:TOKEN}})).statusCode).toBe(400);}finally{await a.close();}});
 // Review I1 2026-10-09: a second recovery while one is already waiting is refused at the email link with its own code.
 it("maps MFA_RECOVERY_ALREADY_WAITING at the email link to 409 and sets no recovery cookie",async()=>{const a=api({exchange:async()=>{throw new EmailRecoveryError("MFA_RECOVERY_ALREADY_WAITING");}});try{const r=await a.inject({method:"POST",url:"/v1/auth/mfa-recovery/exchange",headers:{origin},payload:{token:TOKEN,password:"current password"}});expect(r.statusCode).toBe(409);expect(r.json()).toEqual({error:"MFA_RECOVERY_ALREADY_WAITING"});expect(r.headers["set-cookie"]).toBeUndefined();}finally{await a.close();}});
 it.each([["MFA_RECOVERY_TOO_EARLY",409],["MFA_RECOVERY_PROOF_INVALID",401],["MFA_RECOVERY_INVALID",410],["MFA_RECOVERY_RATE_LIMITED",429]])("maps %s to %i",async(code,status)=>{const a=api({finish:async()=>{throw new EmailRecoveryError(code);}});try{const r=await a.inject({method:"POST",url:"/v1/auth/mfa-recovery/finish",headers:{origin},payload:{token:TOKEN,password:"current password"}});expect(r.statusCode).toBe(status);expect(r.json()).toEqual({error:code});}finally{await a.close();}});
});
