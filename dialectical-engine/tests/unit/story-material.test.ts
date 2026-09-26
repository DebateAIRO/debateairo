import { describe, expect, it } from "vitest";
import { STORY_BODY_LIMITS, type StoryBody, type StoryVerdictBasis } from "@debateai/contract";
import { assertFramedPrompt, buildFramedPrompt, type FramedMaterialField } from "@debateai/providers";
import {
  buildStoryMaterial,
  classifyStoryContent,
  pointNumbersFrom,
  restoreStoryRefs,
  toCheckerPromptMaterial,
  toStoryPromptMaterial,
  type StoryMaterialOmitted,
  type StoryMaterialPoint,
  type StoryMaterialPosition,
  type StoryMaterialResult,
  type StoryMaterialVerdict,
  type StoryNodeEnrichment,
  type StoryRunSnapshot,
  type StorySnapshotArrow,
  type StorySnapshotNode
} from "@debateai/story";

/**
 * Verdict story, Task 3 — the material builder (spec §5.2): what the
 * storyteller and the checker read, the short references that replace node
 * ids, and the fixed ladder that shrinks the material to the tier's budget.
 */

const SHAPES: ReadonlySet<string> = new Set(["general", "health"]);
const LOW_BUDGET = 40_000;
const HIGH_BUDGET = 120_000;
const CORE_FIELDS = ["question", "verdict", "served_statement", "positions", "points", "hinges", "set_aside", "omitted"];

const BASIS: StoryVerdictBasis = {
  label: "CONTESTED",
  rung: 4,
  trigger: "MID_BAND",
  winner_node_id: "position:a",
  winner_strength: 0.612345,
  runner_up_node_id: "position:b",
  runner_up_strength: 0.4,
  margin: 0.212345,
  disagreement: 0.08,
  thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
  confidence_band: "MEDIUM",
  marks: []
};

function node(overrides: Partial<StorySnapshotNode> & { readonly nodeId: string }): StorySnapshotNode {
  return {
    claim: `The claim of ${overrides.nodeId}.`,
    isPosition: false,
    wayOfKnowing: "REASONING",
    baseScore: 0.5,
    finalStrength: 0.45,
    excludedReason: null,
    authorModel: "model:alpha",
    panelDispersion: 0.1,
    criticSummary: null,
    ...overrides
  };
}

function snapshot(overrides: Partial<StoryRunSnapshot> = {}): StoryRunSnapshot {
  return {
    runId: "run:story",
    workItemId: "work:story",
    answerId: "answer:story",
    answerVersion: 1,
    questionLine: "Should the city fund the tram extension?",
    argumentLanguage: { tag: "en", name: "English" },
    compositionBudgetTier: "low",
    verdictBasis: BASIS,
    servedStatement: ["The debate leans towards funding the extension.", "What would settle it is a ridership count."],
    nodes: [
      node({ nodeId: "position:b", isPosition: true, claim: "The city should not fund it.", finalStrength: 0.4, authorModel: "model:beta" }),
      node({ nodeId: "position:a", isPosition: true, claim: "The city should fund it.", finalStrength: 0.612345, wayOfKnowing: "LOOKED_UP" }),
      node({ nodeId: "point:c", claim: "Fares cover running costs by year nine." }),
      node({ nodeId: "point:d", claim: "Construction overruns are common.", criticSummary: "Overruns were priced into the budget." }),
      node({ nodeId: "point:e", claim: "The bridge crossing is contested.", excludedReason: "frozen: could not move the verdict" })
    ],
    arrows: [
      { sourceNodeId: "point:c", targetNodeId: "position:a", polarity: "support" },
      { sourceNodeId: "point:c", targetNodeId: "position:a", polarity: "support" },
      { sourceNodeId: "point:d", targetNodeId: "position:a", polarity: "attack" },
      { sourceNodeId: "point:d", targetNodeId: "position:b", polarity: "support" },
      { sourceNodeId: "point:e", targetNodeId: null, polarity: "attack" },
      { sourceNodeId: "point:e", targetNodeId: "node:not-in-this-debate", polarity: "attack" }
    ],
    sensitivity: [
      { removedNodeId: "point:c", leverage: 0.3 },
      { removedNodeId: "point:d", leverage: 0.2 },
      { removedNodeId: "position:b", leverage: 0.05 },
      { removedNodeId: "node:not-in-this-debate", leverage: 0.9 }
    ],
    setAside: [
      { nodeId: "point:e", reason: "Frozen: its leverage was below the threshold." },
      { nodeId: "node:not-in-this-debate", reason: "Not part of this debate." }
    ],
    ...overrides
  };
}

const ENRICHMENT: ReadonlyMap<string, StoryNodeEnrichment> = new Map([
  ["position:a", {
    judgeBestCase: "Ridership has grown every year for a decade.",
    judgeObjection: "The growth forecast is the operator's own.",
    reviewOutcome: "agree",
    reviewReasons: ["The source is cited and resolves."],
    dispersion: 0.08
  }],
  ["point:c", {
    judgeBestCase: "The fare model is published.",
    judgeObjection: null,
    reviewOutcome: "dispute",
    reviewReasons: ["Year nine assumes full ridership.", "No sensitivity was run."],
    dispersion: null
  }]
]);

type BuiltMaterial = Extract<StoryMaterialResult, { kind: "OK" }>;

function built(result: StoryMaterialResult): BuiltMaterial {
  if (result.kind !== "OK") throw new Error(`expected the material to fit, got ${result.kind}`);
  return result;
}

/**
 * Walk the ladder down to its last step: each build's budget is one byte under
 * the size the step before fitted at, so every step that shrinks is taken in turn.
 */
function atLastStep(build: (budgetBytes: number) => StoryMaterialResult): BuiltMaterial {
  let result = built(build(10_000_000));
  while (result.compressionStep < 7) result = built(build(result.material.bytes - 1));
  return result;
}

