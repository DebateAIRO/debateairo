import { describe, expect, it } from "vitest";

import { createSharedRedactor } from "../../packages/obs-capture/src/redactor.js";
import { projectTraceFrames } from "../../packages/obs-capture/src/trace-frames.js";
import {
  traceCauseChain,
  type TraceOccurrence,
  type TraceOccurrenceReader,
} from "../../tools/obs-listener/src/trace/walk.js";
import { TRACE_VERDICTS } from "../../tools/obs-listener/src/trace/verdict.js";

const INCIDENT = "10000000-0000-4000-8000-000000000001";
const SEED = "20000000-0000-4000-8000-000000000001";
const PARENT = "20000000-0000-4000-8000-000000000002";
const RUN = "30000000-0000-4000-8000-000000000001";

function occurrence(overrides: Partial<TraceOccurrence> = {}): TraceOccurrence {
  return Object.freeze({
    occurrenceId: SEED,
    occSeq: 2n,
    runRef: RUN,
    buildRef: "build:one",
    parentOccurrenceRef: "NO_CAUSE",
    causeRelation: null,
    causeChainCodes: Object.freeze([]),
    frames: Object.freeze([]),
    zoneContext: false,
    source: "first_party",
    code: "OBS_SCHEDULER_JOB_FAILED",
    taxonomyClass: "JOB_FAILURE",
    capturePoint: "job",
    redactionPolicyVersion: "g0",
    allowlistSetId: "g0-empty-parameters",
    ...overrides,
  });
}

function reader(rows: readonly TraceOccurrence[]): TraceOccurrenceReader {
  const byId = new Map(rows.map((row) => [row.occurrenceId, row]));
  return Object.freeze({
    loadOccurrence: async (occurrenceId: string) => byId.get(occurrenceId),
  });
}

async function trace(rows: readonly TraceOccurrence[], causeDepthMax = 64) {
  return traceCauseChain({
    incidentId: INCIDENT,
    occurrenceId: SEED,
    fingerprint: "fingerprint:one",
    fingerprintVersion: 1,
  }, reader(rows), causeDepthMax);
}

