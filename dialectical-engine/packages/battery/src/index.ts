import type { ActivationState } from "@debateai/kernel";
import type { Pool } from "pg";
import { allocateSequence, withWriteTransaction } from "@debateai/db";

export {
  SplitLifecycleProjection,
  SplitStageRunner,
  type SplitStageInput,
  type SplitStageResult
} from "./split.js";

export {
  createTerminalActivationEvaluator,
  evaluateTerminalActivations,
  readTerminalRecordedFacts,
  SHIPPED_QUESTION_CLASS,
  TERMINAL_EVALUATOR_REF,
  type TerminalActivationResolution,
  type TerminalCompletionDeclaration,
  type TerminalRecordedFacts
} from "./terminal.js";

export const BATTERY_ROW_IDS = [
  "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10",
  "Q11", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20",
  "Q21", "Q22", "Q23", "Q24", "Q25", "Q26", "Q27", "Q28", "Q29", "Q30",
  "Q31", "Q32", "Q33", "Q34", "Q35", "Q36", "Q37", "Q38", "Q39", "Q40",
  "Q41", "Q42", "Q43", "Q44", "Q45", "Q46", "Q47", "Q48", "Q49", "Q50",
  "Q51", "Q52", "Q53", "Q54", "Q55", "Q56", "Q57", "Q58", "Q59", "Q60",
  "Q61", "Q62", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"
] as const;

export type BatteryRowId = typeof BATTERY_ROW_IDS[number];
export type ExecutionKind = "MACHINE" | "HYBRID" | "LLM";

const machineRows = new Set<BatteryRowId>([
  "Q15", "Q17", "Q22", "Q23", "Q34", "Q39", "Q42",
  "Q46", "Q47", "Q49", "Q53", "Q56", "Q60"
]);

const unconditionalRows = new Set<BatteryRowId>(["Q1", "Q51", "Q62"]);
const policyBlockedRows = new Set<BatteryRowId>(["Q14", "Q40", "R6"]);

export function resolveActivationState(input: {
  readonly batteryRowId: BatteryRowId;
  readonly predicate: "TRUE" | "FALSE" | "UNRESOLVED";
  readonly cacheHit: boolean;
}): ActivationState {
  if (policyBlockedRows.has(input.batteryRowId)) return "POLICY_BLOCKED";
  if (input.cacheHit) return "ACTIVE";
  if (input.predicate === "TRUE") return "ACTIVE";
  if (input.predicate === "FALSE") return "INACTIVE";
  return "WAIT";
}

export interface BatteryRowContract {
  readonly batteryRowId: BatteryRowId;
  readonly predicateRef: string;
  readonly openingState: ActivationState;
  readonly predicateInputs: Readonly<Record<string, unknown>>;
  readonly skipEvidence: Readonly<Record<string, unknown>> | null;
  readonly executionKind: ExecutionKind;
  readonly modelCallsAllowed: number | null;
}

export type PredicateInputs =
  | { readonly kind: "PRESENT"; readonly values: Readonly<Record<string, unknown>> }
  | {
      readonly kind: "PARTIAL";
      readonly values: Readonly<Record<string, unknown>>;
      readonly absentInputs: readonly { readonly name: string; readonly reason: "NOT_AVAILABLE_AT_RUN_CREATION" }[];
    }
  | {
      readonly kind: "ABSENT";
      readonly reason: "NOT_AVAILABLE_AT_RUN_CREATION" | "PREDICATE_UNWRITTEN";
      readonly expectedInputs: readonly string[];
    };

