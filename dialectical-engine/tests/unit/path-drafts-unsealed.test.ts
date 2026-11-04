// tests/unit/path-drafts-unsealed.test.ts
// V4 start step, Task 52 (spec 2026-11-03 §4.3): the shared registries know the path steps. The nine drafts of the path steps (the
// gap round after Start 1, the path root writer 4, each path's answer so far 2, story v5 2) await the owners' wording, so none is
// sealed and the engine seal is the one pinned before them (Task 92 seals them); the practice's report names the answer so far by a
// family of its own and the gap round by a map step of its own; the thinking table runs the answer so far at the dig rewrite's two
// steps; and the preview keeps story v5's one safe repair try, each contract on its own site only. Data is made up.
import { describe, expect, it } from "vitest";
import { JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, PATH_ROOT_DRAFT_CONTRACTS } from "@debateai/judgement";
import { PATH_GAP_DRAFT_CONTRACTS } from "@debateai/map";
import {
  PREVIEW_STORY_REPAIR_CONTRACT_IDS, buildFramedPrompt, buildFramedRepairPrompt, parsePreviewProviderTestConfig, previewThinkingStepOf,
  schemaFailureLocator, withPreviewProviderCallPolicy, type ProviderCallRequest, type ProviderCallResult
} from "@debateai/providers";
import {
  PATH_FINAL_DRAFT_CONTRACTS, PATH_OUTCOME_DRAFT_CONTRACTS, STORY_PATHS_CHECK_CONTRACT_ID, STORY_PATHS_CONTRACT_ID, pathOutcomeCallSiteKey,
  type PathOutcomeSite
} from "@debateai/story";
import { engineContractHash, engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";
import {
  PRACTICE_MAP_STEPS, callFamilyOf, practiceMapStepOf, practiceStepOf, recheckReply
} from "../../tools/preview-practice/practice-lanes.js";
import { practiceShapeBlock, practiceShapeLines } from "../../tools/preview-practice/practice-shape.js";

const IDS = ["map.gap-paths.v1", "judge.path-root.unknown.v1", "judge.path-root.resolved.v1", "judge.path-root.unknown.sources.v1",
  "judge.path-root.resolved.sources.v1", "path.outcome.v1", "path.outcome-check.v1", "story.paths.v5", "story.paths-check.v5"];
/** tests/unit/engine-contract-hash.test.ts's ENGINE_CONTRACT_HASH_SEALED: the engine seal as it stands until Task 92 seals the drafts. */
const ENGINE_CONTRACT_HASH_SEALED = "24b33806d0e18b665bb530aa6a01e3e4c2af479b0004762cbdaefd237f70ada3";
const DRAFT_GROUPS = [PATH_GAP_DRAFT_CONTRACTS, PATH_ROOT_DRAFT_CONTRACTS, PATH_OUTCOME_DRAFT_CONTRACTS, PATH_FINAL_DRAFT_CONTRACTS];
const DRAFTS = DRAFT_GROUPS.flat();
/** Every answer-so-far call site: paths 1 to 8, the writer and the checker, rounds 1 and 2. */
const OUTCOME_KEYS = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((pathNo) => ([1, 2] as const).flatMap((round) =>
  (["WRITER", "CHECKER"] as const satisfies readonly PathOutcomeSite[]).map((site) => pathOutcomeCallSiteKey(site, pathNo, round))));

describe("the path steps' nine drafts", () => {
  it("are 1 + 4 + 2 + 2, and none is sealed: the engine seal is the one pinned before them", () => {
    expect(DRAFT_GROUPS.map((group) => group.length)).toEqual([1, 4, 2, 2]);
    expect(DRAFTS.map((contract) => contract.contractId)).toEqual(IDS);
    const sealed = new Set(engineSealedContracts().map((contract) => contract.contractId));
    expect(IDS.filter((id) => sealed.has(id))).toEqual([]);
    for (const id of IDS) expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, id).not.toContain(id);
    expect(engineContractHash()).toBe(ENGINE_CONTRACT_HASH_SEALED);
    // Not vacuous: sealing the drafts would move the pin.
    expect(engineContractHash([...engineSealedContracts(), ...DRAFTS])).not.toBe(ENGINE_CONTRACT_HASH_SEALED);
  });
});

