// tests/unit/path-results-store.test.ts
// V4 start step, Task 21: a path's root saved while its debate is being erased. 0156's writer checks the debate is live, then inserts; an
// erasure that commits in between is refused by 0040's barrier on the insert (55000 PRIVATE_CONTENT_ERASED). The store answers RUN_ERASED
// for it, as for the writer's own answer, so the runner stops the debate the typed way; any other failure is passed on.
import { describe, expect, it } from "vitest";
import { PostgresPathResultsRepository, type Pool } from "@debateai/db";

const ROOT = Object.freeze({ runId: "6f0b6c58-1f0e-4a43-9a1f-2f0a9c8f4a11", pathId: "b1", rootIndex: 0,
  rootNodeId: "0e8f2f53-5d39-4c4b-8d67-1d7f0a3c2b90", maker: "maker-0" } as const);
const refusing = (error: unknown): Pool => ({ query: async () => { throw error; } }) as unknown as Pool;
const pgError = (code: string, message: string): Error => Object.assign(new Error(message), { code });

describe("writePathRoot while the debate is erased", () => {
  it("answers RUN_ERASED when the erasure barrier refuses the insert", async () => {
    const store = new PostgresPathResultsRepository(refusing(pgError("55000", "PRIVATE_CONTENT_ERASED")));
    expect(await store.writePathRoot(ROOT)).toBe("RUN_ERASED");
  });

  it("passes every other failure on", async () => {
    for (const error of [pgError("55000", "PATH_ROOT_REPOINT_TARGET_STALE"), pgError("23503", "insert violates foreign key"), new Error("socket")]) {
      await expect(new PostgresPathResultsRepository(refusing(error)).writePathRoot(ROOT)).rejects.toBe(error);
    }
  });
});
