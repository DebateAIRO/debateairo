import pg from "pg";
import type { Notification, QueryResult, QueryResultRow } from "pg";
import {
  invalidateFixagentActionTransaction,
  registerFixagentActionTransaction,
  type FixagentActionOperation,
} from "./locks.js";

declare const DELIVERY_TRANSACTION: unique symbol;

export interface FixagentDeliveryTransaction {
  readonly [DELIVERY_TRANSACTION]: never;
}

type DeliveryState = {
  active: boolean;
  client: QueryClient;
  rank: 1 | 2 | 3;
};

interface QueryClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

interface FixagentDeliveryClient extends QueryClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
  on(event: "notification", listener: (message: Notification) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  removeListener(event: "notification", listener: (message: Notification) => void): unknown;
  removeListener(event: "error", listener: (error: Error) => void): unknown;
  removeListener(event: "end", listener: () => void): unknown;
}

export interface FixagentDeliveryNotification {
  readonly channel: string;
  readonly payload?: string;
}

export interface FixagentDeliveryGeneration {
  connect(): Promise<void>;
  listen(): Promise<void>;
  tryLeadership(): Promise<boolean>;
  selectPending(): Promise<string | undefined>;
  withDelivery<T>(occurrenceId: string, callback: (transaction: FixagentDeliveryTransaction) => Promise<T>): Promise<T>;
  onNotification(listener: (message: FixagentDeliveryNotification) => void): void;
  onError(listener: (error: Error) => void): void;
  onEnd(listener: () => void): void;
  removeNotification(listener: (message: FixagentDeliveryNotification) => void): void;
  removeError(listener: (error: Error) => void): void;
  removeEnd(listener: () => void): void;
  close(): Promise<void>;
}

const transactions = new WeakMap<object, DeliveryState>();

function fail(code: string): never {
  throw new TypeError(code);
}

function state(transaction: FixagentDeliveryTransaction): DeliveryState {
  if (transaction === null || typeof transaction !== "object") {
    fail("FIX09_DELIVERY_TRANSACTION_INVALID");
  }
  const value = transactions.get(transaction as object);
  if (value === undefined || !value.active) fail("FIX09_DELIVERY_TRANSACTION_INVALID");
  return value;
}

function createTransaction(client: QueryClient): FixagentDeliveryTransaction {
  const transaction = Object.freeze(Object.create(null)) as FixagentDeliveryTransaction;
  transactions.set(transaction as object, { active: true, client, rank: 1 });
  registerFixagentActionTransaction(transaction, (operation) =>
    executeFixagentActionOperation(transaction, operation));
  return transaction;
}

function invalidate(transaction: FixagentDeliveryTransaction): void {
  const value = transactions.get(transaction as object);
  if (value !== undefined) value.active = false;
  invalidateFixagentActionTransaction(transaction);
}

