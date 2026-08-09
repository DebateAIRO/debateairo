import { z } from "zod";
import { createHash } from "node:crypto";
import { RISK_TIERS, TypedDomainError, type RiskTier } from "@debateai/kernel";
import type { Pool } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";

export const RATIFIED_BATTERY_ROW_IDS = [
  "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10",
  "Q11", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20",
  "Q21", "Q22", "Q23", "Q24", "Q25", "Q26", "Q27", "Q28", "Q29", "Q30",
  "Q31", "Q32", "Q33", "Q34", "Q35", "Q36", "Q37", "Q38", "Q39", "Q40",
  "Q41", "Q42", "Q43", "Q44", "Q45", "Q46", "Q47", "Q48", "Q49", "Q50",
  "Q51", "Q52", "Q53", "Q54", "Q55", "Q56", "Q57", "Q58", "Q59", "Q60",
  "Q61", "Q62", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"
] as const;

export type RatifiedBatteryRowId = typeof RATIFIED_BATTERY_ROW_IDS[number];
export type BudgetClass = "CORRECTNESS" | "ENRICHMENT";
export type BudgetSkipPolicy = "SKIPPABLE_BY_BUDGET" | "NEVER_SKIPPABLE" | "PROTECTED_CORE_REFUSES_SKIP";

const enrichmentRows = new Set<RatifiedBatteryRowId>(["Q27", "Q49"]);

export const BATTERY_BUDGET_CONTRACTS = Object.freeze(
  RATIFIED_BATTERY_ROW_IDS.map((batteryRowId) => Object.freeze({
    batteryRowId,
    budgetClass: enrichmentRows.has(batteryRowId) ? "ENRICHMENT" as const : "CORRECTNESS" as const,
    skipPolicy: enrichmentRows.has(batteryRowId)
      ? "SKIPPABLE_BY_BUDGET" as const
      : batteryRowId === "R9"
        ? "PROTECTED_CORE_REFUSES_SKIP" as const
        : "NEVER_SKIPPABLE" as const
  }))
);

const costEnvelopeBasisSchema = z.object({
  max_model_attempts: z.number().int().positive(),
  register_row_key: z.string().trim().min(1),
  register_version: z.number().int().positive(),
  source_ref: z.string().trim().min(1),
  derived_from: z.object({
    depth_params: z.record(z.string(), z.unknown()),
    risk_tier: z.enum(RISK_TIERS)
  }).strict()
}).strict();

export interface CostEnvelopeBasis {
  readonly maxModelAttempts: number;
  readonly registerRowKey: string;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly derivedFrom: {
    readonly depthParams: Readonly<Record<string, unknown>>;
    readonly riskTier: RiskTier;
  };
  readonly wire: Readonly<Record<string, unknown>>;
}

export function parseCostEnvelopeBasis(value: unknown): CostEnvelopeBasis {
  const parsed = costEnvelopeBasisSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypedDomainError(
      "RUN_COST_ENVELOPE_UNRESOLVED",
      "The run head has no valid register-supplied cost-envelope basis"
    );
  }
  return Object.freeze({
    maxModelAttempts: parsed.data.max_model_attempts,
    registerRowKey: parsed.data.register_row_key,
    registerVersion: parsed.data.register_version,
    sourceRef: parsed.data.source_ref,
    derivedFrom: Object.freeze({
      depthParams: Object.freeze({ ...parsed.data.derived_from.depth_params }),
      riskTier: parsed.data.derived_from.risk_tier
    }),
    wire: Object.freeze(parsed.data)
  });
}

export type RowBudgetOutcome =
  | { readonly kind: "NOT_SKIPPED" }
  | { readonly kind: "SKIPPED"; readonly outcome: "SKIPPED_BY_BUDGET"; readonly conditionMark: "SKIPPED-BY-BUDGET" }
  | { readonly kind: "REFUSED"; readonly outcome: "REFUSED"; readonly reason: "PROTECTED_CORE_REFUSES_SKIP" | "CORRECTNESS_ROW_REFUSES_SKIP" };

