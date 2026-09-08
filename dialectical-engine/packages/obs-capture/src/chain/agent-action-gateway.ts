import { types as utilTypes } from "node:util";

import { tagJsonb } from "./canonical.js";
import {
  executeFixagentActionOperation,
  type ActionInsertValues,
  type FixagentDeliveryTransaction,
} from "./fixagent-delivery.js";
import { actionIdempotencyToken, chainPartitionToken } from "./locks.js";

const ACTION_KEYS = Object.freeze([
  "source", "writer_identity", "actor", "action_kind", "occurrence_id",
  "incident_id", "action_ref", "action_payload",
] as const);

export interface ChainedAgentActionInput {
  readonly source: "first_party" | "hatchet" | "ui_client" | "ops";
  readonly writer_identity: string;
  readonly actor: string;
  readonly action_kind: string;
  readonly occurrence_id: string | null;
  readonly incident_id: string | null;
  readonly action_ref: string;
  readonly action_payload: Readonly<Record<string, unknown>>;
}

export interface ChainedAgentActionResult {
  readonly agent_action_id: string;
  readonly action_seq: string;
}

function fail(code: string): never {
  throw new TypeError(code);
}

function clonePayload(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("FIX09_ACTION_PAYLOAD");
    return value;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value) || seen.has(value)) {
    fail("FIX09_ACTION_PAYLOAD");
  }
  if (!Object.isFrozen(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    fail("FIX09_ACTION_PAYLOAD");
  }
  seen.add(value);
  try {
    const own = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      const names = Object.keys(own).filter((name) => name !== "length");
      if (names.length !== value.length || names.some((name,index) => name !== String(index))) {
        fail("FIX09_ACTION_PAYLOAD");
      }
      return Object.freeze(names.map((name) => {
        const descriptor = own[name];
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
          return fail("FIX09_ACTION_PAYLOAD");
        }
        return clonePayload(descriptor.value,seen);
      }));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) fail("FIX09_ACTION_PAYLOAD");
    const result = Object.create(null) as Record<string,unknown>;
    for (const name of Object.keys(own)) {
      const descriptor = own[name];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return fail("FIX09_ACTION_PAYLOAD");
      }
      Object.defineProperty(result,name,{enumerable:true,value:clonePayload(descriptor.value,seen)});
    }
    return Object.freeze(result);
  } finally {
    seen.delete(value);
  }
}

export function materializeAgentAction(input: ChainedAgentActionInput): ChainedAgentActionInput {
  if (input === null || typeof input !== "object" || utilTypes.isProxy(input)) {
    fail("FIX09_ACTION_INPUT");
  }
  if (Object.getOwnPropertySymbols(input).length !== 0) fail("FIX09_ACTION_INPUT");
  const own = Object.getOwnPropertyDescriptors(input);
  if (
    Object.keys(own).length !== ACTION_KEYS.length ||
    ACTION_KEYS.some((key) => !Object.hasOwn(own,key))
  ) fail("FIX09_ACTION_INPUT");
  const result = Object.create(null) as Record<string,unknown>;
  for (const key of ACTION_KEYS) {
    const descriptor = own[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      fail("FIX09_ACTION_INPUT");
    }
    Object.defineProperty(result,key,{enumerable:true,value:key === "action_payload"
      ? clonePayload(descriptor.value) : descriptor.value});
  }
  tagJsonb(result.action_payload);
  return Object.freeze(result) as unknown as ChainedAgentActionInput;
}

function validate(input: ChainedAgentActionInput): void {
  if (utilTypes.isProxy(input) || !Object.isFrozen(input) || Object.getPrototypeOf(input) !== null) {
    fail("FIX09_ACTION_INPUT");
  }
  if (Object.keys(input).some((key,index) => key !== ACTION_KEYS[index])) fail("FIX09_ACTION_INPUT");
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(input.writer_identity)) fail("FIX09_WRITER_IDENTITY");
  if (!new Set(["first_party","hatchet","ui_client","ops"]).has(input.source)) fail("FIX09_ACTION_SOURCE");
  tagJsonb(input.action_payload);
}

function semantic(input: ChainedAgentActionInput): readonly unknown[] {
  return Object.freeze([
    "obs-agent-action-idempotency/v1", input.source, input.writer_identity,input.actor,
    input.action_kind,input.occurrence_id,input.incident_id,tagJsonb(input.action_payload),
  ]);
}

export async function appendChainedAgentAction(
  transaction: FixagentDeliveryTransaction,
  input: ChainedAgentActionInput,
): Promise<ChainedAgentActionResult> {
  input=materializeAgentAction(input);
  validate(input);
  await executeFixagentActionOperation(transaction,{
    kind:"LOCK_ACTION_REF",token:actionIdempotencyToken(input.action_ref),
  });
  const probe = await executeFixagentActionOperation<{
    probe_status:"MATCH"|"CONFLICT";agent_action_id:string|null;action_seq:string|null;
  }>(transaction,{
    actionRef:input.action_ref,expected:JSON.stringify(semantic(input)),kind:"PROBE_ACTION",
  });
  const existing = probe.rows[0];
  if (existing !== undefined) {
    if (existing.probe_status === "MATCH" && existing.agent_action_id !== null && existing.action_seq !== null) {
      return Object.freeze({agent_action_id:existing.agent_action_id,action_seq:existing.action_seq});
    }
    return fail("FIX09_ACTION_CONFLICT");
  }
  const activation = await executeFixagentActionOperation(transaction,{kind:"READ_ACTIVATION"});
  if (activation.rowCount !== 0) fail("FIX09_SIGNER_REQUIRED");
  await executeFixagentActionOperation(transaction,{
    kind:"LOCK_CHAIN_PARTITION",token:chainPartitionToken("agent_action",input.source,input.writer_identity),
  });
  const allocated = await executeFixagentActionOperation<{
    agent_action_id:string;action_seq:string;occurred_at:string;
  }>(transaction,{kind:"ALLOCATE_ACTION"});
  const row = allocated.rows[0];
  if (row === undefined) fail("FIX09_ACTION_ALLOCATION");
  const values:ActionInsertValues={
    action_seq:row.action_seq,action_ref:input.action_ref,action_kind:input.action_kind,
    action_payload:JSON.stringify(input.action_payload),actor:input.actor,
    agent_action_id:row.agent_action_id,chain_key_id:null,chain_link:null,chain_seq:null,
    chain_signature:null,chain_version:null,incident_id:input.incident_id,occurred_at:row.occurred_at,
    occurrence_id:input.occurrence_id,prev_link:null,source:input.source,
    writer_identity:input.writer_identity,
  };
  const inserted = await executeFixagentActionOperation<ChainedAgentActionResult>(transaction,{
    kind:"INSERT_ACTION",values,
  });
  const result = inserted.rows[0];
  if (result === undefined) fail("FIX09_ACTION_RESULT");
  return Object.freeze({agent_action_id:result.agent_action_id,action_seq:result.action_seq});
}
