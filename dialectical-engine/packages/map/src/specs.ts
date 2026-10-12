import type { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
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
import { mapContractInLanguage, mapPromptContracts, type MapContractName, type MapPromptContractSet } from "./prompts.js";
import {
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
import type { MapAngle, MapAnswerItem, MapItem, MapKeyPoint, MapMergedAnswer, MapPointItem, MapStep } from "./types.js";

/** One map call, fully described: the contract (in the question's language), its material, its check. */
export type MapStepSpec<T> = Readonly<{
  step: MapStep;
  contract: PromptContract;
  material: readonly FramedMaterialField[];
  classify: (content: string, reply?: ModelReplyFacts) => ContentClassification;
  /** The accepted reply's value; throws MAP_REPLY_UNREADABLE for a reply `classify` would refuse. */
  read: (content: string, reply?: ModelReplyFacts) => T;
}>;

export type MapSpecContext = Readonly<{
  questionLine: string;
  /** detectArgumentLanguage's English name, e.g. "Romanian". */
  languageName: string;
  /** Its tag, e.g. "ro" ("und" when unknown: the language check then never refuses). */
  languageTag: string;
  /** The owners' contracts; default the shipped text. */
  contracts?: MapPromptContractSet;
}>;

function mapSpecOf<T>(step: MapStep, ctx: MapSpecContext, name: MapContractName, material: readonly FramedMaterialField[],
  schema: z.ZodType<T>, check: MapReplyCheck<T>): MapStepSpec<T> {
  const contract = mapContractInLanguage((ctx.contracts ?? mapPromptContracts())[name], ctx.languageName);
  return Object.freeze({
    step,
    contract,
    material: Object.freeze(material.map((entry) => Object.freeze({ ...entry }))),
    classify: (content: string, reply?: ModelReplyFacts) => mapClassifyReply(content, reply, schema, check).classification,
    read: (content: string, reply?: ModelReplyFacts) => {
      const out = mapClassifyReply(content, reply, schema, check);
      if (out.value === null) throw new TypedDomainError("MAP_REPLY_UNREADABLE", `MAP_REPLY_UNREADABLE: the ${step} reply did not pass its check`);
      return out.value;
    }
  });
}

const mapQuestionField = (ctx: MapSpecContext): FramedMaterialField => ({ name: "question_line", content: ctx.questionLine });
const mapByItemId = <T extends MapItem>(list: readonly T[]): T[] => [...list].sort((a, b) => a.itemId.localeCompare(b.itemId));

export function mapAnglesSpec(ctx: MapSpecContext): MapStepSpec<MapAnglesReply> {
  return mapSpecOf("ANGLES", ctx, "angles", [mapQuestionField(ctx)], mapAnglesReplySchema, mapAnglesCheck);
}

export function mapListSpec(ctx: MapSpecContext, angle: MapAngle | null): MapStepSpec<MapListReply> {
  return angle === null
    ? mapSpecOf("LIST", ctx, "listOpen", [mapQuestionField(ctx)], mapListReplySchema, mapListCheck(ctx.languageTag))
    : mapSpecOf("LIST", ctx, "listAngle", [mapQuestionField(ctx), { name: "angle_label", content: angle.label },
      { name: "angle_focus", content: angle.focus }], mapListReplySchema, mapListCheck(ctx.languageTag));
}

/** Snowball (arm A): the claims so far as a short plain list, never who wrote them. */
export function mapSnowballSpec(ctx: MapSpecContext, pointsSoFar: readonly MapPointItem[]): MapStepSpec<MapSnowballReply> {
  return mapSpecOf("SNOWBALL", ctx, "listSnowball", [mapQuestionField(ctx),
    { name: "points_so_far", content: JSON.stringify(mapByItemId(pointsSoFar).map((point) => point.claim)) }],
  mapSnowballReplySchema, mapListCheck(ctx.languageTag));
}

/** Merge: every item with its opaque id, in id order; never its author, list or angle. */
export function mapMergeSpec(ctx: MapSpecContext, items: readonly MapItem[]): MapStepSpec<MapMergeReply> {
  const points = mapByItemId(items.filter((item): item is MapPointItem => item.kind === "POINT"));
  const answers = mapByItemId(items.filter((item): item is MapAnswerItem => item.kind === "ANSWER"));
  return mapSpecOf("MERGE", ctx, "merge", [mapQuestionField(ctx),
    { name: "points", content: JSON.stringify(points.map((point) => ({ item_id: point.itemId, claim: point.claim, why_it_matters: point.whyItMatters }))) },
    { name: "candidate_answers", content: JSON.stringify(answers.map((answer) => ({ item_id: answer.itemId, answer: answer.answer }))) }],
  mapMergeReplySchema, mapMergeCheck(new Set(points.map((point) => point.itemId)), new Set(answers.map((answer) => answer.itemId)), ctx.languageTag));
}

/** Gap: plain labels only, never counts or authors. */
export function mapGapSpec(ctx: MapSpecContext, keyPoints: readonly MapKeyPoint[], mergedAnswers: readonly MapMergedAnswer[]): MapStepSpec<MapGapReply> {
  return mapSpecOf("GAP", ctx, "gap", [mapQuestionField(ctx),
    { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => keyPoint.claim)) },
    { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => answer.answer)) }],
  mapGapReplySchema, mapGapCheck(ctx.languageTag));
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
  const raisedBy = (keyPoint: MapKeyPoint): number =>
    (options.raisedByCounts === "ALL" ? keyPoint.makers : keyPoint.blindMakers).length;
  return mapSpecOf("CHOOSE", ctx, "choose", [mapQuestionField(ctx),
    { name: "key_points", content: JSON.stringify(keyPoints.map((keyPoint) => ({ key_point_id: keyPoint.keyPointId, claim: keyPoint.claim,
      raised_by: raisedBy(keyPoint), angle_kind: keyPoint.fixedAngleKinds[0] ?? null }))) },
    { name: "answers", content: JSON.stringify(mergedAnswers.map((answer) => ({ answer_id: answer.answerId, answer: answer.answer }))) }],
  mapChooseReplySchema, mapChooseCheck(new Set(keyPoints.map((keyPoint) => keyPoint.keyPointId)), ctx.languageTag));
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
