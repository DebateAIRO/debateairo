import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, TEXT_NOT_IN_QUESTION_LANGUAGE, argumentLanguageDirective, detectArgumentLanguage, questionLanguageSentence } from "@debateai/kernel";
import {
  buildFramedPrompt, readPromptFrame, type PromptContract, type PromptPacket, type ProviderCallRequest, type ProviderGateway
} from "@debateai/providers";
import {
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V2, Judge, PANEL_PROMPT_CONTRACT, framedJudgePromptForTest, judgePromptContract,
  reviewPromptContract, rootPositionRequestBytesBound
} from "@debateai/judgement";
import { SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT } from "@debateai/serve";
import { buildSynthesisRolePrompt, classifyComposedContent, classifyEvaluatorContent } from "../../apps/runner/src/index.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

/** The judge hash after P2b (P2L Task 0 Step 3 printed it): P2L must not move it. */
const JUDGE_HASH_AFTER_P2B = "aac534075f292189027590dcbde6256a9684f085814ad2ab2bb4cb4be9c22612";
/** The judge hash after LG-C2 Task 11 (V2 + the 18 length variants; hs-s01-seal measured it): the current seal. */
const JUDGE_HASH_AFTER_LG_C2 = "810d611a72cbf486d7027ca444e2181541a60c4843c42ebaed549eb4577bf1ee";
const RO = { code: "ro", name: "Romanian" };
const fixed = () => Buffer.alloc(16, 7);
const systemOf = (packet: { messages: readonly { role: string; content: string }[] }) => packet.messages.find((m) => m.role === "system")!.content;

/**
 * Review Minor 1 — AN INDEPENDENT ORACLE for today's (unlocked) packets, built by hand as a17-synthesis-role-prompt
 * builds the writer's: the sealed contract with today's directive appended, and the material written out field by field.
 * The fence and canary differ per call, so the system text is compared without its last three lines (PF-L41(a)).
 */
function todaysPacket(contract: PromptContract, material: readonly { name: string; content: string }[]): PromptPacket {
  return buildFramedPrompt({
    contract: { ...contract, instruction: `${contract.instruction} ${argumentLanguageDirective("Romanian")}` }, material
  }).packet;
}
function expectTodaysPacket(actual: PromptPacket, expected: PromptPacket): void {
  expect(readPromptFrame(actual).contractId).toBe(readPromptFrame(expected).contractId);
  expect(systemOf(actual).split("\n").slice(0, -3)).toEqual(systemOf(expected).split("\n").slice(0, -3));
  expect(readPromptFrame(actual).fields).toEqual(readPromptFrame(expected).fields);
}

async function firstPacket(run: (gateway: ProviderGateway) => Promise<unknown>) {
  let captured: unknown;
  const gateway = { call: async (request: { packet: unknown }) => { captured = request.packet; throw new Error("captured"); } } as unknown as ProviderGateway;
  await run(gateway).catch(() => undefined);
  return captured as { messages: readonly { role: string; content: string }[] };
}

const BOUND = { maxAttempts: 1, tokenCeiling: 1024, deadlineMs: 1000 };
const reviewInput = (lock: object) => ({ runId: null, subjectItemId: "s", callSiteKey: "REVIEW:x",
  questionLine: "Q?", argumentLanguageName: "Romanian", ...lock, statement: "S", authorMaker: "a", providerRef: "p",
  contractHash: "h", bound: BOUND, edges: [] }) as never;
const panelInput = (lock: object) => ({ runId: null, subjectItemId: "s", callSiteKey: "PANEL:x",
  questionLine: "Q?", argumentLanguageName: "Romanian", ...lock, statement: "S", authorMaker: "a", providerRef: "p",
  contractHash: "h", bound: BOUND }) as never;
const judgeInput = (lock: object) => ({ runId: null, subjectItemId: "s", callSiteKey: "JUDGE",
  questionLine: "Q?", argumentLanguageName: "Romanian", ...lock, leg: { kind: "primary-root" }, providerRef: "p",
  contractHash: "h", bound: BOUND }) as never;

