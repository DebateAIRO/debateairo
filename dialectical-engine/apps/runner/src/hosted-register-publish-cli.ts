/**
 * Task 14b — the operator's hosted register publication. Run as
 *
 *   pnpm register:publish-hosted --file /etc/debateai/register/hosted-register.json
 *   pnpm register:publish-hosted --dry-run --file /etc/debateai/register/hosted-register.json
 *
 * with `MIGRATION_DATABASE_URL` naming the P3-01 migrator (the only principal
 * that can publish; the just-in-time credential ceremony is the kit's §4). A dry
 * run needs no database and opens no connection.
 *
 * Output, one fact per line and nothing secret: the plan, then
 * `HOSTED_REGISTER_PUBLISHED outcome=CREATED|REPLAYED register_version=N …`,
 * `HOSTED_REGISTER_BOOT_READY register_version=N` and `REGISTER_VERSION=N` — the
 * value both `EnvironmentFile`s pin. A refusal is ONE typed code on stderr.
 *
 * A version that was SEALED but that a boot reader refused prints
 * `HOSTED_REGISTER_NOT_BOOT_READY register_version=N …` instead, never a
 * `REGISTER_VERSION=` line, and exits non-zero with
 * `HOSTED_REGISTER_BOOT_CHECK_FAILED:` and the reader's code.
 *
 * Every decision lives in ./hosted-register-publish.ts. This file only opens things.
 */
import { pathToFileURL } from "node:url";
import { createPool } from "@debateai/db";
import { loadMigrationEnvironment } from "@debateai/register";
import {
  HostedRegisterBootCheckFailedError,
  assertHostedRegisterPlanPublishable,
  createPostgresHostedRegisterOperations,
  hostedRegisterRefusalCode,
  parseHostedRegisterArguments,
  planHostedRegisterPublication,
  publishHostedRegister,
  readHostedRegisterFile,
  renderHostedRegisterPlan,
  type HostedRegisterOperations,
  type HostedRegisterPublicationResult
} from "./hosted-register-publish.js";

export type HostedRegisterCliOutput = Readonly<{
  stdout(text: string): void;
  stderr(text: string): void;
}>;

/** Opened only after every file-level refusal has had its chance; closed whatever happens. */
export type OpenHostedRegisterOperations = () => Promise<Readonly<{
  operations: HostedRegisterOperations;
  close(): Promise<void>;
}>>;

function receiptFields(result: HostedRegisterPublicationResult): string {
  return `register_version=${result.registerVersion} outcome=${result.outcome}`
    + ` row_count=${result.rowCount} snapshot_sha256=${result.snapshotSha256}`
    + ` publication_id=${result.publicationId}`;
}

const OPERATOR_INPUT_REFUSAL =
  /USAGE|INVALID|UNKNOWN|MISSING|REQUIRED|REFUSED|ABSENT|ZERO|NOT_VETTED|MISMATCH|UNCONFIGURED|INSUFFICIENT/u;

/** The whole command, with its outputs and its database seam injected. Returns the exit code. */
export async function runHostedRegisterPublishCli(
  args: readonly string[],
  output: HostedRegisterCliOutput,
  openOperations: OpenHostedRegisterOperations
): Promise<number> {
  try {
    const parsed = parseHostedRegisterArguments(args);
    const plan = await planHostedRegisterPublication(await readHostedRegisterFile(parsed.filePath));
    output.stdout(renderHostedRegisterPlan(plan));
    if (parsed.dryRun) {
      output.stdout("HOSTED_REGISTER_DRY_RUN written=none\n");
      return 0;
    }
    assertHostedRegisterPlanPublishable(plan);
    const opened = await openOperations();
    let result: HostedRegisterPublicationResult;
    try {
      result = await publishHostedRegister({ plan, operations: opened.operations });
    } finally {
      await opened.close().catch(() => undefined);
    }
    output.stdout(`HOSTED_REGISTER_PUBLISHED outcome=${result.outcome} ${receiptFields(result)}\n`);
    output.stdout(`HOSTED_REGISTER_BOOT_READY register_version=${result.registerVersion}\n`);
    output.stdout(`REGISTER_VERSION=${result.registerVersion}\n`);
    return 0;
  } catch (error) {
    // Sealed, and refused by a boot reader: say which version NOT to pin, in a
    // line that cannot be read as success, and never print REGISTER_VERSION=.
    if (error instanceof HostedRegisterBootCheckFailedError) {
      output.stdout(`HOSTED_REGISTER_NOT_BOOT_READY ${receiptFields(error.result)}\n`);
      output.stderr(`${error.code}\n`);
      return 1;
    }
    const code = hostedRegisterRefusalCode(error);
    output.stderr(`${code}\n`);
    return OPERATOR_INPUT_REFUSAL.test(code) ? 2 : 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runHostedRegisterPublishCli(process.argv.slice(2), {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); }
  }, async () => {
    const environment = loadMigrationEnvironment();
    const pool = createPool(environment.MIGRATION_DATABASE_URL);
    return {
      operations: createPostgresHostedRegisterOperations(pool),
      close: () => pool.end()
    };
  });
}
