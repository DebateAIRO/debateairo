import { types as utilTypes } from "node:util";
import type { Pool, PoolClient } from "pg";

import { normalizeSerializedSafeEnvelope } from "../envelope-contract.js";
import { isPostRedactionEnvelope, type PostRedactionEnvelope } from "../redactor.js";
import type { SafeRuntimeName } from "../safe-metadata.js";
import { tagJsonb } from "./canonical.js";
import {
  chainPartitionToken,
  occurrenceIdempotencyToken,
  sortUtf8,
} from "./locks.js";

export const CHAINED_OCCURRENCE_KEYS = Object.freeze([
  "occurred_at", "environment", "build_ref", "build_dirty", "runtime", "component",
  "capture_point", "code", "taxonomy_class", "severity", "condition_mark", "disposition",
  "fingerprint", "fingerprint_version", "redaction_policy_version", "allowlist_set_id",
  "fallback_minimized", "capture_status", "run_ref", "work_item_ref", "node_ref",
  "attempt_ref", "ledger_ref", "parent_occurrence_ref", "cause_relation",
  "cause_chain_codes", "at_seq_watermark", "frames", "safe_template_id",
  "template_parameters", "source", "source_event_ref", "zone_context", "attempt_index",
  "writer_identity", "spool_receipt",
] as const);

const ENVELOPE_KEYS = Object.freeze(CHAINED_OCCURRENCE_KEYS.filter(
  (key) => key !== "capture_status" && key !== "spool_receipt",
));

export interface ChainedOccurrenceInput {
  readonly occurred_at: string;
  readonly environment: string;
  readonly build_ref: string;
  readonly build_dirty: boolean;
  readonly runtime: SafeRuntimeName;
  readonly component: Readonly<{ process: string; package: string }>;
  readonly capture_point: string;
  readonly code: string;
  readonly taxonomy_class: string;
  readonly severity: string;
  readonly condition_mark: string | null;
  readonly disposition: string;
  readonly fingerprint: string;
  readonly fingerprint_version: number;
  readonly redaction_policy_version: string;
  readonly allowlist_set_id: string;
  readonly fallback_minimized: boolean;
  readonly capture_status: "PERSISTED" | "SPOOLED" | "GAP_RECONSTRUCTED";
  readonly run_ref: string;
  readonly work_item_ref: string;
  readonly node_ref: string;
  readonly attempt_ref: string;
  readonly ledger_ref: string;
  readonly parent_occurrence_ref: string;
  readonly cause_relation: string | null;
  readonly cause_chain_codes: readonly string[];
  readonly at_seq_watermark: string;
  readonly frames: readonly unknown[];
  readonly safe_template_id: string;
  readonly template_parameters: Readonly<Record<string, string | number>>;
  readonly source: "first_party" | "hatchet" | "ui_client";
  readonly source_event_ref: string;
  readonly zone_context: boolean;
  readonly attempt_index: number | null;
  readonly writer_identity: string;
  readonly spool_receipt: null | Readonly<{ source: string; spool_ref: string }>;
}

export interface ChainedOccurrenceResult {
  readonly occurrence_id: string;
  readonly occ_seq: string;
  readonly capture_status: string;
}

let configuredPool: Pool | undefined;

function fail(code: string): never {
  throw new TypeError(code);
}

function descriptors(value: object, code: string): Readonly<Record<string, PropertyDescriptor>> {
  if (utilTypes.isProxy(value)) fail(code);
  const result = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(result)) {
    if (!("value" in descriptor) || !descriptor.enumerable) fail(code);
  }
  return result;
}

