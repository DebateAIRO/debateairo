import { describe, expect, it } from "vitest";
import { reconcilePending, type ReconcilePort } from "../../tools/obs-listener/src/obsctl/reconcile.js";
import type { CompletedOutboxRecord } from "../../tools/obs-listener/src/obsctl/local-history.js";
const record = { action_ref: `obsctl:v1:${"a".repeat(64)}`, action_kind: "STATUS", action_parameters: {
  private_key_id: null, public_input_sha256: null, writer_identity: null }, actor: "obsctl:v", invocation_id: "11111111-1111-4111-8111-111111111111",
  outbox_hash: "b".repeat(64), outbox_seq: "1", prior_outbox_hash: "c".repeat(64), requested_at_ms: "1", schema: "obsctl-outbox-action/v3",
  signature_base64: "x", signing_key_id: "c".repeat(64) } as CompletedOutboxRecord;
function fixture(fail?: string): { port: ReconcilePort; calls: string[] } {
  const calls: string[] = [];
  return { calls, port: { assertIdentity: async () => { calls.push("identity"); if (fail === "identity") throw new Error("identity"); },
    appendAction: async (input) => { calls.push(`append:${input.action_ref}`); if (fail === "gateway") throw new Error("gateway"); return "22222222-2222-4222-8222-222222222222"; },
    commit: async () => { calls.push("commit"); if (fail === "commit") throw new Error("commit"); }, rollback: async () => { calls.push("rollback"); },
    appendReceipt: async () => { calls.push("receipt"); if (fail === "receipt") throw new Error("receipt"); } } };
}
describe("FIX-10 reconcile", () => {
  it("identity_gateway_commit_receipt_order", async () => { const { port, calls } = fixture(); expect(await reconcilePending([record], port)).toEqual({ reconciled: 1, pending: 0 }); expect(calls).toEqual(["identity", `append:${record.action_ref}`, "commit", "receipt"]); });
  it("receipt_is_never_written_before_commit", async () => { const { port, calls } = fixture("commit"); await expect(reconcilePending([record], port)).rejects.toThrow("commit"); expect(calls).not.toContain("receipt"); });
  it("receipt_failure_keeps_original_pending", async () => { const { port } = fixture("receipt"); expect(await reconcilePending([record], port)).toEqual({ reconciled: 0, pending: 1 }); });
  it("identity_failure_precedes_action", async () => { const { port, calls } = fixture("identity"); await expect(reconcilePending([record], port)).rejects.toThrow("identity"); expect(calls).toEqual(["identity"]); });
  it.each(Array.from({ length: 16 }, (_, index) => index + 1))("reconcile_replay_matrix_%i", async () => {
    const { port } = fixture(); expect(await reconcilePending([record], port)).toEqual({ reconciled: 1, pending: 0 });
  });
});
