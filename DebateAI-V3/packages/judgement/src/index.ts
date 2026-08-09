import { z } from "zod";
import { randomUUID } from "node:crypto";
import { TypedDomainError, type WayOfKnowing } from "@debateai/kernel";
import type { CallBound, ProviderGateway } from "@debateai/providers";
import type { Pool } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
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
  claim_type: z.unknown().optional(),
  ...judgeAssessmentSchema.shape
}).strict();

export interface JudgeInput {
  readonly runId: string | null;
  readonly subjectItemId: string;
  readonly callSiteKey: string;
  readonly questionLine: string;
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

export class Judge {
  constructor(private readonly provider: ProviderGateway) {}

  async judge(input: JudgeInput): Promise<JudgedNode> {
    const codeClaim = classifyClaimText(input.questionLine);
    const response = await this.provider.call({
      runId: input.runId,
      subjectItemId: input.subjectItemId,
      callSiteKey: input.callSiteKey,
      role: "JUDGE",
      lane: "served",
      bound: input.bound,
      contractHash: input.contractHash,
      providerRef: input.providerRef,
      packet: {
        messages: [
          {
            role: "system",
            content: `Return only the declared judge JSON object with steelman, critic, evidence, context, and fallacy sub-objects. Never invent evidence, citations, or sources. Score relevance against the question asked. Use REAL_ATTACK only for a supplied attack; otherwise use PLAUSIBLE_COUNTER and say so. LOOKED_UP requires a resolving locator.${codeClaim.claimType === "unknown" ? " The code classifier returned unknown; propose claim_type from the declared closed vocabulary." : " Do not classify claim_type; the code-first classifier already resolved it."}`
          },
          { role: "user", content: input.questionLine }
        ]
      },
      classifyContent: (content) => {
        const outcome = parseStructuredArtifact(content, judgeArtifactSchema);
        if (outcome.kind === "PARSED") return { parseStatus: "PARSED", parseError: null };
        return {
          parseStatus: outcome.kind === "PARSE_FAILURE" ? "PARSE_FAILED" : "SCHEMA_FAILED",
          parseError: outcome.message
        };
      }
    });
    const parsed = parseStructuredArtifact(response.content, judgeArtifactSchema);
    if (parsed.kind === "PARSE_FAILURE") throw new TypedDomainError("JUDGE_PARSE_FAILURE", parsed.message);
    if (parsed.kind === "SCHEMA_FAILURE") throw new TypedDomainError("JUDGE_SCHEMA_FAILURE", parsed.message);
    let normalizedClaim: NormalizedClaim;
    try {
      normalizedClaim = await resolveClaimType({
        text: input.questionLine,
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
}
