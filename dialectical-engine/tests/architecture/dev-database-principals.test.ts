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

  it("keeps all nine fixed wrappers least-privileged and file-backed", async () => {
    const source = await readFile("apps/runner/src/dev-database-principals.ts", "utf8");
    expect(source.match(/roleName: "debateai_dev_[a-z_]+"/g)).toHaveLength(9);
    expect(source).toContain("LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
    expect(source).toContain("SET LOCAL password_encryption='scram-sha-256'");
    expect(source).toContain("DEV_DATABASE_PRINCIPAL_ADMIN_REQUIRED");
    expect(source).toContain("DEV_DATABASE_PRINCIPAL_DRIFT");
    expect(source).toContain("pg_advisory_xact_lock(hashtextextended('debateai:dev-database-principals',0))");
    expect(source).toContain("isExistingFileError(createError)");
    expect(source).toContain("open(resolvedPath, \"wx\", 0o600)");
    // L7-F10: the custody-root policy moved to the B4 resolver, which refuses a
    // drifted mode rather than narrowing it back and hiding the exposure.
    expect(source).toContain("await assertDevCustodyDirectory(credentialRoot)");
    expect(source).not.toMatch(/password:\s*["'][^"']+["']/);
  });
});
