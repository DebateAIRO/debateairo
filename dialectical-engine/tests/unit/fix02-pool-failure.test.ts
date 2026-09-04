import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSharedRedactor } from "../../packages/obs-capture/src/redactor.js";

type UntypedMethod = (...args: unknown[]) => unknown;
type UntypedPool = {
  readonly query: UntypedMethod;
  readonly connect: UntypedMethod;
  readonly emit: (event: "error", error: Error) => boolean;
};

const boundaryMocks = vi.hoisted(() => ({
  captureHandled: vi.fn(),
  poolQuery: vi.fn<UntypedMethod>(),
  poolConnect: vi.fn<UntypedMethod>(),
}));

vi.mock("@debateai/obs-capture", () => ({
  captureHandled: boundaryMocks.captureHandled,
}));

vi.mock("pg", async () => {
  const { EventEmitter } = await import("node:events");

  class FakePool extends EventEmitter {
    query(...args: unknown[]): unknown {
      return boundaryMocks.poolQuery(...args);
    }

    connect(...args: unknown[]): unknown {
      return boundaryMocks.poolConnect(...args);
    }

    end(): Promise<void> {
      return Promise.resolve();
    }
  }

  return {
    default: { Pool: FakePool },
    Pool: FakePool,
  };
});

import { createPool } from "@debateai/db";

const DATABASE_POOL_FAILED = "DATABASE_POOL_FAILED";
const FIXED_MESSAGE = "PostgreSQL pool operation failed";
const FIXED_CONTEXT = Object.freeze({
  source: "database_pool",
  code: DATABASE_POOL_FAILED,
});

function pool(): UntypedPool {
  return createPool("postgresql://fix02.invalid/test") as unknown as UntypedPool;
}

function callbackFailure(
  invoke: (callback: (...args: unknown[]) => void) => unknown,
): Promise<unknown> {
  return new Promise((resolveFailure, rejectTest) => {
    try {
      invoke((error: unknown) => resolveFailure(error));
    } catch (error) {
      rejectTest(error);
    }
  });
}

async function promiseFailure(operation: unknown): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("FIX02_EXPECTED_PROMISE_REJECTION");
}

function syncFailure(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("FIX02_EXPECTED_SYNC_THROW");
}

function clientWith(query: UntypedMethod): PoolClient {
  return {
    query: vi.fn(query),
    release: vi.fn(),
  } as unknown as PoolClient;
}

function connectionFailure(label: string): Error {
  return Object.assign(new Error(`FIX02_RAW_${label}`), { code: "ECONNRESET" });
}

function expectFixedFailure(failure: unknown, cause: unknown): TypedDomainError {
  expect(failure).toBeInstanceOf(TypedDomainError);
  expect(failure).toMatchObject({
    name: "TypedDomainError",
    code: DATABASE_POOL_FAILED,
    message: FIXED_MESSAGE,
  });
  const typed = failure as TypedDomainError;
  expect(typed.cause).toBe(cause);
  expect(typed.message).not.toContain("FIX02_RAW_");
  return typed;
}

type FailurePath = Readonly<{
  name: string;
  run(cause: Error): Promise<unknown>;
}>;

const FAILURE_PATHS: readonly FailurePath[] = [
  {
    name: "pool query callback",
    async run(cause) {
      boundaryMocks.poolQuery.mockImplementationOnce((...args: unknown[]) => {
        const callback = args.at(-1);
        if (typeof callback !== "function") throw new Error("FIX02_CALLBACK_MISSING");
        callback(cause);
        return undefined;
      });
      const target = pool();
      return callbackFailure((callback) => target.query("SELECT 1", callback));
    },
  },
  {
    name: "pool query promise rejection",
    async run(cause) {
      boundaryMocks.poolQuery.mockRejectedValueOnce(cause);
      return promiseFailure(pool().query("SELECT 1"));
    },
  },
  {
    name: "pool query sync throw",
    async run(cause) {
      boundaryMocks.poolQuery.mockImplementationOnce(() => { throw cause; });
      return syncFailure(() => pool().query("SELECT 1"));
    },
  },
  {
    name: "pool connect callback",
    async run(cause) {
      boundaryMocks.poolConnect.mockImplementationOnce((...args: unknown[]) => {
        const callback = args.at(-1);
        if (typeof callback !== "function") throw new Error("FIX02_CALLBACK_MISSING");
        callback(cause, undefined, undefined);
        return undefined;
      });
      return callbackFailure((callback) => pool().connect(callback));
    },
  },
  {
    name: "pool connect promise rejection",
    async run(cause) {
      boundaryMocks.poolConnect.mockRejectedValueOnce(cause);
      return promiseFailure(pool().connect());
    },
  },
  {
    name: "pool connect sync throw",
    async run(cause) {
      boundaryMocks.poolConnect.mockImplementationOnce(() => { throw cause; });
      return syncFailure(() => pool().connect());
    },
  },
  {
    name: "leased client query callback",
    async run(cause) {
      const client = clientWith((...args: unknown[]) => {
        const callback = args.at(-1);
        if (typeof callback !== "function") throw new Error("FIX02_CALLBACK_MISSING");
        callback(cause);
        return undefined;
      });
      boundaryMocks.poolConnect.mockResolvedValueOnce(client);
      const leased = await pool().connect() as PoolClient;
      const query = leased.query as unknown as UntypedMethod;
      return callbackFailure((callback) => query("SELECT 1", callback));
    },
  },
  {
    name: "leased client query promise rejection",
    async run(cause) {
      const client = clientWith(() => Promise.reject(cause));
      boundaryMocks.poolConnect.mockResolvedValueOnce(client);
      const leased = await pool().connect() as PoolClient;
      const query = leased.query as unknown as UntypedMethod;
      return promiseFailure(query("SELECT 1"));
    },
  },
  {
    name: "leased client query sync throw",
    async run(cause) {
      const client = clientWith(() => { throw cause; });
      boundaryMocks.poolConnect.mockResolvedValueOnce(client);
      const leased = await pool().connect() as PoolClient;
      const query = leased.query as unknown as UntypedMethod;
      return syncFailure(() => query("SELECT 1"));
    },
  },
];

