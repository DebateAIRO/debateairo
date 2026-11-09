import type { Pool, PoolClient } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";
import type { WebSealed } from "./web-evidence.js";
import type { PathFate, PathRewriteRecord } from "./dig-model.js";

/**
 * Tree updates, main-answer updates and purpose lines (migration 0138; plan 2026-10-31-r22-owner-changes decisions 2, 3, 5), through 0138's definers
 * only. `PostgresTreeUpdateRunnerRepository` runs on the runner's pool (since 0171 its writers, its mark, its turns and `readClimbNext` need the
 * cross-account marker (debateai_rls_all_accounts), which the runner, the scheduler and the API's system pool outside a request hold and the API's request login
 * does not; the readers the API's answer read calls too, `readLine`, `readMainAnswers` and `readPurposeLines`, stay debateai_runtime's);
 * `PostgresTreeUpdateRepository` on the API's own pool (debateai_billing_runtime).
 *
 * What the Tree lane must respect:
 * - A rewrite that `changed` climbs: `readClimbNext(digOfThatPath)` names the path above; `takeTurn` (kind CLIMB, step 1, 2, …, its cause the
 *   rewrite below), `readTurn` until FRONT, write on its `base_kind`/`base_id`, then `record`. Stop when a level comes out unchanged, or at
 *   the first debate, where a change means the main answer is next. Every turn must end in a row (a FAILED one when all writers failed), or
 *   the path's later rewrites wait for ever. Sealed under the DIG that started the climb, carrier `PATH_UPDATE_CARRIER`, the update id as its
 *   key; charged PATH_CLIMB on that dig's run, never walled.
 * - A dig's own first rewrite now goes through `recordRewriteInLine`, which holds it to the whole line (0134's writer sees only its own rows).
 * - `recordMainAnswer` writes the answer's new version under the ROOT's key, `MAIN_ANSWER_UPDATE_CARRIER`; charged ANSWER_UPDATE on the
 *   triggering dig's run, `paidByOwnerRef` the digger's. BASE_MOVED: a newer version came, rebuild on it.
 * - `recordPurposeLines` at the ask, sealed under the run's key, `RUN_PURPOSE_LINES_CARRIER`, bound to the run's id; a dig reads its root's.
 * - The security review (0171, F5): 0138's owner readers of a path's line and of the main answer's versions, and its public closing and
 *   reopening, had no caller (the runner and the answer read use the no-owner readers, and 0147's public report took the closing's place);
 *   they are no role's any more, and nothing here offers them. The climb's turns and records and `recordMainAnswer` are the cross-account
 *   marker's now, as the runner's.
 */
type Executor = Pick<Pool, "query"> | PoolClient;

export const PATH_UPDATE_CARRIER = "identity.path_update" as const;
export const MAIN_ANSWER_UPDATE_CARRIER = "identity.main_answer_update" as const;
export const RUN_PURPOSE_LINES_CARRIER = "identity.run_purpose_lines" as const;
export const READ_DATA_EXPORT_TREE_UPDATES = "identity.read_data_export_tree_updates(uuid,uuid)" as const;

