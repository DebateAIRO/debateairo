import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TypedDomainError } from "@debateai/kernel";
import { describe, expect, it, vi } from "vitest";

import {
  createCaptureEmitter,
  type CaptureQueueEntry,
} from "../../packages/obs-capture/src/emit.js";
import {
  createCaptureGapCounter,
  createCaptureHealth,
} from "../../packages/obs-capture/src/health.js";
import * as envelopeContract from "../../packages/obs-capture/src/envelope-contract.js";
import {
  createSharedRedactor,
  type PostRedactionEnvelope,
} from "../../packages/obs-capture/src/redactor.js";

const WRAPPER_CODE = "OBS_SCHEDULER_JOB_FAILED";
const DATABASE_CODE = "DATABASE_POOL_FAILED";
const DRIVER_CODE = "3D000";
const UNAVAILABLE_CODE = "CAUSE_CODE_UNAVAILABLE";
const PARENT_SENTINEL = "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED";
const { isSerializedSafeEnvelope } = envelopeContract;

type SerializedNormalizer = (
  value: unknown,
  runtime: PostRedactionEnvelope["runtime"],
) => PostRedactionEnvelope | undefined;

type SnapshotEntry = CaptureQueueEntry & Readonly<{
  cause_chain_codes_ref?: readonly string[];
}>;

function recordingEmitter(): Readonly<{
  emitter: ReturnType<typeof createCaptureEmitter>;
  offered: SnapshotEntry[];
}> {
  const health = createCaptureHealth();
  const gaps = createCaptureGapCounter({ health });
  const offered: SnapshotEntry[] = [];
  const emitter = createCaptureEmitter({
    queue: Object.freeze({
      offer(entry: CaptureQueueEntry): boolean {
        offered.push(entry as SnapshotEntry);
        return true;
      },
    }),
    health,
    gaps,
  });
  return Object.freeze({ emitter, offered });
}

function databaseFailure(cause: unknown): TypedDomainError {
  return new TypedDomainError(
    DATABASE_CODE,
    "PostgreSQL pool operation failed",
    { cause },
  );
}

function driverFailure(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    code: DRIVER_CODE,
    message: "no_such_database_FIX02_C3_SECRET",
    stack: "postgres://writer:planted-password@localhost/private",
  });
}

function schedulerEnvelope(error: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze({
    code: WRAPPER_CODE,
    template_parameters: Object.freeze({ job: "replay-self-test" }),
    error,
  });
}

function redactor() {
  return createSharedRedactor({
    environment: "test",
    build_ref: "UNTRACKED-DEV:fix02-c3:test",
    build_dirty: true,
    runtime: "scheduler",
    component: Object.freeze({
      process: "scheduler",
      package: "@debateai/scheduler",
    }),
    writer_identity: "fix02-c3-test",
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
    now: () => new Date("2026-09-04T00:00:00.000Z"),
    sourceEventRef: () => "00000000-0000-4000-8000-000000000203",
  });
}

function serializedNormalizer(): SerializedNormalizer | undefined {
  const candidate = Reflect.get(
    envelopeContract,
    "normalizeSerializedSafeEnvelope",
  ) as unknown;
  return typeof candidate === "function"
    ? candidate as SerializedNormalizer
    : undefined;
}

function serializedSelfEnvelope(): Record<string, unknown> {
  const envelope = redactor().redact({
    kind: "envelope",
    payload_ref: Object.freeze({
      code: "OBS_CAPTURE_SELF",
      taxonomy_class: "CAPTURE_SELF",
      capture_point: "self",
      disposition: "SELF",
      source: "first_party",
    }),
    ambient_context_ref: undefined,
  });
  return JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>;
}

function emittedSnapshot(error: unknown): readonly string[] | undefined {
  const target = recordingEmitter();
  target.emitter.emit(schedulerEnvelope(error));
  return target.offered[0]?.cause_chain_codes_ref;
}

