// tests/unit/ask-clarify-v3.test.ts
// Design Document v2 (16b), "How we read your question": the clarifying call's version 3. Its instruction is version 2's, word
// for word, then the words for the sentence that says the question back: a marked place for each question the sentence depends
// on, the words for each answer in that place, and the answer the AI assumes. The owner approved the wording of versions 2 and 3
// as written (17 Nov), and version 3 is sealed: on the call's sealed list and in the engine's seal, so the API asks with it and
// the reply carries the sentence. A call is asked with a version only while that version is on the sealed list, so a list
// without version 3 asks as before and reads no sentence, whatever a reply carries. Code turns the AI's sentence into the reply's
// `restatement`; a sentence it cannot use (a
// place naming no question, a phrase count that is not the answers', an assumed answer that is not one of them) is dropped and the
// questions are kept: it never fails the call and never costs a second one. Data is made up.
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { AskClarifyResponseSchema, WEB_CONTRACT_LIMITS } from "@debateai/contract";
import {
  ASK_CLARIFY_CONTRACT_ID, ASK_CLARIFY_DRAFT_CONTRACTS, ASK_CLARIFY_PROMPT_CONTRACT, ASK_CLARIFY_SEALED_CONTRACTS, ASK_CLARIFY_V2_CONTRACT_ID,
  ASK_CLARIFY_V2_DRAFT_CONTRACT, ASK_CLARIFY_V3_CONTRACT_ID, ASK_CLARIFY_V3_PROMPT_CONTRACT, framedAskClarify
} from "@debateai/judgement";
import { readPromptFrame, type PromptContract, type PromptPacket } from "@debateai/providers";
import { createAskClarify, readAskClarifyReply } from "../../apps/api/src/ask-clarify.js";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const QUESTION = "Should the town build a second pier?";
const RESTATEMENT_WORDS = "Also say the question back to the person in one sentence, in the question's language, as you understand it. Where "
  + "that sentence depends on the answer to one of your questions, leave a marked place for that question instead of words, and for each "
  + "answer of that question write the few words that would stand in that place, so that the sentence reads naturally with any of them. "
  + "For each such question, say which of its answers you assume when the person gives none: the one most people asking this would mean. "
  + "Mark at most one place for a question. Outside the marked places, the sentence says only what the question itself says.";

const PURPOSE = { text: "What do you want the answer for?", answers: ["To vote on it", "To write to the council"],
  sentences: ["I want it to vote on it.", "I want it to write to the council."] };
const WHERE = { text: "Which town?", answers: ["Harbour Town", "Bay Town"], sentences: ["I mean Harbour Town.", "I mean Bay Town."], about_place: true as const };
const WHEN = { text: "Over what time?", answers: ["The next 25 years", "Until 2030"], sentences: ["I mean the next 25 years.", "I mean until 2030."] };
const CARES = { text: "What do you care about most?", answers: ["Keeping fares low", "Fewer queues"],
  sentences: ["What I care about is: keeping fares low.", "What I care about is: fewer queues."] };

const WHERE_PHRASES = ["Harbour Town", "Bay Town"];
const WHEN_PHRASES = ["over the next 25 years", "by 2030"];
const PURPOSE_PHRASES = ["so that you can vote on it", "so that you can write to the council"];
const CARES_PHRASES = ["fares stay low", "queues get shorter"];
const SENTENCE = "You want to know whether {1} should build a second pier {2}, {purpose}, and what matters most is that {cares}.";
/** What the AI writes under version 3: each question with its phrases and the number of the answer it assumes, and the sentence. */
const V3_REPLY = {
  questions: [{ ...WHERE, phrases: WHERE_PHRASES, assumed: 1 }, { ...WHEN, phrases: WHEN_PHRASES, assumed: 2 }],
  purpose: { ...PURPOSE, phrases: PURPOSE_PHRASES, assumed: 1 },
  cares: { ...CARES, phrases: CARES_PHRASES, assumed: 2 },
  restatement: SENTENCE
};
/** What the page gets: the contract's parts, places counted from 0. */
const RESTATEMENT = { parts: [
  { text: "You want to know whether " }, { about: 0, phrases: WHERE_PHRASES, assumed: 0 },
  { text: " should build a second pier " }, { about: 1, phrases: WHEN_PHRASES, assumed: 1 },
  { text: ", " }, { about: "purpose", phrases: PURPOSE_PHRASES, assumed: 0 },
  { text: ", and what matters most is that " }, { about: "cares", phrases: CARES_PHRASES, assumed: 1 }, { text: "." }
] };
const QUESTIONS_ONLY = { source: "AI", questions: [WHERE, WHEN], purpose: PURPOSE, cares: CARES };

