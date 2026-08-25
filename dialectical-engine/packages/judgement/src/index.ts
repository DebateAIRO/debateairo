import { z } from "zod";
import { randomUUID } from "node:crypto";
import { CLAIM_TYPES, REVIEW_OUTCOMES, TypedDomainError, type ReviewOutcome, type WayOfKnowing } from "@debateai/kernel";
import { ProviderContentUnacceptedError, type CallBound, type PromptPacket, type ProviderGateway } from "@debateai/providers";
import type { Pool } from "pg";
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
  classifyClaimText,
  judgeAssessmentSchema,
  parseStructuredArtifact,
  resolveClaimType,
  type JudgeAssessment,
  type NormalizedClaim
} from "./s04.js";

export * from "./s04.js";

const judgeArtifactSchema = z.object({
  statement: z.string().trim().min(1),
  way_of_knowing: z.enum(["LOOKED_UP", "RAN", "REASONING"]),
  locator: z.string().trim().min(1).nullable(),
  restatement_text: z.string().trim().min(1),
  restatement_status: z.enum(["PASS", "FAIL", "NOT_SAMPLED"]),
  value_laden: z.boolean(),
  claim_type: z.enum(CLAIM_TYPES).optional(),
  ...judgeAssessmentSchema.shape
}).strict();

const nodeReviewArtifactSchema = z.object({
  outcome: z.enum(REVIEW_OUTCOMES),
  reasons: z.array(z.string().trim().min(1)).min(1)
}).strict();

function buildContentRepairPacket(packet: PromptPacket, parseError: string): PromptPacket {
  return {
    messages: [...packet.messages, {
      role: "user",
      content: `The previous response violated the declared JSON contract. Machine parse error: ${parseError}\nReturn a new response that follows the system schema exactly.`
    }]
  };
}

export interface JudgeInput {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  readonly questionLine: string;
  /**
   * FAIR-01 (DR-140(b)): the text the code-first claim classifier runs on when
   * it differs from the prompt line. One debate has ONE claim frame — the
   * counter-position judgement is classified on the debate's own question
   * line, not on the wording of the position it embeds. Defaults to
   * questionLine, which keeps the position-side behavior byte-identical.
   */
  readonly claimClassificationLine?: string;
  readonly providerRef: string;
  readonly contractHash: string;
  readonly bound: CallBound;
}

export interface JudgedNode {
  readonly statement: string;
  readonly wayOfKnowing: WayOfKnowing;
  readonly locator: string | null;
  readonly restatementText: string;
  readonly restatementStatus: "PASS" | "FAIL" | "NOT_SAMPLED";
  readonly provenanceRef: string;
  readonly providerLedgerRef: string;
  readonly valueLaden: boolean;
  readonly assessment: JudgeAssessment;
  readonly normalizedClaim: NormalizedClaim;
  readonly parseStrategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED";
}

export interface NodeReviewInput {
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

export interface ReviewedNode {
  readonly outcome: ReviewOutcome;
  readonly reasons: readonly string[];
  readonly provenanceRef: string;
  readonly providerLedgerRef: string;
  readonly parseStrategy: "RAW" | "ONE_FENCE" | "BRACE_BALANCED";
}

export class Judge {
  constructor(private readonly provider: ProviderGateway) {}

