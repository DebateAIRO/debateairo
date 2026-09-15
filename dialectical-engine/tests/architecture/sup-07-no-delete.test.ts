import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const SUP_07_SOURCE_AND_MIGRATION_PATHS = Object.freeze([
  "apps/api/src/support/keys.ts",
  "apps/api/src/support/session.ts",
  "apps/api/src/support/index.ts",
  "apps/api/src/support/shred.ts",
  "apps/api/src/support/templates.ts",
  "apps/runner/src/support-shred-cli.ts",
  "apps/runner/src/support-status-cli.ts",
  "packages/db/src/support.ts",
  "migrations/0054_support_keys_audit.sql"
]);

async function readWhenPresent(path: string): Promise<string> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

describe("SUP-07 destructive-boundary architecture", () => {
  it("keeps support keys local to the support bounded context", async () => {
    const source = await readFile("apps/api/src/support/keys.ts", "utf8");
    const imports = source.match(/(?:import|export)\s[^;]*?from\s+["'][^"']+["']/gu) ?? [];
    expect(imports.flatMap((statement) =>
      statement.match(/from\s+["']([^"']+)["']/u)?.[1] ?? []
    ).sort()).toEqual([
      "@debateai/kernel", "node:crypto", "node:fs", "node:fs/promises", "node:path"
    ]);
    expect(imports.filter((statement) =>
      /packages\/crypto|identity|account-erasure|registration|recovery|mfa|session-zone/iu
        .test(statement)
    )).toEqual([]);
    expect(source.match(/[\w./-]*kek[.]bin/giu)).toEqual(["support-kek.bin"]);
  });

  it("contains no destructive SQL, automatic shred scheduler, or raw secret logger", async () => {
    const sources = await Promise.all(SUP_07_SOURCE_AND_MIGRATION_PATHS.map(async (path) => ({
      path,
      source: await readWhenPresent(path)
    })));
    const violations = sources.flatMap(({ path, source }) => {
      const scanned = source.replace(/console[.]error\(diagnostic\)/gu,"");
      const matches = scanned.match(
        /\bDELETE\s+FROM\b|\bTRUNCATE\s+(?:TABLE\s+)?[\w".]|\bDROP\s+TABLE\b|\b(?:setInterval|scheduleJob|node-cron)\b|--older-than|console[.](?:log|error)\s*\(/giu
      ) ?? [];
      return matches.map((match) => `${path}:${match}`);
    });
    expect(violations).toEqual([]);
  });

  it("does not change account-erasure or let the shred CLI open support keys", async () => {
    const diff = await execFileAsync("git", [
      "diff", "--name-only", "HEAD", "--", "apps/api/src/account-erasure.ts"
    ]);
    expect(diff.stdout.trim()).toBe("");
    const cli = await readWhenPresent("apps/runner/src/support-shred-cli.ts");
    expect(cli).not.toContain("apps/api/src/support/keys");
    expect(cli).not.toContain("SUPPORT_KEK_PATH");
  });

  it("orders case-reply locks with shred and revalidates both parent and key under lock", async () => {
    const source = await readFile("packages/db/src/support.ts","utf8");
    const start = source.indexOf("async appendCaseMessage(");
    const end = source.indexOf("async closeCase(",start);
    const append = source.slice(start,end);
    const sessionLock = append.indexOf("await lockSupportSessions(client,[parent.session_id])");
    const rowLock = append.indexOf("FOR UPDATE OF opened,key");
    expect(sessionLock).toBeGreaterThanOrEqual(0);
    expect(rowLock).toBeGreaterThan(sessionLock);
    expect(append).toContain("opened.shredded_at");
    expect(append).toContain("key.destroyed_at");
    expect(append).toContain("current.wrapped_key.equals(ZERO_WRAPPED_SUPPORT_KEY)");
  });
});
