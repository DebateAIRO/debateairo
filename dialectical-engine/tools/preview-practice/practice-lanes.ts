/**
 * Preview practice: the steps ("lanes") a model is asked to do, and how a wrong-format reply is diagnosed.
 *
 * Plain words: in a debate each model is asked to do different jobs, each with its own prompt and its own answer
 * format: write a position, attack or defend one, judge a statement as a panel member, review a node, write the
 * answer, check the answer, tell the story, check the story. This file
 *  - drives each job through the engine's REAL prompt builders and REAL format checks (the Judge class, the runner's
 *    synthesis prompt builder and classifiers, the real StoryWriter), with synthetic material from
 *    practice-questions.ts, for the "formats" mode;
 *  - maps a debate's call-site key back to the format check that job uses, so a reply that failed its format can be
 *    re-checked from its stored text and the exact problem recovered as `code@path` entries.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { StoryBodySchema } from "@debateai/contract";
import {
  COMPARING_JUDGE_READING,
  Judge,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  JUDGE_ARTIFACT_READING,
  POINT_INVESTIGATION_READING,
  classifyStructuredArtifact,
  comparingJudgeReplySchema,
  judgeArtifactSchema,
  judgeAssessmentSchema,
  nodeReviewArtifactSchema,
  parseStructuredArtifact,
  pointInvestigationContentIssues,
  pointInvestigationReplySchema,
  REVIEW_ARTIFACT_READING,
  parsedStructuredRepairs,
  type JudgeAssessment,
  type JudgeLeg
} from "@debateai/judgement";
import {
  MAP_ENGINE_CONTRACT_IDS,
  MAP_ENGINE_REPLY_SCHEMAS,
  MAP_LENGTH_CONTRACT_IDS,
  MAP_LENGTHED_REPLY_SCHEMAS,
  mapAnglesReplySchema,
  mapAnglesSalvage,
  mapAnglesSalvageEngine,
  mapAnglesSalvageLengthed,
  mapCheckSalvage,
  mapChooseReplySchema,
  mapChooseSalvage,
  mapChooseSalvageV2,
  mapClassifyReply,
  mapGapReplySchema,
  mapGapSalvage,
  mapGapSalvageLengthed,
  mapListReplySchema,
  mapListSalvage,
  mapListSalvageLengthed,
  mapMergeReplySchema,
  mapMergeSalvage,
  mapSnowballReplySchema,
  type MapReplySalvage
} from "@debateai/map";
import {
  PREVIEW_PROVIDER_REF_MODELS,
  decodedRepairsOf,
  decodeModelJson,
  fixReplyStructure,
  rememberingAcceptedReply,
  structureRepairOriginalKey,
  type CallBound,
  type ContentClassification,
  type ModelReplyFacts,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import { buildStoryRegisterRows, readStoryPolicy, type StoryPolicy } from "@debateai/register";
import {
  EVALUATOR_CONTRACTS_FINGERPRINT_TEXT,
  buildComposedRepairPacket,
  buildDigestFollowingServeNodes,
  buildSchemaRepairPacket,
  buildSynthesisRolePrompt,
  classifyComposedContent,
  classifyEvaluatorContent,
  classifySynthesisRoleContent,
  composedNodeIdOf,
  parseComposerOutput,
  parseEvaluatorOutput
} from "@debateai/runner";
import {
  SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT,
  assertEvaluatorVerdict,
  buildEvaluatorRequest,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  idShapedTokensIn,
  synthesisCallSiteKey,
  synthesisWordingIndex,
  type DigestSourceNode,
  type SynthesisDigest
} from "@debateai/serve";
import {
  STORY_CHECKER_CONTRACT_ID,
  STORY_CHECKER_V4_CONTRACT_ID,
  STORY_FIXER_OPTIONS,
  STORYTELLER_CONTRACT_ID,
  STORYTELLER_V4_CONTRACT_ID,
  StoryWriter,
  classifyCheckerContent,
  type StoryPack,
  type StoryRecordInput,
  type StoryWriteInput
} from "@debateai/story";
import { TypedDomainError, exhaustive, lengthCallStepOf, type LengthCallStep, type WayOfKnowing } from "@debateai/kernel";
// The runner's own story snapshot builder (not on the runner package's export list; practice.ts reads the runner's
// dev register module the same way).
import { buildStoryRunSnapshot } from "../../apps/runner/src/story-snapshot.js";
import { REVISION_REPLY_FORM, readPromptFrame, type PromptPacket } from "@debateai/providers";
import type { PracticeQuestion } from "./practice-questions.js";
import type { PracticeStoryV4Settings } from "./practice-story-length.js";
import type { PracticeReplyForm } from "./practice-verdict.js";

export const PRACTICE_LANES = [
  "JUDGE_POSITION", "JUDGE_ATTACK", "JUDGE_CROSS", "PANEL", "REVIEW", "SYNTHESIZER", "EVALUATOR", "STORYTELLER", "STORY_CHECKER"
] as const;
export type PracticeLane = typeof PRACTICE_LANES[number];

/* ------------------------------------------------------------------ diagnosis */

/** A list of `code@path` issues (one or more, comma-joined): machine codes and paths only, never free text. */
export const PRACTICE_ISSUE_LIST = /^[A-Za-z_]+@[^,\s]*(?:,[A-Za-z_]+@[^,\s]*)*$/u;
/** A message that is itself a machine code (`STRUCTURE_REPAIR_NOT_VERBATIM`). */
const MACHINE_CODE = /^[A-Z][A-Z0-9_]*$/u;

/**
 * A format check's error text as `code@path` entries. Two forms exist in the engine: the judge's tolerant parser
 * already writes `code@path,code@path` ($ for the root); the runner's and the story's checks write zod's issue list
 * as JSON (`[{"code":..,"path":[..],..}]`). Anything else (a plain parse error) is returned as one entry. A `custom`
 * issue whose message is a machine code (`STRUCTURE_REPAIR_NOT_VERBATIM`, LG-A) is named by that code; any other message
 * stays out (`custom`), so no free text becomes a code.
 */
export function issueListFromParseError(parseError: string | null | undefined): readonly string[] {
  if (parseError === null || parseError === undefined || parseError.trim() === "") return Object.freeze([]);
  const text = parseError.trim();
  if (text.startsWith("[")) {
    try {
      const issues = JSON.parse(text) as unknown;
      if (Array.isArray(issues)) {
        return Object.freeze(issues.map((issue) => {
          const row = (typeof issue === "object" && issue !== null ? issue : {}) as Record<string, unknown>;
          const coded = row.code === "custom" && typeof row.message === "string" && MACHINE_CODE.test(row.message);
          const code = typeof row.code === "string" && !coded ? row.code : typeof row.message === "string" ? row.message : "issue";
          const path = Array.isArray(row.path) && row.path.length > 0 ? row.path.map(String).join(".") : "$";
          return `${code}@${path}`;
        }));
      }
    } catch { /* fall through: not the JSON form */ }
  }
  if (PRACTICE_ISSUE_LIST.test(text)) return Object.freeze(text.split(","));
  return Object.freeze([text.length > 300 ? `${text.slice(0, 300)}...` : text]);
}

/** The text a model wrote, from the stored body (the gateway stores the vendor's whole HTTP reply). */
export function replyContentOf(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const choices = parsed.choices;
    if (Array.isArray(choices)) {
      const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
      if (typeof content === "string") return content;
    }
    const blocks = parsed.content;
    if (Array.isArray(blocks)) {
      const text = blocks.map((block) => (typeof block === "object" && block !== null
        && (block as { type?: unknown }).type === "text" ? String((block as { text?: unknown }).text ?? "") : "")).join("");
      if (text !== "") return text;
    }
  } catch { /* not a vendor body: the text itself */ }
  return rawText;
}