export function decideRowBudgetOutcome(
  batteryRowId: RatifiedBatteryRowId,
  envelopeExhausted: boolean
): RowBudgetOutcome {
  if (!envelopeExhausted) return Object.freeze({ kind: "NOT_SKIPPED" });
  const contract = BATTERY_BUDGET_CONTRACTS.find((row) => row.batteryRowId === batteryRowId)!;
  if (contract.skipPolicy === "SKIPPABLE_BY_BUDGET") {
    return Object.freeze({
      kind: "SKIPPED",
      outcome: "SKIPPED_BY_BUDGET",
      conditionMark: "SKIPPED-BY-BUDGET"
    });
  }
  return Object.freeze({
    kind: "REFUSED",
    outcome: "REFUSED",
    reason: contract.skipPolicy === "PROTECTED_CORE_REFUSES_SKIP"
      ? "PROTECTED_CORE_REFUSES_SKIP"
      : "CORRECTNESS_ROW_REFUSES_SKIP"
  });
}

export interface PendingBudgetRow {
  readonly batteryRowId: RatifiedBatteryRowId;
  readonly affectedNodeIds: readonly string[];
}

export type BudgetPressureDecision =
  | {
      readonly kind: "WITHIN_ENVELOPE";
      readonly state: "WITHIN";
      readonly consumedModelAttempts: number;
    }
  | {
      readonly kind: "HARD_STOP";
      readonly state: "EXHAUSTED";
      readonly consumedModelAttempts: number;
      readonly enrichmentSkips: readonly {
        readonly batteryRowId: RatifiedBatteryRowId;
        readonly outcome: "SKIPPED_BY_BUDGET";
        readonly conditionMark: "SKIPPED-BY-BUDGET";
        readonly affectedNodeIds: readonly string[];
      }[];
      readonly protectedCoreRefusals: readonly {
        readonly batteryRowId: RatifiedBatteryRowId;
        readonly outcome: "REFUSED";
        readonly reason: "PROTECTED_CORE_REFUSES_SKIP";
        readonly affectedNodeIds: readonly string[];
      }[];
      readonly terminal: {
        readonly conditionMark: "ENVELOPE_EXHAUSTED";
        readonly servedNodeIds: readonly string[];
      };
    };

export function decideBudgetPressure(input: {
  readonly basis: CostEnvelopeBasis;
  readonly consumedModelAttempts: number;
  readonly pendingRows: readonly PendingBudgetRow[];
  readonly verifiedNodeIds: readonly string[];
}): BudgetPressureDecision {
  if (!Number.isInteger(input.consumedModelAttempts) || input.consumedModelAttempts < 0) {
    throw new TypeError("ATTEMPT_LEDGER_CONSUMPTION_INVALID");
  }
  if (input.consumedModelAttempts < input.basis.maxModelAttempts) {
    return Object.freeze({
      kind: "WITHIN_ENVELOPE",
      state: "WITHIN",
      consumedModelAttempts: input.consumedModelAttempts
    });
  }
  if (input.verifiedNodeIds.length === 0) {
    throw new TypedDomainError(
      "ENVELOPE_EXHAUSTED_WITHOUT_VERIFIED_COMPONENTS",
      "A hard stop must identify the already-verified components it can serve"
    );
  }
  const enrichmentSkips: Array<Extract<BudgetPressureDecision, { kind: "HARD_STOP" }>["enrichmentSkips"][number]> = [];
  const protectedCoreRefusals: Array<Extract<BudgetPressureDecision, { kind: "HARD_STOP" }>["protectedCoreRefusals"][number]> = [];
  for (const pending of input.pendingRows) {
    const decision = decideRowBudgetOutcome(pending.batteryRowId, true);
    if (decision.kind === "SKIPPED") {
      if (pending.affectedNodeIds.length === 0) {
        throw new TypedDomainError("BUDGET_SKIP_AFFECTED_NODES_REQUIRED", pending.batteryRowId);
      }
      enrichmentSkips.push(Object.freeze({
        batteryRowId: pending.batteryRowId,
        outcome: decision.outcome,
        conditionMark: decision.conditionMark,
        affectedNodeIds: Object.freeze([...pending.affectedNodeIds])
      }));
    } else if (decision.kind === "REFUSED" && decision.reason === "PROTECTED_CORE_REFUSES_SKIP") {
      protectedCoreRefusals.push(Object.freeze({
        batteryRowId: pending.batteryRowId,
        outcome: decision.outcome,
        reason: decision.reason,
        affectedNodeIds: Object.freeze([...pending.affectedNodeIds])
      }));
    }
  }
  return Object.freeze({
    kind: "HARD_STOP",
    state: "EXHAUSTED",
    consumedModelAttempts: input.consumedModelAttempts,
    enrichmentSkips: Object.freeze(enrichmentSkips),
    protectedCoreRefusals: Object.freeze(protectedCoreRefusals),
    terminal: Object.freeze({
      conditionMark: "ENVELOPE_EXHAUSTED",
      servedNodeIds: Object.freeze([...input.verifiedNodeIds])
    })
  });
}

