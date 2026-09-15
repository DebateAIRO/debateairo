import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ObservationError } from "../../core/errors.js";
import { isStormComponent, type StormComponent } from "./storm.js";

export async function appendStormDigest(stateDir: string, input: Readonly<{
  root: StormComponent;
  count: number;
  fifthDetectedAt: string;
  summarySignalId: string;
}>): Promise<void> {
  const detected = new Date(input.fifthDetectedAt);
  if (!isStormComponent(input.root) || !Number.isInteger(input.count) || input.count < 5
    || !Number.isFinite(detected.getTime()) || detected.toISOString() !== input.fifthDetectedAt
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(input.summarySignalId)) {
    throw new ObservationError("OBSERVATION_STORM_DIGEST_INVALID");
  }
  const directory = join(stateDir, "digest");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const day = input.fifthDetectedAt.slice(0, 10);
  const time = `${input.fifthDetectedAt.slice(11, 19)}Z`;
  const destination = join(directory, `${day}.md`);
  const marker = ` · ${input.summarySignalId}`;
  try {
    if ((await readFile(destination, "utf8")).split("\n")
      .some((line) => line.endsWith(marker))) return;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const handle = await open(destination, "a", 0o600);
  try {
    await handle.writeFile(
      `${time} · storm root ${input.root} · storm members ${input.count}${marker}\n`,
      "utf8"
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
}