const predicateInputsByRow: Readonly<Partial<Record<BatteryRowId, readonly string[]>>> = Object.freeze({
  Q2: ["Q1_route"], Q3: ["Q1_route"], Q4: ["Q1_route"], Q5: ["Q1_route", "before_evidence"],
  Q6: ["Q1_route"], Q7: ["LOCK_complete"], Q8: ["Q7_terminality"], Q9: ["live_answer_count"],
  Q10: ["Q7_terminality"], Q11: ["research_route", "Q4_present"], Q12: ["research_route"],
  Q13: ["research_route"], Q14: [], Q15: ["Q11_frozen", "research_route"], Q16: ["candidate_source_count"],
  Q17: ["Q15_complete"], Q18: ["answer_can_change_over_time", "registry_class"], Q19: ["admitted_source_count"],
  Q20: ["empirical_research_route"], Q21: ["runnable_selected"], Q22: ["runnable_selected"],
  Q23: ["instrument_used"], Q24: ["measurement_attempted"], Q25: ["Q20_no_runnable", "Q22_blocked"],
  Q26: ["Q10.split"], Q27: ["Q10.split"], Q28: ["Q26_child_count"], Q29: ["Q28_survivor_count"],
  Q30: ["Q10.split"], Q31: ["Q10.split"], Q32: ["evidence_item_count"], Q33: ["claim_or_leaf_count"],
  Q34: ["evidence_on_both_sides"], Q35: ["source_is_load_bearing"],
  Q36: ["weighted_claim_count", "served_answer_count"], Q37: ["question_type", "settlement_act", "study_result_in_use"],
  Q38: ["numeric_answer_planned"], Q39: ["research_answer_reaches_CROSS"], Q40: [], Q41: ["eligible_critic_run"],
  Q42: ["critic_agrees"], Q43: ["split_or_composed_answer"], Q44: ["CROSS_stage_entered"],
  Q45: ["multiple_components_to_compose"], Q46: ["Q45_computable"], Q47: ["approved_variant_count"],
  Q48: ["Q10.split", "both_answers_exist"], Q49: ["composed_answer_with_typed_ranges"], Q50: ["question_type"],
  Q52: ["any_serve_candidate", "terminality"], Q53: ["any_serve_candidate"],
  Q54: ["any_serve_candidate", "Q5_prior_present"], Q55: ["open_unknown_count"],
  Q56: ["class_history_sufficient"], Q57: ["value_clause_detected_or_possible"],
  Q58: ["empirical_serve_candidate"], Q59: ["answer_record_created"], Q60: ["Q59_scoreable"],
  Q61: ["resolver_outcome_arrived", "Q60_valid"], R1: ["research_route", "before_Q15"],
  R2: ["Q1_route", "evidence_item_count"], R3: ["research_route"], R4: ["research_route"],
  R5: ["nonterminal_researched_answer", "before_confident_serve"], R6: [], R7: ["Q7_terminality"],
  R8: ["AIM_entered", "before_source_plan_freeze"], R9: ["serve_candidate_ready"]
});

/** The declared predicate input names for a battery row — the ratified
 * per-row contract field (docs/architecture/10-row-contracts.md §6). The
 * terminal evaluator (TERM-01, DR-139) records values for exactly these
 * names on every completion transition. */
export function declaredPredicateInputNames(rowId: BatteryRowId): readonly string[] {
  if (rowId === "Q1") return Object.freeze(["run_opened"]);
  if (rowId === "Q51") return Object.freeze([]);
  if (rowId === "Q62") return Object.freeze(["wrong_resolved_outcome"]);
  const declared = predicateInputsByRow[rowId];
  if (declared === undefined) {
    throw new TypeError(`PREDICATE_INPUT_CONTRACT_MISSING:${rowId}`);
  }
  return declared;
}

function sectionFor(rowId: BatteryRowId): string {
  if (rowId.startsWith("R")) return "6.12";
  const number = Number(rowId.slice(1));
  if (number <= 6) return "6.1";
  if (number <= 10) return "6.2";
  if (number <= 14) return "6.3";
  if (number <= 19) return "6.4";
  if (number <= 25) return "6.5";
  if (number <= 31) return "6.6";
  if (number <= 38) return "6.7";
  if (number <= 44) return "6.8";
  if (number <= 50) return "6.9";
  if (number <= 58) return "6.10";
  return "6.11";
}