async function executeFixagentActionOperation<T extends QueryResultRow>(
  transaction: FixagentDeliveryTransaction,
  operation: FixagentActionOperation,
): Promise<QueryResult<T & Record<string, unknown>>> {
  const current = state(transaction);
  if (operation.kind === "LOCK_ACTION_REF") {
    if (current.rank > 2) fail("FIX09_DELIVERY_LOCK_ORDER");
    current.rank = 2;
    return current.client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
      [operation.token],
    ) as Promise<QueryResult<T & Record<string, unknown>>>;
  }
  if (operation.kind === "PROBE_ACTION") {
    if (current.rank < 2) fail("FIX09_DELIVERY_LOCK_ORDER");
    return current.client.query(
      "SELECT * FROM obs.audit_chain_probe_action($1,$2::jsonb)",
      [operation.actionRef, operation.expected],
    ) as Promise<QueryResult<T & Record<string, unknown>>>;
  }
  if (operation.kind === "READ_ACTIVATION") {
    if (current.rank < 2) fail("FIX09_DELIVERY_LOCK_ORDER");
    return current.client.query(
      "SELECT activation_manifest_sha256 FROM obs.audit_chain_activation WHERE singleton",
    ) as Promise<QueryResult<T & Record<string, unknown>>>;
  }
  if (operation.kind === "LOCK_CHAIN_PARTITION") {
    if (current.rank > 3 || current.rank < 2) fail("FIX09_DELIVERY_LOCK_ORDER");
    current.rank = 3;
    return current.client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
      [operation.token],
    ) as Promise<QueryResult<T & Record<string, unknown>>>;
  }
  if (operation.kind === "ALLOCATE_ACTION") {
    if (current.rank !== 3) fail("FIX09_DELIVERY_LOCK_ORDER");
    return current.client.query(`
      SELECT gen_random_uuid()::text AS agent_action_id,
        nextval('obs.agent_action_seq'::regclass)::text AS action_seq,
        to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at
    `) as Promise<QueryResult<T & Record<string, unknown>>>;
  }
  if (operation.kind === "READ_ACTION_HEAD") {
    if (current.rank !== 3) fail("FIX09_DELIVERY_LOCK_ORDER");
    return current.client.query(
      "SELECT * FROM obs.audit_chain_action_head($1,$2)",
      [operation.source,operation.writerIdentity],
    ) as Promise<QueryResult<T & Record<string, unknown>>>;
  }
  if (operation.kind === "INSERT_ACTION") {
    if (current.rank !== 3) fail("FIX09_DELIVERY_LOCK_ORDER");
    const value = operation.values;
    return current.client.query(`
      INSERT INTO obs.agent_action (
        agent_action_id,action_seq,source,writer_identity,actor,action_kind,
        occurrence_id,incident_id,action_ref,action_payload,occurred_at,prev_link,
        chain_version,chain_key_id,chain_seq,chain_signature,chain_link
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17)
      RETURNING agent_action_id::text,action_seq::text
    `,[
      value.agent_action_id,value.action_seq,value.source,value.writer_identity,value.actor,
      value.action_kind,value.occurrence_id,value.incident_id,value.action_ref,value.action_payload,
      value.occurred_at,value.prev_link,value.chain_version,value.chain_key_id,value.chain_seq,
      value.chain_signature,value.chain_link,
    ]) as Promise<QueryResult<T & Record<string, unknown>>>;
  }
  return fail("FIX09_DELIVERY_OPERATION");
}

export async function loadDeliveryOccurrence(
  transaction: FixagentDeliveryTransaction,
  occurrenceId: string,
): Promise<Record<string, unknown>> {
  const current = state(transaction);
  const selected = await current.client.query<Record<string, unknown>>(`
    SELECT occurrence.* FROM obs.occurrence AS occurrence
    WHERE occurrence.occurrence_id=$1
  `,[occurrenceId]);
  const row = selected.rows[0];
  if (row === undefined) fail("OCCURRENCE_NOT_FOUND");
  return row;
}

export async function loadTraceOccurrence(
  transaction: FixagentDeliveryTransaction,
  occurrenceId: string,
): Promise<Record<string, unknown> | undefined> {
  const selected = await state(transaction).client.query<Record<string, unknown>>(`
    SELECT occurrence_id,occ_seq,run_ref,build_ref,parent_occurrence_ref,cause_relation,
      cause_chain_codes,frames,zone_context,source,code,taxonomy_class,capture_point,
      redaction_policy_version,allowlist_set_id
    FROM obs.occurrence WHERE occurrence_id=$1
  `, [occurrenceId]);
  return selected.rows[0];
}

export async function claimIncidentForTrace(
  transaction: FixagentDeliveryTransaction,
  input: Readonly<{
    occurrenceId: string;
    fingerprint: string;
    fingerprintVersion: number;
  }>,
): Promise<Readonly<{
  incidentId: string;
  occurrenceId: string;
  fingerprint: string;
  fingerprintVersion: number;
}> | undefined> {
  const claimed = await state(transaction).client.query<{
    incident_id: string;
    fingerprint: string;
    fingerprint_version: number;
  }>(`
    UPDATE obs.incident SET state='RESEARCHING',updated_at=statement_timestamp()
    WHERE fingerprint=$1 AND fingerprint_version=$2 AND state='NEW'
    RETURNING incident_id::text,fingerprint,fingerprint_version
  `, [input.fingerprint, input.fingerprintVersion]);
  const row = claimed.rows[0];
  return row === undefined ? undefined : Object.freeze({
    incidentId: row.incident_id,
    occurrenceId: input.occurrenceId,
    fingerprint: row.fingerprint,
    fingerprintVersion: row.fingerprint_version,
  });
}

