import type { Pool } from "pg";
import { z } from "zod";
import {
  LENGTH_ALLOWANCE_LIMITS, LENGTH_GUIDANCE_START, LENGTH_GUIDANCE_STEPS, TypedDomainError, answerRoomTokens, guidedAllowanceTokens,
  type CharactersPerWord, type LengthGuidanceStep, type LengthThinkingRoomKey, type MapWordTargetPart, type StoryWordTargetField
} from "@debateai/kernel";
import { AnswerLengthSchema, type AnswerLength } from "@debateai/contract";
import { DEBATE_SHAPE_PLAN_KEYS, type DebateShapePlanKey } from "./debate-shape-policy.js";
import { canonicalDecimal, canonicalRegisterJson, type CanonicalJsonAst, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Length guidance (spec docs/superpowers/specs/2026-10-15-length-guidance-design.md §3.1, rulings L6, L20, L24): ONE
 * optional row in its own family, like debateShapePolicy. Not a register.required_row, not in the bootstrap, not in the
 * development rows: every sealed version without it keeps parsing and reads ABSENT, and every request keeps today's
 * bytes (the owners' rollback is a version without the row). A row that does not parse is loud: the API's boot, the
 * hosted readiness check and both publishers refuse. A new value is a new register version, never an edit. The numbers a
 * debate uses are resolved once at admission and frozen on its receipt (`lengthGuidanceReceipt`): the runner reads the
 * receipt, never this row.
 */
export const LENGTH_GUIDANCE_POLICY_ROW_KEY = "lengthGuidancePolicy" as const;

export type LengthLevels = Readonly<{ short: number; standard: number; detailed: number }>;
export type LengthGuidancePlan = Readonly<{
  steps: Readonly<Record<LengthGuidanceStep, LengthLevels>>;
  story: Readonly<Record<StoryWordTargetField, number>>;
  map: Readonly<Record<MapWordTargetPart, number>>;
}>;
export type LengthGuidancePolicy = Readonly<{
  kind: "LENGTH_GUIDANCE_POLICY";
  version: 1;
  plans: Readonly<Record<DebateShapePlanKey, LengthGuidancePlan>>;
  runawayMultiplier: number;
  tokensPerWord: number;
  thinkingRoom: Readonly<Record<LengthThinkingRoomKey, number>>;
  storyLongReferenceWords: number;
  charactersPerWord: CharactersPerWord;
  answerWriterSeesJudgeReasons: boolean;
}>;
/** One debate's numbers: its plan's table at its answer length (INTERFACE §5.5), as frozen on its receipt. */
export type LengthGuidance = Readonly<{
  plan: DebateShapePlanKey;
  answerLength: AnswerLength;
  steps: Readonly<Record<LengthGuidanceStep, number>>;
  story: Readonly<Record<StoryWordTargetField, number>>;
  map: Readonly<Record<MapWordTargetPart, number>>;
  thinkingRoom: Readonly<Record<LengthThinkingRoomKey, number>>;
  runawayMultiplier: number;
  tokensPerWord: number;
  storyLongReferenceWords: number;
  charactersPerWord: CharactersPerWord;
  answerWriterSeesJudgeReasons: boolean;
}>;

const whole = (min: number, max: number) => z.number().int().min(min).max(max);
/** At most six decimals: the register's canonical decimal limit (register-publication.ts normalizeDecimal). */
const decimal = (min: number, max: number) => z.number().min(min).max(max).refine((value) => Number(value.toFixed(6)) === value);
const levels = (min: number) => z.object({ short: whole(min, 5000), standard: whole(min, 5000), detailed: whole(min, 5000) }).strict();
const words = () => whole(5, 5000);
// Every thinking room is 0..32768 (every preview row's standard output cap), except the storyteller's: owner Q-C2
// (2026-10-16) lets it reach 64k; the model's own output maximum still caps the call (pre-flight PF-C1.2, PF-C1.5).
const room = () => whole(0, 32 * 1024);
const storyRoom = () => whole(0, 64 * 1024);
// Keys are listed in the kernel arrays' order: zod outputs keys in schema order and the drift test compares the order
// (pre-flight PF-C1.4).
const planSchema = z.object({
  steps: z.object({
    opening: levels(5), pros_cons: levels(5), cross_exchange: levels(5), judge_panel: levels(5), reviewer: levels(5),
    // The answer writer's bounds are the debate-shape row's (debate-shape-policy.ts lengthSchema).
    answer_writer: levels(50), answer_checker: levels(5), story_checker: levels(5),
    // Engine INTERFACE §4.2: the comparing judges and the investigator (pre-flight PF-C1.1).
    comparing_judge: levels(5), investigator: levels(5)
  }).strict(),
  story: z.object({
    headline: words(), summary: words(), confidence: words(), positionLine: words(), change: words(), whyReason: words()
  }).strict(),
  map: z.object({
    claim: words(), whyItMatters: words(), candidateAnswer: words(), angleLabel: words(), angleFocus: words(),
    framingChallenge: words(), chosenAnswer: words(), checkReason: words() // checkReason: pre-flight PF-C1.1
  }).strict()
}).strict();
const policySchema = z.object({
  kind: z.literal("LENGTH_GUIDANCE_POLICY"),
  version: z.literal(1),
  plans: z.object({ free: planSchema, plus: planSchema, pro: planSchema, max: planSchema, premium: planSchema }).strict(),
  runawayMultiplier: whole(2, 10),
  tokensPerWord: decimal(1.5, 5),
  thinkingRoom: z.object({
    opening: room(), pros_cons: room(), cross_exchange: room(), judge_panel: room(), reviewer: room(),
    answer_writer: room(), answer_checker: room(), story_checker: room(), comparing_judge: room(), investigator: room(),
    story_writer: storyRoom(), map: room() // pre-flight PF-C1.1, PF-C1.2
  }).strict(),
  storyLongReferenceWords: whole(500, 20000),
  charactersPerWord: z.object({ zh: decimal(0.5, 10), ja: decimal(0.5, 10), th: decimal(0.5, 10) }).strict(),
  answerWriterSeesJudgeReasons: z.boolean()
}).strict().superRefine((policy, ctx) => {
  for (const plan of DEBATE_SHAPE_PLAN_KEYS) {
    for (const step of LENGTH_GUIDANCE_STEPS) {
      const levelsOf = policy.plans?.[plan]?.steps?.[step];
      if (levelsOf === undefined) continue;
      const { short, standard, detailed } = levelsOf;
      const ordered = step === "answer_writer" ? short < standard && standard < detailed : short <= standard && standard <= detailed;
      if (!ordered) ctx.addIssue({ code: "custom", path: ["plans", plan, "steps", step], message: "the words never fall with length" });
    }
  }
});

const invalid = (path: string): never => { throw new TypeError(`LENGTH_GUIDANCE_POLICY_INVALID:${path}`); };

/** An own `__proto__` key (as JSON.parse makes one) is refused by name, never dropped by a parse. */
function protoKeyPath(value: unknown, path: readonly string[]): string | null {
  if (value === null || typeof value !== "object") return null;
  for (const key of Object.keys(value)) {
    if (key === "__proto__") return [...path, key].join(".");
    const inner = protoKeyPath((value as Record<string, unknown>)[key], [...path, key]);
    if (inner !== null) return inner;
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** Strict: any defect throws `LENGTH_GUIDANCE_POLICY_INVALID:<path>` (`$` for the root). */
export function parseLengthGuidancePolicy(value: unknown): LengthGuidancePolicy {
  const proto = protoKeyPath(value, []);
  if (proto !== null) return invalid(proto);
  const parsed = policySchema.safeParse(value);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path ?? [];
    return invalid(path.length === 0 ? "$" : path.map(String).join("."));
  }
  return deepFreeze(parsed.data) as LengthGuidancePolicy;
}

/** ABSENT reads as null (today's requests); a malformed row throws, so the caller's boot refuses. */
export async function readLengthGuidancePolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<LengthGuidancePolicy | null> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, LENGTH_GUIDANCE_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : parseLengthGuidancePolicy(row.value_json);
}

/** The canonical AST: every number a DECIMAL node (the whole numbers and the factors alike). */
function lengthAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return canonicalDecimal(String(value));
  return Object.freeze(Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, lengthAst(inner)])
  ));
}

