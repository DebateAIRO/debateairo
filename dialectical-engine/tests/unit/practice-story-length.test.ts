import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, proseWordCount } from "@debateai/kernel";
import {
  engineSettingsOf,
  engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues,
  resolveLengthGuidance
} from "@debateai/register";
import {
  practiceStoryFieldSamples,
  practiceStoryLengthBlockOf,
  practiceStoryJsonBreakOf,
  practiceStoryJsonBreakRows,
  practiceStoryLengthLines,
  practiceStoryLengthRows,
  practiceStoryTargetsOf
} from "../../tools/preview-practice/practice-story-length.js";

/**
 * Length guidance (spec 2026-10-15 §3.7; OVERVIEW §2 LG-D): the practice report's story table, per AI and per short
 * field plus the long version, and the storyteller's replies that were not readable JSON, by where they broke.
 */

const CPW = LENGTH_GUIDANCE_START.charactersPerWord;
const TARGETS = { story: LENGTH_GUIDANCE_START.story, charactersPerWord: CPW };
const STORY = {
  shape_id: "general",
  short: {
    headline: "We would fund the tram extension now.",
    summary: "You asked whether to fund the tram extension; our answer is yes, because fares cover running costs.",
    confidence: "Fairly sure, as long as the fare forecast holds.",
    paths: [
      { position_ref: "P1", fate: "HELD_UP", line: "Funding it now held up well.", node_refs: ["P1"] },
      { position_ref: "P2", fate: "FELL", line: "Waiting a year did not hold up.", node_refs: ["P2"] }
    ],
    change: { text: "A lower fare forecast would change the answer.", node_refs: [] }
  },
  why: { reasons: [
    { text: "The fare forecast covers the running costs by year nine.", node_refs: [] },
    { text: "Waiting a year adds construction costs with no new benefit.", node_refs: [] }
  ] },
  reviewer_note: null,
  long: { sections: [{ title: "Our reading of your question", paragraphs: [{ text: "You want to know whether the city should pay now.", node_refs: [] }] }] }
};
const words = (value: unknown): number => proseWordCount(value, CPW);

describe("practice: the story's words per field (LG-D)", () => {
  it("counts each short field, each path line, each reason and the whole long version, with its target", () => {
    const samples = practiceStoryFieldSamples(JSON.stringify(STORY), TARGETS)!;
    expect(samples).toEqual([
      { field: "headline", words: words(STORY.short.headline), guided: 15 },
      { field: "summary", words: words(STORY.short.summary), guided: 120 },
      { field: "confidence", words: words(STORY.short.confidence), guided: 30 },
      { field: "positionLine", words: words(STORY.short.paths[0]!.line), guided: 35 },
      { field: "positionLine", words: words(STORY.short.paths[1]!.line), guided: 35 },
      { field: "change", words: words(STORY.short.change.text), guided: 60 },
      { field: "whyReason", words: words(STORY.why.reasons[0]!.text), guided: 100 },
      { field: "whyReason", words: words(STORY.why.reasons[1]!.text), guided: 100 },
      { field: "long", words: words(STORY.long), guided: null }
    ]);
  });

  it("without the row the targets are null; a reply with no short version (a patch) or not JSON is no story", () => {
    expect(practiceStoryFieldSamples(JSON.stringify(STORY), null)!.every((sample) => sample.guided === null)).toBe(true);
    expect(practiceStoryFieldSamples(JSON.stringify({ "short.paths.0.line": "A shorter line here." }), TARGETS)).toBeNull();
    expect(practiceStoryFieldSamples("not json", TARGETS)).toBeNull();
  });

  it("rows: per model and field in a fixed field order, the lower median and the max", () => {
    expect(practiceStoryLengthRows([
      { model: "b", samples: [{ field: "headline", words: 10, guided: 15 }] },
      { model: "a", samples: [
        { field: "long", words: 900, guided: null },
        { field: "headline", words: 12, guided: 15 }, { field: "headline", words: 20, guided: 15 },
        { field: "headline", words: 30, guided: 15 }, { field: "headline", words: 40, guided: 15 }
      ] }
    ])).toEqual([
      { model: "a", field: "headline", guidedWords: 15, texts: 4, actualWords: { median: 20, max: 40 } },
      { model: "a", field: "long", guidedWords: null, texts: 1, actualWords: { median: 900, max: 900 } },
      { model: "b", field: "headline", guidedWords: 15, texts: 1, actualWords: { median: 10, max: 10 } }
    ]);
  });
});

