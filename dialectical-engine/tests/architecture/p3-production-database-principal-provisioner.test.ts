import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const MANIFEST_PATH =
  "docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json";

describe("P3-02 production database principal provisioner", () => {
  it("exposes one admin-only stdin command that consumes the governed manifest", async () => {
    const [packageSource, cliSource, provisionerSource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/production-database-principals-cli.ts", "utf8"),
      readFile("apps/runner/src/production-database-principals.ts", "utf8")
    ]);
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["db:provision-principals"])
      .toBe("tsx apps/runner/src/production-database-principals-cli.ts");
    expect(cliSource).toContain("MIGRATION_DATABASE_URL");
    expect(cliSource).toContain("process.stdin");
    expect(cliSource).toContain(MANIFEST_PATH);
    expect(cliSource).toContain("PRODUCTION_DATABASE_PRINCIPALS_READY");
    expect(cliSource).not.toMatch(/console\.log\([^)]*(password|databaseUrl|credential)/iu);
    expect(provisionerSource).toContain("debateai:production-database-principals:v1");
    expect(provisionerSource).toContain("PRODUCTION_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
    expect(provisionerSource).toContain("PRODUCTION_DATABASE_PRINCIPAL_DRIFT");
    expect(provisionerSource).toContain("decodeURIComponent(url.password)");
    expect(provisionerSource).toContain("FROM pg_catalog.pg_authid AS target");
    expect(provisionerSource).toContain("pg_catalog.pg_db_role_setting");
    expect(provisionerSource).toContain("IN DATABASE ${quoteIdentifier(databaseName)} RESET ALL");
    expect(provisionerSource).not.toContain("DEVELOPMENT_DATABASE_PRINCIPALS");
  });

  it("binds the evaluator development connection to an isolated capability principal", async () => {
    const [manifestSource, developmentSource, environmentSource] = await Promise.all([
      readFile(MANIFEST_PATH, "utf8"),
      readFile("apps/runner/src/dev-database-principals.ts", "utf8"),
      readFile("apps/runner/src/dev-api-environment.ts", "utf8")
    ]);
    const manifest = JSON.parse(manifestSource) as {
      unboundConnectionPurposes: unknown[];
      developmentOnlyPrincipalBindings: Array<{
        roleName: string;
        capabilityRole: string;
        environmentKey: string;
      }>;
      provisioner: {
        command: string;
        input: string;
        runbook: string;
        managedPrincipalIds: string[];
      };
    };

    expect(manifest.unboundConnectionPurposes).toEqual([]);
    expect(manifest.developmentOnlyPrincipalBindings).toEqual([expect.objectContaining({
      roleName: "debateai_dev_evaluator_api",
      capabilityRole: "debateai_evaluator_api",
      environmentKey: "EVALUATOR_DEV_MENU_DATABASE_URL"
    })]);
    expect(manifest.provisioner).toMatchObject({
      command: "pnpm db:provision-principals",
      input: "STDIN_EXACT_JSON",
      runbook: "docs/missions/2026-08-17-accounts-privacy-security/P3-02-production-database-principal-provisioning.md"
    });
    expect(manifest.provisioner.managedPrincipalIds).toHaveLength(16);
    expect(new Set(manifest.provisioner.managedPrincipalIds).size).toBe(16);
    expect(developmentSource).toContain('roleName: "debateai_dev_evaluator_api"');
    expect(developmentSource).toContain('capabilityRole: "debateai_evaluator_api"');
    expect(developmentSource).toContain('environmentKey: "EVALUATOR_DEV_MENU_DATABASE_URL"');
    expect(environmentSource).toContain('"EVALUATOR_DEV_MENU_DATABASE_URL"');
  });
});
