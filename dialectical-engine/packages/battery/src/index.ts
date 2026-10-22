import { LEGACY_RELEASE_KEY, parseReleaseKey, type ActivationState } from "@debateai/kernel";
import type { Pool, PoolClient } from "pg";
import {
  allocateSequence,
  recordSpendWaiver,
  SPEND_WAIVER_REASONS,
  withWriteTransaction,
  type SpendWaiverReason
} from "@debateai/db";

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

export interface DispatchableWorkItem {
  readonly runId: string;
  readonly workItemId: string;
}

/**
 * What one claim renewal found (L4-F9 repair, ADR-0017 §3(c)'s permitted
 * heartbeat): the claim extended, the item settled (DONE or FAILED, so no copy
 * can claim it again), or the claim no longer the one this copy last saw.
 */
export type ClaimRenewal =
  | { readonly kind: "RENEWED"; readonly claimDeadline: Date }
  | { readonly kind: "FINISHED" }
  | { readonly kind: "LOST" };

/**
 * Side-by-side spec §3, "the database refuses to give a runner another release's debate": every claim, sweep and
 * failure write of a repository reads only the work of runs stamped with `releaseKey` (`core.run.release_key`, 0123).
 * `workerId` is this runner's worker id (one process per release): the copy that holds a live claim is read as
 * `claimed_by = workerId` (plan B D2), so a failure or set-aside write never lands under another worker's live claim.
 * A repository told no worker id writes over no live claim at all.
 */
export type WorkItemFence = Readonly<{ releaseKey: string; workerId?: string }>;

/** The head of every set-aside reason: the run was stopped by an upload, never by its own failure (spec §4, §9). */
export const RUN_SET_ASIDE = "RUN_SET_ASIDE";

/**
 * Why a run was set aside — the reasons a spend waiver may carry, one list (plan A's `SPEND_WAIVER_REASONS`, the
 * `ledger.model_spend_waiver` CHECK; INTERFACE "Database"), so the waiver carries the word the FAILED row records.
 */
export type SetAsideReason = SpendWaiverReason;

const SET_ASIDE_REASONS: ReadonlySet<string> = new Set<string>(SPEND_WAIVER_REASONS);

/**
 * Spec §9 "the waiver": a set-aside run never uses the person's quota. One waiver per distinct run of `runIds`,
 * written on the client of the transaction that wrote their FAILED rows, so both commit together or not at all.
 * Idempotent: a run that already has a waiver keeps its first reason (ON CONFLICT (run_id) DO NOTHING).
 */
async function waiveSetAsideRuns(
  client: PoolClient,
  runIds: readonly string[],
  reason: SetAsideReason
): Promise<void> {
  for (const runId of new Set(runIds)) await recordSpendWaiver(client, runId, reason);
}

/** The terminal reason a set-aside writes: `RUN_SET_ASIDE:<waiver reason>` (plan B D7: the site reads it SET_ASIDE). */
export function runSetAsideReason(reason: SetAsideReason): string {
  if (!SET_ASIDE_REASONS.has(reason)) throw new TypeError("SET_ASIDE_REASON_INVALID");
  return `RUN_SET_ASIDE:${reason}`;
}

/** One work item a set-aside wrote FAILED, and its run (whose waiver was written on the same transaction). */
export type SetAsideWorkItem = Readonly<{ runId: string; workItemId: string }>;

function assertWorkLimit(limit: number, what: string): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new TypeError(`${what} limit must be an integer between 1 and 1000`);
  }
}

export class WorkItemRepository {
  readonly #fence: Readonly<{ releaseKey: string; workerId: string | null }>;

  /**
   * Without a fence the repository serves the `legacy` release (runs written before 0123 or without a key). Any other
   * key must be well formed (TypedDomainError RELEASE_KEY_INVALID): a mistyped fence would match no run and silently
   * serve nothing.
   */
  constructor(private readonly pool: Pool, fence: WorkItemFence = { releaseKey: LEGACY_RELEASE_KEY }) {
    if (fence?.releaseKey !== LEGACY_RELEASE_KEY) parseReleaseKey(fence?.releaseKey);
    if (fence.workerId !== undefined && (typeof fence.workerId !== "string" || fence.workerId.length === 0)) {
      throw new TypeError("WORK_ITEM_FENCE_WORKER_ID_INVALID");
    }
    this.#fence = Object.freeze({ releaseKey: fence.releaseKey, workerId: fence.workerId ?? null });
  }

