import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  argumentLanguageDirective,
  CLAIM_TYPES,
  REVIEW_OUTCOMES,
  TypedDomainError,
  exhaustive,
  isRunLevelSpendStop,
  lengthGuidanceField,
  lengthGuideForBounds,
  questionLanguageForBounds,
  questionLanguageSentence,
  replyLanguageCheckFor,
  withQuestionLanguageField,
  type DebateRole,
  type LengthGuide,
  type PointInvestigationMaterial,
  type QuestionLanguage,
  type ReviewOutcome,
  type WayOfKnowing
} from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  CONTENT_FOLLOW_UP_SENTENCES,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  lengthRetryTokenCeiling,
  providerTargetPrice,
  rememberingAcceptedReply,
  schemaFailureLocator,
  type CallBound,
  type FramedPrompt,
  type PromptContract,
  type PromptPacket,
  type ProviderDiscoveryTarget,
  type ProviderGateway
} from "@debateai/providers";
import {
  JUDGE_WAYS_OF_KNOWING,
  JUDGE_ASSIGNED_ROOT_V2_MATERIAL_FIELDS,
  JUDGE_CLAIM_TYPE_INSTRUCTIONS,
  JUDGE_LEG_CONSIDERATION_LENGTH_MATERIAL_FIELDS,
  JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS,
  JUDGE_LEG_LENGTH_MATERIAL_FIELDS,
  JUDGE_LEG_MATERIAL_FIELDS,
  PANEL_LENGTH_PROMPT_CONTRACT,
  PANEL_PROMPT_CONTRACT,
  judgeAssignedRootV2PromptContract,
  judgeConsiderationPromptContract,
  judgePromptContract,
  reviewPromptContract,
  type JudgeClaimedWayOfKnowing,
  type JudgeLegKind
} from "./prompts.js";
import type { Pool, PoolClient } from "pg";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  allocateSequence,
  decryptContentForRun,
  encryptAttestedContentForRun,
  type CryptoEnvelope,
  withRunContentLease,
  withWriteTransaction
} from "@debateai/db";
import {
  PanelMemberFailure,
  classifyClaimText,
  classifyStructuredArtifact,
  judgeAssessmentSchema,
  parseStructuredArtifact,
  type StructuredParseStrategy,
  type StructuredReadingOptions,
  resolveClaimType,
  type JudgeAssessment,
  type NormalizedClaim
} from "./s04.js";
import {
  POINT_INVESTIGATION_PROMPT_CONTRACT,
  POINT_INVESTIGATION_PROSE,
  POINT_INVESTIGATION_READING,
  pointInvestigationContentIssues,
  pointInvestigationMaterialFields,
  pointInvestigationReplySchema,
  type PointInvestigationReply
} from "./investigation.js";

export * from "./s04.js";
export * from "./prompts.js";
export * from "./web-prompts.js";
export * from "./investigation.js";
export * from "./comparing-judges.js";
export * from "./engine-repository.js";
export * from "./honest-score.js";

/**
 * S2-3 (goal-v4 T4): `RAN` left the judge's output vocabulary. The constant that
 * says so moved to `./prompts.ts` with the prompt that renders it (review item
 * 5), and is re-exported by the `export *` below, so this module's zod enum and
 * the declared prompt schema still read ONE source — which is the whole point of
 * it. The derived union that used to live here was dead after the move and is
 * gone: a dead derivation beside a live literal is how the claim came to be
 * false.
 */

/**
 * S2-3: the honesty mark that discloses a downgraded way-of-knowing claim.
 * Emitted by normalization, never by a caller.
 */
export const WAY_OF_KNOWING_DOWNGRADED = "WAY-OF-KNOWING-DOWNGRADED" as const;

/**
 * S2-3: what the JUDGE layer knows about a downgrade. Deliberately carries no
 * subject: at judge time the graph node does not exist yet, and the judge is
 * called with a WORK-ITEM id. A type that cannot hold a node id cannot name the
 * wrong one (codex T4-r1 B2).
 */
export interface WayOfKnowingDowngrade {
  readonly claimedWayOfKnowing: JudgeClaimedWayOfKnowing;
  readonly resolvedWayOfKnowing: WayOfKnowing;
}

/**
 * S2-3: the persistable condition-mark record. `subjectRef` is a REAL node id,
 * so this can only be built by the caller that created the node — see
 * `bindWayOfKnowingDowngrade`.
 */
export interface WayOfKnowingDowngradeRecord extends WayOfKnowingDowngrade {
  readonly mark: typeof WAY_OF_KNOWING_DOWNGRADED;
  readonly scope: "node";
  readonly subjectRef: string;
  readonly reason: string;
}

/**
 * S2-3: bind a judge-time downgrade to the node the graph actually minted.
 * Call it only after `addNode` has returned an id.
 */
export function bindWayOfKnowingDowngrade(
  downgrade: WayOfKnowingDowngrade,
  nodeId: string
): WayOfKnowingDowngradeRecord {
  if (nodeId.trim() === "") {
    throw new TypedDomainError(
      "WAY_OF_KNOWING_DOWNGRADE_NODE_UNRESOLVED",
      "A way-of-knowing downgrade cannot be recorded without the node it concerns"
    );
  }
  return Object.freeze({
    mark: WAY_OF_KNOWING_DOWNGRADED,
    scope: "node",
    subjectRef: nodeId,
    claimedWayOfKnowing: downgrade.claimedWayOfKnowing,
    resolvedWayOfKnowing: downgrade.resolvedWayOfKnowing,
    reason: `Node ${nodeId} claimed way of knowing ${downgrade.claimedWayOfKnowing}; normalization resolved ${downgrade.resolvedWayOfKnowing}. A LOOKED_UP claim keeps its label only when it carries a resolving locator.`
  });
}

export const judgeArtifactSchema = z.object({
  statement: z.string().trim().min(1),
  way_of_knowing: z.enum(JUDGE_WAYS_OF_KNOWING),
  locator: z.string().trim().min(1).nullable(),
  restatement_text: z.string().trim().min(1),
  restatement_status: z.enum(["PASS", "FAIL", "NOT_SAMPLED"]),
  value_laden: z.boolean(),
  claim_type: z.enum(CLAIM_TYPES).optional(),
  ...judgeAssessmentSchema.shape
}).strict();

/**
 * Judge nested fields (2026-10-12): how the author legs and the panel read their artifact. The NESTED_FIELDS repair
 * (MiMo-V2.6-Pro's flattened steelman and critic) applies to those two only; the review and the runner's readers do
 * not ask for it. MiMo salvage (owner ruling 2026-10-12, "Salvage in code"): they also take a misnamed object member
 * back under its own name (RENAMED_MEMBER, `"critique"` for `"critic"`) and drop root keys never asked for
 * (UNASKED_KEYS, a stray `"way_of_kooking"`), each only when the result passes the full schema.
 */
export const JUDGE_ARTIFACT_READING: StructuredReadingOptions = Object.freeze({ nestedFields: true, renamedMembers: true, unaskedKeys: true,
  // LG-A (L31): the schema-guided fixer, every repair on.
  fixer: Object.freeze({}) });

/**
 * MiMo salvage (owner ruling 2026-10-12, "Salvage in code"): how the review reads its artifact. Root keys never asked
 * for are dropped (UNASKED_KEYS), and a missing `edge_bearings` is read as [] ONLY when the node sources no edges, so the
 * schema pins the list to 0 entries and [] is the one value it admits (EMPTY_LIST). A node with edges never gets one:
 * its bearings are measurements nobody may guess.
 */
export const REVIEW_ARTIFACT_READING: StructuredReadingOptions = Object.freeze({ unaskedKeys: true, emptyLists: true, fixer: Object.freeze({}) });

/**
 * Reply language (2026-10-12): the members of each judge-family reply a reader meets, checked against the question's
 * language (`replyLanguageCheck`). The statement is the node's card; the steelman and critic summaries, the ambiguity
 * flags and the fatal-flag descriptions are the node's assessment (its drawer, the story's material, and the material
 * of every later call about the node); a review's reasons go to the story. Enum tokens, scores, the locator (a
 * source's own reference) and the fatal-flag type (identifier-shaped) are not prose and are never checked.
 */
export const JUDGE_ARTIFACT_PROSE = Object.freeze([
  "statement", "restatement_text", "steelman.summary", "critic.summary", "context.ambiguityFlags.*",
  "fallacy.fatalFlags.*.description"
] as const);
export const JUDGE_ASSESSMENT_PROSE = Object.freeze([
  "steelman.summary", "critic.summary", "context.ambiguityFlags.*", "fallacy.fatalFlags.*.description"
] as const);
export const NODE_REVIEW_PROSE = Object.freeze(["reasons.*"] as const);

/**
 * T5 / S3-1 — the review artifact carries the edge measurements.
 *
 * `edge_bearings` is positional and its length is pinned to the number of edges
 * the caller supplied, so ONE call is structurally obliged to measure ALL of
 * the reviewed node's edges: a short array is a schema failure, not a partial
 * result that a second call could top up. `null` is the per-edge
 * cannot-assess, which leaves that edge UNKNOWN.
 */
