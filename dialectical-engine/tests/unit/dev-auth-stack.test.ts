import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  developmentAuthStackErrorCode,
  superviseDevelopmentAuthStack,
  startDevelopmentAuthStack,
  type DevelopmentAuthStackOperations
} from "../../apps/runner/src/dev-auth-stack.js";
import {
  startAttestedDevTlsFrontDoor,
  type DevTlsOwnedFrontDoor,
  type DevTlsReadinessOperations,
  type DevTlsUiProbe
} from "../../deploy/dev-auth/tls-front-door.mjs";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { createDevelopmentDeploymentRegisterMachineReceipt } from "../../apps/runner/src/dev-deployment-register.js";
import { parseRegisterVersionText } from "../../packages/register/src/index.js";
import { SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } from "../../apps/runner/src/dev-auth-stack-profile.js";

const REGISTER_RECEIPT = createDevelopmentDeploymentRegisterMachineReceipt({
  registerVersion: parseRegisterVersionText("424242"),
  rowCount: 32,
  snapshotSha256: "a".repeat(64)
});
const SUPPORT_MODEL_TARGET = JSON.stringify({
  provider_ref: "development:hermes-glm-5.3-flash",
  base_url: "http://127.0.0.1:8794/v1",
  model: "z-ai/glm-5.3-flash",
  authorization_header: "Bearer support-only"
});

type Exit = Readonly<{ code: number | null; signal: NodeJS.Signals | null }>;

function deferredExit() {
  let resolveExit!: (exit: Exit) => void;
  const exited = new Promise<Exit>((resolve) => { resolveExit = resolve; });
  return { exited, resolveExit };
}

function operations(input: Readonly<{
  occupied?: boolean;
  preview?: boolean;
  failAt?: "provider_panel" | "support_model" | "data" | "token" | "environment" | "api" | "runner" | "ui" | "tls";
}> = {}): DevelopmentAuthStackOperations & Readonly<{
  calls: string[];
  apiExit: ReturnType<typeof deferredExit>;
  uiExit: ReturnType<typeof deferredExit>;
  runnerExit: ReturnType<typeof deferredExit>;
}> {
  const calls: string[] = [];
  const apiExit = deferredExit();
  const uiExit = deferredExit();
  const runnerExit = deferredExit();
  const fail = (stage: NonNullable<typeof input.failAt>) => {
    if (input.failAt === stage) throw new Error(`sensitive ${stage} failure`);
  };
  return {
    ...(input.preview ? { profile: SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } : {}),
    calls,
    apiExit,
    uiExit,
    runnerExit,
    isPublicPortOccupied: vi.fn(async () => {
      calls.push("preflight");
      return input.occupied ?? false;
    }),
    startProviderPanel: vi.fn(async () => {
      calls.push("providers:start");
      fail("provider_panel");
      return Object.freeze({
        panel: TEST_DEVELOPMENT_PROVIDER_PANEL,
        healthyProviderRefs: TEST_DEVELOPMENT_PROVIDER_PANEL.healthyProviderRefs,
        stop: vi.fn(async () => { calls.push("providers:stop"); })
      });
    }),
    startSupportModelRelay: vi.fn(async () => {
      calls.push("support:start");
      fail("support_model");
      return Object.freeze({
        targetJson: SUPPORT_MODEL_TARGET,
        providerRef: "development:hermes-glm-5.3-flash" as const,
        stop: vi.fn(async () => { calls.push("support:stop"); })
      });
    }),
    startDataPlane: vi.fn(async () => {
      calls.push("data:start");
      fail("data");
      return Object.freeze({
        receipt: Object.freeze({ mailCapture: "ATTESTED" as const, register: REGISTER_RECEIPT }),
        stop: vi.fn(async () => { calls.push("data:stop"); })
      });
    }),
    provisionHatchetToken: vi.fn(async () => {
      calls.push("token");
      fail("token");
    }),
    assembleApiEnvironment: vi.fn(async () => {
      calls.push("environment");
      fail("environment");
    }),
    startApi: vi.fn(async () => {
      calls.push("api:start");
      fail("api");
      return Object.freeze({
        exited: apiExit.exited,
        stop: vi.fn(async () => { calls.push("api:stop"); })
      });
    }),
    startRunner: vi.fn(async () => {
      calls.push("runner:start");
      fail("runner");
      return Object.freeze({
        exited: runnerExit.exited,
        stop: vi.fn(async () => { calls.push("runner:stop"); })
      });
    }),
    startUi: vi.fn(async () => {
      calls.push("ui:start");
      fail("ui");
      return Object.freeze({
        exited: uiExit.exited,
        stop: vi.fn(async () => { calls.push("ui:stop"); })
      });
    }),
    startTls: vi.fn(async () => {
      calls.push("tls:start");
      fail("tls");
      return Object.freeze({ stop: vi.fn(async () => { calls.push("tls:stop"); }) });
    })
  };
}

