import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { statusSnapshotSchema } from "../../store/status.js";
import { ObservationError } from "../../core/errors.js";

export async function renderStatus(stateDir: string): Promise<string> {
  try {
    const status = statusSnapshotSchema.parse(JSON.parse(
      await readFile(join(stateDir, "status.json"), "utf8")
    ));
    const rows = Object.entries(status.components)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([component, value]) => `${component.padEnd(28)} ${value.state}`);
    return [`state_dir ${stateDir}`, `pid ${status.pid}`, `thresholds v${status.thresholds_version}`, ...rows].join("\n");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new ObservationError("OBSERVATION_STATUS_UNAVAILABLE", error);
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new ObservationError("OBSERVATION_STATUS_INVALID", error);
    }
    throw error;
  }
}

import { z } from "zod";