function openingStateFor(rowId: BatteryRowId): ActivationState {
  if (unconditionalRows.has(rowId)) return "ACTIVE";
  if (policyBlockedRows.has(rowId)) return "POLICY_BLOCKED";
  if (rowId === "Q61") return "INACTIVE";
  return "WAIT";
}

export interface BatteryExecutionContract {
  readonly batteryRowId: BatteryRowId;
  readonly executionKind: ExecutionKind;
  readonly modelCallsAllowed: number | null;
}

export const BATTERY_EXECUTION_CONTRACTS: readonly BatteryExecutionContract[] = Object.freeze(
  BATTERY_ROW_IDS.map((batteryRowId) => Object.freeze({
    batteryRowId,
    executionKind: machineRows.has(batteryRowId) ? "MACHINE" : batteryRowId === "Q27" ? "LLM" : "HYBRID",
    modelCallsAllowed: machineRows.has(batteryRowId) ? 0 : null
  }))
);

export function createInitialBatteryRows(input: { readonly settlementWatchHandle: string }): readonly BatteryRowContract[] {
  if (input.settlementWatchHandle.trim().length === 0) {
    throw new TypeError("SETTLEMENT_WATCH_HANDLE_REQUIRED");
  }
  return Object.freeze(BATTERY_ROW_IDS.map((batteryRowId) => {
    const execution = BATTERY_EXECUTION_CONTRACTS.find((candidate) => candidate.batteryRowId === batteryRowId)!;
    let predicateInputs: PredicateInputs;
    if (batteryRowId === "Q1" || batteryRowId === "Q51") {
      predicateInputs = { kind: "PRESENT", values: batteryRowId === "Q1" ? { run_opened: true } : {} };
    } else if (batteryRowId === "Q62") {
      predicateInputs = {
        kind: "PARTIAL",
        values: { run_opened: true },
        absentInputs: [{ name: "wrong_resolved_outcome", reason: "NOT_AVAILABLE_AT_RUN_CREATION" }]
      };
    } else {
      const expectedInputs = predicateInputsByRow[batteryRowId];
      if (expectedInputs === undefined) {
        throw new TypeError(`PREDICATE_INPUT_CONTRACT_MISSING:${batteryRowId}`);
      }
      predicateInputs = {
        kind: "ABSENT",
        reason: policyBlockedRows.has(batteryRowId) ? "PREDICATE_UNWRITTEN" : "NOT_AVAILABLE_AT_RUN_CREATION",
        expectedInputs
      };
    }
    return Object.freeze({
      batteryRowId,
      predicateRef: policyBlockedRows.has(batteryRowId)
        ? `docs/architecture/10-row-contracts.md §${sectionFor(batteryRowId)} ${batteryRowId} — predicate unwritten pending V`
        : `docs/architecture/10-row-contracts.md §${sectionFor(batteryRowId)} ${batteryRowId}`,
      openingState: openingStateFor(batteryRowId),
      predicateInputs: Object.freeze(predicateInputs),
      skipEvidence: batteryRowId === "Q61" ? Object.freeze({
        kind: "PRESENT",
        evidenceType: "SETTLEMENT_WATCH_HANDLE",
        handle: input.settlementWatchHandle
      }) : null,
      executionKind: execution.executionKind,
      modelCallsAllowed: execution.modelCallsAllowed
    });
  }));
}

if (BATTERY_EXECUTION_CONTRACTS.length !== 71) {
  throw new TypeError("The ratified battery must contain exactly 71 rows");
}

export const INTERLEAVING_DISPOSITIONS = Object.freeze([
  Object.freeze({ case: "A", terminal: "NO_OP_LIVE_CLAIM", secondRealCall: false }),
  Object.freeze({ case: "B", terminal: "NO_OP_LIVE_CLAIM", secondRealCall: false }),
  Object.freeze({ case: "C", terminal: "REAP_THEN_RECLAIM", secondRealCall: false }),
  Object.freeze({ case: "D", terminal: "ZOMBIE_OVERLAP_RESIDUAL", secondRealCall: true }),
  Object.freeze({ case: "E", terminal: "NO_OP_SETTLED", secondRealCall: false }),
  Object.freeze({ case: "F", terminal: "COMPLETE_EXISTING_SETTLEMENT", secondRealCall: false })
]);

