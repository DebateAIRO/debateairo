import { randomUUID } from "node:crypto";
import { ObservationError } from "../core/errors.js";
import {
  deliveryAttemptEnvelopeSchema,
  deliverySchema,
  signalSchema,
  type ObservationDelivery,
  type ObservationSignal
} from "../core/signals.js";
import type { ObservationJournal } from "../journal/journal.js";

export type DeliveryExecutionResult = Readonly<{
  deliveredAt: Date;
  externalRef: string | null;
}>;

export type DeliveryMirror = Readonly<{
  mirrorDelivery(delivery: ObservationDelivery): Promise<void>;
}>;

export type DeliveryAction = Readonly<{
  signal: ObservationSignal;
  channel: ObservationDelivery["channel"];
  disposition: "EXECUTE" | "MUTED" | "RATE_LIMITED";
  now: Date;
  execute?: () => Promise<DeliveryExecutionResult>;
}>;

export class DeliveryCoordinator {
  private readonly journal: ObservationJournal;
  private readonly mirror: DeliveryMirror;

  constructor(input: Readonly<{ journal: ObservationJournal; mirror: DeliveryMirror }>) {
    this.journal = input.journal;
    this.mirror = input.mirror;
  }

  async attempt(action: DeliveryAction): Promise<ObservationDelivery> {
    if ((action.disposition === "EXECUTE" && typeof action.execute !== "function")
      || (action.disposition !== "EXECUTE" && action.execute !== undefined)) {
      throw new ObservationError("OBSERVATION_DELIVERY_ACTION_INVALID");
    }
    const signal = signalSchema.safeParse(action.signal);
    if (!signal.success
      || !["EXECUTE", "MUTED", "RATE_LIMITED"].includes(action.disposition)
      || !(action.now instanceof Date)
      || !Number.isFinite(action.now.getTime())) {
      throw new ObservationError("OBSERVATION_DELIVERY_ACTION_INVALID");
    }
    const deliveryId = randomUUID();
    const attemptedAt = action.now.toISOString();
    const attempt = deliveryAttemptEnvelopeSchema.safeParse({
      kind: "ATTEMPT",
      delivery_id: deliveryId,
      signal_id: signal.data.signal_id,
      channel: action.channel,
      attempted_at: attemptedAt
    });
    if (!attempt.success) {
      throw new ObservationError("OBSERVATION_DELIVERY_ACTION_INVALID", attempt.error);
    }

    await this.journal.appendDeliveryAttempt(attempt.data);

    let outcome: ObservationDelivery["outcome"] = action.disposition === "EXECUTE"
      ? "FAILED"
      : action.disposition;
    let deliveredAt: string | null = null;
    let externalRef: string | null = null;
    if (action.disposition === "EXECUTE") {
      try {
        const result = await action.execute!();
        deliveredAt = result.deliveredAt.toISOString();
        externalRef = result.externalRef;
        outcome = "DELIVERED";
      } catch {
        outcome = "FAILED";
        deliveredAt = null;
        externalRef = null;
      }
    }

    const delivery = deliverySchema.parse({
      delivery_id: deliveryId,
      signal_id: signal.data.signal_id,
      channel: action.channel,
      attempted_at: attemptedAt,
      delivered_at: deliveredAt,
      outcome,
      external_ref: externalRef
    });
    await this.journal.appendDeliveryResult({ kind: "RESULT", delivery });
    await this.mirror.mirrorDelivery(delivery).catch(() => undefined);
    return Object.freeze(delivery);
  }
}
