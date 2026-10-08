import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue } from "@debateai/register";
import type { GeoLookup } from "@debateai/geo";
import { SUPPORT_TEMPLATES } from "../../apps/api/src/support/templates.js";
import { CountryGate } from "../../apps/api/src/country-gate.js";
import type { SupportApplication } from "../../apps/api/src/support/index.js";
import { supportHarness } from "../support/supportHarness.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const IDENTITY = testHttpIdentity("country-gate-service");

/**
 * Paid plans G3a, extended to support: the support assistant is gated exactly where sign-up is —
 * a country whose sign-up switch is off, a Tor exit, an unknown address. Every route that talks to
 * the assistant refuses there with the sign-up page's own sentence; reads stay open.
 */
const policy = countryPolicyFromValue(
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);
const PLACES: Readonly<Record<string, Readonly<{ country: string; tor: boolean }>>> = {
  "81.196.20.30": { country: "RO", tor: false },
  "31.13.1.1": { country: "CH", tor: false },
  "5.45.1.1": { country: "RU", tor: false },
  "51.140.1.1": { country: "GB", tor: false },
  "78.180.1.1": { country: "TR", tor: false },
  "185.220.101.7": { country: "DE", tor: true }
};
const lookup: GeoLookup = {
  lookup: (ip) => PLACES[ip] ?? { country: "XX", tor: false },
  close: () => undefined
};
const OPEN_HERE = "81.196.20.30";
const CLOSED_PLACES = ["5.45.1.1", "51.140.1.1", "78.180.1.1", "185.220.101.7", "10.0.0.1"];

function countryGate() {
  const audit = { recordCountryGateRefusal: vi.fn(async () => undefined) };
  return { audit, gate: new CountryGate({ policy, lookup, audit }) };
}

function harness(gate?: CountryGate) {
  const support = supportHarness();
  const rateMessage = vi.fn(async () => { throw new Error("rating reached past the gate"); });
  const openCase = vi.fn(async () => { throw new Error("escalation reached past the gate"); });
  const application: SupportApplication = {
    ...support.application,
    sessions: { ...support.application.sessions, rateMessage } as SupportApplication["sessions"],
    cases: { open: openCase } as unknown as NonNullable<SupportApplication["cases"]>
  };
  const api = buildApi({
    application: {} as AskApplication,
    support: application,
    allowedOrigin: TEST_APP_ORIGIN,
    ...(gate === undefined ? {} : { countryGate: gate })
  });
  const post = (url: string, remoteAddress: string, payload: Record<string, unknown>, token?: string) => api.inject({
    method: "POST", url, remoteAddress, payload,
    headers: { origin: TEST_APP_ORIGIN, ...(token === undefined ? {} : { "x-support-session-token": token }) }
  });
  return { api, support, rateMessage, openCase, post };
}

const REFUSAL = Object.freeze({
  outcome: "DISABLED",
  code: "COUNTRY_SERVICE_UNAVAILABLE",
  text: "Dialectical Engine isn't available in your country yet."
});

