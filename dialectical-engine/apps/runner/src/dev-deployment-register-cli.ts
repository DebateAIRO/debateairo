import { createPool } from "@debateai/db";
import { loadModelConfig } from "@debateai/model-config";
import { loadDevelopmentCommandEnvironment, loadMigrationEnvironment } from "@debateai/register";
import {
  DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX,
  developmentPlanTierRosters,
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
  const modelConfig = loadModelConfig(process.cwd());
  const providerPanel = loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment(), loadModelConfigConfiguredProviders(process.cwd()));
  const receipt = await seedDevelopmentDeploymentRegister({
    adminPool: pool,
    planTierRosters: developmentPlanTierRosters(modelConfig),
    providerPanel,
    repositoryRoot: process.cwd()
  });
  console.log(`${DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX}${
    serializeDevelopmentDeploymentRegisterReceipt(receipt)
  }`);
} finally {
  await pool.end();
}
