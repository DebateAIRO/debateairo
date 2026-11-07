/**
 * V4 start step, Task 57c (the owner's 5 Nov answer Q20 A: the failed question says it either way; a failed dig says "Nothing was taken
 * from your quota for this." only when the server confirms it): THE FAILED RUN READ SAYS WHETHER ANY QUOTA WAS USED. `quota_used` is
 * "NONE" (nothing was taken: with its path-list charge given back, nothing else ran) or "SOME", read for a FAILED run only, last and
 * optional, so an older reader still parses and a run that does not fail reads as before. Every question and run here is made up.
 */
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { RunProjectionSchema, type RunProjection } from "@debateai/contract";
import type { RunOwnershipAccess } from "@debateai/db";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const IDENTITY = testHttpIdentity("run-quota-used");
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const FAILED: RunProjection = Object.freeze({ run_ref: RUN_ID, question_line: "Will AI tutors replace homework help?", state: "FAILED",
  terminal_reason: "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM", hold_until: null });
const RUNNING: RunProjection = Object.freeze({ ...FAILED, state: "RUNNING", terminal_reason: null });
const SET_ASIDE: RunProjection = Object.freeze({ ...FAILED, terminal_reason: "RUN_SET_ASIDE:RELEASE_NOT_SERVED" });
const FOUND = Object.freeze({ url: "https://example.test/a", site: "example.test", title: "A page", note: null, quotes: [] });

type Parser = { safeParse(value: unknown): { success: true } | { success: false; error: { issues: readonly { message: string }[] } } };
const messagesOf = (schema: Parser, value: unknown): readonly string[] => {
  const parsed = schema.safeParse(value);
  return parsed.success ? ["accepted"] : parsed.error.issues.map((issue) => issue.message);
};

describe("the run read's quota_used (contract)", () => {
  it("rides a FAILED run only, NONE or SOME, last and optional", () => {
    for (const used of ["NONE", "SOME"] as const) expect(messagesOf(RunProjectionSchema, { ...FAILED, quota_used: used })).toEqual(["accepted"]);
    expect(messagesOf(RunProjectionSchema, FAILED)).toEqual(["accepted"]);
    expect(messagesOf(RunProjectionSchema, { ...RUNNING, quota_used: "NONE" })).toEqual(["only a failed debate says whether any quota was used"]);
    expect(RunProjectionSchema.safeParse({ ...FAILED, quota_used: "ALL" }).success).toBe(false);
    // Task 57f's `continuable` of a failed run (57e's `reusable`, renamed) comes after it.
    expect(Object.keys(RunProjectionSchema.shape).slice(-2)).toEqual(["quota_used", "continuable"]);
  });
});

function harness(run: RunProjection, used: "NONE" | "SOME" | null) {
  const asked: string[] = [];
  const application = {
    readRun: async () => run,
    readRunFound: async () => [FOUND],
    readRunQuotaUsed: async (runId: string, ownership: RunOwnershipAccess) => {
      asked.push(`${runId}:${String(ownership.ownerRef)}`);
      return used;
    }
  } as unknown as AskApplication;
  const api = buildApi({ application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN } as never);
  const read = () => api.inject({ method: "GET", url: `/v1/runs/${RUN_ID}`, headers: testSessionHeaders(IDENTITY) });
  return { api, asked, read };
}

describe("GET /v1/runs/{id}: a failed debate says whether any quota was used", () => {
  it("a failed question whose list's charge was given back and nothing else ran: NONE, read for the person's own debate", async () => {
    const h = harness(FAILED, "NONE");
    const response = await h.read();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...FAILED, quota_used: "NONE" });
    expect(h.asked).toEqual([`${RUN_ID}:${IDENTITY.authenticated.ownerRef}`]);
    await h.api.close();
  });

  it("a round ran: SOME", async () => {
    const h = harness(FAILED, "SOME");
    expect((await h.read()).json()).toMatchObject({ state: "FAILED", quota_used: "SOME" });
    await h.api.close();
  });

  it("a debate set aside keeps what the AIs found beside it", async () => {
    const h = harness(SET_ASIDE, "NONE");
    expect((await h.read()).json()).toEqual({ ...SET_ASIDE, found: [FOUND], quota_used: "NONE" });
    await h.api.close();
  });

  it("nothing for a debate that did not fail (never asked), and nothing when the server cannot say", async () => {
    const running = harness(RUNNING, "SOME");
    expect((await running.read()).json()).toEqual(RUNNING);
    expect(running.asked).toEqual([]);
    await running.api.close();
    const unknown = harness(FAILED, null);
    expect((await unknown.read()).json()).toEqual(FAILED);
    await unknown.api.close();
  });
});
