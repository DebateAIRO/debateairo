// tests/unit/lg-a-story-runaway.test.ts
import { describe, expect, it } from "vitest";
import { PublicStoryShortSchema, STORY_BODY_LIMITS, STORY_RUNAWAY_LIMITS, StoryBodySchema } from "@debateai/contract";
import { STORYTELLER_ANSWER_FORM, STORY_CHECKER_ANSWER_FORM, STORY_CHECKER_LIMITS, STORY_CHECKER_RUNAWAY_LIMITS,
  StoryCheckerVerdictSchema } from "@debateai/story";

const paragraph = (text: string) => ({ text, node_refs: [] as string[] });
const at = (n: number) => "a".repeat(n);
const BODY = {
  shape_id: "general",
  short: { headline: "H", summary: "S", confidence: "C", paths: [{ position_ref: "P1", fate: "HELD_UP", line: "L", node_refs: [] }],
    change: paragraph("X") },
  why: { reasons: [paragraph("R")] },
  long: { sections: [0, 1, 2].map(() => ({ title: "T", paragraphs: [paragraph("P")] })) },
  reviewer_note: null as unknown
};
const body = (edit: (draft: any) => void): unknown => { const draft = JSON.parse(JSON.stringify(BODY)); edit(draft); return draft; };
const FIELDS = [
  ["the headline", (draft: any, n: number) => { draft.short.headline = at(n); }, 1000, 160],
  ["the summary", (draft: any, n: number) => { draft.short.summary = at(n); }, 6000, 900],
  ["the confidence sentence", (draft: any, n: number) => { draft.short.confidence = at(n); }, 2000, 300],
  ["a position line", (draft: any, n: number) => { draft.short.paths[0].line = at(n); }, 2000, 240],
  ["what would change the answer", (draft: any, n: number) => { draft.short.change.text = at(n); }, 3000, 400],
  ["a why-reason", (draft: any, n: number) => { draft.why.reasons[0].text = at(n); }, 5000, 700],
  ["a section title", (draft: any, n: number) => { draft.long.sections[0].title = at(n); }, 500, 80],
  ["a long-version paragraph", (draft: any, n: number) => { draft.long.sections[0].paragraphs[0].text = at(n); }, 15000, 2000],
  ["the reviewer note", (draft: any, n: number) => { draft.reviewer_note = paragraph(at(n)); }, 8000, 1200]
] as const;

describe("LG-A: the story's limits are far-away runaway guards (spec §3.4, L10, L28)", () => {
  it("holds the spec's table, frozen", () => {
    expect(STORY_RUNAWAY_LIMITS).toEqual({ headlineMaxChars: 1000, summaryMaxChars: 6000, confidenceMaxChars: 2000,
      positionLineMaxChars: 2000, changeMaxChars: 3000, whyReasonMaxChars: 5000, sectionTitleMaxChars: 500,
      paragraphMaxChars: 15000, reviewerNoteMaxChars: 8000 });
    expect(Object.isFrozen(STORY_RUNAWAY_LIMITS)).toBe(true);
    expect(STORY_CHECKER_RUNAWAY_LIMITS).toEqual({ maxObjectionChars: 30000 });
  });

  it.each(FIELDS)("%s: accepted at its runaway limit, refused one character past it", (_name, edit, limit) => {
    expect(StoryBodySchema.safeParse(body((draft) => edit(draft, limit))).success).toBe(true);
    expect(StoryBodySchema.safeParse(body((draft) => edit(draft, limit + 1))).success).toBe(false);
  });

  it.each(FIELDS)("%s: a story written at today's limit reads exactly as written (old stories and snapshots)", (_name, edit, _limit, today) => {
    const old = body((draft) => edit(draft, today));
    expect(StoryBodySchema.parse(old)).toEqual(old);
  });

  it("the public short story agrees with the body on the short fields and the note", () => {
    const short = { ...BODY.short, reviewer_note: null };
    expect(PublicStoryShortSchema.safeParse({ ...short, headline: at(1000) }).success).toBe(true);
    expect(PublicStoryShortSchema.safeParse({ ...short, headline: at(1001) }).success).toBe(false);
    expect(PublicStoryShortSchema.safeParse({ ...short, reviewer_note: paragraph(at(8000)) }).success).toBe(true);
    expect(PublicStoryShortSchema.safeParse({ ...short, reviewer_note: paragraph(at(8001)) }).success).toBe(false);
  });

  it("every count stays: at most 8 position lines, 1-3 reasons, 3-12 sections, 1-12 paragraphs, 40 references", () => {
    const path = BODY.short.paths[0]!;
    expect(StoryBodySchema.safeParse(body((draft) => { draft.short.paths = Array.from({ length: 9 }, () => path); })).success).toBe(false);
    expect(StoryBodySchema.safeParse(body((draft) => { draft.why.reasons = [0, 1, 2, 3].map(() => paragraph("R")); })).success).toBe(false);
    expect(StoryBodySchema.safeParse(body((draft) => { draft.long.sections = draft.long.sections.slice(0, 2); })).success).toBe(false);
    expect(StoryBodySchema.safeParse(body((draft) => { draft.long.sections[0].paragraphs = Array.from({ length: 13 }, () => paragraph("P")); })).success).toBe(false);
    expect(StoryBodySchema.safeParse(body((draft) => { draft.why.reasons[0].node_refs = Array.from({ length: 41 }, (_, i) => `P${String(i)}`); })).success).toBe(false);
    expect(STORY_BODY_LIMITS).toEqual({ maxPaths: 8, confidenceMaxChars: 300, whyReasonsMax: 3 });
  });

  it("the v3 forms still state today's numbers: their bytes do not move", () => {
    for (const text of ["at most 160 characters", "at most 900 characters", "at most 300 characters", "at most 240 characters",
      "at most 400 characters", "at most 700 characters", "at most 80 characters", "at most 2000 characters", "at most 1200 characters"]) {
      expect(STORYTELLER_ANSWER_FORM).toContain(text);
    }
    expect(STORY_CHECKER_ANSWER_FORM).toContain(`at most ${String(STORY_CHECKER_LIMITS.maxObjectionChars)} characters`);
    expect(STORY_CHECKER_LIMITS.maxObjectionChars).toBe(4000);
  });

  it("the checker's objection: 30,000 characters accepted, 30,001 refused", () => {
    const criteria = { faithful_to_material: false, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
      citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true };
    expect(StoryCheckerVerdictSchema.safeParse({ satisfied: false, objection: at(30000), criteria }).success).toBe(true);
    expect(StoryCheckerVerdictSchema.safeParse({ satisfied: false, objection: at(30001), criteria }).success).toBe(false);
  });
});
