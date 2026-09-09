import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ObservationError } from "../../core/errors.js";
import { OBSERVATION_COMPONENTS, type ObservationComponent } from "../../core/types.js";

const muteSchema = z.object({
  expires_at: z.iso.datetime(),
  component: z.enum(OBSERVATION_COMPONENTS).optional()
}).strict();

export type MuteState = z.infer<typeof muteSchema>;

export function fixedStateDirectory(home: string): string {
  return join(home, ".local", "state", "dialectical-engine", "observation-agent");
}

export function parseMuteDuration(input: string): number {
  const match = /^([1-9][0-9]*)(s|m|h|d)$/u.exec(input);
  if (match === null) throw new ObservationError("OBSERVATION_MUTE_DURATION_INVALID");
  const amount = Number(match[1]);
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  const duration = amount * multiplier;
  if (!Number.isSafeInteger(duration)) {
    throw new ObservationError("OBSERVATION_MUTE_DURATION_INVALID");
  }
  return duration;
}

export async function writeMute(input: Readonly<{
  stateDir: string;
  duration: string;
  component?: ObservationComponent;
  now?: Date;
}>): Promise<MuteState> {
  const now = input.now ?? new Date();
  const mute = muteSchema.parse({
    expires_at: new Date(now.getTime() + parseMuteDuration(input.duration)).toISOString(),
    ...(input.component === undefined ? {} : { component: input.component })
  });
  await mkdir(input.stateDir, { recursive: true, mode: 0o700 });
  const temporary = join(input.stateDir, `.MUTE-${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(mute)}\n`, { mode: 0o600 });
  await rename(temporary, join(input.stateDir, "MUTE"));
  return Object.freeze(mute);
}

export async function readMute(stateDir: string, now: Date = new Date()): Promise<MuteState | null> {
  try {
    const mute = muteSchema.parse(JSON.parse(await readFile(join(stateDir, "MUTE"), "utf8")));
    if (Date.parse(mute.expires_at) <= now.getTime()) {
      await removeMute(stateDir);
      return null;
    }
    return Object.freeze(mute);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new ObservationError("OBSERVATION_MUTE_INVALID", error);
    }
    throw error;
  }
}

export async function removeMute(stateDir: string): Promise<void> {
  await rm(join(stateDir, "MUTE"), { force: true });
}