describe("DEV-10F bounded local auth stack supervisor", () => {
  it("reports only bounded DEV error codes from nested stage failures", () => {
    expect(developmentAuthStackErrorCode(new Error("DEV_AUTH_STACK_TLS_FAILED", {
      cause: new Error("DEV_TLS_PUBLIC_READINESS_INVALID", {
        cause: new Error("sensitive certificate path")
      })
    }))).toBe("DEV_AUTH_STACK_TLS_FAILED:DEV_TLS_PUBLIC_READINESS_INVALID");
  });
  /**
   * F-DIAG-DEV-AUTH-STACK. The shape rule `/^DEV_[A-Z0-9_]+$/` forwards ANY
   * message that merely LOOKS like a code. The landed pattern
   * (`apps/api/src/risk-signal-identity.ts`) considered and rejected exactly
   * that rule: "an uppercase-shaped message is still attacker- or
   * driver-influenced text". The set below is written out independently here
   * and is NOT imported from `dev-auth-stack.ts`; its producer audit is in
   * agent-reports/diag-class-a.md.
   */
  it("refuses a message that is code-SHAPED but is not a known code", () => {
    // Synthetic only (D18). Shape-legal for the old regex, absent from every producer.
    const code = developmentAuthStackErrorCode(new Error("DEV_AUTH_STACK_TLS_FAILED", {
      cause: new Error("DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER")
    }));

    expect(code).not.toContain("SYNTHETIC_PW_42");
    expect(code).toBe("DEV_AUTH_STACK_TLS_FAILED:DEV_UNRECOGNIZED");
  });

  it("returns the fixed fallback when the whole chain is code-shaped but unknown", () => {
    const code = developmentAuthStackErrorCode(
      new Error("DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER")
    );

    expect(code).not.toContain("SYNTHETIC_PW_42");
    expect(code).toBe("DEV_UNRECOGNIZED");
  });

  /**
   * codex r1 F2. These four are TEMPLATE-BUILT, not literals: `probeEndpoint`
   * composes `${errorCode}_BODY_TOO_LARGE` (tls-front-door.mjs:61) and
   * `${errorCode}_TIMEOUT` (:72) over the only two prefixes its only caller
   * supplies (:327 private, :336 public). Their source lines carry no DEV_ token,
   * so a literal-only producer sweep misses them and the first round degraded all
   * four to DEV_UNRECOGNIZED — a diagnostic regression, not a redaction. An
   * ordinary UI probe that times out or overruns its body bound produces them.
   */
  it("retains the four template-built TLS probe codes, each distinct", () => {
    const probeCodes = [
      "DEV_TLS_PRIVATE_PROBE_FAILED_BODY_TOO_LARGE",
      "DEV_TLS_PRIVATE_PROBE_FAILED_TIMEOUT",
      "DEV_TLS_PUBLIC_PROBE_FAILED_BODY_TOO_LARGE",
      "DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT"
    ] as const;

    const joined = probeCodes.map((code) => developmentAuthStackErrorCode(
      new Error("DEV_AUTH_STACK_TLS_FAILED", { cause: new Error(code) })
    ));

    // Each is retained, and each stays DISTINCT from the other three — collapsing
    // them to a shared category would also pass a "not DEV_UNRECOGNIZED" check.
    expect(joined).toEqual(probeCodes.map((code) => `DEV_AUTH_STACK_TLS_FAILED:${code}`));
    expect(new Set(joined).size).toBe(4);
    // and the bare prefixes they are built from still join on their own
    expect(developmentAuthStackErrorCode(new Error("DEV_TLS_PRIVATE_PROBE_FAILED")))
      .toBe("DEV_TLS_PRIVATE_PROBE_FAILED");
    expect(developmentAuthStackErrorCode(new Error("DEV_TLS_PUBLIC_PROBE_FAILED")))
      .toBe("DEV_TLS_PUBLIC_PROBE_FAILED");
  });

  /**
   * codex r1 F3. Validating one read of `message` and emitting another is not an
   * allow-list. No concurrency is needed — an accessor that answers differently on
   * the second read is enough. The guard must emit the snapshot it validated.
   */
  it("reads each link's message ONCE, so an unstable accessor cannot slip past the set", () => {
    // Synthetic only (D18); shape-legal so the old regex would have forwarded it.
    const SYNTHETIC = "DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER";
    const shifty = new Error("placeholder");
    let reads = 0;
    Object.defineProperty(shifty, "message", {
      configurable: true,
      get: () => (reads++ === 0 ? "DEV_AUTH_STACK_TLS_FAILED" : SYNTHETIC)
    });

    const code = developmentAuthStackErrorCode(shifty);

    expect(code).not.toContain("SYNTHETIC_PW_42");
    expect(code).toBe("DEV_AUTH_STACK_TLS_FAILED");
  });

  it("reads once on a deeper link too, and keeps the join order", () => {
    const SYNTHETIC = "DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER";
    const inner = new Error("placeholder");
    let reads = 0;
    Object.defineProperty(inner, "message", {
      configurable: true,
      get: () => (reads++ === 0 ? "DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT" : SYNTHETIC)
    });

    const code = developmentAuthStackErrorCode(
      new Error("DEV_AUTH_STACK_TLS_FAILED", { cause: inner })
    );

    expect(code).not.toContain("SYNTHETIC_PW_42");
    expect(code).toBe("DEV_AUTH_STACK_TLS_FAILED:DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT");
  });

  it("control — a known chain still joins in the same order, to full depth", () => {
    expect(developmentAuthStackErrorCode(new Error("DEV_AUTH_STACK_DATA_FAILED", {
      cause: new Error("DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE", {
        cause: new Error("DEV_AUTH_DATA_PLANE_DEPENDENCY_START_FAILED", {
          cause: new Error("DEV_TLS_PORT_PROBE_TIMEOUT")
        })
      })
    }))).toBe([
      "DEV_AUTH_STACK_DATA_FAILED",
      "DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE",
      "DEV_AUTH_DATA_PLANE_DEPENDENCY_START_FAILED",
      "DEV_TLS_PORT_PROBE_TIMEOUT"
    ].join(":"));
  });

  it("control — the four-level walk still stops at four, and non-code links still fall away", () => {
    expect(developmentAuthStackErrorCode(new Error("DEV_AUTH_STACK_API_FAILED", {
      cause: new Error("not a code at all", {
        cause: new Error("DEV_API_PROCESS_START_FAILED", {
          cause: new Error("DEV_API_PROCESS_PROBE_TIMEOUT", {
            cause: new Error("DEV_UI_PROCESS_EXITED")
          })
        })
      })
    }))).toBe("DEV_AUTH_STACK_API_FAILED:DEV_API_PROCESS_START_FAILED:DEV_API_PROCESS_PROBE_TIMEOUT");
  });

  it("control — a chain with no DEV-shaped message keeps the historical fallback", () => {
    expect(developmentAuthStackErrorCode(new Error("plain failure", {
      cause: new Error("another plain failure")
    }))).toBe("DEV_AUTH_STACK_FAILED");
    expect(developmentAuthStackErrorCode("not an error at all")).toBe("DEV_AUTH_STACK_FAILED");
  });

  it("starts the exact attested chain and stops owned resources once in reverse order", async () => {
    const runtime = operations();
    const stack = await startDevelopmentAuthStack(runtime);

    expect(stack.receipt).toEqual({
      origin: "https://localhost:3000",
      dataPlane: "ATTESTED",
      mail: "CAPTURED",
      api: "DENY_DEFAULT",
      ui: "DENY_DEFAULT_PROXY",
      tls: "SYSTEM_TRUST",
      providers: "CLI_HANDSHAKE",
      supportModel: "HERMES_GLM_5_3_FLASH",
      healthyProviderRefs: [
        "development:codex-cli",
        "development:codex-premium-cli",
        "development:claude-cli",
        "development:claude-premium-cli"
      ],
      runner: "REGISTERED"
    });
    expect(runtime.calls).toEqual([
      "preflight", "providers:start", "support:start", "data:start", "token", "environment",
      "api:start", "runner:start", "ui:start", "tls:start"
    ]);
    expect(runtime.startDataPlane).toHaveBeenCalledWith(TEST_DEVELOPMENT_PROVIDER_PANEL);
    expect(runtime.assembleApiEnvironment)
      .toHaveBeenCalledWith(TEST_DEVELOPMENT_PROVIDER_PANEL, REGISTER_RECEIPT, SUPPORT_MODEL_TARGET);

    await Promise.all([stack.stop(), stack.stop()]);
    await stack.stop();
    expect(runtime.calls).toEqual([
      "preflight", "providers:start", "support:start", "data:start", "token", "environment",
      "api:start", "runner:start", "ui:start", "tls:start",
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"
    ]);
  });

  it("refuses an occupied public port before creating any resource", async () => {
    const runtime = operations({ occupied: true });
    await expect(startDevelopmentAuthStack(runtime))
      .rejects.toThrow("DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED");
    expect(runtime.calls).toEqual(["preflight"]);
  });

  it("reports the selected support-preview origin without changing lifecycle ownership", async () => {
    const runtime = operations({ preview: true });
    const stack = await startDevelopmentAuthStack(runtime);
    expect(stack.receipt.origin).toBe("https://localhost:3100");
    await stack.stop();
  });

  it.each([
    ["provider_panel", ["preflight", "providers:start"]],
    ["support_model", ["preflight", "providers:start", "support:start", "providers:stop"]],
    ["data", ["preflight", "providers:start", "support:start", "data:start", "support:stop", "providers:stop"]],
    ["token", ["preflight", "providers:start", "support:start", "data:start", "token", "data:stop", "support:stop", "providers:stop"]],
    ["environment", ["preflight", "providers:start", "support:start", "data:start", "token", "environment", "data:stop", "support:stop", "providers:stop"]],
    ["api", ["preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "data:stop", "support:stop", "providers:stop"]],
    ["runner", ["preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "api:stop", "data:stop", "support:stop", "providers:stop"]],
    ["ui", ["preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "ui:start", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"]],
    ["tls", ["preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "ui:start", "tls:start", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"]]
  ] as const)("unwinds only the started prefix when %s fails", async (failAt, expected) => {
    const runtime = operations({ failAt });
    await expect(startDevelopmentAuthStack(runtime))
      .rejects.toThrow(`DEV_AUTH_STACK_${failAt.toUpperCase()}_FAILED`);
    expect(runtime.calls).toEqual(expected);
    expect(runtime.calls.join("\n")).not.toContain("sensitive");
  });

  it("reports every owned process exit so the CLI can unwind the full stack", async () => {
    const apiRuntime = operations();
    const apiStack = await startDevelopmentAuthStack(apiRuntime);
    apiRuntime.apiExit.resolveExit({ code: 1, signal: null });
    await expect(apiStack.exited).resolves.toEqual({
      component: "API",
      exit: { code: 1, signal: null }
    });
    await apiStack.stop();

    const uiRuntime = operations();
    const uiStack = await startDevelopmentAuthStack(uiRuntime);
    uiRuntime.uiExit.resolveExit({ code: null, signal: "SIGTERM" });
    await expect(uiStack.exited).resolves.toEqual({
      component: "UI",
      exit: { code: null, signal: "SIGTERM" }
    });
    await uiStack.stop();

    const runnerRuntime = operations();
    const runnerStack = await startDevelopmentAuthStack(runnerRuntime);
    runnerRuntime.runnerExit.resolveExit({ code: null, signal: "SIGKILL" });
    await expect(runnerStack.exited).resolves.toEqual({
      component: "RUNNER",
      exit: { code: null, signal: "SIGKILL" }
    });
    await runnerStack.stop();
  });

  it("always stops the stack on signal, exact child exit, or runtime-promise failure", async () => {
    const signalRuntime = operations();
    const signalStack = await startDevelopmentAuthStack(signalRuntime);
    await expect(superviseDevelopmentAuthStack(signalStack, Promise.resolve("SIGTERM")))
      .resolves.toBeUndefined();
    expect(signalRuntime.calls.slice(-7)).toEqual([
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"
    ]);

    const exitRuntime = operations();
    const exitStack = await startDevelopmentAuthStack(exitRuntime);
    const exited = superviseDevelopmentAuthStack(exitStack, new Promise(() => undefined));
    exitRuntime.apiExit.resolveExit({ code: 1, signal: null });
    await expect(exited).rejects.toThrow("DEV_AUTH_STACK_API_EXITED");
    expect(exitRuntime.calls.slice(-7)).toEqual([
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"
    ]);

    const stop = vi.fn(async () => undefined);
    await expect(superviseDevelopmentAuthStack({
      receipt: exitStack.receipt,
      exited: Promise.reject(new Error("sensitive child transport failure")),
      stop
    }, new Promise(() => undefined))).rejects.toThrow("DEV_AUTH_STACK_RUNTIME_FAILED");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("bounds every owned stop so one hung service cannot orphan the rest (L7-F1)", async () => {
    const base = operations();
    const stack = await startDevelopmentAuthStack({
      ...base,
      startTls: vi.fn(async () => {
        base.calls.push("tls:start");
        return Object.freeze({ stop: vi.fn(() => new Promise<void>(() => undefined)) });
      })
    }, 50);

    await expect(stack.stop()).rejects.toThrow("DEV_AUTH_STACK_STOP_TIMEOUT");
    expect(base.calls).toContain("ui:stop");
    expect(base.calls).toContain("runner:stop");
    expect(base.calls).toContain("api:stop");
    expect(base.calls).toContain("data:stop");
    expect(base.calls).toContain("providers:stop");
  });

  it("exposes one fixed CLI, owns the runner, and never starts a substitute provider", async () => {
    const [packageSource, source, cli] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/dev-auth-stack.ts", "utf8"),
      readFile("apps/runner/src/dev-auth-stack-cli.ts", "utf8")
    ]);
    const scripts = JSON.parse(packageSource).scripts as Record<string, string>;
    expect(scripts["dev:auth:up"]).toBe("tsx apps/runner/src/dev-auth-stack-cli.ts");
    expect(source).toContain("startDevelopmentAuthDataPlane");
    expect(source).toContain("startAttestedDevTlsFrontDoor");
    expect(source).toContain("startDevelopmentRunnerProcess");
    expect(source).toContain("startDevelopmentCliProviderPanel");
    expect(source).not.toMatch(/dev-local-provider|qa-deterministic/iu);
    expect(source).not.toMatch(/mkcert\s+-install|seedAccount/iu);
    expect(source).not.toContain("process.env");
    expect(cli).toContain("DEV_AUTH_STACK_READY=${stack.receipt.origin}:RUNNER_REGISTERED");
    expect(cli).toContain("process.on(\"uncaughtException\"");
    expect(cli).toContain("process.on(\"unhandledRejection\"");
    expect(cli).not.toContain("process.once(\"SIGINT\"");
    expect(cli).toContain("runtimeFault.dispose()");
  });

});

/**
 * F-DEV-TLS-DOUBLE-WRAP. `DevTlsFrontDoorError`'s constructor ALREADY wraps its second
 * argument (`super(code, cause === undefined ? undefined : { cause })`,
 * deploy/dev-auth/tls-front-door.mjs:32-35), and its DECLARED contract takes the cause raw
 * (`constructor(code: string, cause?: unknown)`, deploy/dev-auth/tls-front-door.d.mts:40) —
 * the same convention the sibling `DevelopmentAuthStackError` is called under in the subject
 * of this file (dev-auth-stack.ts:323, :337, :423, each passing a bare `error`). Two throw
 * sites passed `{ cause: error }` instead, so `error.cause` was a plain object
 * `{ cause: <real error> }`. `developmentAuthStackErrorCode` advances only while
 * `current instanceof Error` (dev-auth-stack.ts:299), so the walk stopped one link short and
 * the inner producer code never joined.
 *
 * Each row asserts the WRAP DEPTH directly — `cause` is the object that was thrown, not a
 * wrapper around it — and then the consequence the ticket names: the joined chain reaches it.
 * The depth assertion is what makes these rows independent of which producer supplied the
 * inner error; the join assertion is what makes the diagnostic loss visible.
 */
const DEV_TLS_READY_UI: DevTlsUiProbe = Object.freeze({
  login: Object.freeze({
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: "<html><body>Back to the graph.</body></html>"
  }),
  session: Object.freeze({
    statusCode: 401,
    contentType: "application/json; charset=utf-8",
    body: '{"error":"SESSION_REQUIRED"}'
  })
});

function tlsReadinessOperations(overrides: Readonly<{
  startFrontDoor?: () => Promise<DevTlsOwnedFrontDoor>;
  probePublicUi?: () => Promise<DevTlsUiProbe | null>;
}> = {}): DevTlsReadinessOperations {
  return Object.freeze({
    isPublicPortOccupied: async () => false,
    probePrivateUi: async () => DEV_TLS_READY_UI,
    startFrontDoor: overrides.startFrontDoor
      ?? (async () => Object.freeze({ port: 3_000, close: async () => undefined })),
    probePublicUi: overrides.probePublicUi ?? (async () => DEV_TLS_READY_UI),
    delay: async () => undefined
  });
}

async function rejectionOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("EXPECTED_A_REJECTION");
}

describe("F-DEV-TLS-DOUBLE-WRAP the front door wraps a cause exactly once", () => {
  it("joins the inner DEV code of a front-door START failure instead of stopping at the outer code", async () => {
    // A real producer code: `DevCertificateError("DEV_TLS_CERTIFICATE_INVALID")`
    // (deploy/dev-auth/create-local-certificate.mjs:27, :74) is NOT a DevTlsFrontDoorError,
    // so it takes the wrapping branch of the ternary at tls-front-door.mjs:286-288 rather
    // than the pass-through branch.
    const inner = new Error("DEV_TLS_CERTIFICATE_INVALID");

    const caught = await rejectionOf(startAttestedDevTlsFrontDoor({
      operations: tlsReadinessOperations({ startFrontDoor: () => Promise.reject(inner) })
    }));

    expect((caught as Error).message).toBe("DEV_TLS_FRONT_DOOR_START_FAILED");
    expect((caught as Error).cause).toBe(inner);
    expect(developmentAuthStackErrorCode(caught))
      .toBe("DEV_TLS_FRONT_DOOR_START_FAILED:DEV_TLS_CERTIFICATE_INVALID");
  });

  it("joins the inner DEV code of a front-door CLEANUP failure instead of stopping at the outer code", async () => {
    // The owned front door's `close` arrives through the injected operations, so its
    // rejection is whatever that implementation raises. DEV_TLS_LISTEN_FAILED is drawn from
    // this module's own vocabulary (tls-front-door.mjs:241); the depth assertion below is
    // what pins the property, and it does not depend on the producer.
    const inner = new Error("DEV_TLS_LISTEN_FAILED");
    const unreadyUi: DevTlsUiProbe = Object.freeze({
      login: Object.freeze({ ...DEV_TLS_READY_UI.login, statusCode: 503 }),
      session: DEV_TLS_READY_UI.session
    });

    const caught = await rejectionOf(startAttestedDevTlsFrontDoor({
      operations: tlsReadinessOperations({
        startFrontDoor: async () => Object.freeze({
          port: 3_000,
          close: () => Promise.reject(inner)
        }),
        probePublicUi: async () => unreadyUi
      })
    }));

    expect((caught as Error).message).toBe("DEV_TLS_FRONT_DOOR_CLEANUP_FAILED");
    expect((caught as Error).cause).toBe(inner);
    expect(developmentAuthStackErrorCode(caught))
      .toBe("DEV_TLS_FRONT_DOOR_CLEANUP_FAILED:DEV_TLS_LISTEN_FAILED");
  });

  // The neighbouring control, named for what it EXECUTES. F-DIAG-TAIL-N (codex diag-tail r1
  // N1): this row's earlier name and comment claimed a front-door error raised by
  // `startFrontDoor` and passed through the ternary UNWRAPPED. It never reaches that branch.
  // `tlsReadinessOperations` above supplies the DEFAULT, SUCCEEDING `startFrontDoor` (:444-445)
  // and is overridden here only on `probePublicUi`, so nothing is raised at start; the error
  // asserted below is the readiness timeout raised after the probe budget is spent, which is
  // why its message is DEV_TLS_PUBLIC_READINESS_TIMEOUT and not a start code.
  // What it still controls for, and why it belongs beside the two rows above: a "fix" that made
  // the constructor stop wrapping, or that attached a cause everywhere, would also satisfy
  // those two rows — this row fails if a cause is attached to an error that has none.
  // NOT covered here: the start-rejection pass-through itself. No row in this file exercises
  // an error that IS a DevTlsFrontDoorError arriving at that ternary.
  it("leaves a no-cause readiness-timeout error untouched when every public probe is unready", async () => {
    const caught = await rejectionOf(startAttestedDevTlsFrontDoor({
      operations: tlsReadinessOperations({ probePublicUi: async () => null }),
      maximumProbeAttempts: 1
    }));

    expect((caught as Error).message).toBe("DEV_TLS_PUBLIC_READINESS_TIMEOUT");
    expect((caught as Error).cause).toBeUndefined();
    expect(developmentAuthStackErrorCode(caught)).toBe("DEV_TLS_PUBLIC_READINESS_TIMEOUT");
  });
});
