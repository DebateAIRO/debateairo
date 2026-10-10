import { TEST_APP_ORIGIN } from "../support/httpSession.js";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { UnixTurnstileVerifier } from "../../apps/api/src/turnstile.js";
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication, type ApiOptions } from "../../apps/api/src/index.js";
import { Argon2InfrastructureError } from "@debateai/crypto";
import { authPolicyFromRegisterRows, AUTH_POLICY_REGISTER_ROWS } from "@debateai/register";
import { RegistrationService, InProcessAuthRateLimiter, sourceContext, REGISTRATION_PUBLIC_RESPONSE, RESEND_PUBLIC_RESPONSE } from "../../apps/api/src/registration.js";

const legal = { terms: { version: "2.0", sha256: "a".repeat(64) }, privacy: { version: "3.0", sha256: "b".repeat(64) } };
export const signup = { email: "person@example.test", password: "password-123", phone: "+40 722 123 456", date_of_birth: "1990-01-01", country: "RO", ...legal, locale: "ro", ui_locale: "ro", time_zone: "Europe/Bucharest", turnstile_token: "fixture-proof" };
const resend = { email: signup.email, locale: "ro", ui_locale: "ro", time_zone: null, turnstile_token: "resend-proof" };
function harness(result: "passed" | "rejected" | "unavailable" | null = "passed") {
  const work: unknown[] = []; const proofs: unknown[] = [];
  const options = { application: {} as AskApplication, allowedOrigin: TEST_APP_ORIGIN, registration: {
    register: async (input: unknown, source: unknown) => { work.push({ input, source }); return REGISTRATION_PUBLIC_RESPONSE; },
    verifyEmail: async () => ({ status: "mfa_required" as const }),
    resendVerification: async (input: unknown, source: unknown) => { work.push({ input, source }); return RESEND_PUBLIC_RESPONSE; }
  }, ...(result === null ? {} : { turnstile: { verify: async (input: unknown) => { proofs.push(input); return result; } } }) };
  return { api: buildApi(options as ApiOptions), work, proofs };
}

