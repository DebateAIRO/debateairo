// tests/unit/lg-a-structure-repair.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { JUDGE_ANSWER_FORM, Judge, PANEL_ANSWER_FORM, PANEL_PROMPT_CONTRACT, classifyStructuredArtifact, judgeAssessmentSchema } from "@debateai/judgement";
import { STORYTELLER_ANSWER_FORM, STORY_CHECKER_ANSWER_FORM } from "@debateai/story";
import { TypedDomainError } from "@debateai/kernel";
import {
  CONTENT_FOLLOW_UP_SENTENCES, ProviderCallFailedError, STRUCTURE_REPAIR_CONTRACT_HASH, buildFramedPrompt, buildFramedRepairPrompt, decodeModelJson, framedAnswerForm,
  previewThinkingStepOf, readPromptFrame, schemaFailureLocator, structureRepairKeepsWords, structureRepairTextsKeptAt, withStructureRepair,
  type ProviderCallRequest
} from "@debateai/providers";
import { GLM, HAIKU_REF, previewGlmHarness, scriptedRepairGateway } from "../support/lg-a-harness.js";

const SCHEMA = z.object({ answer: z.string().min(1), score: z.number() }).strict();
const FORM = "Return only JSON {\"answer\": string, \"score\": number}.";
const framed = buildFramedPrompt({ contract: { contractId: "test.lg-a.v1", instruction: "Answer the question in one sentence.", answerForm: FORM },
  material: [{ name: "question", content: "Is it so?" }] });
function request(extra: Partial<ProviderCallRequest> = {}): ProviderCallRequest {
  return { runId: "run:lg-a", subjectItemId: "node:lg-a", callSiteKey: "JUDGE", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:lg-a", providerRef: "preview:fixture-a",
    packet: framed.packet, modelRole: "POSITION",
    classifyContent: (content, reply) => classifyStructuredArtifact(content, SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)), ...extra };
}
const BROKEN = "{\"answer\": \"It is so, by the city's own figures\" \"score\": 0.5}";
const COPY = "{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.5}";
const route = (reply: string | Error) => {
  const repair = scriptedRepairGateway(reply);
  return { ...repair, route: { providerRef: HAIKU_REF, gateway: repair.gateway, bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } } };
};

describe("LG-A framedAnswerForm: the step's own answer form, read back from its frame", () => {
  it("reads a one-line form and the storyteller's many-line form exactly", () => {
    expect(framedAnswerForm(framed.packet)).toBe(FORM);
    const story = buildFramedPrompt({ contract: { contractId: "story.storyteller.v3", instruction: "Tell it.", answerForm: STORYTELLER_ANSWER_FORM },
      material: [{ name: "points", content: "[]" }] });
    expect(framedAnswerForm(story.packet)).toBe(STORYTELLER_ANSWER_FORM);
  });
});

describe("LG-A structureRepairKeepsWords (deviation 4)", () => {
  // Fix round 2: the missing comma sits after a number. After a text, the tolerant decode (the step's own reading, ruling 2)
  // takes the quotes for the text's own (INNER_QUOTE) and reads one long text.
  const broken = "{\"answer\": \"The plan holds because fares cover costs\", \"score\": 0.5 \"ok\": true, \"note\": \"a stray remark from the model\"}";
  it("accepts a copy that only moves, wraps and drops form", () => {
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds because fares cover costs", score: 0.5, ok: true })).toBe(true);
    expect(structureRepairKeepsWords("{\"note\": [\"First text here.\", \"Second text here.\"]}",
      { note: { text: "First text here.\n\nSecond text here.", node_refs: [] } })).toBe(true);
  });
  it("refuses a changed word, an invented or changed number, an added true, and a lost text", () => {
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds because fares cover the costs", score: 0.5, ok: true })).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds because fares cover costs", score: 0.9, ok: true })).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds because fares cover costs", score: 0.5, ok: true, sure: true })).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "The plan holds", score: 0.5, ok: true })).toBe(false);
  });
  // Task 4 carry: `replyFailureClassOf` classes an object where a number belongs as STRUCTURE, so the repair call faces
  // wrapped scores. Unwrapping the AI's own number is form; a score the broken reply never gave is invented.
  it("unwraps a wrapped score, and refuses a score or a verdict the broken reply never gave", () => {
    const answer = "The plan holds because fares cover costs";
    expect(structureRepairKeepsWords(`{"answer": "${answer}", "fidelity": {"value": 0.7}}`, { answer, fidelity: 0.7 })).toBe(true);
    expect(structureRepairKeepsWords(`{"answer": "${answer}", "fidelity": {"value": "high"}}`, { answer, fidelity: 0.7 })).toBe(false);
    expect(structureRepairKeepsWords(`{"answer": "${answer}"}`, { answer, fidelity: 0.5 })).toBe(false);
    expect(structureRepairKeepsWords(`{"objection": "${answer}"}`, { objection: answer, satisfied: false })).toBe(false);
  });
  it("keeps a short id or label only as whole words of the broken reply", () => {
    const broken = "{\"answer\": \"The fares fall below the costs\" \"refs\": [\"node-1\"], \"fit\": \"strong\"}";
    expect(structureRepairKeepsWords(broken, { answer: "The fares fall below the costs", refs: ["node-1"], fit: "strong" })).toBe(true);
    expect(structureRepairKeepsWords(broken, { answer: "The fares fall below the costs", refs: ["node-1"], fit: "low" })).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "The fares fall below the costs", refs: ["node-12"], fit: "strong" })).toBe(false);
  });
});

/**
 * Task 12 review, fix round 1: the reviewer's probes, each pinned. Important 1: a repair that keeps only part of a text
 * (the rest moved to a key the step's fixer then drops) or makes a misspelt key's sentence shorter. Important 2: values
 * moved between fields (texts, scores, verdicts swapped), true/false read from prose, an enum label read from prose.
 * Minors: a key's name is never a text, and two fields' texts are never run together.
 */