export function assertClaimCoversCall(input: {
  readonly claimMs: number;
  readonly deadlineMs: number;
  readonly marginMs: number;
  readonly cooldownMs?: number;
  readonly maxCooldownHoldsPerRun?: number;
}): void {
  const cooldownMs = input.cooldownMs ?? 0;
  const maxCooldownHoldsPerRun = input.maxCooldownHoldsPerRun ?? 0;
  if (![input.claimMs, input.deadlineMs, input.marginMs, cooldownMs, maxCooldownHoldsPerRun].every(Number.isFinite)) {
    throw new TypeError("CLAIM_BOUND_MISMATCH: claim and call bounds must be configured finite values");
  }
  const requiredMs = maxCooldownHoldsPerRun * (cooldownMs + input.deadlineMs)
    + input.deadlineMs
    + input.marginMs;
  if (input.claimMs < requiredMs) {
    throw new TypeError("CLAIM_BOUND_MISMATCH: claim must cover cooldown holds, call deadlines, and configured margin");
  }
}

export interface EnqueueWorkInput {
  readonly runId: string | null;
  readonly batteryRowId: BatteryRowId;
  readonly nodeSet: readonly string[];
  readonly commandKey: string;
}

export interface ClaimedWorkItem {
  readonly workItemId: string;
  readonly commandKey: string;
  readonly batteryRowId: BatteryRowId;
  readonly nodeSet: readonly string[];
  readonly claimedBy: string;
  readonly claimDeadline: Date;
  readonly runId: string | null;
}

