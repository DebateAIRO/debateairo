import type {
  ExternalBoundary,
  IncidentForTrace,
  TraceVerdict,
} from "../daemon/tracer-hook.js";
import {
  CAUSE_NOT_CAPTURED,
  isOccurrenceReference,
  lineageIsCorrupt,
  NO_CAUSE,
  REPLAY_REQUIRED,
} from "./lineage.js";
import { terminalVerdict, TRACE_CAUSE_DEPTH_MAX } from "./verdict.js";

export type TraceFrame =
  | Readonly<{ readonly kind: "CODE"; readonly path: string; readonly symbol: string }>
  | Readonly<{ readonly kind: "OPAQUE_ZONE" }>;

export interface TraceOccurrence {
  readonly occurrenceId: string;
  readonly occSeq: bigint;
  readonly runRef: string;
  readonly buildRef: string;
  readonly parentOccurrenceRef: string;
  readonly causeRelation: string | null;
  readonly causeChainCodes: readonly string[];
  readonly frames: readonly TraceFrame[];
  readonly zoneContext: boolean;
  readonly source: "first_party" | "hatchet" | "ui_client";
  readonly code: string;
  readonly taxonomyClass: string;
  readonly capturePoint: string;
  readonly redactionPolicyVersion: string;
  readonly allowlistSetId: string;
}

export interface TraceOccurrenceReader {
  loadOccurrence(occurrenceId: string): Promise<TraceOccurrence | undefined>;
}

export interface PersistedTraceEvidence {
  readonly evidence_ids: readonly string[];
  readonly visited_path: readonly string[];
  readonly query_count: number;
  readonly query_bound: number;
  readonly manifest_versions: Readonly<{
    readonly redaction_policy_version: string;
    readonly allowlist_set_id: string;
  }>;
}

export interface TraceWalkResult {
  readonly verdict: TraceVerdict;
  readonly evidence: PersistedTraceEvidence;
}

function containsOpaqueZone(row: TraceOccurrence): boolean {
  return row.zoneContext || row.frames.some((frame) => frame.kind === "OPAQUE_ZONE");
}

function externalBoundary(row: TraceOccurrence): ExternalBoundary | undefined {
  if (row.source === "hatchet" || row.code.startsWith("HATCHET_")) return "hatchet_engine";
  if (
    row.taxonomyClass === "DB_FAILURE"
    || row.code === "DATABASE_POOL_FAILED"
    || row.causeChainCodes.includes("3D000")
  ) {
    return "postgres_host";
  }
  if (row.taxonomyClass === "PROVIDER_EXHAUSTED" || row.capturePoint === "provider") {
    return "provider_http";
  }
  return row.code === "CLI_SUBPROCESS_FAILED" ? "cli_subprocess" : undefined;
}

function finish(
  rows: readonly TraceOccurrence[],
  evidenceIds: readonly string[],
  queryCount: number,
): TraceVerdict {
  const deepest = rows[rows.length - 1];
  if (deepest !== undefined) {
    const boundary = externalBoundary(deepest);
    if (boundary !== undefined) {
      return Object.freeze({
        verdict: "EXTERNAL_ROOT",
        root: Object.freeze({ boundary }),
        evidenceIds: Object.freeze([...evidenceIds]),
        queryCount,
      });
    }
  }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.source !== "first_party") continue;
    const frame = row.frames.find((candidate) => candidate.kind === "CODE");
    if (frame?.kind === "CODE") {
      return Object.freeze({
        verdict: "CODE_ROOT",
        root: Object.freeze({ path: frame.path, symbol: frame.symbol }),
        evidenceIds: Object.freeze([...evidenceIds]),
        queryCount,
      });
    }
  }
  return terminalVerdict("INSUFFICIENT_EVIDENCE", evidenceIds, queryCount);
}

function evidence(
  rows: readonly TraceOccurrence[],
  evidenceIds: readonly string[],
  queryCount: number,
  queryBound: number,
): PersistedTraceEvidence {
  const deepest = rows[rows.length - 1];
  return Object.freeze({
    evidence_ids: Object.freeze([...evidenceIds]),
    visited_path: Object.freeze([...evidenceIds]),
    query_count: queryCount,
    query_bound: queryBound,
    manifest_versions: Object.freeze({
      redaction_policy_version: deepest?.redactionPolicyVersion ?? "UNKNOWN",
      allowlist_set_id: deepest?.allowlistSetId ?? "UNKNOWN",
    }),
  });
}

export async function traceCauseChain(
  incident: IncidentForTrace,
  reader: TraceOccurrenceReader,
  causeDepthMax: number,
): Promise<TraceWalkResult> {
  const queryBound = Number.isSafeInteger(causeDepthMax) && causeDepthMax > 0
    ? Math.min(causeDepthMax, TRACE_CAUSE_DEPTH_MAX)
    : 1;
  const rows: TraceOccurrence[] = [];
  const visited = new Set<string>();
  const evidenceIds: string[] = [];
  let queryCount = 0;
  let occurrenceId = incident.occurrenceId;
  let child: TraceOccurrence | undefined;
  let verdict: TraceVerdict | undefined;

  while (queryCount < queryBound) {
    if (visited.has(occurrenceId)) {
      verdict = terminalVerdict("CAUSE_CYCLE", evidenceIds, queryCount);
      break;
    }
    visited.add(occurrenceId);
    queryCount += 1;
    const row = await reader.loadOccurrence(occurrenceId);
    if (row === undefined) {
      verdict = terminalVerdict(
        rows.length === 0 ? "CAPABILITY_GAP" : "CAUSE_GAP",
        evidenceIds,
        queryCount,
      );
      break;
    }
    rows.push(row);
    evidenceIds.push(row.occurrenceId);
    if (containsOpaqueZone(row)) {
      verdict = terminalVerdict("ZONE_BOUNDARY", evidenceIds, queryCount);
      break;
    }
    if (child !== undefined && lineageIsCorrupt(child, row)) {
      verdict = terminalVerdict("CORRUPT_LINEAGE", evidenceIds, queryCount);
      break;
    }
    if (row.causeRelation === REPLAY_REQUIRED) {
      verdict = terminalVerdict("REPLAY_UNSUPPORTED", evidenceIds, queryCount);
      break;
    }
    if (row.parentOccurrenceRef === NO_CAUSE) {
      verdict = finish(rows, evidenceIds, queryCount);
      break;
    }
    if (row.parentOccurrenceRef === CAUSE_NOT_CAPTURED) {
      verdict = externalBoundary(row) === undefined
        ? terminalVerdict("CAPABILITY_GAP", evidenceIds, queryCount)
        : finish(rows, evidenceIds, queryCount);
      break;
    }
    if (!isOccurrenceReference(row.parentOccurrenceRef)) {
      verdict = terminalVerdict("CORRUPT_LINEAGE", evidenceIds, queryCount);
      break;
    }
    if (queryCount === queryBound) {
      verdict = terminalVerdict("CAUSE_DEPTH_EXCEEDED", evidenceIds, queryCount);
      break;
    }
    child = row;
    occurrenceId = row.parentOccurrenceRef;
  }

  const resolved = verdict ?? terminalVerdict("CAUSE_DEPTH_EXCEEDED", evidenceIds, queryCount);
  return Object.freeze({
    verdict: resolved,
    evidence: evidence(rows, evidenceIds, queryCount, queryBound),
  });
}
