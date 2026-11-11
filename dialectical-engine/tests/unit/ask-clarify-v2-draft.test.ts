// tests/unit/ask-clarify-v2-draft.test.ts
// V4 start step, Task 76d (r2-7, read-f22, r2-5; owner answers Q4 and Q5 of 4 Nov; 4 Nov night read-f1): the clarifying call's
// version 2, a draft the owner reads word for word before Task 92 seals it. Its instruction is version 1's, then the owner's own
// words for the answer sentences and the place mark, then one drafted sentence for "What do you care about most?", then read-f1's
// drafted sentence about the questions asked of an earlier wording. Until it is sealed the API asks with version 1, reads none of
// version 2's members and frames no `earlier` field, byte for byte as today. The shapes widen only. Data is made up.
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  AskClarifyRequestSchema, AskClarifyResponseSchema, ClarifyQuestionSchema, PurposeLinesSchema, StartMergeRequestSchema, type AskClarifyResponse
} from "@debateai/contract";
import {
  ASK_CLARIFY_CONTRACT_ID, ASK_CLARIFY_DRAFT_CONTRACTS, ASK_CLARIFY_INSTRUCTION, ASK_CLARIFY_PROMPT_CONTRACT, ASK_CLARIFY_SEALED_CONTRACTS,
  ASK_CLARIFY_V2_CONTRACT_ID, ASK_CLARIFY_V2_DRAFT_CONTRACT, framedAskClarify
} from "@debateai/judgement";
import { readPromptFrame, type PromptContract, type PromptPacket } from "@debateai/providers";
import { createAskClarify, readAskClarifyReply } from "../../apps/api/src/ask-clarify.js";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const QUESTION = "Should the town build a second pier?";
const Q5_WORDS = "For each answer, also write the one short sentence the person would add after their question to give that answer: in the "
  + "question's language, in their own voice (\"I mean the next 25 years.\"), reading naturally right after the question, keeping the answer's "
  + "meaning exactly and adding nothing. If one of your questions asks where, mark it.";
const CARE_SENTENCE = "Also write one more question, \"What do you care about most?\", in the question's language, with 2 to 4 short answers that "
  + "name outcomes a person asking this question may want; for those answers, each sentence says, in the question's language, \"What I care "
  + "about is: \" and the answer.";
const EARLIER_SENTENCE = "If you are also given the questions you asked about an earlier wording of this question, with the person's answers, keep "
  + "the same words for any of those questions you still want to ask, and the same answer options where they still fit.";

const PURPOSE = { text: "What do you want the answer for?", answers: ["To vote on it", "To write to the council"],
  sentences: ["I want it to vote on it.", "I want it to write to the council."] };
const WHERE = { text: "Which town?", answers: ["Harbour Town", "Bay Town"], sentences: ["I mean Harbour Town.", "I mean Bay Town."], about_place: true as const };
const WHEN = { text: "Over what time?", answers: ["The next 25 years", "Until 2030"], sentences: ["I mean the next 25 years.", "I mean until 2030."] };
const CARES = { text: "What do you care about most?", answers: ["Keeping fares low", "Fewer queues"],
  sentences: ["What I care about is: keeping fares low.", "What I care about is: fewer queues."] };
const V2_REPLY = { questions: [WHERE, WHEN], purpose: PURPOSE, cares: CARES };
const plain = (question: Readonly<{ text: string; answers: readonly string[] }>) => ({ text: question.text, answers: [...question.answers] });
const EARLIER = { questions: [plain(WHEN), plain(PURPOSE)], answers: [{ question: "Over what time?", answer: "2040" }] };
const answerOf = (count: number) => Array.from({ length: count }, (_, at) => `Answer ${at + 1}`);
const sentencesOf = (count: number) => Array.from({ length: count }, (_, at) => `I mean answer ${at + 1}.`);

function gateway(replies: readonly string[], sealed?: readonly PromptContract[]) {
  const packets: PromptPacket[] = [];
  const left = [...replies];
  const port = createAskClarify({ limits: { perHour: 11, perDay: 22 },
    transportFor: () => async ({ packet }) => {
      packets.push(packet);
      const next = left.shift();
      if (next === undefined) throw new Error("no scripted reply");
      return next;
    },
    reserve: async () => undefined,
    record: async () => undefined,
    clock: () => new Date("2026-11-04T10:00:00.000Z"),
    report: () => undefined,
    ...(sealed === undefined ? {} : { sealed })
  });
  return { port, packets };
}
const fieldsOf = (packet: PromptPacket) => readPromptFrame(packet).fields.map((field) => ({ name: field.name, content: field.content }));

