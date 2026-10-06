import { canonicalSignup, passedTurnstile } from "../support/turnstileFixtures.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  AGE_REFUSAL_COOKIE_MAX_AGE_SECONDS,
  AGE_REFUSAL_COOKIE_NAME
} from "@debateai/contract";
import { AGE_RULE_VERSION, MIN_AGE } from "@debateai/kernel";
import {
  REGISTRATION_PUBLIC_RESPONSE,
  RESEND_PUBLIC_RESPONSE,
  type RegisterInput,
  type RegistrationApplication
} from "../../apps/api/src/registration.js";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import type { AuthSourceContext } from "@debateai/db";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

/* Age gate — the API half (Turn 8 implementation prompt: age-check before register, lockout
   cookie, register never reached on refusal, one-time confirmation for existing accounts). */

const LOCKOUT = `${AGE_REFUSAL_COOKIE_NAME}=refused; Path=/; Max-Age=${AGE_REFUSAL_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
const TODAY = new Date(Date.UTC(2026, 8, 28, 12));

function askApplication(): AskApplication {
  return new Proxy({}, { get: () => async () => null }) as AskApplication;
}

function registrationSpy(): { app: RegistrationApplication; calls: RegisterInput[]; sources: AuthSourceContext[] } {
  const calls: RegisterInput[] = [];
  const sources: AuthSourceContext[] = [];
  return {
    calls,
    sources,
    app: {
      register: async (input, source) => { calls.push(input); sources.push(source); return REGISTRATION_PUBLIC_RESPONSE; },
      verifyEmail: async () => ({ status: "mfa_required" }),
      resendVerification: async () => RESEND_PUBLIC_RESPONSE
    }
  };
}

function setCookies(response: { headers: Record<string, unknown> }): string[] {
  const raw = response.headers["set-cookie"];
  return raw === undefined ? [] : Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

afterEach(() => { vi.useRealTimers(); });

describe("POST /v1/auth/age-check", () => {
  const trusted = { origin: TEST_APP_ORIGIN };
  async function check(dateOfBirth: unknown, headers: Record<string, string> = trusted) {
    const { app } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app, allowedOrigin: TEST_APP_ORIGIN });
    try {
      return await api.inject({ method: "POST", url: "/v1/auth/age-check", headers, payload: { date_of_birth: dateOfBirth } });
    } finally {
      await api.close();
    }
  }

  it("allows exactly 18 today and sets no cookie", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    const response = await check("2008-09-28");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: "allowed" });
    expect(setCookies(response).some((cookie) => cookie.startsWith(AGE_REFUSAL_COOKIE_NAME))).toBe(false);
  });

  it("refuses 18 tomorrow with the 30-day httpOnly lockout cookie", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    const response = await check("2008-09-29");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ outcome: "refused" });
    expect(setCookies(response)).toContain(LOCKOUT);
    expect(AGE_REFUSAL_COOKIE_MAX_AGE_SECONDS).toBe(2_592_000);
  });

  it("keeps refusing while the lockout cookie is present, even for an adult date", async () => {
    const response = await check("1980-01-01", { ...trusted, cookie: `${AGE_REFUSAL_COOKIE_NAME}=refused` });
    expect(response.json()).toEqual({ outcome: "refused" });
  });

  it.each(["2001-02-31", "2001-02-29", "1890-03-14", "2999-01-01", "14/03/1998", "", 19980314])(
    "refuses the malformed or impossible date %j as a bad request",
    async (value) => {
      const response = await check(value);
      expect(response.statusCode).toBe(400);
      expect(setCookies(response).some((cookie) => cookie.startsWith(AGE_REFUSAL_COOKIE_NAME))).toBe(false);
    }
  );

  it("is held to the exact first-party Origin", async () => {
    const response = await check("1990-01-01", {});
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toContain("allowed");
  });
});

describe("POST /v1/auth/register behind the age gate", () => {
  const body = (dateOfBirth: string) => ({
    ...canonicalSignup,
    email: "alice@example.test", password: "password-123",
    phone: "+40722123456", country: "RO", date_of_birth: dateOfBirth
  });

  it("passes an adult through with the canonical public acknowledgement", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    const { app, calls } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app });
    try {
      const response = await api.inject({ method: "POST", url: "/v1/auth/register", payload: body("2008-09-28") });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ ...REGISTRATION_PUBLIC_RESPONSE, retry_after_seconds: 60 });
      expect(response.body).toBe(
        '{"message":"If this address can be registered, verification instructions will arrive. Check your spam folder.","retry_after_seconds":60}'
      );
      expect(calls).toHaveLength(1);
      // The service learns only that the gate passed; the date goes no further than the edge.
      expect(calls[0]).toEqual({
        email: "alice@example.test", password: "password-123",
        phone: "+40722123456", recoveryEmail: null, adultAffirmed: true
      });
    } finally {
      await api.close();
    }
  });

  it("records the edge country when one is reported, and nothing when it is unknown", async () => {
    const { app, sources } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app });
    try {
      await api.inject({ method: "POST", url: "/v1/auth/register", headers: { "cf-ipcountry": "RO" }, payload: body("1990-01-01") });
      await api.inject({ method: "POST", url: "/v1/auth/register", headers: { "cf-ipcountry": "XX" }, payload: body("1990-01-01") });
      expect(sources.map((source) => source.countryCode)).toEqual(["RO", undefined]);
      expect(sources[1]).not.toHaveProperty("countryCode");
    } finally {
      await api.close();
    }
  });

  it("never reaches registration while the lockout cookie is set", async () => {
    const { app, calls } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/auth/register",
        headers: { cookie: `${AGE_REFUSAL_COOKIE_NAME}=refused` }, payload: body("1990-01-01")
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "AUTH_AGE_REFUSED", message: "AUTH_AGE_REFUSED" });
      expect(calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("refuses 18 tomorrow at register itself with 403 and the lockout cookie, never reaching the service", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    const { app, calls } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app });
    try {
      const response = await api.inject({ method: "POST", url: "/v1/auth/register", payload: body("2008-09-29") });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "AUTH_AGE_REFUSED", message: "AUTH_AGE_REFUSED" });
      expect(setCookies(response)).toContain(LOCKOUT);
      expect(calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it.each([
    ["no date, only the old affirmation", { adult_affirmed: true }],
    ["an impossible date", { date_of_birth: "2001-02-29", adult_affirmed: true }],
    ["a date in the wrong shape", { date_of_birth: "14/03/1998" }]
  ])("treats %s as invalid input and never reaches the service", async (_label, extra) => {
    const { app, calls } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/auth/register",
        payload: { email: "alice@example.test", password: "password-123", recovery_email: "recovery@example.test", ...extra }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "AUTH_INPUT_INVALID" });
      expect(setCookies(response).some((cookie) => cookie.startsWith(AGE_REFUSAL_COOKIE_NAME))).toBe(false);
      expect(calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });
});

describe("the one-time confirmation for existing accounts", () => {
  const identity = testHttpIdentity("age-gate-existing");
  function sessions(record: { outcome: "required" | "passed" | "refused"; calls: unknown[] }): SessionApplication {
    return Object.freeze<SessionApplication>({
      ...testSessionApplication([identity]),
      readAgeConfirmation: async () => (record.outcome === "required" ? "required" as const : "confirmed" as const),
      confirmAccountAge: async (_session, input) => {
        record.calls.push(input);
        if (record.outcome !== "required") return record.outcome;
        record.outcome = input.passed ? "passed" : "refused";
        return record.outcome;
      }
    });
  }

  it("reports required, then confirmed after a passing date", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    const record = { outcome: "required" as "required" | "passed" | "refused", calls: [] as unknown[] };
    const api = buildApi({ application: askApplication(), sessions: sessions(record), allowedOrigin: TEST_APP_ORIGIN });
    try {
      const before = await api.inject({ method: "GET", url: "/v1/auth/age-confirmation", headers: testSessionHeaders(identity) });
      expect(before.json()).toEqual({ status: "required" });
      const confirm = await api.inject({
        method: "POST", url: "/v1/auth/age-confirmation",
        headers: testSessionHeaders(identity, true), payload: { date_of_birth: "2008-09-28" }
      });
      expect(confirm.json()).toEqual({ outcome: "allowed" });
      expect(record.calls).toEqual([{ passed: true, minAgeApplied: MIN_AGE, countryCode: null, ruleVersion: AGE_RULE_VERSION }]);
      const after = await api.inject({ method: "GET", url: "/v1/auth/age-confirmation", headers: testSessionHeaders(identity) });
      expect(after.json()).toEqual({ status: "confirmed" });
    } finally {
      await api.close();
    }
  });

  it("freezes on an under-age date: sessions end and the lockout cookie is set", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    const record = { outcome: "required" as "required" | "passed" | "refused", calls: [] as unknown[] };
    const api = buildApi({ application: askApplication(), sessions: sessions(record), allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/auth/age-confirmation",
        headers: testSessionHeaders(identity, true), payload: { date_of_birth: "2008-09-29" }
      });
      expect(response.json()).toEqual({ outcome: "refused" });
      const cookies = setCookies(response);
      expect(cookies).toContain(LOCKOUT);
      expect(cookies.some((cookie) => cookie.startsWith("__Host-debateai-session=;"))).toBe(true);
      expect(record.calls).toEqual([{ passed: false, minAgeApplied: 18, countryCode: null, ruleVersion: AGE_RULE_VERSION }]);
    } finally {
      await api.close();
    }
  });

  it("needs a session and the CSRF pair", async () => {
    const record = { outcome: "required" as "required" | "passed" | "refused", calls: [] as unknown[] };
    const api = buildApi({ application: askApplication(), sessions: sessions(record), allowedOrigin: TEST_APP_ORIGIN });
    try {
      const anonymous = await api.inject({ method: "GET", url: "/v1/auth/age-confirmation" });
      expect(anonymous.statusCode).toBe(401);
      const noCsrf = await api.inject({
        method: "POST", url: "/v1/auth/age-confirmation",
        headers: testSessionHeaders(identity), payload: { date_of_birth: "1990-01-01" }
      });
      expect(noCsrf.statusCode).toBe(403);
      expect(record.calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });
});
