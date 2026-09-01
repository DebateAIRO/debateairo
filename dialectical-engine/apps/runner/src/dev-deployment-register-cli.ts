import { createPool } from "@debateai/db";
import { loadDevelopmentCommandEnvironment, loadMigrationEnvironment } from "@debateai/register";
import {
  resolveDevelopmentSynthesisRoleRefs,
  seedDevelopmentDeploymentRegister
} from "./dev-deployment-register.js";
import { loadDevelopmentProviderPanelFromEnvironment } from "./dev-provider-panel.js";

const environment = loadMigrationEnvironment();
const pool = createPool(environment.MIGRATION_DATABASE_URL);
try {
  const commandEnvironment = loadDevelopmentCommandEnvironment();
  const providerPanel = loadDevelopmentProviderPanelFromEnvironment(commandEnvironment);
  const roleRefs = resolveDevelopmentSynthesisRoleRefs(providerPanel, commandEnvironment);
  const receipt = await seedDevelopmentDeploymentRegister({ adminPool: pool, providerPanel, roleRefs });
  console.log(
    `DEV_DEPLOYMENT_REGISTER_READY=${receipt.registerVersion}:${receipt.rowCount}`
  );
} finally {
  await pool.end();
}
