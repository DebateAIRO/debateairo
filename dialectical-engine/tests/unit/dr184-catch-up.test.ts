import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { Judge } from "@debateai/judgement";
import type { ProviderCallRequest, ProviderCallResult, ProviderGateway } from "@debateai/providers";
import type { RoleAssignment, RoleSeat, SeatCandidate } from "@debateai/scorecard";
import {
  createPostgresReviewCatchUpDependencies,
  pinnedReviewerMembers,
  runReviewCatchUp,
  type ReviewCatchUpDependencies
} from "@debateai/runner";

const node = Object.freeze({
  nodeId: "node:1",
  statement: "A claim",
  authorMaker: "maker:a",
  authorRawArtifactRef: "artifact:author",
  sourcedEdges: Object.freeze([])
});

/** T5/S3-1: a catch-up node that still owns an unmeasured edge. */
const edgeOwningNode = Object.freeze({
  nodeId: "node:edge-owner",
  statement: "A claim that attacks its parent",
  authorMaker: "maker:a",
  authorRawArtifactRef: "artifact:author",
  sourcedEdges: Object.freeze([
    Object.freeze({ edgeId: "edge:1", targetStatement: "The parent position", polarity: "attack" as const })
  ])
});

function dependencies(overrides: Partial<ReviewCatchUpDependencies> = {}): ReviewCatchUpDependencies {
  return {
    withContentLease: async (_runId,use) => use(),
    // Final review m5: a legacy run pins no role assignment, so its catch-up keeps the pinned panel.
    readPinnedReviewers: vi.fn(async () => null),
    probePinnedPanel: vi.fn(async () => [{
      maker: "maker:b", providerRef: "provider:b",
      review: vi.fn(async (input: { readonly edges: readonly { readonly edgeId: string }[] }) => ({
        outcome: "agree" as const, reasons: ["reviewed"],
        provenanceRef: "artifact:review", providerLedgerRef: "ledger:review",
        parseStrategy: "RAW" as const,
        // The double answers the call it was actually given: one bearing per
        // offered edge, never a blanket empty array.
        edgeMeasurements: input.edges.map((edge) => ({ edgeId: edge.edgeId, bearing: 0.5 })),
        observed: input
      }))
    }]),
    recordReviewWithMeasurements: vi.fn(async () => "review:1"),
    readUnreviewedNodes: vi.fn(async () => [node]),
    readDisclosedNodeIds: vi.fn(async () => [node.nodeId]),
    readLatestReviewerMaker: vi.fn(async () => null),
    countRunModelAttempts: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4),
    readPinnedMaximumAttempts: vi.fn(async () => 10),
    prepareVersion: vi.fn(async () => ({
      terminalBefore: "SERVED" as const, terminalAfter: "SERVED" as const,
      numberBefore: 0.7, numberAfter: 0.7, floorBefore: null, floorAfter: null,
      nowVisible: 1, stillSetAside: 0,
      persist: vi.fn(async () => ({ answerVersion: 2 }))
    })),
    ...overrides
  };
}

describe("T5 · catch-up reviews measure the edges they can still measure (S3-1)", () => {
  it("offers the node's own unmeasured edges instead of declaring it has none", async () => {
    const deps = dependencies({
      readUnreviewedNodes: vi.fn(async () => [edgeOwningNode]),
      readDisclosedNodeIds: vi.fn(async () => [edgeOwningNode.nodeId])
    });
    await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1,
      workItemId: "work:original", questionLine: "Question?",
      invocationId: "catch:1", pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge",
      runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 2, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    const reviewer = (await (deps.probePinnedPanel as ReturnType<typeof vi.fn>).mock.results[0]!.value)[0]!;

    // A node that sources an edge must not be described to the reviewer as
    // sourcing none: that is a false declaration, not a missing measurement.
    expect(reviewer.review).toHaveBeenCalledWith(expect.objectContaining({
      edges: [{ edgeId: "edge:1", targetStatement: "The parent position", polarity: "attack" }]
    }));
  });

  it("persists the review and what that ONE call measured as a single fact", async () => {
    const recordReviewWithMeasurements = vi.fn(async () => "review:1");
    const deps = dependencies({
      readUnreviewedNodes: vi.fn(async () => [edgeOwningNode]),
      readDisclosedNodeIds: vi.fn(async () => [edgeOwningNode.nodeId]),
      recordReviewWithMeasurements
    });
    await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1,
      workItemId: "work:original", questionLine: "Question?",
      invocationId: "catch:1", pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge",
      runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 2, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    const reviewer = (await (deps.probePinnedPanel as ReturnType<typeof vi.fn>).mock.results[0]!.value)[0]!;

    // codex r2 B1: ONE call carries both facts — there is no way to persist the
    // review without the bearings it returned.
    expect(recordReviewWithMeasurements).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run:1",
      nodeId: "node:edge-owner",
      measurements: [{ edgeId: "edge:1", bearing: 0.5 }]
    }));
    expect(recordReviewWithMeasurements).toHaveBeenCalledTimes(1);
    expect(reviewer.review).toHaveBeenCalledTimes(1);
  });

  it("records an empty measurement set when the node has no unmeasured edge left", async () => {
    const recordReviewWithMeasurements = vi.fn(async () => "review:1");
    const deps = dependencies({ recordReviewWithMeasurements });
    await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1,
      workItemId: "work:original", questionLine: "Question?",
      invocationId: "catch:1", pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge",
      runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 2, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });

    // `node` sources no unmeasured edge — an already-measured edge is never
    // re-offered, because the one-way ratchet would refuse the second write.
    // The review still lands, carrying an empty measurement set.
    expect(recordReviewWithMeasurements).toHaveBeenCalledWith(expect.objectContaining({
      measurements: []
    }));
  });
});