describe("the country gate in front of the support assistant", () => {
  it("decides support by sign-up's rule, and never audits it", () => {
    const { gate, audit } = countryGate();
    const source = (ip: string) => ({ ip, userAgent: "test/1", requestId: "request-1" });
    expect(gate.service(source(OPEN_HERE))).toBeNull();
    // Switzerland is sign-up only (no payment yet): the service is offered, so support is too.
    expect(gate.service(source("31.13.1.1"))).toBeNull();
    expect(gate.service(source("5.45.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    expect(gate.service(source("51.140.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    expect(gate.service(source("78.180.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    expect(gate.service(source("185.220.101.7"))).toBe("TOR_REFUSED");
    expect(gate.service(source("10.0.0.1"))).toBe("COUNTRY_UNKNOWN");
    expect(audit.recordCountryGateRefusal).not.toHaveBeenCalled();
  });

  it("refuses a new support chat from every closed place, in the visitor's language, before a session exists", async () => {
    const { api, support, post } = harness(countryGate().gate);
    for (const remoteAddress of CLOSED_PLACES) {
      const refused = await post("/v1/support/sessions", remoteAddress, { language: "en" });
      expect(refused.statusCode, remoteAddress).toBe(403);
      expect(refused.json(), remoteAddress).toEqual(REFUSAL);
    }
    const romanian = await post("/v1/support/sessions", "5.45.1.1", { language: "ro" });
    expect(romanian.json()).toEqual({
      ...REFUSAL, text: "Dialectical Engine nu este încă disponibil în țara dumneavoastră."
    });
    expect(support.sessions.size).toBe(0);
    const admitted = await post("/v1/support/sessions", OPEN_HERE, { language: "en" });
    expect(admitted.statusCode).toBe(201);
    expect(support.sessions.size).toBe(1);
    await api.close();
  });

  it("refuses messages, ratings and escalation on a session opened elsewhere, once the address is closed", async () => {
    const { api, rateMessage, openCase, post } = harness(countryGate().gate);
    const opened = (await post("/v1/support/sessions", OPEN_HERE, { language: "en" })).json() as Readonly<{
      session: Readonly<{ session_id: string }>; session_token: string;
    }>;
    const id = opened.session.session_id;
    const token = opened.session_token;
    const message = await post(`/v1/support/sessions/${id}/messages`, "5.45.1.1", { text: "hello" }, token);
    expect(message.statusCode).toBe(403);
    expect(message.json()).toEqual(REFUSAL);
    const rating = await post(
      "/v1/support/messages/33333333-3333-4333-8333-333333333333/rating", "5.45.1.1",
      { session_id: id, rating: "no" }, token
    );
    expect(rating.statusCode).toBe(403);
    expect(rating.json()).toEqual(REFUSAL);
    const escalation = await post(`/v1/support/sessions/${id}/escalate`, "5.45.1.1", {}, token);
    expect(escalation.statusCode).toBe(403);
    expect(escalation.json()).toEqual(REFUSAL);
    expect(rateMessage).not.toHaveBeenCalled();
    expect(openCase).not.toHaveBeenCalled();
    // Reading the conversation back is never gated.
    const read = await api.inject({
      method: "GET", url: `/v1/support/sessions/${id}`, remoteAddress: "5.45.1.1",
      headers: { "x-support-session-token": token }
    });
    expect(read.statusCode).toBe(200);
    await api.close();
  });

  it("answers `service` in availability with sign-up's value, and true with no gate composed", async () => {
    const gated = harness(countryGate().gate);
    for (const [remoteAddress, expected] of [
      [OPEN_HERE, { signup: true, pay: true, service: true }],
      ["31.13.1.1", { signup: true, pay: false, service: true }],
      ["51.140.1.1", { signup: false, pay: false, service: false }],
      ["185.220.101.7", { signup: false, pay: false, service: false }]
    ] as const) {
      const response = await gated.api.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress });
      expect(response.json(), remoteAddress).toEqual(expected);
    }
    await gated.api.close();
    const ungated = harness();
    const response = await ungated.api.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "5.45.1.1" });
    expect(response.json()).toEqual({ signup: true, pay: false, service: true });
    const created = await ungated.post("/v1/support/sessions", "5.45.1.1", { language: "en" });
    expect(created.statusCode).toBe(201);
    await ungated.api.close();
  });

  it("uses the sign-up page's sentence, word for word, in all 35 locales", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const [locale, sentence] of Object.entries(SUPPORT_TEMPLATES.COUNTRY_UNAVAILABLE)) {
      const auth = JSON.parse(await readFile(new URL(`../../apps/ui/messages/${locale}/auth.json`, import.meta.url), "utf8")) as Record<string, string>;
      const chrome = JSON.parse(await readFile(new URL(`../../apps/ui/messages/${locale}/support.json`, import.meta.url), "utf8")) as Record<string, string>;
      expect(sentence, locale).toBe(auth["auth.signUp.countryUnavailable"]);
      expect(chrome["support.countryUnavailable"], locale).toBe(sentence);
    }
    expect(Object.keys(SUPPORT_TEMPLATES.COUNTRY_UNAVAILABLE)).toHaveLength(35);
  });
});

