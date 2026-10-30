import { describe, expect, it } from "vitest";
import { AnswerStorySchema, StoryChartSchema, type StoryBody } from "@debateai/contract";
import type { Pool } from "@debateai/db";
import { ProviderContentUnacceptedError, readPromptFrame, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";
import type { StoryPolicy } from "@debateai/register";
import {
  STORY_CHARTS_ANSWER_FORM,
  STORY_CHARTS_CALL_SITE_KEY,
  STORY_CHARTS_CONTRACT_ID,
  STORYTELLER_CONTRACT_ID,
  StoryWriter,
  buildAnswerStory,
  classifyStoryChartsContent,
  figureReadings,
  loadStoryPack,
  readStoryCharts,
  resolveStoryPackDir,
  restoreChartRefs,
  type StoryChartsContext,
  type StoryRecordInput,
  type StoryWriteInput,
  type StoryWriterDependencies
} from "@debateai/story";
import { storyCallScopeAgrees } from "../../apps/runner/src/index.js";

/**
 * Charts in the verdict PDF (design 2026-10-28): the chart plan's checks, the one chart call after an accepted story,
 * and the gateway's story scope for its call site. A chart is kept whole or dropped whole; the story never depends on it.
 */

const BODY: StoryBody = {
  shape_id: "personal-choice",
  short: {
    headline: "h", summary: "s", confidence: "c",
    paths: [{ position_ref: "P1", fate: "HELD_UP", line: "l", node_refs: ["P1"] }],
    change: { text: "t", node_refs: ["P1"] }
  },
  why: { reasons: [{ text: "Output beats payroll.", node_refs: ["P1", "P2"] }, { text: "Only P3.", node_refs: ["P3"] }] },
  long: {
    sections: [
      { title: "A", paragraphs: [{ text: "a", node_refs: ["P1", "P2", "P3"] }] },
      { title: "B", paragraphs: [{ text: "b", node_refs: ["P1"] }] },
      { title: "C", paragraphs: [{ text: "c", node_refs: ["P1"] }] }
    ]
  },
  reviewer_note: null
};

const CONTEXT: StoryChartsContext = {
  body: BODY,
  claims: new Map([
    ["P1", "Output per hour rose 12% in the trial, at a cost of $1,250.50 a month."],
    ["P2", "Payroll costs rise by 8 % a year."],
    ["P3", "Three teams saw 0,5 fewer sick days and 4.5 more in a second year."]
  ]),
  scoreTexts: new Set(["0.61", "0,61"])
};

function bar(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    after: "why.1",
    kind: "bar",
    title: "What changed in the trial",
    x: null,
    y: { label: "Change (%)", source: "figure", log: false },
    items: [
      { label: "Output per hour", node_ref: "P1", x: null, y: { value: 12, text: "12%" } },
      { label: "Payroll", node_ref: "P2", x: null, y: { value: 8, text: "8 %" } }
    ],
    ...overrides
  };
}

describe("figureReadings: every number a figure's text could be read as", () => {
  it("reads both decimal conventions and each number of a list", () => {
    expect(figureReadings("$1,250.50")).toContain(1250.5);
    expect(figureReadings("1.250,50 lei")).toContain(1250.5);
    expect(figureReadings("0,5")).toContain(0.5);
    expect(figureReadings("12%")).toContain(12);
    expect(figureReadings("−3")).toContain(-3);
    expect(figureReadings("5, 10 and 15")).toEqual(expect.arrayContaining([5, 10, 15]));
    expect(figureReadings("none")).toEqual([]);
  });
});

