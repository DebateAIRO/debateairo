import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Judge,
  JUDGE_ARTIFACT_READING,
  REVIEW_ARTIFACT_READING,
  classifyStructuredArtifact,
  judgeArtifactSchema,
  judgeAssessmentSchema,
  nodeReviewArtifactSchema,
  parseStructuredArtifact
} from "@debateai/judgement";
import { decodeModelJson, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";
import { classifyCheckerContent } from "@debateai/story";
import { practiceJsonRepairOf, practiceReviewEdgeCountOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";

/**
 * MiMo salvage (owner ruling 2026-10-12, "Salvage in code"): when an AI's reply is right except for a harmless form slip,
 * the app repairs it in code instead of re-asking. The fixtures are MiMo-V2.6-Pro's REAL refused replies from the two
 * practice debates of 2026-10-12 (our own practice text, no secret):
 *  - debate 3 seq 160, review (Spanish): `edge_bearings` left out for a node with no edges → EMPTY_LIST;
 *  - debate 3 seq 178, panel (Polish): the critic written under `"critique"` → RENAMED_MEMBER;
 *  - debate 3 seq 239, judge attack: a stray `"way_of_kooking"` beside `"way_of_knowing"` → UNASKED_KEYS;
 *  - debate 2 seq 437, judge cross-root: one stray `"` before the final brace (`…}]}"}`) → STRAY_QUOTE;
 *  - debate 2 seq 645, story checker: an object, then its thinking, cut at the token ceiling → still refused
 *    (trimmed to its first 2600 characters; it stays a cut reply).
 * Every salvage keeps every value as sent; near-misses (a missing required field, an out-of-range number, a cut reply,
 * an ambiguous form) stay refused.
 */
const fixture = (name: string): string =>
  readFileSync(new URL(`../support/fixtures/judge-format-replies/${name}`, import.meta.url), "utf8");
const REVIEW_NO_EDGES = "mimo-review-es-missing-edge-bearings.txt";
const PANEL_CRITIQUE = "mimo-panel-pl-critique-for-critic.txt";
const ATTACK_UNASKED = "mimo-judge-attack-en-unasked-key.txt";
const CROSS_STRAY_QUOTE = "mimo-judge-cross-en-stray-quote.txt";
const CHECKER_CUT = "mimo-checker-en-length-cut-object-then-thinking.txt";
const STOP = Object.freeze({ finishReason: "stop" });
const LENGTH = Object.freeze({ finishReason: "length" });

/** A fixture's object as the tolerant decode reads it (the panel reply also closes Polish „…" quotes straight). */
const decoded = (name: string): Record<string, unknown> => {
  const result = decodeModelJson(fixture(name), STOP);
  if (!result.ok) throw new Error(`fixture ${name} does not decode`);
  return result.value as Record<string, unknown>;
};

const edited = (name: string, edit: (value: Record<string, unknown>) => void): string => {
  const value = decoded(name);
  edit(value);
  return JSON.stringify(value);
};

const BOUND = Object.freeze({ maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 });
type Classified = ReturnType<NonNullable<ProviderCallRequest["classifyContent"]>>;

/** A gateway that classifies `content` once with the step's own classifier, and answers with it only if accepted. */
function oneReply(content: string, seen: { classified: Classified[]; packets: ProviderCallRequest["packet"][] }): ProviderGateway {
  return {
    call: async (request) => {
      seen.packets.push(request.packet);
      const classification = request.classifyContent!(content, STOP);
      seen.classified.push(classification);
      if (classification.parseStatus !== "PARSED") throw Object.assign(new Error("refused"), { code: "REFUSED_IN_TEST" });
      return { content, rawArtifactRef: "artifact:t", ledgerEntryRef: "ledger:t", provider: "openai-compatible-http",
        model: "XiaomiMiMo/MiMo-V2.6-Pro", maker: "xiaomi", modelVersion: "m" };
    }
  };
}

const subject = Object.freeze({ runId: "run:t", subjectItemId: "node:t", questionLine: "Should a mid-sized city make its central bus lines free to ride?",
  argumentLanguageName: "English", statement: "Free central buses lower the barrier for low-income riders.", authorMaker: "other",
  providerRef: "preview:mimo-v2-6-pro", contractHash: "contract:t", bound: BOUND });

describe("debate 3 seq 160 — a review of a node with no edges left out edge_bearings (EMPTY_LIST)", () => {
  const reply = fixture(REVIEW_NO_EDGES);
  const raw = JSON.parse(reply) as { outcome: string; reasons: string[] };

  it("is refused without the repair exactly as the practice recorded it, and accepted with it, every value as sent", () => {
    expect(Object.keys(raw)).toEqual(["outcome", "reasons"]);
    expect(parseStructuredArtifact(reply, nodeReviewArtifactSchema(0), STOP)).toEqual({ kind: "SCHEMA_FAILURE", message: "invalid_type@edge_bearings" });
    const parsed = parseStructuredArtifact(reply, nodeReviewArtifactSchema(0), STOP, REVIEW_ARTIFACT_READING);
    expect(parsed).toEqual({ kind: "PARSED", strategy: "EMPTY_LIST", value: { outcome: "agree", reasons: raw.reasons.map((reason) => reason.trim()), edge_bearings: [] } });
    expect(classifyStructuredArtifact(reply, nodeReviewArtifactSchema(0), STOP, REVIEW_ARTIFACT_READING))
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "EMPTY_LIST" });
  });

  it("the judge's review accepts it on the first try and measures no edge", async () => {
    const seen = { classified: [] as Classified[], packets: [] as ProviderCallRequest["packet"][] };
    const reviewed = await new Judge(oneReply(reply, seen)).review({ ...subject, callSiteKey: "JUDGE:review:t", edges: [] });
    expect(seen.classified).toEqual([{ parseStatus: "PARSED", parseError: null, jsonRepair: "EMPTY_LIST" }]);
    expect(reviewed.parseStrategy).toBe("EMPTY_LIST");
    expect(reviewed.outcome).toBe("agree");
    expect(reviewed.edgeMeasurements).toEqual([]);
    // The practice report reads the edge count back from the call's own prompt.
    expect(practiceReviewEdgeCountOf(seen.packets[0]!.messages)).toBe(0);
  });

  it("a node WITH edges never gets bearings filled in: the same reply is refused, by the reader and by the review", async () => {
    expect(parseStructuredArtifact(reply, nodeReviewArtifactSchema(2), STOP, REVIEW_ARTIFACT_READING))
      .toEqual({ kind: "SCHEMA_FAILURE", message: "invalid_type@edge_bearings" });
    const seen = { classified: [] as Classified[], packets: [] as ProviderCallRequest["packet"][] };
    await expect(new Judge(oneReply(reply, seen)).review({ ...subject, callSiteKey: "JUDGE:review:t",
      edges: [{ edgeId: "e1", targetStatement: "a", polarity: "support" }, { edgeId: "e2", targetStatement: "b", polarity: "attack" }] }))
      .rejects.toMatchObject({ code: "REFUSED_IN_TEST" });
    expect(seen.classified[0]).toMatchObject({ parseStatus: "SCHEMA_FAILED" });
    expect(practiceReviewEdgeCountOf(seen.packets[0]!.messages)).toBe(2);
  });

  it("near-misses stay refused: a missing outcome, empty reasons, a wrong-typed edge_bearings", () => {
    const schema = nodeReviewArtifactSchema(0);
    const noOutcome = edited(REVIEW_NO_EDGES, (value) => { delete value.outcome; });
    const noReasons = edited(REVIEW_NO_EDGES, (value) => { value.reasons = []; });
    const wrongType = edited(REVIEW_NO_EDGES, (value) => { value.edge_bearings = {}; });
    for (const content of [noOutcome, noReasons, wrongType]) {
      expect(parseStructuredArtifact(content, schema, STOP, REVIEW_ARTIFACT_READING)).toMatchObject({ kind: "SCHEMA_FAILURE" });
    }
  });
});