/** The row a publisher seals (the preview kit's optional source row; the hosted file's optional member), re-checked. */
export function lengthGuidancePolicyRow(policy: LengthGuidancePolicy, sourceRef: string): Readonly<{
  rowKey: typeof LENGTH_GUIDANCE_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string;
}> {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid("sourceRef");
  const checked = parseLengthGuidancePolicy(policy);
  return Object.freeze({ rowKey: LENGTH_GUIDANCE_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(lengthAst(checked)), sourceRef });
}

const roundToTen = (value: number): number => Math.round(value / 10) * 10;

/** The owners' start values (spec §7, ruling L24), built from the kernel's LENGTH_GUIDANCE_START so they cannot drift. */
export function lengthGuidancePolicyStartValues(): LengthGuidancePolicy {
  const start = LENGTH_GUIDANCE_START;
  const stepLevels = (step: LengthGuidanceStep): LengthLevels => {
    if (step === "answer_writer") return { ...start.answerWriterWords };
    const standard = start.standardWords[step];
    if ((start.sameAtEveryLevel as readonly string[]).includes(step)) return { short: standard, standard, detailed: standard };
    return { short: roundToTen(standard * start.shortFactor), standard, detailed: roundToTen(standard * start.detailedFactor) };
  };
  const plan = () => ({
    steps: Object.fromEntries(LENGTH_GUIDANCE_STEPS.map((step) => [step, stepLevels(step)])),
    story: { ...start.story },
    map: { ...start.map }
  });
  return parseLengthGuidancePolicy({
    kind: "LENGTH_GUIDANCE_POLICY",
    version: 1,
    plans: Object.fromEntries(DEBATE_SHAPE_PLAN_KEYS.map((key) => [key, plan()])),
    runawayMultiplier: start.runawayMultiplier,
    tokensPerWord: start.tokensPerWord,
    thinkingRoom: { ...start.thinkingRoom },
    storyLongReferenceWords: start.storyLongReferenceWords,
    charactersPerWord: { ...start.charactersPerWord },
    answerWriterSeesJudgeReasons: false
  });
}

