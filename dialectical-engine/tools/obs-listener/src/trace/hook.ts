import {
  loadTraceOccurrence,
  persistTraceResult,
  type FixagentDeliveryTransaction,
} from "@debateai/obs-capture/chain/fixagent-delivery";
import type {
  IncidentForTrace,
  TraceVerdict,
  TracerHook,
} from "../daemon/tracer-hook.js";
import {
  traceCauseChain,
  type TraceFrame,
  type TraceOccurrence,
} from "./walk.js";
import { EXTERNAL_BOUNDARIES, TRACE_VERDICTS } from "./verdict.js";

const REPO_PATH = /^[A-Za-z0-9@+._/-]+$/u;
const SYMBOL = /^(?:[A-Za-z_$][A-Za-z0-9_$]*)(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u;

function fail(code: string): never {
  throw new TypeError(code);
}

function stringValue(value: unknown, code: string): string {
  return typeof value === "string" && value.length > 0 ? value : fail(code);
}

function stringArray(value: unknown, maximum = 64): readonly string[] {
  return Array.isArray(value)
    && value.length <= maximum
    && value.every((entry) => typeof entry === "string" && entry.length > 0)
    ? Object.freeze([...value])
    : fail("FIX11_TRACE_CODES");
}

function isRepoPath(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 512
    && !value.startsWith("/")
    && REPO_PATH.test(value)
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function traceFrames(value: unknown): readonly TraceFrame[] {
  if (!Array.isArray(value) || value.length > 32) fail("FIX11_TRACE_FRAMES");
  const frames: TraceFrame[] = [];
  for (const candidate of value) {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      fail("FIX11_TRACE_FRAMES");
    }
    const frame = candidate as Readonly<Record<string, unknown>>;
    if (frame.kind === "OPAQUE_ZONE" && Object.keys(frame).length === 1) {
      frames.push(Object.freeze({ kind: "OPAQUE_ZONE" }));
    } else if (
      frame.kind === "CODE"
      && Object.keys(frame).length === 3
      && isRepoPath(frame.path)
      && typeof frame.symbol === "string"
      && SYMBOL.test(frame.symbol)
    ) {
      frames.push(Object.freeze({ kind: "CODE", path: frame.path, symbol: frame.symbol }));
    } else {
      fail("FIX11_TRACE_FRAMES");
    }
  }
  return Object.freeze(frames);
}

function decodeOccurrence(row: Record<string, unknown> | undefined): TraceOccurrence | undefined {
  if (row === undefined) return undefined;
  const source = row.source;
  if (source !== "first_party" && source !== "hatchet" && source !== "ui_client") {
    return fail("FIX11_TRACE_SOURCE");
  }
  const occSeq = typeof row.occ_seq === "bigint"
    ? row.occ_seq
    : typeof row.occ_seq === "string" && /^[1-9][0-9]*$/u.test(row.occ_seq)
      ? BigInt(row.occ_seq)
      : fail("FIX11_TRACE_SEQUENCE");
  return Object.freeze({
    occurrenceId: stringValue(row.occurrence_id, "FIX11_TRACE_OCCURRENCE"),
    occSeq,
    runRef: stringValue(row.run_ref, "FIX11_TRACE_RUN"),
    buildRef: stringValue(row.build_ref, "FIX11_TRACE_BUILD"),
    parentOccurrenceRef: stringValue(row.parent_occurrence_ref, "FIX11_TRACE_PARENT"),
    causeRelation: row.cause_relation === null
      ? null
      : stringValue(row.cause_relation, "FIX11_TRACE_RELATION"),
    causeChainCodes: stringArray(row.cause_chain_codes, 8),
    frames: traceFrames(row.frames),
    zoneContext: typeof row.zone_context === "boolean"
      ? row.zone_context
      : fail("FIX11_TRACE_ZONE"),
    source,
    code: stringValue(row.code, "FIX11_TRACE_CODE"),
    taxonomyClass: stringValue(row.taxonomy_class, "FIX11_TRACE_TAXONOMY"),
    capturePoint: stringValue(row.capture_point, "FIX11_TRACE_CAPTURE_POINT"),
    redactionPolicyVersion: stringValue(
      row.redaction_policy_version,
      "FIX11_TRACE_REDACTION_VERSION",
    ),
    allowlistSetId: stringValue(row.allowlist_set_id, "FIX11_TRACE_ALLOWLIST_VERSION"),
  });
}

function traceVerdict(
  verdict: string,
  evidence: Readonly<Record<string, unknown>>,
): TraceVerdict {
  if (!TRACE_VERDICTS.includes(verdict as never)) fail("FIX11_TRACE_VERDICT");
  const evidenceIds = stringArray(evidence.evidence_ids);
  const queryCount = evidence.query_count;
  if (!Number.isSafeInteger(queryCount) || Number(queryCount) < 0) {
    fail("FIX11_TRACE_QUERY_COUNT");
  }
  const root = evidence.root;
  if (verdict === "CODE_ROOT") {
    if (root === null || typeof root !== "object" || Array.isArray(root)) fail("FIX11_TRACE_ROOT");
    const value = root as Readonly<Record<string, unknown>>;
    return Object.freeze({
      verdict,
      root: Object.freeze({
        path: stringValue(value.path, "FIX11_TRACE_ROOT"),
        symbol: stringValue(value.symbol, "FIX11_TRACE_ROOT"),
      }),
      evidenceIds,
      queryCount: Number(queryCount),
    });
  }
  if (verdict === "EXTERNAL_ROOT") {
    if (root === null || typeof root !== "object" || Array.isArray(root)) fail("FIX11_TRACE_ROOT");
    const boundary = (root as Readonly<Record<string, unknown>>).boundary;
    if (!EXTERNAL_BOUNDARIES.includes(boundary as never)) fail("FIX11_TRACE_ROOT");
    return Object.freeze({
      verdict,
      root: Object.freeze({ boundary: boundary as (typeof EXTERNAL_BOUNDARIES)[number] }),
      evidenceIds,
      queryCount: Number(queryCount),
    });
  }
  return Object.freeze({
    verdict: verdict as Exclude<TraceVerdict["verdict"], "CODE_ROOT" | "EXTERNAL_ROOT">,
    root: null,
    evidenceIds,
    queryCount: Number(queryCount),
  });
}

export function createTransactionTracerHook(
  transaction: FixagentDeliveryTransaction,
  causeDepthMax: number,
): TracerHook {
  return Object.freeze({
    async onIncidentNew(incident: IncidentForTrace): Promise<TraceVerdict> {
      const result = await traceCauseChain(incident, Object.freeze({
        async loadOccurrence(occurrenceId: string) {
          return decodeOccurrence(await loadTraceOccurrence(transaction, occurrenceId));
        },
      }), causeDepthMax);
      const persistedEvidence = Object.freeze({
        ...result.evidence,
        root: result.verdict.root,
      });
      const persisted = await persistTraceResult(transaction, {
        incidentId: incident.incidentId,
        occurrenceId: incident.occurrenceId,
        verdict: result.verdict.verdict,
        evidence: persistedEvidence,
      });
      return traceVerdict(persisted.verdict, persisted.evidence);
    },
  });
}