describe("the version 2 draft (r2-7, Q4, Q5, read-f1)", () => {
  it("is version 1's instruction byte for byte, then the owner's Q5 words, then the care sentence, ending with read-f1's sentence", () => {
    expect(ASK_CLARIFY_V2_CONTRACT_ID).toBe("ask.clarify.v2");
    expect(ASK_CLARIFY_V2_DRAFT_CONTRACT.contractId).toBe(ASK_CLARIFY_V2_CONTRACT_ID);
    const instruction = ASK_CLARIFY_V2_DRAFT_CONTRACT.instruction;
    expect(instruction.startsWith(ASK_CLARIFY_INSTRUCTION)).toBe(true);
    expect(instruction).toBe(`${ASK_CLARIFY_INSTRUCTION} ${Q5_WORDS} ${CARE_SENTENCE} ${EARLIER_SENTENCE}`);
    expect(instruction.indexOf(Q5_WORDS)).toBeGreaterThan(ASK_CLARIFY_INSTRUCTION.length - 1);
    expect(instruction.indexOf(CARE_SENTENCE)).toBeGreaterThan(instruction.indexOf(Q5_WORDS));
    expect(instruction.endsWith(EARLIER_SENTENCE)).toBe(true);
    // Version 1 stays as it was approved.
    expect(ASK_CLARIFY_PROMPT_CONTRACT.instruction).toBe(ASK_CLARIFY_INSTRUCTION);
  });

  it("holds no example id and no snake_case word in its instruction, and its answer form names every member with a placeholder only", () => {
    expect(ASK_CLARIFY_V2_DRAFT_CONTRACT.instruction).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
    for (const text of [ASK_CLARIFY_V2_DRAFT_CONTRACT.instruction, ASK_CLARIFY_V2_DRAFT_CONTRACT.answerForm]) {
      expect(text).not.toMatch(/\b(P[1-9][0-9]*|b[1-8]|pt[1-9][1-6]|kp\d{2}|cd[1-3]|sg[1-9]|g[1-7]|n\d+)\b/u);
    }
    const form = ASK_CLARIFY_V2_DRAFT_CONTRACT.answerForm;
    for (const member of ["\"questions\"", "\"purpose\"", "\"cares\"", "\"sentences\"", "\"about_place\": true"]) expect(form).toContain(member);
    expect(form).toContain("<the person's own short sentence for the first answer>");
    expect(form).not.toMatch(/Bucharest|Romania|bills/iu);
  });

  it("is a draft: in the drafts' list, never in the sealed list or the engine's seal (Task 92 seals it)", () => {
    expect(ASK_CLARIFY_DRAFT_CONTRACTS).toEqual([ASK_CLARIFY_V2_DRAFT_CONTRACT]);
    expect(ASK_CLARIFY_SEALED_CONTRACTS.map((contract) => contract.contractId)).toEqual([ASK_CLARIFY_CONTRACT_ID]);
    expect(engineSealedContracts().map((contract) => contract.contractId)).not.toContain(ASK_CLARIFY_V2_CONTRACT_ID);
    expect(engineSealedContracts()).not.toContain(ASK_CLARIFY_V2_DRAFT_CONTRACT);
  });
});