  /** Spec §3: what a runner may dispatch is its own release's work — READY, or CLAIMED with the claim lapsed. */
  async listDispatchable(limit: number): Promise<readonly DispatchableWorkItem[]> {
    assertWorkLimit(limit, "Dispatchable work");
    const result = await this.pool.query<{ work_item_id: string; run_id: string }>(
      `SELECT item.work_item_id, item.run_id
       FROM core.work_item AS item
       JOIN core.run AS run ON run.run_id = item.run_id AND run.release_key = $2
       WHERE item.state = 'READY' OR (item.state = 'CLAIMED' AND item.claim_deadline <= clock_timestamp())
       ORDER BY item.created_at_seq, item.work_item_id
       LIMIT $1`,
      [limit, this.#fence.releaseKey]
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      runId: row.run_id,
      workItemId: row.work_item_id
    })));
  }

  /**
   * Spec §3: the release that owns a work item — its run's `release_key`; null when there is no such item or the item
   * has no run (D3: a run-less item belongs to no release). The runner reads it before claiming a dispatched item, so
   * another release's item is left alone without a write.
   */
  async releaseKeyOf(workItemId: string): Promise<string | null> {
    const result = await this.pool.query<{ release_key: string }>(
      `SELECT run.release_key
       FROM core.work_item AS item
       JOIN core.run AS run ON run.run_id = item.run_id
       WHERE item.work_item_id = $1`,
      [workItemId]
    );
    return result.rows[0]?.release_key ?? null;
  }

  /**
   * Spec §3 (plan B D4): this release's CLAIMED items whose claim has lapsed — a copy that died mid-debate — oldest
   * first. The periodic re-send hands only these to Hatchet again; READY items stay with the API's stalled-start
   * re-send, so a queued job is never sent twice.
   */
  async listLapsedClaimed(limit: number): Promise<readonly DispatchableWorkItem[]> {
    assertWorkLimit(limit, "Lapsed claim");
    const result = await this.pool.query<{ work_item_id: string; run_id: string }>(
      `SELECT item.work_item_id, item.run_id
       FROM core.work_item AS item
       JOIN core.run AS run ON run.run_id = item.run_id AND run.release_key = $2
       WHERE item.state = 'CLAIMED' AND item.claim_deadline <= clock_timestamp()
       ORDER BY item.created_at_seq, item.work_item_id
       LIMIT $1`,
      [limit, this.#fence.releaseKey]
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      runId: row.run_id,
      workItemId: row.work_item_id
    })));
  }

  /**
   * Final review Part 1b, Important 4 — STARTED RUNS NOBODY HANDED TO A RUNNER.
   * A run the room started carries a hold (`ledger.model_spend_hold`), written
   * in the same transaction as its first job, so the hold's `opened_at` is when
   * that job became READY. A job still READY — never claimed: nothing turns a
   * job back to READY — more than `olderThanSeconds` later was never claimed:
   * either never dispatched (the API stopped between the decision's commit and
   * the dispatch, or the dispatch failed and so did its FAILED write) or
   * dispatched but still queued, or its task expired; its hold counts on every
   * later day and window until a runner claims it. Oldest first, by the
   * database's clock, the one `opened_at` was written by. A run without a hold
   * (no room composed) is not listed: nothing of it counts.
   */
  async listStalledStarts(input: Readonly<{ olderThanSeconds: number; limit: number }>): Promise<readonly DispatchableWorkItem[]> {
    if (!Number.isSafeInteger(input?.olderThanSeconds) || input.olderThanSeconds < 1) {
      throw new TypeError("Stalled start bound must be a positive whole number of seconds");
    }
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 1_000) {
      throw new TypeError("Stalled start limit must be an integer between 1 and 1000");
    }
    const result = await this.pool.query<{ work_item_id: string; run_id: string }>(
      `SELECT work.work_item_id, work.run_id
       FROM core.work_item AS work
       JOIN ledger.model_spend_hold AS hold ON hold.run_id = work.run_id
       WHERE work.state = 'READY'
         AND hold.opened_at <= clock_timestamp() - make_interval(secs => $1)
       ORDER BY work.created_at_seq, work.work_item_id
       LIMIT $2`,
      [input.olderThanSeconds, input.limit]
    );
    return Object.freeze(result.rows.map((row) => Object.freeze({
      runId: row.run_id,
      workItemId: row.work_item_id
    })));
  }

  /**
   * Queues a job on a transaction the caller owns and will commit — the room's
   * locked decision (budget spec §2.6, B6b/B7b): the job then commits with the
   * run's hold, its charge scope and its start mark, or not at all, so no READY
   * job can exist without what counts it. `allocateSequence` locks the one shared
   * sequence row until that COMMIT, so the caller runs this as its LAST statement.
   */
  async enqueueOn(client: PoolClient, input: EnqueueWorkInput): Promise<string> {
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
  }

  async enqueue(input: EnqueueWorkInput): Promise<string> {
    return withWriteTransaction(this.pool, (client) => this.enqueueOn(client, input));
  }

  /**
   * Spec §3, "the database refuses to give a runner another release's debate": the oldest claimable item of this
   * fence's release. A run-less item stays claimable by any fence, as before (D3; it still ends in
   * WORK_ITEM_WITHOUT_RUN).
   */
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
          SELECT work_item_id FROM core.work_item AS item
          WHERE (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))
            AND (item.run_id IS NULL
              OR EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id = item.run_id AND run.release_key = $3))
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
        [input.workerId, input.claimSeconds, this.#fence.releaseKey]
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

  /** Spec §3: as `claimNext`, for the one item Hatchet handed over; another release's item is never claimed (null). */
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
          SELECT work_item_id FROM core.work_item AS item
          WHERE work_item_id = $1
            AND (state = 'READY' OR (state = 'CLAIMED' AND claim_deadline <= clock_timestamp()))
            AND (item.run_id IS NULL
              OR EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id = item.run_id AND run.release_key = $4))
          FOR UPDATE SKIP LOCKED
        )
        UPDATE core.work_item AS item
        SET state = 'CLAIMED', claimed_by = $2,
            claim_deadline = clock_timestamp() + make_interval(secs => $3)
        FROM candidate WHERE item.work_item_id = candidate.work_item_id
        RETURNING item.work_item_id, item.command_key, item.battery_row_id,
                  item.node_set, item.claimed_by, item.claim_deadline, item.run_id`,
        [input.workItemId, input.workerId, input.claimSeconds, this.#fence.releaseKey]
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

  /**
   * L4-F9 repair — extends a running copy's claim by `claimSeconds` from now, in
   * its own short transaction (ADR-0017 §3(c): "extend the claim in a short
   * separate transaction"; ADR-0009 clause 7(a) forbids only an open one across a
   * call). The FENCE is the deadline this copy last saw: a copy that claimed the
   * item after this one's claim lapsed wrote its own deadline, under the same
   * worker id when it is a Hatchet retry in the same process, so the worker id
   * alone cannot tell the two apart. The ±1 ms covers the driver reading the
   * microsecond column as a millisecond Date; two claims of one item are always
   * at least a claim length apart.
   */
  async renewClaim(input: {
    readonly workItemId: string;
    readonly workerId: string;
    readonly claimSeconds: number;
    readonly heldUntil: Date;
  }): Promise<ClaimRenewal> {
    if (!Number.isFinite(input.claimSeconds) || input.claimSeconds <= 0) {
      throw new TypeError("claimSeconds must be a positive register value");
    }
    return withWriteTransaction(this.pool, async (client) => {
      const result = await client.query<{ claim_deadline: Date | null; state: string | null }>(
        `WITH renewed AS (
          UPDATE core.work_item
          SET claim_deadline = clock_timestamp() + make_interval(secs => $3)
          WHERE work_item_id = $1 AND state = 'CLAIMED' AND claimed_by = $2
            AND claim_deadline BETWEEN $4::timestamptz - interval '1 millisecond'
                                   AND $4::timestamptz + interval '1 millisecond'
          RETURNING claim_deadline
        )
        SELECT (SELECT claim_deadline FROM renewed) AS claim_deadline,
               (SELECT state FROM core.work_item WHERE work_item_id = $1) AS state`,
        [input.workItemId, input.workerId, input.claimSeconds, input.heldUntil]
      );
      const row = result.rows[0];
      if (row?.claim_deadline != null) return { kind: "RENEWED", claimDeadline: row.claim_deadline };
      return row?.state === "DONE" || row?.state === "FAILED" ? { kind: "FINISHED" } : { kind: "LOST" };
    });
  }

  /**
   * Records the work item DONE with its settled attempt and artifact. R3 (final review), spec §3/§4: a repository that
   * names its worker settles only that worker's own claim (`state = 'CLAIMED' AND claimed_by = worker`), so a task
   * finishing after the backstop set its debate aside FAILED (RUN_SET_ASIDE, with the waiver) never writes DONE over it,
   * and never settles another worker's claim. One told no worker id (test fixtures) settles a READY or CLAIMED item, and
   * never a FAILED one either. True when this call wrote it.
   */
  async settle(input: { readonly workItemId: string; readonly attemptId: string; readonly artifactRef: string }): Promise<boolean> {
    return withWriteTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE core.work_item
         SET state = 'DONE', claimed_by = NULL, claim_deadline = NULL,
             settled_attempt_id = $2, settled_artifact_ref = $3
         WHERE work_item_id = $1 AND settled_attempt_id IS NULL
           AND state IN ('READY','CLAIMED')
           AND ($4::text IS NULL OR (state = 'CLAIMED' AND claimed_by = $4::text))`,
        [input.workItemId, input.attemptId, input.artifactRef, this.#fence.workerId]
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

  /**
   * The asker's submit threw after the run row was written, so no runner will
   * ever claim the run: its first job is recorded FAILED with `reason`, created
   * FAILED when the failure came before it was queued. A job a runner already
   * claimed or settled is left alone — that debate is under way. True when the
   * run now reads FAILED because of this call.
   */
  async recordSetupFailure(input: {
    readonly runId: string;
    readonly batteryRowId: BatteryRowId;
    readonly commandKey: string;
    readonly reason: string;
  }): Promise<boolean> {
    if (input.reason.trim().length === 0) {
      throw new TypeError("Setup failure reason must be a typed non-empty value");
    }
    return withWriteTransaction(this.pool, async (client) => {
      const sequence = await allocateSequence(client);
      const result = await client.query(
        `INSERT INTO core.work_item (
          run_id, battery_row_id, node_set, command_key, state, terminal_reason, created_at_seq
        ) VALUES ($1,$2,'[]'::jsonb,$3,'FAILED',$4,$5)
        ON CONFLICT (command_key) DO UPDATE
          SET state = 'FAILED', terminal_reason = EXCLUDED.terminal_reason
          WHERE core.work_item.run_id = EXCLUDED.run_id AND core.work_item.state = 'READY'`,
        [input.runId, input.batteryRowId, input.commandKey, input.reason, sequence]
      );
      return result.rowCount === 1;
    });
  }

  /**
   * Records a run's work item FAILED with `reason`. Spec §3: only an item of this fence's release, and never one under
   * another worker's live claim — that copy is still running the debate (D2). An item of its own release already
   * FAILED is re-written with the new reason, as before (D2). True when the item now reads FAILED with `reason`.
   *
   * R7 (final review): `heldUntil` is the failing copy's own word about the claim, for two copies of one item in one
   * process under the same worker id (a Hatchet retry, a second dispatch). `null`: this copy never claimed the item, so
   * it writes over no live claim at all, its sibling's included. A deadline: the one this copy last set, and a live
   * claim is written only when it still carries that deadline (±1 ms, the driver's millisecond Date of the microsecond
   * column, exactly as `renewClaim`'s fence), so a stale copy never fails the claim a later copy took. Absent: today's
   * fence (this worker's live claim is written).
   */
  async recordTerminalFailure(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly reason: string;
    readonly heldUntil?: Date | null;
  }): Promise<boolean> {
    if (input.reason.trim().length === 0) {
      throw new TypeError("Terminal failure reason must be a typed non-empty value");
    }
    if (input.heldUntil !== undefined && input.heldUntil !== null
      && !(input.heldUntil instanceof Date && Number.isFinite(input.heldUntil.getTime()))) {
      throw new TypeError("TERMINAL_FAILURE_HELD_UNTIL_INVALID");
    }
    return withWriteTransaction(this.pool, async (client) => {
      const failed = await client.query(
        `UPDATE core.work_item AS item
         SET state = 'FAILED', claimed_by = NULL, claim_deadline = NULL,
             terminal_reason = $3
         FROM core.run AS run
         WHERE item.work_item_id = $1 AND item.run_id = $2
           AND item.state <> 'DONE' AND item.settled_attempt_id IS NULL
           AND run.run_id = item.run_id AND run.release_key = $4
           AND NOT (item.state = 'CLAIMED' AND item.claim_deadline > clock_timestamp()
                    AND (item.claimed_by IS DISTINCT FROM $5::text
                         OR ($6::boolean AND ($7::timestamptz IS NULL
                             OR item.claim_deadline NOT BETWEEN $7::timestamptz - interval '1 millisecond'
                                                            AND $7::timestamptz + interval '1 millisecond'))))`,
        [input.workItemId, input.runId, input.reason, this.#fence.releaseKey, this.#fence.workerId,
          input.heldUntil !== undefined, input.heldUntil ?? null]
      );
      return failed.rowCount === 1;
    });
  }

  /**
   * Spec §4 steps 1-4 (the backstop): records this fence's release's open work — READY, or CLAIMED by this worker or
   * with the claim lapsed, never settled — FAILED with `runSetAsideReason(reason)`, at most `limit` items, oldest
   * first; the caller pages while a full page comes back. Another worker's live claim is left alone (D2).
   * Spec §9 "the waiver": a set-aside run never uses the person's quota. On the caller's transaction this writes the
   * FAILED rows AND one waiver per distinct returned run, so both commit together or not at all.
   */
  async setAsideOpenWorkOn(
    client: PoolClient,
    input: Readonly<{ reason: SetAsideReason; limit: number }>
  ): Promise<readonly SetAsideWorkItem[]> {
    const terminalReason = runSetAsideReason(input?.reason);
    assertWorkLimit(input.limit, "Set-aside");
    const result = await client.query<{ work_item_id: string; run_id: string }>(
      `WITH candidate AS (
         SELECT item.work_item_id
         FROM core.work_item AS item
         JOIN core.run AS run ON run.run_id = item.run_id AND run.release_key = $1
         WHERE item.state IN ('READY','CLAIMED') AND item.settled_attempt_id IS NULL
           AND NOT (item.state = 'CLAIMED' AND item.claim_deadline > clock_timestamp()
                    AND item.claimed_by IS DISTINCT FROM $4::text)
         ORDER BY item.created_at_seq, item.work_item_id
         LIMIT $3
         FOR UPDATE OF item
       ), set_aside AS (
         UPDATE core.work_item AS item
         SET state = 'FAILED', claimed_by = NULL, claim_deadline = NULL, terminal_reason = $2
         FROM candidate
         WHERE item.work_item_id = candidate.work_item_id
         RETURNING item.work_item_id, item.run_id, item.created_at_seq
       )
       SELECT work_item_id, run_id FROM set_aside ORDER BY created_at_seq, work_item_id`,
      [this.#fence.releaseKey, terminalReason, input.limit, this.#fence.workerId]
    );
    await waiveSetAsideRuns(client, result.rows.map((row) => row.run_id), input.reason);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      runId: row.run_id,
      workItemId: row.work_item_id
    })));
  }

  /** `setAsideOpenWorkOn` in its own write transaction: the FAILED rows and their runs' waivers commit together. */
  async setAsideOpenWork(input: Readonly<{ reason: SetAsideReason; limit: number }>): Promise<readonly SetAsideWorkItem[]> {
    return withWriteTransaction(this.pool, (client) => this.setAsideOpenWorkOn(client, input));
  }

  /**
   * Spec §4, §9: sets one open work item of `runId` aside — FAILED with `runSetAsideReason(reason)` — only when its run
   * belongs to this fence's release and it is not settled. `readyOnly` limits it to a job never claimed; otherwise a
   * CLAIMED item qualifies too, except under another worker's live claim (D2). On the caller's transaction, with the
   * run's waiver (spec §9) when it wrote the item, so both commit together. True when this call wrote it. Plan C's
   * RELEASE_NOT_SERVED path does not come through here: it closes its never-claimed job through `recordSetupFailure`
   * with RUN_SETUP_FAILED:RELEASE_NOT_SERVED (shown to the person as "not started") and writes the waiver itself.
   */
  async setAsideWorkItemOn(
    client: PoolClient,
    input: Readonly<{ runId: string; workItemId: string; reason: SetAsideReason; readyOnly: boolean }>
  ): Promise<boolean> {
    const terminalReason = runSetAsideReason(input?.reason);
    if (typeof input.readyOnly !== "boolean") throw new TypeError("Set-aside readyOnly must be a boolean");
    const result = await client.query(
      `UPDATE core.work_item AS item
       SET state = 'FAILED', claimed_by = NULL, claim_deadline = NULL, terminal_reason = $3
       FROM core.run AS run
       WHERE item.work_item_id = $1 AND item.run_id = $2
         AND run.run_id = item.run_id AND run.release_key = $4
         AND item.settled_attempt_id IS NULL
         AND (item.state = 'READY' OR (NOT $6::boolean AND item.state = 'CLAIMED'
              AND NOT (item.claim_deadline > clock_timestamp() AND item.claimed_by IS DISTINCT FROM $5::text)))`,
      [input.workItemId, input.runId, terminalReason, this.#fence.releaseKey, this.#fence.workerId, input.readyOnly]
    );
    if (result.rowCount !== 1) return false;
    await waiveSetAsideRuns(client, [input.runId], input.reason);
    return true;
  }

  /** `setAsideWorkItemOn` in its own write transaction: the FAILED row and the run's waiver commit together. */
  async setAsideWorkItem(
    input: Readonly<{ runId: string; workItemId: string; reason: SetAsideReason; readyOnly: boolean }>
  ): Promise<boolean> {
    return withWriteTransaction(this.pool, (client) => this.setAsideWorkItemOn(client, input));
  }
}
