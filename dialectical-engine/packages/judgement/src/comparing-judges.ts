/**
 * ENGINE 2 — THE COMPARING JUDGES (spec 2026-10-15 §4.3, §4.8, §4.9; INTERFACE §9.1-§9.3; owner rulings E2, E9, P1.8,
 * P1.9).
 *
 * Plain words: after the arguing, up to three AIs compare the finished answers and say which one is best supported,
 * whether it is conditional, which answers say the same thing in other words, why (what decided it, and whether the
 * strongest objection to it still stands; D6), and what kind of question this is (pre-flight PF-R2b1.2).
 * This file holds the sealed contract `verdict.judge.v1` (sealed by `engineContractHash`, never by the engine-1 judge
 * seal), the material each judge is given, how a reply is read and checked, which seats judge, and in which order each
 * judge sees the answers. Every text a judge reads is AI-written; code only selects, orders and labels (G1). A judge is
 * never given a number, a node id or the name of the AI that argued an answer: answers carry fixed letters (A = the
 * first root, ...), and only the ORDER rotates per judge (INTERFACE §9.1). Counting the votes is serve's
 * (`deriveJudgesVerdict`); the call order and the records are the runner's.
 */
import { z } from "zod";
import {
  ENGINE_ANSWER_LETTERS,
  ENGINE_QUESTION_KINDS,
  LENGTH_SENTENCE_WRITING,
  TypedDomainError,
  WEB_EXTRACT_WEIGH_SENTENCE,
  argumentLanguageDirective,
  lengthGuidanceField,
  questionLanguageSentence,
  replyLanguageCheckFor,
  withQuestionLanguageField,
  type EngineAnswerLetter,
  type EngineCitedExtract,
  type EngineDebateMaterial,
  type EngineMaterialPoint,
  type EngineQuestionKind,
  type LengthGuide,
  type QuestionLanguage
} from "@debateai/kernel";
import {
  ProviderContentUnacceptedError,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  rememberingAcceptedReply,
  schemaFailureLocator,
  type CallBound,
  type ContentClassification,
  type ModelReplyFacts,
  type PromptContract,
  type ProviderGateway
} from "@debateai/providers";
import { classifyStructuredArtifact, parseStructuredArtifact, type StructuredReadingOptions } from "./s04.js";

/* ------------------------------------------------------------------ the contract */

export const COMPARING_JUDGE_CONTRACT_ID = "verdict.judge.v1" as const;

// OWNER WORDING — approve before switch-on (pre-flight PF-R2a8.12: option 1 ships behind the off switch; a later
// rewording is a new contract id, verdict.judge.v2, and a new engine seal).
/** OWNER-EDITABLE (spec §4.8, option 1, with D6; pre-flight PF-R2b1.2). Names no material field (P2.7). */
export const COMPARING_JUDGE_INSTRUCTION =
  "Compare the answers to the question and say which one is best supported by the arguments made for it and against it. "
  + "Judge only from what you are given here, and add no facts of your own. Weigh how well each answer stands up to its "
  + "strongest objections, not how carefully it is worded: an answer that avoids taking a position is not better supported "
  + "because it is harder to attack. A point marked as disputed counts for less. If two answers say the same thing in other "
  + "words, say so. Say whether the answer you choose is conditional, meaning it goes one way in some cases and the other "
  + "way in others. Give your reasons in a few plain sentences: what decided it, and the strongest objection to it and whether "
  + "it still stands. Then name which kind of question this is.";

// OWNER WORDING — approve before switch-on (the answer form is code-owned but new text the AI reads, its closing
// sentence included).
/** Code-owned: an instruction edit cannot drop it. One constant for every debate, so the seal never varies per call. */
export const COMPARING_JUDGE_ANSWER_FORM = [
  "Return only one JSON object with exactly this schema and no additional keys:",
  "{",
  "  \"best\": the letter of the best-supported answer, one of the letters shown,",
  "  \"conditional\": true | false,",
  "  \"same_as\": [[letter, letter, ...], ...],",
  "  \"reasons\": non-empty string,",
  `  "question_kind": ${ENGINE_QUESTION_KINDS.map((kind) => `"${kind}"`).join(" | ")}`,
  "}",
  "Each same_as group holds at least two different letters that give the same answer in other words, and no letter is in "
    + "two groups; use [] when no two answers are the same."
].join("\n");

