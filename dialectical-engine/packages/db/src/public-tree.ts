import type { Pool, PoolClient } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";
import type { MainAnswerUpdateRecord, MainAnswerUpdateRead, PathClimbNext, PathLineEntry, PathUpdateCauseKind, PathUpdateKind, PathUpdateRecord, PathUpdateTurnRead } from "./tree-updates.js";
import type { WebSealed } from "./web-evidence.js";

/**
 * The public tree (migration 0147; plan 2026-10-31-r22-owner-changes decisions 13 and 22), through 0147's definers only. Every dig on a public
 * debate, the author's too, lives on the PUBLICATION (0137's identity.public_contribution), never in an investigation: an investigation goes with its
 * first author's account. `PostgresPublicTreeRepository` runs on the API's own pool (debateai_billing_runtime); `PostgresPublicTreeRunnerRepository`
 * on the runner's pool, whose `tree` side has the shape path-climb.ts asks of `PostgresTreeUpdateRunnerRepository`, with the public tree's rule: the
 * debate above may have no key left. `PostgresPublicPageRepository` is the API's sweep, and its anonymous read. Since 0154 (the security review, F5)
 * the readers, listers, marks and page writers here that take no owner need the cross-account marker (debateai_rls_all_accounts), which the runner,
 * the scheduler and the API's system pool outside a request hold and the API's request login does not, and so do the runner's writers and turns of
 * a public dig and the page sweep's report check: each class says which it needs. `readLine` (the API's own dig rewrite read too) and `readReports`
 * (the public page's read) stay debateai_runtime's, which the API's roles inherit.
 */
type Executor = Pick<Pool, "query"> | PoolClient;

/** What seals the runner's copy of the public page, the carrier the API and the runner both name. */
export const PUBLIC_MATERIAL_CARRIER = "identity.public_material" as const;
export const PUBLIC_DIG_INPUT_CARRIER = "identity.public_dig_input" as const;
export const PUBLIC_ANSWER_UPDATE_CARRIER = "identity.public_answer_update" as const;
export const PUBLIC_REPORT_CARRIER = "identity.public_report" as const;

export type PublicDigParentRead = Readonly<{ root_run_id: string; parent_run_id: string; level: number; writing: boolean }>;
export type PublicTreeJoinOutcome = "JOINED" | "ALREADY" | "NOT_OWNED" | "NOT_PUBLIC" | "PARENT_PRIVATE" | "CONFLICT" | "TOO_DEEP";
export type PublicReportOpened = Readonly<{
  outcome: "OPENED" | "WRITING" | "ONGOING" | "NOT_PUBLIC" | "NO_CARRIER"; reportId: string | null; reportVersion: number | null; carrierRunId: string | null;
}>;
export type PublicTreeOfRun = Readonly<{ publication_ref: string; dig_update_id: string | null }>;

/** The API's pool (debateai_billing_runtime). */
export class PostgresPublicTreeRepository {
  constructor(private readonly pool: Executor) {}

  async readDigParent(publicationRef: string, digUpdateId: string | null): Promise<PublicDigParentRead | null> {
    return (await this.pool.query<{ parent: PublicDigParentRead | null }>("SELECT identity.read_public_dig_parent($1,$2) AS parent", [publicationRef, digUpdateId])).rows[0]?.parent ?? null;
  }

