import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALGORITHM_REGISTER_ROW_FAMILIES,
  ALGORITHM_REGISTER_ROW_KEYS,
  ENGINE_BAND_ORDER,
  buildOneStepDownBands
} from "../../packages/register/src/index.js";

/**
 * T16 DoD grep-proof: "consumers read register only (no code constants)".
 * Every value T16 seals must reach a consumer through a register row, so no
 * consumer source file may carry the value as a literal. The scan covers the
 * three packages the live-loop consumers live in (T3 judgement, T10/T11 serve,
 * T7 propagation) and fires the moment one of them hardcodes a seeded value.
 */
const CONSUMER_SOURCE_DIRECTORIES = [
  "packages/judgement/src",
  "packages/serve/src",
  "packages/propagation/src"
] as const;

const SEALED_VALUE_LITERALS = [
  "0.02", "0.01", "0.05", "0.70", "0.7", "0.35", "0.25", "1.0", "0.5"
] as const;

async function readSourceFiles(directory: string): Promise<readonly (readonly [string, string])[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"));
  return await Promise.all(files.map(async (entry) => {
    const path = join(entry.parentPath, entry.name);
    return [path, await readFile(path, "utf8")] as const;
  }));
}

describe("T16 algorithm register rows — schema, seeding and grep-proof", () => {
  it("keeps every sealed value out of every consumer source file", async () => {
    const offences: string[] = [];
    for (const directory of CONSUMER_SOURCE_DIRECTORIES) {
      for (const [path, source] of await readSourceFiles(directory)) {
        for (const literal of SEALED_VALUE_LITERALS) {
          const pattern = new RegExp(`${literal.replace(".", "\\.")}(?![0-9])`, "g");
          for (const match of source.matchAll(pattern)) {
            const line = source.slice(0, match.index).split("\n").length;
            offences.push(`${path}:${line} carries the sealed literal ${literal}`);
          }
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("declares one manifest of fifteen rows across five families", () => {
    expect(ALGORITHM_REGISTER_ROW_KEYS).toHaveLength(15);
    expect(new Set(ALGORITHM_REGISTER_ROW_KEYS).size).toBe(15);
    expect(Object.keys(ALGORITHM_REGISTER_ROW_FAMILIES)).toEqual([
      "stopping", "verdictLabel", "synthesisRoles", "panelWeighting", "envelope"
    ]);
  });

  it("declares the same fifteen rows in the migration that seals them", async () => {
    const migration = await readFile("migrations/0050_t16_algorithm_register_rows.sql", "utf8");
    for (const rowKey of ALGORITHM_REGISTER_ROW_KEYS) {
      expect(migration, rowKey).toContain(`('${rowKey}',`);
    }
    for (const family of Object.keys(ALGORITHM_REGISTER_ROW_FAMILIES)) {
      expect(migration, family).toContain(`'${family}'`);
    }
    expect(migration).toContain("REGISTER_REQUIRED_ROW_MISSING");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION register.assert_required_rows");
  });

  it("seals the seal itself — the seeding path calls the migration's manifest assertion", async () => {
    const source = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    expect(source).toContain("SELECT register.assert_required_rows($1)");
    expect(source).toContain("buildDevelopmentAlgorithmRegisterRows(providerPanel)");
  });

  it("derives the downgrade bands from the engine's own band vocabulary, never a new name", async () => {
    const [runner, acceptance] = await Promise.all([
      readFile("apps/runner/src/dev-deployment-register.ts", "utf8"),
      readFile("acceptance/seed-register.ts", "utf8")
    ]);
    for (const [label, source] of [["runner", runner], ["acceptance", acceptance]] as const) {
      expect(source, label).toContain("ENGINE_BAND_ORDER");
      expect(source, label).not.toMatch(/bandOrder:\s*(Object\.freeze\()?\[\s*"/);
    }
    expect(buildOneStepDownBands(ENGINE_BAND_ORDER)).toEqual({ CAPPED: "CAPPED", FULL: "CAPPED" });
  });

  it("leaves register.bootstrap.json a strict five-pin tool file (goal 86-87)", async () => {
    const bootstrap = JSON.parse(await readFile("register.bootstrap.json", "utf8")) as {
      registerVersion: number;
      values: Record<string, unknown>;
    };
    expect(bootstrap.registerVersion).toBe(1);
    expect(Object.keys(bootstrap.values).sort()).toEqual([
      "nodeRuntimeVersion", "pnpmVersion", "postgresMajorVersion", "typescriptVersion", "vllmImageDigest"
    ]);
    for (const rowKey of ALGORITHM_REGISTER_ROW_KEYS) {
      expect(Object.keys(bootstrap.values), rowKey).not.toContain(rowKey);
    }
  });
});
