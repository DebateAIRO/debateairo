import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "../../apps/runner/src/dev-database-principals.js";
import {
  assembleDevelopmentApiEnvironment,
  type DevelopmentApiEnvironmentReceipt
} from "../../apps/runner/src/dev-api-environment.js";
import {
  createDevelopmentDeploymentRegisterMachineReceipt,
  readDevelopmentDeploymentRegisterReceipt,
  writeDevelopmentDeploymentRegisterReceipt
} from "../../apps/runner/src/dev-deployment-register.js";
import { parseRegisterVersionText } from "../../packages/register/src/index.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "./developmentProviderPanel.js";

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

export async function createDevApiEnvironmentAssemblyFixture(): Promise<Readonly<{
  repositoryRoot: string;
  custodyRoot: string;
  outputFilePath: string;
}>> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-s02-dev-api-env-"));
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
    outputFilePath: join(custodyRoot, "api.env")
  };
}

export async function assembleDevApiEnvironmentFixture(
  repositoryRoot: string
): Promise<DevelopmentApiEnvironmentReceipt> {
  return assembleDevelopmentApiEnvironment({
    repositoryRoot,
    providerPanel: TEST_DEVELOPMENT_PROVIDER_PANEL,
    registerReceipt: await readDevelopmentDeploymentRegisterReceipt(repositoryRoot),
    supportModelTarget: TEST_SUPPORT_MODEL_TARGET
  });
}

