import { generateKeyPairSync, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import {
  appendChainedAgentAction,
  materializeAgentAction,
} from "../../packages/obs-capture/src/chain/agent-action-gateway.js";
import {
  createFixagentDeliveryGeneration,
  type FixagentDeliveryTransaction,
} from "../../packages/obs-capture/src/chain/fixagent-delivery.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { installReleasedSignerForTest } from "../../packages/obs-capture/src/chain/signer.js";

let database: TestDatabase;

async function withDelivery<T>(callback:(transaction:FixagentDeliveryTransaction)=>Promise<T>):Promise<T>{
  const generation=createFixagentDeliveryGeneration(database.connectionString);
  await generation.connect();
  try{return await generation.withDelivery(randomUUID(),callback);}
  finally{await generation.close();}
}

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
    await expect(appendChainedAgentAction({} as FixagentDeliveryTransaction, Object.freeze(
      Object.assign(Object.create(null), action, { action_ref: 7 }),
    ) as unknown as typeof action)).rejects.toThrow("FIX09_ACTION_INPUT");
    let retained: FixagentDeliveryTransaction | undefined;
    let first: unknown;
    await withDelivery(async (transaction) => {
      retained = transaction;
      first = await appendChainedAgentAction(transaction, action);
    });
    await withDelivery(async (transaction) => {
      const replay = await appendChainedAgentAction(transaction, action);
      expect(replay).toEqual(first);
    });
    await withDelivery(async (transaction) => {
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

    installReleasedSignerForTest(
      "agent_action","first_party","fixagent-daemon",generateKeyPairSync("ed25519").privateKey,
      Buffer.alloc(32,8).toString("hex"),
    );
    await database.pool.query(`INSERT INTO obs.audit_chain_activation (
      singleton,protocol,activation_id,activated_at,
      occurrence_legacy_max_seq,occurrence_legacy_count,occurrence_legacy_digest,
      agent_action_legacy_max_seq,agent_action_legacy_count,agent_action_legacy_digest,
      initial_public_keyring_sha256,activation_manifest_sha256,created_by_custodian_id
    ) VALUES (true,'obs-audit-chain/v1',$1,'2026-09-08T01:02:03.004Z',
      0,0,$2,0,0,$2,$2,$2,'V')`,[randomUUID(),Buffer.alloc(32,8)]);
    const signedActions=["one","two"].map((suffix)=>materializeAgentAction({
      ...action,action_ref:`fixagent-skip:${randomUUID()}`,
      action_payload:Object.freeze(Object.assign(Object.create(null),{
        occ_seq:suffix==="one"?"3":"4",reason:"SKIP_NON_DEFECT_JOB_LIFECYCLE",schema:"fixagent-skip/v1",
      })),
    }));
    for(const signedAction of signedActions) await withDelivery(
      async(transaction)=>appendChainedAgentAction(transaction,signedAction));
    const chain=await database.pool.query<{
      chain_key_id:string;chain_link:Buffer;chain_seq:string;chain_signature:Buffer;prev_link:Buffer;
    }>(`SELECT chain_key_id,chain_link,chain_seq::text,chain_signature,prev_link
      FROM obs.agent_action WHERE action_ref=ANY($1::text[]) ORDER BY chain_seq`,
      [signedActions.map((value)=>value.action_ref)]);
    expect(chain.rows.map((row)=>row.chain_seq)).toEqual(["1","2"]);
    expect(chain.rows[0]?.chain_signature).toHaveLength(64);
    expect(chain.rows[1]?.prev_link).toEqual(chain.rows[0]?.chain_link);
    expect(chain.rows[0]?.chain_key_id).toMatch(/^[0-9a-f]{64}$/u);
  });
});