describe("the practice's report", () => {
  it("names a path's answer so far by its own family, at its own step", () => {
    expect(OUTCOME_KEYS).toHaveLength(32);
    expect(callFamilyOf("PATH_OUTCOME:WRITER:2:1")).toBe("PATH_OUTCOME");
    for (const key of OUTCOME_KEYS) {
      expect(callFamilyOf(key), key).toBe("PATH_OUTCOME");
      expect(practiceStepOf(key), key).toBe("path_outcome");
    }
    // A try that repairs one is the repair's, as every step's.
    expect(callFamilyOf("REPAIR:STRUCTURE:PATH_OUTCOME:CHECKER:3:2")).toBe("STRUCTURE_REPAIR");
  });

  it("re-checks a stored answer so far by its own form: the writer's and the checker's", () => {
    const draft = JSON.stringify({ line: "The second pier helps at rush hour.", summary: "The queues at rush hour are real.", fate: "PARTLY_HELD",
      what_changed: [{ text: "The arguing showed that winter ridership falls.", rests_on: ["P1"] }], view: null });
    const satisfied = JSON.stringify({ satisfied: true, problem: null, part: null });
    expect(recheckReply("PATH_OUTCOME:WRITER:2:1", draft)).toEqual({ family: "PATH_OUTCOME", issues: [] });
    expect(recheckReply("PATH_OUTCOME:CHECKER:3:2", satisfied)).toEqual({ family: "PATH_OUTCOME", issues: [] });
    // Each is read by its own form, never the other's, and a repair try by the form of the step it repairs.
    expect(recheckReply("PATH_OUTCOME:WRITER:2:1", satisfied).issues).not.toEqual([]);
    expect(recheckReply("PATH_OUTCOME:CHECKER:3:2", draft).issues).not.toEqual([]);
    expect(recheckReply("REPAIR:STRUCTURE:PATH_OUTCOME:WRITER:2:1", draft)).toEqual({ family: "STRUCTURE_REPAIR", issues: [] });
    for (const key of ["PATH_OUTCOME:WRITER:2:1", "PATH_OUTCOME:CHECKER:3:2"]) {
      const refused = recheckReply(key, "{\"nothing\":1}").issues;
      expect(refused.length, key).toBeGreaterThan(0);
      expect(refused, key).not.toContain("UNMAPPED");
    }
  });

  it("names the gap round after Start as a map step of its own, right after the debate's gap", () => {
    expect(PRACTICE_MAP_STEPS).toEqual(["angles", "list", "merge", "gap", "gap-paths", "choose", "check"]);
    expect(practiceMapStepOf("MAP:gap-paths:1")).toBe("gap-paths");
    expect(practiceMapStepOf("MAP:gap-paths:2")).toBe("gap-paths");
    expect(practiceMapStepOf("MAP:gap:1")).toBe("gap");
    expect(callFamilyOf("MAP:gap-paths:1")).toBe("MAP");
    const gap = JSON.stringify({ points: [{ text: "Nobody has asked what the pier costs to run in its first winter.", path: "b1" },
      { text: "Nobody has asked who pays if the works run late.", path: null }] });
    expect(recheckReply("MAP:gap-paths:1", gap)).toEqual({ family: "MAP", issues: [] });
    const refused = recheckReply("MAP:gap-paths:1", "{\"nothing\":1}").issues;
    expect(refused.length).toBeGreaterThan(0);
    expect(refused).not.toContain("UNMAPPED");
    // The debate's own gap round is read by its own form, as before: the gap round after Start's reply is not its form.
    expect(recheckReply("MAP:gap:1", gap).issues).not.toEqual([]);
  });

  it("counts the gap round after Start's calls under their own step in the shape block, apart from the debate's gap", () => {
    const block = practiceShapeBlock({ source: "FLAG", registerVersion: "6", row: "ADDED", asked: {},
      facts: { storedDepthParams: null, sizes: null, marks: {}, choice: null, mapCallSiteKeys: ["MAP:gap:1", "MAP:gap-paths:1", "MAP:gap-paths:2"],
        answerCheckCodes: null, checkPremiseExempt: null, assumptionsPerAnswer: null } });
    expect(block.mapCallsByStep).toEqual({ angles: 0, list: 0, merge: 0, gap: 1, "gap-paths": 2, choose: 0, check: 0 });
    expect(practiceShapeLines(block)).toContain("- map calls (every try, as the ledger recorded them): angles 0, list 0, merge 0, gap 1, gap-paths 2, "
      + "choose 0, check 0");
  });
});

