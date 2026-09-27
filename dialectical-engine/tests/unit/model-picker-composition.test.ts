/**
 * A20 — both run-creation compositions hand admission the same picker: the
 * production API (hosted: the sealed row; local: the bundled file) and the
 * acceptance runtime (local: the bundled file, unless a test injects a
 * scorecard). Source pins, the precedent of tests/unit/api-provider-discovery.test.ts;
 * the behaviour itself is tests/unit/model-picker-admission.test.ts.
 */
import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("A20 · the picker is composed where runs are created", () => {
  it("reads the scorecard once under the boot ledger and hands the API's admission the picker", async () => {
    const source = await readFile("apps/api/src/main.ts", "utf8");
    expect(source).toContain('await boot.run("model-scorecard", async () => {');
    expect(source).toContain("readModelScorecard(pool, environment.REGISTER_VERSION, engineVersion)");
    expect(source).toContain("readBundledModelScorecard(engineVersion)");
    // A20.4 review I1: HOSTED reads the sealed row, LOCAL the public file — in that direction.
    expect(source).toMatch(
      /environment\.DEPLOYMENT_MODE === "hosted"\s*\?\s*readModelScorecard\(pool, environment\.REGISTER_VERSION, engineVersion\)\s*:\s*readBundledModelScorecard\(engineVersion\)/u
    );
    expect(source).toContain("console.error(describeModelScorecard(modelScorecard, environment.DEPLOYMENT_MODE));");
    // DL7-F7: the settings refuse a hosted boot without a per-run ceiling
    // (ASK_MODEL_PICKER_PER_RUN_CEILING_REQUIRED), a synchronous decision, so
    // they are built under the boot ledger and handed to admission by name.
    expect(source).toContain('const modelPicker = boot.runSync("model-picker", () => askModelPickerSettings({');
    expect(source).toMatch(/\n {2}resolveDiscoveredPanel: resolveProviderPanel,\n(?: {2}\/\/[^\n]*\n)* {2}modelPicker,\n/u);
    expect(source).toContain("perRunCeilingMicros: costEnvelopePolicy?.perRunCeilingMicros ?? null,");
    // A20.4 review I1: the API's picker runs in the deployment's own mode, never a fixed one,
    // on the scorecard the boot actually read (never a fixed ABSENT that silently turns it off).
    expect(source).toContain(
      "  scorecard: modelScorecard,\n  deploymentMode: environment.DEPLOYMENT_MODE,\n  targets: declaredProviderTargets,"
    );
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

  // A20.4 review M3: the default is the checked-in `scorecards/current.json`, which the owners' A22 run
  // places. A suite that relied on the default would move from the plan rosters to the picker the day
  // that file lands, so every acceptance suite that builds the runtime names its scorecard itself.
  it("has every acceptance suite that builds the runtime name its scorecard, never the checked-in default", async () => {
    const suites = (await readdir("acceptance")).filter((name) => name.endsWith(".test.ts"));
    const builds: string[] = [];
    const unmatched: string[] = [];
    for (const name of suites) {
      const source = await readFile(`acceptance/${name}`, "utf8");
      const matched = [...source.matchAll(/createAcceptanceRuntime\(\{\n(?:[ ]*\/\/[^\n]*\n)*(?<first>[^\n]*)\n/gu)];
      for (const match of matched) builds.push(`${name}: ${match.groups?.first?.trim() ?? ""}`);
      // Every call is in the one checked form; a one-line build, `createAcceptanceRuntime(options)` or
      // `createAcceptanceRuntime( {` would otherwise be skipped silently. `(?!")` leaves out a quoted
      // mention of the name inside a test's own search text.
      const calls = [...source.matchAll(/createAcceptanceRuntime\((?!")/gu)].length;
      if (calls !== matched.length) unmatched.push(`${name}: ${calls} calls, ${matched.length} in the checked form`);
    }
    expect(builds.length).toBeGreaterThan(0);
    expect(unmatched).toEqual([]);
    // `modelScorecard: …` or the shorthand `modelScorecard,` — either names it; `undefined` does not.
    expect(builds.filter((build) => !/: modelScorecard(?::|,)/u.test(build) || /modelScorecard: undefined/u.test(build)))
      .toEqual([]);
  });
});
