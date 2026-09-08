import {
  persistPoisoned,
  persistSkipped,
  type FixagentDeliveryTransaction,
} from "@debateai/obs-capture/chain/fixagent-delivery";
import type { PoisonReason, SkipReason } from "./intake.js";

interface TerminalOccurrence {
  readonly occurrenceId: string;
  readonly occSeq: bigint;
  readonly source: "first_party" | "hatchet" | "ui_client";
}

export async function appendSkipReceipt(
  transaction: FixagentDeliveryTransaction,
  occurrence: TerminalOccurrence,
  reason: SkipReason
): Promise<void> {
  const payload=Object.freeze(Object.assign(Object.create(null),{
    schema:"fixagent-skip/v1",reason,occ_seq:occurrence.occSeq.toString(),
  }));
  await persistSkipped(transaction,{
    source:occurrence.source,writer_identity:"fixagent-daemon",actor:"fixagent-daemon",
    action_kind:"FIXAGENT_SKIPPED",occurrence_id:occurrence.occurrenceId,incident_id:null,
    action_ref:`fixagent-skip:${occurrence.occurrenceId}`,action_payload:payload,
  });
}

export async function appendPoisonReceipt(
  transaction: FixagentDeliveryTransaction,
  occurrence: TerminalOccurrence,
  reason: PoisonReason
): Promise<void> {
  const payload=Object.freeze(Object.assign(Object.create(null),{
    schema:"fixagent-dead-letter/v1",reason,occ_seq:occurrence.occSeq.toString(),
  }));
  await persistPoisoned(transaction,{
    source:occurrence.source,writer_identity:"fixagent-daemon",actor:"fixagent-daemon",
    action_kind:"FIXAGENT_DEAD_LETTER",occurrence_id:occurrence.occurrenceId,incident_id:null,
    action_ref:`fixagent-dead-letter:${occurrence.occurrenceId}`,action_payload:payload,
  },reason);
}