export function nodeReviewArtifactSchema(edgeCount: number) {
  return z.object({
    outcome: z.enum(REVIEW_OUTCOMES),
    reasons: z.array(z.string().trim().min(1)).min(1),
    edge_bearings: z.array(z.union([z.number().min(0).max(1), z.null()]))
      .length(edgeCount)
  }).strict();
}

/**
 * W7 / V-BLIND-CONTEXT stands, and RUN1 makes it structural: the fields a
 * judgement prompt may carry are the CLOSED table in `./prompts.ts`
 * (`JUDGE_LEG_MATERIAL_FIELDS`), and everything that reaches a model goes
 * through `buildFramedPrompt`, which refuses a field name that is not engine
 * vocabulary. Re-adding an authorship field is still not a one-line edit.
 * Provenance stays on the REQUEST and RECORD objects.
 *
 * `renderUntrustedPromptFields` and `UNTRUSTED_PROMPT_FIELDS_INSTRUCTION` are
 * gone: the frame renders the envelope and states the untrusted-material rule
 * itself, outside any slot an owner could edit.
 */

/**
 * DL4-F4: the repair used to append `Machine parse error: ${parseError}` — zod's
 * message, which quotes the model's own rejected output — into the instruction
 * compartment of the very model that wrote it. It now carries the typed code
 * and the schema path, inside the fence, and nothing else.
 */
function buildContentRepairPacket(framed: FramedPrompt, rejected: {
  readonly parseStatus: string;
  readonly parseError: string;
}) {
  return buildFramedRepairPrompt(framed, schemaFailureLocator(rejected));
}

/**
 * L4-F1 / DL4-F4 — TYPED DIRECTIVE AND DATA SLOTS.
 *
 * The runner used to build ONE string —
 * `"A fair debate requires ...\nQuestion under debate: X\nPosition under
 * critique: <the previous model's statement>\nState and defend ..."` — and hand
 * it to the judge's single `question_line` field. The directive, the question
 * and another model's output shared one compartment, so a statement containing
 * `\nQuestion under debate: ...` forged the debate frame from inside the
 * evidence.
 *
 * The leg is now a TYPE. Its directive is an instruction and lives in the
 * system message (`JUDGE_LEG_DIRECTIVES`); the question and every statement are
 * material and travel as their own fenced fields. There is no parameter left
 * that can carry a sentence into the data, or a statement into the directive.
 */
export type JudgeLeg =
  | { readonly kind: "primary-root" }
  | { readonly kind: "independent-root" }
  /**
   * Debate shape: a root the map assigns. `assignedAnswer` is the answer the
   * maker must make the strongest case for; `mapPoints` is the map's points as
   * one JSON text. Both are material, fenced like every other statement.
   */
  | {
      readonly kind: "assigned-root"; readonly assignedAnswer: string; readonly mapPoints: string;
      /**
       * Engine 2 (spec 2026-10-15 §5.2 items 2, 6): present = the fixed-words contract (`judge.assigned-root.*.v2`) with
       * the unsided points raised and the answer's assumptions, each a JSON text. Absent = today's leg, byte for byte.
       */
      readonly engine?: Readonly<{ pointsRaised: string; assumptions: string }> | undefined;
    }
  /**
   * `consideration` (debate shape) is the one map point the reply is built on.
   * Absent = today's leg, byte for byte; present = the consideration variant
   * contract. `string | undefined` because the repo compiles with
   * `exactOptionalPropertyTypes` and the moment replay's zod reads it so.
   */
  | {
      readonly kind: "support" | "attack";
      readonly positionUnderDebate: string;
      readonly consideration?: string | undefined;
    }
  | {
      readonly kind: "cross-root";
      readonly ownPosition: string;
      readonly otherMakersPosition: string;
    };

/**
 * The contract with its language sentence, added at call time (never sealed: the judge fingerprint excludes it). Without
 * a lock it is today's directive, byte for byte; with one (a shaped run's locked question language, question-language
 * spec 2026-10-13 L6) it is THE one named sentence, never the vague form.
 */
function promptContractInArgumentLanguage(
  contract: PromptContract,
  argumentLanguageName: string | undefined,
  questionLanguage?: QuestionLanguage | null
): PromptContract {
  return Object.freeze({
    ...contract,
    instruction: questionLanguage === null || questionLanguage === undefined
      ? `${contract.instruction} ${argumentLanguageDirective(argumentLanguageName ?? "the same language as the question")}`
      : `${contract.instruction} ${questionLanguageSentence(questionLanguage)}`
  });
}

export interface JudgeInput {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  /** THE QUESTION ALONE. Never a directive, never another model's statement. */
  readonly questionLine: string;
  readonly argumentLanguageName?: string;
  /**
   * The run's locked question language (a shaped run only; the caller decides by the run's shape receipt). Absent: today's
   * directive, fields and reply check, byte for byte.
   */
  readonly questionLanguage?: QuestionLanguage;
  /**
   * Length guidance (spec 2026-10-15 §3.2): this call's target (the run's frozen words for its step, its language tag and
   * factors). Present: the step's `.length.v1` variant and the `length` field (before `question_language`), and the
   * guided words recorded on the call. Absent: today's contract, fields and request, byte for byte.
   */
  readonly length?: LengthGuide;
  /** Which authoring leg this is. Selects the code-owned directive. */
  readonly leg: JudgeLeg;
  readonly providerRef: string;
  readonly contractHash: string;
  readonly bound: CallBound;
}

export interface JudgedNode {
  readonly statement: string;
  readonly wayOfKnowing: WayOfKnowing;
  readonly locator: string | null;
  /**
   * S2-3: non-null exactly when normalization resolved a way of knowing the
   * judge did not claim. `null` means the claim survived untouched — the
   * absence is itself an assertion, not a missing field. The caller binds it to
   * the real node id with `bindWayOfKnowingDowngrade` before persisting.
   */
  readonly wayOfKnowingDowngrade: WayOfKnowingDowngrade | null;
  readonly restatementText: string;
  readonly restatementStatus: "PASS" | "FAIL" | "NOT_SAMPLED";
  readonly provenanceRef: string;
  readonly providerLedgerRef: string;
  readonly valueLaden: boolean;
  readonly assessment: JudgeAssessment;
  readonly normalizedClaim: NormalizedClaim;
  readonly parseStrategy: StructuredParseStrategy;
}

export interface JudgeSubjectInput {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  readonly questionLine: string;
  readonly argumentLanguageName?: string;
  /** As `JudgeInput.questionLanguage`: the run's lock on a shaped run; absent, today's bytes. */
  readonly questionLanguage?: QuestionLanguage;
  /**
   * Length guidance (spec 2026-10-15 §3.2): this call's target (the run's frozen words for its step, its language tag and
   * factors). Present: the step's `.length.v1` variant and the `length` field (before `question_language`), and the
   * guided words recorded on the call. Absent: today's contract, fields and request, byte for byte.
   */
  readonly length?: LengthGuide;
  readonly statement: string;
  readonly authorMaker: string;
  readonly providerRef: string;
  readonly contractHash: string;
  readonly bound: CallBound;
}

/** One edge sourced by the node under review, offered for measurement (S3-1). */
export interface ReviewedEdgeSubject {
  readonly edgeId: string;
  readonly targetStatement: string;
  readonly polarity: "support" | "attack";
}

export interface NodeReviewInput extends JudgeSubjectInput {
  /**
   * Every edge this node sources. REQUIRED, never optional: an absent list and
   * an empty list must not look alike, or a caller that forgets to pass its
   * edges silently reproduces the all-UNKNOWN skeleton T5 repeals.
   */
  readonly edges: readonly ReviewedEdgeSubject[];
}

/** Engine 2 (spec §4.2b; INTERFACE §8.1): one investigation call. The material is AI-written text only. */
export interface PointInvestigationInput {
  readonly runId: string | null;
  readonly subjectItemId: string;
  /** `VERDICT:investigate:<n>` (a seat marker added by the seat caller on an assigned run). */
  readonly callSiteKey: string;
  readonly providerRef: string;
  /** The engine seal (`engineContractHash`) that covers `verdict.investigate.v1`. */
  readonly contractHash: string;
  readonly bound: CallBound;
  readonly material: PointInvestigationMaterial;
  /** The receipt's `investigator` words (60 at the start values) and the run's language tag. */
  readonly length: LengthGuide;
  readonly argumentLanguageName?: string;
  readonly questionLanguage?: QuestionLanguage;
}

export interface InvestigatedPoint {
  readonly reply: PointInvestigationReply;
  readonly provenanceRef: string;
  readonly providerLedgerRef: string;
  /** The model and maker that answered (the gateway's record, so a moved call names its real author). */
  readonly model: string;
  readonly maker: string;
  readonly parseStrategy: StructuredParseStrategy;
}

