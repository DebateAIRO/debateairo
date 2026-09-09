import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ObservationError } from "./errors.js";
import { OBSERVATION_COMPONENTS, type ModuleConfigurationObject, type ModuleTargetFragment } from "./types.js";

const componentSchema = z.enum(OBSERVATION_COMPONENTS);
const expectedSchema = z.enum(["always", "when_dev_stack", "never"]);
const safePath = z.string().min(1).max(1_024)
  .regex(/^[A-Za-z0-9_@+./-]+$/u)
  .refine((value) => !value.split("/").includes(".."));
const dockerTargetSchema = z.object({
  component: componentSchema,
  kind: z.literal("docker")
}).strict();
const selfTargetSchema = z.object({
  component: z.literal("observation_agent"),
  kind: z.literal("self")
}).strict();
const postgresTargetSchema = z.object({
  component: z.literal("postgres"),
  kind: z.literal("postgres"),
  host: z.string().min(1),
  port: z.number().int().positive().max(65_535),
  container: z.string().min(1)
}).strict();
const hatchetTargetSchema = z.object({
  component: z.literal("hatchet"),
  kind: z.literal("hatchet"),
  live_url: z.string().url(),
  ready_url: z.string().url(),
  container: z.string().min(1)
}).strict();
const httpTargetSchema = z.object({
  component: componentSchema,
  kind: z.literal("http"),
  live_url: z.string().url(),
  expected: expectedSchema.optional()
}).strict();
const processTargetSchema = z.object({
  component: componentSchema,
  kind: z.literal("process"),
  command_contains: safePath,
  expected: expectedSchema
}).strict();
const factTargetSchema = z.object({
  component: z.literal("evaluator_worker"),
  kind: z.literal("fact"),
  fact: z.literal("UNBOUND_BY_REGISTER"),
  expected: z.literal("never")
}).strict();
const spoolDirectoryTargetSchema = z.object({
  component: z.literal("spool"),
  kind: z.literal("spool_directory"),
  path: safePath
}).strict();
const certificateTargetSchema = z.object({
  component: z.literal("tls_front_door"),
  kind: z.literal("certificate"),
  path: safePath
}).strict();
const hatchetMetricsTargetSchema = z.object({
  component: z.literal("hatchet"),
  kind: z.literal("hatchet_metrics"),
  rest_url: z.string().url(),
  prometheus_url: z.string().url().optional()
}).strict();

export const observationTargetSchema = z.discriminatedUnion("kind", [
  dockerTargetSchema, selfTargetSchema, postgresTargetSchema, hatchetTargetSchema, httpTargetSchema,
  processTargetSchema, factTargetSchema, spoolDirectoryTargetSchema, certificateTargetSchema,
  hatchetMetricsTargetSchema
]);

const notifySchema = z.object({
  sendmail_path: safePath,
  dev_capture_dir: safePath,
  from: z.string().min(3).max(320).regex(/^[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+$/u),
  to: z.string().min(3).max(320).regex(/^[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+$/u)
}).strict();

const targetFragmentSchema = z.object({
  schema_version: z.literal(1),
  targets: z.array(observationTargetSchema).max(64),
  notify: notifySchema.optional()
}).strict();

export type ObservationTarget = z.infer<typeof observationTargetSchema>;
export type PostgresTarget = z.infer<typeof postgresTargetSchema>;
export type HatchetTarget = z.infer<typeof hatchetTargetSchema>;

export type ObservationTargetCatalog = Readonly<{
  targets: readonly ObservationTarget[];
  fragments: readonly ModuleTargetFragment[];
}>;

function fragmentConfiguration(
  fragment: z.infer<typeof targetFragmentSchema>
): ModuleConfigurationObject {
  return Object.freeze({
    ...(fragment.notify === undefined ? {} : { notify: Object.freeze(fragment.notify) })
  });
}

export async function loadObservationTargetCatalog(directory: string): Promise<ObservationTargetCatalog> {
  try {
    const basenames = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^OBS-[0-9]{2}\.json$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const targets: ObservationTarget[] = [];
    const fragments: ModuleTargetFragment[] = [];
    const targetIdentities = new Set<string>();
    const configurationOwners = new Set<string>();
    for (const basename of basenames) {
      const fragment: z.infer<typeof targetFragmentSchema> = targetFragmentSchema.parse(JSON.parse(
        await readFile(join(directory, basename), "utf8")
      ));
      const configuration = fragmentConfiguration(fragment);
      for (const key of Object.keys(configuration)) {
        if (configurationOwners.has(key)) {
          throw new ObservationError("OBSERVATION_DUPLICATE_CONFIG");
        }
        configurationOwners.add(key);
      }
      const fragmentTargets: ObservationTarget[] = [];
      for (const target of fragment.targets) {
        const identity = `${target.component}:${target.kind}`;
        if (targetIdentities.has(identity)) {
          throw new ObservationError("OBSERVATION_DUPLICATE_TARGET");
        }
        targetIdentities.add(identity);
        const frozen = Object.freeze(target);
        fragmentTargets.push(frozen);
        targets.push(frozen);
      }
      fragments.push(Object.freeze({
        basename,
        targets: Object.freeze(fragmentTargets),
        configuration
      }));
    }
    if (targets.length === 0 && fragments.every((fragment) =>
      Object.keys(fragment.configuration).length === 0)) {
      throw new ObservationError("OBSERVATION_TARGETS_INVALID");
    }
    return Object.freeze({
      targets: Object.freeze(targets),
      fragments: Object.freeze(fragments)
    });
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    throw new ObservationError("OBSERVATION_TARGETS_INVALID", error);
  }
}

export async function loadObservationTargets(directory: string): Promise<readonly ObservationTarget[]> {
  return (await loadObservationTargetCatalog(directory)).targets;
}
