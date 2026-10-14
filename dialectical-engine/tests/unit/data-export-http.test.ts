import { describe, expect, it, vi } from "vitest";
import { buildApi, CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, type AskApplication } from "@debateai/api";
import type { DataExportStatus } from "@debateai/contract";
import type { DataExportApplication, DownloadResult, RequestOutcome } from "../../apps/api/src/data-export/service.js";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";

const ORIGIN = "https://app.debateai.test";
const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const GRANT_TOKEN = "g".repeat(43);
const LINK_TOKEN = "l".repeat(43);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: "owner:22222222-2222-4222-8222-222222222222",
    session_id: "33333333-3333-4333-8333-333333333333",
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  }),
  userId: "44444444-4444-4444-8444-444444444444",
  ownerRef: "22222222-2222-4222-8222-222222222222",
  tokenHash: "sha256:session", csrfTokenHash: "sha256:csrf", authKind: "cookie" as const
}) satisfies AuthenticatedSession;
const cookie = `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
const headers = Object.freeze({ cookie, origin: ORIGIN, "x-csrf-token": CSRF_TOKEN, "user-agent": "dx-http-test-browser" });
const requestBody = Object.freeze({ step_up_grant: GRANT_TOKEN, locale: "en" });
const downloadBody = Object.freeze({ token: LINK_TOKEN });

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null, readLedgerDigest: async () => null, readNode: async () => null,
    recordInvestigation: async () => null, unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

function sessions(revoked = false): SessionApplication {
  return {
    authenticate: async (token) => !revoked && token === SESSION_TOKEN ? authenticated : null,
    verifyCsrf: (_session, token) => token === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required", challengeToken: "m".repeat(43) }),
    completeLogin: async () => ({ status: "authenticated", sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, session: authenticated.session }),
    logout: async () => true, listSessions: async () => [], revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp: async () => ({ sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN })
  };
}

function exportStub(overrides: {
  request?: RequestOutcome; status?: DataExportStatus; download?: DownloadResult
} = {}) {
  const request = vi.fn<DataExportApplication["request"]>(async () =>
    overrides.request ?? { kind: "ACCEPTED", requestedAt: new Date("2026-10-08T10:00:00.000Z") });
  const status = vi.fn<DataExportApplication["status"]>(async () => overrides.status ?? { status: "NONE" });
  const download = vi.fn<DataExportApplication["download"]>(async () => overrides.download ?? { kind: "INVALID" });
  return { request, status, download, runOnce: vi.fn(async () => {}) } as unknown as DataExportApplication & {
    request: typeof request; status: typeof status; download: typeof download;
  };
}

describe("data export HTTP boundary", () => {
  it("H-1 requires a cookie session on all three routes", async () => {
    const dataExport = exportStub();
    const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
    for (const route of [
      { method: "POST" as const, url: "/v1/account/export", payload: requestBody },
      { method: "GET" as const, url: "/v1/account/export" },
      { method: "POST" as const, url: "/v1/account/export/download", payload: downloadBody }
    ]) {
      const response = await api.inject({ ...route, headers: { origin: ORIGIN, "x-csrf-token": CSRF_TOKEN } });
      expect(response.statusCode, route.url).toBe(401);
      expect(response.json(), route.url).toEqual({ error: "SESSION_REQUIRED" });
    }
    expect(dataExport.request).not.toHaveBeenCalled();
    expect(dataExport.status).not.toHaveBeenCalled();
    expect(dataExport.download).not.toHaveBeenCalled();
    await api.close();
  });

  it("H-2 gives a revoked cookie the same refusal as account erasure", async () => {
    const api = buildApi({ application: application(), sessions: sessions(true), dataExport: exportStub(), allowedOrigin: ORIGIN });
    const erasure = await api.inject({ method: "GET", url: "/v1/account/erasure", headers });
    for (const route of [
      { method: "POST" as const, url: "/v1/account/export", payload: requestBody },
      { method: "GET" as const, url: "/v1/account/export" },
      { method: "POST" as const, url: "/v1/account/export/download", payload: downloadBody }
    ]) {
      const response = await api.inject({ ...route, headers });
      expect(response.statusCode).toBe(erasure.statusCode);
      expect(response.json()).toEqual(erasure.json());
    }
    await api.close();
  });

  it("H-3 rejects four malformed requests without calling the application", async () => {
    const dataExport = exportStub();
    const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
    for (const payload of [
      { locale: "en" },
      { ...requestBody, extra: "unwanted" },
      { ...requestBody, locale: 1 },
      { ...requestBody, locale: "xx" }
    ]) {
      const response = await api.inject({ method: "POST", url: "/v1/account/export", headers, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    }
    expect(dataExport.request).not.toHaveBeenCalled();
    await api.close();
  });

  it("H-4 returns unavailable for all routes without the export application", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    for (const route of [
      { method: "POST" as const, url: "/v1/account/export", payload: requestBody },
      { method: "GET" as const, url: "/v1/account/export" },
      { method: "POST" as const, url: "/v1/account/export/download", payload: downloadBody }
    ]) {
      const response = await api.inject({ ...route, headers });
      expect(response.statusCode, route.url).toBe(503);
      expect(response.json(), route.url).toEqual({ error: "EXPORT_UNAVAILABLE" });
    }
    await api.close();
  });

  const refusals: readonly [string, RequestOutcome, number, string][] = [
    ["H-5", { kind: "STEP_UP_INVALID" }, 403, "STEP_UP_REQUIRED"],
    ["H-6", { kind: "EMAIL_REQUIRED" }, 409, "EXPORT_EMAIL_REQUIRED"],
    ["H-7", { kind: "ERASING" }, 409, "EXPORT_ACCOUNT_ERASING"],
    ["H-8", { kind: "HELD" }, 409, "EXPORT_ACCOUNT_HELD"],
    ["H-9", { kind: "IN_PROGRESS" }, 409, "EXPORT_IN_PROGRESS"],
    ["H-10", { kind: "RATE_LIMITED", retryAfterSeconds: 3600 }, 429, "EXPORT_RATE_LIMITED"]
  ];
  for (const [caseName, outcome, code, error] of refusals) {
    it(`${caseName} maps ${outcome.kind} to the exact refusal`, async () => {
      const dataExport = exportStub({ request: outcome });
      const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
      const sourceIds: string[] = [];
      api.addHook("onRequest", async request => { sourceIds.push(request.id); });
      const response = await api.inject({ method: "POST", url: "/v1/account/export", headers, payload: requestBody });
      expect(response.statusCode).toBe(code);
      expect(response.json()).toEqual({ error });
      expect(response.headers["retry-after"]).toBe(caseName === "H-10" ? "3600" : undefined);
      expect(dataExport.request).toHaveBeenCalledWith({
        userId: authenticated.userId, sessionId: authenticated.session.session_id,
        grantToken: GRANT_TOKEN, locale: "en",
        source: { ip: "127.0.0.1", mailLocale: "en", userAgent: "dx-http-test-browser", requestId: sourceIds[0] }
      });
      await api.close();
    });
  }

  it("H-11 accepts a valid request with the exact preparing receipt", async () => {
    const dataExport = exportStub();
    const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
    const sourceIds: string[] = [];
    api.addHook("onRequest", async request => { sourceIds.push(request.id); });
    const response = await api.inject({ method: "POST", url: "/v1/account/export", headers, payload: requestBody });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "PREPARING", requested_at: "2026-10-08T10:00:00.000Z" });
    expect(dataExport.request).toHaveBeenCalledWith({
      userId: authenticated.userId, sessionId: authenticated.session.session_id,
      grantToken: GRANT_TOKEN, locale: "en",
      source: { ip: "127.0.0.1", mailLocale: "en", userAgent: "dx-http-test-browser", requestId: sourceIds[0] }
    });
    await api.close();
  });

  it("H-12 returns each exact status body", async () => {
    for (const status of [
      { status: "NONE" } as const,
      { status: "PREPARING", requested_at: "2026-10-08T10:00:00.000Z" } as const,
      { status: "SENT", requested_at: "2026-10-08T10:00:00.000Z", expires_at: "2026-10-09T10:00:00.000Z" } as const,
      { status: "FAILED", requested_at: "2026-10-08T10:00:00.000Z" } as const
    ]) {
      const dataExport = exportStub({ status });
      const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
      const response = await api.inject({ method: "GET", url: "/v1/account/export", headers });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(status);
      expect(dataExport.status).toHaveBeenCalledWith(authenticated.userId);
      await api.close();
    }
  });

  it("H-13 sends ZIP bytes with download and no-store headers", async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 255, 1, 2]);
    const dataExport = exportStub({ download: { kind: "OK", bytes, filename: "dialectical-engine-export-2026-10-08.zip" } });
    const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
    const sourceIds: string[] = [];
    api.addHook("onRequest", async request => { sourceIds.push(request.id); });
    const response = await api.inject({ method: "POST", url: "/v1/account/export/download", headers, payload: downloadBody });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="dialectical-engine-export-2026-10-08.zip"');
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.rawPayload).toEqual(bytes);
    expect(dataExport.download).toHaveBeenCalledWith(authenticated.userId, LINK_TOKEN, {
      ip: "127.0.0.1", mailLocale: "en", userAgent: "dx-http-test-browser", requestId: sourceIds[0]
    });
    await api.close();
  });

  const linkRefusals: readonly [string, DownloadResult, number, string][] = [
    ["H-14", { kind: "WRONG_ACCOUNT" }, 403, "EXPORT_WRONG_ACCOUNT"],
    ["H-15", { kind: "INVALID" }, 404, "EXPORT_LINK_INVALID"],
    ["H-16", { kind: "HELD" }, 409, "EXPORT_ACCOUNT_HELD"]
  ];
  for (const [caseName, outcome, code, error] of linkRefusals) {
    it(`${caseName} maps ${outcome.kind} to the exact refusal`, async () => {
      const dataExport = exportStub({ download: outcome });
      const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
      const sourceIds: string[] = [];
      api.addHook("onRequest", async request => { sourceIds.push(request.id); });
      const response = await api.inject({ method: "POST", url: "/v1/account/export/download", headers, payload: downloadBody });
      expect(response.statusCode).toBe(code);
      expect(response.json()).toEqual({ error });
      expect(dataExport.download).toHaveBeenCalledWith(authenticated.userId, LINK_TOKEN, {
        ip: "127.0.0.1", mailLocale: "en", userAgent: "dx-http-test-browser", requestId: sourceIds[0]
      });
      await api.close();
    });
  }

  it("H-17 keeps both bearer tokens out of emitted logs", async () => {
    const emitted: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(method =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { emitted.push(args.map(String).join(" ")); }));
    const dataExport = exportStub({ download: {
      kind: "OK", bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      filename: "dialectical-engine-export-2026-10-08.zip"
    } });
    const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
    const sourceIds: string[] = [];
    api.addHook("onRequest", async request => { sourceIds.push(request.id); });
    try {
      console.error("H17-SENTINEL");
      expect(emitted.join("\n")).toContain("H17-SENTINEL");
      const requested = await api.inject({ method: "POST", url: "/v1/account/export", headers, payload: requestBody });
      const downloaded = await api.inject({ method: "POST", url: "/v1/account/export/download", headers, payload: downloadBody });
      expect(requested.statusCode).toBe(202);
      expect(downloaded.statusCode).toBe(200);
      expect(dataExport.request).toHaveBeenCalledWith({
        userId: authenticated.userId, sessionId: authenticated.session.session_id,
        grantToken: GRANT_TOKEN, locale: "en",
        source: { ip: "127.0.0.1", mailLocale: "en", userAgent: "dx-http-test-browser", requestId: sourceIds[0] }
      });
      expect(dataExport.download).toHaveBeenCalledWith(authenticated.userId, LINK_TOKEN, {
        ip: "127.0.0.1", mailLocale: "en", userAgent: "dx-http-test-browser", requestId: sourceIds[1]
      });
      expect(emitted.join("\n")).not.toContain(GRANT_TOKEN);
      expect(emitted.join("\n")).not.toContain(LINK_TOKEN);
    } finally {
      for (const spy of spies) spy.mockRestore();
      await api.close();
    }
  });

  it("H-18 returns unavailable without ZIP bytes when storage cannot serve", async () => {
    const dataExport = exportStub({ download: { kind: "UNAVAILABLE" } });
    const api = buildApi({ application: application(), sessions: sessions(), dataExport, allowedOrigin: ORIGIN });
    const sourceIds: string[] = [];
    api.addHook("onRequest", async request => { sourceIds.push(request.id); });
    const response = await api.inject({ method: "POST", url: "/v1/account/export/download", headers, payload: downloadBody });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "EXPORT_UNAVAILABLE" });
    expect(response.headers["content-type"]).not.toBe("application/zip");
    expect(dataExport.download).toHaveBeenCalledWith(authenticated.userId, LINK_TOKEN, {
      ip: "127.0.0.1", mailLocale: "en", userAgent: "dx-http-test-browser", requestId: sourceIds[0]
    });
    await api.close();
  });
});
