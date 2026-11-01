import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// R22 decision 18: the automatic check that refuses real limits in new commits. Every test drives the real script over a
// scratch repository, with a scratch list of made-up values. A list that holds no real figure is what makes this file safe
// to commit, and every "hit" is paired with a "miss", so a check that refused everything or nothing fails here.

const SCRIPT = resolve("tools/limits-check.mjs");
/** Made-up list entries: none is a figure of this site. */
const SCRATCH_LIST = "# a comment line\n\n987_654\n$3.21\n17 widgets\n";

let repo: string;

const git = (...args: string[]): string => execFileSync("git", args, {
  cwd: repo, encoding: "utf8",
  env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined,
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" }
}).trim();

function put(path: string, text: string): void {
  const file = join(repo, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function commit(message = "a change"): string {
  git("add", "-A");
  git("commit", "--allow-empty", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

type Run = Readonly<{ code: number; out: string }>;

function check(base: string | null, env: Record<string, string | undefined> = {}, ...extra: string[]): Run {
  const result = spawnSync(process.execPath, [SCRIPT, ...(base === null ? [] : ["--base", base]), ...extra], {
    cwd: repo, encoding: "utf8",
    env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined,
      LIMITS_CHECK_LIST: undefined, LIMITS_CHECK_LIST_FILE: join(repo, "..", "no-such-list"), ...env }
  });
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

const withList = { LIMITS_CHECK_LIST: SCRATCH_LIST };

beforeEach(() => {
  repo = join(mkdtempSync(join(tmpdir(), "limits-check-")), "repo");
  mkdirSync(repo);
  git("init", "-q", "-b", "scratch");
  put("start.txt", "the first line\n");
  commit("start");
});

afterEach(() => {
  rmSync(dirname(repo), { recursive: true, force: true });
});

describe("the list half: real figures, read from outside the repository", () => {
  it("refuses an added line holding a listed figure, and names place and entry number, never the value or the line", () => {
    const base = git("rev-parse", "HEAD");
    put("code.ts", "const fine = 1;\nconst secretWord = 987_654;\n");
    commit();
    const run = check(base, withList);
    expect(run.code).toBe(1);
    expect(run.out).toContain("code.ts:2");
    expect(run.out).toContain("entry 1");
    expect(run.out).not.toContain("987");
    expect(run.out).not.toContain("654");
    expect(run.out).not.toContain("secretWord");
  });

  it("passes a change with no listed figure, so the refusal above came from the figure", () => {
    const base = git("rev-parse", "HEAD");
    put("code.ts", "const fine = 1;\nconst other = 987_655;\n");
    commit();
    const run = check(base, withList);
    expect(run.code).toBe(0);
    expect(run.out).toContain("LIMITS_CHECK_OK");
  });

  it("scans changed text only: a figure already in the base is not refused, one added beside it is", () => {
    put("old.ts", "const old = 987654;\n");
    const base = commit("the base already holds one");
    put("old.ts", "const old = 987654;\nconst next = 1;\n");
    commit();
    expect(check(base, withList).code).toBe(0);
    put("old.ts", "const old = 987654;\nconst next = 987654;\n");
    commit();
    const run = check(base, withList);
    expect(run.code).toBe(1);
    expect(run.out).toContain("old.ts:2");
    expect(run.out).not.toContain("old.ts:1");
  });

  it.each([
    ["with underscores", "x = 987_654"],
    ["bare", "x = 987654"],
    ["with commas", "x = 987,654"],
    ["money, entry as written", "costs $3.21 today"],
    ["words, whatever the letter case", "there are 17 Widgets here"]
  ])("matches a figure %s", (_label, line) => {
    const base = git("rev-parse", "HEAD");
    put("a.md", `${line}\n`);
    commit();
    expect(check(base, withList).code).toBe(1);
  });

  it.each([
    ["a longer number holding the digits", "x = 1987654"],
    ["a decimal holding the digits", "x = 0.987654"],
    ["a number that goes on past them", "x = 9876543"],
    ["a longer amount", "costs $3.215 today"],
    ["a longer word", "there are 17 widgetsmiths here"],
    ["a different number before the words", "there are 117 widgets here"]
  ])("does not match %s", (_label, line) => {
    const base = git("rev-parse", "HEAD");
    put("a.md", `${line}\n`);
    commit();
    expect(check(base, withList).code).toBe(0);
  });

  it("refuses a listed figure in a commit message and in a new file's name", () => {
    const base = git("rev-parse", "HEAD");
    commit("the limit is 987654");
    const message = check(base, withList);
    expect(message.code).toBe(1);
    expect(message.out).toContain("commit message");
    expect(message.out).not.toContain("987654");

    const later = git("rev-parse", "HEAD");
    put("limit-987654.md", "nothing here\n");
    commit();
    const name = check(later, withList);
    expect(name.code).toBe(1);
    expect(name.out).toContain("file name");
  });

  it("reads the list from a file outside the repository as well", () => {
    const base = git("rev-parse", "HEAD");
    put("code.ts", "const a = 987654;\n");
    commit();
    const list = join(dirname(repo), "scratch-list.txt");
    writeFileSync(list, SCRATCH_LIST);
    expect(check(base, { LIMITS_CHECK_LIST_FILE: list }).code).toBe(1);
  });

  it("passes plainly, with a note, when no list exists, until the owner adds it", () => {
    const base = git("rev-parse", "HEAD");
    put("code.ts", "const a = 987654;\n");
    commit();
    const run = check(base);
    expect(run.code).toBe(0);
    expect(run.out).toContain("LIMITS_CHECK_NO_LIST");
  });

  it("treats an empty secret as no list", () => {
    const base = git("rev-parse", "HEAD");
    put("code.ts", "const a = 987654;\n");
    commit();
    const run = check(base, { LIMITS_CHECK_LIST: "" });
    expect(run.code).toBe(0);
    expect(run.out).toContain("LIMITS_CHECK_NO_LIST");
  });

  it("lets a marked line through, and says how many were", () => {
    const base = git("rev-parse", "HEAD");
    put("code.ts", "const timeoutMs = 987_654; // limits-check-ok: a timeout, not a limit\n");
    commit();
    const run = check(base, withList);
    expect(run.code).toBe(0);
    expect(run.out).toContain("1 line carried the mark");
  });
});

describe("the shape half: what is knowable without a list", () => {
  it("refuses a plan figure in an example file unless it is one of the marked made-up values", () => {
    const base = git("rev-parse", "HEAD");
    put("deploy/register/site.example.json", `{ "plans": [{ "monthly_credit_micros": 1234567 }] }\n`);
    commit();
    const run = check(base);
    expect(run.code).toBe(1);
    expect(run.out).toContain("site.example.json:1");
    expect(run.out).toContain("LIMITS_CHECK_SHAPE");
    expect(run.out).not.toContain("1234567");
  });

  it("passes the marked made-up values in an example file", () => {
    const base = git("rev-parse", "HEAD");
    put("deploy/register/site.example.json", `{ "plans": [{ "monthly_credit_micros": 330000, "reserve_micros": 88000, "day_bp": 1100 }] }\n`);
    commit();
    expect(check(base).code).toBe(0);
  });

  it("leaves the same member alone outside example files: a test's own made-up numbers are not its business", () => {
    const base = git("rev-parse", "HEAD");
    put("tests/unit/some.test.ts", "const row = { monthly_credit_micros: 1234567 };\n");
    commit();
    expect(check(base).code).toBe(0);
  });

  it("refuses a sentence that puts a money amount beside a plan's limit, in any file", () => {
    const base = git("rev-parse", "HEAD");
    put("notes.md", "Free's monthly credit is 8.76 USD.\n");
    put("code.ts", "// the plan's reserve: 4 cents.\n");
    commit();
    const run = check(base);
    expect(run.code).toBe(1);
    expect(run.out).toContain("notes.md:1");
    expect(run.out).toContain("code.ts:1");
  });

  it("leaves a public price and a vendor's price alone: no limit word, no refusal", () => {
    const base = git("rev-parse", "HEAD");
    put("notes.md", "Plus costs $20 a month.\n| some-model | maker | $0.20 / $0.60 |\nThe query binds $5 and $6.\n");
    commit();
    expect(check(base).code).toBe(0);
  });

  it("the marked made-up money figures may sit beside a limit word", () => {
    const base = git("rev-parse", "HEAD");
    put("notes.md", "For example, a monthly credit of 0.33 USD.\n");
    commit();
    expect(check(base).code).toBe(0);
  });

  it("runs both halves together: the note about a missing list never hides a shape refusal", () => {
    const base = git("rev-parse", "HEAD");
    put("notes.md", "The team's limit is $6.54 a month.\n");
    commit();
    const run = check(base);
    expect(run.code).toBe(1);
    expect(run.out).toContain("LIMITS_CHECK_NO_LIST");
  });
});

describe("the ways of running it", () => {
  it("refuses plainly when asked to compare with a commit that does not exist, rather than passing", () => {
    expect(check("0123456789abcdef0123456789abcdef01234567", withList).code).toBe(2);
    expect(check(null, withList).code).toBe(2);
  });

  it("--staged reads what is about to be committed", () => {
    put("code.ts", "const a = 987654;\n");
    git("add", "-A");
    const run = check(null, withList, "--staged");
    expect(run.code).toBe(1);
    expect(run.out).toContain("code.ts:1");
  });

  it("--whole-tree audits every tracked file, and counts per file without values", () => {
    put("a.ts", "const a = 987654;\nconst b = 987654;\n");
    put("b.ts", "const c = 1;\n");
    commit();
    const run = check(null, withList, "--whole-tree");
    expect(run.code).toBe(1);
    expect(run.out).toContain("a.ts: 2");
    expect(run.out).not.toContain("b.ts");
    expect(run.out).not.toContain("987654");
  });

  it("the workflow reads the list only from the secret, and never echoes it", () => {
    const workflow = readFileSync(resolve("../.github/workflows/limits-check.yml"), "utf8");
    expect(workflow).toContain("LIMITS_CHECK_LIST: ${{ secrets.LIMITS_CHECK_LIST }}");
    expect(workflow).toContain("node tools/limits-check.mjs");
    expect(workflow).not.toMatch(/echo|pull_request_target|set -x/u);
  });
});
