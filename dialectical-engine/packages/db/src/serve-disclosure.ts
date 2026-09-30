import type { Pool } from "pg";
import { TypedDomainError } from "@debateai/kernel";
// The owner reads use the ONE ownership normaliser every owner read uses.
import { normalizeRunOwnership } from "./index.js";

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
 * without a cross-review, and what cut the answer-writing loop short. The digest
 * ladder (M4) and the floor (M5) fill their own columns; this task writes them
 * as null.
 *
 * The rules below are the table's CHECKs, held here too so a record the table
 * would refuse is refused typed, before the INSERT (`SERVE_DISCLOSURE_RECORD_INVALID`).
 *
 * THE READS (Task M5). `readLatestForAnswer` is the owner-scoped one behind
 * GET /v1/answers/{id}/disclosure: the answer's LATEST version that HAS a row
 * (a DR-184 review catch-up version runs no answer-writing step, so it has
 * none, and the version before it is read), under the run's ownership
 * predicate. `readLatestForOperator` is the operator report's: by answer id or
 * run id, no ownership. Both return, beside the row, the model each named maker
 * answered as, read from the run's own recorded calls (`ledger.raw_artifact`:
 * maker, model id, transport, provider ref — never text). `readLatestFloorForAnswer`
 * is the floor alone, for the story route, with no model lookups.
 *
 * THE FLOOR'S BASIS (M5 review, I2). A floor's label may have been derived
 * without a margin or a disagreement measure; a SERVED label says so with
 * LABEL-BASIS-INCOMPLETE, and a floor says so with `floorBasisIncomplete`. It is
 * READ, not stored: the runner records the label it derived — with its
 * `basisAbsence` — on the run's propagation receipt
 * (`ledger.propagation_run.served_root_selection.verdictLabel`, T10/T11) before
 * the answer is sealed. The receipt of a floor is the run's latest one sealed
 * before the answer version, whose served node and label are the floor's; a
 * floor with no such receipt is a row that breaks its rules
 * (`SERVE_DISCLOSURE_ROW_INVALID`).
 */
export const SERVE_DISCLOSURE_BODY_STOPS = Object.freeze(["MONEY", "ATTEMPTS", "USAGE", "DAILY", "ALLOWANCE"] as const);
export type ServeDisclosureBodyStop = typeof SERVE_DISCLOSURE_BODY_STOPS[number];

/**
 * What ended the answer-writing loop early (M3 review polish): a spend stop on an
 * answer-writing call after every cheaper maker was refused, a dead role
 * transport, or a draft with nothing to serve — whether or not a round was kept.
 */
export const SERVE_DISCLOSURE_SERVE_STOPS = Object.freeze([
  "MONEY", "ATTEMPTS", "USAGE", "DAILY", "ALLOWANCE", "TRANSPORT_DEATH", "NO_ARTIFACT"
] as const);
export type ServeDisclosureServeStop = typeof SERVE_DISCLOSURE_SERVE_STOPS[number];

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
  readonly serveStop: ServeDisclosureServeStop | null;
  /**
   * The digest built for the answer-writer, SERVED OR NOT (Task M4): its ladder
   * rung, 0-5 the summary levels, 6 the compact rung, 7 the spine. It is set
   * whenever the writer was handed a digest — also when the writer's call was
   * then refused and the answer ended components-only — and null when no digest
   * existed (DIGEST-CANNOT-EXIST, or a terminal before the answer-writing step).
   */
  readonly digestRung: number | null;
  /**
   * How many points that same digest left out: 0 below the spine rung. Like
   * the rung, it describes the digest built for the writer, served or not; a
   * reader who mentions left-out points only for a served answer applies that
   * rule itself.
   */
  readonly digestPointsOmitted: number | null;
  readonly floorVerdictState: ServeDisclosureFloorState | null;
  readonly floorLeadingNodeId: string | null;
  readonly floorReason: string | null;
}

export interface StoredServeDisclosure extends ServeDisclosureRecord {
  readonly createdAt: Date;
  /**
   * The floor's label was derived without a margin or a disagreement measure
   * (its receipt's `basisAbsence` is not empty). Null exactly when there is no
   * floor. Read from the label receipt, never stored (see the file header).
   */
  readonly floorBasisIncomplete: boolean | null;
}

