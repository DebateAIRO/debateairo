import { describe, expect, it } from "vitest";
import type { StoryBody } from "@debateai/contract";
import {
  buildFramedPrompt, readPromptFrame, splitCacheablePrefix, type FramedMaterialField, type PromptContract
} from "@debateai/providers";
import { buildStoryRevisionPrompt, storyDraftText } from "@debateai/story";

/**
 * Story v4 round 2 (R1d, spec §7.2 item 8, design decision 3): a fresh call (a fresh fence) with round 1's material
 * unchanged and no prior_objection; the accepted round-1 draft as the model's own turn; the checker's problems only in
 * one fenced revision block. The contract here is synthetic: the v4 storyteller's own (Task 10) carries the revision
 * sentence in its answer form, which this builder never touches.
 */
const CONTRACT: PromptContract = Object.freeze({
  contractId: "story.storyteller.v4", instruction: "Tell the story of the debate.", answerForm: "Return one JSON object."
});
const MATERIAL: readonly FramedMaterialField[] = Object.freeze([
  { name: "question", content: JSON.stringify("Should the city fund the tram extension?") },
  { name: "positions", content: JSON.stringify([{ id: "P1", place: 1, claim: "Fund it.", won: true }]) },
  { name: "points", content: "[]" },
  { name: "question_language", content: "English" }
]);
const PROBLEMS = "The summary presents the disputed fare model (P3) as settled.";

function draft(): StoryBody {
  return {
    shape_id: "general",
    short: {
      headline: "The debate backs funding the extension.",
      summary: "Our reading of your question: whether the extension is worth its cost.",
      confidence: "Fairly sure, if ridership holds.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Fund it: the savings argument held up.", node_refs: ["P1"] }],
      change: { text: "A ridership count would change it.", node_refs: [] }
    },
    why: { reasons: [{ text: "The fare model was published (P3).", node_refs: ["P1"] }] },
    reviewer_note: null,
    long: { sections: [1, 2, 3].map((index) => ({ title: `Section ${String(index)}`, paragraphs: [{ text: "A paragraph.", node_refs: [] }] })) }
  };
}

const unfenced = (text: string, fence: string): string => text.split(fence).join("<fence>");

describe("story v4 round 2 — the revision request", () => {
  it("writes the draft as the model's own answer: short, why, reviewer_note, long, in that order, no shape_id", () => {
    const text = storyDraftText(draft());
    expect(Object.keys(JSON.parse(text) as object)).toEqual(["short", "why", "reviewer_note", "long"]);
    expect(text).not.toContain("shape_id");
    expect(text).toBe(JSON.stringify({ short: draft().short, why: draft().why, reviewer_note: null, long: draft().long }));
  });

  it("sends round 1's material fields byte for byte apart from a fresh fence, and no prior_objection", () => {
    const round1 = buildFramedPrompt({ contract: CONTRACT, material: MATERIAL });
    const revision = buildStoryRevisionPrompt({ contract: CONTRACT, material: MATERIAL, ownDraft: storyDraftText(draft()), problems: PROBLEMS });
    expect(revision.framed.fence).not.toBe(round1.fence);
    expect(revision.framed.material).toEqual(round1.material);
    expect(unfenced(revision.packet.messages[1]!.content, revision.framed.fence)).toBe(unfenced(round1.packet.messages[1]!.content, round1.fence));
    // The system message differs only in its per-call tail (the fence and the canary): its cacheable prefix is the same.
    expect(splitCacheablePrefix(revision.packet.messages[0]!.content)!.prefix).toBe(splitCacheablePrefix(round1.packet.messages[0]!.content)!.prefix);
    expect(revision.packet.messages.slice(0, 2)).toEqual(revision.framed.packet.messages);
    expect(readPromptFrame(revision.packet).fields.map((entry) => entry.name)).toEqual([
      ...MATERIAL.map((entry) => entry.name), "revision_problems", "machine_reply_form"
    ]);
    expect(readPromptFrame(revision.packet).fields.some((entry) => entry.name === "prior_objection")).toBe(false);
  });

  it("puts the draft only in the assistant turn, never inside a user block or the system message", () => {
    const ownDraft = storyDraftText(draft());
    const { packet } = buildStoryRevisionPrompt({ contract: CONTRACT, material: MATERIAL, ownDraft, problems: PROBLEMS });
    expect(packet.messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(packet.messages[2]!.content).toBe(ownDraft);
    for (const at of [0, 1, 3]) expect(packet.messages[at]!.content).not.toContain("The debate backs funding the extension.");
  });

  it("carries the problems only in revision_problems", () => {
    const { packet } = buildStoryRevisionPrompt({ contract: CONTRACT, material: MATERIAL, ownDraft: storyDraftText(draft()), problems: PROBLEMS });
    const fields = readPromptFrame(packet).fields;
    expect(fields.filter((entry) => entry.content.includes(PROBLEMS)).map((entry) => entry.name)).toEqual(["revision_problems"]);
    expect(fields.slice(-2)).toEqual([{ name: "revision_problems", content: PROBLEMS }, { name: "machine_reply_form", content: "REVISION" }]);
    for (const at of [0, 1, 2]) expect(packet.messages[at]!.content).not.toContain(PROBLEMS);
  });

  it("re-asks under the same fence with the refusal's code and path, never the rejected words", () => {
    const revision = buildStoryRevisionPrompt({ contract: CONTRACT, material: MATERIAL, ownDraft: storyDraftText(draft()), problems: PROBLEMS });
    const repair = revision.buildRepairPacket({
      rawText: "{\"short\": \"leaked words\"}", parseStatus: "SCHEMA_FAILED",
      parseError: JSON.stringify([{ code: "custom", path: ["short", "summary"], message: "STORY_TEXT_SCORE_VALUE" }])
    });
    expect(repair.messages.slice(0, 3)).toEqual(revision.packet.messages.slice(0, 3));
    expect(readPromptFrame(repair).fence).toBe(revision.framed.fence);
    expect(readPromptFrame(repair).fields.slice(-4)).toEqual([
      { name: "revision_problems", content: PROBLEMS },
      { name: "machine_rejection_code", content: "SCHEMA_FAILED" },
      { name: "machine_rejection_path", content: "short.summary" },
      { name: "machine_reply_form", content: "REVISION" }
    ]);
    expect(JSON.stringify(repair)).not.toContain("leaked words");
  });

  it("mints a fresh fence on every call", () => {
    const input = { contract: CONTRACT, material: MATERIAL, ownDraft: storyDraftText(draft()), problems: PROBLEMS };
    expect(buildStoryRevisionPrompt(input).framed.fence).not.toBe(buildStoryRevisionPrompt(input).framed.fence);
  });
});
