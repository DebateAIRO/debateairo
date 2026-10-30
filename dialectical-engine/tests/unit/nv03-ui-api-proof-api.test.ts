// NV-03: a loopback peer names the client (x-forwarded-for, x-forwarded-host/-proto, cf-ipcountry) only together with the
// UI's proof. Without it the client is the socket peer, in sourceFor, support and billing alike, and the proof header
// never reaches a handler. GET /readyz tells the website whether its proof matched (x-debateai-ui-proof-verdict).
import { canonicalSignup, passedTurnstile } from "../support/turnstileFixtures.js";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue, ADMISSION_POLICY_REGISTER_ROW, admissionPolicyFromValue } from "@debateai/register";
import { CRISIS_SUPPORT_OFFERED } from "@debateai/contract";
import type { GeoLookup } from "@debateai/geo";
import type { AuthSourceContext } from "@debateai/db";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { CountryGate } from "../../apps/api/src/country-gate.js";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { RECOVERY_START_PUBLIC_RESPONSE, type RecoveryApplication } from "../../apps/api/src/recovery.js";
import { REGISTRATION_PUBLIC_RESPONSE, RESEND_PUBLIC_RESPONSE, type RegistrationApplication } from "../../apps/api/src/registration.js";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

import * as uiApiProofExports from "../../apps/api/src/ui-api-proof.js";

const uiApiProofModule = async (): Promise<Record<string, unknown>> => uiApiProofExports;
const PROOF = "p".repeat(43);
const WRONG = "q".repeat(43);
const PROOF_HEADER = "x-debateai-ui-proof";
const VERDICT_HEADER = "x-debateai-ui-proof-verdict";

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

function countryApi(uiApiProof: Buffer | undefined) {
  const country = gate();
  const register = vi.fn(async (_input: unknown, _source: unknown) => ({ message: "If this address can be registered, verification instructions will arrive. Check your spam folder." }));
  const instance = buildApi({
    application: { submit: vi.fn() } as unknown as AskApplication,
    turnstile: passedTurnstile,
    registration: { register, verifyEmail: vi.fn(), resendVerification: vi.fn() } as never,
    sessions: testSessionApplication([testHttpIdentity("nv03-api")]), allowedOrigin: TEST_APP_ORIGIN,
    countryGate: country.gate,
    ...(uiApiProof === undefined ? {} : { uiApiProof })
  } as Parameters<typeof buildApi>[0]);
  return { instance, register, audit: country.audit };
}
const register = (instance: ReturnType<typeof countryApi>["instance"], headers: Record<string, string> = {}) => instance.inject({
  method: "POST", url: "/v1/auth/register", payload: { ...REGISTER_BODY, country: "RO" }, remoteAddress: "127.0.0.1",
  headers: { origin: TEST_APP_ORIGIN, ...headers }
});

