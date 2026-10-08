import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue } from "@debateai/register";
import type { GeoLookup } from "@debateai/geo";
import { SUPPORT_TEMPLATES } from "../../apps/api/src/support/templates.js";
import { CountryGate } from "../../apps/api/src/country-gate.js";
import type { SupportApplication } from "../../apps/api/src/support/index.js";
import { supportHarness } from "../support/supportHarness.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";

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
  code: "COUNTRY_SUPPORT_UNAVAILABLE",
  text: "Dialectical Engine isn't available in your country yet."
});

describe("the country gate in front of the support assistant", () => {
  it("decides support by sign-up's rule, and never audits it", () => {
    const { gate, audit } = countryGate();
    const source = (ip: string) => ({ ip, userAgent: "test/1", requestId: "request-1" });
    expect(gate.support(source(OPEN_HERE))).toBeNull();
    // Switzerland is sign-up only (no payment yet): the service is offered, so support is too.
    expect(gate.support(source("31.13.1.1"))).toBeNull();
    expect(gate.support(source("5.45.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    expect(gate.support(source("51.140.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    expect(gate.support(source("78.180.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    expect(gate.support(source("185.220.101.7"))).toBe("TOR_REFUSED");
    expect(gate.support(source("10.0.0.1"))).toBe("COUNTRY_UNKNOWN");
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

  it("answers `support` in availability with sign-up's value, and true with no gate composed", async () => {
    const gated = harness(countryGate().gate);
    for (const [remoteAddress, expected] of [
      [OPEN_HERE, { signup: true, pay: true, support: true }],
      ["31.13.1.1", { signup: true, pay: false, support: true }],
      ["51.140.1.1", { signup: false, pay: false, support: false }],
      ["185.220.101.7", { signup: false, pay: false, support: false }]
    ] as const) {
      const response = await gated.api.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress });
      expect(response.json(), remoteAddress).toEqual(expected);
    }
    await gated.api.close();
    const ungated = harness();
    const response = await ungated.api.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "5.45.1.1" });
    expect(response.json()).toEqual({ signup: true, pay: false, support: true });
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