export class WorkItemRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(input: EnqueueWorkInput): Promise<string> {
    return withWriteTransaction(this.pool, async (client) => {
      const sequence = await allocateSequence(client);
      const result = await client.query<{ work_item_id: string }>(
        `INSERT INTO core.work_item (
          run_id, battery_row_id, node_set, command_key, state, created_at_seq
        ) VALUES ($1,$2,$3::jsonb,$4,'READY',$5)
        ON CONFLICT (command_key) DO UPDATE SET command_key = EXCLUDED.command_key
        RETURNING work_item_id`,
        [input.runId, input.batteryRowId, JSON.stringify(input.nodeSet), input.commandKey, sequence]
      );
      return result.rows[0]!.work_item_id;
    });
  }

  async claimNext(input: { readonly workerId: string; readonly claimSeconds: number }): Promise<ClaimedWorkItem | null> {
    if (!Number.isFinite(input.claimSeconds) || input.claimSeconds <= 0) {
      throw new TypeError("claimSeconds must be a positive register value");
    }
    return withWriteTransaction(this.pool, async (client) => {
      const result = await client.query<{
        work_item_id: string;
        command_key: string;
        battery_row_id: BatteryRowId;
        node_set: string[];
        claimed_by: string;
        claim_deadline: Date;
        run_id: string | null;
      }>(
        `WITH candidate AS (
          SELECT work_item_id FROM core.work_item
          WHERE state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp())
          ORDER BY created_at_seq
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE core.work_item AS item
        SET state = 'CLAIMED',
            claimed_by = $1,
            claim_deadline = clock_timestamp() + make_interval(secs => $2)
        FROM candidate
        WHERE item.work_item_id = candidate.work_item_id
        RETURNING item.work_item_id, item.command_key, item.battery_row_id, item.run_id,
                  item.node_set, item.claimed_by, item.claim_deadline`,
        [input.workerId, input.claimSeconds]
      );
      const row = result.rows[0];
      return row === undefined ? null : {
        workItemId: row.work_item_id,
        commandKey: row.command_key,
        batteryRowId: row.battery_row_id,
        nodeSet: row.node_set,
        claimedBy: row.claimed_by,
        claimDeadline: row.claim_deadline,
        runId: row.run_id
      };
    });
  }

  async claimById(input: {
    readonly workItemId: string;
    readonly workerId: string;
    readonly claimSeconds: number;
  }): Promise<ClaimedWorkItem | null> {
    if (!Number.isFinite(input.claimSeconds) || input.claimSeconds <= 0) {
      throw new TypeError("claimSeconds must be a positive register value");
    }
    return withWriteTransaction(this.pool, async (client) => {
      const result = await client.query<{
        work_item_id: string;
        command_key: string;
        battery_row_id: BatteryRowId;
        node_set: string[];
        claimed_by: string;
        claim_deadline: Date;
        run_id: string | null;
      }>(
        `WITH candidate AS (
          SELECT work_item_id FROM core.work_item
          WHERE work_item_id = $1
            AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))
          FOR UPDATE SKIP LOCKED
        )
        UPDATE core.work_item AS item
        SET state = 'CLAIMED', claimed_by = $2,
            claim_deadline = clock_timestamp() + make_interval(secs => $3)
        FROM candidate WHERE item.work_item_id = candidate.work_item_id
        RETURNING item.work_item_id, item.command_key, item.battery_row_id,
                  item.node_set, item.claimed_by, item.claim_deadline, item.run_id`,
        [input.workItemId, input.workerId, input.claimSeconds]
      );
      const row = result.rows[0];
      return row === undefined ? null : {
        workItemId: row.work_item_id,
        commandKey: row.command_key,
        batteryRowId: row.battery_row_id,
        nodeSet: row.node_set,
        claimedBy: row.claimed_by,
        claimDeadline: row.claim_deadline,
        runId: row.run_id
      };
    });
  }

  async settle(input: { readonly workItemId: string; readonly attemptId: string; readonly artifactRef: string }): Promise<boolean> {
    return withWriteTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE core.work_item
         SET state = 'DONE', claimed_by = NULL, claim_deadline = NULL,
             settled_attempt_id = $2, settled_artifact_ref = $3
         WHERE work_item_id = $1 AND settled_attempt_id IS NULL`,
        [input.workItemId, input.attemptId, input.artifactRef]
      );
      return result.rowCount === 1;
    });
  }

  async readSettledArtifact(workItemId: string): Promise<string | null> {
    const result = await this.pool.query<{ settled_artifact_ref: string | null }>(
      "SELECT settled_artifact_ref FROM core.work_item WHERE work_item_id = $1",
      [workItemId]
    );
    return result.rows[0]?.settled_artifact_ref ?? null;
  }

  async failFromExhaustedAttempt(input: {
    readonly workItemId: string;
    readonly attemptId: string;
    readonly artifactRef: string | null;
  }): Promise<boolean> {
    return withWriteTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE core.work_item
         SET state = 'FAILED', claimed_by = NULL, claim_deadline = NULL,
             settled_attempt_id = CASE WHEN $3::uuid IS NULL THEN NULL ELSE $2::uuid END,
             settled_artifact_ref = $3::uuid,
             terminal_reason = 'CALL_BUDGET_EXHAUSTED'
         WHERE work_item_id = $1 AND settled_attempt_id IS NULL`,
        [input.workItemId, input.attemptId, input.artifactRef]
      );
      return result.rowCount === 1;
    });
  }

  async recordTerminalFailure(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly reason: string;
  }): Promise<boolean> {
    if (input.reason.trim().length === 0) {
      throw new TypeError("Terminal failure reason must be a typed non-empty value");
    }
    return withWriteTransaction(this.pool, async (client) => {
      const failed = await client.query(
        `UPDATE core.work_item
         SET state = 'FAILED', claimed_by = NULL, claim_deadline = NULL,
             terminal_reason = $3
         WHERE work_item_id = $1 AND run_id = $2
           AND state <> 'DONE' AND settled_attempt_id IS NULL`,
        [input.workItemId, input.runId, input.reason]
      );
      return failed.rowCount === 1;
    });
  }
}
