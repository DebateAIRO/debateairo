// tests/architecture/public-debate-upvotes-closing.test.ts
// Upvotes on public debates (design §6): the two closed lists the slice registers last. The shipped-file manifest names each new
// shipped source file, and the pull-request integration list runs each of the slice's database suites once, under a comment naming
// step 0193. Neither the known-red list nor the host-sensitive list gains an entry of this slice.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");

/** The database suites this slice adds. Each runs on every pull request. */
const SUITES = [
  "tests/integration/public-debate-upvotes-0193.test.ts",
  "tests/integration/public-debate-upvotes-repository.test.ts",
  "tests/integration/public-vote-flow.test.ts"
] as const;
/** The shipped source files this slice adds. */
const SHIPPED = [
  "apps/api/src/public-vote-sweep.ts",
  "apps/api/src/public-vote.ts",
  "apps/ui/components/LibraryVote.tsx",
  "apps/ui/lib/upvoteWords.ts",
  "packages/db/src/migration-forward0193.ts",
  "packages/db/src/public-debate-upvote.ts"
] as const;

describe("public debate upvotes: the closing registrations", () => {
  it("runs each of the slice's database suites on every pull request, once, under a comment naming step 0193", () => {
    const lines = read("tests/ci-integration-auth.txt").split("\n");
    for (const suite of SUITES) {
      expect(existsSync(new URL(suite, ROOT)), suite).toBe(true);
      expect(lines.filter((line) => line === suite), suite).toEqual([suite]);
      expect(lines[lines.indexOf(suite) - 1], suite).toMatch(/^# [^\n]*\(0193\): [^\n]+\.$/u);
    }
  });

  it("leaves no upvote suite of tests/integration off that list", () => {
    const lines = read("tests/ci-integration-auth.txt").split("\n");
    const unlisted = readdirSync(new URL("tests/integration", ROOT))
      .filter((name) => /^public-(?:debate-upvote|vote)[\w.-]*\.test\.ts$/u.test(name))
      .map((name) => `tests/integration/${name}`)
      .filter((path) => !lines.includes(path));
    expect(unlisted).toEqual([]);
  });

  it("names each of the slice's shipped files in the shipped-file manifest", () => {
    const manifest = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const path of SHIPPED) {
      expect(existsSync(new URL(path, ROOT)), path).toBe(true);
      expect(manifest, path).toContain(path);
    }
  });

  it("adds no known-red and no host-sensitive entry", () => {
    for (const list of ["tests/ci-known-red.txt", "tests/ci-flaky.txt"]) {
      expect(read(list), list).not.toMatch(/upvote|public-vote|library-vote/iu);
    }
  });
});
