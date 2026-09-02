import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";

describe("production runner provider topology", () => {
  it.each([1, 2, 4])("wires all %i configured providers without a fixed panel size", (size) => {
    const targets = Array.from({ length: size }, (_, index) => Object.freeze({
      providerRef: `provider-${index + 1}`,
      maker: `maker-${index + 1}`,
      baseUrl: `http://127.0.0.1:${9200 + index}/v1`,
      model: `model-${index + 1}`
    }));
    const topology = createRunnerProviderTopology(targets, (target) => ({
      call: async () => ({
        rawArtifactRef: "raw", ledgerEntryRef: "ledger", content: "{}",
        provider: "openai-compatible-http" as const, model: target.model,
        maker: target.maker, modelVersion: target.model
      })
    }));

    expect(topology.primary.providerRef).toBe("provider-1");
    expect(topology.critique?.providerRef).toBe(size > 1 ? "provider-2" : undefined);
    expect(topology.additionalMakers.map((row) => row.providerRef)).toEqual(
      Array.from({ length: Math.max(0, size - 2) }, (_, index) => `provider-${index + 3}`)
    );
    expect([
      topology.primary,
      ...(topology.critique === undefined ? [] : [topology.critique]),
      ...topology.additionalMakers
    ].map((row) => row.maker)).toEqual(targets.map((row) => row.maker));
  });

  it("uses the exact sealed configured-provider set at the real runner entrypoint", async () => {
    const source = await readFile("apps/runner/src/main.ts", "utf8");
    expect(source).toContain("readDeploymentMakerCapability");
    expect(source).toContain("parseProviderDiscoveryTargets");
    expect(source).toContain("createRunnerProviderTopology");
    expect(source).toContain("critique: providerTopology.critique");
    expect(source).toContain("additionalMakers: providerTopology.additionalMakers");
  });

  it("loads every mandatory runner policy from the selected sealed register version", async () => {
    const source = await readFile("apps/runner/src/main.ts", "utf8");
    expect(source).toContain("readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION)");
    for (const setting of [
      "compositionRow: policy.compositionRow",
      "servePolicy:",
      "judgementPolicy: policy.judgementPolicy",
      "scoringOperator: policy.scoringOperator",
      "runDeathPolicy: policy.runDeathPolicy",
      "hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold",
      // S06 B1 (codex r1): every served answer carries a code-derived label, so
      // the sealed T16 verdict-label family is a MANDATORY entry-point setting.
      // Omitting it does not disable the label — it makes the run stop after
      // spending judgement and propagation.
      "verdictLabelPolicy: policy.verdictLabelPolicy",
      // T3C (F33): T3's panel family is mandatory at the entry point for the same
      // reason the verdict-label family is — J12's claim-time gate reads it, so a
      // shipped composition that omits it refuses every multi-maker run on a
      // correctly sealed deployment.
      "panelPolicy: policy.panelPolicy",
      // T3C / F34 (J20): DR-182 VROW-5's claim-time re-probe. Its absence is not a
      // stop — both consumers are guarded by `!== undefined` — so a shipped
      // composition that omits it degrades SILENTLY: a member pinned at ask time
      // that has gone absent is trusted and no disclosure is emitted.
      "claimTimeProbe:",
      // codex r1 B1: the entry point must compose the OBSERVE-only probe. The
      // runner persists the claim-time verdict itself in both arms, so composing
      // the persisting `probeTarget` writes one re-probe as two append-only rows
      // under two evidence refs. Only a source assertion can pin this: the
      // behavioural arm composes its own probe and so cannot see what main.ts does.
      "observeProviderTarget(",
      "holdRecorder:"
    ]) expect(source).toContain(setting);
    // codex r2 B1: a `not.toContain("probeTarget({")` token guard does NOT reach the
    // real regression. Importing the persisting helper under the expected local name
    // — `probeTarget as observeProviderTarget` — restoring a repository and passing
    // it as `probes` is buildable, writes twice, and leaves the call site reading
    // `observeProviderTarget(`. Two assertions that DO reach it:
    //
    // (1) the providers import must bind the observe-only symbol WITHOUT aliasing,
    //     so `probeTarget` cannot enter this module under any local name;
    const providersImport = source
      .split("\n")
      .find((line) => line.includes("@debateai/providers") && line.startsWith("import"));
    expect(providersImport).toBeDefined();
    expect(providersImport).toContain("observeProviderTarget");
    expect(providersImport).not.toContain("probeTarget");
    // (2) the composed probe must hand NO recorder to the probe call. The runner
    //     owns persistence; a `probes:` member here is the double write, whatever
    //     the function is called locally.
    const claimTimeProbeBlock = source.slice(
      source.indexOf("claimTimeProbe:"),
      source.indexOf("holdRecorder:")
    );
    expect(claimTimeProbeBlock).not.toContain("probes:");
    expect(claimTimeProbeBlock).toContain("observeProviderTarget(");
  });
});
