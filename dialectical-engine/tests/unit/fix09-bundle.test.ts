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

function expectFrozenOwnDataSnapshot(actual: unknown, expected: unknown): void {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect(Object.isFrozen(actual)).toBe(true);
    expect(Object.getPrototypeOf(actual)).toBe(Array.prototype);
    expect(Object.hasOwn(actual as object, "length")).toBe(true);
    expect((actual as unknown[]).length).toBe(expected.length);
    for (let index = 0; index < expected.length; index += 1) {
      expect(Object.hasOwn(actual as object, String(index))).toBe(true);
      const descriptor = Object.getOwnPropertyDescriptor(actual, String(index));
      expect(descriptor !== undefined && "value" in descriptor).toBe(true);
      expectFrozenOwnDataSnapshot(descriptor?.value, expected[index]);
    }
    return;
  }

  if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object").toBe(true);
    expect(Object.getPrototypeOf(actual)).toBeNull();
    expect(Object.isFrozen(actual)).toBe(true);
    const actualDescriptors = Object.getOwnPropertyDescriptors(actual);
    expect(Object.keys(actualDescriptors).sort()).toEqual(
      Object.keys(expected).sort(),
    );
    for (const key of Object.keys(expected)) {
      expect(Object.hasOwn(actual as object, key)).toBe(true);
      const descriptor = actualDescriptors[key];
      expect(descriptor).toMatchObject({ enumerable: true });
      expect(descriptor !== undefined && "value" in descriptor).toBe(true);
      expectFrozenOwnDataSnapshot(
        descriptor?.value,
        (expected as Record<string, unknown>)[key],
      );
    }
    return;
  }

  expect(actual).toBe(expected);
}

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

  it("does not let Object.prototype supply a missing quick_arm", () => {
    const raw = readFileSync(BUNDLE_PATH, "utf8");
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "quick_arm",
    );
    const outcomes: boolean[] = [];
    const completeOutcomes: boolean[] = [];

    try {
      for (const inherited of ["OFF", "ON"] as const) {
        Object.defineProperty(Object.prototype, "quick_arm", {
          configurable: true,
          value: inherited,
        });
        const candidate = JSON.parse(raw) as Record<string, unknown>;
        completeOutcomes.push(policyBundleSchema.safeParse(candidate).success);
        delete candidate.quick_arm;
        outcomes.push(policyBundleSchema.safeParse(candidate).success);
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "quick_arm");
      } else {
        Object.defineProperty(Object.prototype, "quick_arm", previous);
      }
    }

    expect(outcomes).toEqual([false, false]);
    expect(completeOutcomes).toEqual([true, true]);
  });

  it("returns the frozen own snapshot under non-writable prototype pollution", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const quickArmPrevious = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "quick_arm",
    );
    const floorPrevious = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "floor_deny_globs",
    );
    let floorGetterReads = 0;
    let loaded: ReturnType<typeof loadBundle> | undefined;
    let quickArmDescriptor: PropertyDescriptor | undefined;
    let floorDescriptor: PropertyDescriptor | undefined;
    let denied: boolean | undefined;

    try {
      Object.defineProperty(Object.prototype, "quick_arm", {
        configurable: true,
        value: "ON",
      });
      Object.defineProperty(Object.prototype, "floor_deny_globs", {
        configurable: true,
        get() {
          floorGetterReads += 1;
          return [];
        },
      });

      loaded = loadBundle(BUNDLE_PATH);
      quickArmDescriptor = Object.getOwnPropertyDescriptor(loaded, "quick_arm");
      floorDescriptor = Object.getOwnPropertyDescriptor(
        loaded,
        "floor_deny_globs",
      );
      denied = isFloorDenied(
        loaded,
        "tools/obs-listener/policy/bundle.json",
      );
    } finally {
      if (quickArmPrevious === undefined) {
        Reflect.deleteProperty(Object.prototype, "quick_arm");
      } else {
        Object.defineProperty(
          Object.prototype,
          "quick_arm",
          quickArmPrevious,
        );
      }
      if (floorPrevious === undefined) {
        Reflect.deleteProperty(Object.prototype, "floor_deny_globs");
      } else {
        Object.defineProperty(
          Object.prototype,
          "floor_deny_globs",
          floorPrevious,
        );
      }
    }

    expect(quickArmDescriptor?.value).toBe("OFF");
    expect(floorDescriptor?.value).toEqual(raw.floor_deny_globs);
    expect(denied).toBe(true);
    expect(floorGetterReads).toBe(0);
    expectFrozenOwnDataSnapshot(loaded, raw);
  });

  it("does not let Object.prototype supply missing nested members", () => {
    const raw = readFileSync(BUNDLE_PATH, "utf8");
    const scenarios = [
      {
        key: "default",
        value: "DEGRADED",
        remove(candidate: Record<string, unknown>) {
          delete (candidate.severity_map as Record<string, unknown>).default;
        },
      },
      {
        key: "id",
        value: "V",
        remove(candidate: Record<string, unknown>) {
          delete (
            (candidate.custodians as Array<Record<string, unknown>>)[0] as Record<
              string,
              unknown
            >
          ).id;
        },
      },
    ] as const;
    const outcomes: boolean[] = [];

    for (const scenario of scenarios) {
      const previous = Object.getOwnPropertyDescriptor(
        Object.prototype,
        scenario.key,
      );
      try {
        Object.defineProperty(Object.prototype, scenario.key, {
          configurable: true,
          value: scenario.value,
        });
        const candidate = JSON.parse(raw) as Record<string, unknown>;
        scenario.remove(candidate);
        outcomes.push(policyBundleSchema.safeParse(candidate).success);
      } finally {
        if (previous === undefined) {
          Reflect.deleteProperty(Object.prototype, scenario.key);
        } else {
          Object.defineProperty(Object.prototype, scenario.key, previous);
        }
      }
    }

    expect(outcomes).toEqual([false, false]);
  });

  it("runs cross-field checks against the own snapshot", () => {
    const valid = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const invalid = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const invalidSeed = (
      invalid.register_seeds as Array<Record<string, unknown>>
    )[1];
    if (invalidSeed === undefined) throw new Error("MISSING_REGISTER_SEED");
    invalidSeed.status = "UNSET";

    const statusPrevious = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "status",
    );
    let invalidAccepted: boolean | undefined;
    let validResult: ReturnType<typeof policyBundleSchema.safeParse> | undefined;
    try {
      invalidAccepted = policyBundleSchema.safeParse(invalid).success;
      Object.defineProperty(Object.prototype, "status", {
        configurable: true,
        value: "UNSET",
      });
      validResult = policyBundleSchema.safeParse(valid);
    } finally {
      if (statusPrevious === undefined) {
        Reflect.deleteProperty(Object.prototype, "status");
      } else {
        Object.defineProperty(Object.prototype, "status", statusPrevious);
      }
    }

    expect(invalidAccepted).toBe(false);
    expect(validResult?.success).toBe(true);
    if (validResult?.success === true) {
      const seed = validResult.data.register_seeds[1];
      expect(Object.hasOwn(seed as object, "status")).toBe(true);
      expect(seed?.status).toBe("SEED");
    }
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

    expect(
      repin(
        bundle,
        { token: "fixture-custodian-token" },
        environment,
      ),
    ).toEqual(bundle);
  });

  it("refuses an authenticated next_bundle accessor without invoking it", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    let accessorReads = 0;
    const request = Object.defineProperty(
      { token: "fixture-custodian-token" },
      "next_bundle",
      {
        enumerable: true,
        get() {
          accessorReads += 1;
          throw new Error("NEXT_BUNDLE_GETTER_INVOKED");
        },
      },
    );

    let thrown: unknown;
    try {
      repin(bundle, request, {
        OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RepinRefusedError);
    expect(thrown).toMatchObject({ code: "REPIN_REFUSED" });
    expect(accessorReads).toBe(0);
  });

  it("refuses inherited or descriptor-trapping next_bundle data", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const environment = {
      OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
    };
    const inherited = Object.assign(
      Object.create({ next_bundle: { ...bundle, quick_arm: "ON" } }) as Record<
        string,
        unknown
      >,
      { token: "fixture-custodian-token" },
    );
    const trapping = new Proxy(
      { token: "fixture-custodian-token" },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === "next_bundle") throw new Error("DESCRIPTOR_TRAP");
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );

    expect(() => repin(bundle, inherited as never, environment)).toThrowError(
      RepinRefusedError,
    );
    expect(() => repin(bundle, trapping, environment)).toThrowError(
      RepinRefusedError,
    );
  });

  it("snapshots a volatile candidate once and bounds a later repin refusal", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const candidateTarget = JSON.parse(
      readFileSync(BUNDLE_PATH, "utf8"),
    ) as Record<string, unknown>;
    let prototypeReads = 0;
    const candidate = new Proxy(candidateTarget, {
      getPrototypeOf(target) {
        prototypeReads += 1;
        if (prototypeReads > 1) throw new Error("SECOND_TRAVERSAL");
        return Reflect.getPrototypeOf(target);
      },
    });

    const firstPass = policyBundleSchema.safeParse(candidate);
    expect(firstPass.success).toBe(true);
    expect(prototypeReads).toBe(1);

    let thrown: unknown;
    try {
      repin(
        bundle,
        {
          token: "fixture-custodian-token",
          next_bundle: candidate,
        },
        { OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token" },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RepinRefusedError);
    expect(thrown).toMatchObject({ code: "REPIN_REFUSED" });
    expect(prototypeReads).toBe(2);
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
