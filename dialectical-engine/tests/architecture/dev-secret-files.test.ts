import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DEV-04 development secret generation source contract", () => {
  it("publishes only the fixed ignored dev command and exact three-key/two-store inventory", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const cli = await readFile("apps/runner/src/dev-secret-files-cli.ts", "utf8");
    const source = await readFile("apps/runner/src/dev-secret-files.ts", "utf8");
    expect(packageJson.scripts?.["dev:auth:generate-secrets"])
      .toBe("tsx apps/runner/src/dev-secret-files-cli.ts");
    expect(cli).toContain("generateDevelopmentSecretFiles({ repositoryRoot: process.cwd() })");
    expect(cli).not.toContain("DEV_AUTH_SECRET_ROOT");
    expect(cli).toContain("DEV_AUTH_SECRETS_READY=");
    expect(source).toContain('relativePath: "secrets/kek.bin"');
    expect(source).toContain('relativePath: "secrets/blind-index-key.bin"');
    expect(source).toContain('relativePath: "secrets/audit-source-ip-salt.bin"');
    expect(source).toContain('relativePath: "audit-keys"');
    expect(source).toContain('relativePath: "user-deks"');
  });

  it("uses exclusive atomic publication and validates rather than repairs existing custody", async () => {
    const source = await readFile("apps/runner/src/dev-secret-files.ts", "utf8");
    expect(source).toContain("randomBytes(32)");
    expect(source).toContain('open(temporaryPath, "wx", 0o600)');
    expect(source).toContain("await handle.sync()");
    expect(source).toContain("await link(temporaryPath, secretPath)");
    expect(source).toContain("DEV_AUTH_SECRET_FILE_INVALID");
    expect(source).toContain("DEV_AUTH_SECRET_STORE_INVALID");
    expect(source).toContain("DEV_AUTH_SECRET_DOMAIN_INVALID");
    expect(source).not.toMatch(/chmod\([^)]*(?:secretPath|storePath|custodyRoot)/);
    expect(source).not.toMatch(/console\.(?:log|error)/);
  });
});
