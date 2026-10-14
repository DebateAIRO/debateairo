import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { StoryBody, StoryVerdictBasis } from "@debateai/contract";
import { buildFramedPrompt } from "@debateai/providers";
import {
  buildStoryCheckerContract,
  buildStoryMaterial,
  buildStorytellerContract,
  loadStoryPack,
  resolveStoryPackDir,
  storyContractHash,
  storyContractInArgumentLanguage,
  storyMaterialHasMapFields,
  toCheckerPromptMaterial,
  toStoryPromptMaterial,
  type StoryMaterial,
  type StoryRunSnapshot,
  type StorySnapshotNode
} from "@debateai/story";

/**
 * Whole-branch review I-1, ruling W-STORY: with no map field in the material (every story while the debate shape is
 * off), the storyteller's and the checker's requests are byte for byte what origin/dev sends for the same material.
 * The pack's also_raised / answers_note passages live in their own files (common-map.md, checker-map.md) and ride
 * only with a material that sends one of those fields.
 *
 * The baseline below was measured at origin/dev 7f0f8ede9 by running THIS file's computation (`requestsFor`, copied
 * into a scratch script) against origin/dev's packages/story/src and story-shapes/ (extracted with `git archive`),
 * with the providers frame of this branch (whose only change to the frame is a refactor of the reserved-token check
 * into `promptTextHasReservedToken`). Re-measure only for a deliberate change to today's story requests, never to
 * make a debate-shape change pass. Before this fix the same computation on this branch gave 219,822 bytes
 * (sha 499913f0...), the extra ~1.6 KB storyteller and ~0.7 KB checker text the review measured.
 */
const ORIGIN_DEV_NO_MAP_REQUESTS = Object.freeze({
  sha256: "28d95204602692f41088cde2a519d943517dd31ce90ff78bb05a3d466846058c",
  bytes: 211_910,
  // storyteller, checker (no language on record); storyteller, checker (Romanian)
  contractHashes: [
    "162d69075ca9b8cb49690810ca3a487ff6e4ecc499a89500f554f6c379f145c4",
    "fc6186d6bd9434241be3ac5d09c810e6d8af0ff9a329f79fdd99defbe42d7c52",
    "c6edc419e84681842ac1f8efb63d4b746f1b570d4dc5df27db2f7bd2619ae63b",
    "c8ef1cee9836f1cdd4c57d6c0ae82adb0ced360a93b8d00058590b2dd54f6159"
  ]
});

const pack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));

const BASIS: StoryVerdictBasis = {
  label: "CONTESTED", rung: 4, trigger: "MID_BAND", winner_node_id: "position:a", winner_strength: 0.612345,
  runner_up_node_id: "position:b", runner_up_strength: 0.4, margin: 0.212345, disagreement: 0.08,
  thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 }, confidence_band: "MEDIUM", marks: []
};
const node = (overrides: Partial<StorySnapshotNode> & { readonly nodeId: string }): StorySnapshotNode => ({
  claim: `The claim of ${overrides.nodeId}.`, isPosition: false, wayOfKnowing: "REASONING", baseScore: 0.5, finalStrength: 0.45,
  excludedReason: null, authorModel: "model:alpha", panelDispersion: 0.1, criticSummary: null, ...overrides
});
const SNAPSHOT: StoryRunSnapshot = {
  runId: "run:bytes", workItemId: "work:bytes", answerId: "answer:bytes", answerVersion: 1,
  questionLine: "Should the city fund the tram extension?", argumentLanguage: { tag: "en", name: "English" },
  compositionBudgetTier: "low", verdictBasis: BASIS, servedStatement: ["The debate leans towards funding the extension."],
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
  setAside: []
};
const CANDIDATE: StoryBody = {
  shape_id: "general",
  short: {
    headline: "The debate leans one way.", summary: "Our reading of your question.", confidence: "Fairly sure, if the count holds.",
    paths: ["P1", "P2"].map((ref) => ({ position_ref: ref, fate: "PARTLY_HELD" as const, line: "This position partly held.", node_refs: [ref] })),
    change: { text: "A count would change it.", node_refs: [] }
  },
  why: { reasons: [{ text: "One reason decided it.", node_refs: [] }] },
  long: { sections: [1, 2, 3].map((index) => ({ title: `Section ${String(index)}`, paragraphs: [{ text: "A paragraph.", node_refs: [] }] })) },
  reviewer_note: null
};
/** The frame's per-call fence and canary come from these bytes; fixed, so the packets are comparable. */
const fixedBytes = (size: number): Buffer => Buffer.alloc(size, 0x5a);