/** Engine-2 contracts are always lengthed (INTERFACE §0): LG-C's fixed sentence follows the owner's text. */
export const COMPARING_JUDGE_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: COMPARING_JUDGE_CONTRACT_ID,
  instruction: `${COMPARING_JUDGE_INSTRUCTION} ${LENGTH_SENTENCE_WRITING}`,
  answerForm: COMPARING_JUDGE_ANSWER_FORM
});

/**
 * Web search (plan 2026-10-30 task W1-5; design §7.1 item 7, approved 2026-10-30): the comparing judges when the debate
 * read web sources. A looked-up point then carries the extract it rests on (inside the `answers` field), and the judges are
 * told the item-7 sentence, after the owner's text and before the length sentence. A NEW contract (never an edit of
 * verdict.judge.v1), sealed by engineContractHash only; a debate without sources sends verdict.judge.v1 to the byte.
 */
export const COMPARING_JUDGE_SOURCES_CONTRACT_ID = "verdict.judge.sources.v1" as const;
export const COMPARING_JUDGE_SOURCES_PROMPT_CONTRACT: PromptContract = Object.freeze({
  contractId: COMPARING_JUDGE_SOURCES_CONTRACT_ID,
  instruction: `${COMPARING_JUDGE_INSTRUCTION} ${WEB_EXTRACT_WEIGH_SENTENCE} ${LENGTH_SENTENCE_WRITING}`,
  answerForm: COMPARING_JUDGE_ANSWER_FORM
});

/** The material, in order; `question_language` rides LAST, only when the run is locked (`withQuestionLanguageField`). */
export const COMPARING_JUDGE_MATERIAL_FIELDS = Object.freeze(["question", "answers", "disputed_points", "length"] as const);

/** Seat numbers are 1..5 (`comparingJudgeCallSiteKey`, the votes table's `judge_seat`). */
export const COMPARING_JUDGE_LIMITS = Object.freeze({ maxSeats: 5 });

/* ---------------------------------------------------------------- the reply */

const letterSchema = z.enum(ENGINE_ANSWER_LETTERS);

/** Strict. `same_as` absent reads as "no two answers are the same", exactly as `[]`. */
export const comparingJudgeReplySchema = z.object({
  best: letterSchema,
  conditional: z.boolean(),
  same_as: z.array(z.array(letterSchema)).optional(),
  reasons: z.string().trim().min(1),
  question_kind: z.enum(ENGINE_QUESTION_KINDS)
}).strict();
export type ComparingJudgeWireReply = z.infer<typeof comparingJudgeReplySchema>;

export const COMPARING_JUDGE_UNKNOWN_LETTER = "COMPARING_JUDGE_UNKNOWN_LETTER" as const;
export const COMPARING_JUDGE_GROUPS_INVALID = "COMPARING_JUDGE_GROUPS_INVALID" as const;
export type ComparingJudgeReplyIssue = Readonly<{
  code: typeof COMPARING_JUDGE_UNKNOWN_LETTER | typeof COMPARING_JUDGE_GROUPS_INVALID;
  path: readonly (string | number)[];
  message: typeof COMPARING_JUDGE_UNKNOWN_LETTER | typeof COMPARING_JUDGE_GROUPS_INVALID;
}>;

/**
 * The content checks (INTERFACE §9.2): `best` and every grouped letter are letters this judge was shown; a group holds at
 * least two different letters; no letter is in two groups. Issues sit at machine paths, so the call's PATCH names them.
 */