describe("mandatory proof at the public identity boundary", () => {
  // Removing the canonical parse or gate would reach registration (and its lookup/KDF/mail).
  it.each(["turnstile_token", "locale", "ui_locale", "time_zone", "terms", "privacy", "country"])("rejects missing canonical signup field %s before identity", async key => {
    const { api, work, proofs } = harness(); const payload: Record<string, unknown> = { ...signup }; delete payload[key];
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload });
      expect(response.statusCode).toBe(400); expect(work).toEqual([]); expect(proofs).toEqual([]);
    } finally { await api.close(); }
  });
  // Owner ruling 2026-10-09: the phone is optional, so a sign-up without one still passes the proof gate.
  it("accepts a sign-up without a phone, still behind the proof", async () => {
    const { api, work, proofs } = harness(); const { phone: _phone, ...payload } = signup;
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload });
      expect(response.statusCode).toBe(202); expect(proofs).toHaveLength(1); expect(work).toHaveLength(1);
      expect((work[0] as { input: { phone: unknown } }).input.phone).toBe("");
    } finally { await api.close(); }
  });
  it.each(["ZZ", "R0", null])("rejects invalid country before proof or identity: %s", async country => {
    const { api, work, proofs } = harness();
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: { ...signup, country } });
      expect(response.statusCode).toBe(400); expect(proofs).toEqual([]); expect(work).toEqual([]);
    } finally { await api.close(); }
  });
  it.each(["adult_affirmed", "recovery_email", "phone_source", "hostname", "action", "url", "secret"])("rejects public authority/transport override %s", async key => {
    const { api, work, proofs } = harness();
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: { ...signup, [key]: "untrusted" } });
      expect(response.statusCode).toBe(400); expect(work).toEqual([]); expect(proofs).toEqual([]);
    } finally { await api.close(); }
  });
  it.each([undefined, "", " ", "x".repeat(2049)])("rejects absent, empty or oversized proof at resend: %s", async token => {
    const { api, work, proofs } = harness();
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/resend-verification", payload: { ...resend, turnstile_token: token } });
      expect(response.statusCode).toBe(400); expect(work).toEqual([]); expect(proofs).toEqual([]);
    } finally { await api.close(); }
  });
  it.each(["rejected", "unavailable"] as const)("maps %s before any signup/resend identity work", async outcome => {
    const { api, work } = harness(outcome);
    try { for (const [url, payload] of [["/v1/auth/register", signup], ["/v1/auth/resend-verification", resend]] as const) {
      const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url, payload });
      expect(response.statusCode).toBe(outcome === "rejected" ? 400 : 503);
      expect(response.json()).toEqual({ error: outcome === "rejected" ? "TURNSTILE_REJECTED" : "TURNSTILE_UNAVAILABLE", message: outcome === "rejected" ? "TURNSTILE_REJECTED" : "TURNSTILE_UNAVAILABLE" });
      expect(response.body).not.toContain(signup.email); expect(response.body).not.toContain(payload.turnstile_token);
    } expect(work).toEqual([]); } finally { await api.close(); }
  });
  it("fails closed when composition omits the verifier", async () => {
    const { api, work } = harness(null);
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: signup }); expect(response.statusCode).toBe(503); expect(work).toEqual([]); }
    finally { await api.close(); }
  });
  it("passes only canonical facts and server age/legal evidence after a valid proof", async () => {
    const { api, work, proofs } = harness();
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: signup });
      expect(response.statusCode).toBe(202); expect(response.json()).toEqual({ ...REGISTRATION_PUBLIC_RESPONSE, retry_after_seconds: 60 });
      expect(proofs).toEqual([{ token: "fixture-proof", action: "signup" }]);
      expect(work).toEqual([{ input: { email: signup.email, password: signup.password, phone: "+40722123456", recoveryEmail: null, adultAffirmed: true }, source: expect.objectContaining({ legal: { ...legal, locale: "ro" } }) }]);
      expect(response.body).not.toContain("+40722123456");
    } finally { await api.close(); }
  });
  it("projects only the canonical acknowledgement from internal service results", async () => {
    const api = buildApi({ allowedOrigin: TEST_APP_ORIGIN, application: {} as AskApplication, turnstile: { verify: async () => "passed" }, registration: {
      register: async () => ({ ...REGISTRATION_PUBLIC_RESPONSE, internal_user_id: "must-not-leak" }),
      resendVerification: async () => ({ ...RESEND_PUBLIC_RESPONSE, internal_user_id: "must-not-leak" }), verifyEmail: async () => ({ status: "mfa_required" as const })
    } });
    try { for (const [url, payload] of [["/v1/auth/register", signup], ["/v1/auth/resend-verification", resend]] as const) {
      const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url, payload }); expect(response.statusCode).toBe(202); expect(response.body).not.toContain("must-not-leak");
      expect(Object.keys(response.json()).sort()).toEqual(["message", "retry_after_seconds"]);
    } } finally { await api.close(); }
  });
  it("uses the resend action and canonical acknowledgement", async () => {
    const { api, proofs } = harness();
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/resend-verification", payload: resend });
      expect(response.statusCode).toBe(202); expect(response.json()).toEqual({ ...RESEND_PUBLIC_RESPONSE, retry_after_seconds: 60 });
      expect(proofs).toEqual([{ token: "resend-proof", action: "resend-verification" }]);
    } finally { await api.close(); }
  });
  it("preserves cheap country and age refusals before verification", async () => {
    const { api, work, proofs } = harness();
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: { ...signup, date_of_birth: "2020-01-01" } });
      expect(response.statusCode).toBe(403); expect(response.headers["set-cookie"]).toBeDefined(); expect(work).toEqual([]); expect(proofs).toEqual([]);
    } finally { await api.close(); }
  });
});

