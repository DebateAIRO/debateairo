import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { StoryBody, StoryVerdictBasis } from "@debateai/contract";
import {
  STORY_ANSWERS_NOTE_ANSWERS_FILLED,
  STORY_ANSWERS_NOTE_MAP_UNAVAILABLE,
  STORY_ENGINE_TOKENS,
  buildStoryMaterial,
  classifyStoryContent,
  toCheckerPromptMaterial,
  toStoryPromptMaterial,
  type StoryMaterialAlsoRaised,
  type StoryMaterialResult,
  type StoryRunSnapshot,
  type StorySnapshotAlsoRaised,
  type StorySnapshotNode
} from "@debateai/story";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8): the map's points that were raised but not debated
 * reach the storyteller as `also_raised`, in whatever the story budget leaves once the debate fits.
 * Controller ruling C-ORDER: the models get each point's claim in order (most-raised first), never a count.
 */

const SHAPES: ReadonlySet<string> = new Set(["general"]);
const LOW_BUDGET = 40_000;
const CORE_FIELDS = ["question", "verdict", "served_statement", "positions", "points", "hinges", "set_aside", "omitted"];
/** The claim cut of each ladder step (material.ts STORY_SHRINK_LADDER); null cuts nothing. */
const STEP_CLAIM_CHARS: readonly (number | null)[] = [null, null, null, 480, 240, 120, 120, 120];

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
    runId: "run:shape",
    workItemId: "work:shape",
    answerId: "answer:shape",
    answerVersion: 1,
    questionLine: "Should the city fund the tram extension?",
    argumentLanguage: { tag: "en", name: "English" },
    compositionBudgetTier: "low",
    verdictBasis: BASIS,
    servedStatement: ["The debate leans towards funding the extension."],
    nodes: [
      node({ nodeId: "position:a", isPosition: true, claim: "The city should fund it.", finalStrength: 0.612345 }),
      node({ nodeId: "position:b", isPosition: true, claim: "The city should not fund it.", finalStrength: 0.4, authorModel: "model:beta" }),
      node({ nodeId: "point:c", claim: "Fares cover running costs by year nine.", authorModel: "model:gamma" }),
      node({ nodeId: "point:d", claim: "Construction overruns are common." })
    ],
    arrows: [
      { sourceNodeId: "point:c", targetNodeId: "position:a", polarity: "support" },
      { sourceNodeId: "point:d", targetNodeId: "position:a", polarity: "attack" }
    ],
    sensitivity: [{ removedNodeId: "point:c", leverage: 0.3 }, { removedNodeId: "point:d", leverage: 0.2 }],
    setAside: [],
    ...overrides
  };
}

const ALSO_RAISED: readonly StorySnapshotAlsoRaised[] = [
  { claim: "The tram would change property prices along the line.", raisedBy: 1 },
  { claim: "Bus routes could be cut once the tram runs.", raisedBy: 3 },
  { claim: "Construction would close the main bridge for a year.", raisedBy: 3 },
  { claim: "Cycle lanes are a cheaper alternative.", raisedBy: 2 }
];

/**
 * `toStoryPromptMaterial(build({}).material, null)` for this file's snapshot, measured at the P2c base 96f826d91 by
 * running this very case against that commit's packages/story/src (P2c fix wave, review M-4). Re-measure only for a
 * deliberate change to today's story material, never to make a P2c change pass.
 */
const P2C_BASE_NO_MAP_MATERIAL = Object.freeze({
  sha256: "55ade9a5ea321faf98a9d53f4d4d95ab83388a32cde0a92eda2647b141769d3d",
  promptBytes: 1972,
  materialBytes: 1507,
  compressionStep: 0
});

type Built = Extract<StoryMaterialResult, { kind: "OK" }>;

function built(result: StoryMaterialResult): Built {
  if (result.kind !== "OK") throw new Error(`expected the material to fit, got ${result.kind}`);
  return result;
}

function build(overrides: Partial<StoryRunSnapshot>, budgetBytes = LOW_BUDGET): StoryMaterialResult {
  return buildStoryMaterial({ snapshot: snapshot(overrides), enrichment: new Map(), budgetBytes, shapeIds: SHAPES });
}