  async join(input: Readonly<{ ownerRef: string; publicationRef: string; parentRunId: string; childRunId: string; positionRef: string }>):
    Promise<Readonly<{ outcome: PublicTreeJoinOutcome; digLevel: number | null }>> {
    const row = (await this.pool.query<{ outcome: PublicTreeJoinOutcome; dig_level: number | null }>(
      "SELECT outcome,dig_level FROM identity.join_public_tree($1,$2,$3,$4,$5)",
      [input.ownerRef, input.publicationRef, input.parentRunId, input.childRunId, input.positionRef])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, digLevel: row.dig_level });
  }

  /**
   * The public copy, sealed under `runId`'s key with PUBLIC_MATERIAL_CARRIER, the material id its binding. Since 0154 it is refused
   * (REQUEST_OWNER_MISMATCH) unless it is a dig's copy keyed by the dig's own run, the connection's own, or a report's copy for a report still
   * open on this publication and carrier that the connection's owner opened.
   */
  async recordMaterial(materialId: string, runId: string, publicationRef: string, kind: "DIG" | "REPORT", sealed: WebSealed): Promise<"RECORDED" | "ALREADY" | "NOT_LIVE"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" }>(
      "SELECT identity.record_public_material($1,$2,$3,$4,$5::jsonb,$6) AS outcome",
      [materialId, runId, publicationRef, kind, JSON.stringify(sealed.envelope), sealed.attestation])).rows[0]!.outcome;
  }

  async openReport(ownerRef: string, publicationRef: string, reportId: string, free: boolean): Promise<PublicReportOpened> {
    const row = (await this.pool.query<{ outcome: PublicReportOpened["outcome"]; report_id: string | null; report_version: number | null; carrier_run_id: string | null }>(
      "SELECT outcome,report_id,report_version,carrier_run_id FROM identity.open_public_report($1,$2,$3,$4)", [ownerRef, publicationRef, reportId, free])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, reportId: row.report_id, reportVersion: row.report_version, carrierRunId: row.carrier_run_id });
  }

  async readTreeOfRun(runId: string): Promise<PublicTreeOfRun | null> {
    return (await this.pool.query<{ tree: PublicTreeOfRun | null }>("SELECT identity.read_public_tree_of_run($1) AS tree", [runId])).rows[0]?.tree ?? null;
  }
}

export type PublicMaterialRead = Readonly<{ run_id: string; publication_ref: string; kind: "DIG" | "REPORT"; recorded_at: string; content: CryptoEnvelope }>;
export type PublicDigUnsettled = Readonly<{ dig_run_id: string; finished: boolean }>;
export type PublicReportUnwritten = Readonly<{
  report_id: string; publication_ref: string; report_version: number; carrier_run_id: string; writer_ref: string | null; free: boolean; requested_at: string;
}>;
export type PublicReportRecord = Readonly<{
  reportId: string; outcome: "READY" | "READY_WITH_RESERVATION" | "FAILED"; storyOutcome: "READY" | "READY_WITH_RESERVATION" | "FAILED" | null; failureCode: string | null;
  fingerprint: string | null; ladderStep: number | null; leftOut: number | null; answerRounds: number | null; storyRounds: number | null;
  writerLineage: Readonly<Record<string, unknown>> | null; checkerLineage: Readonly<Record<string, unknown>> | null; artifactRefs: readonly string[]; spentMicros: number;
  /** Under the CARRIER's run key, bound to the report id; null on a FAILED one. */
  content: WebSealed | null;
}>;
const lineage = (value: Readonly<Record<string, unknown>> | null): string | null => value === null ? null : JSON.stringify(value);

/**
 * The runner's pool. `takeTurn`...`readClimbNext` are what path-climb.ts's `ports.tree` asks. Every method but `readLine` (debateai_runtime, the
 * API's own dig rewrite read's too, which since 0154 hands a request only the rows of the connection's own runs) needs the cross-account marker
 * (debateai_rls_all_accounts), which the runner, the scheduler and the API's system pool outside a request hold and the API's request login does not
 * (0154): the public dig's input, turns, copies and report, and the sweeps' readers, listers and marks.
 */
export class PostgresPublicTreeRunnerRepository {
  constructor(private readonly pool: Executor) {}

  async readMaterial(materialId: string): Promise<PublicMaterialRead | null> {
    return (await this.pool.query<{ material: PublicMaterialRead | null }>("SELECT identity.read_public_material($1) AS material", [materialId])).rows[0]?.material ?? null;
  }

