/**
 * The R21 master-key guard (upload check Tasks 7 and 8). Test support only, kept apart from rls-logins.ts so that
 * testDatabase.ts and acceptance/standing-db.ts can arm it without loading the login provisioners.
 *
 * - Login mode is the default; DEBATEAI_TEST_API_LOGINS=0 turns it off for a run.
 * - The guard patches pg.Client.prototype.query once per process, so a query on a client connected as a guarded login
 *   (the harness superuser, the "master key") throws R21_SUPERUSER_POOL_IN_REQUEST while a request scope is active
 *   (`requestScopeActive()`, which the API opens for every request). Outside a request scope (seeding, read-backs,
 *   migrations, the runner) it never fires.
 * - What arms it (Task 8): every place a test database starts, keyed on the test file that started it:
 *   `startTestDatabase` (tests/support/testDatabase.ts) and the acceptance tests' `startStandingDatabase`
 *   (acceptance/standing-db.ts), and, as before, every call of `apiTestPools`. So every test file that uses a database
 *   is guarded unless it is on tests/support/master-key-files.txt (the master-key list) or login mode is off.
 * - What stays outside it: code that starts a database outside a vitest test file (the acceptance and support-eval
 *   command-line tools, a child process a test spawns); logins other than the harness superuser; and the work the
 *   runner does on the superuser, because the runner works outside any request (the five copy-database runner groups
 *   of ruling R26, named in the list's header).
 *
 * vitest runs each test file in a fresh worker process (`isolate`, the default), so the patch and its set of guarded
 * logins last for one test file.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { requestScopeActive } from "@debateai/db";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MASTER_KEY_LIST = join(PRODUCT_ROOT, "tests/support/master-key-files.txt");

/**
 * Reads the master-key list, one entry per line: a test file's path from dialectical-engine/, one or more spaces,
 * then the one-line reason it may use the superuser pool inside a request. Lines starting with `#` and blank lines are
 * skipped. An entry without a reason, or a file named twice, refuses MASTER_KEY_FILES_ENTRY_INVALID.
 */
export function readMasterKeyFiles(source: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const found = /^(\S+)\s+(\S.*)$/u.exec(line.trim());
    if (found === null || entries.has(found[1]!)) throw new TypeError(`MASTER_KEY_FILES_ENTRY_INVALID: ${line}`);
    entries.set(found[1]!, found[2]!);
  }
  return entries;
}

/**
 * The master-key list, tests/support/master-key-files.txt: the test files that may use the harness superuser inside a
 * request. Their database starts arm nothing, and their `apiTestPools` hands out the superuser pool. Every other test
 * file that starts a test database, or takes its API pools from `apiTestPools`, is guarded.
 */
export const DEBATEAI_TEST_MASTER_KEY_FILES: ReadonlyMap<string, string> =
  readMasterKeyFiles(readFileSync(MASTER_KEY_LIST, "utf8"));

/** Login mode is on unless DEBATEAI_TEST_API_LOGINS=0 asks for the old superuser runs (upload check Task 7). */
export function loginModeOff(): boolean {
  return process.env.DEBATEAI_TEST_API_LOGINS === "0";
}

/** The user name in a PostgreSQL URL. */
export function loginOf(url: string): string {
  return decodeURIComponent(new URL(url).username);
}

/**
 * The mode `testFile` (a file URL or an absolute path) runs in against the superuser of `superuserUrl`:
 * - "off" when DEBATEAI_TEST_API_LOGINS=0: the superuser pool everywhere, as before Task 7, and nothing armed;
 * - "master-key" when the file is on the master-key list: the superuser pool, with no guard;
 * - "logins" otherwise (the default): the product's own logins, and from now on in this process a query on a client
 *   connected as `superuserUrl`'s login throws R21_SUPERUSER_POOL_IN_REQUEST inside a request scope.
 *
 * `apiTestPools` calls it with its own `testFile`; `armSuperuserGuardForTestFile` calls it where a test database
 * starts. Calling it twice is harmless.
 */
