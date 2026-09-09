import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("OBS-01 read-only Docker boundary", () => {
  it("freezes the exact allowed Docker argv prefixes and rejects a mutating verb", async () => {
    const { DOCKER_ARGV_PREFIXES, dockerArgv } = await import(
      "../../apps/observation-agent/src/docker/wrapper.js"
    );
    expect(DOCKER_ARGV_PREFIXES).toEqual({
      ps: ["ps"],
      inspect: ["inspect"],
      stats: ["stats", "--no-stream"],
      events: ["events"],
      info: ["info"],
      version: ["version"],
      systemDf: ["system", "df"]
    });
    expect(dockerArgv("inspect", ["--format", "{{json .State}}", "container-1"]))
      .toEqual(["inspect", "--format", "{{json .State}}", "container-1"]);
    expect(() => dockerArgv("stop" as "inspect", ["container-1"]))
      .toThrow("OBSERVATION_DOCKER_COMMAND_FORBIDDEN");
  });

  it("keeps child-process execution in the wrapper and never enables a shell", async () => {
    const source = await readFile("apps/observation-agent/src/docker/wrapper.ts", "utf8");
    expect(source).toContain("execFile");
    expect(source).not.toMatch(/\bexec\s*\(/u);
    expect(source).not.toMatch(/\bspawn\s*\(/u);
    expect(source).not.toMatch(/shell\s*:\s*true/u);

    const probeSource = await readFile(
      "apps/observation-agent/src/modules/core-liveness/probes.ts", "utf8"
    );
    expect(probeSource).not.toMatch(/from\s+["']node:child_process["']/u);
  });
});
