import {
  createDevelopmentAuthDataPlaneOperations,
  startDevelopmentAuthDataPlane
} from "./dev-auth-data-plane.js";
import {
  createDevelopmentHatchetTokenOperations,
  provisionDevelopmentHatchetToken
} from "./dev-hatchet-token.js";
import { assembleDevelopmentApiEnvironment } from "./dev-api-environment.js";
import {
  createDevelopmentApiProcessOperations,
  startDevelopmentApiProcess,
  type DevelopmentApiChildExit
} from "./dev-api-process.js";
import {
  createDevelopmentUiProcessOperations,
  startDevelopmentUiProcess,
  type DevelopmentUiChildExit
} from "./dev-ui-process.js";
import {
  DEVELOPMENT_LOCAL_PROVIDER_TARGET,
  startDevelopmentLocalProvider
} from "./dev-local-provider.js";
import {
  createDevelopmentRunnerProcessOperations,
  startDevelopmentRunnerProcess,
  type DevelopmentRunnerChildExit
} from "./dev-runner-process.js";
import {
  createDevTlsReadinessOperations,
  startAttestedDevTlsFrontDoor
} from "../../../deploy/dev-auth/tls-front-door.mjs";

type Stoppable = Readonly<{ stop(): Promise<void> }>;
type DataPlaneHandle = Stoppable & Readonly<{
  receipt: Readonly<{ mailCapture: "ATTESTED" }>;
}>;
type ApiHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentApiChildExit> }>;
type UiHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentUiChildExit> }>;
type ProviderHandle = Stoppable & Readonly<{
  receipt: Readonly<{ host: string; port: number; model: string }>;
  exited: Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>;
}>;
type RunnerHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentRunnerChildExit> }>;

export type DevelopmentAuthStackOperations = Readonly<{
  isPublicPortOccupied(): Promise<boolean>;
  startDataPlane(): Promise<DataPlaneHandle>;
  provisionHatchetToken(): Promise<void>;
  assembleApiEnvironment(): Promise<void>;
  startProvider(): Promise<ProviderHandle>;
  startApi(): Promise<ApiHandle>;
  startRunner(): Promise<RunnerHandle>;
  startUi(): Promise<UiHandle>;
  startTls(): Promise<Stoppable>;
}>;

export type DevelopmentAuthStackExit =
  | Readonly<{ component: "API"; exit: DevelopmentApiChildExit }>
  | Readonly<{ component: "UI"; exit: DevelopmentUiChildExit }>
  | Readonly<{ component: "PROVIDER"; exit: Readonly<{ code: number | null; signal: NodeJS.Signals | null }> }>
  | Readonly<{ component: "RUNNER"; exit: DevelopmentRunnerChildExit }>;

export type DevelopmentAuthStack = Readonly<{
  receipt: Readonly<{
    origin: "https://localhost:3000";
    dataPlane: "ATTESTED";
    mail: "CAPTURED";
    api: "DENY_DEFAULT";
    ui: "DENY_DEFAULT_PROXY";
    tls: "SYSTEM_TRUST";
    provider: "OPENAI_COMPATIBLE";
    runner: "REGISTERED";
  }>;
  exited: Promise<DevelopmentAuthStackExit>;
  stop(): Promise<void>;
}>;

export class DevelopmentAuthStackError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentAuthStackError";
  }
}

export function developmentAuthStackErrorCode(error: unknown): string {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (/^DEV_[A-Z0-9_]+$/u.test(current.message)) codes.push(current.message);
    current = current.cause;
  }
  return codes.length > 0 ? codes.join(":") : "DEV_AUTH_STACK_FAILED";
}

async function fixedStage<T>(code: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new DevelopmentAuthStackError(code, error);
  }
}

async function stopOwned(resources: readonly Stoppable[]): Promise<void> {
  let firstFailure: unknown;
  for (const resource of [...resources].reverse()) {
    try {
      await resource.stop();
    } catch (error) {
      firstFailure ??= error;
    }
  }
  if (firstFailure !== undefined) {
    throw new DevelopmentAuthStackError("DEV_AUTH_STACK_CLEANUP_FAILED", firstFailure);
  }
}

