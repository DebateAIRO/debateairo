import type { Pool, PoolClient } from "pg";
import type { PieceSettingsVersion, WebSealed } from "./web-evidence.js";
// 0135 (W3-7): a dig's picks and its path rewrite's material, re-exported here (the package index's bytes are pinned by the
// migration audit, NATIVE_MIGRATE_MODULE_SHA256).
export * from "./dig-picks.js";

/**
 * The new dig model and the month pause (migration 0134; plan 2026-10-30 dig-model revision task W2-8 and its money rule
 * of 31 Oct): each dig's level, the path rewrite's turns and rewrites, and a running debate's pause at the month wall,
 * through 0134's definers only. `PostgresDigModelRepository` runs on the API's own pool (debateai_billing_runtime, which
 * also reaches the runtime role's readers by membership); `PostgresDigModelRunnerRepository` on the runner's pool
 * (debateai_runtime).
 *
 * What the later tasks must respect:
 * - W3-2 (the asks route): read the parent's level with `readDigLevel` before admission and refuse 409 DIG_TOO_DEEP when
 *   it is 10 (the contract's DIG_LEVEL_MAX); join with `PostgresInvestigationRepository.join`, which now calls
 *   identity.join_investigation_nested and answers TOO_DEEP itself under the locks (two quick clicks never reach 11).
 *   0133's identity.join_investigation keeps its grant (an expand step revokes nothing) but no code may call it.
 * - W3-5 (the path rewrite): when a dig settles, `takeRewriteTurn` for the path its picks came from; write only when
 *   `readRewriteTurn` says FRONT, on its `base_rewrite_id` (the path's current text; none: the story's line), then
 *   `recordRewrite`. WAIT_TURN: an earlier dig of the path is still writing; BASE_MOVED: rebuild the material. Every turn
 *   must end in a row (a FAILED one when all writers failed), or the path's later digs wait for ever. The content (the
 *   path's new line and summary, "What the dig changed", the verdict's reason, the dig's own paths' lines and fates) is
 *   sealed under the DIG's run key with carrier `PATH_REWRITE_CARRIER` and the rewrite id as its key. Its charges are
 *   spend source PATH_REWRITE on the dig's run; the person's window readers (packages/budget readOwnerSpentMicros,
 *   0140's billing.read_internal_grant_spent) count it.
 * - The web plan (W3-1 writes, packages/serve reads): `PostgresWebEvidenceRepository.recordPlanStatuses` (one row per
 *   run and path, written once) and `readPlanStatuses` (web-evidence.ts), over identity.web_plan_path.
 * - The month wall (W1-4/W3-2/W3-1): `recordPause` when the runner stops a debate's planned work at the month limit, with
 *   the month's reset and the planned work left; the runner does not continue a run whose state is PAUSED; `resume` on the
 *   person's Continue, once the room code finds room (the new month, or an upgrade).
 * - Day and week borrowing keeps NO record (owner money rule, point 3; W2-8's decision): what a running debate used past
 *   a day or week is derived from what is already stored. The person's windows tile the month from its anchor
 *   (billing-core computeWindows), each window's limit is the plan's (with its entitlement history), and every charge
 *   is in ledger.model_spend with its recorded_at, append-only. So for the windows w1 … wn of one kind since the month
 *   began, borrowed(w1) = 0 and borrowed(wk+1) = max(0, used(wk) + borrowed(wk) - limit(wk)): the window wk+1 starts
 *   lower by borrowed(wk+1), new starts wait while used + borrowed reaches the limit, and the page's notice ("to finish
 *   the current task, some of tomorrow's allowance was used") shows whenever borrowed(current) > 0. A stored record
 *   would be a second copy of the same numbers, able to drift from the ledger.
 */
type Executor = Pick<Pool, "query"> | PoolClient;

/** The one content carrier 0134 adds (packages/crypto CONTENT_CARRIERS), sealed under the dig's run key. */
export const PATH_REWRITE_CARRIER = "identity.path_rewrite" as const;
export const READ_DATA_EXPORT_DIG_MODEL = "identity.read_data_export_dig_model(uuid,uuid)" as const;

