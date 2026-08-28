import {
  bootstrapDevelopmentAuthDataPlane,
  createDevelopmentAuthDataPlaneOperations,
  DevelopmentAuthDataPlaneError
} from "./dev-auth-data-plane.js";
import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import { loadDevelopmentProviderPanelFromEnvironment } from "./dev-provider-panel.js";

try {
  const commandEnvironment = loadDevelopmentCommandEnvironment();
  const receipt = await bootstrapDevelopmentAuthDataPlane(
    createDevelopmentAuthDataPlaneOperations(
      process.cwd(),
      commandEnvironment,
      loadDevelopmentProviderPanelFromEnvironment(commandEnvironment)
    )
  );
  console.log(
    `DEV_AUTH_DATA_PLANE_READY=${receipt.postgres}:${receipt.hatchet}:`
      + `${receipt.migrations}:${receipt.principals}:${receipt.register}:`
      + `${receipt.secrets}:${receipt.mailCapture}`
  );
} catch (error) {
  const code = error instanceof DevelopmentAuthDataPlaneError
    ? error.message
    : "DEV_AUTH_DATA_PLANE_FAILED";
  console.error(code);
  process.exitCode = 1;
}