describe("judge-side and answer calls in the locked language (question-language spec 2026-10-13, L6)", () => {
  it("no sealed judge fingerprint moves", () => {
    // P2b's text is frozen as V2 and keeps its seal; the current text is V2 + LG-C2's 18 length variants.
    expect(createHash("sha256").update(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT_V2).digest("hex")).toBe(JUDGE_HASH_AFTER_P2B);
    expect(createHash("sha256").update(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT).digest("hex")).toBe(JUDGE_HASH_AFTER_LG_C2);
    // The composer's fingerprint after P2b (9a46af29…), and since answer writer v4 + length.v2 (owner-approved
    // wording, 2026-10-15) 879d2c5d…, and since the V4 reading level + length.v3 (owner N6 and 17 Oct #5, 2026-10-29)
    // 6fb174d4…: the named sentence is added at call time, never sealed.
    expect(createHash("sha256").update(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT).digest("hex").slice(0, 8)).toBe("6fb174d4");
  });

  it("a judge leg without a lock is today's packet; with one it carries the sentence and the field, last", () => {
    const leg = { kind: "support" as const, positionUnderDebate: "P" };
    // Today's support leg, by hand: its sealed contract + today's directive, and its two fields.
    const today = todaysPacket(judgePromptContract("support", "unknown"),
      [{ name: "question_line", content: "Q?" }, { name: "position_under_debate", content: "P" }]);
    expectTodaysPacket(framedJudgePromptForTest(leg, "Q?", "Romanian", "unknown").packet, today);
    expectTodaysPacket(framedJudgePromptForTest(leg, "Q?", "Romanian", "unknown", null).packet, today);
    const locked = readPromptFrame(framedJudgePromptForTest(leg, "Q?", "Romanian", "unknown", RO).packet);
    expect(locked.fields.map((field) => field.name)).toEqual(["question_line", "position_under_debate", "question_language"]);
    expect(locked.fields.at(-1)!.content).toBe('{"code":"ro","name":"Romanian"}');
    const system = systemOf(framedJudgePromptForTest(leg, "Q?", "Romanian", "unknown", RO).packet);
    expect(system).toContain(questionLanguageSentence(RO));
    expect(system).not.toContain("the language of the question");
  });

  it("judge, review and panel calls carry the same sentence and field when locked", async () => {
    const judgePacket = await firstPacket((gateway) => new Judge(gateway).judge(judgeInput({ questionLanguage: RO })));
    const reviewPacket = await firstPacket((gateway) => new Judge(gateway).review(reviewInput({ questionLanguage: RO })));
    const panelPacket = await firstPacket((gateway) => new Judge(gateway).assess(panelInput({ questionLanguage: RO })));
    for (const packet of [judgePacket, reviewPacket, panelPacket]) {
      expect(systemOf(packet)).toContain(questionLanguageSentence(RO));
      expect(readPromptFrame(packet as never).fields.at(-1)!.name).toBe("question_language");
    }
    // PF-L41(a) and review Minor 1: unlocked judge, review and panel calls send today's packet, checked against the
    // hand-built oracle (contract + today's directive, fields written out), never against the code under test.
    const unlockedJudge = await firstPacket((gateway) => new Judge(gateway).judge(judgeInput({}))) as PromptPacket;
    const claim = readPromptFrame(unlockedJudge).contractId.endsWith(".resolved.v1") ? "resolved" : "unknown";
    expectTodaysPacket(unlockedJudge, todaysPacket(judgePromptContract("primary-root", claim), [{ name: "question_line", content: "Q?" }]));
    expectTodaysPacket(await firstPacket((gateway) => new Judge(gateway).review(reviewInput({}))) as PromptPacket,
      todaysPacket(reviewPromptContract(0), [{ name: "question_line", content: "Q?" }, { name: "statement", content: "S" },
        { name: "edges_sourced_by_this_node", content: "[]" }]));
    expectTodaysPacket(await firstPacket((gateway) => new Judge(gateway).assess(panelInput({}))) as PromptPacket,
      todaysPacket(PANEL_PROMPT_CONTRACT, [{ name: "question_line", content: "Q?" }, { name: "statement", content: "S" }]));
  });

  it("PF-L38: root 0's room frames the lock — today's bound without it, the locked worst case with it", () => {
    const input = { questionLine: "Q?", argumentLanguageName: "Romanian", completionTokenCeiling: 1024, assignedMaterialChars: { answer: 480, points: 4624 } };
    const unlocked = rootPositionRequestBytesBound(input);
    expect(rootPositionRequestBytesBound({ ...input, questionLanguage: null })).toBe(unlocked);
    const locked = rootPositionRequestBytesBound({ ...input, questionLanguage: RO });
    expect(locked).toBeGreaterThan(unlocked);
    const legs = [{ kind: "primary-root" }, { kind: "assigned-root", assignedAnswer: "\u0001".repeat(480), mapPoints: "\u0001".repeat(4624) }] as const;
    const worst = Math.max(...legs.flatMap((leg) => (["unknown", "resolved"] as const).map((claim) => Buffer.byteLength(JSON.stringify({
      model: "", max_tokens: 1024, messages: framedJudgePromptForTest(leg as never, "Q?", "Romanian", claim, RO).packet.messages }), "utf8"))));
    expect(locked).toBe(worst);
  });

  it("the answer writer: no lock is today's packet byte for byte; a lock adds the sentence and the field", () => {
    const request = synthesisRequestFixture();
    const today = buildSynthesisRolePrompt(request, "Romanian", fixed);
    expect(buildSynthesisRolePrompt(request, "Romanian", fixed, null, null).packet).toEqual(today.packet);
    const locked = buildSynthesisRolePrompt(request, "Romanian", fixed, null, RO);
    expect(systemOf(locked.packet)).toContain(questionLanguageSentence(RO));
    expect(readPromptFrame(locked.packet).fields.at(-1)!.name).toBe("question_language");
  });

  it("PF-L40: a lengthed writer call with a lock keeps answer_length, and question_language rides LAST", () => {
    const request = synthesisRequestFixture();   // a SYNTHESIZER request
    const names = readPromptFrame(buildSynthesisRolePrompt(request, "Romanian", fixed, { answerWords: 300, ownWords: null, languageCode: null, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord }, RO).packet).fields.map((field) => field.name);
    expect(names.slice(-2)).toEqual(["answer_length", "question_language"]);
    expect(readPromptFrame(buildSynthesisRolePrompt(request, "Romanian", fixed, { answerWords: 300, ownWords: null, languageCode: null, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord }, null).packet).fields.at(-1)!.name).toBe("answer_length");
  });

  it("the answer checker's language check reads the lock, not the question (PF-L41(b): a verdict that PARSES)", () => {
    // evaluatorVerdictSchema is strict { satisfied, objection, criteria{5} } (apps/runner/src/index.ts).
    const verdict = JSON.stringify({ satisfied: false,
      objection: "The answer must explain why keeping the national currency protects citizens and the firms of the country.",
      criteria: { fairness_to_losers: true, statement_label_agreement: true, no_overstatement: true, restatement: true, citation_tracing: true } });
    const englishQuestion = "Should Romania drop the leu and adopt the euro as soon as possible?";
    expect(classifyEvaluatorContent(verdict, undefined, englishQuestion, null).parseStatus).toBe("PARSED");
    expect(classifyEvaluatorContent(verdict, undefined, englishQuestion, RO).parseStatus).toBe("SCHEMA_FAILED");
  });

  it("the answer writer's language check reads the lock too (ComposedCitationContext.questionLanguage)", () => {
    const composed = JSON.stringify({ segments: [{ segment_id: "s1",
      text: "Keeping the national currency protects citizens and the firms of the country for now.",
      node_refs: ["primary"], served_number_refs: [] }] });
    const englishQuestion = "Should Romania drop the leu and adopt the euro as soon as possible?";
    const citation = { digest: synthesisRequestFixture().digest, servedNodes: [], exemptTokens: new Set<string>(), questionLine: englishQuestion };
    expect(classifyComposedContent(composed, citation).parseStatus).toBe("PARSED");
    expect(classifyComposedContent(composed, { ...citation, questionLanguage: RO }).parseStatus).toBe("SCHEMA_FAILED");
  });
});