function cloneFrozen(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("FIX09_OCCURRENCE_VALUE");
    return value;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value) || seen.has(value)) {
    fail("FIX09_OCCURRENCE_VALUE");
  }
  if (!Object.isFrozen(value)) fail("FIX09_OCCURRENCE_MUTABLE");
  seen.add(value);
  try {
    const own = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length !== 0) fail("FIX09_OCCURRENCE_SYMBOL");
    if (Array.isArray(value)) {
      const names = Object.keys(own).filter((name) => name !== "length");
      if (names.length !== value.length || names.some((name, index) => name !== String(index))) {
        fail("FIX09_OCCURRENCE_VALUE");
      }
      return Object.freeze(names.map((name) => {
        const descriptor = own[name];
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
          return fail("FIX09_OCCURRENCE_VALUE");
        }
        return cloneFrozen(descriptor.value, seen);
      }));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) fail("FIX09_OCCURRENCE_VALUE");
    const output = Object.create(null) as Record<string, unknown>;
    for (const name of Object.keys(own)) {
      const descriptor = own[name];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        fail("FIX09_OCCURRENCE_VALUE");
      }
      Object.defineProperty(output, name, {
        enumerable: true,
        value: cloneFrozen(descriptor.value, seen),
      });
    }
    return Object.freeze(output);
  } finally {
    seen.delete(value);
  }
}

function materialize(
  envelope: PostRedactionEnvelope,
  captureStatus: ChainedOccurrenceInput["capture_status"],
): ChainedOccurrenceInput {
  if (utilTypes.isProxy(envelope) || !Object.isFrozen(envelope)) fail("FIX09_OCCURRENCE_MUTABLE");
  const source = descriptors(envelope, "FIX09_OCCURRENCE_DESCRIPTOR");
  const stringNames = Object.keys(source);
  if (
    stringNames.length !== ENVELOPE_KEYS.length ||
    ENVELOPE_KEYS.some((key) => !Object.hasOwn(source, key))
  ) {
    fail("FIX09_OCCURRENCE_FIELDS");
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of CHAINED_OCCURRENCE_KEYS) {
    let value: unknown;
    if (key === "capture_status") value = captureStatus;
    else if (key === "spool_receipt") {
      value = captureStatus === "SPOOLED"
        ? Object.freeze(Object.assign(Object.create(null), {
            source: source.source?.value,
            spool_ref: source.source_event_ref?.value,
          }))
        : null;
    } else {
      const descriptor = source[key];
      if (descriptor === undefined || !("value" in descriptor)) fail("FIX09_OCCURRENCE_FIELDS");
      value = typeof descriptor.value === "object" && descriptor.value !== null
        ? cloneFrozen(descriptor.value)
        : descriptor.value;
    }
    Object.defineProperty(output, key, { enumerable: true, value });
  }
  return Object.freeze(output) as unknown as ChainedOccurrenceInput;
}

export function materializeDirectOccurrence(envelope: PostRedactionEnvelope): ChainedOccurrenceInput {
  if (utilTypes.isProxy(envelope) || !isPostRedactionEnvelope(envelope)) {
    fail("FIX09_OCCURRENCE_ORIGIN");
  }
  return materialize(envelope, "PERSISTED");
}

export function materializeSpooledOccurrence(
  value: unknown,
  runtime: SafeRuntimeName,
): ChainedOccurrenceInput {
  const normalized = normalizeSerializedSafeEnvelope(value, runtime);
  if (normalized === undefined) fail("FIX09_OCCURRENCE_ORIGIN");
  return materialize(normalized, "SPOOLED");
}

export function configureOccurrenceGatewayForTest(pool: Pool): void {
  configuredPool = pool;
}

export function configureOccurrenceGateway(pool: Pool): void {
  if (configuredPool !== undefined && configuredPool !== pool) {
    fail("FIX09_OCCURRENCE_GATEWAY_ALREADY_CONFIGURED");
  }
  configuredPool = pool;
}

