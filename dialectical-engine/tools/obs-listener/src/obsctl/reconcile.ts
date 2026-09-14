import type { CompletedOutboxRecord } from "./local-history.js";
import { databaseActionFromOutbox } from "./local-history.js";
import { appendChainedAgentAction } from "@debateai/obs-capture/chain";
import type { FixagentDeliveryGeneration } from "@debateai/obs-capture/chain/fixagent-delivery";

export interface ReconcilePort {
  assertIdentity(expected: "debateai_obs_listener"): Promise<void>;
  appendAction(input: ReturnType<typeof databaseActionFromOutbox>): Promise<string>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  appendReceipt(input: Readonly<{ record: CompletedOutboxRecord; databaseActionId: string }>): Promise<void>;
}

export async function reconcileThroughDeliveryGeneration(
  records: readonly CompletedOutboxRecord[],
  generation: FixagentDeliveryGeneration,
  appendReceipt: ReconcilePort["appendReceipt"],
): Promise<Readonly<{ reconciled: number; pending: number }>> {
  let reconciled = 0;
  for (const record of records) {
    let databaseActionId: string;
    try {
      databaseActionId = await generation.withDelivery(record.invocation_id, async (transaction) =>
        (await appendChainedAgentAction(transaction, databaseActionFromOutbox(record))).agent_action_id);
    } catch (error) {
      throw error;
    }
    try { await appendReceipt({ record, databaseActionId }); reconciled += 1; }
    catch { /* committed action remains pending under the original action_ref */ }
  }
  return Object.freeze({ reconciled, pending: records.length - reconciled });
}

export async function reconcilePending(
  records: readonly CompletedOutboxRecord[],
  port: ReconcilePort,
): Promise<Readonly<{ reconciled: number; pending: number }>> {
  await port.assertIdentity("debateai_obs_listener");
  let reconciled = 0;
  for (const record of records) {
    let databaseActionId: string;
    try {
      databaseActionId = await port.appendAction(databaseActionFromOutbox(record));
      await port.commit();
    } catch (error) {
      await port.rollback().catch(() => undefined);
      throw error;
    }
    try {
      await port.appendReceipt({ record, databaseActionId });
      reconciled += 1;
    } catch {
      // The commit is authoritative. The unchanged signed record remains pending and
      // replay is idempotent by action_ref; never invent a local receipt.
    }
  }
  return Object.freeze({ reconciled, pending: records.length - reconciled });
}