  async judge(input: JudgeInput): Promise<JudgedNode> {
    const classificationLine = input.claimClassificationLine ?? input.questionLine;
    const codeClaim = classifyClaimText(classificationLine);
    const packet: PromptPacket = {
      messages: [
        {
          role: "system",
          content: `Return only one JSON object with exactly the following schema and no additional keys. Arrays may be empty, but every string must be non-empty:
{
  "statement": non-empty string,
  "way_of_knowing": "LOOKED_UP" | "RAN" | "REASONING",
  "locator": non-empty string | null,
  "restatement_text": non-empty string,
  "restatement_status": "PASS" | "FAIL" | "NOT_SAMPLED",
  "value_laden": boolean,
  optional "claim_type": "empirical" | "causal" | "normative" | "definitional" | "prediction" | "comparative" | "mixed" | "unknown",
  "steelman": { "summary": non-empty string, "fidelity": number [0,1] },
  "critic": { "summary": non-empty string, "counterargumentStrength": number [0,1], "basis": "REAL_ATTACK" | "PLAUSIBLE_COUNTER" },
  "evidence": { "quality": number [0,1], "relevance": number [0,1] },
  "context": { "fit": number [0,1], "ambiguityFlags": non-empty string[] },
  "fallacy": { "severity": number [0,1], "fatalFlags": [{ "type": non-empty string, "severity": number [0,1], "description": non-empty string }] }
}
Never invent evidence, citations, or sources. Score relevance against the question asked. Use REAL_ATTACK only for a supplied attack; otherwise use PLAUSIBLE_COUNTER and say so. LOOKED_UP requires a resolving locator.${codeClaim.claimType === "unknown" ? " The code classifier returned unknown; include claim_type from the declared closed vocabulary." : " Omit claim_type; the code-first classifier already resolved it."}`
        },
        { role: "user", content: input.questionLine }
      ]
    };
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
        buildRepairPacket: ({ parseError }) => buildContentRepairPacket(packet, parseError),
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
    const pinnedLookup = parsed.value.way_of_knowing === "LOOKED_UP" && parsed.value.locator !== null;
    return {
      statement: parsed.value.statement,
      wayOfKnowing: pinnedLookup ? "LOOKED_UP" : "REASONING",
      locator: pinnedLookup ? parsed.value.locator : null,
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

  async review(input: NodeReviewInput): Promise<ReviewedNode> {
    const packet: PromptPacket = {
      messages: [
        {
          role: "system",
          content: `Review an existing debate node authored by a different maker. Return only one JSON object with exactly this schema and no additional keys:\n{\n  "outcome": "agree" | "dispute" | "cannot-assess",\n  "reasons": [non-empty string, ...]\n}\nUse cannot-assess when the supplied material does not support an honest judgement. Never invent evidence, citations, or sources.`
        },
        {
          role: "user",
          content: [
            `Question under debate: ${input.questionLine}`,
            `Node author maker: ${input.authorMaker}`,
            `Node to review: ${input.statement}`
          ].join("\n")
        }
      ]
    };
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
        buildRepairPacket: ({ parseError }) => buildContentRepairPacket(packet, parseError),
        classifyContent: (content) => {
          const outcome = parseStructuredArtifact(content, nodeReviewArtifactSchema);
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
    const parsed = parseStructuredArtifact(response.content, nodeReviewArtifactSchema);
    if (parsed.kind === "PARSE_FAILURE") throw new TypedDomainError("NODE_REVIEW_PARSE_FAILURE", parsed.message);
    if (parsed.kind === "SCHEMA_FAILURE") throw new TypedDomainError("NODE_REVIEW_SCHEMA_FAILURE", parsed.message);
    return Object.freeze({
      outcome: parsed.value.outcome,
      reasons: Object.freeze([...parsed.value.reasons]),
      provenanceRef: response.rawArtifactRef,
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

export interface UnreviewedNode {
  readonly nodeId: string;
  readonly statement: string;
  readonly authorMaker: string;
  readonly authorRawArtifactRef: string;
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

  async recordNodeReview(input: RecordNodeReviewInput): Promise<string> {
    return withRunContentLease(this.pool, [input.runId], async () => {
      const nodeReviewId = randomUUID();
      const content = await encryptAttestedContentForRun(
        this.pool, input.runId, "ledger.node_review", nodeReviewId,
        { reasons: input.reasons }
      );
      try {
        return await withWriteTransaction(this.pool, async (client) => {
          const result = await client.query<{ node_review_id: string }>(
            `INSERT INTO ledger.node_review (
              node_review_id, run_id, node_id, author_raw_artifact_ref,
              review_raw_artifact_ref, outcome, reasons, at_seq, content_ciphertext,content_attestation
            ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10) RETURNING node_review_id`,
            [nodeReviewId, input.runId, input.nodeId, input.authorRawArtifactRef,
              input.reviewRawArtifactRef, input.outcome,
              JSON.stringify(content === null ? input.reasons : [CONTENT_CIPHERTEXT_SENTINEL]),
              await allocateSequence(client),
              content === null ? null : JSON.stringify(content.envelope),content?.attestation ?? null]
          );
          return result.rows[0]!.node_review_id;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("PRODUCER_GRADING_FORBIDDEN:")) {
          throw new TypedDomainError("PRODUCER_GRADING_FORBIDDEN", message);
        }
        throw error;
      }
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

  /** DR-184: ledger.node_review is the authoritative judged-basis source. */
  async readReviewedNodeIds(runId: string): Promise<readonly string[]> {
    const result = await this.pool.query<{ node_id: string }>(
      `SELECT node_id::text
       FROM ledger.node_review
       WHERE run_id=$1
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
      return Object.freeze(await Promise.all(result.rows.map(async (row) => {
        const content = await decryptContentForRun<{ claimText: string }>(
          this.pool, runId, "core.node", row.node_id, row.content_ciphertext,
          { claimText: row.claim_text }
        );
        return Object.freeze({
          nodeId: row.node_id,
          statement: content.claimText,
          authorMaker: row.maker,
          authorRawArtifactRef: row.raw_artifact_id
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
