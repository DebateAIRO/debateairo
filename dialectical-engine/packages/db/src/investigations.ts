import type { Pool, PoolClient } from "pg";
// 0136 (W5-1): the final report over an investigation, re-exported here (the package index's bytes are pinned by the
// migration audit, NATIVE_MIGRATE_MODULE_SHA256).
export * from "./investigation-reports.js";

/**
 * Investigations and the one reserve (migration 0133; Perplexity plan 2026-10-30, task W1-3; owner answers Q2, Q4, Q5):
 * a debate and its digs as one budget unit, its closings by report version (a reopening keeps the earlier ones), the
 * server-side dig parent (joining writes 0131's dig link too), the person's ONE reserve, and the page texts' wipe on
 * closing and 30 days after the last activity. 0133's definers only; no table is read directly.
 *
 * Pools: `PostgresInvestigationRepository` on the API's own pool (debateai_billing_runtime), which also reaches the runtime role's readers by
 * membership; `PostgresInvestigationRunnerRepository` on the runner's or the scheduler's pool (debateai_runtime; `wipeInactivePageText`, the sweep's
 * wipe, needs the cross-account marker (debateai_rls_all_accounts), which the runner, the scheduler and the API's system pool outside a request hold
 * and the API's request login does not, since 0154).
 *
 * What W3-2 and W5-1 must respect:
 * - A closing is `close` (the investigation, the version; since R22 decision 7 no wipe of every text).
 * - `wipeInactivePageText` is the scheduler's sweep (owner Q4: 30 days after the investigation's last activity, even
 *   while it is open). Call `touch` when the person acts on an investigation, so its texts stay while it is in use.
 * - The security review (0154, F5): 0133's reserve writer and reader, its read of one investigation by its owner, its
 *   first join, its first closing and its mark of a closing's report had no caller (0136's report writer marks the closing
 *   as its owner) and are no role's any more, so nothing here offers them. The reserve's table stays (the data export
 *   still reads its events), and the runner reads an investigation through `ofRun`.
 */
type Executor = Pick<Pool, "query"> | PoolClient;

export type JoinOutcome = "JOINED" | "ALREADY" | "NOT_OWNED" | "CLOSED" | "CONFLICT" | "TOO_DEEP";

export type InvestigationRead = Readonly<{
  investigation_id: string; root_run_id: string; state: "open" | "closed"; opened_at: string; last_activity_at: string;
  closed_at: string | null; report_version: number;
  members: readonly Readonly<{ run_id: string; parent_run_id: string | null; places: string[];
    mode: "quick" | "thorough" | null; joined_at: string }>[];
  closings: readonly Readonly<{ report_version: number; closed_at: string; reopened_at: string | null;
    report_ref: string | null; report_written_at: string | null }>[];
}>;

export class PostgresInvestigationRepository {
  constructor(private readonly pool: Executor) {}

  /** The investigation the debate is in, opening one with it as the root; null when it is not this account's. */
  async open(ownerRef: string, runId: string): Promise<string | null> {
    return (await this.pool.query<{ id: string | null }>("SELECT identity.open_investigation($1,$2) AS id", [ownerRef, runId]))
      .rows[0]?.id ?? null;
  }

  /**
   * The server-side dig parent: the dig joins its parent's investigation and its dig link is written with it. Since 0134
   * through identity.join_investigation_nested (0133's join plus the dig level): TOO_DEEP when the parent is at level 10
   * (nothing written); `digLevel` is the dig's level on JOINED and ALREADY. 0133's identity.join_investigation is no
   * longer called.
   */
  async join(input: Readonly<{ ownerRef: string; parentRunId: string; childRunId: string; places: readonly string[];
    mode: "quick" | "thorough" }>): Promise<Readonly<{
      outcome: JoinOutcome; investigationId: string | null; digLevel: number | null }>> {
    const row = (await this.pool.query<{ outcome: JoinOutcome; investigation_id: string | null; dig_level: number | null }>(
      "SELECT outcome,investigation_id,dig_level FROM identity.join_investigation_nested($1,$2,$3,$4::text[],$5)",
      [input.ownerRef, input.parentRunId, input.childRunId, [...input.places], input.mode])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, investigationId: row.investigation_id, digLevel: row.dig_level });
  }

  async touch(ownerRef: string, runId: string): Promise<Date | null> {
    return (await this.pool.query<{ at: Date | null }>("SELECT identity.touch_investigation($1,$2) AS at", [ownerRef, runId]))
      .rows[0]?.at ?? null;
  }

  /** "Write my report": closes, numbers the next report version and wipes the investigation's page texts. */
  /** R22 decision 7: 0139's closing, without 0133's wipe of every text ("other pages" keep their 30 days); `wipedTexts` is always 0. */
  async close(ownerRef: string, investigationId: string): Promise<Readonly<{
    outcome: "CLOSED" | "ALREADY_CLOSED" | "NOT_OWNED"; reportVersion: number | null; wipedTexts: number }>> {
    const row = (await this.pool.query<{ outcome: "CLOSED" | "ALREADY_CLOSED" | "NOT_OWNED"; report_version: number | null; wiped_texts: number }>(
      "SELECT outcome,report_version,wiped_texts FROM identity.close_investigation_keeping_texts($1,$2)", [ownerRef, investigationId])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, reportVersion: row.report_version, wipedTexts: row.wiped_texts });
  }

  async reopen(ownerRef: string, investigationId: string): Promise<"REOPENED" | "ALREADY_OPEN" | "NOT_OWNED"> {
    return (await this.pool.query<{ outcome: "REOPENED" | "ALREADY_OPEN" | "NOT_OWNED" }>(
      "SELECT identity.reopen_investigation($1,$2) AS outcome", [ownerRef, investigationId])).rows[0]!.outcome;
  }
}

export class PostgresInvestigationRunnerRepository {
  constructor(private readonly pool: Executor) {}

  async ofRun(runId: string): Promise<InvestigationRead | null> {
    return (await this.pool.query<{ investigation: InvestigationRead | null }>(
      "SELECT identity.read_investigation_of_run($1) AS investigation", [runId])).rows[0]?.investigation ?? null;
  }

  /**
   * The scheduler's sweep: at most `limit` texts whose investigation was idle more than 30 days, never of a debate that still
   * has open work or an investigation with a debate that has (0143: a paused debate needs them when it continues).
   */
  async wipeInactivePageText(limit = 500): Promise<number> {
    return (await this.pool.query<{ wiped: number }>("SELECT identity.wipe_inactive_web_page_text_of_idle_debates($1) AS wiped", [limit])).rows[0]!.wiped;
  }
}
