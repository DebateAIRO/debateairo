import { resolve } from "node:path";
import { createPool } from "@debateai/db";
import { loadMigrationEnvironment } from "@debateai/register";
import { provisionDevelopmentDatabasePrincipals } from "./dev-database-principals.js";

const environment = loadMigrationEnvironment();
const credentialFilePath = resolve(process.cwd(), ".local/dev-auth/database-principals.env");
const pool = createPool(environment.MIGRATION_DATABASE_URL);
try {
  const receipt = await provisionDevelopmentDatabasePrincipals({
    adminPool: pool,
    adminDatabaseUrl: environment.MIGRATION_DATABASE_URL,
    credentialFilePath
  });
  console.log(
    `DEV_DATABASE_PRINCIPALS_READY=${receipt.principalCount}:${receipt.credentialFilePath}`
  );
} finally {
  await pool.end();
}
