import { readFile,readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase,type TestDatabase } from "../support/testDatabase.js";
import { PostgresSupportIncidentRepository } from "../../apps/api/src/support/incidents.js";

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory,{ withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory,entry.name);
    return entry.isDirectory() ? sources(path) : /[.]tsx?$/u.test(entry.name) ? [path] : [];
  }))).flat();
}

describe("SUP-05 public incident boundary", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
  },120_000);

  afterAll(async () => database?.stop(),120_000);

  it("defines the exact public interface and closed privileges", async () => {
    const columns = await database.pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='support' AND table_name='public_incident'
      ORDER BY ordinal_position
    `);
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      "incident_id","started_at","ended_at","severity","affected_surface",
      "summary_en","summary_ro","published_by","published_at","source_ref"
    ]);
    const privilege = await database.pool.query<{
      support_select: boolean;support_delete: boolean;obs_select: boolean;
    }>(`
      SELECT
        has_table_privilege('debateai_support','support.public_incident','SELECT') AS support_select,
        has_table_privilege('debateai_support','support.public_incident','DELETE') AS support_delete,
        has_table_privilege('debateai_support','obs.occurrence','SELECT') AS obs_select
    `);
    expect(privilege.rows).toEqual([{
      support_select: true,support_delete: false,obs_select: false
    }]);
  });

  it("never reads observability relations and has no deletion path", async () => {
    const supportFiles = await sources("apps/api/src/support");
    const files = [
      "apps/runner/src/support-incident-cli.ts",
      "apps/api/src/support/incidents.ts",
      "migrations/0053_support_public_incident.sql"
    ];
    const supportText = (await Promise.all(
      supportFiles.map((file) => readFile(file,"utf8"))
    )).join("\n");
    const text = (await Promise.all(files.map((file) => readFile(file,"utf8")))).join("\n");
    expect(supportText).not.toMatch(/\bobs[.]/u);
    expect(text).not.toMatch(/\bDELETE\b/iu);
    expect(text).not.toMatch(/\/v1\/support\/incidents?/u);
  });

  it("publishes and resolves atomically while retaining the row", async () => {
    const repository = new PostgresSupportIncidentRepository(database.pool);
    await expect(repository.publish({
      incidentId: "inc-db",startedAt: new Date("2026-09-07T08:30:00.000Z"),
      endedAt: null,severity: "minor",affectedSurface: "publishing",
      summaryEn: "Publishing is delayed.",summaryRo: "Publicarea este întârziată.",
      publishedBy: "V",publishedAt: new Date("2026-09-07T08:31:00.000Z"),sourceRef: null
    })).resolves.toMatchObject({ incidentId: "inc-db",publishedBy: "V" });
    const at = new Date("2026-09-07T09:00:00.000Z");
    await expect(repository.resolve("inc-db",at)).resolves.toBe("RESOLVED");
    await expect(repository.resolve("inc-db",at)).resolves.toBe("ALREADY_RESOLVED");
    await expect(repository.resolve("missing",at)).resolves.toBe("NOT_FOUND");
    const retained = await database.pool.query<{ ended_at: Date }>(`
      SELECT ended_at FROM support.public_incident WHERE incident_id='inc-db'
    `);
    expect(retained.rows).toEqual([{ ended_at: at }]);
  });
});
