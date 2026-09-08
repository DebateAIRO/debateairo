import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { detectPresentedMerge, presentFix } from "../../tools/obs-listener/src/landing/present.js";
import { createProofWorktree, removeProofWorktree } from "../../tools/obs-listener/src/landing/worktree.js";

const run = promisify(execFile);
async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await run("git", args, { cwd, encoding: "utf8" })).stdout;
}

async function repositoryFixture() {
  const repository = await mkdtemp(join(tmpdir(), "fix13-present-repo-"));
  await git(repository, "init", "-b", "dev");
  await mkdir(join(repository, "apps", "fixture", "src"), { recursive: true });
  await writeFile(join(repository, "apps", "fixture", "src", "result.mjs"), "export const result = false;\n");
  await git(repository, "add", "apps/fixture/src/result.mjs");
  await git(repository, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture base");
  return { repository, baseSha: (await git(repository, "rev-parse", "HEAD")).trim() };
}

describe("FIX-13 local presentation", () => {
  it("creates one local branch and one revertible commit, posts the closed template, and waits", async () => {
    const fixture = await repositoryFixture();
    const prepared = await createProofWorktree({
      repository: fixture.repository,
      baseSha: fixture.baseSha,
      parentDirectory: await mkdtemp(join(tmpdir(), "fix13-present-parent-")),
    });
    await writeFile(join(prepared.path, "apps", "fixture", "src", "result.mjs"), "export const result = true;\n");
    const comments: string[] = [];
    const actions: unknown[] = [];
    const states: string[] = [];
    const presented = await presentFix({
      prepared,
      incidentHash: "d".repeat(64),
      incidentId: "10000000-0000-4000-8000-000000000013",
      fingerprint: "e".repeat(64),
      root: "apps/fixture/src/result.mjs:result",
      rootVerdict: "CODE_ROOT",
      evidenceIds: ["20000000-0000-4000-8000-000000000013"],
      causalPath: ["OBS_FIXTURE_FAILED", "OBS_FIXTURE_ROOT"],
      redCommand: "node --test tests/unit/fixture-return.test.mjs",
      red: { outcome: "TEST_FAILURE", exitCode: 1, stdout: "raw fixture failure", stderr: "" },
      green: { outcome: "PASS", exitCode: 0, stdout: "raw fixture pass", stderr: "" },
      gates: [{ outcome: "PASS", exitCode: 0, stdout: "gate pass", stderr: "" }],
      touchedPaths: ["apps/fixture/src/result.mjs"],
      blastRadius: 1,
      sizeLabel: "QUICK",
      notChanged: ["NO_DEPENDENCIES", "NO_MIGRATIONS"],
      spendUnits: 5,
      ticketId: "ticket-13",
      ticket: { comment: async (_ticketId, value) => { comments.push(value); } },
      actions: { append: async (value) => { actions.push(value); } },
      incidents: { setState: async (_incidentId, state) => { states.push(state); } },
    });

    expect(presented.branch).toBe(`fixagent/${"d".repeat(64)}`);
    expect((await git(fixture.repository, "branch", "--list", "fixagent/*", "--format=%(refname:short)")).trim()).toBe(`fixagent/${"d".repeat(64)}`);
    expect((await git(fixture.repository, "rev-list", "--count", `${fixture.baseSha}..${presented.branch}`)).trim()).toBe("1");
    expect((await git(fixture.repository, "rev-parse", "dev")).trim()).toBe(fixture.baseSha);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatch(/^PR_PRESENTED\n/u);
    for (const field of ["incident:", "fingerprint:", "root:", "evidence_ids:", "causal_path:", "RED on base:", "diff_scope:", "GREEN:", "privacy_attestation:", "forbidden_surface_attestation:", "blast_radius:", "size_label:", "not_changed:", "spend:", "revert:"]) {
      expect(comments[0]).toContain(field);
    }
    expect(comments[0]).not.toContain("raw fixture failure");
    expect(actions).toMatchObject([{ kind: "PR_PRESENTED", branch: presented.branch, actionRef: presented.commit, proof: { red: { stdout: "raw fixture failure" } } }]);
    expect(states).toEqual(["PR_PRESENTED"]);

    await git(fixture.repository, "-c", "user.name=V", "-c", "user.email=v@example.invalid", "merge", "--no-ff", presented.branch, "-m", "V local merge");
    const mergedStates: string[] = [];
    expect(await detectPresentedMerge({
      repository: fixture.repository,
      branch: presented.branch,
      targetBranch: "dev",
      incidentId: "10000000-0000-4000-8000-000000000013",
      incidents: { setState: async (_incidentId, state) => { mergedStates.push(state); } },
    })).toEqual({ merged: true, state: "FIXED_UNVALIDATED" });
    expect(mergedStates).toEqual(["FIXED_UNVALIDATED"]);
    await removeProofWorktree(prepared);
  });
});