  /** The dig's own paths, once, sealed by the caller under its key, the run id its binding. */
  async recordDigInput(runId: string, workItemId: string, sealed: WebSealed): Promise<"RECORDED" | "ALREADY" | "NOT_LIVE" | "NOT_A_DIG"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "NOT_A_DIG" }>(
      "SELECT identity.record_public_dig_input($1,$2,$3::jsonb,$4) AS outcome", [runId, workItemId, JSON.stringify(sealed.envelope), sealed.attestation])).rows[0]!.outcome;
  }

  async readDigInput(runId: string): Promise<Readonly<{ work_item_id: string; content: CryptoEnvelope }> | null> {
    return (await this.pool.query<{ input: { work_item_id: string; content: CryptoEnvelope } | null }>("SELECT identity.read_public_dig_input($1) AS input", [runId])).rows[0]?.input ?? null;
  }

  async takeTurn(input: Readonly<{ updateId: string; runId: string; parentRunId: string; positionRef: string; kind: PathUpdateKind;
    climbStep: number; causeKind: PathUpdateCauseKind; causeId: string | null }>):
    Promise<"TAKEN" | "ALREADY" | "CONFLICT" | "NOT_LIVE" | "NOT_A_DIG" | "NO_CAUSE"> {
    return (await this.pool.query<{ outcome: "TAKEN" | "ALREADY" | "CONFLICT" | "NOT_LIVE" | "NOT_A_DIG" | "NO_CAUSE" }>(
      "SELECT identity.take_public_path_turn($1,$2,$3,$4,$5,$6,$7,$8) AS outcome",
      [input.updateId, input.runId, input.parentRunId, input.positionRef, input.kind, input.climbStep, input.causeKind, input.causeId])).rows[0]!.outcome;
  }

  async readTurn(updateId: string): Promise<PathUpdateTurnRead | null> {
    return (await this.pool.query<{ turn: PathUpdateTurnRead | null }>("SELECT identity.read_path_update_turn($1) AS turn", [updateId])).rows[0]?.turn ?? null;
  }

  async record(record: PathUpdateRecord): Promise<"RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_TURN" | "WAIT_TURN" | "BASE_MOVED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_LIVE" | "NO_TURN" | "WAIT_TURN" | "BASE_MOVED" }>(
      "SELECT identity.record_public_path_update($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14) AS outcome",
      [record.updateId, record.basedOn?.kind ?? null, record.basedOn?.id ?? null, record.outcome, record.failureCode, record.changed,
        record.fateBefore, record.fateAfter, lineage(record.writerLineage), lineage(record.checkerLineage), record.rounds,
        JSON.stringify(record.artifactRefs), record.content === null ? null : JSON.stringify(record.content.envelope),
        record.content?.attestation ?? null])).rows[0]!.outcome;
  }

  /**
   * Every turn of a debate on a public tree, hidden ones marked, whether or not its own key still lives, for a login that holds the cross-account
   * marker (the runner's); in a request, only the rows of the connection's own runs (0154). Null off a live publication's tree.
   */
  async readLine(runId: string): Promise<readonly PathLineEntry[] | null> {
    return (await this.pool.query<{ line: PathLineEntry[] | null }>("SELECT identity.read_public_path_line($1) AS line", [runId])).rows[0]?.line ?? null;
  }

  async readClimbNext(runId: string): Promise<PathClimbNext | null> {
    return (await this.pool.query<{ next: PathClimbNext | null }>("SELECT identity.read_public_climb_next($1) AS next", [runId])).rows[0]?.next ?? null;
  }

  async recordCheckPassed(runId: string, checkRef: string): Promise<"RECORDED" | "ALREADY" | "NOT_FOUND"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_FOUND" }>("SELECT identity.record_public_check_passed($1,$2) AS outcome", [runId, checkRef])).rows[0]!.outcome;
  }

  async readDigsUnsettled(before: Date, limit = 50): Promise<readonly PublicDigUnsettled[]> {
    return (await this.pool.query<{ waiting: PublicDigUnsettled[] }>("SELECT identity.read_public_digs_unsettled($1,$2) AS waiting", [before, limit])).rows[0]!.waiting;
  }

  async readClimbsOwed(limit = 50): Promise<readonly string[]> {
    return (await this.pool.query<{ owed: string[] }>("SELECT identity.read_public_climbs_owed($1) AS owed", [limit])).rows[0]!.owed;
  }

  async markClimbDone(runId: string): Promise<"RECORDED" | "ALREADY" | "NOT_FOUND"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_FOUND" }>("SELECT identity.mark_public_climb_done($1) AS outcome", [runId])).rows[0]!.outcome;
  }

  /** The main answer's versions once the root's key is gone, in 0138's shape; each opens under its own `trigger_run_id`. */
  async readGoneAnswers(rootRunId: string): Promise<readonly MainAnswerUpdateRead[]> {
    return (await this.pool.query<{ updates: MainAnswerUpdateRead[] }>("SELECT identity.read_public_answer_updates($1) AS updates", [rootRunId])).rows[0]!.updates;
  }

  async recordGoneAnswer(record: MainAnswerUpdateRecord): Promise<Readonly<{ outcome: "RECORDED" | "ALREADY" | "NOT_PUBLIC" | "BASE_MOVED"; answerSeq: number | null }>> {
    const row = (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_PUBLIC" | "BASE_MOVED"; answer_seq: number | null }>(
      "SELECT outcome,answer_seq FROM identity.record_public_answer_update($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13,$14::jsonb,$15)",
      [record.updateId, record.triggerRunId, record.rootRunId, record.basedOnUpdateId, record.triggerKind, record.triggerId, record.outcome, record.failureCode,
        lineage(record.writerLineage), lineage(record.checkerLineage), record.rounds, JSON.stringify(record.artifactRefs), record.spentMicros,
        record.content === null ? null : JSON.stringify(record.content.envelope), record.content?.attestation ?? null])).rows[0]!;
    return Object.freeze({ outcome: row.outcome, answerSeq: row.answer_seq });
  }

  async readReportsUnwritten(limit = 20): Promise<readonly PublicReportUnwritten[]> {
    return (await this.pool.query<{ waiting: PublicReportUnwritten[] }>("SELECT identity.read_public_reports_unwritten($1) AS waiting", [limit])).rows[0]!.waiting;
  }

  async recordReport(record: PublicReportRecord): Promise<"RECORDED" | "ALREADY" | "NOT_FOUND"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_FOUND" }>(
      "SELECT identity.record_public_report($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14::jsonb,$15) AS outcome",
      [record.reportId, record.outcome, record.storyOutcome, record.failureCode, record.fingerprint, record.ladderStep, record.leftOut, record.answerRounds, record.storyRounds,
        lineage(record.writerLineage), lineage(record.checkerLineage), JSON.stringify(record.artifactRefs), record.spentMicros,
        record.content === null ? null : JSON.stringify(record.content.envelope), record.content?.attestation ?? null])).rows[0]!.outcome;
  }
}