function materialOf(snapshot: StoryRunSnapshot): StoryMaterial {
  const built = buildStoryMaterial({
    snapshot, enrichment: new Map(), budgetBytes: 40_000, shapeIds: new Set(pack.shapes.map((shape) => shape.id))
  });
  if (built.kind !== "OK") throw new Error(built.kind);
  return built.material;
}

/** Round 1 and round 2 of the storyteller and one checker call, with no language and in Romanian, as the writer builds them. */
function requestsFor(material: StoryMaterial): { readonly sha256: string; readonly bytes: number; readonly contractHashes: readonly string[] } {
  const mapFields = storyMaterialHasMapFields(material);
  const packets: unknown[] = [];
  const contractHashes: string[] = [];
  for (const language of [null, "Romanian"]) {
    const storyteller = storyContractInArgumentLanguage(buildStorytellerContract(pack, mapFields), language);
    const checker = storyContractInArgumentLanguage(buildStoryCheckerContract(pack, mapFields), language);
    contractHashes.push(storyContractHash(storyteller), storyContractHash(checker));
    for (const prior of [null, "The summary overstates the result; see P2."]) {
      packets.push(buildFramedPrompt({ contract: storyteller, material: toStoryPromptMaterial(material, prior), randomBytes: fixedBytes }).packet);
    }
    packets.push(buildFramedPrompt({ contract: checker, material: toCheckerPromptMaterial(material, CANDIDATE), randomBytes: fixedBytes }).packet);
  }
  const text = JSON.stringify(packets);
  return { sha256: createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text, "utf8"), contractHashes };
}

describe("debate shape — a story without a map sends origin/dev's requests (ruling W-STORY)", () => {
  it("sends the storyteller and checker requests origin/dev sends, byte for byte, when no map field is in the material", () => {
    const material = materialOf(SNAPSHOT);
    expect(storyMaterialHasMapFields(material)).toBe(false);
    expect(requestsFor(material)).toEqual(ORIGIN_DEV_NO_MAP_REQUESTS);
  });

  it("an empty also-raised list is no map field: still origin/dev's requests", () => {
    const material = materialOf({ ...SNAPSHOT, alsoRaised: [] });
    expect(storyMaterialHasMapFields(material)).toBe(false);
    expect(requestsFor(material)).toEqual(ORIGIN_DEV_NO_MAP_REQUESTS);
  });

  it.each([
    ["also_raised", { alsoRaised: [{ claim: "Bus routes could be cut once the tram runs.", raisedBy: 2 }] }],
    ["answers_note", { answersNote: "MAP_UNAVAILABLE" as const }]
  ] as const)("a story whose material sends %s carries the pack's map passages to both prompts", (_name, extra) => {
    const material = materialOf({ ...SNAPSHOT, ...extra });
    expect(storyMaterialHasMapFields(material)).toBe(true);
    const storyteller = buildStorytellerContract(pack, true).instruction;
    const checker = buildStoryCheckerContract(pack, true).instruction;
    expect(storyteller).toContain(pack.commonMap);
    expect(storyteller).toContain("## Also raised, not debated");
    expect(storyteller).toContain("## The answers note");
    // The map passages follow common.md and come before the menu of shapes.
    expect(storyteller.indexOf(pack.commonMap)).toBeGreaterThan(storyteller.indexOf(pack.common));
    expect(storyteller.indexOf(pack.commonMap)).toBeLessThan(storyteller.indexOf("## The shapes"));
    expect(checker).toBe(`${pack.checker}\n\n${pack.checkerMap}`);
    expect(checker).toContain("a story that states one is not faithful_to_material");
    const requests = requestsFor(material);
    expect(requests.sha256).not.toBe(ORIGIN_DEV_NO_MAP_REQUESTS.sha256);
    for (const hash of requests.contractHashes) expect(ORIGIN_DEV_NO_MAP_REQUESTS.contractHashes).not.toContain(hash);
  });

  it("without a map field neither prompt names also_raised or answers_note", () => {
    for (const instruction of [buildStorytellerContract(pack).instruction, buildStoryCheckerContract(pack).instruction]) {
      expect(instruction).not.toContain("also_raised");
      expect(instruction).not.toContain("answers_note");
    }
  });
});