/**
 * S2-2 / T3: what one panel member is asked. Structurally the review call's
 * SUBJECT inputs, because a member assesses the same node material — but the
 * ANSWER is a scored assessment, not a review outcome, and the two calls stay
 * separate (S4-1). It carries no edges: measurement is the reviewer's seat,
 * and the panel never sees an edge.
 */
export type PanelAssessmentInput = JudgeSubjectInput;

export interface PanelAssessment {
  readonly judgementRef: string;
  readonly assessment: JudgeAssessment;
  readonly providerLedgerRef: string;
  readonly parseStrategy: StructuredParseStrategy;
}

/** One edge's measured bearing, or `null` where the reviewer cannot assess it. */
export interface ReviewedEdgeMeasurement {
  readonly edgeId: string;
  readonly bearing: number | null;
}

export interface ReviewedNode {
  readonly outcome: ReviewOutcome;
  readonly reasons: readonly string[];
  readonly provenanceRef: string;
  readonly providerLedgerRef: string;
  readonly parseStrategy: StructuredParseStrategy;
  /** One entry per supplied edge, in the order supplied (S3-1). */
  readonly edgeMeasurements: readonly ReviewedEdgeMeasurement[];
}

/**
 * THE ONE DECISION of which sealed contract a leg is framed under and which
 * closed material table it may send: a support or attack leg WITH a
 * consideration takes the debate shape's variant (`judgeConsiderationPromptContract`
 * + `JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS`); every other leg, a support or
 * attack leg without one included, takes today's contract and table. An
 * assigned root WITH `engine` (engine redesign R3) takes the fixed-words
 * contract (`judgeAssignedRootV2PromptContract` + its table), lengthed only. The framer
 * and the moment replay both read it, so the two cannot disagree.
 */
export function judgeLegFrameSpec(
  leg: JudgeLeg,
  claim: keyof typeof JUDGE_CLAIM_TYPE_INSTRUCTIONS,
  lengthed = false
): Readonly<{ contract: PromptContract; materialFields: readonly string[] }> {
  if (leg.kind === "assigned-root" && leg.engine !== undefined) {
    // Engine-2 contracts are always lengthed (engine INTERFACE §0): an untold length is a wiring defect, never sent.
    if (!lengthed) throw new TypedDomainError("JUDGE_ASSIGNED_ROOT_V2_UNLENGTHED", "An engine-2 position is always told its length");
    return Object.freeze({ contract: judgeAssignedRootV2PromptContract(claim), materialFields: JUDGE_ASSIGNED_ROOT_V2_MATERIAL_FIELDS });
  }
  if ((leg.kind === "support" || leg.kind === "attack") && leg.consideration !== undefined) {
    return Object.freeze({
      contract: judgeConsiderationPromptContract(leg.kind, claim, lengthed),
      materialFields: (lengthed ? JUDGE_LEG_CONSIDERATION_LENGTH_MATERIAL_FIELDS : JUDGE_LEG_CONSIDERATION_MATERIAL_FIELDS)[leg.kind]
    });
  }
  return Object.freeze({
    contract: judgePromptContract(leg.kind, claim, lengthed),
    materialFields: (lengthed ? JUDGE_LEG_LENGTH_MATERIAL_FIELDS : JUDGE_LEG_MATERIAL_FIELDS)[leg.kind as JudgeLegKind]
  });
}

/**
 * The closed material table, applied. A leg's fields are fixed by the table
 * `judgeLegFrameSpec` names (`JUDGE_LEG_MATERIAL_FIELDS` or its length variant,
 * the consideration variants', or, for an engine-2 assigned root, the v2 table
 * `JUDGE_ASSIGNED_ROOT_V2_MATERIAL_FIELDS`: question_line, assigned_answer,
 * map_points, points_raised, assumptions, length), and this function is the only
 * place that fills them — so a new field cannot reach a model without appearing
 * in that table.
 */
function judgeLegMaterial(
  leg: JudgeLeg,
  questionLine: string,
  declared: readonly string[],
  questionLanguage: QuestionLanguage | null = null,
  length: LengthGuide | null = null
): readonly { readonly name: string; readonly content: string }[] {
  const fields = leg.kind === "cross-root"
    ? [
        { name: "question_line", content: questionLine },
        { name: "own_position", content: leg.ownPosition },
        { name: "other_makers_position", content: leg.otherMakersPosition }
      ]
    : leg.kind === "assigned-root"
      ? [
          { name: "question_line", content: questionLine },
          { name: "assigned_answer", content: leg.assignedAnswer },
          { name: "map_points", content: leg.mapPoints },
          ...(leg.engine === undefined ? [] : [
            { name: "points_raised", content: leg.engine.pointsRaised },
            { name: "assumptions", content: leg.engine.assumptions }
          ])
        ]
      : leg.kind === "support" || leg.kind === "attack"
        ? [
            { name: "question_line", content: questionLine },
            { name: "position_under_debate", content: leg.positionUnderDebate },
            ...(leg.consideration === undefined ? [] : [{ name: "consideration", content: leg.consideration }])
          ]
        : [{ name: "question_line", content: questionLine }];
  // Length guidance (spec 2026-10-15 §3.2): the variant's table ends with `length`, the call's target.
  const all = length === null
    ? fields
    : [...fields, lengthGuidanceField(length.words, length.languageCode, length.charactersPerWord)];
  if (all.length !== declared.length || all.some((field, index) => field.name !== declared[index])) {
    throw new TypedDomainError(
      "JUDGE_LEG_MATERIAL_UNDECLARED",
      `Leg ${leg.kind} may send exactly ${declared.join(",")}`
    );
  }
  // The code-owned language field rides LAST, outside the leg's closed table; it is the run's lock, never model or user
  // text. Without a lock the table's fields alone, as today.
  return Object.freeze(withQuestionLanguageField(all, questionLanguage));
}

/**
 * THE ONE FRAMING OF A JUDGE LEG: `Judge.judge` sends exactly this, and the
 * boot check (below) prices exactly this. `claim` is the code classifier's
 * verdict on the question, which picks one of the two sealed contract variants.
 */
function framedJudgePrompt(
  leg: JudgeLeg,
  questionLine: string,
  argumentLanguageName: string | undefined,
  claim: "unknown" | "resolved",
  questionLanguage: QuestionLanguage | null = null,
  length: LengthGuide | null = null
): FramedPrompt {
  const spec = judgeLegFrameSpec(leg, claim, length !== null);
  return buildFramedPrompt({
    contract: promptContractInArgumentLanguage(spec.contract, argumentLanguageName, questionLanguage),
    material: judgeLegMaterial(leg, questionLine, spec.materialFields, questionLanguage, length)
  });
}

/** Test seam: the same function `Judge.judge` frames with, so a test reads the exact packet a leg sends. */
export const framedJudgePromptForTest: typeof framedJudgePrompt = framedJudgePrompt;

/**
 * B9 (budget spec §2.10) — WHAT THE FIRST POSITION'S OWN CALL COSTS AT MOST,
 * per configured target, for the boot check that refuses a run ceiling below
 * one call.
 *
 * The request is the one `Judge.judge` frames for the primary root and the
 * gateway sends (`{model, max_tokens, messages}`), for a question of
 * `questionMaxBytes` bytes made of the character whose encoding grows most on
 * the way: a C0 control character (U+0001), 1 UTF-8 byte, which the material
 * block escapes to `\u0001` (6 bytes) and the body escapes again to `\\u0001`
 * (7 bytes). No other character grows more per byte an ask is counted in (a
 * double quote grows 1 → 2 → 4), and nothing at the ask refuses one: the schema
 * only trims `question_line` and the route counts its UTF-8 bytes. It uses the
 * fallback language directive (longer than any language name) and both
 * claim-type variants of the contract, the larger kept. With
 * `questionLanguageLocked` (the API boot with the debate-shape row in force:
 * a shaped run's calls carry the locked language), it ALSO frames both variants
 * under the longest lock the kernel can make (`questionLanguageForBounds`: the
 * named sentence and the `question_language` field) and keeps the largest of
 * the four (pre-flight PF-L38); without it, today's two only, today's number.
 * So the figure is never below any first call an admitted ask can make. The
 * completion bound is the judge bound's first-attempt max_tokens. Each
 * projection names its target's `model`, so the boot can group the calls by
 * plan (`firstCallsByPlanRoster`). A target with no price (local mode) is left
 * out.
 */