/** The preview model a provider ref names, as every practice table reports it; a ref the preview does not review is named as such. */
export function practiceModelOfRef(providerRef: string): string {
  return PREVIEW_PROVIDER_REF_MODELS[providerRef] ?? `unreviewed:${providerRef}`;
}

export type PracticeCallFamily = "MAP" | "JUDGE" | "PANEL" | "REVIEW" | "INVESTIGATOR" | "VERDICT_JUDGE" | "SYNTHESIZER" | "EVALUATOR"
  | "STORYTELLER" | "STORY_CHECKER" | "STRUCTURE_REPAIR" | "UNMAPPED";

/** R2 (INTERFACE §15.4): the engine-2 verdict calls' key prefixes (A2's `pointInvestigationCallSiteKey`, `comparingJudgeCallSiteKey`). */
const PRACTICE_VERDICT_KEY_PREFIXES = Object.freeze({ investigate: "VERDICT:investigate:", judge: "VERDICT:judge:" } as const);

/** Which job a debate call was, from its call-site key (apps/runner/src/index.ts and packages/story naming). */
export function callFamilyOf(callSiteKey: string): PracticeCallFamily {
  // LG-A (L32): the structure-repair call, on the repair model, for any step.
  if (callSiteKey.startsWith("REPAIR:STRUCTURE:")) return "STRUCTURE_REPAIR";
  // R2: the investigator of a "cannot assess" point and the comparing judges (their keys never start with JUDGE).
  if (callSiteKey.startsWith(PRACTICE_VERDICT_KEY_PREFIXES.investigate)) return "INVESTIGATOR";
  if (callSiteKey.startsWith(PRACTICE_VERDICT_KEY_PREFIXES.judge)) return "VERDICT_JUDGE";
  if (callSiteKey.startsWith("MAP:")) return "MAP";
  if (callSiteKey.startsWith("STORY:STORYTELLER:")) return "STORYTELLER";
  if (callSiteKey.startsWith("STORY:CHECKER:")) return "STORY_CHECKER";
  if (callSiteKey.startsWith("COMPOSER:SYNTHESIZER:")) return "SYNTHESIZER";
  if (callSiteKey.startsWith("POST_COMPOSE_R9:EVALUATOR:")) return "EVALUATOR";
  if (callSiteKey.startsWith("PANEL:")) return "PANEL";
  if (callSiteKey.startsWith("JUDGE:review:")) return "REVIEW";
  if (callSiteKey === "JUDGE" || callSiteKey.startsWith("JUDGE:")) return "JUDGE";
  return "UNMAPPED";
}

/** The map's steps as their call-site keys name them (spec 2026-10-12 §3.4). */
export const PRACTICE_MAP_STEPS = Object.freeze(["angles", "list", "merge", "gap", "choose", "check"] as const);
export type PracticeMapStep = typeof PRACTICE_MAP_STEPS[number];

/**
 * `MAP:angles` → angles, `MAP:list:<i>` → list, `MAP:gap:<k>` → gap, …; null for any other key. Only the second
 * segment is read, so a reassigned list (`MAP:list:<i>:2`, P2b Task 1) is a list too.
 */
export function practiceMapStepOf(callSiteKey: string): PracticeMapStep | null {
  const [family, step] = callSiteKey.split(":");
  if (family !== "MAP" || step === undefined) return null;
  return (PRACTICE_MAP_STEPS as readonly string[]).includes(step) ? step as PracticeMapStep : null;
}

/** LG-A (INTERFACE §1.3): a call's step, in the thinking table's words; finer than the family (positions, pros/cons and cross-replies apart). */
export type PracticeStep = LengthCallStep | "UNMAPPED";
export function practiceStepOf(callSiteKey: string): PracticeStep {
  return lengthCallStepOf(callSiteKey) ?? "UNMAPPED";
}

/** One way a map step's reply is read: its schema and the code salvage its step makes (ruling MAP-SALVAGE). */
type PracticeMapReading = Readonly<{ schema: Parameters<typeof mapClassifyReply>[2]; salvage: (keyPointIds: ReadonlySet<string> | null) => MapReplySalvage<unknown> }>;

/**
 * The readings a map step's reply may have. The list key carries both the list and (in a snowball opening) the
 * snowball reply, so either is accepted. Each makes the step's own code salvage (`@debateai/map` salvage.ts), so a reply
 * the step salvaged is never flagged here. The steps' own content checks need the run's ids and are not re-run here: the
 * schema re-check is the diagnosis, the call-time check is the verdict. Choose's salvage drops an id the run does not
 * hold only when the caller knows the call's key point ids (`practiceMapKeyPointIdsOf`); without them it drops repeats.
 */
const MAP_RECHECK_READINGS: Readonly<Record<PracticeMapStep, readonly PracticeMapReading[]>> = Object.freeze({
  angles: [{ schema: mapAnglesReplySchema, salvage: () => mapAnglesSalvage }],
  list: [{ schema: mapListReplySchema, salvage: () => mapListSalvage }, { schema: mapSnowballReplySchema, salvage: () => mapListSalvage }],
  merge: [{ schema: mapMergeReplySchema, salvage: () => mapMergeSalvage }],
  gap: [{ schema: mapGapReplySchema, salvage: () => mapGapSalvage }],
  choose: [{ schema: mapChooseReplySchema, salvage: (keyPointIds) => mapChooseSalvage(keyPointIds) as MapReplySalvage<unknown> }],
  // Engine redesign R3: engine 1 has no check step, so a MAP:check reply read here is UNMAPPED (pre-flight PF-R35.15).
  check: []
});

/** Length guidance (spec 2026-10-15 §3.9): a lengthed map call's readings: the runaway-limit schemas, no trims, ids still normalised. */
const MAP_RECHECK_READINGS_LENGTHED: Readonly<Record<PracticeMapStep, readonly PracticeMapReading[]>> = Object.freeze({
  angles: [{ schema: MAP_LENGTHED_REPLY_SCHEMAS.angles, salvage: () => mapAnglesSalvageLengthed }],
  list: [{ schema: MAP_LENGTHED_REPLY_SCHEMAS.list, salvage: () => mapListSalvageLengthed },
    { schema: MAP_LENGTHED_REPLY_SCHEMAS.snowball, salvage: () => mapListSalvageLengthed }],
  merge: [{ schema: MAP_LENGTHED_REPLY_SCHEMAS.merge, salvage: () => mapMergeSalvage }],
  gap: [{ schema: MAP_LENGTHED_REPLY_SCHEMAS.gap, salvage: () => mapGapSalvageLengthed }],
  choose: [{ schema: MAP_LENGTHED_REPLY_SCHEMAS.choose, salvage: (keyPointIds) => mapChooseSalvage(keyPointIds) as MapReplySalvage<unknown> }],
  // Engine redesign R3: engine 1 has no check step, so a MAP:check reply read here is UNMAPPED (pre-flight PF-R35.15).
  check: []
});