describe("the reply's shape: version 2's members, only adds", () => {
  it("a question takes one sentence per answer, never another count, and the place mark only as true", () => {
    expect(ClarifyQuestionSchema.safeParse(WHEN).success).toBe(true);
    expect(ClarifyQuestionSchema.safeParse(WHERE).success).toBe(true);
    expect(ClarifyQuestionSchema.safeParse({ ...WHEN, sentences: ["I mean the next 25 years."] }).success).toBe(false);
    expect(ClarifyQuestionSchema.safeParse({ ...WHEN, sentences: [...WHEN.sentences, "One more."] }).success).toBe(false);
    expect(ClarifyQuestionSchema.safeParse({ ...WHEN, about_place: false }).success).toBe(false);
  });

  it("the care question takes 2 to 4 answers, never 1 or 5, and counts as a question on its own", () => {
    for (const count of [2, 3, 4]) {
      const cares = { text: CARES.text, answers: answerOf(count), sentences: sentencesOf(count) };
      expect(AskClarifyResponseSchema.safeParse({ source: "AI", questions: [], purpose: PURPOSE, cares }).success, String(count)).toBe(true);
    }
    for (const count of [1, 5]) {
      const cares = { text: CARES.text, answers: answerOf(count) };
      expect(AskClarifyResponseSchema.safeParse({ source: "AI", questions: [], purpose: PURPOSE, cares }).success, String(count)).toBe(false);
    }
    expect(AskClarifyResponseSchema.safeParse({ source: "AI", questions: [], cares: CARES }).success).toBe(true);
    expect(AskClarifyResponseSchema.safeParse({ source: "AI", questions: [] }).success).toBe(false);
  });

  it("a version 1 reply (no care question, no sentences) parses unchanged", () => {
    const v1: AskClarifyResponse = { source: "AI", questions: [plain(WHERE), plain(WHEN)], purpose: plain(PURPOSE) };
    expect(AskClarifyResponseSchema.parse(v1)).toEqual(v1);
    expect(Object.keys(AskClarifyResponseSchema.parse(v1))).toEqual(["source", "questions", "purpose"]);
  });

  it("the stored lines and the merge's answers hold five answers (room for the care answer), never six", () => {
    const answers = (count: number) => Array.from({ length: count }, (_, at) => ({ question: `Question ${at + 1}?`, answer: `Answer ${at + 1}` }));
    expect(PurposeLinesSchema.safeParse({ answers: answers(5) }).success).toBe(true);
    expect(PurposeLinesSchema.safeParse({ answers: answers(6) }).success).toBe(false);
    const ref = "eyJhIjoxfQ.c2lnbmF0dXJl";
    const merge = (count: number) => ({ question_line: QUESTION, check_ref: ref, reading_level: "plain",
      lists: [{ ref, list: { list_no: 1, angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
        viewpoints: [{ viewpoint_id: "pt11", title: "Costs", question: "What does it cost?", why: "It decides it.", angle_id: "g1" }] } }],
      clarify: { answers: answers(count) } });
    expect(StartMergeRequestSchema.safeParse(merge(5)).success).toBe(true);
    expect(StartMergeRequestSchema.safeParse(merge(6)).success).toBe(false);
  });

  it("the request takes `earlier` (read-f1) with up to five questions and five answers, never six of either, and nothing else in it", () => {
    const questions = (count: number) => Array.from({ length: count }, (_, at) => ({ text: `Question ${at + 1}?`, answers: ["Yes", "No"] }));
    const answers = (count: number) => Array.from({ length: count }, (_, at) => ({ question: `Question ${at + 1}?`, answer: "Yes" }));
    const request = (earlier: unknown) => AskClarifyRequestSchema.safeParse({ question_line: QUESTION, earlier });
    expect(AskClarifyRequestSchema.safeParse({ question_line: QUESTION }).success).toBe(true);
    expect(request({ questions: questions(5), answers: answers(5) }).success).toBe(true);
    expect(request({ questions: [{ ...WHERE }, CARES], answers: [] }).success).toBe(true);
    expect(request({ questions: questions(6), answers: answers(5) }).success).toBe(false);
    expect(request({ questions: questions(5), answers: answers(6) }).success).toBe(false);
    expect(request({ questions: questions(1), answers: answers(1), words: "more" }).success).toBe(false);
  });
});