export function firstPositionCallProjections(input: Readonly<{
  targets: readonly ProviderDiscoveryTarget[];
  judgeTokenCeiling: number;
  questionMaxBytes: number;
  questionLanguageLocked?: boolean;
  lengthed?: boolean;
}>): readonly Readonly<{
  providerRef: string;
  model: string;
  price: Readonly<{ inputMicrosPerMillionTokens: number; outputMicrosPerMillionTokens: number }>;
  requestBytes: number;
  completionTokenCeiling: number;
}>[] {
  if (!Number.isSafeInteger(input?.questionMaxBytes) || input.questionMaxBytes < 1
    || !Number.isSafeInteger(input.judgeTokenCeiling) || input.judgeTokenCeiling < 1) {
    throw new TypeError("FIRST_POSITION_PROJECTION_INPUT_INVALID");
  }
  const question = "\u0001".repeat(input.questionMaxBytes);
  const leg: JudgeLeg = Object.freeze({ kind: "primary-root" });
  const locks: readonly (QuestionLanguage | null)[] = input.questionLanguageLocked === true
    ? [null, questionLanguageForBounds()]
    : [null];
  const guides: readonly (LengthGuide | null)[] = input.lengthed === true ? [null, lengthGuideForBounds()] : [null];
  const packets = locks.flatMap((lock) => guides.flatMap((guide) => (["unknown", "resolved"] as const)
    .map((claim) => framedJudgePrompt(leg, question, undefined, claim, lock, guide).packet)));
  const completionTokenCeiling = lengthRetryTokenCeiling(input.judgeTokenCeiling, 0);
  return Object.freeze(input.targets.flatMap((target) => {
    const price = providerTargetPrice(target);
    if (price === null) return [];
    const requestBytes = Math.max(...packets.map((packet) => Buffer.byteLength(JSON.stringify({
      model: target.model,
      max_tokens: completionTokenCeiling,
      messages: packet.messages
    }), "utf8")));
    return [Object.freeze({ providerRef: target.providerRef, model: target.model, price, requestBytes, completionTokenCeiling })];
  }));
}

/**
 * Debate shape (controller ruling T12-R0) — THE MOST BYTES ROOT 0'S OWN REQUEST CAN CARRY for this question, so the
 * map can keep room for it. Root 0 is today's primary root (the map's fallback) or a map-assigned root whose answer and
 * points are at most `assignedMaterialChars` characters each. The assigned material is made of U+0001, the character
 * whose encoding grows most on the way (1 → 6 → 7 bytes, `firstPositionCallProjections`), so no real material of that
 * length frames longer. Both claim-type variants of both contracts, the largest kept, measured as the gateway's
 * `{model, max_tokens, messages}` body with an EMPTY model member: the caller adds its target's model id. With a
 * `questionLanguage` (pre-flight PF-L38) every packet is framed as the locked call sends it: the named sentence and the
 * `question_language` field; without one, today's directive and fields, today's number.
 */
export function rootPositionRequestBytesBound(input: RootPositionBoundInput): number {
  return rootPositionBodyBytesBound(input, (framed) => framed.packet);
}

/**
 * Debate shape (controller ruling T12-R3) — THE MOST BYTES ROOT 0'S FORMAT REPAIR CAN CARRY: the full re-ask the judge
 * builds when a reply fails its check (`buildContentRepairPacket`: the first packet, unchanged, then one fenced block with
 * the rejection's code and machine path). The code and the path are the longest the frame lets a repair carry
 * (`appendFramedRejection` refuses longer ones), made of characters that do not grow on the way, so no real repair of
 * the same root frames longer. Measured as `rootPositionRequestBytesBound` measures the first packet.
 *
 * LG-A (spec 2026-10-15, L33; Task 13): with the structure-repair route wired (the preview provider config), a routed
 * call's full re-ask also carries `machine_rejection_reason`, one of CONTENT_FOLLOW_UP_SENTENCES, so the bound carries
 * the longest of them too. Today's unrouted re-ask never carries one: there the bound is a few hundred bytes above it,
 * never below (the room never under-counts).
 */
export function rootPositionRepairRequestBytesBound(input: RootPositionBoundInput): number {
  return rootPositionBodyBytesBound(input, (framed) => buildFramedRepairPrompt(framed, LONGEST_REPAIR_LOCATOR));
}

type RootPositionBoundInput = Readonly<{
  questionLine: string;
  argumentLanguageName: string;
  completionTokenCeiling: number;
  /**
   * `pointsRaised` and `assumptions` (engine redesign R3, both or neither): the engine-2 fixed-words leg is framed too.
   * `pointsRaised` is the ONE room its sided `map_points` and its `points_raised` list share (Ruling PF-R35.4 (a)): the
   * two together hold at most `pointsRaised + 2` characters, which the runner's shaping keeps (`shapeEngineRootMaterial`).
   */
  assignedMaterialChars: Readonly<{ answer: number; points: number; pointsRaised?: number; assumptions?: number }>;
  questionLanguage?: QuestionLanguage | null;
  /** Length guidance (spec 2026-10-15 §3.2): frame the lengthed variant with this target; absent or null, today's bytes. */
  length?: LengthGuide | null;
}>;

/**
 * The longest typed code (`[A-Z][A-Z0-9_]{0,63}`) and machine path (200 characters) a repair packet may carry, and
 * (LG-A) the longest plain-word reason, by its bytes once escaped twice (the block, then the body).
 */
const LONGEST_REPAIR_LOCATOR = Object.freeze({ code: "A".repeat(64), path: "a".repeat(200),
  reason: Object.values(CONTENT_FOLLOW_UP_SENTENCES).reduce((longest, sentence) =>
    (escapedBytes(sentence) > escapedBytes(longest) ? sentence : longest)) });
function escapedBytes(text: string): number {
  return Buffer.byteLength(JSON.stringify(JSON.stringify(text)), "utf8");
}

function rootPositionBodyBytesBound(input: RootPositionBoundInput, packetOf: (framed: FramedPrompt) => PromptPacket): number {
  const { answer, points } = input.assignedMaterialChars;
  if (!Number.isSafeInteger(input.completionTokenCeiling) || input.completionTokenCeiling < 1
    || !Number.isSafeInteger(answer) || answer < 1 || !Number.isSafeInteger(points) || points < 1) {
    throw new TypeError("ROOT_POSITION_BOUND_INPUT_INVALID");
  }
  const { pointsRaised, assumptions } = input.assignedMaterialChars;
  const validSize = (size: number | undefined): boolean => size === undefined || (Number.isSafeInteger(size) && size >= 1);
  if ((pointsRaised === undefined) !== (assumptions === undefined) || !validSize(pointsRaised) || !validSize(assumptions)) {
    throw new TypeError("ROOT_POSITION_BOUND_INPUT_INVALID");
  }
  const legs: readonly JudgeLeg[] = [
    Object.freeze({ kind: "primary-root" }),
    Object.freeze({ kind: "assigned-root", assignedAnswer: "\u0001".repeat(answer), mapPoints: "\u0001".repeat(points) })
  ];
  // Engine 2 (R3): the fixed-words leg, framed with the bound length guide (it is always lengthed), so root 0's room is
  // never below a real engine-2 position call (spec §10: never under-count). The sided points and the points raised
  // share one room (Ruling PF-R35.4 (a)): it is framed at both extreme splits (all of it sided, the raised list empty;
  // the sided list empty, all of it raised). Every character of the shared room frames at the same 7 bytes, so no split
  // in between frames longer; the larger of the two is kept with the rest.
  const fill = (chars: number): string => "\u0001".repeat(chars);
  const engineLeg = (sided: number, raised: number, assumed: number): JudgeLeg => Object.freeze({ kind: "assigned-root",
    assignedAnswer: fill(answer), mapPoints: fill(sided), engine: Object.freeze({ pointsRaised: fill(raised), assumptions: fill(assumed) }) });
  const engineLegs: readonly JudgeLeg[] = pointsRaised === undefined || assumptions === undefined ? []
    : [engineLeg(pointsRaised, 2, assumptions), engineLeg(2, pointsRaised, assumptions)];
  return Math.max(...[...legs, ...engineLegs].flatMap((leg) => (["unknown", "resolved"] as const).map((claim) => Buffer.byteLength(JSON.stringify({
    model: "",
    max_tokens: input.completionTokenCeiling,
    messages: packetOf(framedJudgePrompt(leg, input.questionLine, input.argumentLanguageName, claim, input.questionLanguage ?? null,
      leg.kind === "assigned-root" && leg.engine !== undefined ? (input.length ?? lengthGuideForBounds()) : (input.length ?? null))).messages
  }), "utf8"))));
}

/**
 * B9 (budget spec §2.10) — THE FIRST CALLS EACH PLAN CAN MAKE, one group per
 * plan. A run's makers are its plan's roster only (the API keeps each ask's
 * discovered panel to `PLAN_TIER_ROSTERS[planTier]`, apps/api/src/index.ts),
 * and the first call's cheaper-model try (B9c) moves only among the run's own
 * makers, so each plan is priced on its own models and every plan's cheapest
 * must fit. A plan takes part only when EVERY model on its roster has a priced
 * configured target: the API refuses every ask on a plan that misses one
 * (ASK_PLAN_TIER_MODEL_UNAVAILABLE), so its debates never reach a first call.
 * A target on no roster (an answer-only or support model) is in no group. The
 * rosters are the caller's, so this package knows no plan.
 */
export function firstCallsByPlanRoster<T extends Readonly<{ model: string }>>(input: Readonly<{
  projections: readonly T[];
  rosters: Readonly<Record<string, readonly string[]>>;
}>): readonly (readonly T[])[] {
  return Object.freeze(Object.values(input.rosters).flatMap((roster) => {
    const wholly = roster.length > 0
      && roster.every((model) => input.projections.some((call) => call.model === model));
    return wholly ? [Object.freeze(input.projections.filter((call) => roster.includes(call.model)))] : [];
  }));
}

