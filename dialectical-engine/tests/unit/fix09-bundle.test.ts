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
  canonicalProjection,
} from "../../tools/obs-listener/policy/canonical.js";
import {
  isFloorDenied,
  loadBundle,
  PolicyBundleLoadError,
  policyBundleSchema,
  type PolicyBundle,
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
      expect(descriptor !== undefined && Object.hasOwn(descriptor, "value"))
        .toBe(true);
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
      expect(descriptor !== undefined && Object.hasOwn(descriptor, "value"))
        .toBe(true);
      expectFrozenOwnDataSnapshot(
        descriptor?.value,
        (expected as Record<string, unknown>)[key],
      );
    }
    return;
  }

  expect(actual).toBe(expected);
}

function candidatesMissingRequiredValue(): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const raw = readFileSync(BUNDLE_PATH, "utf8");
  for (let index = 0; index < 16; index += 1) {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    const seed = (
      candidate.register_seeds as Array<Record<string, unknown>>
    )[index];
    if (seed === undefined) throw new Error("MISSING_REGISTER_SEED");
    Reflect.deleteProperty(seed, "value");
    candidates.push(candidate);
  }
  for (const slot of [
    "zone_manifest_hash",
    "hatchet_ingest",
    "injection_corpus_hash",
  ] as const) {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    const slots = candidate.slots as Record<
      string,
      Record<string, unknown>
    >;
    Reflect.deleteProperty(slots[slot] as object, "value");
    candidates.push(candidate);
  }
  return candidates;
}

function candidatesWithAccessorBackedRequiredValue(onRead: () => void): {
  readonly candidates: Record<string, unknown>[];
  readonly descriptorValues: ReadonlyMap<() => unknown, unknown>;
  readonly originalValues: readonly unknown[];
} {
  const candidates: Record<string, unknown>[] = [];
  const descriptorValues = new Map<() => unknown, unknown>();
  const originalValues: unknown[] = [];
  const raw = readFileSync(BUNDLE_PATH, "utf8");
  const replaceValue = (record: Record<string, unknown>) => {
    const original = record.value;
    const source = () => {
      onRead();
      throw new Error("SOURCE_VALUE_ACCESSOR_RAN");
    };
    descriptorValues.set(source, original);
    originalValues.push(original);
    Object.defineProperty(record, "value", {
      configurable: true,
      enumerable: true,
      get: source,
    });
  };

  for (let index = 0; index < 16; index += 1) {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    const seed = (
      candidate.register_seeds as Array<Record<string, unknown>>
    )[index];
    if (seed === undefined) throw new Error("MISSING_REGISTER_SEED");
    replaceValue(seed);
    candidates.push(candidate);
  }
  for (const slot of [
    "zone_manifest_hash",
    "hatchet_ingest",
    "injection_corpus_hash",
  ] as const) {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    const slots = candidate.slots as Record<
      string,
      Record<string, unknown>
    >;
    replaceValue(slots[slot] as Record<string, unknown>);
    candidates.push(candidate);
  }

  return { candidates, descriptorValues, originalValues };
}

