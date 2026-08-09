import { createPool, migrate } from "@debateai/db";
import { loadMigrationEnvironment } from "@debateai/register";

const environment = loadMigrationEnvironment();
const pool = createPool(environment.MIGRATION_DATABASE_URL);
await migrate(pool);
await pool.end();