/**
 * Model scorecard A13 (spec §2.1) — THE DEBATE JOB ONE AUTHORING LEG DOES.
 *
 * The T9 `role` stays `JUDGE` on every judgement call: it names the provider
 * identity, not the job. The scorecard grades JOBS, and before this field the
 * job could only be recovered by parsing `call_site_key`. A leg's kind decides
 * it, so the mapping lives next to the leg type and nowhere else.
 */
export function judgeLegModelRole(leg: JudgeLeg): DebateRole {
  switch (leg.kind) {
    case "primary-root":
    case "independent-root":
    case "assigned-root":
      return "POSITION";
    case "support":
    case "attack":
      return "SUPPORT_ATTACK";
    case "cross-root":
      return "CROSS_EXCHANGE";
    default:
      return exhaustive(leg);
  }
}

/** Length guidance (spec 2026-10-15 §3.2): which step's target a leg is told, as its job decides it (`judgeLegModelRole`). */
export function judgeLegLengthStep(leg: JudgeLeg): "opening" | "pros_cons" | "cross_exchange" {
  switch (leg.kind) {
    case "primary-root":
    case "independent-root":
    case "assigned-root":
      return "opening";
    case "support":
    case "attack":
      return "pros_cons";
    case "cross-root":
      return "cross_exchange";
    default:
      return exhaustive(leg);
  }
}

/**
 * R22 (owner ruling 2026-10-29, slip-recovery step 4): an author leg's reply refused after the gateway's whole repair
 * chain (code salvage, the patch follow-up, the full re-ask its allowance leaves). To every reader of the code it is
 * today's JUDGE_SCHEMA_FAILURE, with the same message and name; it also carries the gateway's refusal, so the runner can
 * give up a reply or a cross-exchange on it — naming the refused attempt's ledger row — instead of failing the debate.
 */
export class JudgeContentRefusedError extends TypedDomainError {
  constructor(readonly refusal: ProviderContentUnacceptedError) {
    super("JUDGE_SCHEMA_FAILURE", refusal.lastParseError);
  }
}

export class Judge {
  constructor(private readonly provider: ProviderGateway) {}

  async judge(input: JudgeInput): Promise<JudgedNode> {
    /**
     * FAIR-01 (DR-140(b)): one debate has ONE claim frame, and it is the
     * debate's own question. `claimClassificationLine` used to carry that when
     * the prompt line differed — it differed because the runner concatenated the
     * directive and the position INTO the prompt line. RUN1 removed the
     * concatenation, so `questionLine` IS the debate's question on every leg and
     * the override had no production caller left. It is deleted rather than kept
     * alive by tests: the property now rides the leg types, and
     * `tests/unit/judgement.test.ts` asserts it through them.
     */
    const classificationLine = input.questionLine;
    const codeClaim = classifyClaimText(classificationLine);
    const framed = framedJudgePrompt(
      input.leg,
      input.questionLine,
      input.argumentLanguageName,
      codeClaim.claimType === "unknown" ? "unknown" : "resolved",
      input.questionLanguage ?? null,
      input.length ?? null
    );
    const packet = framed.packet;
    // All-steps format robustness (2026-10-12): the tolerant reading, remembered so the accepted reply is read again
    // exactly as the classifier read it (the last repair depends on how the reply ended). Judge nested fields
    // (2026-10-12): the author legs alone also nest flattened members (NESTED_FIELDS); the re-read below uses the same
    // options, so the accepted content reads as the repaired object.
    const inQuestionLanguage = replyLanguageCheckFor(input.questionLine, input.questionLanguage, JUDGE_ARTIFACT_PROSE);
    const reading = rememberingAcceptedReply((content, reply) =>
      classifyStructuredArtifact(content, judgeArtifactSchema, reply, JUDGE_ARTIFACT_READING, inQuestionLanguage));
    let response;
    try {
      response = await this.provider.call({
        runId: input.runId,
        subjectItemId: input.subjectItemId,
        callSiteKey: input.callSiteKey,
        role: "JUDGE",
        lane: "served",
        modelRole: judgeLegModelRole(input.leg),
        bound: input.bound,
        contractHash: input.contractHash,
        providerRef: input.providerRef,
        packet,
        ...(input.length === undefined ? {} : { guidedWords: input.length.words }),
        buildRepairPacket: (rejected) => buildContentRepairPacket(framed, rejected),
        classifyContent: reading.classifyContent
      });
    } catch (error) {
      if (error instanceof ProviderContentUnacceptedError) throw new JudgeContentRefusedError(error);
      throw error;
    }
    const parsed = parseStructuredArtifact(response.content, judgeArtifactSchema, reading.acceptedAs(response.content).reply, JUDGE_ARTIFACT_READING);
    if (parsed.kind === "PARSE_FAILURE") throw new TypedDomainError("JUDGE_PARSE_FAILURE", parsed.message);
    if (parsed.kind === "SCHEMA_FAILURE") throw new TypedDomainError("JUDGE_SCHEMA_FAILURE", parsed.message);
    let normalizedClaim: NormalizedClaim;
    try {
      normalizedClaim = await resolveClaimType({
        text: classificationLine,
        classifyUnknown: async () => parsed.value.claim_type
      });
    } catch (error) {
      throw new TypedDomainError("JUDGE_SCHEMA_FAILURE", error instanceof Error ? error.message : String(error));
    }
    const claimedWayOfKnowing = parsed.value.way_of_knowing;
    const pinnedLookup = claimedWayOfKnowing === "LOOKED_UP" && parsed.value.locator !== null;
    const resolvedWayOfKnowing: WayOfKnowing = pinnedLookup ? "LOOKED_UP" : "REASONING";
    return {
      statement: parsed.value.statement,
      wayOfKnowing: resolvedWayOfKnowing,
      locator: pinnedLookup ? parsed.value.locator : null,
      // S2-3: normalization never absorbs a claim it overrode. The condition is
      // derived from the PROPERTY — resolved differs from claimed — not from
      // the one case that satisfies it today. The NODE is bound by the caller
      // once the graph has minted it (`bindWayOfKnowingDowngrade`).
      wayOfKnowingDowngrade: resolvedWayOfKnowing === claimedWayOfKnowing
        ? null
        : Object.freeze({ claimedWayOfKnowing, resolvedWayOfKnowing }),
      restatementText: parsed.value.restatement_text,
      restatementStatus: parsed.value.restatement_status,
      provenanceRef: response.rawArtifactRef,
      providerLedgerRef: response.ledgerEntryRef,
      valueLaden: parsed.value.value_laden,
      assessment: Object.freeze({
        steelman: parsed.value.steelman,
        critic: parsed.value.critic,
        evidence: parsed.value.evidence,
        context: parsed.value.context,
        fallacy: parsed.value.fallacy
      }),
      normalizedClaim,
      parseStrategy: parsed.strategy
    };
  }

