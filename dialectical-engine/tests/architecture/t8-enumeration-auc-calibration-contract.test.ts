import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("T8 enumeration AUC calibration contract", () => {
  it("uses an exact-size per-cell same-arm null with at least sixteen real samples per arm", async () => {
    const [registration, disposition] = await Promise.all([
      read("tests/integration/registration-database.test.ts"),
      read("docs/missions/2026-08-17-accounts-privacy-security/reviews/T8-enumeration-auc-calibration-disposition.md")
    ]);

    expect(registration).toContain("for (const concurrency of [1, 2, 3, 4, 8] as const)");
    expect(registration).toContain("const waves = Math.max(4,Math.ceil(16/concurrency));");
    expect(registration).toContain("const sampleCountPerArm = concurrency * waves;");
    expect(registration).toContain("existing,sampleCountPerArm,0x53b0_0000 + concurrency * 2");
    expect(registration).toContain("missing,sampleCountPerArm,0x53b0_0001 + concurrency * 2");
    expect(registration).toContain("const aucCeiling = empiricalQuantile(nullAucValues,0.99);");
    expect(registration).toContain("expect(new Set(existing).size).toBeGreaterThan(1);");
    expect(registration).toContain("expect(new Set(missing).size).toBeGreaterThan(1);");
    expect(registration).toContain("expect(measurement.auc).toBeLessThanOrEqual(measurement.aucCeiling);");
    expect(registration).not.toContain("expect(measurement.auc).toBeLessThanOrEqual(0.8)");

    expect(disposition).toContain("Decision: `SATISFIED_BY_CURRENT_PER_N_CALIBRATION`");
    expect(disposition).toContain("0.891 at N=1");
    expect(disposition).toContain("N=4 asymmetry regression reached only 0.840");
    expect(disposition).toContain("16, 16, 18, 16, and 32 real");
    expect(disposition).toContain("There is no shared 0.80 cutoff");
    expect(disposition).toContain("overall AUC");
    expect(disposition).toContain("1.0 against a 0.75390625 per-cell ceiling");
    expect(disposition).toContain("not a universal probability guarantee");
  });
});
