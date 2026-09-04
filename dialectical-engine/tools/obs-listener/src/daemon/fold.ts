import type { PoolClient } from "pg";
import { advanceContiguousCursor, FIXAGENT_CONSUMER, readCursor } from "./cursor.js";
import { decodeOccurrence, type OccurrenceRecord, type OccurrenceSeverity, type OccurrenceSource } from "./intake.js";
import { appendPoisonReceipt, appendSkipReceipt } from "./poison.js";

export type WorkUnitKey =
  | readonly ["DECLARED_PAIR", string, string]
  | readonly ["SOURCE_EVENT", OccurrenceSource, string];

export interface IncidentAggregate {
  readonly fingerprint: string;
  readonly fingerprintVersion: number;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly distinctWorkUnitCount: bigint;
  readonly maxSeverity: OccurrenceSeverity;
  readonly sourceSet: readonly OccurrenceSource[];
}

export type IncidentState =
  | "NEW" | "RESEARCHING" | "TICKETED" | "PROPOSED" | "APPROVED" | "FIXING"
  | "FIXED_UNVALIDATED" | "FIXED_VALIDATED" | "REGRESSED" | "ESCALATED" | "PARKED";

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEVERITY_ORDER: readonly OccurrenceSeverity[] = ["INFO", "DEGRADED", "SEVERE", "FATAL"];
const SOURCE_ORDER: readonly OccurrenceSource[] = ["first_party", "hatchet", "ui_client"];

const LEGAL_EDGES = Object.freeze({
  NEW: Object.freeze(["RESEARCHING"]),
  RESEARCHING: Object.freeze(["TICKETED", "PROPOSED", "ESCALATED"]),
  TICKETED: Object.freeze(["RESEARCHING"]),
  PROPOSED: Object.freeze(["APPROVED", "TICKETED", "PARKED"]),
  APPROVED: Object.freeze(["FIXING"]),
  FIXING: Object.freeze(["FIXED_UNVALIDATED", "PARKED", "APPROVED"]),
  FIXED_UNVALIDATED: Object.freeze(["FIXED_VALIDATED", "REGRESSED"]),
  FIXED_VALIDATED: Object.freeze(["REGRESSED"]),
  REGRESSED: Object.freeze(["ESCALATED"]),
  ESCALATED: Object.freeze([]),
  PARKED: Object.freeze([])
} satisfies Record<IncidentState, readonly IncidentState[]>);

export function workUnitKey(row: OccurrenceRecord): WorkUnitKey {
  if (CANONICAL_UUID.test(row.runRef) && CANONICAL_UUID.test(row.workItemRef)) {
    return Object.freeze(["DECLARED_PAIR", row.runRef, row.workItemRef]);
  }
  return Object.freeze(["SOURCE_EVENT", row.source, row.sourceEventRef]);
}

export function fixEligibility(sourceSet: readonly OccurrenceSource[]):
"FIX_ELIGIBLE" | "FIX_INELIGIBLE" {
  return sourceSet.length === 1 && sourceSet[0] === "ui_client"
    ? "FIX_INELIGIBLE" : "FIX_ELIGIBLE";
}

export function foldIncident(rows: readonly OccurrenceRecord[]): IncidentAggregate {
  const first = rows[0];
  if (first === undefined) throw new TypeError("INCIDENT_ROWS_REQUIRED");
  let firstSeen = first.occurredAt.getTime();
  let lastSeen = firstSeen;
  let severity = first.severity;
  const sources = new Set<OccurrenceSource>();
  const workUnits = new Set<string>();
  for (const row of rows) {
    if (row.fingerprint !== first.fingerprint || row.fingerprintVersion !== first.fingerprintVersion) {
      throw new TypeError("INCIDENT_IDENTITY_MISMATCH");
    }
    firstSeen = Math.min(firstSeen, row.occurredAt.getTime());
    lastSeen = Math.max(lastSeen, row.occurredAt.getTime());
    if (SEVERITY_ORDER.indexOf(row.severity) > SEVERITY_ORDER.indexOf(severity)) severity = row.severity;
    sources.add(row.source);
    workUnits.add(JSON.stringify(workUnitKey(row)));
  }
  return Object.freeze({
    fingerprint: first.fingerprint,
    fingerprintVersion: first.fingerprintVersion,
    firstSeenAt: new Date(firstSeen),
    lastSeenAt: new Date(lastSeen),
    distinctWorkUnitCount: BigInt(workUnits.size),
    maxSeverity: severity,
    sourceSet: Object.freeze(SOURCE_ORDER.filter((source) => sources.has(source)))
  });
}

export function isLegalTransition(from: IncidentState, to: IncidentState): boolean {
  return (LEGAL_EDGES[from] as readonly IncidentState[]).includes(to);
}

export interface DeliveryOutcome {
  readonly occurrenceId: string;
  readonly occSeq: bigint;
  readonly result: "FOLDED" | "SKIPPED" | "DEAD_LETTERED" | "ALREADY_ACKED";
  readonly cursor: bigint;
}

type DeliveryClient = Pick<PoolClient, "query">;

