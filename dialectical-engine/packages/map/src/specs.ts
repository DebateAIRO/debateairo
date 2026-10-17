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
import {
  mapContractInLanguage, mapEnginePromptContracts, mapLengthContractsOf, mapPromptContracts, type MapContractName, type MapEngineContractName,
  type MapPromptContractSet
} from "./prompts.js";
import {
  mapEngineGuidedWords, mapEngineLengthField, mapEngineReplyWordsCeiling, mapGuidedWords, mapLengthField, mapReplyWordsCeiling, type MapLength
} from "./length.js";
import {
  MAP_ENGINE_REPLY_SCHEMAS,
  MAP_LENGTHED_REPLY_SCHEMAS,
  mapAnglesCheck,
  mapAnglesReplySchema,
  mapCheckCheck,
  mapChooseCheck,
  mapChooseCheckV2,
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
  type MapCheckReply,
  type MapChooseReply,
  type MapChooseReplyV2,
  type MapGapReply,
  type MapGapReplyV2,
  type MapListReply,
  type MapListReplyV2,
  type MapMergeReply,
  type MapMergeReplyV2,
  type MapReplyCheck,
  type MapSnowballReply,
  type MapSnowballReplyV2
} from "./replies.js";
import {
  mapAnglesSalvage, mapAnglesSalvageEngine, mapAnglesSalvageLengthed, mapCheckSalvage, mapChooseSalvage, mapChooseSalvageV2, mapGapSalvage,
  mapGapSalvageLengthed, mapListSalvage, mapListSalvageLengthed, mapMergeSalvage, type MapReplySalvage
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
  /** Engine 2 (spec 2026-10-15 §5): framed under an engine-2 contract, so its call records the engine seal. */
  engine?: true;
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
  /** The owners' contracts; default the shipped text. With `length`, their length variants (`mapLengthContractsOf`). */
  contracts?: MapPromptContractSet;
  /** Length guidance (spec 2026-10-15 §3.2): the run's map targets; absent = today's map. */
  length?: MapLength;
  /** Engine 2 (spec 2026-10-15 §5): the v2 contracts, schemas and checks. Needs `length`. */
  engine?: true;
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

const ENGINE_CLASSIFY = Object.freeze({ exactLimits: true });
// The schemas are Task 4's once-built MAP_ENGINE_REPLY_SCHEMAS, never rebuilt per call (pre-flight PF-R33.11).

/**
 * ENGINE 2: one call under its v2 contract (sealed by engineContractHash; ctx.contracts is not read: deviation 11), the
 * contract's own length parts before question_language, its guided words and reply ceiling, and a reading that keeps
 * zod's limits so every refusal states its exact limit (P2.3).
 */
function mapEngineSpecOf<T>(step: MapStep, ctx: MapSpecContext, name: MapEngineContractName, material: readonly FramedMaterialField[],
  schema: z.ZodType<T>, check: MapReplyCheck<T>, salvage: MapReplySalvage<T> = {}): MapStepSpec<T> {
  const length = ctx.length;
  if (length === undefined) {
    throw new TypedDomainError("MAP_ENGINE_REQUIRES_LENGTH", "MAP_ENGINE_REQUIRES_LENGTH: an engine-2 map call is always told its length");
  }
  const lock = mapLockedLanguage(ctx);
  const contract = mapContractInLanguage(mapEnginePromptContracts()[name], lock, ctx.languageName);
  const told = [...material, mapEngineLengthField(name, length, ctx.languageTag)];
  return Object.freeze({
    step,
    contract,
    engine: true as const,
    material: Object.freeze(withQuestionLanguageField(told, lock).map((entry) => Object.freeze({ ...entry }))),
    guidedWords: mapEngineGuidedWords(name, length),
    replyWordsCeiling: mapEngineReplyWordsCeiling(name, length),
    classify: (content: string, reply?: ModelReplyFacts) => mapClassifyReply(content, reply, schema, check, salvage, ENGINE_CLASSIFY).classification,
    read: (content: string, reply?: ModelReplyFacts) => {
      const out = mapClassifyReply(content, reply, schema, check, salvage, ENGINE_CLASSIFY);
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
  if (ctx.engine === true) {
    return mapEngineSpecOf("ANGLES", ctx, "angles", [mapQuestionField(ctx)], MAP_ENGINE_REPLY_SCHEMAS.angles, mapAnglesCheck, mapAnglesSalvageEngine);
  }
  return mapSpecOf("ANGLES", ctx, "angles", [mapQuestionField(ctx)], lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.angles : mapAnglesReplySchema, mapAnglesCheck,
    lengthed(ctx) ? mapAnglesSalvageLengthed : mapAnglesSalvage);
}

export function mapListSpec(ctx: MapSpecContext, angle: MapAngle | null): MapStepSpec<MapListReply | MapListReplyV2> {
  if (ctx.engine === true) {
    return angle === null
      ? mapEngineSpecOf("LIST", ctx, "listOpen", [mapQuestionField(ctx)], MAP_ENGINE_REPLY_SCHEMAS.list, mapListCheck(ctx.replyLanguage), mapListSalvageLengthed)
      : mapEngineSpecOf("LIST", ctx, "listAngle", [mapQuestionField(ctx), { name: "angle_label", content: angle.label },
        { name: "angle_focus", content: angle.focus }], MAP_ENGINE_REPLY_SCHEMAS.list, mapListCheck(ctx.replyLanguage), mapListSalvageLengthed);
  }
  const schema = lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.list : mapListReplySchema;
  const salvage = lengthed(ctx) ? mapListSalvageLengthed : mapListSalvage;
  return angle === null
    ? mapSpecOf("LIST", ctx, "listOpen", [mapQuestionField(ctx)], schema, mapListCheck(ctx.replyLanguage), salvage)
    : mapSpecOf("LIST", ctx, "listAngle", [mapQuestionField(ctx), { name: "angle_label", content: angle.label },
      { name: "angle_focus", content: angle.focus }], schema, mapListCheck(ctx.replyLanguage), salvage);
}

/** Snowball (arm A): the claims so far as a short plain list, never who wrote them. */
export function mapSnowballSpec(ctx: MapSpecContext, pointsSoFar: readonly MapPointItem[]): MapStepSpec<MapSnowballReply | MapSnowballReplyV2> {
  if (ctx.engine === true) {
    return mapEngineSpecOf("SNOWBALL", ctx, "listSnowball", [mapQuestionField(ctx),
      { name: "points_so_far", content: JSON.stringify(mapByItemId(pointsSoFar).map((point) => point.claim)) }],
    MAP_ENGINE_REPLY_SCHEMAS.snowball, mapListCheck(ctx.replyLanguage), mapListSalvageLengthed);
  }
  return mapSpecOf("SNOWBALL", ctx, "listSnowball", [mapQuestionField(ctx),
    { name: "points_so_far", content: JSON.stringify(mapByItemId(pointsSoFar).map((point) => point.claim)) }],
  lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.snowball : mapSnowballReplySchema, mapListCheck(ctx.replyLanguage),
  lengthed(ctx) ? mapListSalvageLengthed : mapListSalvage);
}

/** Merge: every item with its opaque id, in id order; never its author, list or angle. */
export function mapMergeSpec(ctx: MapSpecContext, items: readonly MapItem[]): MapStepSpec<MapMergeReply | MapMergeReplyV2> {
  const points = mapByItemId(items.filter((item): item is MapPointItem => item.kind === "POINT"));
  const answers = mapByItemId(items.filter((item): item is MapAnswerItem => item.kind === "ANSWER"));
  if (ctx.engine === true) {
    return mapEngineSpecOf("MERGE", ctx, "merge", [mapQuestionField(ctx),
      // P2.2: the merger writes rests_on per key point and is told to keep each point's basis, so it is shown each
      // member's (null when its list said none) (pre-flight PF-R33.4). Engine 1's material below is unchanged.
      { name: "points", content: JSON.stringify(points.map((point) => ({ item_id: point.itemId, claim: point.claim, why_it_matters: point.whyItMatters,
        rests_on: point.restsOn ?? null }))) },
      { name: "candidate_answers", content: JSON.stringify(answers.map((answer) => ({ item_id: answer.itemId, answer: answer.answer }))) }],
    MAP_ENGINE_REPLY_SCHEMAS.merge, mapMergeCheck(new Set(points.map((point) => point.itemId)), new Set(answers.map((answer) => answer.itemId)), ctx.replyLanguage),
    mapMergeSalvage);
  }
  return mapSpecOf("MERGE", ctx, "merge", [mapQuestionField(ctx),
    { name: "points", content: JSON.stringify(points.map((point) => ({ item_id: point.itemId, claim: point.claim, why_it_matters: point.whyItMatters }))) },
    { name: "candidate_answers", content: JSON.stringify(answers.map((answer) => ({ item_id: answer.itemId, answer: answer.answer }))) }],
  lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.merge : mapMergeReplySchema, mapMergeCheck(new Set(points.map((point) => point.itemId)), new Set(answers.map((answer) => answer.itemId)), ctx.replyLanguage),
  mapMergeSalvage);
}

/** Gap: plain labels only, never counts or authors. */
export function mapGapSpec(ctx: MapSpecContext, keyPoints: readonly MapKeyPoint[], mergedAnswers: readonly MapMergedAnswer[]): MapStepSpec<MapGapReply | MapGapReplyV2> {
  if (ctx.engine === true) {
    return mapEngineSpecOf("GAP", ctx, "gap", [mapQuestionField(ctx),
      { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => keyPoint.claim)) },
      { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => answer.answer)) }],
    MAP_ENGINE_REPLY_SCHEMAS.gap, mapGapCheck(ctx.replyLanguage), mapGapSalvageLengthed);
  }
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
  options: Readonly<{ raisedByCounts?: MapRaisedByCounts; engine?: Readonly<{ framingChallenges: readonly string[] }> }> = {}):
  MapStepSpec<MapChooseReply | MapChooseReplyV2> {
  const shownIds: ReadonlySet<string> = new Set(keyPoints.map((keyPoint) => keyPoint.keyPointId));
  const raisedBy = (makers: Readonly<{ blindMakers: readonly string[]; makers: readonly string[] }>): number =>
    (options.raisedByCounts === "ALL" ? makers.makers : makers.blindMakers).length;
  if (ctx.engine === true) {
    // P2.4: each answer shows how many makers raised it (blind; arm A: all), each point what it rests on, and the gap
    // rounds' framing challenges (stored but never read before engine 2).
    return mapEngineSpecOf("CHOOSE", ctx, "choose", [mapQuestionField(ctx),
      { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => ({ key_point_id: keyPoint.keyPointId, claim: keyPoint.claim,
        raised_by: raisedBy(keyPoint), angle_kind: keyPoint.fixedAngleKinds[0] ?? null, rests_on: keyPoint.restsOn ?? null }))) },
      { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => ({ answer_id: answer.answerId, answer: answer.answer,
        raised_by: raisedBy(answer) }))) },
      { name: "framing_challenges", content: JSON.stringify(options.engine?.framingChallenges ?? []) }],
    MAP_ENGINE_REPLY_SCHEMAS.choose, mapChooseCheckV2(shownIds, ctx.replyLanguage), mapChooseSalvageV2(shownIds));
  }
  return mapSpecOf("CHOOSE", ctx, "choose", [mapQuestionField(ctx),
    { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => ({ key_point_id: keyPoint.keyPointId, claim: keyPoint.claim,
      raised_by: raisedBy(keyPoint), angle_kind: keyPoint.fixedAngleKinds[0] ?? null }))) },
    { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => ({ answer_id: answer.answerId, answer: answer.answer }))) }],
  lengthed(ctx) ? MAP_LENGTHED_REPLY_SCHEMAS.choose : mapChooseReplySchema, mapChooseCheck(shownIds, ctx.replyLanguage),
  mapChooseSalvage(shownIds));
}

/**
 * ENGINE 2 (spec §5.2 item 5, INTERFACE §10.4): the answer check. Each answer under its check id (chosen answers by
 * their own a1..a4, candidates c1..c4); the checker sees the answers' words only, never who raised or chose them.
 */
export function mapCheckSpec(ctx: MapSpecContext, entries: readonly Readonly<{ checkId: string; answer: string }>[]): MapStepSpec<MapCheckReply> {
  if (ctx.engine !== true) throw new TypedDomainError("MAP_CHECK_ENGINE_ONLY", "MAP_CHECK_ENGINE_ONLY: the answer check is an engine-2 call");
  return mapEngineSpecOf("CHECK", ctx, "check", [mapQuestionField(ctx),
    { name: "answers", content: JSON.stringify(entries.map((entry) => ({ check_id: entry.checkId, answer: entry.answer }))) }],
  MAP_ENGINE_REPLY_SCHEMAS.check, mapCheckCheck(entries.map((entry) => entry.checkId), ctx.replyLanguage), mapCheckSalvage);
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
