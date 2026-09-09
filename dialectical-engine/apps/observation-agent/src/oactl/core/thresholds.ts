import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { ObservationError } from "../../core/errors.js";
import { SEVERITIES, type Severity } from "../../core/signals.js";
import {
  OBSERVATION_COMPONENTS,
  SIGNAL_CLASSES,
  type ObservationComponent,
  type SignalClass
} from "../../core/types.js";

const positiveInteger = z.number().int().positive();
const routingKeySchema = z.string().refine((value) => {
  const separator = value.indexOf(".");
  const signalClass = separator === -1 ? value : value.slice(0, separator);
  const component = separator === -1 ? undefined : value.slice(separator + 1);
  return SIGNAL_CLASSES.includes(signalClass as never)
    && (component === undefined || OBSERVATION_COMPONENTS.includes(component as never));
}, "OBSERVATION_ROUTING_KEY_INVALID");
const routingSchema = z.record(routingKeySchema, z.enum(SEVERITIES)).superRefine((routing, context) => {
  const required = {
    INFRA_DOWN: "FATAL",
    INFRA_NOT_READY: "DEGRADED",
    INFRA_UNKNOWN: "SEVERE",
    AGENT_SELF: "SEVERE"
  } as const;
  for (const [key, value] of Object.entries(required)) {
    if (routing[key] !== value) {
      context.addIssue({ code: "custom", message: "OBSERVATION_ROUTING_REQUIRED", path: [key] });
    }
  }
});

interface ModuleThresholdObject {
  readonly [key: string]: ModuleThresholdValue;
}

type ModuleThresholdValue = string | number | boolean
  | readonly ModuleThresholdValue[] | ModuleThresholdObject;
const safeModuleString = z.string().min(1).max(512).regex(/^[A-Za-z0-9_@.:/+%=-]+$/u);
const moduleThresholdValueSchema: z.ZodType<ModuleThresholdValue> = z.lazy(() => z.union([
  z.number().finite(), z.boolean(), safeModuleString,
  z.array(moduleThresholdValueSchema),
  z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]*$/u), moduleThresholdValueSchema)
]));

export const thresholdPolicySchema = z.object({
  schema_version: z.literal(1),
  liveness: z.object({
    probe_interval_ms: positiveInteger.min(5_000),
    probe_timeout_ms: positiveInteger.max(2_000),
    open_after_failures: positiveInteger,
    clear_after_successes: positiveInteger
  }).strict(),
  notification: z.object({
    rate_limit_ms: positiveInteger,
    degraded_after_ms: positiveInteger,
    timeout_ms: positiveInteger.max(2_000)
  }).strict(),
  resources: z.object({
    cpu_percent_max: z.number().positive().max(2),
    rss_mb_max: positiveInteger.max(150),
    max_database_sessions: positiveInteger.max(2),
    statement_timeout_ms: positiveInteger.max(2_000)
  }).strict(),
  routing: routingSchema,
  modules: z.record(
    z.string().regex(/^[a-z][a-z0-9_-]*$/u),
    z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]*$/u), moduleThresholdValueSchema)
  ).optional()
}).strict();

export type ThresholdPolicy = z.infer<typeof thresholdPolicySchema>;

const appliedAtSchema = z.union([
  z.date(),
  z.iso.datetime().transform((value) => new Date(value))
]);

const ratifiedThresholdPolicySchema = z.object({
  version: positiveInteger,
  value: thresholdPolicySchema,
  sourceRef: z.string().min(1),
  ratifiedBy: z.string().min(1),
  appliedAt: appliedAtSchema
}).strict();

export type RatifiedThresholdPolicy = Readonly<{
  version: number;
  value: ThresholdPolicy;
  sourceRef: string;
  ratifiedBy: string;
  appliedAt: Date;
}>;

export function parseRatifiedThresholdPolicy(input: unknown): RatifiedThresholdPolicy {
  try {
    const policy = ratifiedThresholdPolicySchema.parse(input);
    return Object.freeze({ ...policy, value: Object.freeze(policy.value) });
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    throw new ObservationError("OBSERVATION_THRESHOLDS_INVALID", error);
  }
}

export function routeSeverity(
  policy: ThresholdPolicy,
  signalClass: SignalClass,
  component: ObservationComponent
): Severity {
  const severity = policy.routing[`${signalClass}.${component}`] ?? policy.routing[signalClass];
  if (severity === undefined) throw new ObservationError("OBSERVATION_ROUTING_UNRESOLVED");
  return severity;
}

type JsonObject = { [key: string]: unknown };

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeObjects(base: JsonObject, overlay: JsonObject): JsonObject {
  const merged: JsonObject = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = isObject(value) && isObject(merged[key])
      ? mergeObjects(merged[key], value)
      : value;
  }
  return merged;
}

async function readObject(path: string): Promise<JsonObject> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isObject(value)) throw new Error("not an object");
    return value;
  } catch (error) {
    throw new ObservationError("OBSERVATION_THRESHOLDS_INVALID", error);
  }
}