export function comparingJudgeReplyIssues(
  reply: ComparingJudgeWireReply,
  shownLetters: readonly EngineAnswerLetter[]
): readonly ComparingJudgeReplyIssue[] {
  const shown = new Set<string>(shownLetters);
  const issues: ComparingJudgeReplyIssue[] = [];
  const issue = (code: ComparingJudgeReplyIssue["code"], path: readonly (string | number)[]): void => {
    issues.push(Object.freeze({ code, path: Object.freeze([...path]), message: code }));
  };
  if (!shown.has(reply.best)) issue(COMPARING_JUDGE_UNKNOWN_LETTER, ["best"]);
  const grouped = new Set<string>();
  (reply.same_as ?? []).forEach((group, index) => {
    group.forEach((letter, position) => {
      if (!shown.has(letter)) issue(COMPARING_JUDGE_UNKNOWN_LETTER, ["same_as", index, position]);
    });
    const distinct = new Set(group);
    if (distinct.size < 2 || distinct.size !== group.length || group.some((letter) => grouped.has(letter))) {
      issue(COMPARING_JUDGE_GROUPS_INVALID, ["same_as", index]);
    }
    for (const letter of group) grouped.add(letter);
  });
  return Object.freeze(issues);
}

/** The judge's reading: unasked root keys dropped, then LG-A's schema-guided fixer (L31), then the content checks. */
export const COMPARING_JUDGE_READING: StructuredReadingOptions = Object.freeze({ unaskedKeys: true, fixer: Object.freeze({}) });
/** The reply's prose, checked for the question's language like every other step's. */
export const COMPARING_JUDGE_PROSE = Object.freeze(["reasons"] as const);

export function classifyComparingJudgeReply(content: string, reply: ModelReplyFacts | undefined, context: Readonly<{
  shownLetters: readonly EngineAnswerLetter[];
  question: string;
  questionLanguage?: QuestionLanguage | null;
}>): ContentClassification {
  const inQuestionLanguage = replyLanguageCheckFor(context.question, context.questionLanguage, COMPARING_JUDGE_PROSE);
  return classifyStructuredArtifact(content, comparingJudgeReplySchema, reply, COMPARING_JUDGE_READING,
    (value) => [...comparingJudgeReplyIssues(value, context.shownLetters), ...inQuestionLanguage(value)]);
}

/* ------------------------------------------------------------- the material */

/** Fixed code rotation (INTERFACE §9.3): judge k (1-based) sees the answers starting at index (k - 1) mod n. */
export function comparingJudgeOrder(answerCount: number, seat: number): readonly number[] {
  if (!Number.isSafeInteger(answerCount) || answerCount < 1 || !Number.isSafeInteger(seat) || seat < 1) {
    throw new TypedDomainError("COMPARING_JUDGE_ORDER_INVALID", `answers ${String(answerCount)}, seat ${String(seat)}`);
  }
  const start = (seat - 1) % answerCount;
  return Object.freeze(Array.from({ length: answerCount }, (_, step) => (start + step) % answerCount));
}

// OWNER WORDING — approve before switch-on (the material's keys below and in `comparingJudgeMaterialFields` are new
// words the AI reads: answers, letter, answer, case, supporting_points, objections, assumptions, disputed,
// not_yet_checked, rests_on, from_rival_reply, investigation, reviewer_reasons, disputed_points).
/**
 * Web search (W4-1; design §7.1 item 7): the extract a looked-up point (or a case) rests on, as a judge reads it: its id,
 * the quote word for word, and the page's title, site and date. Never the page's text, a grade or a reader.
 */
function extractForJudge(extract: EngineCitedExtract) {
  return Object.freeze({ id: extract.id, quote: extract.quote, title: extract.title, site: extract.site, date: extract.date });
}

/** W4-1: whether the material a judge is shown carries any cited extract (then the judges' sources variant is sent). */
export function comparingJudgeMaterialCitesExtracts(material: EngineDebateMaterial): boolean {
  return material.answers.some((answer) => answer.citedExtract !== undefined
    || [...answer.supports, ...answer.objections].some((point) => point.citedExtract !== undefined));
}