function field(fields: readonly FramedMaterialField[], name: string): unknown {
  const found = fields.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no ${name} field`);
  return JSON.parse(found.content) as unknown;
}

/** The short reference the material gave a node id. */
function refFor(result: BuiltMaterial, nodeId: string): string {
  const found = [...result.refMap.entries()].find(([, id]) => id === nodeId);
  if (found === undefined) throw new Error(`no reference for ${nodeId}`);
  return found[0];
}

/** A point as the models read it, looked up by its node id. */
function pointFor(result: BuiltMaterial, nodeId: string): StoryMaterialPoint {
  const points = field(toStoryPromptMaterial(result.material, null), "points") as StoryMaterialPoint[];
  const found = points.find((entry) => entry.id === refFor(result, nodeId));
  if (found === undefined) throw new Error(`no point for ${nodeId}`);
  return found;
}

/**
 * A well-formed story whose short paths are `positionRefs`, in that order,
 * citing only positions. Its lines name no point number: the short version
 * never does (Task 11 fix round 1).
 */
function storyWithPaths(positionRefs: readonly string[]): StoryBody {
  return {
    shape_id: "general",
    short: {
      headline: "The debate leans one way.",
      summary: "Our reading of your question.",
      confidence: "Fairly sure, if the count holds.",
      paths: positionRefs.map((ref) => ({ position_ref: ref, fate: "PARTLY_HELD" as const, line: "This position partly held.", node_refs: [ref] })),
      change: { text: "A count would change it.", node_refs: [] }
    },
    why: { reasons: [{ text: "One reason decided it.", node_refs: [] }] },
    long: {
      sections: [1, 2, 3].map((index) => ({ title: `Section ${String(index)}`, paragraphs: [{ text: "A paragraph.", node_refs: [] }] }))
    },
    reviewer_note: null
  };
}

function characters(value: string | undefined): number {
  return Array.from(value ?? "").length;
}

function text(seed: string, length: number): string {
  const base = `${seed} argues that the proposal changes the outcome for the people it affects most, because `;
  return base.repeat(Math.ceil(length / base.length)).slice(0, length);
}

describe("verdict story — the material fields", () => {
  const result = built(buildStoryMaterial({ snapshot: snapshot(), enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES }));
  const fields = toStoryPromptMaterial(result.material, null);

  it("emits the contract's fields, in order, as JSON under engine field names", () => {
    expect(fields.map((entry) => entry.name)).toEqual(CORE_FIELDS);
    for (const entry of fields) {
      expect(entry.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/u);
      expect(() => JSON.parse(entry.content) as unknown).not.toThrow();
    }
    expect(field(fields, "question")).toBe("Should the city fund the tram extension?");
    expect(field(fields, "served_statement")).toEqual(snapshot().servedStatement);
    expect(field(fields, "omitted")).toEqual([]);
    expect(result.compressionStep).toBe(0);
  });

  it("names the positions first, strongest first, then each position's tree depth-first in arrow order", () => {
    expect([...result.refMap.entries()]).toEqual([
      ["P1", "position:a"], ["P2", "position:b"], ["P3", "point:c"], ["P4", "point:d"], ["P5", "point:e"]
    ]);
  });

  it("counts its size as the UTF-8 bytes of every field's content", () => {
    const bytes = fields.reduce((total, entry) => total + Buffer.byteLength(entry.content, "utf8"), 0);
    expect(result.material.bytes).toBe(bytes);
  });

  it("is accepted by the frame's door", () => {
    const framed = buildFramedPrompt({
      contract: { contractId: "story.storyteller.v1", instruction: "Tell the debate.", answerForm: "Return JSON." },
      material: fields
    });
    expect(assertFramedPrompt(framed.packet).fields.map((entry) => entry.name)).toEqual(CORE_FIELDS);
  });

  it("indexes the visible references, the positions, the offered shapes and the 8-path cap", () => {
    expect([...result.index.nodeIds].sort()).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    expect([...result.index.positionIds].sort()).toEqual(["P1", "P2"]);
    expect(result.index.shapeIds).toBe(SHAPES);
    expect(result.index.pathCap).toBe(8);
    // One shared cap: the schema's and the index's can never disagree.
    expect(result.index.pathCap).toBe(STORY_BODY_LIMITS.maxPaths);
  });

  it("hands the checks the positions strongest first, the order it numbers and lists them in", () => {
    expect(result.index.positionOrder).toEqual(["P1", "P2"]);
    expect(result.index.positionOrder).toEqual(result.material.positions.map((position) => position.id));
    expect(result.index.positionOrder.map((ref) => result.refMap.get(ref))).toEqual(["position:a", "position:b"]);
    // The classifier's own index check accepts it, and a story covering both positions passes.
    expect(classifyStoryContent(JSON.stringify(storyWithPaths(["P2", "P1"])), result.index))
      .toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("lists the positions strongest first, with their author, final score and whether they won", () => {
    expect(field(fields, "positions") as StoryMaterialPosition[]).toEqual([
      { id: "P1", claim: "The city should fund it.", author: "model:alpha", final: 0.6123, won: true },
      { id: "P2", claim: "The city should not fund it.", author: "model:beta", final: 0.4, won: false }
    ]);
  });

  it("gives each point its links, scores, judge texts, review, spread and leverage", () => {
    expect(pointFor(result, "point:c")).toEqual({
      id: "P3",
      supports: ["P1"],
      claim: "Fares cover running costs by year nine.",
      known_by: "REASONING",
      base: 0.5,
      final: 0.45,
      best_case: "The fare model is published.",
      review: "dispute",
      review_reasons: ["Year nine assumes full ridership.", "No sensitivity was run."],
      author: "model:alpha",
      judge_spread: 0.1,
      leverage: 0.3
    });
    expect(pointFor(result, "position:a")).toMatchObject({
      id: "P1",
      position: true,
      known_by: "LOOKED_UP",
      best_case: "Ridership has grown every year for a decade.",
      objection: "The growth forecast is the operator's own.",
      judge_spread: 0.08
    });
  });

  it("falls back to the run's critic summary for the objection when the judge text is missing", () => {
    const point = pointFor(result, "point:d");
    expect(point.objection).toBe("Overruns were priced into the budget.");
    expect(point.best_case).toBeUndefined();
    expect(point).toMatchObject({ attacks: ["P1"], supports: ["P2"] });
  });

  it("drops arrows onto edges and onto nodes outside the debate", () => {
    const point = pointFor(result, "point:e");
    expect(point.supports).toBeUndefined();
    expect(point.attacks).toBeUndefined();
    expect(point.set_aside).toBe("frozen: could not move the verdict");
  });

  it("names the hinges by leverage and keeps set-aside branches of this debate only", () => {
    // position:b (P2) has leverage recorded too, but a position is never a hinge:
    // the hinges are the points that would flip the verdict, and the paths cover the positions.
    expect(field(fields, "hinges")).toEqual(["P3", "P4"]);
    expect(pointFor(result, "position:b").leverage).toBe(0.05);
    expect(field(fields, "set_aside")).toEqual([
      { id: "P5", reason: "Frozen: its leverage was below the threshold." }
    ]);
  });

  it("carries the verdict's numbers, the measured disagreement, and its rule in words", () => {
    expect(field(fields, "verdict") as StoryMaterialVerdict).toEqual({
      label: "CONTESTED",
      rule_in_words: "The label is CONTESTED because the strongest position finished at 0.6123, between the low cut "
        + "of 0.35 and the high cut of 0.7: better than unsupported, not strong enough to be supported.",
      rung: 4,
      trigger: "MID_BAND",
      winner_id: "P1",
      winner_final: 0.6123,
      runner_up_id: "P2",
      runner_up_final: 0.4,
      margin: 0.2123,
      disagreement: 0.08,
      thresholds: { tie_margin: 0.05, low_cut: 0.35, high_cut: 0.7, disagreement: 0.25 },
      confidence_band: "MEDIUM",
      marks: [],
      positions_argued: 2
    });
  });
});

describe("verdict story — the models never see a node id", () => {
  it("replaces every UUID with a short reference, and the reference map leads back", () => {
    const uuid = (index: number): string => `9b1d3c52-4e7f-4a8b-8c6d-${String(index).padStart(12, "0")}`;
    const ids = ["position:a", "position:b", "point:c", "point:d", "point:e"];
    const rename = (id: string | null): string | null => (id === null || !ids.includes(id) ? id : uuid(ids.indexOf(id)));
    const base = snapshot();
    const renamed = snapshot({
      verdictBasis: { ...BASIS, winner_node_id: uuid(0), runner_up_node_id: uuid(1) },
      nodes: base.nodes.map((entry) => ({ ...entry, nodeId: rename(entry.nodeId) ?? entry.nodeId })),
      arrows: base.arrows.map((arrow) => ({ ...arrow, sourceNodeId: rename(arrow.sourceNodeId) ?? arrow.sourceNodeId, targetNodeId: rename(arrow.targetNodeId) })),
      sensitivity: base.sensitivity.map((record) => ({ ...record, removedNodeId: rename(record.removedNodeId) ?? record.removedNodeId })),
      setAside: base.setAside.map((entry) => ({ ...entry, nodeId: rename(entry.nodeId) ?? entry.nodeId }))
    });
    const result = built(buildStoryMaterial({ snapshot: renamed, enrichment: new Map(), budgetBytes: LOW_BUDGET, shapeIds: SHAPES }));
    const everything = toCheckerPromptMaterial(result.material, { shape_id: "general" } as unknown as StoryBody)
      .map((entry) => entry.content).join("\n");
    for (let index = 0; index < ids.length; index += 1) {
      expect(everything).not.toContain(uuid(index));
      expect(result.refMap.get(`P${String(index + 1)}`)).toMatch(/^9b1d3c52-/u);
    }
    expect(result.refMap.get("P1")).toBe(uuid(0));
  });
});

describe("verdict story — restoring node ids before storage", () => {
  const result = built(buildStoryMaterial({ snapshot: snapshot(), enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES }));
  const cited = (paths: StoryBody["short"]["paths"], note: StoryBody["reviewer_note"]): StoryBody => ({
    shape_id: "general",
    short: {
      headline: "The debate leans towards funding.",
      summary: "Our reading of your question.",
      confidence: "Fairly sure, if ridership holds.",
      paths,
      change: { text: "A ridership count.", node_refs: ["P3"] }
    },
    why: {
      reasons: [
        { text: "The fares argument decided it (P3).", node_refs: ["P3", "P1"] },
        { text: "The overrun objection was answered.", node_refs: ["P4"] }
      ]
    },
    long: {
      sections: [1, 2, 3].map((index) => ({
        title: `Section ${String(index)}`,
        paragraphs: [{ text: `Paragraph ${String(index)}.`, node_refs: index === 2 ? ["P1", "P4"] : [] }]
      }))
    },
    reviewer_note: note
  });

  it("maps every position_ref and node_refs entry back to its node id, and nothing else", () => {
    const story = cited([
      { position_ref: "P1", fate: "PARTLY_HELD", line: "Funding partly held.", node_refs: ["P1", "P3"] },
      { position_ref: "P2", fate: "FELL", line: "Not funding fell.", node_refs: ["P2"] }
    ], { text: "One point carries it.", node_refs: ["P3"] });
    const restored = restoreStoryRefs(story, result.refMap);
    expect(restored.short.paths).toEqual([
      { position_ref: "position:a", fate: "PARTLY_HELD", line: "Funding partly held.", node_refs: ["position:a", "point:c"] },
      { position_ref: "position:b", fate: "FELL", line: "Not funding fell.", node_refs: ["position:b"] }
    ]);
    expect(restored.short.change.node_refs).toEqual(["point:c"]);
    expect(restored.why.reasons.map((reason) => reason.node_refs)).toEqual([["point:c", "position:a"], ["point:d"]]);
    expect(restored.long.sections[1]!.paragraphs[0]!.node_refs).toEqual(["position:a", "point:d"]);
    expect(restored.reviewer_note?.node_refs).toEqual(["point:c"]);
    // The words are untouched: only the references change.
    expect(restored.short.headline).toBe(story.short.headline);
    expect(restored.short.confidence).toBe("Fairly sure, if ridership holds.");
    expect(restored.why.reasons.map((reason) => reason.text)).toEqual(story.why.reasons.map((reason) => reason.text));
    expect(restored.long.sections.map((section) => section.paragraphs[0]!.text))
      .toEqual(story.long.sections.map((section) => section.paragraphs[0]!.text));
    expect(restored.reviewer_note?.text).toBe("One point carries it.");
  });

  it("leaves the prose alone, so a point named in a sentence keeps its number", () => {
    const story = cited([
      { position_ref: "P1", fate: "PARTLY_HELD", line: "Funding partly held, mainly on P3.", node_refs: ["P1", "P3"] },
      { position_ref: "P2", fate: "FELL", line: "Not funding fell.", node_refs: ["P2"] }
    ], null);
    expect(restoreStoryRefs(story, result.refMap).short.paths[0]!.line).toBe("Funding partly held, mainly on P3.");
  });

  it("gives every node its canonical point number, the one the appendix prints", () => {
    expect(pointNumbersFrom(result.refMap)).toEqual({
      "position:a": "P1", "position:b": "P2", "point:c": "P3", "point:d": "P4", "point:e": "P5"
    });
  });

  it.each([["an unknown reference", "P99"], ["a raw node id", "position:a"]])("refuses %s", (_name, bad) => {
    const story = cited([{ position_ref: "P1", fate: "PARTLY_HELD", line: "Funding.", node_refs: [bad] }], null);
    expect(() => restoreStoryRefs(story, result.refMap))
      .toThrowError(expect.objectContaining({ code: "STORY_REF_UNMAPPED" }));
    const inReason = cited([{ position_ref: "P1", fate: "PARTLY_HELD", line: "Funding.", node_refs: [] }], null);
    inReason.why.reasons[0]!.node_refs = [bad];
    expect(() => restoreStoryRefs(inReason, result.refMap))
      .toThrowError(expect.objectContaining({ code: "STORY_REF_UNMAPPED" }));
  });
});

/**
 * R1 — the story never prints a score. The index carries every score and
 * threshold the material shows, as a story might print it: two decimals with a
 * point and with a comma, and the value exactly as the material prints it
 * (0.6123, 0.7), with a point and with a comma. A form the question or a
 * claim, a best case, an objection or a review reason also holds is the
 * person's own figure, and is left out (fix round 1, I-1 and I-2).
 */
describe("verdict story — the score values a story may never print", () => {
  const result = built(buildStoryMaterial({ snapshot: snapshot(), enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES }));
  const both = (...values: readonly string[]): string[] => values.flatMap((value) => [value, value.replace(".", ",")]);

  it("holds every point's base and final score, every position's, the verdict's four and every threshold", () => {
    expect([...result.index.scoreTexts].sort()).toEqual(both(
      // points: base 0.5 everywhere (0.50, and 0.5 as the material prints it); finals 0.45
      // (points) and the positions' 0.6123 and 0.4 (0.61 and 0.40 at two decimals)
      "0.50", "0.5", "0.45", "0.61", "0.6123", "0.40", "0.4",
      // verdict: winner 0.6123, runner-up 0.4, margin 0.2123, disagreement 0.08
      "0.21", "0.2123", "0.08",
      // thresholds: tie margin 0.05, high cut 0.7 (0.70, and 0.7 as the material prints it), low cut 0.35, disagreement 0.25
      "0.05", "0.70", "0.7", "0.35", "0.25"
    ).sort());
  });

  it("leaves out what is not a score: leverage and the judges' spread", () => {
    // Leverage 0.3 and 0.2, spread 0.1 and 0.08: 0.08 is there only as the verdict's disagreement.
    for (const absent of ["0.30", "0,30", "0.3", "0,3", "0.20", "0,20", "0.2", "0.10", "0,10", "0.1", "0.6"]) {
      expect(result.index.scoreTexts.has(absent)).toBe(false);
    }
  });

  it("holds each value exactly as the material prints it, four decimals included (I-2)", () => {
    const precise = built(buildStoryMaterial({
      snapshot: snapshot({
        verdictBasis: { ...BASIS, winner_strength: 0.6412, margin: 0.2412 },
        nodes: snapshot().nodes.map((entry) => entry.nodeId === "position:a" ? { ...entry, finalStrength: 0.6412 } : entry)
      }),
      enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES
    }));
    for (const printed of ["0.6412", "0,6412", "0.64", "0,64", "0.2412", "0,2412"]) {
      expect(precise.index.scoreTexts.has(printed)).toBe(true);
    }
    const story = storyWithPaths(["P1", "P2"]);
    story.long.sections[0]!.paragraphs[0]!.text = "Mutarea treptată a obținut 0,6412.";
    const refused = classifyStoryContent(JSON.stringify(story), precise.index);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain("STORY_TEXT_SCORE_VALUE");
  });

  describe("the person's own figures are never refused (I-1)", () => {
    // The high cut is 0.7, so 0.70 and 0,70 are score texts, until the debate itself talks about 0,70 lei/kWh.
    const priced = (claim: string, overrides: Partial<StoryRunSnapshot> = {}): BuiltMaterial => built(buildStoryMaterial({
      snapshot: snapshot({
        ...overrides,
        nodes: snapshot().nodes.map((entry) => entry.nodeId === "point:c" ? { ...entry, claim } : entry)
      }),
      enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES
    }));

    it("accepts a story repeating a claim's own figure, 0,70 lei/kWh, in either separator", () => {
      const own = priced("Electricity costs 0,70 lei/kWh on the day tariff.");
      expect(result.index.scoreTexts.has("0,70")).toBe(true);
      expect(own.index.scoreTexts.has("0,70")).toBe(false);
      expect(own.index.scoreTexts.has("0.70")).toBe(false);
      // Only that figure: the high cut's other printed form, and every other score, stay refused.
      expect(own.index.scoreTexts.has("0,7")).toBe(true);
      expect(own.index.scoreTexts.has("0,61")).toBe(true);
      const story = storyWithPaths(["P1", "P2"]);
      story.short.summary = "Curentul costă 0,70 lei/kWh ziua, așa că merită.";
      story.long.sections[0]!.paragraphs[0]!.text = "At 0.70 lei/kWh the savings hold.";
      expect(classifyStoryContent(JSON.stringify(story), own.index)).toEqual({ parseStatus: "PARSED", parseError: null });
      story.long.sections[1]!.paragraphs[0]!.text = "Funding finished at 0,61.";
      expect(classifyStoryContent(JSON.stringify(story), own.index).parseError).toContain("STORY_TEXT_SCORE_VALUE");
    });

    it("reads the person's figures in the question, the best case, the objection and the review reasons too", () => {
      for (const [question, enrichment] of [
        ["Is a 0,45 lei/kWh night tariff worth it?", ENRICHMENT],
        ["Should the city fund the tram?", new Map([["position:a", { ...ENRICHMENT.get("position:a")!, judgeBestCase: "Night power costs 0.45 lei." }]])],
        ["Should the city fund the tram?", new Map([["position:a", { ...ENRICHMENT.get("position:a")!, judgeObjection: "The 0,45 lei rate is promotional." }]])],
        ["Should the city fund the tram?", new Map([["position:a", { ...ENRICHMENT.get("position:a")!, reviewReasons: ["The 0.45 lei figure is on the bill."] }]])]
      ] as const) {
        const own = built(buildStoryMaterial({
          snapshot: snapshot({ questionLine: question }), enrichment, budgetBytes: LOW_BUDGET, shapeIds: SHAPES
        }));
        expect(own.index.scoreTexts.has("0.45")).toBe(false);
        expect(own.index.scoreTexts.has("0,45")).toBe(false);
        expect(own.index.scoreTexts.has("0.61")).toBe(true);
      }
    });

    it("does not count a whole-token lookalike, a percentage, or the engine's own texts as the person's figure", () => {
      // A longer number, a percentage (already never refused), the served statement
      // (written from a digest that carries the scores) and a set-aside reason (code's
      // words, which can quote a score: "Recorded strength 0.45 ...") exempt nothing.
      const own = priced("It costs 10,70 lei, or 0,705 of the budget, and 0,70% a year.", {
        servedStatement: ["The leading answer scored 0.45 and 0,70."],
        nodes: snapshot().nodes.map((entry) => entry.nodeId === "point:e"
          ? { ...entry, excludedReason: "HIDDEN-LOW-SCORE: Recorded strength 0.45 is at or below the ruled hidden-node threshold" }
          : entry.nodeId === "point:c" ? { ...entry, claim: "It costs 10,70 lei, or 0,705 of the budget, and 0,70% a year." } : entry)
      });
      for (const kept of ["0,70", "0.70", "0.45", "0,45"]) expect(own.index.scoreTexts.has(kept)).toBe(true);
    });
  });

  it("rounds half up, the way a person prints a score, whatever the float underneath", () => {
    // 0.575 is stored a hair below itself: toFixed(2) would print 0.57, a person 0.58.
    const half = built(buildStoryMaterial({
      snapshot: snapshot({ verdictBasis: { ...BASIS, margin: 0.575 } }),
      enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES
    }));
    expect(half.index.scoreTexts.has("0.58")).toBe(true);
    expect(half.index.scoreTexts.has("0,58")).toBe(true);
    expect(half.index.scoreTexts.has("0.57")).toBe(false);
  });

  it("refuses, through the classifier, a story that prints one of them", () => {
    const story = storyWithPaths(["P1", "P2"]);
    story.long.sections[0]!.paragraphs[0]!.text = "Funding finished at 0,61.";
    const refused = classifyStoryContent(JSON.stringify(story), result.index);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain("STORY_TEXT_SCORE_VALUE");
    story.long.sections[0]!.paragraphs[0]!.text = "Funding came out ahead, though not by much.";
    expect(classifyStoryContent(JSON.stringify(story), result.index)).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("holds only what the material still shows once the last ladder step leaves points out", () => {
    // The last step keeps the two positions and their direct children (a1, b1)
    // and leaves the deeper points out; only those carry 0.13 and 0.17.
    const deep = ["point:a2", "point:a3", "point:b2"];
    const shaped = snapshot({
      nodes: [
        node({ nodeId: "position:a", isPosition: true, finalStrength: 0.6, claim: text("Position A", 700) }),
        node({ nodeId: "position:b", isPosition: true, finalStrength: 0.4, claim: text("Position B", 700) }),
        ...["point:a1", "point:b1"].map((nodeId) => node({ nodeId, claim: text(`Claim ${nodeId}`, 700) })),
        ...deep.map((nodeId) => node({ nodeId, claim: text(`Claim ${nodeId}`, 700), baseScore: 0.13, finalStrength: 0.17 }))
      ],
      arrows: [
        { sourceNodeId: "point:a1", targetNodeId: "position:a", polarity: "attack" },
        { sourceNodeId: "point:a2", targetNodeId: "point:a1", polarity: "support" },
        { sourceNodeId: "point:a3", targetNodeId: "point:a2", polarity: "attack" },
        { sourceNodeId: "point:b1", targetNodeId: "position:b", polarity: "support" },
        { sourceNodeId: "point:b2", targetNodeId: "point:b1", polarity: "attack" }
      ],
      sensitivity: [],
      setAside: []
    });
    const full = built(buildStoryMaterial({ snapshot: shaped, enrichment: new Map(), budgetBytes: 10_000_000, shapeIds: SHAPES }));
    const last = atLastStep((budgetBytes) => buildStoryMaterial({
      snapshot: shaped, enrichment: new Map(), budgetBytes, shapeIds: SHAPES
    }));
    // Positive control: while the deep points are shown, their scores are there.
    expect(full.index.scoreTexts.has("0,13")).toBe(true);
    expect(full.index.scoreTexts.has("0.17")).toBe(true);
    expect(last.material.omitted.length).toBeGreaterThan(0);
    for (const gone of ["0.13", "0,13", "0.17", "0,17"]) expect(last.index.scoreTexts.has(gone)).toBe(false);
    expect(last.index.scoreTexts.has("0.60")).toBe(true);
    expect(last.index.scoreTexts.has("0.45")).toBe(true);
  });
});

describe("verdict story — the rule that decided, in words", () => {
  it.each([
    [{ label: "UNSUPPORTED", rung: 1, trigger: "BELOW_LOW_CUT", winner_strength: 0.3 },
      "The label is UNSUPPORTED because the strongest position finished at 0.3, below the low cut of 0.35."],
    [{ label: "CONTESTED", rung: 2, trigger: "MARGIN_WITHIN_GAMMA", winner_strength: 0.62, runner_up_strength: 0.58, margin: 0.04 },
      "The label is CONTESTED because the strongest position (0.62) led the runner-up (0.58) by only 0.04, within the tie margin of 0.05."],
    [{ label: "CONTESTED", rung: 2, trigger: "DISAGREEMENT_AT_THRESHOLD", disagreement: 0.31 },
      "The label is CONTESTED because the judges' disagreement about the strongest position (0.31) reached the disagreement threshold of 0.25."],
    [{ label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT", winner_strength: 0.81 },
      "The label is SUPPORTED because the strongest position finished at 0.81, at or above the high cut of 0.7, with a clear lead over any runner-up and judges who largely agreed."],
    [{ label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE", disagreement: null, marks: ["LABEL-BASIS-INCOMPLETE"] },
      "The label is CONTESTED because part of what the rule needs could not be measured (the judges' disagreement about the strongest position), and without it the rule cannot call the answer supported or unsupported."],
    [{ label: "CONTESTED", rung: 4, trigger: "A_FUTURE_TRIGGER" },
      "The label is CONTESTED; the rule that decided is recorded as A_FUTURE_TRIGGER."]
  ] as const)("%o", (change, words) => {
    const verdictBasis = { ...BASIS, ...change, marks: [...("marks" in change ? change.marks : [])] };
    const material = built(buildStoryMaterial({
      snapshot: snapshot({ verdictBasis }), enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES
    })).material;
    expect((field(toStoryPromptMaterial(material, null), "verdict") as StoryMaterialVerdict).rule_in_words).toBe(words);
  });

  it("builds a single-position debate, and says only one position was argued", () => {
    const single = snapshot({
      verdictBasis: {
        ...BASIS, rung: 0, trigger: "BASIS_INCOMPLETE", runner_up_node_id: null, runner_up_strength: null,
        margin: null, marks: ["LABEL-BASIS-INCOMPLETE"]
      },
      nodes: snapshot().nodes.filter((entry) => entry.nodeId !== "position:b"),
      sensitivity: [{ removedNodeId: "point:c", leverage: 0.3 }]
    });
    const result = built(buildStoryMaterial({ snapshot: single, enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES }));
    const verdict = field(toStoryPromptMaterial(result.material, null), "verdict") as StoryMaterialVerdict;
    expect(verdict.rule_in_words).toBe(
      "Only one position was argued, so there is no runner-up and no margin between positions. The label is "
        + "CONTESTED because part of what the rule needs could not be measured (the margin over a runner-up), "
        + "and without it the rule cannot call the answer supported or unsupported."
    );
    expect(verdict).toMatchObject({ winner_id: "P1", runner_up_id: null, runner_up_final: null, margin: null, positions_argued: 1 });
    expect([...result.index.positionIds]).toEqual(["P1"]);
    expect(result.index.positionOrder).toEqual(["P1"]);
  });
});

describe("verdict story — missing enrichment", () => {
  it("builds with no enrichment at all: judge texts, review and spread fall back or stay out", () => {
    const result = built(buildStoryMaterial({
      snapshot: snapshot(), enrichment: new Map(), budgetBytes: LOW_BUDGET, shapeIds: SHAPES
    }));
    const point = pointFor(result, "point:c");
    expect(point.best_case).toBeUndefined();
    expect(point.objection).toBeUndefined();
    expect(point.review).toBeUndefined();
    expect(point.review_reasons).toBeUndefined();
    expect(point.judge_spread).toBe(0.1);
    expect(pointFor(result, "point:d").objection).toBe("Overruns were priced into the budget.");
  });

  it("leaves out every score the run did not record", () => {
    const result = built(buildStoryMaterial({
      snapshot: snapshot({
        nodes: [
          node({ nodeId: "position:a", isPosition: true, baseScore: null, finalStrength: null, authorModel: null, panelDispersion: null })
        ],
        arrows: [],
        sensitivity: [],
        setAside: []
      }),
      enrichment: new Map(),
      budgetBytes: LOW_BUDGET,
      shapeIds: SHAPES
    }));
    expect(pointFor(result, "position:a")).toEqual({
      id: "P1", position: true, claim: "The claim of position:a.", known_by: "REASONING"
    });
  });

  it("refuses a run with no position at all, which no served verdict can have", () => {
    expect(() => buildStoryMaterial({
      snapshot: snapshot({ nodes: [node({ nodeId: "point:c" })] }), enrichment: new Map(), budgetBytes: LOW_BUDGET, shapeIds: SHAPES
    })).toThrowError(expect.objectContaining({ code: "STORY_MATERIAL_NO_POSITION" }));
  });
});

describe("verdict story — the prompt fields of each call", () => {
  const material = built(buildStoryMaterial({ snapshot: snapshot(), enrichment: ENRICHMENT, budgetBytes: LOW_BUDGET, shapeIds: SHAPES })).material;

  it("adds prior_objection, verbatim, only on a later draft", () => {
    const objection = "The summary calls the answer settled.\nIt is not.";
    const fields = toStoryPromptMaterial(material, objection);
    expect(fields.map((entry) => entry.name)).toEqual([...CORE_FIELDS, "prior_objection"]);
    expect(field(fields, "prior_objection")).toBe(objection);
    expect(toStoryPromptMaterial(material, null).some((entry) => entry.name === "prior_objection")).toBe(false);
  });

  it("gives the checker the same material plus the candidate story, and no prior objection", () => {
    const candidate = { shape_id: "general" } as unknown as StoryBody;
    const fields = toCheckerPromptMaterial(material, candidate);
    expect(fields.map((entry) => entry.name)).toEqual([...CORE_FIELDS, "candidate_story"]);
    expect(field(fields, "candidate_story")).toEqual({ shape_id: "general" });
  });
});

describe("verdict story — the shrink ladder, step by step", () => {
  // Two positions (no leverage recorded) and 24 points. node:03-06 argue with a
  // position directly; every later node:k argues with node:(k-4), so each chain
  // runs down from a position. Leverage falls with k: node:03-12 are the top 10,
  // node:03-22 the top 20, and node:23-26 are outside both.
  const ids = Array.from({ length: 26 }, (_, index) => `node:${String(index + 1).padStart(2, "0")}`);
  const id = (k: number): string => ids[k - 1] ?? "node:??";
  const arrows: StorySnapshotArrow[] = [
    { sourceNodeId: id(3), targetNodeId: id(1), polarity: "support" },
    { sourceNodeId: id(4), targetNodeId: id(1), polarity: "attack" },
    { sourceNodeId: id(5), targetNodeId: id(2), polarity: "support" },
    { sourceNodeId: id(6), targetNodeId: id(2), polarity: "attack" },
    ...Array.from({ length: 20 }, (_, index): StorySnapshotArrow => ({
      sourceNodeId: id(index + 7), targetNodeId: id(index + 3), polarity: (index + 7) % 2 === 1 ? "support" : "attack"
    }))
  ];
  const ladderSnapshot = snapshot({
    verdictBasis: { ...BASIS, winner_node_id: id(1), runner_up_node_id: id(2) },
    nodes: ids.map((nodeId, index) => node({ nodeId, isPosition: index < 2, claim: text(`Claim ${nodeId}`, 700) })),
    arrows,
    sensitivity: ids.slice(2).map((nodeId, index) => ({ removedNodeId: nodeId, leverage: (40 - index) / 100 })),
    setAside: []
  });
  const ladderEnrichment: ReadonlyMap<string, StoryNodeEnrichment> = new Map(ids.map((nodeId) => [nodeId, {
    judgeBestCase: text(`Best ${nodeId}`, 600),
    judgeObjection: text(`Objection ${nodeId}`, 600),
    reviewOutcome: "agree" as const,
    reviewReasons: [text(`Reason ${nodeId}`, 500)],
    dispersion: 0.1
  }]));
  const at = (budgetBytes: number): StoryMaterialResult => buildStoryMaterial({
    snapshot: ladderSnapshot, enrichment: ladderEnrichment, budgetBytes, shapeIds: SHAPES
  });

  it("walks steps 1 to 7 in order, each taken only when the one before does not fit", () => {
    const full = built(at(10_000_000));
    expect(full.compressionStep).toBe(0);
    expect(characters(pointFor(full, id(26)).best_case)).toBe(600);

    // Step 1: judge texts of points OUTSIDE the top-10 leverage are cut to 240; the top 10
    // keep theirs, and so do the positions (no leverage here), whose paths the story is built on.
    const step1 = built(at(full.material.bytes - 1));
    expect(step1.compressionStep).toBe(1);
    expect(characters(pointFor(step1, id(12)).best_case)).toBe(600);
    for (const nodeId of [id(13), id(26)]) {
      const point = pointFor(step1, nodeId);
      expect(characters(point.best_case)).toBe(240);
      expect(point.best_case?.endsWith("…")).toBe(true);
      expect(characters(point.objection)).toBe(240);
      expect(characters(point.review_reasons?.[0])).toBe(240);
    }
    for (const nodeId of [id(1), id(2)]) {
      const position = pointFor(step1, nodeId);
      expect(characters(position.best_case)).toBe(600);
      expect(characters(position.objection)).toBe(600);
      expect(characters(position.review_reasons?.[0])).toBe(500);
    }

    // Step 2: every judge text is cut to 240, the positions' included.
    const step2 = built(at(step1.material.bytes - 1));
    expect(step2.compressionStep).toBe(2);
    expect(characters(pointFor(step2, id(3)).best_case)).toBe(240);
    expect(characters(pointFor(step2, id(3)).claim)).toBe(700);
    const cutPosition = pointFor(step2, id(1));
    expect(characters(cutPosition.best_case)).toBe(240);
    expect(cutPosition.best_case?.endsWith("…")).toBe(true);
    expect(characters(cutPosition.objection)).toBe(240);
    expect(characters(cutPosition.review_reasons?.[0])).toBe(240);

    // Steps 3 to 5: claims follow the digest ladder, 480, 240, 120, in points and positions alike.
    let previous = step2;
    for (const [step, limit] of [[3, 480], [4, 240], [5, 120]] as const) {
      const next = built(at(previous.material.bytes - 1));
      expect(next.compressionStep).toBe(step);
      expect(characters(pointFor(next, id(5)).claim)).toBe(limit);
      const positions = field(toStoryPromptMaterial(next.material, null), "positions") as StoryMaterialPosition[];
      expect(characters(positions[0]?.claim)).toBe(limit);
      expect(characters(pointFor(next, id(5)).best_case)).toBe(240);
      previous = next;
    }

    // Step 6: points outside the top-20 lose judge texts and review reasons; claim, scores
    // and relations stay. The positions keep theirs.
    const step6 = built(at(previous.material.bytes - 1));
    expect(step6.compressionStep).toBe(6);
    const dropped = pointFor(step6, id(25));
    expect(dropped.best_case).toBeUndefined();
    expect(dropped.objection).toBeUndefined();
    expect(dropped.review_reasons).toBeUndefined();
    expect(dropped).toMatchObject({ review: "agree", final: 0.45, supports: [refFor(step6, id(21))] });
    expect(characters(dropped.claim)).toBe(120);
    expect(characters(pointFor(step6, id(22)).best_case)).toBe(240);
    expect(characters(pointFor(step6, id(1)).best_case)).toBe(240);

    // Step 7: only the positions, their direct children and the top-20 points with their
    // chains keep an entry; node:23-26 become per-position counts, by their net stance
    // toward the position: node:23 and node:25 support down a chain of supports, and
    // node:24 and node:26 attack down a chain of six attacks, which nets to support.
    const step7 = built(at(step6.material.bytes - 1));
    expect(step7.compressionStep).toBe(7);
    expect(step7.material.points).toHaveLength(22);
    expect(field(toStoryPromptMaterial(step7.material, null), "omitted") as StoryMaterialOmitted[]).toEqual([
      { position_ref: refFor(step7, id(1)), supports: 2, attacks: 0 },
      { position_ref: refFor(step7, id(2)), supports: 2, attacks: 0 }
    ]);
    expect(step7.index.nodeIds.has(refFor(step7, id(23)))).toBe(false);
    expect(step7.index.nodeIds.size).toBe(22);

    // Nothing left to cut: TOO_LARGE, with the smallest size the ladder reached.
    expect(at(step7.material.bytes - 1)).toEqual({
      kind: "TOO_LARGE", bytes: step7.material.bytes, budgetBytes: step7.material.bytes - 1
    });
  });

  it("counts each left-out point by its net stance toward its position, not by its own arrow", () => {
    // position:a <- point:a1 (attack). Below it, point:a2s supports a1, so it attacks A;
    // point:a2a attacks a1, an attack on an attack, so it supports A; point:a3s supports
    // a2s, a support of an attack, so it attacks A. position:b <- point:b1 (support);
    // point:b2 attacks b1, so it attacks B; point:b3 attacks b2, so it supports B.
    // No point has leverage, so the last step keeps only the positions, a1 and b1.
    const stance = snapshot({
      nodes: [
        node({ nodeId: "position:a", isPosition: true, finalStrength: 0.6, claim: text("Position A", 700) }),
        node({ nodeId: "position:b", isPosition: true, finalStrength: 0.4, claim: text("Position B", 700) }),
        ...["point:a1", "point:a2s", "point:a2a", "point:a3s", "point:b1", "point:b2", "point:b3"]
          .map((nodeId) => node({ nodeId, claim: text(`Claim ${nodeId}`, 700) }))
      ],
      arrows: [
        { sourceNodeId: "point:a1", targetNodeId: "position:a", polarity: "attack" },
        { sourceNodeId: "point:a2s", targetNodeId: "point:a1", polarity: "support" },
        { sourceNodeId: "point:a2a", targetNodeId: "point:a1", polarity: "attack" },
        { sourceNodeId: "point:a3s", targetNodeId: "point:a2s", polarity: "support" },
        { sourceNodeId: "point:b1", targetNodeId: "position:b", polarity: "support" },
        { sourceNodeId: "point:b2", targetNodeId: "point:b1", polarity: "attack" },
        { sourceNodeId: "point:b3", targetNodeId: "point:b2", polarity: "attack" }
      ],
      sensitivity: [],
      setAside: []
    });
    const result = atLastStep((budgetBytes) => buildStoryMaterial({
      snapshot: stance, enrichment: new Map(), budgetBytes, shapeIds: SHAPES
    }));
    expect(result.material.points.map((point) => result.refMap.get(point.id)))
      .toEqual(["position:a", "position:b", "point:a1", "point:b1"]);
    // Counted by their own arrows, these would read A: 2 supports, 1 attack; B: 0 supports, 2 attacks.
    expect(result.material.omitted).toEqual([
      { position_ref: refFor(result, "position:a"), supports: 1, attacks: 2 },
      { position_ref: refFor(result, "position:b"), supports: 1, attacks: 1 }
    ]);
  });

  it("counts a left-out point that no position reaches under a null position_ref", () => {
    // point:e's arrows land on an edge and on a node outside the debate: no position
    // reaches it, and it is not arrow-less, so the last step leaves it out and counts it apart.
    const result = atLastStep((budgetBytes) => buildStoryMaterial({
      snapshot: snapshot(), enrichment: ENRICHMENT, budgetBytes, shapeIds: SHAPES
    }));
    expect(result.material.omitted).toEqual([{ position_ref: null, supports: 0, attacks: 1 }]);
    expect(result.index.nodeIds.has(refFor(result, "point:e"))).toBe(false);
    expect(result.material.setAside).toEqual([]);
  });

  it("refuses a budget that is not a positive whole number of bytes", () => {
    for (const budgetBytes of [0, 1.5, -1, Number.NaN]) {
      expect(() => at(budgetBytes)).toThrowError(expect.objectContaining({ code: "STORY_MATERIAL_BUDGET_INVALID" }));
    }
  });
});

/**
 * A debate shaped the way the engine builds one: each maker's position with a
 * binary tree of supports and attacks `depth` levels deep, plus one cross-root
 * attack from each maker on each other maker's position. Node ids are
 * UUID-sized, as in the database; every point carries 400-character judge
 * texts, a review reason and a 300-character claim; leverage falls with depth.
 */
function engineShapedDebate(input: { readonly makers: number; readonly depth: number }): {
  readonly snapshot: StoryRunSnapshot;
  readonly enrichment: ReadonlyMap<string, StoryNodeEnrichment>;
} {
  const nodes: StorySnapshotNode[] = [];
  const arrows: StorySnapshotArrow[] = [];
  const levels = new Map<string, number>();
  const add = (isPosition: boolean, level: number): string => {
    const nodeId = `3f2c9a1e-8b7d-4c6a-9e5f-${String(nodes.length).padStart(12, "0")}`;
    levels.set(nodeId, level);
    nodes.push(node({
      nodeId,
      isPosition,
      claim: text(`Point ${String(nodes.length + 1)}`, 300),
      finalStrength: 0.3 + (nodes.length % 40) / 100,
      authorModel: nodes.length % 2 === 0 ? "anthropic/claude-sonnet-4.5" : "openai/gpt-5.2",
      panelDispersion: 0.12
    }));
    return nodeId;
  };
  const roots: string[] = [];
  for (let maker = 0; maker < input.makers; maker += 1) {
    const root = add(true, 0);
    roots.push(root);
    let frontier = [root];
    for (let level = 1; level <= input.depth; level += 1) {
      const next: string[] = [];
      for (const parent of frontier) {
        for (const polarity of ["support", "attack"] as const) {
          const child = add(false, level);
          arrows.push({ sourceNodeId: child, targetNodeId: parent, polarity });
          next.push(child);
        }
      }
      frontier = next;
    }
  }
  for (const [from] of roots.entries()) {
    for (const [to, target] of roots.entries()) {
      if (from !== to) arrows.push({ sourceNodeId: add(false, 1), targetNodeId: target, polarity: "attack" });
    }
  }
  return {
    snapshot: snapshot({
      verdictBasis: { ...BASIS, winner_node_id: roots[0] ?? "", runner_up_node_id: roots[1] ?? null },
      nodes,
      arrows,
      sensitivity: nodes.map((entry, index) => ({
        removedNodeId: entry.nodeId, leverage: 0.5 / 2 ** (levels.get(entry.nodeId) ?? 0) + index / 1_000_000
      })),
      setAside: []
    }),
    enrichment: new Map(nodes.map((entry) => [entry.nodeId, {
      judgeBestCase: text("Best", 400),
      judgeObjection: text("Objection", 400),
      reviewOutcome: "agree" as const,
      reviewReasons: [text("Reason", 200)],
      dispersion: 0.1
    }]))
  };
}

describe("verdict story — large debates against the tier budgets", () => {
  it("fits a depth-5, three-model debate (195 points) into the high budget, every point shown", () => {
    const debate = engineShapedDebate({ makers: 3, depth: 5 });
    expect(debate.snapshot.nodes).toHaveLength(195);
    const result = built(buildStoryMaterial({ ...debate, budgetBytes: HIGH_BUDGET, shapeIds: SHAPES }));
    expect(result.compressionStep).toBe(6);
    expect(result.material.bytes).toBeLessThanOrEqual(HIGH_BUDGET);
    expect(result.material.points).toHaveLength(195);
    expect(result.material.omitted).toEqual([]);
  });

  it("fits a depth-3, three-model debate (51 points) into the low budget, every point shown", () => {
    const debate = engineShapedDebate({ makers: 3, depth: 3 });
    expect(debate.snapshot.nodes).toHaveLength(51);
    const result = built(buildStoryMaterial({ ...debate, budgetBytes: LOW_BUDGET, shapeIds: SHAPES }));
    expect(result.compressionStep).toBe(6);
    expect(result.material.bytes).toBeLessThanOrEqual(LOW_BUDGET);
    expect(result.material.points).toHaveLength(51);
  });

  it("fits the depth-5 debate into the low budget only at step 7, and accounts for every point it leaves out", () => {
    const debate = engineShapedDebate({ makers: 3, depth: 5 });
    const result = built(buildStoryMaterial({ ...debate, budgetBytes: LOW_BUDGET, shapeIds: SHAPES }));
    expect(result.compressionStep).toBe(7);
    expect(result.material.bytes).toBeLessThanOrEqual(LOW_BUDGET);
    const shown = result.material.points.length;
    const counted = result.material.omitted.reduce((total, entry) => total + entry.supports + entry.attacks, 0);
    expect(shown + counted).toBe(195);
    expect(result.material.omitted.map((entry) => entry.position_ref)).toEqual(["P1", "P2", "P3"]);
    // The positions take none of the top-20 slots: the 3 positions, then the 12 level-1
    // points and the 8 strongest level-2 points, all 20 of them the top 20 and all of
    // them keeping their judge texts. Had the positions been ranked, 3 slots would go
    // to them: 20 shown, and 17 points with judge texts.
    expect(shown).toBe(23);
    const points = result.material.points.filter((point) => point.position !== true);
    expect(points).toHaveLength(20);
    expect(points.filter((point) => point.best_case !== undefined)).toHaveLength(20);
    const visible = new Set(result.material.points.map((point) => point.id));
    expect([...result.index.nodeIds].sort()).toEqual([...visible].sort());
    for (const point of result.material.points) {
      for (const target of [...(point.supports ?? []), ...(point.attacks ?? [])]) expect(visible.has(target)).toBe(true);
    }
    for (const hinge of result.material.hinges) expect(visible.has(hinge)).toBe(true);
    // No node id survives anywhere in what the models read: points, links, hinges,
    // set-aside, omitted counts and the verdict's winner and runner-up alike.
    const uuidShaped = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u;
    expect(JSON.stringify(debate.snapshot)).toMatch(uuidShaped);
    expect(JSON.stringify(result.material)).not.toMatch(uuidShaped);
  });

  it("fits a 12-position, 150-point debate into the low budget at step 7, and counts what it leaves out", () => {
    // 12 positions, two points arguing directly with each, and 114 deeper points:
    // point k argues with point k-24, so every chain runs down from a position.
    const idOf = (index: number): string => `7a4e2b10-5c3d-4f6e-8a9b-${String(index).padStart(12, "0")}`;
    const nodes = Array.from({ length: 150 }, (_, index) => node({
      nodeId: idOf(index),
      isPosition: index < 12,
      claim: text(`Point ${String(index + 1)}`, 400),
      finalStrength: 0.3 + (index % 40) / 100,
      authorModel: index % 2 === 0 ? "anthropic/claude-sonnet-4.5" : "openai/gpt-5.2"
    }));
    const arrows = nodes.slice(12).map((entry, offset): StorySnapshotArrow => ({
      sourceNodeId: entry.nodeId,
      targetNodeId: offset < 24 ? idOf(offset % 12) : idOf(offset + 12 - 24),
      polarity: offset % 2 === 0 ? "support" : "attack"
    }));
    const enrichment: ReadonlyMap<string, StoryNodeEnrichment> = new Map(nodes.map((entry) => [entry.nodeId, {
      judgeBestCase: text("Best", 400),
      judgeObjection: text("Objection", 400),
      reviewOutcome: "agree" as const,
      reviewReasons: [text("Reason", 200)],
      dispersion: 0.1
    }]));
    const result = built(buildStoryMaterial({
      snapshot: snapshot({
        verdictBasis: { ...BASIS, winner_node_id: idOf(0), runner_up_node_id: idOf(1) },
        nodes,
        arrows,
        sensitivity: nodes.map((entry, index) => ({ removedNodeId: entry.nodeId, leverage: (150 - index) / 1000 })),
        setAside: []
      }),
      enrichment,
      budgetBytes: LOW_BUDGET,
      shapeIds: SHAPES
    }));
    expect(result.compressionStep).toBe(7);
    expect(result.material.bytes).toBeLessThanOrEqual(LOW_BUDGET);
    expect(result.material.positions).toHaveLength(12);
    expect(result.index.positionIds.size).toBe(12);
    const counted = result.material.omitted.reduce((total, entry) => total + entry.supports + entry.attacks, 0);
    expect(result.material.points.length + counted).toBe(150);
    expect(result.material.omitted).toHaveLength(12);
    // The positions carry the highest leverage here, and still no position is a hinge.
    expect(result.material.hinges.map((ref) => result.refMap.get(ref))).toEqual([12, 13, 14, 15, 16].map(idOf));

    // Past the 8-path cap, the checks let only the 8 strongest be paths, so the
    // index's order must be the material's: strongest first, P1 onwards.
    const order = result.material.positions.map((position) => position.id);
    expect(result.index.positionOrder).toEqual(order);
    expect(order).toEqual(Array.from({ length: 12 }, (_, index) => `P${String(index + 1)}`));
    const finals = result.material.positions.map((position) => position.final ?? Number.NaN);
    expect(finals).toEqual([...finals].sort((left, right) => right - left));
    expect(result.refMap.get("P1")).toBe(idOf(11));
    const strongest = order.slice(0, STORY_BODY_LIMITS.maxPaths);
    expect(classifyStoryContent(JSON.stringify(storyWithPaths(strongest)), result.index))
      .toEqual({ parseStatus: "PARSED", parseError: null });
    const skipsOne = [...strongest.slice(0, -1), order[STORY_BODY_LIMITS.maxPaths] ?? "P?"];
    const refused = classifyStoryContent(JSON.stringify(storyWithPaths(skipsOne)), result.index);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain("STORY_PATH_NOT_AMONG_STRONGEST");
  });
});