export async function startDevelopmentAuthStack(
  operations: DevelopmentAuthStackOperations
): Promise<DevelopmentAuthStack> {
  const occupied = await fixedStage(
    "DEV_AUTH_STACK_PREFLIGHT_FAILED",
    () => operations.isPublicPortOccupied()
  );
  if (occupied) throw new DevelopmentAuthStackError("DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED");

  const owned: Stoppable[] = [];
  try {
    const dataPlane = await fixedStage(
      "DEV_AUTH_STACK_DATA_FAILED",
      () => operations.startDataPlane()
    );
    owned.push(dataPlane);
    if (dataPlane.receipt.mailCapture !== "ATTESTED") {
      throw new DevelopmentAuthStackError("DEV_AUTH_STACK_DATA_RECEIPT_INVALID");
    }
    await fixedStage(
      "DEV_AUTH_STACK_TOKEN_FAILED",
      () => operations.provisionHatchetToken()
    );
    await fixedStage(
      "DEV_AUTH_STACK_ENVIRONMENT_FAILED",
      () => operations.assembleApiEnvironment()
    );
    const provider = await fixedStage(
      "DEV_AUTH_STACK_PROVIDER_FAILED",
      () => operations.startProvider()
    );
    owned.push(provider);
    if (provider.receipt.host !== DEVELOPMENT_LOCAL_PROVIDER_TARGET.host
      || provider.receipt.port !== DEVELOPMENT_LOCAL_PROVIDER_TARGET.port
      || provider.receipt.model !== DEVELOPMENT_LOCAL_PROVIDER_TARGET.model) {
      throw new DevelopmentAuthStackError("DEV_AUTH_STACK_PROVIDER_RECEIPT_INVALID");
    }
    const api = await fixedStage("DEV_AUTH_STACK_API_FAILED", () => operations.startApi());
    owned.push(api);
    const runner = await fixedStage("DEV_AUTH_STACK_RUNNER_FAILED", () => operations.startRunner());
    owned.push(runner);
    const ui = await fixedStage("DEV_AUTH_STACK_UI_FAILED", () => operations.startUi());
    owned.push(ui);
    const tls = await fixedStage("DEV_AUTH_STACK_TLS_FAILED", () => operations.startTls());
    owned.push(tls);

    const exited = Promise.race<DevelopmentAuthStackExit>([
      api.exited.then((exit) => Object.freeze({ component: "API" as const, exit })),
      ui.exited.then((exit) => Object.freeze({ component: "UI" as const, exit })),
      provider.exited.then((exit) => Object.freeze({ component: "PROVIDER" as const, exit })),
      runner.exited.then((exit) => Object.freeze({ component: "RUNNER" as const, exit }))
    ]);
    let stopPromise: Promise<void> | undefined;
    return Object.freeze({
      receipt: Object.freeze({
        origin: "https://localhost:3000",
        dataPlane: "ATTESTED",
        mail: "CAPTURED",
        api: "DENY_DEFAULT",
        ui: "DENY_DEFAULT_PROXY",
        tls: "SYSTEM_TRUST",
        provider: "OPENAI_COMPATIBLE",
        runner: "REGISTERED"
      }),
      exited,
      stop() {
        stopPromise ??= stopOwned(owned);
        return stopPromise;
      }
    });
  } catch (error) {
    await stopOwned(owned);
    throw error;
  }
}

export async function superviseDevelopmentAuthStack(
  stack: DevelopmentAuthStack,
  termination: Promise<unknown>
): Promise<void> {
  let outcome: Readonly<{ kind: "signal" }>
    | Readonly<{ kind: "exit"; exit: DevelopmentAuthStackExit }>;
  try {
    outcome = await Promise.race([
      termination.then(() => Object.freeze({ kind: "signal" as const })),
      stack.exited.then((exit) => Object.freeze({ kind: "exit" as const, exit }))
    ]);
  } catch (error) {
    throw new DevelopmentAuthStackError("DEV_AUTH_STACK_RUNTIME_FAILED", error);
  } finally {
    await stack.stop();
  }
  if (outcome.kind === "exit") {
    throw new DevelopmentAuthStackError(`DEV_AUTH_STACK_${outcome.exit.component}_EXITED`);
  }
}

export function createDevelopmentAuthStackOperations(
  repositoryRoot: string,
  commandEnvironment: Readonly<Record<string, string>>
): DevelopmentAuthStackOperations {
  const dataPlaneOperations = createDevelopmentAuthDataPlaneOperations(
    repositoryRoot,
    commandEnvironment
  );
  const hatchetOperations = createDevelopmentHatchetTokenOperations(
    repositoryRoot,
    commandEnvironment
  );
  const tlsOperations = createDevTlsReadinessOperations(repositoryRoot);
  return Object.freeze({
    isPublicPortOccupied: () => tlsOperations.isPublicPortOccupied(),
    startDataPlane: () => startDevelopmentAuthDataPlane(dataPlaneOperations),
    async provisionHatchetToken() {
      await provisionDevelopmentHatchetToken({
        repositoryRoot,
        operations: hatchetOperations
      });
    },
    async assembleApiEnvironment() {
      await assembleDevelopmentApiEnvironment({ repositoryRoot });
    },
    startProvider: () => startDevelopmentLocalProvider(),
    startApi: () => startDevelopmentApiProcess({
      repositoryRoot,
      commandEnvironment,
      operations: createDevelopmentApiProcessOperations(repositoryRoot)
    }),
    startRunner: () => startDevelopmentRunnerProcess({
      repositoryRoot,
      commandEnvironment,
      operations: createDevelopmentRunnerProcessOperations(repositoryRoot)
    }),
    startUi: () => startDevelopmentUiProcess({
      repositoryRoot,
      commandEnvironment,
      operations: createDevelopmentUiProcessOperations(repositoryRoot)
    }),
    startTls: () => startAttestedDevTlsFrontDoor({ operations: tlsOperations })
  });
}
