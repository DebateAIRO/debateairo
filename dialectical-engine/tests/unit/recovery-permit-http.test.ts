import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { RecoveryPermitError, type RecoveryPermitApplication } from "../../apps/api/src/recovery-permit.js";
import { RECOVERY_START_PUBLIC_RESPONSE } from "../../apps/api/src/recovery.js";

/**
 * The person's five routes of the Owner's permit (migration 0188) with the service in memory: each route parses its
 * body strictly, hands the service only the fields it names, answers no-store, takes a trusted origin only, and turns a
 * refusal into its status by code.
 */
const origin = "https://preview.example.test", TOKEN = "T".repeat(43), PASSWORD = "current password";
const OPENED = { status: "RECOVERY_ENROLL_ONLY", available_methods: ["passkey", "totp"], totp_unavailable_reason: null, recovery_capability: "R".repeat(43), expires_at: "2030-01-01T00:05:00.000Z" } as const;
type Method = keyof RecoveryPermitApplication;
function fake(overrides: Partial<Record<Method, (...args: unknown[]) => Promise<unknown>>> = {}) {
  return {
    start: vi.fn(overrides.start ?? (async () => RECOVERY_START_PUBLIC_RESPONSE)),
    request: vi.fn(overrides.request ?? (async () => ({ status: "requested" }))),
    cancel: vi.fn(overrides.cancel ?? (async () => ({ status: "cancelled" }))),
    prepareFinish: vi.fn(overrides.prepareFinish ?? (async () => ({ status: "waiting", not_before: "2030-01-01T00:00:00.000Z" }))),
    finish: vi.fn(overrides.finish ?? (async () => OPENED))
  };
}
let close: (() => Promise<unknown>) | undefined;
afterEach(async () => { await close?.(); close = undefined; });
function api(service?: ReturnType<typeof fake>) {
  const built = buildApi({ application: {} as AskApplication, allowedOrigin: origin, ...(service === undefined ? {} : { recoveryPermit: service as unknown as RecoveryPermitApplication }) });
  close = () => built.close();
  return built;
}
const post = (a: ReturnType<typeof api>, path: string, payload: unknown, from = origin) =>
  a.inject({ method: "POST", url: `/v1/auth/recovery-permit/${path}`, headers: { origin: from }, payload: payload as never });
/** Each route, the service method behind it, and a body it takes. */
const ROUTES = [
  ["start", "start", { email: "person@example.test" }],
  ["request", "request", { token: TOKEN, password: PASSWORD }],
  ["cancel", "cancel", { token: TOKEN }],
  ["finish/status", "prepareFinish", { token: TOKEN }],
  ["finish", "finish", { token: TOKEN, password: PASSWORD }]
] as const;

describe("each route calls its own method with the parsed body", () => {
  it("hands each method exactly the fields it names, with the request's source, and answers what it answers", async () => {
    const service = fake(), a = api(service);
    const answers = [];
    for (const [path, , body] of ROUTES) answers.push(await post(a, path, body));
    expect(answers.map((r) => [r.statusCode, r.json()])).toEqual([
      [202, RECOVERY_START_PUBLIC_RESPONSE], [200, { status: "requested" }], [200, { status: "cancelled" }],
      [200, { status: "waiting", not_before: "2030-01-01T00:00:00.000Z" }], [200, OPENED]]);
    for (const [, method, body] of ROUTES) {
      expect(service[method], method).toHaveBeenCalledTimes(1);
      expect(service[method], method).toHaveBeenCalledWith(body, expect.objectContaining({ ip: expect.any(String), userAgent: expect.any(String), requestId: expect.any(String) }));
    }
    for (const r of answers) expect(r.headers["set-cookie"]).toBeUndefined();
  });
  it("the start hands on the address alone, never the Turnstile token", async () => {
    const service = fake(), a = api(service);
    expect((await post(a, "start", { email: "person@example.test", turnstile_token: "turnstile-fixture" })).statusCode).toBe(202);
    expect(service.start.mock.calls[0]![0]).toEqual({ email: "person@example.test" });
  });
});

