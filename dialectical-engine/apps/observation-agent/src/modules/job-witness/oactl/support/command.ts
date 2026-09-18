import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";
import { ObservationError } from "../../../../core/errors.js";
import { SCHEDULER_JOBS, type SchedulerJob } from "../../witness.js";
import { resolveDevCustodyRoot } from "../../../../../../../deploy/dev-auth/custody-root.mjs";

export type JobCompletionReceipt = Readonly<{
  job: SchedulerJob;
  startedAt: Date;
  completedAt: Date;
  exitCode: number;
  reportOk: boolean;
}>;

type ChildResult = Readonly<{ exitCode: number; stdout: string; stderr: string }>;
type WitnessDependencies = Readonly<{
  now(): Date;
  runChild(file: string, args: readonly string[]): Promise<ChildResult>;
  record(receipt: JobCompletionReceipt): Promise<void>;
  stdout(value: string): void;
  stderr(value: string): void;
}>;

function validJob(value: string | undefined): value is SchedulerJob {
  return value !== undefined && SCHEDULER_JOBS.includes(value as SchedulerJob);
}

function reportOk(stdout: string): boolean {
  try {
    const value: unknown = JSON.parse(stdout.trim());
    return value !== null && typeof value === "object" && !Array.isArray(value);
  } catch {
    return false;
  }
}

async function runChild(file: string, args: readonly string[]): Promise<ChildResult> {
  return new Promise<ChildResult>((resolvePromise, reject) => {
    const child = spawn(file, [...args], { shell: false, stdio: ["inherit", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolvePromise(Object.freeze({
      exitCode: code ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    })));
  });
}

function unquote(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("'\\''", "'");
  }
  return value;
}

async function databaseUrl(): Promise<string> {
  const repoRoot = resolve(import.meta.dirname, "../../../../../../..");
  // DL7-F4: custody is movable; ask the resolver rather than assuming the checkout.
  const content = await readFile(join(resolveDevCustodyRoot(repoRoot), "observation-agent.env"), "utf8");
  for (const line of content.split("\n")) {
    if (line.startsWith("OBSERVATION_DATABASE_URL=")) {
      const value = unquote(line.slice("OBSERVATION_DATABASE_URL=".length));
      if (value.length > 0) return value;
    }
  }
  throw new ObservationError("OBSERVATION_ENV_FILE_INVALID");
}

async function record(receipt: JobCompletionReceipt): Promise<void> {
  const pool = new pg.Pool({ connectionString: await databaseUrl(), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 2000");
      await client.query(
        `INSERT INTO observation.job_completion(
           job_completion_id,job,started_at,completed_at,exit_code,report_ok
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), receipt.job, receipt.startedAt, receipt.completedAt, receipt.exitCode, receipt.reportOk]
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function productionDependencies(): WitnessDependencies {
  return Object.freeze({
    now: () => new Date(),
    runChild,
    record,
    stdout: (value) => { process.stdout.write(value); },
    stderr: (value) => { process.stderr.write(value); }
  });
}

export async function runWitnessCommand(
  args: readonly string[],
  dependencies: WitnessDependencies = productionDependencies()
): Promise<number> {
  const separator = args.indexOf("--");
  const job = args[0] === "--job" ? args[1] : undefined;
  if (!validJob(job) || separator !== 2 || args.length < 4) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  const file = args[separator + 1];
  if (file === undefined || file.length === 0 || file.includes("\0")) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  const childArgs = args.slice(separator + 2);
  if (childArgs.some((value) => value.includes("\0"))) {
    throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
  }
  const startedAt = dependencies.now();
  const child = await dependencies.runChild(file, childArgs);
  const completedAt = dependencies.now();
  dependencies.stdout(child.stdout);
  dependencies.stderr(child.stderr);
  await dependencies.record(Object.freeze({
    job,
    startedAt,
    completedAt,
    exitCode: child.exitCode,
    reportOk: reportOk(child.stdout)
  }));
  return child.exitCode;
}