describe("debate 3 seq 178 — a panel member wrote its critic under \"critique\" (RENAMED_MEMBER)", () => {
  const reply = fixture(PANEL_CRITIQUE);
  const raw = decoded(PANEL_CRITIQUE) as Record<string, Record<string, unknown>>;

  it("is refused without the repair exactly as the practice recorded it, and accepted with it, every value as sent", () => {
    // The reply also closes its Polish „…" quotes with a straight quote: the existing INNER_QUOTE decode reads it, then
    // the schema refused the misnamed member. The shape repair is the one recorded.
    expect(() => JSON.parse(reply)).toThrow();
    expect(decodeModelJson(reply, STOP)).toMatchObject({ ok: true, repair: "INNER_QUOTE" });
    expect(Object.keys(raw)).toEqual(["steelman", "critique", "evidence", "context", "fallacy"]);
    expect(parseStructuredArtifact(reply, judgeAssessmentSchema, STOP)).toEqual({ kind: "SCHEMA_FAILURE", message: "invalid_type@critic,unrecognized_keys@$" });
    const parsed = parseStructuredArtifact(reply, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING);
    expect(parsed).toMatchObject({ kind: "PARSED", strategy: "RENAMED_MEMBER" });
    if (parsed.kind !== "PARSED") throw new Error("unreachable");
    expect(parsed.value.critic).toEqual({ summary: (raw.critique!.summary as string).trim(), counterargumentStrength: 0.55, basis: "PLAUSIBLE_COUNTER" });
    expect(parsed.value.steelman.fidelity).toBe(0.92);
    expect(parsed.value.evidence).toEqual({ quality: 0.12, relevance: 0.8 });
    expect(parsed.value.context.fit).toBe(0.93);
    expect(parsed.value.fallacy.severity).toBe(0.38);
    expect(parsed.value.fallacy.fatalFlags.map((flag) => [flag.type, flag.severity])).toEqual([["non_sequitur", 0.42], ["vagueness", 0.3]]);
    expect(Object.keys(parsed.value)).not.toContain("critique");
  });

  it("the panel accepts it on the first try", async () => {
    const seen = { classified: [] as Classified[], packets: [] as ProviderCallRequest["packet"][] };
    const assessed = await new Judge(oneReply(reply, seen)).assess({ ...subject, callSiteKey: "PANEL:JUDGE:defender:root0:r1:p0:preview:mimo-v2-6-pro" });
    expect(seen.classified).toEqual([{ parseStatus: "PARSED", parseError: null, jsonRepair: "RENAMED_MEMBER" }]);
    expect(assessed.parseStrategy).toBe("RENAMED_MEMBER");
    expect(assessed.assessment.critic.counterargumentStrength).toBe(0.55);
  });

  it("near-misses stay refused: a partial or out-of-range critique, two candidates, a second missing member, an extra key", () => {
    const partial = edited(PANEL_CRITIQUE, (value) => { delete (value.critique as Record<string, unknown>).basis; });
    const outOfRange = edited(PANEL_CRITIQUE, (value) => { (value.critique as Record<string, unknown>).counterargumentStrength = 1.2; });
    const twoCandidates = edited(PANEL_CRITIQUE, (value) => { value.counter = { ...(value.critique as Record<string, unknown>) }; });
    const twoMissing = edited(PANEL_CRITIQUE, (value) => { delete value.steelman; });
    const extraKey = edited(PANEL_CRITIQUE, (value) => { value.confidence = 0.8; });
    const noCandidate = edited(PANEL_CRITIQUE, (value) => { value.critique = "A plain-text critique."; });
    for (const content of [partial, outOfRange, twoCandidates, twoMissing, extraKey, noCandidate]) {
      expect(parseStructuredArtifact(content, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING)).toMatchObject({ kind: "SCHEMA_FAILURE" });
    }
  });
});

