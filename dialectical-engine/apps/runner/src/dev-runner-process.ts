import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseProviderDiscoveryTargets } from "@debateai/providers";
import { loadDevelopmentApiProcessEnvironment } from "./dev-api-process.js";
import {
  DEVELOPMENT_ORGAN_COST_BOUNDS,
  DEVELOPMENT_REGISTER_VERSION,
  DEVELOPMENT_RUN_DEATH_POLICY
} from "./dev-deployment-register.js";
import { DEVELOPMENT_LOCAL_PROVIDER_TARGET } from "./dev-local-provider.js";

const DEVELOPMENT_CLAIM_MARGIN_MS = 1_000;

export function developmentRunnerClaimMs(): number {
  const longestDeadlineMs = Math.max(
    ...Object.values(DEVELOPMENT_ORGAN_COST_BOUNDS.organs).map((organ) => organ.deadlineMs)
  );
  return DEVELOPMENT_RUN_DEATH_POLICY.max_cooldown_holds_per_run
    * (DEVELOPMENT_RUN_DEATH_POLICY.cooldown_ms + longestDeadlineMs)
    + longestDeadlineMs
    + DEVELOPMENT_CLAIM_MARGIN_MS;
}

export type DevelopmentRunnerChildExit = Readonly<{
  code: number | null;
  signal: NodeJS.Signals | null;
}>;

export type DevelopmentRunnerChild = Readonly<{
  exited: Promise<DevelopmentRunnerChildExit>;
  ready: Promise<unknown>;
  terminate(): Promise<void>;
}>;

export type DevelopmentRunnerProcessOperations = Readonly<{
  loadApiEnvironment(repositoryRoot: string): Promise<Readonly<Record<string, string>>>;
  startRunner(environment: Readonly<Record<string, string>>): DevelopmentRunnerChild;
}>;

export type DevelopmentRunnerProcess = Readonly<{
  receipt: Readonly<{ worker: "debateai-dev-runner"; registerVersion: typeof DEVELOPMENT_REGISTER_VERSION; state: "REGISTERED" }>;
  exited: Promise<DevelopmentRunnerChildExit>;
  stop(): Promise<void>;
}>;

export class DevelopmentRunnerProcessError extends Error {
  constructor(code: string, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "DevelopmentRunnerProcessError";
  }
}

function createRunnerEnvironment(
  commandEnvironment: Readonly<Record<string, string>>,
  apiEnvironment: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  const targets = parseProviderDiscoveryTargets(apiEnvironment.PROVIDER_DISCOVERY_TARGETS_JSON!, [{
    providerRef: DEVELOPMENT_LOCAL_PROVIDER_TARGET.providerRef,
    maker: "Local development"
  }]);
  const primary = targets[0];
  if (primary === undefined || apiEnvironment.REGISTER_VERSION !== String(DEVELOPMENT_REGISTER_VERSION)) {
    throw new DevelopmentRunnerProcessError("DEV_RUNNER_PROCESS_ENVIRONMENT_INVALID");
  }
  return Object.freeze({
    ...commandEnvironment,
    KEK_PATH: apiEnvironment.KEK_PATH!,
    DATABASE_URL: apiEnvironment.DATABASE_URL!,
    RUNNER_WORKER_ID: "development:walking-skeleton",
    REGISTER_VERSION: apiEnvironment.REGISTER_VERSION,
    CONTENT_ENCRYPTION_ENABLED: apiEnvironment.CONTENT_ENCRYPTION_ENABLED!,
    USER_DEK_STORE_PATH: apiEnvironment.USER_DEK_STORE_PATH!,
    CLAIM_MS: String(developmentRunnerClaimMs()),
    CLAIM_MARGIN_MS: String(DEVELOPMENT_CLAIM_MARGIN_MS),
    JUDGE_MAX_ATTEMPTS: "3",
    JUDGE_TOKEN_CEILING: "2048",
    JUDGE_DEADLINE_MS: "180000",
    COMPOSER_MAX_ATTEMPTS: "3",
    COMPOSER_TOKEN_CEILING: "2048",
    COMPOSER_DEADLINE_MS: "60000",
    CONFORMANCE_MAX_ATTEMPTS: "3",
    CONFORMANCE_TOKEN_CEILING: "2048",
    CONFORMANCE_DEADLINE_MS: "60000",
    PROVIDER_REF: primary.providerRef,
    JUDGE_CONTRACT_HASH: "sealed-register-v3",
    COMPOSER_CONTRACT_HASH: "sealed-register-v3",
    CONFORMANCE_CONTRACT_HASH: "sealed-register-v3",
    PROPAGATION_CONTRACT_HASH: "sealed-register-v3",
    SERVE_CONTRACT_HASH: "sealed-register-v3",
    MAX_RECOMPOSE: "2",
    FACT_BUNDLE_VERSION: apiEnvironment.REGISTER_VERSION,
    JUDGEMENT_NUMBER_KIND: "base-probability",
    JUDGEMENT_PRODUCER: "judgement:development",
    PROPAGATION_NUMBER_KIND: "propagated-probability",
    PROPAGATION_PRODUCER: "propagation:development",
    HATCHET_ENGINE_RETRIES: "0",
    HATCHET_WORKER_NAME: "debateai-dev-runner",
    VLLM_BASE_URL: primary.baseUrl,
    VLLM_MODEL: primary.model,
    VLLM_MAKER: primary.maker,
    ...(primary.authorizationHeader === undefined
      ? {} : { VLLM_AUTHORIZATION: primary.authorizationHeader }),
    PROVIDER_DISCOVERY_TARGETS_JSON: apiEnvironment.PROVIDER_DISCOVERY_TARGETS_JSON!,
    HATCHET_CLIENT_TOKEN: apiEnvironment.HATCHET_CLIENT_TOKEN!,
    HATCHET_HOST_PORT: apiEnvironment.HATCHET_HOST_PORT!,
    HATCHET_API_URL: apiEnvironment.HATCHET_API_URL!,
    HATCHET_TENANT_ID: apiEnvironment.HATCHET_TENANT_ID!,
    HATCHET_WORKFLOW_NAME: apiEnvironment.HATCHET_WORKFLOW_NAME!,
    HATCHET_TLS_STRATEGY: apiEnvironment.HATCHET_TLS_STRATEGY!
  });
}