describe("the thinking table", () => {
  it("runs a path's answer so far at the dig rewrite's writer and checker steps", () => {
    expect(previewThinkingStepOf({ callSiteKey: "PATH_OUTCOME:CHECKER:3:2", lane: "served" })).toBe("path_rewrite_checker");
    expect(previewThinkingStepOf({ callSiteKey: "PATH_OUTCOME:WRITER:2:1", lane: "served" })).toBe("path_rewrite_writer");
    for (const key of OUTCOME_KEYS) {
      expect(previewThinkingStepOf({ callSiteKey: key, lane: "served" }), key).toBe(key.includes(":WRITER:") ? "path_rewrite_writer" : "path_rewrite_checker");
    }
    // Only the step's own keys: no path 9, no round 3.
    expect(previewThinkingStepOf({ callSiteKey: "PATH_OUTCOME:WRITER:9:1", lane: "served" })).toBeNull();
    expect(previewThinkingStepOf({ callSiteKey: "PATH_OUTCOME:CHECKER:1:3", lane: "served" })).toBeNull();
    // A repair inside one runs at slip_fix, as every repair does.
    expect(previewThinkingStepOf({ callSiteKey: "REPAIR:STRUCTURE:PATH_OUTCOME:WRITER:1:1", lane: "served" })).toBe("slip_fix");
    // The gap round after Start is a map call: the opening's step, as every map call's.
    expect(previewThinkingStepOf({ callSiteKey: "MAP:gap-paths:1" })).toBe("opening");
  });
});

const MODEL = "zai-org/GLM-5.3-Flash";
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "path-drafts-fixture"
}))!;
const RESULT: ProviderCallResult = {
  content: "{}", rawArtifactRef: "artifact:fixture", ledgerEntryRef: "ledger:fixture",
  provider: "openai-compatible-http", model: MODEL, maker: "Z.AI", modelVersion: MODEL
};
/** A story request framed under `contractId`, on the storyteller's site or the checker's, as the story writer sends them. */
function storyRequest(contractId: string, site: "STORYTELLER" | "CHECKER"): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId, instruction: "Write the made-up path story.", answerForm: "Return one JSON object." },
    material: [{ name: "paths", content: "Two made-up paths." }]
  });
  return {
    runId: "run:synthetic", subjectItemId: "story:synthetic", callSiteKey: `STORY:${site}:1`,
    role: site === "STORYTELLER" ? "SYNTHESIZER" : "EVALUATOR", lane: "story", bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 },
    contractHash: "contract:synthetic-story", providerRef: "preview:fixture-a", packet: framed.packet,
    preferredResponseFormat: "json_object",
    classifyContent: () => ({ parseStatus: "PARSED", parseError: null }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
  };
}
async function attemptsThisCall(request: ProviderCallRequest): Promise<number | undefined> {
  let received: ProviderCallRequest | undefined;
  await withPreviewProviderCallPolicy({ call: async (effective) => { received = effective; return RESULT; } }, CONFIG, { model: MODEL }).call(request);
  if (received === undefined) throw new Error("PREVIEW_REQUEST_NOT_FORWARDED");
  return received.maxAttemptsThisCall;
}

describe("the preview's one safe repair try on story v5", () => {
  it("lists both story v5 contracts", () => {
    expect(PREVIEW_STORY_REPAIR_CONTRACT_IDS).toEqual(expect.arrayContaining([STORY_PATHS_CONTRACT_ID, STORY_PATHS_CHECK_CONTRACT_ID]));
  });

  it("keeps the try for each v5 contract on its own site only", async () => {
    expect(await attemptsThisCall(storyRequest(STORY_PATHS_CONTRACT_ID, "STORYTELLER"))).toBe(2);
    expect(await attemptsThisCall(storyRequest(STORY_PATHS_CONTRACT_ID, "CHECKER"))).toBe(1);
    expect(await attemptsThisCall(storyRequest(STORY_PATHS_CHECK_CONTRACT_ID, "CHECKER"))).toBe(2);
    expect(await attemptsThisCall(storyRequest(STORY_PATHS_CHECK_CONTRACT_ID, "STORYTELLER"))).toBe(1);
    // A version not on the list keeps none: the prefix alone is not enough.
    expect(await attemptsThisCall(storyRequest("story.paths.v6", "STORYTELLER"))).toBe(1);
    expect(await attemptsThisCall(storyRequest("story.paths-check.v6", "CHECKER"))).toBe(1);
  });
});
