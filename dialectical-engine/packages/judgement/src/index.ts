import { z } from "zod";
import { randomUUID } from "node:crypto";
import { CLAIM_TYPES, REVIEW_OUTCOMES, TypedDomainError, type ReviewOutcome, type WayOfKnowing } from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  buildFramedPrompt,
  buildFramedRepairPrompt,
  schemaFailureLocator,
  type CallBound,
  type FramedPrompt,
  type ProviderGateway
} from "@debateai/providers";
import {
  JUDGE_WAYS_OF_KNOWING,
  JUDGE_LEG_MATERIAL_FIELDS,
  PANEL_PROMPT_CONTRACT,
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
  judgeAssessmentSchema,
  parseStructuredArtifact,
  resolveClaimType,
  type JudgeAssessment,
  type NormalizedClaim
} from "./s04.js";

export * from "./s04.js";
export * from "./prompts.js";

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

const judgeArtifactSchema = z.object({
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
 * T5 / S3-1 — the review artifact carries the edge measurements.
 *
 * `edge_bearings` is positional and its length is pinned to the number of edges
 * the caller supplied, so ONE call is structurally obliged to measure ALL of
 * the reviewed node's edges: a short array is a schema failure, not a partial
 * result that a second call could top up. `null` is the per-edge
 * cannot-assess, which leaves that edge UNKNOWN.
 */
function nodeReviewArtifactSchema(edgeCount: number) {
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
  | { readonly kind: "support" | "attack"; readonly positionUnderDebate: string }
  | {
      readonly kind: "cross-root";
      readonly ownPosition: string;
      readonly otherMakersPosition: string;
    };

export interface JudgeInput {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  /** THE QUESTION ALONE. Never a directive, never another model's statement. */
  readonly questionLine: string;
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
  readonly parseStrategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED";
}

export interface JudgeSubjectInput {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  readonly questionLine: string;
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
  readonly parseStrategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED";
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
  readonly parseStrategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED";
  /** One entry per supplied edge, in the order supplied (S3-1). */
  readonly edgeMeasurements: readonly ReviewedEdgeMeasurement[];
}

/**
 * The closed material table, applied. A leg's fields are fixed by
 * `JUDGE_LEG_MATERIAL_FIELDS`, and this function is the only place that fills
 * them — so a new field cannot reach a model without appearing in that table.
 */
function judgeLegMaterial(
  leg: JudgeLeg,
  questionLine: string
): readonly { readonly name: string; readonly content: string }[] {
  const fields = leg.kind === "cross-root"
    ? [
        { name: "question_line", content: questionLine },
        { name: "own_position", content: leg.ownPosition },
        { name: "other_makers_position", content: leg.otherMakersPosition }
      ]
    : leg.kind === "support" || leg.kind === "attack"
      ? [
          { name: "question_line", content: questionLine },
          { name: "position_under_debate", content: leg.positionUnderDebate }
        ]
      : [{ name: "question_line", content: questionLine }];
  const declared = JUDGE_LEG_MATERIAL_FIELDS[leg.kind as JudgeLegKind];
  if (fields.length !== declared.length || fields.some((field, index) => field.name !== declared[index])) {
    throw new TypedDomainError(
      "JUDGE_LEG_MATERIAL_UNDECLARED",
      `Leg ${leg.kind} may send exactly ${declared.join(",")}`
    );
  }
  return Object.freeze(fields);
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
    const framed = buildFramedPrompt({
      contract: judgePromptContract(input.leg.kind, codeClaim.claimType === "unknown" ? "unknown" : "resolved"),
      material: judgeLegMaterial(input.leg, input.questionLine)
    });
    const packet = framed.packet;
    let response;
    try {
      response = await this.provider.call({
        runId: input.runId,
        subjectItemId: input.subjectItemId,
        callSiteKey: input.callSiteKey,
        role: "JUDGE",
        lane: "served",
        bound: input.bound,
        contractHash: input.contractHash,
        providerRef: input.providerRef,
        packet,
        buildRepairPacket: (rejected) => buildContentRepairPacket(framed, rejected),
        classifyContent: (content) => {
          const outcome = parseStructuredArtifact(content, judgeArtifactSchema);
          if (outcome.kind === "PARSED") return { parseStatus: "PARSED", parseError: null };
          return {
            parseStatus: outcome.kind === "PARSE_FAILURE" ? "PARSE_FAILED" : "SCHEMA_FAILED",
            parseError: outcome.message
          };
        }
      });
    } catch (error) {
      if (error instanceof ProviderContentUnacceptedError) {
        throw new TypedDomainError("JUDGE_SCHEMA_FAILURE", error.lastParseError);
      }
      throw error;
    }
    const parsed = parseStructuredArtifact(response.content, judgeArtifactSchema);
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
      contract: reviewPromptContract(input.edges.length),
      material: [
        { name: "question_line", content: input.questionLine },
        { name: "statement", content: input.statement },
        {
          name: "edges_sourced_by_this_node",
          content: JSON.stringify(input.edges.map((edge, ordinal) => ({
            ordinal,
            relation: edge.polarity,
            target_statement: edge.targetStatement
          })))
        }
      ]
    });
    const packet = framed.packet;
    let response;
    try {
      response = await this.provider.call({
        runId: input.runId,
        subjectItemId: input.subjectItemId,
        callSiteKey: input.callSiteKey,
        role: "JUDGE",
        lane: "served",
        bound: input.bound,
        contractHash: input.contractHash,
        providerRef: input.providerRef,
        packet,
        buildRepairPacket: (rejected) => buildContentRepairPacket(framed, rejected),
        classifyContent: (content) => {
          const outcome = parseStructuredArtifact(content, schema);
          if (outcome.kind === "PARSED") return { parseStatus: "PARSED", parseError: null };
          return {
            parseStatus: outcome.kind === "PARSE_FAILURE" ? "PARSE_FAILED" : "SCHEMA_FAILED",
            parseError: outcome.message
          };
        }
      });
    } catch (error) {
      if (error instanceof ProviderContentUnacceptedError) {
        throw new TypedDomainError("NODE_REVIEW_SCHEMA_FAILURE", error.lastParseError);
      }
      throw error;
    }
    const parsed = parseStructuredArtifact(response.content, schema);
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
      contract: PANEL_PROMPT_CONTRACT,
      material: [
        { name: "question_line", content: input.questionLine },
        { name: "statement", content: input.statement }
      ]
    });
    const packet = framed.packet;
    let response;
    try {
      response = await this.provider.call({
        runId: input.runId,
        subjectItemId: input.subjectItemId,
        callSiteKey: input.callSiteKey,
        role: "JUDGE",
        lane: "served",
        bound: input.bound,
        contractHash: input.contractHash,
        providerRef: input.providerRef,
        packet,
        buildRepairPacket: (rejected) => buildContentRepairPacket(framed, rejected),
        classifyContent: (content) => {
          const outcome = parseStructuredArtifact(content, judgeAssessmentSchema);
          if (outcome.kind === "PARSED") return { parseStatus: "PARSED", parseError: null };
          return {
            parseStatus: outcome.kind === "PARSE_FAILURE" ? "PARSE_FAILED" : "SCHEMA_FAILED",
            parseError: outcome.message
          };
        }
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
          `${error.code}:${error.lastOutcome}`
        );
      }
      throw new PanelMemberFailure("PROVIDER_ERROR", error instanceof Error ? error.message : String(error));
    }
    const parsed = parseStructuredArtifact(response.content, judgeAssessmentSchema);
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

  async readLatestReviewerMaker(runId: string, authorMaker: string): Promise<string | null> {
    const result = await this.pool.query<{ reviewer_maker: string }>(
      `SELECT reviewer.maker AS reviewer_maker
       FROM ledger.node_review AS review
       JOIN ledger.raw_artifact AS author
         ON author.raw_artifact_id = review.author_raw_artifact_ref
       JOIN ledger.raw_artifact AS reviewer
         ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
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
      `SELECT node_id::text
       FROM ledger.node_review
       WHERE run_id=$1 AND outcome IN ('agree', 'dispute')
       ORDER BY at_seq`,
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
      `SELECT node_id::text
       FROM ledger.node_review
       WHERE run_id=$1 AND outcome = 'dispute'
       ORDER BY at_seq`,
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
