import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GIT_ROOT = resolve(import.meta.dirname, "../../..");

/**
 * DL6-F4, and the owner's standing rule (2026-09-17): "we should never put named paths in
 * the code, only relative paths, since this code is run on multiple computers, so if we have
 * something particular to a computer, it would break on the others. If it needs to be set to
 * something local, it needs to be deduced first, never set in stone."
 *
 * Records may transcribe a measured path — that is what a record is for — so `.md`, the
 * mission report trees and test fixtures are out of scope here. What this row forbids is a
 * one-machine path in anything that RUNS: sources, launchers, deploy files, tooling config.
 */
const RECORD_OR_FIXTURE = /(^|\/)(\.hermes|docs|node_modules|\.next|dist|coverage)\//;
const IS_TEXT_WE_RUN = /\.(ts|tsx|mjs|cjs|js|json|sh|zsh|yaml|yml|plist|service|timer|toml)$/;
const HOME_PATH = /\/Users\/[A-Za-z0-9._-]+\//;

describe("no one-machine paths in anything that runs (DL6-F4)", () => {
  it("names no contributor's home directory", async () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: GIT_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\0").filter(Boolean);
    const candidates = tracked.filter((path) =>
      IS_TEXT_WE_RUN.test(path)
      && !RECORD_OR_FIXTURE.test(path)
      && !/\.test\.|\.source-test\.|(^|\/)tests\//.test(path));
    expect(candidates.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const path of candidates) {
      const text = await readFile(join(GIT_ROOT, path), "utf8").catch(() => "");
      const line = text.split("\n").findIndex((row) => HOME_PATH.test(row));
      if (line >= 0) offenders.push(`${path}:${line + 1}`);
    }
    expect(offenders).toEqual([]);
  });
});
