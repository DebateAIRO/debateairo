// tests/architecture/vps-env-examples-match-shapes.test.ts
// Task 14 amendment (from Task 6's report, 2026-09-22): `deploy/vps/env/api.env.example` once
// lacked two keys the API's strict environment shape REQUIRES, so an api.env built from it refused
// at boot. This pins the examples to the shapes themselves, in both directions, so the kit cannot
// fall behind them again:
//
//   1. every key a service's strict shape REQUIRES appears in that service's example, and
//   2. every key an example sets is a key that service's shape knows — the shapes are `.strict()`,
//      so an unknown key refuses at boot exactly as a missing one does.
//
// The required/optional split is read from the shapes (`*_ENVIRONMENT_KEYS`), never restated here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as runtimeEnvironment from "../../packages/register/src/runtime-environment.js";

const engineRoot = resolve(import.meta.dirname, "../..");

type KeyInventory = Readonly<{ required: readonly string[]; optional: readonly string[] }>;

function inventory(name: string): KeyInventory {
  const candidate = (runtimeEnvironment as Readonly<Record<string, unknown>>)[name];
  expect(candidate, `${name} is exported by packages/register/src/runtime-environment.ts`)
    .toBeTypeOf("object");
  return candidate as KeyInventory;
}

function exampleKeys(relative: string): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const line of readFileSync(resolve(engineRoot, relative), "utf8").split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=/u.exec(line.trim());
    if (match?.[1] !== undefined) keys.add(match[1]);
  }
  return keys;
}

const CASES = [
  { service: "api", example: "deploy/vps/env/api.env.example", keys: "API_ENVIRONMENT_KEYS" },
  { service: "runner", example: "deploy/vps/env/runner.env.example", keys: "RUNNER_ENVIRONMENT_KEYS" },
  {
    service: "observation agent",
    example: "deploy/vps/env/observation-agent.env.example",
    keys: "OBSERVATION_AGENT_ENVIRONMENT_KEYS"
  }
] as const;

describe("VPS env examples cover the strict environment shapes (Task 14 amendment)", () => {
  it.each(CASES)("$service: every REQUIRED key of the shape is in $example", ({ example, keys }) => {
    const shape = inventory(keys);
    expect(shape.required.length).toBeGreaterThan(0);
    const present = exampleKeys(example);
    expect(shape.required.filter((key) => !present.has(key))).toEqual([]);
  });

  it.each(CASES)("$service: every key $example sets is known to the shape", ({ example, keys }) => {
    const shape = inventory(keys);
    const known = new Set([...shape.required, ...shape.optional]);
    expect([...exampleKeys(example)].filter((key) => !known.has(key))).toEqual([]);
  });

  it("the inventories are the shapes' own: a known required key and a known optional key each", () => {
    // Guards the reader above against an inventory that is empty or inverted: these four facts
    // are the rulings the shapes encode (E-I2, V-20, V-19, OBS-01).
    expect(inventory("API_ENVIRONMENT_KEYS").required).toContain("SUPPORT_KEK_PATH");
    expect(inventory("API_ENVIRONMENT_KEYS").optional).toContain("SUPPORT_MODEL_TARGET_JSON");
    expect(inventory("RUNNER_ENVIRONMENT_KEYS").optional).toContain("VLLM_BASE_URL");
    expect(inventory("OBSERVATION_AGENT_ENVIRONMENT_KEYS").required)
      .toEqual(["OBSERVATION_DATABASE_URL", "OBSERVATION_STATE_DIR", "OBSERVATION_TARGETS_PATH"]);
  });
});
