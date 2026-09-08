import { types as utilTypes } from "node:util";

import {
  canonicalRowBytes,
  chainLink,
  genesisLink,
  signatureMessage,
  tagJsonb,
} from "./canonical.js";
import type { FixagentDeliveryTransaction } from "./fixagent-delivery.js";
import {
  actionIdempotencyToken,
  chainPartitionToken,
  executeFixagentActionOperation,
  type FixagentActionInsertValues,
} from "./locks.js";
import { assertPreActivationSignerAbsent, getReleasedSigner } from "./signer.js";

const ACTION_KEYS = Object.freeze([
  "source", "writer_identity", "actor", "action_kind", "occurrence_id",
  "incident_id", "action_ref", "action_payload",
] as const);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

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
  if (input === null || typeof input !== "object" || utilTypes.isProxy(input) ||
      !Object.isFrozen(input) || Object.getPrototypeOf(input) !== null) {
    fail("FIX09_ACTION_INPUT");
  }
  if (Object.getOwnPropertySymbols(input).length !== 0) fail("FIX09_ACTION_INPUT");
  const own = Object.getOwnPropertyDescriptors(input);
  const keys = Object.keys(own);
  if (keys.length !== ACTION_KEYS.length || keys.some((key,index) => key !== ACTION_KEYS[index]) ||
      ACTION_KEYS.some((key) => {
        const descriptor = own[key];
        return descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable ||
          descriptor.configurable || descriptor.writable;
      })) fail("FIX09_ACTION_INPUT");
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(input.writer_identity)) fail("FIX09_WRITER_IDENTITY");
  if (!new Set(["first_party","hatchet","ui_client","ops"]).has(input.source)) fail("FIX09_ACTION_SOURCE");
  if ((input.source === "ops") !== (input.writer_identity === "obsctl") ||
      (input.source !== "ops" && input.writer_identity !== "fixagent-daemon")) {
    fail("FIX09_ACTION_AUTHORIZATION");
  }
  for (const value of [input.actor, input.action_kind, input.action_ref]) {
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.length > 1024) {
      fail("FIX09_ACTION_INPUT");
    }
  }
  for (const value of [input.occurrence_id, input.incident_id]) {
    if (value !== null && (typeof value !== "string" || !UUID.test(value))) fail("FIX09_ACTION_INPUT");
  }
  clonePayload(input.action_payload);
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
  const activation = await executeFixagentActionOperation<{activation_manifest_sha256:Buffer}>(
    transaction,{kind:"READ_ACTIVATION"},
  );
  const activationDigest=activation.rows[0]?.activation_manifest_sha256;
  if (activationDigest === undefined) assertPreActivationSignerAbsent();
  await executeFixagentActionOperation(transaction,{
    kind:"LOCK_CHAIN_PARTITION",token:chainPartitionToken("agent_action",input.source,input.writer_identity),
  });
  const allocated = await executeFixagentActionOperation<{
    agent_action_id:string;action_seq:string;occurred_at:string;
  }>(transaction,{kind:"ALLOCATE_ACTION"});
  const row = allocated.rows[0];
  if (row === undefined) fail("FIX09_ACTION_ALLOCATION");
  let chainKeyId:null|string=null;
  let chainSequence:null|string=null;
  let previousLink:null|Buffer=null;
  let chainSignature:null|Buffer=null;
  let link:null|Buffer=null;
  if(activationDigest!==undefined){
    const signer=getReleasedSigner(
      "agent_action",input.source,input.writer_identity,activationDigest,
    );
    const head=await executeFixagentActionOperation<{
      chain_seq:string;chain_link:Buffer;chain_key_id:string;
    }>(transaction,{kind:"READ_ACTION_HEAD",source:input.source,writerIdentity:input.writer_identity});
    const prior=head.rows[0];
    chainSequence=prior===undefined?"1":(BigInt(prior.chain_seq)+1n).toString();
    previousLink=prior===undefined
      ?genesisLink("agent_action",input.source,input.writer_identity,activationDigest)
      :prior.chain_link;
    chainKeyId=signer.keyId;
    const canonical=canonicalRowBytes("agent_action",Object.freeze(Object.assign(Object.create(null),{
      chain_version:1,chain_key_id:chainKeyId,chain_seq:chainSequence,prev_link:previousLink,
      agent_action_id:row.agent_action_id,action_seq:row.action_seq,source:input.source,
      writer_identity:input.writer_identity,actor:input.actor,action_kind:input.action_kind,
      occurrence_id:input.occurrence_id,incident_id:input.incident_id,action_ref:input.action_ref,
      action_payload:input.action_payload,occurred_at:row.occurred_at,
    })) as Readonly<Record<string,unknown>>);
    chainSignature=signer.sign(signatureMessage(canonical));
    link=chainLink(canonical,chainSignature);
  }
  const values:FixagentActionInsertValues={
    action_seq:row.action_seq,action_ref:input.action_ref,action_kind:input.action_kind,
    action_payload:JSON.stringify(input.action_payload),actor:input.actor,
    agent_action_id:row.agent_action_id,chain_key_id:chainKeyId,chain_link:link,chain_seq:chainSequence,
    chain_signature:chainSignature,chain_version:activationDigest===undefined?null:1,
    incident_id:input.incident_id,occurred_at:row.occurred_at,
    occurrence_id:input.occurrence_id,prev_link:previousLink,source:input.source,
    writer_identity:input.writer_identity,
  };
  const inserted = await executeFixagentActionOperation<ChainedAgentActionResult>(transaction,{
    kind:"INSERT_ACTION",values,
  });
  const result = inserted.rows[0];
  if (result === undefined) fail("FIX09_ACTION_RESULT");
  return Object.freeze({agent_action_id:result.agent_action_id,action_seq:result.action_seq});
}
