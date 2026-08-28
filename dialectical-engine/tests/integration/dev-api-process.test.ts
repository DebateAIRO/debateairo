import { chmod, link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startDevelopmentApiProcess,
  type DevelopmentApiChild,
  type DevelopmentApiChildExit,
  type DevelopmentApiProcessOperations
} from "../../apps/runner/src/dev-api-process.js";
import { DEVELOPMENT_API_ENVIRONMENT_KEYS } from "../../apps/runner/src/dev-api-environment.js";

const roots: string[] = [];

function environment(root: string): Readonly<Record<string, string>> {
  const custodyRoot = join(root, ".local", "dev-auth");
  return Object.freeze({
    KEK_PATH: join(custodyRoot, "secrets", "kek.bin"),
    BLIND_INDEX_KEY_PATH: join(custodyRoot, "secrets", "blind-index-key.bin"),
    AUDIT_KEY_STORE_PATH: join(custodyRoot, "audit-keys"),
    AUDIT_SOURCE_IP_SALT_PATH: join(custodyRoot, "secrets", "audit-source-ip-salt.bin"),
    USER_DEK_STORE_PATH: join(custodyRoot, "user-deks"),
    CORPUS_KEK_PATH: join(custodyRoot, "secrets", "corpus-kek.bin"),
    PUBLICATION_KEY_STORE_PATH: join(custodyRoot, "publication-keys"),
    CONTENT_ENCRYPTION_ENABLED: "true",
    CONTENT_PROVISION_DATABASE_URL: "postgresql://debateai_dev_content_provision:one@127.0.0.1:55432/debateai",
    AUTHORIZATION_DATABASE_URL: "postgresql://debateai_dev_authorization:auth@127.0.0.1:55432/debateai",
    PUBLICATION_ENABLED: "true",
    PUBLICATION_CLEANUP_DATABASE_URL: "postgresql://debateai_dev_publication_cleanup:pub@127.0.0.1:55432/debateai",
    ERASURE_DATABASE_URL: "postgresql://debateai_dev_erasure:two@127.0.0.1:55432/debateai",
    ACCOUNT_ERASURE_GRACE_MS: "604800000",
    MAIL_SENDMAIL_PATH: join(root, "deploy", "dev-auth", "sendmail-capture.mjs"),
    MAIL_FROM: "noreply@localhost.test",
    PUBLIC_APP_URL: "https://localhost:3000",
    DATABASE_URL: "postgresql://debateai_dev_runtime:three@127.0.0.1:55432/debateai",
    API_HOST: "127.0.0.1",
    API_PORT: "8790",
    STRANGER_SAMPLE_RATE: "0",
    REGISTER_VERSION: "3",
    BATTERY_VERSION: "dev-auth-v1",
    SETTLEMENT_WATCH_HANDLE: "dev-auth:settlement-watch",
    PROVIDER_DISCOVERY_TARGETS_JSON: JSON.stringify([{
      provider_ref: "development:local-vllm",
      base_url: "http://127.0.0.1:8791/v1",
      model: "qa-deterministic-v1"
    }]),
    PROVIDER_PROBE_TIMEOUT_MS: "5000",
    NODE_ENV: "development",
    EVALUATOR_DEV_MENU_ENABLED: "false",
    EVALUATOR_DEV_MENU_DATABASE_URL: "postgresql://debateai_dev_evaluator_api:evaluator@127.0.0.1:55432/debateai",
    HATCHET_CLIENT_TOKEN: "header.payload.signature",
    HATCHET_HOST_PORT: "127.0.0.1:7077",
    HATCHET_API_URL: "http://127.0.0.1:8888",
    HATCHET_TENANT_ID: "11111111-1111-4111-8111-111111111111",
    HATCHET_WORKFLOW_NAME: "debateai-dev",
    HATCHET_TLS_STRATEGY: "none",
    DEBATEAI_DEV_MAIL_CAPTURE_DIR: join(custodyRoot, "mail")
  });
}

