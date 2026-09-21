import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
  createDevelopmentRunnerProcessOperations,
  startDevelopmentRunnerProcess,
  type DevelopmentRunnerChildExit
} from "./dev-runner-process.js";
import {
  startDevelopmentCliProviderPanel,
  type DevelopmentCliProviderPanelHandle
} from "./dev-cli-provider-panel.js";
import {
  DEVELOPMENT_CLI_CALL_TIMEOUT_MS,
  resolveDevelopmentApiProviderSlots,
  type DevelopmentApiProviderProbe,
  type DevelopmentProviderPanel
} from "./dev-provider-panel.js";
import { loadModelConfig, ModelConfigShapeError, type ModelConfig } from "@debateai/model-config";
import { readProviderKeys } from "./dev-provider-keys.js";
import { startHermesSupportRelay } from "../../../acceptance/hermes-relay.js";
import type { DevelopmentDeploymentRegisterMachineReceiptV1 } from "./dev-deployment-register.js";
import {
  createDevTlsReadinessOperations,
  startAttestedDevTlsFrontDoor
} from "../../../deploy/dev-auth/tls-front-door.mjs";
import {
  DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE,
  type DevelopmentAuthStackProfile
} from "./dev-auth-stack-profile.js";

type Stoppable = Readonly<{ stop(): Promise<void> }>;
type DataPlaneHandle = Stoppable & Readonly<{
  receipt: Readonly<{
    mailCapture: "ATTESTED";
    register: DevelopmentDeploymentRegisterMachineReceiptV1;
    heldConfiguredProviderSets?: ReadonlyMap<string, readonly string[]>;
  }>;
}>;
type ApiHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentApiChildExit> }>;
type UiHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentUiChildExit> }>;
type RunnerHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentRunnerChildExit> }>;
type SupportModelRelayHandle = Stoppable & Readonly<{
  targetJson: string;
  providerRef: "development:hermes-glm-5.3-flash";
}>;

export type DevelopmentApiProviderAvailabilityOperations = Readonly<{
  readProviderKeys(repositoryRoot: string): Promise<ReadonlyMap<string, string>>;
  probe: DevelopmentApiProviderProbe;
  warning(line: string): void;
}>;

export type DevelopmentAuthStackOperations = Readonly<{
  profile?: DevelopmentAuthStackProfile;
  generateContract(): Promise<void>;
  checkModelConfig(): Promise<void>;
  isPublicPortOccupied(): Promise<boolean>;
  startProviderPanel(): Promise<DevelopmentCliProviderPanelHandle>;
  startSupportModelRelay(): Promise<SupportModelRelayHandle>;
  startDataPlane(providerPanel: DevelopmentProviderPanel): Promise<DataPlaneHandle>;
  provisionHatchetToken(): Promise<void>;
  assembleApiEnvironment(
    providerPanel: DevelopmentProviderPanel,
    registerReceipt: DevelopmentDeploymentRegisterMachineReceiptV1,
    supportModelTarget: string,
    heldConfiguredProviderSets?: ReadonlyMap<string, readonly string[]>
  ): Promise<void>;
  startApi(): Promise<ApiHandle>;
  startRunner(): Promise<RunnerHandle>;
  startUi(): Promise<UiHandle>;
  startTls(): Promise<Stoppable>;
}>;

export type DevelopmentAuthStackExit =
  | Readonly<{ component: "API"; exit: DevelopmentApiChildExit }>
  | Readonly<{ component: "UI"; exit: DevelopmentUiChildExit }>
  | Readonly<{ component: "RUNNER"; exit: DevelopmentRunnerChildExit }>;

