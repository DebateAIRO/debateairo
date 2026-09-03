import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const retiredHeader = ["x", "user", "dev", "token"].join("-");

async function nonHistoricalSourceFiles(directory = new URL("./", root)): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next"
      || entry.name === "dist" || entry.name.startsWith(".tmp")) continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      if (relative(new URL("./", root).pathname, child.pathname).startsWith("docs/")) continue;
      output.push(...await nonHistoricalSourceFiles(child));
    } else if ([".ts", ".tsx", ".js", ".mjs", ".json", ".sql", ".md"].includes(extname(entry.name))) {
      output.push(child.pathname);
    }
  }
  return output;
}

describe("S9 dev-token retirement architecture contract", () => {
  it("removes the header and resolver from every non-historical source", async () => {
    const offenders: string[] = [];
    for (const path of await nonHistoricalSourceFiles()) {
      if ((await readFile(path, "utf8")).includes(retiredHeader)) {
        offenders.push(relative(new URL("./", root).pathname, path));
      }
    }
    expect(offenders).toEqual([]);
    const [api, runtimeEnvironment, client] = await Promise.all([
      read("apps/api/src/index.ts"),
      read("packages/register/src/runtime-environment.ts"),
      read("packages/contract/src/client.ts")
    ]);
    expect(api).toContain('const RETIRED_DEV_HEADER=["x","user","dev","token"].join("-")');
    expect(api).not.toMatch(/resolveLegacy|legacyDevSessionResolver/);
    expect(runtimeEnvironment).not.toMatch(/LEGACY_(USER|OPERATOR)_DEV_TOKEN/);
    expect(client).toContain("claimLegacyRuns:(legacyToken:string)=>request(");
  });

  it("retires legacy sessions and inventories every old run as claimed or explicitly orphaned", async () => {
    const migration = await read("migrations/0041_dev_token_retirement.sql");
    expect(migration).toContain("ALTER COLUMN csrf_token_hash SET NOT NULL");
    expect(migration).toContain("ALTER COLUMN last_mfa_at SET NOT NULL");
    expect(migration).toContain("ORPHANED_PRIVATE_CLAIMABLE");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION core.claim_legacy_runs(");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION core.append_run_ownership_event(uuid,uuid)");
    expect(migration).not.toMatch(/UPDATE\s+core\.run\b/i);
  });

  it("exposes a one-shot cookie claim UI and boots acceptance with a real service session", async () => {
    const [uiControl, uiSettings, acceptance, packageJson,
      vitestConfig] = await Promise.all([
      read("apps/ui/components/LegacyRunClaimControls.tsx"),
      read("apps/ui/app/settings/page.tsx"),
      read("acceptance/main.ts"),
      read("package.json"),
      read("vitest.config.ts")
    ]);
    for (const control of [uiControl]) {
      expect(control).toContain("client.claimLegacyRuns(submittedToken)");
      expect(control.indexOf('setLegacyToken("")')).toBeLessThan(
        control.indexOf("client.claimLegacyRuns(submittedToken)")
      );
      expect(control).not.toMatch(/localStorage|sessionStorage|console\./);
    }
    expect(uiSettings).toContain("<LegacyRunClaimControls");
    expect(acceptance).toContain("new PostgresSessionRepository(");
    expect(acceptance).toContain("acceptanceServiceRequestHeaders");
    expect(acceptance).toContain("serviceCredential");
    expect(acceptance).toContain("new MemoryRunContentKeyStore(users");
    expect(acceptance).toContain("configureContentEncryption(pool, new ContentCipher(runs))");
    expect(acceptance).toContain("initializedSession.close()");
    expect(acceptance).not.toContain(retiredHeader);
    expect(JSON.parse(packageJson).devDependencies["@debateai/crypto"]).toBe("workspace:*");
    expect(vitestConfig).toContain('"acceptance/**/*.test.ts"');
  });

  it("passes only the database-owned initial battery shape into encrypted run creation", async () => {
    const database = await read("packages/db/src/index.ts");
    const projectionStart = database.indexOf("JSON.stringify(input.batteryRows.map((row)=>({");
    const createCallEnd = database.indexOf("})))]", projectionStart);
    expect(projectionStart).toBeGreaterThan(-1);
    expect(createCallEnd).toBeGreaterThan(projectionStart);
    const projection = database.slice(projectionStart, createCallEnd);
    expect(projection).toContain("batteryRowId:row.batteryRowId");
    expect(projection).toContain("predicateRef:row.predicateRef");
    expect(projection).toContain("openingState:row.openingState");
    expect(projection).toContain("predicateInputs:row.predicateInputs");
    expect(projection).toContain("skipEvidence:row.skipEvidence");
    expect(projection).not.toMatch(/executionKind|modelCallsAllowed|settlementWatchHandle/);
    expect(database).not.toContain("JSON.stringify(input.batteryRows)]");
  });
});
