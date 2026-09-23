// Publishes the running CLI panel's configured provider set as a new register version.
// The bootstrap (versions 1-4) is sealed and append-only, so a deployment that grows a
// provider slot supersedes the old set by publication. Prints the new machine receipt.
import { createPool } from "@debateai/db";
import { loadMigrationEnvironment, parseRegisterVersionText } from "@debateai/register";
import {
  DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX,
  publishDevelopmentDeploymentRegisterProviderSet,
  readDevelopmentDeploymentRegisterReceipt,
  serializeDevelopmentDeploymentRegisterReceipt
} from "./dev-deployment-register.js";
import { developmentConfiguredProviderPanel } from "./dev-provider-panel.js";

const environment = loadMigrationEnvironment();
const pool = createPool(environment.MIGRATION_DATABASE_URL);
try {
  const repositoryRoot = process.cwd();
  const providerPanel = developmentConfiguredProviderPanel();
  const current = await readDevelopmentDeploymentRegisterReceipt(repositoryRoot);
  const receipt = await publishDevelopmentDeploymentRegisterProviderSet({
    adminPool: pool,
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
