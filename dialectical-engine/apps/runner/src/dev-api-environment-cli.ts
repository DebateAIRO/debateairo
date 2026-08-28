import { assembleDevelopmentApiEnvironment } from "./dev-api-environment.js";
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
  const code = error instanceof TypeError && /^DEV_API_ENVIRONMENT_[A-Z_]+$/u.test(error.message)
    ? error.message
    : "DEV_API_ENVIRONMENT_FAILED";
  console.error(code);
  process.exitCode = 1;
}
