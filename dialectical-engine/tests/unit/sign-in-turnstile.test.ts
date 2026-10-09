import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildApi, type ApiOptions, type AskApplication } from "../../apps/api/src/index.js";
import { AuthFlowError } from "../../apps/api/src/registration.js";
import { SessionService } from "../../apps/api/src/sessions.js";
import { UnixTurnstileVerifier, type TurnstileProof, type TurnstileVerifier } from "../../apps/api/src/turnstile.js";
import {
  AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue,
  parseApiEnvironment, SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue
} from "@debateai/register";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

/**
 * Auth API hardening (2026-10-09, item 1). The owner wants the anti-bot check
 * on sign-in too. POST /v1/auth/login (the email + password step) and the three
 * public recovery starts verify a single-use Turnstile proof server-side —
 * each behind its own server setting, off until the UI ships the widget:
 *   TURNSTILE_LOGIN_REQUIRED     -> login            (action "login")
 *   TURNSTILE_RECOVERY_REQUIRED  -> password-reset/start   ("password-reset"),
 *                                   mfa-recovery/start     ("mfa-recovery"),
 *                                   recovery/start         ("account-recovery")
 */
const headers = { origin: TEST_APP_ORIGIN, "user-agent": "sign-in-turnstile" };
const credentials = { email: "victim@example.test", password: "a-wrong-password" };

function recordingVerifier(outcome: "passed" | "rejected" | "unavailable" = "passed") {
  const proofs: TurnstileProof[] = [];
  const verifier: TurnstileVerifier = { verify: async (proof) => { proofs.push(proof); return outcome; } };
  return { verifier, proofs };
}

async function loginApi(options: Readonly<{ required?: boolean; turnstile?: TurnstileVerifier }>) {
  const reached: string[] = [];
  const base = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
  const sessions = await SessionService.create({
    repository: {
      findLoginIdentity: async () => { reached.push("password-check"); throw new AuthFlowError("AUTH_CREDENTIALS_INVALID"); },
      readLoginChallenge: async () => { reached.push("challenge"); return null; },
      recordLoginFailure: async () => undefined
    } as never,
    riskSignals: {} as never, onRiskSignalFailure: () => undefined, dekStore: {} as never, argon2: {} as never,
    blindIndexKey: Buffer.alloc(32, 3), dummyPasswordHash: "fixture",
    authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy: base,
    sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef)
  });
  const api = buildApi({
    application: {} as AskApplication, allowedOrigin: TEST_APP_ORIGIN, sessions,
    ...(options.turnstile === undefined ? {} : { turnstile: options.turnstile }),
    ...(options.required === undefined ? {} : { turnstileLoginRequired: options.required })
  } as ApiOptions);
  return { api, reached, perSource: base.verificationLimits.perSourceAcrossAccounts };
}

const login = (api: Awaited<ReturnType<typeof loginApi>>["api"], payload: Record<string, unknown>, remoteAddress = "198.51.100.40") =>
  api.inject({ method: "POST", url: "/v1/auth/login", headers, payload, remoteAddress });