  /**
   * S3-1 / S4-1 — the cross-maker review, which now ALSO measures every edge
   * the reviewed node sources. The measurement rides this existing visit: it
   * is the relational, never-the-author examination (argument against target),
   * so it is the impartial seat, and bundling it here costs zero extra calls.
   * Panel judging stays a separate call (`assess`).
   */
  async review(input: NodeReviewInput): Promise<ReviewedNode> {
    const schema = nodeReviewArtifactSchema(input.edges.length);
    const framed = buildFramedPrompt({
      contract: promptContractInArgumentLanguage(
        reviewPromptContract(input.edges.length, input.length !== undefined),
        input.argumentLanguageName,
        input.questionLanguage
      ),
      // The run's lock rides LAST (code-owned, never model or user text); without one, today's three fields.
      material: withQuestionLanguageField([
        { name: "question_line", content: input.questionLine },
        { name: "statement", content: input.statement },
        {
          name: "edges_sourced_by_this_node",
          content: JSON.stringify(input.edges.map((edge, ordinal) => ({
            ordinal,
            relation: edge.polarity,
            target_statement: edge.targetStatement
          })))
        },
        // Length guidance (spec 2026-10-15 §3.2): the variant's target, right before the lock.
        ...(input.length === undefined
          ? []
          : [lengthGuidanceField(input.length.words, input.length.languageCode, input.length.charactersPerWord)])
      ], input.questionLanguage)
    });
    const packet = framed.packet;
    // All-steps format robustness (2026-10-12): the tolerant reading, remembered so the accepted reply is read again
    // exactly as the classifier read it (the last repair depends on how the reply ended).
    // MiMo salvage (2026-10-12): the review's shape repairs (REVIEW_ARTIFACT_READING); the re-read below uses the same.
    // Reply language (2026-10-12): the accepted object's prose must be in the question's language.
    const inQuestionLanguage = replyLanguageCheckFor(input.questionLine, input.questionLanguage, NODE_REVIEW_PROSE);
    const reading = rememberingAcceptedReply((content, reply) =>
      classifyStructuredArtifact(content, schema, reply, REVIEW_ARTIFACT_READING, inQuestionLanguage));
    let response;
    try {
      response = await this.provider.call({
        runId: input.runId,
        subjectItemId: input.subjectItemId,
        callSiteKey: input.callSiteKey,
        role: "JUDGE",
        lane: "served",
        modelRole: "REVIEWER",
        bound: input.bound,
        contractHash: input.contractHash,
        providerRef: input.providerRef,
        packet,
        ...(input.length === undefined ? {} : { guidedWords: input.length.words }),
        buildRepairPacket: (rejected) => buildContentRepairPacket(framed, rejected),
        classifyContent: reading.classifyContent
      });
    } catch (error) {
      if (error instanceof ProviderContentUnacceptedError) {
        throw new TypedDomainError("NODE_REVIEW_SCHEMA_FAILURE", error.lastParseError);
      }
      throw error;
    }
    const parsed = parseStructuredArtifact(response.content, schema, reading.acceptedAs(response.content).reply, REVIEW_ARTIFACT_READING);
    if (parsed.kind === "PARSE_FAILURE") throw new TypedDomainError("NODE_REVIEW_PARSE_FAILURE", parsed.message);
    if (parsed.kind === "SCHEMA_FAILURE") throw new TypedDomainError("NODE_REVIEW_SCHEMA_FAILURE", parsed.message);
    const bearings = parsed.value.edge_bearings;
    return Object.freeze({
      outcome: parsed.value.outcome,
      reasons: Object.freeze([...parsed.value.reasons]),
      provenanceRef: response.rawArtifactRef,
      providerLedgerRef: response.ledgerEntryRef,
      parseStrategy: parsed.strategy,
      // The schema pinned the length; the guard makes a drop LOUD rather than
      // letting a missing entry pass as a cannot-assess.
      edgeMeasurements: Object.freeze(input.edges.map((edge, ordinal) => {
        const bearing = bearings[ordinal];
        if (bearing === undefined) {
          throw new TypedDomainError(
            "NODE_REVIEW_SCHEMA_FAILURE",
            `edge_bearings has no bearing for edge ordinal ${String(ordinal)}`
          );
        }
        return Object.freeze({ edgeId: edge.edgeId, bearing });
      }))
    });
  }

  /**
   * Engine 2 (spec §4.2b, E13): one investigation of a "cannot assess" point. It stands in for the review the point
   * lacked, so it is a REVIEWER call (`VERDICT:investigate:` reads as REVIEWER, at the `reviewer` thinking level) on the
   * served lane, under the engine seal. The request carries the framed answer form and `classifyContent`, so LG-A's
   * repair order and the salvage apply: the code fixer; on an unreadable reply, A1's code rescue, then one
   * structure-repair call, then B's short PATCH follow-up to the original AI (never a full re-ask); on a content
   * refusal, one follow-up (pre-flight PF-R2a8.14). A reply still refused after that is
   * POINT_INVESTIGATION_SCHEMA_FAILURE. No answer or vendor failure fails the debate (the runner reads it as
   * INVESTIGATION_UNAVAILABLE and goes on); a code defect does (a named TypeError, rethrown by the runner's rule).
   */
  async investigatePoint(input: PointInvestigationInput): Promise<InvestigatedPoint> {
    const framed = buildFramedPrompt({
      contract: promptContractInArgumentLanguage(POINT_INVESTIGATION_PROMPT_CONTRACT, input.argumentLanguageName, input.questionLanguage),
      material: withQuestionLanguageField(pointInvestigationMaterialFields(input.material, input.length), input.questionLanguage)
    });
    const inQuestionLanguage = replyLanguageCheckFor(input.material.question, input.questionLanguage, POINT_INVESTIGATION_PROSE);
    const reading = rememberingAcceptedReply((content, reply) => classifyStructuredArtifact(content, pointInvestigationReplySchema,
      reply, POINT_INVESTIGATION_READING, (value) => [...pointInvestigationContentIssues(value), ...inQuestionLanguage(value)]));
    let response;
    try {
      response = await this.provider.call({
        runId: input.runId,
        subjectItemId: input.subjectItemId,
        callSiteKey: input.callSiteKey,
        role: "JUDGE",
        lane: "served",
        modelRole: "REVIEWER",
        bound: input.bound,
        contractHash: input.contractHash,
        providerRef: input.providerRef,
        packet: framed.packet,
        guidedWords: input.length.words,
        buildRepairPacket: (rejected) => buildContentRepairPacket(framed, rejected),
        classifyContent: reading.classifyContent
      });
    } catch (error) {
      if (error instanceof ProviderContentUnacceptedError) {
        throw new TypedDomainError("POINT_INVESTIGATION_SCHEMA_FAILURE", error.lastParseError);
      }
      throw error;
    }
    const parsed = parseStructuredArtifact(response.content, pointInvestigationReplySchema,
      reading.acceptedAs(response.content).reply, POINT_INVESTIGATION_READING);
    if (parsed.kind === "PARSE_FAILURE") throw new TypedDomainError("POINT_INVESTIGATION_PARSE_FAILURE", parsed.message);
    if (parsed.kind === "SCHEMA_FAILURE") throw new TypedDomainError("POINT_INVESTIGATION_SCHEMA_FAILURE", parsed.message);
    return Object.freeze({
      reply: Object.freeze({ ...parsed.value }),
      provenanceRef: response.rawArtifactRef,
      providerLedgerRef: response.ledgerEntryRef,
      model: response.model,
      maker: response.maker,
      parseStrategy: parsed.strategy
    });
  }

  /**
   * S2-2 / T3 — one PANEL member's assessment of a node ANOTHER maker authored.
   *
   * This is deliberately NOT `review` (S4-1): the review call asks for a typed
   * agree/dispute OUTCOME on the node and belongs to the edge-measurement lane;
   * a panel member is asked for the same scored assessment the author produced
   * about itself, so the two are commensurable and `measureDispersion` compares
   * like with like. The member never restates or re-authors the statement.
   *
   * Every failure is raised as a typed `PanelMemberFailure` so `runJudgePanel`
   * records WHICH way the member fell over instead of collapsing the panel.
   */
  async assess(input: PanelAssessmentInput): Promise<PanelAssessment> {
    const framed = buildFramedPrompt({
      contract: promptContractInArgumentLanguage(
        input.length === undefined ? PANEL_PROMPT_CONTRACT : PANEL_LENGTH_PROMPT_CONTRACT,
        input.argumentLanguageName,
        input.questionLanguage
      ),
      // The run's lock rides LAST (code-owned, never model or user text); without one, today's two fields.
      material: withQuestionLanguageField([
        { name: "question_line", content: input.questionLine },
        { name: "statement", content: input.statement },
        // Length guidance (spec 2026-10-15 §3.2): the variant's target, right before the lock.
        ...(input.length === undefined
          ? []
          : [lengthGuidanceField(input.length.words, input.length.languageCode, input.length.charactersPerWord)])
      ], input.questionLanguage)
    });
    const packet = framed.packet;
    // All-steps format robustness (2026-10-12): the tolerant reading, remembered so the accepted reply is read again
    // exactly as the classifier read it (the last repair depends on how the reply ended).
    // Judge nested fields (2026-10-12): the panel reads its assessment as the author legs do (NESTED_FIELDS), and the
    // re-read below uses the same options.
    const inQuestionLanguage = replyLanguageCheckFor(input.questionLine, input.questionLanguage, JUDGE_ASSESSMENT_PROSE);
    const reading = rememberingAcceptedReply((content, reply) =>
      classifyStructuredArtifact(content, judgeAssessmentSchema, reply, JUDGE_ARTIFACT_READING, inQuestionLanguage));
    let response;
    try {
      response = await this.provider.call({
        runId: input.runId,
        subjectItemId: input.subjectItemId,
        callSiteKey: input.callSiteKey,
        role: "JUDGE",
        lane: "served",
        modelRole: "JUDGE",
        bound: input.bound,
        contractHash: input.contractHash,
        providerRef: input.providerRef,
        packet,
        ...(input.length === undefined ? {} : { guidedWords: input.length.words }),
        buildRepairPacket: (rejected) => buildContentRepairPacket(framed, rejected),
        classifyContent: reading.classifyContent
      });
    } catch (error) {
      if (error instanceof ProviderContentUnacceptedError) {
        throw new PanelMemberFailure(
          error.lastParseStatus === "PARSE_FAILED" ? "PARSE_FAILURE" : "SCHEMA_FAILURE",
          error.lastParseError
        );
      }
      if (error instanceof ProviderCallFailedError) {
        throw new PanelMemberFailure(
          error.lastOutcome === "TIMED_OUT" ? "TIMEOUT" : "PROVIDER_ERROR",
          `${error.code}:${error.lastOutcome}`,
          { cause: error }
        );
      }
      // V-28: a run-level spend stop is the RUN's, not this member's. Rewriting
      // it as PROVIDER_ERROR misattributed a money ceiling as a transport fault
      // AND let the panel continue to the next member, which is another billed
      // call. It leaves exactly as it arrived. Task M2: the attempt ceiling is
      // one of them now, so it is no longer reported as a vendor error either.
      if (isRunLevelSpendStop(error)) throw error;
      throw new PanelMemberFailure(
        "PROVIDER_ERROR",
        error instanceof Error ? error.message : String(error),
        { cause: error }
      );
    }
    const parsed = parseStructuredArtifact(response.content, judgeAssessmentSchema, reading.acceptedAs(response.content).reply, JUDGE_ARTIFACT_READING);
    if (parsed.kind === "PARSE_FAILURE") throw new PanelMemberFailure("PARSE_FAILURE", parsed.message);
    if (parsed.kind === "SCHEMA_FAILURE") throw new PanelMemberFailure("SCHEMA_FAILURE", parsed.message);
    return Object.freeze({
      judgementRef: response.rawArtifactRef,
      assessment: Object.freeze(parsed.value),
      providerLedgerRef: response.ledgerEntryRef,
      parseStrategy: parsed.strategy
    });
  }
}