describe("readStoryCharts: a chart is kept whole or dropped whole", () => {
  it("keeps a chart whose every figure is in its point's claim and states its value", () => {
    const read = readStoryCharts({ charts: [bar()] }, CONTEXT);
    expect(read.dropped).toEqual([]);
    expect(read.charts).toHaveLength(1);
    expect(StoryChartSchema.parse(read.charts[0])).toEqual(read.charts[0]);
  });

  it.each([
    ["CHART_FIGURE_NOT_IN_CLAIM", { items: [
      { label: "Output per hour", node_ref: "P1", x: null, y: { value: 14, text: "14%" } },
      { label: "Payroll", node_ref: "P2", x: null, y: { value: 8, text: "8 %" } }] }],
    ["CHART_FIGURE_MISMATCH", { items: [
      { label: "Output per hour", node_ref: "P1", x: null, y: { value: 120, text: "12%" } },
      { label: "Payroll", node_ref: "P2", x: null, y: { value: 8, text: "8 %" } }] }],
    ["CHART_FIGURE_MISSING", { items: [
      { label: "Output per hour", node_ref: "P1", x: null, y: null },
      { label: "Payroll", node_ref: "P2", x: null, y: { value: 8, text: "8 %" } }] }],
    ["CHART_REF_NOT_CITED", { after: "why.2" }],
    ["CHART_ANCHOR_UNKNOWN", { after: "long.9.1" }],
    ["CHART_AXES_INVALID", { x: { label: "Cost", source: "figure", log: false } }],
    ["CHART_TOO_FEW_ITEMS", { kind: "scatter", x: { label: "Cost", source: "strength", log: false } }],
    ["CHART_TEXT_SCORE_VALUE", { title: "Strength 0.61" }],
    ["CHART_LABEL_REPEATED", { items: [
      { label: "Same", node_ref: "P1", x: null, y: { value: 12, text: "12%" } },
      { label: "Same", node_ref: "P2", x: null, y: { value: 8, text: "8 %" } }] }],
    ["CHART_LOG_NOT_POSITIVE", { y: { label: "Change (%)", source: "figure", log: true }, items: [
      { label: "Output per hour", node_ref: "P1", x: null, y: { value: 12, text: "12%" } },
      { label: "Fewer sick days", node_ref: "P3", x: null, y: { value: 0, text: "0" } }], after: "long.1.1" }],
    ["CHART_FIGURE_OUT_OF_RANGE", { items: [
      { label: "Output per hour", node_ref: "P1", x: null, y: { value: 1e300, text: "12%" } },
      { label: "Payroll", node_ref: "P2", x: null, y: { value: 8, text: "8 %" } }] }],
    ["CHART_AXES_INVALID", { frontier: { x: "lower", y: "higher" } }],
    ["CHART_SCHEMA", { frontier: { x: "cheaper", y: "higher" } }],
    ["CHART_SCHEMA", { kind: "pie" }]
  ])("drops %s", (code, overrides) => {
    const read = readStoryCharts({ charts: [bar(overrides as Record<string, unknown>)] }, CONTEXT);
    expect(read.charts).toEqual([]);
    expect(read.dropped).toEqual([code]);
  });

  it("never takes a strength, or a bar chart's x, from the model", () => {
    const read = readStoryCharts({ charts: [bar({
      y: { label: "Strength", source: "strength", log: false },
      items: [
        { label: "Output per hour", node_ref: "P1", x: { value: 1, text: "1" }, y: { value: 99, text: "99" } },
        { label: "Payroll", node_ref: "P2", x: null, y: null }
      ]
    })] }, CONTEXT);
    expect(read.charts[0]?.items.map((item) => [item.x, item.y])).toEqual([[null, null], [null, null]]);
  });

  it("keeps a scatter of two measures, and one chart per paragraph, at most four", () => {
    const scatter = bar({
      after: "long.1.1",
      kind: "scatter",
      x: { label: "Change (%)", source: "figure", log: false },
      y: { label: "Strength", source: "strength", log: false },
      items: [
        { label: "Output per hour", node_ref: "P1", x: { value: 12, text: "12%" }, y: null },
        { label: "Payroll", node_ref: "P2", x: { value: 8, text: "8 %" }, y: null },
        { label: "Sick days", node_ref: "P3", x: { value: 4.5, text: "4.5" }, y: null }
      ]
    });
    const read = readStoryCharts({ charts: [bar(), { ...scatter, frontier: { x: "higher", y: "higher" } }, bar(),
      ...Array.from({ length: 3 }, () => scatter)] }, CONTEXT);
    expect(read.charts.map((chart) => chart.after)).toEqual(["why.1", "long.1.1"]);
    // A scatter keeps the best-value line its plan asks for.
    expect(read.charts[1]?.frontier).toEqual({ x: "higher", y: "higher" });
    expect(read.dropped).toEqual(["CHART_ANCHOR_TAKEN", "CHART_ANCHOR_TAKEN", "CHART_ANCHOR_TAKEN", "CHART_ANCHOR_TAKEN"]);
  });

  it("refuses only a reply that is not { charts: [...] }, so the gateway re-asks for that alone", () => {
    expect(classifyStoryChartsContent(JSON.stringify({ charts: [] })).parseStatus).toBe("PARSED");
    expect(classifyStoryChartsContent(JSON.stringify({ charts: [{ kind: "pie" }] })).parseStatus).toBe("PARSED");
    expect(classifyStoryChartsContent(JSON.stringify({ chart: [] })).parseStatus).toBe("SCHEMA_FAILED");
    expect(classifyStoryChartsContent("no json").parseStatus).toBe("PARSE_FAILED");
    expect(readStoryCharts({ chart: [] }, CONTEXT)).toEqual({ charts: [], dropped: ["CHART_SCHEMA"] });
  });

  it("restores each short reference to its node id for storage", () => {
    const [chart] = readStoryCharts({ charts: [bar()] }, CONTEXT).charts;
    const restored = restoreChartRefs([chart!], new Map([["P1", "node-1"], ["P2", "node-2"]]));
    expect(restored[0]?.items.map((item) => item.node_ref)).toEqual(["node-1", "node-2"]);
    expect(() => restoreChartRefs([chart!], new Map())).toThrow(expect.objectContaining({ code: "STORY_REF_UNMAPPED" }));
  });

  it("states every limit the schema holds in its answer form", () => {
    expect(STORY_CHARTS_ANSWER_FORM).toContain("charts has 0 to 4 entries");
    expect(STORY_CHARTS_ANSWER_FORM).toContain("3 to 12 items");
    expect(STORY_CHARTS_ANSWER_FORM).toContain("at most 160 characters");
  });
});

