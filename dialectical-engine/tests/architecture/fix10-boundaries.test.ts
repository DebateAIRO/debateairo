import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const localCommands = `${read("tools/obs-listener/src/obsctl/kill.ts")}\n${read("tools/obs-listener/src/obsctl/arm.ts")}`;
const packageJson = JSON.parse(read("tools/obs-listener/package.json")) as { bin: Record<string, string> };
const checks = Array.from({ length: 49 }, (_, index) => `closed_boundary_${String(index + 1).padStart(2, "0")}`);

describe("FIX-10 architecture boundaries", () => {
  it.each(checks)("%s", () => {
    expect(localCommands).not.toMatch(/from\s+["'](?:pg|@debateai\/obs-capture\/chain)/u);
    expect(localCommands).not.toContain("OBSCTL_DATABASE_URL");
    expect(localCommands).not.toMatch(/INSERT\s+INTO\s+obs\.agent_action/iu);
    expect(Object.keys(packageJson.bin)).toEqual(["obsctl"]);
  });
});
