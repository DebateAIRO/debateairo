import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * NV-08 (security-audit run 3, K02). The API's 30 s erasure pass runs its four stages through the one shared chain
 * helper (apps/api/src/erasure-reconcile-chain.ts), so a throwing stage is reported by name and never skips the stages
 * after it. A bare `await` of a stage inside the pass would bring back the stall for every user.
 */
const main = await readFile("apps/api/src/main.ts", "utf8");

function reconcileErasureSlice(): string {
  const start = main.indexOf("const reconcileErasure = async");
  const end = main.indexOf("const triggerErasureReconciliation");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe("NV-08 · main.ts runs the erasure pass through the chain helper", () => {
  it("imports the helper from its own module", () => {
    expect(main).toMatch(/^import \{ runErasureReconcileChain \} from "\.\/erasure-reconcile-chain\.js";$/mu);
  });

  it("runs the four stages through runErasureReconcileChain, in run order", () => {
    const slice = reconcileErasureSlice();
    const chain = slice.indexOf("runErasureReconcileChain(");
    expect(chain).toBeGreaterThan(-1);
    let from = chain;
    for (const stage of ["\"erasure-notice\"", "\"run-key-provision\"", "\"private-run-erasure\"", "\"account-erasure\""]) {
      const at = slice.indexOf(stage, from);
      expect(at, stage).toBeGreaterThan(from);
      from = at;
    }
    for (const work of [
      "erasureNotifications.reconcile(100)",
      "accountErasure.reconcileRunKeyProvisionIntents(100)",
      "privateErasure.reconcile(reconciliationSource(),100)",
      "accountErasure.reconcile(reconciliationSource(),100)"
    ]) {
      expect(slice.indexOf(work, chain), work).toBeGreaterThan(chain);
    }
  });

  it("awaits no stage bare", () => {
    expect(reconcileErasureSlice()).not.toMatch(/^\s*await (?:erasureNotifications|accountErasure|privateErasure)\./mu);
  });

  it("keeps the consumer security notices outside the chain and the timer as it was", () => {
    const slice = reconcileErasureSlice();
    expect(slice).toContain("try { await consumerSecurityNotices.reconcile(100); } catch { console.error('[CONSUMER_SECURITY_NOTICE_PENDING]'); }");
    expect(slice.indexOf("consumerSecurityNotices.reconcile(100)")).toBeLessThan(slice.indexOf("runErasureReconcileChain("));
    expect(main).toContain("const erasureReconcileTimer=gatedInterval(releaseWatcher,triggerErasureReconciliation,30_000);");
    expect(main).toContain("()=>console.error(\"[ACCOUNT_ERASURE_RECONCILIATION_PENDING]\")");
  });
});