async function appendAcknowledgement(client: DeliveryClient, occurrenceId: string): Promise<void> {
  const attempt = await client.query<{ next_attempt: number }>(`
    SELECT coalesce(max(attempt_index),-1)+1 AS next_attempt
    FROM obs.delivery WHERE occurrence_id=$1 AND consumer=$2
  `, [occurrenceId, FIXAGENT_CONSUMER]);
  await client.query(`
    INSERT INTO obs.delivery (occurrence_id,consumer,attempt_index,lease_ref,delivery_status)
    SELECT $1,$2,$3,$4,'ACKED'
    WHERE NOT EXISTS (
      SELECT 1 FROM obs.delivery WHERE occurrence_id=$1 AND consumer=$2
        AND delivery_status='ACKED'
    )
  `, [
    occurrenceId, FIXAGENT_CONSUMER, attempt.rows[0]?.next_attempt ?? 0,
    `${FIXAGENT_CONSUMER}:${occurrenceId}`
  ]);
}

async function upsertAggregate(client: DeliveryClient, current: OccurrenceRecord): Promise<void> {
  const rows = await client.query<Record<string, unknown>>(`
    SELECT occurrence.* FROM obs.occurrence AS occurrence
    WHERE occurrence.fingerprint=$1 AND occurrence.fingerprint_version=$2
      AND (occurrence.occurrence_id=$3 OR EXISTS (
        SELECT 1 FROM obs.delivery AS delivery
        WHERE delivery.occurrence_id=occurrence.occurrence_id
          AND delivery.consumer=$4 AND delivery.delivery_status='ACKED'
      )) ORDER BY occurrence.occ_seq
  `, [current.fingerprint, current.fingerprintVersion, current.occurrenceId, FIXAGENT_CONSUMER]);
  const accepted = rows.rows.flatMap((row) => {
    const result = decodeOccurrence(row);
    return result.kind === "ACCEPT" ? [result.occurrence] : [];
  });
  const aggregate = foldIncident(accepted);
  await client.query(`
    INSERT INTO obs.incident (
      fingerprint,fingerprint_version,first_seen_at,last_seen_at,
      distinct_work_unit_count,max_severity,state,source_set
    ) VALUES ($1,$2,$3,$4,$5,$6,'NEW',$7::jsonb)
    ON CONFLICT (fingerprint,fingerprint_version) DO UPDATE SET
      first_seen_at=EXCLUDED.first_seen_at,last_seen_at=EXCLUDED.last_seen_at,
      distinct_work_unit_count=EXCLUDED.distinct_work_unit_count,
      max_severity=EXCLUDED.max_severity,source_set=EXCLUDED.source_set,
      updated_at=statement_timestamp()
  `, [
    aggregate.fingerprint, aggregate.fingerprintVersion, aggregate.firstSeenAt,
    aggregate.lastSeenAt, aggregate.distinctWorkUnitCount.toString(), aggregate.maxSeverity,
    JSON.stringify(aggregate.sourceSet)
  ]);
}

export async function deliverOccurrence(
  client: DeliveryClient,
  occurrenceId: string
): Promise<DeliveryOutcome> {
  await client.query("BEGIN");
  try {
    await client.query(`
      SELECT pg_advisory_xact_lock(
        hashtextextended('fixagent-daemon:occurrence:' || $1::uuid::text, 0)
      )
    `, [occurrenceId]);
    const selected = await client.query<Record<string, unknown>>(`
      SELECT occurrence.* FROM obs.occurrence AS occurrence
      WHERE occurrence.occurrence_id=$1
    `, [occurrenceId]);
    const row = selected.rows[0];
    if (row === undefined) throw new TypeError("OCCURRENCE_NOT_FOUND");
    const sequenceText = typeof row.occ_seq === "string" || typeof row.occ_seq === "number"
      || typeof row.occ_seq === "bigint" ? String(row.occ_seq) : "0";
    const occSeq = BigInt(sequenceText);
    const prior = await client.query<{ acknowledged: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM obs.delivery WHERE occurrence_id=$1 AND consumer=$2
        AND delivery_status='ACKED') AS acknowledged
    `, [occurrenceId, FIXAGENT_CONSUMER]);
    if (prior.rows[0]?.acknowledged === true) {
      const cursor = await readCursor(client);
      await client.query("COMMIT");
      return Object.freeze({ occurrenceId, occSeq, result: "ALREADY_ACKED", cursor });
    }

    const intake = decodeOccurrence(row);
    let result: DeliveryOutcome["result"];
    if (intake.kind === "ACCEPT") {
      await upsertAggregate(client, intake.occurrence);
      result = "FOLDED";
    } else if (intake.kind === "SKIP") {
      await appendSkipReceipt(client, { occurrenceId, occSeq }, intake.reason);
      result = "SKIPPED";
    } else {
      await appendPoisonReceipt(client, { occurrenceId, occSeq }, intake.reason);
      result = "DEAD_LETTERED";
    }
    await appendAcknowledgement(client, occurrenceId);
    const cursor = await advanceContiguousCursor(client);
    await client.query("COMMIT");
    return Object.freeze({ occurrenceId, occSeq, result, cursor });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