function realIdentityService(limit = 2, sleep: (milliseconds: number) => Promise<void> = async () => undefined) {
  const work: string[] = []; const audits: unknown[] = [];
  const base = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  const policy = { ...base, rateLimits: { ...base.rateLimits, register: { ...base.rateLimits.register, admissionPerSource: limit }, resend: { ...base.rateLimits.resend, admissionPerSource: limit } } };
  const limiter = new InProcessAuthRateLimiter(policy.rateLimits, 32, policy.rateLimitRefusalAuditIntervalMs);
  const service = new RegistrationService({
    repository: { findAuditIdentityByBlindIndex: async () => { work.push("lookup"); return null; }, recordRateLimitRefusal: async (input: unknown) => { audits.push(input); } } as never,
    argon2: { hashPassword: async () => { work.push("password-kdf"); throw new Argon2InfrastructureError("ARGON2_WORKER_FAILED"); } } as never,
    mail: { sendVerification: async () => { work.push("mail"); } } as never,
    dekStore: { store: async () => { work.push("dek"); } } as never,
    verificationTokenFactory: () => { work.push("token"); return "never"; },
    blindIndexKey: Buffer.alloc(32, 4), policy, limiter, sleep
  });
  return { service, work, audits };
}
const admittedSource = { ip: "203.0.113.42", userAgent: "fixture", requestId: "internal-request" };
const serviceInput = { email: signup.email, password: signup.password, phone: "+40722123456", recoveryEmail: null, adultAffirmed: true };
describe("published source admission before proof", () => {
  it.each([["/v1/auth/register", signup, "register"], ["/v1/auth/resend-verification", resend, "resend"]] as const)("limits invalid-proof %s requests before transport without identity/password/token/mail work", async (url, payload, route) => {
    const { service, work, audits } = realIdentityService(2); let proofs = 0;
    const api = buildApi({ allowedOrigin: TEST_APP_ORIGIN, application: {} as AskApplication, registration: service, turnstile: { verify: async () => { proofs++; return "rejected"; } } });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url, payload });
        expect(response.statusCode).toBe(attempt < 2 ? 400 : 429);
      }
      expect(proofs).toBe(2); expect(work).toEqual([]);
      await service.drainRateLimitAuditFlushes(); expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ route, scope: "ip", count: 1 });
    } finally { await api.close(); }
  });
  it("starts expired-window audit only after the terminal refusal clamp settles", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    let releaseClamp!: () => void; const clamp = new Promise<void>(resolve => { releaseClamp = resolve; });
    const { service, work, audits } = realIdentityService(1, async () => clamp);
    try {
      const granted = await service.admitSource({ route: "register", source: admittedSource, input: serviceInput }); granted.release();
      const refusal = service.admitSource({ route: "register", source: admittedSource, input: serviceInput }).catch(error => error);
      await vi.advanceTimersByTimeAsync(61_000); expect(work).toEqual([]); expect(audits).toEqual([]);
      releaseClamp(); expect(await refusal).toMatchObject({ code: "AUTH_RATE_LIMITED" });
      await vi.advanceTimersByTimeAsync(0); expect(audits).toHaveLength(1);
      await service.drainRateLimitAuditFlushes();
    } finally { vi.useRealTimers(); }
  });
  it("charges valid proof once and excludes proofs/secrets from operational logs", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, work } = realIdentityService(1); let proofs = 0;
    const api = buildApi({ allowedOrigin: TEST_APP_ORIGIN, application: {} as AskApplication, registration: service, turnstile: { verify: async () => { proofs++; return "passed"; } } });
    try {
      const first = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: signup });
      expect(first.statusCode).toBe(503); expect(first.json()).toMatchObject({ error: "AUTH_TEMPORARILY_UNAVAILABLE" });
      expect(work).toEqual(["lookup", "password-kdf"]);
      const second = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: signup }); expect(second.statusCode).toBe(429); expect(proofs).toBe(1);
      await service.drainRateLimitAuditFlushes();
      expect(JSON.stringify(logs.mock.calls)).not.toContain(signup.turnstile_token);
      expect(JSON.stringify(logs.mock.calls)).not.toContain(signup.email);
    } finally { await api.close(); logs.mockRestore(); }
  });
  it.each(["rejected", "unavailable"] as const)("revokes a minted admission capability after %s proof", async outcome => {
    const { service, work } = realIdentityService(2);
    const admit = service.admitSource.bind(service);
    let captured: Awaited<ReturnType<typeof admit>> | undefined;
    let source: Parameters<typeof admit>[0]["source"] | undefined;
    service.admitSource = async request => { source = request.source; captured = await admit(request); return captured; };
    const api = buildApi({ allowedOrigin: TEST_APP_ORIGIN, application: {} as AskApplication, registration: service, turnstile: { verify: async () => outcome } });
    try {
      const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: signup }); expect(response.statusCode).toBe(outcome === "rejected" ? 400 : 503);
      await expect(service.register(serviceInput, source!, captured)).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" }); expect(work).toEqual([]);
    } finally { await api.close(); }
  });
  it("refuses forged, reused or wrong-route/source capabilities before identity", async () => {
    const { service, work } = realIdentityService(20);
    const forged = { release: () => undefined };
    await expect(service.register(serviceInput, admittedSource, forged as never)).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
    const wrongRoute = await service.admitSource({ route: "resend", source: admittedSource, input: { email: signup.email } });
    await expect(service.register(serviceInput, admittedSource, wrongRoute)).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
    const wrongSource = await service.admitSource({ route: "register", source: admittedSource, input: serviceInput });
    await expect(service.register(serviceInput, { ...admittedSource, requestId: "other-request" }, wrongSource)).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
    const revoked = await service.admitSource({ route: "register", source: admittedSource, input: serviceInput }); revoked.release();
    await expect(service.register(serviceInput, admittedSource, revoked)).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
    expect(work).toEqual([]);
    const admitted = await service.admitSource({ route: "register", source: admittedSource, input: serviceInput });
    await expect(service.register(serviceInput, admittedSource, admitted)).rejects.toMatchObject({ code: "AUTH_TEMPORARILY_UNAVAILABLE" });
    await expect(service.register(serviceInput, admittedSource, admitted)).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
    expect(work).toEqual(["lookup", "password-kdf"]);
  });
  it("preserves validated mail display separately from legal locale and source authority", () => {
    const source = sourceContext({ ...admittedSource, mailDisplay: { locale: "en-GB", timeZone: "Europe/Bucharest" } });
    expect(source).toEqual({ ...admittedSource, mailDisplay: { locale: "en-GB", timeZone: "Europe/Bucharest" } });
    expect(() => sourceContext({ ...admittedSource, mailDisplay: { locale: "unsupported", timeZone: null } })).toThrow("AUTH_INPUT_INVALID");
  });
});

