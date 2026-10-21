import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  LENGTH_GUIDANCE_START,
  SERVED_ROOT_SELECTION_RULE,
  SERVED_ROOT_SELECTION_RULE_JUDGES,
  LENGTH_SENTENCE_WRITING,
  type EngineDebateMaterial,
  type EngineMaterialPoint,
  type LengthGuide
} from "@debateai/kernel";
import {
  ProviderContentUnacceptedError,
  promptContractFingerprintText,
  readPromptFrame,
  type ProviderCallRequest,
  type ProviderCallResult,
  type ProviderGateway
} from "@debateai/providers";
import {
  COMPARING_JUDGE_ANSWER_FORM,
  COMPARING_JUDGE_CONTRACT_ID,
  COMPARING_JUDGE_INSTRUCTION,
  COMPARING_JUDGE_LIMITS,
  COMPARING_JUDGE_MATERIAL_FIELDS,
  COMPARING_JUDGE_PROMPT_CONTRACT,
  COMPARING_JUDGE_READING,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  POINT_INVESTIGATION_PROMPT_CONTRACT,
  askComparingJudge,
  classifyComparingJudgeReply,
  comparingJudgeMaterialFields,
  comparingJudgeOrder,
  pickComparingJudges
} from "@debateai/judgement";
import { ServeRepository, judgesRecountApplies } from "@debateai/serve";
import {
  ENGINE_SEALED_CONTRACT_IDS,
  engineContractFingerprintText,
  engineSealedContracts
} from "../../apps/runner/src/engine-contracts.js";

/**
 * Engine redesign R2b, Task B1 (spec 2026-10-15 §4.3, §4.8, §4.9; INTERFACE §9.1-§9.3): the comparing judges' sealed
 * contract `verdict.judge.v1`, the material each judge reads (AI-written texts, fixed letters, a rotated order, no
 * number, no node id), how a reply is read and checked, and which seats judge.
 */
const point = (pointRef: string, text: string, extra: Partial<EngineMaterialPoint> = {}): EngineMaterialPoint => Object.freeze({
  pointRef, text, relation: "SUPPORTS", targetRef: "00000000-0000-4000-8000-0000000000a1", fromRivalReply: null,
  restsOn: null, disputed: false, notYetChecked: false, investigation: null, ...extra
});

const MATERIAL: EngineDebateMaterial = Object.freeze({
  question: "Should the city build a new tram line?",
  answers: Object.freeze([
    Object.freeze({
      letter: "A", rootNodeId: "00000000-0000-4000-8000-0000000000a1", words: "Yes, build it.",
      caseText: "Trams carry more people per lane than buses.",
      supports: Object.freeze([point("00000000-0000-4000-8000-00000000a101", "Ridership doubled in similar cities.")]),
      objections: Object.freeze([point("00000000-0000-4000-8000-00000000a102", "The budget is already committed.",
        { relation: "ATTACKS", fromRivalReply: "B", disputed: true })]),
      assumptions: Object.freeze(["The city keeps today's population."])
    }),
    Object.freeze({
      letter: "B", rootNodeId: "00000000-0000-4000-8000-0000000000b1", words: "No, improve the buses first.",
      caseText: null,
      supports: Object.freeze([point("00000000-0000-4000-8000-00000000b101", "Bus lanes cost a tenth as much.",
        // pre-flight PF-R2b1.8: A11's investigation carries its `reason` (plan deviation 17); spec §4.2b: judges read it.
        { notYetChecked: true, investigation: Object.freeze({ missing: "The cost of a bus lane per km.",
          found: "", basis: "none", outcome: "dead_end", reason: "A cost per km from a comparable city would decide it." }) })]),
      objections: Object.freeze([]),
      assumptions: Object.freeze([])
    }),
    Object.freeze({
      letter: "C", rootNodeId: "00000000-0000-4000-8000-0000000000c1", words: "Yes where the routes are dense; no elsewhere.",
      caseText: "Density decides whether rails pay.",
      supports: Object.freeze([]),
      objections: Object.freeze([]),
      assumptions: Object.freeze([])
    })
  ]),
  disputed: Object.freeze([Object.freeze({
    letter: "A", pointRef: "00000000-0000-4000-8000-00000000a102", text: "The budget is already committed.",
    reviewerReasons: Object.freeze(["The budget was amended last spring."])
  })])
});

