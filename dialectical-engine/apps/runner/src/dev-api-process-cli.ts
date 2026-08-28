import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import {
  createDevelopmentApiProcessOperations,
  DevelopmentApiProcessError,
  startDevelopmentApiProcess
} from "./dev-api-process.js";

function terminationSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolveSignal) => {
    process.once("SIGINT", () => resolveSignal("SIGINT"));
    process.once("SIGTERM", () => resolveSignal("SIGTERM"));
  });
}

try {
  const api = await startDevelopmentApiProcess({
    repositoryRoot: process.cwd(),
    commandEnvironment: loadDevelopmentCommandEnvironment(),
    operations: createDevelopmentApiProcessOperations(process.cwd())
  });
  console.log("DEV_AUTH_API_READY=127.0.0.1:8790:DENY_DEFAULT");
  const outcome = await Promise.race([
    terminationSignal().then(() => "signal" as const),
    api.exited.then(() => "exit" as const)
  ]);
  if (outcome === "exit") {
    throw new DevelopmentApiProcessError("DEV_API_PROCESS_EXITED");
  }
  await api.stop();
} catch (error) {
  const code = error instanceof DevelopmentApiProcessError
    ? error.message
    : "DEV_API_PROCESS_FAILED";
  console.error(code);
  process.exitCode = 1;
}