function occurrenceSemantic(input: ChainedOccurrenceInput): readonly unknown[] {
  const fields = Object.freeze([
    input.occurred_at, input.environment, input.build_ref, input.build_dirty, input.runtime,
    tagJsonb(input.component), input.capture_point, input.code, input.taxonomy_class,
    input.severity, input.condition_mark, input.disposition, input.fingerprint,
    String(input.fingerprint_version), input.redaction_policy_version, input.allowlist_set_id,
    input.fallback_minimized,
    input.capture_status === "GAP_RECONSTRUCTED" ? "GAP_RECONSTRUCTED" : "ORIGINAL",
    input.run_ref, input.work_item_ref, input.node_ref, input.attempt_ref, input.ledger_ref,
    input.parent_occurrence_ref, input.cause_relation, input.at_seq_watermark,
    tagJsonb(input.frames), input.safe_template_id, tagJsonb(input.template_parameters),
    input.source, input.source_event_ref, input.zone_context,
    input.attempt_index === null ? null : String(input.attempt_index), input.writer_identity,
  ]);
  return Object.freeze([
    "obs-occurrence-idempotency/v2",
    fields,
    Object.freeze(["detail_present", input.cause_chain_codes.length > 0]),
  ]);
}

function occurrenceDetail(input: ChainedOccurrenceInput): unknown {
  return input.cause_chain_codes.length === 0
    ? null
    : Object.freeze([
        "obs-occurrence-detail-idempotency/v1",
        tagJsonb(input.frames),
        tagJsonb(input.cause_chain_codes),
        tagJsonb(input.template_parameters),
      ]);
}

async function lock(client: PoolClient, token: string): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",
    [token],
  );
}

function validateInput(input: ChainedOccurrenceInput): void {
  if (utilTypes.isProxy(input) || !Object.isFrozen(input) || Object.getPrototypeOf(input) !== null) {
    fail("FIX09_OCCURRENCE_INPUT");
  }
  if (Object.getOwnPropertySymbols(input).length !== 0) fail("FIX09_OCCURRENCE_INPUT");
  if (Object.keys(input).some((key, index) => key !== CHAINED_OCCURRENCE_KEYS[index])) {
    fail("FIX09_OCCURRENCE_INPUT");
  }
  if (
    (input.capture_status === "SPOOLED") !== (input.spool_receipt !== null) ||
    (input.spool_receipt !== null && (
      input.spool_receipt.source !== input.source ||
      input.spool_receipt.spool_ref !== input.source_event_ref
    ))
  ) {
    fail("FIX09_OCCURRENCE_RECEIPT");
  }
  occurrenceSemantic(input);
  occurrenceDetail(input);
}

async function insertLegacy(
  client: PoolClient,
  input: ChainedOccurrenceInput,
): Promise<ChainedOccurrenceResult> {
  const generated = await client.query<{ occurrence_id: string; occ_seq: string; captured_at: string }>(`
    SELECT gen_random_uuid()::text AS occurrence_id,
      obs.occurrence_seq_nextval_notify()::text AS occ_seq,
      to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS captured_at
  `);
  const row = generated.rows[0];
  if (row === undefined) fail("FIX09_OCCURRENCE_ALLOCATION");
  const columns = [
    "occurrence_id","occ_seq","prev_link","occurred_at","captured_at","environment","build_ref",
    "build_dirty","runtime","component","capture_point","code","taxonomy_class","severity",
    "condition_mark","disposition","fingerprint","fingerprint_version","redaction_policy_version",
    "allowlist_set_id","fallback_minimized","capture_status","run_ref","work_item_ref","node_ref",
    "attempt_ref","ledger_ref","parent_occurrence_ref","cause_relation","at_seq_watermark","frames",
    "safe_template_id","template_parameters","source","source_event_ref","zone_context","attempt_index",
    "writer_identity","chain_version","chain_key_id","chain_seq","chain_signature","chain_link",
  ];
  const values = [
    row.occurrence_id,row.occ_seq,null,input.occurred_at,row.captured_at,input.environment,input.build_ref,
    input.build_dirty,input.runtime,JSON.stringify(input.component),input.capture_point,input.code,
    input.taxonomy_class,input.severity,input.condition_mark,input.disposition,input.fingerprint,
    input.fingerprint_version,input.redaction_policy_version,input.allowlist_set_id,input.fallback_minimized,
    input.capture_status,input.run_ref,input.work_item_ref,input.node_ref,input.attempt_ref,input.ledger_ref,
    input.parent_occurrence_ref,input.cause_relation,input.at_seq_watermark,JSON.stringify(input.frames),
    input.safe_template_id,JSON.stringify(input.template_parameters),input.source,input.source_event_ref,
    input.zone_context,input.attempt_index,input.writer_identity,null,null,null,null,null,
  ];
  await client.query(
    `INSERT INTO obs.occurrence (${columns.join(",")}) VALUES (${values.map((_, index) => `$${index + 1}`).join(",")})`,
    values,
  );
  if (input.cause_chain_codes.length > 0) {
    await client.query(`INSERT INTO obs.occurrence_detail
      (occurrence_id,normalized_frames,cause_chain_codes,template_parameters)
      VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb)`,[
      row.occurrence_id,JSON.stringify(input.frames),JSON.stringify(input.cause_chain_codes),
      JSON.stringify(input.template_parameters),
    ]);
  }
  if (input.spool_receipt !== null) {
    await client.query(`INSERT INTO obs.spool_receipt(source,spool_ref,occurrence_id)
      VALUES ($1,$2,$3)`,[input.spool_receipt.source,input.spool_receipt.spool_ref,row.occurrence_id]);
  }
  return Object.freeze({
    capture_status: input.capture_status,
    occ_seq: row.occ_seq,
    occurrence_id: row.occurrence_id,
  });
}

