import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import {
  createDevelopmentUiProcessOperations,
  DevelopmentUiProcessError,
  startDevelopmentUiProcess
} from "./dev-ui-process.js";

function terminationSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolveSignal) => {
    process.once("SIGINT", () => resolveSignal("SIGINT"));
    process.once("SIGTERM", () => resolveSignal("SIGTERM"));
  });
}

try {
  const ui = await startDevelopmentUiProcess({
    repositoryRoot: process.cwd(),
    commandEnvironment: loadDevelopmentCommandEnvironment(),
    operations: createDevelopmentUiProcessOperations(process.cwd())
  });
  console.log("DEV_AUTH_UI_READY=127.0.0.1:3001:DENY_DEFAULT_PROXY");
  const outcome = await Promise.race([
    terminationSignal().then(() => "signal" as const),
    ui.exited.then(() => "exit" as const)
  ]);
  if (outcome === "exit") throw new DevelopmentUiProcessError("DEV_UI_PROCESS_EXITED");
  await ui.stop();
} catch (error) {
  const code = error instanceof DevelopmentUiProcessError
    ? error.message
    : "DEV_UI_PROCESS_FAILED";
  console.error(code);
  process.exitCode = 1;
}
