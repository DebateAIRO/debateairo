import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

const FROZEN_FLOOR_SAMPLES = [
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
] as const;

const FLOOR_SAFE_NEIGHBORS = [
  "apps/api/src/public-health.ts",
  "././apps/api/src/public-health.ts",
  "apps/api/src/mfa-helper.ts",
  "apps/ui/pnpm-lock.yml",
  "packages/cryptography/src/index.ts",
  "packages/db/src/obs-schema-helper.ts",
  "packages/register/src/compose-environment.ts",
  "packages/register/src/runtime-configuration.ts",
] as const;

type CapturedOperation<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: unknown };

function withInheritedArrayMember<T>(
  owner: "OBJECT" | "ARRAY",
  key: PropertyKey,
  descriptor: PropertyDescriptor,
  operation: () => T,
): CapturedOperation<T> {
  const host = owner === "OBJECT" ? Object.prototype : Array.prototype;
  const hostPrevious = Object.getOwnPropertyDescriptor(host, key);
  const arrayPrevious = owner === "OBJECT"
    ? Object.getOwnPropertyDescriptor(Array.prototype, key)
    : undefined;
  let outcome: CapturedOperation<T>;

  try {
    if (owner === "OBJECT" && !Reflect.deleteProperty(Array.prototype, key)) {
      throw new Error("ARRAY_PROTOTYPE_MEMBER_NOT_CONFIGURABLE");
    }
    Object.defineProperty(host, key, descriptor);
    try {
      outcome = { success: true, value: operation() };
    } catch (error) {
      outcome = { success: false, error };
    }
  } finally {
    if (hostPrevious === undefined) {
      Reflect.deleteProperty(host, key);
    } else {
      Object.defineProperty(host, key, hostPrevious);
    }
    if (owner === "OBJECT" && arrayPrevious !== undefined) {
      Object.defineProperty(Array.prototype, key, arrayPrevious);
    }
  }

  return outcome!;
}