const GUIDE: LengthGuide = Object.freeze({ words: 80, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });
const ROMANIAN = Object.freeze({ code: "ro", name: "Romanian" });
// pre-flight PF-R2b1.2 (D6): the sample reasons say whether the strongest objection still stands.
const REPLY = Object.freeze({
  best: "A", conditional: false, same_as: [],
  reasons: "Ridership evidence decided it; the strongest objection, the committed budget, still stands but is disputed.",
  question_kind: "general"
});
const WRAPPED_IN_FIELDS = (fields: readonly { name: string; content: string }[], name: string): unknown =>
  JSON.parse(fields.find((field) => field.name === name)!.content);

/** Every value of a JSON tree, so a test can prove no number and no node id reaches a judge. */
function leaves(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(leaves);
  return [value];
}

describe("verdict.judge.v1: the sealed contract", () => {
  it("is the owner's option-1 instruction, then the length sentence, with a code-owned answer form", () => {
    expect(COMPARING_JUDGE_CONTRACT_ID).toBe("verdict.judge.v1");
    // pre-flight PF-R2b1.2 (D6): spec §4.8 byte for byte, "...and whether it still stands."
    expect(COMPARING_JUDGE_INSTRUCTION).toBe(
      "Compare the answers to the question and say which one is best supported by the arguments made for it and against it. "
      + "Judge only from what you are given here, and add no facts of your own. Weigh how well each answer stands up to its "
      + "strongest objections, not how carefully it is worded: an answer that avoids taking a position is not better supported "
      + "because it is harder to attack. A point marked as disputed counts for less. If two answers say the same thing in other "
      + "words, say so. Say whether the answer you choose is conditional, meaning it goes one way in some cases and the other "
      + "way in others. Give your reasons in a few plain sentences: what decided it, and the strongest objection to it and whether "
      + "it still stands. Then name which kind of question this is.");
    expect(COMPARING_JUDGE_PROMPT_CONTRACT).toEqual({
      contractId: "verdict.judge.v1",
      instruction: `${COMPARING_JUDGE_INSTRUCTION} ${LENGTH_SENTENCE_WRITING}`,
      answerForm: COMPARING_JUDGE_ANSWER_FORM
    });
    expect(Object.isFrozen(COMPARING_JUDGE_PROMPT_CONTRACT)).toBe(true);
    expect(COMPARING_JUDGE_ANSWER_FORM).toBe([
      "Return only one JSON object with exactly this schema and no additional keys:",
      "{",
      "  \"best\": the letter of the best-supported answer, one of the letters shown,",
      "  \"conditional\": true | false,",
      "  \"same_as\": [[letter, letter, ...], ...],",
      "  \"reasons\": non-empty string,",
      "  \"question_kind\": \"general\" | \"factual\" | \"health\" | \"legal\" | \"money-decision\" | \"personal-choice\"",
      "}",
      "Each same_as group holds at least two different letters that give the same answer in other words, and no letter is in "
        + "two groups; use [] when no two answers are the same."
    ].join("\n"));
  });

  it("names no material field, no number and no engine word in the owner's instruction (P2.7)", () => {
    for (const name of ["disputed_points", "supporting_points", "not_yet_checked", "rests_on", "from_rival_reply",
      "question_language", "same_as", "question_kind", "reviewer_reasons", "score", "strength", "engine"]) {
      expect([name, COMPARING_JUDGE_INSTRUCTION.includes(name)]).toEqual([name, false]);
    }
    expect(COMPARING_JUDGE_INSTRUCTION).not.toMatch(/\d/u);
    expect(COMPARING_JUDGE_ANSWER_FORM).not.toMatch(/\d/u);
  });

  it("is sealed by engineContractHash directly after the investigation contract (R3 appends after them), and never by the engine-1 judge seal", () => {
    expect(engineSealedContracts().slice(0, 2).map((contract) => contract.contractId)).toEqual(["verdict.investigate.v1", "verdict.judge.v1"]);
    expect(ENGINE_SEALED_CONTRACT_IDS.slice(0, 2)).toEqual(["verdict.investigate.v1", "verdict.judge.v1"]);
    const text = engineContractFingerprintText();
    const investigation = promptContractFingerprintText(POINT_INVESTIGATION_PROMPT_CONTRACT);
    const judge = promptContractFingerprintText(COMPARING_JUDGE_PROMPT_CONTRACT);
    expect(text.includes(`\n---\n${investigation}\n---\n${judge}\n---\n`)).toBe(true);
    expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT.includes("verdict.judge.v1")).toBe(false);
  });
});

