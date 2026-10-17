import type { z } from "zod";
import {
  questionLanguageFromRun,
  TypedDomainError,
  withQuestionLanguageField,
  type QuestionLanguage,
  type ReplyLanguageExpectation
} from "@debateai/kernel";
import {
  buildFramedPrompt,
  buildFramedRepairPrompt,
  rememberingAcceptedReply,
  schemaFailureLocator,
  type ContentClassification,
  type FramedMaterialField,
  type FramedPrompt,
  type ModelReplyFacts,
  type PromptContract,
  type PromptPacket
} from "@debateai/providers";
import { mapContractInLanguage, mapLengthContractsOf, mapPromptContracts, type MapContractName, type MapPromptContractSet } from "./prompts.js";
import { mapGuidedWords, mapLengthField, mapReplyWordsCeiling, type MapLength } from "./length.js";
import {
  MAP_LENGTHED_REPLY_SCHEMAS,
  mapAnglesCheck,
  mapAnglesReplySchema,
  mapChooseCheck,
  mapChooseReplySchema,
  mapClassifyReply,
  mapGapCheck,
  mapGapReplySchema,
  mapListCheck,
  mapListReplySchema,
  mapMergeCheck,
  mapMergeReplySchema,
  mapSnowballReplySchema,
  type MapAnglesReply,
  type MapChooseReply,
  type MapGapReply,
  type MapListReply,
  type MapMergeReply,
  type MapReplyCheck,
  type MapSnowballReply
} from "./replies.js";
import {
  mapAnglesSalvage, mapAnglesSalvageLengthed, mapChooseSalvage, mapGapSalvage, mapGapSalvageLengthed, mapListSalvage, mapListSalvageLengthed,
  mapMergeSalvage, type MapReplySalvage
} from "./salvage.js";
import type { MapAngle, MapAnswerItem, MapItem, MapKeyPoint, MapMergedAnswer, MapPointItem, MapStep } from "./types.js";

/** One map call, fully described: the contract (in the question's language), its material, its check. */
export type MapStepSpec<T> = Readonly<{
  step: MapStep;
  contract: PromptContract;
  material: readonly FramedMaterialField[];
  /** Length guidance: the words this call is told (the sum of its parts), null without the row. */
  guidedWords: number | null;
  /** Length guidance: the most guided words its reply can hold, for its allowance; null without the row, or no most. */
  replyWordsCeiling: number | null;
  classify: (content: string, reply?: ModelReplyFacts) => ContentClassification;
  /** The accepted reply's value; throws MAP_REPLY_UNREADABLE for a reply `classify` would refuse. */
  read: (content: string, reply?: ModelReplyFacts) => T;
}>;

export type MapSpecContext = Readonly<{
  questionLine: string;
  /** detectArgumentLanguage's English name, e.g. "Romanian". */
  languageName: string;
  /** Its tag, e.g. "ro" (kept with the name; the language check reads `replyLanguage`, never this tag). */
  languageTag: string;
  /**
   * What every reply's prose is checked against (ruling R-5), built ONCE per question by the caller and threaded
   * through: with a lock (`mapLockedLanguage`), `lockedReplyLanguageExpectation(lock, questionLine)`, never a re-guess
   * (question-language spec 2026-10-13); without one, `replyLanguageExpectation(questionLine)`. A field is refused only
   * when the kernel's verdict is "OTHER".
   */
  replyLanguage: ReplyLanguageExpectation;
  /** The owners' contracts; default the shipped text. */
  contracts?: MapPromptContractSet;
  /** Length guidance (spec 2026-10-15 §3.2): the run's map targets; absent = today's map. */
  length?: MapLength;
}>;

/**
 * The map's locked language (question-language spec 2026-10-13, L6): the context's stored tag and name read back as a
 * lock. Null for "und" (old practice data) and for anything `questionLanguageFromRun` refuses (a stored fallback name):
 * those calls keep today's directive, material and reply check, byte for byte.
 */
export function mapLockedLanguage(ctx: Pick<MapSpecContext, "languageTag" | "languageName">): QuestionLanguage | null {
  return ctx.languageTag === "und" ? null : questionLanguageFromRun(ctx.languageTag, ctx.languageName);
}