export async function persistTraceResult(
  transaction: FixagentDeliveryTransaction,
  input: Readonly<{
    incidentId: string;
    occurrenceId: string;
    verdict: string;
    evidence: Readonly<Record<string, unknown>>;
  }>,
): Promise<Readonly<{
  occurrenceId: string;
  verdict: string;
  evidence: Readonly<Record<string, unknown>>;
}>> {
  const client = state(transaction).client;
  await client.query(`
    INSERT INTO obs.trace (incident_id,occurrence_id,verdict,evidence)
    VALUES ($1,$2,$3,$4::jsonb)
    ON CONFLICT (incident_id) WHERE incident_id IS NOT NULL DO NOTHING
  `, [input.incidentId, input.occurrenceId, input.verdict, JSON.stringify(input.evidence)]);
  const selected = await client.query<{
    occurrence_id: string;
    verdict: string;
    evidence: Record<string, unknown>;
  }>(`
    SELECT occurrence_id::text,verdict,evidence
    FROM obs.trace WHERE incident_id=$1
  `, [input.incidentId]);
  const row = selected.rows[0];
  if (row === undefined) fail("FIX11_TRACE_PERSISTENCE");
  return Object.freeze({
    occurrenceId: row.occurrence_id,
    verdict: row.verdict,
    evidence: Object.freeze(row.evidence),
  });
}

export async function deliveryIsAcknowledged(
  transaction: FixagentDeliveryTransaction,
  occurrenceId: string,
): Promise<boolean> {
  const result = await state(transaction).client.query<{acknowledged:boolean}>(`
    SELECT EXISTS (SELECT 1 FROM obs.delivery WHERE occurrence_id=$1
      AND consumer='fixagent-daemon' AND delivery_status='ACKED') AS acknowledged
  `,[occurrenceId]);
  return result.rows[0]?.acknowledged === true;
}

export async function loadAggregateMembers(
  transaction: FixagentDeliveryTransaction,
  input: Readonly<{ fingerprint:string; fingerprintVersion:number; occurrenceId:string }>,
): Promise<readonly Record<string, unknown>[]> {
  const result = await state(transaction).client.query<Record<string, unknown>>(`
    SELECT occurrence.* FROM obs.occurrence AS occurrence
    WHERE occurrence.fingerprint=$1 AND occurrence.fingerprint_version=$2
      AND (occurrence.occurrence_id=$3 OR EXISTS (
        SELECT 1 FROM obs.delivery AS delivery
        WHERE delivery.occurrence_id=occurrence.occurrence_id
          AND delivery.consumer='fixagent-daemon' AND delivery.delivery_status='ACKED'
      )) ORDER BY occurrence.occ_seq
  `,[input.fingerprint,input.fingerprintVersion,input.occurrenceId]);
  return Object.freeze(result.rows);
}

