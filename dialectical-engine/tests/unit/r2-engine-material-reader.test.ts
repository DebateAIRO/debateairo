// tests/unit/r2-engine-material-reader.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "@debateai/db";
import type { EvaluationSnapshot, SnapshotArrow } from "@debateai/propagation";
import type { EngineNodeFacts } from "../../apps/runner/src/engine-links.js";

const mocks = vi.hoisted(() => ({ readStoryEnrichment: vi.fn(), readPointInvestigationsForRun: vi.fn() }));
vi.mock("@debateai/story", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/story")>()),
  readStoryEnrichment: mocks.readStoryEnrichment
}));
vi.mock("@debateai/judgement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@debateai/judgement")>()),
  PointInvestigationRepository: class {
    async readPointInvestigationsForRun(runId: string): Promise<unknown> { return mocks.readPointInvestigationsForRun(runId); }
  }
}));

const {
  engineMaterialGraphOf, engineMaterialInvestigationsOf, engineMaterialSourceOf, readEngineMaterialSource, readEngineReviews
} = await import("../../apps/runner/src/engine-material-reader.js");

const RUN = "10000000-0000-4000-8000-000000000001";
const ROOT_A = "20000000-0000-4000-8000-00000000000a";
const ROOT_B = "20000000-0000-4000-8000-00000000000b";
const P1 = "30000000-0000-4000-8000-000000000001";
const X1 = "30000000-0000-4000-8000-000000000002";
const P2 = "30000000-0000-4000-8000-000000000003";
const LOST = "30000000-0000-4000-8000-000000000004";

const arrow = (arrowId: string, source: string, target: string, polarity: "support" | "attack"): SnapshotArrow => ({
  arrowId, sourceNodeId: source, targetKind: "NODE", targetNodeId: target, targetEdgeId: null, polarity, kind: null,
  strength: null, magnitudeStatus: "UNKNOWN", strengthSource: "REVIEWER"
});
const SNAPSHOT: EvaluationSnapshot = {
  nodes: [ROOT_A, ROOT_B, P1, X1, P2, LOST].map((nodeId) => ({ nodeId, baseStrength: 0.5 })),
  arrows: [
    arrow("e-p1", P1, ROOT_A, "support"),
    arrow("e-x1-own", X1, ROOT_A, "support"),
    arrow("e-x1-rival", X1, ROOT_B, "attack"),
    arrow("e-p2", P2, P1, "attack"),
    arrow("e-lost-own", LOST, ROOT_B, "support")
  ],
  arrowOrder: ["e-p1", "e-x1-own", "e-x1-rival", "e-p2", "e-lost-own"],
  operatorResolutions: [],
  clusterRecords: []
};
const fact = (nodeId: string, status: EngineNodeFacts["status"], ownReplyEdgeIds: readonly string[] = []): EngineNodeFacts =>
  ({ nodeId, status, cannotAssessReview: status === "CANNOT_ASSESS", ownReplyEdgeIds });
const FACTS: ReadonlyMap<string, EngineNodeFacts> = new Map([
  [P1, fact(P1, "AGREE")], [X1, fact(X1, "CANNOT_ASSESS", ["e-x1-own"])], [P2, fact(P2, "DISPUTE")],
  [LOST, fact(LOST, "NONE", ["e-lost-own"])]
]);
const GRAPH = engineMaterialGraphOf({
  question: "Should the city build a new tram line?",
  rootCount: 2,
  authored: new Map([
    [0, { nodeId: ROOT_A, statement: "A tram line moves more people for the same street space." }],
    [1, { nodeId: ROOT_B, statement: "Better buses do the job for less." }],
    [2, { nodeId: P1, statement: "A tram carries more people per hour than a bus." }],
    [3, { nodeId: X1, statement: "Buses cannot match a tram at rush hour." }],
    [4, { nodeId: P2, statement: "Rush hour lasts only two hours a day." }],
    [5, { nodeId: LOST, statement: "A reply whose only link is to its own answer." }]
  ]),
  mapWords: ["Yes, build the tram line.", null],
  snapshot: SNAPSHOT,
  facts: FACTS,
  honestFinalStrength: new Map([[P1, 0.7], [X1, 0.4], [P2, 0.3]])
});

