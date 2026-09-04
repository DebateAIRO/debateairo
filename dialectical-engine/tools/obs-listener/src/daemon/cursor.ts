import type { PoolClient } from "pg";

export const FIXAGENT_CONSUMER = "fixagent-daemon" as const;

export async function readCursor(client: Pick<PoolClient, "query">): Promise<bigint> {
  const result = await client.query<{ last_occ_seq: string }>(`
    SELECT last_occ_seq::text FROM obs.consumer_cursor WHERE consumer=$1
  `, [FIXAGENT_CONSUMER]);
  return BigInt(result.rows[0]?.last_occ_seq ?? "0");
}

export async function advanceContiguousCursor(client: Pick<PoolClient, "query">): Promise<bigint> {
  await client.query(`
    INSERT INTO obs.consumer_cursor (consumer,last_occ_seq)
    VALUES ($1,0) ON CONFLICT (consumer) DO NOTHING
  `, [FIXAGENT_CONSUMER]);
  const current = await client.query<{ last_occ_seq: string }>(`
    SELECT last_occ_seq::text FROM obs.consumer_cursor WHERE consumer=$1 FOR UPDATE
  `, [FIXAGENT_CONSUMER]);
  const last = BigInt(current.rows[0]?.last_occ_seq ?? "0");
  const boundary = await client.query<{ candidate: string }>(`
    SELECT coalesce(
      (SELECT min(occurrence.occ_seq)-1 FROM obs.occurrence AS occurrence
       WHERE occurrence.occ_seq>$2 AND NOT EXISTS (
         SELECT 1 FROM obs.delivery AS delivery
         WHERE delivery.occurrence_id=occurrence.occurrence_id
           AND delivery.consumer=$1 AND delivery.delivery_status='ACKED'
       )),
      (SELECT max(occ_seq) FROM obs.occurrence),
      $2
    )::text AS candidate
  `, [FIXAGENT_CONSUMER, last.toString()]);
  const candidate = BigInt(boundary.rows[0]?.candidate ?? last.toString());
  const updated = await client.query<{ last_occ_seq: string }>(`
    UPDATE obs.consumer_cursor
    SET last_occ_seq=greatest(last_occ_seq,$2),updated_at=statement_timestamp()
    WHERE consumer=$1 RETURNING last_occ_seq::text
  `, [FIXAGENT_CONSUMER, candidate.toString()]);
  return BigInt(updated.rows[0]?.last_occ_seq ?? last.toString());
}
