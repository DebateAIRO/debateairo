import { describe, expect, it, vi } from "vitest";
import { Judge } from "@debateai/judgement";
import type { ProviderCallResult, ProviderGateway } from "@debateai/providers";
import type { RoleAssignment, RoleSeat, SeatCandidate } from "@debateai/scorecard";
import { ProviderCallFailedError } from "@debateai/providers";
import {
  PANEL_DEGRADED_SINGLE_VOICE_MARK,
  PANEL_PARTIAL_MARK,
  buildAssignedRunSeatBook,
  panelDegradationOf,
  panelNoteRecords,
  withCooldownRetry,
  type ConfiguredSeatMaker,
  type HoldProgressEvent,
  type RouteHealth
} from "@debateai/runner";

/**
 * Model scorecard A15d — the pure pieces the runner's seat filling leans on,
 * one per controller carry that a unit can hold still.
 */

const policy = Object.freeze({ cooldownMs: 600_000, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 2 });

function recorder() {
  const events: HoldProgressEvent[] = [];
  return {
    events,
    countCooldownHolds: vi.fn(async () => 0),
    record: vi.fn(async (event: HoldProgressEvent) => { events.push(event); }),
    wait: vi.fn(async () => undefined)
  };
}

const transportFailure = () => new ProviderCallFailedError(new Error("down"), 1, "FAILED", "ledger:test:1");

describe("A15d carry 3 · the post-cooldown final retry is granted once per SITE, not once per seat key", () => {
  it("withholds the final retry — no hold, no wait, no second sequence — when the site's other seat key already spent it", async () => {
    const hold = recorder();
    const attempt = vi.fn(async () => { throw transportFailure(); });
    const finalRetryPermitted = vi.fn(async () => false);
    await expect(withCooldownRetry({
      runId: "run:test", callSiteKey: "JUDGE:root:secondary", parentNodeId: null, plannedLegCount: 1,
      baseMaxAttempts: 1, failureScope: "MAKER_POSITION", policy, hold, attempt, finalRetryPermitted
    })).resolves.toMatchObject({ kind: "HALTED", record: { callSiteKey: "JUDGE:root:secondary" } });
    expect(attempt.mock.calls).toEqual([[1]]);
    expect(finalRetryPermitted).toHaveBeenCalledOnce();
    expect(hold.wait).not.toHaveBeenCalled();
    expect(hold.events.map((event) => [event.state, event.attemptsSpent])).toEqual([["MAKER_POSITION_HALTED", 1]]);
  });

  it("grants it as today when the other key has not spent one, and a review asks too", async () => {
    for (const failureScope of ["EXPANSION", "REVIEW"] as const) {
      const hold = recorder();
      const attempt = vi.fn().mockRejectedValueOnce(transportFailure()).mockResolvedValueOnce("authored");
      await expect(withCooldownRetry({
        runId: "run:test", callSiteKey: "JUDGE:site", parentNodeId: "node:parent", plannedLegCount: 1,
        baseMaxAttempts: 1, failureScope, policy, hold, attempt, finalRetryPermitted: async () => true
      })).resolves.toEqual({ kind: "AUTHORED", value: "authored" });
      expect(attempt.mock.calls).toEqual([[1], [2]]);
    }
  });
});

type PanelNotes = Parameters<typeof panelDegradationOf>[1];
const failed = { memberRole: "house-b", contractHash: "contract:judge", kind: "MEMBER_FAILED", failureKind: "TIMEOUT", reason: "TIMEOUT" } as const;
const skipped = { memberRole: "house-a", contractHash: "contract:judge", kind: "PRODUCER_GRADING_FORBIDDEN", failureKind: "PRODUCER_GRADING_FORBIDDEN", reason: "FX-HR-H6" } as const;
const refusedAfterCall = {
  memberRole: "house-c", answeringMemberRole: "house-a", contractHash: "contract:judge",
  kind: "PRODUCER_GRADING_REFUSED_AFTER_CALL", failureKind: "PRODUCER_GRADING_FORBIDDEN", reason: "FX-HR-H6"
} as const;

