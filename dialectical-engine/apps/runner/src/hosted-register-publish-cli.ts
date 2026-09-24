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
  type HostedRegisterPublicationResult
} from "./hosted-register-publish.js";

function publishedLine(result: HostedRegisterPublicationResult): string {
  return `HOSTED_REGISTER_PUBLISHED outcome=${result.outcome} register_version=${result.registerVersion}`
    + ` row_count=${result.rowCount} snapshot_sha256=${result.snapshotSha256}`
    + ` publication_id=${result.publicationId}\n`;
}

async function main(): Promise<void> {
  const args = parseHostedRegisterArguments(process.argv.slice(2));
  const plan = await planHostedRegisterPublication(await readHostedRegisterFile(args.filePath));
  process.stdout.write(renderHostedRegisterPlan(plan));
  if (args.dryRun) {
    process.stdout.write("HOSTED_REGISTER_DRY_RUN written=none\n");
    return;
  }
  assertHostedRegisterPlanPublishable(plan);
  const environment = loadMigrationEnvironment();
  const pool = createPool(environment.MIGRATION_DATABASE_URL);
  let result: HostedRegisterPublicationResult;
  try {
    result = await publishHostedRegister({
      plan, operations: createPostgresHostedRegisterOperations(pool)
    });
  } finally {
    await pool.end().catch(() => undefined);
  }
  process.stdout.write(publishedLine(result));
  process.stdout.write(`HOSTED_REGISTER_BOOT_READY register_version=${result.registerVersion}\n`);
  process.stdout.write(`REGISTER_VERSION=${result.registerVersion}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // A sealed version the boot readers refused is still sealed: say which one,
    // so it is never pinned, then the reason.
    if (error instanceof HostedRegisterBootCheckFailedError) {
      process.stdout.write(publishedLine(error.result));
    }
    const code = hostedRegisterRefusalCode(error);
    process.stderr.write(`${code}\n`);
    process.exitCode = /USAGE|INVALID|UNKNOWN|MISSING|REQUIRED|REFUSED|ABSENT|ZERO|NOT_VETTED|MISMATCH|UNCONFIGURED/u
      .test(code) ? 2 : 1;
  });
}