describe("LG-A structureRepairKeepsWords: the reviewer's probes (fix round 1)", () => {
  const fixture = (name: string) => readFileSync(new URL(`../support/fixtures/judge-format-replies/${name}`, import.meta.url), "utf8");
  const unfence = (text: string) => text.replace(/^```json\n/u, "").replace(/\n```\s*$/u, "");

  it("refuses a text kept only in part (Important 1)", () => {
    expect(structureRepairKeepsWords("{\"answer\": \"It is so, but not by the city's own figures\" \"score\": 0.5}",
      { answer: "It is so, but", x: "It is so, but not by the city's own figures", score: 0.5 })).toBe(false);
    expect(structureRepairKeepsWords("{\"statment\": \"The plan holds because fares cover costs\", \"score\": 0.5}",
      { statement: "The plan holds", score: 0.5 })).toBe(false);
    // The misspelt key's whole sentence under the right name is the repair's job.
    expect(structureRepairKeepsWords("{\"statment\": \"The plan holds because fares cover costs\", \"score\": 0.5}",
      { statement: "The plan holds because fares cover costs", score: 0.5 })).toBe(true);
  });

  it("refuses a text the answer form states that the repair left out (Important 1 c)", () => {
    const broken = "{\"score\": 0.5 \"answer\": \"It is so\", \"note\": \"Only for the central lines\"}";
    expect(structureRepairKeepsWords(broken, { answer: "It is so", score: 0.5 }, "{\"answer\": string, \"note\": string, \"score\": number}")).toBe(false);
    expect(structureRepairKeepsWords(broken, { answer: "It is so", score: 0.5 }, "{\"answer\": string, \"score\": number}")).toBe(true);
  });

  it("the flattened judge reply: nesting is kept; swapped texts or swapped scores are refused (Important 2)", () => {
    const broken = fixture("mimo-judge-position-en-flattened-nested.txt");
    const raw = JSON.parse(broken) as Record<string, unknown>;
    const { steelman, fidelity, critic, counterargumentStrength, basis, ...rest } = raw;
    const nested = (s: unknown, f: unknown, c: unknown, k: unknown) => ({ ...rest,
      steelman: { summary: s, fidelity: f }, critic: { summary: c, counterargumentStrength: k, basis } });
    expect(structureRepairKeepsWords(broken, nested(steelman, fidelity, critic, counterargumentStrength), JUDGE_ANSWER_FORM)).toBe(true);
    expect(structureRepairKeepsWords(broken, nested(critic, fidelity, steelman, counterargumentStrength), JUDGE_ANSWER_FORM)).toBe(false);
    expect(structureRepairKeepsWords(broken, nested(steelman, counterargumentStrength, critic, fidelity), JUDGE_ANSWER_FORM)).toBe(false);
  });

  it("the nested judge reply: swapped summaries are refused (Important 2)", () => {
    const raw = JSON.parse(unfence(fixture("mimo-judge-position-ro-no-value-laden.txt"))) as Record<string, Record<string, unknown>>;
    const whole = JSON.stringify({ ...raw, value_laden: false });
    const broken = whole.replace("},\"critic\"", "} \"critic\"");
    expect(structureRepairKeepsWords(broken, JSON.parse(whole), JUDGE_ANSWER_FORM)).toBe(true);
    const swapped = { ...raw, value_laden: false, steelman: { ...raw.steelman, summary: raw.critic!.summary },
      critic: { ...raw.critic, summary: raw.steelman!.summary } };
    expect(structureRepairKeepsWords(broken, swapped, JUDGE_ANSWER_FORM)).toBe(false);
  });

  it("the story checker: a moved criterion and a flipped verdict are refused, prose 'true' is no value (Important 2)", () => {
    const criteria = { faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: false,
      citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true };
    const objection = "It is true that fares fell, and true that riders rose, but the summary says the plan saved the budget, which P7 does not show.";
    const broken = `{"satisfied": false "objection": ${JSON.stringify(objection)}, "criteria": ${JSON.stringify(criteria)}}`;
    expect(structureRepairKeepsWords(broken, { satisfied: false, objection, criteria }, STORY_CHECKER_ANSWER_FORM)).toBe(true);
    expect(structureRepairKeepsWords(broken, { satisfied: false, objection,
      criteria: { ...criteria, no_overstatement: true, citations_correct: false } }, STORY_CHECKER_ANSWER_FORM)).toBe(false);
    expect(structureRepairKeepsWords(broken, { satisfied: true, objection,
      criteria: { ...criteria, no_overstatement: true } }, STORY_CHECKER_ANSWER_FORM)).toBe(false);
  });

  it("true/false values are never swapped between fields (Important 2)", () => {
    expect(structureRepairKeepsWords("{\"satisfied\": false \"value_laden\": true}", { satisfied: true, value_laden: false })).toBe(false);
    expect(structureRepairKeepsWords("{\"satisfied\": false \"value_laden\": true}", { satisfied: false, value_laden: true })).toBe(true);
  });

  it("an enum label is a whole value of the broken reply, never a word of its prose (Important 2)", () => {
    const broken = "{\"x\": 1 \"summary\": \"The claim is supported by nothing the material gives\", \"basis\": \"unsupported\"}";
    expect(structureRepairKeepsWords(broken, { summary: "The claim is supported by nothing the material gives", basis: "supported" })).toBe(false);
    expect(structureRepairKeepsWords(broken, { summary: "The claim is supported by nothing the material gives", basis: "unsupported" })).toBe(true);
  });

  it("a key's name is never a text, and two fields' texts are never run together (minors)", () => {
    expect(structureRepairKeepsWords("{\"a\":\"fares rise\" \"b\":\"costs fall\"}", { a: "fares rise b costs fall" })).toBe(false);
    expect(structureRepairKeepsWords("{\"a\":\"fares rise\" \"b\":\"costs fall\"}", { a: "fares rise costs fall" })).toBe(false);
    expect(structureRepairKeepsWords("{\"strong\":\"x\" \"fit\":\"weak\"}", { fit: "strong" })).toBe(false);
    // The same two, in a reply the tolerant decode does not read (so the raw text is scanned).
    expect(structureRepairKeepsWords("{\"x\": 1 \"a\":\"fares rise\", \"b\":\"costs fall\"}", { a: "fares rise b costs fall" })).toBe(false);
    expect(structureRepairKeepsWords("{\"x\": 1 \"a\":\"fares rise\", \"b\":\"costs fall\"}", { a: "fares rise costs fall" })).toBe(false);
    expect(structureRepairKeepsWords("{\"x\": 1 \"strong\":\"x\", \"fit\":\"weak\"}", { fit: "strong" })).toBe(false);
    // A number is a JSON value, never a digit of an id or of prose.
    expect(structureRepairKeepsWords("{\"refs\": [\"node-1\"], \"why\": \"fares rose 7 percent\" \"x\": 1}", { refs: ["node-1"], why: "fares rose 7 percent", score: 7 })).toBe(false);
  });

  it("still keeps every form-only move: a lifted member, a dropped wrapper, a new wrapper, a straight quote inside a text", () => {
    const note = { text: "The reviewer found the second section thin.", node_refs: ["P2"] };
    const sections = [{ title: "Fares", paragraphs: [{ text: "Fares fell.", node_refs: ["P1"] }] }];
    expect(structureRepairKeepsWords(`{"long": {"sections": ${JSON.stringify(sections)}, "reviewer_note": ${JSON.stringify(note)}} "reviewer_note": null}`,
      { long: { sections }, reviewer_note: note }, STORYTELLER_ANSWER_FORM)).toBe(true);
    expect(structureRepairKeepsWords("{\"response\": {\"answer\": \"It is so\" \"score\": 0.5}}", { answer: "It is so", score: 0.5 })).toBe(true);
    expect(structureRepairKeepsWords("{\"x\": 1 \"headline\": \"Free buses help\", \"summary\": \"They help riders most.\"}",
      { short: { headline: "Free buses help", summary: "They help riders most." } })).toBe(true);
    expect(structureRepairKeepsWords("{\"answer\": \"He said \"no\" today\" \"score\": 0.5}", { answer: "He said \"no\" today", score: 0.5 })).toBe(true);
  });
});

