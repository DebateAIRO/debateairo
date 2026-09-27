import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.5), TASK M3 — THE OWNER-SIDE
 * DISCLOSURE ROW (migration 0076, `serve.serve_disclosure`).
 *
 * One row per served answer version, insert-once, CONTENT-FREE: provider refs,
 * codes and counts, never debate or model text, so it is not a content carrier
 * and needs no envelope. It records what the sealed answer has no place for:
 * which makers were planned and which actually wrote and checked the served
 * round, whether a cheaper maker was used and why, whether the two roles ended
 * on one maker (R9), the stop that cut the arguing short and the points it left
 * without a cross-review. The digest ladder (M4) and the floor (M5) fill their
 * own columns; this task writes them as null.
 *
 * The rules below are the table's CHECKs, held here too so a record the table
 * would refuse is refused typed, before the INSERT (`SERVE_DISCLOSURE_RECORD_INVALID`).
 * The read is the plain one by answer version; the owner-scoped API read, the
 * PDF line and the operator report are Task M5's.
 */
export const SERVE_DISCLOSURE_BODY_STOPS = Object.freeze(["MONEY", "ATTEMPTS", "USAGE", "DAILY"] as const);
export type ServeDisclosureBodyStop = typeof SERVE_DISCLOSURE_BODY_STOPS[number];

export const SERVE_DISCLOSURE_FLOOR_STATES = Object.freeze(["SUPPORTED", "CONTESTED", "UNSUPPORTED"] as const);
export type ServeDisclosureFloorState = typeof SERVE_DISCLOSURE_FLOOR_STATES[number];

export interface ServeDisclosureRecord {
  readonly answerId: string;
  readonly answerVersion: number;
  readonly runId: string;
  readonly writerPlannedRef: string;
  readonly checkerPlannedRef: string;
  /** Null when the served result has no checked round (components-only). */
  readonly writerServedRef: string | null;
  readonly checkerServedRef: string | null;
  readonly writerFallback: boolean;
  readonly checkerFallback: boolean;
  readonly fallbackReason: "MONEY" | null;
  readonly checkerSameAsWriter: boolean;
  readonly bodyStop: ServeDisclosureBodyStop | null;
  readonly pointsWithoutReview: number | null;
  readonly digestRung: number | null;
  readonly digestPointsOmitted: number | null;
  readonly floorVerdictState: ServeDisclosureFloorState | null;
  readonly floorLeadingNodeId: string | null;
  readonly floorReason: string | null;
}