describe("FIX-02 C3 calling-thread cause snapshot", () => {
  it("records the scheduler, database, and driver codes before queue admission", () => {
    const target = recordingEmitter();
    const envelope = schedulerEnvelope(databaseFailure(driverFailure()));
    let offeredSnapshot: readonly string[] | undefined;
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    const emitter = createCaptureEmitter({
      queue: Object.freeze({
        offer(entry: CaptureQueueEntry): boolean {
          offeredSnapshot = (entry as SnapshotEntry).cause_chain_codes_ref;
          return true;
        },
      }),
      health,
      gaps,
    });

    emitter.emit(envelope);

    expect(offeredSnapshot).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "DATABASE_POOL_FAILED",
      "3D000",
    ]);
    expect(Object.isFrozen(offeredSnapshot)).toBe(true);
    expect(target.offered).toEqual([]);
  });

  it("records the database wrapper and driver code for captureHandled", () => {
    const target = recordingEmitter();

    target.emitter.captureHandled(
      databaseFailure(driverFailure()),
      Object.freeze({ source: "database_pool", code: DATABASE_CODE }),
    );

    expect(target.offered[0]?.cause_chain_codes_ref).toEqual([
      "DATABASE_POOL_FAILED",
      "3D000",
    ]);
    expect(Object.isFrozen(target.offered[0]?.cause_chain_codes_ref)).toBe(true);
  });

  it("keeps a one-code handled snapshot for primary-code redaction", () => {
    const target = recordingEmitter();

    target.emitter.captureHandled(
      Object.freeze({ code: DATABASE_CODE }),
      Object.freeze({ runtime: "evaluator_lib" }),
    );

    expect(target.offered[0]?.cause_chain_codes_ref).toEqual([
      "DATABASE_POOL_FAILED",
    ]);
    expect(Object.isFrozen(target.offered[0]?.cause_chain_codes_ref)).toBe(true);
  });

  it("snapshots before later mutation of error codes and cause links", () => {
    const inner = { code: DRIVER_CODE };
    const outer = { code: DATABASE_CODE, cause: inner };
    const target = recordingEmitter();

    target.emitter.emit(schedulerEnvelope(outer));
    inner.code = "ECONNRESET";
    outer.code = "OBS_CAPTURE_SELF";
    outer.cause = { code: "OBS_CAPTURE_SELF" };

    expect(target.offered[0]?.cause_chain_codes_ref).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "DATABASE_POOL_FAILED",
      "3D000",
    ]);
  });

  it("never invokes code, cause, message, or stack getters", () => {
    const codeGetter = vi.fn(() => DRIVER_CODE);
    const causeGetter = vi.fn(() => driverFailure());
    const messageGetter = vi.fn(() => "PLANTED_MESSAGE_SECRET");
    const stackGetter = vi.fn(() => "PLANTED_STACK_SECRET");
    const codeAccessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(codeAccessor, {
      code: { configurable: true, enumerable: true, get: codeGetter },
      cause: { configurable: true, enumerable: true, get: causeGetter },
      message: { configurable: true, enumerable: true, get: messageGetter },
      stack: { configurable: true, enumerable: true, get: stackGetter },
    });

    expect(emittedSnapshot(codeAccessor)).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "CAUSE_CODE_UNAVAILABLE",
    ]);
    expect(codeGetter).not.toHaveBeenCalled();
    expect(causeGetter).not.toHaveBeenCalled();
    expect(messageGetter).not.toHaveBeenCalled();
    expect(stackGetter).not.toHaveBeenCalled();
  });

  it("never invokes wrapper error or handled-context code accessors", () => {
    const errorGetter = vi.fn(() => databaseFailure(driverFailure()));
    const contextCodeGetter = vi.fn(() => WRAPPER_CODE);
    const emitted = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(emitted, {
      code: {
        configurable: true,
        enumerable: true,
        writable: false,
        value: WRAPPER_CODE,
      },
      error: {
        configurable: true,
        enumerable: true,
        get: errorGetter,
      },
    });
    const context = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(context, "code", {
      configurable: true,
      enumerable: true,
      get: contextCodeGetter,
    });
    const target = recordingEmitter();

    target.emitter.emit(emitted);
    target.emitter.captureHandled(
      Object.freeze({ code: DATABASE_CODE, cause: driverFailure() }),
      context,
    );

    expect(target.offered[0]?.cause_chain_codes_ref).toEqual([
      WRAPPER_CODE,
      UNAVAILABLE_CODE,
    ]);
    expect(target.offered[1]?.cause_chain_codes_ref).toEqual([
      DATABASE_CODE,
      DRIVER_CODE,
    ]);
    expect(errorGetter).not.toHaveBeenCalled();
    expect(contextCodeGetter).not.toHaveBeenCalled();
  });

  it("turns a throwing descriptor proxy into one unavailable sentinel", () => {
    const inspected: PropertyKey[] = [];
    const hostile = new Proxy(Object.create(null) as object, {
      getOwnPropertyDescriptor(_target, property) {
        inspected.push(property);
        throw new Error("PLANTED_PROXY_TRAP_SECRET");
      },
    });

    expect(emittedSnapshot(hostile)).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "CAUSE_CODE_UNAVAILABLE",
    ]);
    expect(inspected).toEqual(["code"]);
  });

  it("accepts only exact allowlisted data codes from a nonthrowing proxy", () => {
    const inspected: PropertyKey[] = [];
    const allowed = new Proxy(Object.create(null) as object, {
      getOwnPropertyDescriptor(_target, property) {
        inspected.push(property);
        if (property === "code") {
          return {
            configurable: true,
            enumerable: true,
            writable: false,
            value: DRIVER_CODE,
          };
        }
        if (property === "cause") return undefined;
        throw new Error("UNEXPECTED_DESCRIPTOR_NAME");
      },
    });
    const disallowed = new Proxy(Object.create(null) as object, {
      getOwnPropertyDescriptor(_target, property) {
        if (property === "code") {
          return {
            configurable: true,
            enumerable: true,
            writable: false,
            value: "ECONNRESET_PLANTED_PROXY_TEXT",
          };
        }
        throw new Error("DISALLOWED_PROXY_MUST_STOP_AFTER_CODE");
      },
    });

    expect(emittedSnapshot(allowed)).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "3D000",
    ]);
    expect(inspected).toEqual(["code", "cause"]);
    expect(emittedSnapshot(disallowed)).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "CAUSE_CODE_UNAVAILABLE",
    ]);
  });

  it("reads each named descriptor at most once per visited hop", () => {
    const descriptorReads = new Map<PropertyKey, number>();
    const driver = new Proxy(Object.create(null) as object, {
      getOwnPropertyDescriptor(_target, property) {
        descriptorReads.set(property, (descriptorReads.get(property) ?? 0) + 1);
        if (property === "code") {
          return {
            configurable: true,
            enumerable: true,
            writable: false,
            value: DRIVER_CODE,
          };
        }
        if (property === "cause") return undefined;
        throw new Error("UNEXPECTED_DESCRIPTOR_NAME");
      },
    });

    expect(emittedSnapshot(driver)).toEqual([WRAPPER_CODE, DRIVER_CODE]);
    expect(descriptorReads).toEqual(new Map<PropertyKey, number>([
      ["code", 1],
      ["cause", 1],
    ]));
  });

  it("rejects the nearest non-allowlisted driver-code neighbor", () => {
    for (const code of ["3D001", "ECONNRESET"]) {
      expect(emittedSnapshot(Object.freeze({ code }))).toEqual([
        WRAPPER_CODE,
        UNAVAILABLE_CODE,
      ]);
    }
  });

  it("terminates self and two-node cycles without repeating codes", () => {
    const selfCycle: { code: string; cause?: unknown } = {
      code: DATABASE_CODE,
    };
    selfCycle.cause = selfCycle;
    const first: { code: string; cause?: unknown } = { code: DATABASE_CODE };
    const second: { code: string; cause?: unknown } = {
      code: "OBS_CAPTURE_SELF",
      cause: first,
    };
    first.cause = second;

    expect(emittedSnapshot(selfCycle)).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "DATABASE_POOL_FAILED",
      "CAUSE_CODE_UNAVAILABLE",
    ]);
    expect(emittedSnapshot(first)).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "DATABASE_POOL_FAILED",
      "OBS_CAPTURE_SELF",
      "CAUSE_CODE_UNAVAILABLE",
    ]);
  });

  it("uses the eighth position as the depth sentinel without a ninth read", () => {
    const descriptorReads = new Map<number, PropertyKey[]>();
    let cause: unknown = undefined;
    for (let index = 8; index >= 1; index -= 1) {
      const next = cause;
      descriptorReads.set(index, []);
      cause = new Proxy(Object.create(null) as object, {
        getOwnPropertyDescriptor(_target, property) {
          descriptorReads.get(index)!.push(property);
          if (property === "code") {
            return {
              configurable: true,
              enumerable: true,
              writable: false,
              value: index % 2 === 0
                ? "OBS_CAPTURE_SELF"
                : "DATABASE_POOL_FAILED",
            };
          }
          if (property === "cause") {
            return next === undefined
              ? undefined
              : {
                  configurable: true,
                  enumerable: true,
                  writable: false,
                  value: next,
                };
          }
          throw new Error("UNEXPECTED_DESCRIPTOR_NAME");
        },
      });
    }

    expect(emittedSnapshot(cause)).toEqual([
      "OBS_SCHEDULER_JOB_FAILED",
      "DATABASE_POOL_FAILED",
      "OBS_CAPTURE_SELF",
      "DATABASE_POOL_FAILED",
      "OBS_CAPTURE_SELF",
      "DATABASE_POOL_FAILED",
      "OBS_CAPTURE_SELF",
      "CAUSE_CODE_UNAVAILABLE",
    ]);
    expect(descriptorReads.get(8)).toEqual([]);
  });

  it("accepts an exact eight-position chain only when the final node ends", () => {
    let cause: unknown = undefined;
    for (let index = 7; index >= 1; index -= 1) {
      cause = Object.freeze({
        code: index % 2 === 0 ? "OBS_CAPTURE_SELF" : DATABASE_CODE,
        ...(cause === undefined ? {} : { cause }),
      });
    }

    expect(emittedSnapshot(cause)).toEqual([
      WRAPPER_CODE,
      DATABASE_CODE,
      "OBS_CAPTURE_SELF",
      DATABASE_CODE,
      "OBS_CAPTURE_SELF",
      DATABASE_CODE,
      "OBS_CAPTURE_SELF",
      DATABASE_CODE,
    ]);
  });

  it("rejects both nonregistered and oversized code text without retaining it", () => {
    const length64 = "X".repeat(64);
    const length65 = "Y".repeat(65);

    expect(emittedSnapshot(Object.freeze({ code: length64 }))).toEqual([
      WRAPPER_CODE,
      UNAVAILABLE_CODE,
    ]);
    expect(emittedSnapshot(Object.freeze({ code: length65 }))).toEqual([
      WRAPPER_CODE,
      UNAVAILABLE_CODE,
    ]);
    expect(JSON.stringify(emittedSnapshot(Object.freeze({ code: length65 }))))
      .not.toContain(length65);
  });

  it("turns primitive causes into the fixed sentinel without retaining them", () => {
    for (const primitive of ["PLANTED_PRIMITIVE_SECRET", 42, true]) {
      const snapshot = emittedSnapshot(primitive);
      expect(snapshot).toEqual([WRAPPER_CODE, UNAVAILABLE_CODE]);
      expect(JSON.stringify(snapshot)).not.toContain(String(primitive));
    }
  });

  it("stores a frozen empty snapshot on an envelope without an error", () => {
    const target = recordingEmitter();

    target.emitter.emit(Object.freeze({ code: "OBS_CAPTURE_SELF" }));

    expect(target.offered[0]?.cause_chain_codes_ref).toEqual([]);
    expect(Object.isFrozen(target.offered[0]?.cause_chain_codes_ref)).toBe(true);
  });

  it("retains no raw error text in any snapshot", () => {
    const snapshot = emittedSnapshot(databaseFailure(driverFailure()));
    const durable = JSON.stringify(snapshot);

    expect(durable).toBe(
      '["OBS_SCHEDULER_JOB_FAILED","DATABASE_POOL_FAILED","3D000"]',
    );
    expect(durable).not.toContain("no_such_database");
    expect(durable).not.toContain("planted-password");
    expect(durable).not.toContain("PostgreSQL pool operation failed");
  });
});

