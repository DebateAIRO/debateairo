import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ObservationError } from "../../core/errors.js";

const acknowledgementSchema = z.object({
  signal_id: z.uuid(),
  acknowledged_at: z.iso.datetime()
}).strict();

const acknowledgementFileSchema = z.object({
  schema_version: z.literal(1),
  acknowledgements: z.array(acknowledgementSchema).max(10_000)
}).strict();

export type Acknowledgement = z.infer<typeof acknowledgementSchema>;

const FILE_NAME = "acknowledgements.json";

export async function readAcknowledgements(stateDir: string): Promise<readonly Acknowledgement[]> {
  try {
    const parsed = acknowledgementFileSchema.parse(JSON.parse(
      await readFile(join(stateDir, FILE_NAME), "utf8")
    ));
    return Object.freeze(parsed.acknowledgements.map((entry) => Object.freeze(entry)));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return Object.freeze([]);
    throw new ObservationError("OBSERVATION_ACKNOWLEDGEMENTS_INVALID", error);
  }
}

export async function writeAcknowledgement(input: Readonly<{
  stateDir: string;
  signalId: string;
  acknowledgedAt?: Date;
}>): Promise<Acknowledgement> {
  const acknowledgement = acknowledgementSchema.safeParse({
    signal_id: input.signalId,
    acknowledged_at: (input.acknowledgedAt ?? new Date()).toISOString()
  });
  if (!acknowledgement.success) {
    throw new ObservationError("OBSERVATION_ACKNOWLEDGEMENT_INVALID", acknowledgement.error);
  }
  const existing = await readAcknowledgements(input.stateDir);
  const retained = existing.filter((entry) => entry.signal_id !== acknowledgement.data.signal_id);
  const value = acknowledgementFileSchema.parse({
    schema_version: 1,
    acknowledgements: [...retained, acknowledgement.data]
  });
  await mkdir(input.stateDir, { recursive: true, mode: 0o700 });
  const temporary = join(input.stateDir, `.${FILE_NAME}.${process.pid}.tmp`);
  try {
    const handle = await open(temporary, "w", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, join(input.stateDir, FILE_NAME));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return Object.freeze(acknowledgement.data);
}