export interface StoredServeDisclosure extends ServeDisclosureRecord {
  readonly createdAt: Date;
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ENGINE_CODE = /^[A-Z][A-Z0-9_]{0,95}$/u;
/** PostgreSQL `integer` and `smallint`: a count or rung above cannot be stored. */
const COLUMN_LIMITS = Object.freeze({ integer: 2_147_483_647, smallint: 32_767, refLength: 256 });

function invalid(rule: string): TypedDomainError {
  return new TypedDomainError(
    "SERVE_DISCLOSURE_RECORD_INVALID",
    `The serve disclosure record breaks its rule: ${rule}`
  );
}

function isRef(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= COLUMN_LIMITS.refLength
    && value.trim() === value;
}

function isCount(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= limit;
}

/** The broken rule, or null. The same rules migration 0076 writes as CHECKs. */
function recordViolation(record: ServeDisclosureRecord): string | null {
  if (!UUID_TEXT.test(record.answerId)) return "answer_id";
  if (!UUID_TEXT.test(record.runId)) return "run_id";
  if (!isCount(record.answerVersion, COLUMN_LIMITS.integer) || record.answerVersion < 1) return "answer_version";
  if (!isRef(record.writerPlannedRef)) return "writer_planned_ref";
  if (!isRef(record.checkerPlannedRef)) return "checker_planned_ref";
  if (record.writerServedRef !== null && !isRef(record.writerServedRef)) return "writer_served_ref";
  if (record.checkerServedRef !== null && !isRef(record.checkerServedRef)) return "checker_served_ref";
  if ((record.writerServedRef === null) !== (record.checkerServedRef === null)) {
    return "a checked round names both its writer and its checker, or neither";
  }
  if (record.writerFallback !== (record.writerServedRef !== null && record.writerServedRef !== record.writerPlannedRef)) {
    return "writer_fallback is the served writer differing from the planned one";
  }
  if (record.checkerFallback !== (record.checkerServedRef !== null && record.checkerServedRef !== record.checkerPlannedRef)) {
    return "checker_fallback is the served checker differing from the planned one";
  }
  if (record.fallbackReason !== null && record.fallbackReason !== "MONEY") return "fallback_reason";
  if ((record.fallbackReason !== null) !== (record.writerFallback || record.checkerFallback)) {
    return "a fallback, and only a fallback, names its reason";
  }
  if (record.checkerSameAsWriter !== (record.writerServedRef !== null && record.checkerServedRef === record.writerServedRef)) {
    return "checker_same_as_writer is the served checker being the served writer";
  }
  if (record.bodyStop !== null && !(SERVE_DISCLOSURE_BODY_STOPS as readonly string[]).includes(record.bodyStop)) {
    return "body_stop";
  }
  if (record.pointsWithoutReview !== null && !isCount(record.pointsWithoutReview, COLUMN_LIMITS.integer)) {
    return "points_without_review";
  }
  if (record.digestRung !== null && !isCount(record.digestRung, COLUMN_LIMITS.smallint)) return "digest_rung";
  if (record.digestPointsOmitted !== null && !isCount(record.digestPointsOmitted, COLUMN_LIMITS.integer)) {
    return "digest_points_omitted";
  }
  const floor = [record.floorVerdictState, record.floorLeadingNodeId, record.floorReason];
  if (floor.some((value) => value === null) && floor.some((value) => value !== null)) {
    return "a floor holds its label, its leading position and its reason, or none of them";
  }
  if (record.floorVerdictState !== null
    && !(SERVE_DISCLOSURE_FLOOR_STATES as readonly string[]).includes(record.floorVerdictState)) {
    return "floor_verdict_state";
  }
  if (record.floorLeadingNodeId !== null && !UUID_TEXT.test(record.floorLeadingNodeId)) return "floor_leading_node_id";
  if (record.floorReason !== null && !ENGINE_CODE.test(record.floorReason)) return "floor_reason";
  return null;
}

interface ServeDisclosureRow {
  readonly answer_id: string;
  readonly answer_version: number;
  readonly run_id: string;
  readonly writer_planned_ref: string;
  readonly checker_planned_ref: string;
  readonly writer_served_ref: string | null;
  readonly checker_served_ref: string | null;
  readonly writer_fallback: boolean;
  readonly checker_fallback: boolean;
  readonly fallback_reason: "MONEY" | null;
  readonly checker_same_as_writer: boolean;
  readonly body_stop: ServeDisclosureBodyStop | null;
  readonly points_without_review: number | null;
  readonly digest_rung: number | null;
  readonly digest_points_omitted: number | null;
  readonly floor_verdict_state: ServeDisclosureFloorState | null;
  readonly floor_leading_node_id: string | null;
  readonly floor_reason: string | null;
  readonly created_at: Date;
}

export class ServeDisclosureRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Store the row for ONE answer version, once. A second write for the same
   * answer version changes nothing (`ALREADY_PRESENT`): the row is insert-once,
   * and UPDATE and DELETE are closed on it for every role.
   */
  async insert(record: ServeDisclosureRecord): Promise<"INSERTED" | "ALREADY_PRESENT"> {
    const violation = recordViolation(record);
    if (violation !== null) throw invalid(violation);
    const inserted = await this.pool.query(
      `INSERT INTO serve.serve_disclosure (
         answer_id, answer_version, run_id,
         writer_planned_ref, checker_planned_ref, writer_served_ref, checker_served_ref,
         writer_fallback, checker_fallback, fallback_reason, checker_same_as_writer,
         body_stop, points_without_review, digest_rung, digest_points_omitted,
         floor_verdict_state, floor_leading_node_id, floor_reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (answer_id, answer_version) DO NOTHING`,
      [
        record.answerId, record.answerVersion, record.runId,
        record.writerPlannedRef, record.checkerPlannedRef, record.writerServedRef, record.checkerServedRef,
        record.writerFallback, record.checkerFallback, record.fallbackReason, record.checkerSameAsWriter,
        record.bodyStop, record.pointsWithoutReview, record.digestRung, record.digestPointsOmitted,
        record.floorVerdictState, record.floorLeadingNodeId, record.floorReason
      ]
    );
    return inserted.rowCount === 1 ? "INSERTED" : "ALREADY_PRESENT";
  }

  /** The row of one answer version, or null when none was written. */
  async readForAnswerVersion(answerId: string, answerVersion: number): Promise<StoredServeDisclosure | null> {
    if (!UUID_TEXT.test(answerId) || !isCount(answerVersion, COLUMN_LIMITS.integer) || answerVersion < 1) {
      return null;
    }
    const result = await this.pool.query<ServeDisclosureRow>(
      `SELECT answer_id::text AS answer_id, answer_version, run_id::text AS run_id,
              writer_planned_ref, checker_planned_ref, writer_served_ref, checker_served_ref,
              writer_fallback, checker_fallback, fallback_reason, checker_same_as_writer,
              body_stop, points_without_review, digest_rung, digest_points_omitted,
              floor_verdict_state, floor_leading_node_id::text AS floor_leading_node_id, floor_reason,
              created_at
         FROM serve.serve_disclosure
        WHERE answer_id = $1 AND answer_version = $2`,
      [answerId, answerVersion]
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    const stored: StoredServeDisclosure = {
      answerId: row.answer_id,
      answerVersion: row.answer_version,
      runId: row.run_id,
      writerPlannedRef: row.writer_planned_ref,
      checkerPlannedRef: row.checker_planned_ref,
      writerServedRef: row.writer_served_ref,
      checkerServedRef: row.checker_served_ref,
      writerFallback: row.writer_fallback,
      checkerFallback: row.checker_fallback,
      fallbackReason: row.fallback_reason,
      checkerSameAsWriter: row.checker_same_as_writer,
      bodyStop: row.body_stop,
      pointsWithoutReview: row.points_without_review,
      digestRung: row.digest_rung,
      digestPointsOmitted: row.digest_points_omitted,
      floorVerdictState: row.floor_verdict_state,
      floorLeadingNodeId: row.floor_leading_node_id,
      floorReason: row.floor_reason,
      createdAt: row.created_at
    };
    const violation = recordViolation(stored);
    if (violation !== null) {
      throw new TypedDomainError(
        "SERVE_DISCLOSURE_ROW_INVALID",
        `The stored serve disclosure does not match its declared shape: ${violation}`
      );
    }
    return Object.freeze(stored);
  }
}
