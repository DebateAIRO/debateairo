import { setImmediate as nextTurn } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { Argon2InfrastructureError } from "@debateai/crypto";
import { authPolicyFromRegisterRows, AUTH_POLICY_REGISTER_ROWS } from "@debateai/register";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { RegistrationService, InProcessAuthRateLimiter, type RegisterInput } from "../../apps/api/src/registration.js";
import { canonicalSignup } from "../support/turnstileFixtures.js";
import { DISPLAYED_LEGAL_EN } from "../support/signupLegal.js";

function deferred<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const source = { ip: "203.0.113.42", userAgent: "fixture", requestId: "internal-request" };
const input: RegisterInput = { email: canonicalSignup.email, password: canonicalSignup.password, phone: canonicalSignup.phone, adultAffirmed: true, recoveryEmail: null };
function fixture(options: { sleep?: (milliseconds: number) => Promise<void>; sourceLimit?: number; maximum?: number | null; legal?: boolean; audit?: (input: unknown) => Promise<void> } = {}) {
  const base = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  const policy = { ...base, password: { ...base.password, maximumLength: options.maximum ?? null }, rateLimits: { ...base.rateLimits, register: { ...base.rateLimits.register, admissionPerSource: options.sourceLimit ?? 20 } } };
  const limiter = new InProcessAuthRateLimiter(policy.rateLimits, 256, policy.rateLimitRefusalAuditIntervalMs, Buffer.alloc(32, 5));
  const charged = vi.spyOn(limiter, "consume"); const work: string[] = []; const audits: unknown[] = [];
  let service!: RegistrationService;
  service = new RegistrationService({
    policy, limiter, blindIndexKey: Buffer.alloc(32, 5), sleep: options.sleep ?? (async () => undefined),
    repository: { findAuditIdentityByBlindIndex: async () => { work.push("lookup"); expect(service.registrationAdmissionOccupancy().admitted).toBe(1); return null; }, recordRateLimitRefusal: async (value: unknown) => { audits.push(value); await options.audit?.(value); } } as never,
    argon2: { hashPassword: async () => { work.push("password-kdf"); throw new Argon2InfrastructureError("ARGON2_WORKER_FAILED"); } } as never,
    mail: { sendVerification: async () => { work.push("mail"); } } as never, dekStore: { store: async () => { work.push("dek"); } } as never,
    verificationTokenFactory: () => { work.push("token"); return "never"; }, ...(options.legal ? { legalAcceptance: { recordsKey: Buffer.alloc(32, 7) } } : {})
  });
  return { service, limiter, charged, work, audits };
}
const admit = (service: RegistrationService) => service.admitSource({ route: "register", source, input });