export type PathUpdateKind = "CLIMB" | "PUBLIC_DIG";
export type PathUpdateCauseKind = "PATH_REWRITE" | "PATH_UPDATE" | "DIG_SETTLED";
export type PathLineBaseKind = "PATH_REWRITE" | "PATH_UPDATE";
export type PathUpdateOutcome = "READY" | "READY_WITH_RESERVATION" | "FAILED";
export type PathUpdateTurnRead = Readonly<{
  update_id: string; parent_run_id: string; position_ref: string; kind: PathUpdateKind; climb_step: number;
  cause_kind: PathUpdateCauseKind; cause_id: string | null; state: "DONE" | "FRONT" | "WAITING"; waiting_for: number;
  base_kind: PathLineBaseKind | null; base_id: string | null;
}>;
export type PathUpdateRecord = Readonly<{
  updateId: string; basedOn: Readonly<{ kind: PathLineBaseKind; id: string }> | null; outcome: PathUpdateOutcome; failureCode: string | null;
  /** The writer's "really changed", worked out by code: false stops the climb. Null exactly on a FAILED update. */
  changed: boolean | null;
  fateBefore: PathFate; fateAfter: PathFate | null;
  writerLineage: Readonly<Record<string, unknown>> | null; checkerLineage: Readonly<Record<string, unknown>> | null;
  rounds: number; artifactRefs: readonly string[];
  /** Under the DIG's run key (`run_id` of the turn); null on a FAILED one. */
  content: WebSealed | null;
}>;
/** One turn of a path, either table's: `source` says which (a PATH_REWRITE's codes are in 0134's reader); open it under `run_id`. */
export type PathLineEntry = Readonly<{
  position_ref: string; source: PathLineBaseKind; entry_id: string | null; run_id: string; taken_at: string;
  state: PathUpdateOutcome | "WRITING"; changed: boolean | null; held: boolean; hidden: boolean;
  kind: PathUpdateKind | null; climb_step: number | null; cause_kind: PathUpdateCauseKind | null; cause_id: string | null;
  fate_before: PathFate | null; fate_after: PathFate | null; failure_code: string | null; recorded_at: string | null;
  content: CryptoEnvelope | null;
}>;
export type PathClimbNext = Readonly<{ parent_run_id: string; root_run_id: string; position_ref: string | null }>;
export type MainAnswerTriggerKind = "PATH_REWRITE" | "PATH_UPDATE";
export type MainAnswerUpdateRecord = Readonly<{
  updateId: string; rootRunId: string; basedOnUpdateId: string | null; triggerKind: MainAnswerTriggerKind; triggerId: string; triggerRunId: string;
  paidByOwnerRef: string | null; outcome: PathUpdateOutcome; failureCode: string | null;
  writerLineage: Readonly<Record<string, unknown>> | null; checkerLineage: Readonly<Record<string, unknown>> | null;
  rounds: number; artifactRefs: readonly string[]; spentMicros: number;
  /** Under the ROOT's run key; null on a FAILED one. */
  content: WebSealed | null;
}>;
export type MainAnswerUpdateRead = Readonly<{
  update_id: string; answer_seq: number; based_on_update_id: string | null; trigger_kind: MainAnswerTriggerKind; trigger_id: string;
  trigger_run_id: string; paid_by_owner_ref: string | null; outcome: PathUpdateOutcome; failure_code: string | null; recorded_at: string;
  content: CryptoEnvelope | null;
}>;

const lineage = (value: Readonly<Record<string, unknown>> | null): string | null => value === null ? null : JSON.stringify(value);

/** Runner pool (the cross-account marker since 0171, but `readLine`, `readMainAnswers` and `readPurposeLines`: debateai_runtime). */
export class PostgresTreeUpdateRunnerRepository {
  constructor(private readonly pool: Executor) {}

  /** 0153: this dig's rewrite, climb and any main-answer update have ended, so the test site's estimate stops holding it. */
  async markDigSettled(runId: string): Promise<void> {
    await this.pool.query("SELECT identity.mark_dig_tree_settled($1)", [runId]);
  }

  async takeTurn(input: Readonly<{ updateId: string; runId: string; parentRunId: string; positionRef: string; kind: PathUpdateKind;
    climbStep: number; causeKind: PathUpdateCauseKind; causeId: string | null }>):
    Promise<"TAKEN" | "ALREADY" | "CONFLICT" | "NOT_LIVE" | "NOT_A_DIG" | "NO_CAUSE"> {
    return (await this.pool.query<{ outcome: "TAKEN" | "ALREADY" | "CONFLICT" | "NOT_LIVE" | "NOT_A_DIG" | "NO_CAUSE" }>(
      "SELECT identity.take_path_update_turn($1,$2,$3,$4,$5,$6,$7,$8) AS outcome",
      [input.updateId, input.runId, input.parentRunId, input.positionRef, input.kind, input.climbStep, input.causeKind, input.causeId])).rows[0]!.outcome;
  }

  async readTurn(updateId: string): Promise<PathUpdateTurnRead | null> {
    return (await this.pool.query<{ turn: PathUpdateTurnRead | null }>("SELECT identity.read_path_update_turn($1) AS turn", [updateId])).rows[0]?.turn ?? null;
  }

