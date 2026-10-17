import { describe, expect, it } from "vitest";
import { buildFramedPrompt, type FramedMaterialField, type PromptContract, type PromptPacket } from "@debateai/providers";
import {
  buildStoryCheckerContract,
  buildStoryRevisionPrompt,
  buildStorytellerContract,
  loadStoryPack,
  parseCheckerVerdict,
  resolveStoryPackDir
} from "@debateai/story";
import {
  STUB_STORY_CHECKER_SATISFIED,
  STUB_STORY_CHECKER_V4_SATISFIED,
  classifyGateRequest,
  stubStoryCheckerFor,
  stubStoryFor
} from "../support/preview-gate-stubs.js";

/**
 * Story v4 (engine redesign R1d, absorbing LG-D Task 6): the scripted gates answer a v4 story call as a story call, in
 * the v4 form (no shape_id from the storyteller; misleading on the checker's verdict), and every v3 answer keeps its
 * bytes.
 */
const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const V4 = Object.freeze({ shapeId: "general" });
const MATERIAL: readonly FramedMaterialField[] = [
  { name: "question", content: JSON.stringify("Should we?") },
  { name: "positions", content: JSON.stringify([{ id: "P1" }, { id: "P2" }]) }
];
const chatOf = (packet: PromptPacket): string => JSON.stringify({ messages: packet.messages });
const framedChat = (contract: PromptContract): string => chatOf(buildFramedPrompt({ contract, material: MATERIAL }).packet);

describe("the scripted gates route and answer story contracts v4 (R1d)", () => {
  it.each([null, V4])("v4 %o: the storyteller and the checker are story calls", (v4) => {
    expect(classifyGateRequest(framedChat(buildStorytellerContract(PACK, false, v4)))).toBe("STORYTELLER");
    expect(classifyGateRequest(framedChat(buildStoryCheckerContract(PACK, false, v4)))).toBe("STORY_CHECKER");
  });

  it("a v4 round-2 revision request (own draft as the model's turn, one revision block) is a storyteller call", () => {
    const contract = buildStorytellerContract(PACK, false, V4);
    const ownDraft = stubStoryFor(framedChat(contract), "general");
    const revision = buildStoryRevisionPrompt({ contract, material: MATERIAL, ownDraft, problems: "The headline overstates it." });
    expect(classifyGateRequest(chatOf(revision.packet))).toBe("STORYTELLER");
  });

  it("a v4 checker is answered in the v4 form: it parses under the v4 schema, misleading false", () => {
    const content = stubStoryCheckerFor(framedChat(buildStoryCheckerContract(PACK, false, V4)));
    expect(content).toBe(STUB_STORY_CHECKER_V4_SATISFIED);
    expect(parseCheckerVerdict(content, undefined, true)).toMatchObject({ satisfied: true, misleading: false, objection: null });
  });

  it("a v3 checker keeps today's reply, byte for byte", () => {
    const content = stubStoryCheckerFor(framedChat(buildStoryCheckerContract(PACK)));
    expect(content).toBe(STUB_STORY_CHECKER_SATISFIED);
    expect(content).toBe(JSON.stringify({ satisfied: true, objection: null, criteria: {
      faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
      citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
    } }));
    expect(parseCheckerVerdict(content)).toMatchObject({ satisfied: true, objection: null });
  });

  it("a v4 storyteller is answered without shape_id, long last; a v3 storyteller keeps today's members and order", () => {
    const v4 = JSON.parse(stubStoryFor(framedChat(buildStorytellerContract(PACK, false, V4)), "general")) as Record<string, unknown>;
    expect(Object.keys(v4)).toEqual(["short", "why", "reviewer_note", "long"]);
    const v3 = JSON.parse(stubStoryFor(framedChat(buildStorytellerContract(PACK)), "general")) as Record<string, unknown>;
    expect(Object.keys(v3)).toEqual(["shape_id", "short", "why", "long", "reviewer_note"]);
    expect(v3.shape_id).toBe("general");
    // The same story otherwise: one path per handed position.
    expect({ ...v4, shape_id: "general" }).toEqual(v3);
    expect((v4.short as { paths: unknown[] }).paths).toHaveLength(2);
  });
});
