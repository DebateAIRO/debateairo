import {
  assembleDevelopmentApiEnvironment,
  developmentApiEnvironmentErrorCode
} from "./dev-api-environment.js";
import { loadDevelopmentProviderPanelFromEnvironment } from "./dev-provider-panel.js";
import { loadDevelopmentCommandEnvironment } from "@debateai/register";

try {
  const commandEnvironment = loadDevelopmentCommandEnvironment();
  const receipt = await assembleDevelopmentApiEnvironment({
    repositoryRoot: process.cwd(),
    providerPanel: loadDevelopmentProviderPanelFromEnvironment(commandEnvironment)
  });
  console.log(`DEV_API_ENVIRONMENT_READY=${receipt.keyCount}:${receipt.reused ? "REUSED" : "CREATED"}`);
} catch (error) {
  // F-DIAG-DEV-API-CLI. The decision lives in `developmentApiEnvironmentErrorCode`, beside the
  // throws it enumerates; this file holds the call and the printed contract, nothing else.
  const code = developmentApiEnvironmentErrorCode(error);
  console.error(code);
  process.exitCode = 1;
}