export function enterApiPoolMode(testFile: string, superuserUrl: string): "logins" | "master-key" | "off" {
  if (loginModeOff()) return "off";
  const path = testFile.startsWith("file:") ? fileURLToPath(testFile) : testFile;
  if (DEBATEAI_TEST_MASTER_KEY_FILES.has(relative(PRODUCT_ROOT, path))) return "master-key";
  guardSuperuserInRequests(loginOf(superuserUrl));
  return "logins";
}

/** The vitest worker's state: the test file this process runs (vitest sets `filepath` before each file). */
type VitestWorkerState = { filepath?: string };

/**
 * The test file running in this process, as an absolute path: vitest's own record of it, else the first test file on
 * the stack (read it before the caller's first wait). `undefined` outside a vitest test file: a command-line tool, or
 * a child process a test spawned.
 */
export function currentTestFile(): string | undefined {
  const worker = (globalThis as { __vitest_worker__?: VitestWorkerState }).__vitest_worker__;
  if (worker === undefined) return undefined;
  if (typeof worker.filepath === "string" && isAbsolute(worker.filepath)) return worker.filepath;
  const line = callingTestLine();
  return line === "no-test-frame" ? undefined : join(PRODUCT_ROOT, line.replace(/:\d+$/u, ""));
}

/**
 * Upload check Task 8: arms the guard for the test database at `superuserUrl`, keyed on the test file that started it,
 * in the three modes of `enterApiPoolMode`. Outside a vitest test file it arms nothing ("outside-tests").
 * testDatabase.ts's `startTestDatabase` and acceptance/standing-db.ts's `startStandingDatabase` call it.
 */
export function armSuperuserGuardForTestFile(
  superuserUrl: string,
  testFile: string | undefined = currentTestFile()
): "logins" | "master-key" | "off" | "outside-tests" {
  if (testFile === undefined) return "outside-tests";
  return enterApiPoolMode(testFile, superuserUrl);
}

const R21_GUARD = Symbol.for("debateai.rls.r21-superuser-guard.v1");
type GuardedClientPrototype = { query: (...args: unknown[]) => unknown; [R21_GUARD]?: Set<string> };

/**
 * Login mode (D55): a query on a client whose `user` (pg/lib/client.js:55) is a guarded superuser fails while a request
 * scope is active — `database.pool` and every pool a file builds from the harness URL — instead of passing silently.
 */
function guardSuperuserInRequests(superuser: string): void {
  const prototype = pg.Client.prototype as unknown as GuardedClientPrototype;
  const guarded = prototype[R21_GUARD];
  if (guarded !== undefined) { guarded.add(superuser); return; }
  const users = new Set([superuser]);
  const original = prototype.query;
  prototype.query = function guardedQuery(this: pg.Client, ...args: unknown[]): unknown {
    if (users.has(this.user ?? "") && requestScopeActive()) {
      const failure = new TypeError("R21_SUPERUSER_POOL_IN_REQUEST");
      const callback = args.at(-1);
      if (typeof callback === "function") {
        process.nextTick(() => (callback as (error: Error) => void)(failure));
        return undefined;
      }
      return Promise.reject(failure);
    }
    return original.apply(this, args);
  };
  Object.defineProperty(prototype, R21_GUARD, { value: users });
}

/** The test file of `callingTestLine()`, without its line. */
export function callingTestFile(): string {
  return callingTestLine().replace(/:\d+$/u, "");
}

/** The first stack frame in a test file (not tests/support), as `<path from the product root>:<line>`. */
export function callingTestLine(): string {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 60;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  for (const frame of stack.split("\n").slice(1)) {
    const found = /(\/[^\s():]+\.test\.tsx?):(\d+):\d+/u.exec(frame);
    if (found !== null && !found[1]!.includes("/tests/support/")) return `${relative(PRODUCT_ROOT, found[1]!)}:${found[2]}`;
  }
  return "no-test-frame";
}
