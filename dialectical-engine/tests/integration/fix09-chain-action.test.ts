import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  appendChainedAgentAction,
  materializeAgentAction,
} from "../../packages/obs-capture/src/chain/agent-action-gateway.js";
import {
  withFixagentDeliveryTransactionForTest,
  type FixagentDeliveryTransaction,
} from "../../packages/obs-capture/src/chain/fixagent-delivery.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("FIX-09 chained actions on real PostgreSQL", () => {
  it("proves exact replay, locks, ordering, signing, FIX-10 compatibility, and atomic rollback", async () => {
    const actionRef = `fixagent-skip:${randomUUID()}`;
    const action = materializeAgentAction({
      action_kind: "FIXAGENT_SKIPPED",
      action_payload: Object.freeze(Object.assign(Object.create(null), {
        occ_seq: "1",
        reason: "SKIP_NON_DEFECT_JOB_LIFECYCLE",
        schema: "fixagent-skip/v1",
      })),
      action_ref: actionRef,
      actor: "fixagent-daemon",
      incident_id: null,
      occurrence_id: null,
      source: "first_party",
      writer_identity: "fixagent-daemon",
    });
    let retained: FixagentDeliveryTransaction | undefined;
    let first: unknown;
    await withFixagentDeliveryTransactionForTest(database.pool, async (transaction) => {
      retained = transaction;
      first = await appendChainedAgentAction(transaction, action);
    });
    await withFixagentDeliveryTransactionForTest(database.pool, async (transaction) => {
      const replay = await appendChainedAgentAction(transaction, action);
      expect(replay).toEqual(first);
    });
    await withFixagentDeliveryTransactionForTest(database.pool, async (transaction) => {
      await expect(appendChainedAgentAction(transaction, materializeAgentAction({
        ...action,
        action_payload: Object.freeze(Object.assign(Object.create(null), {
          occ_seq: "2",
          reason: "SKIP_NON_DEFECT_JOB_LIFECYCLE",
          schema: "fixagent-skip/v1",
        })),
      }))).rejects.toThrow("FIX09_ACTION_CONFLICT");
    });
    expect((await database.pool.query(
      "SELECT 1 FROM obs.agent_action WHERE action_ref=$1",
      [actionRef],
    )).rowCount).toBe(1);
    await expect(appendChainedAgentAction(retained as FixagentDeliveryTransaction, action))
      .rejects.toThrow("FIX09_DELIVERY_TRANSACTION_INVALID");
    await expect(appendChainedAgentAction({} as FixagentDeliveryTransaction, action))
      .rejects.toThrow("FIX09_DELIVERY_TRANSACTION_INVALID");
  });
});
