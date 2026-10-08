import { canonicalSignup, passedTurnstile } from "../support/turnstileFixtures.js";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  admissionPolicyFromValue,
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW,
  countryPolicyFromValue
} from "@debateai/register";
import type { GeoLookup } from "@debateai/geo";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { CountryGate, countryPolicyInForce, type CountryGateAuditWriter } from "../../apps/api/src/country-gate.js";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const policy = countryPolicyFromValue(
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);
const PLACES: Readonly<Record<string, Readonly<{ country: string; tor: boolean }>>> = {
  "81.196.20.30": { country: "RO", tor: false },
  "5.45.1.1": { country: "RU", tor: false },
  "51.140.1.1": { country: "GB", tor: false },
  "31.13.1.1": { country: "CH", tor: false },
  "84.94.1.1": { country: "IL", tor: false },
  "1.160.1.1": { country: "TW", tor: false },
  "89.28.1.1": { country: "MD", tor: false },
  "46.211.1.1": { country: "UA", tor: false },
  "78.180.1.1": { country: "TR", tor: false },
  "185.220.101.7": { country: "DE", tor: true }
};
const lookup: GeoLookup = {
  lookup: (ip) => PLACES[ip] ?? { country: "XX", tor: false },
  close: () => undefined
};
const IDENTITY = testHttpIdentity("country-gate");
const source = (ip: string) => ({ ip, userAgent: "test/1", requestId: "request-1" });
const ASK = {
  question_line: "Should cities price road use?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test", composition_budget_tier: "low", plan_tier: "free",
  depth_params: { depth: 1 }, decision_scope: "test-layer scope", as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [], steering_annotations: []
};

function gate(options: { now?: () => Date; audit?: CountryGateAuditWriter; onAuditFailure?: (code: string) => void } = {}) {
  const audit = options.audit ?? { recordCountryGateRefusal: vi.fn(async () => undefined) };
  return {
    audit,
    gate: new CountryGate({
      policy, lookup, audit,
      ...(options.now === undefined ? {} : { clock: options.now }),
      ...(options.onAuditFailure === undefined ? {} : { onAuditFailure: options.onAuditFailure })
    })
  };
}

