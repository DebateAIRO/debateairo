import type { ExternalBoundary, TraceVerdict } from "../daemon/tracer-hook.js";

export const TRACE_CAUSE_DEPTH_MAX = 64;

export const TRACE_VERDICTS = Object.freeze([
  "CODE_ROOT",
  "EXTERNAL_ROOT",
  "ZONE_BOUNDARY",
  "INSUFFICIENT_EVIDENCE",
  "CAUSE_CYCLE",
  "CAUSE_GAP",
  "CAUSE_DEPTH_EXCEEDED",
  "CORRUPT_LINEAGE",
  "REPLAY_UNSUPPORTED",
  "CAPABILITY_GAP",
] as const);

export type TraceVerdictCode = (typeof TRACE_VERDICTS)[number];

export const EXTERNAL_BOUNDARIES = Object.freeze([
  "provider_http",
  "postgres_host",
  "hatchet_engine",
  "cli_subprocess",
] as const satisfies readonly ExternalBoundary[]);

export function terminalVerdict(
  verdict: Exclude<TraceVerdictCode, "CODE_ROOT" | "EXTERNAL_ROOT">,
  evidenceIds: readonly string[],
  queryCount: number,
): TraceVerdict {
  return Object.freeze({
    verdict,
    root: null,
    evidenceIds: Object.freeze([...evidenceIds]),
    queryCount,
  });
}