export async function startDevelopmentRunnerProcess(input: Readonly<{
  repositoryRoot: string;
  commandEnvironment: Readonly<Record<string, string>>;
  operations: DevelopmentRunnerProcessOperations;
}>): Promise<DevelopmentRunnerProcess> {
  const apiEnvironment = await input.operations.loadApiEnvironment(input.repositoryRoot);
  let child: DevelopmentRunnerChild;
  try {
    child = input.operations.startRunner(createRunnerEnvironment(
      input.commandEnvironment,
      apiEnvironment
    ));
  } catch (error) {
    throw new DevelopmentRunnerProcessError("DEV_RUNNER_PROCESS_START_FAILED", error);
  }
  try {
    const outcome = await Promise.race([
      child.ready.then((message) => Object.freeze({ kind: "ready" as const, message })),
      child.exited.then((exit) => Object.freeze({ kind: "exit" as const, exit }))
    ]);
    if (outcome.kind === "exit") {
      throw new DevelopmentRunnerProcessError("DEV_RUNNER_PROCESS_EXITED");
    }
    const message = outcome.message as Readonly<Record<string, unknown>> | null;
    if (message === null
      || message.kind !== "DEBATEAI_RUNNER_READY"
      || message.worker !== "debateai-dev-runner"
      || message.registerVersion !== DEVELOPMENT_REGISTER_VERSION) {
      throw new DevelopmentRunnerProcessError("DEV_RUNNER_PROCESS_READINESS_INVALID");
    }
    let stopped = false;
    return Object.freeze({
      receipt: Object.freeze({
        worker: "debateai-dev-runner",
        registerVersion: DEVELOPMENT_REGISTER_VERSION,
        state: "REGISTERED"
      }),
      exited: child.exited,
      async stop() {
        if (stopped) return;
        stopped = true;
        await child.terminate();
      }
    });
  } catch (error) {
    await child.terminate().catch(() => undefined);
    throw error;
  }
}

export function createDevelopmentRunnerProcessOperations(
  repositoryRoot: string
): DevelopmentRunnerProcessOperations {
  const cwd = resolve(repositoryRoot);
  return Object.freeze({
    loadApiEnvironment: loadDevelopmentApiProcessEnvironment,
    startRunner(environment) {
      const child = spawn(
        process.execPath,
        [join(cwd, "node_modules", "tsx", "dist", "cli.mjs"), "apps/runner/src/main.ts"],
        { cwd, env: { ...environment }, shell: false, stdio: ["ignore", "ignore", "ignore", "ipc"] }
      );
      let exitSettled = false;
      let resolveReady!: (message: unknown) => void;
      let rejectReady!: (error: unknown) => void;
      const ready = new Promise<unknown>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      child.once("message", resolveReady);
      const exited = new Promise<DevelopmentRunnerChildExit>((resolve, reject) => {
        child.once("error", (error) => {
          exitSettled = true;
          rejectReady(error);
          reject(error);
        });
        child.once("exit", (code, signal) => {
          exitSettled = true;
          rejectReady(new DevelopmentRunnerProcessError("DEV_RUNNER_PROCESS_EXITED"));
          resolve(Object.freeze({ code, signal }));
        });
      });
      return Object.freeze({
        ready,
        exited,
        async terminate() {
          if (!exitSettled && child.exitCode === null && child.signalCode === null) {
            child.kill("SIGTERM");
            const stopped = await Promise.race([
              exited.then(() => true, () => true),
              delay(5_000).then(() => false)
            ]);
            if (!stopped) child.kill("SIGKILL");
          }
          await exited.catch(() => undefined);
        }
      });
    }
  });
}
