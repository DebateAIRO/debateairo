// Owner ruling 2026-10-09: while an authenticator recovery waits its 24 hours, any signed-in session of the account
// sees it in Settings → Security and can cancel it (authorization runtime, session-authenticated, CSRF for the cancel).
import { describe, expect, it, vi } from "vitest";
import { MfaRecoveryPendingResponseSchema } from "@debateai/contract";
import { PostgresConsumerSecurityRepository } from "@debateai/db";
import { buildApi } from "@debateai/api";
import { ConsumerSecurityService, consumerSecuritySession } from "../../apps/api/src/consumer-security.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const http = testHttpIdentity("pending-mfa-recovery"), identity = http.authenticated;
const source = { ip: "192.0.2.77", userAgent: "synthetic-pending-recovery", requestId: "pending-recovery" };
const dependencies = { publicAppUrl: "https://example.test", argon2: {} as never, mfaPolicy: {} as never, authPolicy: {} as never };
const PENDING = { notBefore: "2026-10-10T12:00:00+00:00", waitingAt: "2026-10-09T12:00:00+00:00" };

describe("the database calls", () => {
  it("reads the pending recovery with the session alone", async () => {
    const query = vi.fn(async () => ({ rows: [{ value: PENDING }] }));
    const repo = new PostgresConsumerSecurityRepository({ query } as never, {} as never);
    await expect(repo.pendingMfaRecovery(consumerSecuritySession(identity))).resolves.toEqual(PENDING);
    expect(query).toHaveBeenCalledWith("SELECT identity.mfa_recovery_pending_read($1) AS value", [consumerSecuritySession(identity)]);
  });
  it("cancels inside the audited transaction with the hashed source", async () => {
    const statements: { sql: string; args?: unknown[] }[] = [];
    const client = { query: vi.fn(async (sql: string, args?: unknown[]) => { statements.push({ sql, ...(args ? { args } : {}) }); return { rows: [{ value: "CANCELLED" }] }; }), release: vi.fn() };
    const audit = { hashSourceIp: async () => "a".repeat(64), hashUserAgent: async () => "b".repeat(64) };
    const repo = new PostgresConsumerSecurityRepository({ connect: async () => client } as never, audit as never);
    await expect(repo.cancelPendingMfaRecovery(consumerSecuritySession(identity), source)).resolves.toBe("CANCELLED");
    expect(statements).toEqual([
      { sql: "BEGIN" },
      { sql: "SELECT identity.begin_runtime_audit_attempt()" },
      { sql: "SELECT identity.mfa_recovery_pending_cancel($1,$2) AS value", args: [consumerSecuritySession(identity), JSON.stringify({ ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` })] },
      { sql: "COMMIT" }
    ]);
  });
});

describe("the Settings service", () => {
  it("shows when a waiting recovery finishes and when it started", async () => {
    const pendingMfaRecovery = vi.fn(async () => PENDING), service = new ConsumerSecurityService({ pendingMfaRecovery } as never, {} as never, dependencies);
    await expect(service.pendingMfaRecovery(identity)).resolves.toEqual({ pending: { not_before: "2026-10-10T12:00:00.000Z", started_at: "2026-10-09T12:00:00.000Z" } });
    expect(pendingMfaRecovery).toHaveBeenCalledWith(consumerSecuritySession(identity));
  });
  it("shows nothing when no recovery is waiting", async () => {
    const service = new ConsumerSecurityService({ pendingMfaRecovery: async () => null } as never, {} as never, dependencies);
    await expect(service.pendingMfaRecovery(identity)).resolves.toEqual({ pending: null });
    expect(MfaRecoveryPendingResponseSchema.safeParse({ pending: null }).success).toBe(true);
  });
  it("cancels the waiting recovery for this session's account", async () => {
    const cancelPendingMfaRecovery = vi.fn(async () => "CANCELLED"), service = new ConsumerSecurityService({ cancelPendingMfaRecovery } as never, {} as never, dependencies);
    await expect(service.cancelPendingMfaRecovery({}, identity, source)).resolves.toEqual({ status: "cancelled" });
    expect(cancelPendingMfaRecovery).toHaveBeenCalledWith(consumerSecuritySession(identity), source);
  });
  it("says there is nothing left to cancel when the wait already ended", async () => {
    const service = new ConsumerSecurityService({ cancelPendingMfaRecovery: async () => "INVALID" } as never, {} as never, dependencies);
    await expect(service.cancelPendingMfaRecovery({}, identity, source)).rejects.toMatchObject({ code: "MFA_ENROLLMENT_STATE_INVALID" });
  });
  it("refuses a cancel body with anything in it before touching the database", async () => {
    const cancelPendingMfaRecovery = vi.fn(), service = new ConsumerSecurityService({ cancelPendingMfaRecovery } as never, {} as never, dependencies);
    await expect(service.cancelPendingMfaRecovery({ user_id: "forged" }, identity, source)).rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
    expect(cancelPendingMfaRecovery).not.toHaveBeenCalled();
  });
});

describe("the Settings routes", () => {
  function api(security: Record<string, unknown>) { return buildApi({ application: {} as never, consumerSecurity: security as never, sessions: testSessionApplication([http]), allowedOrigin: TEST_APP_ORIGIN }); }
  it("reads the pending recovery only for a signed-in session", async () => {
    const pendingMfaRecovery = vi.fn(async () => ({ pending: { not_before: "2026-10-10T12:00:00.000Z", started_at: "2026-10-09T12:00:00.000Z" } })), a = api({ pendingMfaRecovery });
    try {
      const r = await a.inject({ method: "GET", url: "/v1/account/mfa-recovery", headers: testSessionHeaders(http) });
      expect(r.statusCode).toBe(200); expect(r.json()).toEqual({ pending: { not_before: "2026-10-10T12:00:00.000Z", started_at: "2026-10-09T12:00:00.000Z" } });
      expect(pendingMfaRecovery).toHaveBeenCalledWith(expect.objectContaining({ userId: identity.userId, tokenHash: identity.tokenHash }));
      expect((await a.inject({ method: "GET", url: "/v1/account/mfa-recovery" })).statusCode).toBe(401);
    } finally { await a.close(); }
  });
  it("cancels only with the session's CSRF token", async () => {
    const cancelPendingMfaRecovery = vi.fn(async () => ({ status: "cancelled" })), a = api({ cancelPendingMfaRecovery });
    try {
      const r = await a.inject({ method: "POST", url: "/v1/account/mfa-recovery/cancel", headers: testSessionHeaders(http, true), payload: {} });
      expect(r.statusCode).toBe(200); expect(r.json()).toEqual({ status: "cancelled" });
      expect(cancelPendingMfaRecovery).toHaveBeenCalledWith({}, expect.objectContaining({ userId: identity.userId }), expect.objectContaining({ userAgent: expect.any(String) }));
      const refused = await a.inject({ method: "POST", url: "/v1/account/mfa-recovery/cancel", headers: { ...testSessionHeaders(http, true), "x-csrf-token": "invalid" }, payload: {} });
      expect(refused.statusCode).toBe(403); expect(cancelPendingMfaRecovery).toHaveBeenCalledTimes(1);
    } finally { await a.close(); }
  });
});

describe("the Settings client", () => {
  it("reads and cancels the pending recovery on the account routes", async () => {
    const { createContractClient } = await import("../../packages/contract/src/client.js");
    const calls: { url: string; method: string; body: unknown }[] = [];
    const client = createContractClient("https://ui.example.test/api", async (url, init) => { calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ?? null }); return new Response(JSON.stringify(String(url).endsWith("/cancel") ? { status: "cancelled" } : { pending: null }), { status: 200, headers: { "content-type": "application/json" } }); });
    await expect(client.pendingMfaRecovery()).resolves.toEqual({ pending: null });
    await expect(client.cancelPendingMfaRecovery()).resolves.toEqual({ status: "cancelled" });
    expect(calls).toEqual([{ url: "https://ui.example.test/v1/account/mfa-recovery", method: "GET", body: null }, { url: "https://ui.example.test/v1/account/mfa-recovery/cancel", method: "POST", body: "{}" }]);
  });
});
