import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ObservationError } from "../core/errors.js";
import {
  OBSERVATION_COMPONENTS,
  STATUS_CHANNELS,
  STATUS_STATES,
  STATUS_UNITS,
  STATUS_VIEW_PATTERN,
  type ModuleStatusProjection
} from "../core/types.js";

const componentStatusSchema = z.object({
  state: z.enum(STATUS_STATES),
  last_probe_at: z.iso.datetime().nullable(),
  last_ok_at: z.iso.datetime().nullable(),
  open_signal_ids: z.array(z.uuid())
}).strict();

const statusKeySchema = z.string().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/u);
const statusViewSchema = z.string().regex(STATUS_VIEW_PATTERN);
const stateProjectionSchema = z.object({
  kind: z.literal("state"),
  key: statusKeySchema,
  state: z.enum(STATUS_STATES),
  view: statusViewSchema.optional(),
  observed_at: z.iso.datetime().optional()
}).strict();
const metricProjectionSchema = z.object({
  kind: z.literal("metric"),
  key: statusKeySchema,
  value: z.number().finite(),
  unit: z.enum(STATUS_UNITS),
  view: statusViewSchema.optional(),
  observed_at: z.iso.datetime().optional()
}).strict();
const timestampProjectionSchema = z.object({
  kind: z.literal("timestamp"),
  key: statusKeySchema,
  value: z.iso.datetime().nullable(),
  view: statusViewSchema.optional()
}).strict();
const safeIdentifierSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u);
const endpointPathSchema = z.string().min(2).max(128)
  .regex(/^\/[a-z0-9][a-z0-9/_-]{0,127}$/u);
const stateSegmentSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u)
  .refine((value) => value !== "." && value !== "..");
const channelsProjectionSchema = z.object({
  kind: z.literal("channels"), key: statusKeySchema,
  channels: z.array(z.enum(STATUS_CHANNELS)).min(1).max(STATUS_CHANNELS.length)
    .superRefine((channels, context) => {
      if (new Set(channels).size !== channels.length) {
        context.addIssue({ code: "custom", message: "OBSERVATION_STATUS_CHANNEL_DUPLICATE" });
      }
    }).readonly(),
  view: statusViewSchema.optional()
}).strict();
const componentProjectionSchema = z.object({
  kind: z.literal("component"), key: statusKeySchema,
  component: z.enum(OBSERVATION_COMPONENTS), view: statusViewSchema.optional()
}).strict();
const uuidProjectionSchema = z.object({
  kind: z.literal("uuid"), key: statusKeySchema,
  value: z.uuid().nullable(), view: statusViewSchema.optional()
}).strict();
const identifierProjectionSchema = z.object({
  kind: z.literal("identifier"), key: statusKeySchema,
  identifier_type: z.enum(["board", "external_ref"]), value: safeIdentifierSchema,
  view: statusViewSchema.optional()
}).strict();
const loopbackEndpointProjectionSchema = z.object({
  kind: z.literal("loopback_endpoint"), key: statusKeySchema,
  port: z.number().int().min(1024).max(65_535), path: endpointPathSchema,
  view: statusViewSchema.optional()
}).strict();
const stateChildPathProjectionSchema = z.object({
  kind: z.literal("state_child_path"), key: statusKeySchema,
  segments: z.array(stateSegmentSchema).min(1).max(8).readonly(),
  view: statusViewSchema.optional()
}).strict();
const templateProjectionSchema = z.union([
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("EVALUATOR_UNBOUND_BY_REGISTER"), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("NO_SCHEDULE_RULED"), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("CAPTURE_NOT_WIRED"), count: z.number().int().nonnegative(),
    view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("SLOW_QUERIES_NOT_OBSERVABLE"), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("PROVIDER_LATENCY_NOT_OBSERVABLE"), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("COUNT_WINDOW_THRESHOLD"), count: z.number().int().positive(),
    window_minutes: z.number().finite().positive(), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("PERCENT_MINIMUM_THRESHOLD"),
    percent: z.number().finite().min(0).max(100), minimum: z.number().int().positive(),
    view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("RATIO_WINDOW_STATE"), numerator: z.number().int().nonnegative(),
    denominator: z.number().int().nonnegative(), window_minutes: z.number().finite().positive(),
    state: z.enum(STATUS_STATES), view: statusViewSchema.optional()
  }).strict().refine((projection) => projection.numerator <= projection.denominator, {
    message: "OBSERVATION_STATUS_RATIO_INVALID"
  }).refine((projection) => projection.denominator > 0
    || (projection.numerator === 0 && projection.state === "INSUFFICIENT_SAMPLE"), {
    message: "OBSERVATION_STATUS_RATIO_EMPTY_INVALID"
  }),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("DURATION_WINDOW_STATE"), value_seconds: z.number().finite().nonnegative(),
    window_minutes: z.number().finite().positive(), state: z.enum(STATUS_STATES),
    view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("COUNT_SECONDS_THRESHOLD"), count: z.number().int().nonnegative(),
    window_seconds: z.number().int().positive(), view: statusViewSchema.optional()
  }).strict()
]);

export const storedModuleStatusProjectionSchema = z.union([
  stateProjectionSchema,
  metricProjectionSchema,
  timestampProjectionSchema,
  channelsProjectionSchema,
  componentProjectionSchema,
  uuidProjectionSchema,
  identifierProjectionSchema,
  loopbackEndpointProjectionSchema,
  stateChildPathProjectionSchema,
  templateProjectionSchema
]);

export type StoredModuleStatusProjection = z.infer<typeof storedModuleStatusProjectionSchema>;