export type DevelopmentAuthStack = Readonly<{
  receipt: Readonly<{
    origin: string;
    dataPlane: "ATTESTED";
    mail: "CAPTURED";
    api: "DENY_DEFAULT";
    ui: "DENY_DEFAULT_PROXY";
    tls: "SYSTEM_TRUST";
    providers: "CLI_HANDSHAKE";
    supportModel: "HERMES_GLM_5_3_FLASH";
    healthyProviderRefs: readonly string[];
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
  const profile = operations.profile ?? DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE;
  await fixedStage(
    "DEV_AUTH_STACK_MODEL_CONFIG_INVALID",
    () => operations.checkModelConfig()
  );
  await fixedStage(
    "DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED",
    () => operations.generateContract()
  );
  const occupied = await fixedStage(
    "DEV_AUTH_STACK_PREFLIGHT_FAILED",
    () => operations.isPublicPortOccupied()
  );
  if (occupied) throw new DevelopmentAuthStackError("DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED");
  const owned: Stoppable[] = [];
  try {
    const providerPanel = await fixedStage(
      "DEV_AUTH_STACK_PROVIDER_PANEL_FAILED",
      () => operations.startProviderPanel()
    );
    owned.push(providerPanel);
    const supportModelRelay = await fixedStage(
      "DEV_AUTH_STACK_SUPPORT_MODEL_FAILED",
      () => operations.startSupportModelRelay()
    );
    owned.push(supportModelRelay);
    const dataPlane = await fixedStage(
      "DEV_AUTH_STACK_DATA_FAILED",
      () => operations.startDataPlane(providerPanel.panel)
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
      () => operations.assembleApiEnvironment(
        providerPanel.panel,
        dataPlane.receipt.register,
        supportModelRelay.targetJson,
        dataPlane.receipt.heldConfiguredProviderSets
      )
    );
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
      runner.exited.then((exit) => Object.freeze({ component: "RUNNER" as const, exit }))
    ]);
    let stopPromise: Promise<void> | undefined;
    return Object.freeze({
      receipt: Object.freeze({
        origin: profile.publicOrigin,
        dataPlane: "ATTESTED",
        mail: "CAPTURED",
        api: "DENY_DEFAULT",
        ui: "DENY_DEFAULT_PROXY",
        tls: "SYSTEM_TRUST",
        providers: "CLI_HANDSHAKE",
        supportModel: "HERMES_GLM_5_3_FLASH",
        healthyProviderRefs: providerPanel.healthyProviderRefs,
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

const DEFAULT_DEVELOPMENT_API_PROVIDER_AVAILABILITY_OPERATIONS:
DevelopmentApiProviderAvailabilityOperations = Object.freeze({
  readProviderKeys,
  async probe(input) {
    const response = await fetch(`${input.baseUrl.replace(/\/$/u, "")}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.keyValue}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 64
      })
    });
    if (!response.ok) throw new TypeError("DEV_PROVIDER_SLOT_PROBE_FAILED");
    const body = await response.json() as Readonly<{ model?: unknown }>;
    if (typeof body.model !== "string") throw new TypeError("DEV_PROVIDER_SLOT_PROBE_FAILED");
    return Object.freeze({ model: body.model });
  },
  warning: (line) => console.warn(line)
});

export function createDevelopmentAuthStackOperations(
  repositoryRoot: string,
  commandEnvironment: Readonly<Record<string, string>>,
  profileOrApiProviderOperations: DevelopmentAuthStackProfile
    | DevelopmentApiProviderAvailabilityOperations = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE,
  explicitApiProviderOperations: DevelopmentApiProviderAvailabilityOperations =
    DEFAULT_DEVELOPMENT_API_PROVIDER_AVAILABILITY_OPERATIONS
): DevelopmentAuthStackOperations {
  const profile = "name" in profileOrApiProviderOperations
    ? profileOrApiProviderOperations
    : DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE;
  const apiProviderOperations = "name" in profileOrApiProviderOperations
    ? explicitApiProviderOperations
    : profileOrApiProviderOperations;
  const execFileAsync = promisify(execFile);
  const hatchetOperations = createDevelopmentHatchetTokenOperations(
    repositoryRoot,
    commandEnvironment,
    profile
  );
  const tlsOperations = createDevTlsReadinessOperations(repositoryRoot, {
    publicPort: profile.publicPort,
    uiPort: profile.uiPort
  });
  let checkedModelConfig: ModelConfig | undefined;
  return Object.freeze({
    profile,
    async generateContract() {
      await execFileAsync(
        commandEnvironment.PNPM_EXECUTABLE?.trim() || "pnpm",
        ["generate:contract"],
        {
          cwd: repositoryRoot,
          env: { ...commandEnvironment },
          maxBuffer: 128 * 1024
        }
      );
    },
    async checkModelConfig() {
      try {
        checkedModelConfig = loadModelConfig(repositoryRoot);
      } catch (error) {
        if (error instanceof ModelConfigShapeError) {
          const model = error.model === undefined ? "" : ` model=${error.model}`;
          console.error(
            `DEV_AUTH_STACK_MODEL_CONFIG_INVALID tier=${error.tier}${model} class ${error.classNumber}`
          );
        }
        throw error;
      }
    },
    isPublicPortOccupied: () => tlsOperations.isPublicPortOccupied(),
    async startProviderPanel() {
      const config = checkedModelConfig ?? loadModelConfig(repositoryRoot);
      const cliHandle = await startDevelopmentCliProviderPanel(
        config,
        undefined,
        apiProviderOperations.warning,
        profile
      );
      try {
        const panel = await resolveDevelopmentApiProviderSlots(
          config,
          cliHandle.panel,
          await apiProviderOperations.readProviderKeys(repositoryRoot),
          apiProviderOperations.probe,
          apiProviderOperations.warning,
          profile
        );
        return Object.freeze({
          panel,
          healthyProviderRefs: panel.healthyProviderRefs,
          stop: () => cliHandle.stop()
        });
      } catch (error) {
        await cliHandle.stop().catch(() => undefined);
        throw error;
      }
    },
    async startSupportModelRelay() {
      const relay = await startHermesSupportRelay({
        port: profile.supportModelPort,
        timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS,
        ...(profile.name === "support-preview"
          ? { developmentStackProfile: "support-preview" as const }
          : {})
      });
      return Object.freeze({
        targetJson: relay.targetJson,
        providerRef: relay.providerRef,
        stop: () => relay.close()
      });
    },
    startDataPlane: (providerPanel) => startDevelopmentAuthDataPlane(
      createDevelopmentAuthDataPlaneOperations(
        repositoryRoot,
        commandEnvironment,
        providerPanel,
        profile
      )
    ),
    async provisionHatchetToken() {
      await provisionDevelopmentHatchetToken({
        repositoryRoot,
        operations: hatchetOperations,
        profile
      });
    },
    async assembleApiEnvironment(
      providerPanel,
      registerReceipt,
      supportModelTarget,
      heldConfiguredProviderSets
    ) {
      await assembleDevelopmentApiEnvironment({
        repositoryRoot,
        providerPanel,
        registerReceipt,
        supportModelTarget,
        profile,
        ...(heldConfiguredProviderSets === undefined ? {} : { heldConfiguredProviderSets })
      });
    },
    startApi: () => startDevelopmentApiProcess({
      repositoryRoot,
      commandEnvironment,
      operations: createDevelopmentApiProcessOperations(repositoryRoot, profile),
      profile
    }),
    startRunner: () => startDevelopmentRunnerProcess({
      repositoryRoot,
      commandEnvironment,
      operations: createDevelopmentRunnerProcessOperations(repositoryRoot, profile),
      profile
    }),
    startUi: () => startDevelopmentUiProcess({
      repositoryRoot,
      commandEnvironment,
      operations: createDevelopmentUiProcessOperations(repositoryRoot, profile),
      profile
    }),
    startTls: () => startAttestedDevTlsFrontDoor({ operations: tlsOperations })
  });
}
