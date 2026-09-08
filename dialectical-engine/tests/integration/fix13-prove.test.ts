import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { provePatch, type SandboxProofRunner } from "../../tools/obs-listener/src/landing/prove.js";
import { createProofWorktree, removeProofWorktree } from "../../tools/obs-listener/src/landing/worktree.js";
import { validatePatch } from "../../tools/obs-listener/src/landing/validate-patch.js";

const run = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await run("git", args, { cwd, encoding: "utf8" })).stdout;
}

async function fixtureRepo(): Promise<Readonly<{ repository: string; baseSha: string; patch: string }>> {
  const repository = await mkdtemp(join(tmpdir(), "fix13-proof-repo-"));
  await git(repository, "init", "-b", "dev");
  await mkdir(join(repository, "apps", "fixture", "src"), { recursive: true });
  await mkdir(join(repository, "tests", "unit"), { recursive: true });
  await writeFile(join(repository, "package.json"), "{\"type\":\"module\"}\n");
  await writeFile(join(repository, "apps", "fixture", "src", "result.mjs"), "export const result = false;\n");
  await writeFile(join(repository, "tests", "unit", "fixture-return.test.mjs"), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { result } from '../../apps/fixture/src/result.mjs';",
    "test('fixture invariant', () => assert.equal(result, true));",
    "",
  ].join("\n"));
  await git(repository, "add", "package.json", "apps/fixture/src/result.mjs", "tests/unit/fixture-return.test.mjs");
  await git(repository, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture base");
  const baseSha = (await git(repository, "rev-parse", "HEAD")).trim();
  await writeFile(join(repository, "apps", "fixture", "src", "result.mjs"), "export const result = true;\n");
  await writeFile(join(repository, "tests", "unit", "fixture-return.test.mjs"), [
    "// invariant: INV-FIXTURE-RETURN",
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { result } from '../../apps/fixture/src/result.mjs';",
    "test('fixture invariant', () => assert.equal(result, true));",
    "",
  ].join("\n"));
  const patch = await git(repository, "diff", "--", "apps/fixture/src/result.mjs", "tests/unit/fixture-return.test.mjs");
  await git(repository, "restore", "apps/fixture/src/result.mjs", "tests/unit/fixture-return.test.mjs");
  return Object.freeze({ repository, baseSha, patch });
}

const fixtureRunner: SandboxProofRunner = Object.freeze({
  async run(command: Parameters<SandboxProofRunner["run"]>[0]) {
    try {
      const result = await run(command.binary, [...command.arguments], { cwd: command.cwd, encoding: "utf8", signal: command.signal });
      return Object.freeze({ outcome: "PASS" as const, exitCode: 0, stdout: result.stdout, stderr: result.stderr });
    } catch (error) {
      const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
      return Object.freeze({
        outcome: failure.code === 1 ? "TEST_FAILURE" as const : "BROKEN" as const,
        exitCode: typeof failure.code === "number" ? failure.code : 127,
        stdout: failure.stdout ?? "",
        stderr: failure.stderr ?? failure.message,
      });
    }
  },
});

describe("FIX-13 isolated RED to GREEN proof", () => {
  it("aborts a dirty proof worktree before running a catalog command", async () => {
    const fixture = await fixtureRepo();
    const parentDirectory = await mkdtemp(join(tmpdir(), "fix13-proof-parent-"));
    const prepared = await createProofWorktree({ repository: fixture.repository, baseSha: fixture.baseSha, parentDirectory });
    await writeFile(join(prepared.path, "DIRTY"), "dirty\n");
    let calls = 0;
    const result = await provePatch({
      prepared,
      patch: fixture.patch,
      validation: { ok: true, touchedPaths: ["apps/fixture/src/result.mjs", "tests/unit/fixture-return.test.mjs"], productionRoot: "apps/fixture/src/result.mjs", invariantId: "INV-FIXTURE-RETURN", command: "node --test tests/unit/fixture-return.test.mjs" },
      runner: { run: async (command) => { calls += 1; return fixtureRunner.run(command); } },
    });
    expect(result).toEqual({ ok: false, code: "OBS_R112_DIRTY_BASE" });
    expect(calls).toBe(0);
    await removeProofWorktree(prepared);
  });

  it("refuses when RED passes on the base and preserves its verbatim output", async () => {
    const fixture = await fixtureRepo();
    const parentDirectory = await mkdtemp(join(tmpdir(), "fix13-proof-parent-"));
    const prepared = await createProofWorktree({ repository: fixture.repository, baseSha: fixture.baseSha, parentDirectory });
    const validation = validatePatch({
      patch: fixture.patch,
      proposalRoot: "apps/fixture/src/result.mjs:result",
      declaredScope: ["apps/fixture/src/result.mjs", "tests/unit/fixture-return.test.mjs"],
      allowlistGlobs: ["apps/fixture/src/result.mjs", "tests/unit/fixture-return.test.mjs"],
      floorDenyGlobs: ["tools/**"],
      catalog: { invariants: [{ id: "INV-FIXTURE-RETURN", description: "fixture return invariant", command: "node -e process.exit(0) tests/unit/fixture-return.test.mjs", ownedBy: "V" }] },
      invariantId: "INV-FIXTURE-RETURN",
    });
    if (!validation.ok) throw new Error(validation.code);
    const result = await provePatch({ prepared, patch: fixture.patch, validation, runner: fixtureRunner });
    expect(result).toMatchObject({ ok: false, code: "REFUSED_RED_PASSED", red: { outcome: "PASS", stdout: "" } });
    await removeProofWorktree(prepared);
  });

  it("captures a failing base result and passing patched result in a disposable worktree", async () => {
    const fixture = await fixtureRepo();
    const parentDirectory = await mkdtemp(join(tmpdir(), "fix13-proof-parent-"));
    const prepared = await createProofWorktree({ repository: fixture.repository, baseSha: fixture.baseSha, parentDirectory });
    const validation = validatePatch({
      patch: fixture.patch,
      proposalRoot: "apps/fixture/src/result.mjs:result",
      declaredScope: ["apps/fixture/src/result.mjs", "tests/unit/fixture-return.test.mjs"],
      allowlistGlobs: ["apps/fixture/src/result.mjs", "tests/unit/fixture-return.test.mjs"],
      floorDenyGlobs: ["tools/**"],
      catalog: { invariants: [{ id: "INV-FIXTURE-RETURN", description: "fixture return invariant", command: "node --test tests/unit/fixture-return.test.mjs", ownedBy: "V" }] },
      invariantId: "INV-FIXTURE-RETURN",
    });
    if (!validation.ok) throw new Error(validation.code);
    const result = await provePatch({ prepared, patch: fixture.patch, validation, runner: fixtureRunner });
    expect(result).toMatchObject({
      ok: true,
      red: { outcome: "TEST_FAILURE", exitCode: 1 },
      green: { outcome: "PASS", exitCode: 0 },
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.red.stdout + result.red.stderr).toContain("fixture invariant");
    expect(result.green.stdout).toContain("pass 1");
    expect(await git(prepared.path, "diff", "--name-only")).toBe("apps/fixture/src/result.mjs\ntests/unit/fixture-return.test.mjs\n");
    await removeProofWorktree(prepared);
  });
});