describe("A15d carries 10 and 15 · a paid voice the panel refused after the call is disclosed and persisted", () => {
  it("keeps today's marks and reason for member failures and the expected author skip", () => {
    expect(panelDegradationOf(1, [skipped] satisfies PanelNotes)).toEqual({ marks: [], panelFailureReason: null });
    expect(panelDegradationOf(1, [skipped, failed] satisfies PanelNotes))
      .toEqual({ marks: [PANEL_PARTIAL_MARK], panelFailureReason: "house-b: TIMEOUT" });
    expect(panelDegradationOf(0, [skipped, failed] satisfies PanelNotes))
      .toEqual({ marks: [PANEL_DEGRADED_SINGLE_VOICE_MARK], panelFailureReason: "house-b: TIMEOUT" });
  });

  it("counts a refusal after the call toward PANEL-PARTIAL and names the maker that answered", () => {
    expect(panelDegradationOf(1, [skipped, refusedAfterCall] satisfies PanelNotes)).toEqual({
      marks: [PANEL_PARTIAL_MARK],
      panelFailureReason: "house-c: PRODUCER_GRADING_FORBIDDEN (answered by house-a)"
    });
    expect(panelDegradationOf(1, [failed, refusedAfterCall] satisfies PanelNotes).panelFailureReason)
      .toBe("house-b: TIMEOUT; house-c: PRODUCER_GRADING_FORBIDDEN (answered by house-a)");
  });

  it("persists the answering maker on the refused note only; every other note keeps its exact shape", () => {
    const records = panelNoteRecords([skipped, failed, refusedAfterCall] satisfies PanelNotes);
    expect(JSON.stringify(records)).toBe(JSON.stringify([
      { memberRole: "house-a", kind: "PRODUCER_GRADING_FORBIDDEN", failureKind: "PRODUCER_GRADING_FORBIDDEN", reason: "FX-HR-H6" },
      { memberRole: "house-b", kind: "MEMBER_FAILED", failureKind: "TIMEOUT", reason: "TIMEOUT" },
      {
        memberRole: "house-c", answeringMemberRole: "house-a", kind: "PRODUCER_GRADING_REFUSED_AFTER_CALL",
        failureKind: "PRODUCER_GRADING_FORBIDDEN", reason: "FX-HR-H6"
      }
    ]));
  });
});

function configured(label: string): ConfiguredSeatMaker {
  const provider: ProviderGateway = {
    call: async (): Promise<ProviderCallResult> => { throw new Error("no call expected"); }
  };
  return { judge: new Judge(provider), provider, providerRef: `provider:${label}`, maker: `maker:${label}` };
}

function candidate(label: string): SeatCandidate {
  return { candidateId: `candidate:${label}`, providerRef: `provider:${label}`, maker: `maker:${label}`, modelId: `model:${label}`, thinkingLevel: "DEFAULT_ONLY" };
}

function seat(seatIndex: number, main: string, runnerUp: string | null = null): RoleSeat {
  return { seatIndex, main: candidate(main), runnerUp: runnerUp === null ? null : candidate(runnerUp), diversityShare: runnerUp === null ? 0 : 0.2, source: "SCORECARD" };
}

describe("A15d carry 12 · a role that falls back to the debaters is named for its disclosure", () => {
  it("lists every multi-seat role left without a claim-eligible pinned seat, and only those", () => {
    const labels = ["a", "b", "c", "j"];
    const assignment: RoleAssignment = {
      scorecardVersion: 7,
      strength: "BALANCED",
      roles: {
        POSITION: [seat(0, "a", "c"), seat(1, "b")],
        SUPPORT_ATTACK: [],
        CROSS_EXCHANGE: [],
        JUDGE: [seat(0, "j")],
        REVIEWER: [seat(0, "c")],
        ANSWER_WRITER: [seat(0, "a")],
        ANSWER_CHECKER: [seat(0, "b")]
      }
    };
    const routeHealth = new Map<string, RouteHealth>(labels.map((label) => [`provider:${label}`, label === "j"
      ? { state: "ABSENT", failureCode: "CLAIM_PROVIDER_ABSENT" }
      : { state: "HEALTHY" }] as const));
    const built = buildAssignedRunSeatBook({
      assignment,
      configured: new Map(labels.map((label) => [`provider:${label}`, configured(label)] as const)),
      routeHealth
    });
    expect(built.fallbackRoles).toEqual(["SUPPORT_ATTACK", "JUDGE"]);
    // The fallback seats are the debaters — POSITION runner-ups and shares
    // included — which is what the A16 disclosure has to name.
    expect(built.book.judge.map((entry) => [entry.main.providerRef, entry.runnerUp?.providerRef ?? null]))
      .toEqual([["provider:a", "provider:c"], ["provider:b", null]]);
  });
});