export async function appendChainedOccurrences(
  inputs: readonly ChainedOccurrenceInput[],
): Promise<readonly ChainedOccurrenceResult[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) return Object.freeze([]);
  for (const input of inputs) validateInput(input);
  const identityKeys = inputs.map((input) => `${input.source}\0${input.source_event_ref}`);
  if (new Set(identityKeys).size !== identityKeys.length) fail("FIX09_OCCURRENCE_DUPLICATE_INPUT");
  const pool = configuredPool;
  if (pool === undefined) fail("FIX09_OCCURRENCE_GATEWAY_UNCONFIGURED");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const token of sortUtf8(inputs.map((input) =>
      occurrenceIdempotencyToken(input.source,input.source_event_ref)))) await lock(client,token);

    const results = new Map<string, ChainedOccurrenceResult>();
    const pending: ChainedOccurrenceInput[] = [];
    for (const input of inputs) {
      const probe = await client.query<{
        probe_status: "MATCH" | "CONFLICT";
        occurrence_id: string | null;
        occ_seq: string | null;
        stored_capture_status: string | null;
      }>("SELECT * FROM obs.audit_chain_probe_occurrence($1,$2,$3::jsonb,$4::jsonb)",[
        input.source,input.source_event_ref,JSON.stringify(occurrenceSemantic(input)),
        JSON.stringify(occurrenceDetail(input)),
      ]);
      const row = probe.rows[0];
      const key = `${input.source}\0${input.source_event_ref}`;
      if (row === undefined) pending.push(input);
      else if (row.probe_status === "MATCH" && row.occurrence_id !== null && row.occ_seq !== null && row.stored_capture_status !== null) {
        results.set(key,Object.freeze({
          capture_status: row.stored_capture_status,
          occ_seq: row.occ_seq,
          occurrence_id: row.occurrence_id,
        }));
      } else fail("FIX09_OCCURRENCE_CONFLICT");
    }
    const activation = await client.query("SELECT activation_manifest_sha256 FROM obs.audit_chain_activation WHERE singleton");
    if (activation.rowCount !== 0) fail("FIX09_SIGNER_REQUIRED");
    for (const token of sortUtf8([...new Set(pending.map((input) =>
      chainPartitionToken("occurrence",input.source,input.writer_identity))) ])) await lock(client,token);
    for (const input of pending) {
      const value = await insertLegacy(client,input);
      results.set(`${input.source}\0${input.source_event_ref}`,value);
    }
    await client.query("COMMIT");
    return Object.freeze(inputs.map((input) => {
      const value = results.get(`${input.source}\0${input.source_event_ref}`);
      if (value === undefined) return fail("FIX09_OCCURRENCE_RESULT");
      return value;
    }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
