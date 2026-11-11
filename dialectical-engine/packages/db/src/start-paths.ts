import type { Pool } from "pg";
import type { PathId, StartList, StartMenu, StartPathAuthor, StartPathsSource } from "@debateai/contract";
import type { CryptoEnvelope } from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import { decryptLeasedContentForRun, encryptAttestedContentForRun, prepareLeasedContentEncryptionForRun, withRunContentLease } from "./index.js";

/**
 * The paths a person chose at Start (migration 0159; V4 start step, spec 2026-11-03 §4), through 0159's definers only, on the
 * runner's pool (debateai_runtime). The set's menu and each path's words are sealed under the debate's own run key inside
 * withRunContentLease and opened through prepareLeasedContentEncryptionForRun; the counts, authors and ids stay readable.
 *
 * Carriers (packages/crypto CONTENT_CARRIERS), each checked by 0132's content trigger: `core.start_path_set` bound to the run id,
 * `core.start_path` bound to the path id ("b1", "b2", …). A run without content encryption keeps no paths: the writer refuses
 * with START_PATHS_NOT_SEALED and calls nothing (0132's check would refuse the row).
 *
 * The carry-on marks (Task 56's digs and report after Start) are ids only: no lease.
 *
 * `tx` carries only the definer's write. The lease, the run's key and the attestation secret are read through the pool, so
 * the run must already be committed, and `tx` must be a debateai_runtime connection (the definers are granted to that role only).
 */
export type Queryable = Pick<Pool, "query">;

export const START_PATH_SET_CARRIER = "core.start_path_set" as const;
export const START_PATH_CARRIER = "core.start_path" as const;

export type StoredPathViewpoint = Readonly<{ viewpointId: string | null; pickNo: number | null; title: string | null; question: string; own: boolean }>;
export type StoredStartPath = Readonly<{
  pathId: PathId; pathNo: number; author: StartPathAuthor; title: string; question: string;
  viewpoints: readonly StoredPathViewpoint[]; ownWords: readonly string[];
}>;
export type StoredStartMenu = Readonly<{ menu: StartMenu; lateLists: readonly StartList[] }>;
export type StoredStartPathSet = Readonly<{
  runId: string; source: StartPathsSource; width: number; chosenBy: "PERSON" | "AIS"; carryOnToReport: boolean;
  paths: readonly StoredStartPath[]; menu: StoredStartMenu | null;
}>;
export type CarryOnDue = Readonly<{ runId: string; ownerRef: string; userId: string; identitySessionId: string; begunAt: Date }>;

export interface StartPathsStore {
  recordStartPaths(set: StoredStartPathSet, tx?: Queryable): Promise<"RECORDED" | "ALREADY">;
  readStartPaths(runId: string): Promise<StoredStartPathSet | null>;
  /** core.read_start_path_ids: no lease. */
  readStartPathIds(runId: string): Promise<readonly PathId[] | null>;
  copyStartPathsForReadmission(fromRunId: string, toRunId: string, tx?: Queryable): Promise<"COPIED" | "NONE">;
  recordCarryOnDue(runId: string): Promise<"RECORDED" | "ALREADY" | "NOT_ASKED">;
  claimCarryOnDue(limit: number): Promise<readonly CarryOnDue[]>;
  readCarryOnBegun(limit: number): Promise<readonly CarryOnDue[]>;
  recordCarryOnDone(runId: string): Promise<"RECORDED" | "ALREADY" | "NOT_BEGUN">;
}

type PathRow = Readonly<{ path_id: PathId; path_no: number; author: StartPathAuthor; viewpoint_count: number; has_own_words: boolean;
  content: CryptoEnvelope }>;
type SetRow = Readonly<{ run_id: string; source: StartPathsSource; width: number; path_count: number; chosen_by: "PERSON" | "AIS";
  carry_on_to_report: boolean; content: CryptoEnvelope; paths: readonly PathRow[] }>;
type DueRow = Readonly<{ run_id: string; owner_ref: string; user_id: string; identity_session_id: string; begun_at: string }>;

const notSealed = (): TypedDomainError =>
  new TypedDomainError("START_PATHS_NOT_SEALED", "A debate without content encryption keeps no start paths");

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The set's sealed part (0159 §1): the menu the paths were chosen from, {menu, lateLists}, or {} for a set built without one. */
function menuOf(opened: unknown): StoredStartMenu | null {
  if (!isObject(opened)) throw new TypeError("START_PATHS_CONTENT_INVALID");
  if (Object.keys(opened).length === 0) return null;
  if (!isObject(opened.menu) || !Array.isArray(opened.lateLists)) throw new TypeError("START_PATHS_CONTENT_INVALID");
  return opened as StoredStartMenu;
}

/** A path's sealed part, its words, joined to its readable row. */
function pathOf(row: PathRow, opened: unknown): StoredStartPath {
  if (!isObject(opened) || typeof opened.title !== "string" || typeof opened.question !== "string"
    || !Array.isArray(opened.viewpoints) || opened.viewpoints.length !== row.viewpoint_count
    || !Array.isArray(opened.ownWords) || !opened.ownWords.every((words) => typeof words === "string")) {
    throw new TypeError("START_PATH_CONTENT_INVALID");
  }
  return Object.freeze({ pathId: row.path_id, pathNo: row.path_no, author: row.author, title: opened.title, question: opened.question,
    viewpoints: Object.freeze(opened.viewpoints as StoredPathViewpoint[]), ownWords: Object.freeze(opened.ownWords as string[]) });
}

