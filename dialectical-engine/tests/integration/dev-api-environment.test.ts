import { DEVELOPMENT_REGISTER_VERSION } from "../../apps/runner/src/dev-deployment-register.js";
import { Buffer } from "node:buffer";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadModelConfig } from "@debateai/model-config";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "../../apps/runner/src/dev-database-principals.js";
import { loadApiEnvironment } from "../../packages/register/src/runtime-environment.js";
import {
  DEVELOPMENT_API_ENVIRONMENT_KEYS,
  assembleDevelopmentApiEnvironment
} from "../../apps/runner/src/dev-api-environment.js";
import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
  developmentProviderSlots
} from "../../apps/runner/src/dev-provider-panel.js";
import {
  TEST_DEVELOPMENT_PROVIDER_DOCUMENT,
  TEST_DEVELOPMENT_PROVIDER_PANEL
} from "../support/developmentProviderPanel.js";
import {
  createDevelopmentDeploymentRegisterMachineReceipt,
  readDevelopmentDeploymentRegisterReceipt,
  writeDevelopmentDeploymentRegisterReceipt
} from "../../apps/runner/src/dev-deployment-register.js";
import { parseRegisterVersionText } from "../../packages/register/src/index.js";

const roots: string[] = [];
const TEST_SUPPORT_MODEL_TARGET = JSON.stringify({
  provider_ref: "development:hermes-glm-5.3-flash",
  base_url: "http://127.0.0.1:8794/v1",
  model: "z-ai/glm-5.3-flash",
  authorization_header: "Bearer support-test"
});

function testToken(tenantId = "11111111-1111-4111-8111-111111111111"): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "EdDSA", typ: "JWT" })}.${encode({
    sub: tenantId,
    server_url: "http://localhost:8888",
    grpc_broadcast_address: "localhost:7077"
  })}.test-signature`;
}

async function fixture() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-dev-api-env-"));
  roots.push(repositoryRoot);
  const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
  await mkdir(join(custodyRoot, "secrets"), { recursive: true, mode: 0o700 });
  await mkdir(join(custodyRoot, "audit-keys"), { mode: 0o700 });
  await mkdir(join(custodyRoot, "user-deks"), { mode: 0o700 });
  await mkdir(join(custodyRoot, "publication-keys"), { mode: 0o700 });
  await mkdir(join(custodyRoot, "mail"), { mode: 0o700 });
  await Promise.all([
    writeFile(join(custodyRoot, "secrets", "kek.bin"), Buffer.alloc(32, 1), { mode: 0o600 }),
    writeFile(join(custodyRoot, "secrets", "support-kek.bin"), Buffer.alloc(32, 5), { mode: 0o600 }),
    writeFile(join(custodyRoot, "secrets", "corpus-kek.bin"), Buffer.alloc(32, 4), { mode: 0o600 }),
    writeFile(join(custodyRoot, "secrets", "blind-index-key.bin"), Buffer.alloc(32, 2), { mode: 0o600 }),
    writeFile(join(custodyRoot, "secrets", "audit-source-ip-salt.bin"), Buffer.alloc(32, 3), { mode: 0o600 })
  ]);
  const databaseCredentials = DEVELOPMENT_DATABASE_PRINCIPALS.map((principal, index) =>
    `${principal.environmentKey}=postgresql://${principal.roleName}:dev-password-${index}-abcdefghijklmnopqrstuvwxyz@127.0.0.1:55432/debateai`
  ).join("\n") + "\n";
  const databaseCredentialFilePath = join(custodyRoot, "database-principals.env");
  const hatchetCredentialFilePath = join(custodyRoot, "hatchet.env");
  await writeFile(databaseCredentialFilePath, databaseCredentials, { mode: 0o600 });
  await writeFile(
    hatchetCredentialFilePath,
    `HATCHET_CLIENT_TOKEN=${testToken()}\n`,
    { mode: 0o600 }
  );
  await writeDevelopmentDeploymentRegisterReceipt(
    repositoryRoot,
    createDevelopmentDeploymentRegisterMachineReceipt({
      registerVersion: parseRegisterVersionText("424242"),
      rowCount: 32,
      snapshotSha256: "a".repeat(64)
    })
  );
  return {
    repositoryRoot,
    custodyRoot,
    databaseCredentialFilePath,
    hatchetCredentialFilePath,
    outputFilePath: join(custodyRoot, "api.env")
  };
}

