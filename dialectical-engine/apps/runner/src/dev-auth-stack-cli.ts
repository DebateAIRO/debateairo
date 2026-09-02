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
    let signalled = false;
    const onSignal = (signal: NodeJS.Signals): void => {
      if (signalled) {
        // Teardown is already bounded per service. Absorbing repeats keeps the
        // default signal action from killing this supervisor mid-teardown and
        // orphaning the API, runner, and UI it owns (L7-F1).
        console.error("DEV_AUTH_STACK_STOP_IN_PROGRESS");
        return;
      }
      signalled = true;
      resolveSignal(signal);
    };
    process.on("SIGINT", () => onSignal("SIGINT"));
    process.on("SIGTERM", () => onSignal("SIGTERM"));
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
  // Persistent, not once: a second fault during teardown must not fall through
  // to the default action and abandon the children.
  process.on("uncaughtException", onUncaughtException);
  process.on("unhandledRejection", onUnhandledRejection);
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
