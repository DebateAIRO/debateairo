// tests/architecture/repo-hygiene.test.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: gitRoot, encoding: "utf8" }).split("\0").filter(Boolean);

describe("repository hygiene (F-06)", () => {
  it("tracks no dotenv files except the non-secret compose file and examples", () => {
    const offenders = tracked.filter((path) => /(^|\/)\.env(\.[^/]+)?$/.test(path)
      && !path.endsWith(".env.compose") && !path.endsWith(".example"));
    expect(offenders).toEqual([]);
  });
  it("tracks no orchestrator scratch files or browser-automation logs", () => {
    expect(tracked.filter((path) => /^dialectical-engine\/tmp-[^/]*\.txt$/.test(path))).toEqual([]);
    expect(tracked.filter((path) => path.startsWith(".playwright-mcp/"))).toEqual([]);
  });
  it("ignores the classes that leaked before", () => {
    const rootIgnore = readFileSync(resolve(gitRoot, ".gitignore"), "utf8");
    for (const rule of [".playwright-mcp/", "**/.env.local", "**/.env.*.local", "**/.local/"]) {
      expect(rootIgnore.split("\n")).toContain(rule);
    }
  });
});