/** Engine redesign R3: engine 2's readings (runaway limits; the v2 forms), the once-built schemas (pre-flight PF-R3-2.10). */
const ENGINE_READING = MAP_ENGINE_REPLY_SCHEMAS;
const ENGINE_MAP_READINGS: Readonly<Record<PracticeMapStep, readonly PracticeMapReading[]>> = Object.freeze({
  angles: [{ schema: ENGINE_READING.angles, salvage: () => mapAnglesSalvageEngine }],
  list: [{ schema: ENGINE_READING.list, salvage: () => mapListSalvageLengthed }, { schema: ENGINE_READING.snowball, salvage: () => mapListSalvageLengthed }],
  merge: [{ schema: ENGINE_READING.merge, salvage: () => mapMergeSalvage }],
  gap: [{ schema: ENGINE_READING.gap, salvage: () => mapGapSalvageLengthed }],
  choose: [{ schema: ENGINE_READING.choose, salvage: (keyPointIds) => mapChooseSalvageV2(keyPointIds) as MapReplySalvage<unknown> }],
  check: [{ schema: ENGINE_READING.check, salvage: () => mapCheckSalvage }]
});

/**
 * The step's readings in order: the first that accepts the reply, else the first refusal. Null for a key that is no map
 * step. `lengthed`: the call was asked under a length variant (`practiceMapLengthedOf`), so its reply is read with the
 * runaway limits and the lengthed salvages. `engine` (engine redesign R3): the call was asked under an engine-2 contract
 * (`practiceMapEngineOf`), so its reply is read by engine 2's readings ONLY, and an engine-1 reply reads exactly as before.
 */
function readMapReply(callSiteKey: string, content: string, ending: ModelReplyFacts | undefined,
  keyPointIds: ReadonlySet<string> | null, lengthed = false, engine = false): ReturnType<typeof mapClassifyReply<unknown>> | null {
  const step = practiceMapStepOf(callSiteKey);
  if (step === null) return null;
  let first: ReturnType<typeof mapClassifyReply<unknown>> | null = null;
  for (const reading of (engine ? ENGINE_MAP_READINGS : lengthed ? MAP_RECHECK_READINGS_LENGTHED : MAP_RECHECK_READINGS)[step]) {
    const read = mapClassifyReply(content, ending, reading.schema, () => [], reading.salvage(keyPointIds));
    if (read.classification.parseStatus === "PARSED") return read;
    first ??= read;
  }
  return first;
}

/**
 * `lengthed`: the call was asked under a map length variant, so its reply is re-checked under the lengthed limits (Task 14
 * review 4). `engine` (R3): an engine-2 call, re-checked by engine 2's readings only.
 */
function recheckMapReply(callSiteKey: string, content: string, lengthed: boolean, engine = false): readonly string[] {
  const read = readMapReply(callSiteKey, content, undefined, null, lengthed, engine);
  return read === null ? Object.freeze(["UNMAPPED"]) : fromClassification(read.classification);
}

/**
 * The key point ids a choose call was shown, from its own recorded prompt (the `key_points` material field, a JSON list
 * of `{ key_point_id, … }`). Null when the prompt holds no such field or it cannot be read.
 */
export function practiceMapKeyPointIdsOf(messages: PromptPacket["messages"]): ReadonlySet<string> | null {
  try {
    const field = readPromptFrame({ messages }).fields.find((candidate) => candidate.name === "key_points");
    if (field === undefined) return null;
    const keyPoints = JSON.parse(field.content) as unknown;
    if (!Array.isArray(keyPoints)) return null;
    const ids = keyPoints.map((entry) => (typeof entry === "object" && entry !== null ? (entry as { key_point_id?: unknown }).key_point_id : undefined));
    return ids.every((id): id is string => typeof id === "string") ? Object.freeze(new Set(ids)) : null;
  } catch {
    return null;
  }
}

/**
 * A recorded map call was asked under a length variant (its prompt's contract id): its reply is read with the runaway
 * limits. Engine redesign R3: an engine-2 call is always lengthed (pre-flight PF-R35.15).
 */
export function practiceMapLengthedOf(messages: Parameters<typeof practiceMapKeyPointIdsOf>[0]): boolean {
  try {
    const contractId = readPromptFrame({ messages } as PromptPacket).contractId;
    return Object.values(MAP_LENGTH_CONTRACT_IDS).includes(contractId) || (Object.values(MAP_ENGINE_CONTRACT_IDS) as string[]).includes(contractId);
  } catch { return false; }
}

/** Engine redesign R3: a recorded map call was asked under an engine-2 contract (its prompt's contract id). */
export function practiceMapEngineOf(messages: Parameters<typeof practiceMapKeyPointIdsOf>[0]): boolean {
  try { return (Object.values(MAP_ENGINE_CONTRACT_IDS) as string[]).includes(readPromptFrame({ messages } as PromptPacket).contractId); }
  catch { return false; }
}

/**
 * Information only (all-steps format robustness, 2026-10-12): which tolerant repair an ACCEPTED reply needed, read by
 * the shared decode (`decodeModelJson`) with how the reply ended (`finish_reason` as the gateway recorded it). Null for
 * strict JSON; several repairs are named together, joined by "+" (LG-A). The judge's own reading takes the FIRST of
 * several objects where this takes the last, so for such a reply the code may differ; the counts are shown in the
 * report, never a reason for a verdict.
 */
export function practiceJsonRepairOf(content: string, finishReason: unknown, callSiteKey?: string,
  mapKeyPointIds?: ReadonlySet<string> | null, mapLengthed = false, mapEngine = false): string | null {
  const ending: ModelReplyFacts = { finishReason: typeof finishReason === "string" ? finishReason : null };
  // LG-A (L32): a structure-repair try (`REPAIR:STRUCTURE:<key>`) is read as the step it repairs.
  const key = callSiteKey === undefined ? undefined : structureRepairOriginalKey(callSiteKey);
  // Ruling MAP-SALVAGE (2026-10-14): a map reply is read by its step's own reading, salvage included, and every repair
  // it needed is named, joined by "+" ("INNER_QUOTE+MAP_TEXT_TRIMMED"). A reply that reading refuses (a patch reply holds
  // only the patched members) is read by the shared decode, as before.
  // Length guidance (spec 2026-10-15 §3.9): a call asked under a map length variant is read with the runaway limits.
  // Engine redesign R3: an engine-2 map call is read by engine 2's readings only.
  const map = key === undefined ? null : readMapReply(key, content, ending, mapKeyPointIds ?? null, mapLengthed, mapEngine);
  if (map !== null && map.classification.parseStatus === "PARSED") return map.repairs.length === 0 ? null : map.repairs.join("+");
  // MiMo salvage (2026-10-12): the judge-family steps also make SHAPE repairs (NESTED_FIELDS, RENAMED_MEMBER,
  // UNASKED_KEYS, EMPTY_LIST) that the schema-blind decode cannot see, so with its call-site key a judge, panel or
  // review reply is read by the step's own reader and counted under the repair that reader needed.
  // An ACCEPTED review with no `edge_bearings` was accepted only by EMPTY_LIST, which needs a node with no edges: 0.
  // LG-A (L34): every repair that reader made, joined by "+" like the map's: the syntax pass and the reply fixer
  // (SYNTAX_REPAIRED, STRUCTURE_FIXED) name their repairs only in that list.
  const structured = key === undefined ? null : structuredReadingOf(key, content, ending, { whenMissing: 0 });
  if (structured !== null) return structured.kind === "PARSED" ? parsedStructuredRepairs(structured).join("+") || null : null;
  // R15 practice debate (2026-10-13): the two story sites also read a reply that ends with its one object after prose
  // (TRAILING_OBJECT), and only when that object passed their full checks; this reply WAS accepted, so the object the
  // decode finds there is the one the site took, and the repair is named. LG-A: every repair the decode made, joined by "+".
  const decoded = decodeModelJson(content, ending, key?.startsWith("STORY:") === true ? { trailingObjectAccepted: () => true } : undefined);
  if (!decoded.ok) return null;
  const repairs = decodedRepairsOf(decoded);
  return repairs.length === 0 ? null : repairs.join("+");
}