describe("public registration admission ownership", () => {
  it("holds exactly103 structural slots at the verifier barrier and refuses104 before source/proof", async () => {
    const { service, charged, work } = fixture(); const barrier = deferred<"rejected">(); const ready = deferred(); let proofs = 0;
    const api = buildApi({ application: {} as AskApplication, registration: service, turnstile: { verify: async () => { proofs++; if (proofs === 103) ready.resolve(); return barrier.promise; } } });
    const requests = Array.from({ length: 104 }, (_, i) => api.inject({ method: "POST", url: "/v1/auth/register", payload: canonicalSignup, remoteAddress: `203.0.113.${i + 1}` }));
    let refusalDeadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await ready.promise; await nextTurn();
      expect(proofs).toBe(103); expect(charged.mock.calls).toHaveLength(103);
      expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 103, maximum: 103, admissions: 103, releases: 0 });
      const refused = await new Promise<Awaited<typeof requests[number]>>((resolve, reject) => {
        refusalDeadline = setTimeout(() => reject(new Error("STRUCTURAL_REFUSAL_NOT_OBSERVED")), 3000);
        for (const request of requests) request.then(resolve, reject);
      }).finally(() => clearTimeout(refusalDeadline));
      expect(refused.statusCode).toBe(503); expect(refused?.json()).toMatchObject({ error: "AUTH_MAIL_BUSY" }); expect(work).toEqual([]);
    } finally { clearTimeout(refusalDeadline); barrier.resolve("rejected"); await Promise.all(requests); await api.close(); }
    expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0, admissions: 103, releases: 103 });
  });
  it.each([["minimum", "x", null], ["configured maximum", "x".repeat(13), 12]] as const)("refuses %s password before any budget/proof and leaves the source available", async (_name, password, maximum) => {
    const { service, charged, work } = fixture({ sourceLimit: 1, maximum }); let proofs = 0;
    const api = buildApi({ application: {} as AskApplication, registration: service, turnstile: { verify: async () => { proofs++; return "rejected"; } } });
    try {
      const invalid = await api.inject({ method: "POST", url: "/v1/auth/register", payload: { ...canonicalSignup, password } });
      expect(invalid.json()).toMatchObject({ error: "AUTH_INPUT_INVALID" }); expect(proofs).toBe(0); expect(charged.mock.calls).toEqual([]);
      expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0, admissions: 0, releases: 0 }); expect(work).toEqual([]);
      const valid = await api.inject({ method: "POST", url: "/v1/auth/register", payload: canonicalSignup }); expect(valid.json()).toMatchObject({ error: "TURNSTILE_REJECTED" }); expect(proofs).toBe(1);
    } finally { await api.close(); await service.drainRateLimitAuditFlushes(); }
  });
  it("refuses current-legal mismatch before budgets/proof and admits a fresh pair afterward", async () => {
    const { service, charged, work } = fixture({ sourceLimit: 1, legal: true }); let proofs = 0;
    const api = buildApi({ application: {} as AskApplication, registration: service, turnstile: { verify: async () => { proofs++; return "unavailable"; } } });
    try {
      const stale = await api.inject({ method: "POST", url: "/v1/auth/register", payload: canonicalSignup });
      expect(stale.statusCode).toBe(409); expect(stale.json()).toMatchObject({ error: "LEGAL_DOCUMENT_STALE" }); expect(proofs).toBe(0); expect(charged.mock.calls).toEqual([]);
      expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0, admissions: 0, releases: 0 }); expect(work).toEqual([]);
      const fresh = await api.inject({ method: "POST", url: "/v1/auth/register", payload: { ...canonicalSignup, ...DISPLAYED_LEGAL_EN } }); expect(fresh.json()).toMatchObject({ error: "TURNSTILE_UNAVAILABLE" }); expect(proofs).toBe(1);
    } finally { await api.close(); await service.drainRateLimitAuditFlushes(); }
  });
  it("malformed public facts and a trusted source fault spend no budget or proof", async () => {
    const { service, charged, work } = fixture(); let proofs = 0;
    const api = buildApi({ application: {} as AskApplication, registration: service, turnstile: { verify: async () => { proofs++; return "passed"; } } });
    try {
      for (const payload of [{ ...canonicalSignup, password: undefined }, { ...canonicalSignup, adult_affirmed: true }, { ...canonicalSignup, phone: "invalid" }, { ...canonicalSignup, terms: { version: "2.0", sha256: "invalid" } }]) {
        const response = await api.inject({ method: "POST", url: "/v1/auth/register", payload }); expect(response.statusCode).toBe(400);
      }
      const admitOriginal = service.admitSource.bind(service);
      service.admitSource = request => admitOriginal({ ...request, source: { ...request.source, requestId: "" } });
      const badSource = await api.inject({ method: "POST", url: "/v1/auth/register", payload: canonicalSignup }); expect(badSource.json()).toMatchObject({ error: "AUTH_INPUT_INVALID" });
      expect(proofs).toBe(0); expect(charged.mock.calls).toEqual([]); expect(work).toEqual([]);
      expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0, admissions: 0, releases: 0 });
    } finally { await api.close(); }
  });
  it("refuses a source fault without budget and releases a transferred slot once after service failure", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined); const { service, charged, work } = fixture();
    try {
      await expect(service.admitSource({ route: "register", source: { ...source, requestId: "" }, input })).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
      expect(charged.mock.calls).toEqual([]); expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0, admissions: 0 }); expect(work).toEqual([]);
      const capability = await admit(service); expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 1, admissions: 1, releases: 0 });
      await expect(service.register(input, source, capability)).rejects.toMatchObject({ code: "AUTH_TEMPORARILY_UNAVAILABLE" }); capability.release(); capability.release();
      expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0, admissions: 1, releases: 1 }); expect(charged.mock.calls).toHaveLength(1);
    } finally { logs.mockRestore(); }
  });
});