export type PathFate = "HELD_UP" | "PARTLY_HELD" | "FELL" | "SET_ASIDE";
export type PathRewriteOutcome = "READY" | "READY_WITH_RESERVATION" | "FAILED";
export type PathRewriteEntry = Readonly<{
  /** The dig's run: the key its content is sealed under. */
  run_id: string; parent_run_id: string; position_ref: string; path_seq: number; taken_at: string;
  state: PathRewriteOutcome | "WRITING";
  rewrite_id: string | null; parent_answer_version: number | null; based_on_rewrite_id: string | null;
  failure_code: string | null; fate_before: PathFate | null; fate_after: PathFate | null;
  verdict_outcome: "HELPED" | "DID_NOT_HELP" | "NOT_SETTLED" | null; verdict_scope: "PATH" | "MAIN_QUESTION" | null;
  writer_lineage: Record<string, unknown> | null; checker_lineage: Record<string, unknown> | null;
  rounds: number | null; artifact_refs: readonly unknown[] | null; recorded_at: string | null;
  content: unknown;
}>;
/** A debate's rewrites: every turn on its paths (each path's history in order, newest last) and its own turn as a dig. */
export type PathRewritesRead = Readonly<{ paths: readonly PathRewriteEntry[]; own: PathRewriteEntry | null }>;
export type RewriteTurnRead = Readonly<{
  parent_run_id: string; position_ref: string; path_seq: number;
  state: "DONE" | "FRONT" | "WAITING"; waiting_for: number; base_rewrite_id: string | null;
}>;
export type PathRewriteRecord = Readonly<{
  rewriteId: string;
  digRunId: string;
  parentAnswerVersion: number;
  /** The path's current text it was written on: the newest checked rewrite before this turn, or null (the story's line). */
  basedOnRewriteId: string | null;
  outcome: PathRewriteOutcome;
  failureCode: string | null;
  fateBefore: PathFate;
  fateAfter: PathFate | null;
  verdict: Readonly<{ outcome: "HELPED" | "DID_NOT_HELP" | "NOT_SETTLED"; scope: "PATH" | "MAIN_QUESTION" }> | null;
  writerLineage: Readonly<Record<string, unknown>> | null;
  checkerLineage: Readonly<Record<string, unknown>> | null;
  rounds: number;
  artifactRefs: readonly string[];
  /** Absent on a FAILED rewrite. */
  content: WebSealed | null;
}>;
export type RunPauseRead = Readonly<{
  run_id: string; state: "NONE" | "PAUSED" | "RESUMED"; since: string | null;
  reason: "MONTH_WALL" | null; resumable_at: string | null;
  planned_calls: number | null; planned_searches: number | null; planned_micros: number | null; paused_at: string | null;
}>;
export type DigLevelRead = Readonly<{ run_id: string; parent_run_id: string | null; dig_level: number }>;
/** V4 start step, Task 57f (0165): a debate as Continue sees it (core.read_run_continue). */
export type RunContinueRead = Readonly<{
  state: "NONE" | "OPEN" | "DONE" | "FAILED"; terminal_reason: string | null; content_live: boolean; waived: boolean; settled: boolean;
  paused: boolean; reopened: boolean;
  /** Task 57j (0168): how many re-opens of its newest work item ended FAILED again on their own (Task 57m-fix: never an update's set-aside). */
  failed_continues: number;
}>;
/** Task 57f (0165): what core.continue_failed_run did. */
export type RunReopenRead = "RECORDED" | "CONTINUING" | "NOT_FAILED" | "NOT_CONTINUABLE" | "NOT_OWNED" | "NOT_CURRENT" | "VERSION_NOT_PASSED";

export class PostgresDigModelRepository {
  constructor(private readonly pool: Executor) {}

  /** A debate's level (0 when it is in no investigation); null when it is not this account's. */
  async readDigLevel(ownerRef: string, runId: string): Promise<number | null> {
    return (await this.pool.query<{ level: number | null }>("SELECT identity.read_dig_level($1,$2) AS level", [ownerRef, runId]))
      .rows[0]?.level ?? null;
  }