describe("the country gate in front of sign-in", () => {
  /** A service whose every method records the call: the gate must refuse before any is reached. */
  function recordingService(calls: string[], name: string): never {
    return new Proxy({}, {
      get: (_target, member) => member === "then" ? undefined : (..._args: unknown[]) => {
        calls.push(`${name}.${String(member)}`);
        throw new Error("REACHED");
      }
    }) as never;
  }

  function signInApi(gate?: CountryGate) {
    const calls: string[] = [];
    const support = supportHarness();
    const api = buildApi({
      application: {} as AskApplication,
      support: support.application,
      allowedOrigin: TEST_APP_ORIGIN,
      sessions: recordingService(calls, "sessions"),
      consumerWebAuthn: recordingService(calls, "consumerWebAuthn"),
      socialAuth: recordingService(calls, "socialAuth"),
      consumerRecovery: recordingService(calls, "consumerRecovery"),
      recovery: recordingService(calls, "recovery"),
      passwordReset: recordingService(calls, "passwordReset"),
      mfaRecovery: recordingService(calls, "mfaRecovery"),
      mfa: recordingService(calls, "mfa"),
      ...(gate === undefined ? {} : { countryGate: gate })
    });
    return { api, calls };
  }

  const SIGN_IN_POSTS = [
    "/v1/auth/login",
    "/v1/auth/passkeys/login/options",
    "/v1/auth/passkeys/login/complete",
    "/v1/auth/social/google/begin",
    "/v1/auth/social/login/status",
    "/v1/auth/recovery/start",
    "/v1/auth/recovery/prove",
    "/v1/auth/recovery/enrollment/options",
    "/v1/auth/recovery/enrollment/complete",
    "/v1/auth/password-reset/start",
    "/v1/auth/password-reset/exchange",
    "/v1/auth/password-reset/complete",
    "/v1/auth/mfa-recovery/start",
    "/v1/auth/mfa-recovery/exchange",
    // Onboarding with no session held ends in a new one: a sign-in door too.
    "/v1/auth/mfa/totp/begin",
    "/v1/auth/mfa/totp/verify",
    "/v1/auth/mfa/recovery-codes/generate",
    "/v1/auth/mfa/recovery-codes/confirm",
    "/v1/auth/passkeys/enrollment/options",
    "/v1/auth/passkeys/enrollment/complete"
  ];

  it("refuses every sign-in door from every closed place, before any service runs", async () => {
    const { api, calls } = signInApi(countryGate().gate);
    for (const url of SIGN_IN_POSTS) {
      for (const remoteAddress of CLOSED_PLACES) {
        const refused = await api.inject({
          method: "POST", url, remoteAddress, headers: { origin: TEST_APP_ORIGIN }, payload: {}
        });
        expect(refused.statusCode, `${url} ${remoteAddress}`).toBe(403);
        expect(refused.json(), `${url} ${remoteAddress}`).toEqual({ error: "COUNTRY_SERVICE_UNAVAILABLE" });
      }
    }
    expect(calls).toEqual([]);
    await api.close();
  });

  it("sends a social callback from a closed place back to the login page, which says why", async () => {
    const { api, calls } = signInApi(countryGate().gate);
    const google = await api.inject({
      method: "GET", url: "/v1/auth/social/google/callback?state=s&code=c", remoteAddress: "5.45.1.1"
    });
    expect(google.statusCode).toBe(303);
    expect(google.headers.location).toBe("/login");
    const apple = await api.inject({
      method: "POST", url: "/v1/auth/social/apple/callback", remoteAddress: "5.45.1.1",
      headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "state=s&code=c"
    });
    expect(apple.statusCode).toBe(303);
    expect(apple.headers.location).toBe("/login");
    expect(calls).toEqual([]);
    await api.close();
  });

  it("lets every sign-in door through from an open place, and gates nothing with no gate composed", async () => {
    for (const [gate, remoteAddress] of [[countryGate().gate, OPEN_HERE], [undefined, "5.45.1.1"]] as const) {
      const { api } = signInApi(gate);
      for (const url of SIGN_IN_POSTS) {
        const response = await api.inject({
          method: "POST", url, remoteAddress, headers: { origin: TEST_APP_ORIGIN }, payload: {}
        });
        expect(response.statusCode, `${url} ${remoteAddress}`).not.toBe(404);
        expect(response.body, `${url} ${remoteAddress}`).not.toContain("COUNTRY_SERVICE_UNAVAILABLE");
      }
      await api.close();
    }
  });

  it("lets a session already held add a factor from a closed place", async () => {
    const calls: string[] = [];
    const api = buildApi({
      application: {} as AskApplication,
      allowedOrigin: TEST_APP_ORIGIN,
      sessions: testSessionApplication([IDENTITY]),
      mfa: recordingService(calls, "mfa"),
      consumerWebAuthn: recordingService(calls, "consumerWebAuthn"),
      countryGate: countryGate().gate
    });
    for (const url of ["/v1/auth/mfa/totp/begin", "/v1/auth/passkeys/enrollment/options"]) {
      const response = await api.inject({
        method: "POST", url, remoteAddress: "5.45.1.1", headers: testSessionHeaders(IDENTITY, true), payload: {}
      });
      expect(response.body, url).not.toContain("COUNTRY_SERVICE_UNAVAILABLE");
    }
    expect(calls.length).toBeGreaterThan(0);
    await api.close();
  });

  it("never gates the cancel links, or a session already held", async () => {
    const { api } = signInApi(countryGate().gate);
    for (const url of ["/v1/auth/password-reset/cancel", "/v1/auth/mfa-recovery/cancel", "/v1/auth/logout"]) {
      const response = await api.inject({
        method: "POST", url, remoteAddress: "5.45.1.1", headers: { origin: TEST_APP_ORIGIN }, payload: {}
      });
      expect(response.body, url).not.toContain("COUNTRY_SERVICE_UNAVAILABLE");
    }
    await api.close();
  });
});