/** What a review's format check knows about its edge count (`reviewEdgeCountOf`). */
type ReviewEdgeKnowledge = Readonly<{ known?: number | null; whenMissing: number | null }>;

/**
 * The review's edge count for its format check: `known` (read from the call's own prompt) when there is one; else the
 * stored reply's own `edge_bearings` length (so a length mismatch is then not re-detected); else, when the list is
 * missing, `whenMissing`. Null: not known, and a missing list is then not read as [].
 */
function reviewEdgeCountOf(content: string, edges: ReviewEdgeKnowledge): number | null {
  if (typeof edges.known === "number") return edges.known;
  const decoded = decodeModelJson(content);
  const bearings = decoded.ok && typeof decoded.value === "object" && decoded.value !== null
    ? (decoded.value as { edge_bearings?: unknown }).edge_bearings
    : undefined;
  return Array.isArray(bearings) ? bearings.length : edges.whenMissing;
}

/**
 * A judge-family reply read exactly as its step reads it (schema and reading options), or null for any other step.
 * A review whose edge count is not known is read without EMPTY_LIST and with a list of one entry asked for, so a
 * missing `edge_bearings` stays a refusal there.
 */
function structuredReadingOf(callSiteKey: string, content: string, ending: ModelReplyFacts | undefined, edgeKnowledge: ReviewEdgeKnowledge) {
  switch (callFamilyOf(callSiteKey)) {
    case "JUDGE": return parseStructuredArtifact(content, judgeArtifactSchema, ending, JUDGE_ARTIFACT_READING);
    case "PANEL": return parseStructuredArtifact(content, judgeAssessmentSchema, ending, JUDGE_ARTIFACT_READING);
    case "REVIEW": {
      const edges = reviewEdgeCountOf(content, edgeKnowledge);
      return edges === null
        ? parseStructuredArtifact(content, nodeReviewArtifactSchema(1), ending, { ...REVIEW_ARTIFACT_READING, emptyLists: false })
        : parseStructuredArtifact(content, nodeReviewArtifactSchema(edges), ending, REVIEW_ARTIFACT_READING);
    }
    default: return null;
  }
}

/** R2 (E12): an author's or a grader's accepted reply, read again exactly as its step read it. */
export type PracticeJudgeReading = Readonly<{ statement: string | null; assessment: JudgeAssessment }>;

/**
 * The statement (author calls only) and the seven-measure assessment of an accepted JUDGE or PANEL reply, through the
 * step's own reader and repairs (`structuredReadingOf`); null for any other call or a reply that reader refuses.
 */
export function practiceJudgeReadingOf(callSiteKey: string, content: string, finishReason: unknown): PracticeJudgeReading | null {
  const ending: ModelReplyFacts = { finishReason: typeof finishReason === "string" ? finishReason : null };
  const family = callFamilyOf(callSiteKey);
  if (family === "JUDGE") {
    const read = parseStructuredArtifact(content, judgeArtifactSchema, ending, JUDGE_ARTIFACT_READING);
    if (read.kind !== "PARSED") return null;
    const { statement, steelman, critic, evidence, context, fallacy } = read.value;
    return Object.freeze({ statement, assessment: Object.freeze({ steelman, critic, evidence, context, fallacy }) });
  }
  if (family === "PANEL") {
    const read = parseStructuredArtifact(content, judgeAssessmentSchema, ending, JUDGE_ARTIFACT_READING);
    return read.kind === "PARSED" ? Object.freeze({ statement: null, assessment: read.value }) : null;
  }
  return null;
}

/**
 * The review's edge count from the call's own recorded prompt: the `edges_sourced_by_this_node` material field the
 * review packet carries (a JSON list). Null when the prompt holds no such field or it cannot be read.
 */
export function practiceReviewEdgeCountOf(messages: PromptPacket["messages"]): number | null {
  try {
    const field = readPromptFrame({ messages }).fields.find((candidate) => candidate.name === "edges_sourced_by_this_node");
    if (field === undefined) return null;
    const edges = JSON.parse(field.content) as unknown;
    return Array.isArray(edges) ? edges.length : null;
  } catch {
    return null;
  }
}

/**
 * Engine row, story v4 (R1d; spec 2026-10-15 engine redesign §7.2 item 8): a round-2 storyteller request that revises
 * its own draft. It carries the model's accepted round-1 draft as its own (assistant) turn, then one fenced block whose
 * last field is `machine_reply_form` REVISION (packages/providers/src/prompt-frame.ts buildFramedRevisionPrompt), read
 * through the door. A patch follow-up also carries an assistant turn, but its form is PATCH.
 */
export function practiceIsRevisionPrompt(messages: PromptPacket["messages"]): boolean {
  if (!messages.some((message) => message.role === "assistant")) return false;
  try {
    const last = readPromptFrame({ messages }).fields.at(-1);
    return last?.name === "machine_reply_form" && last.content === REVISION_REPLY_FORM;
  } catch {
    return false;
  }
}

/**
 * Patch follow-up (owner design, 2026-10-12): which form one attempt sent (`PracticeReplyForm`), read from the attempt's
 * own recorded prompt (the `messages` the gateway hands `persistCallPrompt` just before it sends, the same value
 * ledger.call_prompt keeps), through the frame reader the gateway's door runs:
 *  - an answer turn (role "assistant") is the short patch follow-up: the door admits one only in the patch shape;
 *  - else a material block naming a refusal (`machine_rejection_code`) is the full re-ask;
 *  - else the step's own packet.
 * Null when the frame cannot be read (never the case for a prompt the gateway sent).
 */
export function practiceReplyFormOf(messages: PromptPacket["messages"]): PracticeReplyForm | null {
  // A revision (story v4 round 2) is that round's own packet (ORIGINAL), or its full re-ask once it carries the
  // rejection fields (FULL); never a patch, though it carries the model's own draft as an assistant turn.
  if (practiceIsRevisionPrompt(messages)) {
    try {
      return readPromptFrame({ messages }).fields.some((field) => field.name === "machine_rejection_code") ? "FULL" : "ORIGINAL";
    } catch {
      return null;
    }
  }
  if (messages.some((message) => message.role === "assistant")) return "PATCH";
  try {
    return readPromptFrame({ messages }).fields.some((field) => field.name === "machine_rejection_code") ? "FULL" : "ORIGINAL";
  } catch {
    return null;
  }
}

/** The finish reason a stored artifact's metadata recorded (W10/1), or null. */
export function practiceFinishReasonOf(metadata: unknown): string | null {
  const value = typeof metadata === "object" && metadata !== null ? (metadata as { finish_reason?: unknown }).finish_reason : null;
  return typeof value === "string" ? value : null;
}

function fromZod(result: { success: true } | { success: false; error: { issues: readonly { code: string; path: readonly PropertyKey[] }[] } }): readonly string[] {
  if (result.success) return Object.freeze([]);
  return Object.freeze(result.error.issues.map((issue) => `${issue.code}@${issue.path.length === 0 ? "$" : issue.path.map(String).join(".")}`));
}