function gateway(replies: readonly (string | Error)[], sealed?: readonly PromptContract[]) {
  const packets: PromptPacket[] = [];
  const reports: string[] = [];
  const left = [...replies];
  const port = createAskClarify({ limits: { perHour: 11, perDay: 22 },
    transportFor: () => async ({ packet }) => {
      packets.push(packet);
      const next = left.shift();
      if (next === undefined) throw new Error("no scripted reply");
      if (next instanceof Error) throw next;
      return next;
    },
    reserve: async () => undefined,
    record: async () => undefined,
    clock: () => new Date("2026-11-16T10:00:00.000Z"),
    report: (line) => reports.push(`${line.event}:${line.code}`),
    ...(sealed === undefined ? {} : { sealed })
  });
  return { port, packets, reports };
}
const read = (reply: unknown) => readAskClarifyReply(JSON.stringify(reply), "v3")!;

describe("version 3 (Design Document v2, 16b)", () => {
  it("is version 2's instruction byte for byte, then the words for the sentence", () => {
    expect(ASK_CLARIFY_V3_CONTRACT_ID).toBe("ask.clarify.v3");
    expect(ASK_CLARIFY_V3_PROMPT_CONTRACT.contractId).toBe(ASK_CLARIFY_V3_CONTRACT_ID);
    expect(ASK_CLARIFY_V3_PROMPT_CONTRACT.instruction).toBe(`${ASK_CLARIFY_V2_DRAFT_CONTRACT.instruction} ${RESTATEMENT_WORDS}`);
  });

  it("holds no snake_case word in its instruction, and its answer form names each new member and each marked place", () => {
    expect(ASK_CLARIFY_V3_PROMPT_CONTRACT.instruction).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
    const form = ASK_CLARIFY_V3_PROMPT_CONTRACT.answerForm;
    for (const member of ["\"questions\"", "\"purpose\"", "\"cares\"", "\"sentences\"", "\"about_place\": true", "\"phrases\"", "\"assumed\"", "\"restatement\""]) {
      expect(form).toContain(member);
    }
    for (const place of ["{1}", "{2}", "{3}", "{purpose}", "{cares}"]) expect(form).toContain(place);
    for (const text of [ASK_CLARIFY_V3_PROMPT_CONTRACT.instruction, form]) {
      expect(text).not.toMatch(/\b(P[1-9][0-9]*|b[1-8]|pt[1-9][1-6]|kp\d{2}|cd[1-3]|sg[1-9]|g[1-7]|n\d+)\b/u);
      expect(text).not.toMatch(/Bucharest|Romania|bills/iu);
    }
  });

  it("is sealed: on the call's sealed list after version 1, in the engine's seal right after it, and off the drafts' list", () => {
    expect(ASK_CLARIFY_SEALED_CONTRACTS).toEqual([ASK_CLARIFY_PROMPT_CONTRACT, ASK_CLARIFY_V3_PROMPT_CONTRACT]);
    expect(ASK_CLARIFY_SEALED_CONTRACTS[1]).toBe(ASK_CLARIFY_V3_PROMPT_CONTRACT);
    expect(Object.isFrozen(ASK_CLARIFY_SEALED_CONTRACTS)).toBe(true);
    expect(Object.isFrozen(ASK_CLARIFY_V3_PROMPT_CONTRACT)).toBe(true);
    const engine = engineSealedContracts();
    const at = engine.indexOf(ASK_CLARIFY_PROMPT_CONTRACT);
    expect(at).toBeGreaterThan(-1);
    expect(engine[at + 1]).toBe(ASK_CLARIFY_V3_PROMPT_CONTRACT);
    expect(engine.filter((contract) => contract.contractId === ASK_CLARIFY_V3_CONTRACT_ID)).toHaveLength(1);
    // Version 2 was never sealed by itself (version 3 holds its words): it alone is left on the drafts' list, and no call asks it.
    expect(ASK_CLARIFY_DRAFT_CONTRACTS).toEqual([ASK_CLARIFY_V2_DRAFT_CONTRACT]);
    expect(engine.map((contract) => contract.contractId)).not.toContain(ASK_CLARIFY_V2_CONTRACT_ID);
  });

  it("frames the questions of an earlier wording as version 2 does", () => {
    const earlier = { questions: [{ text: WHEN.text, answers: [...WHEN.answers] }], answers: [{ question: WHEN.text, answer: "2040" }] };
    const fields = readPromptFrame(framedAskClarify(QUESTION, { contract: ASK_CLARIFY_V3_PROMPT_CONTRACT, earlier })).fields;
    expect(fields.map((field) => field.name)).toEqual(["question", "earlier"]);
    expect(JSON.parse(fields[1]!.content)).toEqual(earlier);
  });
});

