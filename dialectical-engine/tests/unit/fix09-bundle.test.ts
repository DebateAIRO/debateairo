import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  bundleHash,
  canonicalJson,
} from "../../tools/obs-listener/policy/canonical.js";
import {
  isFloorDenied,
  loadBundle,
  policyBundleSchema,
} from "../../tools/obs-listener/policy/loader.js";
import {
  RepinRefusedError,
  repin,
} from "../../tools/obs-listener/policy/custodian.js";
import type {
  IncidentForTrace,
  TraceVerdict,
  TracerHook,
} from "../../tools/obs-listener/src/daemon/tracer-hook.js";
import type { DispatchArm } from "../../tools/obs-listener/src/daemon/dispatch-arm.js";

const BUNDLE_PATH = resolve(
  import.meta.dirname,
  "../../tools/obs-listener/policy/bundle.json",
);
const INDEPENDENT_HASH_PATH = resolve(
  import.meta.dirname,
  "fixtures/fix09-independent-hash.mjs",
);

describe("FIX-09 C1 policy bundle", () => {
  it("loads the complete fail-closed phase-one policy", () => {
    const bundle = loadBundle(BUNDLE_PATH);

    expect(bundle.schema_version).toBe(1);
    expect(bundle.policy_ref).toBe("fixagent-policy-v1");
    expect(bundle.allowlist).toEqual([]);
    expect(bundle.quick_arm).toBe("OFF");
    expect(bundle.custodians).toEqual([
      { id: "V", token_env: "OBS_POLICY_CUSTODIAN_TOKEN" },
    ]);
    expect(bundle.slots).toEqual({
      zone_manifest_hash: { value: null, gate: "RP-1" },
      hatchet_ingest: { value: null, gate: "RP-2" },
      injection_corpus_hash: { value: null, gate: "RP-3" },
    });
    expect(bundle.taxonomy_pin.classes).toEqual([
      "PROCESS_DEATH",
      "HTTP_FAILURE",
      "JOB_FAILURE",
      "PROVIDER_EXHAUSTED",
      "DB_FAILURE",
      "PARSE_SCHEMA_FAILURE",
      "STALL_DETECTED",
      "SILENT_NOOP",
      "SUSPICIOUS_SUCCESS",
      "CLIENT_FAILURE",
      "CAPTURE_SELF",
      "ORIGIN_UNKNOWN",
    ]);
    expect(bundle.taxonomy_pin.suspicious_success_subclasses).toEqual([
      "empty_output",
      "missing_required_fields",
      "missing_artifact_chain",
    ]);
    expect(bundle.severity_map.ladder).toEqual([
      "INFO",
      "DEGRADED",
      "SEVERE",
      "FATAL",
    ]);
    expect(bundle.severity_map.default).toBe("DEGRADED");
    expect(bundle.severity_map.overrides).toEqual({});
    expect(bundle.routing_table).toEqual([
      { incident_class: "SECURITY_PRIVACY", owner: "V" },
      { incident_class: "PERSISTENCE_MIGRATIONS", owner: "V" },
      { incident_class: "SPEND", owner: "V" },
      { incident_class: "SCORING_LIVE_DATA", owner: "V" },
      { incident_class: "DEFAULT", owner: "V" },
    ]);
    expect(bundle.register_seeds).toEqual(
      expect.arrayContaining([
        {
          key: "obs.fingerprintMaturityN",
          value: 3,
          status: "SEED",
          source_ref: "E6-12",
        },
        {
          key: "obs.severeThreshold",
          value: "SEVERE",
          status: "SEED",
          source_ref: "R-E6-09/RT-41",
        },
        {
          key: "obs.daemonRestartMs",
          value: 10_000,
          status: "SEED",
          source_ref: "FIX-09-DECISIONS",
        },
        {
          key: "obs.blastRadiusMaxReachable",
          value: null,
          status: "UNSET",
          source_ref: "RT-31",
        },
        {
          key: "obs.canaryWindowMs",
          value: null,
          status: "UNSET",
          source_ref: "BATCH-3-ROW-13",
        },
      ]),
    );
  });

  it("reproduces the bundle hash without importing the loader", () => {
    const rawBundle = readFileSync(BUNDLE_PATH, "utf8");
    const independent = spawnSync(process.execPath, [INDEPENDENT_HASH_PATH], {
      encoding: "utf8",
      input: rawBundle,
    });

    expect(independent.status).toBe(0);
    expect(independent.stderr).toBe("");
    expect(independent.stdout).toMatch(/^[a-f0-9]{64}$/u);
    expect(bundleHash(loadBundle(BUNDLE_PATH))).toBe(independent.stdout);
  });

  it("hashes semantic JSON independently of object key order and whitespace", () => {
    const parsed = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const reverseTopLevelOrder = Object.fromEntries(
      Object.entries(parsed).reverse(),
    );

    expect(canonicalJson(reverseTopLevelOrder)).toBe(canonicalJson(parsed));
    expect(bundleHash(reverseTopLevelOrder)).toBe(bundleHash(parsed));
  });

  it("denies every enumerated floor sample without swallowing a neighbouring product path", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const denied = [
      "packages/obs-capture/src/zone/manifest.ts",
      "migrations/0000_s00.sql",
      "packages/crypto/src/index.ts",
      "packages/published-arithmetic/src/index.ts",
      "packages/serve/src/index.ts",
      "packages/budget/src/index.ts",
      "package.json",
      "packages/kernel/package.json",
      "register.bootstrap.json",
      "compose.dev.yaml",
      "deploy/dev-auth/compose.yaml",
      ".github/workflows/ci.yml",
      "scripts/check-source.ts",
      "tools/obs-listener/policy/bundle.json",
      "docs/agent-protocols/debateai-heartbeat-protocol.md",
      ".hermes/x",
    ];

    expect(denied.map((path) => isFloorDenied(bundle, path))).toEqual(
      denied.map(() => true),
    );
    expect(isFloorDenied(bundle, "apps/api/src/public-health.ts")).toBe(false);
    expect(isFloorDenied(bundle, "packages/cryptography/src/index.ts")).toBe(false);
  });

  it("fails closed when a candidate path is not repo-relative", () => {
    const bundle = loadBundle(BUNDLE_PATH);

    expect(
      ["", ".", "../outside.ts", "/absolute.ts", "C:\\outside.ts"].map(
        (path) => isFloorDenied(bundle, path),
      ),
    ).toEqual([true, true, true, true, true]);
  });

  it("refuses a repin unless the one recorded custodian token matches", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const environment = {
      OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
    };

    expect(() =>
      repin(bundle, { token: "wrong-token" }, environment),
    ).toThrowError(RepinRefusedError);
    expect(() =>
      repin(bundle, { token: "wrong-token" }, environment),
    ).toThrowError("REPIN_REFUSED");

    const next = repin(
      bundle,
      {
        token: "fixture-custodian-token",
        next_bundle: { ...bundle, quick_arm: "ON" },
      },
      environment,
    );
    expect(next.quick_arm).toBe("ON");
    expect(bundle.quick_arm).toBe("OFF");
  });

  it("lets the custodian populate a deferred hash slot without changing its gate", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const manifestHash = "a".repeat(64);

    const next = repin(
      bundle,
      {
        token: "fixture-custodian-token",
        next_bundle: {
          ...bundle,
          slots: {
            ...bundle.slots,
            zone_manifest_hash: {
              value: manifestHash,
              gate: "RP-1",
            },
          },
        },
      },
      { OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token" },
    );

    expect(next.slots.zone_manifest_hash).toEqual({
      value: manifestHash,
      gate: "RP-1",
    });
  });

  it("rejects a second custodian instead of widening custody", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const custodians = raw.custodians as unknown[];

    expect(
      policyBundleSchema.safeParse({
        ...raw,
        custodians: [
          ...custodians,
          { id: "delegate", token_env: "OBS_POLICY_DELEGATE_TOKEN" },
        ],
      }).success,
    ).toBe(false);
  });

  it("freezes the tracer seam and leaves the dispatch arm memberless", () => {
    expectTypeOf<keyof DispatchArm>().toEqualTypeOf<never>();
    expectTypeOf<TracerHook["onIncidentNew"]>().parameters.toEqualTypeOf<
      [IncidentForTrace]
    >();
    expectTypeOf<TracerHook["onIncidentNew"]>().returns.toEqualTypeOf<
      Promise<TraceVerdict>
    >();
  });
});
