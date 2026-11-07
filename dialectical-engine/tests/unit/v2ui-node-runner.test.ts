import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const v2UiDirectory = join(process.cwd(), "apps", "ui");
const manifest = JSON.parse(
  readFileSync(join(v2UiDirectory, "scripts", "node-test-manifest.json"), "utf8")
) as string[];

describe("HYG-01 v2-ui Node test gate", () => {
  it("keeps every active .test.mjs file in the explicit runner manifest", () => {
    const activeTests = readdirSync(v2UiDirectory, { recursive: true, withFileTypes: true })
      // both naming forms are active suites: foo.test.mjs and foo.source-test.mjs
      .filter((entry) => entry.isFile() && /(?:^|[.-])test\.mjs$/.test(entry.name))
      .map((entry) => relative(v2UiDirectory, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
      .sort();

    expect(activeTests).toEqual([...manifest].sort());
  });

  it("executes the maintained 31KB scoring-response behavioral suite", () => {
    const result = spawnSync(process.execPath, ["scripts/run-node-tests.mjs"], {
      cwd: v2UiDirectory,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      // A hang guard, not a speed check: the 43 files run one at a time, each in its own tsx process (about 40 s on a
      // free Mac). On CI they share the runner with the whole root gate, and PR #224 (about 150 more gate files) took
      // them past 120 s twice. The suite must still exit 0.
      timeout: 300_000
    });

    expect(
      { status: result.status, signal: result.signal, stderr: result.stderr, stdout: result.stdout },
      "The v2-ui Node suites are part of the enforced root Vitest gate; phantom .mjs coverage is forbidden"
    ).toMatchObject({ status: 0, signal: null });
  }, 305_000);
});
