import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RUN_PHASES, SETTLEMENT_ACTS, WEIGHT_SOURCES } from "@debateai/kernel";
import { auditOrphans } from "../../tools/orphan-audit/src/index.js";

describe("S10 / P12 / P17 — value-overlay structure", () => {
  it("mints each closed vocabulary once in kernel without a default member", () => {
    expect(WEIGHT_SOURCES).toEqual(["owner_elicited", "org_policy", "none"]);
    expect(WEIGHT_SOURCES).not.toContain("default");
    expect(RUN_PHASES).toEqual(["EMPIRICAL", "VALUE"]);
    expect(SETTLEMENT_ACTS).toContain("DUAL_ACT");
  });

  it("lands the four ruled carriers at their core/ledger homes with replay-safe gates", async () => {
    const [migration, drizzle, ledger] = await Promise.all([
      readFile(new URL("../../migrations/0013_s10.sql", import.meta.url), "utf8"),
      readFile(new URL("../../packages/db/src/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../../packages/ledger/src/index.ts", import.meta.url), "utf8")
    ]);
    for (const table of [
      "core.value_hinge",
      "core.reversal_point",
      "ledger.overlay_run",
      "ledger.sensitivity_record"
    ]) expect(migration).toContain(table);
    expect(migration).toContain("weight_source IN ('owner_elicited', 'org_policy', 'none')");
    expect(migration).toContain("detachment_byte_identical");
    expect(migration).toContain("CHECK (detachment_byte_identical)");
    expect(migration).not.toMatch(/weight_source[^\n]*default/i);
    expect(drizzle).toContain("valueHinge");
    expect(drizzle).toContain("overlayRun");
    expect(drizzle).toContain("reversalPoint");
    expect(drizzle).toContain("sensitivityRecord");
    expect(ledger).toContain("at_seq");
  });

  it("stages the value pipeline in the runner while reporting its missing production dispatch", async () => {
    const runner = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(runner).toContain("buildValueOverlay");
    expect(runner).toContain("ValuationRepository");
    expect(runner).toContain("serveMixedAnswer");

    const report = await auditOrphans();
    expect(report.s10Surface).toEqual([
      expect.objectContaining({ package: "packages/valuation.buildValueOverlay", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/valuation.ValuationRepository", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/valuation.serveMixedAnswer", attachment: "UNATTACHED" })
    ]);
    expect(report.neverCalled).toContainEqual(expect.objectContaining({
      package: "apps/runner.WalkingSkeletonRunner.executeValueOverlay"
    }));
  });
});