/**
 * Task 12 review, fix round 2: the reviewer's second probes, each pinned. Important 1: a text used twice, or moved into a
 * field the broken reply never had while its own parent stays. Important 2: replies the tolerant decode reads are read
 * that way (the step's own reading), and the raw scan keeps a Romanian or Polish quote closed with a straight one.
 * Minors: joined paragraphs keep their order; the names a form states are its keys, not its prose.
 */
describe("LG-A structureRepairKeepsWords: the reviewer's second probes (fix round 2)", () => {
  const fixture = (name: string) => readFileSync(new URL(`../support/fixtures/judge-format-replies/${name}`, import.meta.url), "utf8");
  const H = "Free buses help riders most";
  const N = "The reviewer found the second section thin.";
  const sections = [{ title: "Fares", paragraphs: [{ text: "Fares fell.", node_refs: ["P1"] }] }];
  const story = `{"headline": "${H}" "long": {"sections": ${JSON.stringify(sections)}, "reviewer_note": {"text": "${N}", "node_refs": ["P2"]}}}`;
  const note = { text: N, node_refs: ["P2"] };

  it("refuses a note moved or copied into a field the broken story never had (Important 1)", () => {
    expect(structureRepairKeepsWords(story, { short: { headline: H, change: note }, long: { sections } }, STORYTELLER_ANSWER_FORM)).toBe(false);
    expect(structureRepairKeepsWords(story, { short: { headline: H, change: note }, long: { sections, reviewer_note: note } }, STORYTELLER_ANSWER_FORM)).toBe(false);
    expect(structureRepairKeepsWords(story, { short: { headline: H, summary: H }, long: { sections, reviewer_note: note } }, STORYTELLER_ANSWER_FORM)).toBe(false);
    expect(structureRepairKeepsWords(story, { short: { headline: H, summary: "Fares fell." }, long: { sections, reviewer_note: note } }, STORYTELLER_ANSWER_FORM)).toBe(false);
    expect(structureRepairKeepsWords(story, { short: { headline: H }, long: { sections, reviewer_note: note } }, STORYTELLER_ANSWER_FORM)).toBe(true);
  });

  it("refuses the critic's summary copied into a missing root summary (Important 1)", () => {
    const A = "The plan holds because fares cover costs";
    const O = "Riders on the outer lines pay for a centre they rarely use";
    expect(structureRepairKeepsWords(`{"steelman": {"summary": "${A}"} "critic": {"summary": "${O}"}}`,
      { summary: O, steelman: { summary: A }, critic: { summary: O } }, "{\"summary\": string, \"steelman\": {\"summary\": string}, \"critic\": {\"summary\": string}}")).toBe(false);
  });

  it("still keeps a lift, a dropped wrapper and a rewrap (Important 1)", () => {
    expect(structureRepairKeepsWords(`{"long": {"sections": ${JSON.stringify(sections)}, "reviewer_note": ${JSON.stringify(note)}} "reviewer_note": null}`,
      { long: { sections }, reviewer_note: note }, STORYTELLER_ANSWER_FORM)).toBe(true);
    expect(structureRepairKeepsWords("{\"response\": {\"x\": \"It is so\" \"score\": 0.5}}", { x: "It is so", score: 0.5 })).toBe(true);
    expect(structureRepairKeepsWords(`{"response": {"x": 1 "headline": "${H}", "summary": "They help."}}`, { short: { headline: H, summary: "They help." } })).toBe(true);
  });

  it("accepts a faithful copy of the real straight-quote fixtures (Important 2)", () => {
    for (const name of ["mimo-judge-attack-ro-straight-quote.txt", "mimo-judge-cross-en-stray-quote.txt", "mimo-panel-pl-critique-for-critic.txt"]) {
      const text = fixture(name);
      const decoded = decodeModelJson(text, { finishReason: "stop" });
      expect(decoded.ok, name).toBe(true);
      expect(structureRepairKeepsWords(text, decoded.ok ? decoded.value : null, JUDGE_ANSWER_FORM), name).toBe(true);
    }
    // A reply the decode does not read: the scan keeps „…", ci … inside the text.
    const text = "Nu este „evident corectă\", ci doar discutabilă";
    expect(structureRepairKeepsWords(`{"x": 1 "summary": ${JSON.stringify(text).replace("\\\"", "\"")}}`, { summary: text })).toBe(true);
  });

  it("a key written twice keeps its last value, as JSON.parse reads it (Important 2)", () => {
    const O = "Riders on the outer lines pay for a centre they rarely use";
    expect(structureRepairKeepsWords(`{"satisfied": true, "objection": "${O}", "satisfied": false}`, { satisfied: true, objection: O })).toBe(false);
    expect(structureRepairKeepsWords(`{"satisfied": true, "objection": "${O}" "satisfied": false}`, { satisfied: true, objection: O })).toBe(false);
    expect(structureRepairKeepsWords(`{"satisfied": true, "objection": "${O}" "satisfied": false}`, { satisfied: false, objection: O })).toBe(true);
  });

  it("joined paragraphs keep their order and each paragraph once (minor)", () => {
    const broken = "{\"x\": 1 \"note\": [\"First text here.\", \"Second text here.\"]}";
    expect(structureRepairKeepsWords(broken, { note: { text: "First text here.\n\nSecond text here.", node_refs: [] } })).toBe(true);
    expect(structureRepairKeepsWords(broken, { note: { text: "Second text here.\n\nFirst text here.", node_refs: [] } })).toBe(false);
    expect(structureRepairKeepsWords(broken, { note: { text: "First text here.\n\nFirst text here.", node_refs: [] } })).toBe(false);
  });

  // Fix round 3: a story's node_refs all sit under one path (list positions are left out), and repeated refs are normal.
  // The join search remembers what failed, so 40 equal entries and a word that never matches stay quick.
  it("a join over many equal entries that cannot match ends quickly (fix round 3)", () => {
    const entries = 40;
    const broken = JSON.stringify({ refs: Array.from({ length: entries }, () => "ok") });
    const wanted = `${Array.from({ length: entries / 2 }, () => "ok").join(" ")} no`;
    const started = performance.now();
    expect(structureRepairKeepsWords(broken, { refs: [wanted] })).toBe(false);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("the names a form states are its quoted keys and its {a,b,c} lists, not its prose (minor)", () => {
    const stray = `{"x": 1 "headline": "${H}", "the": "A stray remark from the model"}`;
    expect(structureRepairKeepsWords(stray, { short: { headline: H } }, STORYTELLER_ANSWER_FORM)).toBe(true);
    // The writer's form names its members in a brace list, unquoted: a text under one of them must survive.
    const reply = "{\"x\": 1 \"segment_id\": \"s1\", \"summary_line\": \"A stray line from the model\"}";
    expect(structureRepairKeepsWords(reply, { segment_id: "s1" }, "Return only JSON with {segment_id,summary_line} entries.")).toBe(false);
    expect(structureRepairKeepsWords(reply, { segment_id: "s1" }, "Return only JSON with a segment_id and a summary_line.")).toBe(true);
  });
});

/**
 * Task 12b (practice 2026-10-16, transcript seq 475 and 477): GLM's panel judgement wrote a sentence with no key name inside
 * `evidence` (invalid JSON) and its usual extra `fallacy.description`; Haiku put the rest in the form word for word and left
 * those two out. The judgement steps' own fixer drops such texts, so the check now keeps a text only where the step keeps
 * it (controller ruling): a keyless text may go; on the judge legs, the panel and the reviews a text must stay only where
 * the form states its key at that very place; the steps that keep every declared text keep today's rule.
 */
describe("LG-A Task 12b: a text is kept where the step's own fixer keeps it", () => {
  const replies = (name: string) => readFileSync(new URL(`../support/fixtures/structure-repair-replies/${name}`, import.meta.url), "utf8");
  const BROKEN_PANEL = replies("glm-panel-keyless-evidence-text-broken.txt");
  const HAIKU_PANEL = replies("glm-panel-keyless-evidence-text-haiku-repair.txt");
  const PANEL_KEY = "PANEL:JUDGE:cross-root:2->3:preview:fixture-a";
  const place = { textsKept: "place" as const };

  it("the step's own call-site key says where texts are kept", () => {
    for (const key of [PANEL_KEY, "PANEL:root", "JUDGE", "JUDGE:critic:root0:r2:p0", "JUDGE:cross-root:0->1", "JUDGE:review:node-1",
      "REPAIR:STRUCTURE:PANEL:root"]) expect(structureRepairTextsKeptAt(key, "served"), key).toBe("place");
    for (const [key, lane] of [["COMPOSER:SYNTHESIZER:INITIAL:1", "served"], ["POST_COMPOSE_R9:EVALUATOR:1", "served"],
      ["STORY:STORYTELLER:1", "story"], ["STORY:CHECKER:2", "story"], ["MAP:angles", "served"], ["VERDICT:judge:1", "served"],
      ["CONFORMANCE:SEGMENT", "served"]] as const) expect(structureRepairTextsKeptAt(key, lane), key).toBe("anywhere");
  });

  it("accepts the practice run's panel repair: a keyless sentence and fallacy.description left out", () => {
    const repaired = JSON.parse(HAIKU_PANEL) as unknown;
    expect(structureRepairKeepsWords(BROKEN_PANEL, repaired, PANEL_ANSWER_FORM, place)).toBe(true);
    // A step that keeps every declared text would still need `description` (the form states it, in a fatal flag).
    expect(structureRepairKeepsWords(BROKEN_PANEL, repaired, PANEL_ANSWER_FORM)).toBe(false);
  });

  it("is rescued by A1 before the repair call, equal to Haiku's copy", async () => {
    const panelFramed = buildFramedPrompt({ contract: PANEL_PROMPT_CONTRACT, material: [{ name: "statement", content: "The statement." }] });
    const original = previewGlmHarness([{ content: BROKEN_PANEL }]);
    const repair = route(HAIKU_PANEL);
    const result = await withStructureRepair(original.gateway, repair.route).call(request({
      callSiteKey: PANEL_KEY, packet: panelFramed.packet, modelRole: "JUDGE",
      classifyContent: (content, reply) => classifyStructuredArtifact(content, judgeAssessmentSchema, reply, { fixer: {} }),
      buildRepairPacket: (rejected) => buildFramedRepairPrompt(panelFramed, schemaFailureLocator(rejected)) }));
    expect(repair.requests).toHaveLength(0);
    expect(result.repairForm).toBeUndefined();
    expect(JSON.parse(result.content)).toEqual(JSON.parse(HAIKU_PANEL));
  });

  it("still refuses a repair that leaves out a text the form states at that place", () => {
    const repaired = JSON.parse(HAIKU_PANEL) as { context: { ambiguityFlags: string[] }; critic: Record<string, unknown> };
    const fewerFlags = { ...repaired, context: { ...repaired.context, ambiguityFlags: repaired.context.ambiguityFlags.slice(1) } };
    expect(structureRepairKeepsWords(BROKEN_PANEL, fewerFlags, PANEL_ANSWER_FORM, place)).toBe(false);
    const { summary: _dropped, ...criticWithoutSummary } = repaired.critic;
    expect(structureRepairKeepsWords(BROKEN_PANEL, { ...repaired, critic: criticWithoutSummary }, PANEL_ANSWER_FORM, place)).toBe(false);
    // The round-1 probes that rest on this rule, on a "place" step: a stated root note, a stated list's entry, a text made null.
    expect(structureRepairKeepsWords("{\"score\": 0.5 \"answer\": \"It is so\", \"note\": \"Only for the central lines\"}",
      { answer: "It is so", score: 0.5 }, "{\"answer\": string, \"note\": string, \"score\": number}", place)).toBe(false);
    expect(structureRepairKeepsWords("{\"x\": 1 \"why\": [\"Fares fell.\", \"Riders rose.\"]}", { why: ["Fares fell."] }, "{\"why\": [string]}", place)).toBe(false);
    expect(structureRepairKeepsWords("{\"x\": 1 \"objection\": \"Riders rose.\", \"satisfied\": false}", { objection: null, satisfied: false },
      "{\"satisfied\": boolean, \"objection\": null | string}", place)).toBe(false);
    // Without a form, a key the repair keeps (here holding null) is a stated place.
    expect(structureRepairKeepsWords("{\"x\": 1 \"objection\": \"Riders rose.\", \"satisfied\": false}", { objection: null, satisfied: false },
      undefined, place)).toBe(false);
  });

  it("a text under a name the story's form states elsewhere is still required on a story step", () => {
    const H = "Free buses help riders most";
    const broken = `{"x": 1 "short": {"headline": "${H}", "text": "A stray sentence from the model"}}`;
    expect(structureRepairTextsKeptAt("STORY:STORYTELLER:1", "story")).toBe("anywhere");
    expect(structureRepairKeepsWords(broken, { short: { headline: H } }, STORYTELLER_ANSWER_FORM)).toBe(false);
    expect(structureRepairKeepsWords(broken, { short: { headline: H } }, STORYTELLER_ANSWER_FORM, place)).toBe(true);
  });

  it("a sentence with no key name of its own may be left out on every step", () => {
    const broken = "{\"x\": 1 \"answer\": \"It is so\", \"a sentence the model wrote with no key\", \"score\": 0.5}";
    expect(structureRepairKeepsWords(broken, { answer: "It is so", score: 0.5 }, FORM)).toBe(true);
    expect(structureRepairKeepsWords(broken, { answer: "It is so", score: 0.5 }, FORM, place)).toBe(true);
    // A keyless sentence is never a source for a field, not even joined to the text before it.
    expect(structureRepairKeepsWords(broken, { answer: "It is so a sentence the model wrote with no key", score: 0.5 }, FORM)).toBe(false);
  });
});

/**
 * Task 12b round 2 (the reviewer's probes 12n-12q, each pinned): an outer wrapper is no new place on a "place" step; a
 * keyless value right after a key the form states as a list is that list's entry (a missing `[`); a fatal flag written
 * flat in `fallacy` must survive while GLM's lone `fallacy.description` may go; the form is read in linear time.
 */
describe("LG-A Task 12b round 2: wrappers, a missing [, a flat fatal flag", () => {
  const SM = "The strongest form says fares cover costs on the central lines";
  const CS = "A plausible counter is that riders on the outer lines pay for it";
  const base = { steelman: { summary: SM, fidelity: 0.8 }, critic: { summary: CS, counterargumentStrength: 0.6, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.5, relevance: 0.7 }, context: { fit: 0.6, ambiguityFlags: ["free for whom is unclear", "central lines undefined"] },
    fallacy: { severity: 0.9, fatalFlags: [{ type: "strawman", severity: 0.9, description: "It attacks a fare rise no one proposed" }] } };
  type Panel = typeof base;
  const edit = (change: (copy: Panel) => void): Panel => { const copy = structuredClone(base); change(copy); return copy; };
  const lossy = edit((copy) => { copy.context.ambiguityFlags = []; copy.fallacy.fatalFlags = []; });
  const both = (broken: string, repaired: unknown) => [
    structureRepairKeepsWords(broken, repaired, PANEL_ANSWER_FORM, { textsKept: "place" }),
    structureRepairKeepsWords(broken, repaired, PANEL_ANSWER_FORM, { textsKept: "anywhere" })];

  it("an outer wrapper is read at the places it wraps (Important 1)", () => {
    const wrapped = JSON.stringify({ response: base });
    expect(both(wrapped, base)).toEqual([true, true]);
    expect(both(wrapped, lossy)).toEqual([false, false]);
    expect(both(wrapped.replace("\"fidelity\":0.8,", "\"fidelity\":0.8 "), lossy)).toEqual([false, false]);
    expect(both(JSON.stringify(base), lossy)).toEqual([false, false]);
    // The practice run's slip inside a wrapper (PARSE_FAILED, class STRUCTURE): the keyless sentence may go, the flags may not.
    const slip = wrapped.replace("\"quality\":0.5,", "\"quality\":0.5, \"the sources are mostly local news\",");
    expect(both(slip, base)).toEqual([true, true]);
    expect(both(slip, lossy)).toEqual([false, false]);
  });

  it("a value after a list key that lost its [ is that list's entry (Important 2)", () => {
    const noBracket = JSON.stringify(base).replace("\"ambiguityFlags\":[\"free for whom is unclear\",\"central lines undefined\"]",
      "\"ambiguityFlags\":\"free for whom is unclear\",\"central lines undefined\"");
    expect(both(noBracket, base)).toEqual([true, true]);
    expect(both(noBracket, edit((copy) => { copy.context.ambiguityFlags = ["free for whom is unclear"]; }))).toEqual([false, false]);
    const flags = JSON.stringify(base).replace("\"fatalFlags\":[{\"type\":\"strawman\",\"severity\":0.9,\"description\":\"It attacks a fare rise no one proposed\"}]",
      "\"fatalFlags\":{\"type\":\"strawman\",\"severity\":0.9,\"description\":\"It attacks a fare rise no one proposed\"},{\"type\":\"ad_hominem\",\"severity\":0.8,\"description\":\"It calls the planners lazy\"}");
    const two = edit((copy) => { copy.fallacy.fatalFlags.push({ type: "ad_hominem", severity: 0.8, description: "It calls the planners lazy" }); });
    expect(both(flags, two)).toEqual([true, true]);
    expect(both(flags, base)).toEqual([false, false]);
    // The practice case stays droppable: a sentence after `quality`, a number, is no list's entry.
    const keyless = JSON.stringify(base).replace(`"summary":"${CS}",`, `"summary":"${CS}", "and the city budget is small",`);
    expect(both(keyless, base)).toEqual([true, true]);
    expect(both(keyless, edit((copy) => { copy.critic.summary = `${CS} and the city budget is small`; }))).toEqual([false, false]);
  });

  it("a fatal flag written flat in fallacy must survive; a lone fallacy.description may go (minor)", () => {
    const flat = JSON.stringify(edit((copy) => {
      (copy as { fallacy: unknown }).fallacy = { severity: 0.9, type: "strawman", description: "It attacks a fare rise no one proposed" };
    }));
    expect(both(flat, edit((copy) => { copy.fallacy.fatalFlags = []; }))).toEqual([false, false]);
    const lone = JSON.stringify(edit((copy) => {
      (copy as { fallacy: unknown }).fallacy = { severity: 0.9, fatalFlags: [], description: "No fatal fallacy, only a vague hedge" };
    }));
    expect(both(lone, edit((copy) => { copy.fallacy.fatalFlags = []; }))).toEqual([true, false]);
  });

  it("reads a form with long runs of tabs in linear time (CodeQL #67)", () => {
    const form = `{${`"k"${"\t".repeat(50000)}x, `.repeat(8)}"answer": string}`;
    const started = performance.now();
    expect(structureRepairKeepsWords("{\"answer\": \"It is so\"}", { answer: "It is so" }, form, { textsKept: "place" })).toBe(true);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("maps every call-site family to its rule (probes 12o, 12p)", () => {
    for (const key of ["JUDGE", "JUDGE:root:0", "JUDGE:root:1:seat:main", "JUDGE:defender:root1:r1:p0", "JUDGE:critic:root0:r2:p0",
      "JUDGE:cross-root:0->1", "PANEL:root", "PANEL:root:preview:mimo-v2-6-pro:seat:runnerUp", "JUDGE:review:node-1",
      "JUDGE:review:catch-up:node-1", "REPAIR:STRUCTURE:PANEL:root", "REPAIR:STRUCTURE:JUDGE:review:node-1", "JUDGE:root:0:close-call",
      "PANEL:JUDGE:root:0", "PANEL:root:close-call"]) expect(structureRepairTextsKeptAt(key, "served"), key).toBe("place");
    for (const [key, lane] of [["COMPOSER:SYNTHESIZER:RETRY:2:seat:main", "served"], ["STORY:STORYTELLER:1", "served"], ["MAP:list:0", "served"],
      ["MAP:merge", "served"], ["MAP:gap:1", "served"], ["MAP:choose", "served"], ["VERDICT:investigate:1", "served"],
      ["evaluator.grade-judge-output.v1", "served"], ["SOMETHING:new", "served"], ["JUDGE:consideration:root:0", "served"], ["PANEL", "served"],
      ["JUDGE:review", "served"], ["STOPPING:round:2", "served"]] as const) expect(structureRepairTextsKeptAt(key, lane), key).toBe("anywhere");
  });
});

/**
 * Task 12b round 3 (the reviewer's probes 12r and 12s, each pinned): a keyless value after a list that WAS closed stays
 * keyless (droppable, never a source); only a list key whose own value was a bare text (a real missing `[`) takes the
 * values after it. A wrapper named like a root key of the form is no new place either.
 */
describe("LG-A Task 12b round 3: a closed list, a wrapper named like a root key", () => {
  const SM = "The strongest form says fares cover costs on the central lines";
  const CS = "A plausible counter is that riders on the outer lines pay for it";
  const F1 = { type: "strawman", severity: 0.9, description: "It attacks a fare rise no one proposed" };
  const F2 = { type: "ad_hominem", severity: 0.8, description: "It calls the planners lazy" };
  const base = { steelman: { summary: SM, fidelity: 0.8 }, critic: { summary: CS, counterargumentStrength: 0.6, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.5, relevance: 0.7 }, context: { fit: 0.6, ambiguityFlags: ["free for whom is unclear", "central lines undefined"] },
    fallacy: { severity: 0.9, fatalFlags: [F1] as { type: string; severity: number; description: string }[] } };
  type Panel = typeof base;
  const edit = (change: (copy: Panel) => void): Panel => { const copy = structuredClone(base); change(copy); return copy; };
  const lossy = edit((copy) => { copy.context.ambiguityFlags = []; copy.fallacy.fatalFlags = []; });
  const slip = (text: string) => text.replace("\"quality\":0.5,", "\"quality\":0.5, \"the sources are mostly local news\",");
  const both = (broken: string, repaired: unknown) => [
    structureRepairKeepsWords(broken, repaired, PANEL_ANSWER_FORM, { textsKept: "place" }),
    structureRepairKeepsWords(broken, repaired, PANEL_ANSWER_FORM, { textsKept: "anywhere" })];

  it("a sentence after a closed list may be left out and is never a new flag (Important 1)", () => {
    const afterList = JSON.stringify(base).replace("\"central lines undefined\"]", "\"central lines undefined\"], \"and fares may rise later\"");
    expect(both(afterList, base)).toEqual([true, true]);
    expect(both(afterList, edit((copy) => { copy.context.ambiguityFlags.push("and fares may rise later"); }))).toEqual([false, false]);
    expect(both(afterList, edit((copy) => { copy.critic.summary = `${CS} and fares may rise later`; }))).toEqual([false, false]);
    const afterListNumber = JSON.stringify(base).replace("\"central lines undefined\"]", "\"central lines undefined\"], 0.2");
    expect(both(afterListNumber, edit((copy) => { copy.context.fit = 0.2; }))).toEqual([false, false]);
  });

  it("a wrapper named like a root key is no new place (minor)", () => {
    for (const wrapper of ["context", "fallacy", "evidence", "steelman"]) {
      const broken = slip(JSON.stringify({ [wrapper]: base }));
      expect(both(broken, base), wrapper).toEqual([true, true]);
      expect(both(broken, lossy), wrapper).toEqual([false, false]);
      expect(both(broken, edit((copy) => { copy.context.ambiguityFlags = []; })), wrapper).toEqual([false, false]);
      expect(both(broken, edit((copy) => { copy.fallacy.fatalFlags = []; })), wrapper).toEqual([false, false]);
      expect(both(broken, edit((copy) => { copy.context.ambiguityFlags = ["free for whom is unclear"]; })), wrapper).toEqual([false, false]);
    }
    expect(both(slip(JSON.stringify({ response: { fallacy: base } })), lossy)).toEqual([false, false]);
    expect(both(slip(JSON.stringify({ steelman: { response: base } })), lossy)).toEqual([false, false]);
  });

  it("flat fatal flags written in fallacy: dropping is refused; a key written twice keeps only its last value", () => {
    const twoFlat = slip(JSON.stringify(base).replace(`"fatalFlags":[${JSON.stringify(F1)}]`,
      "\"type\":\"strawman\",\"description\":\"It attacks a fare rise no one proposed\",\"type\":\"ad_hominem\",\"description\":\"It calls the planners lazy\",\"fatalFlags\":[]"));
    expect(both(twoFlat, edit((copy) => { copy.fallacy.fatalFlags = []; }))).toEqual([false, false]);
    // As JSON.parse reads the reply, the first flag's type and description are gone, and its severity was never written:
    // keeping both flags, or the second with the fallacy's own severity reused, invents values. Refused (the safe side).
    expect(both(twoFlat, edit((copy) => { copy.fallacy.fatalFlags = [{ ...F1 }, { ...F2, severity: 0.9 }]; }))).toEqual([false, false]);
    expect(both(twoFlat, edit((copy) => { copy.fallacy.fatalFlags = [{ type: F2.type, severity: 0.9, description: F2.description }]; }))).toEqual([false, false]);
    const oneFlat = slip(JSON.stringify(base).replace(`"fatalFlags":[${JSON.stringify(F1)}]`,
      "\"type\":\"strawman\",\"description\":\"It attacks a fare rise no one proposed\",\"fatalFlags\":[]"));
    expect(both(oneFlat, edit((copy) => { copy.fallacy.fatalFlags = []; }))).toEqual([false, false]);
    expect(both(oneFlat, base)).toEqual([false, false]);
  });
});

describe("LG-A withStructureRepair (L32)", () => {
  it("is the gateway itself with no route, and refuses a route it cannot use", () => {
    const { gateway } = previewGlmHarness([]);
    expect(withStructureRepair(gateway, null)).toBe(gateway);
    expect(() => withStructureRepair(gateway, { providerRef: " ", gateway, bound: { tokenCeiling: 1, deadlineMs: 1 } }))
      .toThrow("STRUCTURE_REPAIR_ROUTE_INVALID");
  });

  it("sends ONE structure-repair call, word for word, and keeps the original AI as the author", async () => {
    const original = previewGlmHarness([{ content: BROKEN }]);
    const repair = route(COPY);
    const result = await withStructureRepair(original.gateway, repair.route).call(request());
    expect(result).toMatchObject({ content: COPY, repairForm: "STRUCTURE", repairAttempts: 1, maker: "Z.AI", model: GLM,
      rawArtifactRef: original.artifacts[0]!.artifactId, ledgerEntryRef: original.ledger[0]!.attemptId });
    expect(original.executions).toHaveLength(1);
    const sent = repair.requests[0]!;
    expect(repair.requests).toHaveLength(1);
    expect(sent).toMatchObject({ callSiteKey: "REPAIR:STRUCTURE:JUDGE", role: "JUDGE", lane: "served", runId: "run:lg-a",
      subjectItemId: "node:lg-a", providerRef: HAIKU_REF, contractHash: STRUCTURE_REPAIR_CONTRACT_HASH,
      bound: { maxAttempts: 3, tokenCeiling: 32768, deadlineMs: 1_260_000 } });
    // Final review M-1: one POST by construction, whatever gateway the route names.
    expect(sent.maxAttemptsThisCall).toBe(1);
    for (const absent of ["thinkingLevel", "repairThinkingLevel", "buildRepairPacket", "modelRole", "structureRepairRouted", "preferredResponseFormat"] as const) {
      expect(sent[absent]).toBeUndefined();
    }
    const frame = readPromptFrame(sent.packet);
    expect(frame.contractId).toBe("repair.structure.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(["answer_form", "broken_reply", "machine_rejection_code", "machine_rejection_path"]);
    expect(frame.fields[0]!.content).toBe(FORM);
    expect(frame.fields[1]!.content).toBe(BROKEN);
  });

  it("refuses a repair that changes a word or a number: the call ends as today, with the original's facts", async () => {
    for (const changed of ["{\"answer\": \"It is so, by the city's figures\", \"score\": 0.5}", "{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.9}"]) {
      const original = previewGlmHarness([{ content: BROKEN }]);
      // The error is awaited first: the original's artifact exists only once the call has run.
      const error = await withStructureRepair(original.gateway, route(changed).route).call(request()).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 1, lastRawArtifactRef: original.artifacts[0]!.artifactId });
    }
  });

  it("refuses a repair that turns a wrapped non-number into an invented score (Task 4 carry)", async () => {
    const wrapped = "{\"answer\": \"It is so, by the city's own figures\", \"score\": {\"value\": \"high\"}}";
    const original = previewGlmHarness([{ content: wrapped }]);
    const repair = route("{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.7}");
    const error = await withStructureRepair(original.gateway, repair.route).call(request()).catch((caught: unknown) => caught);
    expect(repair.requests).toHaveLength(1);
    expect(error).toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 1, lastRawArtifactRef: original.artifacts[0]!.artifactId });
    expect(original.executions).toHaveLength(1);
  });

  it("refuses a repair the step's fixer would cut down: a part kept, the rest under a key it drops (Important 1)", async () => {
    const broken = "{\"answer\": \"It is so, but not by the city's own figures\" \"score\": 0.5}";
    const original = previewGlmHarness([{ content: broken }]);
    const repair = route("{\"answer\": \"It is so, but\", \"x\": \"It is so, but not by the city's own figures\", \"score\": 0.5}");
    const error = await withStructureRepair(original.gateway, repair.route).call(request()).catch((caught: unknown) => caught);
    expect(repair.requests).toHaveLength(1);
    expect(error).toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED", attempts: 1, lastRawArtifactRef: original.artifacts[0]!.artifactId });
  });

  it("a repair call that fails leaves today's refusal; a money stop passes through as itself", async () => {
    const failed = previewGlmHarness([{ content: BROKEN }]);
    await expect(withStructureRepair(failed.gateway, route(new ProviderCallFailedError(new Error("busy"), 1, "FAILED", "ledger:x")).route)
      .call(request())).rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED" });
    const money = previewGlmHarness([{ content: BROKEN }]);
    await expect(withStructureRepair(money.gateway, route(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "spent")).route)
      .call(request())).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
  });

  it("the repair packet for an unreadable reply carries its code and never the full re-ask's sentence (fix round 1)", async () => {
    const unreadable = previewGlmHarness([{ content: "It is so, by the city's own figures." }]);
    const repair = route(COPY);
    await withStructureRepair(unreadable.gateway, repair.route).call(request()).catch(() => undefined);
    expect(repair.requests).toHaveLength(1);
    const sent = repair.requests[0]!;
    expect(readPromptFrame(sent.packet).fields.find((field) => field.name === "machine_rejection_code")!.content).toBe("PARSE_FAILED");
    expect(JSON.stringify(sent.packet)).not.toContain(CONTENT_FOLLOW_UP_SENTENCES.STRUCTURE_UNREAD);
  });

  // Ruling R9 (pre-flight PF-A48): the run's attempt ceiling, raised unwrapped by the repair gateway's `assertAttemptAllowed`
  // before it sends (`@debateai/budget` assertModelAttemptAllowed), is the run's own stop: it passes through as itself.
  it("the run's attempt ceiling on the repair call passes through as itself, not as a content refusal", async () => {
    const ceiling = new TypedDomainError("RUN_COST_ENVELOPE_EXHAUSTED", "the next call would be attempt 41 of a SERVE ceiling of 40");
    const original = previewGlmHarness([{ content: BROKEN }]);
    const error = await withStructureRepair(original.gateway, route(ceiling).route).call(request()).catch((caught: unknown) => caught);
    expect(error).toBe(ceiling);
    expect(original.executions).toHaveLength(1);
  });

  it("does not route the dormant evaluator lane or a call with no content check", async () => {
    const inner: ProviderCallRequest[] = [];
    const recording = { call: async (sent: ProviderCallRequest) => { inner.push(sent); throw new Error("stop here"); } };
    const wrapped = withStructureRepair(recording, route(COPY).route);
    await expect(wrapped.call(request({ lane: "evaluator" }))).rejects.toThrow("stop here");
    const { classifyContent: _none, ...unchecked } = request();
    await expect(wrapped.call(unchecked)).rejects.toThrow("stop here");
    await expect(wrapped.call(request())).rejects.toThrow("stop here");
    expect(inner.map((sent) => sent.structureRepairRouted)).toEqual([undefined, undefined, true]);
  });

  it("a repair call's own attempt is recorded with reply form STRUCTURE (L34)", async () => {
    const repairModel = previewGlmHarness([{ content: COPY }]);
    await repairModel.gateway.call(request({ callSiteKey: "REPAIR:STRUCTURE:JUDGE" }));
    expect(repairModel.artifacts.map((artifact) => artifact.replyForm)).toEqual(["STRUCTURE"]);
    const plain = previewGlmHarness([{ content: COPY }]);
    await plain.gateway.call(request());
    expect(plain.artifacts.map((artifact) => artifact.replyForm)).toEqual(["ORIGINAL"]);
  });

  it("the preview runs a repair call at the repair model's slip_fix level", () => {
    expect(previewThinkingStepOf({ callSiteKey: "REPAIR:STRUCTURE:JUDGE:cross-root:0->1", lane: "served" })).toBe("slip_fix");
    expect(previewThinkingStepOf({ callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1", lane: "story" })).toBe("slip_fix");
  });
});

describe("LG-A: a judge's position repaired in structure keeps its author (Review Focus 3)", () => {
  const fixture = (name: string) => readFileSync(new URL(`../support/fixtures/judge-format-replies/${name}`, import.meta.url), "utf8");
  const raw = JSON.parse(fixture("mimo-judge-position-ro-no-value-laden.txt").replace(/^```json\n/u, "").replace(/\n```$/u, "")) as Record<string, unknown>;
  const whole = JSON.stringify({ ...raw, value_laden: false });
  const broken = whole.replace("},\"critic\"", "} \"critic\"");

  it("the judge's provenance is the original AI's own artifact; the statement is its own words", async () => {
    expect(broken).not.toBe(whole);
    const original = previewGlmHarness([{ content: broken }]);
    const repair = route(whole);
    const judged = await new Judge(withStructureRepair(original.gateway, repair.route)).judge({
      runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "JUDGE",
      questionLine: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?", argumentLanguageName: "Romanian",
      providerRef: "preview:fixture-a", contractHash: "contract:synthetic", leg: { kind: "primary-root" as const },
      bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 } });
    expect(judged.provenanceRef).toBe(original.artifacts[0]!.artifactId);
    expect(judged.statement).toBe((raw.statement as string).trim());
    expect(repair.requests).toHaveLength(1);
  });
});
