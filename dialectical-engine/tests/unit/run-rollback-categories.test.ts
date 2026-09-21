import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  configureContentEncryption,
  RunRepository,
  type StartRunInput
} from "../../packages/db/src/index.js";
import type { ContentCipher } from "../../packages/crypto/src/index.js";

// The public classification of an incomplete run rollback. Both bytes of it are
// part of the outward contract (tests/integration/s6-content-encryption-database.test.ts)
// and must survive the internal category being added.
const PUBLIC_CODE = "RUN_CONTENT_ROLLBACK_INCOMPLETE";
const PUBLIC_MESSAGE = "Run rollback or external content-key cleanup did not complete";

// Raw failure text that the two discarded causes carry. None of it may reach the
// thrown error, in any field.
const ROLLBACK_RAW = "ROLLBACK failed: connection to 10.0.0.7:5432 terminated";
const DESTROY_RAW = "secret store DELETE /var/keys/run.key failed for user 41f0";
const ENCRYPT_RAW = "content key material 9f8ae2 rejected the envelope";
const COMMIT_RAW = "commit outcome unknown: 10.0.0.7:5432 read timeout";

const OWNER_REF = "6d2b1f4a-0a1e-4a4c-9c2b-1f4a0a1e4a4c";
const USER_ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const SESSION_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const EXECUTION_REF = "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081";

function startRunInput(): StartRunInput {
  return {
    questionLine: "rollback category probe",
    principal: { kind: "server", userId: USER_ID, ownerRef: OWNER_REF },
    sessionId: SESSION_ID,
    callerScope: "ASKER",
    asOf: new Date("2026-09-07T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "diag-bounded:rollback-category",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: [],
    strangerSampleRate: 1,
    envelopeBasis: { source: "diag-bounded:rollback-category" },
    registerVersion: 1,
    batteryVersion: "diag-bounded:rollback-category",
    batteryRows: []
  };
}

function fakePool(): Pool {
  return {} as unknown as Pool;
}

/** A provision pool that hands back a live execution ref, then behaves as told. */
function provisionPool(onCreate?: () => Promise<never>): Pool {
  return {
    query: vi.fn(async (text: string) => {
      if (text.includes("core.create_encrypted_run")) {
        if (onCreate !== undefined) return onCreate();
        return { rows: [{ created: true }] };
      }
      return { rows: [{ execution_ref: EXECUTION_REF }] };
    })
  } as unknown as Pool;
}

function cipherStub(input: {
  readonly encryptThrows?: boolean;
  readonly destroyRejects?: boolean;
}): ContentCipher {
  return {
    provisionRun: vi.fn(async () => undefined),
    prepareRun: vi.fn(async () => ({
      runId: "unused",
      encrypt: () => {
        if (input.encryptThrows === true) throw new Error(ENCRYPT_RAW);
        return { v: 1 } as never;
      },
      decrypt: () => undefined as never,
      databaseAttestationSecret: () => Buffer.alloc(32, 7),
      attestEnvelope: () => Buffer.alloc(32, 9),
      close: vi.fn(() => undefined)
    })),
    destroyRunKey: vi.fn(async () => {
      if (input.destroyRejects === true) throw new Error(DESTROY_RAW);
    })
  } as unknown as ContentCipher;
}

/** Every field of a caught value, so no assertion can be satisfied by inspecting one. */
function everyStringOf(error: unknown): string {
  const record = error as Readonly<Record<string, unknown>>;
  return [
    String(error),
    JSON.stringify(record, Object.getOwnPropertyNames(record))
  ].join(" ");
}

describe("run rollback failure categories", () => {
  it("distinguishes a failed ROLLBACK by a bounded category", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text === "ROLLBACK") throw new Error(ROLLBACK_RAW);
        return { rows: [] };
      }),
      release: vi.fn(() => undefined)
    } as unknown as PoolClient;

    const failure = await new RunRepository(fakePool())
      .startRun(startRunInput(), client)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: PUBLIC_CODE, message: PUBLIC_MESSAGE });
    expect((failure as { readonly cause?: unknown }).cause).toBe("ROLLBACK_FAILED");
    expect(everyStringOf(failure)).not.toContain("10.0.0.7");
    expect(everyStringOf(failure)).not.toContain("terminated");
  });

  it("distinguishes a failed content-key destroy by a different bounded category", async () => {
    const pool = fakePool();
    configureContentEncryption(pool, cipherStub({ encryptThrows: true, destroyRejects: true }));

    const failure = await new RunRepository(pool, provisionPool())
      .startRun(startRunInput())
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: PUBLIC_CODE, message: PUBLIC_MESSAGE });
    expect((failure as { readonly cause?: unknown }).cause).toBe("CONTENT_KEY_DESTROY_FAILED");
    expect(everyStringOf(failure)).not.toContain("/var/keys");
    expect(everyStringOf(failure)).not.toContain("9f8ae2");
  });

  it("distinguishes an ambiguous COMMIT from an incomplete rollback", async () => {
    const pool = fakePool();
    configureContentEncryption(pool, cipherStub({}));
    const rejectingCreate = provisionPool(async () => {
      throw new Error(COMMIT_RAW);
    });

    const failure = await new RunRepository(pool, rejectingCreate)
      .startRun(startRunInput())
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: PUBLIC_CODE, message: PUBLIC_MESSAGE });
    expect((failure as { readonly cause?: unknown }).cause).toBe("COMMIT_OUTCOME_AMBIGUOUS");
    expect(everyStringOf(failure)).not.toContain("read timeout");
  });

  it("names one category per distinguishable failure and no others", async () => {
    const source = await import("node:fs/promises")
      .then((fs) => fs.readFile("packages/db/src/index.ts", "utf8"));
    const declaration = source.slice(source.indexOf("const ROLLBACK_FAILURE_CATEGORIES"));
    const body = declaration.slice(declaration.indexOf("{"), declaration.indexOf("} as const"));
    const categories = [...body.matchAll(/"([A-Z][A-Z0-9_]*)"/gu)].map((match) => match[1]!);
    expect([...categories].sort()).toEqual([
      "COMMIT_OUTCOME_AMBIGUOUS",
      "CONTENT_KEY_DESTROY_FAILED",
      "ROLLBACK_AND_CONTENT_KEY_DESTROY_FAILED",
      "ROLLBACK_FAILED"
    ]);
  });
});
