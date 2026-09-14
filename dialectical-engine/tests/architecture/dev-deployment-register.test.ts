import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DEV-05 development deployment register source contract", () => {
  it("publishes one admin-only dev command without acceptance-seeder coupling", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const cli = await readFile("apps/runner/src/dev-deployment-register-cli.ts", "utf8");
    const source = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    expect(packageJson.scripts?.["dev:auth:seed-register"])
      .toBe("tsx apps/runner/src/dev-deployment-register-cli.ts");
    expect(cli).toContain("loadMigrationEnvironment()");
    expect(cli).toContain("loadDevelopmentProviderPanelFromEnvironment(loadDevelopmentCommandEnvironment(), loadModelConfigConfiguredProviders(process.cwd()))");
    expect(cli).toContain("seedDevelopmentDeploymentRegister({");
    expect(cli).toContain("repositoryRoot: process.cwd()");
    expect(cli).toContain("DEVELOPMENT_DEPLOYMENT_REGISTER_RECEIPT_STDOUT_PREFIX");
    expect(cli).toContain("serializeDevelopmentDeploymentRegisterReceipt(receipt)");
    expect(source).toContain("DEV_DEPLOYMENT_REGISTER_ADMIN_REQUIRED");
    expect(source).not.toMatch(/acceptance\/|seedAcceptanceRegister/);
  });

  it("defines the exact five additional API boot rows and delegates the sealed ceremony to the closed port", async () => {
    const source = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    for (const rowKey of [
      "configuredProviderSet",
      "panelDiscoveryPolicy",
      "riskTier",
      "acceptanceOrganCostBounds",
      "runDeathPolicy"
    ]) expect(source).toContain(`rowKey: "${rowKey}"`);
    expect(source).toContain("AUTH_POLICY_REGISTER_ROWS");
    expect(source).toContain("MFA_POLICY_REGISTER_ROW");
    expect(source).toContain("SESSION_POLICY_REGISTER_ROW");
    expect(source).toContain("RECOVERY_POLICY_REGISTER_ROW");
    expect(source).toContain("PRODUCT_ROLE_POLICY_REGISTER_ROW");
    expect(source).toContain("createPostgresRegisterPublicationPort(input.adminPool).importHistorical");
    expect(source).toContain("buildDevelopmentDeploymentRegisterPublicationRows");
    expect(source).not.toMatch(/INSERT\s+INTO\s+register[.]register_(?:row|version)/iu);
    expect(source).not.toContain('await client.query("BEGIN")');
  });

  it("publishes one canonical receipt only after the closed port resolves and verifies custody", async () => {
    const source = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    const port = source.indexOf("await createPostgresRegisterPublicationPort(input.adminPool).importHistorical");
    const receipt = source.indexOf("createDevelopmentDeploymentRegisterMachineReceipt", port);
    const custody = source.indexOf("await writeDevelopmentDeploymentRegisterReceipt", receipt);
    expect(port).toBeGreaterThan(-1);
    expect(receipt).toBeGreaterThan(port);
    expect(custody).toBeGreaterThan(receipt);
    expect(source).toContain("O_NOFOLLOW");
    expect(source).toContain("metadata.nlink !== 1");
    expect(source).toContain("directory.sync()");
  });
});
