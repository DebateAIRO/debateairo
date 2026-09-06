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
    expect(cliSource).toContain("--support-config-credential-file");
    expect(cliSource).toContain(MANIFEST_PATH);
    expect(cliSource).toContain("PRODUCTION_DATABASE_PRINCIPALS_READY");
    expect(cliSource).not.toMatch(/console\.log\([^)]*(password|databaseUrl|credential)/iu);
    expect(provisionerSource).toContain("debateai:production-database-principals:v1");
    expect(provisionerSource).toContain("debateai:production-support-config-operator");
    expect(provisionerSource).toContain("pg_advisory_lock");
    expect(provisionerSource).toContain("pg_advisory_unlock");
    expect(provisionerSource).not.toContain("pg_advisory_xact_lock");
    expect(provisionerSource).toContain("PRODUCTION_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
    expect(provisionerSource).toContain("PRODUCTION_DATABASE_PRINCIPAL_DRIFT");
    expect(provisionerSource).toContain("humanCredentialExpiresAtByPrincipal");
    expect(provisionerSource).toContain("supportConfigCredentialFilePath");
    expect(provisionerSource).toContain("cleanupProductionSupportConfigOperator");
    expect(provisionerSource).toContain("pg_terminate_backend");
    expect(provisionerSource).toContain("NOLOGIN");
    expect(provisionerSource).toContain("decodeURIComponent(url.password)");
    expect(provisionerSource).toContain("FROM pg_catalog.pg_authid AS target");
    expect(provisionerSource).toContain("pg_catalog.pg_db_role_setting");
    expect(provisionerSource).toContain("pg_catalog.aclexplode");
    expect(provisionerSource).toContain("REVOKE ALL PRIVILEGES ON DATABASE");
    expect(provisionerSource).toContain("REVOKE ALL PRIVILEGES ON SCHEMA");
    expect(provisionerSource).toContain("REVOKE ALL PRIVILEGES ON SEQUENCE");
    expect(provisionerSource).toContain("pg_get_function_identity_arguments");
    expect(provisionerSource).toContain("temporaryIdentity?: FileIdentity");
    expect(provisionerSource).toContain("identityMatches(metadata, identity)");
    expect(provisionerSource).toContain("compensateFailedCredentialPublication");
    expect(provisionerSource).toContain("await restoreCredentialPublication(journal)");
    expect(provisionerSource).toContain("await syncParentDirectory(journal.parentPath)");
    expect(provisionerSource).toContain("RecoveryMarkerJournal");
    expect(provisionerSource).toContain("connectWorkClient");
    expect(provisionerSource).toContain("recoveryBackoff");
    expect(provisionerSource).toContain("directorySyncPending");
    expect(provisionerSource).toContain("assertCredentialPublicationRecovered");
    expect(provisionerSource).not.toContain("attempt < 2");
    expect(provisionerSource).toContain("IN DATABASE ${quoteIdentifier(databaseName)} RESET ALL");
    expect(provisionerSource).not.toContain("DEVELOPMENT_DATABASE_PRINCIPALS");
  });

  it("pins every fail-closed recovery terminal invariant", async () => {
    const provisionerSource = await readFile(
      "apps/runner/src/production-database-principals.ts",
      "utf8"
    );

    expect(provisionerSource).toContain(
      "state?.canLogin !== false || state.sessionCount !== 0"
    );
    expect(provisionerSource).toContain(
      "await assertSupportConfigPrincipalFailClosed(client);"
    );
    expect(provisionerSource).toContain(
      "await assertCredentialPublicationRecovered(journal);"
    );
    expect(provisionerSource.match(
      /await assertPriorCredentialTargetRestored\(journal\);/gu
    )).toHaveLength(2);
    expect(provisionerSource).toContain(
      "await lstatOrNull(journal.prior.backupPath) !== null"
    );
    expect(provisionerSource).toContain(
      "journal.publishedIdentity !== undefined\n    && await lstatOrNull(journal.targetPath) !== null"
    );
    expect(provisionerSource).toContain(
      "journal.temporaryIdentity !== undefined\n    && await lstatOrNull(journal.temporaryPath) !== null"
    );
    expect(provisionerSource).toMatch(
      /if \(journal\.directorySyncPending\) \{\s+fail\("PRODUCTION_SUPPORT_CONFIG_CREDENTIAL_COMPENSATION_INVALID"\);/u
    );
    expect(provisionerSource.match(
      /await compensateFailedCredentialPublication\(/gu
    )).toHaveLength(2);
    expect(provisionerSource.match(
      /ALTER ROLE \$\{quoteIdentifier\(SUPPORT_CONFIG_OPERATOR_ROLE\)\} NOLOGIN/gu
    )).toHaveLength(2);
    expect(provisionerSource.match(
      /WHERE usename=\$1 AND pid<>pg_backend_pid\(\)/gu
    )).toHaveLength(3);
    expect(provisionerSource.match(
      /await restoreCredentialPublication\(journal\);/gu
    )).toHaveLength(1);
    expect(provisionerSource.match(
      /await removeOwnedPath\(journal\.targetPath, journal\.publishedIdentity, journal\);/gu
    )).toHaveLength(1);
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
      input: "STDIN_EXACT_JSON_AND_PRIVATE_FILE_ARG",
      runbook: "docs/missions/2026-08-17-accounts-privacy-security/P3-02-production-database-principal-provisioning.md"
    });
    expect(manifest.provisioner.managedPrincipalIds).toHaveLength(18);
    expect(new Set(manifest.provisioner.managedPrincipalIds).size).toBe(18);
    expect(manifest.provisioner.managedPrincipalIds).toContain("api-support");
    expect(manifest.provisioner.managedPrincipalIds).toContain("support-config-operator");
    expect(developmentSource).toContain('roleName: "debateai_dev_evaluator_api"');
    expect(developmentSource).toContain('capabilityRole: "debateai_evaluator_api"');
    expect(developmentSource).toContain('environmentKey: "EVALUATOR_DEV_MENU_DATABASE_URL"');
    expect(environmentSource).toContain('"EVALUATOR_DEV_MENU_DATABASE_URL"');
  });
});
