import { afterEach, describe, expect, it, vi } from "vitest";
import * as loader from "../../packages/register/src/runtime-environment.js";
import * as register from "@debateai/register";

afterEach(() => vi.unstubAllEnvs());

describe("operator command environment", () => {
  it("returns exactly the listed keys that are set, and nothing else", () => {
    vi.stubEnv("PES_S01_PROBE_A", "a");
    vi.stubEnv("PES_S01_PROBE_B", "");
    vi.stubEnv("PES_S01_PROBE_D", "d");
    expect(process.env.PES_S01_PROBE_C).toBeUndefined();

    expect(loader.readOperatorCommandEnvironment([
      "PES_S01_PROBE_A", "PES_S01_PROBE_B", "PES_S01_PROBE_C"
    ])).toStrictEqual({ PES_S01_PROBE_A: "a", PES_S01_PROBE_B: "" });
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(
      loader.readOperatorCommandEnvironment(["PES_S01_PROBE_A"])
    )).toBe(true);
  });

  it("is re-exported by the package entry", () => {
    expect(typeof register.readOperatorCommandEnvironment).toBe("function");
    expect(register.readOperatorCommandEnvironment).toBe(loader.readOperatorCommandEnvironment);
  });
});
