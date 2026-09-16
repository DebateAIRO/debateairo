// REV-S03-p3r-product-truth — pricing the ONE thing that still stops `pnpm dev:auth:up` at
// b97985a8, and proving WHOSE it is.
//
// The live run (live/serve-merged-up-b97985a8.log:9) got past the seed, the publication, the
// api.env rewrite and the API, then died with
//   DEV_AUTH_STACK_RUNNER_FAILED:DEV_RUNNER_PROCESS_READINESS_INVALID
// and the CLI stopped every owned stage, so V was left with no listeners. SPEC-v3 R32's first
// clause ("`pnpm dev:auth:up` starts the stack") is therefore still false on V's machine, and
// §2 acceptance steps 6-10 each name that command or "restart".
//
// The package README calls this "PRE-EXISTING since 2026-09-12, outside S03's surface". S03 DID
// edit this file (43efdb1a, 2026-09-13) so "outside S03's surface" is loose; what matters is
// whether S03 edited the FAILING PREDICATE. This fixture settles it by execution rather than by
// reading: the runner child's ready message carries `registerVersion` produced by the register
// package's own transform (a NUMBER), and the gate demands a STRING. No value of the register
// version can satisfy it — so S03's 9 -> 10 bump is not the cause.
//
// In-process only: `operations` is fully injected, no child process, no port, no database.

import { describe, expect, it } from "vitest";
import {
  startDevelopmentRunnerProcess,
  DevelopmentRunnerProcessError,
  type DevelopmentRunnerChild
} from "../../apps/runner/src/dev-runner-process.js";
import {
  developmentConfiguredProviderPanel,
  loadModelConfigConfiguredProviders
} from "../../apps/runner/src/dev-provider-panel.js";
import {
  parseRegisterVersionText,
  registerVersionToSafeLegacyNumber
} from "../../packages/register/src/index.js";

const ROOT = process.cwd();

// The canonical targets JSON, built by the product's own panel builder so the round-trip
// equality check inside createRunnerEnvironment holds.
const PANEL = developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(ROOT));

function apiEnvironmentAt(registerVersion: string): Readonly<Record<string, string>> {
  return Object.freeze({
    PROVIDER_DISCOVERY_TARGETS_JSON: PANEL.targetsJson,
    REGISTER_VERSION: registerVersion,
    REGISTER_DEPLOYMENT_RECEIPT_SHA256: "0".repeat(64),
    REGISTER_DEPLOYMENT_RECEIPT_FILE: ".local/dev-auth/register-receipt.json",
    KEK_PATH: ".local/dev-auth/kek",
    DATABASE_URL: "postgres://probe@127.0.0.1:1/probe",
    CONTENT_ENCRYPTION_ENABLED: "false",
    USER_DEK_STORE_PATH: ".local/dev-auth/dek",
    HATCHET_CLIENT_TOKEN: "probe", HATCHET_HOST_PORT: "127.0.0.1:1",
    HATCHET_API_URL: "http://127.0.0.1:1", HATCHET_TENANT_ID: "probe",
    HATCHET_WORKFLOW_NAME: "probe", HATCHET_TLS_STRATEGY: "none"
  });
}

function childSending(message: unknown): DevelopmentRunnerChild {
  return Object.freeze({
    ready: Promise.resolve(message),
    exited: new Promise<never>(() => undefined) as never,
    async terminate() { return undefined; }
  });
}

async function startWith(registerVersionOnTheWire: unknown, apiEnvVersion: string) {
  return startDevelopmentRunnerProcess({
    repositoryRoot: ROOT,
    commandEnvironment: {},
    operations: {
      loadApiEnvironment: async () => apiEnvironmentAt(apiEnvVersion),
      startRunner: () => childSending({
        kind: "DEBATEAI_RUNNER_READY",
        worker: "debateai-dev-runner",
        registerVersion: registerVersionOnTheWire,
        startupDispatched: 0
      })
    }
  });
}

describe("REV-S03-p3r-product-truth — why `pnpm dev:auth:up` still cannot finish at b97985a8", () => {
  it("R0 the runner sends a NUMBER: the register package's own env transform makes one", () => {
    const onTheWire = registerVersionToSafeLegacyNumber(parseRegisterVersionText("10"));
    console.log(`[PROBE p3r runner] runner's environment.REGISTER_VERSION = ${JSON.stringify(onTheWire)} (typeof ${typeof onTheWire})`);
    expect(typeof onTheWire).toBe("number");
  });

  it("R1 RED — the readiness gate rejects that message, so the stack stops at the runner stage", async () => {
    const onTheWire = registerVersionToSafeLegacyNumber(parseRegisterVersionText("10"));
    let code = "";
    try {
      await startWith(onTheWire, "10");
    } catch (failure) {
      code = failure instanceof DevelopmentRunnerProcessError ? failure.message : `UNEXPECTED:${String(failure)}`;
    }
    console.log(`[PROBE p3r runner] register version 10 -> ${code}`);
    expect(code).toBe("DEV_RUNNER_PROCESS_READINESS_INVALID");
  });

  it("R2 NOT S03's version bump — version 9, the pre-S03 value, fails identically", async () => {
    const onTheWire = registerVersionToSafeLegacyNumber(parseRegisterVersionText("9"));
    let code = "";
    try {
      await startWith(onTheWire, "9");
    } catch (failure) {
      code = failure instanceof DevelopmentRunnerProcessError ? failure.message : `UNEXPECTED:${String(failure)}`;
    }
    console.log(`[PROBE p3r runner] register version 9 -> ${code}`);
    expect(code).toBe("DEV_RUNNER_PROCESS_READINESS_INVALID");
  });

  it("R3 CONTROL — the gate is satisfiable: a STRING of the same version passes and the receipt is REGISTERED", async () => {
    const process_ = await startWith("10", "10");
    console.log(`[PROBE p3r runner] string "10" -> receipt=${JSON.stringify(process_.receipt)}`);
    expect(process_.receipt).toEqual({
      worker: "debateai-dev-runner",
      registerVersion: "10",
      state: "REGISTERED"
    });
    await process_.stop();
  });

  it("R4 the mismatch is a TYPE mismatch, not a value mismatch — no version can satisfy it from the loader", async () => {
    for (const version of ["1", "4", "9", "10", "11"]) {
      const onTheWire = registerVersionToSafeLegacyNumber(parseRegisterVersionText(version));
      let code = "";
      try {
        await startWith(onTheWire, version);
      } catch (failure) {
        code = failure instanceof DevelopmentRunnerProcessError ? failure.message : `UNEXPECTED:${String(failure)}`;
      }
      expect(code).toBe("DEV_RUNNER_PROCESS_READINESS_INVALID");
    }
  });
});
