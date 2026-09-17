import {
  assembleDevelopmentApiEnvironment,
  developmentApiEnvironmentErrorCode
} from "./dev-api-environment.js";
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
  const supportModelTarget = commandEnvironment.DEBATEAI_DEV_SUPPORT_MODEL_TARGET_JSON;
  if (supportModelTarget === undefined) {
    throw new TypeError("DEV_API_ENVIRONMENT_SUPPORT_MODEL_TARGET_REQUIRED");
  }
  const receipt = await assembleDevelopmentApiEnvironment({
    repositoryRoot,
    providerPanel: loadDevelopmentProviderPanelFromEnvironment(commandEnvironment),
    registerReceipt: await readDevelopmentDeploymentRegisterReceipt(repositoryRoot),
    supportModelTarget
  });
  console.log(`DEV_API_ENVIRONMENT_READY=${receipt.keyCount}:${receipt.reused ? "REUSED" : "CREATED"}`);
} catch (error) {
  // F-DIAG-DEV-API-CLI. The decision lives in `developmentApiEnvironmentErrorCode`, beside the
  // throws it enumerates; this file holds the call and the printed contract, nothing else.
  const code = developmentApiEnvironmentErrorCode(error);
  console.error(code);
  process.exitCode = 1;
}