/** One point as a judge reads it: its words and its labels; never its node id, its maker or a number. */
function pointForJudge(point: EngineMaterialPoint) {
  return Object.freeze({
    text: point.text,
    disputed: point.disputed,
    not_yet_checked: point.notYetChecked,
    rests_on: point.restsOn,
    from_rival_reply: point.fromRivalReply,
    // Spec §4.2b: what an investigation found, its basis and its reason travel with the point (plan deviations 17, 25;
    // pre-flight PF-R2b1.8). The outcome is shown by `disputed` / `not_yet_checked`, never as a word of its own.
    investigation: point.investigation === null ? null : Object.freeze({
      missing: point.investigation.missing,
      found: point.investigation.found,
      basis: point.investigation.basis,
      reason: point.investigation.reason
    }),
    // W4-1: last, and only on a point that cites one of this debate's extracts; every other point keeps today's bytes.
    ...(point.citedExtract === undefined ? {} : { extract: extractForJudge(point.citedExtract) })
  });
}

/** The fields one judge (`seat`) is sent: the answers in its rotated order, under their fixed letters. */
export function comparingJudgeMaterialFields(input: Readonly<{
  material: EngineDebateMaterial;
  seat: number;
  length: LengthGuide;
  questionLanguage?: QuestionLanguage | null;
  /**
   * D3 (practice only; never set by the runner): the order to show, indices into `material.answers`; absent =
   * `comparingJudgeOrder(n, seat)`. The reverse order of 3 answers is no rotation. D3's practice (B11b) reverses the
   * recorded packet itself (`reversedJudgePacket`, every other byte kept); `order` is kept for a later both-orders rule
   * (pre-flight PF-R2b1.9, pre-flight consistency R2b).
   */
  order?: readonly number[];
}>): readonly Readonly<{ name: string; content: string }>[] {
  const n = input.material.answers.length;
  const order = input.order ?? comparingJudgeOrder(n, input.seat);
  if (n < 1 || order.length !== n || new Set(order).size !== n
    || order.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= n)) {
    throw new TypedDomainError("COMPARING_JUDGE_ORDER_INVALID", `order of ${String(n)} answers`);
  }
  const answers = order.flatMap((index) => {
    const answer = input.material.answers[index];
    return answer === undefined ? [] : [Object.freeze({
      letter: answer.letter,
      answer: answer.words,
      case: answer.caseText,
      supporting_points: answer.supports.map(pointForJudge),
      objections: answer.objections.map(pointForJudge),
      assumptions: [...answer.assumptions],
      // W4-1: the extract the position's case cites, last; absent, today's bytes.
      ...(answer.citedExtract === undefined ? {} : { case_extract: extractForJudge(answer.citedExtract) })
    })];
  });
  const disputed = input.material.disputed.map((entry) => Object.freeze({
    letter: entry.letter, text: entry.text, reviewer_reasons: [...entry.reviewerReasons]
  }));
  return withQuestionLanguageField([
    { name: "question", content: input.material.question },
    { name: "answers", content: JSON.stringify(answers) },
    { name: "disputed_points", content: JSON.stringify(disputed) },
    lengthGuidanceField(input.length.words, input.length.languageCode, input.length.charactersPerWord)
  ], input.questionLanguage);
}

/* ---------------------------------------------------------------- the seats */

export type ComparingJudgeSeat = Readonly<{ seat: number; maker: string; providerRef: string; argued: boolean }>;

/** One run judge seat as the pick reads it: the member planned for it, and (optional) its other member. */
export type ComparingJudgeCandidateSeat = Readonly<{
  maker: string;
  providerRef: string;
  /**
   * Owner ruling 2026-10-29 (MORNING-2026-10-17 item 6, "prefer neutral judges"): the seat's other member, which judges
   * in place of the planned member only when the planned member's maker argued an answer and this member's maker argued
   * none. It never stands in as a fallback.
   */
  alternate?: Readonly<{ maker: string; providerRef: string }>;
}>;

