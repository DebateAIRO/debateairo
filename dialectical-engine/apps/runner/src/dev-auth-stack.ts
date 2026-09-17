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
  type DevelopmentProviderPanel
} from "./dev-provider-panel.js";
import {
  HERMES_SUPPORT_PORT,
  startHermesSupportRelay
} from "../../../acceptance/hermes-relay.js";
import type { DevelopmentDeploymentRegisterMachineReceiptV1 } from "./dev-deployment-register.js";
import {
  createDevTlsReadinessOperations,
  startAttestedDevTlsFrontDoor
} from "../../../deploy/dev-auth/tls-front-door.mjs";

type Stoppable = Readonly<{ stop(): Promise<void> }>;
type DataPlaneHandle = Stoppable & Readonly<{
  receipt: Readonly<{
    mailCapture: "ATTESTED";
    register: DevelopmentDeploymentRegisterMachineReceiptV1;
  }>;
}>;
type ApiHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentApiChildExit> }>;
type UiHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentUiChildExit> }>;
type RunnerHandle = Stoppable & Readonly<{ exited: Promise<DevelopmentRunnerChildExit> }>;
type SupportModelRelayHandle = Stoppable & Readonly<{
  targetJson: string;
  providerRef: "development:hermes-glm-5.3-flash";
}>;

