import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  bootstrapDevelopmentAuthDataPlane,
  startDevelopmentAuthDataPlane,
  type DevelopmentAuthDataPlaneOperations
} from "../../apps/runner/src/dev-auth-data-plane.js";

function operations(overrides: Partial<DevelopmentAuthDataPlaneOperations> = {}) {
  const calls: string[] = [];
  const operation: DevelopmentAuthDataPlaneOperations = {
    prepareComposeEnvironment: vi.fn(async () => { calls.push("compose-env"); }),
    resolveDockerExecutable: vi.fn(async () => {
      calls.push("docker-resolve");
      return "/Applications/Docker.app/Contents/Resources/bin/docker";
    }),
    assertDockerEngine: vi.fn(async () => { calls.push("docker-engine"); }),
    startDependencies: vi.fn(async () => {
      calls.push("dependencies-start");
      return Object.freeze({ startedServices: Object.freeze(["postgres", "hatchet-lite"]) });
    }),
    waitForPostgres: vi.fn(async () => { calls.push("postgres-ready"); }),
    migrate: vi.fn(async () => { calls.push("migrate"); }),
    provisionPrincipals: vi.fn(async () => { calls.push("principals"); }),
    seedRegister: vi.fn(async () => { calls.push("register"); }),
    generateSecrets: vi.fn(async () => { calls.push("secrets"); }),
    verifyMailCapture: vi.fn(async () => { calls.push("mail"); }),
    stopDependencies: vi.fn(async (_docker, services) => {
      calls.push(`stop:${services.join(",")}`);
    }),
    ...overrides
  };
  return { calls, operation };
}

describe("DEV-08 persistent local-auth data plane", () => {
  it("retains exact startup ownership for one idempotent reverse-order stop", async () => {
    const test = operations();
    const dataPlane = await startDevelopmentAuthDataPlane(test.operation);

    expect(dataPlane.receipt).toEqual({
      postgres: "READY",
      hatchet: "READY",
      migrations: "APPLIED",
      principals: "ATTESTED",
      register: "SEALED",
      secrets: "ATTESTED",
      mailCapture: "ATTESTED"
    });
    expect(test.operation.stopDependencies).not.toHaveBeenCalled();
    await dataPlane.stop();
    await dataPlane.stop();
    expect(test.operation.stopDependencies).toHaveBeenCalledTimes(1);
    expect(test.operation.stopDependencies).toHaveBeenCalledWith(
      "/Applications/Docker.app/Contents/Resources/bin/docker",
      ["hatchet-lite", "postgres"]
    );
  });

  it("returns a no-op lifecycle when every dependency was already running", async () => {
    const test = operations({
      startDependencies: vi.fn(async () => {
        test.calls.push("dependencies-start");
        return Object.freeze({ startedServices: Object.freeze([]) });
      })
    });
    const dataPlane = await startDevelopmentAuthDataPlane(test.operation);
    await dataPlane.stop();
    expect(test.operation.stopDependencies).not.toHaveBeenCalled();
  });

  it("runs the exact data-plane bootstrap in order and returns no credential-bearing values", async () => {
    const test = operations();
    await expect(bootstrapDevelopmentAuthDataPlane(test.operation)).resolves.toEqual({
      postgres: "READY",
      hatchet: "READY",
      migrations: "APPLIED",
      principals: "ATTESTED",
      register: "SEALED",
      secrets: "ATTESTED",
      mailCapture: "ATTESTED"
    });
    expect(test.calls).toEqual([
      "compose-env",
      "docker-resolve",
      "docker-engine",
      "dependencies-start",
      "postgres-ready",
      "migrate",
      "principals",
      "register",
      "secrets",
      "mail"
    ]);
    expect(JSON.stringify(await bootstrapDevelopmentAuthDataPlane(operations({
      startDependencies: vi.fn(async () => Object.freeze({
        startedServices: Object.freeze([])
      }))
    }).operation))).not.toMatch(/password|token|postgresql:\/\//i);
  });

  it("stops exactly the services this invocation started when a later step fails", async () => {
    const test = operations({
      seedRegister: vi.fn(async () => {
        test.calls.push("register");
        throw new Error("secret database output that must not escape");
      })
    });
    await expect(bootstrapDevelopmentAuthDataPlane(test.operation))
      .rejects.toThrow("DEV_AUTH_DATA_PLANE_REGISTER_FAILED");
    expect(test.calls).toEqual([
      "compose-env",
      "docker-resolve",
      "docker-engine",
      "dependencies-start",
      "postgres-ready",
      "migrate",
      "principals",
      "register",
      "stop:hatchet-lite,postgres"
    ]);
    expect(test.calls.join("\n")).not.toContain("secret database output");
  });

  it("does not stop reused services and exposes the exact command/preflight contract", async () => {
    const test = operations({
      startDependencies: vi.fn(async () => {
        test.calls.push("dependencies-start");
        return Object.freeze({ startedServices: Object.freeze([]) });
      }),
      migrate: vi.fn(async () => {
        test.calls.push("migrate");
        throw new Error("migration internals");
      })
    });
    await expect(bootstrapDevelopmentAuthDataPlane(test.operation))
      .rejects.toThrow("DEV_AUTH_DATA_PLANE_MIGRATION_FAILED");
    expect(test.operation.stopDependencies).not.toHaveBeenCalled();

    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const cli = await readFile("apps/runner/src/dev-auth-data-plane-cli.ts", "utf8");
    const capture = await readFile("deploy/dev-auth/sendmail-capture.mjs", "utf8");
    expect(packageJson.scripts?.["dev:auth:data-plane"])
      .toBe("tsx apps/runner/src/dev-auth-data-plane-cli.ts");
    expect(cli).toContain("createDevelopmentAuthDataPlaneOperations");
    expect(cli).toContain("loadDevelopmentCommandEnvironment()");
    expect(await readFile("apps/runner/src/dev-auth-data-plane.ts", "utf8"))
      .not.toContain("process.env");
    expect(capture).toContain('process.argv[2] === "--preflight"');
  });
});
