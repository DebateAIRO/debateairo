import { assembleDevelopmentApiEnvironment } from "./dev-api-environment.js";
import { loadDevelopmentProviderPanelFromEnvironment } from "./dev-provider-panel.js";
import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import {
  developmentDeploymentRegisterReceiptPath,
  readDevelopmentDeploymentRegisterReceipt
} from "./dev-deployment-register.js";

try {
  const repositoryRoot = process.cwd();
  const expectedReceiptFile = developmentDeploymentRegisterReceiptPath(repositoryRoot);
  if (process.argv.length !== 4
    || process.argv[2] !== "--deployment-receipt-file"
    || process.argv[3] !== expectedReceiptFile) {
    throw new TypeError("DEV_API_ENVIRONMENT_DEPLOYMENT_RECEIPT_ARGUMENT_REQUIRED");
  }
  const commandEnvironment = loadDevelopmentCommandEnvironment();
  const receipt = await assembleDevelopmentApiEnvironment({
    repositoryRoot,
    providerPanel: loadDevelopmentProviderPanelFromEnvironment(commandEnvironment),
    registerReceipt: await readDevelopmentDeploymentRegisterReceipt(repositoryRoot)
  });
  console.log(`DEV_API_ENVIRONMENT_READY=${receipt.keyCount}:${receipt.reused ? "REUSED" : "CREATED"}`);
} catch (error) {
  const code = error instanceof TypeError && /^DEV_API_ENVIRONMENT_[A-Z_]+$/u.test(error.message)
    ? error.message
    : "DEV_API_ENVIRONMENT_FAILED";
  console.error(code);
  process.exitCode = 1;
}
