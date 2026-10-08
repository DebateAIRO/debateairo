import { canonicalSignup, passedTurnstile } from "../support/turnstileFixtures.js";
import { describe, expect, it, vi } from "vitest";
import { REGION_COUNTRY_CODES } from "@debateai/kernel";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue } from "@debateai/register";
import { AGE_REFUSAL_COOKIE_NAME } from "@debateai/contract";
import type { GeoLookup } from "@debateai/geo";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { CountryGate } from "../../apps/api/src/country-gate.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication } from "../support/httpSession.js";

const policy = countryPolicyFromValue(COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef);
const PLACES: Readonly<Record<string, Readonly<{ country: string; tor: boolean }>>> = {
  "81.196.20.30": { country: "RO", tor: false }, "5.45.1.1": { country: "RU", tor: false }
};
const lookup: GeoLookup = { lookup: (ip) => PLACES[ip] ?? { country: "XX", tor: false }, close: () => undefined };
const gate = () => {
  const audit = { recordCountryGateRefusal: vi.fn(async (_input: unknown) => undefined) };
  return { gate: new CountryGate({ policy, lookup, audit }), audit };
};
const { country: _defaultCountry, ...REGISTER_BODY } = canonicalSignup;
const invalid = { error: "AUTH_INPUT_INVALID", message: "AUTH_INPUT_INVALID" };
function api(countryGate?: CountryGate) {
  const register = vi.fn(async (_input: unknown, _source: unknown) => ({ message: "If this address can be registered, verification instructions will arrive. Check your spam folder." }));
  const instance = buildApi({
    application: { submit: vi.fn() } as unknown as AskApplication,
    turnstile: passedTurnstile,
    registration: { register, verifyEmail: vi.fn(), resendVerification: vi.fn() } as never,
    sessions: testSessionApplication([testHttpIdentity("region-api")]), allowedOrigin: TEST_APP_ORIGIN,
    ...(countryGate === undefined ? {} : { countryGate })
  });
  return { register, instance };
}
const post = (instance: ReturnType<typeof api>["instance"], payload: Record<string, unknown>, ip = "81.196.20.30", headers?: Record<string, string>) => instance.inject({ method: "POST", url: "/v1/auth/register", payload, remoteAddress: ip, ...(headers === undefined ? {} : { headers }) });
const cookies = (response: { headers: Record<string, unknown> }) => {
  const raw = response.headers["set-cookie"];
  return raw === undefined ? [] : Array.isArray(raw) ? raw.map(String) : [String(raw)];
};

describe("registration region API", () => {
  it("C1 passes each valid declared region to the service", async () => {
    const { instance, register } = api();
    for (const [members, expected] of [
      [{ country: "RO" }, { country: "RO", usState: null }],
      [{ country: "US", us_state: "TX" }, { country: "US", usState: "TX" }],
      [{ country: "RO", us_state: null }, { country: "RO", usState: null }]
    ] as const) {
      register.mockClear();
      const response = await post(instance, { ...REGISTER_BODY, ...members });
      expect(response.statusCode).toBe(202);
      expect(register.mock.calls[0]?.[1]).toMatchObject({ region: expected });
    }
    await instance.close();
  });
  it.each([
    ["C2 missing country", {}], ["C3 numeric country", { country: 7 }],
    ["C4 lowercase country", { country: "ro" }], ["C5 unknown country", { country: "XX" }],
    ["C6 missing US state", { country: "US" }], ["C7 state name", { country: "US", us_state: "Texas" }],
    ["C8 foreign state", { country: "RO", us_state: "CA" }]
  ])("%s receives the input refusal before registration", async (_title, members) => {
    const { instance, register } = api();
    const response = await post(instance, { ...REGISTER_BODY, ...members });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(invalid);
    expect(register).not.toHaveBeenCalled();
    await instance.close();
  });
  it("C9 rejects malformed region before the age refusal cookie", async () => {
    const { instance, register } = api();
    const response = await post(instance, REGISTER_BODY, "81.196.20.30", { cookie: `${AGE_REFUSAL_COOKIE_NAME}=refused` });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(invalid);
    expect(cookies(response).some((cookie) => cookie.startsWith(AGE_REFUSAL_COOKIE_NAME))).toBe(false);
    expect(register).not.toHaveBeenCalled();
    await instance.close();
  });
  it("C10 refuses a declared closed country without an IP audit", async () => {
    const country = gate(); const { instance, register } = api(country.gate);
    const response = await post(instance, { ...REGISTER_BODY, country: "KE" });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "COUNTRY_SIGNUP_UNAVAILABLE" });
    expect(register).not.toHaveBeenCalled();
    expect(country.audit.recordCountryGateRefusal).not.toHaveBeenCalled();
    await instance.close();
  });
  it("C11 refuses exactly the closed drawn countries", () => {
    const closed = "DZ EG ET GH KE MA NG RW SN ZA TN UG CN IN ID MY PK PH TH VN RS UA GB BH JO KW LB OM QA SA TR AE CR MX PA AR BR CL CO EC PE UY FJ".split(" ");
    const refused = REGION_COUNTRY_CODES.filter((code) => gate().gate.declaredSignupRefusal(code) !== null);
    expect(refused.sort()).toEqual(closed.sort());
  });
  it("C12 answers IP gate, region, declared gate, then age in order", async () => {
    const country = gate(); const { instance } = api(country.gate);
    const closedIp = await post(instance, { ...REGISTER_BODY, country: "RO" }, "5.45.1.1");
    expect(closedIp.statusCode).toBe(403); expect(closedIp.json()).toEqual({ error: "COUNTRY_SIGNUP_UNAVAILABLE" });
    expect(country.audit.recordCountryGateRefusal).toHaveBeenCalledTimes(1);
    expect(country.audit.recordCountryGateRefusal.mock.calls[0]?.[0]).toMatchObject({ country: "RU" });
    expect((await post(instance, { ...REGISTER_BODY, country: "XX" }, "5.45.1.1")).statusCode).toBe(403);
    expect((await post(instance, { ...REGISTER_BODY, country: "XX" })).statusCode).toBe(400);
    const declared = await post(instance, { ...REGISTER_BODY, country: "KE", date_of_birth: "2020-01-01" });
    expect(declared.statusCode).toBe(403); expect(declared.json()).toEqual({ error: "COUNTRY_SIGNUP_UNAVAILABLE" });
    expect(cookies(declared).some((cookie) => cookie.startsWith(AGE_REFUSAL_COOKIE_NAME))).toBe(false);
    await instance.close();
  });
  it("C13 permits a closed declared country when no gate is composed", async () => {
    const { instance, register } = api();
    expect((await post(instance, { ...REGISTER_BODY, country: "KE" })).statusCode).toBe(202);
    expect(register.mock.calls[0]?.[1]).toMatchObject({ region: { country: "KE", usState: null } });
    await instance.close();
  });
  it("C14 keeps the edge and declared countries separate on the source", async () => {
    const { instance, register } = api();
    expect((await post(instance, { ...REGISTER_BODY, country: "RO" }, "81.196.20.30", { "cf-ipcountry": "DE" })).statusCode).toBe(202);
    expect(register.mock.calls[0]?.[1]).toMatchObject({ countryCode: "DE", region: { country: "RO", usState: null } });
    await instance.close();
  });
});