describe("the material: fixed letters, a rotated order, AI-written texts only", () => {
  it("sends question, answers, disputed_points, length, and question_language last only under a lock", () => {
    expect(COMPARING_JUDGE_MATERIAL_FIELDS).toEqual(["question", "answers", "disputed_points", "length"]);
    const open = comparingJudgeMaterialFields({ material: MATERIAL, seat: 1, length: GUIDE, questionLanguage: null });
    expect(open.map((field) => field.name)).toEqual(["question", "answers", "disputed_points", "length"]);
    expect(open.find((field) => field.name === "length")?.content).toBe("about 80 words");
    const locked = comparingJudgeMaterialFields({ material: MATERIAL, seat: 1, length: GUIDE, questionLanguage: ROMANIAN });
    expect(locked.map((field) => field.name)).toEqual(["question", "answers", "disputed_points", "length", "question_language"]);
  });

  it("rotates the order per judge and keeps every answer's letter", () => {
    expect(comparingJudgeOrder(3, 1)).toEqual([0, 1, 2]);
    expect(comparingJudgeOrder(3, 2)).toEqual([1, 2, 0]);
    expect(comparingJudgeOrder(3, 3)).toEqual([2, 0, 1]);
    expect(comparingJudgeOrder(3, 4)).toEqual([0, 1, 2]);
    expect(comparingJudgeOrder(2, 3)).toEqual([0, 1]);
    expect(() => comparingJudgeOrder(0, 1)).toThrowError(expect.objectContaining({ code: "COMPARING_JUDGE_ORDER_INVALID" }));
    const second = WRAPPED_IN_FIELDS(comparingJudgeMaterialFields({ material: MATERIAL, seat: 2, length: GUIDE }), "answers") as
      readonly { letter: string }[];
    expect(second.map((answer) => answer.letter)).toEqual(["B", "C", "A"]);
    // pre-flight PF-R2b1.9 (D3): a practice-only order (the reverse of 3 answers is no rotation), checked as a permutation.
    expect((WRAPPED_IN_FIELDS(comparingJudgeMaterialFields({ material: MATERIAL, seat: 1, length: GUIDE, order: [2, 1, 0] }),
      "answers") as readonly { letter: string }[]).map((answer) => answer.letter)).toEqual(["C", "B", "A"]);
    expect(() => comparingJudgeMaterialFields({ material: MATERIAL, seat: 1, length: GUIDE, order: [0, 0, 1] }))
      .toThrowError(expect.objectContaining({ code: "COMPARING_JUDGE_ORDER_INVALID" }));
  });

  it("renders each answer and point with exactly the agreed keys", () => {
    const answers = WRAPPED_IN_FIELDS(comparingJudgeMaterialFields({ material: MATERIAL, seat: 1, length: GUIDE }), "answers") as
      readonly Record<string, unknown>[];
    expect(Object.keys(answers[0]!)).toEqual(["letter", "answer", "case", "supporting_points", "objections", "assumptions"]);
    expect(answers[0]).toMatchObject({
      letter: "A", answer: "Yes, build it.", case: "Trams carry more people per lane than buses.",
      assumptions: ["The city keeps today's population."],
      objections: [{ text: "The budget is already committed.", disputed: true, not_yet_checked: false, rests_on: null,
        from_rival_reply: "B", investigation: null }]
    });
    expect(Object.keys((answers[0]!.supporting_points as Record<string, unknown>[])[0]!))
      .toEqual(["text", "disputed", "not_yet_checked", "rests_on", "from_rival_reply", "investigation"]);
    // pre-flight PF-R2b1.8: the investigation's reason travels with the point; its outcome is shown by the labels only.
    expect(answers[1]).toMatchObject({
      letter: "B", case: null,
      supporting_points: [{ not_yet_checked: true, investigation: { missing: "The cost of a bus lane per km.", found: "",
        basis: "none", reason: "A cost per km from a comparable city would decide it." } }]
    });
    expect(Object.keys((answers[1]!.supporting_points as Record<string, Record<string, unknown>>[])[0]!.investigation!))
      .toEqual(["missing", "found", "basis", "reason"]);
    expect(WRAPPED_IN_FIELDS(comparingJudgeMaterialFields({ material: MATERIAL, seat: 1, length: GUIDE }), "disputed_points"))
      .toEqual([{ letter: "A", text: "The budget is already committed.", reviewer_reasons: ["The budget was amended last spring."] }]);
  });

  it("gives a judge no number and no internal node id", () => {
    const fields = comparingJudgeMaterialFields({ material: MATERIAL, seat: 1, length: GUIDE });
    for (const name of ["answers", "disputed_points"]) {
      expect(leaves(WRAPPED_IN_FIELDS(fields, name)).filter((leaf) => typeof leaf === "number")).toEqual([]);
    }
    const all = fields.map((field) => field.content).join("\n");
    expect(all).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/u);
  });
});

