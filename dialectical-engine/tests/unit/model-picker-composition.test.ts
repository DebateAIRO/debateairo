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
    // Final review I5: the two stages are one exported function, `composeAskModelPicker`
    // (apps/api/src/ask-model-picker.ts), which main.ts runs under ITS OWN boot ledger. Its
    // behaviour is tests/unit/model-picker-boot-stages.test.ts; these pins keep the wiring.
    const source = await readFile("apps/api/src/main.ts", "utf8");
    expect(source).toContain(
      "const modelPicker = await composeAskModelPicker({\n  boot,\n  pool,\n"
      + "  deploymentMode: environment.DEPLOYMENT_MODE,\n  registerVersion: environment.REGISTER_VERSION,\n"
      + "  targets: declaredProviderTargets,\n  perRunCeilingMicros: costEnvelopeRows?.guardPolicy.perRunCeilingMicros ?? null,\n"
    );
    expect(source).toContain("  log: (line) => console.error(line)\n});");
    // Final review I3: the sealed answer bounds are read once, in their own boot stage, and handed over.
    expect(source).toContain(
      'const callTokenCeilings = await boot.run("call-token-ceilings", () => readCallTokenCeilings(pool, environment.REGISTER_VERSION));'
    );
    expect(source).toContain("  perRunCeilingMicros: costEnvelopeRows?.guardPolicy.perRunCeilingMicros ?? null,\n  callTokenCeilings,\n");
    // Paid plans S4c (final review P3-M4): the picker's money terms are B6b's guard policy, and billing is on
    // exactly when the room's composition carries the plans. Dropped, the picker would silently fall back to the
    // bare per-run ceiling, and a scorecard capping Free above ECONOMY would boot with billing on.
    expect(source).toContain("const billingEnabled = (askRoomComposition?.billingPlans ?? null) !== null;\n");
    expect(source).toContain(
      "  callTokenCeilings,\n  moneyPolicy: costEnvelopeRows?.guardPolicy ?? null,\n  billingEnabled,\n  log: (line) => console.error(line)\n});"
    );
    expect(source.indexOf("const billingEnabled = ")).toBeLessThan(source.indexOf("await composeAskModelPicker({"));
    expect(source.indexOf('boot.run("call-token-ceilings"')).toBeLessThan(source.indexOf("await composeAskModelPicker({"));
    expect(source).toMatch(/\n {2}resolveDiscoveredPanel: resolveProviderPanel,\n(?: {2}\/\/[^\n]*\n)* {2}modelPicker,\n/u);
    expect(source.indexOf("const declaredProviderTargets = ")).toBeLessThan(source.indexOf("await composeAskModelPicker({"));
    expect(source.indexOf("await composeAskModelPicker({")).toBeLessThan(source.indexOf("new PostgresAskApplication("));
    // The one additional opt-in read refuses preview before provider credentials.
    const previewRead = source.indexOf('await boot.run("preview-scorecard-conflict"');
    expect(previewRead).toBeGreaterThan(source.indexOf("if (previewConfig !== undefined) {"));
    expect(source.slice(previewRead, source.indexOf("const previewFetch =", previewRead)))
      .toContain('throw new TypedDomainError("PREVIEW_SCORECARD_CONFLICT"');
    expect(previewRead).toBeLessThan(source.indexOf('boot.runSync("provider-credentials"'));
    expect(source.match(/\breadModelScorecard\(/gu)).toHaveLength(1);
    expect(source).not.toContain("askModelPickerSettings(");
    // Pre-flight ruling F17: admission's backup provision reaches the ceiling.
    expect(source).toContain("backupSequencesProvisioned: input.backupSequencesProvisioned");

    const composer = await readFile("apps/api/src/ask-model-picker.ts", "utf8");
    const body = composer.slice(composer.indexOf("export async function composeAskModelPicker("));
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('const modelScorecard = await input.boot.run("model-scorecard", async () => {');
    // A20.4 review I1: HOSTED reads the sealed row, LOCAL the public file — in that direction.
    expect(body).toMatch(
      /input\.deploymentMode === "hosted"\s*\?\s*readModelScorecard\(input\.pool, input\.registerVersion, engineVersion\)\s*:\s*readBundledModelScorecard\(engineVersion, input\.bundledScorecard\)/u
    );
    expect(body).toContain("input.log(describeModelScorecard(modelScorecard, input.deploymentMode));");
    // DL7-F7: the settings refuse a hosted boot without a per-run ceiling
    // (ASK_MODEL_PICKER_PER_RUN_CEILING_REQUIRED), a synchronous decision, so they
    // are built under the ledger's runSync.
    expect(body).toContain('return input.boot.runSync("model-picker", () => askModelPickerSettings({');
    // A20.4 review I1: the picker runs in the deployment's own mode, never a fixed one, on the
    // scorecard the boot actually read (never a fixed ABSENT that silently turns it off).
    expect(body).toContain(
      "    scorecard: modelScorecard,\n    deploymentMode: input.deploymentMode,\n    targets: input.targets,"
    );
    expect(body).toContain("    perRunCeilingMicros: input.perRunCeilingMicros,");
    expect(body).toContain("    callTokenCeilings: input.callTokenCeilings,");
    // Paid plans S4c (final review P3-M4): both members reach the settings the stage builds.
    expect(body).toContain("    ...(input.moneyPolicy === undefined ? {} : { moneyPolicy: input.moneyPolicy }),");
    expect(body).toContain("    ...(input.billingEnabled === undefined ? {} : { billingEnabled: input.billingEnabled }),");
    expect(body.indexOf('input.boot.run("model-scorecard"')).toBeLessThan(body.indexOf('input.boot.runSync("model-picker"'));
  });

  it("composes the same picker in the acceptance runtime, reading the bundled file unless a test injects one", async () => {
    const source = await readFile("acceptance/main.ts", "utf8");
    expect(source).toContain("readonly modelScorecard?: ModelScorecardReadResult;");
    expect(source).toContain("input.modelScorecard ?? await readBundledModelScorecard(await readEngineVersion())");
    expect(source).toContain("modelPicker: askModelPickerSettings({");
    expect(source).toContain('deploymentMode: "local",');
    // Final review I3: the acceptance picker counts the acceptance register's own sealed answer bounds.
    expect(source).toContain(
      "callTokenCeilings: {\n        judge: policy.bounds.JUDGE.tokenCeiling,\n"
      + "        synthesizer: policy.synthesisRolePolicy.synthesizerBound.tokenCeiling,\n"
      + "        evaluator: policy.synthesisRolePolicy.evaluatorBound.tokenCeiling\n      }\n    }),"
    );
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
