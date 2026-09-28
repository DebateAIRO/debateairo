import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DEV-03 development database principal provisioning source contract", () => {
  it("publishes only the bounded admin command and ignores its persistent credential root", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const gitignore = await readFile(".gitignore", "utf8");
    const cli = await readFile("apps/runner/src/dev-database-principals-cli.ts", "utf8");
    expect(packageJson.scripts?.["dev:auth:provision-principals"])
      .toBe("tsx apps/runner/src/dev-database-principals-cli.ts");
    expect(gitignore.split("\n")).toContain(".local/dev-auth/");
    expect(cli).toContain("loadMigrationEnvironment()");
    expect(cli).toContain('join(resolveDevCustodyRoot(process.cwd()), "database-principals.env")');
    expect(cli).not.toContain("DEV_AUTH_DATABASE_CREDENTIALS_PATH");
    expect(cli).toContain("DEV_DATABASE_PRINCIPALS_READY=");
    expect(cli).not.toMatch(/console\.(?:log|error)\([^)]*(?:DATABASE_URL|password)/s);
  });

  /**
   * SYNC3 fix round 1. This row and the one below were ONE row whose first
   * assertion — dev's count of twelve — failed on dev itself (dev's source
   * declares eleven), so the gate matched the row by name as "known red" and
   * nothing after it ever ran: the least-privilege, file-custody and L7-F10
   * assertions here were blind, and a regression in any of them would have
   * read as the known failure. They stay in THIS row; the count has its own.
   */
  it("keeps every fixed wrapper least-privileged and file-backed", async () => {
    const source = await readFile("apps/runner/src/dev-database-principals.ts", "utf8");
    expect(source).toContain(`roleName: "debateai_dev_support",
    capabilityRole: "debateai_support",
    environmentKey: "SUPPORT_DATABASE_URL"`);
    expect(source).toContain(`roleName: "debateai_dev_support_config_operator",
    capabilityRole: "debateai_support_config_operator",
    environmentKey: "SUPPORT_CONFIG_OPERATOR_DATABASE_URL"`);
    expect(source).toContain("LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
    expect(source).toContain("SET LOCAL password_encryption='scram-sha-256'");
    expect(source).toContain("DEV_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
    expect(source).toContain("DEV_DATABASE_PRINCIPAL_DRIFT");
    expect(source).toContain("pg_advisory_xact_lock(hashtextextended('debateai:dev-database-principals',0))");
    expect(source).toContain("isExistingFileError(createError)");
    // L7-F10: the shared custody-root policy (B4 resolver) refuses a drifted
    // mode rather than narrowing it back and hiding the exposure.
    expect(source).toContain("await assertDevCustodyDirectory(credentialRoot)");
    expect(source).toContain("constants.O_NOFOLLOW");
    expect(source).toContain("metadata.nlink !== 1");
    expect(source).toContain("(metadata.mode & 0o777) !== PRIVATE_FILE_MODE");
    expect(source).toContain("(metadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE");
    expect(source).toContain("metadata.uid !== currentUid");
    expect(source).not.toContain("chmod(");
    expect(source).toContain("DEV_DATABASE_PRINCIPAL_MEMBERS_INVALID");
    expect(source).not.toMatch(/password:\s*["'][^"']+["']/);
  });

  /**
   * The count of development LOGIN wrappers, pinned: a new database login is a
   * deliberate change and must move this number in the same commit.
   *
   * b7ca2c41 ("snapshot current CP1 baseline", 2026-09-14) moved this pin to
   * twelve, adding an evaluator-worker login, together with an on evaluator
   * menu and an EVALUATOR_DATABASE_URL in the dev API and UI tests — and no
   * source for any of them. The source has declared eleven and kept the menu
   * off since 2026-08-28; 78988fc2 (2026-09-20) made the integration twin of
   * this count follow the declared list. The row was red on dev and listed
   * known-red until 2026-09-28, when the tests were brought back to the source.
   */
  it("declares exactly the eleven fixed wrappers the development stack provisions", async () => {
    const source = await readFile("apps/runner/src/dev-database-principals.ts", "utf8");
    expect(source.match(/roleName: "debateai_dev_[a-z_]+"/g)).toHaveLength(11);
  });
});
