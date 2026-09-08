import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IncidentPacket } from "./packet.js";

export interface DiagnosisUsage {
  readonly totalUnits: number;
}

export interface DiagnosisModelResult {
  readonly output: unknown;
  readonly usage: DiagnosisUsage | null;
}

export interface DiagnosisModelPort {
  run(packet: IncidentPacket): Promise<DiagnosisModelResult>;
}

export interface DiagnosisCommand {
  readonly binary: string;
  readonly prefixArguments: readonly string[];
}

export interface CodexCliDiagnosisOptions {
  readonly command?: DiagnosisCommand;
  readonly deadlineMs?: number;
  readonly environment: NodeJS.ProcessEnv;
}

const DEFAULT_COMMAND: DiagnosisCommand = Object.freeze({
  binary: "/Applications/ChatGPT.app/Contents/Resources/codex",
  prefixArguments: Object.freeze([]),
});
const CHILD_ENVIRONMENT_ALLOWLIST = Object.freeze(["HOME", "PATH", "TMPDIR", "LANG"] as const);
const STDOUT_MAX_BYTES = 262_144;

export function renderDiagnosisPrompt(packet: IncidentPacket): string {
  return JSON.stringify({
    schema: "debateai.fixagent-diagnosis-request.v1",
    authority: "REPORT_ONLY_PROPOSAL",
    packet,
    output: "debateai.fixagent-proposal-output.v1",
    permittedTools: ["read_file", "search_repo"],
    forbidden: ["write", "network", "subagent", "resume"],
  });
}

function childEnvironment(source: NodeJS.ProcessEnv, scratch: string): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  for (const key of CHILD_ENVIRONMENT_ALLOWLIST) {
    if (source[key] !== undefined) output[key] = source[key];
  }
  output.PWD = scratch;
  output.OLDPWD = scratch;
  return output;
}

function parseResult(stdout: string): DiagnosisModelResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stdout);
  } catch {
    throw new TypeError("DIAGNOSIS_OUTPUT_INVALID");
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new TypeError("DIAGNOSIS_OUTPUT_INVALID");
  }
  const record = decoded as Record<string, unknown>;
  if (!Object.hasOwn(record, "proposal") || Object.keys(record).some((key) => key !== "proposal" && key !== "usage")) {
    throw new TypeError("DIAGNOSIS_OUTPUT_INVALID");
  }
  const usage = record.usage;
  if (usage === undefined || usage === null) return Object.freeze({ output: record.proposal, usage: null });
  if (typeof usage !== "object" || Array.isArray(usage) || Object.keys(usage).some((key) => key !== "totalUnits")) {
    throw new TypeError("DIAGNOSIS_USAGE_INVALID");
  }
  const totalUnits = (usage as Record<string, unknown>).totalUnits;
  if (typeof totalUnits !== "number" || !Number.isSafeInteger(totalUnits) || totalUnits < 0) {
    throw new TypeError("DIAGNOSIS_USAGE_INVALID");
  }
  return Object.freeze({ output: record.proposal, usage: Object.freeze({ totalUnits }) });
}

export class CodexCliDiagnosisPort implements DiagnosisModelPort {
  readonly #command: DiagnosisCommand;
  readonly #deadlineMs: number;
  readonly #environment: NodeJS.ProcessEnv;

  constructor(options: CodexCliDiagnosisOptions) {
    this.#command = options.command ?? DEFAULT_COMMAND;
    this.#deadlineMs = options.deadlineMs ?? 600_000;
    this.#environment = options.environment;
    if (!Number.isSafeInteger(this.#deadlineMs) || this.#deadlineMs <= 0) {
      throw new TypeError("DIAGNOSIS_DEADLINE_INVALID");
    }
  }

  async run(packet: IncidentPacket): Promise<DiagnosisModelResult> {
    const scratch = await mkdtemp(join(await realpath(tmpdir()), "fix12-diagnosis-"));
    const prompt = renderDiagnosisPrompt(packet);
    return new Promise((resolve, reject) => {
      const child = spawn(this.#command.binary, [
        ...this.#command.prefixArguments,
        "exec",
        "--sandbox", "read-only",
        "--skip-git-repo-check",
        "--json",
        prompt,
      ], {
        cwd: scratch,
        env: childEnvironment(this.#environment, scratch),
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      let stdoutBytes = 0;
      let settled = false;
      let timedOut = false;
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        void rm(scratch, { recursive: true, force: true }).catch(() => undefined).then(action);
      };
      const deadline = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, this.#deadlineMs);
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > STDOUT_MAX_BYTES) {
          child.kill("SIGKILL");
          finish(() => reject(new TypeError("DIAGNOSIS_OUTPUT_LIMIT")));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.resume();
      child.once("error", () => finish(() => reject(new TypeError("DIAGNOSIS_SPAWN_FAILED"))));
      child.once("close", (code) => finish(() => {
        if (timedOut) {
          reject(new TypeError("DIAGNOSIS_TIMEOUT"));
          return;
        }
        if (code !== 0) {
          reject(new TypeError("DIAGNOSIS_PROCESS_FAILED"));
          return;
        }
        try {
          resolve(parseResult(Buffer.concat(stdout).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      }));
    });
  }
}
