import type { Pool } from "pg";
import type { PathId, TrustWord } from "@debateai/contract";

/**
 * Each path's step and each point's marks while a path debate runs (migration 0161; V4 start step, spec 2026-11-03 §2 item 7; items
 * wait-d1, chat-first-round, journey-f1), through 0161's definers only, on the runner's pool (debateai_runtime). Only the runner knows when
 * a path's work moves on, so it writes each step a path reaches and each mark a point gets, once each; the run read shows them. Ids and
 * codes only: nothing is sealed, so no lease. An erased debate answers RUN_ERASED to every write and reads as nothing.
 *
 * Two small reads go with it: how far a debate's carry-on has gone (0159's marks; item wait-f16), and, on the API's billing pool
 * (debateai_billing_runtime), how many reports of a public debate did not fail, the owner's own and everyone's (0147's reports; item
 * public-f25, owner answer Q20: B, only a debate's very first report uses the kept reserve).
 */
export const PATH_STEPS = Object.freeze(["FINDING_SOURCES", "ARGUING", "CHECKING"] as const);
export type PathStep = typeof PATH_STEPS[number];
/** A point put forward, being checked, checked, and what was found (with its trust word). */
export const PATH_POINT_MARKS = Object.freeze(["PUT_FORWARD", "CHECKING", "CHECKED", "FOUND"] as const);
export type PathPointMark = typeof PATH_POINT_MARKS[number];
export type PathPointMarkRow = Readonly<{ pathId: PathId; nodeId: string; mark: PathPointMark; trust: TrustWord | null; at: Date }>;
/** The newest step per path; the marks oldest first. */
export type PathProgressRead = Readonly<{ steps: ReadonlyMap<PathId, PathStep>; marks: readonly PathPointMarkRow[] }>;
export type CarryOnMarkState = "NONE" | "DUE" | "BEGUN" | "DONE";

export interface PathProgressStore {
  recordPathStep(input: Readonly<{ runId: string; pathId: PathId; step: PathStep }>): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED">;
  recordPathPointMark(input: Readonly<{ runId: string; pathId: PathId; nodeId: string; mark: PathPointMark; trust: TrustWord | null }>): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED">;
  readPathProgress(runId: string): Promise<PathProgressRead>;
  readCarryOnMark(runId: string): Promise<CarryOnMarkState>;
}

/**
 * A public debate's versions that did not fail: this owner's, and every writer's (answer Q20). One still being written counts as 0147 counts
 * it (its carrier lives and its copy is sealed); a press left unwritten (its carrier gone, or NO_CARRIER before its copy was sealed) does not.
 */
export type PublicReportCounts = Readonly<{ own: number; all: number }>;
export interface OwnClosingsStore { countPublicReports(ownerRef: string, publicationRef: string): Promise<PublicReportCounts> }

type StepRow = Readonly<{ path_id: PathId; step: PathStep; recorded_at: string }>;
type MarkRow = Readonly<{ path_id: PathId; node_id: string; mark: PathPointMark; trust: TrustWord | null; recorded_at: string }>;
type ProgressRow = Readonly<{ steps: readonly StepRow[]; marks: readonly MarkRow[] }>;

const CARRY_ON_MARK_STATES: readonly CarryOnMarkState[] = Object.freeze(["NONE", "DUE", "BEGUN", "DONE"]);
const EMPTY: PathProgressRead = Object.freeze({ steps: new Map<PathId, PathStep>(), marks: Object.freeze([]) });

/** 0040's barrier word for a debate whose private content went between the definer's check and its insert. */
function isErased(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && (error as { readonly code?: unknown }).code === "55000"
    && (error as { readonly message?: unknown }).message === "PRIVATE_CONTENT_ERASED";
}

const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError("PUBLIC_REPORT_COUNTS_INVALID");
  return value;
};

export class PostgresPathProgressRepository implements PathProgressStore {
  constructor(private readonly pool: Pool) {}

  async recordPathStep(input: Readonly<{ runId: string; pathId: PathId; step: PathStep }>): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED"> {
    return this.#write("SELECT core.record_path_step($1,$2,$3) AS outcome", [input.runId, input.pathId, input.step]);
  }

  async recordPathPointMark(input: Readonly<{ runId: string; pathId: PathId; nodeId: string; mark: PathPointMark; trust: TrustWord | null }>): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED"> {
    return this.#write("SELECT core.record_path_point_mark($1,$2,$3,$4,$5) AS outcome",
      [input.runId, input.pathId, input.nodeId, input.mark, input.trust]);
  }

  /** Empty when the debate keeps none or is erased. */
  async readPathProgress(runId: string): Promise<PathProgressRead> {
    const row = (await this.pool.query<{ progress: ProgressRow | null }>("SELECT core.read_path_progress($1) AS progress", [runId]))
      .rows[0]?.progress ?? null;
    if (row === null) return EMPTY;
    const steps = new Map<PathId, PathStep>();
    // Oldest first, so the last one seen for a path is its newest step.
    for (const step of row.steps) {
      if (!(PATH_STEPS as readonly string[]).includes(step.step)) throw new TypeError("PATH_PROGRESS_ROW_INVALID");
      steps.set(step.path_id, step.step);
    }
    const marks = row.marks.map((mark) => {
      if (!(PATH_POINT_MARKS as readonly string[]).includes(mark.mark)) throw new TypeError("PATH_PROGRESS_ROW_INVALID");
      return Object.freeze({ pathId: mark.path_id, nodeId: mark.node_id, mark: mark.mark, trust: mark.trust, at: new Date(mark.recorded_at) });
    });
    return Object.freeze({ steps, marks: Object.freeze(marks) });
  }

  async readCarryOnMark(runId: string): Promise<CarryOnMarkState> {
    const mark = (await this.pool.query<{ mark: string }>("SELECT core.read_carry_on_mark($1) AS mark", [runId])).rows[0]?.mark;
    if (mark === undefined || !(CARRY_ON_MARK_STATES as readonly string[]).includes(mark)) throw new TypeError("CARRY_ON_MARK_INVALID");
    return mark as CarryOnMarkState;
  }

  /** An erasure that commits between the writer's liveness check and its insert is refused by 0040's barrier: RUN_ERASED too. */
  async #write(sql: string, values: readonly unknown[]): Promise<"RECORDED" | "ALREADY" | "RUN_ERASED"> {
    try {
      return (await this.pool.query<{ outcome: "RECORDED" | "ALREADY" | "RUN_ERASED" }>(sql, [...values])).rows[0]!.outcome;
    } catch (error) {
      if (isErased(error)) return "RUN_ERASED";
      throw error;
    }
  }
}

/** On the API's billing pool (debateai_billing_runtime), the one role 0161 grants identity.count_public_reports. */
export class PostgresOwnClosingsReader implements OwnClosingsStore {
  constructor(private readonly pool: Pool) {}

  async countPublicReports(ownerRef: string, publicationRef: string): Promise<PublicReportCounts> {
    const counts = (await this.pool.query<{ counts: { own: unknown; all: unknown } | null }>("SELECT identity.count_public_reports($1,$2) AS counts",
      [ownerRef, publicationRef])).rows[0]?.counts ?? null;
    if (counts === null) throw new TypeError("PUBLIC_REPORT_COUNTS_INVALID");
    return Object.freeze({ own: count(counts.own), all: count(counts.all) });
  }
}