const validated = { success: true, hostname: "v3-preview.dezbatere.ro", action: "signup", challenge_ts: "2026-10-04T12:00:00Z", "error-codes": [] };
async function transportBoundary(body: unknown, delay = 0) {
  const directory = await mkdtemp(join(tmpdir(), "ts-http-")); const socketPath = join(directory, "relay.sock");
  const server = createServer((request, response) => { request.resume(); setTimeout(() => { response.writeHead(200); response.end(JSON.stringify(body)); }, delay).unref(); });
  await new Promise<void>(resolve => server.listen(socketPath, resolve));
  const verifier = new UnixTurnstileVerifier({ socketPath, publicAppUrl: "https://v3-preview.dezbatere.ro", clock: () => new Date("2026-10-04T12:00:01Z") });
  return { verifier, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); } };
}
describe("direct API calls cannot bypass Siteverify decisions", () => {
  it.each([
    ["spoofed", { success: false, "error-codes": ["invalid-input-response"] }, 0, 400],
    ["expired", { ...validated, challenge_ts: "2026-10-04T11:55:00Z" }, 0, 400],
    ["hostname", { ...validated, hostname: "dezbatere.ro" }, 0, 400],
    ["action", { ...validated, action: "resend-verification" }, 0, 400],
    ["timeout", validated, 6000, 503]
  ] as const)("refuses %s before account lookup/password KDF/DEK/token/mail", async (_name, body, delay, status) => {
    const transport = await transportBoundary(body, delay); const { service, work } = realIdentityService();
    const api = buildApi({ allowedOrigin: TEST_APP_ORIGIN, application: {} as AskApplication, registration: service, turnstile: transport.verifier });
    try { const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: signup }); expect(response.statusCode).toBe(status); expect(work).toEqual([]); }
    finally { await api.close(); await transport.close(); }
  });
  it("refuses an already consumed proof without identity work", async () => {
    const transport = await transportBoundary(validated); const { service, work } = realIdentityService();
    const api = buildApi({ allowedOrigin: TEST_APP_ORIGIN, application: {} as AskApplication, registration: service, turnstile: transport.verifier });
    try { expect(await transport.verifier.verify({ token: signup.turnstile_token, action: "signup" })).toBe("passed");
      const response = await api.inject({ headers: { origin: TEST_APP_ORIGIN }, method: "POST", url: "/v1/auth/register", payload: signup }); expect(response.statusCode).toBe(400); expect(work).toEqual([]);
    } finally { await api.close(); await transport.close(); }
  });
});
