import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  bundleHash,
  canonicalJson,
} from "../../tools/obs-listener/policy/canonical.js";
import {
  isFloorDenied,
  loadBundle,
  PolicyBundleLoadError,
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
const EXPECTED_PINS_PATH = resolve(
  import.meta.dirname,
  "fixtures/fix09-expected-pins.json",
);
const INTERFACE_TSCONFIG_PATH = resolve(
  import.meta.dirname,
  "fixtures/fix09-interface-tsconfig.json",
);
const TYPESCRIPT_COMPILER_PATH = resolve(
  import.meta.dirname,
  "../../node_modules/typescript/bin/tsc",
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

  it("matches the independently recorded taxonomy and registry pins", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const expectedPins = JSON.parse(
      readFileSync(EXPECTED_PINS_PATH, "utf8"),
    ) as {
      readonly bundle_hash: string;
      readonly taxonomy_pin: unknown;
      readonly code_registry_seed: unknown;
      readonly register_seeds: unknown;
    };

    expect(bundleHash(bundle)).toBe(expectedPins.bundle_hash);
    expect({
      taxonomy_pin: bundle.taxonomy_pin,
      code_registry_seed: bundle.code_registry_seed,
      register_seeds: bundle.register_seeds,
    }).toEqual({
      taxonomy_pin: expectedPins.taxonomy_pin,
      code_registry_seed: expectedPins.code_registry_seed,
      register_seeds: expectedPins.register_seeds,
    });
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
      "packages/obs-capture/src/index.ts",
      "migrations/0000_s00.sql",
      "packages/crypto/src/index.ts",
      "packages/published-arithmetic/src/index.ts",
      "packages/serve/src/index.ts",
      "packages/budget/src/index.ts",
      "package.json",
      "packages/kernel/package.json",
      "apps/ui/pnpm-lock.yaml",
      "register.bootstrap.json",
      "compose.dev.yaml",
      "deploy/dev-auth/compose.yaml",
      ".github/workflows/ci.yml",
      "scripts/check-source.ts",
      "tools/obs-listener/policy/bundle.json",
      "docs/agent-protocols/debateai-heartbeat-protocol.md",
      ".hermes/x",
      "apps/api/src/mfa.ts",
      "apps/api/dist/mail-channel.js",
      "apps/api/dist/mfa.js",
      "apps/api/dist/registration.js",
      "dist/apps/api/src/mail-channel.js",
      "dist/apps/api/src/mfa.js",
      "dist/apps/api/src/registration.js",
      "dist/packages/db/src/identity.js",
      "packages/db/dist/identity.js",
      "packages/db/src/obs-schema.ts",
      "packages/register/src/compose-env.ts",
      "packages/register/src/runtime-environment.ts",
      "././tools/obs-listener/policy/bundle.json",
    ];

    expect(denied.map((path) => isFloorDenied(bundle, path))).toEqual(
      denied.map(() => true),
    );
    const allowedNeighbours = [
      "apps/api/src/public-health.ts",
      "././apps/api/src/public-health.ts",
      "apps/api/src/mfa-helper.ts",
      "apps/ui/pnpm-lock.yml",
      "packages/cryptography/src/index.ts",
      "packages/db/src/obs-schema-helper.ts",
      "packages/register/src/compose-environment.ts",
      "packages/register/src/runtime-configuration.ts",
    ];
    expect(
      allowedNeighbours.map((path) => isFloorDenied(bundle, path)),
    ).toEqual(allowedNeighbours.map(() => false));
  });

  it("fails closed when a candidate path is not repo-relative", () => {
    const bundle = loadBundle(BUNDLE_PATH);

    expect(
      ["", ".", "../outside.ts", "/absolute.ts", "C:\\outside.ts"].map(
        (path) => isFloorDenied(bundle, path),
      ),
    ).toEqual([true, true, true, true, true]);
  });

  it("rejects duplicate JSON members before last-member-wins parsing", () => {
    const directory = mkdtempSync(join(tmpdir(), "fix09-bundle-"));
    const duplicatePath = join(directory, "duplicate.json");
    const raw = readFileSync(BUNDLE_PATH, "utf8");
    const duplicateRaw = raw.replace(
      '"quick_arm": "OFF"',
      '"quick_arm": "ON",\n  "quick_arm": "OFF"',
    );
    writeFileSync(duplicatePath, duplicateRaw, "utf8");

    try {
      let thrown: unknown;
      try {
        loadBundle(duplicatePath);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(PolicyBundleLoadError);
      expect((thrown as Error).cause).toMatchObject({
        message: "DUPLICATE_JSON_MEMBER",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires every policy member to be own plain JSON data", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const inherited = Object.assign(
      Object.create({ quick_arm: "OFF" }) as Record<string, unknown>,
      raw,
    );
    delete inherited.quick_arm;

    expect(Object.hasOwn(inherited, "quick_arm")).toBe(false);
    expect(policyBundleSchema.safeParse(inherited).success).toBe(false);
  });

  it("rejects accessor-backed hash input without invoking the accessor", () => {
    let accessorReads = 0;
    const changing = Object.defineProperty({ stable: true }, "changing", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return accessorReads;
      },
    });

    expect(() => bundleHash(changing)).toThrowError(
      "CANONICAL_JSON_NON_PLAIN_DATA",
    );
    expect(accessorReads).toBe(0);
    expect(bundleHash({ stable: true, changing: 1 })).toBe(
      bundleHash({ changing: 1, stable: true }),
    );
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

  it("maps every missing or malformed token to REPIN_REFUSED", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const environment = {
      OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
    };
    let accessorReads = 0;
    const accessorRequest = Object.defineProperty({}, "token", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return "fixture-custodian-token";
      },
    });
    const cases: ReadonlyArray<{
      readonly request: unknown;
      readonly environment: unknown;
    }> = [
      { request: {}, environment },
      { request: { token: undefined }, environment },
      { request: { token: null }, environment },
      { request: { token: 42 }, environment },
      { request: accessorRequest, environment },
      {
        request: { token: "fixture-custodian-token" },
        environment: { OBS_POLICY_CUSTODIAN_TOKEN: 42 },
      },
    ];

    for (const malformed of cases) {
      let thrown: unknown;
      try {
        repin(
          bundle,
          malformed.request as never,
          malformed.environment as never,
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(RepinRefusedError);
      expect(thrown).toMatchObject({ code: "REPIN_REFUSED" });
    }
    expect(accessorReads).toBe(0);
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
    const typecheck = spawnSync(
      process.execPath,
      [TYPESCRIPT_COMPILER_PATH, "--project", INTERFACE_TSCONFIG_PATH],
      { encoding: "utf8" },
    );

    expect(
      typecheck.status,
      `${typecheck.stdout}${typecheck.stderr}`,
    ).toBe(0);
    expectTypeOf<keyof DispatchArm>().toEqualTypeOf<never>();
    expectTypeOf<TracerHook["onIncidentNew"]>().parameters.toEqualTypeOf<
      [IncidentForTrace]
    >();
    expectTypeOf<TracerHook["onIncidentNew"]>().returns.toEqualTypeOf<
      Promise<TraceVerdict>
    >();
  });
});
