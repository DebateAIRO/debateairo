import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * T9 × board F33 (the S06 codex r1 B1 class): the SHIPPED entry point must
 * LOAD and PASS every register family the run reads.
 *
 * F33 recorded what happens otherwise: `panelPolicy` was sealed, read by T16's
 * reader, consumed by the runner — and never loaded by `main.ts`, so the real
 * process would have refused every work item at claim time while every test
 * that constructed the runner by hand passed. The synthesis-role family is on
 * exactly the same footing, and it binds at EVERY maker count, so the flagship
 * run would refuse before its first model call.
 *
 * These assertions are about the shipped FILES, deliberately: no unit test that
 * builds its own settings object can see this defect, because supplying the
 * setting is precisely what such a test does.
 */
describe("T9 production entry point wiring", () => {
  it("reads the sealed synthesis-role family through T16's own reader in the runner policy", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/dev-runner-policy.ts", import.meta.url),
      "utf8"
    );
    const importIndex = source.indexOf("readSynthesisRoleControls");
    const readIndex = source.indexOf("await readSynthesisRoleControls(pool, registerVersion)");
    const returnIndex = source.indexOf("synthesisRolePolicy: Object.freeze({");

    expect(importIndex).toBeGreaterThan(-1);
    expect(readIndex).toBeGreaterThan(importIndex);
    expect(returnIndex).toBeGreaterThan(readIndex);
    // The policy is READ, never restated: no literal role ref and no literal
    // loop bound may appear in the deployment's policy reader.
    expect(source).not.toMatch(/evaluatorLoopMaxRounds:\s*\d/u);
    expect(source).not.toMatch(/synthesizerRoleRef:\s*"/u);
    expect(source).not.toMatch(/evaluatorRoleRef:\s*"/u);
    // The provenance pin is the same one the verdict-label family gets.
    expect(source).toContain("synthesisRoles.sourceRefs");
    expect(source).toContain("DEV_RUNNER_POLICY_PROVENANCE_INVALID");
  });

  it("passes the family from main.ts into the runner it constructs", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/main.ts", import.meta.url),
      "utf8"
    );
    const policyIndex = source.indexOf("await readDevelopmentRunnerPolicy(pool");
    const constructionIndex = source.indexOf("new WalkingSkeletonRunner");
    const wiringIndex = source.indexOf("synthesisRolePolicy: policy.synthesisRolePolicy");

    expect(policyIndex).toBeGreaterThan(-1);
    expect(constructionIndex).toBeGreaterThan(policyIndex);
    expect(wiringIndex).toBeGreaterThan(constructionIndex);
    // Never assembled at the call site out of parts this file chose.
    expect(source).not.toMatch(/synthesisRolePolicy:\s*\{/u);
  });

  it("refuses at CLAIM TIME, before the work item and before any model call", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/index.ts", import.meta.url),
      "utf8"
    );
    const gateIndex = source.indexOf("if (this.settings.synthesisRolePolicy === undefined) {");
    const claimIndex = source.indexOf("const claimInput = { workerId: this.settings.workerId");
    const verdictGateIndex = source.indexOf("if (this.settings.verdictLabelPolicy === undefined) {");

    expect(gateIndex).toBeGreaterThan(-1);
    // The gate stands beside J12's and T11's, and BEFORE the claim.
    expect(gateIndex).toBeGreaterThan(verdictGateIndex);
    expect(claimIndex).toBeGreaterThan(gateIndex);
    expect(source).toContain("SYNTHESIS_ROLE_CONTROLS_UNRESOLVED");
    // The role ref resolves to a configured provider by LOOKUP, never by
    // position: "the first configured provider" is exactly the substitution
    // the sealed row exists to prevent (T10's lesson, at the role seam).
    expect(source).toContain("SYNTHESIS_ROLE_PROVIDER_UNRESOLVED");
    expect(source).toContain("this.#configuredMakers.find((maker) => maker.providerRef === roleRef)");
    expect(source).not.toContain("this.#configuredMakers[0]!.providerRef === roleRef");
  });

  it("calls both roles under their own named provider roles", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/index.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain('role: "SYNTHESIZER"');
    expect(source).toContain('role: "EVALUATOR"');
    // The retired organs no longer make serve-path calls.
    expect(source).not.toContain('callSiteKey: `COMPOSER:${attempt}`');
    expect(source).not.toContain('callSiteKey: `POST_COMPOSE_R9:${compositionAttempt}`');

    const roles = await readFile(
      new URL("../../packages/providers/src/index.ts", import.meta.url),
      "utf8"
    );
    expect(roles).toContain('"SYNTHESIZER"');
    expect(roles).toContain('"EVALUATOR"');
  });
});
