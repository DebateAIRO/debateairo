// tests/unit/structure-salvage.test.ts
import { describe, expect, it } from "vitest";
import { PANEL_ANSWER_FORM, classifyStructuredArtifact } from "@debateai/judgement";
import { STORYTELLER_ANSWER_FORM } from "@debateai/story";
import { salvageStructureReply } from "@debateai/providers";
import { STOP } from "../support/lg-a-harness.js";
import {
  BASE, ECHO, ECHO_NOTES, KEYLESS, NOTE, QUALITY, SCORE_BROKEN, SCORE_FORM, SCORE_SCHEMA, WRAPPED, WRAPPED_QUALITY, classifyPanel, pretty
} from "../support/structure-salvage-shapes.js";

const panel = (content: string, textsKept: "place" | "anywhere" = "place") => salvageStructureReply({ content, reply: STOP,
  answerForm: PANEL_ANSWER_FORM, textsKept, classify: classifyPanel });

describe("A1: the verified subset, read in code with no call", () => {
  it("accepts the echoed inner fallacy (shaped like try2 seq 217)", () => {
    const result = panel(ECHO);
    expect(result).toMatchObject({ kind: "ACCEPTED", repairs: ["ECHO_DROPPED"] });
    expect((result as { content: string }).content).toBe(JSON.stringify(BASE));
  });

  it("accepts a key written twice with one value and an echo carrying a note (shaped like today seq 344)", () => {
    const result = panel(ECHO_NOTES);
    expect(result).toMatchObject({ kind: "ACCEPTED", repairs: ["DUPLICATE_KEY_DROPPED", "ECHO_DROPPED", "UNASKED_VALUE_DROPPED"] });
    expect((result as { content: string }).content).toBe(JSON.stringify(BASE));
  });

  it("accepts the keyless sentence and fallacy.description on a judge step (shaped like try2 seq 475)", () => {
    const result = panel(KEYLESS);
    expect(result).toMatchObject({ kind: "ACCEPTED", repairs: ["KEYLESS_VALUE_DROPPED", "UNASKED_VALUE_DROPPED"] });
    expect((result as { content: string }).content).toBe(JSON.stringify(BASE));
  });

  it("names its drops on the classification, its first drop as the headline", () => {
    expect(panel(KEYLESS)).toMatchObject({ classification: { parseStatus: "PARSED", jsonRepair: "KEYLESS_VALUE_DROPPED",
      jsonRepairs: ["KEYLESS_VALUE_DROPPED", "UNASKED_VALUE_DROPPED"] } });
  });
});

