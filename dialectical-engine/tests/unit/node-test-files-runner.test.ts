import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// vitest only collects tests/**/*.test.ts(x) (vitest.config.ts), so a `node:test` suite written as *.test.mjs under
// tests/ ran nowhere: tests/turnstile/siteverify-relay.test.mjs (the Turnstile relay's input, transport and custody
// checks) was never executed by any runner. This gate discovers every such file and runs it with `node --test`.
// apps/ui keeps its own manifest-driven runner (v2ui-node-runner.test.ts).
const root = process.cwd();
const discovered = readdirSync(join(root, "tests"), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
  .sort();

describe("node:test suites under tests/ run in the gate", () => {
  it("finds the Turnstile relay suite (and any later *.test.mjs)", () => {
    expect(discovered).toContain("tests/turnstile/siteverify-relay.test.mjs");
  });

  it.each(discovered)("executes %s with node --test and every test passes", (file) => {
    const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", file], {
      cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, timeout: 120_000
    });
    const count = (label: string) => Number(new RegExp(`^# ${label} (\\d+)$`, "m").exec(result.stdout)?.[1] ?? Number.NaN);
    const detail = { status: result.status, signal: result.signal, stderr: result.stderr.slice(-2000), stdout: result.stdout.slice(-4000) };
    expect(detail, `${file} must exit 0 under node --test`).toMatchObject({ status: 0, signal: null });
    // A suite that collected nothing would also exit 0: require real executed tests and no failure of any kind.
    expect(count("tests"), file).toBeGreaterThan(0);
    expect(count("pass"), file).toBe(count("tests"));
    for (const label of ["fail", "cancelled", "skipped", "todo"]) expect(count(label), `${file} ${label}`).toBe(0);
  }, 125_000);
});
