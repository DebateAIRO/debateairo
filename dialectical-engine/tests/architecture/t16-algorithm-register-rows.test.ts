import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALGORITHM_REGISTER_ROW_FAMILIES,
  ALGORITHM_REGISTER_ROW_KEYS,
  ENGINE_BAND_ORDER,
  buildOneStepDownBands
} from "../../packages/register/src/index.js";
import {
  CONSUMER_SOURCE_DIRECTORIES,
  scanForHardcodedPolicy,
  type PolicySource
} from "../support/t16PolicyScanner.js";

async function readSourceFiles(directory: string): Promise<readonly PolicySource[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"));
  return await Promise.all(files.map(async (entry) => {
    const path = join(entry.parentPath, entry.name);
    return { path, source: await readFile(path, "utf8") };
  }));
}

/**
 * Committed positive controls — one per consuming task. Each is a synthetic
 * source, so the control is permanent and does not require mutating real files.
 */
const POSITIVE_CONTROLS = [
  {
    task: "T3 · panel weighting",
    path: "apps/runner/src/index.ts",
    source: "const repeatedFamilyMultiplier = 0.5;\n",
    rule: "POLICY_IDENTIFIER_LITERAL"
  },
  {
    task: "T7 · adaptive stopping",
    path: "packages/propagation/src/index.ts",
    source: "const converged = Math.abs(next - previous) <= 0.02;\n",
    rule: "SEALED_DECIMAL"
  },
  {
    task: "T9 · evaluator loop (integer, NOT a decimal)",
    path: "packages/serve/src/index.ts",
    source: "const evaluatorLoopMaxRounds = 3;\n",
    rule: "POLICY_IDENTIFIER_LITERAL"
  },
  {
    task: "T11 · verdict cuts",
    path: "packages/serve/src/index.ts",
    source: 'if (winner >= 0.7) return "SUPPORTED";\n',
    rule: "SEALED_DECIMAL"
  },
  {
    task: "T17 · envelope inputs (integer, NOT a decimal)",
    path: "apps/api/src/main.ts",
    source: "const basis = { branchingFactor: 2, maxRecompose: 2 };\n",
    rule: "POLICY_IDENTIFIER_LITERAL"
  },
  {
    task: "T3 · band vocabulary restated",
    path: "packages/judgement/src/s04.ts",
    source: 'const bands = ["CAPPED", "FULL"];\n',
    rule: "BAND_VOCABULARY"
  },
  {
    task: "T3 · UNKNOWN-family behavior restated",
    path: "packages/judgement/src/s04.ts",
    source: 'const behavior = "EXEMPT_FROM_REPEATED_FAMILY_DISCOUNT";\n',
    rule: "FAMILY_BEHAVIOR"
  }
] as const;

/** The lawful consumer form, plus unrelated numbers that must NOT be banned. */
const NEGATIVE_CONTROL: PolicySource = {
  path: "packages/serve/src/index.ts",
  source: [
    "const retries = 3;",
    "const ratio = 0.9;",
    "const backoffMs = 250;",
    "const window = 10.255;",
    "const basis = { branchingFactor: ENGINE_BRANCHING_FACTOR, maxRecompose: ENGINE_MAX_RECOMPOSE };",
    "const evaluatorLoopMaxRounds = controls.evaluatorLoopMaxRounds;",
    "const highCut = verdictControls.highCut;",
    "const label = decision.kind === \"CAPPED\" ? capped : full;"
  ].join("\n")
};

describe("T16 algorithm register rows — schema, seeding and grep-proof", () => {
  it("finds no hardcoded policy anywhere on the real consumer surface", async () => {
    const files = (await Promise.all(
      CONSUMER_SOURCE_DIRECTORIES.map(async (directory) => await readSourceFiles(directory))
    )).flat();
    expect(files.length).toBeGreaterThan(20);
    expect(scanForHardcodedPolicy(files)).toEqual([]);
  });

  it("scans every consumer surface a live-loop task will write into", async () => {
    const files = (await Promise.all(
      CONSUMER_SOURCE_DIRECTORIES.map(async (directory) => await readSourceFiles(directory))
    )).flat();
    const scanned = new Set(files.map((file) => file.path));
    // The T9/T17 runner and the T17 structural-ceiling API caller are inside
    // the surface — their absence was the r1 defect.
    expect(scanned).toContain("apps/runner/src/index.ts");
    expect(scanned).toContain("apps/api/src/main.ts");
    expect(scanned).toContain("packages/judgement/src/s04.ts");
    expect(scanned).toContain("packages/serve/src/index.ts");
  });

  it("detects every planted consumer hardcode (positive controls)", () => {
    for (const control of POSITIVE_CONTROLS) {
      const offences = scanForHardcodedPolicy([{ path: control.path, source: control.source }]);
      expect(offences.length, control.task).toBeGreaterThan(0);
      expect(offences.map((offence) => offence.rule), control.task).toContain(control.rule);
    }
  });

  it("does not ban unrelated numbers or the lawful register-read form (negative control)", () => {
    expect(scanForHardcodedPolicy([NEGATIVE_CONTROL])).toEqual([]);
  });

  it("exempts the register writer it owns, and only that", () => {
    const planted = "const dispersionScale = 1.0;\nconst gamma = 0.05;\n";
    expect(scanForHardcodedPolicy([
      { path: "apps/runner/src/dev-deployment-register.ts", source: planted }
    ])).toEqual([]);
    expect(scanForHardcodedPolicy([
      { path: "apps/runner/src/index.ts", source: planted }
    ]).length).toBeGreaterThan(0);
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

  it("enforces algorithm completeness before and inside the publication transaction", async () => {
    const source = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    expect(source).toContain("ALGORITHM_REGISTER_ROW_KEYS.some");
    expect(source).toContain("DEV_ALGORITHM_REGISTER_ROWS_INCOMPLETE");
    const publicationMigration = await readFile("migrations/0061_algorithm_publication_profiles.sql", "utf8");
    expect(publicationMigration).toContain("PERFORM register.assert_required_rows(NEW.register_version)");
    expect(publicationMigration).toContain("BEFORE INSERT ON register.register_version");
    expect(source).toContain("buildDevelopmentAlgorithmRegisterRows(providerPanel, roleRefs)");
    // Ruling J7: the seeding entrypoint warns on its own process path.
    expect(source).toContain("warnOnIdenticalSynthesisRoleRefs({");
    const acceptance = await readFile("acceptance/seed-register.ts", "utf8");
    expect(acceptance).toContain("warnOnIdenticalSynthesisRoleRefs({");
    expect(acceptance).toContain("SELECT register.assert_required_rows($1)");
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
