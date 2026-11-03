// Upload check Task 7: the end-to-end tests log in with the product's own database logins by default, and only the
// files on tests/support/master-key-files.txt may use the harness superuser (the "master key") inside a request.
// No database is needed: the guard refuses the query before the client ever connects.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInRequestScope } from "@debateai/db";
import {
  DEBATEAI_TEST_MASTER_KEY_FILES,
  enterApiPoolMode,
  readMasterKeyFiles
} from "../support/rls-logins.js";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** A made-up superuser login and address: the guard refuses before any connection is tried. */
const superuserUrl = (user: string) => `postgresql://${user}:made-up-password@127.0.0.1:9/made_up_database`;

afterEach(() => { vi.unstubAllEnvs(); });

describe("the master-key list", () => {
  it("a test file not on the list cannot use the superuser pool in a request", async () => {
    vi.stubEnv("DEBATEAI_TEST_API_LOGINS", undefined);
    expect(DEBATEAI_TEST_MASTER_KEY_FILES.has("tests/unit/master-key-files.test.ts")).toBe(false);
    expect(enterApiPoolMode(import.meta.url, superuserUrl("t7_unlisted_superuser"))).toBe("logins");
    const client = new pg.Client({
      user: "t7_unlisted_superuser", host: "127.0.0.1", port: 9, database: "made_up_database"
    });
    await expect(runInRequestScope(() => client.query("SELECT 1"))).rejects.toThrow("R21_SUPERUSER_POOL_IN_REQUEST");
  });

  it("a listed file keeps the superuser pool; DEBATEAI_TEST_API_LOGINS=0 turns login mode off for every file", () => {
    const [listed] = [...DEBATEAI_TEST_MASTER_KEY_FILES.keys()];
    if (listed === undefined) throw new Error("the list is empty: this case needs one entry");
    vi.stubEnv("DEBATEAI_TEST_API_LOGINS", undefined);
    expect(enterApiPoolMode(pathToFileURL(join(PRODUCT_ROOT, listed)).href, superuserUrl("t7_listed_superuser")))
      .toBe("master-key");
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