describe("A1 refuses (each with its own reason, so removing that guard turns the test red)", () => {
  it("an inner fallacy.severity 0.5 beside an outer 0.35", () => {
    const broken = pretty({ ...BASE, fallacy: { ...BASE.fallacy, fallacy: { severity: 0.5 } } });
    expect(panel(broken)).toEqual({ kind: "REFUSED", reason: "NOT_DROPPABLE" });
  });

  it("a key written twice with two values, and a true/false criterion written twice", () => {
    expect(panel(pretty(BASE).replace(QUALITY, `${QUALITY}\n    "quality": 0.9,`))).toEqual({ kind: "REFUSED", reason: "DUPLICATE_DIFFERS" });
    const form = "{\"criteria\": {\"fair\": boolean}, \"objection\": null | string}";
    const verdicts = salvageStructureReply({ content: "{\"criteria\": {\"fair\": true, \"fair\": false}, \"objection\": null}", reply: STOP,
      answerForm: form, textsKept: "anywhere", classify: () => ({ parseStatus: "PARSED", parseError: null }) });
    expect(verdicts).toEqual({ kind: "REFUSED", reason: "DUPLICATE_DIFFERS" });
  });

  it("the keyless sentence on a step that keeps every text (owner answer 3)", () => {
    expect(panel(KEYLESS, "anywhere")).toEqual({ kind: "REFUSED", reason: "KEYLESS_KEPT" });
  });

  it("refuses dropping a story's reviewer note under a wrong parent", () => {
    const story = "{\"long\": {\"sections\": [], \"reviewer_note\": \"A reviewer's own words\"}, \"reviewer_note\": null}";
    expect(salvageStructureReply({ content: story, reply: STOP, answerForm: STORYTELLER_ANSWER_FORM, textsKept: "anywhere",
      classify: () => ({ parseStatus: "PARSED", parseError: null }) })).toEqual({ kind: "REFUSED", reason: "NOT_DROPPABLE" });
  });

  it("refuses dropping a keyed map item though the shorter list passes the schema", () => {
    const form = "{\"answers\": [{\"id\": string, \"text\": string}]}";
    const broken = "{\"answers\": [{\"id\": \"a1\", \"text\": \"Fund it\"}], \"answer\": {\"id\": \"a2\", \"text\": \"Wait a year\"}}";
    expect(salvageStructureReply({ content: broken, reply: STOP, answerForm: form, textsKept: "anywhere",
      classify: () => ({ parseStatus: "PARSED", parseError: null }) })).toEqual({ kind: "REFUSED", reason: "NOT_DROPPABLE" });
  });

  it("a score written as text under a name the form states only as a number (the step's fixer keeps it; pre-flight PF-S4)", () => {
    expect(panel(pretty({ ...BASE, evidence: { ...BASE.evidence, fidelity: "0.4" } }))).toEqual({ kind: "REFUSED", reason: "NOT_DROPPABLE" });
  });

  it("a dotted key (pre-flight PF-S20)", () => {
    expect(panel(pretty({ ...BASE, "evidence.quality": 0.5 }))).toEqual({ kind: "REFUSED", reason: "DOTTED_KEY" });
  });

  it("a drop the keep-words check refuses: a fatal flag written flat in fallacy, two keys of one listed item (pre-flight PF-S20)", () => {
    // Each text alone is droppable by A's own rules (a name the form states as a text elsewhere); together they make up a
    // fatal flag, which `structureRepairKeepsWords` asks for (its stray-item rule), so the backstop refuses the drop.
    expect(panel(pretty({ ...BASE, fallacy: { ...BASE.fallacy, type: "Appeal to tradition", description: NOTE } })))
      .toEqual({ kind: "REFUSED", reason: "WORDS_NOT_KEPT" });
  });

  it("a step reading that would change a value, even on a reply A finished (pre-flight PF-S20)", () => {
    expect(salvageStructureReply({ content: ECHO, reply: STOP, answerForm: PANEL_ANSWER_FORM, textsKept: "place",
      classify: () => ({ parseStatus: "PARSED", parseError: null, jsonRepair: "UNASKED_KEYS" }) }))
      .toEqual({ kind: "REFUSED", reason: "VALUE_CHANGING_REPAIR" });
  });

  it("a reply with nothing to drop that the step already accepts (pre-flight PF-S20)", () => {
    expect(panel(pretty(BASE))).toEqual({ kind: "REFUSED", reason: "NOTHING_TO_DROP" });
  });

  it("a score that exists only as digits inside a text, and a missing member: never filled, A hands B a partial object", () => {
    const { quality: _gone, ...evidence } = BASE.evidence;
    const broken = pretty({ ...BASE, evidence: { ...evidence, note: "quality 0.5 at best" } });
    const result = panel(broken);
    expect(result).toMatchObject({ kind: "PARTIAL", classification: { parseStatus: "SCHEMA_FAILED" } });
    expect((result as unknown as { base: { evidence: Record<string, unknown> } }).base.evidence).toEqual({ relevance: 0.7 });
  });

  // Fix round 1 (owner answer 3): A drops a keyless TEXT only; a keyless score, verdict or block may be a second answer.
  const fallacyWith = (extra: string) => pretty(BASE).replace("\"fatalFlags\": []", `"fatalFlags": [],\n    ${extra}`);
  it("a keyless object holding a second score (P1)", () => {
    expect(panel(fallacyWith("{\"severity\": 0.9}"))).toEqual({ kind: "REFUSED", reason: "NOT_DROPPABLE" });
  });

  it("a keyless number (P4)", () => {
    expect(panel(fallacyWith("0.9"))).toEqual({ kind: "REFUSED", reason: "NOT_DROPPABLE" });
  });

  it("a keyless list after a list that was closed (P3)", () => {
    const flags = pretty(BASE).replace("\"central lines undefined\"\n    ]", "\"central lines undefined\"\n    ],\n    [\"second flag\"]");
    expect(panel(flags)).toEqual({ kind: "REFUSED", reason: "NOT_DROPPABLE" });
  });

  it("an object that shapes to nothing is no echo: dropped as unasked (fix round 1)", () => {
    const result = panel(pretty({ ...BASE, fallacy: { ...BASE.fallacy, context: { note: NOTE } } }));
    expect(result).toMatchObject({ kind: "ACCEPTED", repairs: ["UNASKED_VALUE_DROPPED"] });
    expect((result as { content: string }).content).toBe(JSON.stringify(BASE));
  });

  it("a keyless value right after a key the form states as a list (a lost '[' needs a move)", () => {
    const broken = pretty(BASE).replace("\"ambiguityFlags\": [\n      \"free for whom is unclear\",\n      \"central lines undefined\"\n    ]",
      "\"ambiguityFlags\": \"free for whom is unclear\", \"central lines undefined\"");
    expect(panel(broken)).toEqual({ kind: "REFUSED", reason: "KEYLESS_LIST_ENTRY" });
  });

  it("a score inside a wrapper is never moved by A: the object goes on to B, the wrapper kept (pre-flight PF-S1)", () => {
    const result = panel(WRAPPED_QUALITY);
    expect(result).toMatchObject({ kind: "PARTIAL", base: WRAPPED, classification: { parseStatus: "SCHEMA_FAILED" } });
    expect((result as { classification: { parseError: string } }).classification.parseError).toContain("evidence.quality");
  });

  it("a text inside a wrapper at a scalar place is never dropped: the wrapper is kept as written (pre-flight PF-S1)", () => {
    const result = panel(pretty({ ...BASE, evidence: { quality: { value: "good" }, relevance: 0.7 } }));
    expect(result).toMatchObject({ kind: "PARTIAL", classification: { parseStatus: "SCHEMA_FAILED" } });
    expect((result as unknown as { base: { evidence: Record<string, unknown> } }).base.evidence.quality).toEqual({ value: "good" });
  });

  it("nothing readable at all is NO_OBJECT; prose around a decodable object is read by the decode, never dropped", () => {
    expect(panel("I would rate this node as fair.")).toEqual({ kind: "NO_OBJECT" });
    expect(panel(`Here it is:\n${pretty({ ...BASE, fallacy: { severity: 0.35 } })}`)).toMatchObject({ kind: "PARTIAL" });
  });
});

describe("A1 on the shape the later tasks' Haiku-path tests use", () => {
  it("a missing comma between two members is NO_OBJECT: no tree and no decode", () => {
    // Tasks 2 and 5 rely on it: `SCORE_BROKEN` (the BROKEN of lg-a-structure-repair.test.ts and lg-a-repair-wiring.test.ts)
    // must reach Haiku, never A1, and must get no B on a judge step.
    expect(salvageStructureReply({ content: SCORE_BROKEN, reply: STOP, answerForm: SCORE_FORM, textsKept: "place",
      classify: (text, reply) => classifyStructuredArtifact(text, SCORE_SCHEMA, reply, { fixer: {} }) })).toEqual({ kind: "NO_OBJECT" });
  });
});
