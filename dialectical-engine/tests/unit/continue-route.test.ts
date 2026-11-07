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

/**
 * V4 start step, Task 57f (the owner's 7 Nov answers: "continue where it 'broke', and not charge the customer again") — THE SAME ROUTE
 * CONTINUES A FAILED DEBATE. The person's own continuable FAILED debate is re-opened once (0165's core.continue_failed_run: the same work
 * item goes back to be claimed and the runner resumes it from what it saved) and its runner is woken: CONTINUING. A second press while it
 * runs is CONTINUING again with nothing re-opened twice. A failed debate that cannot continue (erased, a stop the person caused, a spending
 * wall, set aside) is 409 RUN_NOT_CONTINUABLE; no room for the rest is 409 RUN_CONTINUE_NO_ROOM; another account's debate is the closed
 * 404. A month-paused debate, and a debate neither paused nor failed, are answered exactly as above.
 */
describe("POST /v1/runs/{id}/continue on a FAILED debate (Task 57f)", () => {
  const FAILED_RUN = "66666666-6666-4666-8666-666666666666";
  type Facts = import("../../apps/api/src/run-continue.js").RunContinueFacts;
  const STOPPED: Facts = Object.freeze({ state: "FAILED", terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", content_live: true,
    waived: false, settled: false, paused: false, reopened: false });

  function failedApi(facts: Facts, options: Readonly<{ room?: boolean; pause?: "NONE" | "PAUSED" | "RESUMED"; untilMs?: number }> = {}) {
    let current = facts;
    const reopen = vi.fn(async (ownerRef: string, runId: string) => {
      if (ownerRef !== OWNER.authenticated.ownerRef || runId !== FAILED_RUN) return "NOT_OWNED" as const;
      if (current.state === "OPEN" && current.reopened) return "CONTINUING" as const;
      if (current.state !== "FAILED") return "NOT_FAILED" as const;
      current = Object.freeze({ ...current, state: "OPEN" as const, terminal_reason: null, reopened: true });
      return "RECORDED" as const;
    });
    const resume = vi.fn(async () => "RECORDED" as const);
    const wake = vi.fn(async (_runId: string) => undefined);
    const until = new Date(options.untilMs ?? Date.now() - 60_000).toISOString();
    const api = buildApi({
      application: {} as unknown as AskApplication,
      sessions: testSessionApplication([OWNER, OTHER]),
      allowedOrigin: TEST_APP_ORIGIN,
      digModel: {
        readDigLevel: async () => 0,
        readPause: async (ownerRef: string) => ownerRef !== OWNER.authenticated.ownerRef ? null
          : { state: options.pause ?? "NONE", resumable_at: options.pause === "PAUSED" ? until : null },
        resume
      },
      monthRoom: { monthHasRoom: async () => true },
      continuedRunWake: { wake },
      failedRunContinue: {
        store: {
          readContinue: async (ownerRef: string, runId: string) => ownerRef === OWNER.authenticated.ownerRef && runId === FAILED_RUN ? current : null,
          reopen
        },
        room: { continueHasRoom: async () => options.room ?? true }
      }
    });
    return { api, reopen, resume, wake, until };
  }
  const pressFailed = (api: ReturnType<typeof failedApi>["api"], identity: typeof OWNER) =>
    api.inject({ method: "POST", url: `/v1/runs/${FAILED_RUN}/continue`, headers: testSessionHeaders(identity, true), payload: {} });

  it("a continuable failed debate: CONTINUING, re-opened once and its runner woken; the month's resume is never touched", async () => {
    const { api, reopen, resume, wake } = failedApi(STOPPED);
    const response = await pressFailed(api, OWNER);
    expect(response.statusCode).toBe(200);
    expect(RunContinuedSchema.parse(response.json())).toEqual({ state: "CONTINUING" });
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(reopen).toHaveBeenCalledWith(OWNER.authenticated.ownerRef, FAILED_RUN, null);
    expect(wake).toHaveBeenCalledWith(FAILED_RUN);
    expect(resume).not.toHaveBeenCalled();
    await api.close();
  });

  it("a second press while it continues: CONTINUING again, nothing re-opened twice", async () => {
    const { api, reopen } = failedApi(STOPPED);
    expect((await pressFailed(api, OWNER)).statusCode).toBe(200);
    const again = await pressFailed(api, OWNER);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ state: "CONTINUING" });
    expect(reopen).toHaveBeenCalledTimes(1);
    await api.close();
  });

  it("another account's failed debate is the closed 404, nothing re-opened or woken", async () => {
    const { api, reopen, wake } = failedApi(STOPPED);
    const response = await pressFailed(api, OTHER);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "RUN_NOT_FOUND" });
    expect(reopen).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
    await api.close();
  });

  it("an erased debate, a stop the person caused and a spending wall: 409 RUN_NOT_CONTINUABLE, nothing re-opened", async () => {
    for (const facts of [{ ...STOPPED, content_live: false }, { ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:PRIVATE_CONTENT_ERASED" },
      { ...STOPPED, terminal_reason: "RUNNER_EXECUTION_FAILED:PERSON_ALLOWANCE_REACHED" }, { ...STOPPED, terminal_reason: "RUN_SET_ASIDE:BACKSTOP", waived: true }]) {
      const { api, reopen, wake } = failedApi(facts);
      const response = await pressFailed(api, OWNER);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "RUN_NOT_CONTINUABLE", message: "RUN_NOT_CONTINUABLE" });
      expect(reopen).not.toHaveBeenCalled();
      expect(wake).not.toHaveBeenCalled();
      await api.close();
    }
  });

  it("no room left for the rest: 409 RUN_CONTINUE_NO_ROOM, nothing re-opened", async () => {
    const { api, reopen } = failedApi(STOPPED, { room: false });
    const response = await pressFailed(api, OWNER);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "RUN_CONTINUE_NO_ROOM", message: "RUN_CONTINUE_NO_ROOM" });
    expect(reopen).not.toHaveBeenCalled();
    await api.close();
  });

  it("a debate that once paused at the month wall and failed later continues as a failed debate, not as the old pause", async () => {
    const { api, reopen, resume } = failedApi(STOPPED, { pause: "RESUMED" });
    expect((await pressFailed(api, OWNER)).statusCode).toBe(200);
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
    await api.close();
  });

  it("a month-paused debate is today's: before the reset 409 RUN_PAUSED_UNTIL_RESET, after it the month's resume; never re-opened", async () => {
    // Paused as the runner leaves it (claim let go, never FAILED); a continued debate that reached the wall; and one whose item failed later.
    for (const paused of [{ ...STOPPED, state: "OPEN" as const, terminal_reason: null, paused: true },
      { ...STOPPED, state: "OPEN" as const, terminal_reason: null, paused: true, reopened: true }, { ...STOPPED, paused: true }]) {
      const early = failedApi(paused, { pause: "PAUSED", untilMs: Date.now() + 86_400_000 });
      const refused = await pressFailed(early.api, OWNER);
      expect(refused.statusCode).toBe(409);
      expect(RunContinueRefusedSchema.parse(refused.json())).toEqual({ error: "RUN_PAUSED_UNTIL_RESET", message: "RUN_PAUSED_UNTIL_RESET", until: early.until });
      expect(early.reopen).not.toHaveBeenCalled();
      expect(early.wake).not.toHaveBeenCalled();
      await early.api.close();
      const late = failedApi(paused, { pause: "PAUSED" });
      expect((await pressFailed(late.api, OWNER)).json()).toEqual({ state: "CONTINUING" });
      expect(late.resume).toHaveBeenCalledTimes(1);
      expect(late.reopen).not.toHaveBeenCalled();
      await late.api.close();
    }
  });

  it("a debate neither paused nor failed: today's 409 RUN_NOT_PAUSED", async () => {
    const { api, reopen } = failedApi({ ...STOPPED, state: "OPEN", terminal_reason: null });
    const response = await pressFailed(api, OWNER);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "RUN_NOT_PAUSED", message: "RUN_NOT_PAUSED" });
    expect(reopen).not.toHaveBeenCalled();
    await api.close();
  });
});
