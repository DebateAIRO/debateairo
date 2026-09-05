import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { ObservationError } from "../../core/errors.js";
import {
  observationRepoRoot,
  resolveRepoPath,
  type ResolvedRepoPath
} from "../../core/paths.js";
import { renderImpact, signalSchema } from "../../core/signals.js";
import type { ModuleConfigurationObject } from "../../core/types.js";
import type { RoutedChannelExecutor } from "../routing/router.js";

export type SendmailSpawnRequest = Readonly<{
  file: ResolvedRepoPath;
  args: readonly string[];
  stdin: string;
  env: Readonly<{
    PATH: string;
    DEBATEAI_DEV_MAIL_CAPTURE_DIR: string;
  }>;
  timeoutMs: number;
  closeStdin: true;
}>;

export type SendmailSpawn = (request: SendmailSpawnRequest) => Promise<Readonly<{
  stdout: string;
  stderr: string;
}>>;

const EMAIL = /^[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+$/u;
const SAFE_PATH = /^[A-Za-z0-9_@+./-]+$/u;

function asObject(value: unknown): ModuleConfigurationObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ModuleConfigurationObject
    : null;
}

export async function resolveCaptureDirectory(stateDir: string, configured: string): Promise<string> {
  const stateRoot = resolve(stateDir);
  const capture = resolve(stateRoot, configured);
  const fromState = relative(stateRoot, capture);
  try {
    const metadata = await lstat(capture);
    const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
    if (fromState === "" || fromState.startsWith("..") || fromState.includes("/../")
      || !metadata.isDirectory() || metadata.isSymbolicLink()
      || (metadata.mode & 0o777) !== 0o700
      || (currentUid !== null && metadata.uid !== currentUid)) {
      throw new Error("unsafe capture custody");
    }
    return capture;
  } catch (error) {
    throw new ObservationError("OBSERVATION_SENDMAIL_CAPTURE_INVALID", error);
  }
}

async function spawnSendmail(request: SendmailSpawnRequest): Promise<Readonly<{
  stdout: string;
  stderr: string;
}>> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(request.file, [...request.args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: request.env.PATH,
        DEBATEAI_DEV_MAIL_CAPTURE_DIR: request.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR
      },
      shell: false
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new ObservationError("OBSERVATION_SENDMAIL_TIMEOUT"));
    }, request.timeoutMs);
    child.stdout.on("data", (value: Buffer) => stdout.push(value));
    child.stderr.on("data", (value: Buffer) => stderr.push(value));
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectPromise(new ObservationError("OBSERVATION_SENDMAIL_FAILED", error));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        rejectPromise(new ObservationError("OBSERVATION_SENDMAIL_FAILED"));
        return;
      }
      resolvePromise(Object.freeze({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      }));
    });
    child.stdin.end(request.stdin);
  });
}

export function createSendmailDeliveryExecutor(input: Readonly<{
  repoRoot: string;
  stateDir: string;
  configuration: ModuleConfigurationObject;
  spawn?: SendmailSpawn;
}>): RoutedChannelExecutor {
  const notify = asObject(input.configuration.notify);
  const sendmailPath = notify?.sendmail_path;
  const captureDirectory = notify?.dev_capture_dir;
  const from = notify?.from;
  const to = notify?.to;
  if (typeof sendmailPath !== "string"
    || sendmailPath !== "deploy/dev-auth/sendmail-capture.mjs"
    || !SAFE_PATH.test(sendmailPath)
    || sendmailPath.split("/").includes("..")
    || typeof captureDirectory !== "string" || !SAFE_PATH.test(captureDirectory)
    || captureDirectory.split("/").includes("..")
    || typeof from !== "string" || !EMAIL.test(from)
    || typeof to !== "string" || !EMAIL.test(to)) {
    throw new ObservationError("OBSERVATION_SENDMAIL_CONFIG_INVALID");
  }
  const executable = resolveRepoPath(input.repoRoot ?? observationRepoRoot(), sendmailPath);
  const execute = input.spawn ?? spawnSendmail;
  return async (candidate, now) => {
    const signal = signalSchema.safeParse(candidate);
    if (!signal.success || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new ObservationError("OBSERVATION_SENDMAIL_SIGNAL_INVALID");
    }
    const capture = await resolveCaptureDirectory(input.stateDir, captureDirectory);
    const subject = `dialectical-engine ${signal.data.severity} ${signal.data.component} ${signal.data.class}`;
    const message = `Subject: ${subject}\nContent-Type: text/plain; charset=utf-8\n\n${renderImpact(signal.data)}\n`;
    await execute(Object.freeze({
      file: executable,
      args: Object.freeze(["-i", "-f", from, "--", to]),
      stdin: message,
      env: Object.freeze({
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        DEBATEAI_DEV_MAIL_CAPTURE_DIR: capture
      }),
      timeoutMs: 10_000,
      closeStdin: true
    }));
    return Object.freeze({ deliveredAt: now, externalRef: null });
  };
}