/**
 * WHO JUDGES (spec §4.3; INTERFACE §9.3; owner ruling 2026-10-29, "prefer neutral judges"): the seats in rotation from
 * `rotationOffset`. First, every seat that a maker that argued none of the answers can fill: its planned member when that
 * member's maker argued none, else its other member when that one's maker argued none. Only then, for the seats still
 * open, today's fallback: the remaining seats' planned members, makers that argued one, in the same rotation. Each run
 * seat fills at most one judge seat; never two seats of one maker; at most `count` and at most
 * `COMPARING_JUDGE_LIMITS.maxSeats`. A maker that argued EVERY answer (the only arguing maker, a one-maker debate) is
 * never seated: its vote could never be counted (spec §4.7, "one maker": no judge can run). Seats are numbered 1..k in
 * the order picked; seat k is called `VERDICT:judge:<k>` and sees the answers in `comparingJudgeOrder(n, k)`. Without
 * any `alternate` the pick is exactly the one before the ruling.
 */
export function pickComparingJudges(input: Readonly<{
  seats: readonly ComparingJudgeCandidateSeat[];
  arguingMakers: ReadonlySet<string>;
  count: number;
  rotationOffset: number;
}>): readonly ComparingJudgeSeat[] {
  if (!Number.isSafeInteger(input.count) || input.count < 0
    || !Number.isSafeInteger(input.rotationOffset) || input.rotationOffset < 0) {
    throw new TypedDomainError("COMPARING_JUDGE_SEATS_INVALID",
      `count ${String(input.count)}, rotation ${String(input.rotationOffset)}`);
  }
  if (input.seats.length === 0 || input.count === 0) return Object.freeze([]);
  const start = input.rotationOffset % input.seats.length;
  const rotated = [...input.seats.slice(start), ...input.seats.slice(0, start)];
  const loneArguer = input.arguingMakers.size === 1 ? [...input.arguingMakers][0] : undefined;
  const limit = Math.min(input.count, COMPARING_JUDGE_LIMITS.maxSeats);
  const seatedMakers = new Set<string>();
  const filled = new Set<number>();
  const picked: ComparingJudgeSeat[] = [];
  const seatFrom = (index: number, member: Readonly<{ maker: string; providerRef: string }>): void => {
    filled.add(index);
    seatedMakers.add(member.maker);
    picked.push(Object.freeze({
      seat: picked.length + 1, maker: member.maker, providerRef: member.providerRef, argued: input.arguingMakers.has(member.maker)
    }));
  };
  // Neutral judges first: the planned member, else the other member, of a maker that argued none of the answers.
  rotated.forEach((seat, index) => {
    if (picked.length >= limit) return;
    const neutral = [seat, seat.alternate].find((member) => member !== undefined
      && !input.arguingMakers.has(member.maker) && !seatedMakers.has(member.maker));
    if (neutral !== undefined) seatFrom(index, neutral);
  });
  // Today's fallback for the seats still open: the remaining seats' planned members, in the same rotation.
  rotated.forEach((seat, index) => {
    if (picked.length >= limit || filled.has(index) || seat.maker === loneArguer || seatedMakers.has(seat.maker)) return;
    seatFrom(index, seat);
  });
  return Object.freeze(picked);
}

/* ------------------------------------------------------------------ the call */

export type ComparingJudgeReply = Readonly<{
  best: EngineAnswerLetter;
  conditional: boolean;
  sameAs: readonly (readonly EngineAnswerLetter[])[];
  reasons: string;
  questionKind: EngineQuestionKind;
}>;

export type ComparingJudgeCallInput = Readonly<{
  runId: string | null;
  subjectItemId: string;
  /** `VERDICT:judge:<seat>`, with the seat caller's marker on an assigned run. */
  callSiteKey: string;
  argumentLanguageName?: string;
  /** The run's lock (a shaped run only); absent: today's argument-language directive. */
  questionLanguage?: QuestionLanguage;
  /** The servable answers only, in letter order. */
  material: EngineDebateMaterial;
  seat: number;
  /** D3 (practice only; never set by the runner): the answer order to show (pre-flight PF-R2b1.9). */
  order?: readonly number[];
  /** The receipt's `comparing_judge` words (80 at the start values). */
  length: LengthGuide;
  providerRef: string;
  /** `engineContractHash()`: the seal that covers `verdict.judge.v1` (INTERFACE §2.2). */
  contractHash: string;
  bound: CallBound;
}>;