describe("a body the route does not take", () => {
  it.each(ROUTES)("%s: an extra field is 400 RECOVERY_PERMIT_INPUT_INVALID and the service is not called", async (path, method, body) => {
    const service = fake(), a = api(service);
    const r = await post(a, path, { ...body, user_id: "11111111-1111-4111-8111-111111111111" });
    expect([r.statusCode, r.json()]).toEqual([400, { error: "RECOVERY_PERMIT_INPUT_INVALID" }]);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(service[method]).not.toHaveBeenCalled();
  });
  it.each(ROUTES.filter(([path]) => path !== "start"))("%s: a malformed or missing token is 400 and the service is not called", async (path, method, body) => {
    const service = fake(), a = api(service);
    for (const token of ["short", `${TOKEN}A`, "T".repeat(42) + "=", 43, null]) {
      const r = await post(a, path, { ...body, token });
      expect([r.statusCode, r.json()], String(token)).toEqual([400, { error: "RECOVERY_PERMIT_INPUT_INVALID" }]);
    }
    const { token: _token, ...without } = body as Record<string, unknown>;
    expect((await post(a, path, without)).statusCode).toBe(400);
    expect(service[method]).not.toHaveBeenCalled();
  });
  it("a missing or empty password and a missing or empty address are 400", async () => {
    const service = fake(), a = api(service);
    for (const path of ["request", "finish"]) {
      for (const body of [{ token: TOKEN }, { token: TOKEN, password: "" }, { token: TOKEN, password: "x".repeat(1025) }])
        expect((await post(a, path, body)).statusCode, `${path} ${JSON.stringify(body).length}`).toBe(400);
    }
    for (const body of [{}, { email: "" }, { email: "a".repeat(321) }]) expect((await post(a, "start", body)).statusCode).toBe(400);
    expect([service.request, service.finish, service.start].map((m) => m.mock.calls.length)).toEqual([0, 0, 0]);
  });
});

describe("the status of a refusal", () => {
  it.each([
    ["RECOVERY_PERMIT_PROOF_INVALID", 401], ["RECOVERY_PERMIT_TOO_EARLY", 409], ["RECOVERY_PERMIT_INVALID", 410],
    ["RECOVERY_PERMIT_RATE_LIMITED", 429], ["RECOVERY_PERMIT_UNAVAILABLE", 503]
  ] as const)("%s answers %i with its own code on every route", async (code, status) => {
    const thrower = async () => { throw new RecoveryPermitError(code); };
    const a = api(fake({ start: thrower, request: thrower, cancel: thrower, prepareFinish: thrower, finish: thrower }));
    for (const [path, , body] of ROUTES) {
      const r = await post(a, path, body);
      expect([r.statusCode, r.json()], path).toEqual([status, { error: code }]);
      expect(r.headers["cache-control"], path).toBe("no-store");
    }
  });
  it("anything that is not the service's own refusal is 503 RECOVERY_PERMIT_UNAVAILABLE, in no words of its own", async () => {
    const thrower = async () => { throw new Error(`database down near ${PASSWORD} ${TOKEN}`); };
    const a = api(fake({ start: thrower, request: thrower, cancel: thrower, prepareFinish: thrower, finish: thrower }));
    for (const [path, , body] of ROUTES) {
      const r = await post(a, path, body);
      expect([r.statusCode, r.json()], path).toEqual([503, { error: "RECOVERY_PERMIT_UNAVAILABLE" }]);
    }
  });
});

describe("every answer and every caller", () => {
  it("every answer carries cache-control: no-store", async () => {
    const a = api(fake());
    for (const [path, , body] of ROUTES) expect((await post(a, path, body)).headers["cache-control"], path).toBe("no-store");
  });
  it("a request from an untrusted origin, or with no origin, is refused and the service is not called", async () => {
    const service = fake(), a = api(service);
    for (const [path, , body] of ROUTES) {
      expect((await post(a, path, body, "https://evil.example.test")).statusCode, path).toBe(403);
      expect((await a.inject({ method: "POST", url: `/v1/auth/recovery-permit/${path}`, payload: body as never })).statusCode, path).toBe(403);
    }
    for (const [, method] of ROUTES) expect(service[method], method).not.toHaveBeenCalled();
  });
  it("without the service the routes do not exist", async () => {
    const a = api();
    for (const [path, , body] of ROUTES) expect((await post(a, path, body)).statusCode, path).toBe(404);
  });
});
