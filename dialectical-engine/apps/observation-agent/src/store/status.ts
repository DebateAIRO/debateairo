import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { OBSERVATION_COMPONENTS } from "../core/types.js";

const componentStatusSchema = z.object({
  state: z.enum(["UNKNOWN", "UP", "SUSPECT", "DOWN", "RECOVERING"]),
  last_probe_at: z.iso.datetime().nullable(),
  last_ok_at: z.iso.datetime().nullable(),
  open_signal_ids: z.array(z.uuid())
}).strict();

export const statusSnapshotSchema = z.object({
  pid: z.number().int().positive(),
  version: z.string().min(1),
  thresholds_version: z.number().int().positive(),
  mute: z.object({ expires_at: z.iso.datetime(), component: z.enum(OBSERVATION_COMPONENTS).nullable() }).strict().nullable(),
  components: z.partialRecord(z.enum(OBSERVATION_COMPONENTS), componentStatusSchema)
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
