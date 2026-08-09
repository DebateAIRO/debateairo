import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  ACTION_SCOPES,
  INDEPENDENCE_RECEIPT_STATUSES,
  SYMMETRY_DIFF_STATUSES
} from "@debateai/kernel";
import { auditOrphans } from "../../tools/orphan-audit/src/index.js";

describe("S08 / P12 / P17 / honesty — critique contract", () => {
  it("mints the S08 closed vocabularies once in kernel", () => {
    expect(ACTION_SCOPES).toEqual(["ITEM_SCOPED", "PRE_ITEM"]);
    expect(SYMMETRY_DIFF_STATUSES).toEqual(["SYMMETRIC", "ASYMMETRIC", "UNINSTRUMENTED"]);
    expect(INDEPENDENCE_RECEIPT_STATUSES).toEqual(["INDEPENDENT", "NOT_INDEPENDENT", "UNKNOWN"]);
  });

  it("creates the four critique tables and the separate immutable trigger basis", async () => {
    const [migration, ledgerCarrier] = await Promise.all([
      readFile(new URL("../../migrations/0011_s08.sql", import.meta.url), "utf8"),
      readFile(new URL("../../migrations/0000_s00.sql", import.meta.url), "utf8")
    ]);
    for (const table of [
      "core.critique_packet", "core.independence_receipt", "core.symmetry_diff",
      "core.objection_record", "core.verification_trigger_basis"
    ]) expect(migration).toContain(table);
    expect(ledgerCarrier).toContain("subject_item_id");
    expect(ledgerCarrier).toContain("stance_at_action");
    expect(migration).not.toMatch(/fairness_score/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION|core\.reject_mutation/);
  });

  it("reports test-only S08 seams honestly while retaining the API admission attachment", async () => {
    const report = await auditOrphans();
    expect(report.s08Surface).toEqual(expect.arrayContaining([
      expect.objectContaining({ package: "packages/critique.assertMakerAdmission", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/critique.planBlindVerification", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/critique.computeSymmetryDiff", attachment: "UNATTACHED" }),
      expect.objectContaining({ package: "packages/critique.CritiqueRepository", attachment: "UNATTACHED" })
    ]));
    expect(report.neverCalled).toEqual(expect.arrayContaining([
      expect.objectContaining({ package: "packages/critique.planBlindVerification" }),
      expect.objectContaining({ package: "packages/critique.computeSymmetryDiff" }),
      expect.objectContaining({ package: "packages/critique.CritiqueRepository" })
    ]));
  });
});