beforeEach(() => {
  boundaryMocks.captureHandled.mockReset();
  boundaryMocks.poolQuery.mockReset();
  boundaryMocks.poolConnect.mockReset();
});

describe("FIX-02 C2 pool failure wrapping", () => {
  it.each(FAILURE_PATHS)("preserves the original cause through $name", async ({ name, run }) => {
    const cause = connectionFailure(name.replaceAll(" ", "_"));
    expectFixedFailure(await run(cause), cause);
  });

  it("keeps an existing typed pool failure by identity", async () => {
    const root = new Error("FIX02_RAW_EXISTING_CAUSE");
    const existing = new TypedDomainError(DATABASE_POOL_FAILED, FIXED_MESSAGE, { cause: root });
    boundaryMocks.poolConnect.mockRejectedValueOnce(existing);

    expect(await promiseFailure(pool().connect())).toBe(existing);
    expect(existing.cause).toBe(root);
  });

  it("captures only the first terminal event and keeps capture failure outside product behavior", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const captureFailure = new Error("FIX02_CAPTURE_CHANNEL_FAILED");
    boundaryMocks.captureHandled.mockImplementation(() => { throw captureFailure; });
    boundaryMocks.poolQuery.mockResolvedValue({ rows: [] });
    const target = pool();
    const first = connectionFailure("FIRST_TERMINAL_EVENT");
    const later = connectionFailure("LATER_TERMINAL_EVENT");

    expect(() => target.emit("error", first)).not.toThrow();
    expect(() => target.emit("error", later)).not.toThrow();

    expect(boundaryMocks.captureHandled).toHaveBeenCalledTimes(1);
    const [capturedError, capturedContext] = boundaryMocks.captureHandled.mock.calls[0]!;
    const terminalFailure = expectFixedFailure(capturedError, first);
    expect(capturedContext).toEqual(FIXED_CONTEXT);
    expect(JSON.stringify(capturedContext)).not.toContain(first.message);
    expect(JSON.stringify(capturedContext)).not.toContain(later.message);
    expect(consoleError).not.toHaveBeenCalled();
    expect(boundaryMocks.poolQuery).not.toHaveBeenCalled();

    expect(await promiseFailure(target.query("SELECT 1"))).toBe(terminalFailure);
    expect(boundaryMocks.poolQuery).not.toHaveBeenCalled();
  });

  it("keeps raw cause text out of the durable redacted envelope", () => {
    const cause = connectionFailure("DURABLE_REDACTION_SECRET");
    const failure = new TypedDomainError(DATABASE_POOL_FAILED, FIXED_MESSAGE, { cause });
    const redacted = createSharedRedactor({
      environment: "test",
      build_ref: "UNTRACKED-DEV:fix02:test",
      build_dirty: true,
      runtime: "runner",
      component: Object.freeze({ process: "runner", package: "@debateai/db" }),
      writer_identity: "fix02-test",
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
      now: () => new Date("2026-09-04T00:00:00.000Z"),
      sourceEventRef: () => "00000000-0000-4000-8000-000000000002",
    }).redact({
      kind: "handled_error",
      payload_ref: failure,
      ambient_context_ref: undefined,
      handled_context_ref: FIXED_CONTEXT,
    });

    expect(failure.cause).toBe(cause);
    expect(redacted).toMatchObject({
      code: DATABASE_POOL_FAILED,
      capture_point: "boundary",
      disposition: "HANDLED",
      template_parameters: {},
    });
    const durableJson = JSON.stringify(redacted);
    expect(durableJson).not.toContain(cause.message);
    expect(durableJson).not.toContain(FIXED_MESSAGE);
  });
});

describe("FIX-02 C2 capture dependency", () => {
  it("keeps the package edge one-way and the root capture graph free of db and pg runtime imports", () => {
    const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
    const dbManifest = JSON.parse(readFileSync(resolve(repositoryRoot, "packages/db/package.json"), "utf8")) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const captureManifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, "packages/obs-capture/package.json"), "utf8"),
    ) as { readonly dependencies?: Readonly<Record<string, string>> };

    expect(dbManifest.dependencies?.["@debateai/obs-capture"]).toBe("workspace:*");
    expect(captureManifest.dependencies?.["@debateai/db"]).toBeUndefined();

    const pending = [resolve(repositoryRoot, "packages/obs-capture/src/index.ts")];
    const visited = new Set<string>();
    const runtimeImport = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/gu;
    const dynamicImport = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;

    while (pending.length > 0) {
      const sourcePath = pending.pop()!;
      if (visited.has(sourcePath)) continue;
      visited.add(sourcePath);
      const source = readFileSync(sourcePath, "utf8");
      const specifiers = [
        ...Array.from(source.matchAll(runtimeImport), (match) => match[1]!),
        ...Array.from(source.matchAll(dynamicImport), (match) => match[1]!),
      ];
      for (const specifier of specifiers) {
        expect(specifier).not.toBe("pg");
        expect(specifier).not.toBe("@debateai/db");
        expect(specifier).not.toMatch(/^@debateai\/db\//u);
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

    expect(visited.size).toBeGreaterThan(1);
  });
});
