import { describe, expect, it } from "vitest";

import {
  CHAOS_CASES,
  evaluateChaosObservation,
} from "../../acceptance/obs/cases/chaos-common.js";
import {
  evaluateBootImportFixture,
  evaluateInstallerTrace,
} from "../../acceptance/obs/cases/installer-graph.js";
import { parseObsG1Arguments } from "../../acceptance/obs/index.js";

describe("FIX-08 C3 chaos verdicts", () => {
  it("accepts the documented chaos-* selector", () => {
    expect(parseObsG1Arguments(["--family", "obs-g1", "--only", "chaos-*"])).toEqual({
      only: ["chaos-*"],
    });
  });

  it("registers the nine named chaos conditions exactly once", () => {
    expect(CHAOS_CASES.map((entry) => entry.name)).toEqual([
      "chaos-db-down",
      "chaos-disk-full-ro",
      "chaos-queue-full",
      "chaos-cyclic-error",
      "chaos-burst-10x",
      "chaos-redactor-failure",
      "chaos-recursive-writer",
      "chaos-crash-during-flush",
      "chaos-recovery-reingest",
    ]);
  });

  it("rejects changed product exit semantics", () => {
    expect(evaluateChaosObservation({
      controlExit: 23,
      captureExit: 24,
      spooled: 1,
      lost: 0,
      countedLost: 0,
      partialBatches: 0,
    }, { minimumSpooled: 1 })).toEqual({ passed: false, code: "EXIT_CODE_CHANGED" });
  });

  it("rejects uncounted loss and partial batches", () => {
    expect(evaluateChaosObservation({
      controlExit: 23,
      captureExit: 23,
      spooled: 0,
      lost: 2,
      countedLost: 1,
      partialBatches: 0,
    })).toEqual({ passed: false, code: "LOSS_NOT_COUNTED" });
    expect(evaluateChaosObservation({
      controlExit: 23,
      captureExit: 23,
      spooled: 3,
      lost: 0,
      countedLost: 0,
      partialBatches: 1,
    })).toEqual({ passed: false, code: "PARTIAL_BATCH" });
  });

  it("accepts preserved exit semantics with fully accounted outcomes", () => {
    expect(evaluateChaosObservation({
      controlExit: 23,
      captureExit: 23,
      spooled: 10,
      lost: 0,
      countedLost: 0,
      partialBatches: 0,
    }, { minimumSpooled: 10 })).toEqual({ passed: true });
  });
});

describe("FIX-08 C3 installer graph", () => {
  it("rejects product database and non-builtin package imports", () => {
    expect(evaluateInstallerTrace([
      "node:fs",
      "file:///repo/packages/obs-capture/src/safe-metadata.ts",
      "file:///repo/node_modules/@debateai/db/src/index.ts",
    ])).toEqual({ passed: false, forbidden: ["@debateai/db"] });
    expect(evaluateInstallerTrace([
      "node:fs",
      "file:///repo/packages/obs-capture/src/safe-metadata.ts",
      "file:///repo/node_modules/left-pad/index.js",
    ])).toEqual({ passed: false, forbidden: ["left-pad"] });
  });

  it("accepts builtins and installer-local source modules", () => {
    expect(evaluateInstallerTrace([
      "node:crypto",
      "node:fs",
      "file:///repo/packages/obs-capture/install/scheduler.ts",
      "file:///repo/packages/obs-capture/src/spool-index.ts",
    ])).toEqual({ passed: true, forbidden: [] });
  });

  it("requires the throwing product-db import fixture to preserve a spool record", () => {
    expect(evaluateBootImportFixture({ exitCode: 1, spooled: 1 })).toEqual({ passed: true });
    expect(evaluateBootImportFixture({ exitCode: 0, spooled: 1 })).toEqual({
      passed: false,
      code: "FIXTURE_DID_NOT_THROW",
    });
    expect(evaluateBootImportFixture({ exitCode: 1, spooled: 0 })).toEqual({
      passed: false,
      code: "BOOT_THROW_NOT_SPOOLED",
    });
  });
});