describe("the API before and after the seal", () => {
  it("with version 1 sealed: asks with version 1, and a request with `earlier` frames the same material as one without it, byte for byte", async () => {
    const without = gateway([JSON.stringify(V2_REPLY)]);
    const withEarlier = gateway([JSON.stringify(V2_REPLY)]);
    const plainAnswer = await without.port.read(OWNER, QUESTION, null);
    const earlierAnswer = await withEarlier.port.read(OWNER, QUESTION, null, EARLIER);
    expect(readPromptFrame(withEarlier.packets[0]!).contractId).toBe(ASK_CLARIFY_CONTRACT_ID);
    expect(fieldsOf(withEarlier.packets[0]!)).toEqual(fieldsOf(without.packets[0]!));
    expect(fieldsOf(withEarlier.packets[0]!)).toEqual([{ name: "question", content: QUESTION }]);
    // Version 2's members are read only once it is sealed: a reply that carries them reads as version 1's.
    const v1 = { source: "AI", questions: [plain(WHERE), plain(WHEN)], purpose: plain(PURPOSE) };
    expect(plainAnswer).toEqual(v1);
    expect(earlierAnswer).toEqual(v1);
  });

  it("the framed material ignores `earlier` under version 1, and the builder still takes the question as its one required input", () => {
    expect(framedAskClarify).toHaveLength(1);
    expect(fieldsOf(framedAskClarify(QUESTION, { earlier: EARLIER }))).toEqual([{ name: "question", content: QUESTION }]);
  });

  it("with version 2 in a test double of the sealed list: asks with it, `earlier` is the material's second field, and its members are read", async () => {
    const { port, packets } = gateway([JSON.stringify(V2_REPLY)], [ASK_CLARIFY_PROMPT_CONTRACT, ASK_CLARIFY_V2_DRAFT_CONTRACT]);
    const answer = await port.read(OWNER, QUESTION, null, EARLIER);
    expect(readPromptFrame(packets[0]!).contractId).toBe(ASK_CLARIFY_V2_CONTRACT_ID);
    const fields = fieldsOf(packets[0]!);
    expect(fields.map((field) => field.name)).toEqual(["question", "earlier"]);
    expect(JSON.parse(fields[1]!.content)).toEqual(EARLIER);
    expect(answer).toEqual({ source: "AI", questions: [WHERE, WHEN], purpose: PURPOSE, cares: CARES });
    expect(AskClarifyResponseSchema.safeParse(answer).success).toBe(true);
    // No earlier reading: the question alone.
    const first = gateway([JSON.stringify(V2_REPLY)], [ASK_CLARIFY_PROMPT_CONTRACT, ASK_CLARIFY_V2_DRAFT_CONTRACT]);
    await first.port.read(OWNER, QUESTION, null);
    expect(fieldsOf(first.packets[0]!).map((field) => field.name)).toEqual(["question"]);
  });

  it("version 2's reader keeps each sentence with its answer, all or none; one place mark; a care question that repeats another goes", () => {
    const reading = readAskClarifyReply(JSON.stringify({
      questions: [
        { ...WHERE, answers: ["Harbour Town", "harbour town", "Bay Town"], sentences: ["I mean Harbour Town.", "Again.", "I mean Bay Town."] },
        { ...WHEN, sentences: ["I mean the next 25 years."], about_place: true },
        { text: "Which pier?", answers: ["North", "South"], sentences: ["I mean the north pier.", "<the person's own short sentence for the first answer>"] }
      ],
      purpose: PURPOSE,
      cares: { ...CARES, text: "Which town?" }
    }), "v2")!;
    expect(reading.questions[0]).toEqual(WHERE);
    expect(reading.questions[1]).toEqual(plain(WHEN));
    expect(reading.questions[2]).toEqual({ text: "Which pier?", answers: ["North", "South"] });
    expect(reading.purpose).toEqual(PURPOSE);
    expect(reading.cares).toBeNull();
    // Version 1's reader reads none of it.
    const v1 = readAskClarifyReply(JSON.stringify(V2_REPLY))!;
    expect(v1.questions).toEqual([plain(WHERE), plain(WHEN)]);
    expect(v1.purpose).toEqual(plain(PURPOSE));
    expect(v1.cares).toBeNull();
  });
});

describe("POST /v1/asks/clarify with `earlier` (read-f1)", () => {
  const IDENTITY = testHttpIdentity("ask-clarify-v2");
  const headers = testSessionHeaders(IDENTITY, true);
  const application = { submit: async () => { throw new Error("not reached"); } } as unknown as AskApplication;
  function apiOver() {
    const seen: unknown[][] = [];
    const sessions = { ...testSessionApplication([IDENTITY]), readSensitiveDataConsent: async () => "given" };
    const api = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN,
      askClarify: { read: async (...args: unknown[]) => { seen.push(args); return { source: "AI" as const, questions: [], purpose: plain(PURPOSE) }; } }
    } as never);
    return { api, seen };
  }
  const post = (api: ReturnType<typeof buildApi>, payload: unknown) =>
    api.inject({ method: "POST", url: "/v1/asks/clarify", headers, payload: payload as Record<string, unknown> });

  it("hands `earlier` to the reading (which frames it only once version 2 is sealed); without it, none", async () => {
    const { api, seen } = apiOver();
    expect((await post(api, { question_line: QUESTION, earlier: EARLIER })).statusCode).toBe(200);
    expect((await post(api, { question_line: QUESTION })).statusCode).toBe(200);
    expect(seen).toEqual([[IDENTITY.authenticated.ownerRef, QUESTION, null, EARLIER], [IDENTITY.authenticated.ownerRef, QUESTION, null, null]]);
    await api.close();
  });

  it("a malformed `earlier` is refused and nothing is read; an earlier answer in a person's crisis words reaches no model", async () => {
    const { api, seen } = apiOver();
    expect((await post(api, { question_line: QUESTION, earlier: { questions: [], answers: [], more: 1 } })).statusCode).toBe(400);
    const crisis = { ...EARLIER, answers: [{ question: "Over what time?", answer: "I want to kill myself tonight" }] };
    const response = await post(api, { question_line: QUESTION, earlier: crisis });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ source: "NONE" });
    expect(seen).toEqual([]);
    await api.close();
  });
});
