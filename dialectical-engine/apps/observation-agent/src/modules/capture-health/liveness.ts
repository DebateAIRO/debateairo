import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type RuntimeLiveness = "UP" | "DOWN" | "UNKNOWN";

function livenessMap(
  runtimes: readonly string[],
  read: (runtime: string) => RuntimeLiveness
): Readonly<Record<string, RuntimeLiveness>> {
  const result: Record<string, RuntimeLiveness> = {};
  for (const runtime of runtimes) result[runtime] = read(runtime);
  return Object.freeze(result);
}

export async function readRuntimeLiveness(
  stateDir: string,
  runtimes: readonly string[]
): Promise<Readonly<Record<string, RuntimeLiveness>>> {
  try {
    const parsed = JSON.parse(await readFile(join(stateDir, "status.json"), "utf8")) as {
      components?: Readonly<Record<string, Readonly<{ state?: unknown }>>>;
    };
    return livenessMap(runtimes, (runtime) => {
      const state = parsed.components?.[runtime]?.state;
      return state === "UP" || state === "FRESH" || state === "RUNNING"
        ? "UP" : state === "DOWN" || state === "EXITED" || state === "NOT_RUNNING"
          ? "DOWN" : "UNKNOWN";
    });
  } catch {
    return livenessMap(runtimes, () => "UNKNOWN");
  }
}