export interface ConvergenceSnapshot {
  readonly semanticsRef: string;
  readonly topologyRef: string;
  readonly evidenceTopologyRef: string;
  readonly strengths: Readonly<Record<string, number>> | null;
}

export type ConvergenceComparison =
  | { readonly kind: "NOT_COMPARABLE"; readonly reason: "FIRST_EVALUATION" | "SEMANTICS_CHANGED" | "TOPOLOGY_CHANGED" | "STRENGTHS_UNAVAILABLE" }
  | { readonly kind: "COMPARABLE"; readonly converged: boolean; readonly maxDelta: number };

export function compareConvergence(input: {
  readonly previous: ConvergenceSnapshot | null;
  readonly current: ConvergenceSnapshot;
  readonly epsilon: number;
}): ConvergenceComparison {
  if (!Number.isFinite(input.epsilon) || input.epsilon < 0) throw new TypeError("CONVERGENCE_EPSILON_INVALID");
  if (input.previous === null) return Object.freeze({ kind: "NOT_COMPARABLE", reason: "FIRST_EVALUATION" });
  if (input.previous.semanticsRef !== input.current.semanticsRef) {
    return Object.freeze({ kind: "NOT_COMPARABLE", reason: "SEMANTICS_CHANGED" });
  }
  if (
    input.previous.topologyRef !== input.current.topologyRef
    || input.previous.evidenceTopologyRef !== input.current.evidenceTopologyRef
  ) {
    return Object.freeze({ kind: "NOT_COMPARABLE", reason: "TOPOLOGY_CHANGED" });
  }
  if (input.previous.strengths === null || input.current.strengths === null) {
    return Object.freeze({ kind: "NOT_COMPARABLE", reason: "STRENGTHS_UNAVAILABLE" });
  }
  const overlappingNodeIds = Object.keys(input.current.strengths)
    .filter((nodeId) => Object.hasOwn(input.previous!.strengths!, nodeId));
  if (overlappingNodeIds.length === 0) {
    return Object.freeze({ kind: "NOT_COMPARABLE", reason: "STRENGTHS_UNAVAILABLE" });
  }
  const maxDelta = Math.max(...overlappingNodeIds.map((nodeId) => Math.abs(
    input.current.strengths![nodeId]! - input.previous!.strengths![nodeId]!
  )));
  return Object.freeze({ kind: "COMPARABLE", converged: maxDelta <= input.epsilon, maxDelta });
}

export class BudgetRepository {
  readonly #ledger: LedgerRepository;

  constructor(private readonly pool: Pool) {
    this.#ledger = new LedgerRepository(pool);
  }

