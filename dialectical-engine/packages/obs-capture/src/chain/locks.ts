import type { QueryResult, QueryResultRow } from "pg";

const WRITER = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

export interface FixagentActionInsertValues {
  readonly action_seq: string;
  readonly action_ref: string;
  readonly action_kind: string;
  readonly action_payload: string;
  readonly actor: string;
  readonly agent_action_id: string;
  readonly chain_key_id: string | null;
  readonly chain_link: Buffer | null;
  readonly chain_seq: string | null;
  readonly chain_signature: Buffer | null;
  readonly chain_version: number | null;
  readonly incident_id: string | null;
  readonly occurred_at: string;
  readonly occurrence_id: string | null;
  readonly prev_link: Buffer | null;
  readonly source: string;
  readonly writer_identity: string;
}

export type FixagentActionOperation =
  | Readonly<{ kind: "LOCK_ACTION_REF"; token: string }>
  | Readonly<{ actionRef: string; expected: string; kind: "PROBE_ACTION" }>
  | Readonly<{ kind: "READ_ACTIVATION" }>
  | Readonly<{ kind: "LOCK_CHAIN_PARTITION"; token: string }>
  | Readonly<{ kind: "READ_ACTION_HEAD"; source: string; writerIdentity: string }>
  | Readonly<{ kind: "ALLOCATE_ACTION" }>
  | Readonly<{ kind: "INSERT_ACTION"; values: FixagentActionInsertValues }>;

type ActionExecutor = <T extends QueryResultRow>(
  operation: FixagentActionOperation,
) => Promise<QueryResult<T & Record<string, unknown>>>;

const actionExecutors = new WeakMap<object, ActionExecutor>();

function fail(code: string): never {
  throw new TypeError(code);
}

export function registerFixagentActionTransaction(transaction: object, executor: ActionExecutor): void {
  if (actionExecutors.has(transaction)) fail("FIX09_DELIVERY_TRANSACTION_INVALID");
  actionExecutors.set(transaction, executor);
}

export function invalidateFixagentActionTransaction(transaction: object): void {
  actionExecutors.delete(transaction);
}

export async function executeFixagentActionOperation<T extends QueryResultRow>(
  transaction: object,
  operation: FixagentActionOperation,
): Promise<QueryResult<T & Record<string, unknown>>> {
  const executor = actionExecutors.get(transaction) ?? fail("FIX09_DELIVERY_TRANSACTION_INVALID");
  return executor<T>(operation);
}

function lp(value: string): Buffer {
  if (typeof value !== "string") fail("FIX09_LOCK_VALUE");
  const bytes = Buffer.from(value, "utf8");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(bytes.length);
  return Buffer.concat([prefix, bytes]);
}

function token(domain: string, values: readonly string[]): string {
  return `${domain}:${Buffer.concat(values.map(lp)).toString("hex")}`;
}

export function occurrenceIdempotencyToken(source: string, sourceEventRef: string): string {
  return token("obs-audit-idempotency-occurrence/v1", [source, sourceEventRef]);
}

export function actionIdempotencyToken(actionRef: string): string {
  return token("obs-audit-idempotency-action/v1", [actionRef]);
}

export function chainPartitionToken(
  table: "occurrence" | "agent_action",
  source: string,
  writerIdentity: string,
): string {
  if (!WRITER.test(writerIdentity)) fail("FIX09_WRITER_IDENTITY");
  return token("obs-audit-chain-lock/v1", [table, source, writerIdentity]);
}

export function sortUtf8(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))));
}
