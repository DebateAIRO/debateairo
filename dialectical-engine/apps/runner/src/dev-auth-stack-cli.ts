import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import {
  createDevelopmentAuthStackOperations,
  developmentAuthStackErrorCode,
  DevelopmentAuthStackError,
  superviseDevelopmentAuthStack,
  startDevelopmentAuthStack
} from "./dev-auth-stack.js";

function terminationSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolveSignal) => {
    process.once("SIGINT", () => resolveSignal("SIGINT"));
    process.once("SIGTERM", () => resolveSignal("SIGTERM"));
  });
}

function runtimeFaultSignal(): Readonly<{ promise: Promise<never>; dispose(): void }> {
  let rejectFault!: (error: unknown) => void;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectFault = reject;
  });
  void promise.catch(() => undefined);
  const onUncaughtException = (error: Error) => rejectFault(error);
  const onUnhandledRejection = (reason: unknown) => rejectFault(reason);
  process.once("uncaughtException", onUncaughtException);
  process.once("unhandledRejection", onUnhandledRejection);
  return Object.freeze({
    promise,
    dispose() {
      process.off("uncaughtException", onUncaughtException);
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
}

const runtimeFault = runtimeFaultSignal();
try {
  const stack = await startDevelopmentAuthStack(
    createDevelopmentAuthStackOperations(
      process.cwd(),
      loadDevelopmentCommandEnvironment()
    )
  );
  console.log("DEV_AUTH_STACK_READY=https://localhost:3000:RUNNER_REGISTERED");
  await superviseDevelopmentAuthStack(
    stack,
    Promise.race([terminationSignal(), runtimeFault.promise])
  );
} catch (error) {
  const code = error instanceof DevelopmentAuthStackError
    ? developmentAuthStackErrorCode(error)
    : "DEV_AUTH_STACK_FAILED";
  console.error(code);
  process.exitCode = 1;
} finally {
  runtimeFault.dispose();
}