describe("the version gate", () => {
  it("as shipped (no list stood in): asks with version 3, and the reply says the question back", async () => {
    const { port, packets, reports } = gateway([JSON.stringify(V3_REPLY)]);
    const answer = await port.read(OWNER, QUESTION, null);
    expect(readPromptFrame(packets[0]!).contractId).toBe(ASK_CLARIFY_V3_CONTRACT_ID);
    expect(answer).toEqual({ ...QUESTIONS_ONLY, restatement: RESTATEMENT });
    expect(reports).toEqual([]);
  });

  it("with version 1 alone on the list: asks with version 1 and reads no sentence, whatever the reply carries", async () => {
    const { port, packets } = gateway([JSON.stringify(V3_REPLY)], [ASK_CLARIFY_PROMPT_CONTRACT]);
    const answer = await port.read(OWNER, QUESTION, null);
    expect(readPromptFrame(packets[0]!).contractId).toBe(ASK_CLARIFY_CONTRACT_ID);
    expect(answer).not.toHaveProperty("restatement");
    expect(answer).not.toHaveProperty("cares");
  });

  it("with version 2 on the sealed list: asks with version 2, whose reply has no sentence", async () => {
    const { port, packets, reports } = gateway([JSON.stringify(V3_REPLY)], [ASK_CLARIFY_PROMPT_CONTRACT, ASK_CLARIFY_V2_DRAFT_CONTRACT]);
    const answer = await port.read(OWNER, QUESTION, null);
    expect(readPromptFrame(packets[0]!).contractId).toBe(ASK_CLARIFY_V2_CONTRACT_ID);
    expect(answer).toEqual(QUESTIONS_ONLY);
    expect(reports).toEqual([]);
  });

  it("with version 3 on a list stood in: asks with version 3, and the reply says the question back", async () => {
    const { port, packets, reports } = gateway([JSON.stringify(V3_REPLY)], [ASK_CLARIFY_PROMPT_CONTRACT, ASK_CLARIFY_V3_PROMPT_CONTRACT]);
    const answer = await port.read(OWNER, QUESTION, null);
    expect(readPromptFrame(packets[0]!).contractId).toBe(ASK_CLARIFY_V3_CONTRACT_ID);
    expect(answer).toEqual({ ...QUESTIONS_ONLY, restatement: RESTATEMENT });
    expect(AskClarifyResponseSchema.parse(answer)).toEqual(answer);
    expect(reports).toEqual([]);
  });

  it("with versions 2 and 3 both on the list: asks with version 3", async () => {
    const { port, packets } = gateway([JSON.stringify(V3_REPLY)], [ASK_CLARIFY_PROMPT_CONTRACT, ASK_CLARIFY_V2_DRAFT_CONTRACT, ASK_CLARIFY_V3_PROMPT_CONTRACT]);
    await port.read(OWNER, QUESTION, null);
    expect(readPromptFrame(packets[0]!).contractId).toBe(ASK_CLARIFY_V3_CONTRACT_ID);
  });
});

