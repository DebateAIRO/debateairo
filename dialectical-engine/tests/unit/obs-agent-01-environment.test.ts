import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as runtimeEnvironment from "../../packages/register/src/runtime-environment.js";

const OBSERVATION_KEYS = [
  "OBSERVATION_DATABASE_URL",
  "OBSERVATION_STATE_DIR",
  "OBSERVATION_TARGETS_PATH",
  "OBSERVATION_HATCHET_TOKEN_PATH",
  "OBSERVATION_FIFTH_KEY"
] as const;

const originalEnvironment = new Map(
  OBSERVATION_KEYS.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of OBSERVATION_KEYS) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function environmentLoader(): () => Readonly<Record<string, string | undefined>> {
  const candidate = (runtimeEnvironment as Readonly<Record<string, unknown>>)
    .loadObservationAgentEnvironment;
  expect(candidate, "register loader export").toBeTypeOf("function");
  return candidate as () => Readonly<Record<string, string | undefined>>;
}

function setValidEnvironment(): void {
  process.env.OBSERVATION_DATABASE_URL = "postgresql://observation:secret@127.0.0.1:55432/debateai";
  process.env.OBSERVATION_STATE_DIR = "/tmp/observation-state";
  process.env.OBSERVATION_TARGETS_PATH = "/tmp/observation-targets";
  delete process.env.OBSERVATION_HATCHET_TOKEN_PATH;
  delete process.env.OBSERVATION_FIFTH_KEY;
}

describe("OBS-01 register-owned environment and independent package", () => {
  it("loads only the four ruled agent inputs and keeps the Hatchet token optional", () => {
    setValidEnvironment();
    const loadEnvironment = environmentLoader();
    expect(loadEnvironment()).toEqual({
      OBSERVATION_DATABASE_URL: "postgresql://observation:secret@127.0.0.1:55432/debateai",
      OBSERVATION_STATE_DIR: "/tmp/observation-state",
      OBSERVATION_TARGETS_PATH: "/tmp/observation-targets"
    });

    process.env.OBSERVATION_HATCHET_TOKEN_PATH = "/tmp/hatchet-token";
    expect(loadEnvironment()).toEqual({
      OBSERVATION_DATABASE_URL: "postgresql://observation:secret@127.0.0.1:55432/debateai",
      OBSERVATION_STATE_DIR: "/tmp/observation-state",
      OBSERVATION_TARGETS_PATH: "/tmp/observation-targets",
      OBSERVATION_HATCHET_TOKEN_PATH: "/tmp/hatchet-token"
    });
  });

  it("rejects a fifth agent input and relative directory-valued paths", () => {
    setValidEnvironment();
    const loadEnvironment = environmentLoader();
    process.env.OBSERVATION_FIFTH_KEY = "forbidden";
    expect(() => loadEnvironment()).toThrow();

    delete process.env.OBSERVATION_FIFTH_KEY;
    process.env.OBSERVATION_STATE_DIR = "relative/state";
    expect(() => loadEnvironment()).toThrow();

    process.env.OBSERVATION_STATE_DIR = "/tmp/observation-state";
    process.env.OBSERVATION_TARGETS_PATH = "relative/targets";
    expect(() => loadEnvironment()).toThrow();
  });

  it("declares a standalone long-lived package entry and oactl entry", async () => {
    const packagePath = resolve("apps/observation-agent/package.json");
    await expect(access(packagePath)).resolves.toBeUndefined();
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      readonly name?: string;
      readonly scripts?: Readonly<Record<string, string>>;
    };
    expect(packageJson.name).toBe("@debateai/observation-agent");
    expect(packageJson.scripts?.start).toBe("node --import tsx src/main.ts");
    expect(packageJson.scripts?.oactl).toBe("node --import tsx src/oactl/core/cli.ts");
    await expect(access(resolve("apps/observation-agent/src/main.ts"))).resolves.toBeUndefined();
  });
});