  async record(record: PathUpdateRecord): Promise<"RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_TURN" | "WAIT_TURN" | "BASE_MOVED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_TURN" | "WAIT_TURN" | "BASE_MOVED" }>(
      "SELECT identity.record_path_update($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14) AS outcome",
      [record.updateId, record.basedOn?.kind ?? null, record.basedOn?.id ?? null, record.outcome, record.failureCode, record.changed,
        record.fateBefore, record.fateAfter, lineage(record.writerLineage), lineage(record.checkerLineage), record.rounds,
        JSON.stringify(record.artifactRefs), record.content === null ? null : JSON.stringify(record.content.envelope),
        record.content?.attestation ?? null])).rows[0]!.outcome;
  }

  /** 0134's writer, held to the whole line. */
  async recordRewriteInLine(lineBase: Readonly<{ kind: PathLineBaseKind; id: string }> | null, record: PathRewriteRecord):
    Promise<"RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_TURN" | "WAIT_TURN" | "BASE_MOVED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_TURN" | "WAIT_TURN" | "BASE_MOVED" }>(
      "SELECT identity.record_path_rewrite_in_line($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16::jsonb,$17::jsonb,$18) AS outcome",
      [lineBase?.kind ?? null, lineBase?.id ?? null, record.rewriteId, record.digRunId, record.parentAnswerVersion, record.basedOnRewriteId,
        record.outcome, record.failureCode, record.fateBefore, record.fateAfter, record.verdict?.outcome ?? null, record.verdict?.scope ?? null,
        lineage(record.writerLineage), lineage(record.checkerLineage), record.rounds, JSON.stringify(record.artifactRefs),
        record.content === null ? null : JSON.stringify(record.content.envelope), record.content?.attestation ?? null])).rows[0]!.outcome;
  }

  /** A live debate's paths, every turn in order, a public dig the check has not allowed marked; null when not live or, in a request, not the connection's own (0171). */
  async readLine(runId: string): Promise<readonly PathLineEntry[] | null> {
    return (await this.pool.query<{ line: PathLineEntry[] | null }>("SELECT identity.read_path_line_of_run($1) AS line", [runId])).rows[0]?.line ?? null;
  }

  /** The debate and path a dig was dug from; null at a first debate. A null position_ref ends the climb too. */
  async readClimbNext(runId: string): Promise<PathClimbNext | null> {
    return (await this.pool.query<{ next: PathClimbNext | null }>("SELECT identity.read_path_climb_next($1) AS next", [runId])).rows[0]?.next ?? null;
  }

  async recordMainAnswer(record: MainAnswerUpdateRecord): Promise<Readonly<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "BASE_MOVED"; answerSeq: number | null }>> {
    const row = (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "BASE_MOVED"; answer_seq: number | null }>(
      "SELECT outcome,answer_seq FROM identity.record_main_answer_update($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13::jsonb,$14,$15::jsonb,$16)",
      [record.updateId, record.rootRunId, record.basedOnUpdateId, record.triggerKind, record.triggerId, record.triggerRunId, record.paidByOwnerRef,
        record.outcome, record.failureCode, lineage(record.writerLineage), lineage(record.checkerLineage), record.rounds,
        JSON.stringify(record.artifactRefs), record.spentMicros, record.content === null ? null : JSON.stringify(record.content.envelope),
        record.content?.attestation ?? null])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, answerSeq: row.answer_seq });
  }

  async readMainAnswers(runId: string): Promise<readonly MainAnswerUpdateRead[] | null> {
    return (await this.pool.query<{ updates: MainAnswerUpdateRead[] | null }>(
      "SELECT identity.read_main_answer_updates_of_run($1) AS updates", [runId])).rows[0]?.updates ?? null;
  }

  /** The debate's sealed purpose lines; null when it has none (an old debate), is not live or, in a request, is not the connection's own (0171). */
  async readPurposeLines(runId: string): Promise<CryptoEnvelope | null> {
    return (await this.pool.query<{ lines: CryptoEnvelope | null }>(
      "SELECT identity.read_run_purpose_lines_of_run($1) AS lines", [runId])).rows[0]?.lines ?? null;
  }
}

/** The API's pool (debateai_billing_runtime). */
export class PostgresTreeUpdateRepository {
  constructor(private readonly pool: Executor) {}

  async recordPurposeLines(ownerRef: string, runId: string, sealed: WebSealed): Promise<"RECORDED" | "ALREADY" | "NOT_OWNED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_OWNED" }>(
      "SELECT identity.record_run_purpose_lines($1,$2,$3::jsonb,$4) AS outcome",
      [ownerRef, runId, JSON.stringify(sealed.envelope), sealed.attestation])).rows[0]!.outcome;
  }

  async readPurposeLines(ownerRef: string, runId: string): Promise<CryptoEnvelope | null> {
    return (await this.pool.query<{ lines: CryptoEnvelope | null }>(
      "SELECT identity.read_run_purpose_lines($1,$2) AS lines", [ownerRef, runId])).rows[0]?.lines ?? null;
  }
}
