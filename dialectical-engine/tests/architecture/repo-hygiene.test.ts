// tests/architecture/repo-hygiene.test.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  // V-8 (L6-F11): `.husky/` was dormant scaffolding — no `core.hooksPath`, no husky dependency,
  // no script that installs it. Activated it would have blocked every push and guarded `develop`,
  // a branch this project does not have. CI is the gate; the folder is gone and may not return.
  it("keeps no dormant git-hook scaffolding (V-8)", () => {
    expect(existsSync(resolve(gitRoot, "dialectical-engine/.husky")), "dialectical-engine/.husky").toBe(false);
    const manifests = tracked.filter((path) => /(^|\/)package\.json$/.test(path));
    expect(manifests.length, "tracked package.json manifests").toBeGreaterThan(0);
    for (const manifest of manifests) {
      const scripts = (JSON.parse(readFileSync(resolve(gitRoot, manifest), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
      for (const [name, body] of Object.entries(scripts)) {
        expect(body, `${manifest} > scripts.${name}`).not.toMatch(/husky/);
      }
    }
  });
  it("ignores the classes that leaked before", () => {
    const rootIgnore = readFileSync(resolve(gitRoot, ".gitignore"), "utf8");
    for (const rule of [".playwright-mcp/", "**/.env.local", "**/.env.*.local", "**/.local/"]) {
      expect(rootIgnore.split("\n")).toContain(rule);
    }
  });
});