/**
 * Review I8: every judge-side reply check reads the LOCK, never a re-guess of the question. The question below is one
 * today's guesser cannot name ("und"), so today's check lets a French reply through; under a Romanian lock the same
 * reply must be refused with TEXT_NOT_IN_QUESTION_LANGUAGE. Each call's own classifier is taken from the request it
 * hands the gateway (packages/judgement/src/index.ts: judge, review, assess).
 */
describe("judge, review and panel replies are checked against the lock (review I8)", () => {
  const UND_QUESTION = "Ar trebui sa renuntam la leu si sa trecem la euro cat mai repede?";
  const STOP = Object.freeze({ finishReason: "stop" });
  const FR_A = "Le gouvernement doit maintenir la monnaie nationale pour les citoyens et les entreprises du pays.";
  const FR_B = "Les entreprises du pays perdraient leur protection si la banque centrale abandonnait la monnaie nationale.";
  const FRENCH_ASSESSMENT = {
    steelman: { summary: FR_A, fidelity: 0.8 },
    critic: { summary: FR_B, counterargumentStrength: 0.5, basis: "REAL_ATTACK" },
    evidence: { quality: 0.5, relevance: 0.5 },
    context: { fit: 0.5, ambiguityFlags: [] },
    fallacy: { severity: 0.1, fatalFlags: [] }
  };
  const FRENCH = {
    judge: JSON.stringify({ statement: FR_A, way_of_knowing: "REASONING", locator: null, restatement_text: FR_B,
      restatement_status: "PASS", value_laden: false, ...FRENCH_ASSESSMENT }),
    review: JSON.stringify({ outcome: "dispute", reasons: [FR_A, FR_B], edge_bearings: [] }),
    panel: JSON.stringify(FRENCH_ASSESSMENT)
  } as const;
  const withQuestion = (input: never) => ({ ...(input as object), questionLine: UND_QUESTION }) as never;

  async function classifierOf(run: (gateway: ProviderGateway) => Promise<unknown>) {
    let captured: ProviderCallRequest | undefined;
    const gateway = { call: async (request: ProviderCallRequest) => { captured = request; throw new Error("captured"); } } as unknown as ProviderGateway;
    await run(gateway).catch(() => undefined);
    return captured!.classifyContent!;
  }
  const calls = {
    judge: (lock: object) => (gateway: ProviderGateway) => new Judge(gateway).judge(withQuestion(judgeInput(lock))),
    review: (lock: object) => (gateway: ProviderGateway) => new Judge(gateway).review(withQuestion(reviewInput(lock))),
    panel: (lock: object) => (gateway: ProviderGateway) => new Judge(gateway).assess(withQuestion(panelInput(lock)))
  } as const;

  it("the question is one today's guesser cannot name", () => {
    expect(detectArgumentLanguage(UND_QUESTION).tag).toBe("und");
  });

  it.each(["judge", "review", "panel"] as const)("%s: a French reply is refused under a Romanian lock and parses without one", async (call) => {
    const locked = (await classifierOf(calls[call]({ questionLanguage: RO })))(FRENCH[call], STOP);
    expect(locked.parseStatus).toBe("SCHEMA_FAILED");
    const issues = JSON.parse(locked.parseError!) as { code: string }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.code === TEXT_NOT_IN_QUESTION_LANGUAGE)).toBe(true);
    expect((await classifierOf(calls[call]({})))(FRENCH[call], STOP).parseStatus).toBe("PARSED");
    expect((await classifierOf(calls[call]({ questionLanguage: null })))(FRENCH[call], STOP).parseStatus).toBe("PARSED");
  });
});
