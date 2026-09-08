import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PatchValidationResult } from "./validate-patch.js";
import { proofWorktreeIsClean, type PreparedProofWorktree } from "./worktree.js";

export interface ProofCommand {
  readonly binary: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly signal?: AbortSignal;
}

export interface ProofCommandResult {
  readonly outcome: "PASS" | "TEST_FAILURE" | "BROKEN";
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SandboxProofRunner {
  run(command: ProofCommand): Promise<ProofCommandResult>;
}

function parseCatalogCommand(command: string, cwd: string, signal?: AbortSignal): ProofCommand {
  if (command.length === 0 || command.trim() !== command || /[\0\r\n'"\\;&|`$<>]/u.test(command)) {
    throw new TypeError("FIX13_CATALOG_COMMAND_INVALID");
  }
  const [binary, ...argumentsList] = command.split(/ +/u);
  if (binary === undefined || binary.length === 0 || binary.includes("=")) throw new TypeError("FIX13_CATALOG_COMMAND_INVALID");
  const parsed = { binary, arguments: Object.freeze(argumentsList), cwd };
  return signal === undefined ? Object.freeze(parsed) : Object.freeze({ ...parsed, signal });
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

async function applyPatch(worktree: string, patch: string): Promise<void> {
  const scratch = await mkdtemp(join(tmpdir(), "fix13-patch-"));
  const path = join(scratch, "approved.patch");
  await writeFile(path, patch, { mode: 0o600 });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["apply", "--whitespace=error-all", path], { cwd: worktree, stdio: ["ignore", "pipe", "pipe"] });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => { stderr[stderr.length] = chunk; });
    child.once("error", () => reject(new TypeError("FIX13_PATCH_APPLY_FAILED")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new TypeError(`FIX13_PATCH_APPLY_FAILED:${Buffer.concat(stderr).toString("utf8")}`)));
  });
}

async function changedPaths(worktree: string): Promise<readonly string[]> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("git", ["diff", "--name-only"], { cwd: worktree, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => { stdout[stdout.length] = chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(Buffer.concat(stdout).toString("utf8")) : reject(new TypeError("FIX13_DIFF_FAILED")));
  });
  return Object.freeze(output.trimEnd().split("\n").filter((path) => path.length > 0));
}

export type ProofResult =
  | Readonly<{ ok: true; red: ProofCommandResult; green: ProofCommandResult; gates: readonly ProofCommandResult[] }>
  | Readonly<{ ok: false; code: string; red?: ProofCommandResult; green?: ProofCommandResult }>;

export async function provePatch(input: Readonly<{
  prepared: PreparedProofWorktree;
  patch: string;
  validation: Extract<PatchValidationResult, { ok: true }>;
  runner: SandboxProofRunner;
  gateCommands?: readonly string[];
  signal?: AbortSignal;
}>): Promise<ProofResult> {
  if (!(await proofWorktreeIsClean(input.prepared))) return Object.freeze({ ok: false, code: "OBS_R112_DIRTY_BASE" });
  if (isAborted(input.signal)) return Object.freeze({ ok: false, code: "LEASE_REVOKED" });
  const command = parseCatalogCommand(input.validation.command, input.prepared.path, input.signal);
  const red = await input.runner.run(command);
  if (red.outcome === "PASS") return Object.freeze({ ok: false, code: "REFUSED_RED_PASSED", red });
  if (red.outcome !== "TEST_FAILURE") return Object.freeze({ ok: false, code: "REFUSED_RED_BROKEN", red });
  if (isAborted(input.signal)) return Object.freeze({ ok: false, code: "LEASE_REVOKED", red });
  try { await applyPatch(input.prepared.path, input.patch); }
  catch { return Object.freeze({ ok: false, code: "REFUSED_PATCH_APPLY", red }); }
  const actualPaths = await changedPaths(input.prepared.path);
  if (actualPaths.join("\n") !== [...input.validation.touchedPaths].sort().join("\n")) {
    return Object.freeze({ ok: false, code: "REFUSED_PATCH_SCOPE_RUNTIME", red });
  }
  const green = await input.runner.run(command);
  if (green.outcome !== "PASS") return Object.freeze({ ok: false, code: "REFUSED_GREEN_FAILED", red, green });
  const gates: ProofCommandResult[] = [];
  for (const gateCommand of input.gateCommands ?? []) {
    if (isAborted(input.signal)) return Object.freeze({ ok: false, code: "LEASE_REVOKED", red, green });
    const gate = await input.runner.run(parseCatalogCommand(gateCommand, input.prepared.path, input.signal));
    gates[gates.length] = gate;
    if (gate.outcome !== "PASS") return Object.freeze({ ok: false, code: "REFUSED_GATE_FAILED", red, green });
  }
  return Object.freeze({ ok: true, red, green, gates: Object.freeze(gates) });
}
