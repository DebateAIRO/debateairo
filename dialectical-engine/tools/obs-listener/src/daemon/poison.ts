import type { PoolClient } from "pg";
import type { PoisonReason, SkipReason } from "./intake.js";

interface TerminalOccurrence {
  readonly occurrenceId: string;
  readonly occSeq: bigint;
}

export async function appendSkipReceipt(
  client: Pick<PoolClient, "query">,
  occurrence: TerminalOccurrence,
  reason: SkipReason
): Promise<void> {
  await client.query(`
    INSERT INTO obs.agent_action (
      writer_identity,actor,action_kind,occurrence_id,action_ref,action_payload
    ) SELECT $1,$2,'FIXAGENT_SKIPPED',$3,$4,$5::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM obs.agent_action WHERE action_ref=$4)
  `, [
    "fixagent-daemon", "fixagent-daemon", occurrence.occurrenceId,
    `fixagent-skip:${occurrence.occurrenceId}`,
    JSON.stringify({ schema: "fixagent-skip/v1", reason, occ_seq: occurrence.occSeq.toString() })
  ]);
}

export async function appendPoisonReceipt(
  client: Pick<PoolClient, "query">,
  occurrence: TerminalOccurrence,
  reason: PoisonReason
): Promise<void> {
  await client.query(`
    INSERT INTO obs.agent_action (
      writer_identity,actor,action_kind,occurrence_id,action_ref,action_payload
    ) SELECT $1,$2,'FIXAGENT_DEAD_LETTER',$3,$4,$5::jsonb
    WHERE NOT EXISTS (SELECT 1 FROM obs.agent_action WHERE action_ref=$4)
  `, [
    "fixagent-daemon", "fixagent-daemon", occurrence.occurrenceId,
    `fixagent-dead-letter:${occurrence.occurrenceId}`,
    JSON.stringify({ schema: "fixagent-dead-letter/v1", reason, occ_seq: occurrence.occSeq.toString() })
  ]);
  await client.query(`
    INSERT INTO obs.component_health (component,state,observed_at,detail_code)
    VALUES ('fixagent-daemon','POISON',statement_timestamp(),$1)
    ON CONFLICT (component) DO UPDATE SET
      state='POISON',observed_at=EXCLUDED.observed_at,
      detail_code=EXCLUDED.detail_code,updated_at=statement_timestamp()
  `, [reason]);
}