async function fixture(): Promise<Readonly<{ root: string; envPath: string }>> {
  const root = await mkdtemp(join(tmpdir(), "debateai-dev-api-process-"));
  roots.push(root);
  await mkdir(join(root, ".local"), { mode: 0o700 });
  await mkdir(join(root, ".local", "dev-auth"), { mode: 0o700 });
  const envPath = join(root, ".local", "dev-auth", "api.env");
  const values = environment(root);
  await writeFile(
    envPath,
    `${DEVELOPMENT_API_ENVIRONMENT_KEYS.map((key) => `${key}=${values[key]}`).join("\n")}\n`,
    { mode: 0o600 }
  );
  return Object.freeze({ root, envPath });
}

function child(): DevelopmentApiChild & {
  terminate: ReturnType<typeof vi.fn>;
  exit(value?: DevelopmentApiChildExit): void;
} {
  let resolveExit!: (value: Readonly<{ code: number | null; signal: NodeJS.Signals | null }>) => void;
  const exited = new Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>(
    (resolve) => { resolveExit = resolve; }
  );
  return {
    exited,
    exit(value = Object.freeze({ code: 1, signal: null })) {
      resolveExit(value);
    },
    terminate: vi.fn(async () => {
      resolveExit(Object.freeze({ code: 0, signal: "SIGTERM" }));
    })
  };
}