/**
 * One debate's numbers (spec §3.1 "How a debate gets its numbers"): its plan's table at its answer-length choice; a
 * missing choice reads as Standard (packages/contract/src/index.ts debateShapeSettingsOf). The plan key is the
 * debate-shape row's (`debateShapePlanKeyOf`), which needs no shape row.
 */
export function resolveLengthGuidance(input: Readonly<{
  policy: LengthGuidancePolicy; plan: DebateShapePlanKey; answerLength: AnswerLength | undefined;
}>): LengthGuidance {
  const answerLength: AnswerLength = input.answerLength ?? "standard";
  const plan = input.policy.plans[input.plan];
  return deepFreeze({
    plan: input.plan,
    answerLength,
    steps: Object.fromEntries(LENGTH_GUIDANCE_STEPS.map((step) => [step, plan.steps[step][answerLength]])) as Record<LengthGuidanceStep, number>,
    story: { ...plan.story },
    map: { ...plan.map },
    thinkingRoom: { ...input.policy.thinkingRoom },
    runawayMultiplier: input.policy.runawayMultiplier,
    tokensPerWord: input.policy.tokensPerWord,
    storyLongReferenceWords: input.policy.storyLongReferenceWords,
    charactersPerWord: { ...input.policy.charactersPerWord },
    answerWriterSeesJudgeReasons: input.policy.answerWriterSeesJudgeReasons
  });
}

/** Spec §3.3: one step's allowance under a debate's numbers, from today's allowance `todayTokens` (never below it). */
export function lengthGuidanceAllowanceTokens(guidance: LengthGuidance, step: LengthGuidanceStep, todayTokens: number): number {
  return guidedAllowanceTokens({
    todayTokens,
    thinkingRoomTokens: guidance.thinkingRoom[step],
    answerRoomTokens: answerRoomTokens(guidance.steps[step], guidance.runawayMultiplier, guidance.tokensPerWord),
    capTokens: LENGTH_ALLOWANCE_LIMITS.capTokens
  });
}

/** The largest allowance any plan at any answer length can ask for one step: what a boot-time check must cover. */
export function lengthGuidanceLargestTokens(policy: LengthGuidancePolicy, step: LengthGuidanceStep, todayTokens: number): number {
  return Math.max(todayTokens, ...DEBATE_SHAPE_PLAN_KEYS.flatMap((plan) => AnswerLengthSchema.options.map((answerLength) =>
    lengthGuidanceAllowanceTokens(resolveLengthGuidance({ policy, plan, answerLength }), step, todayTokens))));
}

/** The answer writer's three targets for one plan: what the /new page says (spec §3.8). */
export function lengthAnswerWordsOf(policy: LengthGuidancePolicy, plan: DebateShapePlanKey): LengthLevels {
  return policy.plans[plan].steps.answer_writer;
}

const positive = () => z.number().int().positive();
const atLeastZero = () => z.number().int().min(0);
/**
 * The receipt member (INTERFACE §5.5): the debate's numbers in snake_case, version 1, strict at every level. Minted by
 * `computeStructuralCeilingBasis` at admission and read back by the strict parser (`parseCostEnvelopeBasis`); NOT tied to
 * the formula version or to the shape member, so it rides with today's shape too (ruling L20).
 */