describe("debate 3 seq 239 — a judge attack carried a stray \"way_of_kooking\" key (UNASKED_KEYS)", () => {
  const reply = fixture(ATTACK_UNASKED);
  const raw = JSON.parse(reply) as Record<string, unknown>;

  it("is refused without the repair exactly as the practice recorded it, and accepted with it, every value as sent", () => {
    expect(raw.way_of_kooking).toBe("REASONING");
    expect(parseStructuredArtifact(reply, judgeArtifactSchema, STOP)).toEqual({ kind: "SCHEMA_FAILURE", message: "unrecognized_keys@$" });
    const parsed = parseStructuredArtifact(reply, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING);
    expect(parsed).toMatchObject({ kind: "PARSED", strategy: "UNASKED_KEYS" });
    if (parsed.kind !== "PARSED") throw new Error("unreachable");
    expect(Object.keys(parsed.value)).not.toContain("way_of_kooking");
    expect(parsed.value.way_of_knowing).toBe("REASONING");
    expect(parsed.value.statement).toBe((raw.statement as string).trim());
    expect(parsed.value.steelman.fidelity).toBe(0.9);
    expect(parsed.value.critic).toMatchObject({ counterargumentStrength: 0.8, basis: "PLAUSIBLE_COUNTER" });
    expect(parsed.value.evidence).toEqual({ quality: 0.55, relevance: 0.85 });
    expect(parsed.value.fallacy.severity).toBe(0.35);
  });

  it("the judge's author leg accepts it on the first try", async () => {
    const seen = { classified: [] as Classified[], packets: [] as ProviderCallRequest["packet"][] };
    const judged = await new Judge(oneReply(reply, seen)).judge({ ...subject, callSiteKey: "JUDGE:critic:root2:r1:p2", leg: { kind: "primary-root" } });
    expect(seen.classified).toEqual([{ parseStatus: "PARSED", parseError: null, jsonRepair: "UNASKED_KEYS" }]);
    expect(judged.parseStrategy).toBe("UNASKED_KEYS");
    expect(judged.wayOfKnowing).toBe("REASONING");
  });

  it("near-misses stay refused: a missing required field, an out-of-range number, a root key that shadows a scored field", () => {
    const missing = edited(ATTACK_UNASKED, (value) => { delete value.value_laden; });
    const outOfRange = edited(ATTACK_UNASKED, (value) => { (value.steelman as Record<string, unknown>).fidelity = 1.5; });
    const shadow = edited(ATTACK_UNASKED, (value) => { delete value.way_of_kooking; value.fidelity = 0.4; });
    for (const content of [missing, outOfRange, shadow]) {
      expect(parseStructuredArtifact(content, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING)).toMatchObject({ kind: "SCHEMA_FAILURE" });
    }
    // The earlier MiMo slip with a required boolean left out (no extra key) is still refused too.
    expect(parseStructuredArtifact(fixture("mimo-judge-position-ro-no-value-laden.txt"), judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING))
      .toMatchObject({ kind: "SCHEMA_FAILURE" });
  });
});

