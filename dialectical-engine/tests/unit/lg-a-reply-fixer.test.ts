import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoryBodySchema } from "@debateai/contract";
import { judgeAssessmentSchema } from "@debateai/judgement";
import { mapGapReplySchema } from "@debateai/map";
import { fixReplyStructure, replyFailureClassOf } from "@debateai/providers";

const STOP = { finishReason: "stop" } as const;

const ASSESSMENT = {
  steelman: { summary: "The strongest form of the claim holds.", fidelity: 0.8 },
  critic: { summary: "The best counter is weak.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.6, relevance: 0.7 },
  context: { fit: 0.9, ambiguityFlags: [] },
  fallacy: { severity: 0.1, fatalFlags: [] }
};
const paragraph = (text: string, refs: readonly string[] = []) => ({ text, node_refs: [...refs] });
const STORY = {
  shape_id: "general",
  short: {
    headline: "Fund it.", summary: "The savings held up.", confidence: "Fairly sure.",
    paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Fund it held up.", node_refs: ["P1"] }],
    change: paragraph("A ridership drop would move it.")
  },
  why: { reasons: [paragraph("Savings cover the costs.", ["P1"])] },
  long: { sections: [0, 1, 2].map((n) => ({ title: `Section ${String(n)}`, paragraphs: [paragraph(`Text ${String(n)}.`)] })) },
  reviewer_note: null as unknown
};
const story = (edit: (body: Record<string, any>) => void): Record<string, any> => {
  const body = JSON.parse(JSON.stringify(STORY)) as Record<string, any>;
  edit(body);
  return body;
};

describe("LG-A fixReplyStructure: what the 2026-10-14 practice runs broke, repaired in code (structured-outputs-findings §3)", () => {
  it("drops unknown keys inside members (GLM's fallacy.description and evidence.quality_note: 44 judging tries)", () => {
    const sent = { ...ASSESSMENT, evidence: { ...ASSESSMENT.evidence, quality_note: "solid sources" },
      fallacy: { ...ASSESSMENT.fallacy, description: "none found" } };
    const fixed = fixReplyStructure(sent, judgeAssessmentSchema);
    expect(fixed).toEqual({ value: ASSESSMENT, repairs: ["INNER_UNASKED_KEYS"] });
    expect(judgeAssessmentSchema.safeParse(fixed!.value).success).toBe(true);
  });

  it("never drops an unknown key that may be a misplaced score: a number under a name the schema uses elsewhere", () => {
    const sent = { ...ASSESSMENT, evidence: { ...ASSESSMENT.evidence, fit: 0.4 } };
    expect(fixReplyStructure(sent, judgeAssessmentSchema)).toBeNull();
  });

  // (global constraints, deviation 8; Review Focus 1; controller ruling for Task 4) the keep-exception applies at the root
  // too: a root `fidelity` beside `steelman.fidelity` may be a misplaced score, so it is kept and the reply is refused.
  it("never drops a root number under a name the schema uses inside a member (a root fidelity beside steelman.fidelity)", () => {
    expect(fixReplyStructure({ ...ASSESSMENT, fidelity: 0.5 }, judgeAssessmentSchema)).toBeNull();
    expect(fixReplyStructure({ ...ASSESSMENT, fidelity: 0.5, notes: "x" }, judgeAssessmentSchema)).toBeNull();
  });

  it("drops a root key the schema never asked for, under the judge's own name", () => {
    expect(fixReplyStructure({ ...ASSESSMENT, notes: "x" }, judgeAssessmentSchema)).toEqual({ value: ASSESSMENT, repairs: ["UNASKED_KEYS"] });
  });

  // (pre-flight PF-A13) A value under a name the schema declares as an enum elsewhere may be a misplaced verdict: kept, so
  // the reply is refused (as the judge's dropUnaskedKeys refuses a root basis today); a text under a plain-text name is dropped.
  it("never drops a value under a name the schema declares as an enum elsewhere (a stray basis), and still drops a stray text", () => {
    expect(fixReplyStructure({ ...ASSESSMENT, basis: "PLAUSIBLE_COUNTER" }, judgeAssessmentSchema)).toBeNull();
    expect(fixReplyStructure({ ...ASSESSMENT, evidence: { ...ASSESSMENT.evidence, basis: "REAL_ATTACK" } }, judgeAssessmentSchema)).toBeNull();
    expect(fixReplyStructure({ ...ASSESSMENT, fallacy: { ...ASSESSMENT.fallacy, summary: "none" } }, judgeAssessmentSchema))
      .toEqual({ value: ASSESSMENT, repairs: ["INNER_UNASKED_KEYS"] });
  });

  it("moves a member written one level too deep (GLM's long.reviewer_note) and drops long's unknown keys, in the fixed order", () => {
    const sent = story((body) => { body.long.reviewer_note = paragraph("A note."); body.long.tone = "calm"; delete body.reviewer_note; });
    const fixed = fixReplyStructure(sent, StoryBodySchema);
    expect(fixed?.repairs).toEqual(["INNER_UNASKED_KEYS", "MEMBER_UNNESTED"]);
    expect(fixed?.value).toEqual(story((body) => { body.reviewer_note = paragraph("A note."); }));
  });

  // (pre-flight PF-A12, ruling R3) A key an ancestor declares goes to the NEAREST declaring ancestor whose slot is absent
  // or null; it is never dropped; with no free slot it stays, so nothing is fixed and the structure-repair call keeps it.
  it("moves a misplaced note into a root slot that holds null", () => {
    const sent = story((body) => { body.long.reviewer_note = paragraph("A note."); });
    expect(fixReplyStructure(sent, StoryBodySchema)).toEqual({ value: story((body) => { body.reviewer_note = paragraph("A note."); }),
      repairs: ["MEMBER_UNNESTED"] });
  });

  it("moves a note written inside a section (long.sections[i]) up to the root, across the list", () => {
    const sent = story((body) => { body.long.sections[1].reviewer_note = paragraph("A note."); });
    expect(fixReplyStructure(sent, StoryBodySchema)).toEqual({ value: story((body) => { body.reviewer_note = paragraph("A note."); }),
      repairs: ["MEMBER_UNNESTED"] });
  });

  it("moves a key to the NEAREST declaring ancestor with a free slot, passing over one whose slot is written", () => {
    const schema = z.object({
      note: z.string().nullable(),
      inner: z.object({ note: z.string().nullable(), deep: z.object({ kept: z.string() }).strict() }).strict()
    }).strict();
    expect(fixReplyStructure({ note: null, inner: { note: null, deep: { kept: "k", note: "x" } } }, schema))
      .toEqual({ value: { note: null, inner: { note: "x", deep: { kept: "k" } } }, repairs: ["MEMBER_UNNESTED"] });
    expect(fixReplyStructure({ note: null, inner: { note: "y", deep: { kept: "k", note: "x" } } }, schema))
      .toEqual({ value: { note: "x", inner: { note: "y", deep: { kept: "k" } } }, repairs: ["MEMBER_UNNESTED"] });
  });

  it("never drops a misplaced note when the root's note is already written: it is left, and nothing is fixed", () => {
    const sent = story((body) => { body.reviewer_note = paragraph("The root note."); body.long.reviewer_note = paragraph("A second note."); });
    expect(fixReplyStructure(sent, StoryBodySchema)).toBeNull();
  });

  it("wraps a bare list in its missing parent (MiMo wrote long as the sections list)", () => {
    const sent = story((body) => { body.long = body.long.sections; });
    expect(fixReplyStructure(sent, StoryBodySchema)).toEqual({ value: STORY, repairs: ["MEMBER_WRAPPED"] });
  });

  it("converts the text forms both ways (DeepSeek's reviewer_note as plain text; MiMo's {text} framing challenges)", () => {
    const note = fixReplyStructure(story((body) => { body.reviewer_note = "Only one point was argued."; }), StoryBodySchema);
    expect(note?.repairs).toEqual(["TEXT_FORM_CONVERTED"]);
    expect(note?.value).toEqual(story((body) => { body.reviewer_note = paragraph("Only one point was argued."); }));
    const gap = fixReplyStructure({ new_points: [], framing_challenges: [{ text: "Is the question too narrow?" }] }, mapGapReplySchema);
    expect(gap).toEqual({ value: { new_points: [], framing_challenges: ["Is the question too narrow?"] }, repairs: ["TEXT_FORM_CONVERTED"] });
  });

  it("joins a list of paragraphs into the one asked for, every reference kept once", () => {
    const strings = fixReplyStructure(story((body) => { body.reviewer_note = ["First.", "Second."]; }), StoryBodySchema);
    expect(strings?.value).toEqual(story((body) => { body.reviewer_note = paragraph("First.\n\nSecond."); }));
    const paragraphs = fixReplyStructure(story((body) => {
      body.reviewer_note = [paragraph("First.", ["P1"]), paragraph("Second.", ["P1", "P2"])];
    }), StoryBodySchema);
    expect(paragraphs).toEqual({ value: story((body) => { body.reviewer_note = paragraph("First.\n\nSecond.", ["P1", "P2"]); }),
      repairs: ["PARAGRAPHS_JOINED"] });
  });

  it("fills a value the schema admits in only one form, and nothing else", () => {
    const schema = z.object({ edge_bearings: z.array(z.string()).max(0), outcome: z.enum(["agree", "disagree"]) }).strict();
    expect(fixReplyStructure({ outcome: "agree" }, schema)).toEqual({ value: { outcome: "agree", edge_bearings: [] }, repairs: ["ONLY_VALUE_FILLED"] });
    expect(fixReplyStructure({ edge_bearings: [] }, schema)).toBeNull();
  });

  it("never invents a score, a text or a verdict: a missing one stays refused", () => {
    const { fidelity: _dropped, ...steelman } = ASSESSMENT.steelman;
    expect(fixReplyStructure({ ...ASSESSMENT, steelman }, judgeAssessmentSchema)).toBeNull();
    expect(fixReplyStructure(story((body) => { delete body.short.headline; }), StoryBodySchema)).toBeNull();
  });

  it("honours a step's switch, refuses prototype keys, and leaves a valid reply alone", () => {
    const sent = { ...ASSESSMENT, evidence: { ...ASSESSMENT.evidence, quality_note: "x" } };
    expect(fixReplyStructure(sent, judgeAssessmentSchema, { innerUnaskedKeys: false })).toBeNull();
    // (pre-flight PF-A15) the switch keeps root keys too: no UNASKED_KEYS drop either.
    expect(fixReplyStructure({ ...ASSESSMENT, notes: "x" }, judgeAssessmentSchema, { innerUnaskedKeys: false })).toBeNull();
    const poisoned = JSON.parse("{\"long\":{\"sections\":[],\"__proto__\":{\"polluted\":true}}}") as unknown;
    fixReplyStructure(poisoned, StoryBodySchema);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(fixReplyStructure(ASSESSMENT, judgeAssessmentSchema)).toBeNull();
  });
});

describe("LG-A replyFailureClassOf (INTERFACE §2.3)", () => {
  const refusal = (body: unknown) => {
    const parsed = StoryBodySchema.safeParse(body);
    if (parsed.success) throw new Error("must be refused");
    return parsed.error.message;
  };
  it("CUT_OFF for a reply stopped at its limit; EMPTY for no visible text", () => {
    expect(replyFailureClassOf({ rawText: "{\"a\":", parseStatus: "LENGTH_EXCEEDED", parseError: "x" }, { finishReason: "length" })).toBe("CUT_OFF");
    expect(replyFailureClassOf({ rawText: "  ", parseStatus: "PARSE_FAILED", parseError: "Unexpected end of JSON input" }, STOP)).toBe("EMPTY");
  });
  // (pre-flight PF-A14, ruling R4: INTERFACE §2.3) a reply that ended normally, has visible text and holds no readable
  // JSON is STRUCTURE, prose with no object included: the structure-repair call keeps the words, and if content is
  // missing the schema check after the repair fails and the content follow-up follows.
  it("STRUCTURE for every reply that ended normally with visible text and no readable JSON, prose included", () => {
    expect(replyFailureClassOf({ rawText: "{\"a\": [1, 2", parseStatus: "PARSE_FAILED", parseError: "x" }, STOP)).toBe("STRUCTURE");
    expect(replyFailureClassOf({ rawText: "I would rather not answer.", parseStatus: "PARSE_FAILED", parseError: "x" }, STOP)).toBe("STRUCTURE");
  });
  it("reads a judge list cut at 512 characters up to its last whole entry, and a reply written as prose, then the object", () => {
    const glm = JSON.stringify({ ...ASSESSMENT, evidence: { ...ASSESSMENT.evidence, note: 1 } });
    const cut = (list: string) => `${list.slice(0, 511)}…`;
    const keys = "unrecognized_keys@evidence,".repeat(40);
    expect(replyFailureClassOf({ rawText: glm, parseStatus: "SCHEMA_FAILED", parseError: cut(keys) }, STOP)).toBe("STRUCTURE");
    expect(replyFailureClassOf({ rawText: glm, parseStatus: "SCHEMA_FAILED", parseError: cut(`invalid_type@steelman.fidelity,${keys}`) }, STOP))
      .toBe("CONTENT");
    // Prose first, then a fenced story with a raw straight quote in one text (as tests/unit/lg-a-story-fixer.test.ts builds it).
    const proseThen = (body: Record<string, any>): string => {
      const draft = JSON.parse(JSON.stringify(body)) as Record<string, any>;
      draft.long.sections[2].paragraphs[0].text = "Text „as the city said\" here.";
      return `I checked the material first.\n\`\`\`json\n${JSON.stringify(draft).replace("\\\"", "\"")}\n\`\`\``;
    };
    const wrongPlace = story((body) => { body.reviewer_note = ["First.", "Second."]; });
    const missing = story((body) => { delete body.short.headline; });
    expect(replyFailureClassOf({ rawText: proseThen(wrongPlace), parseStatus: "SCHEMA_FAILED", parseError: refusal(wrongPlace) }, STOP)).toBe("STRUCTURE");
    expect(replyFailureClassOf({ rawText: proseThen(missing), parseStatus: "SCHEMA_FAILED", parseError: refusal(missing) }, STOP)).toBe("CONTENT");
  });
  it("STRUCTURE when every issue is about form; CONTENT as soon as one needs the AI's words", () => {
    const wrongForm = story((body) => { body.reviewer_note = 7 as unknown; body.long.tone = "calm"; });
    const wrongPlace = story((body) => { body.reviewer_note = ["First.", "Second."]; body.extra = 1; });
    expect(replyFailureClassOf({ rawText: JSON.stringify(wrongPlace), parseStatus: "SCHEMA_FAILED", parseError: refusal(wrongPlace) }, STOP)).toBe("STRUCTURE");
    const missing = story((body) => { delete body.short.headline; body.extra = 1; });
    expect(replyFailureClassOf({ rawText: JSON.stringify(missing), parseStatus: "SCHEMA_FAILED", parseError: refusal(missing) }, STOP)).toBe("CONTENT");
    expect(replyFailureClassOf({ rawText: JSON.stringify(wrongForm), parseStatus: "SCHEMA_FAILED", parseError: refusal(wrongForm) }, STOP)).toBe("CONTENT");
  });
  it("reads the judge's code@path list and the steps' own content codes", () => {
    const glm = JSON.stringify({ ...ASSESSMENT, evidence: { ...ASSESSMENT.evidence, note: 1 } });
    expect(replyFailureClassOf({ rawText: glm, parseStatus: "SCHEMA_FAILED", parseError: "unrecognized_keys@evidence" }, STOP)).toBe("STRUCTURE");
    expect(replyFailureClassOf({ rawText: JSON.stringify(ASSESSMENT), parseStatus: "SCHEMA_FAILED", parseError: "invalid_type@steelman.fidelity" }, STOP)).toBe("CONTENT");
    expect(replyFailureClassOf({ rawText: "{\"segments\":[]}", parseStatus: "SCHEMA_FAILED",
      parseError: JSON.stringify([{ path: ["segments", 0, "text"], message: "COMPOSED_TEXT_NAMES_A_NODE" }]) }, STOP)).toBe("CONTENT");
    expect(replyFailureClassOf({ rawText: "{}", parseStatus: "PARSE_FAILED", parseError: "PATCH_NOT_AN_OBJECT@$" }, STOP)).toBe("CONTENT");
  });
});
