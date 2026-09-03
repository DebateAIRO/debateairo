import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  OBSERVATION_COMPONENTS,
  STATUS_STATES,
  STATUS_UNITS,
  STATUS_VIEW_PATTERN
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
  }).strict()
]);

export const storedModuleStatusProjectionSchema = z.union([
  stateProjectionSchema,
  metricProjectionSchema,
  timestampProjectionSchema,
  templateProjectionSchema
]);

const moduleStatusSchema = z.record(
  z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/u),
  z.array(storedModuleStatusProjectionSchema).max(128).superRefine((projections, context) => {
    const keys = new Set<string>();
    for (const [index, projection] of projections.entries()) {
      if (keys.has(projection.key)) {
        context.addIssue({ code: "custom", message: "OBSERVATION_STATUS_DUPLICATE_KEY", path: [index, "key"] });
      }
      keys.add(projection.key);
    }
  })
).superRefine((modules, context) => {
  if (Object.keys(modules).length > 32) {
    context.addIssue({ code: "custom", message: "OBSERVATION_STATUS_TOO_MANY_MODULES" });
  }
});

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