export interface RecordNodeReviewInput {
  readonly runId: string;
  readonly nodeId: string;
  readonly authorRawArtifactRef: string;
  readonly reviewRawArtifactRef: string;
  readonly outcome: ReviewOutcome;
  readonly reasons: readonly string[];
}

export interface RecordJudgementInput {
  readonly runId: string;
  readonly nodeId: string;
  readonly rawArtifactRef: string;
  readonly tau: number;
  readonly numberKind: string;
  readonly producer: string;
  readonly wayOfKnowing: WayOfKnowing;
}

export interface RecordReducedJudgementInput extends RecordJudgementInput {
  readonly uncertaintyLadderPosition: string;
  readonly uncertaintyDrivers: readonly unknown[];
  readonly scoreCaps: readonly unknown[];
  readonly holes: readonly unknown[];
  readonly branchIdentifier: string;
  readonly reducerVersion: string;
  readonly judgeWeightVersion: string;
  readonly selectedJudgementRef: string;
  readonly dispersion: number | null;
  readonly panelContractHashes: readonly string[];
  readonly disagreement: Readonly<Record<string, unknown>>;
}

/** A node review whose content is encrypted and ready for ONE INSERT. */
export interface PreparedNodeReview {
  readonly nodeReviewId: string;
  readonly runId: string;
  readonly nodeId: string;
  readonly authorRawArtifactRef: string;
  readonly reviewRawArtifactRef: string;
  readonly outcome: ReviewOutcome;
  readonly reasons: string;
  readonly contentCiphertext: string | null;
  readonly contentAttestation: Buffer | null;
}

/**
 * T5 r3 — the review INSERT, scoped to a CALLER'S transaction.
 *
 * `ledger.node_review` is append-only, refuses UPDATE and DELETE, and carries
 * `UNIQUE (node_id)`; `readUnreviewedNodes` filters reviewed nodes out. So a
 * review that commits alone is irreversible AND removes the node from every
 * future work set. If the bearings that came back on the same call are written
 * in a later transaction and that transaction fails, the measurement is lost
 * permanently — no retry and no catch-up can reach it. The composition root
 * therefore runs this INSERT and those magnitudes in one transaction, which is
 * why this is exported client-scoped.
 */
export async function insertPreparedNodeReview(
  client: PoolClient,
  prepared: PreparedNodeReview
): Promise<string> {
  const result = await client.query<{ node_review_id: string }>(
    `INSERT INTO ledger.node_review (
      node_review_id, run_id, node_id, author_raw_artifact_ref,
      review_raw_artifact_ref, outcome, reasons, at_seq, content_ciphertext,content_attestation
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10) RETURNING node_review_id`,
    [prepared.nodeReviewId, prepared.runId, prepared.nodeId, prepared.authorRawArtifactRef,
      prepared.reviewRawArtifactRef, prepared.outcome, prepared.reasons,
      await allocateSequence(client), prepared.contentCiphertext, prepared.contentAttestation]
  );
  return result.rows[0]!.node_review_id;
}

/** The producer-grading bulkhead surfaces as a typed error, not a raw message. */
export function translateNodeReviewFailure(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("PRODUCER_GRADING_FORBIDDEN:")
    ? new TypedDomainError("PRODUCER_GRADING_FORBIDDEN", message)
    : error;
}

export interface UnreviewedNode {
  readonly nodeId: string;
  readonly statement: string;
  readonly authorMaker: string;
  readonly authorRawArtifactRef: string;
  /**
   * T5 / S3-1 — the edges this node sources that are still UNMEASURED, so a
   * catch-up review can measure them on its own single visit. MEASURED edges
   * are excluded here rather than at the call site: 0052's one-way ratchet
   * refuses a second write, so offering one would ask for a number that
   * nothing could record.
   */
  readonly sourcedEdges: readonly {
    readonly edgeId: string;
    readonly targetStatement: string;
    readonly polarity: "support" | "attack";
  }[];
}