function fieldOf(result: Built, name: string): unknown {
  const found = toStoryPromptMaterial(result.material, null).find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no ${name} field`);
  return JSON.parse(found.content) as unknown;
}

function text(seed: string, length: number): string {
  const base = `${seed} argues that the proposal changes the outcome for the people it affects most, because `;
  return base.repeat(Math.ceil(length / base.length)).slice(0, length);
}

/** A well-formed story covering both positions; its long paragraphs cite nothing. */
function story(): StoryBody {
  return {
    shape_id: "general",
    short: {
      headline: "The debate leans one way.",
      summary: "Our reading of your question.",
      confidence: "Fairly sure, if the count holds.",
      paths: ["P1", "P2"].map((ref) => ({ position_ref: ref, fate: "PARTLY_HELD" as const, line: "This position partly held.", node_refs: [ref] })),
      change: { text: "A count would change it.", node_refs: [] }
    },
    why: { reasons: [{ text: "One reason decided it.", node_refs: [] }] },
    long: {
      sections: [1, 2, 3].map((index) => ({ title: `Section ${String(index)}`, paragraphs: [{ text: "A paragraph.", node_refs: [] }] }))
    },
    reviewer_note: null
  };
}

describe("debate shape P2c — also raised, not debated, in the story material", () => {
  it("keeps the material byte for byte when nothing was also raised", () => {
    const plain = built(build({}));
    const empty = built(build({ alsoRaised: [] }));
    expect(empty).toEqual(plain);
    expect("alsoRaised" in empty.material).toBe(false);
    // No answers note either (pre-flight PF-C6): a run without one keeps today's fields.
    expect("answersNote" in plain.material).toBe(false);
    expect(toStoryPromptMaterial(empty.material, null).map((entry) => entry.name)).toEqual(CORE_FIELDS);
    expect(JSON.stringify(toStoryPromptMaterial(empty.material, null)))
      .toBe(JSON.stringify(toStoryPromptMaterial(plain.material, null)));
  });

  // P2c fix wave (review M-4): a FIXED baseline, measured at the P2c base 96f826d91 (before any also-raised or answers
  // note code existed) with this file's own snapshot. The comparison above runs the new code on both sides; this pin
  // catches any change to an existing field's bytes for a run without a map.
  it("keeps a no-map run's story material at the bytes it had before P2c (fixed baseline from 96f826d91)", () => {
    const plain = built(build({}));
    const prompt = JSON.stringify(toStoryPromptMaterial(plain.material, null));
    expect({
      sha256: createHash("sha256").update(prompt).digest("hex"),
      promptBytes: Buffer.byteLength(prompt),
      materialBytes: plain.material.bytes,
      compressionStep: plain.compressionStep
    }).toEqual(P2C_BASE_NO_MAP_MATERIAL);
  });

  it("sends also_raised after omitted, most-raised first, with only each claim and never a count (C-ORDER)", () => {
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    expect(toStoryPromptMaterial(result.material, null).map((entry) => entry.name)).toEqual([...CORE_FIELDS, "also_raised"]);
    expect(fieldOf(result, "also_raised") as StoryMaterialAlsoRaised[]).toEqual([
      { claim: "Bus routes could be cut once the tram runs." },
      { claim: "Construction would close the main bridge for a year." },
      { claim: "Cycle lanes are a cheaper alternative." },
      { claim: "The tram would change property prices along the line." }
    ]);
    // No count reaches the models: the field's JSON holds the claims and nothing else.
    const field = toStoryPromptMaterial(result.material, null).find((entry) => entry.name === "also_raised");
    expect(field?.content).not.toContain("raised_by");
    expect(field?.content).not.toMatch(/[0-9]/u);
    // The checker reads the same material.
    const checker = toCheckerPromptMaterial(result.material, story()).map((entry) => entry.name);
    expect(checker).toContain("also_raised");
    expect(checker.indexOf("also_raised")).toBeLessThan(checker.indexOf("candidate_story"));
  });

  it("keeps at most 12 points, drops blank claims and counts a bad count as one", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ claim: `Point number ${String(index)}.`, raisedBy: 1 }));
    const result = built(build({ alsoRaised: [{ claim: "   ", raisedBy: 5 }, { claim: "Odd count.", raisedBy: Number.NaN }, ...many] }));
    const items = fieldOf(result, "also_raised") as StoryMaterialAlsoRaised[];
    expect(items).toHaveLength(12);
    expect(items.every((item) => item.claim.trim() !== "" && Object.keys(item).join() === "claim")).toBe(true);
    expect(items[0]).toEqual({ claim: "Odd count." });
  });

  it("ranks a count above the panel as the panel, so a bad count cannot jump the queue", () => {
    // The fixture's points have three distinct authors: a count of 99 ranks as 3, ties keep the map's order.
    const result = built(build({ alsoRaised: [
      { claim: "Every AI raised this one.", raisedBy: 3 },
      { claim: "A count no map can produce.", raisedBy: 99 },
      { claim: "Two raised this one.", raisedBy: 2 }
    ] }));
    expect(result.material.alsoRaised).toEqual([
      { claim: "Every AI raised this one." }, { claim: "A count no map can produce." }, { claim: "Two raised this one." }
    ]);
  });

  it("never moves the ladder: also-raised points only use the bytes the debate leaves free", () => {
    const plain = built(build({}, 10_000_000));
    expect(plain.compressionStep).toBe(0);
    // Exactly the debate's own size: no room, so no field, and still step 0.
    const tight = built(build({ alsoRaised: ALSO_RAISED }, plain.material.bytes));
    expect(tight.compressionStep).toBe(0);
    expect("alsoRaised" in tight.material).toBe(false);
    expect(tight.material.bytes).toBe(plain.material.bytes);
    // 100 spare bytes: room for the most-raised point only (57 bytes of JSON), never for the second (122).
    const roomy = built(build({ alsoRaised: ALSO_RAISED }, plain.material.bytes + 100));
    expect(roomy.compressionStep).toBe(0);
    expect(roomy.material.alsoRaised).toEqual([{ claim: "Bus routes could be cut once the tram runs." }]);
    expect(roomy.material.bytes).toBeLessThanOrEqual(plain.material.bytes + 100);
  });

  it("cuts each also-raised claim to 240 characters, or to the ladder step's shorter claim cut", () => {
    const longNodes = snapshot().nodes.map((entry) => ({ ...entry, claim: text(entry.nodeId, 600) }));
    const longRaised = Array.from({ length: 12 }, (_, index) => ({ claim: text(`raised ${String(index)}`, 300), raisedBy: 1 }));
    const seenSteps = new Set<number>();
    /** Per ladder step: the longest also-raised claim seen there (review M-4: every step must check a real item). */
    const longestAt = new Map<number, number>();
    let budget = 10_000_000;
    for (let guard = 0; guard < 400; guard += 1) {
      const result = build({ nodes: longNodes, alsoRaised: longRaised }, budget);
      if (result.kind !== "OK") break;
      seenSteps.add(result.compressionStep);
      const limit = Math.min(240, STEP_CLAIM_CHARS[result.compressionStep] ?? 240);
      for (const item of result.material.alsoRaised ?? []) {
        const length = Array.from(item.claim).length;
        expect(length).toBeLessThanOrEqual(limit);
        longestAt.set(result.compressionStep, Math.max(longestAt.get(result.compressionStep) ?? 0, length));
      }
      expect(result.material.bytes).toBeLessThanOrEqual(budget);
      budget = result.material.bytes - 1;
    }
    expect(seenSteps.has(0)).toBe(true);
    expect(seenSteps.has(5)).toBe(true);
    // Every step the loop reached carried also-raised points, cut to exactly that step's limit: the cut is checked at
    // each step, never passed vacuously by a step where no point fitted.
    for (const step of seenSteps) {
      expect(longestAt.get(step), `step ${String(step)}`).toBe(Math.min(240, STEP_CLAIM_CHARS[step] ?? 240));
    }
  });

  it("length guidance (LG-C, ruling L19): with alsoRaisedWhole each also-raised claim is sent whole; without it, today's 240 clip", () => {
    const longRaised = [{ claim: text("raised", 600), raisedBy: 1 }];
    const whole = built(buildStoryMaterial({ snapshot: snapshot({ alsoRaised: longRaised }), enrichment: new Map(),
      budgetBytes: 10_000_000, shapeIds: SHAPES, alsoRaisedWhole: true }));
    expect(whole.compressionStep).toBe(0);
    expect(whole.material.alsoRaised?.[0]?.claim).toBe(text("raised", 600).trim());
    const today = built(build({ alsoRaised: longRaised }, 10_000_000));
    expect(Array.from(today.material.alsoRaised?.[0]?.claim ?? "").length).toBeLessThanOrEqual(240);
    expect(built(buildStoryMaterial({ snapshot: snapshot({ alsoRaised: longRaised }), enrichment: new Map(),
      budgetBytes: 10_000_000, shapeIds: SHAPES, alsoRaisedWhole: false })).material).toEqual(today.material);
  });

  it("refuses the field's own name in a story, as every underscore key of the material", () => {
    expect(STORY_ENGINE_TOKENS).toContain("also_raised");
    // C-ORDER: no count key is sent, so none is a material key either.
    expect(STORY_ENGINE_TOKENS).not.toContain("raised_by");
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    const body = story();
    body.long.sections[2]!.paragraphs[0]!.text = "The points under also_raised were left out.";
    const refused = classifyStoryContent(JSON.stringify(body), result.index);
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain("STORY_TEXT_ENGINE_TOKEN");
  });

  it("lets a story name an also-raised point in plain words, citing nothing", () => {
    const result = built(build({ alsoRaised: ALSO_RAISED }));
    const body = story();
    body.long.sections[2]!.paragraphs.push({
      text: "Other points came up but were not debated, such as whether bus routes could be cut once the tram runs.",
      node_refs: []
    });
    expect(classifyStoryContent(JSON.stringify(body), result.index)).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("treats an also-raised claim's figures and words as the person's side, like any claim", () => {
    // The high cut is 0.7, so 0,70 is a score text, until a raised point itself states 0,70 lei.
    const body = story();
    body.short.summary = "Night power costs 0,70 lei per kWh, which matters here.";
    const without = built(build({}));
    expect(classifyStoryContent(JSON.stringify(body), without.index).parseError).toContain("STORY_TEXT_SCORE_VALUE");
    const priced = built(build({ alsoRaised: [{ claim: "Night power costs 0,70 lei per kWh at the depot.", raisedBy: 1 }] }));
    expect(classifyStoryContent(JSON.stringify(body), priced.index)).toEqual({ parseStatus: "PARSED", parseError: null });
    // A raised point that says "Open RAN" frees RAN for the story, as a claim would.
    const ran = built(build({ alsoRaised: [{ claim: "The depot could move to Open RAN radios.", raisedBy: 2 }] }));
    expect(ran.index.engineTokens.has("RAN")).toBe(false);
    expect(without.index.engineTokens.has("RAN")).toBe(true);
  });

  // Owner ruling C-STORY (pre-flight PF-C6): one plain sentence when the answers came from a fallback.
  it("sends answers_note after also_raised, as the owner's option-1 sentence, to the storyteller and the checker", () => {
    expect(STORY_ANSWERS_NOTE_MAP_UNAVAILABLE)
      .toBe("We could not first gather every possible answer, so each AI argued the answer it found best.");
    expect(STORY_ANSWERS_NOTE_ANSWERS_FILLED)
      .toBe("Some of the answers or points argued here were added to make sure enough options were tested.");
    const both = built(build({ alsoRaised: ALSO_RAISED, answersNote: "ANSWERS_FILLED" }));
    expect(toStoryPromptMaterial(both.material, null).map((entry) => entry.name))
      .toEqual([...CORE_FIELDS, "also_raised", "answers_note"]);
    expect(fieldOf(both, "answers_note")).toBe(STORY_ANSWERS_NOTE_ANSWERS_FILLED);
    const alone = built(build({ answersNote: "MAP_UNAVAILABLE" }));
    expect(toStoryPromptMaterial(alone.material, null).map((entry) => entry.name)).toEqual([...CORE_FIELDS, "answers_note"]);
    expect(fieldOf(alone, "answers_note")).toBe(STORY_ANSWERS_NOTE_MAP_UNAVAILABLE);
    // The checker reads the same material.
    const checker = toCheckerPromptMaterial(both.material, story()).map((entry) => entry.name);
    expect(checker.indexOf("answers_note")).toBe(checker.indexOf("also_raised") + 1);
    expect(checker.indexOf("answers_note")).toBeLessThan(checker.indexOf("candidate_story"));
    // The field name is code's word; the sentences hold none of the material's codes, and a story may say them.
    expect(STORY_ENGINE_TOKENS).toContain("answers_note");
    for (const sentence of [STORY_ANSWERS_NOTE_MAP_UNAVAILABLE, STORY_ANSWERS_NOTE_ANSWERS_FILLED]) {
      expect(STORY_ENGINE_TOKENS.filter((token) => sentence.includes(token))).toEqual([]);
      expect(sentence).not.toMatch(/[0-9]/u);
      const body = story();
      body.long.sections[1]!.paragraphs[0]!.text = sentence;
      expect(classifyStoryContent(JSON.stringify(body), alone.index)).toEqual({ parseStatus: "PARSED", parseError: null });
    }
  });

  it("keeps answers_note in the debate's own material: never dropped, its bytes counted, also_raised fills what is left", () => {
    const plain = built(build({}, 10_000_000));
    const noted = built(build({ answersNote: "ANSWERS_FILLED" }, 10_000_000));
    expect(noted.compressionStep).toBe(plain.compressionStep);
    expect(noted.material.bytes)
      .toBe(plain.material.bytes + Buffer.byteLength(JSON.stringify(STORY_ANSWERS_NOTE_ANSWERS_FILLED), "utf8"));
    // Exactly the noted debate's size: the note stays, the also-raised points find no room.
    const tight = built(build({ answersNote: "ANSWERS_FILLED", alsoRaised: ALSO_RAISED }, noted.material.bytes));
    expect(tight.compressionStep).toBe(0);
    expect(tight.material.answersNote).toBe(STORY_ANSWERS_NOTE_ANSWERS_FILLED);
    expect("alsoRaised" in tight.material).toBe(false);
    // The recorded size is always the sum of the fields the models read.
    const both = built(build({ alsoRaised: ALSO_RAISED, answersNote: "MAP_UNAVAILABLE" }));
    expect(both.material.bytes).toBe(toStoryPromptMaterial(both.material, null)
      .reduce((total, entry) => total + Buffer.byteLength(entry.content, "utf8"), 0));
  });
});