  async countRunModelAttempts(runId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM ledger.ledger_entry
       WHERE run_id = $1 AND action_kind = 'MODEL_CALL'`,
      [runId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async readPinnedBasis(runId: string): Promise<CostEnvelopeBasis> {
    const result = await this.pool.query<{ envelope_basis: unknown }>(
      "SELECT envelope_basis FROM core.run WHERE run_id = $1",
      [runId]
    );
    if (result.rows[0] === undefined) throw new TypedDomainError("RUN_NOT_FOUND", runId);
    return parseCostEnvelopeBasis(result.rows[0].envelope_basis);
  }

  async assertModelAttemptAllowed(runId: string): Promise<void> {
    const basis = await this.readPinnedBasis(runId);
    if (await this.countRunModelAttempts(runId) >= basis.maxModelAttempts) {
      throw new TypedDomainError(
        "RUN_COST_ENVELOPE_EXHAUSTED",
        `Run ${runId} exhausted its pinned ${basis.registerRowKey} basis`
      );
    }
  }

  async evaluateRunPressure(input: {
    readonly runId: string;
    readonly basis: CostEnvelopeBasis;
    readonly pendingRows: readonly PendingBudgetRow[];
    readonly verifiedNodeIds: readonly string[];
  }): Promise<BudgetPressureDecision> {
    return decideBudgetPressure({
      basis: input.basis,
      consumedModelAttempts: await this.countRunModelAttempts(input.runId),
      pendingRows: input.pendingRows,
      verifiedNodeIds: input.verifiedNodeIds
    });
  }

  async recordDecision(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly attemptId: string;
    readonly actorRef: string;
    readonly contractHash: string;
    readonly decision: BudgetPressureDecision;
  }): Promise<void> {
    const now = new Date();
    if (input.decision.kind === "HARD_STOP") {
      for (const row of input.decision.enrichmentSkips) {
        await this.#ledger.append({
          runId: input.runId,
          attemptId: input.attemptId,
          actionKind: "BUDGET_SKIP",
          subjectItemId: input.workItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: row.outcome,
          actorRef: input.actorRef,
          inputHash: createHash("sha256").update(JSON.stringify({
            batteryRowId: row.batteryRowId,
            affectedNodeIds: row.affectedNodeIds
          })).digest("hex"),
          contractHash: input.contractHash,
          startedAt: now,
          finishedAt: now
        });
      }
      for (const row of input.decision.protectedCoreRefusals) {
        await this.#ledger.append({
          runId: input.runId,
          attemptId: input.attemptId,
          actionKind: "BUDGET_SKIP",
          subjectItemId: input.workItemId,
          stanceAtAction: "UNASSIGNED",
          outcome: row.outcome,
          actorRef: input.actorRef,
          inputHash: createHash("sha256").update(JSON.stringify({
            batteryRowId: row.batteryRowId,
            reason: row.reason
          })).digest("hex"),
          contractHash: input.contractHash,
          startedAt: now,
          finishedAt: now
        });
      }
    }
    await withWriteTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
         VALUES ($1,$2,'ENVELOPE_CONSUMED',$3::jsonb)`,
        [input.runId, await allocateSequence(client), JSON.stringify(input.decision.consumedModelAttempts)]
      );
      if (input.decision.kind === "HARD_STOP" && input.decision.enrichmentSkips.length > 0) {
        await client.query(
          `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
           VALUES ($1,$2,'ENVELOPE_STATE',$3::jsonb)`,
          [input.runId, await allocateSequence(client), JSON.stringify("ENRICHMENT_SKIPPED")]
        );
      }
      if (input.decision.kind === "HARD_STOP") {
        await client.query(
          `INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
           VALUES ($1,$2,'ENVELOPE_STATE',$3::jsonb)`,
          [input.runId, await allocateSequence(client), JSON.stringify("EXHAUSTED")]
        );
      }
    });
  }
}
