import type { OccurrenceRecord, OccurrenceSeverity, OccurrenceSource } from "./intake.js";

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

const LEGAL_EDGES: Readonly<Record<IncidentState, readonly IncidentState[]>> = Object.freeze({
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
});

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
  return LEGAL_EDGES[from].includes(to);
}
