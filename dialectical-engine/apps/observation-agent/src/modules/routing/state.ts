import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ObservationError } from "../../core/errors.js";
import { deliverySchema, signalSchema } from "../../core/signals.js";

const channelSchema = z.enum(["osascript", "sendmail", "kanban"]);
const attemptSchema = z.object({
  channel: channelSchema,
  ordinal: z.number().int().nonnegative(),
  purpose: z.literal("STORM_SUMMARY").optional(),
  disposition: z.enum(["EXECUTE", "MUTED", "RATE_LIMITED"]),
  state: z.enum(["PENDING", "DELIVERED", "FAILED", "MUTED", "RATE_LIMITED"]),
  attempted_at: z.iso.datetime(),
  external_ref: z.string().max(128).nullable()
}).strict();
const openSchema = z.object({
  signal: signalSchema,
  closed: z.boolean(),
  attempts: z.array(attemptSchema).max(32),
  fatal_resends: z.number().int().nonnegative(),
  severe_email_sent: z.boolean(),
  acknowledged_at: z.iso.datetime().nullable()
}).strict();
const keyNotificationSchema = z.object({
  at: z.iso.datetime(),
  severity: z.enum(["INFO", "DEGRADED", "SEVERE", "FATAL"])
}).strict();
const lastDeliverySchema = deliverySchema.pick({
  channel: true,
  attempted_at: true,
  delivered_at: true,
  outcome: true,
  external_ref: true
});
const stormComponentSchema = z.enum([
  "docker", "postgres", "hatchet", "api", "ui", "tls_front_door"
]);
const latestStormSchema = z.object({
  root_component: stormComponentSchema,
  member_signal_ids: z.array(z.uuid()).min(5).max(17)
    .refine((values) => new Set(values).size === values.length),
  summary_signal_id: z.uuid(),
  summary_count: z.number().int().min(5).max(17),
  window_started_at: z.iso.datetime(),
  window_ends_at: z.iso.datetime(),
  fifth_detected_at: z.iso.datetime(),
  summary_delivered_at: z.iso.datetime().nullable(),
  digest_written: z.boolean(),
  state: z.enum(["COLLECTING", "STORM_SUMMARY_SENT", "QUIET"])
}).strict();
const routingStateSchema = z.object({
  schema_version: z.literal(1),
  opens: z.record(z.uuid(), openSchema),
  key_notifications: z.record(z.string().min(1).max(128), keyNotificationSchema),
  last_deliveries: z.partialRecord(channelSchema, lastDeliverySchema),
  latest_ack_signal_id: z.uuid().nullable(),
  latest_storm: latestStormSchema.nullable().default(null)
}).strict();

export type RoutingAttempt = z.infer<typeof attemptSchema>;
export type RoutingOpen = z.infer<typeof openSchema>;
export type RoutingStorm = z.infer<typeof latestStormSchema>;
export type RoutingState = z.infer<typeof routingStateSchema>;

const FILE_NAME = "routing-state.json";

export function emptyRoutingState(): RoutingState {
  return routingStateSchema.parse({
    schema_version: 1,
    opens: {},
    key_notifications: {},
    last_deliveries: {},
    latest_ack_signal_id: null,
    latest_storm: null
  });
}

export async function readRoutingState(stateDir: string): Promise<RoutingState> {
  try {
    return routingStateSchema.parse(JSON.parse(await readFile(join(stateDir, FILE_NAME), "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return emptyRoutingState();
    }
    throw new ObservationError("OBSERVATION_ROUTING_STATE_INVALID", error);
  }
}

export async function writeRoutingState(stateDir: string, input: RoutingState): Promise<void> {
  const state = routingStateSchema.parse(input);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const temporary = join(stateDir, `.${FILE_NAME}.${process.pid}.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "w", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, join(stateDir, FILE_NAME));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
