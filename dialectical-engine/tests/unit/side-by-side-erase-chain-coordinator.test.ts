import { describe, expect, it } from "vitest";
import { PrivateRunErasureCoordinator } from "../../packages/db/src/account-erasure.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan A addendum A-x3; migration 0123 §8) — THE COORDINATOR COMPLETES EVERY RUN
 * OF THE DEBATE. One deletion request marks every run of a re-admitted debate's chain, each with its own erasure; the
 * coordinator completes the first, then asks resume for the next one still pending under the same grant until none is
 * left. It answers CLEANED only when none is left: a busy resume is CONTENDED (the page shows "pending"), an id named
 * twice (never finalized) is CONTENDED too, and a run that does not complete stops the request with its own outcome.
 * Fakes only; the database half is tests/integration/side-by-side-erase-superseded.test.ts.
 */
type Repository = ConstructorParameters<typeof PrivateRunErasureCoordinator>[0];
type Keys = ConstructorParameters<typeof PrivateRunErasureCoordinator>[1];
type Resumed = Awaited<ReturnType<Repository["resume"]>>;

const INPUT = Object.freeze({
  runId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  ownerRef: "33333333-3333-4333-8333-333333333333",
  sessionId: "44444444-4444-4444-8444-444444444444",
  grantTokenHash: `sha256:${"a".repeat(64)}`,
  source: Object.freeze({ ip: "192.0.2.80", userAgent: "erase-chain-coordinator", requestId: "55555555-5555-4555-8555-555555555555" })
});
const FIRST = "66666666-6666-4666-8666-666666666661";
const SECOND = "66666666-6666-4666-8666-666666666662";
const THIRD = "66666666-6666-4666-8666-666666666663";
const NONE: Resumed = Object.freeze({ outcome: "NOT_FOUND", erasureId: null });
const pending = (erasureId: string): Resumed => Object.freeze({ outcome: "PREPARED", erasureId });

/**
 * A repository whose first resume finds nothing (a fresh request), whose prepare marks the chain and names FIRST, and
 * whose later resumes answer `afterwards` in order. Each erasure completes as `completion` says: no manifest left and
 * a status, so completePrepared answers CLEANED (status CLEANED) or NOT_FOUND without touching any key.
 */
function arrange(afterwards: readonly Resumed[], completion: (erasureId: string) => "CLEANED" | "NOT_FOUND" = () => "CLEANED") {
  const resumes = [NONE, ...afterwards];
  const completed: string[] = [];
  let resumeCalls = 0;
  const repository = {
    resume: async () => { resumeCalls += 1; return resumes.shift() ?? NONE; },
    prepare: async () => Object.freeze({ outcome: "PREPARED", erasureId: FIRST }),
    manifest: async (erasureId: string) => { completed.push(erasureId); return null; },
    status: async (erasureId: string) => completion(erasureId)
  } as unknown as Repository;
  const coordinator = new PrivateRunErasureCoordinator(repository, {} as unknown as Keys);
  return { coordinator, completed, resumeCalls: () => resumeCalls };
}

describe("side-by-side A-x3: the private erasure coordinator completes every marked run of the debate", () => {
  it("completes the run named, then each run resume names, and answers CLEANED when none is left", async () => {
    const { coordinator, completed } = arrange([pending(SECOND), pending(THIRD)]);
    await expect(coordinator.execute(INPUT)).resolves.toBe("CLEANED");
    expect(completed).toEqual([FIRST, SECOND, THIRD]);
  });

  it("a run never re-admitted: one completion, one resume that finds nothing", async () => {
    const { coordinator, completed, resumeCalls } = arrange([]);
    await expect(coordinator.execute(INPUT)).resolves.toBe("CLEANED");
    expect(completed).toEqual([FIRST]);
    expect(resumeCalls()).toBe(2);
  });

  it("a busy resume part-way leaves the request pending, never CLEANED", async () => {
    const { coordinator, completed } = arrange([pending(SECOND), Object.freeze({ outcome: "CONTENDED", erasureId: null })]);
    await expect(coordinator.execute(INPUT)).resolves.toBe("CONTENDED");
    expect(completed).toEqual([FIRST, SECOND]);
  });

  it("an erasure named twice was not finalized: pending, and it is not completed again", async () => {
    const { coordinator, completed } = arrange([pending(SECOND), pending(FIRST)]);
    await expect(coordinator.execute(INPUT)).resolves.toBe("CONTENDED");
    expect(completed).toEqual([FIRST, SECOND]);
  });

  it("a run that does not complete stops the request with its own outcome", async () => {
    const { coordinator, completed, resumeCalls } = arrange([pending(SECOND), pending(THIRD)],
      (erasureId) => erasureId === SECOND ? "NOT_FOUND" : "CLEANED");
    await expect(coordinator.execute(INPUT)).resolves.toBe("NOT_FOUND");
    expect(completed).toEqual([FIRST, SECOND]);
    expect(resumeCalls()).toBe(2);
  });
});