function dueOf(row: DueRow): CarryOnDue {
  const begunAt = new Date(row.begun_at);
  if (Number.isNaN(begunAt.getTime())) throw new TypeError("CARRY_ON_ROW_INVALID");
  return Object.freeze({ runId: row.run_id, ownerRef: row.owner_ref, userId: row.user_id, identitySessionId: row.identity_session_id, begunAt });
}

export class PostgresStartPathsStore implements StartPathsStore {
  constructor(private readonly pool: Pool) {}

  /** The set and every path at once, each sealed under the debate's key; ALREADY keeps the first set. */
  async recordStartPaths(set: StoredStartPathSet, tx?: Queryable): Promise<"RECORDED" | "ALREADY"> {
    return withRunContentLease(this.pool, [set.runId], async () => {
      // 0132's check binds the set's envelope to run_id::text, which Postgres renders lower-case.
      const sealedSet = await encryptAttestedContentForRun(this.pool, set.runId, START_PATH_SET_CARRIER, set.runId.toLowerCase(), set.menu ?? {});
      if (sealedSet === null) throw notSealed();
      const paths: unknown[] = [];
      for (const path of set.paths) {
        const sealed = await encryptAttestedContentForRun(this.pool, set.runId, START_PATH_CARRIER, path.pathId,
          { title: path.title, question: path.question, viewpoints: path.viewpoints, ownWords: path.ownWords });
        if (sealed === null) throw notSealed();
        paths.push({ path_id: path.pathId, path_no: path.pathNo, author: path.author, viewpoint_count: path.viewpoints.length,
          has_own_words: path.ownWords.length > 0 || path.viewpoints.some((viewpoint) => viewpoint.own),
          content: sealed.envelope, attestation: sealed.attestation.toString("hex") });
      }
      const head = { source: set.source, width: set.width, path_count: set.paths.length, chosen_by: set.chosenBy,
        carry_on_to_report: set.carryOnToReport, content: sealedSet.envelope, attestation: sealedSet.attestation.toString("hex") };
      return (await (tx ?? this.pool).query<{ outcome: "RECORDED" | "ALREADY" }>("SELECT core.record_start_paths($1,$2::jsonb,$3::jsonb) AS outcome",
        [set.runId, JSON.stringify(head), JSON.stringify(paths)])).rows[0]!.outcome;
    });
  }

  /** A live debate's set, opened under its key; null when it keeps none or is not live. */
  async readStartPaths(runId: string): Promise<StoredStartPathSet | null> {
    const row = (await this.pool.query<{ paths: SetRow | null }>("SELECT core.read_start_paths($1) AS paths", [runId])).rows[0]?.paths ?? null;
    if (row === null) return null;
    if (row.paths.length !== row.path_count) throw new TypeError("START_PATHS_INCOMPLETE");
    const leased = await prepareLeasedContentEncryptionForRun(this.pool, runId);
    try {
      const menu = menuOf(decryptLeasedContentForRun<unknown>(leased, START_PATH_SET_CARRIER, row.run_id.toLowerCase(), row.content, null));
      const paths = row.paths.map((path) => pathOf(path, decryptLeasedContentForRun<unknown>(leased, START_PATH_CARRIER, path.path_id, path.content, null)));
      await leased.assertLive();
      return Object.freeze({ runId: row.run_id, source: row.source, width: row.width, chosenBy: row.chosen_by,
        carryOnToReport: row.carry_on_to_report, paths: Object.freeze(paths), menu });
    } finally {
      await leased.close();
    }
  }

  async readStartPathIds(runId: string): Promise<readonly PathId[] | null> {
    const ids = (await this.pool.query<{ ids: PathId[] | null }>("SELECT core.read_start_path_ids($1) AS ids", [runId])).rows[0]?.ids ?? null;
    return ids === null ? null : Object.freeze(ids);
  }

  /** A re-admitted debate keeps the paths its first run was given, sealed again under its own key. */
  async copyStartPathsForReadmission(fromRunId: string, toRunId: string, tx?: Queryable): Promise<"COPIED" | "NONE"> {
    const from = await this.readStartPaths(fromRunId);
    if (from === null) return "NONE";
    await this.recordStartPaths({ ...from, runId: toRunId }, tx);
    return "COPIED";
  }

  async recordCarryOnDue(runId: string): Promise<"RECORDED" | "ALREADY" | "NOT_ASKED"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_ASKED" }>("SELECT core.record_carry_on_due($1) AS outcome", [runId]))
      .rows[0]!.outcome;
  }

  async claimCarryOnDue(limit: number): Promise<readonly CarryOnDue[]> {
    const rows = (await this.pool.query<{ due: DueRow[] }>("SELECT core.claim_carry_on_due($1) AS due", [limit])).rows[0]!.due;
    return Object.freeze(rows.map(dueOf));
  }

  async readCarryOnBegun(limit: number): Promise<readonly CarryOnDue[]> {
    const rows = (await this.pool.query<{ begun: DueRow[] }>("SELECT core.read_carry_on_begun($1) AS begun", [limit])).rows[0]!.begun;
    return Object.freeze(rows.map(dueOf));
  }

  async recordCarryOnDone(runId: string): Promise<"RECORDED" | "ALREADY" | "NOT_BEGUN"> {
    return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "NOT_BEGUN" }>("SELECT core.record_carry_on_done($1) AS outcome", [runId]))
      .rows[0]!.outcome;
  }
}