export const lengthGuidanceReceiptSchema = z.object({
  version: z.literal(1),
  plan: z.enum(DEBATE_SHAPE_PLAN_KEYS),
  answer_length: AnswerLengthSchema,
  steps: z.object({
    opening: positive(), pros_cons: positive(), cross_exchange: positive(), judge_panel: positive(), reviewer: positive(),
    answer_writer: positive(), answer_checker: positive(), story_checker: positive(),
    comparing_judge: positive(), investigator: positive() // pre-flight PF-C1.1, the kernel's order
  }).strict(),
  story: z.object({
    headline: positive(), summary: positive(), confidence: positive(), position_line: positive(), change: positive(),
    why_reason: positive()
  }).strict(),
  map: z.object({
    claim: positive(), why_it_matters: positive(), candidate_answer: positive(), angle_label: positive(), angle_focus: positive(),
    framing_challenge: positive(), chosen_answer: positive(), check_reason: positive() // check_reason: pre-flight PF-C1.1
  }).strict(),
  thinking_room: z.object({
    opening: atLeastZero(), pros_cons: atLeastZero(), cross_exchange: atLeastZero(), judge_panel: atLeastZero(),
    reviewer: atLeastZero(), answer_writer: atLeastZero(), answer_checker: atLeastZero(), story_checker: atLeastZero(),
    comparing_judge: atLeastZero(), investigator: atLeastZero(), // pre-flight PF-C1.1, before story_writer as in the kernel
    story_writer: atLeastZero(), map: atLeastZero()
  }).strict(),
  runaway_multiplier: z.number().int().min(2).max(10),
  tokens_per_word: z.number().min(1.5).max(5),
  story_long_reference_words: positive(),
  characters_per_word: z.object({ zh: z.number().positive(), ja: z.number().positive(), th: z.number().positive() }).strict(),
  answer_writer_sees_judge_reasons: z.boolean()
}).strict();
export type LengthGuidanceReceipt = z.infer<typeof lengthGuidanceReceiptSchema>;

/** The member, parsed with its own schema before it is handed back: a receipt the parser would refuse is never minted. */
export function lengthGuidanceReceipt(guidance: LengthGuidance): LengthGuidanceReceipt {
  const receipt = deepFreeze({
    version: 1 as const,
    plan: guidance.plan,
    answer_length: guidance.answerLength,
    steps: { ...guidance.steps },
    story: {
      headline: guidance.story.headline, summary: guidance.story.summary, confidence: guidance.story.confidence,
      position_line: guidance.story.positionLine, change: guidance.story.change, why_reason: guidance.story.whyReason
    },
    map: {
      claim: guidance.map.claim, why_it_matters: guidance.map.whyItMatters, candidate_answer: guidance.map.candidateAnswer,
      angle_label: guidance.map.angleLabel, angle_focus: guidance.map.angleFocus,
      framing_challenge: guidance.map.framingChallenge, chosen_answer: guidance.map.chosenAnswer,
      check_reason: guidance.map.checkReason // pre-flight PF-C1.1
    },
    thinking_room: { ...guidance.thinkingRoom },
    runaway_multiplier: guidance.runawayMultiplier,
    tokens_per_word: guidance.tokensPerWord,
    story_long_reference_words: guidance.storyLongReferenceWords,
    characters_per_word: { ...guidance.charactersPerWord },
    answer_writer_sees_judge_reasons: guidance.answerWriterSeesJudgeReasons
  });
  const parsed = lengthGuidanceReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    throw new TypedDomainError("STRUCTURAL_CEILING_LENGTH_INVALID", "The length guidance's receipt does not parse: "
      + parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.code}`).join("; "));
  }
  return receipt;
}

/** The numbers a run was admitted with, read back from its receipt (the runner's only source: it never reads the row). */
export function lengthGuidanceOfReceipt(receipt: LengthGuidanceReceipt): LengthGuidance {
  return deepFreeze({
    plan: receipt.plan,
    answerLength: receipt.answer_length,
    steps: { ...receipt.steps },
    story: {
      headline: receipt.story.headline, summary: receipt.story.summary, confidence: receipt.story.confidence,
      positionLine: receipt.story.position_line, change: receipt.story.change, whyReason: receipt.story.why_reason
    },
    map: {
      claim: receipt.map.claim, whyItMatters: receipt.map.why_it_matters, candidateAnswer: receipt.map.candidate_answer,
      angleLabel: receipt.map.angle_label, angleFocus: receipt.map.angle_focus, framingChallenge: receipt.map.framing_challenge,
      chosenAnswer: receipt.map.chosen_answer, checkReason: receipt.map.check_reason // pre-flight PF-C1.1
    },
    thinkingRoom: { ...receipt.thinking_room },
    runawayMultiplier: receipt.runaway_multiplier,
    tokensPerWord: receipt.tokens_per_word,
    storyLongReferenceWords: receipt.story_long_reference_words,
    charactersPerWord: { ...receipt.characters_per_word },
    answerWriterSeesJudgeReasons: receipt.answer_writer_sees_judge_reasons
  });
}
