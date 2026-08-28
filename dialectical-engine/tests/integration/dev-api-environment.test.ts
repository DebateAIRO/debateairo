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
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "../../apps/runner/src/dev-database-principals.js";
import { loadApiEnvironment } from "../../packages/register/src/runtime-environment.js";
import {
  DEVELOPMENT_API_ENVIRONMENT_KEYS,
  assembleDevelopmentApiEnvironment
} from "../../apps/runner/src/dev-api-environment.js";

const roots: string[] = [];

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
  return {
    repositoryRoot,
    custodyRoot,
    databaseCredentialFilePath,
    hatchetCredentialFilePath,
    outputFilePath: join(custodyRoot, "api.env")
  };
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
    const receipt = await assembleDevelopmentApiEnvironment({ repositoryRoot: test.repositoryRoot });
    expect(receipt).toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
    expect(JSON.stringify(receipt)).not.toMatch(/password|token|postgresql|11111111/i);

    const metadata = await lstat(test.outputFilePath);
    expect(metadata.isFile()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.nlink).toBe(1);
    expect(metadata.mode & 0o777).toBe(0o600);
    const environment = parseEnvironment(await readFile(test.outputFilePath, "utf8"));
    expect([...environment.keys()]).toEqual(DEVELOPMENT_API_ENVIRONMENT_KEYS);
    expect(environment.get("DATABASE_URL")).toContain("debateai_dev_runtime");
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
    expect(environment.get("CONTENT_ENCRYPTION_ENABLED")).toBe("true");
    expect(environment.get("PUBLICATION_ENABLED")).toBe("true");
    expect(environment.get("PUBLICATION_CLEANUP_DATABASE_URL"))
      .toContain("debateai_dev_publication_cleanup");
    expect(environment.get("EVALUATOR_DEV_MENU_DATABASE_URL"))
      .toContain("debateai_dev_evaluator_api");
    expect(environment.get("EVALUATOR_DEV_MENU_DATABASE_URL"))
      .not.toBe(environment.get("DATABASE_URL"));
    expect(environment.get("EVALUATOR_DEV_MENU_ENABLED")).toBe("false");
    expect(JSON.parse(environment.get("PROVIDER_DISCOVERY_TARGETS_JSON")!)).toEqual([{
      provider_ref: "development:local-vllm",
      base_url: "http://127.0.0.1:8791/v1",
      model: "qa-deterministic-v1"
    }]);
    expect(environment.get("PROVIDER_PROBE_TIMEOUT_MS")).toBe("5000");
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
      assembleDevelopmentApiEnvironment({ repositoryRoot: test.repositoryRoot })
    ));
    expect(concurrent.filter(({ reused }) => !reused)).toHaveLength(1);
    expect(concurrent.filter(({ reused }) => reused)).toHaveLength(3);
    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: test.repositoryRoot }))
      .resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: true });
    const source = await readFile(test.outputFilePath, "utf8");
    await writeFile(test.outputFilePath, source.replace("API_PORT=8790", "API_PORT=8791"), {
      mode: 0o600
    });
    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: test.repositoryRoot }))
      .rejects.toThrow("DEV_API_ENVIRONMENT_DRIFT");
    expect(await readFile(test.outputFilePath, "utf8")).toContain("API_PORT=8791");
  });

  it("atomically upgrades the exact publication-disabled environment", async () => {
    const test = await fixture();
    await assembleDevelopmentApiEnvironment({ repositoryRoot: test.repositoryRoot });
    const current = await readFile(test.outputFilePath, "utf8");
    const legacy = current
      .replace("PUBLICATION_ENABLED=true\n", "PUBLICATION_ENABLED=false\n")
      .split("\n")
      .filter((row) => !row.startsWith("CORPUS_KEK_PATH=")
        && !row.startsWith("PUBLICATION_KEY_STORE_PATH=")
        && !row.startsWith("PUBLICATION_CLEANUP_DATABASE_URL="))
      .join("\n");
    await writeFile(test.outputFilePath, legacy, { mode: 0o600 });

    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: test.repositoryRoot }))
      .resolves.toEqual({ keyCount: DEVELOPMENT_API_ENVIRONMENT_KEYS.length, reused: false });
    const upgraded = await readFile(test.outputFilePath, "utf8");
    expect(upgraded).toContain("REGISTER_VERSION=3\n");
    expect(upgraded).toContain("PUBLICATION_ENABLED=true\n");
    expect(upgraded).toContain("PROVIDER_DISCOVERY_TARGETS_JSON=");
    expect(upgraded).toContain("PROVIDER_PROBE_TIMEOUT_MS=5000\n");
  });

  it("rejects unsafe custody, malformed tokens, and aliased database principals", async () => {
    const unsafe = await fixture();
    await chmod(unsafe.hatchetCredentialFilePath, 0o644);
    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: unsafe.repositoryRoot }))
      .rejects.toThrow("DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID");

    const hardLinked = await fixture();
    await link(hardLinked.hatchetCredentialFilePath, join(hardLinked.custodyRoot, "hatchet-copy.env"));
    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: hardLinked.repositoryRoot }))
      .rejects.toThrow("DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID");

    const malformed = await fixture();
    await writeFile(malformed.hatchetCredentialFilePath, "HATCHET_CLIENT_TOKEN=not-a-jwt\n", {
      mode: 0o600
    });
    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: malformed.repositoryRoot }))
      .rejects.toThrow("DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID");

    const wrongTenant = await fixture();
    await writeFile(
      wrongTenant.hatchetCredentialFilePath,
      `HATCHET_CLIENT_TOKEN=${testToken("caller-chosen-tenant")}\n`,
      { mode: 0o600 }
    );
    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: wrongTenant.repositoryRoot }))
      .rejects.toThrow("DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID");

    const extraHatchetKey = await fixture();
    await writeFile(
      extraHatchetKey.hatchetCredentialFilePath,
      `HATCHET_CLIENT_TOKEN=${testToken()}\nHATCHET_TENANT_ID=caller-value\n`,
      { mode: 0o600 }
    );
    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: extraHatchetKey.repositoryRoot }))
      .rejects.toThrow("DEV_API_ENVIRONMENT_CREDENTIAL_FILE_INVALID");

    const aliased = await fixture();
    const credentialSource = await readFile(aliased.databaseCredentialFilePath, "utf8");
    await writeFile(
      aliased.databaseCredentialFilePath,
      credentialSource.replaceAll("debateai_dev_liveness", "debateai_dev_runtime"),
      { mode: 0o600 }
    );
    await expect(assembleDevelopmentApiEnvironment({ repositoryRoot: aliased.repositoryRoot }))
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
      REGISTER_VERSION: "3",
      BATTERY_VERSION: "dev-auth-v1",
      SETTLEMENT_WATCH_HANDLE: "dev-auth:settlement-watch",
      HATCHET_WORKFLOW_NAME: "debateai-dev"
    });
  });
});
