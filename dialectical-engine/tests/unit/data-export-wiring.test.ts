import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");

describe("data export production wiring", () => {
  it("W1 constructs the export application only within the configured store guard", () => {
    const guard = source.indexOf("if (environment.DATA_EXPORT_STORE_PATH !== undefined)");
    const application = source.indexOf("new DataExportApplication(");
    expect(guard).toBeGreaterThan(-1);
    expect(application).toBeGreaterThan(guard);
    const nextTopLevel = source.indexOf("\n}\nconst api = buildApi", guard);
    expect(application).toBeLessThan(nextTopLevel);
  });

  it("W2 schedules the module-private 15-second worker and clears it on close", () => {
    expect(source).toMatch(/(?<!export\s)const DATA_EXPORT_TICK_MS = 15_000;/);
    // Side-by-side C7: gated on the current release; gatedInterval unrefs it (tests/unit/side-by-side-release-loops).
    expect(source).toMatch(/dataExportTimer = gatedInterval\(releaseWatcher, triggerDataExportWork, DATA_EXPORT_TICK_MS\);/);
    expect(source).toMatch(/onClose[\s\S]*clearInterval\(dataExportTimer\)/);
  });

  it("W3 runs the export worker at boot after the erasure trigger", () => {
    const erasure = source.indexOf("triggerErasureReconciliation();");
    const dataExport = source.indexOf("triggerDataExportWork();", erasure);
    expect(erasure).toBeGreaterThan(-1);
    expect(dataExport).toBeGreaterThan(erasure);
  });

  it("W4 includes the export directory in publication secret domains", () => {
    const block = source.match(/assertPublicationSecretDomains\([\s\S]*?additionalStorePaths:[\s\S]*?\}\);/)?.[0] ?? "";
    expect(block).toContain("DATA_EXPORT_STORE_PATH");
  });

  it("W5 opens a separate worker pool before role attestation and uses it only for export work", () => {
    const pool = "const dataExportPool = environment.DATA_EXPORT_STORE_PATH === undefined ? undefined : boot.hold(createPool(environment.DATA_EXPORT_DATABASE_URL!, API_DATABASE_POOLS.dataExport));";
    expect(source.split(pool)).toHaveLength(2);
    expect(source.indexOf(pool)).toBeLessThan(source.indexOf('await boot.run("database-roles"'));
    expect(source).toContain("assertDataExportDatabaseRoles(authorizationPool, dataExportPool)");
    expect(source).toContain("new PostgresDataExportRepository(authorizationPool, dataExportPool!, auditContextHasher)");
    expect(source).toContain("new PostgresDataExportSource(dataExportPool!)");
    expect(source).not.toContain("new PostgresDataExportSource(authorizationPool)");
    expect(source).toContain("...(dataExportPool === undefined ? [] : [dataExportPool])");
  });
});