describe("Turnstile on sign-in (TURNSTILE_LOGIN_REQUIRED on)", () => {
  it("refuses the password step without a proof before any credential work", async () => {
    const { verifier, proofs } = recordingVerifier();
    const { api, reached } = await loginApi({ required: true, turnstile: verifier });
    try {
      for (const token of [undefined, "", " ", "x".repeat(2049), 7]) {
        const response = await login(api, { ...credentials, ...(token === undefined ? {} : { turnstile_token: token }) });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: "TURNSTILE_REJECTED", message: "TURNSTILE_REJECTED" });
      }
      expect(proofs).toEqual([]);
      expect(reached).toEqual([]);
    } finally { await api.close(); }
  });

  it("verifies a valid proof with the login action, then checks the password", async () => {
    const { verifier, proofs } = recordingVerifier();
    const { api, reached } = await loginApi({ required: true, turnstile: verifier });
    try {
      const response = await login(api, { ...credentials, turnstile_token: "login-proof" });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: "AUTH_CREDENTIALS_INVALID" });
      expect(proofs).toEqual([{ token: "login-proof", action: "login" }]);
      expect(reached).toEqual(["password-check"]);
      expect(response.body).not.toContain("login-proof");
    } finally { await api.close(); }
  });

  it.each([["rejected", 400, "TURNSTILE_REJECTED"], ["unavailable", 503, "TURNSTILE_UNAVAILABLE"]] as const)(
    "maps a %s proof before any credential work", async (outcome, status, code) => {
      const { verifier } = recordingVerifier(outcome);
      const { api, reached } = await loginApi({ required: true, turnstile: verifier });
      try {
        const response = await login(api, { ...credentials, turnstile_token: "login-proof" });
        expect(response.statusCode).toBe(status);
        expect(response.json()).toEqual({ error: code, message: code });
        expect(reached).toEqual([]);
      } finally { await api.close(); }
    });

  it("fails closed when no verifier is composed", async () => {
    const { api, reached } = await loginApi({ required: true });
    try {
      const response = await login(api, { ...credentials, turnstile_token: "login-proof" });
      expect(response.statusCode).toBe(503);
      expect(reached).toEqual([]);
    } finally { await api.close(); }
  });

  it("refuses a replayed proof through the real single-use verifier", async () => {
    const relay = await loginRelay();
    const { api, reached } = await loginApi({ required: true, turnstile: relay.verifier });
    try {
      expect((await login(api, { ...credentials, turnstile_token: "single-use-proof" })).statusCode).toBe(401);
      const replay = await login(api, { ...credentials, turnstile_token: "single-use-proof" });
      expect(replay.statusCode).toBe(400);
      expect(replay.json()).toMatchObject({ error: "TURNSTILE_REJECTED" });
      expect(reached).toEqual(["password-check"]);
      expect(relay.calls()).toBe(1);
    } finally { await api.close(); await relay.close(); }
  });

  it("refuses a sign-up proof at sign-in (action bound)", async () => {
    const relay = await loginRelay("signup");
    const { api, reached } = await loginApi({ required: true, turnstile: relay.verifier });
    try {
      const response = await login(api, { ...credentials, turnstile_token: "signup-proof" });
      expect(response.statusCode).toBe(400);
      expect(reached).toEqual([]);
    } finally { await api.close(); await relay.close(); }
  });

  it("leaves the second step (challenge + code) to its challenge, with no new proof", async () => {
    const { verifier, proofs } = recordingVerifier();
    const { api, reached } = await loginApi({ required: true, turnstile: verifier });
    try {
      const response = await login(api, { challenge_token: "c".repeat(43), code: "123456" });
      expect(response.statusCode).toBe(401);
      expect(proofs).toEqual([]);
      expect(reached).toEqual(["challenge"]);
    } finally { await api.close(); }
  });

  it("does not let proof-less bots spend the account's sign-in budget", async () => {
    const { verifier } = recordingVerifier();
    const { api, reached } = await loginApi({ required: true, turnstile: verifier });
    try {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        expect((await login(api, credentials, `203.0.113.${attempt + 1}`)).statusCode).toBe(400);
      }
      const owner = await login(api, { ...credentials, turnstile_token: "owner-proof" }, "198.51.100.99");
      expect(owner.statusCode).toBe(401);
      expect(reached).toEqual(["password-check"]);
    } finally { await api.close(); }
  });

  it("charges the per-source budget before asking Turnstile", async () => {
    const { verifier, proofs } = recordingVerifier();
    const { api, perSource } = await loginApi({ required: true, turnstile: verifier });
    try {
      for (let attempt = 0; attempt < perSource; attempt += 1) {
        await login(api, { email: `person-${attempt}@example.test`, password: "x", turnstile_token: `proof-${attempt}` });
      }
      const refused = await login(api, { ...credentials, turnstile_token: "one-more" });
      expect(refused.statusCode).toBe(429);
      expect(proofs).toHaveLength(perSource);
    } finally { await api.close(); }
  });
});

describe("Turnstile on sign-in (setting off: today's behaviour)", () => {
  it.each([undefined, false])("signs in without a proof and never asks Turnstile (setting %s)", async required => {
    const { verifier, proofs } = recordingVerifier();
    const { api, reached } = await loginApi({ ...(required === undefined ? {} : { required }), turnstile: verifier });
    try {
      const response = await login(api, credentials);
      expect(response.statusCode).toBe(401);
      expect(reached).toEqual(["password-check"]);
      // A proof the UI already sends is accepted and ignored.
      expect((await login(api, { ...credentials, turnstile_token: "early-widget" })).statusCode).toBe(401);
      expect(proofs).toEqual([]);
    } finally { await api.close(); }
  });
});

const START_ROUTES = [
  ["/v1/auth/password-reset/start", { email: "alice@example.test" }, "password-reset"],
  ["/v1/auth/mfa-recovery/start", { email: "alice@example.test", destination: "primary" }, "mfa-recovery"],
  ["/v1/auth/recovery/start", { email: "alice@example.test" }, "account-recovery"]
] as const;

function startApi(required: boolean | undefined, verifier: TurnstileVerifier) {
  const work: Array<Readonly<{ route: string; input: unknown }>> = [];
  const generic = { message: "If this account can be recovered, instructions will arrive through an eligible channel." };
  const api = buildApi({
    application: {} as AskApplication, allowedOrigin: TEST_APP_ORIGIN, turnstile: verifier,
    ...(required === undefined ? {} : { turnstileRecoveryRequired: required }),
    passwordReset: { start: async (input: unknown) => { work.push({ route: "password-reset", input }); return generic; } },
    mfaRecovery: { start: async (input: unknown) => { work.push({ route: "mfa-recovery", input }); return generic; } },
    recovery: { start: async (input: unknown) => { work.push({ route: "account-recovery", input }); return generic; } }
  } as unknown as ApiOptions);
  return { api, work };
}