  /** The levels of every debate of the investigation the debate is in, oldest first; null outside one or not its own. */
  async readDigLevels(ownerRef: string, runId: string): Promise<readonly DigLevelRead[] | null> {
    return (await this.pool.query<{ levels: DigLevelRead[] | null }>(
      "SELECT identity.read_investigation_dig_levels($1,$2) AS levels", [ownerRef, runId])).rows[0]?.levels ?? null;
  }

  /** The debate's path rewrites and its own as a dig, for its owner only (null otherwise). */
  async readPathRewrites(ownerRef: string, runId: string): Promise<PathRewritesRead | null> {
    return (await this.pool.query<{ rewrites: PathRewritesRead | null }>(
      "SELECT identity.read_path_rewrites($1,$2) AS rewrites", [ownerRef, runId])).rows[0]?.rewrites ?? null;
  }

  /** The person pressed Continue; the room code has already found room. */
  async resume(ownerRef: string, runId: string): Promise<"RECORDED" | "NOT_PAUSED" | "NOT_OWNED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "NOT_PAUSED" | "NOT_OWNED" }>(
      "SELECT identity.resume_paused_run($1,$2) AS outcome", [ownerRef, runId])).rows[0]!.outcome;
  }

  /**
   * Plan 2026-10-31 decision 12: Continue when the debate's release is not this one. The hand-over and the resume commit
   * together (0143); `toRegisterVersion` is one this release has passed. The room code has already found room.
   */
  async resumeInRelease(ownerRef: string, runId: string, toReleaseKey: string, toRegisterVersion: number)
    : Promise<"RECORDED" | "NOT_PAUSED" | "NOT_OWNED" | "NOT_CURRENT" | "VERSION_NOT_PASSED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "NOT_PAUSED" | "NOT_OWNED" | "NOT_CURRENT" | "VERSION_NOT_PASSED" }>(
      "SELECT identity.continue_paused_run_in_release($1,$2,$3,$4) AS outcome", [ownerRef, runId, toReleaseKey, toRegisterVersion])).rows[0]!.outcome;
  }

  /**
   * V4 start step, Task 57f (0165's core.read_run_continue): the person's own debate as Continue and its FAILED read see it, codes and flags
   * only (its newest work item's state and terminal reason, live, set aside, settled, paused, re-opened); null when it is not this account's.
   */
  async readRunContinue(ownerRef: string, runId: string): Promise<RunContinueRead | null> {
    return (await this.pool.query<{ facts: RunContinueRead | null }>("SELECT core.read_run_continue($1,$2) AS facts", [ownerRef, runId]))
      .rows[0]?.facts ?? null;
  }

  /**
   * Task 57f (0165's core.continue_failed_run): the person's Continue on their own FAILED debate: its work item goes back to be claimed and
   * the re-open is recorded; a debate of an older release moves to `toReleaseKey` (a version this release has passed) in the same transaction.
   * Whether its stop was ours is the API's rule, asked before this. The room code has already found room.
   */
  async continueFailedRun(ownerRef: string, runId: string, toReleaseKey: string | null, toRegisterVersion: number | null): Promise<RunReopenRead> {
    return (await this.pool.query<{ outcome: RunReopenRead }>("SELECT core.continue_failed_run($1,$2,$3,$4) AS outcome",
      [ownerRef, runId, toReleaseKey, toRegisterVersion])).rows[0]!.outcome;
  }

  /** The release and settings version that own the debate now (0143), for the API's hand-over decision. */
  async readRunReleaseNow(runId: string): Promise<Readonly<{ releaseKey: string; registerVersion: number }> | null> {
    const row = (await this.pool.query<{ release_key: string | null; register_version: number | null }>(
      "SELECT identity.run_release_now($1) AS release_key, identity.run_settings_version_now($1)::integer AS register_version", [runId])).rows[0];
    return row?.release_key === null || row?.release_key === undefined || row.register_version === null ? null
      : Object.freeze({ releaseKey: row.release_key, registerVersion: row.register_version });
  }

  async readPause(ownerRef: string, runId: string): Promise<RunPauseRead | null> {
    return (await this.pool.query<{ pause: RunPauseRead | null }>("SELECT identity.read_run_pause($1,$2) AS pause",
      [ownerRef, runId])).rows[0]?.pause ?? null;
  }

  /** The account's debates paused now, oldest pause first. */
  async readPausedRuns(ownerRef: string): Promise<readonly RunPauseRead[]> {
    return (await this.pool.query<{ paused: RunPauseRead[] }>("SELECT identity.read_paused_runs($1) AS paused", [ownerRef]))
      .rows[0]!.paused;
  }
}

