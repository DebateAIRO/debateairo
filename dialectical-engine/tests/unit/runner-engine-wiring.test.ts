// Engine redesign R1d, Task 5 (INTERFACE §1.5, §3.3): the runner reads the engine ONLY from each run's receipt; the row is
// read at boot alone (engine-boot.ts), to resolve the settings an engine-2 run needs. The wiring is pinned in the source.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { computeStructuralCeilingBasis, ENGINE_ONE, engineOfRun } from "@debateai/register";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
const RUNNER = read("apps/runner/src/index.ts");
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });

describe("the runner reads the engine from the receipt only", () => {
  it("row absent = today's run: a receipt without the member is engine 1", () => {
    const today = parseCostEnvelopeBasis(computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1 }));
    expect(engineOfRun(today)).toBe(ENGINE_ONE);
  });

  it("per run: engineOfRun over the parsed receipt, after the shape's per-run check, and an engine-2 run on an unconfigured runner is refused", () => {
    const shapeAt = RUNNER.indexOf("const shapeShape = envelopeBasis.shape ?? null;");
    const engineAt = RUNNER.indexOf("const engine = engineOfRun(envelopeBasis);");
    expect(shapeAt).toBeGreaterThan(0);
    expect(engineAt).toBeGreaterThan(shapeAt);
    expect(engineAt).toBeLessThan(RUNNER.indexOf("const shapeSettings = shapeShape === null ? null : debateShapeSettingsOf(run.depthParams);"));
    expect(RUNNER).toContain("if (engine.engine === 2 && settings.engine == null) {");
    expect(RUNNER).toContain("throw new TypedDomainError(\"ENGINE_RUNNER_UNCONFIGURED\",");
  });

  it("no runner source reads the engine row except the boot read", () => {
    const dir = new URL("../../apps/runner/src/", import.meta.url);
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts"))) {
      const source = readFileSync(new URL(name, dir), "utf8");
      expect(source.includes("readEngineVersionPolicy") && name !== "engine-boot.ts", name).toBe(false);
    }
    expect(RUNNER).not.toContain("ENGINE_VERSION_POLICY_ROW_KEY");
    expect(RUNNER).not.toContain("readEngineRunnerSettings");
  });

  it("W3-1: the web step runs from one call site, only on an engine-2 run, under the engine seal the boot settings carry", () => {
    expect(RUNNER.split("await runRunnerWebStep(")).toHaveLength(2);
    expect(RUNNER).toContain("if (settings.webSearch !== undefined && settings.engine != null && engine.engine === 2 && shapeMapArgued");
    expect(RUNNER).toContain("contractHash: settings.engine.engineContractHash, bound: settings.judgeBound,");
    const step = read("apps/runner/src/web-step.ts");
    for (const name of ["readEngineVersionPolicy", "ENGINE_VERSION_POLICY_ROW_KEY", "readEngineRunnerSettings"]) {
      expect(step).not.toContain(name);
    }
  });

  it("W3-6: the planner's decision goes to 0134's store, from the step itself, on the runner's pool, under the step's lease", () => {
    const step = read("apps/runner/src/web-step.ts");
    // The runner's call keeps them by default; only a fixture hands in its own (`stepPorts`, W4-2's test seam).
    expect(step.split("recordPlanPathStatuses: stepPorts?.recordPlanPathStatuses ?? postgresWebPlanStatusRecorder(pool),")).toHaveLength(2);
    expect(step.split("prepare: stepPorts?.prepare ?? (() => postgresWebStepPorts(pool, rest.runId))")).toHaveLength(2);
    expect(RUNNER).not.toContain("stepPorts");
    // No second lease: the recorder seals with the cipher the step's own `prepare` opened, and opens none itself.
    expect(step.split("await keepDecision(ports.cipher);")).toHaveLength(2);
    expect(step.split("prepareLeasedContentEncryptionForRun(")).toHaveLength(2);
    const settings = read("apps/runner/src/run-settings.ts");
    expect(settings).not.toContain("WEB_PLAN_STATUS_STORE_PENDING");
    expect(settings).not.toContain("recordPlanPathStatuses");
  });

  it("W4-1: the packs are read once, after the web step kept one, and reach the legs and readers from that one read", () => {
    expect(RUNNER.split("const webStep = await runRunnerWebStep(")).toHaveLength(2);
    // W4-7: with the step's outcomes, so every path of a dig reads the one pack kept under its first path.
    expect(RUNNER.split("webPacks = await readDebateWebPacks({ pool: this.pool, runId: run.runId, paths: webStep.paths, abandon: keepAliveStop });"))
      .toHaveLength(2);
    expect(RUNNER.indexOf("if (webStep.paths.some((path) => path.packId !== null)) {"))
      .toBeLessThan(RUNNER.indexOf("webPacks = await readDebateWebPacks("));
    // The case writer, the defenders and critics, and the cross-replies (own path, then the rival's).
    expect(RUNNER.split("legWithWebSources(")).toHaveLength(4);
    expect(RUNNER).toContain("{ own: webPathOfRoot(shapeLeg.rootIndex), rival: webPathOfRoot(target) }");
    // The locator check rides every authoring call; the reviewer, judges, writer and storyteller read the cited extract.
    expect(RUNNER.split("...webLocatorInput(),")).toHaveLength(3);
    expect(RUNNER).toContain("...webReviewInput(webPacks, authoredNode, lengthGuidance !== null),");
    expect(RUNNER).toContain("const webCited = webCitedExtractsOf(webPacks, authoredNodeList);");
    expect(RUNNER).toContain("source: engineSourceWithCitedExtracts(source, webCited),");
    expect(RUNNER).toContain("...(webCited.size === 0 ? {} : { citedExtracts: webCited }),");
    // No web search inside the debate: index.ts never names the search port or the store's writers.
    for (const name of ["PerplexitySearchPort", "recordPack(", "recordExtract(", ".search("]) expect(RUNNER).not.toContain(name);
    const packs = read("apps/runner/src/web-packs.ts");
    for (const name of ["search(", "recordPack(", "provider.call(", "gateway.call("]) expect(packs).not.toContain(name);
  });

  it("the runner's settings carry the boot settings beside the debate shape's", () => {
    const shapeAt = RUNNER.indexOf("readonly debateShape?: DebateShapeRunnerSettings | null;");
    expect(shapeAt).toBeGreaterThan(0);
    expect(RUNNER.indexOf("readonly engine?: EngineRunnerSettings | null;")).toBeGreaterThan(shapeAt);
  });

  it("main.ts and the practice runner read the boot settings once, after the shape's, and hand them on", () => {
    // Side-by-side spec §13: the read is the one per-version loader's (run-settings.ts), exactly once, after the shape's;
    // neither composition calls it, and both hand the version's engine on through runnerSettingsOfVersion.
    const loader = read("apps/runner/src/run-settings.ts");
    const engineRead = "const engine = await readEngineRunnerSettings(pool, version);";
    expect(loader.split(engineRead)).toHaveLength(2);
    const shapeAt = loader.indexOf("const debateShape = await readDebateShapeRunnerSettings(pool, version);");
    expect(shapeAt).toBeGreaterThan(-1);
    expect(loader.indexOf(engineRead)).toBeGreaterThan(shapeAt);
    // S6: the mapping is its own module (run-debate-members.ts), re-exported by the loader.
    expect(read("apps/runner/src/run-debate-members.ts")).toContain("engine: version.engine,");
    expect(loader).not.toContain("resolveEngineRunnerSettings(");
    for (const file of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const text = read(file);
      expect(text, file).not.toContain("readEngineRunnerSettings(");
      expect(text, file).toContain("...runnerSettingsOfVersion(siteVersionSettings),");
      expect(text, file).not.toContain("resolveEngineRunnerSettings(");
    }
  });

  // W3-5 (dig-model revision): the path rewrite is a process member beside the story, and runs only in the after-settle
  // branch, after the run's lease, in the story's place for a dig; an engine-2 contract pair sealed with the rest.
  it("the path rewrite: settings beside the story's, one call in the after-settle branch, its contracts under the engine seal", () => {
    const storyAt = RUNNER.indexOf("  readonly story?: {");
    expect(storyAt).toBeGreaterThan(0);
    expect(RUNNER.indexOf("  readonly pathRewrite?: PathRewriteRunnerSettings;")).toBeGreaterThan(storyAt);
    const leaseClosed = RUNNER.indexOf('"The runner failed inside its private-content disclosure lease"');
    const call = RUNNER.indexOf("if (!(await runDigPathRewrite(settings.pathRewrite, settled.input))) {");
    expect(call).toBeGreaterThan(leaseClosed);
    expect(RUNNER.indexOf("await storyWriter.writeAfterSettle(", call)).toBeGreaterThan(call);
    const contracts = read("apps/runner/src/engine-contracts.ts");
    expect(contracts.indexOf("...PATH_REWRITE_SEALED_CONTRACTS")).toBeGreaterThan(contracts.indexOf("...WEB_WORDING_V2_SEALED_CONTRACTS"));
  });

  // W3-7: the rewrite is switched on in the shipped runner, and its calls are charged on the never-walled PATH_REWRITE seam.
  it("main.ts composes the path rewrite, hands it to the runner, runs its sweep, and charges it on W3-2's pathRewriteSeam", () => {
    const main = read("apps/runner/src/main.ts").replace(/\s+/gu, " ");
    expect(main).toContain("const pathRewrite = composePathRewrite({ pool, targets: providerTargets,");
    expect(main).toContain("...(pathRewrite === undefined ? {} : { pathRewrite: pathRewrite.settings }),");
    expect(main).toContain("buildPathRewriteCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).pathRewriteSeam({ runId, price, requireReportedUsage: true })");
    expect(main.indexOf("startPathRewriteSweep(")).toBeGreaterThan(main.indexOf("await worker.waitUntilReady("));
    expect(main.match(/pathRewriteSweep\?\.stop\(\);/gu)).toHaveLength(2);
    // The composition: Haiku writes and GLM checks, the store's sources, the dig's replay book, the sweep's list.
    const composition = read("apps/runner/src/path-rewrite-composition.ts");
    for (const piece of ['PATH_REWRITE_WRITER_MODEL = "claude-haiku-5-5"', 'PATH_REWRITE_CHECKER_MODEL = "zai-org/GLM-5.3-Flash"',
      "postgresPathRewriteSources(pool)", "new PostgresDigModelRunnerRepository(pool)", "readReplayBook(pool, runId, workItemId)",
      "picks.readUnwritten(before, limit)", "PATH_REWRITE_CARRIER", "createPathRewriteInFlight()"]) expect(composition).toContain(piece);
    // One call-site pattern: the runner's scope reads packages/story's.
    const scope = read("apps/runner/src/path-rewrite-scope.ts");
    expect(scope).toContain('from "@debateai/story"');
    expect(scope).not.toMatch(/\/\^PATH_REWRITE/u);
  });

  // Ruling R3-T14.1: R3 adds ENGINE_MAP_CHECK_UNBUDGETED in its alphabetical place beside R1d's refusal, so the pin reads
  // the declared list (both codes, in both alphabets) and its order, not one adjacency.
  it("the per-run refusals are declared diagnostic codes in both alphabets, each alphabet in sorted order", () => {
    for (const file of ["apps/runner/src/index.ts", "apps/api/src/index.ts"]) {
      const source = read(file);
      const block = source.slice(source.indexOf("// ─── BEGIN OPERATIONAL DIAGNOSTIC ALPHABET"),
        source.indexOf("// ─── END OPERATIONAL DIAGNOSTIC ALPHABET"));
      const declaration = block.slice(block.indexOf("const KNOWN_DOMAIN_CODES"));
      const codes = [...declaration.slice(declaration.indexOf("["), declaration.indexOf("]);")).matchAll(/"([A-Z][A-Z0-9_]*)"/gu)]
        .map((match) => match[1]!);
      expect(codes.length, file).toBeGreaterThan(100);
      expect(codes, file).toEqual(expect.arrayContaining(["ENGINE_RUNNER_UNCONFIGURED", "ENGINE_MAP_CHECK_UNBUDGETED"]));
      // R3 final wave P14: truly sorted, with no allowance (no pin or hash reads the order: every other reader sorts first).
      expect(codes, file).toEqual([...codes].sort());
    }
  });
});