describe("practice: the storyteller's unreadable replies (LG-D)", () => {
  const whole = JSON.stringify(STORY);

  it("a reply cut inside the long version broke after long started", () => {
    expect(practiceStoryJsonBreakOf(whole.slice(0, whole.length - 20))).toBe("AFTER_LONG_STARTED");
  });

  it("a reply broken in the short version broke before long", () => {
    expect(practiceStoryJsonBreakOf(whole.replace("\"summary\":", "\"summary\""))).toBe("BEFORE_LONG");
  });

  it("no object at all, or no position in the error: position unknown", () => {
    expect(practiceStoryJsonBreakOf("no object here")).toBe("POSITION_UNKNOWN");
    expect(practiceStoryJsonBreakOf(whole)).toBe("POSITION_UNKNOWN");
  });

  it("rows: per model, every reply counted, the unreadable ones by where they broke", () => {
    expect(practiceStoryJsonBreakRows([
      { model: "m", jsonBreak: null }, { model: "m", jsonBreak: "AFTER_LONG_STARTED" }, { model: "n", jsonBreak: null }
    ])).toEqual([
      { model: "m", replies: 2, parseFailed: 1, afterLongStarted: 1, beforeLong: 0, positionUnknown: 0 },
      { model: "n", replies: 1, parseFailed: 0, afterLongStarted: 0, beforeLong: 0, positionUnknown: 0 }
    ]);
  });

  it("report lines: counts and codes only, never a reply's text", () => {
    const lines = practiceStoryLengthLines({
      storyLengthByField: [{ model: "a", field: "headline", guidedWords: 15, texts: 2, actualWords: { median: 14, max: 18 } }],
      storyJsonBreaks: [{ model: "a", replies: 3, parseFailed: 1, afterLongStarted: 1, beforeLong: 0, positionUnknown: 0 }]
    }).join("\n");
    expect(lines).toContain("| a | headline | 15 | 2 | 14 | 18 |");
    expect(lines).toContain("- a: 3 storyteller replies, 1 not readable (after the long version began 1, before it 0, position unknown 0)");
    expect(practiceStoryLengthLines({ storyLengthByField: [], storyJsonBreaks: [] })).toEqual([]);
  });
});

describe("practice: the story's targets come only with engine 2 (R1d)", () => {
  it("from the receipt's length member only when the receipt also carries the engine member (story v4)", () => {
    const length = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "premium", answerLength: "standard" });
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 2, mapOpening: false });
    expect(practiceStoryTargetsOf(undefined)).toBeNull();
    expect(practiceStoryTargetsOf({ length })).toBeNull();
    expect(practiceStoryTargetsOf({ length, engine })).toEqual({ story: length.story, charactersPerWord: length.charactersPerWord });
  });
});

// Fix round 1: a PATCH try (the short follow-up) holds only the asked members; it is skipped by its recorded form,
// never guessed from its shape, in both the words table and the reply count.
describe("practice: the story tables skip the patch follow-up by its recorded form (R1d, fix round 1)", () => {
  const whole = JSON.stringify(STORY);
  const row = (over: Partial<Parameters<typeof practiceStoryLengthBlockOf>[0][number]>) => ({
    callSiteKey: "STORY:STORYTELLER:1", model: "m", outcome: "OK", parseStatus: "PARSED", replyForm: "ORIGINAL", content: whole, ...over
  });

  it("a PATCH try counts neither its words nor as a reply, even when its text reads as a whole story", () => {
    const block = practiceStoryLengthBlockOf([
      row({ outcome: "FAILED", parseStatus: "SCHEMA_FAILED" }),
      row({ replyForm: "PATCH" }),
      row({ replyForm: "PATCH", outcome: "FAILED", parseStatus: "PARSE_FAILED", content: "{" })
    ], TARGETS);
    expect(block.storyJsonBreaks).toEqual([
      { model: "m", replies: 1, parseFailed: 0, afterLongStarted: 0, beforeLong: 0, positionUnknown: 0 }
    ]);
    expect(block.storyLengthByField).toEqual([]);
  });

  it("a whole accepted story counts; a structure-repair row counts its words under the call it repaired, never as a reply", () => {
    const block = practiceStoryLengthBlockOf([
      row({ outcome: "FAILED", parseStatus: "PARSE_FAILED", content: whole.slice(0, 40) }),
      row({ callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1", model: "h", replyForm: "STRUCTURE" }),
      row({ callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:2", model: "h", replyForm: "STRUCTURE" })
    ], TARGETS);
    expect(block.storyJsonBreaks).toEqual([
      { model: "m", replies: 1, parseFailed: 1, afterLongStarted: 0, beforeLong: 1, positionUnknown: 0 }
    ]);
    // One story: one text per short field, two path lines and two reasons; nothing from the second repair (no call of its key).
    expect(block.storyLengthByField.map((entry) => [entry.model, entry.field, entry.texts])).toEqual([
      ["m", "headline", 1], ["m", "summary", 1], ["m", "confidence", 1], ["m", "positionLine", 2], ["m", "change", 1],
      ["m", "whyReason", 2], ["m", "long", 1]
    ]);
    expect(block.storyLengthByField.find((entry) => entry.field === "headline")).toEqual(
      { model: "m", field: "headline", guidedWords: 15, texts: 1, actualWords: { median: words(STORY.short.headline), max: words(STORY.short.headline) } });
  });
});