function operations(probes: readonly (null | Readonly<{
  statusCode: number;
  contentType: string;
  body: string;
}>)[]): DevelopmentApiProcessOperations & Readonly<{
  startApi: ReturnType<typeof vi.fn>;
  apiChild: ReturnType<typeof child>;
}> {
  const apiChild = child();
  let index = 0;
  return {
    apiChild,
    probe: vi.fn(async () => probes[Math.min(index++, probes.length - 1)] ?? null),
    startApi: vi.fn(() => apiChild),
    delay: vi.fn(async () => undefined)
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DEV-10B production API host process", () => {
  it("starts with only explicit environment and reports ready on the exact anonymous session denial", async () => {
    const test = await fixture();
    const runtime = operations([
      null,
      null,
      { statusCode: 401, contentType: "application/json; charset=utf-8", body: '{"error":"SESSION_REQUIRED"}' }
    ]);
    const process = await startDevelopmentApiProcess({
      repositoryRoot: test.root,
      commandEnvironment: Object.freeze({ PATH: "/usr/bin", HOME: "/private/home" }),
      operations: runtime
    });

    expect(process.receipt).toEqual({ host: "127.0.0.1", port: 8790, auth: "DENY_DEFAULT" });
    expect(runtime.startApi).toHaveBeenCalledTimes(1);
    const [passedEnvironment] = runtime.startApi.mock.calls[0]!;
    expect(Object.keys(passedEnvironment).sort()).toEqual([
      ...DEVELOPMENT_API_ENVIRONMENT_KEYS,
      "HOME",
      "PATH"
    ].sort());
    expect(passedEnvironment).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    await process.stop();
    expect(runtime.apiChild.terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects occupied or wrong listeners without adopting or replacing them", async () => {
    const test = await fixture();
    for (const response of [
      { statusCode: 401, contentType: "application/json", body: '{"error":"SESSION_REQUIRED"}' },
      { statusCode: 200, contentType: "application/json", body: '{"ready":true}' }
    ]) {
      const runtime = operations([response]);
      await expect(startDevelopmentApiProcess({
        repositoryRoot: test.root,
        commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
        operations: runtime
      })).rejects.toThrow("DEV_API_PROCESS_PORT_OCCUPIED");
      expect(runtime.startApi).not.toHaveBeenCalled();
    }
  });

  it("rejects unsafe or aliased environment custody before process start", async () => {
    const unsafe = await fixture();
    await chmod(unsafe.envPath, 0o644);
    const unsafeRuntime = operations([null]);
    await expect(startDevelopmentApiProcess({
      repositoryRoot: unsafe.root,
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: unsafeRuntime
    })).rejects.toThrow("DEV_API_PROCESS_CUSTODY_INVALID");
    expect(unsafeRuntime.startApi).not.toHaveBeenCalled();

    const aliased = await fixture();
    await link(aliased.envPath, join(aliased.root, ".local", "dev-auth", "api-copy.env"));
    const aliasRuntime = operations([null]);
    await expect(startDevelopmentApiProcess({
      repositoryRoot: aliased.root,
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: aliasRuntime
    })).rejects.toThrow("DEV_API_PROCESS_CUSTODY_INVALID");
    expect(aliasRuntime.startApi).not.toHaveBeenCalled();
  });

  it("terminates only its child on wrong readiness or timeout", async () => {
    const test = await fixture();
    for (const response of [
      { statusCode: 401, contentType: "application/json", body: '{"error":"WRONG_SERVICE"}' },
      { statusCode: 200, contentType: "text/html", body: "not the API" }
    ]) {
      const wrong = operations([null, response]);
      await expect(startDevelopmentApiProcess({
        repositoryRoot: test.root,
        commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
        operations: wrong
      })).rejects.toThrow("DEV_API_PROCESS_READINESS_INVALID");
      expect(wrong.apiChild.terminate).toHaveBeenCalledTimes(1);
    }

    const timeout = operations([null]);
    await expect(startDevelopmentApiProcess({
      repositoryRoot: test.root,
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: timeout,
      maximumProbeAttempts: 2
    })).rejects.toThrow("DEV_API_PROCESS_READINESS_TIMEOUT");
    expect(timeout.apiChild.terminate).toHaveBeenCalledTimes(1);
  });

  it("reports a child exit before readiness and does not adopt a successor listener", async () => {
    const test = await fixture();
    const runtime = operations([null, null]);
    runtime.startApi.mockImplementationOnce(() => {
      runtime.apiChild.exit();
      return runtime.apiChild;
    });
    await expect(startDevelopmentApiProcess({
      repositoryRoot: test.root,
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: runtime
    })).rejects.toThrow("DEV_API_PROCESS_EXITED");
    expect(runtime.startApi).toHaveBeenCalledTimes(1);
  });

  it("preserves an asynchronous spawn failure while still invoking bounded cleanup", async () => {
    const test = await fixture();
    const runtime = operations([null, null]);
    const failedTerminate = vi.fn(async () => undefined);
    runtime.startApi.mockImplementationOnce(() => ({
      exited: Promise.reject(new Error("spawn failed with secret argv")),
      terminate: failedTerminate
    }));
    await expect(startDevelopmentApiProcess({
      repositoryRoot: test.root,
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: runtime
    })).rejects.toThrow("spawn failed with secret argv");
    expect(failedTerminate).toHaveBeenCalledTimes(1);
  });

  it("exposes one non-printing API entrypoint and delegates full-stack ownership to the supervisor", async () => {
    const [packageSource, cli, implementation] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/dev-api-process-cli.ts", "utf8"),
      readFile("apps/runner/src/dev-api-process.ts", "utf8")
    ]);
    expect(JSON.parse(packageSource).scripts["dev:auth:api"])
      .toBe("tsx apps/runner/src/dev-api-process-cli.ts");
    expect(implementation).toContain('"apps/api/src/main.ts"');
    expect(implementation).toContain('"/v1/session"');
    expect(implementation).not.toContain("process.env");
    expect(cli).toContain("DEV_AUTH_API_READY=127.0.0.1:8790:DENY_DEFAULT");
    expect(cli).not.toMatch(/HATCHET_CLIENT_TOKEN|DATABASE_URL|api\.env/iu);
    expect(JSON.parse(packageSource).scripts["dev:auth:up"])
      .toBe("tsx apps/runner/src/dev-auth-stack-cli.ts");
  });
});