describe("FIX-02 C3 redaction and serialized envelope", () => {
  it("projects a frozen scheduler chain with the fixed relation pair", () => {
    const entry = {
      kind: "envelope",
      payload_ref: schedulerEnvelope(databaseFailure(driverFailure())),
      ambient_context_ref: undefined,
      cause_chain_codes_ref: Object.freeze([
        WRAPPER_CODE,
        DATABASE_CODE,
        DRIVER_CODE,
      ]),
    } as unknown as CaptureQueueEntry;

    const envelope = redactor().redact(entry) as ReturnType<
      ReturnType<typeof redactor>["redact"]
    > & { readonly cause_chain_codes?: readonly string[] };

    expect(envelope).toMatchObject({
      code: WRAPPER_CODE,
      parent_occurrence_ref: PARENT_SENTINEL,
      cause_relation: "WRAPS",
      cause_chain_codes: [WRAPPER_CODE, DATABASE_CODE, DRIVER_CODE],
    });
    expect(Object.isFrozen(envelope.cause_chain_codes)).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain("no_such_database");
    expect(JSON.stringify(envelope)).not.toContain("planted-password");
  });

  it("does not invoke the queued error getter while projecting a snapshot", () => {
    const errorGetter = vi.fn(() => {
      throw new Error("PLANTED_REDACTOR_ERROR_GETTER_SECRET");
    });
    const payload = Object.create(null) as Record<string, unknown>;
    Object.defineProperties(payload, {
      code: {
        configurable: true,
        enumerable: true,
        writable: false,
        value: WRAPPER_CODE,
      },
      template_parameters: {
        configurable: true,
        enumerable: true,
        writable: false,
        value: Object.freeze({ job: "replay-self-test" }),
      },
      error: {
        configurable: true,
        enumerable: true,
        get: errorGetter,
      },
    });

    const envelope = redactor().redact({
      kind: "envelope",
      payload_ref: payload,
      ambient_context_ref: undefined,
      cause_chain_codes_ref: Object.freeze([
        WRAPPER_CODE,
        DATABASE_CODE,
        DRIVER_CODE,
      ]),
    });

    expect(envelope.cause_chain_codes).toEqual([
      WRAPPER_CODE,
      DATABASE_CODE,
      DRIVER_CODE,
    ]);
    expect(errorGetter).not.toHaveBeenCalled();
  });

  it("normalizes a one-code snapshot to the frozen no-cause projection", () => {
    const envelope = redactor().redact({
      kind: "handled_error",
      payload_ref: Object.freeze({ code: DATABASE_CODE }),
      ambient_context_ref: undefined,
      handled_context_ref: Object.freeze({ runtime: "evaluator_lib" }),
      cause_chain_codes_ref: Object.freeze([DATABASE_CODE]),
    } as unknown as CaptureQueueEntry) as ReturnType<
      ReturnType<typeof redactor>["redact"]
    > & { readonly cause_chain_codes?: readonly string[] };

    expect(envelope).toMatchObject({
      code: DATABASE_CODE,
      parent_occurrence_ref: "NO_CAUSE",
      cause_relation: null,
      cause_chain_codes: [],
    });
    expect(Object.isFrozen(envelope.cause_chain_codes)).toBe(true);
  });

  it("rejects an accessor-backed serialized record without a getter read", () => {
    const serialized = serializedSelfEnvelope();
    const codeGetter = vi.fn(() => "OBS_CAPTURE_SELF");
    Object.defineProperty(serialized, "code", {
      configurable: true,
      enumerable: true,
      get: codeGetter,
    });

    expect(() => isSerializedSafeEnvelope(serialized, "scheduler"))
      .not.toThrow();
    expect(isSerializedSafeEnvelope(serialized, "scheduler")).toBe(false);
    expect(codeGetter).not.toHaveBeenCalled();
  });

  it("returns undefined instead of throwing for record and array proxies", () => {
    const normalize = serializedNormalizer();
    expect(normalize).toBeTypeOf("function");
    if (normalize === undefined) return;

    const ownKeysProxy = new Proxy(Object.create(null) as object, {
      ownKeys() {
        throw new Error("PLANTED_OWN_KEYS_SECRET");
      },
    });
    const descriptorProxy = new Proxy(Object.create(null) as object, {
      getOwnPropertyDescriptor() {
        throw new Error("PLANTED_DESCRIPTOR_SECRET");
      },
    });
    const benignProxy = new Proxy(serializedSelfEnvelope(), {});
    const revokedOuter = Proxy.revocable(serializedSelfEnvelope(), {});
    revokedOuter.revoke();
    const nestedProxy = serializedSelfEnvelope();
    nestedProxy.component = new Proxy(nestedProxy.component as object, {});
    const parameterProxy = serializedSelfEnvelope();
    parameterProxy.template_parameters = new Proxy(
      parameterProxy.template_parameters as object,
      {},
    );
    const frameProxy = serializedSelfEnvelope();
    frameProxy.frames = new Proxy([], {});
    const chainProxy = serializedSelfEnvelope();
    chainProxy.parent_occurrence_ref = PARENT_SENTINEL;
    chainProxy.cause_relation = "WRAPS";
    chainProxy.cause_chain_codes = new Proxy(
      ["OBS_CAPTURE_SELF", DRIVER_CODE],
      {},
    );
    const revoked = Proxy.revocable(["OBS_CAPTURE_SELF", DRIVER_CODE], {});
    revoked.revoke();
    const revokedChain = serializedSelfEnvelope();
    revokedChain.parent_occurrence_ref = PARENT_SENTINEL;
    revokedChain.cause_relation = "WRAPS";
    revokedChain.cause_chain_codes = revoked.proxy;

    for (const hostile of [
      ownKeysProxy,
      descriptorProxy,
      benignProxy,
      revokedOuter.proxy,
      nestedProxy,
      parameterProxy,
      frameProxy,
      chainProxy,
      revokedChain,
    ]) {
      expect(() => normalize(hostile, "scheduler")).not.toThrow();
      expect(normalize(hostile, "scheduler")).toBeUndefined();
    }
  });

  it("rejects accessors, extra keys, and symbols throughout the snapshot", () => {
    const normalize = serializedNormalizer();
    expect(normalize).toBeTypeOf("function");
    if (normalize === undefined) return;

    const parameterGetter = vi.fn(() => "PLANTED_PARAMETER_SECRET");
    const accessor = serializedSelfEnvelope();
    accessor.template_parameters = Object.defineProperty({}, "secret", {
      configurable: true,
      enumerable: true,
      get: parameterGetter,
    });
    const outerExtra = serializedSelfEnvelope();
    outerExtra.extra = "PLANTED_OUTER_EXTRA_SECRET";
    const outerSymbol = serializedSelfEnvelope();
    Object.defineProperty(outerSymbol, Symbol("PLANTED_OUTER_SYMBOL_SECRET"), {
      enumerable: true,
      value: "PLANTED_SYMBOL_VALUE_SECRET",
    });
    const componentExtra = serializedSelfEnvelope();
    (componentExtra.component as Record<string, unknown>).extra =
      "PLANTED_COMPONENT_EXTRA_SECRET";
    const parameterSymbol = serializedSelfEnvelope();
    Object.defineProperty(
      parameterSymbol.template_parameters as object,
      Symbol("PLANTED_PARAMETER_SYMBOL_SECRET"),
      { enumerable: true, value: "PLANTED_PARAMETER_SYMBOL_VALUE_SECRET" },
    );
    const frameExtra = serializedSelfEnvelope();
    const extraFrames = [] as unknown[] & { extra?: string };
    extraFrames.extra = "PLANTED_FRAME_EXTRA_SECRET";
    frameExtra.frames = extraFrames;
    const arrayExtra = serializedSelfEnvelope();
    arrayExtra.parent_occurrence_ref = PARENT_SENTINEL;
    arrayExtra.cause_relation = "WRAPS";
    const extraChain = ["OBS_CAPTURE_SELF", DRIVER_CODE] as unknown[] & {
      extra?: string;
    };
    extraChain.extra = "PLANTED_ARRAY_EXTRA_SECRET";
    arrayExtra.cause_chain_codes = extraChain;
    const arraySymbol = serializedSelfEnvelope();
    arraySymbol.parent_occurrence_ref = PARENT_SENTINEL;
    arraySymbol.cause_relation = "WRAPS";
    const symbolChain = ["OBS_CAPTURE_SELF", DRIVER_CODE];
    Object.defineProperty(symbolChain, Symbol("PLANTED_ARRAY_SYMBOL_SECRET"), {
      enumerable: true,
      value: "PLANTED_ARRAY_SYMBOL_VALUE_SECRET",
    });
    arraySymbol.cause_chain_codes = symbolChain;

    for (const hostile of [
      accessor,
      outerExtra,
      outerSymbol,
      componentExtra,
      parameterSymbol,
      frameExtra,
      arrayExtra,
      arraySymbol,
    ]) {
      expect(normalize(hostile, "scheduler")).toBeUndefined();
    }
    expect(parameterGetter).not.toHaveBeenCalled();
  });

  it("returns one frozen null-prototype snapshot independent of its source", () => {
    const normalize = serializedNormalizer();
    expect(normalize).toBeTypeOf("function");
    if (normalize === undefined) return;
    const serialized = serializedSelfEnvelope();
    const component = serialized.component as Record<string, unknown>;
    const parameters = serialized.template_parameters as Record<string, unknown>;
    const frames = serialized.frames as unknown[];
    const chain = serialized.cause_chain_codes as string[];

    const normalized = normalize(serialized, "scheduler");

    expect(normalized).toBeDefined();
    if (normalized === undefined) return;
    expect(normalized).not.toBe(serialized);
    expect(Object.getPrototypeOf(normalized)).toBeNull();
    expect(Object.getPrototypeOf(normalized.component)).toBeNull();
    expect(Object.getPrototypeOf(normalized.template_parameters)).toBeNull();
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.component)).toBe(true);
    expect(Object.isFrozen(normalized.template_parameters)).toBe(true);
    expect(Object.isFrozen(normalized.frames)).toBe(true);
    expect(Object.isFrozen(normalized.cause_chain_codes)).toBe(true);
    expect(normalized.component).not.toBe(component);
    expect(normalized.template_parameters).not.toBe(parameters);
    expect(normalized.frames).not.toBe(frames);
    expect(normalized.cause_chain_codes).not.toBe(chain);

    serialized.code = "PLANTED_MUTATED_CODE_SECRET";
    component.process = "PLANTED_MUTATED_COMPONENT_SECRET";
    parameters.secret = "PLANTED_MUTATED_PARAMETER_SECRET";
    frames.push("PLANTED_MUTATED_FRAME_SECRET");
    chain.push("PLANTED_MUTATED_CHAIN_SECRET");

    expect(normalized).toMatchObject({
      code: "OBS_CAPTURE_SELF",
      component: {
        process: "scheduler",
        package: "@debateai/scheduler",
      },
      template_parameters: {},
      frames: [],
      cause_chain_codes: [],
    });
  });

  it("normalizes legacy absence only in a stable returned envelope", () => {
    const legacy = serializedSelfEnvelope();
    delete legacy.cause_chain_codes;
    const normalize = serializedNormalizer();

    expect(normalize).toBeTypeOf("function");
    if (normalize === undefined) return;
    const normalized = normalize(legacy, "scheduler");

    expect(isSerializedSafeEnvelope(legacy, "scheduler")).toBe(true);
    expect(normalized?.cause_chain_codes).toEqual([]);
    expect(Object.isFrozen(normalized?.cause_chain_codes)).toBe(true);
    expect(Object.getPrototypeOf(normalized!)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(
      legacy,
      "cause_chain_codes",
    )).toBe(false);
  });

  it("accepts a lawful serialized chain only with the fixed relation pair", () => {
    const serialized = serializedSelfEnvelope();
    serialized.parent_occurrence_ref = PARENT_SENTINEL;
    serialized.cause_relation = "WRAPS";
    serialized.cause_chain_codes = ["OBS_CAPTURE_SELF", DRIVER_CODE];
    const normalize = serializedNormalizer();

    expect(normalize).toBeTypeOf("function");
    if (normalize === undefined) return;
    const normalized = normalize(serialized, "scheduler");
    expect(isSerializedSafeEnvelope(serialized, "scheduler")).toBe(true);
    expect(normalized?.cause_chain_codes).toEqual([
      "OBS_CAPTURE_SELF",
      "3D000",
    ]);
    expect(Object.isFrozen(normalized?.cause_chain_codes)).toBe(true);
  });

  it("replaces even a pre-frozen serialized chain with its own frozen copy", () => {
    const serialized = serializedSelfEnvelope();
    const supplied = Object.freeze(["OBS_CAPTURE_SELF", DRIVER_CODE]);
    serialized.parent_occurrence_ref = PARENT_SENTINEL;
    serialized.cause_relation = "WRAPS";
    serialized.cause_chain_codes = supplied;
    const normalize = serializedNormalizer();

    expect(normalize).toBeTypeOf("function");
    if (normalize === undefined) return;
    const normalized = normalize(serialized, "scheduler");
    expect(isSerializedSafeEnvelope(serialized, "scheduler")).toBe(true);
    expect(normalized?.cause_chain_codes).toEqual(supplied);
    expect(normalized?.cause_chain_codes).not.toBe(supplied);
    expect(Object.isFrozen(normalized?.cause_chain_codes)).toBe(true);
  });

  it("defensively clears mutable, reordered, and minimized snapshots", () => {
    const mutable = [WRAPPER_CODE, DATABASE_CODE, DRIVER_CODE];
    const durable = redactor().redact({
      kind: "envelope",
      payload_ref: schedulerEnvelope(databaseFailure(driverFailure())),
      ambient_context_ref: undefined,
      cause_chain_codes_ref: mutable,
    } as CaptureQueueEntry);
    mutable[0] = "OBS_CAPTURE_SELF";
    expect(durable.cause_chain_codes).toEqual([
      WRAPPER_CODE,
      DATABASE_CODE,
      DRIVER_CODE,
    ]);
    expect(Object.isFrozen(durable.cause_chain_codes)).toBe(true);

    const reordered = redactor().redact({
      kind: "envelope",
      payload_ref: schedulerEnvelope(databaseFailure(driverFailure())),
      ambient_context_ref: undefined,
      cause_chain_codes_ref: Object.freeze([
        DATABASE_CODE,
        WRAPPER_CODE,
        DRIVER_CODE,
      ]),
    } as CaptureQueueEntry);
    expect(reordered).toMatchObject({
      parent_occurrence_ref: "NO_CAUSE",
      cause_relation: null,
      cause_chain_codes: [],
    });

    const minimized = createSharedRedactor({
      environment: "test",
      build_ref: "UNTRACKED-DEV:fix02-c3:test",
      build_dirty: true,
      runtime: "scheduler",
      component: Object.freeze({ process: "wrong", package: "wrong" }),
      writer_identity: "fix02-c3-test",
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
      now: () => new Date("2026-09-04T00:00:00.000Z"),
      sourceEventRef: () => "00000000-0000-4000-8000-000000000204",
    }).redact({
      kind: "envelope",
      payload_ref: schedulerEnvelope(databaseFailure(driverFailure())),
      ambient_context_ref: undefined,
      cause_chain_codes_ref: Object.freeze([
        WRAPPER_CODE,
        DATABASE_CODE,
        DRIVER_CODE,
      ]),
    } as CaptureQueueEntry);
    expect(minimized).toMatchObject({
      fallback_minimized: true,
      parent_occurrence_ref: "NO_CAUSE",
      cause_relation: null,
      cause_chain_codes: [],
    });
  });

  it("rejects a hostile serialized chain without throwing", () => {
    const serialized = serializedSelfEnvelope();
    const hostileChain = new Proxy(["OBS_CAPTURE_SELF", DRIVER_CODE], {
      getOwnPropertyDescriptor() {
        throw new Error("PLANTED_DESCRIPTOR_TRAP_SECRET");
      },
    });
    serialized.parent_occurrence_ref = PARENT_SENTINEL;
    serialized.cause_relation = "WRAPS";
    serialized.cause_chain_codes = hostileChain;

    const normalize = serializedNormalizer();
    expect(normalize).toBeTypeOf("function");
    if (normalize === undefined) return;
    expect(() => normalize(serialized, "scheduler"))
      .not.toThrow();
    expect(normalize(serialized, "scheduler")).toBeUndefined();
    expect(isSerializedSafeEnvelope(serialized, "scheduler")).toBe(false);
  });
});