describe("NV-03: the country gate sees a forwarded address only with the UI's proof", () => {
  it("refuses an unknown socket peer and every unproven forwarded address, and admits the proven one", async () => {
    const { instance, register: registered, audit } = countryApi(Buffer.from(PROOF));
    try {
      // (a) the bare loopback peer has no country.
      const bare = await register(instance);
      expect(bare.statusCode).toBe(403);
      expect(bare.json()).toEqual({ error: "COUNTRY_UNKNOWN" });
      // (b) a closed country's address without the proof is the loopback peer: no RU refusal audit.
      const closed = await register(instance, { "x-forwarded-for": "5.45.1.1" });
      expect(closed.statusCode).toBe(403);
      expect(closed.json()).toEqual({ error: "COUNTRY_UNKNOWN" });
      expect(audit.recordCountryGateRefusal.mock.calls.some(([input]) => (input as { country?: string }).country === "RU")).toBe(false);
      // (c) an open country's address without the proof: still the loopback peer.
      const open = await register(instance, { "x-forwarded-for": "81.196.20.30" });
      expect(open.statusCode).toBe(403);
      expect(open.json()).toEqual({ error: "COUNTRY_UNKNOWN" });
      // (d) with a wrong proof.
      const wrong = await register(instance, { "x-forwarded-for": "81.196.20.30", [PROOF_HEADER]: WRONG });
      expect(wrong.statusCode).toBe(403);
      expect(wrong.json()).toEqual({ error: "COUNTRY_UNKNOWN" });
      expect(registered).not.toHaveBeenCalled();
      // (e) with the proof.
      const proven = await register(instance, { "x-forwarded-for": "81.196.20.30", [PROOF_HEADER]: PROOF });
      expect(proven.statusCode).toBe(202);
      expect(registered).toHaveBeenCalledTimes(1);
    } finally {
      await instance.close();
    }
  });

  it("(f) honours no forwarded address when the API holds no proof", async () => {
    const { instance, register: registered } = countryApi(undefined);
    try {
      const response = await register(instance, { "x-forwarded-for": "81.196.20.30", [PROOF_HEADER]: PROOF });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "COUNTRY_UNKNOWN" });
      expect(registered).not.toHaveBeenCalled();
    } finally {
      await instance.close();
    }
  });

  it("holds over a real socket, not only through inject", async () => {
    const { instance, register: registered } = countryApi(Buffer.from(PROOF));
    try {
      await instance.listen({ host: "127.0.0.1", port: 0 });
      const address = instance.server.address();
      if (address === null || typeof address === "string") throw new Error("no port");
      const send = (headers: Record<string, string>) => fetch(`http://127.0.0.1:${address.port}/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_APP_ORIGIN, ...headers },
        body: JSON.stringify({ ...REGISTER_BODY, country: "RO" })
      });
      const unproven = await send({ "x-forwarded-for": "81.196.20.30" });
      expect(unproven.status).toBe(403);
      expect(await unproven.json()).toEqual({ error: "COUNTRY_UNKNOWN" });
      const proven = await send({ "x-forwarded-for": "81.196.20.30", [PROOF_HEADER]: PROOF });
      expect(proven.status).toBe(202);
      expect(registered).toHaveBeenCalledTimes(1);
    } finally {
      await instance.close();
    }
  });
});

describe("NV-03: per-source admission keys on the socket peer without the proof", () => {
  const ADMISSION = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
  function harness() {
    const start = vi.fn(async () => RECOVERY_START_PUBLIC_RESPONSE);
    const api = buildApi({
      application: {} as AskApplication,
      recovery: { start } satisfies RecoveryApplication,
      allowedOrigin: TEST_APP_ORIGIN,
      admission: new AdmissionLimiter(ADMISSION),
      admissionClock: () => new Date(Date.parse("2026-09-02T00:00:00.000Z")),
      uiApiProof: Buffer.from(PROOF)
    } as Parameters<typeof buildApi>[0]);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const startRecovery = (index: number, proof: boolean) => api.inject({
      method: "POST", url: "/v1/auth/recovery/start", remoteAddress: "127.0.0.1", payload: { email: "alice@example.test" },
      headers: { origin: TEST_APP_ORIGIN, "x-forwarded-for": `198.51.100.${index}`, ...(proof ? { [PROOF_HEADER]: PROOF } : {}) }
    });
    return { api, start, startRecovery, close: async () => { quiet.mockRestore(); await api.close(); } };
  }

  it("puts 16 unproven forwarded addresses in the loopback peer's one budget", async () => {
    const { start, startRecovery, close } = harness();
    try {
      const statuses: number[] = [];
      for (let index = 1; index <= 16; index += 1) statuses.push((await startRecovery(index, false)).statusCode);
      expect(statuses.slice(0, 15)).toEqual(Array(15).fill(202));
      expect(statuses[15]).toBe(429);
      expect(start).toHaveBeenCalledTimes(15);
    } finally {
      await close();
    }
  });

  it("keeps each proven forwarded address in its own budget", async () => {
    const { start, startRecovery, close } = harness();
    try {
      for (let index = 1; index <= 16; index += 1) expect((await startRecovery(index, true)).statusCode, `start ${index}`).toBe(202);
      expect(start).toHaveBeenCalledTimes(16);
    } finally {
      await close();
    }
  });
});

function registrationSpy(): { app: RegistrationApplication; sources: AuthSourceContext[] } {
  const sources: AuthSourceContext[] = [];
  return {
    sources,
    app: {
      register: async (_input, source) => { sources.push(source); return REGISTRATION_PUBLIC_RESPONSE; },
      verifyEmail: async () => ({ status: "mfa_required" }),
      resendVerification: async () => RESEND_PUBLIC_RESPONSE
    }
  };
}
const askApplication = (): AskApplication => new Proxy({}, { get: () => async () => null }) as AskApplication;

describe("NV-03: the chain and the edge country", () => {
  it("still takes the last hop of a proven chain", async () => {
    const { app, sources } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app, allowedOrigin: TEST_APP_ORIGIN, uiApiProof: Buffer.from(PROOF) } as Parameters<typeof buildApi>[0]);
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/auth/register", remoteAddress: "127.0.0.1", payload: canonicalSignup,
        headers: { origin: TEST_APP_ORIGIN, "x-forwarded-for": "198.51.100.250, 203.0.113.9", [PROOF_HEADER]: PROOF }
      });
      expect(response.statusCode).toBe(202);
      expect(sources.map((source) => source.ip)).toEqual(["203.0.113.9"]);
    } finally {
      await api.close();
    }
  });

  it("records cf-ipcountry only from a proven caller", async () => {
    const { app, sources } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app, allowedOrigin: TEST_APP_ORIGIN, uiApiProof: Buffer.from(PROOF) } as Parameters<typeof buildApi>[0]);
    try {
      await api.inject({ method: "POST", url: "/v1/auth/register", headers: { origin: TEST_APP_ORIGIN, "cf-ipcountry": "RU" }, payload: canonicalSignup });
      await api.inject({ method: "POST", url: "/v1/auth/register", headers: { origin: TEST_APP_ORIGIN, "cf-ipcountry": "RU", [PROOF_HEADER]: PROOF }, payload: canonicalSignup });
      expect(sources).toHaveLength(2);
      expect(sources[0]).not.toHaveProperty("countryCode");
      expect(sources[1]?.countryCode).toBe("RU");
    } finally {
      await api.close();
    }
  });

  it("names the crisis answer's country only from a proven caller", async () => {
    const identity = testHttpIdentity("nv03-crisis-country");
    const sessions: SessionApplication = {
      ...testSessionApplication([identity]),
      readSensitiveDataConsent: async () => "given",
      recordSensitiveDataConsent: async () => "given"
    };
    const api = buildApi({ application: askApplication(), sessions, allowedOrigin: TEST_APP_ORIGIN, uiApiProof: Buffer.from(PROOF) } as Parameters<typeof buildApi>[0]);
    const ask = (headers: Record<string, string>) => api.inject({
      method: "POST", url: "/v1/asks", headers: { ...testSessionHeaders(identity, true), "cf-ipcountry": "RO", ...headers },
      payload: {
        question_line: "vreau să mă sinucid", risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker-declaration:test",
        composition_budget_tier: "low", plan_tier: "free", depth_params: { depth: 1 }, decision_scope: "test-layer scope",
        as_of: "2026-08-07T00:00:00.000Z", steering_presets: [], steering_annotations: []
      }
    });
    try {
      const unproven = await ask({});
      expect(unproven.statusCode).toBe(422);
      expect(unproven.json()).toMatchObject({ error: CRISIS_SUPPORT_OFFERED, country: null });
      const proven = await ask({ [PROOF_HEADER]: PROOF });
      expect(proven.statusCode).toBe(422);
      expect(proven.json()).toMatchObject({ error: CRISIS_SUPPORT_OFFERED, country: "RO" });
    } finally {
      await api.close();
    }
  });
});

describe("NV-03: the proof header never reaches a handler", () => {
  it("is removed before any hook or handler, matching or not", async () => {
    const { app } = registrationSpy();
    const api = buildApi({ application: askApplication(), turnstile: passedTurnstile, registration: app, allowedOrigin: TEST_APP_ORIGIN, uiApiProof: Buffer.from(PROOF) } as Parameters<typeof buildApi>[0]);
    const seen: unknown[] = [];
    api.addHook("preHandler", async (request) => { seen.push(request.headers[PROOF_HEADER]); });
    try {
      for (const proof of [PROOF, WRONG]) {
        const response = await api.inject({ method: "POST", url: "/v1/auth/register", payload: canonicalSignup, headers: { origin: TEST_APP_ORIGIN, [PROOF_HEADER]: proof } });
        expect(response.statusCode).toBe(202);
      }
      expect(seen).toEqual([undefined, undefined]);
    } finally {
      await api.close();
    }
  });

  it("gateForwardedHeaders decides accepted, refused or absent, and keeps the forwarded headers only on accepted", async () => {
    const { gateForwardedHeaders } = await uiApiProofModule() as { gateForwardedHeaders: (headers: Record<string, unknown>, expected: Buffer | null) => string };
    const forwarded = () => ({ "x-forwarded-for": "203.0.113.9", "x-forwarded-host": "h.invalid", "x-forwarded-proto": "https", "cf-ipcountry": "RO", accept: "*/*" });
    const accepted: Record<string, unknown> = { ...forwarded(), [PROOF_HEADER]: PROOF };
    expect(gateForwardedHeaders(accepted, Buffer.from(PROOF))).toBe("accepted");
    expect(accepted).toEqual(forwarded());
    for (const [headers, expected, verdict] of [
      [{ ...forwarded(), [PROOF_HEADER]: WRONG }, Buffer.from(PROOF), "refused"],
      [{ ...forwarded() }, Buffer.from(PROOF), "refused"],
      [{ ...forwarded(), [PROOF_HEADER]: `${PROOF}, ${PROOF}` }, Buffer.from(PROOF), "refused"],
      [{ ...forwarded(), [PROOF_HEADER]: PROOF }, null, "refused"],
      [{ ...forwarded() }, null, "absent"]
    ] as const) {
      const copy: Record<string, unknown> = { ...headers };
      expect(gateForwardedHeaders(copy, expected)).toBe(verdict);
      expect(copy).toEqual({ accept: "*/*" });
    }
  });
});

describe("NV-03: GET /readyz names the proof's verdict, and its body is unchanged", () => {
  const BODY = { ready: true, releaseKey: null, reasons: [] };
  async function readyz(uiApiProof: Buffer | undefined, proof: string | undefined) {
    const api = buildApi({ application: askApplication(), allowedOrigin: TEST_APP_ORIGIN, ...(uiApiProof === undefined ? {} : { uiApiProof }) } as Parameters<typeof buildApi>[0]);
    try {
      const response = await api.inject({ method: "GET", url: "/readyz", remoteAddress: "127.0.0.1", headers: proof === undefined ? {} : { [PROOF_HEADER]: proof } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(BODY);
      return response.headers[VERDICT_HEADER];
    } finally {
      await api.close();
    }
  }
  it("accepted, refused or no header", async () => {
    expect(await readyz(Buffer.from(PROOF), PROOF)).toBe("accepted");
    expect(await readyz(Buffer.from(PROOF), WRONG)).toBe("refused");
    expect(await readyz(Buffer.from(PROOF), undefined)).toBe("refused");
    expect(await readyz(undefined, PROOF)).toBe("refused");
    expect(await readyz(undefined, undefined)).toBeUndefined();
  });
});

describe("NV-03: loadUiApiProof", () => {
  it("requires the path on a hosted API and reads none locally", async () => {
    const { loadUiApiProof } = await uiApiProofModule() as { loadUiApiProof: (environment: Record<string, string | undefined>, read?: (path: string) => Buffer) => Buffer | null };
    expect(() => loadUiApiProof({ DEPLOYMENT_MODE: "hosted" })).toThrow("UI_API_PROOF_REQUIRED");
    expect(loadUiApiProof({ DEPLOYMENT_MODE: "local" })).toBeNull();
    expect(() => loadUiApiProof({ DEPLOYMENT_MODE: "hosted", UI_API_PROOF_PATH: "/x" }, () => Buffer.from("short"))).toThrow("UI_API_PROOF_INVALID");
    const dir = mkdtempSync(join(tmpdir(), "nv03-proof-"));
    try {
      const file = join(dir, "proof.secret");
      writeFileSync(file, `${PROOF}\n`, { mode: 0o600 });
      chmodSync(dir, 0o700);
      expect(loadUiApiProof({ DEPLOYMENT_MODE: "hosted", UI_API_PROOF_PATH: file })?.toString("latin1")).toBe(PROOF);
      chmodSync(file, 0o640);
      expect(() => loadUiApiProof({ DEPLOYMENT_MODE: "hosted", UI_API_PROOF_PATH: file })).toThrow("SECRET_CUSTODY_INVALID");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is composed in main.ts under the boot ledger and handed to buildApi", () => {
    const main = readFileSync(resolve(import.meta.dirname, "../../apps/api/src/main.ts"), "utf8");
    expect(main).toContain('boot.runSync("ui-api-proof", () => loadUiApiProof(environment))');
    const build = main.slice(main.indexOf("const api = buildApi({"));
    expect(build.slice(0, build.indexOf("\n});") + 4)).toContain("\n  uiApiProof,\n");
  });
});
