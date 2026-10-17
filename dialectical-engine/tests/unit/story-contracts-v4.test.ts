import { describe, expect, it } from "vitest";
import { StoryBodySchema, StoryPathSchema, StoryParagraphSchema } from "@debateai/contract";
import { lengthGuidanceText } from "@debateai/kernel";
import { assertFramedPrompt, buildFramedPrompt, type FramedMaterialField, type PromptContract } from "@debateai/providers";
import { lengthGuidancePolicyStartValues, resolveLengthGuidance } from "@debateai/register";
import {
  STORYTELLER_ANSWER_FORM,
  STORYTELLER_CONTRACT_ID,
  STORYTELLER_V4_ANSWER_FORM,
  STORYTELLER_V4_CONTRACT_ID,
  STORY_CHECKER_ANSWER_FORM,
  STORY_CHECKER_CONTRACT_ID,
  STORY_CHECKER_V4_ANSWER_FORM,
  STORY_CHECKER_V4_CONTRACT_ID,
  STORY_REVISION_FOLLOW_UP,
  StoryCheckerVerdictSchema,
  assembleStoryCheckerInstruction,
  assembleStorytellerInstruction,
  buildStoryCheckerContract,
  buildStorytellerContract,
  loadStoryPack,
  resolveStoryPackDir,
  storyCheckerLengthField,
  storyLengthField
} from "@debateai/story";

/**
 * Story v4 (engine redesign spec 2026-10-15 §7.2 items 2, 3, 7, 8; INTERFACE §5.2-§5.5; absorbs LG-D Task 2): the v4
 * story contracts. The byte pins live in prompt-text-pins.test.ts; this file proves the forms say what the parsers
 * enforce, that v3 is untouched unless v4 is asked for, and that the `length` field names each target in words
 * (characters for zh, ja and th).
 */

const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const V4 = Object.freeze({ shapeId: "general" });
const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "premium", answerLength: "standard" });

/** The one line of a form that holds the empty template. */
function templateLine(form: string): string {
  const line = form.split("\n").find((candidate) => candidate.startsWith("{\"short\""));
  if (line === undefined) throw new Error("TEMPLATE_LINE_ABSENT");
  return line;
}

/** The template with every empty text filled with three words, each fate and reference made real, and 3 sections. */
function filledTemplate(template: unknown): unknown {
  const walk = (value: unknown, key: string | null): unknown => {
    if (value === "") {
      if (key === "fate") return "HELD_UP";
      if (key === "position_ref") return "P1";
      return "Three plain words";
    }
    if (Array.isArray(value)) return value.map((entry) => walk(entry, null));
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([member, entry]) => [member, walk(entry, member)]));
    }
    return value;
  };
  const story = walk(template, null) as { long: { sections: unknown[] } };
  return { ...story, long: { sections: [0, 1, 2].map(() => story.long.sections[0]) } };
}

const keys = (value: unknown): string[] => Object.keys(value as Record<string, unknown>).sort();
const schemaKeys = (shape: Record<string, unknown>): string[] => Object.keys(shape).sort();