export class PostgresDigModelRunnerRepository {
  constructor(private readonly pool: Executor) {}

  async readDigLevel(runId: string): Promise<number> {
    return (await this.pool.query<{ level: number }>("SELECT identity.read_dig_level_of_run($1) AS level", [runId])).rows[0]!.level;
  }

  /** The dig settled: its place in the line of rewrites of the path it was dug from. */
  async takeRewriteTurn(digRunId: string, parentRunId: string, positionRef: string): Promise<Readonly<{
    outcome: "TAKEN" | "ALREADY" | "CONFLICT" | "NOT_LIVE" | "NOT_A_DIG"; pathSeq: number | null }>> {
    const row = (await this.pool.query<{ outcome: "TAKEN" | "ALREADY" | "CONFLICT" | "NOT_LIVE" | "NOT_A_DIG"; path_seq: number | null }>(
      "SELECT outcome,path_seq FROM identity.take_path_rewrite_turn($1,$2,$3)", [digRunId, parentRunId, positionRef])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, pathSeq: row.path_seq });
  }

  async readRewriteTurn(digRunId: string): Promise<RewriteTurnRead | null> {
    return (await this.pool.query<{ turn: RewriteTurnRead | null }>("SELECT identity.read_path_rewrite_turn($1) AS turn", [digRunId]))
      .rows[0]?.turn ?? null;
  }

  /** Task 57p: 0169's writer, the rewrite's settings version last. */
  async recordRewrite(record: PathRewriteRecord & PieceSettingsVersion): Promise<"RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_TURN" | "WAIT_TURN" | "BASE_MOVED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_TURN" | "WAIT_TURN" | "BASE_MOVED" }>(
      "SELECT identity.record_path_rewrite_with_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14::jsonb,$15::jsonb,$16,$17) AS outcome",
      [record.rewriteId, record.digRunId, record.parentAnswerVersion, record.basedOnRewriteId, record.outcome, record.failureCode,
        record.fateBefore, record.fateAfter, record.verdict?.outcome ?? null, record.verdict?.scope ?? null,
        record.writerLineage === null ? null : JSON.stringify(record.writerLineage),
        record.checkerLineage === null ? null : JSON.stringify(record.checkerLineage), record.rounds,
        JSON.stringify(record.artifactRefs), record.content === null ? null : JSON.stringify(record.content.envelope),
        record.content?.attestation ?? null, record.settingsVersion])).rows[0]!.outcome;
  }

  /** A live debate's rewrites (its paths' histories and its own as a dig); null when it is not a live private debate. */
  async readPathRewrites(runId: string): Promise<PathRewritesRead | null> {
    return (await this.pool.query<{ rewrites: PathRewritesRead | null }>(
      "SELECT identity.read_path_rewrites_of_run($1) AS rewrites", [runId])).rows[0]?.rewrites ?? null;
  }

  /** The month wall: the debate's remaining planned work pauses until the person continues. */
  async recordPause(input: Readonly<{ runId: string; reason: "MONTH_WALL"; resumableAt: Date; plannedCalls: number;
    plannedSearches: number; plannedMicros: number }>): Promise<"RECORDED" | "ALREADY_PAUSED" | "NOT_LIVE"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY_PAUSED" | "NOT_LIVE" }>(
      "SELECT identity.record_run_pause($1,$2,$3,$4,$5,$6) AS outcome",
      [input.runId, input.reason, input.resumableAt, input.plannedCalls, input.plannedSearches, input.plannedMicros])).rows[0]!.outcome;
  }

  async readPause(runId: string): Promise<RunPauseRead | null> {
    return (await this.pool.query<{ pause: RunPauseRead | null }>("SELECT identity.read_run_pause_of_run($1) AS pause", [runId]))
      .rows[0]?.pause ?? null;
  }
}
