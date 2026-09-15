import { z } from "zod";
import { correlationKeySchema, type ObservationSignal } from "./signals.js";

export const signalLifecycleIdentitySchema = z.object({
  owner: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/u),
  correlationKey: correlationKeySchema
}).strict();

export type SignalLifecycleIdentity = Readonly<z.infer<typeof signalLifecycleIdentitySchema>>;

export type ReplayedOpenSignal = Readonly<{
  signal: ObservationSignal;
  lifecycle: SignalLifecycleIdentity | null;
}>;

export type ReplayedJournals = Readonly<{
  openSignals: readonly ReplayedOpenSignal[];
  deliveryResults: readonly import("./signals.js").DeliveryResultEnvelope[];
}>;
