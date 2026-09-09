import { userInfo } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPool,
  PostgresSupportShredRepository,
  type Pool,
  type SupportShredResult
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import {
  loadDevelopmentSupportStatusCliCredentials,
  loadProductionSupportStatusCliCredentials
} from "./support-status-cli-credentials.js";

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PUBLIC_CODES = new Set([
  "SUPPORT_SHRED_TARGET_NOT_FOUND",
  "SUPPORT_SHRED_SESSION_BOUND",
  "SUPPORT_SHRED_STATE_INVALID",
  "SUPPORT_SHRED_KEY_COVERAGE_INVALID",
  "SUPPORT_SHRED_AUDIT_INVALID",
  "SUPPORT_SHRED_INPUT_INVALID",
  "SUPPORT_SHRED_USAGE",
  "SUPPORT_SHRED_POOL_CLOSE_FAILED"
]);

export class SupportShredCliError extends TypedDomainError {
  constructor(code: string) {
    super(code, code);
    this.name = "SupportShredCliError";
  }
}

export type SupportShredCliTarget = Readonly<{
  kind: "owner" | "session";
  targetRef: string;
}>;

type SupportShredRepositoryPort = Readonly<{
  shredOwner(ownerRef: string, osUser: string, at: Date): Promise<SupportShredResult>;
  shredSession(sessionId: string, osUser: string, at: Date): Promise<SupportShredResult>;
}>;

export type SupportShredCliDependencies = Readonly<{
  loadCredentials(): Promise<Readonly<{ supportDatabaseUrl: string }>>;
  openPool(databaseUrl: string): Pick<Pool, "end">;
  createRepository(pool: Pick<Pool, "end">): SupportShredRepositoryPort;
  osUsername(): string;
  clock(): Date;
}>;

export function parseSupportShredArguments(arguments_: readonly string[]): SupportShredCliTarget {
  if (arguments_.length !== 2
    || (arguments_[0] !== "--owner" && arguments_[0] !== "--session")
    || typeof arguments_[1] !== "string"
    || !CANONICAL_UUID.test(arguments_[1])) {
    throw new SupportShredCliError("SUPPORT_SHRED_USAGE");
  }
  return Object.freeze({
    kind: arguments_[0] === "--owner" ? "owner" : "session",
    targetRef: arguments_[1]
  });
}

function render(result: SupportShredResult): string {
  return result.kind === "ALREADY_SHREDDED"
    ? "already shredded\n"
    : `sessions: ${result.counts.sessions}, cases: ${result.counts.cases}, keys destroyed: ${result.counts.keysDestroyed}\n`;
}

export async function runSupportShredCli(
  arguments_: readonly string[],
  dependencies: SupportShredCliDependencies
): Promise<string> {
  const target = parseSupportShredArguments(arguments_);
  const credentials = await dependencies.loadCredentials();
  const pool = dependencies.openPool(credentials.supportDatabaseUrl);
  let result: SupportShredResult | undefined;
  let primaryFailure: unknown;
  try {
    const repository = dependencies.createRepository(pool);
    const osUser = dependencies.osUsername();
    const at = dependencies.clock();
    result = target.kind === "owner"
      ? await repository.shredOwner(target.targetRef, osUser, at)
      : await repository.shredSession(target.targetRef, osUser, at);
  } catch (error) {
    primaryFailure = error;
  }
  let closeFailed = false;
  try {
    await pool.end();
  } catch {
    closeFailed = true;
  }
  if (primaryFailure !== undefined) throw primaryFailure;
  if (closeFailed) throw new SupportShredCliError("SUPPORT_SHRED_POOL_CLOSE_FAILED");
  if (result === undefined) throw new SupportShredCliError("SUPPORT_SHRED_FAILED");
  return render(result);
}

export function publicSupportShredErrorCode(error: unknown): string {
  const code = error instanceof TypedDomainError
    ? error.code
    : error instanceof Error ? error.message : "";
  if (PUBLIC_CODES.has(code)) return code;
  if (code === "SUPPORT_STATUS_CREDENTIAL_CUSTODY_INVALID"
    || code === "SUPPORT_STATUS_CREDENTIAL_FILE_INVALID"
    || code === "SUPPORT_STATUS_DATABASE_URL_INVALID") {
    return "SUPPORT_SHRED_CREDENTIAL_INVALID";
  }
  return "SUPPORT_SHRED_FAILED";
}

async function loadDefaultCredentials(): Promise<Readonly<{ supportDatabaseUrl: string }>> {
  if (loadDevelopmentCommandEnvironment().NODE_ENV === "production") {
    return loadProductionSupportStatusCliCredentials(resolve("secrets/api-support.json"));
  }
  return loadDevelopmentSupportStatusCliCredentials(
    resolve(".local/dev-auth/database-principals.env")
  );
}

async function main(): Promise<void> {
  const output = await runSupportShredCli(process.argv.slice(2), {
    loadCredentials: loadDefaultCredentials,
    openPool: createPool,
    createRepository: (pool) => new PostgresSupportShredRepository(pool as Pool),
    osUsername: () => userInfo().username,
    clock: () => new Date()
  });
  process.stdout.write(output);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${publicSupportShredErrorCode(error)}\n`);
    process.exitCode = 1;
  });
}