function withHashMember<T>(
  key: "update" | "digest",
  descriptor: PropertyDescriptor,
  operation: () => T,
): CapturedOperation<T> {
  const prototype = Object.getPrototypeOf(createHash("sha256")) as object;
  const previous = Object.getOwnPropertyDescriptor(prototype, key);
  if (previous === undefined) throw new Error("HASH_MEMBER_MISSING");
  let outcome: CapturedOperation<T>;

  try {
    Object.defineProperty(prototype, key, descriptor);
    try {
      outcome = { success: true, value: operation() };
    } catch (error) {
      outcome = { success: false, error };
    }
  } finally {
    Object.defineProperty(prototype, key, previous);
  }

  return outcome!;
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

  it("never dispatches inherited Hash update or digest during authority decisions", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const armed = { ...bundle, quick_arm: "ON" as const };
    const expectedHash =
      "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd";
    const members = ["update", "digest"] as const;
    const variants = [
      "GETTER_FUNCTION",
      "DATA_FUNCTION",
      "THROWING_GETTER",
      "NON_FUNCTION",
    ] as const;

    for (const member of members) {
      for (const variant of variants) {
        let getterCalls = 0;
        let functionCalls = 0;
        const hostileFunction = function (
          this: unknown,
          argument?: unknown,
        ): unknown {
          functionCalls += 1;
          if (member === "update") return this;
          return argument === "hex" ? "0".repeat(64) : Buffer.alloc(32);
        };
        let descriptor: PropertyDescriptor;
        if (variant === "GETTER_FUNCTION") {
          descriptor = {
            configurable: true,
            get() {
              getterCalls += 1;
              return hostileFunction;
            },
          };
        } else if (variant === "DATA_FUNCTION") {
          descriptor = {
            configurable: true,
            value: hostileFunction,
            writable: true,
          };
        } else if (variant === "THROWING_GETTER") {
          descriptor = {
            configurable: true,
            get() {
              getterCalls += 1;
              throw new Error("HASH_MEMBER_RAN");
            },
          };
        } else {
          descriptor = {
            configurable: true,
            value: "NOT_CALLABLE",
            writable: true,
          };
        }

        const outcome = withHashMember(member, descriptor, () => {
          let repinError: unknown;
          let repinned: PolicyBundle | undefined;
          try {
            repinned = repin(bundle, {
              token: "wrong",
              next_bundle: armed,
            }, {
              OBS_POLICY_CUSTODIAN_TOKEN: "correct",
            });
          } catch (error) {
            repinError = error;
          }
          return { hash: bundleHash(bundle), repinError, repinned };
        });
        const label = `${member}:${variant}`;

        expect.soft(outcome.success, label).toBe(true);
        expect.soft(getterCalls, label).toBe(0);
        expect.soft(functionCalls, label).toBe(0);
        if (outcome.success) {
          expect.soft(outcome.value.hash, label).toBe(expectedHash);
          expect.soft(outcome.value.repinError, label).toBeInstanceOf(
            RepinRefusedError,
          );
          expect.soft(outcome.value.repinned, label).toBeUndefined();
        }
        expect.soft(bundleHash(bundle), `${label}:restored`).toBe(expectedHash);
      }
    }

    expect(
      repin(bundle, { token: "correct" }, {
        OBS_POLICY_CUSTODIAN_TOKEN: "correct",
      }).quick_arm,
    ).toBe("OFF");
  });

  it("refuses every hostile Array.prototype.push shape before Zod can execute it", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));
    const armed = { ...bundle, quick_arm: "ON" as const };
    const pushDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "push",
    );
    const hashPrototype = Object.getPrototypeOf(createHash("sha256")) as object;
    const updateDescriptor = Object.getOwnPropertyDescriptor(
      hashPrototype,
      "update",
    );
    if (
      pushDescriptor === undefined ||
      !Object.hasOwn(pushDescriptor, "value") ||
      typeof pushDescriptor.value !== "function" ||
      updateDescriptor === undefined
    ) {
      throw new Error("NATIVE_AUTHORITY_MEMBER_MISSING");
    }
    const nativePush = pushDescriptor.value as (...values: unknown[]) => number;
    const variants = [
      "GETTER_NOOP",
      "DATA_NOOP",
      "THROWING_GETTER",
      "NON_FUNCTION",
      "WRAPPER_CROSS_CALL_POISON",
    ] as const;

    for (const variant of variants) {
      let getterCalls = 0;
      let functionCalls = 0;
      const hostileFunction = function (
        this: unknown[],
        ...values: unknown[]
      ): number {
        functionCalls += 1;
        if (variant === "WRAPPER_CROSS_CALL_POISON") {
          Object.defineProperty(hashPrototype, "update", {
            configurable: true,
            value(this: unknown) {
              return this;
            },
            writable: true,
          });
          return Reflect.apply(nativePush, this, values);
        }
        return 0;
      };
      let descriptor: PropertyDescriptor;
      if (variant === "GETTER_NOOP") {
        descriptor = {
          configurable: true,
          get() {
            getterCalls += 1;
            return hostileFunction;
          },
        };
      } else if (variant === "THROWING_GETTER") {
        descriptor = {
          configurable: true,
          get() {
            getterCalls += 1;
            throw new Error("ARRAY_PUSH_RAN");
          },
        };
      } else if (variant === "NON_FUNCTION") {
        descriptor = {
          configurable: true,
          value: "NOT_CALLABLE",
          writable: true,
        };
      } else {
        descriptor = {
          configurable: true,
          value: hostileFunction,
          writable: true,
        };
      }

      let safeResult: ReturnType<typeof policyBundleSchema.safeParse> | undefined;
      let loadError: unknown;
      let repinError: unknown;
      let repinned: PolicyBundle | undefined;
      let hash: string | undefined;
      let escaped: unknown;
      try {
        Object.defineProperty(Array.prototype, "push", descriptor);
        try {
          safeResult = policyBundleSchema.safeParse(raw);
          try {
            loadBundle(BUNDLE_PATH);
          } catch (error) {
            loadError = error;
          }
          try {
            repinned = repin(bundle, {
              token: "wrong",
              next_bundle: armed,
            }, {
              OBS_POLICY_CUSTODIAN_TOKEN: "correct",
            });
          } catch (error) {
            repinError = error;
          }
          hash = bundleHash(bundle);
        } catch (error) {
          escaped = error;
        }
      } finally {
        Object.defineProperty(Array.prototype, "push", pushDescriptor);
        Object.defineProperty(hashPrototype, "update", updateDescriptor);
      }
      const label = variant;

      expect.soft(escaped, label).toBeUndefined();
      expect.soft(safeResult?.success, label).toBe(false);
      expect.soft(loadError, label).toBeInstanceOf(PolicyBundleLoadError);
      expect.soft(repinError, label).toBeInstanceOf(RepinRefusedError);
      expect.soft(repinned, label).toBeUndefined();
      expect.soft(getterCalls, label).toBe(0);
      expect.soft(functionCalls, label).toBe(0);
      expect.soft(hash, label).toBe(
        "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
      );
    }

    expect(policyBundleSchema.safeParse(raw).success).toBe(true);
    expect(loadBundle(BUNDLE_PATH).quick_arm).toBe("OFF");
  });

  it("contains every hostile Array.prototype.push shape before loader initialization", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const outputDirectory = mkdtempSync(join(tmpdir(), "fix09-preinit-"));
    writeFileSync(
      join(outputDirectory, "package.json"),
      '{"type":"module"}\n',
      "utf8",
    );
    const compileOutcome = spawnSync(process.execPath, [
      TYPESCRIPT_COMPILER_PATH,
      "--ignoreConfig",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--types",
      "node",
      "--skipLibCheck",
      "--rootDir",
      repositoryRoot,
      "--outDir",
      outputDirectory,
      resolve(repositoryRoot, "tools/obs-listener/policy/loader.ts"),
      resolve(repositoryRoot, "tools/obs-listener/policy/canonical.ts"),
      resolve(repositoryRoot, "tools/obs-listener/policy/unique-json.ts"),
    ], { cwd: repositoryRoot, encoding: "utf8" });
    expect(
      compileOutcome.status,
      `${compileOutcome.stdout}${compileOutcome.stderr}`,
    ).toBe(0);
    const compiledPolicyDirectory = resolve(
      outputDirectory,
      "tools/obs-listener/policy",
    );
    const loaderUrl = pathToFileURL(
      resolve(compiledPolicyDirectory, "loader.js"),
    ).href;
    const canonicalUrl = pathToFileURL(
      resolve(compiledPolicyDirectory, "canonical.js"),
    ).href;
    const uniqueJsonUrl = pathToFileURL(
      resolve(compiledPolicyDirectory, "unique-json.js"),
    ).href;
    const variants = [
      "GETTER_FUNCTION",
      "DATA_FUNCTION",
      "THROWING_GETTER",
      "NON_FUNCTION",
    ] as const;

    try {
      for (const variant of variants) {
        const script = `
          import { readFileSync } from "node:fs";
          await import("zod");
          await import(${JSON.stringify(canonicalUrl)});
          await import(${JSON.stringify(uniqueJsonUrl)});
          const previous = Object.getOwnPropertyDescriptor(Array.prototype, "push");
          if (!previous || !("value" in previous)) throw new Error("MISSING_PUSH");
          const original = previous.value;
          let getterCalls = 0;
          let functionCalls = 0;
          const hostileFunction = function (...values) {
            functionCalls += 1;
            return Reflect.apply(original, this, values);
          };
          const variant = ${JSON.stringify(variant)};
          let descriptor;
          if (variant === "GETTER_FUNCTION") {
            descriptor = {
              configurable: true,
              get() {
                getterCalls += 1;
                return hostileFunction;
              },
            };
          } else if (variant === "DATA_FUNCTION") {
            descriptor = {
              configurable: true,
              value: hostileFunction,
              writable: true,
            };
          } else if (variant === "THROWING_GETTER") {
            descriptor = {
              configurable: true,
              get() {
                getterCalls += 1;
                throw new Error("RAW_PUSH_ESCAPE");
              },
            };
          } else {
            descriptor = {
              configurable: true,
              value: "NOT_CALLABLE",
              writable: true,
            };
          }
          let imported = false;
          let success;
          let rawError = null;
          Object.defineProperty(Array.prototype, "push", descriptor);
          try {
            const { policyBundleSchema } = await import(
              ${JSON.stringify(loaderUrl)} + "?hostile-preimport-${variant}"
            );
            imported = true;
            const raw = JSON.parse(readFileSync(${JSON.stringify(BUNDLE_PATH)}, "utf8"));
            success = policyBundleSchema.safeParse(raw).success;
          } catch (error) {
            rawError = {
              name: error instanceof Error ? error.name : typeof error,
              message: error instanceof Error ? error.message : String(error),
            };
          } finally {
            Object.defineProperty(Array.prototype, "push", previous);
          }
          process.stdout.write(JSON.stringify({
            functionCalls,
            getterCalls,
            imported,
            rawError,
            success,
          }));
        `;
        const outcome = spawnSync(
          process.execPath,
          ["--input-type=module", "--eval", script],
          { cwd: repositoryRoot, encoding: "utf8" },
        );
        const label = `${variant}:${outcome.stdout}${outcome.stderr}`;

        expect.soft(outcome.status, label).toBe(0);
        if (outcome.status === 0) {
          expect.soft(JSON.parse(outcome.stdout), variant).toEqual({
            functionCalls: 0,
            getterCalls: 0,
            imported: true,
            rawError: null,
            success: false,
          });
        }
      }
    } finally {
      rmSync(outputDirectory, { force: true, recursive: true });
    }
  });

  it("validates through the declared Zod schema under the supported tsx runtime", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const loaderUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/loader.ts"),
    ).href;
    const script = `
      import { readFileSync } from "node:fs";
      const { policyBundleSchema } = await import(
        ${JSON.stringify(loaderUrl)} + "?tsx-zod-runtime"
      );
      const raw = JSON.parse(
        readFileSync(${JSON.stringify(BUNDLE_PATH)}, "utf8")
      );
      process.stdout.write(JSON.stringify({
        success: policyBundleSchema.safeParse(raw).success,
      }));
    `;
    const outcome = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: repositoryRoot, encoding: "utf8" },
    );

    expect(outcome.status, `${outcome.stdout}${outcome.stderr}`).toBe(0);
    expect(JSON.parse(outcome.stdout)).toEqual({ success: true });
  });

  it("resolves private Zod validation independently of process cwd", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const loaderUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/loader.ts"),
    ).href;
    const unrelatedDirectory = mkdtempSync(join(tmpdir(), "fix09-cwd-"));
    const script = `
      import { readFileSync } from "node:fs";
      const { policyBundleSchema } = await import(
        ${JSON.stringify(loaderUrl)} + "?cwd-independent-zod"
      );
      process.chdir(${JSON.stringify(unrelatedDirectory)});
      const raw = JSON.parse(
        readFileSync(${JSON.stringify(BUNDLE_PATH)}, "utf8")
      );
      process.stdout.write(JSON.stringify({
        success: policyBundleSchema.safeParse(raw).success,
      }));
    `;

    try {
      const outcome = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", script],
        { cwd: repositoryRoot, encoding: "utf8", timeout: 15_000 },
      );
      expect(outcome.status, `${outcome.stdout}${outcome.stderr}`).toBe(0);
      expect(JSON.parse(outcome.stdout)).toEqual({ success: true });
    } finally {
      rmSync(unrelatedDirectory, { force: true, recursive: true });
    }
  });

  it("does not consult the live CommonJS resolver for private Zod", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const loaderUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/loader.ts"),
    ).href;
    const script = `
      import { readFileSync } from "node:fs";
      import { createRequire } from "node:module";
      const { policyBundleSchema } = await import(
        ${JSON.stringify(loaderUrl)} + "?captured-zod-resolution"
      );
      const raw = JSON.parse(
        readFileSync(${JSON.stringify(BUNDLE_PATH)}, "utf8")
      );
      const require = createRequire(import.meta.url);
      const moduleApi = require("node:module");
      const descriptor = Object.getOwnPropertyDescriptor(
        moduleApi,
        "_resolveFilename",
      );
      if (!descriptor || !("value" in descriptor)) {
        throw new Error("CJS_RESOLVER_MISSING");
      }
      const original = descriptor.value;
      let forgedResolverCalls = 0;
      let rawError = null;
      let success;
      Object.defineProperty(moduleApi, "_resolveFilename", {
        ...descriptor,
        value: function (request, ...args) {
          if (request === "zod" || request === "zod/package.json") {
            forgedResolverCalls += 1;
            throw new Error("HOSTILE_CJS_RESOLVER_RAN");
          }
          return Reflect.apply(original, this, [request, ...args]);
        },
      });
      try {
        success = policyBundleSchema.safeParse(raw).success;
      } catch (error) {
        rawError = error instanceof Error ? error.message : String(error);
      } finally {
        Object.defineProperty(moduleApi, "_resolveFilename", descriptor);
      }
      process.stdout.write(JSON.stringify({
        forgedResolverCalls,
        rawError,
        success,
      }));
    `;
    const outcome = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: repositoryRoot, encoding: "utf8" },
    );

    expect(outcome.status, `${outcome.stdout}${outcome.stderr}`).toBe(0);
    expect(JSON.parse(outcome.stdout)).toEqual({
      forgedResolverCalls: 0,
      rawError: null,
      success: true,
    });
  });

  it("does not run a live fileURLToPath callback after policy initialization", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const loaderUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/loader.ts"),
    ).href;
    const custodianUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/custodian.ts"),
    ).href;
    const canonicalUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/canonical.ts"),
    ).href;
    const script = `
      import { readFileSync } from "node:fs";
      import { createRequire, syncBuiltinESMExports } from "node:module";
      await import(${JSON.stringify(loaderUrl)});
      const { repin } = await import(${JSON.stringify(custodianUrl)});
      const { bundleHash } = await import(${JSON.stringify(canonicalUrl)});
      const bundle = JSON.parse(
        readFileSync(${JSON.stringify(BUNDLE_PATH)}, "utf8")
      );
      const armed = { ...bundle, quick_arm: "ON" };
      const environment = { OBS_POLICY_CUSTODIAN_TOKEN: "correct" };
      const require = createRequire(import.meta.url);
      const urlApi = require("node:url");
      const descriptor = Object.getOwnPropertyDescriptor(
        urlApi,
        "fileURLToPath",
      );
      if (
        !descriptor ||
        !("value" in descriptor) ||
        typeof descriptor.value !== "function"
      ) {
        throw new Error("FILE_URL_TO_PATH_MISSING");
      }
      const original = descriptor.value;
      let callbackCalls = 0;
      let escaped = null;
      let repinError = null;
      let repinned;
      try {
        Object.defineProperty(urlApi, "fileURLToPath", {
          ...descriptor,
          value: function (...args) {
            callbackCalls += 1;
            environment.OBS_POLICY_CUSTODIAN_TOKEN = "wrong";
            Object.defineProperty(urlApi, "fileURLToPath", descriptor);
            syncBuiltinESMExports();
            return Reflect.apply(original, this, args);
          },
        });
        syncBuiltinESMExports();
        try {
          repinned = repin(bundle, {
            token: "wrong",
            next_bundle: armed,
          }, environment);
        } catch (error) {
          repinError = error instanceof Error
            ? { code: error.code, message: error.message, name: error.name }
            : { code: null, message: String(error), name: typeof error };
        }
      } catch (error) {
        escaped = error instanceof Error ? error.message : String(error);
      } finally {
        Object.defineProperty(urlApi, "fileURLToPath", descriptor);
        syncBuiltinESMExports();
      }
      const restored = Object.getOwnPropertyDescriptor(
        urlApi,
        "fileURLToPath",
      );
      process.stdout.write(JSON.stringify({
        callbackCalls,
        descriptorRestored:
          restored?.configurable === descriptor.configurable &&
          restored?.enumerable === descriptor.enumerable &&
          restored?.value === descriptor.value &&
          restored?.writable === descriptor.writable,
        environment: environment.OBS_POLICY_CUSTODIAN_TOKEN,
        escaped,
        hash: bundleHash(bundle),
        quickArm: repinned?.quick_arm ?? null,
        refused: repinError?.code === "REPIN_REFUSED",
      }));
    `;
    const outcome = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: repositoryRoot, encoding: "utf8" },
    );

    expect(outcome.status, `${outcome.stdout}${outcome.stderr}`).toBe(0);
    expect(JSON.parse(outcome.stdout)).toEqual({
      callbackCalls: 0,
      descriptorRestored: true,
      environment: "correct",
      escaped: null,
      hash: "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
      quickArm: null,
      refused: true,
    });
  });

  it("does not run a live descriptor callback after policy initialization", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const loaderUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/loader.ts"),
    ).href;
    const custodianUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/custodian.ts"),
    ).href;
    const canonicalUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/canonical.ts"),
    ).href;
    const script = `
      import { readFileSync } from "node:fs";
      await import(${JSON.stringify(loaderUrl)});
      const { repin } = await import(${JSON.stringify(custodianUrl)});
      const { bundleHash } = await import(${JSON.stringify(canonicalUrl)});
      const bundle = JSON.parse(
        readFileSync(${JSON.stringify(BUNDLE_PATH)}, "utf8")
      );
      const armed = { ...bundle, quick_arm: "ON" };
      const environment = { OBS_POLICY_CUSTODIAN_TOKEN: "correct" };
      const descriptor = Object.getOwnPropertyDescriptor(
        Object,
        "getOwnPropertyDescriptor",
      );
      if (
        !descriptor ||
        !("value" in descriptor) ||
        typeof descriptor.value !== "function"
      ) {
        throw new Error("GET_OWN_PROPERTY_DESCRIPTOR_MISSING");
      }
      const original = descriptor.value;
      let callbackCalls = 0;
      let escaped = null;
      let repinError = null;
      let repinned;
      let hash;
      try {
        Object.defineProperty(Object, "getOwnPropertyDescriptor", {
          ...descriptor,
          value: function (...args) {
            callbackCalls += 1;
            environment.OBS_POLICY_CUSTODIAN_TOKEN = "wrong";
            Object.defineProperty(
              Object,
              "getOwnPropertyDescriptor",
              descriptor,
            );
            return Reflect.apply(original, this, args);
          },
        });
        try {
          repinned = repin(bundle, {
            token: "wrong",
            next_bundle: armed,
          }, environment);
        } catch (error) {
          repinError = error instanceof Error
            ? { code: error.code, message: error.message, name: error.name }
            : { code: null, message: String(error), name: typeof error };
        }
        hash = bundleHash(bundle);
      } catch (error) {
        escaped = error instanceof Error ? error.message : String(error);
      } finally {
        Object.defineProperty(
          Object,
          "getOwnPropertyDescriptor",
          descriptor,
        );
      }
      const restored = Reflect.apply(original, Object, [
        Object,
        "getOwnPropertyDescriptor",
      ]);
      process.stdout.write(JSON.stringify({
        callbackCalls,
        descriptorRestored:
          restored?.configurable === descriptor.configurable &&
          restored?.enumerable === descriptor.enumerable &&
          restored?.value === descriptor.value &&
          restored?.writable === descriptor.writable,
        environment: environment.OBS_POLICY_CUSTODIAN_TOKEN,
        escaped,
        hash,
        quickArm: repinned?.quick_arm ?? null,
        refused: repinError?.code === "REPIN_REFUSED",
      }));
    `;
    const outcome = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: repositoryRoot, encoding: "utf8" },
    );

    expect(outcome.status, `${outcome.stdout}${outcome.stderr}`).toBe(0);
    expect(JSON.parse(outcome.stdout)).toEqual({
      callbackCalls: 0,
      descriptorRestored: true,
      environment: "correct",
      escaped: null,
      hash: "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
      quickArm: null,
      refused: true,
    });
  });

  it("does not trust live Atomics results as declared-schema authority", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    const codeRegistry = raw.code_registry_seed as Record<string, unknown>;
    const scopePin = codeRegistry.scope_file_list as Record<string, unknown>;
    scopePin.count = Number.MAX_SAFE_INTEGER + 1;
    const waitDescriptor = Object.getOwnPropertyDescriptor(Atomics, "wait");
    const loadDescriptor = Object.getOwnPropertyDescriptor(Atomics, "load");
    if (waitDescriptor === undefined || loadDescriptor === undefined) {
      throw new Error("ATOMICS_AUTHORITY_MEMBER_MISSING");
    }
    let waitCalls = 0;
    let loadCalls = 0;
    let result: ReturnType<typeof policyBundleSchema.safeParse> | undefined;
    let escaped: unknown;

    try {
      Object.defineProperty(Atomics, "wait", {
        ...waitDescriptor,
        value() {
          waitCalls += 1;
          return "ok";
        },
      });
      Object.defineProperty(Atomics, "load", {
        ...loadDescriptor,
        value() {
          loadCalls += 1;
          return 2;
        },
      });
      try {
        result = policyBundleSchema.safeParse(raw);
      } catch (error) {
        escaped = error;
      }
    } finally {
      Object.defineProperty(Atomics, "wait", waitDescriptor);
      Object.defineProperty(Atomics, "load", loadDescriptor);
    }

    expect(escaped).toBeUndefined();
    expect(result?.success).toBe(false);
    expect(waitCalls).toBe(0);
    expect(loadCalls).toBe(0);
  });

  it("does not construct a live Worker for declared-schema authority", () => {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const loaderUrl = pathToFileURL(
      resolve(repositoryRoot, "tools/obs-listener/policy/loader.ts"),
    ).href;
    const script = `
      import { readFileSync } from "node:fs";
      import { createRequire, syncBuiltinESMExports } from "node:module";
      const require = createRequire(import.meta.url);
      const workerThreads = require("node:worker_threads");
      const descriptor = Object.getOwnPropertyDescriptor(workerThreads, "Worker");
      if (!descriptor || !("value" in descriptor)) {
        throw new Error("WORKER_AUTHORITY_MEMBER_MISSING");
      }
      let constructorCalls = 0;
      let rawError = null;
      let success;
      Object.defineProperty(workerThreads, "Worker", {
        ...descriptor,
        value: function HostileWorker() {
          constructorCalls += 1;
          throw new Error("HOSTILE_WORKER_CONSTRUCTED");
        },
      });
      syncBuiltinESMExports();
      try {
        const { policyBundleSchema } = await import(
          ${JSON.stringify(loaderUrl)} + "?worker-independent-zod"
        );
        const raw = JSON.parse(
          readFileSync(${JSON.stringify(BUNDLE_PATH)}, "utf8")
        );
        success = policyBundleSchema.safeParse(raw).success;
      } catch (error) {
        rawError = error instanceof Error ? error.message : String(error);
      } finally {
        Object.defineProperty(workerThreads, "Worker", descriptor);
        syncBuiltinESMExports();
      }
      process.stdout.write(JSON.stringify({
        constructorCalls,
        rawError,
        success,
      }));
    `;
    const outcome = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      { cwd: repositoryRoot, encoding: "utf8" },
    );

    expect(outcome.status, `${outcome.stdout}${outcome.stderr}`).toBe(0);
    expect(JSON.parse(outcome.stdout)).toEqual({
      constructorCalls: 0,
      rawError: null,
      success: true,
    });
  });

  it("keeps main-realm regex and push callbacks outside Zod validation", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));
    const pushDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "push",
    );
    const testDescriptor = Object.getOwnPropertyDescriptor(
      RegExp.prototype,
      "test",
    );
    if (
      pushDescriptor === undefined ||
      !Object.hasOwn(pushDescriptor, "value") ||
      typeof pushDescriptor.value !== "function" ||
      testDescriptor === undefined ||
      !Object.hasOwn(testDescriptor, "value") ||
      typeof testDescriptor.value !== "function"
    ) {
      throw new Error("NATIVE_VALIDATION_MEMBER_MISSING");
    }
    const nativePush = pushDescriptor.value as (...values: unknown[]) => number;
    const nativeTest = testDescriptor.value as (
      this: RegExp,
      value: string,
    ) => boolean;
    let testCalls = 0;
    let changedPushCalls = 0;
    let result: ReturnType<typeof policyBundleSchema.safeParse> | undefined;
    let escaped: unknown;

    try {
      Object.defineProperty(RegExp.prototype, "test", {
        configurable: true,
        value(this: RegExp, value: string) {
          testCalls += 1;
          if (testCalls === 1) {
            Object.defineProperty(Array.prototype, "push", {
              configurable: true,
              value(this: unknown[], ...values: unknown[]) {
                changedPushCalls += 1;
                return Reflect.apply(nativePush, this, values);
              },
              writable: true,
            });
          }
          return Reflect.apply(nativeTest, this, [value]);
        },
        writable: true,
      });
      try {
        result = policyBundleSchema.safeParse(raw);
      } catch (error) {
        escaped = error;
      }
    } finally {
      Object.defineProperty(RegExp.prototype, "test", testDescriptor);
      Object.defineProperty(Array.prototype, "push", pushDescriptor);
    }

    expect(escaped).toBeUndefined();
    expect(testCalls).toBe(0);
    expect(changedPushCalls).toBe(0);
    expect(result?.success).toBe(true);
    expect(policyBundleSchema.safeParse(raw).success).toBe(true);
  });

  it("isolates self-restoring Zod callbacks from hashing and token authority", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const armed = { ...bundle, quick_arm: "ON" as const };
    const pushDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "push",
    );
    const testDescriptor = Object.getOwnPropertyDescriptor(
      RegExp.prototype,
      "test",
    );
    const require = createRequire(import.meta.url);
    const crypto = require("node:crypto") as {
      hash: (
        algorithm: string,
        data: string | NodeJS.ArrayBufferView,
        outputEncoding?: "buffer" | "hex",
      ) => Buffer | string;
    };
    const hashDescriptor = Object.getOwnPropertyDescriptor(crypto, "hash");
    if (
      pushDescriptor === undefined ||
      !Object.hasOwn(pushDescriptor, "value") ||
      typeof pushDescriptor.value !== "function" ||
      testDescriptor === undefined ||
      !Object.hasOwn(testDescriptor, "value") ||
      typeof testDescriptor.value !== "function" ||
      hashDescriptor === undefined ||
      !Object.hasOwn(hashDescriptor, "value") ||
      typeof hashDescriptor.value !== "function"
    ) {
      throw new Error("NATIVE_AUTHORITY_MEMBER_MISSING");
    }
    const nativePush = pushDescriptor.value as (...values: unknown[]) => number;
    const nativeTest = testDescriptor.value as (
      this: RegExp,
      value: string,
    ) => boolean;
    let regexpCalls = 0;
    let hostilePushCalls = 0;
    let forgedHashCalls = 0;
    let repinError: unknown;
    let repinned: PolicyBundle | undefined;
    let hash: string | undefined;
    let escaped: unknown;
    let pushDuringAttack: PropertyDescriptor | undefined;

    try {
      Object.defineProperty(RegExp.prototype, "test", {
        configurable: true,
        value(this: RegExp, value: string) {
          regexpCalls += 1;
          if (regexpCalls === 1) {
            Object.defineProperty(Array.prototype, "push", {
              configurable: true,
              value(this: unknown[], ...values: unknown[]) {
                hostilePushCalls += 1;
                Object.defineProperty(crypto, "hash", {
                  ...hashDescriptor,
                  value(
                    _algorithm: string,
                    _data: string | NodeJS.ArrayBufferView,
                    outputEncoding?: "buffer" | "hex",
                  ) {
                    forgedHashCalls += 1;
                    return outputEncoding === "hex"
                      ? "0".repeat(64)
                      : Buffer.alloc(32);
                  },
                });
                syncBuiltinESMExports();
                Object.defineProperty(
                  Array.prototype,
                  "push",
                  pushDescriptor,
                );
                return Reflect.apply(nativePush, this, values);
              },
              writable: true,
            });
          }
          return Reflect.apply(nativeTest, this, [value]);
        },
        writable: true,
      });
      try {
        repinned = repin(bundle, {
          token: "wrong",
          next_bundle: armed,
        }, {
          OBS_POLICY_CUSTODIAN_TOKEN: "correct",
        });
      } catch (error) {
        repinError = error;
      }
      hash = bundleHash(bundle);
      pushDuringAttack = Object.getOwnPropertyDescriptor(
        Array.prototype,
        "push",
      );
    } catch (error) {
      escaped = error;
    } finally {
      Object.defineProperty(RegExp.prototype, "test", testDescriptor);
      Object.defineProperty(Array.prototype, "push", pushDescriptor);
      Object.defineProperty(crypto, "hash", hashDescriptor);
      syncBuiltinESMExports();
    }

    expect(escaped).toBeUndefined();
    expect(regexpCalls).toBe(0);
    expect(hostilePushCalls).toBe(0);
    expect(forgedHashCalls).toBe(0);
    expect(repinError).toBeInstanceOf(RepinRefusedError);
    expect(repinned).toBeUndefined();
    expect(hash).toBe(
      "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
    );
    expect(pushDuringAttack).toEqual(pushDescriptor);
    expect(Object.getOwnPropertyDescriptor(Array.prototype, "push")).toEqual(
      pushDescriptor,
    );
    expect(Object.getOwnPropertyDescriptor(RegExp.prototype, "test")).toEqual(
      testDescriptor,
    );
    expect(Object.getOwnPropertyDescriptor(crypto, "hash")).toEqual(
      hashDescriptor,
    );
    expect(bundleHash(bundle)).toBe(
      "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
    );
    expect(
      repin(bundle, { token: "correct" }, {
        OBS_POLICY_CUSTODIAN_TOKEN: "correct",
      }).quick_arm,
    ).toBe("OFF");
  });

  it("keeps authority on captured crypto calls after builtin export synchronization", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const armed = { ...bundle, quick_arm: "ON" as const };
    const require = createRequire(import.meta.url);
    const crypto = require("node:crypto") as {
      hash: (
        algorithm: string,
        data: string | NodeJS.ArrayBufferView,
        outputEncoding?: "buffer" | "hex",
      ) => Buffer | string;
      timingSafeEqual: (
        left: NodeJS.ArrayBufferView,
        right: NodeJS.ArrayBufferView,
      ) => boolean;
    };
    const hashDescriptor = Object.getOwnPropertyDescriptor(crypto, "hash");
    const equalDescriptor = Object.getOwnPropertyDescriptor(
      crypto,
      "timingSafeEqual",
    );
    if (
      hashDescriptor === undefined ||
      !Object.hasOwn(hashDescriptor, "value") ||
      typeof hashDescriptor.value !== "function" ||
      equalDescriptor === undefined ||
      !Object.hasOwn(equalDescriptor, "value") ||
      typeof equalDescriptor.value !== "function"
    ) {
      throw new Error("NATIVE_CRYPTO_EXPORT_MISSING");
    }
    let forgedHashCalls = 0;
    let forgedEqualCalls = 0;
    let hash: string | undefined;
    let repinError: unknown;
    let repinned: PolicyBundle | undefined;

    try {
      Object.defineProperty(crypto, "hash", {
        ...hashDescriptor,
        value(
          _algorithm: string,
          _data: string | NodeJS.ArrayBufferView,
          outputEncoding?: "buffer" | "hex",
        ) {
          forgedHashCalls += 1;
          return outputEncoding === "hex"
            ? "0".repeat(64)
            : Buffer.alloc(32);
        },
      });
      Object.defineProperty(crypto, "timingSafeEqual", {
        ...equalDescriptor,
        value() {
          forgedEqualCalls += 1;
          return true;
        },
      });
      syncBuiltinESMExports();

      hash = bundleHash(bundle);
      try {
        repinned = repin(bundle, {
          token: "wrong",
          next_bundle: armed,
        }, {
          OBS_POLICY_CUSTODIAN_TOKEN: "correct",
        });
      } catch (error) {
        repinError = error;
      }
    } finally {
      Object.defineProperty(crypto, "hash", hashDescriptor);
      Object.defineProperty(crypto, "timingSafeEqual", equalDescriptor);
      syncBuiltinESMExports();
    }

    expect(forgedHashCalls).toBe(0);
    expect(forgedEqualCalls).toBe(0);
    expect(hash).toBe(
      "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
    );
    expect(repinError).toBeInstanceOf(RepinRefusedError);
    expect(repinned).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(crypto, "hash")).toEqual(
      hashDescriptor,
    );
    expect(
      Object.getOwnPropertyDescriptor(crypto, "timingSafeEqual"),
    ).toEqual(equalDescriptor);
    expect(bundleHash(bundle)).toBe(
      "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
    );
  });

  it("keeps proxy rejection on the captured builtin after export synchronization", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const armed = { ...bundle, quick_arm: "ON" as const };
    const environment = { OBS_POLICY_CUSTODIAN_TOKEN: "correct" };
    const require = createRequire(import.meta.url);
    const utilTypes = require("node:util/types") as {
      isProxy: (value: unknown) => boolean;
    };
    const isProxyDescriptor = Object.getOwnPropertyDescriptor(
      utilTypes,
      "isProxy",
    );
    if (
      isProxyDescriptor === undefined ||
      !Object.hasOwn(isProxyDescriptor, "value") ||
      typeof isProxyDescriptor.value !== "function"
    ) {
      throw new Error("NATIVE_IS_PROXY_EXPORT_MISSING");
    }
    let trapCalls = 0;
    let forgedIsProxyCalls = 0;
    const hostileCurrent = new Proxy(bundle, {
      ownKeys(target) {
        trapCalls += 1;
        environment.OBS_POLICY_CUSTODIAN_TOKEN = "wrong";
        return Reflect.ownKeys(target);
      },
    });
    let repinError: unknown;
    let repinned: PolicyBundle | undefined;
    let escaped: unknown;

    try {
      Object.defineProperty(utilTypes, "isProxy", {
        ...isProxyDescriptor,
        value() {
          forgedIsProxyCalls += 1;
          return false;
        },
      });
      syncBuiltinESMExports();
      try {
        repinned = repin(hostileCurrent, {
          token: "wrong",
          next_bundle: armed,
        }, environment);
      } catch (error) {
        repinError = error;
      }
    } catch (error) {
      escaped = error;
    } finally {
      Object.defineProperty(utilTypes, "isProxy", isProxyDescriptor);
      syncBuiltinESMExports();
    }

    expect(escaped).toBeUndefined();
    expect(repinError).toBeInstanceOf(RepinRefusedError);
    expect(repinned).toBeUndefined();
    expect(trapCalls).toBe(0);
    expect(forgedIsProxyCalls).toBe(0);
    expect(environment.OBS_POLICY_CUSTODIAN_TOKEN).toBe("correct");
    expect(Object.getOwnPropertyDescriptor(utilTypes, "isProxy")).toEqual(
      isProxyDescriptor,
    );
    expect(bundleHash(bundle)).toBe(
      "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
    );
  });

  it("keeps custodian proxy checks on the captured builtin", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const armed = { ...bundle, quick_arm: "ON" as const };
    const require = createRequire(import.meta.url);
    const utilTypes = require("node:util/types") as {
      isProxy: (value: unknown) => boolean;
    };
    const isProxyDescriptor = Object.getOwnPropertyDescriptor(
      utilTypes,
      "isProxy",
    );
    if (
      isProxyDescriptor === undefined ||
      !Object.hasOwn(isProxyDescriptor, "value") ||
      typeof isProxyDescriptor.value !== "function"
    ) {
      throw new Error("NATIVE_IS_PROXY_EXPORT_MISSING");
    }
    let trapCalls = 0;
    let forgedIsProxyCalls = 0;
    const hostileRequest = new Proxy({
      token: "wrong",
      next_bundle: armed,
    }, {
      getOwnPropertyDescriptor(target, key) {
        trapCalls += 1;
        if (key === "token") {
          return {
            configurable: true,
            enumerable: true,
            value: "correct",
            writable: true,
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    let repinError: unknown;
    let repinned: PolicyBundle | undefined;

    try {
      Object.defineProperty(utilTypes, "isProxy", {
        ...isProxyDescriptor,
        value() {
          forgedIsProxyCalls += 1;
          return false;
        },
      });
      syncBuiltinESMExports();
      try {
        repinned = repin(bundle, hostileRequest, {
          OBS_POLICY_CUSTODIAN_TOKEN: "correct",
        });
      } catch (error) {
        repinError = error;
      }
    } finally {
      Object.defineProperty(utilTypes, "isProxy", isProxyDescriptor);
      syncBuiltinESMExports();
    }

    expect(repinError).toBeInstanceOf(RepinRefusedError);
    expect(repinned).toBeUndefined();
    expect(trapCalls).toBe(0);
    expect(forgedIsProxyCalls).toBe(0);
    expect(Object.getOwnPropertyDescriptor(utilTypes, "isProxy")).toEqual(
      isProxyDescriptor,
    );
  });

  it("keeps bundle reads on the captured builtin after export synchronization", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    raw.quick_arm = "ON";
    const require = createRequire(import.meta.url);
    const fs = require("node:fs") as {
      readFileSync: (path: string, encoding: "utf8") => string;
    };
    const readDescriptor = Object.getOwnPropertyDescriptor(fs, "readFileSync");
    if (
      readDescriptor === undefined ||
      !Object.hasOwn(readDescriptor, "value") ||
      typeof readDescriptor.value !== "function"
    ) {
      throw new Error("NATIVE_READ_FILE_SYNC_EXPORT_MISSING");
    }
    let forgedReadCalls = 0;
    let loaded: PolicyBundle | undefined;

    try {
      Object.defineProperty(fs, "readFileSync", {
        ...readDescriptor,
        value() {
          forgedReadCalls += 1;
          return JSON.stringify(raw);
        },
      });
      syncBuiltinESMExports();
      loaded = loadBundle(BUNDLE_PATH);
    } finally {
      Object.defineProperty(fs, "readFileSync", readDescriptor);
      syncBuiltinESMExports();
    }

    expect(forgedReadCalls).toBe(0);
    expect(loaded?.quick_arm).toBe("OFF");
    expect(Object.getOwnPropertyDescriptor(fs, "readFileSync")).toEqual(
      readDescriptor,
    );
  });

  it("does not overreach to an unreachable Object.prototype.push neighbour", () => {
    const raw = JSON.parse(readFileSync(BUNDLE_PATH, "utf8"));
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "push");
    let getterCalls = 0;
    let functionCalls = 0;
    let result: ReturnType<typeof policyBundleSchema.safeParse> | undefined;
    let escaped: unknown;
    try {
      Object.defineProperty(Object.prototype, "push", {
        configurable: true,
        get() {
          getterCalls += 1;
          return () => {
            functionCalls += 1;
            return 0;
          };
        },
      });
      try {
        result = policyBundleSchema.safeParse(raw);
      } catch (error) {
        escaped = error;
      }
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(Object.prototype, "push");
      } else {
        Object.defineProperty(Object.prototype, "push", previous);
      }
    }

    expect(escaped).toBeUndefined();
    expect(result?.success).toBe(true);
    expect(getterCalls).toBe(0);
    expect(functionCalls).toBe(0);
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

  it("never dispatches inherited array helpers or iterators across C1 authority", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    const owners = ["OBJECT", "ARRAY"] as const;
    const members = ["some", "sort", Symbol.iterator] as const;
    const variants = [
      "GETTER_FUNCTION",
      "DATA_FUNCTION",
      "THROWING_GETTER",
      "NON_FUNCTION",
    ] as const;
    const expectedDenied = FROZEN_FLOOR_SAMPLES.map(() => true);
    const expectedAllowed = FLOOR_SAFE_NEIGHBORS.map(() => false);

    for (let ownerIndex = 0; ownerIndex < owners.length; ownerIndex += 1) {
      const owner = owners[ownerIndex];
      if (owner === undefined) throw new Error("MISSING_OWNER");
      for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
        const member = members[memberIndex];
        if (member === undefined) throw new Error("MISSING_MEMBER");
        for (
          let variantIndex = 0;
          variantIndex < variants.length;
          variantIndex += 1
        ) {
          const variant = variants[variantIndex];
          if (variant === undefined) throw new Error("MISSING_VARIANT");
          let getterCalls = 0;
          let functionCalls = 0;
          const hostileFunction = () => {
            functionCalls += 1;
            if (member === "some") return false;
            if (member === "sort") return [];
            return { next: () => ({ done: true }) };
          };
          let descriptor: PropertyDescriptor;
          if (variant === "GETTER_FUNCTION") {
            descriptor = {
              configurable: true,
              get() {
                getterCalls += 1;
                return hostileFunction;
              },
            };
          } else if (variant === "DATA_FUNCTION") {
            descriptor = {
              configurable: true,
              value: hostileFunction,
              writable: true,
            };
          } else if (variant === "THROWING_GETTER") {
            descriptor = {
              configurable: true,
              get() {
                getterCalls += 1;
                throw new Error("INHERITED_ARRAY_MEMBER_RAN");
              },
            };
          } else {
            descriptor = {
              configurable: true,
              value: "NOT_CALLABLE",
              writable: true,
            };
          }
          const label = `${owner}:${String(member)}:${variant}`;
          const outcome = withInheritedArrayMember(
            owner,
            member,
            descriptor,
            () => {
              const hash = bundleHash(bundle);
              let loadError: unknown;
              let repinError: unknown;
              try {
                loadBundle(BUNDLE_PATH);
              } catch (error) {
                loadError = error;
              }
              try {
                repin(bundle, {
                  token: "fixture-custodian-token",
                }, {
                  OBS_POLICY_CUSTODIAN_TOKEN: "fixture-custodian-token",
                });
              } catch (error) {
                repinError = error;
              }
              const denied = new Array<boolean>(FROZEN_FLOOR_SAMPLES.length);
              for (
                let index = 0;
                index < FROZEN_FLOOR_SAMPLES.length;
                index += 1
              ) {
                Object.defineProperty(denied, String(index), {
                  configurable: true,
                  enumerable: true,
                  value: isFloorDenied(
                    bundle,
                    FROZEN_FLOOR_SAMPLES[index] as string,
                  ),
                  writable: true,
                });
              }
              const allowed = new Array<boolean>(FLOOR_SAFE_NEIGHBORS.length);
              for (
                let index = 0;
                index < FLOOR_SAFE_NEIGHBORS.length;
                index += 1
              ) {
                Object.defineProperty(allowed, String(index), {
                  configurable: true,
                  enumerable: true,
                  value: isFloorDenied(
                    bundle,
                    FLOOR_SAFE_NEIGHBORS[index] as string,
                  ),
                  writable: true,
                });
              }
              return {
                allowed,
                denied,
                hash,
                loadError,
                repinError,
              };
            },
          );

          expect.soft(outcome.success, label).toBe(true);
          expect.soft(getterCalls, label).toBe(0);
          expect.soft(functionCalls, label).toBe(0);
          if (outcome.success) {
            expect.soft(outcome.value.hash, label).toBe(
              "aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
            );
            expect.soft(outcome.value.loadError, label).toBeInstanceOf(
              PolicyBundleLoadError,
            );
            expect.soft(outcome.value.repinError, label).toBeInstanceOf(
              RepinRefusedError,
            );
            expect.soft(outcome.value.denied, label).toEqual(expectedDenied);
            expect.soft(outcome.value.allowed, label).toEqual(expectedAllowed);
          }
        }
      }
    }
  });

  it("denies every enumerated floor sample without swallowing a neighbouring product path", () => {
    const bundle = loadBundle(BUNDLE_PATH);
    expect(
      FROZEN_FLOOR_SAMPLES.map((path) => isFloorDenied(bundle, path)),
    ).toEqual(
      FROZEN_FLOOR_SAMPLES.map(() => true),
    );
    expect(
      FLOOR_SAFE_NEIGHBORS.map((path) => isFloorDenied(bundle, path)),
    ).toEqual(FLOOR_SAFE_NEIGHBORS.map(() => false));
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
