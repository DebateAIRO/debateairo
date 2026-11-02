import { describe, expect, it, vi } from "vitest";

/**
 * C-1 (security-audit run 3, K01). Support transcripts, case replies and summaries are encrypted under per-session and
 * per-case keys wrapped by the host support KEK, not by the user DEK, so destroying the DEK alone leaves them readable.
 * The account erasure coordinator therefore shreds the owner's support keys before it destroys the user DEK, and reads
 * them back on the support credential as the last check before FINALIZE. A composition without the support port
 * destroys nothing and never finalizes.
 *
 * Fakes only, in the style of tests/unit/f-diag-erasure-cause-loss.test.ts. Namespace import, so a missing member
 * fails its own row instead of the file's link step.
 */
import * as erasure from "../../packages/db/src/account-erasure.js";

type AccountRepository = ConstructorParameters<typeof erasure.AccountErasureCoordinator>[0];
type UserDeks = ConstructorParameters<typeof erasure.AccountErasureCoordinator>[1];
type RunKeys = ConstructorParameters<typeof erasure.AccountErasureCoordinator>[2];

const ERASURE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const OWNER_REF = "33333333-3333-4333-8333-333333333333";
const SOURCE = Object.freeze({
  ip: "background",
  userAgent: "account-erasure-support-shred",
  requestId: "44444444-4444-4444-8444-444444444444"
}) as unknown as Parameters<erasure.AccountErasureCoordinator["reconcile"]>[0];

function harness(input: Readonly<{
  live?: number;
  shred?: () => Promise<unknown>;
}> = {}) {
  const calls: string[] = [];
  let finalized = false;
  const finalize = vi.fn(async () => {
    calls.push("finalize");
    finalized = true;
    return "COMMITTED" as const;
  });
  const repository = {
    pendingWork: async () => [ERASURE_ID],
    preview: async () => null,
    status: async () => finalized ? "CLEANED" : "PREPARED",
    cleanupManifest: async () => ({
      userId: USER_ID,
      ownerRef: OWNER_REF,
      runIds: [],
      legacyRunIds: [],
      publishedRunIds: [],
      currentPublicationRefs: [],
      cleanupPublicationRefs: [],
      deletePublicDebates: false
    }),
    withNotificationLease: async (_userId: string, use: () => Promise<unknown>) => use(),
    completionNotificationsReady: async () => true,
    finalize
  } as unknown as AccountRepository;
  const deks = new Set([USER_ID]);
  const usersDestroy = vi.fn(async (userId: string) => {
    calls.push("users.destroy");
    return deks.delete(userId) ? "DESTROYED" as const : "ALREADY_ABSENT" as const;
  });
  const users = {
    exists: async (userId: string) => deks.has(userId),
    destroy: usersDestroy
  } as unknown as UserDeks;
  const runsDestroy = vi.fn(async () => "DESTROYED" as const);
  const runs = {
    listByOwner: async () => [],
    exists: async () => false,
    destroy: runsDestroy
  } as unknown as RunKeys;
  const shredOwnerForErasure = vi.fn(async (_ownerRef: string, _actor: string, _at: Date) => {
    calls.push("support.shred");
    return input.shred === undefined ? { kind: "SHREDDED" } : input.shred();
  });
  const liveOwnerKeyCount = vi.fn(async (_ownerRef: string) => {
    calls.push("support.readback");
    return input.live ?? 0;
  });
  const support = { shredOwnerForErasure, liveOwnerKeyCount };
  return { calls, finalize, repository, users, usersDestroy, runs, runsDestroy, support, shredOwnerForErasure };
}

function withSupport(h: ReturnType<typeof harness>): erasure.AccountErasureCoordinator {
  return new erasure.AccountErasureCoordinator(h.repository, h.users, h.runs, undefined, h.support);
}

describe("C-1 · account erasure shreds the owner's support keys before FINALIZE", () => {
  it("shreds the owner's support keys before the user DEK and reads them back before FINALIZE", async () => {
    const h = harness();
    expect(await withSupport(h).execute(ERASURE_ID, SOURCE)).toBe("CLEANED");
    expect(h.calls).toEqual(["support.shred", "users.destroy", "support.readback", "finalize"]);
    expect(h.shredOwnerForErasure).toHaveBeenCalledWith(OWNER_REF, "account-erasure", expect.any(Date));
    expect(h.support.liveOwnerKeyCount).toHaveBeenCalledWith(OWNER_REF);
  });

  it("refuses FINALIZE while a support key of the owner is still live", async () => {
    const h = harness({ live: 1 });
    expect(await withSupport(h).execute(ERASURE_ID, SOURCE)).toBe("INVALID_EVIDENCE");
    expect(h.finalize).not.toHaveBeenCalled();
  });

  it("destroys nothing and never finalizes without a support port", async () => {
    const h = harness();
    const coordinator = new erasure.AccountErasureCoordinator(h.repository, h.users, h.runs);
    expect(await coordinator.execute(ERASURE_ID, SOURCE)).toBe("INVALID_EVIDENCE");
    expect(h.usersDestroy).not.toHaveBeenCalled();
    expect(h.runsDestroy).not.toHaveBeenCalled();
    expect(h.finalize).not.toHaveBeenCalled();
  });

  it("a support shred failure keeps the user DEK and is reported as account-erasure-execute", async () => {
    const h = harness({ shred: async () => { throw new TypeError("SUPPORT_SHRED_STATE_INVALID"); } });
    expect(await withSupport(h).reconcile(SOURCE)).toEqual([{
      erasureId: ERASURE_ID,
      outcome: "INVALID_EVIDENCE",
      diagnosticStage: "account-erasure-execute"
    }]);
    expect(h.usersDestroy).not.toHaveBeenCalled();
    expect(h.finalize).not.toHaveBeenCalled();
  });
});
