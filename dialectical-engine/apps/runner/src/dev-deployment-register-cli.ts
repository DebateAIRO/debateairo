import { createPool } from "@debateai/db";
import { loadDevelopmentCommandEnvironment, loadMigrationEnvironment } from "@debateai/register";
import {
  resolveDevelopmentSynthesisRoleRefs,
  DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX,
  seedDevelopmentDeploymentRegister,
  serializeDevelopmentDeploymentRegisterReceipt
} from "./dev-deployment-register.js";
import { loadDevelopmentProviderPanelFromEnvironment } from "./dev-provider-panel.js";

const environment = loadMigrationEnvironment();
const pool = createPool(environment.MIGRATION_DATABASE_URL);
try {
  const commandEnvironment = loadDevelopmentCommandEnvironment();
  const providerPanel = loadDevelopmentProviderPanelFromEnvironment(commandEnvironment);
  const roleRefs = resolveDevelopmentSynthesisRoleRefs(providerPanel, commandEnvironment);
  const receipt = await seedDevelopmentDeploymentRegister({
    adminPool: pool,
    providerPanel,
    roleRefs,
    repositoryRoot: process.cwd()
  });
  console.log(`${DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX}${
    serializeDevelopmentDeploymentRegisterReceipt(receipt)
  }`);
} finally {
  await pool.end();
}