export function toStoredModuleStatusProjection(
  projection: ModuleStatusProjection
): StoredModuleStatusProjection {
  if (projection.kind === "state") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, state: projection.state,
      ...(projection.view === undefined ? {} : { view: projection.view }),
      ...(projection.observedAt === undefined ? {} : {
        observed_at: projection.observedAt.toISOString()
      })
    });
  }
  if (projection.kind === "metric") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, value: projection.value, unit: projection.unit,
      ...(projection.view === undefined ? {} : { view: projection.view }),
      ...(projection.observedAt === undefined ? {} : {
        observed_at: projection.observedAt.toISOString()
      })
    });
  }
  if (projection.kind === "timestamp") {
    return Object.freeze({
      kind: projection.kind, key: projection.key,
      value: projection.value?.toISOString() ?? null,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.kind === "channels") {
    return Object.freeze({
      kind: projection.kind, key: projection.key,
      channels: Object.freeze([...projection.channels]),
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.kind === "component") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, component: projection.component,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.kind === "uuid") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, value: projection.value,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.kind === "identifier") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, identifier_type: projection.identifierType,
      value: projection.value,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.kind === "loopback_endpoint") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, port: projection.port, path: projection.path,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.kind === "state_child_path") {
    return Object.freeze({
      kind: projection.kind, key: projection.key,
      segments: Object.freeze([...projection.segments]),
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.template === "CAPTURE_NOT_WIRED") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, template: projection.template,
      count: projection.count,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.template === "COUNT_WINDOW_THRESHOLD") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, template: projection.template,
      count: projection.count, window_minutes: projection.windowMinutes,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.template === "PERCENT_MINIMUM_THRESHOLD") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, template: projection.template,
      percent: projection.percent, minimum: projection.minimum,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.template === "RATIO_WINDOW_STATE") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, template: projection.template,
      numerator: projection.numerator, denominator: projection.denominator,
      window_minutes: projection.windowMinutes, state: projection.state,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.template === "DURATION_WINDOW_STATE") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, template: projection.template,
      value_seconds: projection.valueSeconds, window_minutes: projection.windowMinutes,
      state: projection.state,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  if (projection.template === "COUNT_SECONDS_THRESHOLD") {
    return Object.freeze({
      kind: projection.kind, key: projection.key, template: projection.template,
      count: projection.count, window_seconds: projection.windowSeconds,
      ...(projection.view === undefined ? {} : { view: projection.view })
    });
  }
  return Object.freeze({
    kind: projection.kind, key: projection.key, template: projection.template,
    ...(projection.view === undefined ? {} : { view: projection.view })
  });
}

const moduleStatusSchema = z.record(
  z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/u),
  z.array(storedModuleStatusProjectionSchema).max(128).superRefine((projections, context) => {
    const keys = new Set<string>();
    for (const [index, projection] of projections.entries()) {
      const identity = `${projection.view ?? ""}\u0000${projection.key}`;
      if (keys.has(identity)) {
        context.addIssue({ code: "custom", message: "OBSERVATION_STATUS_DUPLICATE_KEY", path: [index, "key"] });
      }
      keys.add(identity);
    }
  })
).superRefine((modules, context) => {
  if (Object.keys(modules).length > 32) {
    context.addIssue({ code: "custom", message: "OBSERVATION_STATUS_TOO_MANY_MODULES" });
  }
});

export function mergeModuleStatus(
  modules: ReadonlyMap<string, readonly StoredModuleStatusProjection[]>,
  routerOwner: string | null,
  routerStatus: readonly StoredModuleStatusProjection[]
): Readonly<Record<string, readonly StoredModuleStatusProjection[]>> {
  if (routerOwner === null && routerStatus.length > 0) {
    throw new ObservationError("OBSERVATION_STATUS_INVALID");
  }
  const candidate = Object.fromEntries([...modules.entries()].map(([moduleName, projections]) => [
    moduleName, [...projections]
  ]));
  if (routerOwner !== null && routerStatus.length > 0) {
    candidate[routerOwner] = [...(candidate[routerOwner] ?? []), ...routerStatus];
  }
  let parsed: z.infer<typeof moduleStatusSchema>;
  try {
    parsed = moduleStatusSchema.parse(candidate);
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    throw new ObservationError(
      error instanceof z.ZodError
        && error.issues.some((issue) => issue.message === "OBSERVATION_STATUS_DUPLICATE_KEY")
        ? "OBSERVATION_STATUS_DUPLICATE_KEY"
        : "OBSERVATION_STATUS_INVALID",
      error
    );
  }
  return Object.freeze(Object.fromEntries(Object.entries(parsed).map(([moduleName, projections]) => [
    moduleName,
    Object.freeze(projections.map((projection) => Object.freeze(projection)))
  ])));
}

export const statusSnapshotSchema = z.object({
  pid: z.number().int().positive(),
  version: z.string().min(1),
  thresholds_version: z.number().int().positive(),
  mute: z.object({ expires_at: z.iso.datetime(), component: z.enum(OBSERVATION_COMPONENTS).nullable() }).strict().nullable(),
  components: z.partialRecord(z.enum(OBSERVATION_COMPONENTS), componentStatusSchema),
  modules: moduleStatusSchema.optional()
}).strict();

export type StatusSnapshot = z.infer<typeof statusSnapshotSchema>;

export async function writeStatusSnapshot(stateDir: string, input: unknown): Promise<void> {
  const snapshot = statusSnapshotSchema.parse(input);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const destination = join(stateDir, "status.json");
  const temporary = join(stateDir, `status.json.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
