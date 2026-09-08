import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import * as traceLibrary from "../../tools/obs-listener/src/trace/index.js";

const CLOSED_VERDICTS = [
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
] as const;

describe("FIX-11 trace architecture", () => {
  it("exports one closed deterministic library surface", () => {
    expect(traceLibrary.TRACE_VERDICTS).toEqual(CLOSED_VERDICTS);
    expect(traceLibrary.traceCauseChain).toBeTypeOf("function");
    expect(traceLibrary.createTransactionTracerHook).toBeTypeOf("function");
  });

  it("links no detail store, replay app, filesystem writer, or model adapter", async () => {
    const sources = await Promise.all([
      "hook.ts",
      "lineage.ts",
      "verdict.ts",
      "walk.ts",
    ].map((name) => readFile(
      new URL(`../../tools/obs-listener/src/trace/${name}`, import.meta.url),
      "utf8",
    )));
    const joined = sources.join("\n");
    for (const forbidden of [
      "occurrence_detail",
      "apps/replay",
      "node:fs",
      "openai",
      "anthropic",
      "model-adapter",
    ]) {
      expect(joined).not.toContain(forbidden);
    }
  });

  it("pins lineage lookup, trace uniqueness, and the same ten database verdicts", async () => {
    const migration = await readFile(
      new URL("../../migrations/0065_fix11_trace.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain("occurrence_parent_occurrence_ref_idx");
    expect(migration).toContain("trace_incident_id_key");
    for (const verdict of CLOSED_VERDICTS) {
      expect(migration).toContain(`'${verdict}'`);
    }
    expect(migration).not.toMatch(
      /GRANT\s+SELECT\s+ON\s+obs\.occurrence_detail\s+TO\s+debateai_obs_listener/iu,
    );
  });
});