describe("DR-184 catch-up", () => {
  it("C-2 uses a fresh invocation-scoped key while retaining the original work item and ruled bound", async () => {
    const deps = dependencies();
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1,
      workItemId: "work:original", questionLine: "Question?",
      invocationId: "catch:1", pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 2, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    const reviewer = (await (deps.probePinnedPanel as ReturnType<typeof vi.fn>).mock.results[0]!.value)[0]!;
    expect(reviewer.review).toHaveBeenCalledWith(expect.objectContaining({
      subjectItemId: "work:original",
      callSiteKey: "JUDGE:review:catch-up:catch:1:node:1",
      bound: expect.objectContaining({ maxAttempts: 3 })
    }));
    expect(report).toMatchObject({ reviewed: 1, toVersion: 2, refusal: null });
  });

  it("probes first and refuses a disclosure mismatch before model spend", async () => {
    const order: string[] = [];
    const deps = dependencies({
      probePinnedPanel: vi.fn(async () => { order.push("probe"); return []; }),
      readUnreviewedNodes: vi.fn(async () => { order.push("work"); return [node]; }),
      readDisclosedNodeIds: vi.fn(async () => [])
    });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:1",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(order).toEqual(["probe", "work"]);
    expect(report.refusal).toBe("CATCH_UP_DISCLOSURE_MISMATCH");
    expect(deps.prepareVersion).not.toHaveBeenCalled();
  });

  it("refuses a number move and does not persist the candidate version", async () => {
    const persist = vi.fn(async () => ({ answerVersion: 2 }));
    const deps = dependencies({ prepareVersion: vi.fn(async () => ({
      terminalBefore: "SERVED" as const, terminalAfter: "SERVED" as const, numberBefore: 0.7, numberAfter: 0.6,
      floorBefore: null, floorAfter: null, nowVisible: 1, stillSetAside: 0, persist
    })) });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:1",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(report.refusal).toBe("CATCH_UP_NUMBER_WOULD_MOVE");
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not mint another version when a resumed invocation finds no work", async () => {
    const deps = dependencies({
      readUnreviewedNodes: vi.fn(async () => []),
      readDisclosedNodeIds: vi.fn(async () => [])
    });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 2, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:2",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(report).toMatchObject({ examined: 0, reviewed: 0, toVersion: null, refusal: null });
    expect(deps.prepareVersion).not.toHaveBeenCalled();
  });

  /**
   * Engine money rule, M5 review (M1): a floor answer has no served number, so
   * the number guard cannot see its label move. Its floor is re-derived by
   * prepareVersion, and a version that would move it is refused the same way.
   */
  it.each([
    ["the label would move", { leadingNodeId: "node:root", verdictState: "UNSUPPORTED" as const }],
    ["another position would lead", { leadingNodeId: "node:other", verdictState: null }],
    ["no position would be left to lead", null]
  ] as const)("refuses a version on which %s, and does not persist it", async (_name, floorAfter) => {
    const persist = vi.fn(async () => ({ answerVersion: 2 }));
    const deps = dependencies({ prepareVersion: vi.fn(async () => ({
      terminalBefore: "COMPONENTS_ONLY" as const, terminalAfter: "COMPONENTS_ONLY" as const,
      numberBefore: null, numberAfter: null,
      floorBefore: { leadingNodeId: "node:root", verdictState: "CONTESTED" as const }, floorAfter,
      nowVisible: 1, stillSetAside: 0, persist
    })) });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:1",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(report).toMatchObject({ refusal: "CATCH_UP_FLOOR_WOULD_MOVE", toVersion: null });
    expect(persist).not.toHaveBeenCalled();
  });

  it("persists a floor answer's version when its floor stays where it was", async () => {
    const persist = vi.fn(async () => ({ answerVersion: 2 }));
    const floor = { leadingNodeId: "node:root", verdictState: "CONTESTED" as const };
    const deps = dependencies({ prepareVersion: vi.fn(async () => ({
      terminalBefore: "COMPONENTS_ONLY" as const, terminalAfter: "COMPONENTS_ONLY" as const,
      numberBefore: null, numberAfter: null, floorBefore: floor, floorAfter: { ...floor },
      nowVisible: 1, stillSetAside: 0, persist
    })) });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:1",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(report).toMatchObject({ refusal: null, toVersion: 2 });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("refuses a worse terminal before persisting", async () => {
    const persist = vi.fn(async () => ({ answerVersion: 2 }));
    const deps = dependencies({ prepareVersion: vi.fn(async () => ({
      terminalBefore: "SERVED" as const, terminalAfter: "COMPONENTS_ONLY" as const,
      numberBefore: 0.7, numberAfter: 0.7, floorBefore: null, floorAfter: null, nowVisible: 1, stillSetAside: 0, persist
    })) });
    const report = await runReviewCatchUp({
      runId: "run:1", answerId: "answer:1", fromVersion: 1, workItemId: "work:1",
      questionLine: "Question?", invocationId: "catch:1",
      pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
      judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
      judgeContractHash: "contract:judge", runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
      hold: { countCooldownHolds: async () => 0, record: async () => undefined, wait: async () => undefined },
      dependencies: deps
    });
    expect(report.refusal).toBe("CATCH_UP_WOULD_DOWNGRADE");
    expect(persist).not.toHaveBeenCalled();
  });
});

