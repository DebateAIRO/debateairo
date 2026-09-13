// Publishes the running CLI panel's configured provider set as a new register version.
// The bootstrap (versions 1-4) is sealed and append-only, so a deployment that grows a
// provider slot supersedes the old set by publication. Prints the new machine receipt.
import { createPool } from "@debateai/db";
import { loadModelConfig } from "@debateai/model-config";
import { loadMigrationEnvironment, parseRegisterVersionText } from "@debateai/register";
import {
  DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX,
  developmentPlanTierRosters,
  publishDevelopmentDeploymentRegisterProviderSet,
  readDevelopmentDeploymentRegisterReceipt,
  serializeDevelopmentDeploymentRegisterReceipt
} from "./dev-deployment-register.js";
import {
  developmentConfiguredProviderPanel,
  loadModelConfigConfiguredProviders
} from "./dev-provider-panel.js";

const environment = loadMigrationEnvironment();
const pool = createPool(environment.MIGRATION_DATABASE_URL);
try {
  const repositoryRoot = process.cwd();
  const modelConfig = loadModelConfig(repositoryRoot);
  const providerPanel = developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(repositoryRoot));
  const current = await readDevelopmentDeploymentRegisterReceipt(repositoryRoot);
  const receipt = await publishDevelopmentDeploymentRegisterProviderSet({
    adminPool: pool,
    planTierRosters: developmentPlanTierRosters(modelConfig),
    providerPanel,
    repositoryRoot,
    baseRegisterVersion: parseRegisterVersionText(current.registerVersion)
  });
  console.log(`${DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX}${
    serializeDevelopmentDeploymentRegisterReceipt(receipt)
  }`);
} finally {
  await pool.end();
}