function candidatesWithProxyBackedRequiredValue(
  onRead: () => void,
  onDescriptorTrap: () => void,
): {
  readonly candidates: Record<string, unknown>[];
  readonly descriptorValues: ReadonlyMap<() => unknown, unknown>;
  readonly originalValues: readonly unknown[];
} {
  const candidates: Record<string, unknown>[] = [];
  const descriptorValues = new Map<() => unknown, unknown>();
  const originalValues: unknown[] = [];
  const raw = readFileSync(BUNDLE_PATH, "utf8");
  const proxyValue = (record: Record<string, unknown>) => {
    const original = record.value;
    const source = () => {
      onRead();
      throw new Error("SOURCE_VALUE_ACCESSOR_RAN");
    };
    descriptorValues.set(source, original);
    originalValues.push(original);
    Object.defineProperty(record, "value", {
      configurable: true,
      enumerable: true,
      get: source,
    });
    return new Proxy(record, {
      getOwnPropertyDescriptor(target, key) {
        onDescriptorTrap();
        if (key === "value") {
          return {
            configurable: true,
            enumerable: true,
            get: source,
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
  };

  for (let index = 0; index < 16; index += 1) {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    const seeds = candidate.register_seeds as Array<Record<string, unknown>>;
    const seed = seeds[index];
    if (seed === undefined) throw new Error("MISSING_REGISTER_SEED");
    seeds[index] = proxyValue(seed);
    candidates.push(candidate);
  }
  for (const slot of [
    "zone_manifest_hash",
    "hatchet_ingest",
    "injection_corpus_hash",
  ] as const) {
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    const slots = candidate.slots as Record<
      string,
      Record<string, unknown>
    >;
    slots[slot] = proxyValue(slots[slot] as Record<string, unknown>);
    candidates.push(candidate);
  }

  return { candidates, descriptorValues, originalValues };
}

const NUMERIC_PROTOTYPE_KEYS = [
  "0",
  "1",
  "2",
  "10",
  "46",
  // Fixed-seed bounded samples spanning and exceeding current policy lengths.
  "7",
  "23",
  "113",
  "251",
] as const;

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

  it("ignores inherited toJSON getters and returned functions on both prototypes", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const nested = {
      z: [{ b: 2, a: 1 }],
      a: ["line\n", true, null],
    };
    const expectedNested =
      '{"a":["line\\n",true,null],"z":[{"a":1,"b":2}]}';

    for (const [label, prototype] of [
      ["Object.prototype", Object.prototype],
      ["Array.prototype", Array.prototype],
    ] as const) {
      const previous = Object.getOwnPropertyDescriptor(prototype, "toJSON");
      let getterCalls = 0;
      let functionCalls = 0;
      let hash: string | undefined;
      let serialized: string | undefined;
      let escaped: unknown;
      try {
        Object.defineProperty(prototype, "toJSON", {
          configurable: true,
          get() {
            getterCalls += 1;
            return () => {
              functionCalls += 1;
              return [];
            };
          },
        });
        hash = bundleHash(bundle);
        serialized = canonicalJson(nested);
      } catch (error) {
        escaped = error;
      } finally {
        if (previous === undefined) {
          Reflect.deleteProperty(prototype, "toJSON");
        } else {
          Object.defineProperty(prototype, "toJSON", previous);
        }
      }

      expect(escaped, label).toBeUndefined();
      expect(getterCalls, label).toBe(0);
      expect(functionCalls, label).toBe(0);
      expect(hash, label).toBe(
        "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
      );
      expect(serialized, label).toBe(expectedNested);
    }
  });

  it("never invokes an inherited toJSON data function", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    for (const [label, prototype] of [
      ["Object.prototype", Object.prototype],
      ["Array.prototype", Array.prototype],
    ] as const) {
      const previous = Object.getOwnPropertyDescriptor(prototype, "toJSON");
      let functionCalls = 0;
      let hash: string | undefined;
      let escaped: unknown;
      try {
        Object.defineProperty(prototype, "toJSON", {
          configurable: true,
          value() {
            functionCalls += 1;
            return [];
          },
        });
        hash = bundleHash(bundle);
      } catch (error) {
        escaped = error;
      } finally {
        if (previous === undefined) {
          Reflect.deleteProperty(prototype, "toJSON");
        } else {
          Object.defineProperty(prototype, "toJSON", previous);
        }
      }

      expect(escaped, label).toBeUndefined();
      expect(functionCalls, label).toBe(0);
      expect(hash, label).toBe(
        "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
      );
    }
  });

  it("contains throwing inherited toJSON getters across hash, load, and repin", () => {
    const cleanBundle = loadBundle(BUNDLE_PATH);
    for (const [label, prototype] of [
      ["Object.prototype", Object.prototype],
      ["Array.prototype", Array.prototype],
    ] as const) {
      const previous = Object.getOwnPropertyDescriptor(prototype, "toJSON");
      let getterCalls = 0;
      const escaped: unknown[] = [];
      let hash: string | undefined;
      let loaded: PolicyBundle | undefined;
      let repinned: PolicyBundle | undefined;
      try {
        Object.defineProperty(prototype, "toJSON", {
          configurable: true,
          get() {
            getterCalls += 1;
            throw new Error("INHERITED_TOJSON_GETTER_RAN");
          },
        });
        try {
          hash = bundleHash(cleanBundle);
        } catch (error) {
          escaped.push(error);
        }
        try {
          loaded = loadBundle(BUNDLE_PATH);
        } catch (error) {
          escaped.push(error);
        }
        try {
          repinned = repin(cleanBundle, {
            token: "fixture-custodian-token",
          }, {
            OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
          });
        } catch (error) {
          escaped.push(error);
        }
      } finally {
        if (previous === undefined) {
          Reflect.deleteProperty(prototype, "toJSON");
        } else {
          Object.defineProperty(prototype, "toJSON", previous);
        }
      }

      expect(escaped, label).toEqual([]);
      expect(getterCalls, label).toBe(0);
      expect(hash, label).toBe(
        "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
      );
      expect(loaded?.quick_arm, label).toBe("OFF");
      expect(repinned?.quick_arm, label).toBe("OFF");
    }
  });

  it("keeps inherited non-function toJSON data as a lawful neighbor", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    for (const [label, prototype] of [
      ["Object.prototype", Object.prototype],
      ["Array.prototype", Array.prototype],
    ] as const) {
      const previous = Object.getOwnPropertyDescriptor(prototype, "toJSON");
      let hash: string | undefined;
      let escaped: unknown;
      try {
        Object.defineProperty(prototype, "toJSON", {
          configurable: true,
          value: "NOT_CALLABLE",
        });
        hash = bundleHash(bundle);
      } catch (error) {
        escaped = error;
      } finally {
        if (previous === undefined) {
          Reflect.deleteProperty(prototype, "toJSON");
        } else {
          Object.defineProperty(prototype, "toJSON", previous);
        }
      }

      expect(escaped, label).toBeUndefined();
      expect(hash, label).toBe(
        "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
      );
    }
  });

  it("encodes JSON primitives byte-identically without object serialization", () => {
    expect(canonicalJson({
      text: '"\b\f\n\r\t\\\u0000',
      numbers: [-0, 1e30, 1e-7, 0.000001],
    })).toBe(
      '{"numbers":[0,1e+30,1e-7,0.000001],"text":"\\"\\b\\f\\n\\r\\t\\\\\\u0000"}',
    );
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

  it("accepts lawful null-prototype records and returns the same safe shape", () => {
    const ordinary = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));
    const withNullPrototypeRecords = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        return value.map(withNullPrototypeRecords);
      }
      if (value !== null && typeof value === "object") {
        const result = Object.create(null) as Record<string, unknown>;
        for (const [key, child] of Object.entries(value)) {
          Object.defineProperty(result, key, {
            configurable: true,
            enumerable: true,
            value: withNullPrototypeRecords(child),
            writable: true,
          });
        }
        return result;
      }
      return value;
    };
    const candidate = withNullPrototypeRecords(ordinary);

    const result = policyBundleSchema.safeParse(candidate);

    expect(result.success).toBe(true);
    if (result.success) {
      expectFrozenOwnDataSnapshot(result.data, ordinary);
    }
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

  it("projects every numeric index safely and refuses polluted schema execution", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const clean = policyBundleSchema.parse(raw);
    const environment = {
      OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
    };

    for (const prototype of [Object.prototype, Array.prototype]) {
      for (const key of NUMERIC_PROTOTYPE_KEYS) {
        const prototypeName = prototype === Object.prototype
          ? "Object"
          : "Array";
        const label = `${prototypeName}.${key}`;
        const previous = Object.getOwnPropertyDescriptor(prototype, key);
        let getterReads = 0;
        let setterCalls = 0;
        let projected: ReturnType<typeof canonicalProjection> | undefined;
        let parsed:
          | ReturnType<typeof policyBundleSchema.safeParse>
          | undefined;
        let repinError: unknown;
        let escaped: unknown;

        try {
          Object.defineProperty(prototype, key, {
            configurable: true,
            get() {
              getterReads += 1;
              return "public/**";
            },
            set(value: unknown) {
              setterCalls += 1;
              Object.defineProperty(this, key, {
                configurable: true,
                enumerable: true,
                value,
                writable: true,
              });
            },
          });
          try {
            projected = canonicalProjection(raw);
            parsed = policyBundleSchema.safeParse(raw);
            repin(clean, { token: "fixture-custodian-token" }, environment);
          } catch (error) {
            if (error instanceof RepinRefusedError) {
              repinError = error;
            } else {
              escaped = error;
            }
          }
        } finally {
          if (previous === undefined) {
            Reflect.deleteProperty(prototype, key);
          } else {
            Object.defineProperty(prototype, key, previous);
          }
        }

        expect(escaped, label).toBeUndefined();
        expect(parsed?.success, label).toBe(false);
        expect(repinError, label).toBeInstanceOf(RepinRefusedError);
        expect(getterReads, label).toBe(0);
        expect(setterCalls, label).toBe(0);
        expectFrozenOwnDataSnapshot(projected, raw);
        expect(bundleHash(projected)).toBe(
          "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
        );
        expect(
          isFloorDenied(
            projected as PolicyBundle,
            "apps/api/src/registration.ts",
          ),
        ).toBe(true);
      }
    }
  });

  it("refuses every inherited non-writable numeric index without weakening clean validation", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const unsafe = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const registry = unsafe.code_registry_seed as Record<string, unknown>;
    const scope = registry.scope_file_list as Record<string, unknown>;
    scope.count = Number.MAX_SAFE_INTEGER + 1;
    const clean = policyBundleSchema.parse(raw);
    const environment = {
      OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
    };

    expect(policyBundleSchema.safeParse(unsafe).success).toBe(false);

    for (const prototype of [Object.prototype, Array.prototype]) {
      for (const key of NUMERIC_PROTOTYPE_KEYS) {
        const prototypeName = prototype === Object.prototype
          ? "Object"
          : "Array";
        const label = `${prototypeName}.${key}`;
        const previous = Object.getOwnPropertyDescriptor(prototype, key);
        let projected: ReturnType<typeof canonicalProjection> | undefined;
        let validResult:
          | ReturnType<typeof policyBundleSchema.safeParse>
          | undefined;
        let unsafeResult:
          | ReturnType<typeof policyBundleSchema.safeParse>
          | undefined;
        let repinError: unknown;
        let escaped: unknown;

        try {
          Object.defineProperty(prototype, key, {
            configurable: true,
            value: "public/**",
          });
          try {
            projected = canonicalProjection(raw);
            validResult = policyBundleSchema.safeParse(raw);
            unsafeResult = policyBundleSchema.safeParse(unsafe);
            try {
              repin(clean, { token: "fixture-custodian-token" }, environment);
            } catch (error) {
              repinError = error;
            }
          } catch (error) {
            escaped = error;
          }
        } finally {
          if (previous === undefined) {
            Reflect.deleteProperty(prototype, key);
          } else {
            Object.defineProperty(prototype, key, previous);
          }
        }

        expect(escaped, label).toBeUndefined();
        expect(validResult?.success, label).toBe(false);
        expect(unsafeResult?.success, label).toBe(false);
        expect(repinError, label).toBeInstanceOf(RepinRefusedError);
        expectFrozenOwnDataSnapshot(projected, raw);
      }
    }
  });

  it("does not classify non-index numeric spellings as array pollution", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));

    for (const prototype of [Object.prototype, Array.prototype]) {
      for (const key of ["01", "-0", "1.0", "4294967295"] as const) {
        const previous = Object.getOwnPropertyDescriptor(prototype, key);
        let getterReads = 0;
        let setterCalls = 0;
        let success: boolean | undefined;
        let escaped: unknown;
        try {
          Object.defineProperty(prototype, key, {
            configurable: true,
            get() {
              getterReads += 1;
              throw new Error("NON_INDEX_GETTER_RAN");
            },
            set() {
              setterCalls += 1;
              throw new Error("NON_INDEX_SETTER_RAN");
            },
          });
          try {
            success = policyBundleSchema.safeParse(raw).success;
          } catch (error) {
            escaped = error;
          }
        } finally {
          if (previous === undefined) {
            Reflect.deleteProperty(prototype, key);
          } else {
            Object.defineProperty(prototype, key, previous);
          }
        }

        const label = `${prototype === Object.prototype ? "Object" : "Array"}.${key}`;
        expect(escaped, label).toBeUndefined();
        expect(success, label).toBe(true);
        expect(getterReads, label).toBe(0);
        expect(setterCalls, label).toBe(0);
      }
    }
  });

  it("rechecks numeric prototypes after projection and before Zod", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));
    const originalDescriptors = Object.getOwnPropertyDescriptors;
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "1");
    let projectionCalls = 0;
    let getterReads = 0;
    let setterCalls = 0;
    let result: ReturnType<typeof policyBundleSchema.safeParse> | undefined;
    let escaped: unknown;

    try {
      Object.getOwnPropertyDescriptors = ((value: object) => {
        const descriptors = originalDescriptors(value);
        projectionCalls += 1;
        if (projectionCalls === 1) {
          Object.defineProperty(Object.prototype, "1", {
            configurable: true,
            get() {
              getterReads += 1;
              return undefined;
            },
            set(assigned: unknown) {
              setterCalls += 1;
              Object.defineProperty(this, "1", {
                configurable: true,
                enumerable: true,
                value: assigned,
                writable: true,
              });
            },
          });
        }
        return descriptors;
      }) as typeof Object.getOwnPropertyDescriptors;
      try {
        result = policyBundleSchema.safeParse(raw);
      } catch (error) {
        escaped = error;
      }
    } finally {
      Object.getOwnPropertyDescriptors = originalDescriptors;
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "1");
      } else {
        Object.defineProperty(Object.prototype, "1", previous);
      }
    }

    expect(escaped).toBeUndefined();
    expect(result?.success).toBe(false);
    expect(projectionCalls).toBeGreaterThan(0);
    expect(getterReads).toBe(0);
    expect(setterCalls).toBe(0);
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

  it("returns failure for all missing value fields without invoking a prototype getter", () => {
    const candidates = candidatesMissingRequiredValue();
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let getterReads = 0;
    let failures = 0;
    let escaped = 0;
    try {
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        get() {
          getterReads += 1;
          throw new Error("OBJECT_PROTOTYPE_VALUE_GETTER_RAN");
        },
      });
      for (const candidate of candidates) {
        try {
          if (!policyBundleSchema.safeParse(candidate).success) failures += 1;
        } catch {
          escaped += 1;
        }
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", previous);
      }
    }

    expect(candidates).toHaveLength(19);
    expect(failures).toBe(19);
    expect(escaped).toBe(0);
    expect(getterReads).toBe(0);
  });

  it("returns failure for all missing value fields over non-writable prototype data", () => {
    const candidates = candidatesMissingRequiredValue();
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let failures = 0;
    let escaped = 0;
    try {
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        value: "INHERITED_VALUE",
      });
      for (const candidate of candidates) {
        try {
          if (!policyBundleSchema.safeParse(candidate).success) failures += 1;
        } catch {
          escaped += 1;
        }
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", previous);
      }
    }

    expect(candidates).toHaveLength(19);
    expect(failures).toBe(19);
    expect(escaped).toBe(0);
  });

  it("rejects all accessor-backed value fields without consulting a prototype getter", () => {
    let sourceReads = 0;
    const { candidates, descriptorValues } =
      candidatesWithAccessorBackedRequiredValue(() => {
        sourceReads += 1;
      });
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let inheritedReads = 0;
    let failures = 0;
    let escaped = 0;

    try {
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        get() {
          inheritedReads += 1;
          const getterDescriptor = Object.getOwnPropertyDescriptor(
            this as object,
            "get",
          );
          if (
            getterDescriptor === undefined ||
            !Object.hasOwn(getterDescriptor, "value")
          ) {
            throw new Error("MISSING_DESCRIPTOR_GETTER");
          }
          return descriptorValues.get(
            getterDescriptor.value as () => unknown,
          );
        },
      });
      for (const candidate of candidates) {
        try {
          if (!policyBundleSchema.safeParse(candidate).success) failures += 1;
        } catch {
          escaped += 1;
        }
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", previous);
      }
    }

    expect(candidates).toHaveLength(19);
    expect(failures).toBe(19);
    expect(escaped).toBe(0);
    expect(inheritedReads).toBe(0);
    expect(sourceReads).toBe(0);
  });

  it("rejects all accessor-backed value fields over matching inherited data", () => {
    let sourceReads = 0;
    const { candidates, originalValues } =
      candidatesWithAccessorBackedRequiredValue(() => {
        sourceReads += 1;
      });
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let failures = 0;
    let escaped = 0;

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        Object.defineProperty(Object.prototype, "value", {
          configurable: true,
          value: originalValues[index],
        });
        try {
          if (!policyBundleSchema.safeParse(candidates[index]).success) {
            failures += 1;
          }
        } catch {
          escaped += 1;
        }
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", previous);
      }
    }

    expect(candidates).toHaveLength(19);
    expect(failures).toBe(19);
    expect(escaped).toBe(0);
    expect(sourceReads).toBe(0);
  });

  it("rejects all proxy-normalized value descriptors before any trap or getter", () => {
    let sourceReads = 0;
    let descriptorTraps = 0;
    const { candidates, descriptorValues } =
      candidatesWithProxyBackedRequiredValue(
        () => {
          sourceReads += 1;
        },
        () => {
          descriptorTraps += 1;
        },
      );
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let inheritedReads = 0;
    let failures = 0;
    let escaped = 0;

    try {
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        get() {
          inheritedReads += 1;
          const getterDescriptor = Object.getOwnPropertyDescriptor(
            this as object,
            "get",
          );
          if (
            getterDescriptor === undefined ||
            !Object.hasOwn(getterDescriptor, "value")
          ) {
            throw new Error("MISSING_DESCRIPTOR_GETTER");
          }
          return descriptorValues.get(
            getterDescriptor.value as () => unknown,
          );
        },
      });
      for (const candidate of candidates) {
        try {
          if (!policyBundleSchema.safeParse(candidate).success) failures += 1;
        } catch {
          escaped += 1;
        }
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", previous);
      }
    }

    expect(candidates).toHaveLength(19);
    expect(failures).toBe(19);
    expect(escaped).toBe(0);
    expect(descriptorTraps).toBe(0);
    expect(inheritedReads).toBe(0);
    expect(sourceReads).toBe(0);
  });

  it("rejects all proxy-normalized value descriptors over matching inherited data", () => {
    let sourceReads = 0;
    let descriptorTraps = 0;
    const { candidates, originalValues } =
      candidatesWithProxyBackedRequiredValue(
        () => {
          sourceReads += 1;
        },
        () => {
          descriptorTraps += 1;
        },
      );
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let failures = 0;
    let escaped = 0;

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        Object.defineProperty(Object.prototype, "value", {
          configurable: true,
          value: originalValues[index],
        });
        try {
          if (!policyBundleSchema.safeParse(candidates[index]).success) {
            failures += 1;
          }
        } catch {
          escaped += 1;
        }
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", previous);
      }
    }

    expect(candidates).toHaveLength(19);
    expect(failures).toBe(19);
    expect(escaped).toBe(0);
    expect(descriptorTraps).toBe(0);
    expect(sourceReads).toBe(0);
  });

  it("rejects top-level and nested proxies before reflective traps", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    let prototypeTraps = 0;
    let ownKeyTraps = 0;
    let descriptorTraps = 0;
    const numericPrevious = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "113",
    );
    const introduceNumericPollution = () => {
      Object.defineProperty(Object.prototype, "113", {
        configurable: true,
        value: "PROXY_TRAP_RAN",
      });
    };
    const traps: ProxyHandler<object> = {
      getPrototypeOf(target) {
        prototypeTraps += 1;
        introduceNumericPollution();
        return Reflect.getPrototypeOf(target);
      },
      ownKeys(target) {
        ownKeyTraps += 1;
        introduceNumericPollution();
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        descriptorTraps += 1;
        introduceNumericPollution();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    };
    const topLevel = new Proxy(raw, traps);
    const nested = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    nested.floor_deny_globs = new Proxy(
      nested.floor_deny_globs as string[],
      traps,
    );
    let topResult:
      | ReturnType<typeof policyBundleSchema.safeParse>
      | undefined;
    let nestedResult:
      | ReturnType<typeof policyBundleSchema.safeParse>
      | undefined;
    let escaped: unknown;
    let pollutionIntroduced = false;

    try {
      topResult = policyBundleSchema.safeParse(topLevel);
      nestedResult = policyBundleSchema.safeParse(nested);
      pollutionIntroduced = Object.hasOwn(Object.prototype, "113");
    } catch (error) {
      escaped = error;
    } finally {
      if (numericPrevious === undefined) {
        Reflect.deleteProperty(Object.prototype, "113");
      } else {
        Object.defineProperty(Object.prototype, "113", numericPrevious);
      }
    }

    expect(escaped).toBeUndefined();
    expect(topResult?.success).toBe(false);
    expect(nestedResult?.success).toBe(false);
    expect(prototypeTraps).toBe(0);
    expect(ownKeyTraps).toBe(0);
    expect(descriptorTraps).toBe(0);
    expect(pollutionIntroduced).toBe(false);
  });

  it("maps revoked policy, request, environment, and nested proxies to bounded refusal", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));
    const bundle = loadBundle(BUNDLE_PATH);
    const policy = Proxy.revocable(raw, {});
    const request = Proxy.revocable(
      { token: "fixture-custodian-token" },
      {},
    );
    const environment = Proxy.revocable(
      { OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token" },
      {},
    );
    const nested = Proxy.revocable({ ...bundle, quick_arm: "ON" }, {});
    policy.revoke();
    request.revoke();
    environment.revoke();
    nested.revoke();

    let policyResult:
      | ReturnType<typeof policyBundleSchema.safeParse>
      | undefined;
    let policyEscape: unknown;
    try {
      policyResult = policyBundleSchema.safeParse(policy.proxy);
    } catch (error) {
      policyEscape = error;
    }
    expect(policyEscape).toBeUndefined();
    expect(policyResult?.success).toBe(false);

    for (const [candidateRequest, candidateEnvironment] of [
      [
        request.proxy,
        { OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token" },
      ],
      [
        { token: "fixture-custodian-token" },
        environment.proxy,
      ],
      [
        {
          token: "fixture-custodian-token",
          next_bundle: nested.proxy,
        },
        { OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token" },
      ],
    ] as const) {
      let error: unknown;
      try {
        repin(bundle, candidateRequest as never, candidateEnvironment as never);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(RepinRefusedError);
      expect(error).toMatchObject({ code: "REPIN_REFUSED" });
    }
  });

  it("bounds cycles and over-cap graphs before recursive reflection", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let depth = 0; depth < 300; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    expect(() => canonicalProjection(cyclic)).toThrowError(
      "CANONICAL_JSON_NON_PLAIN_DATA",
    );
    expect(() => canonicalProjection(deep)).toThrowError(
      "CANONICAL_JSON_NON_PLAIN_DATA",
    );
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

  it("does not let descriptor prototypes authenticate a token or select a bundle", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const armed = { ...bundle, quick_arm: "ON" };
    let sourceReads = 0;
    let inheritedReads = 0;
    const tokenAccessor = () => {
      sourceReads += 1;
      throw new Error("TOKEN_ACCESSOR_RAN");
    };
    const bundleAccessor = () => {
      sourceReads += 1;
      throw new Error("NEXT_BUNDLE_ACCESSOR_RAN");
    };
    const descriptorValues = new Map<() => unknown, unknown>([
      [tokenAccessor, "fixture-custodian-token"],
      [bundleAccessor, armed],
    ]);
    const accessorRequest = Object.defineProperties({}, {
      token: { enumerable: true, get: tokenAccessor },
      next_bundle: { enumerable: true, get: bundleAccessor },
    });
    const accessorEnvironment = Object.defineProperty(
      {},
      "OBS_POLICY_CUSTODIAN_TOKEN",
      { enumerable: true, get: tokenAccessor },
    );
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let getterRequestError: unknown;
    let getterEnvironmentError: unknown;

    try {
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        get() {
          inheritedReads += 1;
          const getterDescriptor = Object.getOwnPropertyDescriptor(
            this as object,
            "get",
          );
          if (
            getterDescriptor === undefined ||
            !Object.hasOwn(getterDescriptor, "value")
          ) {
            throw new Error("MISSING_DESCRIPTOR_GETTER");
          }
          return descriptorValues.get(
            getterDescriptor.value as () => unknown,
          );
        },
      });
      try {
        repin(bundle, accessorRequest as never, {
          OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
        });
      } catch (error) {
        getterRequestError = error;
      }
      try {
        repin(
          bundle,
          {
            token: "fixture-custodian-token",
            next_bundle: armed,
          },
          accessorEnvironment as never,
        );
      } catch (error) {
        getterEnvironmentError = error;
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", previous);
      }
    }

    expect(getterRequestError).toBeInstanceOf(RepinRefusedError);
    expect(getterEnvironmentError).toBeInstanceOf(RepinRefusedError);
    expect(inheritedReads).toBe(0);
    expect(sourceReads).toBe(0);

    for (const [member, inherited] of [
      ["token", "fixture-custodian-token"],
      ["next_bundle", armed],
    ] as const) {
      const request = member === "token"
        ? Object.defineProperty(
          { next_bundle: armed },
          "token",
          { enumerable: true, get: tokenAccessor },
        )
        : Object.defineProperty(
          { token: "fixture-custodian-token" },
          "next_bundle",
          { enumerable: true, get: bundleAccessor },
        );
      let error: unknown;
      try {
        Object.defineProperty(Object.prototype, "value", {
          configurable: true,
          value: inherited,
        });
        repin(bundle, request as never, {
          OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
        });
      } catch (caught) {
        error = caught;
      } finally {
        if (previous === undefined) {
          Reflect.deleteProperty(Object.prototype, "value");
        } else {
          Object.defineProperty(Object.prototype, "value", previous);
        }
      }
      expect(error, member).toBeInstanceOf(RepinRefusedError);
    }
    expect(sourceReads).toBe(0);
  });

  it("rejects proxy-normalized token and bundle descriptors before traps", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const armed = { ...bundle, quick_arm: "ON" };
    let sourceReads = 0;
    let descriptorTraps = 0;
    let inheritedReads = 0;
    const tokenAccessor = () => {
      sourceReads += 1;
      throw new Error("TOKEN_ACCESSOR_RAN");
    };
    const bundleAccessor = () => {
      sourceReads += 1;
      throw new Error("NEXT_BUNDLE_ACCESSOR_RAN");
    };
    const descriptorValues = new Map<() => unknown, unknown>([
      [tokenAccessor, "fixture-custodian-token"],
      [bundleAccessor, armed],
    ]);
    const proxyDescriptors = <T extends object>(target: T): T =>
      new Proxy(target, {
        getOwnPropertyDescriptor(proxyTarget, key) {
          descriptorTraps += 1;
          const descriptor = Reflect.getOwnPropertyDescriptor(
            proxyTarget,
            key,
          );
          if (descriptor === undefined || !Object.hasOwn(descriptor, "get")) {
            return descriptor;
          }
          return {
            configurable: true,
            enumerable: true,
            get: descriptor.get as () => unknown,
          };
        },
      });
    const request = proxyDescriptors(Object.defineProperties({}, {
      token: { configurable: true, enumerable: true, get: tokenAccessor },
      next_bundle: {
        configurable: true,
        enumerable: true,
        get: bundleAccessor,
      },
    }));
    const environment = proxyDescriptors(Object.defineProperty(
      {},
      "OBS_POLICY_CUSTODIAN_TOKEN",
      { configurable: true, enumerable: true, get: tokenAccessor },
    ));
    const previous = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "value",
    );
    let error: unknown;

    try {
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        get() {
          inheritedReads += 1;
          const getterDescriptor = Object.getOwnPropertyDescriptor(
            this as object,
            "get",
          );
          if (
            getterDescriptor === undefined ||
            !Object.hasOwn(getterDescriptor, "value")
          ) {
            throw new Error("MISSING_DESCRIPTOR_GETTER");
          }
          return descriptorValues.get(
            getterDescriptor.value as () => unknown,
          );
        },
      });
      repin(bundle, request as never, environment as never);
    } catch (caught) {
      error = caught;
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "value");
      } else {
        Object.defineProperty(Object.prototype, "value", previous);
      }
    }

    expect(error).toBeInstanceOf(RepinRefusedError);
    expect(descriptorTraps).toBe(0);
    expect(inheritedReads).toBe(0);
    expect(sourceReads).toBe(0);

    for (const [candidate, inherited] of [
      [
        proxyDescriptors(Object.defineProperty(
          { next_bundle: armed },
          "token",
          { configurable: true, enumerable: true, get: tokenAccessor },
        )),
        "fixture-custodian-token",
      ],
      [
        proxyDescriptors(Object.defineProperty(
          { token: "fixture-custodian-token" },
          "next_bundle",
          { configurable: true, enumerable: true, get: bundleAccessor },
        )),
        armed,
      ],
    ] as const) {
      let dataError: unknown;
      try {
        Object.defineProperty(Object.prototype, "value", {
          configurable: true,
          value: inherited,
        });
        repin(bundle, candidate as never, {
          OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
        });
      } catch (caught) {
        dataError = caught;
      } finally {
        if (previous === undefined) {
          Reflect.deleteProperty(Object.prototype, "value");
        } else {
          Object.defineProperty(Object.prototype, "value", previous);
        }
      }
      expect(dataError).toBeInstanceOf(RepinRefusedError);
    }
    expect(sourceReads).toBe(0);
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

  it("rejects a proxy in the request prototype chain before its traps", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    let descriptorTraps = 0;
    let prototypeTraps = 0;
    const hostilePrototype = new Proxy({}, {
      getOwnPropertyDescriptor(target, key) {
        descriptorTraps += 1;
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      getPrototypeOf(target) {
        prototypeTraps += 1;
        return Reflect.getPrototypeOf(target);
      },
    });
    const request = Object.assign(Object.create(hostilePrototype) as object, {
      token: "fixture-custodian-token",
    });

    expect(() => repin(bundle, request as never, {
      OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
    })).toThrowError(RepinRefusedError);
    expect(descriptorTraps).toBe(0);
    expect(prototypeTraps).toBe(0);
  });

  it("rejects a proxy policy before its first prototype trap", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const candidateTarget = JSON.parse(
      readFileSync(BUNDLE_PATH, "utf8"),
    ) as Record<string, unknown>;
    let prototypeReads = 0;
    const candidate = new Proxy(candidateTarget, {
      getPrototypeOf(target) {
        prototypeReads += 1;
        return Reflect.getPrototypeOf(target);
      },
    });

    const firstPass = policyBundleSchema.safeParse(candidate);
    expect(firstPass.success).toBe(false);
    expect(prototypeReads).toBe(0);

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
    expect(prototypeReads).toBe(0);
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
