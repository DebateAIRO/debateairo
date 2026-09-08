import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

const HASH = /^[0-9a-f]{40}$/u;
const USER = /^[a-z_][a-z0-9_-]{0,31}$/u;
const PATCH_MAX_BYTES = 1_048_576;

export interface PlannedFixWorkerInvocation {
  readonly binary: "/usr/bin/sudo";
  readonly arguments: readonly string[];
  readonly spawnOptions: Readonly<{
    cwd: string;
    env: Readonly<Record<string, string>>;
    stdio: readonly ["ignore", "pipe", "pipe"];
    detached: true;
  }>;
}

export function planFixWorkerInvocation(input: Readonly<{
  workerUsername: string;
  workerUid: number;
  daemonUid: number;
  profilePath: string;
  worktree: string;
  pinnedBaseSha: string;
  prompt: string;
  environment: NodeJS.ProcessEnv;
}>): PlannedFixWorkerInvocation {
  if (!USER.test(input.workerUsername) || !Number.isSafeInteger(input.workerUid) || input.workerUid <= 0 ||
      !Number.isSafeInteger(input.daemonUid) || input.daemonUid <= 0) throw new TypeError("FIX13_WORKER_IDENTITY_REQUIRED");
  if (input.workerUid === input.daemonUid) throw new TypeError("FIX13_WORKER_NOT_SEPARATE");
  if (!isAbsolute(input.profilePath) || !isAbsolute(input.worktree) || !HASH.test(input.pinnedBaseSha)) {
    throw new TypeError("FIX13_WORKER_INPUT");
  }
  const path = input.environment.PATH;
  if (path === undefined || path.length === 0) throw new TypeError("FIX13_WORKER_PATH");
  const environment: Record<string, string> = { PATH: path, PWD: input.worktree };
  if (input.environment.LANG !== undefined) environment.LANG = input.environment.LANG;
  const argumentsList = Object.freeze([
    "-n", "-u", input.workerUsername, "--",
    "/usr/bin/sandbox-exec", "-f", input.profilePath,
    "codex", "exec", "--sandbox", "workspace-write", "--skip-git-repo-check",
    `${input.prompt}\nPINNED_BASE_SHA=${input.pinnedBaseSha}\nOUTPUT=UNIFIED_DIFF_ONLY`,
  ]);
  return Object.freeze({
    binary: "/usr/bin/sudo" as const,
    arguments: argumentsList,
    spawnOptions: Object.freeze({
      cwd: input.worktree,
      env: Object.freeze(environment),
      stdio: Object.freeze(["ignore", "pipe", "pipe"] as const),
      detached: true as const,
    }),
  });
}

export function parsePatchOnlyOutput(output: string): string {
  const bytes = Buffer.byteLength(output, "utf8");
  if (bytes === 0 || bytes > PATCH_MAX_BYTES || output.includes("\0") || output.includes("\r") ||
      !output.startsWith("diff --git a/") || !output.endsWith("\n") || !output.includes("\n--- a/") ||
      !output.includes("\n+++ b/")) throw new TypeError("FIX13_WORKER_OUTPUT_NOT_PATCH");
  return output;
}

export async function spawnFixWorker(input: Readonly<{
  invocation: PlannedFixWorkerInvocation;
  deadlineMs: number;
  signal?: AbortSignal;
  appendAction(action: Readonly<{ kind: string; code: string }>): Promise<void>;
}>): Promise<string> {
  if (!Number.isSafeInteger(input.deadlineMs) || input.deadlineMs <= 0) throw new TypeError("FIX13_WORKER_DEADLINE");
  await input.appendAction(Object.freeze({ kind: "WORKER_SPAWN", code: "STARTED" }));
  return new Promise((resolve, reject) => {
    const child = spawn(input.invocation.binary, [...input.invocation.arguments], {
      cwd: input.invocation.spawnOptions.cwd,
      env: { ...input.invocation.spawnOptions.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    let timedOut = false;
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      callback();
    };
    const killGroup = (): void => {
      if (child.pid !== undefined) {
        try { process.kill(-child.pid, "SIGKILL"); } catch (_error) { child.kill("SIGKILL"); }
      }
    };
    const abort = (): void => { killGroup(); settle(() => {
      input.appendAction(Object.freeze({ kind: "WORKER_KILL", code: "LEASE_REVOKED" }))
        .catch((_error) => undefined);
      reject(new TypeError("FIX13_WORKER_KILLED"));
    }); };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, input.deadlineMs);
    input.signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > PATCH_MAX_BYTES) killGroup();
      else stdout.push(chunk);
    });
    child.stderr?.resume();
    child.once("error", () => settle(() => {
      input.appendAction(Object.freeze({ kind: "WORKER_DENIAL", code: "SPAWN_FAILED" }))
        .catch((_error) => undefined);
      reject(new TypeError("FIX13_WORKER_SPAWN_FAILED"));
    }));
    child.once("close", (code) => settle(() => {
      if (timedOut) {
        input.appendAction(Object.freeze({ kind: "WORKER_DENIAL", code: "TIMEOUT" }))
          .catch((_error) => undefined);
        reject(new TypeError("FIX13_WORKER_TIMEOUT"));
        return;
      }
      if (code !== 0 || stdoutBytes > PATCH_MAX_BYTES) {
        input.appendAction(Object.freeze({ kind: "WORKER_DENIAL", code: "PROCESS_FAILED" }))
          .catch((_error) => undefined);
        reject(new TypeError("FIX13_WORKER_PROCESS_FAILED"));
        return;
      }
      try {
        const patch = parsePatchOnlyOutput(Buffer.concat(stdout).toString("utf8"));
        input.appendAction(Object.freeze({ kind: "WORKER_OUTPUT", code: "PATCH_RETURNED" }))
          .catch((_error) => undefined);
        resolve(patch);
      } catch (error) {
        reject(error);
      }
    }));
  });
}