describe("FIX-11 captured frame contract", () => {
  it("projects repository frames with symbols and replaces every zone frame with one opaque marker", () => {
    const outer = Object.assign(new Error("PLANTED_OUTER_TEXT"), {
      stack: [
        "Error: PLANTED_OUTER_TEXT",
        "    at runLivenessSweep (/repo/apps/scheduler/src/index.ts:19:7)",
        "    at registerUser (/repo/apps/api/src/registration.ts:41:3)",
      ].join("\n"),
    });
    const inner = Object.assign(new Error("PLANTED_INNER_TEXT"), {
      stack: [
        "Error: PLANTED_INNER_TEXT",
        "    at queryDatabase (/repo/packages/db/src/query.ts:8:2)",
      ].join("\n"),
    });
    Object.defineProperty(outer, "cause", { enumerable: false, value: inner });

    const frames = projectTraceFrames(outer, "/repo", 64);

    expect(frames).toEqual([
      { kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
      { kind: "OPAQUE_ZONE" },
      { kind: "CODE", path: "packages/db/src/query.ts", symbol: "queryDatabase" },
    ]);
    expect(JSON.stringify(frames)).not.toContain("registration.ts");
    expect(JSON.stringify(frames)).not.toContain("/repo/");
    expect(JSON.stringify(frames)).not.toContain("PLANTED_");
    expect(Object.isFrozen(frames)).toBe(true);
    expect(frames.every(Object.isFrozen)).toBe(true);
  });

  it("puts only the captured-frame projection on the durable envelope", () => {
    const error = Object.assign(new Error("PLANTED_DATABASE_TEXT"), {
      code: "DATABASE_POOL_FAILED",
      stack: [
        "Error: PLANTED_DATABASE_TEXT",
        "    at connectPool (/repo/packages/db/src/index.ts:51:9)",
      ].join("\n"),
    });
    const redactor = createSharedRedactor({
      environment: "test",
      build_ref: "build:one",
      build_dirty: false,
      runtime: "runner",
      component: Object.freeze({ process: "runner", package: "@debateai/runner" }),
      writer_identity: "runner",
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
      repoRoot: "/repo",
      causeDepthMax: 64,
    });

    const envelope = redactor.redact({
      kind: "handled_error",
      payload_ref: error,
      ambient_context_ref: undefined,
      handled_context_ref: Object.freeze({ code: "DATABASE_POOL_FAILED" }),
      cause_chain_codes_ref: Object.freeze(["DATABASE_POOL_FAILED"]),
    });

    expect(envelope.frames).toEqual([
      { kind: "CODE", path: "packages/db/src/index.ts", symbol: "connectPool" },
    ]);
    expect(JSON.stringify(envelope)).not.toContain("PLANTED_DATABASE_TEXT");
    expect(JSON.stringify(envelope)).not.toContain("/repo/");
  });
});

describe("FIX-11 bounded closed-vocabulary trace", () => {
  it("returns each of the ten verdicts from a distinct deterministic predicate", async () => {
    const codeRoot = occurrence({
      frames: Object.freeze([
        Object.freeze({ kind: "CODE", path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" }),
      ]),
    });
    const external = occurrence({
      taxonomyClass: "DB_FAILURE",
      code: "DATABASE_POOL_FAILED",
      causeChainCodes: Object.freeze(["DATABASE_POOL_FAILED", "3D000"]),
      parentOccurrenceRef: "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED",
      causeRelation: "WRAPS",
    });
    const zone = occurrence({
      frames: Object.freeze([Object.freeze({ kind: "OPAQUE_ZONE" })]),
    });
    const insufficient = occurrence();
    const cycle = occurrence({ parentOccurrenceRef: SEED, causeRelation: "WRAPS" });
    const gap = occurrence({ parentOccurrenceRef: PARENT, causeRelation: "WRAPS" });
    const depthRows = Array.from({ length: 65 }, (_, index) => occurrence({
      occurrenceId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      occSeq: BigInt(65 - index),
      parentOccurrenceRef: index === 64
        ? "NO_CAUSE"
        : `20000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
      causeRelation: index === 64 ? null : "WRAPS",
    }));
    const corruptParent = occurrence({
      occurrenceId: PARENT,
      occSeq: 3n,
      runRef: "30000000-0000-4000-8000-000000000099",
    });
    const corrupt = occurrence({ parentOccurrenceRef: PARENT, causeRelation: "WRAPS" });
    const replay = occurrence({
      parentOccurrenceRef: "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED",
      causeRelation: "REPLAY_REQUIRED",
      causeChainCodes: Object.freeze(["OBS_SCHEDULER_JOB_FAILED", "CAUSE_CODE_UNAVAILABLE"]),
    });
    const capability = occurrence({
      parentOccurrenceRef: "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED",
      causeRelation: "WRAPS",
      causeChainCodes: Object.freeze(["OBS_SCHEDULER_JOB_FAILED", "CAUSE_CODE_UNAVAILABLE"]),
    });

    const results = [
      await trace([codeRoot]),
      await trace([external]),
      await trace([zone]),
      await trace([insufficient]),
      await trace([cycle]),
      await trace([gap]),
      await trace(depthRows),
      await trace([corrupt, corruptParent]),
      await trace([replay]),
      await trace([capability]),
    ];

    expect(results.map((result) => result.verdict.verdict)).toEqual(TRACE_VERDICTS);
    expect(results[0]?.verdict).toMatchObject({
      verdict: "CODE_ROOT",
      root: { path: "apps/scheduler/src/index.ts", symbol: "runLivenessSweep" },
    });
    expect(results[1]?.verdict).toMatchObject({
      verdict: "EXTERNAL_ROOT",
      root: { boundary: "postgres_host" },
    });
    expect(results[2]?.verdict.root).toBeNull();
  });

  it("counts only bounded occurrence reads and records the exact visited path and manifest versions", async () => {
    const parent = occurrence({
      occurrenceId: PARENT,
      occSeq: 1n,
      frames: Object.freeze([
        Object.freeze({ kind: "CODE", path: "packages/providers/src/index.ts", symbol: "callProvider" }),
      ]),
    });
    const result = await trace([
      occurrence({ parentOccurrenceRef: PARENT, causeRelation: "WRAPS" }),
      parent,
    ]);

    expect(result.verdict.queryCount).toBe(2);
    expect(result.verdict.evidenceIds).toEqual([SEED, PARENT]);
    expect(result.evidence).toEqual({
      evidence_ids: [SEED, PARENT],
      visited_path: [SEED, PARENT],
      query_count: 2,
      query_bound: 64,
      manifest_versions: {
        redaction_policy_version: "g0",
        allowlist_set_id: "g0-empty-parameters",
      },
    });
  });

  it("clamps caller-supplied depth limits to the policy maximum", async () => {
    const depthRows = Array.from({ length: 65 }, (_, index) => occurrence({
      occurrenceId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      occSeq: BigInt(65 - index),
      parentOccurrenceRef: index === 64
        ? "NO_CAUSE"
        : `20000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
      causeRelation: index === 64 ? null : "WRAPS",
    }));

    const result = await trace(depthRows, 1_000);

    expect(result.verdict.verdict).toBe("CAUSE_DEPTH_EXCEEDED");
    expect(result.verdict.queryCount).toBe(64);
    expect(result.evidence.query_bound).toBe(64);
  });

  it("gives zone evidence precedence anywhere in the chain", async () => {
    const result = await trace([
      occurrence({ parentOccurrenceRef: PARENT, causeRelation: "WRAPS" }),
      occurrence({ occurrenceId: PARENT, occSeq: 1n, zoneContext: true }),
    ]);
    expect(result.verdict.verdict).toBe("ZONE_BOUNDARY");
    expect(result.verdict.root).toBeNull();
  });
});