describe("the owner's story response carries the stored charts", () => {
  it("a READY story serves its charts and still parses; a story not ready serves none", () => {
    const [chart] = readStoryCharts({ charts: [bar()] }, CONTEXT).charts;
    const stored = {
      storyId: "s", runId: "r", answerId: "a", answerVersion: 1, outcome: "READY" as const, failureCode: null,
      shapeId: "personal-choice", packVersion: "1", packFingerprint: "f", storytellerLineage: null, checkerLineage: null,
      rounds: 1, artifactRefs: [], body: BODY, reservation: null, verdictBasis: null, pointNumbers: null, languageTag: "en",
      storytellerRepairs: 0, charts: [chart!], createdAt: new Date("2026-10-28T10:00:00.000Z")
    };
    const ready = buildAnswerStory({ answerId: "a", answerVersion: 1, stored, derived: { status: "READY", unavailableReason: null } });
    expect(AnswerStorySchema.parse(ready).charts).toEqual([chart]);
    const writing = buildAnswerStory({ answerId: "a", answerVersion: 1, stored, derived: { status: "WRITING", unavailableReason: null } });
    expect(writing).not.toHaveProperty("charts");
    const without = buildAnswerStory({ answerId: "a", answerVersion: 1, stored: { ...stored, charts: [] }, derived: { status: "READY", unavailableReason: null } });
    expect(without).not.toHaveProperty("charts");
  });
});

