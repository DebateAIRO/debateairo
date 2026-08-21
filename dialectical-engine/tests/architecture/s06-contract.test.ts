import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditOrphans } from "../../tools/orphan-audit/src/index.js";

const migration = new URL("../../migrations/0008_s06.sql", import.meta.url);
const reworkMigration = new URL("../../migrations/0009_s06_rework.sql", import.meta.url);

describe("S06 evidence architecture contract", () => {
  it("creates all eight A-06 tables and the preview-only write-time gate", async () => {
    const sql = await readFile(migration, "utf8");
    for (const table of [
      "query_set", "query_amendment", "source_record", "evidence_item",
      "absence_row", "probe_capture", "instrument_certification", "citation_route_record"
    ]) expect(sql).toContain(`evidence.${table}`);
    expect(sql).toContain("source_preview_cannot_supply_content");
    expect(sql).toContain("PREVIEW_ONLY");
    expect(sql).toContain("supplied_number_ref IS NULL");
    expect(sql).toContain("supplied_quote_ref IS NULL");
  });

  it("pins the route/outcome and attempt-depth pairing checks", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).toContain("citation_route_outcome_pair");
    expect(sql).toContain("citation_route_attempt_depth_pair");
    expect(sql).toContain("citation_route_absence_pair");
    expect(sql).not.toContain("OTHER");
  });

  it("adds a replay-safe forward CHECK forbidding scores on REJECTED evidence", async () => {
    const sql = await readFile(reworkMigration, "utf8");
    expect(sql).toContain("evidence_item_rejected_cannot_score");
    expect(sql).toContain("admissibility <> 'REJECTED' OR base_score IS NULL");
    expect(sql).toContain("IF NOT EXISTS");
  });

  it("reports internally staged S06 rows as unreachable from production entry points", async () => {
    const report = await auditOrphans();
    expect(report.s06Surface).toEqual(expect.arrayContaining([
      expect.objectContaining({ package: "packages/evidence.classifyCitationAttempt", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/evidence.evaluateEvidenceGate", attachment: "UNATTACHED" })
    ]));
    expect(report.s06Surface.every((row) => row.attachment === "UNATTACHED")).toBe(true);
    expect(report.deferredGates).toEqual([
      expect.objectContaining({ fixture: "FX-DEF-01", status: "NOT_SHIPPED" }),
      expect.objectContaining({ fixture: "FX-DEF-02", status: "NOT_SHIPPED" })
    ]);
  });
});