export type DevelopmentAuthStackOperations = Readonly<{
  isPublicPortOccupied(): Promise<boolean>;
  startProviderPanel(): Promise<DevelopmentCliProviderPanelHandle>;
  startSupportModelRelay(): Promise<SupportModelRelayHandle>;
  startDataPlane(providerPanel: DevelopmentProviderPanel): Promise<DataPlaneHandle>;
  provisionHatchetToken(): Promise<void>;
  assembleApiEnvironment(
    providerPanel: DevelopmentProviderPanel,
    registerReceipt: DevelopmentDeploymentRegisterMachineReceiptV1,
    supportModelTarget: string
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
    origin: "https://localhost:3000";
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

/**
 * F-DIAG-DEV-AUTH-STACK — the EXPLICIT set of codes this joiner may emit.
 *
 * The previous form admitted a cause-chain message on its SHAPE
 * (`/^DEV_[A-Z0-9_]+$/`), so any message that merely looked like a code was
 * forwarded verbatim. The landed pattern in `apps/api/src/risk-signal-identity.ts`
 * considered and rejected exactly that rule, in its own words: an uppercase-shaped
 * message is still attacker- or driver-influenced text. A shape is not a
 * vocabulary.
 *
 * Every entry below was read out of a producer file by grep at authoring time
 * (2026-09-07), recorded in logs/diag-class-a/02-sweep-dev-codes.log and audited
 * in agent-reports/diag-class-a.md. Each of the six `Development*Error` classes
 * in `apps/runner/src/dev-*.ts` takes its `code` as the Error MESSAGE by
 * construction (`super(code, ...)`), as does `DevTlsFrontDoorError`
 * (`deploy/dev-auth/tls-front-door.mjs:32-37`) — which is why a producer's code
 * literal is exactly what appears in `current.message` here.
 *
 * The `deploy/dev-auth` codes are in the set because they are in-process causes:
 * this file imports `tls-front-door.mjs` (:30-33) and wraps its rejections at
 * `startTls` and `isPublicPortOccupied`, and the pre-existing test at
 * `tests/unit/dev-auth-stack.test.ts` already pins a joined
 * `DEV_TLS_PUBLIC_READINESS_INVALID`. The whole dev-auth vocabulary is listed
 * rather than the subset reachable today, because enumerating a subset is how a
 * re-routed failure silently degrades to the fallback.
 */
const KNOWN_DEVELOPMENT_ERROR_CODES: ReadonlySet<string> = new Set([
  // apps/runner/src/dev-auth-stack.ts  (this file; the three *_EXITED are built at :202 from the closed component union)
  "DEV_AUTH_STACK_API_EXITED",
  "DEV_AUTH_STACK_API_FAILED",
  "DEV_AUTH_STACK_CLEANUP_FAILED",
  "DEV_AUTH_STACK_DATA_FAILED",
  "DEV_AUTH_STACK_DATA_RECEIPT_INVALID",
  "DEV_AUTH_STACK_ENVIRONMENT_FAILED",
  "DEV_AUTH_STACK_FAILED",
  "DEV_AUTH_STACK_PREFLIGHT_FAILED",
  "DEV_AUTH_STACK_PROVIDER_PANEL_FAILED",
  "DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED",
  "DEV_AUTH_STACK_RUNNER_EXITED",
  "DEV_AUTH_STACK_RUNNER_FAILED",
  "DEV_AUTH_STACK_RUNTIME_FAILED",
  "DEV_AUTH_STACK_TLS_FAILED",
  "DEV_AUTH_STACK_TOKEN_FAILED",
  "DEV_AUTH_STACK_UI_EXITED",
  "DEV_AUTH_STACK_UI_FAILED",
  // apps/runner/src/dev-api-environment-cli.ts
  "DEV_API_ENVIRONMENT_FAILED",
  // apps/runner/src/dev-api-environment.ts
  "DEV_API_ENVIRONMENT_CONCURRENT_LOCKED",
  "DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID",
  "DEV_API_ENVIRONMENT_CREDENTIAL_FILE_INVALID",
  "DEV_API_ENVIRONMENT_CREDENTIAL_REQUIRED",
  "DEV_API_ENVIRONMENT_CUSTODY_ROOT_INVALID",
  "DEV_API_ENVIRONMENT_DATABASE_CREDENTIAL_INVALID",
  "DEV_API_ENVIRONMENT_DEFINITION_INVALID",
  "DEV_API_ENVIRONMENT_DRIFT",
  "DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID",
  "DEV_API_ENVIRONMENT_HISTORICAL_REGISTER_SOURCE_INVALID",
  "DEV_API_ENVIRONMENT_OWNER_UNVERIFIED",
  "DEV_API_ENVIRONMENT_PUBLISH_FAILED",
  "DEV_API_ENVIRONMENT_SECRET_CUSTODY_INVALID",
  // apps/runner/src/dev-api-process-cli.ts
  "DEV_API_PROCESS_EXITED",
  "DEV_API_PROCESS_FAILED",
  // apps/runner/src/dev-api-process.ts
  "DEV_API_PROCESS_CLEANUP_FAILED",
  "DEV_API_PROCESS_CUSTODY_INVALID",
  "DEV_API_PROCESS_ENVIRONMENT_INVALID",
  "DEV_API_PROCESS_OWNER_UNVERIFIED",
  "DEV_API_PROCESS_PORT_OCCUPIED",
  "DEV_API_PROCESS_PROBE_BODY_TOO_LARGE",
  "DEV_API_PROCESS_PROBE_BOUND_INVALID",
  "DEV_API_PROCESS_PROBE_FAILED",
  "DEV_API_PROCESS_PROBE_TIMEOUT",
  "DEV_API_PROCESS_READINESS_INVALID",
  "DEV_API_PROCESS_READINESS_TIMEOUT",
  "DEV_API_PROCESS_START_FAILED",
  // apps/runner/src/dev-auth-data-plane-cli.ts
  "DEV_AUTH_DATA_PLANE_FAILED",
  // apps/runner/src/dev-auth-data-plane.ts
  "DEV_AUTH_DATA_PLANE_CLEANUP_FAILED",
  "DEV_AUTH_DATA_PLANE_COMPOSE_ENV_FAILED",
  "DEV_AUTH_DATA_PLANE_DEPENDENCY_CLEANUP_FAILED",
  "DEV_AUTH_DATA_PLANE_DEPENDENCY_START_FAILED",
  "DEV_AUTH_DATA_PLANE_DEPENDENCY_STATUS_FAILED",
  "DEV_AUTH_DATA_PLANE_DOCKER_ENGINE_UNAVAILABLE",
  "DEV_AUTH_DATA_PLANE_DOCKER_UNAVAILABLE",
  "DEV_AUTH_DATA_PLANE_MAIL_FAILED",
  "DEV_AUTH_DATA_PLANE_MIGRATION_FAILED",
  "DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE",
  "DEV_AUTH_DATA_PLANE_PRINCIPAL_FAILED",
  "DEV_AUTH_DATA_PLANE_REGISTER_FAILED",
  "DEV_AUTH_DATA_PLANE_SECRET_FAILED",
  // apps/runner/src/dev-cli-provider-panel.ts
  "DEV_CLI_PROVIDER_PANEL_INSUFFICIENT_MAKERS",
  "DEV_CLI_PROVIDER_PANEL_RELAY_IDENTITY_INVALID",
  // apps/runner/src/dev-database-principals.ts
  "DEV_DATABASE_ADMIN_URL_INVALID",
  "DEV_DATABASE_CAPABILITY_ROLES_INVALID",
  "DEV_DATABASE_CREDENTIAL_FILE_INVALID",
  "DEV_DATABASE_CREDENTIAL_ROOT_INVALID",
  "DEV_DATABASE_PASSWORD_STATEMENT_FAILED",
  "DEV_DATABASE_PRINCIPAL_ADMIN_REQUIRED",
  "DEV_DATABASE_PRINCIPAL_DRIFT",
  "DEV_DATABASE_PRINCIPAL_OWNERSHIP_INVALID",
  "DEV_DATABASE_ROLE_NAME_INVALID",
  // apps/runner/src/dev-deployment-register.ts
  "DEV_ALGORITHM_REGISTER_FAMILY_MAP_UNRESOLVED",
  "DEV_ALGORITHM_REGISTER_ROLE_REFS_UNRESOLVED",
  "DEV_DEPLOYMENT_REGISTER_ADMIN_REQUIRED",
  "DEV_DEPLOYMENT_REGISTER_DEFINITION_INVALID",
  "DEV_DEPLOYMENT_REGISTER_DRIFT",
  "DEV_DEPLOYMENT_REGISTER_HISTORICAL_STATE_INVALID",
  "DEV_DEPLOYMENT_REGISTER_VERSION_INVALID",
  "DEV_RUNNER_REGISTER_DEFINITION_INVALID",
  // apps/runner/src/dev-hatchet-token-cli.ts
  "DEV_HATCHET_TOKEN_FAILED",
  // apps/runner/src/dev-hatchet-token.ts
  "DEV_HATCHET_TOKEN_ATTESTATION_FAILED",
  "DEV_HATCHET_TOKEN_CONCURRENT_LOCKED",
  "DEV_HATCHET_TOKEN_CUSTODY_INVALID",
  "DEV_HATCHET_TOKEN_DOCKER_ENGINE_UNAVAILABLE",
  "DEV_HATCHET_TOKEN_DOCKER_UNAVAILABLE",
  "DEV_HATCHET_TOKEN_INVALID",
  "DEV_HATCHET_TOKEN_ISSUE_FAILED",
  "DEV_HATCHET_TOKEN_LOCK_FAILED",
  "DEV_HATCHET_TOKEN_OWNER_UNVERIFIED",
  "DEV_HATCHET_TOKEN_PUBLISH_FAILED",
  "DEV_HATCHET_TOKEN_SERVICE_UNAVAILABLE",
  // apps/runner/src/dev-provider-panel.ts
  "DEV_CLI_PROVIDER_PANEL_REQUIRED",
  "DEV_CLI_PROVIDER_PANEL_TARGET_INVALID",
  "DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID",
  // apps/runner/src/dev-runner-policy.ts
  "DEV_RUNNER_POLICY_PROVENANCE_INVALID",
  "DEV_RUNNER_POLICY_UNRESOLVED",
  "DEV_RUNNER_REGISTER_VERSION_INVALID",
  // apps/runner/src/dev-runner-process.ts
  "DEV_RUNNER_PROCESS_ENVIRONMENT_INVALID",
  "DEV_RUNNER_PROCESS_EXITED",
  "DEV_RUNNER_PROCESS_READINESS_INVALID",
  "DEV_RUNNER_PROCESS_START_FAILED",
  // apps/runner/src/dev-secret-files.ts
  "DEV_AUTH_CUSTODY_ROOT_INVALID",
  "DEV_AUTH_SECRET_DOMAIN_INVALID",
  "DEV_AUTH_SECRET_FILE_INVALID",
  "DEV_AUTH_SECRET_OWNER_UNVERIFIED",
  "DEV_AUTH_SECRET_STORE_INVALID",
  // apps/runner/src/dev-ui-process-cli.ts
  "DEV_UI_PROCESS_EXITED",
  "DEV_UI_PROCESS_FAILED",
  // apps/runner/src/dev-ui-process.ts
  "DEV_UI_PROCESS_API_UNAVAILABLE",
  "DEV_UI_PROCESS_CLEANUP_FAILED",
  "DEV_UI_PROCESS_PORT_OCCUPIED",
  "DEV_UI_PROCESS_PROBE_BODY_TOO_LARGE",
  "DEV_UI_PROCESS_PROBE_BOUND_INVALID",
  "DEV_UI_PROCESS_PROBE_FAILED",
  "DEV_UI_PROCESS_PROBE_TIMEOUT",
  "DEV_UI_PROCESS_READINESS_INVALID",
  "DEV_UI_PROCESS_READINESS_TIMEOUT",
  "DEV_UI_PROCESS_START_FAILED",
  // deploy/dev-auth/create-local-certificate.mjs
  "DEV_TLS_CERTIFICATE_INVALID",
  "DEV_TLS_CERTIFICATE_PARTIAL",
  "DEV_TLS_CERTIFICATE_SETUP_FAILED",
  "DEV_TLS_DIRECTORY_CUSTODY_INVALID",
  "DEV_TLS_FILE_CUSTODY_INVALID",
  "DEV_TLS_MKCERT_FAILED",
  "DEV_TLS_MKCERT_UNAVAILABLE",
  "DEV_TLS_PATH_INVALID",
  // deploy/dev-auth/sendmail-capture.mjs
  "DEV_MAIL_CAPTURE_CUSTODY_INVALID",
  "DEV_MAIL_CAPTURE_DIRECTORY_REQUIRED",
  "DEV_MAIL_CAPTURE_INVOCATION_INVALID",
  "DEV_MAIL_CAPTURE_MESSAGE_EMPTY",
  "DEV_MAIL_CAPTURE_MESSAGE_TOO_LARGE",
  "DEV_MAIL_CAPTURE_WRITE_FAILED",
  // deploy/dev-auth/tls-front-door.mjs
  "DEV_TLS_ENDPOINT_INVALID",
  "DEV_TLS_FRONT_DOOR_CLEANUP_FAILED",
  "DEV_TLS_FRONT_DOOR_FAILED",
  "DEV_TLS_FRONT_DOOR_START_FAILED",
  "DEV_TLS_LISTEN_FAILED",
  "DEV_TLS_PORT_PROBE_FAILED",
  "DEV_TLS_PORT_PROBE_TIMEOUT",
  "DEV_TLS_PRIVATE_PROBE_FAILED",
  "DEV_TLS_PRIVATE_UI_UNAVAILABLE",
  "DEV_TLS_PUBLIC_PORT_OCCUPIED",
  "DEV_TLS_PUBLIC_PROBE_BOUND_INVALID",
  "DEV_TLS_PUBLIC_PROBE_FAILED",
  "DEV_TLS_PUBLIC_READINESS_INVALID",
  "DEV_TLS_PUBLIC_READINESS_TIMEOUT",
  // deploy/dev-auth/tls-front-door.mjs — TEMPLATE-BUILT, not literals. `probeEndpoint`
  // composes `${errorCode}_BODY_TOO_LARGE` (:61) and `${errorCode}_TIMEOUT` (:72); the
  // errorCode prefix is supplied by the only two callers of `probeUi` (:327 private,
  // :336 public), and `probeUi` (:83) is the only caller of `probeEndpoint` (:84,:91).
  // Two prefixes x two suffixes = these four; the bare prefixes are listed above. The
  // suffix lines carry no DEV_ token at all, which is why a literal-only sweep misses
  // them (codex r1 F2). They reach this joiner through startTls -> fixedStage.
  "DEV_TLS_PRIVATE_PROBE_FAILED_BODY_TOO_LARGE",
  "DEV_TLS_PRIVATE_PROBE_FAILED_TIMEOUT",
  "DEV_TLS_PUBLIC_PROBE_FAILED_BODY_TOO_LARGE",
  "DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT",
  // deploy/dev-auth/validate-compose-postgres.mjs
  "DEV_POSTGRES_HEALTHCHECK_REQUIRED",
  "DEV_POSTGRES_HEALTH_DEPENDENCY_REQUIRED",
  "DEV_POSTGRES_LOOPBACK_PORT_REQUIRED"
]);

/** The one code emitted for a code-SHAPED message that is not in the set above. */
const DEV_UNRECOGNIZED = "DEV_UNRECOGNIZED";

export function developmentAuthStackErrorCode(error: unknown): string {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    // ONE read of the message per link. Validating one read and emitting another
    // is not an allow-list: a message accessor that answers differently on the
    // second read would pass the check and then emit the unchecked value
    // (codex r1 F3). The snapshot decides membership, decides the unknown-code
    // case, and is the only thing that can be emitted.
    const message: unknown = current.message;
    if (typeof message === "string") {
      // Set membership decides, not the shape. The shape only decides whether a
      // link was TRYING to be a code, so an unknown one keeps its position in the
      // join instead of silently shortening the chain; a link that is not
      // code-shaped still falls away exactly as before.
      if (KNOWN_DEVELOPMENT_ERROR_CODES.has(message)) codes.push(message);
      else if (/^DEV_[A-Z0-9_]+$/u.test(message)) codes.push(DEV_UNRECOGNIZED);
    }
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

/**
 * Per-service teardown deadline. Each owned child already bounds its own
 * SIGTERM -> SIGKILL escalation; this is the outer bound that keeps one hung
 * stop (a front door waiting on an upgraded socket) from leaving every service
 * behind it running as an orphan (L7-F1).
 */
export const DEV_AUTH_STACK_STOP_TIMEOUT_MS = 10_000;

async function stopWithinDeadline(
  resource: Stoppable,
  timeoutMs: number
): Promise<"stopped" | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopping = resource.stop().then(() => "stopped" as const);
  // The abandoned stop may still reject later; never let that be unhandled.
  stopping.catch(() => undefined);
  try {
    return await Promise.race<"stopped" | "timeout">([
      stopping,
      new Promise<"timeout">((resolveTimeout) => {
        timer = setTimeout(() => resolveTimeout("timeout"), timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function stopOwned(
  resources: readonly Stoppable[],
  timeoutMs: number
): Promise<void> {
  let firstFailure: unknown;
  let timedOutComponents = 0;
  for (const resource of [...resources].reverse()) {
    try {
      if (await stopWithinDeadline(resource, timeoutMs) === "timeout") timedOutComponents += 1;
    } catch (error) {
      firstFailure ??= error;
    }
  }
  if (timedOutComponents > 0) {
    throw new DevelopmentAuthStackError("DEV_AUTH_STACK_STOP_TIMEOUT", firstFailure);
  }
  if (firstFailure !== undefined) {
    throw new DevelopmentAuthStackError("DEV_AUTH_STACK_CLEANUP_FAILED", firstFailure);
  }
}

export async function startDevelopmentAuthStack(
  operations: DevelopmentAuthStackOperations,
  stopTimeoutMs: number = DEV_AUTH_STACK_STOP_TIMEOUT_MS
): Promise<DevelopmentAuthStack> {
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
        providerPanel.panel,dataPlane.receipt.register,supportModelRelay.targetJson
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
        origin: "https://localhost:3000",
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
        stopPromise ??= stopOwned(owned, stopTimeoutMs);
        return stopPromise;
      }
    });
  } catch (error) {
    await stopOwned(owned, stopTimeoutMs);
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
  const hatchetOperations = createDevelopmentHatchetTokenOperations(
    repositoryRoot,
    commandEnvironment
  );
  const tlsOperations = createDevTlsReadinessOperations(repositoryRoot);
  return Object.freeze({
    isPublicPortOccupied: () => tlsOperations.isPublicPortOccupied(),
    startProviderPanel: () => startDevelopmentCliProviderPanel(),
    async startSupportModelRelay() {
      const relay = await startHermesSupportRelay({
        port: HERMES_SUPPORT_PORT,
        timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS
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
        providerPanel
      )
    ),
    async provisionHatchetToken() {
      await provisionDevelopmentHatchetToken({
        repositoryRoot,
        operations: hatchetOperations
      });
    },
    async assembleApiEnvironment(providerPanel, registerReceipt, supportModelTarget) {
      await assembleDevelopmentApiEnvironment({
        repositoryRoot,providerPanel,registerReceipt,supportModelTarget
      });
    },
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