export async function persistFolded(
  transaction: FixagentDeliveryTransaction,
  input: Readonly<{
    occurrenceId:string;fingerprint:string;fingerprintVersion:number;firstSeenAt:Date;
    lastSeenAt:Date;distinctWorkUnitCount:string;maxSeverity:string;sourceSet:readonly string[];
    policyRef:string;inputHash:string;decision:string;
  }>,
): Promise<void> {
  const client=state(transaction).client;
  await client.query(`
    INSERT INTO obs.incident (
      fingerprint,fingerprint_version,first_seen_at,last_seen_at,
      distinct_work_unit_count,max_severity,state,source_set
    ) VALUES ($1,$2,$3,$4,$5,$6,'NEW',$7::jsonb)
    ON CONFLICT (fingerprint,fingerprint_version) DO UPDATE SET
      first_seen_at=EXCLUDED.first_seen_at,last_seen_at=EXCLUDED.last_seen_at,
      distinct_work_unit_count=EXCLUDED.distinct_work_unit_count,
      max_severity=EXCLUDED.max_severity,source_set=EXCLUDED.source_set,
      updated_at=statement_timestamp()
  `,[input.fingerprint,input.fingerprintVersion,input.firstSeenAt,input.lastSeenAt,
    input.distinctWorkUnitCount,input.maxSeverity,JSON.stringify(input.sourceSet)]);
  await client.query(`
    INSERT INTO obs.policy_decision (occurrence_id,policy_ref,input_hash,decision)
    SELECT $1,$2,$3,$4 WHERE NOT EXISTS (
      SELECT 1 FROM obs.policy_decision
      WHERE occurrence_id=$1 AND policy_ref=$2 AND input_hash=$3 AND decision=$4
    )
  `,[input.occurrenceId,input.policyRef,input.inputHash,input.decision]);
}

export async function persistPoisonHealth(
  transaction: FixagentDeliveryTransaction,
  reason: string,
): Promise<void> {
  await state(transaction).client.query(`
    INSERT INTO obs.component_health (component,state,observed_at,detail_code)
    VALUES ('fixagent-daemon','POISON',statement_timestamp(),$1)
    ON CONFLICT (component) DO UPDATE SET state='POISON',observed_at=EXCLUDED.observed_at,
      detail_code=EXCLUDED.detail_code,updated_at=statement_timestamp()
  `,[reason]);
}

export async function persistSkipped(
  transaction: FixagentDeliveryTransaction,
  action: import("./agent-action-gateway.js").ChainedAgentActionInput,
): Promise<void> {
  const gateway=await import("./agent-action-gateway.js");
  await gateway.appendChainedAgentAction(transaction,action);
}

export async function persistPoisoned(
  transaction: FixagentDeliveryTransaction,
  action: import("./agent-action-gateway.js").ChainedAgentActionInput,
  reason:string,
): Promise<void> {
  const gateway=await import("./agent-action-gateway.js");
  await gateway.appendChainedAgentAction(transaction,action);
  await persistPoisonHealth(transaction,reason);
}

export async function acknowledgeDelivery(
  transaction: FixagentDeliveryTransaction,
  occurrenceId: string,
): Promise<void> {
  const client=state(transaction).client;
  const attempt=await client.query<{next_attempt:number}>(`
    SELECT coalesce(max(attempt_index),-1)+1 AS next_attempt
    FROM obs.delivery WHERE occurrence_id=$1 AND consumer='fixagent-daemon'
  `,[occurrenceId]);
  await client.query(`
    INSERT INTO obs.delivery (occurrence_id,consumer,attempt_index,lease_ref,delivery_status)
    SELECT $1,'fixagent-daemon',$2,$3,'ACKED' WHERE NOT EXISTS (
      SELECT 1 FROM obs.delivery WHERE occurrence_id=$1 AND consumer='fixagent-daemon'
        AND delivery_status='ACKED')
  `,[occurrenceId,attempt.rows[0]?.next_attempt??0,`fixagent-daemon:${occurrenceId}`]);
}

export async function readDeliveryCursor(transaction: FixagentDeliveryTransaction): Promise<bigint> {
  const result=await state(transaction).client.query<{last_occ_seq:string}>(`
    SELECT last_occ_seq::text FROM obs.consumer_cursor WHERE consumer='fixagent-daemon'
  `);
  return BigInt(result.rows[0]?.last_occ_seq??"0");
}

