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

// V-7 (L6-F8): two classes of bulky machine recording are kept in git HISTORY but are no longer
// tracked at HEAD — 110 Playwright trace archives (466.0 MiB) and 22 AI-session transcripts
// (49.1 MiB), measured 2026-09-22. CLASSES, never whole folders: the written records beside the
// transcripts stay tracked (two architecture tests read S10-erasure-evidence-artifact.md out of
// the same logs folder), and so does the one .jsonl codex-session test fixture. The commit that
// still carries every file is named in
// docs/missions/2026-09-01-security-hardening/UNTRACKED-EVIDENCE-2026-09-22.md.
const BULKY_RECORDING_CLASSES: ReadonlyArray<readonly [string, RegExp, string]> = [
  ["Playwright trace archives", /^dialectical-engine\/\.hermes\/reports\/.*\.zip$/, "dialectical-engine/.hermes/reports/**/*.zip"],
  ["AI-session transcripts", /^dialectical-engine\/docs\/missions\/.*\/logs\/.*\.jsonl$/, "dialectical-engine/docs/missions/**/logs/**/*.jsonl"]
];

describe("bulky recordings are history, not working tree (V-7)", () => {
  it("tracks no file of either class", () => {
    for (const [label, pattern] of BULKY_RECORDING_CLASSES) {
      expect(tracked.filter((path) => pattern.test(path)), label).toEqual([]);
    }
  });
  it("ignores exactly those two classes, so they cannot return", () => {
    const rootIgnore = readFileSync(resolve(gitRoot, ".gitignore"), "utf8").split("\n");
    for (const [label, , rule] of BULKY_RECORDING_CLASSES) expect(rootIgnore, label).toContain(rule);
  });
  it("keeps the written records and the codex-session fixture the classes sit beside", () => {
    expect(tracked, "the S10 erasure-evidence record shares the transcripts' folder")
      .toContain("dialectical-engine/docs/missions/2026-08-17-accounts-privacy-security/logs/S10-erasure-evidence-artifact.md");
    const fixtures = tracked.filter((path) => path.startsWith("dialectical-engine/acceptance/test-fixtures/codex-sessions/") && path.endsWith(".jsonl"));
    expect(fixtures.length, "the codex-session .jsonl test fixture").toBeGreaterThan(0);
  });
});