describe("debate 2 seq 437 — a judge cross-root reply ended with one stray quote, …}]}\"} (STRAY_QUOTE)", () => {
  const reply = fixture(CROSS_STRAY_QUOTE);

  it("strict JSON refuses it; the tolerant decode drops the one stray quote and nothing else", () => {
    expect(reply.endsWith("}]}\"}")).toBe(true);
    expect(() => JSON.parse(reply)).toThrow();
    const decoded = decodeModelJson(reply, STOP);
    expect(decoded).toMatchObject({ ok: true, repair: "STRAY_QUOTE" });
    if (!decoded.ok) throw new Error("unreachable");
    expect(decoded.value).toEqual(JSON.parse(`${reply.slice(0, -2)}}`));
  });

  it("the judge reads it with every value as sent", async () => {
    const parsed = parseStructuredArtifact(reply, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING);
    expect(parsed).toMatchObject({ kind: "PARSED", strategy: "STRAY_QUOTE" });
    if (parsed.kind !== "PARSED") throw new Error("unreachable");
    expect(parsed.value.critic).toMatchObject({ counterargumentStrength: 0.8, basis: "PLAUSIBLE_COUNTER" });
    expect(parsed.value.evidence).toEqual({ quality: 0.42, relevance: 0.88 });
    expect(parsed.value.fallacy.fatalFlags.map((flag) => flag.severity)).toEqual([0.6, 0.45, 0.4]);
    const seen = { classified: [] as Classified[], packets: [] as ProviderCallRequest["packet"][] };
    const judged = await new Judge(oneReply(reply, seen)).judge({ ...subject, callSiteKey: "JUDGE:cross-root:3->1", leg: { kind: "primary-root" } });
    expect(seen.classified).toEqual([{ parseStatus: "PARSED", parseError: null, jsonRepair: "STRAY_QUOTE" }]);
    expect(judged.parseStrategy).toBe("STRAY_QUOTE");
  });

  it("near-misses stay refused: a cut reply, text after the stray quote, two stray quotes, an unclosed root", () => {
    expect(decodeModelJson(reply, LENGTH)).toMatchObject({ ok: false });
    expect(parseStructuredArtifact(reply, judgeArtifactSchema, LENGTH, JUDGE_ARTIFACT_READING)).toMatchObject({ kind: "PARSE_FAILURE" });
    const body = reply.slice(0, -2);
    for (const content of [`${body}"x}`, `${body}""}`, `${body}" ,}`, `${body}"`, `${body}"}}`]) {
      expect(decodeModelJson(content, STOP)).toMatchObject({ ok: false });
    }
    // The stray quote is the reply's own: when the object is otherwise incomplete, nothing is guessed.
    expect(decodeModelJson("{\"a\":{\"b\":1}\"", STOP)).toMatchObject({ ok: false });
    expect(decodeModelJson("{\"a\":{\"b\":1}\"}", STOP)).toEqual({ ok: true, value: { a: { b: 1 } }, repair: "STRAY_QUOTE" });
    expect(decodeModelJson("{\"a\":[1,2]\"}", STOP)).toEqual({ ok: true, value: { a: [1, 2] }, repair: "STRAY_QUOTE" });
  });
});