describe("the gateway's story scope accepts the chart call on its own key and role only", () => {
  it("STORY:CHARTS:1 is a story call with the storyteller's role", () => {
    expect(storyCallScopeAgrees({ lane: "story", callSiteKey: "STORY:CHARTS:1", role: "SYNTHESIZER" })).toBe(true);
    expect(storyCallScopeAgrees({ lane: "story", callSiteKey: "STORY:CHARTS:1", role: "EVALUATOR" })).toBe(false);
    expect(storyCallScopeAgrees({ lane: "story", callSiteKey: "STORY:CHARTS:2", role: "SYNTHESIZER" })).toBe(false);
    expect(storyCallScopeAgrees({ lane: "served", callSiteKey: "STORY:CHARTS:1", role: "SYNTHESIZER" })).toBe(false);
  });
});

// --- The chart call, inside StoryWriter ----------------------------------------------------------------------------

const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const ROOT = "11111111-1111-4111-8111-111111111111";
const ATTACK = "22222222-2222-4222-8222-222222222222";
// Data blocks (2026-10-30): a third figure and a point for the position, so the debate passes the need test.
const SUPPORT = "77777777-7777-4777-8777-777777777777";

const POLICY: StoryPolicy = Object.freeze({
  storytellerRoleRef: "provider:storyteller",
  storyCheckerRoleRef: "provider:checker",
  loopMaxRounds: 2,
  storytellerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 }),
  checkerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000 }),
  materialBudget: Object.freeze({ low: 40_000, medium: 80_000, high: 120_000 }),
  perStoryCeilingMicros: null,
  perStoryOverrunBasisPoints: 0,
  registerVersion: 7
});

const SNAPSHOT: StoryWriteInput = Object.freeze<StoryWriteInput>({
  runId: "33333333-3333-4333-8333-333333333333",
  workItemId: "44444444-4444-4444-8444-444444444444",
  answerId: "55555555-5555-4555-8555-555555555555",
  answerVersion: 1,
  questionLine: "Should the team adopt a four-day week?",
  argumentLanguage: { tag: "en", name: "English" },
  compositionBudgetTier: "low",
  verdictBasis: {
    label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE",
    winner_node_id: ROOT, winner_strength: 0.61,
    runner_up_node_id: null, runner_up_strength: null, margin: null, disagreement: null,
    thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
    confidence_band: "FULL", marks: ["LABEL-BASIS-INCOMPLETE"]
  },
  servedStatement: ["The four-day week holds up, with the cost objection unresolved."],
  nodes: [
    {
      nodeId: ROOT, claim: "Adopt the four-day week: output per hour rose 12% in the trial.", isPosition: true,
      wayOfKnowing: "LOOKED_UP", baseScore: 0.7, finalStrength: 0.61, excludedReason: null, authorModel: "maker-a",
      panelDispersion: null, criticSummary: "Costs may rise."
    },
    {
      nodeId: ATTACK, claim: "Payroll costs rise by 8% a year.", isPosition: false, wayOfKnowing: "LOOKED_UP",
      baseScore: 0.4, finalStrength: 0.4, excludedReason: null, authorModel: "maker-a",
      panelDispersion: null, criticSummary: "One source only."
    },
    {
      nodeId: SUPPORT, claim: "Sick days fell by 4.5 a year in the trial.", isPosition: false, wayOfKnowing: "LOOKED_UP",
      baseScore: 0.35, finalStrength: 0.35, excludedReason: null, authorModel: "maker-a",
      panelDispersion: null, criticSummary: "A small trial."
    }
  ],
  arrows: [
    { sourceNodeId: ATTACK, targetNodeId: ROOT, polarity: "attack" },
    { sourceNodeId: SUPPORT, targetNodeId: ROOT, polarity: "support" }
  ],
  sensitivity: [
    { removedNodeId: ROOT, leverage: 0.61 }, { removedNodeId: ATTACK, leverage: 0.09 }, { removedNodeId: SUPPORT, leverage: 0.05 }
  ],
  setAside: [],
  judgeArtifactRefs: new Map([[ROOT, "66666666-6666-4666-8666-666666666666"]])
});