function fromClassification(classified: ContentClassification): readonly string[] {
  return classified.parseStatus === "PARSED" ? Object.freeze([]) : issueListFromParseError(classified.parseError);
}

function fromStructured(result: ReturnType<typeof parseStructuredArtifact>): readonly string[] {
  if (result.kind === "PARSED") return Object.freeze([]);
  return issueListFromParseError(result.message);
}

/**
 * Re-runs the job's own format check on a stored reply. The story's storyteller check needs the run's material
 * index (which refs exist), which is not stored: the reply is checked against the story's schema only (after the reply
 * fixer, as the live reader reads it). A structure-repair try is checked as the step it repairs. The review
 * check's length rule needs the number of edges: `reviewEdgeCount` (read from the call's own prompt,
 * `practiceReviewEdgeCountOf`) when the caller has it, else the reply's own `edge_bearings` length, so only a length
 * mismatch is not re-detected (the stored detail still names it); a reply with no list and no known count is not read
 * as [] (MiMo salvage EMPTY_LIST needs a node with no edges). `mapLengthed`: a map call asked under a length variant
 * (`practiceMapLengthedOf`), re-checked under the lengthed limits as the live call read it. `mapEngine` (engine redesign
 * R3): a map call asked under an engine-2 contract (`practiceMapEngineOf`), re-checked by engine 2's readings only.
 */
export function recheckReply(callSiteKey: string, content: string, reviewEdgeCount?: number | null,
  mapLengthed = false, mapEngine = false): Readonly<{ family: PracticeCallFamily; issues: readonly string[] }> {
  const family = callFamilyOf(callSiteKey);
  // LG-A (L32): a structure-repair try is checked as the step it repairs; its own family stays STRUCTURE_REPAIR.
  const key = structureRepairOriginalKey(callSiteKey);
  switch (callFamilyOf(key)) {
    case "JUDGE":
    case "PANEL":
    case "REVIEW": {
      const read = structuredReadingOf(key, content, undefined, { known: reviewEdgeCount ?? null, whenMissing: null });
      return { family, issues: read === null ? Object.freeze(["UNMAPPED"]) : fromStructured(read) };
    }
    case "SYNTHESIZER": return { family, issues: fromClassification(classifySynthesisRoleContent("SYNTHESIZER", content)) };
    case "EVALUATOR": return { family, issues: fromClassification(classifyEvaluatorContent(content)) };
    case "STORY_CHECKER": return { family, issues: fromClassification(classifyCheckerContent(content)) };
    case "STORYTELLER": {
      let parsed: unknown;
      try { parsed = JSON.parse(content); } catch (error) {
        return { family, issues: Object.freeze([`invalid_json@$:${error instanceof Error ? error.message.slice(0, 120) : "parse"}`]) };
      }
      // LG-A (L31): as the live storyteller reads it (packages/story `readStoryBody`, Task 7): the schema; when it refuses,
      // the reply fixer with the story's own options, then the schema again. A refusal lists the schema's own first reading.
      const read = StoryBodySchema.safeParse(parsed);
      if (read.success) return { family, issues: Object.freeze([]) };
      const fixed = fixReplyStructure(parsed, StoryBodySchema, STORY_FIXER_OPTIONS);
      if (fixed !== null && StoryBodySchema.safeParse(fixed.value).success) return { family, issues: Object.freeze([]) };
      return { family, issues: fromZod(read) };
    }
    case "MAP": return { family, issues: recheckMapReply(key, content, mapLengthed, mapEngine) };
    // R2 (B11; A17 review Minor 4): the investigator and the comparing judges, through their step's own schema and
    // reading. The investigator's one content rule needs nothing but the reply; the judges' letter and group checks need
    // the letters that judge was shown, and the language check the question: not re-run here (the stored detail names them).
    case "INVESTIGATOR": return { family, issues: fromClassification(classifyStructuredArtifact(content,
      pointInvestigationReplySchema, undefined, POINT_INVESTIGATION_READING, pointInvestigationContentIssues)) };
    case "VERDICT_JUDGE": return { family, issues: fromStructured(parseStructuredArtifact(content, comparingJudgeReplySchema,
      undefined, COMPARING_JUDGE_READING)) };
    default: return { family, issues: Object.freeze(["UNMAPPED"]) };
  }
}

/* ------------------------------------------------------------------ the formats mode's jobs */

const digestHex = (text: string): string => createHash("sha256").update(text).digest("hex");

/** The sealed contract hashes, derived exactly as the register's builder derives them (dev-deployment-register.ts). */
export const PRACTICE_CONTRACT_HASHES = Object.freeze({
  judge: digestHex(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT),
  composer: digestHex(SYNTHESIZER_CONTRACTS_FINGERPRINT_TEXT),
  conformance: digestHex(EVALUATOR_CONTRACTS_FINGERPRINT_TEXT)
});

export type PracticeLaneBounds = Readonly<{ judge: CallBound; synthesizer: CallBound; evaluator: CallBound }>;

export type PracticeLaneContext = Readonly<{
  lane: PracticeLane;
  question: PracticeQuestion;
  /** The gateway under test (the real one, watched). */
  gateway: ProviderGateway;
  providerRef: string;
  maker: string;
  bounds: PracticeLaneBounds;
  pack: StoryPack;
  /** A run id for the request's fields; the formats mode keeps everything in memory. */
  runId: string;
  /** Which sample of the job this is (1-based): the review job varies its edges by sample. Default 1. */
  sample?: number;
  workItemId: string;
  /**
   * Formats `--story-length` (LG-D, R1d): the story jobs are asked as engine 2's story (contracts v4), with the length
   * row's targets and engine 2's start values. Absent: today's story v3.
   */
  storyLength?: PracticeStoryV4Settings;
}>;

/** What one job reports beyond the gateway's own record: a failure of the check that runs AFTER the gateway accepted. */
export type PracticeLaneOutcome = Readonly<{ postCheckError: string | null; detail: string | null }>;

const STORY_WRITER_REF = "practice:storyteller";
const STORY_CHECKER_REF = "practice:story-checker";

/** The story rows exactly as the register's builder seals them, read by the register's own reader. */
export function practiceStoryPolicy(): StoryPolicy {
  const policy = readStoryPolicy(buildStoryRegisterRows({
    synthesizerRoleRef: STORY_WRITER_REF, evaluatorRoleRef: STORY_CHECKER_REF, sourceRef: "preview-practice:formats", hosted: false
  }), 1);
  if (policy === null) throw new TypeError("PRACTICE_STORY_POLICY_UNRESOLVED");
  return policy;
}

/*
 * The practice's one small debate, shared by the answer jobs and the story jobs, built so each job sees the SAME kind
 * of context the runner hands it in production (the false fail of 2026-10-11: the writer's citation check was handed
 * only the served root, while the runner lets it cite every argued point):
 *  - node ids are UUIDs like every real node id, so the writer's "names a node id in its prose" check fires as in
 *    production;
 *  - two maker positions (the first debate has five), so a story must give each position its own path, and the
 *    runner-up and fairness-to-losers material exist;
 *  - one surviving objection that attacks the served position: it carries a number AND an attack arrow, the
 *    runner's own rule for "surviving objection" (apps/runner/src/index.ts, the digest nodes);
 *  - the citable set built by the runner's own function (buildDigestFollowingServeNodes);
 *  - the story snapshot built by the runner's own builder (buildStoryRunSnapshot);
 *  - the answer checked and told is a written draft (segment texts joined with a line break, as serve reads a
 *    candidate), never a bare position.
 */
