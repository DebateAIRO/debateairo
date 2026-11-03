// Upload check Tasks 7 and 8: every test file that uses a database logs in with the product's own database logins by
// default, and only the files on tests/support/master-key-files.txt may use the harness superuser (the "master key")
// inside a request. The guard arms where a test database starts (startTestDatabase, the acceptance tests'
// startStandingDatabase) and in apiTestPools; the first case below starts a real database to show it. The other cases
// need no database: the guard refuses the query before the client ever connects. The last case pins who may turn
// login mode off (review M-10).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runInRequestScope } from "@debateai/db";
import {
  DEBATEAI_TEST_MASTER_KEY_FILES,
  enterApiPoolMode,
  readMasterKeyFiles
} from "../support/rls-logins.js";
import { armSuperuserGuardForTestFile, currentTestFile } from "../support/master-key-guard.js";
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

describe("the test file the guard is keyed on", () => {
  it("without vitest's worker state the stack still names the test file", () => {
    // A future vitest that renamed `__vitest_worker__`: the lookup falls back to the first test file on the stack.
    expect(currentTestFile(undefined)).toBe(join(PRODUCT_ROOT, "tests/unit/master-key-files.test.ts"));
    expect(currentTestFile({})).toBe(join(PRODUCT_ROOT, "tests/unit/master-key-files.test.ts"));
    expect(currentTestFile()).toBe(join(PRODUCT_ROOT, "tests/unit/master-key-files.test.ts"));
  });

  it("with no test file named it refuses loudly inside vitest in login mode, and arms nothing elsewhere", () => {
    vi.stubEnv("DEBATEAI_TEST_API_LOGINS", undefined);
    expect(() => armSuperuserGuardForTestFile(superuserUrl("t8_unknown_superuser"), undefined))
      .toThrow("MASTER_KEY_GUARD_TEST_FILE_UNKNOWN");
    vi.stubEnv("DEBATEAI_TEST_API_LOGINS", "0");
    expect(armSuperuserGuardForTestFile(superuserUrl("t8_unknown_superuser"), undefined)).toBe("off");
    // Outside vitest (a command-line tool, a child spawned with a clean environment) nothing is armed.
    vi.stubEnv("DEBATEAI_TEST_API_LOGINS", undefined);
    vi.stubEnv("VITEST", undefined);
    expect(armSuperuserGuardForTestFile(superuserUrl("t8_unknown_superuser"), undefined)).toBe("outside-tests");
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

/** The variable that turns login mode off for a run (DEBATEAI_TEST_API_LOGINS=0). */
const LOGIN_MODE_VARIABLE = "DEBATEAI_TEST_API_LOGINS";

/**
 * Review M-10: the files that may write DEBATEAI_TEST_API_LOGINS, each with its reason. Any other test or support file
 * that sets, stubs, deletes or passes it on could quietly run a file on the superuser, so it must be named here first.
 */
const LOGIN_MODE_WRITERS: ReadonlyMap<string, string> = new Map([
  ["tests/integration/rls-account-context.test.ts",
    "turns login mode on and off around single cases to prove both modes of apiTestPools and runnerTestPool"],
  ["tests/unit/master-key-files.test.ts",
    "stubs it to prove the three modes, and names it here to find its writers"]
]);

/** Where a writer could hide: every test and support folder, the tools, and the CI workflows that run the tests. */
const SCANNED = ["tests", "acceptance", "tools", "package.json", "vitest.config.ts", "../.github/workflows"];
const SCANNED_EXTENSIONS = /\.(?:[cm]?[jt]sx?|sh|json|ya?ml)$/u;

/**
 * True when `source` writes the variable: a quoted name (stubEnv, process.env[...], a name kept in a constant), an
 * object or YAML key (an env passed to a child), an assignment or delete on process.env, or a shell form (NAME=...,
 * env -u NAME). Comment lines do not count; reads such as `process.env.NAME === "0"` do not either.
 */
function writesLoginMode(source: string): boolean {
  const name = LOGIN_MODE_VARIABLE;
  const forms = [
    new RegExp(`(["'\`])${name}\\1`, "u"),
    new RegExp(`(?:^|[\\s{,])${name}\\s*:(?!:)`, "u"),
    new RegExp(`process\\.env\\.${name}\\s*(?:\\?\\?|\\|\\||&&)?=(?!=)`, "u"),
    new RegExp(`delete\\s+process\\.env\\.${name}\\b`, "u"),
    new RegExp(`(?:^|[\\s"'\`;(])${name}=`, "u"),
    new RegExp(`-u\\s+${name}\\b`, "u")
  ];
  return source.split("\n").some((line) => {
    const code = line.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*") || code.startsWith("#")) return false;
    return forms.some((form) => form.test(code));
  });
}

function scannedFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return SCANNED_EXTENSIONS.test(path) ? [path] : [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.name !== "node_modules" && !entry.name.startsWith("."))
    .flatMap((entry) => scannedFiles(join(path, entry.name)));
}

describe("who may turn login mode off (review M-10)", () => {
  it("the scanner sees every way of writing the variable, and not a read, a comment or another variable", () => {
    const name = LOGIN_MODE_VARIABLE;
    for (const written of [
      `vi.stubEnv("${name}", "0");`, `process.env.${name} = "0";`, `process.env["${name}"] = "0";`,
      `delete process.env.${name};`, `spawn(cmd, { env: { ...process.env, ${name}: "0" } });`,
      `const key = "${name}";`, `env ${name}=0 pnpm test`, `export ${name}=0`, `env -u ${name} vitest`,
      `      ${name}: "0"`, `process.env.${name} ??= "0";`
    ]) expect({ written, found: writesLoginMode(written) }).toEqual({ written, found: true });
    for (const read of [
      `return process.env.${name} === "0";`, `// ${name}=0 turns it off`, ` * ${name}=0: superuser pools`,
      `# ${name}=0`, `process.env.${name}_REPORT = report;`, `{ ${name}_REPORT: report }`
    ]) expect({ read, found: writesLoginMode(read) }).toEqual({ read, found: false });
  });

  it("only the files named in LOGIN_MODE_WRITERS write DEBATEAI_TEST_API_LOGINS", () => {
    const files = SCANNED.flatMap((path) => scannedFiles(join(PRODUCT_ROOT, path)));
    expect(files.length).toBeGreaterThan(1000);
    const writers = files.filter((file) => writesLoginMode(readFileSync(file, "utf8")))
      .map((file) => relative(PRODUCT_ROOT, file)).sort();
    expect(writers).toEqual([...LOGIN_MODE_WRITERS.keys()].sort());
  });
});

