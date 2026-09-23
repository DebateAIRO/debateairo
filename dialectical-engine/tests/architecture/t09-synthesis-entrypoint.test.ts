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

  /**
   * codex r1 B1: the previous version of this test asserted SOURCE ORDER — that
   * the missing-family check appears before the claim — and then separately
   * that the late resolver's strings exist. Source order is not behaviour, and
   * neither assertion could fail when a sealed ref was unresolvable.
   *
   * The three refusal DISCRIMINATORS are executed in
   * `tests/integration/database.test.ts`, against a real database and real
   * provider doubles: missing family, ref not configured (pre-claim), and
   * configured ref absent at claim (no substitution, durable role-naming event).
   * What remains here is the one property a running test cannot observe — that
   * the resolver reads the CLAIM-ELIGIBLE set rather than the unfiltered one,
   * which is the exact substitution codex r1 B1 found.
   */
  it("resolves sealed role refs against the CLAIM-ELIGIBLE providers, never the unfiltered set", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/index.ts", import.meta.url),
      "utf8"
    );
    // The resolver closes over the probed, claim-eligible list. SYNC3: dev's
    // debate tiers named that list `synthesisMakers` — the claim-eligible panel
    // plus the out-of-panel role providers the claim-time probe found HEALTHY —
    // so the pin follows the name; the property it guards is unchanged.
    expect(source).toContain("const configured = synthesisMakers.find((maker) => maker.providerRef === roleRef);");
    expect(source).toContain("const synthesisMakers = [...configuredMakers];");
    expect(source).toContain("if (healthy) synthesisMakers.push(configured);");
    // ...and never over the unfiltered membership, which is what let an
    // already-absent role provider be called.
    expect(source).not.toContain("this.#configuredMakers.find((maker) => maker.providerRef === roleRef)");
    // Both refusals exist and are distinguishable from a post-claim death.
    expect(source).toContain("SYNTHESIS_ROLE_PROVIDER_UNRESOLVED");
    expect(source).toContain("SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM");
    expect(source).toContain("SYNTHESIS_TRANSPORT_DEATH");
    // The roles are enumerated once, so a check cannot cover one and miss the other.
    expect(source).toContain('export const SYNTHESIS_ROLES = Object.freeze(["SYNTHESIZER", "EVALUATOR"] as const);');
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