function mapSpecOf<T>(step: MapStep, ctx: MapSpecContext, name: MapContractName, material: readonly FramedMaterialField[],
  schema: z.ZodType<T>, check: MapReplyCheck<T>, salvage: MapReplySalvage<T> = {}): MapStepSpec<T> {
  const lock = mapLockedLanguage(ctx);
  // Length guidance: the variants of the SAME contracts the run uses (owner-edited texts kept; Task 14 review 3).
  const runs = ctx.contracts ?? mapPromptContracts();
  const contracts = ctx.length === undefined ? runs : mapLengthContractsOf(runs);
  const contract = mapContractInLanguage(contracts[name], lock, ctx.languageName);
  // Length guidance: the parts' targets ride right before question_language (which stays last); nothing without the row.
  const told = ctx.length === undefined ? material : [...material, mapLengthField(name, ctx.length, ctx.languageTag)];
  return Object.freeze({
    step,
    contract,
    // With a lock, the question_language field comes LAST; without one, the same material as today.
    material: Object.freeze(withQuestionLanguageField(told, lock).map((entry) => Object.freeze({ ...entry }))),
    guidedWords: ctx.length === undefined ? null : mapGuidedWords(name, ctx.length),
    replyWordsCeiling: ctx.length === undefined ? null : mapReplyWordsCeiling(name, ctx.length),
    classify: (content: string, reply?: ModelReplyFacts) => mapClassifyReply(content, reply, schema, check, salvage).classification,
    read: (content: string, reply?: ModelReplyFacts) => {
      const out = mapClassifyReply(content, reply, schema, check, salvage);
      if (out.value === null) throw new TypedDomainError("MAP_REPLY_UNREADABLE", `MAP_REPLY_UNREADABLE: the ${step} reply did not pass its check`);
      return out.value;
    }
  });
}

/** Length guidance: today's schema without the row; the runaway-limit schema (built once in replies.ts) with it. */
const lengthed = (ctx: MapSpecContext): boolean => ctx.length !== undefined;

const mapQuestionField = (ctx: MapSpecContext): FramedMaterialField => ({ name: "question_line", content: ctx.questionLine });
const mapByItemId = <T extends MapItem>(list: readonly T[]): T[] => [...list].sort((a, b) => a.itemId.localeCompare(b.itemId));

export function mapAnglesSpec(ctx: MapSpecContext): MapStepSpec<MapAnglesReply> {
  return mapSpecOf("ANGLES", ctx, "angles", [mapQuestionField(ctx)], lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.angles : mapAnglesReplySchema, mapAnglesCheck,
    lengthed(ctx) ? mapAnglesSalvageLengthed : mapAnglesSalvage);
}

export function mapListSpec(ctx: MapSpecContext, angle: MapAngle | null): MapStepSpec<MapListReply> {
  const schema = lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.list : mapListReplySchema;
  const salvage = lengthed(ctx) ? mapListSalvageLengthed : mapListSalvage;
  return angle === null
    ? mapSpecOf("LIST", ctx, "listOpen", [mapQuestionField(ctx)], schema, mapListCheck(ctx.replyLanguage), salvage)
    : mapSpecOf("LIST", ctx, "listAngle", [mapQuestionField(ctx), { name: "angle_label", content: angle.label },
      { name: "angle_focus", content: angle.focus }], schema, mapListCheck(ctx.replyLanguage), salvage);
}

/** Snowball (arm A): the claims so far as a short plain list, never who wrote them. */
export function mapSnowballSpec(ctx: MapSpecContext, pointsSoFar: readonly MapPointItem[]): MapStepSpec<MapSnowballReply> {
  return mapSpecOf("SNOWBALL", ctx, "listSnowball", [mapQuestionField(ctx),
    { name: "points_so_far", content: JSON.stringify(mapByItemId(pointsSoFar).map((point) => point.claim)) }],
  lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.snowball : mapSnowballReplySchema, mapListCheck(ctx.replyLanguage),
  lengthed(ctx) ? mapListSalvageLengthed : mapListSalvage);
}