const NODE_POSITION = "11111111-1111-4111-8111-111111111111";
const NODE_OBJECTION = "22222222-2222-4222-8222-222222222222";
const NODE_OTHER_POSITION = "33333333-3333-4333-8333-333333333333";

/** The sealed composition bundle budget of the "high" tier (register row compositionBundleBudget; pinned by a unit test). */
const PRACTICE_COMPOSITION_BUDGET_HIGH = 30_000;

/** The digest's byte budget the practice uses: the high tier's, as the story lanes' tier. */
export function practiceDigestBudgetBound(): number {
  return PRACTICE_COMPOSITION_BUDGET_HIGH;
}

export type PracticeDebateGraph = Readonly<{
  authored: readonly Readonly<{ nodeId: string; statement: string; provenanceRef: string; wayOfKnowing: WayOfKnowing;
    reversalPoint: string; maker: string; panelDispersion: number | null }>[];
  positionNodeIds: ReadonlySet<string>;
  baseStrengths: readonly Readonly<{ nodeId: string; baseStrength: number | null }>[];
  finalStrengths: readonly Readonly<{ nodeId: string; strength: number }>[];
  arrows: readonly Readonly<{ arrowId: string; sourceNodeId: string; targetKind: string; targetNodeId: string | null; polarity: string }>[];
  sensitivity: readonly Readonly<{ removedNodeId: string; leverage: number }>[];
  servedRootNodeId: string;
  runnerUp: Readonly<{ nodeId: string; strength: number }>;
  margin: number;
}>;

export function practiceDebateGraph(question: PracticeQuestion): PracticeDebateGraph {
  const node = (nodeId: string, statement: string, maker: string, reversalPoint: string) => Object.freeze({
    nodeId, statement, provenanceRef: randomUUID(), wayOfKnowing: "REASONING" as WayOfKnowing, reversalPoint, maker, panelDispersion: null });
  return Object.freeze({
    authored: Object.freeze([
      node(NODE_POSITION, question.position, "maker-a", question.objection),
      node(NODE_OTHER_POSITION, question.otherPosition, "maker-b", "No figures compare the two options."),
      node(NODE_OBJECTION, question.objection, "maker-b", "No budget figures given.")
    ]),
    positionNodeIds: new Set([NODE_POSITION, NODE_OTHER_POSITION]),
    baseStrengths: Object.freeze([{ nodeId: NODE_POSITION, baseStrength: 0.7 }, { nodeId: NODE_OTHER_POSITION, baseStrength: 0.55 },
      { nodeId: NODE_OBJECTION, baseStrength: 0.4 }]),
    finalStrengths: Object.freeze([{ nodeId: NODE_POSITION, strength: 0.61 }, { nodeId: NODE_OTHER_POSITION, strength: 0.48 },
      { nodeId: NODE_OBJECTION, strength: 0.4 }]),
    arrows: Object.freeze([{ arrowId: "44444444-4444-4444-8444-444444444444", sourceNodeId: NODE_OBJECTION, targetKind: "NODE",
      targetNodeId: NODE_POSITION, polarity: "attack" }]),
    sensitivity: Object.freeze([{ removedNodeId: NODE_POSITION, leverage: 0.61 }, { removedNodeId: NODE_OTHER_POSITION, leverage: 0.2 },
      { removedNodeId: NODE_OBJECTION, leverage: 0.09 }]),
    servedRootNodeId: NODE_POSITION,
    runnerUp: Object.freeze({ nodeId: NODE_OTHER_POSITION, strength: 0.48 }),
    margin: 0.13
  });
}

/**
 * The digest's source nodes, by the runner's own rules (apps/runner/src/index.ts, `digestNodes`): polarity relations
 * from the node's own arrows to a node, a position by the maker-position set, and a surviving objection = it carries a
 * propagated number AND sources an attack arrow.
 */
export function practiceDigestNodes(graph: PracticeDebateGraph): readonly DigestSourceNode[] {
  const strengthByNodeId = new Map(graph.finalStrengths.map((row) => [row.nodeId, row.strength] as const));
  const leverage = new Map(graph.sensitivity.map((row) => [row.removedNodeId, row.leverage] as const));
  return Object.freeze(graph.authored.map((node) => Object.freeze({
    nodeId: node.nodeId,
    statement: node.statement,
    finalStrength: strengthByNodeId.get(node.nodeId) ?? null,
    wayOfKnowing: node.wayOfKnowing,
    marks: Object.freeze([]),
    polarityRelations: Object.freeze(graph.arrows
      .filter((arrow) => arrow.sourceNodeId === node.nodeId && arrow.targetKind === "NODE" && arrow.targetNodeId !== null)
      .map((arrow) => Object.freeze({ polarity: arrow.polarity === "attack" ? "attack" as const : "support" as const,
        targetNodeId: arrow.targetNodeId! }))),
    isPosition: graph.positionNodeIds.has(node.nodeId),
    isSurvivingObjection: strengthByNodeId.has(node.nodeId)
      && graph.arrows.some((arrow) => arrow.sourceNodeId === node.nodeId && arrow.polarity === "attack"),
    leverage: leverage.get(node.nodeId) ?? null
  })));
}

/** The citable set exactly as the runner builds it: every authored node, only the served root load-bearing. */
export function practiceServedNodes(graph: PracticeDebateGraph) {
  return buildDigestFollowingServeNodes({
    authored: graph.authored.map((node) => Object.freeze({ nodeId: node.nodeId, statement: node.statement,
      wayOfKnowing: node.wayOfKnowing, provenanceRef: node.provenanceRef, locator: null, restatementStatus: "PASS" as const })),
    servedRootNodeId: graph.servedRootNodeId
  });
}

/** A written answer for the material (what the checker checks and the story tells), as the writer's segments. */
export function practiceDraftSegments(question: PracticeQuestion): readonly Readonly<{ text: string }>[] {
  return Object.freeze([
    Object.freeze({ text: question.position }),
    Object.freeze({ text: `${question.otherPosition} The cost objection stays open: ${question.objection}` })
  ]);
}

/** The candidate statement serve hands the checker: the draft's segment texts joined with a line break. */
export function practiceCandidateStatement(question: PracticeQuestion): string {
  return practiceDraftSegments(question).map((segment) => segment.text).join("\n");
}

