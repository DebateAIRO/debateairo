import { describe, expect, it } from "vitest";

/**
 * F-DIAG-ERASURE-CAUSE-LOSS.
 *
 * PROPERTY. Each of the three erasure reconcile catches
 * (packages/db/src/account-erasure.ts :746, :761, :966) swallows its cause and
 * maps the item to a typed outcome. The typed outcome stays exactly what it
 * was — `INVALID_EVIDENCE`, a member of the unchanged public vocabulary — and
 * the item now also carries a BOUNDED internal stage naming which catch
 * swallowed the throw, so a diagnostic reader can tell the three apart and can
 * tell a swallowed throw from an `INVALID_EVIDENCE` the code returned on
 * purpose. Nothing of the cause is forwarded: not its message, not its name,
 * not a stringification.
 *
 * The stage appears ONLY on the swallow path. On the success path the item's
 * key set is unchanged, which is what keeps
 * tests/integration/s6-content-encryption-database.test.ts:2331's exact
 * `toContainEqual({ runId, outcome })` green.
 *
 * Namespace import: the stage vocabulary is a new export, so a missing member
 * fails its own row instead of the file's link step.
 */
import * as erasure from "../../packages/db/src/account-erasure.js";

/** The corpus's invented secret (tests/unit/dev-auth-stack.test.ts:182), never a credential. */
const SYNTHETIC_CAUSE = "DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER";
const poison = (): never => { throw new TypeError(SYNTHETIC_CAUSE); };

type AccountRepository = ConstructorParameters<typeof erasure.AccountErasureCoordinator>[0];
type UserDeks = ConstructorParameters<typeof erasure.AccountErasureCoordinator>[1];
type RunKeys = ConstructorParameters<typeof erasure.AccountErasureCoordinator>[2];
type PrivateRepository = ConstructorParameters<typeof erasure.PrivateRunErasureCoordinator>[0];

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const ERASURE_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_REF = "33333333-3333-4333-8333-333333333333";
const SOURCE = Object.freeze({
  ip: "background",
  userAgent: "f-diag-erasure-cause-loss",
  requestId: "44444444-4444-4444-8444-444444444444"
}) as unknown as Parameters<erasure.AccountErasureCoordinator["reconcile"]>[0];

const INTENT = Object.freeze({
  runId: RUN_ID, userId: ERASURE_ID, ownerRef: OWNER_REF, claimToken: "claim-token"
});

function noCauseAnywhere(value: unknown): void {
  expect(JSON.stringify(value)).not.toContain(SYNTHETIC_CAUSE);
}

describe("F-DIAG-ERASURE-CAUSE-LOSS · a bounded stage beside the unchanged outcome", () => {
  it("bounds the stage vocabulary to the three catches", () => {
    expect(erasure.ACCOUNT_ERASURE_RECONCILE_STAGES).toEqual([
      "run-key-provision-cleanup", "account-erasure-execute", "private-run-cleanup-complete"
    ]);
    expect(Object.isFrozen(erasure.ACCOUNT_ERASURE_RECONCILE_STAGES)).toBe(true);
  });

  it(":746 run-key provision cleanup — the swallowed throw is named, the outcome unchanged", async () => {
    const coordinator = new erasure.AccountErasureCoordinator(
      { claimRunKeyProvisionCleanup: async () => [INTENT] } as unknown as AccountRepository,
      {} as unknown as UserDeks,
      { exists: async () => poison() } as unknown as RunKeys
    );
    const outcomes = await coordinator.reconcileRunKeyProvisionIntents();
    expect(outcomes).toEqual([{
      runId: RUN_ID,
      outcome: "INVALID_EVIDENCE",
      diagnosticStage: "run-key-provision-cleanup"
    }]);
    noCauseAnywhere(outcomes);
  });

  it(":746 success path keeps the item's key set exactly {runId, outcome} (control)", async () => {
    const coordinator = new erasure.AccountErasureCoordinator(
      {
        claimRunKeyProvisionCleanup: async () => [INTENT],
        completeRunKeyProvisionCleanup: async () => true
      } as unknown as AccountRepository,
      {} as unknown as UserDeks,
      { exists: async () => false, destroy: async () => "DESTROYED" } as unknown as RunKeys
    );
    const outcomes = await coordinator.reconcileRunKeyProvisionIntents();
    expect(outcomes).toEqual([{ runId: RUN_ID, outcome: "CLEANED" }]);
    expect(Object.keys(outcomes[0]!).sort()).toEqual(["outcome", "runId"]);
  });

  it(":761 account-erasure execute — the swallowed throw is named, the outcome unchanged", async () => {
    const coordinator = new erasure.AccountErasureCoordinator(
      {
        pendingWork: async () => [ERASURE_ID],
        preview: async () => poison()
      } as unknown as AccountRepository,
      {} as unknown as UserDeks,
      {} as unknown as RunKeys
    );
    const outcomes = await coordinator.reconcile(SOURCE);
    expect(outcomes).toEqual([{
      erasureId: ERASURE_ID,
      outcome: "INVALID_EVIDENCE",
      diagnosticStage: "account-erasure-execute"
    }]);
    noCauseAnywhere(outcomes);
  });

  it(":761 success path keeps the item's key set exactly {erasureId, outcome} (control)", async () => {
    const coordinator = new erasure.AccountErasureCoordinator(
      {
        pendingWork: async () => [ERASURE_ID],
        preview: async () => null,
        status: async () => "NOT_FOUND"
      } as unknown as AccountRepository,
      {} as unknown as UserDeks,
      {} as unknown as RunKeys
    );
    const outcomes = await coordinator.reconcile(SOURCE);
    expect(Object.keys(outcomes[0]!).sort()).toEqual(["erasureId", "outcome"]);
    expect(outcomes[0]!.outcome).not.toBe("INVALID_EVIDENCE");
  });

  it(":966 private-run cleanup completion — the swallowed throw is named, the outcome unchanged", async () => {
    const coordinator = new erasure.PrivateRunErasureCoordinator(
      {
        pendingCleanup: async () => [ERASURE_ID],
        manifest: async () => poison()
      } as unknown as PrivateRepository,
      {} as unknown as RunKeys
    );
    const outcomes = await coordinator.reconcile(SOURCE);
    expect(outcomes).toEqual([{
      erasureId: ERASURE_ID,
      outcome: "INVALID_EVIDENCE",
      diagnosticStage: "private-run-cleanup-complete"
    }]);
    noCauseAnywhere(outcomes);
  });

  it(":966 success path keeps the item's key set exactly {erasureId, outcome} (control)", async () => {
    const coordinator = new erasure.PrivateRunErasureCoordinator(
      {
        pendingCleanup: async () => [ERASURE_ID],
        manifest: async () => null,
        status: async () => "CLEANED"
      } as unknown as PrivateRepository,
      {} as unknown as RunKeys
    );
    const outcomes = await coordinator.reconcile(SOURCE);
    expect(outcomes).toEqual([{ erasureId: ERASURE_ID, outcome: "CLEANED" }]);
    expect(Object.keys(outcomes[0]!).sort()).toEqual(["erasureId", "outcome"]);
  });
});