/*
 * Final review m5 — on an ASSIGNED run, review catch-up reviews with the pinned REVIEWER seats,
 * each answering as its pinned candidate (thinking level on the wire, candidate id and scorecard
 * version on the ledger row), exactly as the run's own reviews did. It used to probe the pinned
 * POSITION mains (`discovered_panel`), so a catch-up review could come from a model the drawer
 * does not list for "Reviewing the arguments". A legacy (unassigned) run is unchanged.
 */
describe("final review m5 · review catch-up on an assigned run uses the pinned REVIEWER seats", () => {
  const candidate = (id: string, maker: string, thinkingLevel = "DEFAULT_ONLY"): SeatCandidate => ({
    candidateId: `candidate:${id}`, providerRef: `provider:${id}`, maker, modelId: `model-${id}`, thinkingLevel
  });
  const seat = (seatIndex: number, main: SeatCandidate, runnerUp: SeatCandidate | null = null): RoleSeat => ({
    seatIndex, main, runnerUp, diversityShare: runnerUp === null ? 0 : 0.2, source: "SCORECARD"
  });
  const assignment: RoleAssignment = {
    scorecardVersion: 7,
    strength: "BALANCED",
    roles: {
      POSITION: [seat(0, candidate("a", "maker:a")), seat(1, candidate("b", "maker:b"))],
      SUPPORT_ATTACK: [],
      CROSS_EXCHANGE: [],
      JUDGE: [seat(0, candidate("j", "maker:j"))],
      REVIEWER: [seat(0, candidate("r", "maker:r", "high"), candidate("s", "maker:s")), seat(1, candidate("t", "maker:t"))],
      ANSWER_WRITER: [],
      ANSWER_CHECKER: []
    }
  };
  const catchUp = (deps: ReviewCatchUpDependencies) => runReviewCatchUp({
    runId: "run:assigned", answerId: "answer:1", fromVersion: 1,
    workItemId: "work:original", questionLine: "Question?",
    invocationId: "catch:m5", pinnedPanel: [{ maker: "maker:b", providerRef: "provider:b" }],
    judgeBound: { maxAttempts: 3, tokenCeiling: 256, deadlineMs: 1_000 },
    judgeContractHash: "contract:judge",
    runDeathPolicy: { cooldownMs: 1, finalRetryAttempts: 1, maxCooldownHoldsPerRun: 0 },
    hold: { countCooldownHolds: async () => 2, record: async () => undefined, wait: async () => undefined },
    dependencies: deps
  });

  it("names the pinned REVIEWER seats' members, mains then runner-ups, each with its candidate and the scorecard version", () => {
    expect(pinnedReviewerMembers(assignment)).toEqual([
      { maker: "maker:r", providerRef: "provider:r", candidate: candidate("r", "maker:r", "high"), scorecardVersion: 7 },
      { maker: "maker:s", providerRef: "provider:s", candidate: candidate("s", "maker:s"), scorecardVersion: 7 },
      { maker: "maker:t", providerRef: "provider:t", candidate: candidate("t", "maker:t"), scorecardVersion: 7 }
    ]);
  });

  it("probes the pinned REVIEWER seats, never the pinned panel, on an assigned run", async () => {
    const members = pinnedReviewerMembers(assignment);
    const deps = dependencies({ readPinnedReviewers: vi.fn(async () => members) });
    await catchUp(deps);
    expect(deps.readPinnedReviewers).toHaveBeenCalledWith("run:assigned");
    expect(deps.probePinnedPanel).toHaveBeenCalledTimes(1);
    expect(deps.probePinnedPanel).toHaveBeenCalledWith(members);
  });

  it("keeps the legacy run's pinned panel when the run pins no assignment", async () => {
    const deps = dependencies();
    await catchUp(deps);
    expect(deps.probePinnedPanel).toHaveBeenCalledWith([{ maker: "maker:b", providerRef: "provider:b" }]);
  });

  /** A gateway that records every request and answers nothing a judge can parse (only the request matters here). */
  function recordingGateway(requests: ProviderCallRequest[]): ProviderGateway {
    return {
      call: async (request): Promise<ProviderCallResult> => {
        requests.push(request);
        return {
          rawArtifactRef: "artifact:r", ledgerEntryRef: "ledger:r", content: "{}",
          provider: "openai-compatible-http", model: "model-r", maker: "maker:r", modelVersion: "model-r"
        };
      }
    };
  }

  /** No Postgres: a fake pool that answers only the pin read (or refuses every query). */
  function postgresDependencies(pool: { readonly query: (sql: string) => Promise<unknown> }, requests: ProviderCallRequest[]) {
    const provider = recordingGateway(requests);
    return createPostgresReviewCatchUpDependencies({
      pool: pool as unknown as Pool,
      reviewers: [{ maker: "maker:r", providerRef: "provider:r", probe: async () => true, judge: new Judge(provider), provider }],
      scoringOperator: { deploymentRowValue: "accumulate", registerRef: "test:m5" },
      propagationContractHash: "contract:propagation",
      propagationNumberKind: "propagated-probability",
      propagationProducer: "propagation:test",
      judgementSelectionRule: { kind: "MAXIMIZE_WEIGHTED_TAU" },
      compositionBudget: { tier: "low", bound: 1, registerRowKey: "compositionBundleBudget", registerVersion: 1, sourceRef: "test:m5" }
    });
  }

  const reviewInput = {
    runId: "run:assigned", subjectItemId: "work:original", callSiteKey: "JUDGE:review:catch-up:catch:m5:node:1",
    questionLine: "Question?", statement: "A claim", authorMaker: "maker:a", providerRef: "provider:r",
    contractHash: "contract:judge", bound: { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 1_000 }, edges: []
  };

  it("sends an assigned reviewer's calls as its pinned candidate: the level on the wire, the id and version for the ledger", async () => {
    const requests: ProviderCallRequest[] = [];
    const deps = postgresDependencies({ query: vi.fn(async () => { throw new Error("no query expected"); }) }, requests);
    const [reviewer] = await deps.probePinnedPanel([
      { maker: "maker:r", providerRef: "provider:r", candidate: candidate("r", "maker:r", "high"), scorecardVersion: 7 }
    ]);
    await reviewer!.review(reviewInput).catch(() => undefined);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ thinkingLevel: "high", candidateId: "candidate:r", scorecardVersion: 7 });
  });

  it("leaves a legacy reviewer's calls unstamped, exactly as before", async () => {
    const requests: ProviderCallRequest[] = [];
    const deps = postgresDependencies({ query: vi.fn(async () => { throw new Error("no query expected"); }) }, requests);
    const [reviewer] = await deps.probePinnedPanel([{ maker: "maker:r", providerRef: "provider:r" }]);
    await reviewer!.review(reviewInput).catch(() => undefined);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.thinkingLevel).toBeUndefined();
    expect(requests[0]!.candidateId).toBeUndefined();
  });

  it("reads the run's pin: null without one, the REVIEWER members with one, and a loud refusal for an unreadable one", async () => {
    const pinRow = (value: unknown) => ({
      query: vi.fn(async (sql: string) => ({
        rows: sql.includes("core.run_role_assignment") && value !== undefined
          ? [{ run_id: "run:assigned", assignment: value, strength: "BALANCED", stepped_down: false, created_at: new Date(0) }]
          : []
      }))
    });
    expect(await postgresDependencies(pinRow(undefined), []).readPinnedReviewers("run:legacy")).toBeNull();
    expect(await postgresDependencies(pinRow(assignment), []).readPinnedReviewers("run:assigned"))
      .toEqual(pinnedReviewerMembers(assignment));
    await expect(postgresDependencies(pinRow({ scorecardVersion: 7 }), []).readPinnedReviewers("run:assigned"))
      .rejects.toMatchObject({ code: "RUN_ROLE_ASSIGNMENT_INVALID" });
  });
});