/** The story's snapshot, projected by the runner's own builder from the practice debate (no provider, no lease). */
export function practiceStorySnapshot(input: Readonly<{ question: PracticeQuestion; runId: string; workItemId: string }>): StoryWriteInput {
  const q = input.question;
  const graph = practiceDebateGraph(q);
  const built = buildStoryRunSnapshot({
    runId: input.runId, workItemId: input.workItemId, answerId: randomUUID(), answerVersion: 1,
    questionLine: q.questionLine, argumentLanguage: { tag: q.languageTag, name: q.languageName },
    compositionBudgetTier: "high",
    verdict: { label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE" },
    servedRootNodeId: graph.servedRootNodeId, servedStrength: 0.61, runnerUp: graph.runnerUp,
    margin: { kind: "MEASURED", value: graph.margin },
    disagreement: { kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" },
    thresholds: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 },
    confidenceBand: "FULL", answerMarks: ["LABEL-BASIS-INCOMPLETE"],
    servedSegments: practiceDraftSegments(q),
    authored: graph.authored, positionNodeIds: graph.positionNodeIds,
    baseStrengths: graph.baseStrengths, finalStrengths: graph.finalStrengths,
    arrows: graph.arrows, arrowOrder: graph.arrows.map((arrow) => arrow.arrowId),
    sensitivity: graph.sensitivity, conditionMarkRecords: [],
    // Never used: taken off below, so the writer's own resolver, and no lease, apply.
    resolveProvider: () => null, stepLease: undefined as never, costFallback: undefined as never
  });
  const { resolveProvider: _resolver, stepLease: _lease, costFallback: _fallback, ...material } = built;
  return Object.freeze(material);
}

/**
 * A story that is valid for the practice snapshot's material: one path per position (P1 the served position, P2 the
 * other; positions are numbered strongest first) and the objection (P3) cited.
 */
export function practiceCannedStory(pack: StoryPack, question: PracticeQuestion): string {
  const paragraph = (text: string) => ({ text, node_refs: ["P1"] });
  return JSON.stringify({
    shape_id: pack.defaultShape,
    short: {
      headline: "The position held up, with one open question.",
      summary: `You asked: ${question.questionLine} The debate says yes, with the cost unresolved.`,
      confidence: "Fairly sure, as long as the budget holds.",
      paths: [
        { position_ref: "P1", fate: "HELD_UP", line: "The position held up.", node_refs: ["P1", "P3"] },
        { position_ref: "P2", fate: "HELD_UP", line: "The other position was argued too.", node_refs: ["P2"] }
      ],
      change: paragraph("Budget figures showing a shortfall would change the answer.")
    },
    why: { reasons: [{ text: "The cost objection (P3) gave no figures.", node_refs: ["P3"] }] },
    long: { sections: ["Our reading", "The verdict", "What would change it"].map((title) => ({ title, paragraphs: [paragraph(`${title}.`)] })) },
    reviewer_note: null
  });
}

const CANNED_CHECKER = JSON.stringify({ satisfied: true, objection: null, criteria: {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
} });

/** Story v4 (R1d): the v4 checker's form carries `misleading`; a satisfied verdict sets it false. v3 keeps CANNED_CHECKER. */
const CANNED_CHECKER_V4 = JSON.stringify({ satisfied: true, misleading: false, objection: null, criteria: {
  faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
} });

/** Length guidance (LG-D) and story v4 (R1d): the stand-in answers the other story job by either version of its contract. */
const STANDIN_STORYTELLER_IDS: ReadonlySet<string> = new Set<string>([STORYTELLER_CONTRACT_ID, STORYTELLER_V4_CONTRACT_ID]);
const STANDIN_CHECKER_IDS: ReadonlySet<string> = new Set<string>([STORY_CHECKER_CONTRACT_ID, STORY_CHECKER_V4_CONTRACT_ID]);

/**
 * What the stand-in answers a story request with, by its contract id: the canned story for either storyteller version
 * (under v4 code sets shape_id on the decoded story, and the canned one is the pack default anyway), the satisfied
 * verdict in the checker's own version's form, and "{}" for anything else.
 */
export function practiceStandInStoryContent(pack: StoryPack, question: PracticeQuestion, contractId: string): string {
  if (STANDIN_STORYTELLER_IDS.has(contractId)) return practiceCannedStory(pack, question);
  if (!STANDIN_CHECKER_IDS.has(contractId)) return "{}";
  return contractId === STORY_CHECKER_V4_CONTRACT_ID ? CANNED_CHECKER_V4 : CANNED_CHECKER;
}

/** A local stand-in for the OTHER story job, so each story job is tested on its own and costs one call. No network. */
function cannedStoryGateway(pack: StoryPack, question: PracticeQuestion): ProviderGateway {
  let calls = 0;
  return Object.freeze({
    async call(request: ProviderCallRequest) {
      calls += 1;
      const contractId = readPromptFrame(request.packet).contractId;
      const content = practiceStandInStoryContent(pack, question, contractId);
      return { rawArtifactRef: `practice:canned:${String(calls)}`, ledgerEntryRef: `practice:canned:${String(calls)}`, content,
        provider: "openai-compatible-http" as const, model: "practice/canned", maker: "practice", modelVersion: "practice/canned" };
    }
  });
}

async function runStoryLane(context: PracticeLaneContext): Promise<PracticeLaneOutcome> {
  const records: StoryRecordInput[] = [];
  const logs: string[] = [];
  const canned = cannedStoryGateway(context.pack, context.question);
  const realRef = context.lane === "STORYTELLER" ? STORY_WRITER_REF : STORY_CHECKER_REF;
  const writer = new StoryWriter({
    // The writer never touches the pool when both seams below are given (tests/unit/story-writer.test.ts).
    pool: {} as Pool,
    pack: context.pack,
    policy: practiceStoryPolicy(),
    hosted: false,
    resolveProvider: (roleRef) => ({ provider: roleRef === realRef ? context.gateway : canned, providerRef: roleRef }),
    log: (event) => { logs.push(event); },
    repository: { insert: async (record) => { records.push(record); return "INSERTED" as const; } },
    readEnrichment: async () => new Map()
  });
  const snapshot = practiceStorySnapshot({ question: context.question, runId: context.runId, workItemId: context.workItemId });
  // R1d: story v4 is told exactly when the writer has engine 2 AND the length targets (Task 17's switch).
  await writer.writeAfterSettle(context.storyLength === undefined ? snapshot
    : { ...snapshot, lengthGuidance: context.storyLength.lengthGuidance, engine: context.storyLength.engine });
  const record = records.at(-1);
  if (record === undefined) return { postCheckError: "STORY_NOT_RECORDED", detail: logs.join(",") };
  return { postCheckError: null, detail: `${record.outcome}${record.failureCode === null ? "" : `:${record.failureCode}`}` };
}

function synthesisInputs(question: PracticeQuestion) {
  const graph = practiceDebateGraph(question);
  const outcome = buildSynthesisDigest({
    nodes: practiceDigestNodes(graph),
    servedRootNodeId: graph.servedRootNodeId,
    budgetBound: PRACTICE_COMPOSITION_BUDGET_HIGH
  });
  if (outcome.kind !== "DIGEST") throw new TypeError("PRACTICE_SYNTHESIS_DIGEST_UNRESOLVED");
  const controls = { synthesizerRoleRef: "practice:writer", evaluatorRoleRef: "practice:checker", evaluatorLoopMaxRounds: 3 };
  const codeLabel = { verdictLabel: "CONTESTED", servedNodeId: graph.servedRootNodeId, servedStrength: 0.61, margin: graph.margin,
    registerVersion: 1 };
  return { graph, digest: outcome.digest, servedNodes: practiceServedNodes(graph), controls, codeLabel };
}

/**
 * The runner's reading of a draft after the format check (apps/runner/src/index.ts, `composedSegmentsOf` in the
 * writer's call): the composition parser, the reserved memory-disclosure segment id, each cited ref mapped by the
 * runner's own `composedNodeIdOf`, and unique segment ids. A draft it refuses ends the planned writer's run in
 * production, so here it is a failure after the format check. Returns the refusal's code, or null.
 */
export function practiceComposedPostCheck(content: string, context: Readonly<{
  digest: SynthesisDigest; servedRootNodeId: string; servedNodes: readonly Readonly<{ nodeId: string }>[];
  /** How the accepted reply ended, as its classifier saw it (the runner's `writerReading`). */
  reply?: ModelReplyFacts | undefined;
}>): string | null {
  try {
    const parsed = parseComposerOutput(content, context.reply);
    const ids = parsed.segments.map((segment) => {
      if (segment.segment_id === "memory:disclosure") {
        throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "The memory disclosure segment id is reserved for the typed renderer");
      }
      for (const ref of segment.node_refs) composedNodeIdOf({ ref, digest: context.digest, servedRootNodeId: context.servedRootNodeId, servedNodes: context.servedNodes });
      return segment.segment_id;
    });
    if (new Set(ids).size !== ids.length) throw new TypedDomainError("COMPOSITION_CONTRACT_ERROR", "Composed segment ids must be stable and unique");
    return null;
  } catch (error) {
    return error instanceof TypedDomainError ? error.code : "COMPOSITION_CONTRACT_ERROR";
  }
}