describe("story contracts v4 (engine redesign R1d, absorbing LG-D)", () => {
  it("builds today's v3 contracts unless v4 is asked for", () => {
    for (const mapFields of [false, true]) {
      for (const contract of [buildStorytellerContract(PACK, mapFields), buildStorytellerContract(PACK, mapFields, null)]) {
        expect(contract).toEqual({
          contractId: STORYTELLER_CONTRACT_ID,
          instruction: assembleStorytellerInstruction(PACK, mapFields),
          answerForm: STORYTELLER_ANSWER_FORM
        });
      }
      for (const contract of [buildStoryCheckerContract(PACK, mapFields), buildStoryCheckerContract(PACK, mapFields, null)]) {
        expect(contract).toEqual({
          contractId: STORY_CHECKER_CONTRACT_ID,
          instruction: assembleStoryCheckerInstruction(PACK, mapFields),
          answerForm: STORY_CHECKER_ANSWER_FORM
        });
      }
    }
  });

  it("v4: the v4 ids, the pack's v4 passages and the one shape, the v4 forms, and the door accepts both", () => {
    for (const shape of PACK.shapes) {
      for (const mapFields of [false, true]) {
        const v4 = { shapeId: shape.id };
        const teller = buildStorytellerContract(PACK, mapFields, v4);
        const checker = buildStoryCheckerContract(PACK, mapFields, v4);
        expect(teller).toEqual({ contractId: STORYTELLER_V4_CONTRACT_ID,
          instruction: assembleStorytellerInstruction(PACK, mapFields, v4), answerForm: STORYTELLER_V4_ANSWER_FORM });
        expect(checker).toEqual({ contractId: STORY_CHECKER_V4_CONTRACT_ID,
          instruction: assembleStoryCheckerInstruction(PACK, mapFields, v4), answerForm: STORY_CHECKER_V4_ANSWER_FORM });
        for (const contract of [teller, checker]) {
          const framed = buildFramedPrompt({ contract, material: [{ name: "question", content: JSON.stringify("Should we?") }] });
          expect(assertFramedPrompt(framed.packet).contractId).toBe(contract.contractId);
        }
      }
    }
  });

  it("states no character number in either v4 form, and keeps every count", () => {
    for (const form of [STORYTELLER_V4_ANSWER_FORM, STORY_CHECKER_V4_ANSWER_FORM]) {
      expect(form).not.toMatch(/\d+ characters/u);
    }
    // The counts stay (L11): 8 position lines, 1 to 3 reasons, 3 to 12 sections, 1 to 12 paragraphs, 40 references.
    for (const rule of ["at most 8 entries", "1 to 3 entries", "3 to 12 entries", "1 to 12 paragraphs", "at most 40 entries"]) {
      expect([rule, STORYTELLER_V4_ANSWER_FORM.includes(rule)]).toEqual([rule, true]);
    }
  });

  it("asks for no shape_id: code fills it from the one shape (INTERFACE §5.4)", () => {
    expect(STORYTELLER_V4_ANSWER_FORM).not.toContain("shape_id");
    expect(buildStorytellerContract(PACK, true, V4).instruction).not.toContain("shape_id");
  });

  it("lists the members long last in the schema block, and says so", () => {
    const block = STORYTELLER_V4_ANSWER_FORM.slice(STORYTELLER_V4_ANSWER_FORM.indexOf("{\n"), STORYTELLER_V4_ANSWER_FORM.indexOf("\n}\n") + 2);
    const at = ["short", "why", "reviewer_note", "long"].map((member) => block.indexOf(`\n  "${member}":`));
    for (const index of at) expect(index).toBeGreaterThan(-1);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
    expect(STORYTELLER_V4_ANSWER_FORM).toContain(
      "Write the members in this order: short, why, reviewer_note, and long last, with nothing after long but the object's closing brace.");
  });

  it("the empty template has exactly the schema's members but shape_id at every level, long last, and, filled, passes the schema", () => {
    const template = JSON.parse(templateLine(STORYTELLER_V4_ANSWER_FORM)) as {
      short: { paths: unknown[]; change: unknown }; why: { reasons: unknown[] }; reviewer_note: unknown;
      long: { sections: { paragraphs: unknown[] }[] };
    };
    expect(Object.keys(template)).toEqual(["short", "why", "reviewer_note", "long"]);
    expect(keys(template)).toEqual(schemaKeys(StoryBodySchema.shape).filter((member) => member !== "shape_id"));
    expect(keys(template.short)).toEqual(schemaKeys(StoryBodySchema.shape.short.shape));
    expect(keys(template.short.paths[0])).toEqual(schemaKeys(StoryPathSchema.shape));
    const paragraphKeys = schemaKeys(StoryParagraphSchema(1).shape);
    expect(keys(template.short.change)).toEqual(paragraphKeys);
    expect(keys(template.why)).toEqual(schemaKeys(StoryBodySchema.shape.why.shape));
    expect(keys(template.why.reasons[0])).toEqual(paragraphKeys);
    expect(keys(template.long)).toEqual(schemaKeys(StoryBodySchema.shape.long.shape));
    expect(keys(template.long.sections[0])).toEqual(["paragraphs", "title"]);
    expect(keys(template.long.sections[0]!.paragraphs[0])).toEqual(paragraphKeys);
    expect(template.reviewer_note).toBeNull();
    // Code sets shape_id on the decoded body before the schema (Task 12's index.fixedShapeId); so does this test.
    expect(StoryBodySchema.safeParse({ shape_id: "general", ...(filledTemplate(template) as object) }).success).toBe(true);
  });

  it("says where reviewer_note belongs and what form it takes (the 2026-10-14 slips)", () => {
    expect(STORYTELLER_V4_ANSWER_FORM).toContain("reviewer_note belongs to the object itself, beside short, why and long, never inside one of them");
    expect(STORYTELLER_V4_ANSWER_FORM).toContain("never a string or a list");
    expect(STORYTELLER_V4_ANSWER_FORM).toContain("long holds only sections");
  });

  it("carries the round-2 revision sentence inside the form, naming the revision block's field (spec §7.2 item 8)", () => {
    expect(STORYTELLER_V4_ANSWER_FORM).toContain(`\n${STORY_REVISION_FOLLOW_UP}\n`);
    expect(STORY_REVISION_FOLLOW_UP).toContain("revision_problems");
    expect(STORYTELLER_ANSWER_FORM).not.toContain("revision_problems");
  });

  it("the checker's v4 form asks for misleading beside every v3 member and criterion, with no number on the objection", () => {
    expect(STORY_CHECKER_V4_ANSWER_FORM).toContain("\n  \"satisfied\": boolean,\n  \"misleading\": boolean,\n  \"objection\": null | non-empty string,\n");
    for (const criterion of Object.keys(StoryCheckerVerdictSchema.shape.criteria.shape)) {
      expect([criterion, STORY_CHECKER_V4_ANSWER_FORM.includes(`\n    "${criterion}": boolean`)]).toEqual([criterion, true]);
    }
    expect(STORY_CHECKER_ANSWER_FORM).not.toContain("misleading");
  });

  it("the storyteller's length field names every short target in words, one line each, in a fixed order", () => {
    expect(storyLengthField(GUIDANCE.story, "en", GUIDANCE.charactersPerWord)).toEqual({
      name: "length",
      content: [
        "short.headline: about 15 words",
        "short.summary: about 120 words",
        "short.confidence: about 30 words",
        "each short.paths line: about 35 words",
        "short.change.text: about 60 words",
        "each why.reasons text: about 100 words"
      ].join("\n")
    });
  });

  it("the checker's length field names the same targets and its own objection's", () => {
    const field = storyCheckerLengthField(GUIDANCE.story, GUIDANCE.steps.story_checker, "ro", GUIDANCE.charactersPerWord);
    expect(field.name).toBe("length");
    expect(field.content).toBe(`${storyLengthField(GUIDANCE.story, "ro", GUIDANCE.charactersPerWord).content}\nobjection: about 250 words`);
  });

  it("a v4 request is at most 4 KiB larger than today's for the same material (bounds the estimate's gap)", () => {
    const material = [{ name: "question", content: JSON.stringify("Should the city fund the tram extension?") }];
    const fixed = (size: number): Buffer => Buffer.alloc(size, 0x5a);
    const bytes = (contract: PromptContract, fields: readonly FramedMaterialField[]): number =>
      Buffer.byteLength(JSON.stringify(buildFramedPrompt({ contract, material: fields, randomBytes: fixed }).packet), "utf8");
    // The v4 storyteller sends one shape instead of the six-shape menu, so it may well be smaller than v3: only the
    // upper bound is the estimate's concern.
    const teller = bytes(buildStorytellerContract(PACK, true, V4), [...material, storyLengthField(GUIDANCE.story, "en", GUIDANCE.charactersPerWord)])
      - bytes(buildStorytellerContract(PACK, true), material);
    const checker = bytes(buildStoryCheckerContract(PACK, true, V4),
      [...material, storyCheckerLengthField(GUIDANCE.story, 250, "en", GUIDANCE.charactersPerWord)])
      - bytes(buildStoryCheckerContract(PACK, true), material);
    expect(teller).toBeLessThanOrEqual(4 * 1024);
    expect(checker).toBeGreaterThan(0);
    expect(checker).toBeLessThanOrEqual(4 * 1024);
  });

  it("zh: the field names characters, from the table's factor (L2)", () => {
    const zh = storyLengthField(GUIDANCE.story, "zh", GUIDANCE.charactersPerWord).content;
    expect(zh.split("\n")[0]).toBe(`short.headline: ${lengthGuidanceText(15, "zh", GUIDANCE.charactersPerWord)}`);
    expect(zh.split("\n")[0]).toBe("short.headline: about 24 characters");
    expect(zh).not.toContain("words");
  });
});
