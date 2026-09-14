import {
  advanceDeliveryCursor,
  readDeliveryCursor,
  type FixagentDeliveryTransaction,
} from "@debateai/obs-capture/chain/fixagent-delivery";

export const FIXAGENT_CONSUMER = "fixagent-daemon" as const;

export function readCursor(transaction: FixagentDeliveryTransaction): Promise<bigint> {
  return readDeliveryCursor(transaction);
}

export function advanceContiguousCursor(
  transaction: FixagentDeliveryTransaction,
): Promise<bigint> {
  return advanceDeliveryCursor(transaction);
}
