import { describe, expect, it } from "vitest";
import { loadBootstrapRegister, resolveRegisterValue } from "@debateai/register";

describe("FX-REG-01 — bootstrap equality and loud resolution", () => {
  it("loads all five machine-resolved pins through the one loader", async () => {
    const register = await loadBootstrapRegister();
    expect(Object.keys(register.values).sort()).toEqual([
      "nodeRuntimeVersion",
      "pnpmVersion",
      "postgresMajorVersion",
      "typescriptVersion",
      "vllmImageDigest"
    ]);
    expect(register.values.nodeRuntimeVersion).toBe("v22.23.1");
    expect(register.values.pnpmVersion).toBe("11.20.0");
    expect(register.values.typescriptVersion).toBe("7.0.2");
    expect(register.values.vllmImageDigest).toBe("sha256:ffb2d59b1c059a5bd8d781320c9f5189de8293693b7d95da54befddaa54abf52");
  });

  it("resolves parent → run → deployment and records the supplying level", () => {
    expect(resolveRegisterValue("operator", {
      parent: { operator: "strict-and" },
      run: { operator: "accumulate" },
      deployment: { operator: "strict-and" }
    })).toEqual({ value: "strict-and", suppliedBy: "parent" });
    expect(() => resolveRegisterValue("missing", {
      parent: {}, run: {}, deployment: {}
    })).toThrow("Unresolved register key");
  });
});