describe("reading a judge's reply", () => {
  const context = Object.freeze({ shownLetters: ["A", "B", "C"] as const, question: MATERIAL.question, questionLanguage: null });
  const classify = (reply: unknown) => classifyComparingJudgeReply(JSON.stringify(reply), undefined, context);
  const issues = (reply: unknown): unknown => {
    const result = classify(reply);
    return result.parseStatus === "PARSED" ? [] : JSON.parse(result.parseError);
  };

  it("accepts a well-formed reply, and reads it through the reply fixer (LG-A)", () => {
    expect(classify(REPLY)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(classify({ ...REPLY, same_as: [["A", "C"]] }).parseStatus).toBe("PARSED");
    expect(COMPARING_JUDGE_READING.fixer).toEqual({});
    expect(classify({ ...REPLY, confidence: "high" })).toMatchObject({ parseStatus: "PARSED", jsonRepair: "UNASKED_KEYS" });
  });

  it("refuses a letter it was not shown (COMPARING_JUDGE_UNKNOWN_LETTER), as best or in a group", () => {
    expect(issues({ ...REPLY, best: "D" })).toEqual([{ code: "COMPARING_JUDGE_UNKNOWN_LETTER", path: ["best"],
      message: "COMPARING_JUDGE_UNKNOWN_LETTER" }]);
    expect(issues({ ...REPLY, same_as: [["A", "E"]] })).toEqual([{ code: "COMPARING_JUDGE_UNKNOWN_LETTER",
      path: ["same_as", 0, 1], message: "COMPARING_JUDGE_UNKNOWN_LETTER" }]);
  });

  it("refuses a group of one letter, a repeated letter, or a letter in two groups (COMPARING_JUDGE_GROUPS_INVALID)", () => {
    for (const sameAs of [[["A"]], [["A", "A"]], [["A", "B"], ["B", "C"]]]) {
      expect(issues({ ...REPLY, same_as: sameAs })).toEqual([expect.objectContaining({ code: "COMPARING_JUDGE_GROUPS_INVALID" })]);
    }
  });

  it("refuses a score where a letter or a kind is asked: content only the judge can give", () => {
    expect(classify({ ...REPLY, best: 0.7 }).parseStatus).toBe("SCHEMA_FAILED");
    expect(classify({ ...REPLY, question_kind: "politics" }).parseStatus).toBe("SCHEMA_FAILED");
    expect(classify({ ...REPLY, reasons: "" }).parseStatus).toBe("SCHEMA_FAILED");
    // B1 Minor 4 (R2b final wave P1): reasons of only spaces, tabs and line breaks are no reasons.
    expect(classify({ ...REPLY, reasons: " \t\n  " }).parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("who judges: pickComparingJudges", () => {
  const SEATS = Object.freeze([
    { maker: "deepseek", providerRef: "ds" }, { maker: "zhipu", providerRef: "glm" }, { maker: "qwen", providerRef: "qw" },
    { maker: "anthropic", providerRef: "haiku" }, { maker: "zhipu", providerRef: "glm-2" }
  ]);
  const ARGUING = new Set(["deepseek", "zhipu"]);

  it("seats makers that argued no answer first, then arguing makers, in seat rotation", () => {
    expect(pickComparingJudges({ seats: SEATS, arguingMakers: ARGUING, count: 3, rotationOffset: 0 })).toEqual([
      { seat: 1, maker: "qwen", providerRef: "qw", argued: false },
      { seat: 2, maker: "anthropic", providerRef: "haiku", argued: false },
      { seat: 3, maker: "deepseek", providerRef: "ds", argued: true }
    ]);
    expect(pickComparingJudges({ seats: SEATS, arguingMakers: ARGUING, count: 3, rotationOffset: 1 })
      .map((seat) => seat.providerRef)).toEqual(["qw", "haiku", "glm"]);
  });

  it("never seats two judges of one maker, and never more than the makers present or the seat limit", () => {
    expect(pickComparingJudges({ seats: SEATS, arguingMakers: ARGUING, count: 5, rotationOffset: 0 })
      .map((seat) => seat.providerRef)).toEqual(["qw", "haiku", "ds", "glm"]);
    const seven = Array.from({ length: 7 }, (_, index) => ({ maker: `maker-${String(index)}`, providerRef: `ref-${String(index)}` }));
    expect(pickComparingJudges({ seats: seven, arguingMakers: new Set(), count: 7, rotationOffset: 0 }))
      .toHaveLength(COMPARING_JUDGE_LIMITS.maxSeats);
    expect(pickComparingJudges({ seats: SEATS, arguingMakers: ARGUING, count: 0, rotationOffset: 0 })).toEqual([]);
  });

  it("seats nobody of a maker that argued every answer: a one-maker debate has no judge (spec §4.7)", () => {
    const oneMaker = [{ maker: "zhipu", providerRef: "glm" }, { maker: "zhipu", providerRef: "glm-2" }];
    expect(pickComparingJudges({ seats: oneMaker, arguingMakers: new Set(["zhipu"]), count: 3, rotationOffset: 0 })).toEqual([]);
    expect(pickComparingJudges({ seats: [...oneMaker, { maker: "qwen", providerRef: "qw" }], arguingMakers: new Set(["zhipu"]),
      count: 3, rotationOffset: 0 })).toEqual([{ seat: 1, maker: "qwen", providerRef: "qw", argued: false }]);
  });

  it("refuses a count or an offset that is not a whole number", () => {
    for (const bad of [{ count: -1, rotationOffset: 0 }, { count: 1.5, rotationOffset: 0 }, { count: 3, rotationOffset: -2 }]) {
      expect(() => pickComparingJudges({ seats: SEATS, arguingMakers: ARGUING, ...bad }))
        .toThrowError(expect.objectContaining({ code: "COMPARING_JUDGE_SEATS_INVALID" }));
    }
    // B1 Minor 2 (R2b final wave P1): the offset is checked before the empty-seats return.
    expect(() => pickComparingJudges({ seats: [], arguingMakers: ARGUING, count: 3, rotationOffset: -1 }))
      .toThrowError(expect.objectContaining({ code: "COMPARING_JUDGE_SEATS_INVALID" }));
  });
});

describe("asking one judge", () => {
  const scripted = (content: string, seen: ProviderCallRequest[]): ProviderGateway => ({
    async call(request) {
      seen.push(request);
      const classified = request.classifyContent!(content);
      if (classified.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(1, classified.parseStatus, classified.parseError, "artifact-x", "ledger-x");
      }
      return { rawArtifactRef: "artifact-1", ledgerEntryRef: "ledger-1", content, provider: "openai-compatible-http",
        model: "glm-5.1", maker: "zhipu", modelVersion: "glm-5.1" } satisfies ProviderCallResult;
    }
  });
  const INPUT = Object.freeze({
    runId: "00000000-0000-4000-8000-00000000f001", subjectItemId: "00000000-0000-4000-8000-00000000f002",
    callSiteKey: "VERDICT:judge:2", material: MATERIAL, seat: 2, length: GUIDE, providerRef: "glm",
    contractHash: "e".repeat(64), bound: Object.freeze({ maxAttempts: 2, tokenCeiling: 8192, deadlineMs: 120000 })
  });

  it("frames verdict.judge.v1 as a JUDGE call on the served lane, with the seal and the guided words", async () => {
    const seen: ProviderCallRequest[] = [];
    const answer = await askComparingJudge(scripted(JSON.stringify({ ...REPLY, same_as: [["A", "C"]] }), seen), INPUT);
    expect(answer).toEqual({
      reply: { best: "A", conditional: false, sameAs: [["A", "C"]], reasons: REPLY.reasons, questionKind: "general" },
      rawArtifactRef: "artifact-1", ledgerEntryRef: "ledger-1", model: "glm-5.1", maker: "zhipu"
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ callSiteKey: "VERDICT:judge:2", role: "JUDGE", lane: "served", modelRole: "JUDGE",
      contractHash: "e".repeat(64), providerRef: "glm", guidedWords: 80 });
    const system = seen[0]!.packet.messages[0]!.content;
    // Cache-friendly order: the sealed instruction and the length sentence open the system message. (Asserted by
    // position: tests/architecture/packet-read-through-the-frame.test.ts refuses `startsWith` on a system message.)
    expect(system.indexOf(`${COMPARING_JUDGE_INSTRUCTION} ${LENGTH_SENTENCE_WRITING} `)).toBe(0);
    expect(seen[0]!.packet.messages[1]!.content).toContain("Yes where the routes are dense; no elsewhere.");
    // Spec G1 (controller carry; A13's final-wave check is the model): a judge reads no score, weight, strength, distance
    // or rank. Read off the wire: the user message is the fenced block; with the fence lines taken off, its envelope's
    // fields carry no digit and no number word, except the length guide, which names only its own target.
    const frame = readPromptFrame(seen[0]!.packet);
    expect(frame.contractId).toBe("verdict.judge.v1");
    const user = seen[0]!.packet.messages.find((message) => message.role === "user")!.content;
    const lines = user.split("\n");
    expect(lines[0]).toBe(frame.fence);
    expect(lines.at(-1)).toBe(frame.fence);
    const envelope = JSON.parse(lines.slice(1, -1).join("\n")) as { fields: { name: string; content: string }[] };
    expect(envelope.fields.map((field) => field.name)).toEqual(["question", "answers", "disputed_points", "length"]);
    const NUMBER_WORD = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred|thousand|half|percent|score|weight|strength|rank)\b/iu;
    for (const field of envelope.fields) {
      if (field.name === "length") {
        expect(field.content).toBe(`about ${String(GUIDE.words)} words`);
        continue;
      }
      expect(field.content, field.name).not.toMatch(/\d/u);
      expect(field.content, field.name).not.toMatch(NUMBER_WORD);
    }
  });

  // B1 Minor 4 (R2b final wave P1): the reasons come back trimmed.
  it("returns the judge's reasons trimmed", async () => {
    const answer = await askComparingJudge(scripted(JSON.stringify({ ...REPLY, reasons: `  ${REPLY.reasons}\n ` }), []), INPUT);
    expect(answer.reply.reasons).toBe(REPLY.reasons);
  });

  it("names a reply that never passed as COMPARING_JUDGE_REPLY_REFUSED, with codes and paths only", async () => {
    await expect(askComparingJudge(scripted(JSON.stringify({ ...REPLY, best: "D" }), []), INPUT))
      .rejects.toMatchObject({ code: "COMPARING_JUDGE_REPLY_REFUSED" });
  });
});

/**
 * Side-by-side spec §5 (plan C15): two releases read one database. The owner's judges recount is this code counting the
 * stored votes again, so it is shown only when this code implements the rule the debate was decided by: under the
 * debate's own release, or when its sealed record names the judges' rule. Otherwise the section is left out rather than
 * shown with numbers that might disagree with the served answer.
 */
describe("the judges recount follows the debate's rule (side-by-side C15)", () => {
  const OLD = ["r16", "0123456789ab"].join("-");
  const NEW = ["r17", "ba9876543210"].join("-");

  it("is shown under the debate's own release, under the judges' rule, and wherever no release is named", () => {
    expect(judgesRecountApplies({ runReleaseKey: OLD, ownReleaseKey: NEW, servedRootRule: SERVED_ROOT_SELECTION_RULE })).toBe(false);
    expect(judgesRecountApplies({ runReleaseKey: OLD, ownReleaseKey: NEW, servedRootRule: null })).toBe(false);
    expect(judgesRecountApplies({ runReleaseKey: OLD, ownReleaseKey: NEW, servedRootRule: SERVED_ROOT_SELECTION_RULE_JUDGES })).toBe(true);
    expect(judgesRecountApplies({ runReleaseKey: NEW, ownReleaseKey: NEW, servedRootRule: SERVED_ROOT_SELECTION_RULE })).toBe(true);
    expect(judgesRecountApplies({ runReleaseKey: OLD, ownReleaseKey: undefined, servedRootRule: SERVED_ROOT_SELECTION_RULE })).toBe(true);
  });

  /**
   * A stand-in pool for one answer read: a run of release OLD with two positions (A by OpenAI, B by Anthropic) and two
   * judges of other makers who both chose B, whose one condition-mark record names `servedRootRule`. Every other read
   * finds nothing; the content lease is granted.
   */
  function answerReadPool(servedRootRule: string | null): Pool {
    const at = new Date("2026-10-21T00:00:00.000Z");
    const nodeRow = (nodeId: string, maker: string, strength: number) => ({
      node_id: nodeId, claim_text: `The position ${nodeId}.`, node_content_ciphertext: null, way_of_knowing: "reasoned",
      provenance_ref: `artifact:${nodeId}`, maker, model_id: `${maker}-model`, model_version: null, provider: "gate",
      provider_ref: `provider:${maker}`, review_outcome: null, review_reasons: null, node_review_id: null,
      review_content_ciphertext: null, review_provenance_ref: null, reviewer_maker: null, reviewer_model_id: null,
      reviewer_model_version: null, reviewer_provider: null, reviewer_provider_ref: null, locator: null, tau: 0.5,
      base_number_kind: "tau", base_source_ref: nodeId, base_producer: "reducer", base_replay_handle: "replay",
      base_provenance_ref: "judgement", strength, final_number_kind: "strength", final_source_ref: nodeId,
      final_producer: "propagation", final_replay_handle: "replay", final_provenance_ref: "propagation", disagreement: null,
      defeater_refs: [], check_status: "PASS", relevant_as_of: at
    });
    const vote = (seat: number, maker: string) => ({ judge_seat: seat, maker, chosen_root_node_id: "node-b", chosen_letter: "B",
      conditional: false, same_as: [], question_kind: "general" });
    const answerRow = {
      answer_id: "answer-1", answer_version: 1, run_id: "run-1", release_key: OLD, question_line: "Which is better?",
      run_content_ciphertext: null, fact_bundle_id: "facts-1", facts: [], facts_content_ciphertext: null,
      composed_text_id: null, composed_content_ciphertext: null, terminal: "SERVED", serve_state: "COMPOSED",
      verdict_state: "SUPPORTED", verdict_unavailable: null, confidence_band: null, band_ceiling: null, answer_form: null,
      answer_content_ciphertext: null, segments: [], residual_objections: [], condition_marks: [], badges: [],
      reversal_point: "none", builds_on_previous: null, memory_disclosure: null, sealed_at_seq: 1, risk_tier: "LOW",
      tier_source: "classifier", tier_provenance_ref: "tier", envelope_basis: { kind: "COMPUTED_STRUCTURAL_CEILING" },
      envelope_state: "WITHIN", envelope_consumed: 1, composition_budget_tier: "low", conformance_segment_results: null,
      conformance_coverage_mode: null, conformance_record_id: null, conformance_content_ciphertext: null, as_of: at,
      relevant_as_of: at, role_assignment_row: null, verdict_votes: [vote(1, "Google"), vote(2, "Mistral")],
      root_sites: [{ node_id: "node-a", call_site_key: "JUDGE" }, { node_id: "node-b", call_site_key: "JUDGE:root:secondary" }]
    };
    const markRecord = { mark: "UNSERVED-MAKER-POSITION", scope: "answer", subject_ref: "node-b", reason: "unserved",
      lift_path: null, served_root_rule: servedRootRule, call_site_key: null, planned_leg_count: null,
      terminal_transport_outcome: null, review_outcome: null, hidden_strength: null, hidden_score_threshold: null,
      hidden_score_threshold_source_ref: null, excluded_from_served_number: null, judged_basis_count: null,
      affected_node_ids: ["node-a"] };
    const query = async (sql: string, params: readonly unknown[] = []) => {
      if (sql.includes("AS root_sites")) return { rows: [answerRow] };
      if (sql.includes("AS defeater_refs")) return { rows: [nodeRow("node-a", "OpenAI", 0.6), nodeRow("node-b", "Anthropic", 0.4)] };
      if (sql.includes("excluded_from_served_number, judged_basis_count")) return { rows: [markRecord] };
      if (sql.includes("pg_try_advisory_lock_shared")) return { rows: [{ acquired: true }] };
      if (sql.includes("pg_advisory_unlock_shared")) return { rows: [{ unlocked: true }] };
      if (sql.includes("run_private_content_is_live")) return { rows: (params[0] as string[]).map((runId) => ({ run_id: runId, live: true })) };
      return { rows: [] };
    };
    const client = { query, release: () => undefined };
    return { query, connect: async () => client } as unknown as Pool;
  }
  const ownership = { ownerRef: "00000000-0000-4000-8000-0000000000c1", legacyAskerId: null } as const;

  it("an answer read of another release's debate leaves the section out unless its record names the judges' rule", async () => {
    const elsewhere = await new ServeRepository(answerReadPool(SERVED_ROOT_SELECTION_RULE), { releaseKey: NEW })
      .readAnswerProjection("answer-1", ownership);
    expect(elsewhere).not.toBeNull();
    expect(Object.hasOwn(elsewhere!, "judges_comparison")).toBe(false);
    const unnamed = await new ServeRepository(answerReadPool(null), { releaseKey: NEW }).readAnswerProjection("answer-1", ownership);
    expect(Object.hasOwn(unnamed!, "judges_comparison")).toBe(false);
    const judged = await new ServeRepository(answerReadPool(SERVED_ROOT_SELECTION_RULE_JUDGES), { releaseKey: NEW })
      .readAnswerProjection("answer-1", ownership);
    expect(judged!.judges_comparison).toMatchObject({ judges_seated: 2, judges_counted: 2 });
  });

  it("the same debate read under its own release, or with no release named, shows the recount", async () => {
    for (const repository of [
      new ServeRepository(answerReadPool(SERVED_ROOT_SELECTION_RULE), { releaseKey: OLD }),
      new ServeRepository(answerReadPool(SERVED_ROOT_SELECTION_RULE))
    ]) {
      const answer = await repository.readAnswerProjection("answer-1", ownership);
      expect(answer!.judges_comparison).toEqual({
        judges_seated: 2,
        judges_counted: 2,
        answers: [
          { root_node_id: "node-b", honest_score: 0.4, judges_chose: 2, same_answer_as: [] },
          { root_node_id: "node-a", honest_score: 0.6, judges_chose: 0, same_answer_as: [] }
        ]
      });
    }
  });
});
