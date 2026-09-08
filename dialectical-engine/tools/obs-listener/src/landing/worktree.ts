import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/u;

export interface PreparedProofWorktree {
  readonly repository: string;
  readonly path: string;
  readonly baseSha: string;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await run("git", [...args], { cwd, encoding: "utf8" })).stdout;
}

export async function createProofWorktree(input: Readonly<{
  repository: string;
  baseSha: string;
  parentDirectory: string;
}>): Promise<PreparedProofWorktree> {
  if (!isAbsolute(input.repository) || !isAbsolute(input.parentDirectory) || !SHA.test(input.baseSha)) {
    throw new TypeError("FIX13_PROOF_WORKTREE_INPUT");
  }
  const resolved = (await git(input.repository, ["rev-parse", `${input.baseSha}^{commit}`])).trim();
  if (resolved !== input.baseSha) throw new TypeError("FIX13_PINNED_BASE_MISMATCH");
  const path = join(input.parentDirectory, `proof-${input.baseSha.slice(0, 12)}-${randomUUID()}`);
  await git(input.repository, ["worktree", "add", "--detach", path, input.baseSha]);
  const head = (await git(path, ["rev-parse", "HEAD"])).trim();
  if (head !== input.baseSha) {
    await git(input.repository, ["worktree", "remove", "--force", path]);
    throw new TypeError("FIX13_PINNED_BASE_MISMATCH");
  }
  return Object.freeze({ repository: input.repository, path, baseSha: input.baseSha });
}

export async function proofWorktreeIsClean(prepared: PreparedProofWorktree): Promise<boolean> {
  const status = await git(prepared.path, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return status.length === 0;
}

export async function removeProofWorktree(prepared: PreparedProofWorktree): Promise<void> {
  await git(prepared.repository, ["worktree", "remove", "--force", prepared.path]);
}
