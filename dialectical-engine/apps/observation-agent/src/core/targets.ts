import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ObservationError } from "./errors.js";
import { OBSERVATION_COMPONENTS } from "./types.js";

const componentSchema = z.enum(OBSERVATION_COMPONENTS);
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
  live_url: z.string().url()
}).strict();

export const observationTargetSchema = z.discriminatedUnion("kind", [
  dockerTargetSchema, selfTargetSchema, postgresTargetSchema, hatchetTargetSchema, httpTargetSchema
]);

const targetFragmentSchema = z.object({
  schema_version: z.literal(1),
  targets: z.array(observationTargetSchema)
}).strict();

export type ObservationTarget = z.infer<typeof observationTargetSchema>;
export type PostgresTarget = z.infer<typeof postgresTargetSchema>;
export type HatchetTarget = z.infer<typeof hatchetTargetSchema>;

export async function loadObservationTargets(directory: string): Promise<readonly ObservationTarget[]> {
  try {
    const basenames = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^OBS-[0-9]{2}\.json$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const targets: ObservationTarget[] = [];
    const components = new Set<string>();
    for (const basename of basenames) {
      const fragment: z.infer<typeof targetFragmentSchema> = targetFragmentSchema.parse(JSON.parse(
        await readFile(join(directory, basename), "utf8")
      ));
      for (const target of fragment.targets) {
        if (components.has(target.component)) {
          throw new ObservationError("OBSERVATION_DUPLICATE_TARGET");
        }
        components.add(target.component);
        targets.push(Object.freeze(target));
      }
    }
    if (targets.length === 0) throw new ObservationError("OBSERVATION_TARGETS_INVALID");
    return Object.freeze(targets);
  } catch (error) {
    if (error instanceof ObservationError) throw error;
    throw new ObservationError("OBSERVATION_TARGETS_INVALID", error);
  }
}
