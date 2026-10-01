import { describe, expect, it } from "vitest";
import type { ContractClient } from "@debateai/contract";
import { debateDetailFromRunProjection, debateSummariesFromIndex } from "../../apps/ui/lib/v3/adapter.js";
import { listDebatesPageServer } from "../../apps/ui/lib/serverApi.js";
import { statusLabel } from "../../apps/ui/lib/format.js";
import timeEnglish from "../../apps/ui/messages/en/time.json" with { type: "json" };

/**
 * Budget spec §2.7/§2.11: a question that waits for the reset is a run in
 * state WAITING, with `waits_until`. The debate page and the home list say C
 * ("Waiting to start…"), and the run polls like QUEUED: its detail stays
 * "generating".
 */
const WAITS_UNTIL = "2026-10-30T03:00:00.000Z";
const waitingRun = {
  run_ref: "run:waiting",
  question_line: "Should cities ban cars downtown?",
  state: "WAITING" as const,
  terminal_reason: null,
  hold_until: null,
  waits_until: WAITS_UNTIL
};

describe("the WAITING run in the UI's own shapes", () => {
  it("keeps the detail generating, names the state, and carries the expected start", () => {
    const detail = debateDetailFromRunProjection(waitingRun as never);
    expect(detail).toMatchObject({ status: "generating", run_state: "WAITING", waits_until: WAITS_UNTIL });
    expect(debateDetailFromRunProjection({ ...waitingRun, state: "QUEUED", waits_until: null } as never).waits_until).toBeNull();
  });

  it("labels the pill in words, never the raw code", () => {
    expect(statusLabel("WAITING", timeEnglish)).toBe("Waiting");
  });

  it("marks a waiting open run as waiting in the home list", () => {
    const summaries = debateSummariesFromIndex({
      items: [], limit: 50, offset: 0, total: 1,
      open_runs: [{ run_ref: "run:waiting", question_line: "Q?", state: "WAITING", terminal_reason: null, created_at_sequence: 1 }]
    } as never);
    expect(summaries[0]).toMatchObject({ id: "run:waiting", status: "waiting" });
  });

  it("reads each waiting run's expected start, and nothing for other runs or answers (DL3-F2)", async () => {
    const upstream: string[] = [];
    const client = {
      readAnswerIndex: async () => {
        upstream.push("readAnswerIndex");
        return {
          items: [], limit: 50, offset: 0, total: 2,
          open_runs: [
            { run_ref: "run:waiting", question_line: "Q1?", state: "WAITING", terminal_reason: null, created_at_sequence: 2 },
            { run_ref: "run:queued", question_line: "Q2?", state: "QUEUED", terminal_reason: null, created_at_sequence: 1 }
          ]
        };
      },
      readRun: async (runId: string) => {
        upstream.push(`readRun:${runId}`);
        return waitingRun;
      }
    } as unknown as ContractClient;
    const page = await listDebatesPageServer("session", client);
    expect(upstream).toEqual(["readAnswerIndex", "readRun:run:waiting"]);
    expect(page.summaries.map((summary) => [summary.id, summary.status, summary.waits_until ?? null])).toEqual([
      ["run:waiting", "waiting", WAITS_UNTIL],
      ["run:queued", "generating", null]
    ]);
  });

  it("carries waits_for OWN_DEBATES to the debate page and the home list, and nothing for any other run (Important 1)", async () => {
    const ownDebates = { ...waitingRun, waits_for: "OWN_DEBATES" as const };
    expect(debateDetailFromRunProjection(ownDebates as never)).toMatchObject({ run_state: "WAITING", waits_for: "OWN_DEBATES" });
    expect(debateDetailFromRunProjection(waitingRun as never).waits_for).toBeNull();
    expect(debateDetailFromRunProjection({ ...waitingRun, state: "QUEUED", waits_until: null } as never).waits_for).toBeNull();
    const client = {
      readAnswerIndex: async () => ({
        items: [], limit: 50, offset: 0, total: 1,
        open_runs: [{ run_ref: "run:waiting", question_line: "Q1?", state: "WAITING", terminal_reason: null, created_at_sequence: 1 }]
      }),
      readRun: async () => ownDebates
    } as unknown as ContractClient;
    const page = await listDebatesPageServer("session", client);
    expect(page.summaries[0]).toMatchObject({ status: "waiting", waits_until: WAITS_UNTIL, waits_for: "OWN_DEBATES" });
  });

  it("still lists a waiting run whose own read failed, without a time", async () => {
    const client = {
      readAnswerIndex: async () => ({
        items: [], limit: 50, offset: 0, total: 1,
        open_runs: [{ run_ref: "run:waiting", question_line: "Q1?", state: "WAITING", terminal_reason: null, created_at_sequence: 1 }]
      }),
      readRun: async () => { throw new Error("unreachable"); }
    } as unknown as ContractClient;
    const page = await listDebatesPageServer("session", client);
    expect(page.summaries[0]).toMatchObject({ status: "waiting", waits_until: null });
  });
});