describe("every shared refusal flush waits for all contributor clamps", () => {
  it.each(["timer", "drain"] as const)("blocks an already-armed %s flush while the second contributor is held", async trigger => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: new Date("2026-10-04T12:00:00Z") });
    const held = deferred(); let sleeps = 0; const { service, audits, work } = fixture({ sourceLimit: 1, sleep: async () => { if (++sleeps === 2) await held.promise; } });
    let second: Promise<unknown> | undefined; let drain: Promise<void> | undefined; let drained = false;
    try {
      (await admit(service)).release(); await expect(admit(service)).rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
      await vi.advanceTimersByTimeAsync(59_000); second = admit(service).catch(error => error);
      if (trigger === "timer") await vi.advanceTimersByTimeAsync(1000);
      else { drain = service.drainRateLimitAuditFlushes().then(() => { drained = true; }); await nextTurn(); }
      expect(audits).toEqual([]); expect(work).toEqual([]); expect(drained).toBe(false);
      held.resolve(); expect(await second).toMatchObject({ code: "AUTH_RATE_LIMITED" }); await vi.advanceTimersByTimeAsync(0);
      await service.drainRateLimitAuditFlushes(); await drain; expect(audits).toHaveLength(1); expect(audits[0]).toMatchObject({ count: 2 });
    } finally { held.resolve(); await second; await service.drainRateLimitAuditFlushes(); await drain; vi.useRealTimers(); }
  });
  it("a mixed direct registration contributor waits for its existing clamp under an armed public timer", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: new Date("2026-10-04T12:00:00Z") });
    const held = deferred(); let sleeps = 0;
    const { service, audits } = fixture({ sourceLimit: 1, sleep: async () => { if (++sleeps === 2) await held.promise; } });
    let direct: Promise<unknown> | undefined;
    try {
      (await admit(service)).release(); await expect(admit(service)).rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
      await vi.advanceTimersByTimeAsync(59_000); direct = service.register(input, source).catch(error => error); await nextTurn();
      await vi.advanceTimersByTimeAsync(1000); expect(audits).toEqual([]);
      held.resolve(); expect(await direct).toMatchObject({ code: "AUTH_RATE_LIMITED" }); await service.drainRateLimitAuditFlushes();
      expect(audits).toHaveLength(1); expect(audits[0]).toMatchObject({ count: 2 }); expect(sleeps).toBe(2);
    } finally { held.resolve(); await direct; await service.drainRateLimitAuditFlushes(); vi.useRealTimers(); }
  });
  it("a failed clamp releases its slot and cannot orphan the shared eligibility barrier", async () => {
    const { service, audits, work } = fixture({ sourceLimit: 1, sleep: async () => { throw new Error("CONTROLLED_CLAMP_FAILURE"); } });
    (await admit(service)).release();
    await expect(admit(service)).rejects.toThrow("CONTROLLED_CLAMP_FAILURE");
    await service.drainRateLimitAuditFlushes(); expect(audits).toHaveLength(1); expect(work).toEqual([]);
    expect(service.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0, admissions: 2, releases: 2 });
  });
  it("an existing writer cannot persist a queued successor whose contributor clamp is held", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: new Date("2026-10-04T12:00:00Z") });
    const held = deferred(); const writer = deferred(); let sleeps = 0; let writes = 0;
    const { service, audits } = fixture({ sourceLimit: 1, sleep: async () => { if (++sleeps === 3) await held.promise; }, audit: async () => { if (++writes === 1) await writer.promise; } });
    let successor: Promise<unknown> | undefined; let drain: Promise<void> | undefined;
    try {
      (await admit(service)).release(); await expect(admit(service)).rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
      await vi.advanceTimersByTimeAsync(60_000); expect(audits).toHaveLength(1);
      const freshSource = { ...source, ip: "203.0.113.43", requestId: "successor-request" };
      (await service.admitSource({ route: "register", source: freshSource, input })).release();
      await expect(service.admitSource({ route: "register", source: freshSource, input })).rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
      successor = service.admitSource({ route: "register", source: freshSource, input }).catch(error => error);
      drain = service.drainRateLimitAuditFlushes(); writer.resolve(); await nextTurn();
      expect(audits).toHaveLength(1);
      held.resolve(); expect(await successor).toMatchObject({ code: "AUTH_RATE_LIMITED" }); await drain;
      expect(audits).toHaveLength(2); expect(audits.map(value => (value as { count: number }).count)).toEqual([1, 2]);
    } finally { writer.resolve(); held.resolve(); await successor; await service.drainRateLimitAuditFlushes(); await drain; vi.useRealTimers(); }
  });
});
