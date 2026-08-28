import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPool } from "@debateai/db";
import { loadMigrationEnvironment } from "@debateai/register";
import {
  ProductionDatabasePrincipalProvisioningError,
  provisionProductionDatabasePrincipals
} from "./production-database-principals.js";

const MAXIMUM_STDIN_BYTES = 256 * 1_024;
const MANIFEST_PATH =
  "docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json";

async function readBoundedStdin(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > MAXIMUM_STDIN_BYTES) {
      throw new ProductionDatabasePrincipalProvisioningError(
        "PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_TOO_LARGE"
      );
    }
    chunks.push(bytes);
  }
  if (size === 0) {
    throw new ProductionDatabasePrincipalProvisioningError(
      "PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_REQUIRED"
    );
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw new ProductionDatabasePrincipalProvisioningError(
      "PRODUCTION_DATABASE_PRINCIPAL_CREDENTIALS_INVALID",
      error
    );
  } finally {
    chunks.fill(Buffer.alloc(0));
  }
}

async function main(): Promise<void> {
  const environment = loadMigrationEnvironment();
  const [manifestSource, credentialEnvelope] = await Promise.all([
    readFile(resolve(process.cwd(), MANIFEST_PATH), "utf8"),
    readBoundedStdin()
  ]);
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    throw new ProductionDatabasePrincipalProvisioningError(
      "PRODUCTION_DATABASE_PRINCIPAL_MANIFEST_INVALID",
      error
    );
  }
  const pool = createPool(environment.MIGRATION_DATABASE_URL);
  try {
    const receipt = await provisionProductionDatabasePrincipals({
      adminPool: pool,
      adminDatabaseUrl: environment.MIGRATION_DATABASE_URL,
      manifest,
      credentialEnvelope
    });
    console.log(`PRODUCTION_DATABASE_PRINCIPALS_READY=${receipt.principalCount}`);
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  const code = error instanceof ProductionDatabasePrincipalProvisioningError
    ? error.message
    : "PRODUCTION_DATABASE_PRINCIPAL_PROVISIONING_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