async function assemble(repositoryRoot: string) {
  return assembleDevelopmentApiEnvironment({
    repositoryRoot,
    providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
    registerReceipt: await readDevelopmentDeploymentRegisterReceipt(repositoryRoot),
    supportModelTarget: TEST_SUPPORT_MODEL_TARGET
  });
}

function parseEnvironment(source: string): Map<string, string> {
  return new Map(source.trimEnd().split("\n").map((row) => {
    const separator = row.indexOf("=");
    return [row.slice(0, separator), row.slice(separator + 1)];
  }));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DEV-09 private local API environment", () => {
  it("atomically assembles the exact environment without returning credential values", async () => {
    const test = await fixture();
    const masterCredentials = parseEnvironment(
      await readFile(test.databaseCredentialFilePath, "utf8")
    );
    const supportOperatorUrl = masterCredentials.get("SUPPORT_CONFIG_OPERATOR_DATABASE_URL")!;
    const supportUrl = masterCredentials.get("SUPPORT_DATABASE_URL")!;
    const receipt = await assemble(test.repositoryRoot);
    expect(receipt).toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
    expect(JSON.stringify(receipt)).not.toMatch(/password|token|postgresql|11111111/i);

    const metadata = await lstat(test.outputFilePath);
    expect(metadata.isFile()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.nlink).toBe(1);
    expect(metadata.mode & 0o777).toBe(0o600);
    const environment = parseEnvironment(await readFile(test.outputFilePath, "utf8"));
    expect([...environment.keys()]).toEqual(DEVELOPMENT_API_ENVIRONMENT_KEYS);
    expect(DEVELOPMENT_API_ENVIRONMENT_KEYS).not.toContain("SUPPORT_CONFIG_OPERATOR_DATABASE_URL");
    expect(JSON.stringify(receipt)).not.toContain("SUPPORT_CONFIG_OPERATOR_DATABASE_URL");
    expect(JSON.stringify(receipt)).not.toContain(supportOperatorUrl);
    expect(await readFile(test.outputFilePath, "utf8"))
      .not.toContain("SUPPORT_CONFIG_OPERATOR_DATABASE_URL");
    expect(await readFile(test.outputFilePath, "utf8")).not.toContain(supportOperatorUrl);
    expect(environment.get("DATABASE_URL")).toContain("debateai_dev_runtime");
    expect(environment.get("SUPPORT_KEK_PATH"))
      .toBe(join(test.custodyRoot, "secrets", "support-kek.bin"));
    expect(new Set([
      environment.get("SUPPORT_KEK_PATH"),
      environment.get("KEK_PATH"),
      environment.get("CORPUS_KEK_PATH"),
      environment.get("BLIND_INDEX_KEY_PATH"),
      environment.get("AUDIT_SOURCE_IP_SALT_PATH")
    ])).toHaveLength(5);
    expect(environment.get("SUPPORT_DATABASE_URL")).toContain("debateai_dev_support");
    expect(environment.get("SUPPORT_DATABASE_URL")).toBe(supportUrl);
    expect(environment.get("SUPPORT_DATABASE_URL")).not.toBe(environment.get("DATABASE_URL"));
    expect(environment.get("CONTENT_PROVISION_DATABASE_URL"))
      .toContain("debateai_dev_content_provision");
    expect(environment.get("AUTHORIZATION_DATABASE_URL"))
      .toContain("debateai_dev_authorization");
    expect(environment.get("AUTHORIZATION_DATABASE_URL"))
      .not.toBe(environment.get("DATABASE_URL"));
    expect(environment.get("ERASURE_DATABASE_URL")).toContain("debateai_dev_erasure");
    expect(environment.get("HATCHET_TENANT_ID")).toBe("11111111-1111-4111-8111-111111111111");
    expect(environment.get("HATCHET_CLIENT_TOKEN")).toBe(testToken());
    expect(environment.get("PUBLIC_APP_URL")).toBe("https://localhost:3000");
    expect(environment.get("REGISTER_VERSION")).toBe("424242");
    expect(environment.get("REGISTER_DEPLOYMENT_RECEIPT_SHA256"))
      .toBe((await readDevelopmentDeploymentRegisterReceipt(test.repositoryRoot)).receiptSha256);
    expect(environment.get("REGISTER_DEPLOYMENT_RECEIPT_FILE"))
      .toBe(join(test.custodyRoot, "deployment-register-receipt.v1.json"));
    expect(environment.get("CONTENT_ENCRYPTION_ENABLED")).toBe("true");
    expect(environment.get("PUBLICATION_ENABLED")).toBe("true");
    expect(environment.get("PUBLICATION_CLEANUP_DATABASE_URL"))
      .toContain("debateai_dev_publication_cleanup");
    expect(environment.get("EVALUATOR_DEV_MENU_DATABASE_URL"))
      .toContain("debateai_dev_evaluator_api");
    expect(environment.get("EVALUATOR_DEV_MENU_DATABASE_URL"))
      .not.toBe(environment.get("DATABASE_URL"));
    expect(environment.get("EVALUATOR_DATABASE_URL"))
      .toContain("debateai_dev_evaluator_worker");
    expect(environment.get("EVALUATOR_DATABASE_URL"))
      .not.toBe(environment.get("DATABASE_URL"));
    expect(environment.get("EVALUATOR_DEV_MENU_ENABLED")).toBe("true");
    expect(JSON.parse(environment.get("PROVIDER_DISCOVERY_TARGETS_JSON")!)).toEqual(
      TEST_DEVELOPMENT_PROVIDER_DOCUMENT.providers.map((provider) => ({
        provider_ref: provider.provider_ref,
        base_url: provider.base_url,
        model: provider.model,
        ...("authorization_header" in provider
          ? { authorization_header: provider.authorization_header } : {})
      }))
    );
    expect(JSON.parse(environment.get("SUPPORT_MODEL_TARGET_JSON")!)).toEqual({
      provider_ref: "development:hermes-glm-5.3-flash",
      base_url: "http://127.0.0.1:8794/v1",
      model: "z-ai/glm-5.3-flash",
      authorization_header: "Bearer support-test"
    });
    expect(environment.get("PROVIDER_PROBE_TIMEOUT_MS")).toBe("180000");
    const prior = new Map<string, string | undefined>();
    for (const [key, value] of environment) {
      prior.set(key, process.env[key]);
      process.env[key] = value;
    }
    try {
      expect(loadApiEnvironment()).toMatchObject({
        PUBLIC_APP_URL: "https://localhost:3000",
        API_HOST: "127.0.0.1",
        API_PORT: 8790,
        HATCHET_TENANT_ID: "11111111-1111-4111-8111-111111111111"
      });
      const authorizationUrl = process.env.AUTHORIZATION_DATABASE_URL;
      delete process.env.AUTHORIZATION_DATABASE_URL;
      expect(() => loadApiEnvironment()).toThrow("AUTHORIZATION_DATABASE_URL_REQUIRED");
      process.env.AUTHORIZATION_DATABASE_URL = process.env.DATABASE_URL;
      expect(() => loadApiEnvironment()).toThrow("AUTHORIZATION_DATABASE_URL_MUST_BE_SEPARATE");
      process.env.AUTHORIZATION_DATABASE_URL = authorizationUrl;
    } finally {
      for (const [key, value] of prior) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("reuses only byte-exact output and refuses drift instead of overwriting it", async () => {
    const test = await fixture();
    const concurrent = await Promise.all(Array.from({ length: 4 }, () =>
      assemble(test.repositoryRoot)
    ));
    expect(concurrent.filter(({ reused }) => !reused)).toHaveLength(1);
    expect(concurrent.filter(({ reused }) => reused)).toHaveLength(3);
    await expect(assemble(test.repositoryRoot))
      .resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: true });
    const source = await readFile(test.outputFilePath, "utf8");
    await writeFile(test.outputFilePath, source.replace("API_PORT=8790", "API_PORT=8791"), {
      mode: 0o600
    });
    await expect(assemble(test.repositoryRoot))
      .rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT");
    expect(await readFile(test.outputFilePath, "utf8")).toContain("API_PORT=8791");
  });

  it("refreshes only the handshake-derived relay identities and credentials", async () => {
    const test = await fixture();
    await assemble(test.repositoryRoot);
    const before = parseEnvironment(await readFile(test.outputFilePath, "utf8"));
    const refreshedPanel = buildDevelopmentProviderPanel([
      {
        providerRef: "development:codex-premium-cli",
        baseUrl: "http://127.0.0.1:8795/v1",
        model: "codex-premium-live-model-refreshed",
        authorizationHeader: "Bearer codex-premium-relay-refreshed"
      },
      {
        providerRef: "development:claude-premium-cli",
        baseUrl: "http://127.0.0.1:8796/v1",
        model: "claude-premium-live-model-refreshed",
        authorizationHeader: "Bearer claude-premium-relay-refreshed"
      },
      {
        providerRef: "development:grok-cli",
        baseUrl: "http://127.0.0.1:8793/v1",
        model: "grok-live-model-refreshed",
        authorizationHeader: "Bearer grok-relay-refreshed"
      },
      {
        providerRef: "development:openai-free-api",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.6-luna",
        authorizationHeader: "Bearer test-openai-api"
      },
      {
        providerRef: "development:zai-free-api",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        model: "glm-5.3-flash",
        authorizationHeader: "Bearer test-zai-api"
      }
    ], TEST_DEVELOPMENT_PROVIDER_PANEL.configuredProviders);

    await expect(assembleDevelopmentApiEnvironment({
      repositoryRoot: test.repositoryRoot,
      providerPanel: refreshedPanel,
      registerReceipt: await readDevelopmentDeploymentRegisterReceipt(test.repositoryRoot),
      supportModelTarget: TEST_SUPPORT_MODEL_TARGET
    })).resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
    const after = parseEnvironment(await readFile(test.outputFilePath, "utf8"));
    for (const key of DEVELOPMENT_API_ENVIRONMENT_KEYS) {
      if (key === "PROVIDER_DISCOVERY_TARGETS_JSON") continue;
      expect(after.get(key), key).toBe(before.get(key));
    }
    expect(after.get("PROVIDER_DISCOVERY_TARGETS_JSON")).toBe(refreshedPanel.targetsJson);

    const mismatchBefore = await readFile(test.outputFilePath, "utf8");
    const refreshedRows = JSON.parse(refreshedPanel.targetsJson) as
      readonly Readonly<Record<string, unknown>>[];
    const refreshedTargetsJson = JSON.stringify(refreshedRows.map((row, index) => index === 0
      ? { ...row, model: "different-model" }
      : row));
    const mismatchedConfiguredSet = Object.freeze({
      ...refreshedPanel,
      configuredProviders: Object.freeze([]),
      targetsJson: refreshedTargetsJson
    });
    await expect(assembleDevelopmentApiEnvironment({
      repositoryRoot: test.repositoryRoot,
      providerPanel: mismatchedConfiguredSet,
      registerReceipt: await readDevelopmentDeploymentRegisterReceipt(test.repositoryRoot),
      supportModelTarget: TEST_SUPPORT_MODEL_TARGET
    })).rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT");
    expect(await readFile(test.outputFilePath, "utf8")).toBe(mismatchBefore);

    const apiRefresh = await fixture();
    const config = loadModelConfig(process.cwd());
    const slots = developmentProviderSlots(config);
    const configuredProviders = slots.map(({ providerRef, adapterKind, maker }) => ({
      providerRef, adapterKind, maker
    }));
    const panel = (apiHealthy: boolean) => buildDevelopmentProviderPanel(slots.map((slot) => ({
      providerRef: slot.providerRef,
      baseUrl: slot.transport === "cli"
        ? `http://127.0.0.1:${slot.port}/v1`
        : slot.baseUrl!,
      model: slot.transport === "api" && !apiHealthy
        ? DEVELOPMENT_UNAVAILABLE_CLI_MODEL
        : slot.model,
      ...(slot.transport === "cli" || apiHealthy
        ? { authorizationHeader: slot.transport === "cli" ? "test-cli-header" : "Bearer test-api-key" }
        : {})
    })), configuredProviders);
    await expect(assembleDevelopmentApiEnvironment({
      repositoryRoot: apiRefresh.repositoryRoot,
      providerPanel: panel(false),
      registerReceipt: await readDevelopmentDeploymentRegisterReceipt(apiRefresh.repositoryRoot),
      supportModelTarget: TEST_SUPPORT_MODEL_TARGET
    })).resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
    const beforeKeyArrival = parseEnvironment(await readFile(apiRefresh.outputFilePath, "utf8"));
    await expect(assembleDevelopmentApiEnvironment({
      repositoryRoot: apiRefresh.repositoryRoot,
      providerPanel: panel(true),
      registerReceipt: await readDevelopmentDeploymentRegisterReceipt(apiRefresh.repositoryRoot),
      supportModelTarget: TEST_SUPPORT_MODEL_TARGET
    })).resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
    const afterKeyArrival = parseEnvironment(await readFile(apiRefresh.outputFilePath, "utf8"));
    expect(afterKeyArrival.get("REGISTER_VERSION")).toBe(beforeKeyArrival.get("REGISTER_VERSION"));
    expect(afterKeyArrival.get("PROVIDER_DISCOVERY_TARGETS_JSON"))
      .toBe(panel(true).targetsJson);
  });

  it("rejects the removed publication-disabled fallback without overwriting it", async () => {
    const test = await fixture();
    await assemble(test.repositoryRoot);
    const current = await readFile(test.outputFilePath, "utf8");
    const legacy = current
      .replace("PUBLICATION_ENABLED=true\n", "PUBLICATION_ENABLED=false\n")
      .split("\n")
      .filter((row) => !row.startsWith("CORPUS_KEK_PATH=")
        && !row.startsWith("PUBLICATION_KEY_STORE_PATH=")
        && !row.startsWith("PUBLICATION_CLEANUP_DATABASE_URL="))
      .join("\n");
    await writeFile(test.outputFilePath, legacy, { mode: 0o600 });

    await expect(assemble(test.repositoryRoot)).rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT");
    expect(await readFile(test.outputFilePath, "utf8")).toBe(legacy);
  });

  it("atomically upgrades the exact timeout that was shorter than a real CLI probe", async () => {
    const test = await fixture();
    await assemble(test.repositoryRoot);
    const current = await readFile(test.outputFilePath, "utf8");
    await writeFile(
      test.outputFilePath,
      current.replace("PROVIDER_PROBE_TIMEOUT_MS=180000\n", "PROVIDER_PROBE_TIMEOUT_MS=5000\n"),
      { mode: 0o600 }
    );

    await expect(assemble(test.repositoryRoot))
      .resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
    expect(await readFile(test.outputFilePath, "utf8"))
      .toContain("PROVIDER_PROBE_TIMEOUT_MS=180000\n");
  });

  it("atomically adds the dedicated Support model target to the exact legacy environment",async () => {
    const test = await fixture();
    await assemble(test.repositoryRoot);
    const current = await readFile(test.outputFilePath,"utf8");
    const legacy = current.split("\n")
      .filter((row) => !row.startsWith("SUPPORT_MODEL_TARGET_JSON="))
      .join("\n");
    await writeFile(test.outputFilePath,legacy,{ mode: 0o600 });

    await expect(assemble(test.repositoryRoot))
      .resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length,reused: false });
    expect(await readFile(test.outputFilePath,"utf8"))
      .toContain(`SUPPORT_MODEL_TARGET_JSON=${TEST_SUPPORT_MODEL_TARGET}\n`);
  });

  it("rejects an earlier environment that drops a required field", async () => {
    const test = await fixture();
    await assemble(test.repositoryRoot);
    const current = await readFile(test.outputFilePath, "utf8");
    const legacy = current.split("\n")
      .filter((row) => !row.startsWith("EVALUATOR_DEV_MENU_DATABASE_URL="))
      .join("\n");
    await writeFile(test.outputFilePath, legacy, { mode: 0o600 });

    await expect(assemble(test.repositoryRoot)).rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT");
    expect(await readFile(test.outputFilePath, "utf8")).toBe(legacy);
  });

  it("rejects v4 reconstruction and removed-provider fallback", async () => {
    const test = await fixture();
    await assemble(test.repositoryRoot);
    const current = await readFile(test.outputFilePath, "utf8");
    const legacy = current
      .replace("REGISTER_VERSION=424242\n", "REGISTER_VERSION=4\n")
      .replace("development:codex-premium-cli", "development:local-vllm")
      .replace("gpt-5.6-sol", "qa-deterministic-v1");
    await writeFile(test.outputFilePath, legacy, { mode: 0o600 });

    await expect(assemble(test.repositoryRoot)).rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT");
    expect(await readFile(test.outputFilePath, "utf8")).toBe(legacy);
  });

  it("admits a published removal when the held version owns the outgoing provider set", async () => {
    const test = await fixture();
    await assemble(test.repositoryRoot);
    const current = await readFile(test.outputFilePath, "utf8");
    const outgoing = current.replace("REGISTER_VERSION=424242\n", "REGISTER_VERSION=424241\n");
    await writeFile(test.outputFilePath, outgoing, { mode: 0o600 });
    const currentProviders = TEST_DEVELOPMENT_PROVIDER_PANEL.configuredProviders;
    const removedRef = currentProviders[0]!.providerRef;
    const incomingProviders = currentProviders.filter(({ providerRef }) => providerRef !== removedRef);
    const incomingTargets = TEST_DEVELOPMENT_PROVIDER_PANEL.targets.filter(
      ({ providerRef }) => providerRef !== removedRef
    );
    const incomingPanel = buildDevelopmentProviderPanel(incomingTargets.map((target) => ({
      providerRef: target.providerRef,
      baseUrl: target.baseUrl,
      model: target.model,
      ...(target.authorizationHeader === undefined
        ? {} : { authorizationHeader: target.authorizationHeader })
    })), incomingProviders);
    const heldConfiguredProviderSets = new Map([[
      "424241",
      currentProviders.map(({ providerRef }) => providerRef)
    ]]);

    await expect(assembleDevelopmentApiEnvironment({
      repositoryRoot: test.repositoryRoot,
      providerPanel: incomingPanel,
      registerReceipt: await readDevelopmentDeploymentRegisterReceipt(test.repositoryRoot),
      supportModelTarget: TEST_SUPPORT_MODEL_TARGET,
      heldConfiguredProviderSets
    })).resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
  });

  it("rejects a removal fallback whose outgoing refs exceed the held version", async () => {
    const test = await fixture();
    await assemble(test.repositoryRoot);
    const current = await readFile(test.outputFilePath, "utf8");
    const environment = parseEnvironment(current);
    const targets = JSON.parse(environment.get("PROVIDER_DISCOVERY_TARGETS_JSON")!) as unknown[];
    const expandedTargets = JSON.stringify([...targets, {
      provider_ref: "development:local-vllm",
      base_url: "http://127.0.0.1:8789/v1",
      model: "qa-deterministic-v1",
      authorization_header: "test-local-header"
    }]);
    const outgoing = current
      .replace("REGISTER_VERSION=424242\n", "REGISTER_VERSION=424241\n")
      .replace(
        `PROVIDER_DISCOVERY_TARGETS_JSON=${environment.get("PROVIDER_DISCOVERY_TARGETS_JSON")}\n`,
        `PROVIDER_DISCOVERY_TARGETS_JSON=${expandedTargets}\n`
      );
    await writeFile(test.outputFilePath, outgoing, { mode: 0o600 });
    const currentProviders = TEST_DEVELOPMENT_PROVIDER_PANEL.configuredProviders;
    const removedRef = currentProviders[0]!.providerRef;
    const incomingProviders = currentProviders.filter(({ providerRef }) => providerRef !== removedRef);
    const incomingTargets = TEST_DEVELOPMENT_PROVIDER_PANEL.targets.filter(
      ({ providerRef }) => providerRef !== removedRef
    );
    const incomingPanel = buildDevelopmentProviderPanel(incomingTargets.map((target) => ({
      providerRef: target.providerRef,
      baseUrl: target.baseUrl,
      model: target.model,
      ...(target.authorizationHeader === undefined
        ? {} : { authorizationHeader: target.authorizationHeader })
    })), incomingProviders);

    await expect(assembleDevelopmentApiEnvironment({
      repositoryRoot: test.repositoryRoot,
      providerPanel: incomingPanel,
      registerReceipt: await readDevelopmentDeploymentRegisterReceipt(test.repositoryRoot),
      supportModelTarget: TEST_SUPPORT_MODEL_TARGET,
      heldConfiguredProviderSets: new Map([[
        "424241",
        currentProviders.map(({ providerRef }) => providerRef)
      ]])
    })).rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT");
    expect(await readFile(test.outputFilePath, "utf8")).toBe(outgoing);
  });

  it("rejects unsafe custody, malformed tokens, and aliased database principals", async () => {
    const unsafeSupportKek = await fixture();
    await chmod(join(unsafeSupportKek.custodyRoot, "secrets", "support-kek.bin"), 0o640);
    await expect(assemble(unsafeSupportKek.repositoryRoot))
      .rejects.toThrow("DEV_API_ENVIRONMENT_SECRET_CUSTODY_INVALID");

    const receiptMismatch = await fixture();
    await expect(assembleDevelopmentApiEnvironment({
      repositoryRoot: receiptMismatch.repositoryRoot,
      providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
      supportModelTarget: TEST_SUPPORT_MODEL_TARGET,
      registerReceipt: createDevelopmentDeploymentRegisterMachineReceipt({
        registerVersion: parseRegisterVersionText("424242"),
        rowCount: 32,
        snapshotSha256: "b".repeat(64)
      })
    })).rejects.toThrow("DEV_API_ENVIRONMENT_REGISTER_RECEIPT_MISMATCH");

    const unsafe = await fixture();
    await chmod(unsafe.hatchetCredentialFilePath, 0o644);
    await expect(assemble(unsafe.repositoryRoot))
      .rejects.toThrow("DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID");

    const hardLinked = await fixture();
    await link(hardLinked.hatchetCredentialFilePath, join(hardLinked.custodyRoot, "hatchet-copy.env"));
    await expect(assemble(hardLinked.repositoryRoot))
      .rejects.toThrow("DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID");

    const malformed = await fixture();
    await writeFile(malformed.hatchetCredentialFilePath, "HATCHET_CLIENT_TOKEN=not-a-jwt\n", {
      mode: 0o600
    });
    await expect(assemble(malformed.repositoryRoot))
      .rejects.toThrow("DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID");

    const wrongTenant = await fixture();
    await writeFile(
      wrongTenant.hatchetCredentialFilePath,
      `HATCHET_CLIENT_TOKEN=${testToken("caller-chosen-tenant")}\n`,
      { mode: 0o600 }
    );
    await expect(assemble(wrongTenant.repositoryRoot))
      .rejects.toThrow("DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID");

    const extraHatchetKey = await fixture();
    await writeFile(
      extraHatchetKey.hatchetCredentialFilePath,
      `HATCHET_CLIENT_TOKEN=${testToken()}\nHATCHET_TENANT_ID=caller-value\n`,
      { mode: 0o600 }
    );
    await expect(assemble(extraHatchetKey.repositoryRoot))
      .rejects.toThrow("DEV_API_ENVIRONMENT_CREDENTIAL_FILE_INVALID");

    const aliased = await fixture();
    const credentialSource = await readFile(aliased.databaseCredentialFilePath, "utf8");
    await writeFile(
      aliased.databaseCredentialFilePath,
      credentialSource.replaceAll("debateai_dev_liveness", "debateai_dev_runtime"),
      { mode: 0o600 }
    );
    await expect(assemble(aliased.repositoryRoot))
      .rejects.toThrow("DEV_API_ENVIRONMENT_DATABASE_CREDENTIAL_INVALID");
  });

  it("exposes one non-printing CLI and keeps Hatchet token minting out of scope", async () => {
    const [packageSource, cliSource, topologySource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/dev-api-environment-cli.ts", "utf8"),
      readFile(
        "docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.json",
        "utf8"
      )
    ]);
    const scripts = (JSON.parse(packageSource) as { scripts: Record<string, string> }).scripts;
    const topology = JSON.parse(topologySource) as {
      apiEnvironment: Record<string, string>;
    };
    expect(scripts["dev:auth:assemble-api-env"])
      .toBe("tsx apps/runner/src/dev-api-environment-cli.ts");
    expect(cliSource).toContain("DEV_API_ENVIRONMENT_READY");
    expect(cliSource).not.toMatch(/HATCHET_CLIENT_TOKEN|readFile|console\.log\([^)]*path/i);
    expect(topology.apiEnvironment).toMatchObject({
      STRANGER_SAMPLE_RATE: "0",
      REGISTER_VERSION: String(DEVELOPMENT_REGISTER_VERSION),
      BATTERY_VERSION: "dev-auth-v1",
      SETTLEMENT_WATCH_HANDLE: "dev-auth:settlement-watch",
      HATCHET_WORKFLOW_NAME: "debateai-dev"
    });
  });
});