/** The floor alone, as the owner's story route and the catch-up read it. */
export interface StoredServeFloor {
  readonly answerId: string;
  readonly answerVersion: number;
  readonly runId: string;
  readonly verdictState: ServeDisclosureFloorState;
  readonly leadingNodeId: string;
  readonly reason: string;
  readonly basisIncomplete: boolean;
}

/**
 * The model a maker answered as in this run, read from one of its recorded
 * calls: the fields the answer's own node lineage and the story's "Written by"
 * are built from. Never a provider address, a credential or any text.
 */
export interface ServeDisclosureModel {
  readonly providerRef: string;
  readonly maker: string;
  readonly modelId: string;
  readonly transport: string;
}

/**
 * A row and the model behind each maker it names. A served maker is read from
 * the served round's own artifacts; a planned maker that differs from the one
 * that served is read from the latest call it made in the run. Null when the
 * record holds no call by that maker (a planned maker refused before sending
 * on every call), or when the row names no maker for that seat.
 */
export interface ServeDisclosureRead {
  readonly row: StoredServeDisclosure;
  readonly models: Readonly<{
    writerPlanned: ServeDisclosureModel | null;
    writerServed: ServeDisclosureModel | null;
    checkerPlanned: ServeDisclosureModel | null;
    checkerServed: ServeDisclosureModel | null;
  }>;
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** ASCII white space at either end: exactly the set migration 0076's btrim() strips. */
const REF_EDGE_SPACE = /^[ \t\n\r\f\v]|[ \t\n\r\f\v]$/u;
const ENGINE_CODE = /^[A-Z][A-Z0-9_]{0,95}$/u;
/** PostgreSQL `integer` and `smallint`: a count or rung above cannot be stored. */
const COLUMN_LIMITS = Object.freeze({ integer: 2_147_483_647, smallint: 32_767, refLength: 256 });

function invalid(rule: string): TypedDomainError {
  return new TypedDomainError(
    "SERVE_DISCLOSURE_RECORD_INVALID",
    `The serve disclosure record breaks its rule: ${rule}`
  );
}

/**
 * 1 to 256 characters counted as PostgreSQL's length() counts them — code
 * points, not UTF-16 units — with no ASCII white space at either end: the
 * table's own CHECK, so a raw-inserted row can never pass the database and then
 * fail the typed read.
 */
function isRef(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const characters = [...value].length;
  return characters >= 1 && characters <= COLUMN_LIMITS.refLength && !REF_EDGE_SPACE.test(value);
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
  if (record.serveStop !== null && !(SERVE_DISCLOSURE_SERVE_STOPS as readonly string[]).includes(record.serveStop)) {
    return "serve_stop";
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
  readonly serve_stop: ServeDisclosureServeStop | null;
  readonly digest_rung: number | null;
  readonly digest_points_omitted: number | null;
  readonly floor_verdict_state: ServeDisclosureFloorState | null;
  readonly floor_leading_node_id: string | null;
  readonly floor_reason: string | null;
  readonly created_at: Date;
  readonly floor_basis_incomplete: boolean | null;
}

/**
 * The floor's label receipt, as a boolean: its `basisAbsence` is not empty.
 * NULL when the row has no floor, or when no receipt matches — the run's latest
 * propagation receipt sealed BEFORE the answer version, naming the floor's node
 * and label (a DR-184 catch-up receipt names no root, so it never matches).
 * Reads the table aliased `disclosure`; exported so the publication read uses
 * the same rule.
 */
export const FLOOR_BASIS_INCOMPLETE_SQL = `(
         SELECT CASE WHEN jsonb_typeof(receipt.served_root_selection #> '{verdictLabel,basisAbsence}') = 'array'
                     THEN jsonb_array_length(receipt.served_root_selection #> '{verdictLabel,basisAbsence}') > 0
                END
           FROM ledger.propagation_run AS receipt
          WHERE receipt.run_id = disclosure.run_id
            AND receipt.served_root_selection ->> 'servedNodeId' = disclosure.floor_leading_node_id::text
            AND receipt.served_root_selection #>> '{verdictLabel,label}' = disclosure.floor_verdict_state
            AND receipt.at_seq < (
              SELECT answer.sealed_at_seq FROM serve.answer AS answer
               WHERE answer.answer_id = disclosure.answer_id AND answer.answer_version = disclosure.answer_version
            )
          ORDER BY receipt.at_seq DESC
          LIMIT 1
       )`;

/** Every column, as the typed read takes it. */
const SELECT_ROW = `SELECT disclosure.answer_id::text AS answer_id, disclosure.answer_version,
              disclosure.run_id::text AS run_id,
              disclosure.writer_planned_ref, disclosure.checker_planned_ref,
              disclosure.writer_served_ref, disclosure.checker_served_ref,
              disclosure.writer_fallback, disclosure.checker_fallback, disclosure.fallback_reason,
              disclosure.checker_same_as_writer, disclosure.body_stop, disclosure.points_without_review,
              disclosure.serve_stop, disclosure.digest_rung, disclosure.digest_points_omitted,
              disclosure.floor_verdict_state, disclosure.floor_leading_node_id::text AS floor_leading_node_id,
              disclosure.floor_reason, disclosure.created_at,
              ${FLOOR_BASIS_INCOMPLETE_SQL} AS floor_basis_incomplete
         FROM serve.serve_disclosure AS disclosure`;

/** A stored row, held to the same rules as a record before its INSERT. */
function storedFrom(row: ServeDisclosureRow): StoredServeDisclosure {
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
    serveStop: row.serve_stop,
    digestRung: row.digest_rung,
    digestPointsOmitted: row.digest_points_omitted,
    floorVerdictState: row.floor_verdict_state,
    floorLeadingNodeId: row.floor_leading_node_id,
    floorReason: row.floor_reason,
    createdAt: row.created_at,
    floorBasisIncomplete: row.floor_basis_incomplete
  };
  const violation = recordViolation(stored)
    ?? ((stored.floorVerdictState === null) !== (stored.floorBasisIncomplete === null)
      ? "a floor is read with the label receipt it was derived from, and only a floor has one"
      : null);
  if (violation !== null) {
    throw new TypedDomainError(
      "SERVE_DISCLOSURE_ROW_INVALID",
      `The stored serve disclosure does not match its declared shape: ${violation}`
    );
  }
  return Object.freeze(stored);
}

/** The floor of a stored row, or null when it has none. */
function floorOf(row: StoredServeDisclosure): StoredServeFloor | null {
  if (row.floorVerdictState === null || row.floorLeadingNodeId === null || row.floorReason === null
    || row.floorBasisIncomplete === null) {
    return null;
  }
  return Object.freeze({
    answerId: row.answerId,
    answerVersion: row.answerVersion,
    runId: row.runId,
    verdictState: row.floorVerdictState,
    leadingNodeId: row.floorLeadingNodeId,
    reason: row.floorReason,
    basisIncomplete: row.floorBasisIncomplete
  });
}

/**
 * Exactly one ownership key, through `normalizeRunOwnership`; anything it
 * refuses is null, so the caller answers one closed "not found".
 */
function ownershipOf(
  ownership: Readonly<{ ownerRef: string | null; legacyAskerId: string | null }>
): Readonly<{ ownerRef: string | null; legacyAskerId: string | null }> | null {
  try {
    return normalizeRunOwnership({ ownerRef: ownership.ownerRef, legacyAskerId: ownership.legacyAskerId });
  } catch {
    return null;
  }
}

interface ModelRow {
  readonly provider_ref: string;
  readonly maker: string;
  readonly model_id: string;
  readonly provider: string;
}

function modelFrom(row: ModelRow): ServeDisclosureModel {
  return Object.freeze({
    providerRef: row.provider_ref,
    maker: row.maker,
    modelId: row.model_id,
    transport: row.provider
  });
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
         body_stop, points_without_review, serve_stop, digest_rung, digest_points_omitted,
         floor_verdict_state, floor_leading_node_id, floor_reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (answer_id, answer_version) DO NOTHING`,
      [
        record.answerId, record.answerVersion, record.runId,
        record.writerPlannedRef, record.checkerPlannedRef, record.writerServedRef, record.checkerServedRef,
        record.writerFallback, record.checkerFallback, record.fallbackReason, record.checkerSameAsWriter,
        record.bodyStop, record.pointsWithoutReview, record.serveStop, record.digestRung, record.digestPointsOmitted,
        record.floorVerdictState, record.floorLeadingNodeId, record.floorReason
      ]
    );
    return inserted.rowCount === 1 ? "INSERTED" : "ALREADY_PRESENT";
  }

  /**
   * The owner's read: the answer's LATEST version that has a row, only when the
   * caller owns the answer's run (`core.run_is_owned_by`, the predicate every
   * owner read uses). Exactly one of the two ownership keys is set; anything
   * else — a malformed id, a missing or doubled key, an answer that is not the
   * caller's, an answer with no row — is null, so the route answers ONE closed
   * 404 for all of them.
   */
  async readLatestForAnswer(input: Readonly<{
    answerId: string;
    ownership: Readonly<{ ownerRef: string | null; legacyAskerId: string | null }>;
  }>): Promise<ServeDisclosureRead | null> {
    const row = await this.#latestOwnedRow(input);
    return row === null ? null : this.#withModels(row);
  }

  /**
   * The owner's floor alone (M5 review, M6): what the story route needs to tell
   * a floor answer from an answer with no label, without the model lookups.
   * Same ownership, same latest-version-with-a-row rule as `readLatestForAnswer`.
   */
  async readLatestFloorForAnswer(input: Readonly<{
    answerId: string;
    ownership: Readonly<{ ownerRef: string | null; legacyAskerId: string | null }>;
  }>): Promise<StoredServeFloor | null> {
    const row = await this.#latestOwnedRow(input);
    return row === null ? null : floorOf(row);
  }

  /**
   * The floor of an answer's latest row, for the DR-184 catch-up (M5 review,
   * M1), which runs on the host and names no owner — and the label receipt's
   * own inputs the floor was derived from: the register version of the label
   * controls and the disagreement the label's rung read.
   */
  async readLatestFloorReceipt(answerId: string): Promise<Readonly<{
    floor: StoredServeFloor;
    registerVersion: number;
    disagreement: Readonly<{ kind: "MEASURED"; value: number }> | Readonly<{ kind: "ABSENT"; reason: string }>;
  }> | null> {
    if (!UUID_TEXT.test(answerId)) return null;
    const result = await this.pool.query<ServeDisclosureRow & { receipt_label: unknown }>(
      `SELECT latest.*, (
         SELECT receipt.served_root_selection -> 'verdictLabel'
           FROM ledger.propagation_run AS receipt
          WHERE receipt.run_id = latest.run_id::uuid
            AND receipt.served_root_selection ->> 'servedNodeId' = latest.floor_leading_node_id
            AND receipt.served_root_selection #>> '{verdictLabel,label}' = latest.floor_verdict_state
            AND receipt.at_seq < (
              SELECT answer.sealed_at_seq FROM serve.answer AS answer
               WHERE answer.answer_id = latest.answer_id::uuid AND answer.answer_version = latest.answer_version
            )
          ORDER BY receipt.at_seq DESC
          LIMIT 1
       ) AS receipt_label
         FROM (${SELECT_ROW}
                WHERE disclosure.answer_id = $1
                ORDER BY disclosure.answer_version DESC
                LIMIT 1) AS latest`,
      [answerId]
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    const floor = floorOf(storedFrom(row));
    if (floor === null) return null;
    const receipt = row.receipt_label as { registerVersion?: unknown; disagreement?: unknown } | null;
    const disagreement = receipt?.disagreement as { kind?: unknown; value?: unknown; reason?: unknown } | undefined;
    const registerVersion = receipt?.registerVersion;
    const parsed = disagreement?.kind === "MEASURED" && typeof disagreement.value === "number"
      ? Object.freeze({ kind: "MEASURED" as const, value: disagreement.value })
      : disagreement?.kind === "ABSENT" && typeof disagreement.reason === "string"
        ? Object.freeze({ kind: "ABSENT" as const, reason: disagreement.reason })
        : null;
    if (parsed === null || typeof registerVersion !== "number" || !Number.isSafeInteger(registerVersion)) {
      throw new TypedDomainError(
        "SERVE_DISCLOSURE_ROW_INVALID",
        "The stored serve disclosure's floor has no label receipt it can be re-derived from"
      );
    }
    return Object.freeze({ floor, registerVersion, disagreement: parsed });
  }

  /** The answer's latest row under the run's ownership predicate, or null. */
  async #latestOwnedRow(input: Readonly<{
    answerId: string;
    ownership: Readonly<{ ownerRef: string | null; legacyAskerId: string | null }>;
  }>): Promise<StoredServeDisclosure | null> {
    if (!UUID_TEXT.test(input.answerId)) return null;
    const access = ownershipOf(input.ownership);
    if (access === null) return null;
    const result = await this.pool.query<ServeDisclosureRow>(
      `${SELECT_ROW}
        WHERE disclosure.answer_id = $1 AND core.run_is_owned_by(disclosure.run_id, $2::uuid, $3)
        ORDER BY disclosure.answer_version DESC
        LIMIT 1`,
      [input.answerId, access.ownerRef, access.legacyAskerId]
    );
    const row = result.rows[0];
    return row === undefined ? null : storedFrom(row);
  }

  /**
   * The operator report's read (`pnpm ops:serve-disclosure`): by an answer id
   * or a run id, the latest version that has a row. No ownership: the command
   * runs on the host, with the runner's own database principal.
   */
  async readLatestForOperator(answerOrRunId: string): Promise<ServeDisclosureRead | null> {
    if (!UUID_TEXT.test(answerOrRunId)) return null;
    const result = await this.pool.query<ServeDisclosureRow>(
      `${SELECT_ROW}
        WHERE disclosure.answer_id = $1 OR disclosure.run_id = $1
        ORDER BY (disclosure.answer_id = $1) DESC, disclosure.answer_version DESC, disclosure.created_at DESC
        LIMIT 1`,
      [answerOrRunId]
    );
    const row = result.rows[0];
    return row === undefined ? null : this.#withModels(storedFrom(row));
  }

  /** The model behind each maker the row names (see `ServeDisclosureRead`). */
  async #withModels(row: StoredServeDisclosure): Promise<ServeDisclosureRead> {
    const served = await this.pool.query<ModelRow & { seat: "WRITER" | "CHECKER" }>(
      `WITH served AS (
         SELECT round.candidate_artifact_ref, round.evaluator_artifact_ref
           FROM serve.synthesis_round AS round
          WHERE round.answer_id = $1 AND round.answer_version = $2
          ORDER BY round.round DESC
          LIMIT 1
       )
       SELECT 'WRITER' AS seat, artifact.provider_ref, artifact.maker, artifact.model_id, artifact.provider
         FROM served JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = served.candidate_artifact_ref
       UNION ALL
       SELECT 'CHECKER' AS seat, artifact.provider_ref, artifact.maker, artifact.model_id, artifact.provider
         FROM served JOIN ledger.raw_artifact AS artifact ON artifact.raw_artifact_id = served.evaluator_artifact_ref`,
      [row.answerId, row.answerVersion]
    );
    const servedBySeat = new Map(served.rows.map((model) => [model.seat, modelFrom(model)] as const));
    const servedModel = (seat: "WRITER" | "CHECKER", ref: string | null): ServeDisclosureModel | null => {
      const model = servedBySeat.get(seat) ?? null;
      return ref !== null && model !== null && model.providerRef === ref ? model : null;
    };
    const writerServed = servedModel("WRITER", row.writerServedRef);
    const checkerServed = servedModel("CHECKER", row.checkerServedRef);
    const known = [writerServed, checkerServed].filter((model): model is ServeDisclosureModel => model !== null);
    const unknownRefs = [...new Set([row.writerPlannedRef, row.checkerPlannedRef])]
      .filter((ref) => !known.some((model) => model.providerRef === ref));
    const byRef = new Map(known.map((model) => [model.providerRef, model] as const));
    if (unknownRefs.length > 0) {
      const inRun = await this.pool.query<ModelRow>(
        `SELECT DISTINCT ON (artifact.provider_ref)
                artifact.provider_ref, artifact.maker, artifact.model_id, artifact.provider
           FROM ledger.raw_artifact AS artifact
          WHERE artifact.run_id = $1 AND artifact.provider_ref = ANY($2::text[])
          ORDER BY artifact.provider_ref, artifact.at_seq DESC`,
        [row.runId, unknownRefs]
      );
      for (const model of inRun.rows) byRef.set(model.provider_ref, modelFrom(model));
    }
    return Object.freeze({
      row,
      models: Object.freeze({
        writerPlanned: byRef.get(row.writerPlannedRef) ?? null,
        writerServed,
        checkerPlanned: byRef.get(row.checkerPlannedRef) ?? null,
        checkerServed
      })
    });
  }
}