const REVIEWS = new Map([[X1, { nodeId: X1, outcome: "cannot-assess" as const, reasons: ["No ridership numbers are given."],
  authorMaker: "m-a", reviewerMaker: "m-b", reviewOrder: 1 }]]);

beforeEach(() => {
  mocks.readStoryEnrichment.mockReset();
  mocks.readPointInvestigationsForRun.mockReset();
});

describe("engine 2: the runner's material reader (INTERFACE §11.2)", () => {
  it("builds the source from the graph in memory: letters by root, words from the map, cross-replies as objections to the rival", () => {
    expect(engineMaterialSourceOf(GRAPH, REVIEWS, new Map())).toEqual({
      question: "Should the city build a new tram line?",
      answers: [
        { letter: "A", rootNodeId: ROOT_A, words: "Yes, build the tram line.",
          caseText: "A tram line moves more people for the same street space.", assumptions: [] },
        { letter: "B", rootNodeId: ROOT_B, words: "Better buses do the job for less.", caseText: null, assumptions: [] }
      ],
      points: [
        { nodeId: P1, text: "A tram carries more people per hour than a bus.", relation: "SUPPORTS", targetRef: ROOT_A,
          answerLetter: "A", fromRivalReply: null, restsOn: null, status: "AGREE", reviewerReasons: [],
          honestFinalStrength: 0.7, investigation: null },
        { nodeId: X1, text: "Buses cannot match a tram at rush hour.", relation: "ATTACKS", targetRef: ROOT_B,
          answerLetter: "B", fromRivalReply: "A", restsOn: null, status: "CANNOT_ASSESS",
          reviewerReasons: ["No ridership numbers are given."], honestFinalStrength: 0.4, investigation: null },
        { nodeId: P2, text: "Rush hour lasts only two hours a day.", relation: "ATTACKS", targetRef: P1,
          answerLetter: "A", fromRivalReply: null, restsOn: null, status: "DISPUTE", reviewerReasons: [],
          honestFinalStrength: 0.3, investigation: null }
      ]
    });
  });

  it("keeps only the recorded findings an AI wrote (holds, fails, dead end)", () => {
    const content = { missing: "Rush-hour ridership.", found: "", reason: "A ridership count would decide it." };
    // R2a final wave B9 (Ruling (A12 Minors) 1): HOLDS, FAILS and SKIPPED rows too, each read its own way.
    const holds = { missing: "Rush-hour ridership.", found: "About two thousand riders an hour.", reason: "With that count the point stands." };
    const fails = { missing: "The fare.", found: "Probably five euros a ride.", reason: "At that fare the saving fails." };
    const P3 = "00000000-0000-4000-8000-0000000000c3";
    const P4 = "00000000-0000-4000-8000-0000000000c4";
    expect([...engineMaterialInvestigationsOf([
      { nodeId: X1, result: "DEAD_END", basis: "none", content },
      { nodeId: P1, result: "INVESTIGATION_CAPPED", basis: null, content: null },
      { nodeId: P2, result: "INVESTIGATION_UNAVAILABLE", basis: null, content: null },
      { nodeId: P3, result: "HOLDS", basis: "established", content: holds },
      { nodeId: P4, result: "FAILS", basis: "assumption", content: fails },
      { nodeId: "00000000-0000-4000-8000-0000000000c5", result: "INVESTIGATION_SKIPPED", basis: null, content: null }
    ]).entries()]).toEqual([
      [X1, { ...content, basis: "none", outcome: "dead_end" }],
      [P3, { ...holds, basis: "established", outcome: "holds" }],
      [P4, { ...fails, basis: "assumption", outcome: "fails" }]
    ]);
  });

  it("reads each review's makers and order from the ledger and its reasons through the story's leased reader", async () => {
    // Typed parameters so `query.mock.calls[0]![0]` / `[1]` typecheck (A18 Step 5), as tests/unit/model-scorecard-policy.test.ts:43 (pre-flight PF-R2a7.1)
    const query = vi.fn(async (_text: string, _values: readonly unknown[]) => ({ rows: [
      { node_id: X1, outcome: "cannot-assess", author_maker: "m-a", reviewer_maker: "m-b" },
      { node_id: P2, outcome: "dispute", author_maker: "m-c", reviewer_maker: "m-a" }
    ] }));
    mocks.readStoryEnrichment.mockResolvedValue(new Map([
      [X1, { judgeBestCase: null, judgeObjection: null, reviewOutcome: "cannot-assess", reviewReasons: ["No ridership numbers are given."], dispersion: null }],
      [P2, { judgeBestCase: null, judgeObjection: null, reviewOutcome: "dispute", reviewReasons: ["Rush hour is longer than that."], dispersion: null }]
    ]));
    const pool = { query } as unknown as Pool;
    const reviews = await readEngineReviews(pool, RUN, [X1, P2, "not-a-uuid"]);
    expect([...reviews.values()]).toEqual([
      { nodeId: X1, outcome: "cannot-assess", reasons: ["No ridership numbers are given."], authorMaker: "m-a", reviewerMaker: "m-b", reviewOrder: 1 },
      { nodeId: P2, outcome: "dispute", reasons: ["Rush hour is longer than that."], authorMaker: "m-c", reviewerMaker: "m-a", reviewOrder: 2 }
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![1]).toEqual([RUN, [X1.toLowerCase(), P2.toLowerCase()]]);
    expect(String(query.mock.calls[0]![0])).toMatch(/WHERE review\.run_id = \$1 AND review\.node_id = ANY\(\$2::uuid\[\]\)/u);
    // R2a final wave B9 (Ruling (A12 Minors) 2): the review order is spec §17's third tie-break.
    expect(String(query.mock.calls[0]![0])).toMatch(/WHERE review\.run_id = \$1 AND review\.node_id = ANY\(\$2::uuid\[\]\)\s+ORDER BY review\.at_seq\s*$/u);
    expect(mocks.readStoryEnrichment).toHaveBeenCalledWith(pool, { runId: RUN,
      nodes: [{ nodeId: X1, judgeArtifactRef: null }, { nodeId: P2, judgeArtifactRef: null }] });
  });

  it("asks nothing when no readable node id is given", async () => {
    const query = vi.fn();
    expect((await readEngineReviews({ query } as unknown as Pool, RUN, ["not-a-uuid"])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(mocks.readStoryEnrichment).not.toHaveBeenCalled();
  });

  // R2a final wave, Ruling (A12 concerns) 1 / (A12 Minors) 5: no review row, no lease and no story read.
  it("asks the story's reader nothing when the ledger holds no review of the nodes asked", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    expect((await readEngineReviews({ query } as unknown as Pool, RUN, [X1, P2])).size).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mocks.readStoryEnrichment).not.toHaveBeenCalled();
  });

  it("reads the reviews and the recorded investigations, then builds the source", async () => {
    const query = vi.fn(async () => ({ rows: [{ node_id: X1, outcome: "cannot-assess", author_maker: "m-a", reviewer_maker: "m-b" }] }));
    mocks.readStoryEnrichment.mockResolvedValue(new Map([[X1, { judgeBestCase: null, judgeObjection: null,
      reviewOutcome: "cannot-assess", reviewReasons: ["No ridership numbers are given."], dispersion: null }]]));
    mocks.readPointInvestigationsForRun.mockResolvedValue([{ nodeId: X1, result: "DEAD_END", basis: "none",
      content: { missing: "Rush-hour ridership.", found: "", reason: "A ridership count would decide it." } }]);
    const source = await readEngineMaterialSource({ pool: { query } as unknown as Pool, runId: RUN, graph: GRAPH });
    expect(mocks.readPointInvestigationsForRun).toHaveBeenCalledWith(RUN);
    expect(source.points.find((point) => point.nodeId === X1)).toMatchObject({
      reviewerReasons: ["No ridership numbers are given."],
      investigation: { missing: "Rush-hour ridership.", found: "", basis: "none", outcome: "dead_end", reason: "A ridership count would decide it." }
    });
  });
});