export type PublicCheckPassed = Readonly<{ dig_run_id: string; publication_ref: string; update_id: string; position_ref: string | null; content: CryptoEnvelope | null; recorded_at: string }>;
export type PublicPageOwed = Readonly<{
  kind: "PATH" | "MAIN_ANSWER"; source_id: string; carrier: string; publication_ref: string; dig_run_id: string; position_ref: string | null; sealed_run_id: string;
  step: number | null; recorded_at: string; fate_before: string | null; content: CryptoEnvelope;
}>;
export type PublicReportOwed = Readonly<{ report_id: string; publication_ref: string; report_version: number; carrier_run_id: string; recorded_at: string; content: CryptoEnvelope }>;
export type PublicReportCopyRead = Readonly<{ report_version: number; recorded_at: string; requested_at: string; writer: string | null; content: CryptoEnvelope }>;

/**
 * The API's sweep and its anonymous read. The sweep's methods (`readChecksPassed`, `readPageOwed`, `readReportsOwed`, `recordReportCopy`,
 * `recordSkip`, `recordReportCheck`, `readFreeOwner`) need the cross-account marker (debateai_rls_all_accounts), which the runner, the scheduler and
 * the API's system pool outside a request hold and the API's request login does not (0154), so they run outside a request; `readReports` (the public
 * page's read) stays debateai_runtime's, which the API's roles inherit.
 */