export class JudgementRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: RecordJudgementInput): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const reducedJudgementId = randomUUID();
      const result = await client.query<{ reduced_judgement_id: string }>(
        `INSERT INTO ledger.reduced_judgement (
          reduced_judgement_id, run_id, node_id, raw_artifact_ref, tau,
          number_kind, source_ref, producer, replay_handle, way_of_knowing, at_seq
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING reduced_judgement_id`,
        [reducedJudgementId, input.runId, input.nodeId, input.rawArtifactRef, input.tau,
          input.numberKind, input.rawArtifactRef, input.producer, `judgement:${reducedJudgementId}`,
          input.wayOfKnowing, await allocateSequence(client)]
      );
      return result.rows[0]!.reduced_judgement_id;
    });
  }

  async recordReduced(input: RecordReducedJudgementInput): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const reducedJudgementId = randomUUID();
      const result = await client.query<{ reduced_judgement_id: string }>(
        `INSERT INTO ledger.reduced_judgement (
          reduced_judgement_id, run_id, node_id, raw_artifact_ref, tau,
          number_kind, source_ref, producer, replay_handle, way_of_knowing, at_seq,
          uncertainty_ladder_position, uncertainty_drivers, score_caps, holes,
          branch_identifier, reducer_version, judge_weight_version,
          selected_judgement_ref, dispersion, panel_contract_hashes, disagreement
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,
          $16,$17,$18,$19,$20,$21::jsonb,$22::jsonb
        ) RETURNING reduced_judgement_id`,
        [
          reducedJudgementId, input.runId, input.nodeId, input.rawArtifactRef, input.tau,
          input.numberKind, input.rawArtifactRef, input.producer, `judgement:${reducedJudgementId}`,
          input.wayOfKnowing, await allocateSequence(client), input.uncertaintyLadderPosition,
          JSON.stringify(input.uncertaintyDrivers), JSON.stringify(input.scoreCaps), JSON.stringify(input.holes),
          input.branchIdentifier, input.reducerVersion, input.judgeWeightVersion,
          input.selectedJudgementRef, input.dispersion, JSON.stringify(input.panelContractHashes),
          JSON.stringify(input.disagreement)
        ]
      );
      return result.rows[0]!.reduced_judgement_id;
    });
  }

  /**
   * T5 r4 — there is deliberately NO self-transacting review writer on this
   * repository. A review that commits on its own is irreversible
   * (`ledger.node_review` is append-only and node-unique) and removes the node
   * from every future work set, so a later failure to write the bearings that
   * same review returned strands them beyond any repair.
   *
   * Every caller therefore prepares here — encryption still happens before any
   * transaction opens — and inserts through `insertPreparedNodeReview` on a
   * transaction the CALLER owns, so the review and its magnitudes can be one
   * commit. The composition root's `recordReviewWithMeasurements` is the only
   * path that does this for a node's own edges.
   */
  async prepareNodeReview(input: RecordNodeReviewInput): Promise<PreparedNodeReview> {
    const nodeReviewId = randomUUID();
    const content = await encryptAttestedContentForRun(
      this.pool, input.runId, "ledger.node_review", nodeReviewId,
      { reasons: input.reasons }
    );
    return Object.freeze({
      nodeReviewId,
      runId: input.runId,
      nodeId: input.nodeId,
      authorRawArtifactRef: input.authorRawArtifactRef,
      reviewRawArtifactRef: input.reviewRawArtifactRef,
      outcome: input.outcome,
      reasons: JSON.stringify(content === null ? input.reasons : [CONTENT_CIPHERTEXT_SENTINEL]),
      contentCiphertext: content === null ? null : JSON.stringify(content.envelope),
      contentAttestation: content?.attestation ?? null
    });
  }

  /**
   * Reclaim resume (spec 2026-10-14, migration 0119): every read of the run's reviews and judgements here counts only
   * the nodes of the live copy. A copy that took the run over sets the dead copy's nodes aside (generation_status
   * 'stale') and writes its own, so a stale node's review or judgement is the dead copy's and must not steer this one.
   */
  async readLatestReviewerMaker(runId: string, authorMaker: string): Promise<string | null> {
    const result = await this.pool.query<{ reviewer_maker: string }>(
      `SELECT reviewer.maker AS reviewer_maker
       FROM ledger.node_review AS review
       JOIN ledger.raw_artifact AS author
         ON author.raw_artifact_id = review.author_raw_artifact_ref
       JOIN ledger.raw_artifact AS reviewer
         ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
       JOIN core.node AS node
         ON node.node_id = review.node_id AND node.generation_status <> 'stale'
       WHERE review.run_id=$1 AND author.maker=$2
       ORDER BY review.at_seq DESC
       LIMIT 1`,
      [runId, authorMaker]
    );
    return result.rows[0]?.reviewer_maker ?? null;
  }

  /**
   * DR-184: ledger.node_review is the authoritative judged-basis source.
   *
   * T6 / S4-2 — and only a review that REACHED a judgement seeds that basis.
   * `cannot-assess` is the reviewer saying, in the closed outcome vocabulary,
   * that the material did not support an honest judgement; counting it as a
   * judged basis gave a node the standing of a judgement nobody made. `agree`
   * and `dispute` are both judgements — they disagree about the claim, not
   * about whether it could be judged — so both still seed.
   *
   * The predicate is a positive enumeration, matching the second consumer of
   * this vocabulary (packages/evaluator/src/index.ts:2476-2480, which maps
   * agree/dispute to numbers and everything else to no signal). Today the
   * migration's CHECK pins the vocabulary to exactly three values
   * (migrations/0019_xrev01_node_review.sql:8), so this is set-equal to
   * excluding `cannot-assess`; stated positively, an outcome nobody has
   * reasoned about cannot silently acquire standing. Nothing here renames or
   * re-spells the vocabulary itself.
   *
   * This does NOT put the node back into any work set: `readUnreviewedNodes`
   * below stays outcome-blind on purpose, because `UNIQUE (node_id)` plus the
   * append-only triggers mean a second review of this node can never be
   * written. The node is unjudged AND unreviewable — which is precisely the
   * class-H condition, not a repairable gap.
   */
  async readReviewedNodeIds(runId: string): Promise<readonly string[]> {
    const result = await this.pool.query<{ node_id: string }>(
      `SELECT review.node_id::text
       FROM ledger.node_review AS review
       JOIN core.node AS node ON node.node_id=review.node_id AND node.generation_status <> 'stale'
       WHERE review.run_id=$1 AND review.outcome IN ('agree', 'dispute')
       ORDER BY review.at_seq`,
      [runId]
    );
    return Object.freeze(result.rows.map((row) => row.node_id));
  }

  /**
   * T6 / S4-2 — the nodes whose cross-maker review came back `dispute`.
   *
   * The composition root feeds this into `applyDeclaredDisagreement`: a review
   * that disputed the node is a declared disagreement about the debate's
   * content, and the certainty band steps down through the sealed mapping. It
   * is deliberately a separate read from `readReviewedNodeIds` — a disputed
   * node still HAS a judged basis (it was judged, and judged against), so the
   * two questions must not be answered by one query.
   */
  async readDisputedNodeIds(runId: string): Promise<readonly string[]> {
    const result = await this.pool.query<{ node_id: string }>(
      `SELECT review.node_id::text
       FROM ledger.node_review AS review
       JOIN core.node AS node ON node.node_id=review.node_id AND node.generation_status <> 'stale'
       WHERE review.run_id=$1 AND review.outcome = 'dispute'
       ORDER BY review.at_seq`,
      [runId]
    );
    return Object.freeze(result.rows.map((row) => row.node_id));
  }

  /**
   * Engine 2 (spec 2026-10-15 §4.2a rule 3, ruling E6(3)) — the nodes whose cross-maker review came back
   * `cannot-assess`. Engine 1 gives them no judged basis (`readReviewedNodeIds` leaves them out on purpose); engine 2
   * keeps them in the graph at a reduced weight and discloses them, so it must name them. A separate read for the
   * reason `readDisputedNodeIds` is one: each question gets its own positive predicate.
   */
  async readCannotAssessNodeIds(runId: string): Promise<readonly string[]> {
    const result = await this.pool.query<{ node_id: string }>(
      `SELECT review.node_id::text
       FROM ledger.node_review AS review
       JOIN core.node AS node ON node.node_id=review.node_id AND node.generation_status <> 'stale'
       WHERE review.run_id=$1 AND review.outcome = 'cannot-assess'
       ORDER BY review.at_seq`,
      [runId]
    );
    return Object.freeze(result.rows.map((row) => row.node_id));
  }

  /** DR-184 catch-up work is recomputed from append-only ground truth. */
  async readUnreviewedNodes(runId: string): Promise<readonly UnreviewedNode[]> {
    return withRunContentLease(this.pool, [runId], async () => {
      const result = await this.pool.query<{
      node_id: string;
      claim_text: string;
      content_ciphertext: CryptoEnvelope | null;
      maker: string;
      raw_artifact_id: string;
    }>(
      `SELECT node.node_id::text, node.claim_text, node.content_ciphertext, artifact.maker,
              artifact.raw_artifact_id::text
       FROM core.node AS node
       JOIN ledger.reduced_judgement AS judgement ON judgement.node_id=node.node_id
       JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id=judgement.raw_artifact_ref
       LEFT JOIN ledger.node_review AS review ON review.node_id=node.node_id
       WHERE node.run_id=$1 AND node.generation_status <> 'stale'
         AND review.node_id IS NULL
       ORDER BY node.created_at_seq, node.node_id`,
      [runId]
    );
      // T5 / S3-1: the still-unmeasured edges each of those nodes sources, with
      // the target's own statement so the reviewer can judge the relation.
      const edgeResult = await this.pool.query<{
        edge_id: string;
        source_node_id: string;
        polarity: "support" | "attack";
        target_node_id: string;
        target_claim_text: string;
        target_content_ciphertext: CryptoEnvelope | null;
      }>(
        `SELECT edge.edge_id::text, edge.source_node_id::text, edge.polarity,
                edge.target_node_id::text, target.claim_text AS target_claim_text,
                target.content_ciphertext AS target_content_ciphertext
           FROM core.edge AS edge
           JOIN core.node AS target
             ON target.run_id=edge.run_id AND target.node_id=edge.target_node_id
          WHERE edge.run_id=$1 AND edge.target_kind='NODE'
            AND edge.magnitude_status='UNKNOWN'
            AND edge.source_node_id = ANY($2::uuid[])
          ORDER BY edge.created_at_seq`,
        [runId, result.rows.map((row) => row.node_id)]
      );
      const edgesBySource = new Map<string, {
        readonly edgeId: string; readonly targetStatement: string; readonly polarity: "support" | "attack";
      }[]>();
      for (const edge of edgeResult.rows) {
        const target = await decryptContentForRun<{ claimText: string }>(
          this.pool, runId, "core.node", edge.target_node_id, edge.target_content_ciphertext,
          { claimText: edge.target_claim_text }
        );
        const bucket = edgesBySource.get(edge.source_node_id) ?? [];
        bucket.push({ edgeId: edge.edge_id, targetStatement: target.claimText, polarity: edge.polarity });
        edgesBySource.set(edge.source_node_id, bucket);
      }
      return Object.freeze(await Promise.all(result.rows.map(async (row) => {
        const content = await decryptContentForRun<{ claimText: string }>(
          this.pool, runId, "core.node", row.node_id, row.content_ciphertext,
          { claimText: row.claim_text }
        );
        return Object.freeze({
          nodeId: row.node_id,
          statement: content.claimText,
          authorMaker: row.maker,
          authorRawArtifactRef: row.raw_artifact_id,
          sourcedEdges: Object.freeze(edgesBySource.get(row.node_id) ?? [])
        });
      })));
    });
  }

  async readJudgementLineage(runId: string): Promise<Readonly<Record<string, {
    readonly reducedJudgementRef: string;
    readonly provenanceRef: string;
    readonly wayOfKnowing: WayOfKnowing;
  }>>> {
    const result = await this.pool.query<{
      node_id: string;
      reduced_judgement_id: string;
      raw_artifact_ref: string;
      way_of_knowing: WayOfKnowing;
    }>(
      `SELECT DISTINCT ON (judgement.node_id) judgement.node_id::text,
              judgement.reduced_judgement_id::text, judgement.raw_artifact_ref::text,
              judgement.way_of_knowing
       FROM ledger.reduced_judgement AS judgement
       JOIN core.node AS node ON node.node_id=judgement.node_id AND node.generation_status <> 'stale'
       WHERE judgement.run_id=$1
       ORDER BY judgement.node_id, judgement.at_seq DESC`,
      [runId]
    );
    return Object.freeze(Object.fromEntries(result.rows.map((row) => [row.node_id, Object.freeze({
      reducedJudgementRef: row.reduced_judgement_id,
      provenanceRef: row.raw_artifact_ref,
      wayOfKnowing: row.way_of_knowing
    })])));
  }
}
