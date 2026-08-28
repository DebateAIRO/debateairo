import { createPool } from "@debateai/db";
import { loadDevelopmentCommandEnvironment, loadMigrationEnvironment } from "@debateai/register";
import { seedDevelopmentDeploymentRegister } from "./dev-deployment-register.js";
import { loadDevelopmentProviderPanelFromEnvironment } from "./dev-provider-panel.js";

const environment = loadMigrationEnvironment();
const pool = createPool(environment.MIGRATION_DATABASE_URL);
try {
  const providerPanel = loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment());
  const receipt = await seedDevelopmentDeploymentRegister({ adminPool: pool, providerPanel });
  console.log(
    `DEV_DEPLOYMENT_REGISTER_READY=${receipt.registerVersion}:${receipt.rowCount}`
  );
} finally {
  await pool.end();
}