describe("FIX-02 C3 browser-safe import boundary", () => {
  it("adds no node-only import to the cause snapshot module", () => {
    const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
    const causeChainPath = resolve(
      repositoryRoot,
      "packages/obs-capture/src/cause-chain.ts",
    );
    expect(existsSync(causeChainPath)).toBe(true);
    if (!existsSync(causeChainPath)) return;
    const pending = [causeChainPath];
    const visited = new Set<string>();
    const importPattern = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/gu;

    while (pending.length > 0) {
      const sourcePath = pending.pop()!;
      if (visited.has(sourcePath)) continue;
      visited.add(sourcePath);
      const source = readFileSync(sourcePath, "utf8");
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1]!;
        expect(specifier).not.toMatch(/^node:/u);
        expect(specifier).not.toBe("pg");
        expect(specifier).not.toBe("@debateai/db");
        if (!specifier.startsWith(".")) continue;
        const rawTarget = resolve(dirname(sourcePath), specifier);
        const candidates = [
          rawTarget,
          rawTarget.replace(/\.js$/u, ".ts"),
          resolve(rawTarget, "index.ts"),
        ];
        const target = candidates.find((candidate) => existsSync(candidate));
        expect(target, `${sourcePath} -> ${specifier}`).toBeDefined();
        pending.push(target!);
      }
    }
  });
});