/**
 * The evaluator's verdict as the runner reads it (apps/runner/src/index.ts, `evaluatorVerdictOf`): the same parser,
 * the same mapping, the same coherence assertion. tests/unit/preview-practice-wiring-drift.test.ts pins the mapping to
 * the runner's text.
 */
export function practiceEvaluatorVerdictOf(content: string, reply?: ModelReplyFacts): void {
  const parsed = parseEvaluatorOutput(content, reply);
  assertEvaluatorVerdict(Object.freeze({
    satisfied: parsed.satisfied,
    objection: parsed.objection,
    criteria: Object.freeze({
      fairnessToLosers: parsed.criteria.fairness_to_losers,
      statementLabelAgreement: parsed.criteria.statement_label_agreement,
      noOverstatement: parsed.criteria.no_overstatement,
      restatement: parsed.criteria.restatement,
      citationTracing: parsed.criteria.citation_tracing
    })
  }));
}

/**
 * The review job's edges, by sample: a maker root is reviewed with none (every root of every debate), a cross-root
 * response with two (support and attack), an expansion point with one (apps/runner/src/index.ts). The review's format
 * check requires exactly one bearing per edge, so all three counts are asked.
 */
export function practiceReviewEdges(question: PracticeQuestion, sample: number) {
  const variants = [
    [],
    [{ edgeId: "edge:practice:support", targetStatement: question.otherPosition, polarity: "support" as const },
      { edgeId: "edge:practice:attack", targetStatement: question.position, polarity: "attack" as const }],
    [{ edgeId: "edge:practice", targetStatement: question.position, polarity: "attack" as const }]
  ];
  return variants[(Math.max(1, sample) - 1) % variants.length]!;
}

/** One job, through the real organ code. Throws only for a failure the gateway did not already record. */
export async function runPracticeLane(context: PracticeLaneContext): Promise<PracticeLaneOutcome> {
  const q = context.question;
  const judge = new Judge(context.gateway);
  const common = { runId: context.runId, subjectItemId: context.workItemId, questionLine: q.questionLine,
    argumentLanguageName: q.languageName, providerRef: context.providerRef, contractHash: PRACTICE_CONTRACT_HASHES.judge };
  const judgeLeg = async (leg: JudgeLeg, callSiteKey: string): Promise<PracticeLaneOutcome> => {
    await judge.judge({ ...common, callSiteKey, leg, bound: context.bounds.judge });
    return { postCheckError: null, detail: null };
  };
  switch (context.lane) {
    case "JUDGE_POSITION": return judgeLeg({ kind: "primary-root" }, "JUDGE");
    case "JUDGE_ATTACK": return judgeLeg({ kind: "attack", positionUnderDebate: q.fallacy }, "JUDGE:critic:root0:r2:p0");
    case "JUDGE_CROSS": return judgeLeg({ kind: "cross-root", ownPosition: q.position, otherMakersPosition: q.otherPosition },
      "JUDGE:cross-root:0->1");
    case "PANEL":
      await judge.assess({ ...common, callSiteKey: `PANEL:root:${context.providerRef}`, statement: q.fallacy,
        authorMaker: "practice-other-maker", bound: context.bounds.judge });
      return { postCheckError: null, detail: null };
    case "REVIEW":
      await judge.review({ ...common, callSiteKey: "JUDGE:review:practice-node", statement: q.objection,
        authorMaker: "practice-other-maker", bound: context.bounds.judge,
        edges: practiceReviewEdges(q, context.sample ?? 1) });
      return { postCheckError: null, detail: null };
    case "SYNTHESIZER": {
      const { graph, digest, servedNodes, controls, codeLabel } = synthesisInputs(q);
      const request = buildSynthesizerRequest({ controls, round: 1, digest, codeLabel, prior: null });
      const framed = buildSynthesisRolePrompt(request, q.languageName);
      // As the runner's writerReading: the accepted draft is read again exactly as its classifier read it.
      const personTexts = [q.questionLine, ...graph.authored.map((node) => node.statement)];
      const reading = rememberingAcceptedReply((content, reply) => classifyComposedContent(content, {
        digest: request.digest,
        servedNodes,
        exemptTokens: idShapedTokensIn(personTexts),
        wording: synthesisWordingIndex({ request, personTexts }),
        questionLine: q.questionLine
      }, reply));
      const response = await context.gateway.call({
        runId: context.runId, subjectItemId: context.workItemId,
        callSiteKey: synthesisCallSiteKey({ role: "SYNTHESIZER", stage: "INITIAL", round: 1 }),
        role: "SYNTHESIZER", lane: "served", modelRole: "ANSWER_WRITER", bound: context.bounds.synthesizer,
        contractHash: PRACTICE_CONTRACT_HASHES.composer, providerRef: context.providerRef, packet: framed.packet,
        // The runner's own classifier with the runner's own citable set (every argued point; only the root served),
        // and the runner's own repair packet, so the preview's one repair try is exercised as in a debate.
        classifyContent: reading.classifyContent,
        buildRepairPacket: (rejected) => buildComposedRepairPacket(framed, rejected)
      });
      return { postCheckError: practiceComposedPostCheck(response.content,
        { digest: request.digest, servedRootNodeId: graph.servedRootNodeId, servedNodes,
          reply: reading.acceptedAs(response.content).reply }), detail: null };
    }
    case "EVALUATOR": {
      const { digest, controls, codeLabel } = synthesisInputs(q);
      const request = buildEvaluatorRequest({ controls, round: 1, digest, codeLabel, candidateStatement: practiceCandidateStatement(q) });
      const framed = buildSynthesisRolePrompt(request, q.languageName);
      const reading = rememberingAcceptedReply((content, reply) => classifyEvaluatorContent(content, reply, q.questionLine));
      const response = await context.gateway.call({
        runId: context.runId, subjectItemId: context.workItemId,
        callSiteKey: synthesisCallSiteKey({ role: "EVALUATOR", round: 1 }),
        role: "EVALUATOR", lane: "served", modelRole: "ANSWER_CHECKER", bound: context.bounds.evaluator,
        contractHash: PRACTICE_CONTRACT_HASHES.conformance, providerRef: context.providerRef, packet: framed.packet,
        classifyContent: reading.classifyContent,
        buildRepairPacket: (rejected) => buildSchemaRepairPacket(framed, rejected)
      });
      // The runner's own check after the format check (an objection must come with "not satisfied").
      try {
        practiceEvaluatorVerdictOf(response.content, reading.acceptedAs(response.content).reply);
      } catch (error) {
        return { postCheckError: error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "EVALUATOR_VERDICT_INVALID",
          detail: null };
      }
      return { postCheckError: null, detail: null };
    }
    case "STORYTELLER":
    case "STORY_CHECKER":
      return runStoryLane(context);
    default:
      return exhaustive(context.lane);
  }
}
