import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { beginApprovedMutation, readMutationLease, revokeActiveMutation } from "../../tools/obs-listener/src/landing/lease.js";
import { createProofWorktree, removeProofWorktree } from "../../tools/obs-listener/src/landing/worktree.js";
import { canonicalProposalHash } from "../../tools/obs-listener/src/obsctl/proposal-control.js";
import { kill } from "../../tools/obs-listener/src/obsctl/kill.js";
import type { FixProposal } from "../../tools/obs-listener/src/worker-diagnosis/schema.js";

const run = promisify(execFile);
async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await run("git", args, { cwd, encoding: "utf8" })).stdout;
}

describe("FIX-13 kill cleanup", () => {
  it("binds lease revocation into the obsctl kill transaction", async () => {
    let revoked = 0;
    expect(await kill({
      appendIntent: async () => undefined,
      ensureMarker: async () => undefined,
      revokeMutationLease: async () => { revoked += 1; },
      sampleMarkers: async () => ({ captureOff: true, kill: true }),
      appendResult: async () => undefined,
    })).toEqual({ exitCode: 0, output: "KILLED\n" });
    expect(revoked).toBe(1);
  });

  it("revokes the lease, kills the process group, removes the proof worktree, and creates no branch", async () => {
    const repository = await mkdtemp(join(tmpdir(), "fix13-kill-repo-"));
    await git(repository, "init", "-b", "dev");
    await mkdir(join(repository, "apps", "fixture", "src"), { recursive: true });
    await writeFile(join(repository, "apps", "fixture", "src", "result.mjs"), "export const result = false;\n");
    await git(repository, "add", "apps/fixture/src/result.mjs");
    await git(repository, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture base");
    const baseSha = (await git(repository, "rev-parse", "HEAD")).trim();
    const prepared = await createProofWorktree({ repository, baseSha, parentDirectory: await mkdtemp(join(tmpdir(), "fix13-kill-parent-")) });
    const proposal: FixProposal = Object.freeze({
      incidentId: "10000000-0000-4000-8000-000000000013",
      root: "apps/fixture/src/result.mjs:result",
      diagnosis: { defectClass: "WRONG_BRANCH" as const, params: { code: "OBS_FIXTURE_FAILED" } },
      changeScope: ["apps/fixture/src/result.mjs"], sizeLabel: "QUICK",
      redTestPlan: { invariantRef: "INV-FIXTURE-RETURN" }, spendUnits: 1,
      blastRadius: { reachableModules: 1, modules: ["apps/fixture/src/result.mjs"] },
    });
    const hash = canonicalProposalHash(proposal);
    const stateDirectory = await mkdtemp(join(tmpdir(), "fix13-kill-state-"));
    const started = await beginApprovedMutation({
      stateDirectory,
      mutationState: "ON",
      candidate: { proposalId: "proposal-13", incidentId: proposal.incidentId, repositoryId: "fixture", fingerprint: "f".repeat(64), storedHash: hash, approvedHash: hash, proposal, rootVerdict: "CODE_ROOT" },
      pid: 43210, nowMs: 100, expiresAtMs: 1_000,
      spawn: async () => undefined,
    });
    if (!started.ok) throw new Error(started.code);
    const killed: number[] = [];
    const comments: string[] = [];
    const actions: unknown[] = [];
    expect(await revokeActiveMutation({
      stateDirectory,
      killProcessGroup: async (pid) => { killed.push(pid); },
      cleanupProof: async () => removeProofWorktree(prepared),
      comment: async (value) => { comments.push(value); },
      appendAction: async (value) => { actions.push(value); },
    })).toEqual({ revoked: true, proposalId: "proposal-13" });
    expect(killed).toEqual([43210]);
    expect(await readMutationLease(stateDirectory)).toBeNull();
    await expect(access(prepared.path)).rejects.toThrow();
    expect(comments).toEqual(["LEASE_REVOKED proposal-13"]);
    expect(actions).toMatchObject([{ kind: "LEASE_REVOKED", proposalId: "proposal-13" }]);
    expect((await git(repository, "branch", "--list", "fixagent/*")).trim()).toBe("");
  });
});
