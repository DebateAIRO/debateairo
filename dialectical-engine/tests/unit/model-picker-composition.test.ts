/**
 * A20 — both run-creation compositions hand admission the same picker: the
 * production API (hosted: the sealed row; local: the bundled file) and the
 * acceptance runtime (local: the bundled file, unless a test injects a
 * scorecard). Source pins, the precedent of tests/unit/api-provider-discovery.test.ts;
 * the behaviour itself is tests/unit/model-picker-admission.test.ts.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("A20 · the picker is composed where runs are created", () => {
  it("reads the scorecard once under the boot ledger and hands the API's admission the picker", async () => {
    const source = await readFile("apps/api/src/main.ts", "utf8");
    expect(source).toContain('await boot.run("model-scorecard", async () => {');
    expect(source).toContain("readModelScorecard(pool, environment.REGISTER_VERSION, engineVersion)");
    expect(source).toContain("readBundledModelScorecard(engineVersion)");
    expect(source).toContain("console.error(describeModelScorecard(modelScorecard, environment.DEPLOYMENT_MODE));");
    // DL7-F7: the settings refuse a hosted boot without a per-run ceiling
    // (ASK_MODEL_PICKER_PER_RUN_CEILING_REQUIRED), a synchronous decision, so
    // they are built under the boot ledger and handed to admission by name.
    expect(source).toContain('const modelPicker = boot.runSync("model-picker", () => askModelPickerSettings({');
    expect(source).toMatch(/\n {2}resolveDiscoveredPanel: resolveProviderPanel,\n(?: {2}\/\/[^\n]*\n)* {2}modelPicker,\n/u);
    expect(source).toContain("perRunCeilingMicros: costEnvelopePolicy?.perRunCeilingMicros ?? null,");
    expect(source.indexOf('boot.run("model-scorecard"')).toBeLessThan(source.indexOf('boot.runSync("model-picker"'));
    expect(source.indexOf('boot.runSync("model-picker"')).toBeLessThan(source.indexOf("new PostgresAskApplication("));
    // Pre-flight ruling F17: admission's backup provision reaches the ceiling.
    expect(source).toContain("backupSequencesProvisioned: input.backupSequencesProvisioned");
  });

  it("composes the same picker in the acceptance runtime, reading the bundled file unless a test injects one", async () => {
    const source = await readFile("acceptance/main.ts", "utf8");
    expect(source).toContain("readonly modelScorecard?: ModelScorecardReadResult;");
    expect(source).toContain("input.modelScorecard ?? await readBundledModelScorecard(await readEngineVersion())");
    expect(source).toContain("modelPicker: askModelPickerSettings({");
    expect(source).toContain('deploymentMode: "local",');
    // Pre-flight ruling F17: admission's backup provision reaches the acceptance ceiling too.
    expect(source).toContain(
      "computeAcceptanceStructuralCeiling(policy, basis.panelSize, Number(basis.depthParams.depth), basis.backupSequencesProvisioned)"
    );
  });
});