function story(): string {
  const paragraph = (text: string) => ({ text, node_refs: ["P1", "P2"] });
  return JSON.stringify({
    shape_id: PACK.defaultShape,
    short: {
      headline: "The four-day week held up, with one open question.",
      summary: "You asked whether to adopt a four-day week; the debate says yes, with costs unresolved.",
      confidence: "Fairly sure, as long as payroll costs stay flat.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Adopting it held up.", node_refs: ["P1", "P2"] }],
      change: { text: "Payroll figures showing a bigger rise would change the answer.", node_refs: ["P1"] }
    },
    why: { reasons: [{ text: "Output rose by more than payroll costs.", node_refs: ["P1", "P2"] }] },
    long: {
      sections: ["Our reading", "The verdict", "What would change it"].map((title) => ({ title, paragraphs: [paragraph(`${title}.`)] }))
    },
    reviewer_note: null
  });
}

const CHECKER_SATISFIED = JSON.stringify({
  satisfied: true,
  objection: null,
  criteria: {
    faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true,
    no_overstatement: true, citations_correct: true, reviewer_note_separate: true,
    goal_marked_as_reading: true, speaks_to_the_person: true
  }
});

const CHART_PLAN = JSON.stringify({
  charts: [
    {
      after: "why.1", kind: "bar", title: "Output against payroll", x: null,
      y: { label: "Change in a year (%)", source: "figure", log: false },
      items: [
        { label: "Output per hour", node_ref: "P1", x: null, y: { value: 12, text: "12%" } },
        { label: "Payroll", node_ref: "P2", x: null, y: { value: 8, text: "8%" } }
      ]
    },
    {
      after: "long.1.1", kind: "bar", title: "An invented figure", x: null,
      y: { label: "Change (%)", source: "figure", log: false },
      items: [
        { label: "Output per hour", node_ref: "P1", x: null, y: { value: 20, text: "20%" } },
        { label: "Payroll", node_ref: "P2", x: null, y: { value: 8, text: "8%" } }
      ]
    }
  ]
});

function scripted(answer: (request: ProviderCallRequest) => string | Error) {
  const calls: ProviderCallRequest[] = [];
  const provider: ProviderGateway = {
    async call(request) {
      calls.push(request);
      const content = answer(request);
      if (content instanceof Error) throw content;
      const classified = request.classifyContent?.(content);
      if (classified !== undefined && classified.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(1, classified.parseStatus, classified.parseError, "artifact:rejected", "ledger:rejected");
      }
      return {
        rawArtifactRef: `artifact:${String(calls.length)}`,
        ledgerEntryRef: `ledger:${String(calls.length)}`,
        content,
        provider: "openai-compatible-http",
        model: "unit/model",
        maker: "unit-maker",
        modelVersion: "unit/model"
      };
    }
  };
  return { provider, calls };
}

function answering(chartReply: string | Error, storyReply: string = story()) {
  return scripted((request) => {
    const contractId = readPromptFrame(request.packet).contractId;
    if (contractId === STORY_CHARTS_CONTRACT_ID) return chartReply;
    return contractId === STORYTELLER_CONTRACT_ID ? storyReply : CHECKER_SATISFIED;
  });
}

function harness(provider: ProviderGateway, charts: boolean | undefined) {
  const inserted: StoryRecordInput[] = [];
  const details: Record<string, unknown>[] = [];
  const deps: StoryWriterDependencies = {
    pool: {} as Pool,
    pack: PACK,
    policy: POLICY,
    hosted: false,
    resolveProvider: (roleRef) => ({ provider, providerRef: roleRef }),
    log: (event, detail) => { details.push({ event, ...detail }); },
    repository: { insert: async (record) => { inserted.push(record); return "INSERTED" as const; } },
    readEnrichment: async () => new Map(),
    ...(charts === undefined ? {} : { charts })
  };
  return { writer: new StoryWriter(deps), inserted, details };
}

