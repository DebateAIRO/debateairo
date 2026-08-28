import { createPool } from "@debateai/db";
import { loadMigrationEnvironment } from "@debateai/register";
import { seedDevelopmentDeploymentRegister } from "./dev-deployment-register.js";

const environment = loadMigrationEnvironment();
const pool = createPool(environment.MIGRATION_DATABASE_URL);
try {
  const receipt = await seedDevelopmentDeploymentRegister({ adminPool: pool });
  console.log(
    `DEV_DEPLOYMENT_REGISTER_READY=${receipt.registerVersion}:${receipt.rowCount}`
  );
} finally {
  await pool.end();
}
