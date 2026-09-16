import { createPool } from "@debateai/db";
import { loadDevelopmentCommandEnvironment, loadMigrationEnvironment } from "@debateai/register";
import {
  DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX,
  seedDevelopmentDeploymentRegister,
  serializeDevelopmentDeploymentRegisterReceipt
} from "./dev-deployment-register.js";
import {
  loadDevelopmentProviderPanelFromEnvironment,
  loadModelConfigConfiguredProviders
} from "./dev-provider-panel.js";

const environment = loadMigrationEnvironment();
const pool = createPool(environment.MIGRATION_DATABASE_URL);
try {
  loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment(), loadModelConfigConfiguredProviders(process.cwd()));
  const receipt = await seedDevelopmentDeploymentRegister({
    adminPool: pool,
    repositoryRoot: process.cwd()
  });
  console.log(`${DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX}${
    serializeDevelopmentDeploymentRegisterReceipt(receipt)
  }`);
} finally {
  await pool.end();
}