export async function loadMergedThresholdPolicy(input: Readonly<{
  defaultsDirectory: string;
  overrideFile?: string;
}>): Promise<ThresholdPolicy> {
  try {
    const files = (await readdir(input.defaultsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^OBS-[0-9]{2}\.json$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    if (files.length === 0) throw new Error("no defaults");
    let merged: JsonObject = {};
    for (const file of files) merged = mergeObjects(merged, await readObject(join(input.defaultsDirectory, file)));
    if (input.overrideFile !== undefined) {
      merged = mergeObjects(merged, await readObject(input.overrideFile));
    }
    return Object.freeze(thresholdPolicySchema.parse(merged));
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    throw new ObservationError("OBSERVATION_THRESHOLDS_INVALID", error);
  }
}

function scalarEntries(value: unknown, prefix = ""): Array<readonly [string, unknown]> {
  if (!isObject(value)) return [[prefix, value]];
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, child]) => scalarEntries(child, prefix.length === 0 ? key : `${prefix}.${key}`));
}

export function diffThresholdPolicies(
  previous: ThresholdPolicy,
  current: ThresholdPolicy
): readonly string[] {
  const previousValues = new Map(scalarEntries(previous));
  return Object.freeze(scalarEntries(current)
    .filter(([path, value]) => !Object.is(previousValues.get(path), value))
    .map(([path, value]) => `${path}: ${String(previousValues.get(path))} -> ${String(value)}`));
}

export async function reloadThresholdPolicy(
  repository: Readonly<{ readCurrent(): Promise<RatifiedThresholdPolicy> }>,
  current: RatifiedThresholdPolicy,
  onSuccessfulRead?: (policy: RatifiedThresholdPolicy) => Promise<void>
): Promise<RatifiedThresholdPolicy> {
  let reloaded: RatifiedThresholdPolicy;
  try {
    reloaded = await repository.readCurrent();
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    return current;
  }
  await onSuccessfulRead?.(reloaded);
  return reloaded;
}

async function configure(client: PoolClient): Promise<void> {
  await client.query("SET statement_timeout = 2000");
}

export class ThresholdRepository {
  readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async readCurrent(clientOverride?: PoolClient): Promise<RatifiedThresholdPolicy> {
    const client = clientOverride ?? await this.pool.connect();
    try {
      if (clientOverride === undefined) await configure(client);
      const result = await client.query<{
        version: number;
        value_json: unknown;
        source_ref: string;
        ratified_by: string;
        applied_at: Date;
      }>(`SELECT version,value_json,source_ref,ratified_by,applied_at
          FROM observation.threshold_policy ORDER BY version DESC LIMIT 1`);
      const row = result.rows[0];
      if (row === undefined) throw new ObservationError("OBSERVATION_THRESHOLDS_UNRESOLVED");
      let value: ThresholdPolicy;
      try {
        value = thresholdPolicySchema.parse(row.value_json);
      } catch (error) {
        throw new ObservationError("OBSERVATION_THRESHOLDS_INVALID", error);
      }
      return parseRatifiedThresholdPolicy({
        version: row.version,
        value,
        sourceRef: row.source_ref,
        ratifiedBy: row.ratified_by,
        appliedAt: row.applied_at
      });
    } finally {
      if (clientOverride === undefined) client.release();
    }
  }

  async apply(input: unknown, sourceRef: string, ratifiedBy: string): Promise<Readonly<{
    version: number;
    value: ThresholdPolicy;
    diff: readonly string[];
  }>> {
    let value: ThresholdPolicy;
    try {
      value = thresholdPolicySchema.parse(input);
    } catch (error) {
      throw new ObservationError("OBSERVATION_THRESHOLDS_INVALID", error);
    }
    if (sourceRef.trim().length === 0 || ratifiedBy.trim().length === 0) {
      throw new ObservationError("OBSERVATION_THRESHOLDS_SOURCE_INVALID");
    }
    const client = await this.pool.connect();
    try {
      await configure(client);
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(575701)");
      const currentResult = await client.query<{ version: number; value_json: unknown }>(
        "SELECT version,value_json FROM observation.threshold_policy ORDER BY version DESC LIMIT 1"
      );
      const current = currentResult.rows[0];
      const version = (current?.version ?? 0) + 1;
      const diff = current === undefined
        ? Object.freeze(["<none> -> configured"])
        : diffThresholdPolicies(thresholdPolicySchema.parse(current.value_json), value);
      await client.query(
        `INSERT INTO observation.threshold_policy(version,applied_at,ratified_by,source_ref,value_json)
         VALUES ($1,clock_timestamp(),$2,$3,$4)`,
        [version, ratifiedBy, sourceRef, value]
      );
      await client.query("COMMIT");
      return Object.freeze({ version, value: Object.freeze(value), diff });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