describe("StoryWriter — the chart call (charts on)", () => {
  it("after an accepted story, asks the storyteller's maker once, on STORY:CHARTS:1, and stores the charts that pass", async () => {
    const { provider, calls } = answering(CHART_PLAN);
    const { writer, inserted, details } = harness(provider, true);
    await writer.writeAfterSettle(SNAPSHOT);
    expect(calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1", STORY_CHARTS_CALL_SITE_KEY]);
    const chartCall = calls[2]!;
    expect(chartCall).toMatchObject({ lane: "story", role: "SYNTHESIZER", providerRef: "provider:storyteller" });
    const frame = readPromptFrame(chartCall.packet);
    expect(frame.contractId).toBe(STORY_CHARTS_CONTRACT_ID);
    expect(inserted[0]?.outcome).toBe("READY");
    // The invented 20% is not in the claim: that chart is dropped whole; the other is stored with real node ids.
    expect(inserted[0]?.charts?.map((chart) => chart.title)).toEqual(["Output against payroll"]);
    expect(inserted[0]?.charts?.[0]?.items.map((item) => item.node_ref)).toEqual([ROOT, ATTACK]);
    expect(details).toContainEqual(expect.objectContaining({
      event: "STORY_CHARTS_WRITTEN", charts: 1, dropped: ["CHART_FIGURE_NOT_IN_CLAIM"]
    }));
  });

  it("a failed chart call leaves the story exactly as it is, with no charts, logged by code", async () => {
    const { provider } = answering(new Error("boom"));
    const { writer, inserted, details } = harness(provider, true);
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]?.outcome).toBe("READY");
    expect(inserted[0]).not.toHaveProperty("charts");
    expect(details).toContainEqual(expect.objectContaining({ event: "STORY_CHARTS_FAILED", code: "Error" }));
  });

  it("a debate with nothing worth showing gets no block call at all (data blocks, owner decision Q6)", async () => {
    const { provider, calls } = answering(CHART_PLAN);
    const { writer, inserted } = harness(provider, true);
    await writer.writeAfterSettle({
      ...SNAPSHOT,
      nodes: SNAPSHOT.nodes.slice(0, 2),
      arrows: SNAPSHOT.arrows.slice(0, 1),
      sensitivity: SNAPSHOT.sensitivity.slice(0, 2)
    });
    expect(calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(inserted[0]?.outcome).toBe("READY");
    expect(inserted[0]).not.toHaveProperty("charts");
    expect(inserted[0]).not.toHaveProperty("tables");
  });

  it("an empty plan stores no charts member", async () => {
    const { provider } = answering(JSON.stringify({ charts: [] }));
    const { writer, inserted } = harness(provider, true);
    await writer.writeAfterSettle(SNAPSHOT);
    expect(inserted[0]?.outcome).toBe("READY");
    expect(inserted[0]).not.toHaveProperty("charts");
  });

  it("no chart call for a story that failed, or when the writer has charts off", async () => {
    const failed = answering(CHART_PLAN, "not a story");
    const off = answering(CHART_PLAN);
    const failedRun = harness(failed.provider, true);
    await failedRun.writer.writeAfterSettle(SNAPSHOT);
    expect(failedRun.inserted[0]?.outcome).toBe("FAILED");
    expect(failed.calls.some((call) => call.callSiteKey === STORY_CHARTS_CALL_SITE_KEY)).toBe(false);
    const offRun = harness(off.provider, undefined);
    await offRun.writer.writeAfterSettle(SNAPSHOT);
    expect(off.calls.map((call) => call.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect(offRun.inserted[0]).not.toHaveProperty("charts");
  });
});