export class PostgresPublicPageRepository {
  constructor(private readonly pool: Executor) {}

  async readChecksPassed(limit = 50): Promise<readonly PublicCheckPassed[]> {
    return (await this.pool.query<{ waiting: PublicCheckPassed[] }>("SELECT identity.read_public_checks_passed($1) AS waiting", [limit])).rows[0]!.waiting;
  }

  async readPageOwed(limit = 50): Promise<readonly PublicPageOwed[]> {
    return (await this.pool.query<{ owed: PublicPageOwed[] }>("SELECT identity.read_public_page_owed($1) AS owed", [limit])).rows[0]!.owed;
  }

  async readReportsOwed(limit = 20): Promise<readonly PublicReportOwed[]> {
    return (await this.pool.query<{ owed: PublicReportOwed[] }>("SELECT identity.read_public_reports_owed($1) AS owed", [limit])).rows[0]!.owed;
  }

  async recordReportCopy(publicationRef: string, reportVersion: number, reportId: string, content: CryptoEnvelope): Promise<"RECORDED" | "ALREADY" | "NOT_FOUND"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_FOUND" }>(
      "SELECT identity.record_public_debate_report($1,$2,$3,$4::jsonb) AS outcome", [publicationRef, reportVersion, reportId, JSON.stringify(content)])).rows[0]!.outcome;
  }

  async readReports(publicationRef: string): Promise<readonly PublicReportCopyRead[]> {
    return (await this.pool.query<{ reports: PublicReportCopyRead[] }>("SELECT identity.read_public_debate_reports($1) AS reports", [publicationRef])).rows[0]!.reports;
  }

  async recordSkip(sourceId: string, publicationRef: string, kind: "PATH" | "MAIN_ANSWER" | "REPORT", code: string): Promise<"RECORDED" | "ALREADY"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" }>("SELECT identity.record_public_page_skip($1,$2,$3,$4) AS outcome", [sourceId, publicationRef, kind, code])).rows[0]!.outcome;
  }

  /** The publication check's record of a report (0147's report, never a run: 0081's record would name a debate whose owner wrote nothing). */
  async recordReportCheck(row: Readonly<{ reportId: string; attemptedAt: Date; outcome: string; failureCause: string | null; rules: readonly number[]; partKinds: readonly string[];
    ground: string | null; judgeProviderRef: string | null; judgeModelId: string | null; policyVersion: string; judgeCallCount: number }>): Promise<void> {
    await this.pool.query("SELECT identity.record_public_report_check($1,$2,$3,$4,$5::smallint[],$6::text[],$7,$8,$9,$10,$11)",
      [row.reportId, row.attemptedAt, row.outcome, row.failureCause, [...row.rules], [...row.partKinds], row.ground, row.judgeProviderRef, row.judgeModelId, row.policyVersion, row.judgeCallCount]);
  }

  /** The account a Free debate is published under, while its ask waits. */
  async readFreeOwner(runId: string): Promise<Readonly<{ user_id: string; owner_ref: string }> | null> {
    return (await this.pool.query<{ owner: { user_id: string; owner_ref: string } | null }>("SELECT identity.read_free_debate_owner($1) AS owner", [runId])).rows[0]?.owner ?? null;
  }
}