describe("version 3's reader: the AI's sentence becomes the reply's parts", () => {
  it("each marked place becomes its question's part, places counted from 0; the plain words keep their spaces", () => {
    const reading = read(V3_REPLY);
    expect(reading.restatement).toEqual(RESTATEMENT);
    // The questions stay the contract's: the phrases and the assumed answer live in the sentence's parts only.
    expect(reading.questions).toEqual([WHERE, WHEN]);
    expect(reading.purpose).toEqual(PURPOSE);
    expect(reading.cares).toEqual(CARES);
  });

  it("line breaks and runs of spaces in the sentence become one space; a sentence of plain words alone is kept", () => {
    expect(read({ ...V3_REPLY, restatement: "  You want to know whether\n{1}  should build\ta second pier.  " }).restatement).toEqual({ parts: [
      { text: "You want to know whether " }, { about: 0, phrases: WHERE_PHRASES, assumed: 0 }, { text: " should build a second pier." }] });
    expect(read({ ...V3_REPLY, restatement: "You want to know whether the town should build a second pier." }).restatement)
      .toEqual({ parts: [{ text: "You want to know whether the town should build a second pier." }] });
  });

  it("a question the sentence has no place for needs no phrases, and two places may touch", () => {
    const reply = { questions: [WHERE, { ...WHEN, phrases: WHEN_PHRASES, assumed: 1 }], purpose: { ...PURPOSE, phrases: PURPOSE_PHRASES, assumed: 2 },
      restatement: "A second pier {2}{purpose}?" };
    expect(read(reply).restatement).toEqual({ parts: [{ text: "A second pier " }, { about: 1, phrases: WHEN_PHRASES, assumed: 0 },
      { about: "purpose", phrases: PURPOSE_PHRASES, assumed: 1 }, { text: "?" }] });
  });

  it("a place follows its question when an earlier question was dropped, and the phrases follow the answers that were kept", () => {
    const reply = {
      questions: [{ text: "", answers: ["Yes", "No"], phrases: ["yes", "no"], assumed: 1 },
        { ...WHEN, answers: ["The next 25 years", "the next 25 years", "Until 2030"], sentences: ["I mean the next 25 years.", "Again.", "I mean until 2030."],
          phrases: ["over the next 25 years", "again", "by 2030"], assumed: 3 }],
      purpose: PURPOSE, restatement: "A second pier {2}?"
    };
    const reading = read(reply);
    expect(reading.questions).toEqual([WHEN]);
    expect(reading.restatement).toEqual({ parts: [{ text: "A second pier " }, { about: 0, phrases: WHEN_PHRASES, assumed: 1 }, { text: "?" }] });
  });

  const unusable: ReadonlyArray<readonly [string, unknown]> = [
    ["a place naming a question the reply does not have", { ...V3_REPLY, restatement: "A pier {3}." }],
    ["a place of another name", { ...V3_REPLY, restatement: "A pier {where}." }],
    ["a place numbered from 0", { ...V3_REPLY, restatement: "A pier {0}." }],
    ["a place for the care question when the reply has none", { questions: V3_REPLY.questions, purpose: V3_REPLY.purpose, restatement: "A pier {cares}." }],
    ["a place for a question that was dropped", { ...V3_REPLY, questions: [{ ...V3_REPLY.questions[0], answers: ["Harbour Town"] }, V3_REPLY.questions[1]],
      restatement: "A pier in {1}." }],
    ["a place whose question has no phrases", { ...V3_REPLY, questions: [{ ...WHERE, assumed: 1 }, V3_REPLY.questions[1]] }],
    ["fewer phrases than answers", { ...V3_REPLY, questions: [{ ...WHERE, phrases: ["Harbour Town"], assumed: 1 }, V3_REPLY.questions[1]] }],
    ["more phrases than answers", { ...V3_REPLY, questions: [{ ...WHERE, phrases: [...WHERE_PHRASES, "any town"], assumed: 1 }, V3_REPLY.questions[1]] }],
    ["a phrase that is no usable line", { ...V3_REPLY, questions: [{ ...WHERE, phrases: ["Harbour Town", " "], assumed: 1 }, V3_REPLY.questions[1]] }],
    ["a phrase that is a copied placeholder", { ...V3_REPLY, questions: [{ ...WHERE, phrases: ["Harbour Town", "<the words for this answer>"], assumed: 1 }, V3_REPLY.questions[1]] }],
    ["no assumed answer", { ...V3_REPLY, questions: [{ ...WHERE, phrases: WHERE_PHRASES }, V3_REPLY.questions[1]] }],
    ["an assumed answer numbered 0", { ...V3_REPLY, questions: [{ ...WHERE, phrases: WHERE_PHRASES, assumed: 0 }, V3_REPLY.questions[1]] }],
    ["an assumed answer past the last", { ...V3_REPLY, questions: [{ ...WHERE, phrases: WHERE_PHRASES, assumed: 3 }, V3_REPLY.questions[1]] }],
    ["an assumed answer that is no whole number", { ...V3_REPLY, questions: [{ ...WHERE, phrases: WHERE_PHRASES, assumed: 1.5 }, V3_REPLY.questions[1]] }],
    ["an assumed answer written as words", { ...V3_REPLY, questions: [{ ...WHERE, phrases: WHERE_PHRASES, assumed: "1" }, V3_REPLY.questions[1]] }],
    ["an assumed answer that was dropped as a repeat", { ...V3_REPLY, questions: [{ text: WHERE.text, answers: ["Harbour Town", "Bay Town", "bay town"],
      phrases: ["Harbour Town", "Bay Town", "the bay"], assumed: 3 }, V3_REPLY.questions[1]] }],
    ["two places for one question", { ...V3_REPLY, restatement: "A pier in {1}, yes in {1}." }],
    ["a brace that marks no place", { ...V3_REPLY, restatement: "A pier in {1} } or not." }],
    ["an opened place never closed", { ...V3_REPLY, restatement: "A pier in {1 or not." }],
    ["a copied placeholder", { ...V3_REPLY, restatement: "<the question said back in one sentence>" }],
    ["an empty sentence", { ...V3_REPLY, restatement: "  " }],
    ["a sentence that is no text", { ...V3_REPLY, restatement: [{ text: "A pier." }] }],
    ["no sentence at all", { questions: V3_REPLY.questions, purpose: V3_REPLY.purpose, cares: V3_REPLY.cares }],
    ["plain words longer than a part holds", { ...V3_REPLY, restatement: `${"word ".repeat(WEB_CONTRACT_LIMITS.clarifyRestatementTextMaxChars / 5)}more {1}.` }]
  ];
  it.each(unusable)("%s: the sentence is dropped and the questions are kept", (_name, reply) => {
    const reading = read(reply);
    expect(reading.restatement).toBeNull();
    expect(reading.purpose).toEqual(PURPOSE);
    expect(reading.questions.length).toBeGreaterThan(0);
  });

  it("versions 1 and 2 read no sentence", () => {
    expect(readAskClarifyReply(JSON.stringify(V3_REPLY))!.restatement).toBeNull();
    expect(readAskClarifyReply(JSON.stringify(V3_REPLY), "v2")!.restatement).toBeNull();
    expect(readAskClarifyReply(JSON.stringify(V3_REPLY), "v2")!.questions).toEqual([WHERE, WHEN]);
  });
});

