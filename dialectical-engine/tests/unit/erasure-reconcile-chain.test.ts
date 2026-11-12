import { describe, expect, it, vi } from "vitest";

/**
 * NV-08 (security-audit run 3, K02). The API's 30 s erasure pass ran its four stages as bare awaits, so one stage that
 * threw (for example the run-key provision claim refused on an inactive owner's intent) skipped private-run and
 * account erasure for every user, and the single-flight wrapper printed only a cause-free marker. The chain helper
 * gives each stage its own catch, reports a failed stage by name and every unsettled outcome as a count, still runs
 * the later stages, and rejects once at the end so [ACCOUNT_ERASURE_RECONCILIATION_PENDING] keeps its meaning.
 *
 * Fakes only. The module is imported per case (dynamic import), so a missing module or member fails its own row
 * instead of the file's link step.
 */
type ChainModule = typeof import("../../apps/api/src/erasure-reconcile-chain.js");
const chainModule = (): Promise<ChainModule> => import("../../apps/api/src/erasure-reconcile-chain.js");

/** The corpus's invented secret (tests/unit/dev-auth-stack.test.ts:182), never a credential. */
const SYNTHETIC_CAUSE = "DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER";
const STAGES = ["erasure-notice", "run-key-provision", "private-run-erasure", "account-erasure"] as const;

describe("NV-08 erasure reconcile chain: one stage never stops the others", () => {
  it("a throwing stage is logged by name and later stages still run", async () => {
    const chain = await chainModule();
    const calls: string[] = [];
    const log = vi.fn<(line: string) => void>();
    const pass = chain.runErasureReconcileChain(STAGES.map((stage) => ({
      stage,
      work: async () => {
        calls.push(stage);
        if (stage === "run-key-provision") throw new TypeError(SYNTHETIC_CAUSE);
        return [];
      }
    })), log);
    await expect(pass).rejects.toThrow("ERASURE_RECONCILE_STAGE_FAILED");
    expect(calls).toEqual([...STAGES]);
    expect(log.mock.calls).toEqual([["[ERASURE_RECONCILE_STAGE_FAILED] stage=run-key-provision"]]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SYNTHETIC_CAUSE);
    await pass.catch((error: unknown) => {
      expect(String(error)).not.toContain(SYNTHETIC_CAUSE);
      expect((error as { cause?: unknown }).cause).toBeUndefined();
    });
  });

  it("a stage whose result cannot be read is a failed stage, not a broken pass", async () => {
    const chain = await chainModule();
    const calls: string[] = [];
    const log = vi.fn<(line: string) => void>();
    const pass = chain.runErasureReconcileChain(STAGES.map((stage) => ({
      stage,
      work: async () => {
        calls.push(stage);
        return stage === "erasure-notice" ? null as never : [];
      }
    })), log);
    await expect(pass).rejects.toThrow("ERASURE_RECONCILE_STAGE_FAILED");
    expect(calls).toEqual([...STAGES]);
    expect(log.mock.calls).toEqual([["[ERASURE_RECONCILE_STAGE_FAILED] stage=erasure-notice"]]);
  });

  it("settled outcomes print nothing; others are counted, never echoed", async () => {
    const chain = await chainModule();
    expect(chain.erasureReconcileAttentionLine("account-erasure", [
      { outcome: "CLEANED" },
      { outcome: "CONTENDED" },
      { outcome: "INVALID_EVIDENCE", diagnosticStage: "account-erasure-execute" },
      { outcome: "INVALID_EVIDENCE" }
    ])).toBe(
      "[ERASURE_RECONCILE_ATTENTION] stage=account-erasure CONTENDED=1 INVALID_EVIDENCE=1 INVALID_EVIDENCE/account-erasure-execute=1"
    );
    expect(chain.erasureReconcileAttentionLine("run-key-provision", [{ outcome: "CLEANED" }])).toBeNull();
    expect(chain.erasureReconcileAttentionLine("run-key-provision", [])).toBeNull();
    expect(chain.erasureReconcileAttentionLine("account-erasure", [
      { outcome: "CLEANED_WITH_LEGACY_RESIDUAL" }, { outcome: "CANCELLED" }
    ])).toBeNull();
    expect(chain.erasureReconcileAttentionLine("erasure-notice", [{ outcome: "ACKNOWLEDGED" }])).toBeNull();
    const leak = chain.erasureReconcileAttentionLine("private-run-erasure", [
      { outcome: "leak user@example.test" },
      { outcome: "INVALID_EVIDENCE", diagnosticStage: "Leak user@example.test" },
      { outcome: "INVALID_EVIDENCE", diagnosticStage: "private-run-cleanup-complete" }
    ]);
    expect(leak).toBe(
      "[ERASURE_RECONCILE_ATTENTION] stage=private-run-erasure INVALID_EVIDENCE/private-run-cleanup-complete=1 INVALID_EVIDENCE/unknown=1 UNKNOWN=1"
    );
    expect(leak).not.toContain("example.test");
  });

  it("an unsettled stage is reported and the pass still resolves", async () => {
    const chain = await chainModule();
    const log = vi.fn<(line: string) => void>();
    await expect(chain.runErasureReconcileChain([
      { stage: "erasure-notice", work: async () => [{ outcome: "ACKNOWLEDGED" }] },
      { stage: "run-key-provision", work: async () => [{ outcome: "CONTENDED" }, { outcome: "CONTENDED" }] },
      { stage: "private-run-erasure", work: async () => [] },
      { stage: "account-erasure", work: async () => [{ outcome: "CLEANED" }] }
    ], log)).resolves.toBeUndefined();
    expect(log.mock.calls).toEqual([["[ERASURE_RECONCILE_ATTENTION] stage=run-key-provision CONTENDED=2"]]);
  });

  it("all stages succeed: resolves, and no stage failure is logged", async () => {
    const chain = await chainModule();
    const calls: string[] = [];
    const log = vi.fn<(line: string) => void>();
    await expect(chain.runErasureReconcileChain(STAGES.map((stage) => ({
      stage,
      work: async () => { calls.push(stage); return [{ outcome: stage === "erasure-notice" ? "ACKNOWLEDGED" : "CLEANED" }]; }
    })), log)).resolves.toBeUndefined();
    expect(calls).toEqual([...STAGES]);
    expect(log).not.toHaveBeenCalled();
  });

  it("names the four stages of the pass in run order", async () => {
    const chain = await chainModule();
    expect(chain.ERASURE_RECONCILE_CHAIN_STAGES).toEqual([...STAGES]);
    expect(Object.isFrozen(chain.ERASURE_RECONCILE_CHAIN_STAGES)).toBe(true);
  });
});