describe("debate 2 seq 645 — a story checker reply cut at its token ceiling stays refused", () => {
  it("an object followed by its own thinking, finish=length: never repaired, never read as the first object", () => {
    const reply = fixture(CHECKER_CUT);
    expect(decodeModelJson(reply, LENGTH)).toMatchObject({ ok: false });
    expect(classifyCheckerContent(reply, LENGTH)).toMatchObject({ parseStatus: "PARSE_FAILED" });
  });
});

describe("the practice report counts each salvage as a tolerant repair, not a slip", () => {
  it("names the shape repair a judge, panel or review reply needed (the schema-blind decode cannot see it)", () => {
    expect(practiceJsonRepairOf(fixture(REVIEW_NO_EDGES), "stop", "JUDGE:review:34b6694b")).toBe("EMPTY_LIST");
    expect(practiceJsonRepairOf(fixture(PANEL_CRITIQUE), "stop", "PANEL:JUDGE:defender:root0:r1:p0:preview:mimo-v2-6-pro")).toBe("RENAMED_MEMBER");
    expect(practiceJsonRepairOf(fixture(ATTACK_UNASKED), "stop", "JUDGE:critic:root2:r1:p2")).toBe("UNASKED_KEYS");
    expect(practiceJsonRepairOf(fixture(CROSS_STRAY_QUOTE), "stop", "JUDGE:cross-root:3->1")).toBe("STRAY_QUOTE");
    // Without the call-site key only the decode repairs are seen, as before.
    expect(practiceJsonRepairOf(fixture(ATTACK_UNASKED), "stop")).toBeNull();
    expect(practiceJsonRepairOf(fixture(CROSS_STRAY_QUOTE), "stop")).toBe("STRAY_QUOTE");
  });

  it("re-checks a review with no list only against the call's real edge count", () => {
    const reply = fixture(REVIEW_NO_EDGES);
    expect(recheckReply("JUDGE:review:t", reply, 0)).toEqual({ family: "REVIEW", issues: [] });
    expect(recheckReply("JUDGE:review:t", reply, 2)).toEqual({ family: "REVIEW", issues: ["invalid_type@edge_bearings"] });
    expect(recheckReply("JUDGE:review:t", reply)).toEqual({ family: "REVIEW", issues: ["invalid_type@edge_bearings"] });
    expect(recheckReply("PANEL:JUDGE:defender:root0", fixture(PANEL_CRITIQUE))).toEqual({ family: "PANEL", issues: [] });
    expect(recheckReply("JUDGE:critic:root2:r1:p2", fixture(ATTACK_UNASKED))).toEqual({ family: "JUDGE", issues: [] });
  });
});