describe("a sentence the AI got wrong never fails the call", () => {
  it("the questions are answered without it, one content-free line says so, and no second call is made for it", async () => {
    const { port, packets, reports } = gateway([JSON.stringify({ ...V3_REPLY, restatement: "A pier {3}." })]);
    const answer = await port.read(OWNER, QUESTION, null);
    expect(answer).toEqual(QUESTIONS_ONLY);
    expect(AskClarifyResponseSchema.safeParse(answer).success).toBe(true);
    expect(packets).toHaveLength(1);
    expect(reports).toEqual(["api.ask_clarify.restatement_none:RESTATEMENT_UNUSABLE"]);
  });

  it("the sentence goes with the reading that is kept: after a re-ask for the purpose question, the second reply's", async () => {
    const first = { questions: V3_REPLY.questions, restatement: "A pier in {1}." };
    const { port, packets } = gateway([JSON.stringify(first), JSON.stringify(V3_REPLY)]);
    expect(await port.read(OWNER, QUESTION, null)).toEqual({ ...QUESTIONS_ONLY, restatement: RESTATEMENT });
    expect(packets).toHaveLength(2);
  });

  it("the re-ask failing: the first reply's questions stand with their own sentence", async () => {
    const first = { questions: V3_REPLY.questions, restatement: "A pier in {1}." };
    const { port } = gateway([JSON.stringify(first), new Error("gateway down")]);
    expect(await port.read(OWNER, QUESTION, null)).toEqual({ source: "AI", questions: [WHERE, WHEN],
      restatement: { parts: [{ text: "A pier in " }, { about: 0, phrases: WHERE_PHRASES, assumed: 0 }, { text: "." }] } });
  });
});

describe("POST /v1/asks/clarify, version 3 sealed (the list as shipped)", () => {
  const IDENTITY = testHttpIdentity("ask-clarify-v3");
  const headers = testSessionHeaders(IDENTITY, true);
  const application = { submit: async () => { throw new Error("not reached"); } } as unknown as AskApplication;
  function apiOver(aiReply: unknown) {
    const sessions = { ...testSessionApplication([IDENTITY]), readSensitiveDataConsent: async () => "given" };
    return buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, askClarify: gateway([JSON.stringify(aiReply)]).port } as never);
  }
  const post = (api: ReturnType<typeof buildApi>) =>
    api.inject({ method: "POST", url: "/v1/asks/clarify", headers, payload: { question_line: QUESTION } });

  it("an ordinary question: the reply carries a restatement the contract accepts", async () => {
    const api = apiOver(V3_REPLY);
    const response = await post(api);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...QUESTIONS_ONLY, restatement: RESTATEMENT });
    expect(AskClarifyResponseSchema.safeParse(response.json()).success).toBe(true);
    await api.close();
  });

  it("a sentence the AI got wrong: 200 with the questions and no restatement", async () => {
    const api = apiOver({ ...V3_REPLY, purpose: { ...V3_REPLY.purpose, phrases: ["so that you can vote on it"] } });
    const response = await post(api);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(QUESTIONS_ONLY);
    await api.close();
  });
});