describe("Turnstile on the public recovery starts (TURNSTILE_RECOVERY_REQUIRED)", () => {
  it.each(START_ROUTES)("refuses %s without a proof before any mail work", async (url, payload) => {
    const { verifier, proofs } = recordingVerifier();
    const { api, work } = startApi(true, verifier);
    try {
      const response = await api.inject({ method: "POST", url, headers, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "TURNSTILE_REJECTED" });
      expect(work).toEqual([]);
      expect(proofs).toEqual([]);
    } finally { await api.close(); }
  });

  it.each(START_ROUTES)("verifies %s with its own action and passes only the account facts on", async (url, payload, action) => {
    const { verifier, proofs } = recordingVerifier();
    const { api, work } = startApi(true, verifier);
    try {
      const response = await api.inject({ method: "POST", url, headers, payload: { ...payload, turnstile_token: "start-proof" } });
      expect(response.statusCode).toBe(202);
      expect(proofs).toEqual([{ token: "start-proof", action }]);
      expect(work).toHaveLength(1);
      expect(JSON.stringify(work[0]!.input)).not.toContain("start-proof");
    } finally { await api.close(); }
  });

  it.each(START_ROUTES)("refuses %s when the proof is rejected", async (url, payload) => {
    const { verifier } = recordingVerifier("rejected");
    const { api, work } = startApi(true, verifier);
    try {
      const response = await api.inject({ method: "POST", url, headers, payload: { ...payload, turnstile_token: "bad-proof" } });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "TURNSTILE_REJECTED" });
      expect(work).toEqual([]);
    } finally { await api.close(); }
  });

  it.each(START_ROUTES)("keeps %s unchanged while the setting is off", async (url, payload) => {
    const { verifier, proofs } = recordingVerifier();
    const { api, work } = startApi(undefined, verifier);
    try {
      expect((await api.inject({ method: "POST", url, headers, payload })).statusCode).toBe(202);
      expect((await api.inject({ method: "POST", url, headers, payload: { ...payload, turnstile_token: "early-widget" } })).statusCode).toBe(202);
      expect(proofs).toEqual([]);
      expect(work).toHaveLength(2);
    } finally { await api.close(); }
  });
});

describe("sign-in Turnstile server settings", () => {
  it("default to off and accept only true/false", () => {
    const environment = parseApiEnvironment(validApiEnvironmentFixture());
    expect(environment.TURNSTILE_LOGIN_REQUIRED).toBe("false");
    expect(environment.TURNSTILE_RECOVERY_REQUIRED).toBe("false");
    expect(() => parseApiEnvironment({ ...validApiEnvironmentFixture(), TURNSTILE_LOGIN_REQUIRED: "yes" })).toThrow();
  });

  it("refuse to boot switched on without the relay address, in any mode", () => {
    for (const key of ["TURNSTILE_LOGIN_REQUIRED", "TURNSTILE_RECOVERY_REQUIRED"]) {
      expect(() => parseApiEnvironment({ ...validApiEnvironmentFixture(), [key]: "true" })).toThrow("TURNSTILE_SOCKET_PATH_REQUIRED");
      expect(parseApiEnvironment({
        ...validApiEnvironmentFixture(), [key]: "true", TURNSTILE_SOCKET_PATH: "/run/debateai-turnstile/siteverify.sock"
      })[key as "TURNSTILE_LOGIN_REQUIRED"]).toBe("true");
    }
  });
});

async function loginRelay(action = "login") {
  const dir = await mkdtemp(join(tmpdir(), "ts-login-")); const socketPath = join(dir, "relay.sock");
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain */ }
    calls += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: true, hostname: "app.debateai.test", action, challenge_ts: new Date(Date.now() - 1_000).toISOString(), "error-codes": [] }));
  });
  await new Promise<void>(resolve => server.listen(socketPath, resolve));
  const verifier = new UnixTurnstileVerifier({ socketPath, publicAppUrl: TEST_APP_ORIGIN });
  return {
    verifier, calls: () => calls,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
  };
}

describe("sign-in Turnstile composition", () => {
  it("passes both settings from the environment to the API", async () => {
    const { readFile } = await import("node:fs/promises");
    const main = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    expect(main).toContain('turnstileLoginRequired: environment.TURNSTILE_LOGIN_REQUIRED === "true"');
    expect(main).toContain('turnstileRecoveryRequired: environment.TURNSTILE_RECOVERY_REQUIRED === "true"');
  });
});