describe("the country gate (paid plans G3a, spec §2.3.3)", () => {
  it("refuses sign-up by code and allows it where the switch is on", () => {
    const { gate: countryGate } = gate();
    expect(countryGate.signup(source("81.196.20.30"))).toBeNull();
    expect(countryGate.signup(source("5.45.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    expect(countryGate.signup(source("46.211.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    // The UK (owner's amendment of 2 October 2026): closed for now, ships after launch.
    expect(countryGate.signup(source("51.140.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    for (const ip of ["31.13.1.1", "84.94.1.1", "1.160.1.1", "89.28.1.1"]) {
      expect(countryGate.signup(source(ip)), ip).toBeNull();
    }
    expect(countryGate.signup(source("185.220.101.7"))).toBe("TOR_REFUSED");
    expect(countryGate.signup(source("10.0.0.1"))).toBe("COUNTRY_UNKNOWN");
  });

  it("refuses a new debate only from an always-blocked country", () => {
    const { gate: countryGate } = gate();
    expect(countryGate.ask(source("5.45.1.1"))).toBe("COUNTRY_ASK_BLOCKED");
    for (const ip of ["81.196.20.30", "78.180.1.1", "31.13.1.1", "185.220.101.7", "10.0.0.1"]) {
      expect(countryGate.ask(source(ip)), ip).toBeNull();
    }
  });

  it("answers availability as booleans and nothing else", () => {
    const { gate: countryGate } = gate();
    expect(countryGate.availability("81.196.20.30")).toEqual({ signup: true, pay: true, support: true });
    // The UK (owner's amendment of 2 October 2026): closed for now, same as Ukraine.
    expect(countryGate.availability("51.140.1.1")).toEqual({ signup: false, pay: false, support: false });
    expect(countryGate.availability("46.211.1.1")).toEqual({ signup: false, pay: false, support: false });
    // Switzerland, Israel, Taiwan, Moldova (owner's amendment of 1 October 2026): sign-up, no payment yet.
    for (const ip of ["31.13.1.1", "84.94.1.1", "1.160.1.1", "89.28.1.1"]) {
      expect(countryGate.availability(ip), ip).toEqual({ signup: true, pay: false, support: true });
    }
    expect(countryGate.availability("185.220.101.7")).toEqual({ signup: false, pay: false, support: false });
    expect(countryGate.availability("10.0.0.1")).toEqual({ signup: false, pay: false, support: false });
  });

  it("names the country recorded with an age check, and never a Tor exit's or an unknown one (R3-3)", () => {
    const { gate: countryGate, audit } = gate();
    expect(countryGate.recordedCountry("81.196.20.30")).toBe("RO");
    // A blocked place is still only a fact here: recording refuses nothing and audits nothing.
    expect(countryGate.recordedCountry("5.45.1.1")).toBe("RU");
    // The age gate's own rule for the edge header drops XX and T1 (Tor); the gate's source drops the same two.
    expect(countryGate.recordedCountry("185.220.101.7")).toBeNull();
    expect(countryGate.recordedCountry("10.0.0.1")).toBeNull();
    expect(audit.recordCountryGateRefusal).not.toHaveBeenCalled();
  });

  it("audits one refusal per route, code and country per window, content-free", async () => {
    let now = new Date("2026-10-01T10:00:00.000Z");
    const { gate: countryGate, audit } = gate({ now: () => now });
    countryGate.signup(source("5.45.1.1"));
    countryGate.signup(source("5.45.1.1"));
    countryGate.ask(source("5.45.1.1"));
    countryGate.signup(source("81.196.20.30"));
    expect(audit.recordCountryGateRefusal).toHaveBeenCalledTimes(2);
    expect(audit.recordCountryGateRefusal).toHaveBeenNthCalledWith(1, {
      route: "register", code: "COUNTRY_SIGNUP_UNAVAILABLE", country: "RU",
      windowStartedAt: new Date("2026-10-01T10:00:00.000Z"), source: source("5.45.1.1")
    });
    now = new Date("2026-10-01T10:15:00.000Z");
    countryGate.signup(source("5.45.1.1"));
    expect(audit.recordCountryGateRefusal).toHaveBeenCalledTimes(3);
  });

  it("still refuses when the audit write fails, and reports that by code", async () => {
    const failures: string[] = [];
    const { gate: countryGate } = gate({
      audit: { recordCountryGateRefusal: async () => { throw new Error("pool down"); } },
      onAuditFailure: (code) => failures.push(code)
    });
    expect(countryGate.signup(source("5.45.1.1"))).toBe("COUNTRY_SIGNUP_UNAVAILABLE");
    await new Promise((resolve) => setImmediate(resolve));
    expect(failures).toEqual(["COUNTRY_GATE_AUDIT_FAILED"]);
  });
});

describe("the gate on the routes", () => {
  function api(options: { countryGate?: CountryGate; admission?: AdmissionLimiter; sessions?: SessionApplication } = {}) {
    const register = vi.fn(async (_input: unknown, _source: Readonly<{ countryCode?: string }>) => ({
      message: "If this address can be registered, verification instructions will arrive. Check your spam folder."
    }));
    const submit = vi.fn(async () => ({ run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" as const }));
    return {
      register, submit,
      instance: buildApi({
        application: { submit } as unknown as AskApplication,
        turnstile: passedTurnstile,
        registration: { register, verifyEmail: vi.fn(), resendVerification: vi.fn() } as never,
        sessions: options.sessions ?? testSessionApplication([IDENTITY]),
        allowedOrigin: TEST_APP_ORIGIN,
        ...(options.countryGate === undefined ? {} : { countryGate: options.countryGate }),
        ...(options.admission === undefined ? {} : { admission: options.admission })
      })
    };
  }
  // The age gate's register hook (apps/api/src/index.ts:1711-1729) needs a real adult date before register runs.
  const REGISTER_BODY = {
    ...canonicalSignup,
    email: "alice@example.test", password: "correct horse battery staple",
    phone: "+40722123456", country: "RO", date_of_birth: "1990-01-01"
  };
  const setCookies = (response: { headers: Record<string, unknown> }): string[] => {
    const raw = response.headers["set-cookie"];
    return raw === undefined ? [] : Array.isArray(raw) ? raw.map(String) : [String(raw)];
  };

  it("refuses sign-up with 403 and the code only, before the registration service runs", async () => {
    const { instance, register } = api({ countryGate: gate().gate });
    const refused = await instance.inject({ method: "POST", url: "/v1/auth/register", payload: REGISTER_BODY, remoteAddress: "5.45.1.1" });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: "COUNTRY_SIGNUP_UNAVAILABLE" });
    expect(register).not.toHaveBeenCalled();
    const admitted = await instance.inject({ method: "POST", url: "/v1/auth/register", payload: REGISTER_BODY, remoteAddress: "81.196.20.30" });
    expect(admitted.statusCode).toBe(202);
    await instance.close();
  });

  it("refuses a closed country BEFORE the age gate judges the date, so no age lockout is ever set there", async () => {
    const { instance, register } = api({ countryGate: gate().gate });
    // An under-age date from a closed country: the country answers, the age gate never runs.
    const refused = await instance.inject({
      method: "POST", url: "/v1/auth/register",
      payload: { ...REGISTER_BODY, date_of_birth: "2020-01-01" }, remoteAddress: "5.45.1.1"
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: "COUNTRY_SIGNUP_UNAVAILABLE" });
    expect(setCookies(refused).some((cookie) => cookie.startsWith("__Host-debateai-age-refusal="))).toBe(false);
    // From an open country the age gate still decides as before.
    const underAge = await instance.inject({
      method: "POST", url: "/v1/auth/register",
      payload: { ...REGISTER_BODY, date_of_birth: "2020-01-01" }, remoteAddress: "81.196.20.30"
    });
    expect(underAge.statusCode).toBe(403);
    expect(underAge.json()).toEqual({ error: "AUTH_AGE_REFUSED", message: "AUTH_AGE_REFUSED" });
    expect(register).not.toHaveBeenCalled();
    await instance.close();
  });

  it("records the gate's country with the registration's age check when no Cloudflare edge reported one (R3-3)", async () => {
    const { instance, register } = api({ countryGate: gate().gate });
    await instance.inject({ method: "POST", url: "/v1/auth/register", payload: REGISTER_BODY, remoteAddress: "81.196.20.30" });
    // A Cloudflare edge's own header still wins when there is one (the age gate's rule, kept).
    await instance.inject({
      method: "POST", url: "/v1/auth/register", payload: REGISTER_BODY, remoteAddress: "81.196.20.30",
      headers: { "cf-ipcountry": "DE" }
    });
    expect(register.mock.calls.map(([, source]) => source.countryCode)).toEqual(["RO", "DE"]);
    await instance.close();
  });

  it("records the gate's country with the existing-account age confirmation too, and nothing for a Tor exit (R3-3)", async () => {
    const inputs: Array<Readonly<{ countryCode: string | null }>> = [];
    const sessions: SessionApplication = Object.freeze<SessionApplication>({
      ...testSessionApplication([IDENTITY]),
      readAgeConfirmation: async () => "required" as const,
      confirmAccountAge: async (_session, input) => { inputs.push(input); return "passed" as const; }
    });
    const { instance } = api({ countryGate: gate().gate, sessions });
    for (const remoteAddress of ["81.196.20.30", "185.220.101.7"]) {
      const response = await instance.inject({
        method: "POST", url: "/v1/auth/age-confirmation", headers: testSessionHeaders(IDENTITY, true),
        payload: { date_of_birth: "1990-01-01" }, remoteAddress
      });
      expect(response.json()).toEqual({ outcome: "allowed" });
    }
    expect(inputs.map((input) => input.countryCode)).toEqual(["RO", null]);
    await instance.close();
  });

  it("refuses a new debate from a blocked country and admits one from anywhere else", async () => {
    const { instance, submit } = api({ countryGate: gate().gate });
    const headers = testSessionHeaders(IDENTITY, true);
    const refused = await instance.inject({ method: "POST", url: "/v1/asks", headers, payload: ASK, remoteAddress: "5.45.1.1" });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: "COUNTRY_ASK_BLOCKED" });
    expect(submit).not.toHaveBeenCalled();
    const admitted = await instance.inject({ method: "POST", url: "/v1/asks", headers, payload: ASK, remoteAddress: "78.180.1.1" });
    expect(admitted.statusCode).toBe(202);
    await instance.close();
  });

  it("changes nothing when no gate is composed (local mode, or hosted without the row)", async () => {
    const { instance, register } = api();
    const response = await instance.inject({ method: "POST", url: "/v1/auth/register", payload: REGISTER_BODY, remoteAddress: "5.45.1.1" });
    expect(response.statusCode).toBe(202);
    expect(register).toHaveBeenCalledTimes(1);
    const availability = await instance.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "5.45.1.1" });
    expect(availability.json()).toEqual({ signup: true, pay: false, support: true });
    await instance.close();
  });

  it("answers availability publicly, rate-limited per address", async () => {
    const admission = new AdmissionLimiter(admissionPolicyFromValue({
      ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,
      geo_availability: { key: "source", limit: 1, window_ms: 60_000, capacity: 8 }
    }, "test"));
    const { instance } = api({ countryGate: gate().gate, admission });
    const first = await instance.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "51.140.1.1" });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ signup: false, pay: false, support: false });
    const second = await instance.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "51.140.1.1" });
    expect(second.statusCode).toBe(429);
    const other = await instance.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "81.196.20.30" });
    expect(other.json()).toEqual({ signup: true, pay: true, support: true });
    await instance.close();
  });

  it("counts availability per /64 for IPv6: two addresses of one allocation share a bucket (DL5-F3)", async () => {
    const admission = new AdmissionLimiter(admissionPolicyFromValue({
      ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,
      geo_availability: { key: "source", limit: 1, window_ms: 60_000, capacity: 8 }
    }, "test"));
    const { instance } = api({ countryGate: gate().gate, admission });
    const first = await instance.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "2a02:2f00:1234:5678::1" });
    expect(first.statusCode).toBe(200);
    // Same /64, another address: one holder cannot mint sources to walk around the window.
    const sibling = await instance.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "2a02:2f00:1234:5678::2" });
    expect(sibling.statusCode).toBe(429);
    const otherNetwork = await instance.inject({ method: "GET", url: "/v1/geo/availability", remoteAddress: "2a02:2f00:1234:9999::1" });
    expect(otherNetwork.statusCode).toBe(200);
    await instance.close();
  });

  it("reads the row in hosted mode only: local mode has no country gate, whatever is published (A14)", async () => {
    const readRow = vi.fn(async () => policy);
    await expect(countryPolicyInForce("local", readRow)).resolves.toBeNull();
    expect(readRow).not.toHaveBeenCalled();
    await expect(countryPolicyInForce("hosted", readRow)).resolves.toBe(policy);
    expect(readRow).toHaveBeenCalledTimes(1);
    await expect(countryPolicyInForce("hosted", async () => null)).resolves.toBeNull();
  });

  it("is composed from the row in force through that one decision, with the admission scope sealed", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    // Whitespace-tolerant: a line wrap does not break the pin, a different binding does.
    expect(main).toMatch(
      /const countryPolicy = await boot\.run\("country-policy", \(\) => countryPolicyInForce\(\s*environment\.DEPLOYMENT_MODE,\s*\(\) => readCountryPolicy\(pool, environment\.REGISTER_VERSION\)\s*\)\);/u
    );
    // The gate is built only from that guarded binding.
    expect(main).toContain("const countryGate = countryPolicy === null || geoLookup === undefined ? undefined : new CountryGate({");
    expect(main).toContain("GEO_AVAILABILITY_ADMISSION_UNSEALED");
    expect(main.slice(main.indexOf("const api = buildApi({"))).toContain("countryGate");
    expect(ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value.geo_availability)
      .toEqual({ key: "source", limit: 60, window_ms: 60_000, capacity: 65_536 });
  });
});