export async function advanceDeliveryCursor(transaction: FixagentDeliveryTransaction): Promise<bigint> {
  const client=state(transaction).client;
  await client.query(`INSERT INTO obs.consumer_cursor (consumer,last_occ_seq)
    VALUES ('fixagent-daemon',0) ON CONFLICT (consumer) DO NOTHING`);
  const current=await client.query<{last_occ_seq:string}>(`
    SELECT last_occ_seq::text FROM obs.consumer_cursor
    WHERE consumer='fixagent-daemon' FOR UPDATE`);
  const last=BigInt(current.rows[0]?.last_occ_seq??"0");
  const boundary=await client.query<{candidate:string}>(`
    SELECT coalesce((SELECT min(occurrence.occ_seq)-1 FROM obs.occurrence AS occurrence
      WHERE occurrence.occ_seq>$1 AND NOT EXISTS (SELECT 1 FROM obs.delivery AS delivery
        WHERE delivery.occurrence_id=occurrence.occurrence_id
          AND delivery.consumer='fixagent-daemon' AND delivery.delivery_status='ACKED')),
      (SELECT max(occ_seq) FROM obs.occurrence),$1)::text AS candidate
  `,[last.toString()]);
  const candidate=BigInt(boundary.rows[0]?.candidate??last.toString());
  const updated=await client.query<{last_occ_seq:string}>(`
    UPDATE obs.consumer_cursor SET last_occ_seq=greatest(last_occ_seq,$1),
      updated_at=statement_timestamp() WHERE consumer='fixagent-daemon'
    RETURNING last_occ_seq::text
  `,[candidate.toString()]);
  return BigInt(updated.rows[0]?.last_occ_seq??last.toString());
}

export function createFixagentDeliveryGeneration(
  databaseUrl: string,
): FixagentDeliveryGeneration {
  if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
    fail("FIX09_DELIVERY_DATABASE_URL");
  }
  const client: FixagentDeliveryClient = new pg.Client({ connectionString: databaseUrl });
  let activeTransaction=false;
  return Object.freeze({
    async connect(){await client.connect();},
    async listen(){await client.query("LISTEN obs_occurrence_inserted");},
    async tryLeadership(){const result=await client.query<{acquired:boolean}>(
      "SELECT pg_try_advisory_lock(hashtextextended('fixagent-daemon', 0)) AS acquired",
    );return result.rows[0]?.acquired===true;},
    async selectPending(){const result=await client.query<{occurrence_id:string}>(`
      SELECT occurrence.occurrence_id FROM obs.occurrence AS occurrence
      WHERE NOT EXISTS (SELECT 1 FROM obs.delivery AS delivery
        WHERE delivery.occurrence_id=occurrence.occurrence_id
          AND delivery.consumer='fixagent-daemon' AND delivery.delivery_status='ACKED')
      ORDER BY CASE occurrence.severity WHEN 'FATAL' THEN 0 WHEN 'SEVERE' THEN 1
        WHEN 'DEGRADED' THEN 2 ELSE 3 END, occurrence.occurred_at ASC, occurrence.occ_seq ASC
      LIMIT 1
    `);return result.rows[0]?.occurrence_id;},
    async withDelivery<T>(occurrenceId:string,callback:(transaction:FixagentDeliveryTransaction)=>Promise<T>){
      if(activeTransaction)fail("FIX09_DELIVERY_TRANSACTION_NESTED");
      activeTransaction=true;
      const transaction=createTransaction(client);
      try{
        await client.query("BEGIN");
        await client.query(`SELECT pg_advisory_xact_lock(
          hashtextextended('fixagent-daemon:occurrence:' || $1::uuid::text,0))`,[occurrenceId]);
        const result=await callback(transaction);
        await client.query("COMMIT");
        return result;
      }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
      finally{invalidate(transaction);activeTransaction=false;}
    },
    onNotification(listener:(message:FixagentDeliveryNotification)=>void){
      client.on("notification",listener as (message:Notification)=>void);
    },
    onError(listener:(error:Error)=>void){client.on("error",listener);},
    onEnd(listener:()=>void){client.on("end",listener);},
    removeNotification(listener:(message:FixagentDeliveryNotification)=>void){
      client.removeListener("notification",listener as (message:Notification)=>void);
    },
    removeError(listener:(error:Error)=>void){client.removeListener("error",listener);},
    removeEnd(listener:()=>void){client.removeListener("end",listener);},
    async close(){await client.end();},
  });
}
