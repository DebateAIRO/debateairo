import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadBundle } from "../../tools/obs-listener/policy/loader.js";
import { evaluateQuickEntry } from "../../tools/obs-listener/policy/quick-arm.js";

const BUNDLE_PATH = resolve(
  import.meta.dirname,
  "../../tools/obs-listener/policy/bundle.json",
);

describe("FIX-14 QUICK entry preconditions", () => {
  it("keeps the arm OFF and represents every numeric QUICK prerequisite honestly", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const registers = new Map(
      bundle.register_seeds.map((entry) => [entry.key, entry] as const),
    );

    expect(bundle.quick_arm).toBe("OFF");
    expect(Object.fromEntries(
      [
        "obs.quickPreconditionMergedFixes",
        "obs.quickPreconditionAgreementRate",
        "obs.quickProductionLineCap",
        "obs.quickTotalLineCap",
        "obs.blastRadiusMaxReachable",
        "obs.fingerprintMaturityN",
        "obs.canaryWindowMs",
        "obs.lineageDepthMax",
        "obs.fixCooldownMs",
      ].map((key) => [key, registers.get(key)]),
    )).toEqual({
      "obs.quickPreconditionMergedFixes": {
        key: "obs.quickPreconditionMergedFixes",
        value: 10,
        status: "SEED",
        source_ref: "FIX-14-R02-B",
      },
      "obs.quickPreconditionAgreementRate": {
        key: "obs.quickPreconditionAgreementRate",
        value: 0.9,
        status: "SEED",
        source_ref: "FIX-14-R02-B",
      },
      "obs.quickProductionLineCap": {
        key: "obs.quickProductionLineCap",
        value: 20,
        status: "SEED",
        source_ref: "FIX-14-R02-C",
      },
      "obs.quickTotalLineCap": {
        key: "obs.quickTotalLineCap",
        value: 50,
        status: "SEED",
        source_ref: "FIX-14-R02-C",
      },
      "obs.blastRadiusMaxReachable": {
        key: "obs.blastRadiusMaxReachable",
        value: null,
        status: "UNSET",
        source_ref: "RT-31",
      },
      "obs.fingerprintMaturityN": {
        key: "obs.fingerprintMaturityN",
        value: 3,
        status: "SEED",
        source_ref: "E6-12",
      },
      "obs.canaryWindowMs": {
        key: "obs.canaryWindowMs",
        value: null,
        status: "UNSET",
        source_ref: "BATCH-3-ROW-13",
      },
      "obs.lineageDepthMax": {
        key: "obs.lineageDepthMax",
        value: null,
        status: "UNSET",
        source_ref: "RT-24",
      },
      "obs.fixCooldownMs": {
        key: "obs.fixCooldownMs",
        value: null,
        status: "UNSET",
        source_ref: "FIX-14-R02-C",
      },
    });
  });

  it("reports all seven OFF-half predicates as closed false or unset facts", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const report = evaluateQuickEntry(bundle);

    expect(report).toEqual({
      schema: "fixagent-quick-entry/v1",
      configured: "OFF",
      effective: "OFF",
      reason: "POLICY_OFF",
      ready: false,
      predicates: {
        a: { state: "UNSET", reason: "EVIDENCE_UNSET" },
        b: { state: "UNSET", reason: "EVIDENCE_UNSET" },
        c: { state: "UNSET", reason: "EVIDENCE_UNSET" },
        d: { state: "FALSE", reason: "ALLOWLIST_EMPTY" },
        e: { state: "UNSET", reason: "EVIDENCE_UNSET" },
        f: { state: "UNSET", reason: "EVIDENCE_UNSET" },
        g: { state: "UNSET", reason: "EVIDENCE_UNSET" },
      },
    });
  });

  it("evaluates each observed failing predicate without changing its neighbours", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const cases = [
      ["a", { fix13Vetoed: false }, "FIX13_NOT_VETOED"],
      ["b", { mergedHistory: { mergedFixes: 0, agreementRate: 0 } }, "HISTORY_BELOW_BOUND"],
      ["c", { ratifiedRegisters: {} }, "REGISTER_NOT_RATIFIED"],
      ["e", { autoDisableRearmDrillPassed: false }, "DRILL_NOT_PASSED"],
      ["f", { remoteBranchProtection: { verified: false, rulesetHash: null } }, "REMOTE_PROTECTION_UNVERIFIED"],
      ["g", { runtimeBuildRefs: [
        { runtime: "api", buildRef: "UNTRACKED-DEV:UNKNOWN", commit: null, verified: false },
        { runtime: "runner", buildRef: "UNTRACKED-DEV:UNKNOWN", commit: null, verified: false },
        { runtime: "scheduler", buildRef: "UNTRACKED-DEV:UNKNOWN", commit: null, verified: false },
      ] }, "RUNTIME_BUILD_REF_UNVERIFIED"],
    ] as const;

    for (const [key, evidence, reason] of cases) {
      const report = evaluateQuickEntry(bundle, evidence);
      expect(report.predicates[key]).toEqual({ state: "FALSE", reason });
      for (const neighbour of ["a", "b", "c", "e", "f", "g"] as const) {
        if (neighbour !== key) {
          expect(report.predicates[neighbour]).toEqual({
            state: "UNSET",
            reason: "EVIDENCE_UNSET",
          });
        }
      }
      expect(report.predicates.d).toEqual({
        state: "FALSE",
        reason: "ALLOWLIST_EMPTY",
      });
      expect(report.ready).toBe(false);
    }
  });
});