/** Merge: every item with its opaque id, in id order; never its author, list or angle. */
export function mapMergeSpec(ctx: MapSpecContext, items: readonly MapItem[]): MapStepSpec<MapMergeReply> {
  const points = mapByItemId(items.filter((item): item is MapPointItem => item.kind === "POINT"));
  const answers = mapByItemId(items.filter((item): item is MapAnswerItem => item.kind === "ANSWER"));
  return mapSpecOf("MERGE", ctx, "merge", [mapQuestionField(ctx),
    { name: "points", content: JSON.stringify(points.map((point) => ({ item_id: point.itemId, claim: point.claim, why_it_matters: point.whyItMatters }))) },
    { name: "candidate_answers", content: JSON.stringify(answers.map((answer) => ({ item_id: answer.itemId, answer: answer.answer }))) }],
  lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.merge : mapMergeReplySchema, mapMergeCheck(new Set(points.map((point) => point.itemId)), new Set(answers.map((answer) => answer.itemId)), ctx.replyLanguage),
  mapMergeSalvage);
}

/** Gap: plain labels only, never counts or authors. */
export function mapGapSpec(ctx: MapSpecContext, keyPoints: readonly MapKeyPoint[], mergedAnswers: readonly MapMergedAnswer[]): MapStepSpec<MapGapReply> {
  return mapSpecOf("GAP", ctx, "gap", [mapQuestionField(ctx),
    { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => keyPoint.claim)) },
    { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => answer.answer)) }],
  lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.gap : mapGapReplySchema, mapGapCheck(ctx.replyLanguage),
  lengthed(ctx) ? mapGapSalvageLengthed : mapGapSalvage);
}

/**
 * What `raised_by` counts in the choose material. BLIND (arms B and C): the distinct makers that raised the point blind.
 * ALL (arm A, the snowball): every distinct maker, since a later AI's points are shown-origin by design and a blind count
 * would tag them 0; each arm-A key point is one item, so it reads 1 there. Arm A's counts thus mean "raised by" rather
 * than "raised independently by".
 */
export type MapRaisedByCounts = "BLIND" | "ALL";

/** Choose: each key point tagged by code with its distinct makers (blind by default) and its first fixed angle kind. */
export function mapChooseSpec(ctx: MapSpecContext, keyPoints: readonly MapKeyPoint[], mergedAnswers: readonly MapMergedAnswer[],
  options: Readonly<{ raisedByCounts?: MapRaisedByCounts }> = {}): MapStepSpec<MapChooseReply> {
  const shownIds: ReadonlySet<string> = new Set(keyPoints.map((keyPoint) => keyPoint.keyPointId));
  const raisedBy = (keyPoint: MapKeyPoint): number =>
    (options.raisedByCounts === "ALL" ? keyPoint.makers : keyPoint.blindMakers).length;
  return mapSpecOf("CHOOSE", ctx, "choose", [mapQuestionField(ctx),
    { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => ({ key_point_id: keyPoint.keyPointId, claim: keyPoint.claim,
      raised_by: raisedBy(keyPoint), angle_kind: keyPoint.fixedAngleKinds[0] ?? null }))) },
    { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => ({ answer_id: answer.answerId, answer: answer.answer }))) }],
  lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.choose : mapChooseReplySchema, mapChooseCheck(shownIds, ctx.replyLanguage),
  mapChooseSalvage(shownIds));
}

/**
 * What a gateway call needs, built once per call: the framed packet (the one frame builder), the classifier that
 * remembers how the accepted reply ended, the full re-ask packet (code and machine path only), and the accepted value.
 * The patch follow-up needs nothing more: the gateway builds it from the classifier's refusal.
 */
export function mapProviderPieces<T>(spec: MapStepSpec<T>): Readonly<{
  framed: FramedPrompt;
  classifyContent: (content: string, reply?: ModelReplyFacts) => ContentClassification;
  buildRepairPacket: (rejected: Readonly<{ parseStatus: string; parseError: string }>) => PromptPacket;
  readAccepted: (content: string) => T;
}> {
  const framed = buildFramedPrompt({ contract: spec.contract, material: spec.material });
  const reading = rememberingAcceptedReply((content, reply) => spec.classify(content, reply));
  return Object.freeze({
    framed,
    classifyContent: reading.classifyContent,
    buildRepairPacket: (rejected: Readonly<{ parseStatus: string; parseError: string }>) =>
      buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)),
    readAccepted: (content: string) => spec.read(content, reading.acceptedAs(content).reply)
  });
}
