import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTestSchemaFrom, resolveTestSchemaFrom, startTestDatabase } from "../support/testDatabase.js";

/**
 * ★DEBATEAI_TEST_SCHEMA_FROM (side-by-side spec 2026-10-21 §5; plan A, task A10). The N-1 CI job runs the released
 * commit's database suites with this set to the HEAD checkout's dialectical-engine folder, so each new test database is
 * migrated by HEAD's migrate-cli before the old suite's own migrate() runs (and takes the database-ahead path, A7).
 * Unset, the harness behaves exactly as before; set to anything that is not such a folder, it refuses loudly.
 */
const temporaryFolders: string[] = [];
const temporaryFolder = async (): Promise<string> => {
  const folder = await mkdtemp(join(tmpdir(), "debateai-schema-from-"));
  temporaryFolders.push(folder);
  return folder;
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("side-by-side §5: DEBATEAI_TEST_SCHEMA_FROM", () => {
  it("does nothing when the variable is unset", async () => {
    expect(resolveTestSchemaFrom({})).toBeUndefined();
    // No folder, no child process: an unreachable database address is never contacted.
    await expect(applyTestSchemaFrom("postgresql://nobody@127.0.0.1:1/none", {})).resolves.toBeUndefined();
  });

  it("refuses TEST_SCHEMA_FROM_INVALID for an empty folder, a relative path, an empty value or a missing folder", async () => {
    const empty = await temporaryFolder();
    for (const value of [empty, "dialectical-engine", "", join(empty, "absent")]) {
      expect(() => resolveTestSchemaFrom({ DEBATEAI_TEST_SCHEMA_FROM: value }), value)
        .toThrow(expect.objectContaining({ code: "TEST_SCHEMA_FROM_INVALID" }));
    }
  });

  it("accepts a folder holding the runner's migrate-cli and its own tsx", async () => {
    const folder = await temporaryFolder();
    await mkdir(join(folder, "node_modules/.bin"), { recursive: true });
    await mkdir(join(folder, "apps/runner/src"), { recursive: true });
    await writeFile(join(folder, "node_modules/.bin/tsx"), "");
    await writeFile(join(folder, "apps/runner/src/migrate-cli.ts"), "");
    expect(resolveTestSchemaFrom({ DEBATEAI_TEST_SCHEMA_FROM: folder })).toBe(folder);
  });

  it("runs the folder's tsx on migrate-cli with MIGRATION_DATABASE_URL set, and refuses a non-zero exit", async () => {
    const folder = await temporaryFolder();
    await mkdir(join(folder, "node_modules/.bin"), { recursive: true });
    await mkdir(join(folder, "apps/runner/src"), { recursive: true });
    await writeFile(join(folder, "apps/runner/src/migrate-cli.ts"), "");
    const seen = join(folder, "seen.txt");
    // A stand-in tsx: records what it was asked to run, where and against which database, then exits as told.
    await writeFile(join(folder, "node_modules/.bin/tsx"),
      `#!/bin/sh\nprintf '%s|%s|%s' "$(pwd -P)" "$1" "$MIGRATION_DATABASE_URL" > "${seen}"\nexit "$STAND_IN_EXIT"\n`, { mode: 0o755 });
    const url = ["postgresql://debateai", "127.0.0.1:5999/debateai_s00"].join("@");
    const base = { DEBATEAI_TEST_SCHEMA_FROM: folder, PATH: process.env.PATH };
    await expect(applyTestSchemaFrom(url, { ...base, STAND_IN_EXIT: "0" })).resolves.toBeUndefined();
    expect(await readFile(seen, "utf8")).toBe(`${await realpath(folder)}|apps/runner/src/migrate-cli.ts|${url}`);
    await expect(applyTestSchemaFrom(url, { ...base, STAND_IN_EXIT: "3" }))
      .rejects.toMatchObject({ code: "TEST_SCHEMA_FROM_INVALID", message: "TEST_SCHEMA_FROM_INVALID: HEAD migrate-cli exited 3" });
  });

  it("makes startTestDatabase() reject before any migrate when the variable names an empty folder", async () => {
    vi.stubEnv("DEBATEAI_TEST_SCHEMA_FROM", await temporaryFolder());
    // A regression that starts the cluster anyway still stops it, so a red run never leaves a PostgreSQL behind.
    const outcome = await startTestDatabase().then(async (database) => {
      await database.stop();
      return "STARTED_WITHOUT_REFUSAL";
    }, (error: unknown) => error);
    expect(outcome).toMatchObject({ code: "TEST_SCHEMA_FROM_INVALID" });
  });
});
