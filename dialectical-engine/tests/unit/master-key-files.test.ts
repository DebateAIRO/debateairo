// Upload check Task 7: the test files that take their API pools from apiTestPools log in with the product's own
// database logins by default, and of those only the files on tests/support/master-key-files.txt may use the harness
// superuser (the "master key") inside a request. Files that never call apiTestPools are not guarded (the known gap in
// that list's header). No database is needed: the guard refuses the query before the client ever connects.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runInRequestScope } from "@debateai/db";
import {
  DEBATEAI_TEST_MASTER_KEY_FILES,
  enterApiPoolMode,
  readMasterKeyFiles
} from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** A made-up superuser login and address: the guard refuses before any connection is tried. */
const superuserUrl = (user: string) => `postgresql://${user}:made-up-password@127.0.0.1:9/made_up_database`;

afterEach(() => { vi.unstubAllEnvs(); });

/** The logins the R21 guard refuses inside a request, as the guard keeps them on pg.Client.prototype. */
function guardedLogins(): readonly string[] {
  const prototype = pg.Client.prototype as unknown as Record<symbol, Set<string> | undefined>;
  return [...(prototype[Symbol.for("debateai.rls.r21-superuser-guard.v1")] ?? [])];
}

// Upload check Task 8: no apiTestPools and no enterApiPoolMode here. This file is not on the list, and starting its
// test database the normal way is all it does, so the guard below comes from startTestDatabase itself.
describe("a test database started the normal way", () => {
  const off = process.env.DEBATEAI_TEST_API_LOGINS === "0";
  let guardedBeforeStart: readonly string[] = [];
  let database: TestDatabase | undefined;
  beforeAll(async () => {
    guardedBeforeStart = guardedLogins();
    database = await startTestDatabase();
  });
  afterAll(async () => { await database?.stop(); });

  it("guards an ordinary unlisted file: its superuser pool is refused inside a request, and works outside one", async () => {
    const pool = database!.pool;
    const superuser = decodeURIComponent(new URL(database!.connectionString).username);
    expect(guardedBeforeStart).not.toContain(superuser);
    expect(DEBATEAI_TEST_MASTER_KEY_FILES.has("tests/unit/master-key-files.test.ts")).toBe(false);
    expect((await pool.query<{ one: number }>("SELECT 1 AS one")).rows[0]!.one).toBe(1);
    const inRequest = runInRequestScope(() => pool.query("SELECT 1"));
    if (off) {
      // DEBATEAI_TEST_API_LOGINS=0: nothing is armed, the superuser works inside a request as before Task 7.
      await expect(inRequest).resolves.toBeDefined();
      expect(guardedLogins()).not.toContain(superuser);
    } else {
      await expect(inRequest).rejects.toThrow("R21_SUPERUSER_POOL_IN_REQUEST");
      expect(guardedLogins()).toContain(superuser);
    }
    // Outside a request (seeding, read-backs, the runner) the guard never fires.
    expect((await pool.query<{ one: number }>("SELECT 1 AS one")).rows[0]!.one).toBe(1);
  });
});

describe("the master-key list", () => {
  it("a test file not on the list, once it arms the guard as apiTestPools does, cannot use the superuser pool in a request", async () => {
    vi.stubEnv("DEBATEAI_TEST_API_LOGINS", undefined);
    expect(DEBATEAI_TEST_MASTER_KEY_FILES.has("tests/unit/master-key-files.test.ts")).toBe(false);
    expect(enterApiPoolMode(import.meta.url, superuserUrl("t7_unlisted_superuser"))).toBe("logins");
    const client = new pg.Client({
      user: "t7_unlisted_superuser", host: "127.0.0.1", port: 9, database: "made_up_database"
    });
    await expect(runInRequestScope(() => client.query("SELECT 1"))).rejects.toThrow("R21_SUPERUSER_POOL_IN_REQUEST");
  });

  it("every listed file keeps the superuser pool; DEBATEAI_TEST_API_LOGINS=0 turns login mode off for every file", () => {
    const listed = [...DEBATEAI_TEST_MASTER_KEY_FILES.keys()];
    if (listed.length === 0) throw new Error("the list is empty: this case needs at least one entry");
    vi.stubEnv("DEBATEAI_TEST_API_LOGINS", undefined);
    for (const file of listed) {
      expect({ file, mode: enterApiPoolMode(pathToFileURL(join(PRODUCT_ROOT, file)).href, superuserUrl("t7_listed_superuser")) })
        .toEqual({ file, mode: "master-key" });
    }
    vi.stubEnv("DEBATEAI_TEST_API_LOGINS", "0");
    expect(enterApiPoolMode(import.meta.url, superuserUrl("t7_off_superuser"))).toBe("off");
  });

  it("every entry on the list names an existing test file and carries a reason", () => {
    expect(DEBATEAI_TEST_MASTER_KEY_FILES.size).toBeGreaterThan(0);
    for (const [file, reason] of DEBATEAI_TEST_MASTER_KEY_FILES) {
      const path = join(PRODUCT_ROOT, file);
      expect({ file, exists: existsSync(path) && statSync(path).isFile() }).toEqual({ file, exists: true });
      expect(file, file).toMatch(/\.test\.tsx?$/u);
      expect(reason.trim().length, file).toBeGreaterThan(10);
    }
  });

  it("the reader refuses an entry without a reason and a file named twice, and skips comments and blank lines", () => {
    expect(readMasterKeyFiles("# a comment\n\ntests/a.test.ts  why it needs the key\n"))
      .toEqual(new Map([["tests/a.test.ts", "why it needs the key"]]));
    expect(() => readMasterKeyFiles("tests/a.test.ts\n")).toThrow("MASTER_KEY_FILES_ENTRY_INVALID");
    expect(() => readMasterKeyFiles("tests/a.test.ts  one\ntests/a.test.ts  two\n"))
      .toThrow("MASTER_KEY_FILES_ENTRY_INVALID");
  });
});
