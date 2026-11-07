import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { RunContinuedSchema, RunContinueRefusedSchema, createContractClient } from "@debateai/contract";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * R22 W3-8 (the money rule, owner 31 Oct 2026) — CONTINUE ON A MONTH-PAUSED DEBATE, POST /v1/runs/{id}/continue. The
 * owner only (another account's debate is the closed 404); before the month's reset refused with 409
 * RUN_PAUSED_UNTIL_RESET and its `until`, nothing recorded and nobody woken; after it the resume is recorded once, the
 * debate's runner is woken and the answer is CONTINUING; a second press is idempotent (CONTINUING, nothing recorded
 * again). A debate never paused has nothing to continue (409 RUN_NOT_PAUSED).
 */

const OWNER = testHttpIdentity("continue-route-owner");
const OTHER = testHttpIdentity("continue-route-other");
const RUN = "44444444-4444-4444-8444-444444444444";
const NEVER_PAUSED = "55555555-5555-4555-8555-555555555555";

function apiWith(untilMs: number) {
  let state: "PAUSED" | "RESUMED" = "PAUSED";
  const until = new Date(untilMs).toISOString();
  const resume = vi.fn(async (ownerRef: string, runId: string) => {
    if (ownerRef !== OWNER.authenticated.ownerRef || runId !== RUN) return "NOT_OWNED" as const;
    if (state !== "PAUSED") return "NOT_PAUSED" as const;
    state = "RESUMED";
    return "RECORDED" as const;
  });
  const wake = vi.fn(async (_runId: string) => undefined);
  const api = buildApi({
    application: {} as unknown as AskApplication,
    sessions: testSessionApplication([OWNER, OTHER]),
    allowedOrigin: TEST_APP_ORIGIN,
    digModel: {
      readDigLevel: async () => 0,
      // 0134's read_run_pause answers null for a debate that is not this account's.
      readPause: async (ownerRef: string, runId: string) => ownerRef !== OWNER.authenticated.ownerRef ? null
        : runId === RUN ? { state, resumable_at: until }
          : runId === NEVER_PAUSED ? { state: "NONE" as const, resumable_at: null } : null,
      resume
    },
    monthRoom: { monthHasRoom: async () => true },
    continuedRunWake: { wake }
  });
  return { api, resume, wake, until };
}

const press = (api: ReturnType<typeof apiWith>["api"], identity: typeof OWNER, runId = RUN) =>
  api.inject({ method: "POST", url: `/v1/runs/${runId}/continue`, headers: testSessionHeaders(identity, true), payload: {} });

describe("POST /v1/runs/{id}/continue", () => {
  it("owner only: another account's debate is the closed 404 and nothing is recorded or woken", async () => {
    const { api, resume, wake } = apiWith(Date.now() - 60_000);
    const response = await press(api, OTHER);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "RUN_NOT_FOUND" });
    expect(resume).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
    await api.close();
  });

  it("refuses an anonymous press", async () => {
    const { api, resume } = apiWith(Date.now() - 60_000);
    const response = await api.inject({ method: "POST", url: `/v1/runs/${RUN}/continue`, payload: {} });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(resume).not.toHaveBeenCalled();
    await api.close();
  });

  it("before the reset: 409 RUN_PAUSED_UNTIL_RESET with the reset, nothing recorded, nobody woken", async () => {
    const { api, resume, wake, until } = apiWith(Date.now() + 86_400_000);
    const response = await press(api, OWNER);
    expect(response.statusCode).toBe(409);
    expect(RunContinueRefusedSchema.parse(response.json())).toEqual({ error: "RUN_PAUSED_UNTIL_RESET", message: "RUN_PAUSED_UNTIL_RESET", until });
    expect(resume).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
    await api.close();
  });

  it("after the reset: CONTINUING, the resume recorded once and the debate's runner woken", async () => {
    const { api, resume, wake } = apiWith(Date.now() - 60_000);
    const response = await press(api, OWNER);
    expect(response.statusCode).toBe(200);
    expect(RunContinuedSchema.parse(response.json())).toEqual({ state: "CONTINUING" });
    expect(resume).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith(RUN);
    await api.close();
  });

  it("a second press is idempotent: CONTINUING again, nothing recorded again", async () => {
    const { api, resume } = apiWith(Date.now() - 60_000);
    expect((await press(api, OWNER)).statusCode).toBe(200);
    const again = await press(api, OWNER);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ state: "CONTINUING" });
    expect(resume).toHaveBeenCalledTimes(1);
    await api.close();
  });

  it("a debate never paused has nothing to continue: 409 RUN_NOT_PAUSED", async () => {
    const { api, resume } = apiWith(Date.now() - 60_000);
    const response = await press(api, OWNER, NEVER_PAUSED);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "RUN_NOT_PAUSED", message: "RUN_NOT_PAUSED" });
    expect(resume).not.toHaveBeenCalled();
    await api.close();
  });

  it("a wake that fails is only logged: the press still answers CONTINUING", async () => {
    const { api } = apiWith(Date.now() - 60_000);
    const failing = buildApi({
      application: {} as unknown as AskApplication, sessions: testSessionApplication([OWNER]), allowedOrigin: TEST_APP_ORIGIN,
      digModel: { readDigLevel: async () => 0, readPause: async () => ({ state: "PAUSED" as const, resumable_at: new Date(Date.now() - 1).toISOString() }),
        resume: async () => "RECORDED" as const },
      monthRoom: { monthHasRoom: async () => true },
      continuedRunWake: { wake: async () => { throw Object.assign(new Error("hatchet down"), { code: "HATCHET_UNAVAILABLE" }); } }
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const response = await press(failing, OWNER);
      expect(response.statusCode).toBe(200);
      expect(warn).toHaveBeenCalledWith(JSON.stringify({ kind: "DEBATEAI_MONTH_PAUSE_WAKE", event: "WAKE_FAILED", code: "HATCHET_UNAVAILABLE" }));
    } finally {
      warn.mockRestore();
      await failing.close();
      await api.close();
    }
  });
});

describe("the typed client's continueRun", () => {
  const clientOver = (status: number, body: unknown) => {
    const seen: { url: string; method: string | undefined; body: unknown; csrf: string | null }[] = [];
    const client = createContractClient("https://debate.example", (async (url: URL, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        csrf: new Headers(init?.headers).get("x-csrf-token") });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch, { mode: "cookie", csrfToken: () => "csrf-1" });
    return { client, seen };
  };

  it("posts an empty body with the CSRF header and answers CONTINUING", async () => {
    const { client, seen } = clientOver(200, { state: "CONTINUING" });
    expect(await client.continueRun(RUN)).toEqual({ state: "CONTINUING" });
    expect(seen).toEqual([{ url: `https://debate.example/v1/runs/${RUN}/continue`, method: "POST", body: {}, csrf: "csrf-1" }]);
  });

  it("answers the 409 before the reset as data, with its until", async () => {
    const until = "2026-11-01T00:00:00.000Z";
    const { client } = clientOver(409, { error: "RUN_PAUSED_UNTIL_RESET", message: "RUN_PAUSED_UNTIL_RESET", until });
    expect(await client.continueRun(RUN)).toEqual({ error: "RUN_PAUSED_UNTIL_RESET", message: "RUN_PAUSED_UNTIL_RESET", until });
  });

  it("any other refusal stays an error", async () => {
    const { client } = clientOver(404, { error: "RUN_NOT_FOUND" });
    await expect(client.continueRun(RUN)).rejects.toMatchObject({ status: 404 });
  });
});