export type ComparingJudgeAnswer = Readonly<{
  reply: ComparingJudgeReply;
  rawArtifactRef: string;
  ledgerEntryRef: string;
  /** The model that answered, for the vote's record. */
  model: string;
  maker: string;
}>;

/** The run's language sentence after the instruction: the same rule as the judge's own legs (`promptContractInArgumentLanguage`, index.ts). */
function inRunLanguage(
  contract: PromptContract,
  argumentLanguageName: string | undefined,
  questionLanguage: QuestionLanguage | undefined
): PromptContract {
  return Object.freeze({
    ...contract,
    instruction: questionLanguage === undefined
      ? `${contract.instruction} ${argumentLanguageDirective(argumentLanguageName ?? "the same language as the question")}`
      : `${contract.instruction} ${questionLanguageSentence(questionLanguage)}`
  });
}

/**
 * One comparing judge's call: role JUDGE (thinking `judge_panel`), lane `served`, the step's guided words, LG-A's repair
 * order (the reading's fixer; on the preview the structure-repair route; a PATCH only for content). A reply that still
 * fails is refused as `COMPARING_JUDGE_REPLY_REFUSED` (codes and paths only, DL4-F1); every other failure leaves as it
 * came. The runner counts any failure as a missing vote.
 */
export async function askComparingJudge(provider: ProviderGateway, input: ComparingJudgeCallInput): Promise<ComparingJudgeAnswer> {
  // W4-1: material that carries a cited extract is judged under the sources variant (item 7); without one, v1 to the byte.
  const contract = comparingJudgeMaterialCitesExtracts(input.material) ? COMPARING_JUDGE_SOURCES_PROMPT_CONTRACT : COMPARING_JUDGE_PROMPT_CONTRACT;
  const framed = buildFramedPrompt({
    contract: inRunLanguage(contract, input.argumentLanguageName, input.questionLanguage),
    material: comparingJudgeMaterialFields({
      material: input.material, seat: input.seat, length: input.length, questionLanguage: input.questionLanguage ?? null,
      // pre-flight PF-R2b1.9: D3's practice order rides through unchanged (exactOptionalPropertyTypes).
      ...(input.order === undefined ? {} : { order: input.order })
    })
  });
  const context = Object.freeze({
    shownLetters: input.material.answers.map((answer) => answer.letter),
    question: input.material.question,
    questionLanguage: input.questionLanguage ?? null
  });
  const reading = rememberingAcceptedReply((content, reply) => classifyComparingJudgeReply(content, reply, context));
  let response;
  try {
    response = await provider.call({
      runId: input.runId,
      subjectItemId: input.subjectItemId,
      callSiteKey: input.callSiteKey,
      role: "JUDGE",
      lane: "served",
      modelRole: "JUDGE",
      bound: input.bound,
      contractHash: input.contractHash,
      providerRef: input.providerRef,
      packet: framed.packet,
      buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)),
      classifyContent: reading.classifyContent,
      guidedWords: input.length.words
    });
  } catch (error) {
    if (error instanceof ProviderContentUnacceptedError) {
      throw new TypedDomainError("COMPARING_JUDGE_REPLY_REFUSED", error.lastParseError);
    }
    throw error;
  }
  const parsed = parseStructuredArtifact(response.content, comparingJudgeReplySchema,
    reading.acceptedAs(response.content).reply, COMPARING_JUDGE_READING);
  if (parsed.kind !== "PARSED") throw new TypedDomainError("COMPARING_JUDGE_REPLY_REFUSED", parsed.message);
  return Object.freeze({
    reply: Object.freeze({
      best: parsed.value.best,
      conditional: parsed.value.conditional,
      sameAs: Object.freeze((parsed.value.same_as ?? []).map((group) => Object.freeze([...group]))),
      reasons: parsed.value.reasons,
      questionKind: parsed.value.question_kind
    }),
    rawArtifactRef: response.rawArtifactRef,
    ledgerEntryRef: response.ledgerEntryRef,
    model: response.model,
    maker: response.maker
  });
}
