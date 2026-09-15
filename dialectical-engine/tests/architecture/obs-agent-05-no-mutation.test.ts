import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertCapacityDockerArgv } from "../../apps/observation-agent/src/modules/host-capacity/commands.js";

async function source(directory: string): Promise<string> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".ts")).sort();
  return (await Promise.all(names.map((name) => readFile(join(directory, name), "utf8")))).join("\n");
}

describe("OBS-05 host no-mutation boundary", () => {
  it("fails closed for Docker prune/remove and altered read-only argv", () => {
    expect(() => assertCapacityDockerArgv(["system", "prune"])).toThrow("OBSERVATION_CAPACITY_DOCKER_FORBIDDEN");
    expect(() => assertCapacityDockerArgv(["stats", "--no-stream", "remove"])).toThrow("OBSERVATION_CAPACITY_DOCKER_FORBIDDEN");
    expect(assertCapacityDockerArgv(["system", "df", "--format", "{{json .}}"]))
      .toEqual(["system", "df", "--format", "{{json .}}"]);
  });

  it("contains no deletion or infrastructure mutation command and delegates Docker execution", async () => {
    const text = await source("apps/observation-agent/src/modules/host-capacity");
    expect(text).not.toMatch(/\b(?:prune|remove|restart|stop|start|kill|truncate)\b/iu);
    expect(text).not.toMatch(/\b(?:rm|unlink|rmdir)\s*\(/iu);
    expect(text).toContain('../../docker/wrapper.js');
    expect(text).not.toMatch(/execFileAsync\(["']docker["']/u);
  });
});
