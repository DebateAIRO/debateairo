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
    expect(cli).toContain("seedDevelopmentDeploymentRegister({ adminPool: pool })");
    expect(cli).toContain("DEV_DEPLOYMENT_REGISTER_READY=");
    expect(source).toContain("DEV_DEPLOYMENT_REGISTER_ADMIN_REQUIRED");
    expect(source).not.toMatch(/acceptance\/|seedAcceptanceRegister/);
  });

  it("defines the exact five additional API boot rows and fail-closed sealed ceremony", async () => {
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
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("DEV_DEPLOYMENT_REGISTER_DRIFT");
    expect(source).toContain('await client.query("BEGIN")');
    expect(source).toContain('await client.query("COMMIT")');
    expect(source).toContain('await client.query("ROLLBACK")');
  });
});
