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
    // Side-by-side spec §13: the policy is read by the one per-version loader and the family is mapped by
    // runnerSettingsOfVersion (run-settings.ts), after the read; main.ts loads its site version before it constructs
    // the runner and spreads the mapping into the runner's settings.
    const loader = await readFile(new URL("../../apps/runner/src/run-settings.ts", import.meta.url), "utf8");
    const policyIndex = loader.indexOf("await readDevelopmentRunnerPolicy(pool");
    const mappingIndex = loader.indexOf("export function runnerSettingsOfVersion(");
    const wiringIndex = loader.indexOf("synthesisRolePolicy: policy.synthesisRolePolicy");
    expect(policyIndex).toBeGreaterThan(-1);
    expect(mappingIndex).toBeGreaterThan(policyIndex);
    expect(wiringIndex).toBeGreaterThan(mappingIndex);

    const loadIndex = source.indexOf("const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);");
    const constructionIndex = source.indexOf("new WalkingSkeletonRunner");
    const spreadIndex = source.indexOf("...runnerSettingsOfVersion(siteVersionSettings),");
    expect(loadIndex).toBeGreaterThan(-1);
    expect(constructionIndex).toBeGreaterThan(loadIndex);
    expect(spreadIndex).toBeGreaterThan(constructionIndex);
    // Never assembled at the call site out of parts this file chose.
    expect(source).not.toMatch(/synthesisRolePolicy:\s*\{/u);
    expect(loader).not.toMatch(/synthesisRolePolicy:\s*\{/u);
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
    // A17: both roles' packets come from the ONE exported builder, which the
    // replay tool calls too — a replayed prompt is the live prompt by construction.
    expect(source).toContain("export function buildSynthesisRolePrompt(");
    // Debate shape (Task 14): the writer's call adds the row's answer length as a fourth argument; both still build here.
    expect(source.split("buildSynthesisRolePrompt(request, run.argumentLanguageName").length - 1).toBe(2);
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

  /**
   * Role rotation (spec 2026-10-11 Part 6): the runner-level rows live in
   * tests/integration/database.test.ts, which CI does not run, so the wiring is
   * also pinned here by name. A rotated run's per-claim policy carries the pin's
   * two answer refs, and every per-run use reads that one value; the pre-claim
   * J24 (2) check keeps the sealed refs. A pin that does not read, sits beside a
   * scorecard assignment or leaves the panel is a terminal refusal; a database
   * error is not.
   */
  it("swaps the sealed answer refs for a rotated run's pinned ones, per claim only (role rotation)", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/index.ts", import.meta.url),
      "utf8"
    );
    const claim = source.indexOf("const claimed = workItemId === undefined");
    const read = source.indexOf("rotationPin = await readRunRoleRotation(this.pool, run.runId);");
    const assignment = source.indexOf("const pinnedRoleAssignment = await readRunRoleAssignment(this.pool, run.runId);");
    const firstProbe = source.indexOf("const probe = await this.settings.claimTimeProbe(member);");
    expect(claim).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(assignment);
    expect(assignment).toBeGreaterThan(claim);
    // Read before any member is probed: a refused pin costs no probe and no call.
    expect(firstProbe).toBeGreaterThan(read);
    const guard = source.slice(read, firstProbe);
    expect(guard).toContain('if (rotationPin !== null && roleAssignment !== null) throw new TypeError("BOTH_PINS");');
    expect(guard).toContain("if (!pinned.every((role) => panelRefs.has(role.providerRef))) throw new TypeError(\"PIN_OFF_PANEL\");");
    expect(guard).toContain("if (!(error instanceof TypeError)) throw error;");
    expect(guard).toContain('reason: "RUN_ROLE_ROTATION_INVALID"');
    expect(guard).toContain('throw new TypedDomainError("RUN_ROLE_ROTATION_INVALID",');
    // The per-claim policy: the boot policy with the two answer refs replaced (by the pin's, or by a role's
    // stand-in), nothing else.
    expect(source).toContain(
      "const synthesisRolePolicy = this.settings.synthesisRolePolicy === undefined || rotationPin === null || rotationStandIns === null"
    );
    expect(source).toContain("synthesizerRoleRef: rotationStandIns.writerRef ?? rotationPin.answerWriter.providerRef,");
    expect(source).toContain("evaluatorRoleRef: rotationStandIns.checkerRef ?? rotationPin.answerChecker.providerRef");
    // The serve chain reads the per-claim policy, never the boot one.
    expect(source).toContain("const synthesisRoles = synthesisRolePolicy;");
    expect(source).not.toContain("const synthesisRoles = this.settings.synthesisRolePolicy;");
    // The pre-claim J24 (2) check still names the sealed refs.
    expect(source).toContain("? this.settings.synthesisRolePolicy.synthesizerRoleRef");
    expect(source).toContain(": this.settings.synthesisRolePolicy.evaluatorRoleRef;");
  });

  /**
   * Role rotation, Task 11 (orchestrator ruling 2026-10-11, "always an answer"): a pinned answer member that is not
   * claim-eligible hands its role to the SEALED register ref, only when the debate's estimate covers that ref
   * (`answerRoleFallbackCovered`), BEFORE today's off-panel probe and J24 refusal run on the per-claim policy. The
   * disclosure keeps the pin as planned and receives the stand-ins, so the stand-in is a fallback for ROLE_UNAVAILABLE.
   */
  it("lets the sealed answer role stand in for an unavailable pinned member, before today's probe and J24 (Task 11)", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const standIn = source.indexOf("const standInFor = (pinnedRef: string, sealedRef: string): string | null =>");
    const policy = source.indexOf("const synthesisRolePolicy = this.settings.synthesisRolePolicy === undefined");
    const probe = source.indexOf("const sealedRefRoles = SYNTHESIS_ROLES.filter((role) => {");
    const refusal = source.indexOf("reason: `SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:${role}`");
    expect(standIn).toBeGreaterThan(-1);
    expect(policy).toBeGreaterThan(standIn);
    expect(probe).toBeGreaterThan(policy);
    expect(refusal).toBeGreaterThan(probe);
    const rule = source.slice(standIn, policy);
    // Only for a member not claim-eligible, never the pinned ref itself, only a panel REF (Task 12: never an off-panel
    // route the estimate did not count or a probe the panel did not run), and only when the estimate covers the ref.
    expect(rule).toContain("configuredMakers.some((maker) => maker.providerRef === pinnedRef) || sealedRef === pinnedRef");
    expect(rule).toContain("|| !run.discoveredPanel.some((member) => member.provider_ref === sealedRef)");
    expect(rule.indexOf("|| !run.discoveredPanel.some((member) => member.provider_ref === sealedRef)"))
      .toBeLessThan(rule.indexOf("this.settings.answerRoleFallbackCovered?.("));
    expect(rule).toContain("|| !(this.settings.answerRoleFallbackCovered?.({ roleRef: sealedRef, panel: run.discoveredPanel }) ?? true)");
    expect(rule).toContain("standInFor(rotationPin.answerWriter.providerRef, this.settings.synthesisRolePolicy.synthesizerRoleRef)");
    expect(rule).toContain("standInFor(rotationPin.answerChecker.providerRef, this.settings.synthesisRolePolicy.evaluatorRoleRef)");
    // The disclosure plans the pin's refs and is told the stand-ins.
    expect(source).toContain(": { writerRef: rotationPin.answerWriter.providerRef, checkerRef: rotationPin.answerChecker.providerRef },");
    expect(source).toContain("...(rotationStandIns === null ? {} : { standIns: rotationStandIns })");
    // The preview's runner answers the money question with the preview's own rule.
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    expect(main).toContain("previewSealedRoleFallbackCovered(roleRef, panel)");
  });

  /**
   * Task 12 item 7: on a rotated run the J24 refusal names a PINNED ref as pinned, never as sealed (only a ref that
   * is not the role's pin, i.e. today's register ref or its stand-in, is called sealed).
   */
  it("the J24 refusal calls a pinned ref pinned, not sealed (Task 12)", async () => {
    const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    const refusal = source.indexOf("reason: `SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM:${role}`");
    const j24 = source.slice(source.lastIndexOf("for (const role of sealedRefRoles) {", refusal), source.indexOf("// A15: the same refusal", refusal));
    expect(j24).toContain("const refKind = rotationPin !== null && roleRef === (role === \"SYNTHESIZER\" ? rotationPin.answerWriter : rotationPin.answerChecker).providerRef");
    expect(j24).toContain("`J24: the ${refKind} ${role} role ref ${roleRef} was ");
    expect(j24).not.toContain("`J24: the sealed ${role} role ref ${roleRef} was ");
  });
});
