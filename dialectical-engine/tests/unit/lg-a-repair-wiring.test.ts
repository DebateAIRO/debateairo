// tests/unit/lg-a-repair-wiring.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifyStructuredArtifact } from "@debateai/judgement";
import {
  PREVIEW_STRUCTURE_REPAIR_MODEL, ProviderContentUnacceptedError, ProviderStructureUnrepairedError, buildFramedPrompt,
  buildFramedRepairPrompt, previewStructureRepairRoute, schemaFailureLocator, withStructureRepair,
  type ProviderCallRequest, type ProviderGateway
} from "@debateai/providers";
import { providerCallSharedWall, storyCallScopeAgrees } from "../../apps/runner/src/index.js";
import { laneGateway } from "../../apps/runner/src/call-lane-gateway.js";
import { createCallScheduler } from "../../apps/runner/src/call-scheduler.js";
import { GLM, HAIKU_REF, previewGlmHarness, scriptedRepairGateway } from "../support/lg-a-harness.js";

const haikuGateway: ProviderGateway = { call: async () => { throw new Error("not called"); } };

describe("LG-A: the preview's structure-repair route", () => {
  it("is Haiku's own gateway at its whole answer cap and the preview deadline, when Haiku is a target", () => {
    expect(PREVIEW_STRUCTURE_REPAIR_MODEL).toBe("claude-haiku-5-5");
    const targets = [{ providerRef: "preview:fixture-a", model: "zai-org/GLM-5.3-Flash" }, { providerRef: "preview:claude-haiku-5-5", model: "claude-haiku-5-5" }];
    const route = previewStructureRepairRoute(targets, (ref) => (ref === "preview:claude-haiku-5-5" ? haikuGateway : undefined));
    expect(route).toEqual({ providerRef: "preview:claude-haiku-5-5", gateway: haikuGateway, bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } });
    expect(route!.gateway).toBe(haikuGateway);
  });

  it("is null without a Haiku target, and refused when Haiku is a target with no gateway", () => {
    expect(previewStructureRepairRoute([{ providerRef: "preview:fixture-a", model: "zai-org/GLM-5.3-Flash" }], () => haikuGateway)).toBeNull();
    expect(() => previewStructureRepairRoute([{ providerRef: "preview:claude-haiku-5-5", model: "claude-haiku-5-5" }], () => undefined))
      .toThrow("STRUCTURE_REPAIR_ROUTE_INVALID");
  });

  it("the runner and the practice wrap every target's gateway, the route built from the targets", () => {
    for (const path of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("previewStructureRepairRoute(providerTargets, (providerRef) => targetGateways.get(providerRef))");
      expect(source, path).toContain("withStructureRepair(targetGateways.get(target.providerRef)!, structureRepairRoute)");
    }
  });
});

describe("LG-A: a repair call is judged by the key it repairs", () => {
  it("a story repair keeps the story's scope; nothing else may use the STORY: namespace", () => {
    expect(storyCallScopeAgrees({ lane: "story", role: "SYNTHESIZER", callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1" })).toBe(true);
    expect(storyCallScopeAgrees({ lane: "story", role: "EVALUATOR", callSiteKey: "REPAIR:STRUCTURE:STORY:CHECKER:2" })).toBe(true);
    expect(storyCallScopeAgrees({ lane: "served", role: "SYNTHESIZER", callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1" })).toBe(false);
    expect(storyCallScopeAgrees({ lane: "story", role: "EVALUATOR", callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1" })).toBe(false);
    // Today's rules, unchanged.
    expect(storyCallScopeAgrees({ lane: "story", role: "SYNTHESIZER", callSiteKey: "STORY:STORYTELLER:1" })).toBe(true);
    expect(storyCallScopeAgrees({ lane: "served", role: "JUDGE", callSiteKey: "JUDGE" })).toBe(true);
    expect(storyCallScopeAgrees({ lane: "served", role: "SYNTHESIZER", callSiteKey: "STORY:STORYTELLER:1" })).toBe(false);
  });

  it("the first position's repair is exempt from the shared wall like the first position itself", () => {
    expect(providerCallSharedWall({ lane: "served", role: "JUDGE", callSiteKey: "REPAIR:STRUCTURE:JUDGE" })).toBe("EXEMPT");
    expect(providerCallSharedWall({ lane: "served", role: "JUDGE", callSiteKey: "REPAIR:STRUCTURE:JUDGE:root:secondary" })).toBe("APPLY");
  });
});

/**
 * Carried from Task 12 (its doc comment on placement): withStructureRepair sits around each target's OWN gateway, INSIDE
 * every per-run wrapper (the sit-out book, the call lane, the cheaper-model fallback, the seat caller's backup), so
 * ProviderStructureUnrepairedError never reaches a wrapper that reads typed codes; and every wrapper between it and the
 * native gateway (the preview call policy, the counting gateway) keeps `structureRepairRouted`.
 */
describe("LG-A: where the structure repair sits", () => {
  const SCHEMA = z.object({ answer: z.string().min(1), score: z.number() }).strict();
  const framed = buildFramedPrompt({ contract: { contractId: "test.lg-a.v1", instruction: "Answer the question in one sentence.",
    answerForm: "Return only JSON {\"answer\": string, \"score\": number}." }, material: [{ name: "question", content: "Is it so?" }] });
  const request = (): ProviderCallRequest => ({ runId: "run:lg-a", subjectItemId: "node:lg-a", callSiteKey: "JUDGE", role: "JUDGE",
    lane: "served", bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:lg-a",
    providerRef: "preview:fixture-a", packet: framed.packet, modelRole: "POSITION",
    classifyContent: (content, reply) => classifyStructuredArtifact(content, SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)) });
  const BROKEN = "{\"answer\": \"It is so, by the city's own figures\" \"score\": 0.5}";
  const COPY = "{\"answer\": \"It is so, by the city's own figures\", \"score\": 0.5}";
  const throughLane = (provider: ProviderGateway, failures: unknown[]) => {
    const scheduler = createCallScheduler({ policy: { perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50 } } });
    return laneGateway({ lane: scheduler.openLane("run:lg-a"), scheduler, subject: { model: GLM, vendor: "deepinfra", gate: null },
      provider, onFailed: (error) => { failures.push(error); } });
  };

  it("the topology's member gateway is the wrapped target gateway; the run's wrappers take that member gateway", () => {
    expect(readFileSync("apps/runner/src/provider-topology.ts", "utf8")).toContain("provider: createGateway(target),");
    const runner = readFileSync("apps/runner/src/index.ts", "utf8");
    // The sit-out book and the call lane (and so every judge, fallback and seat backup built over them) wrap the member's
    // own gateway: withStructureRepair is inside all of them.
    expect(runner).toContain("const sittingOut = sitOut === null ? maker.provider : sitOut.gateway(maker.providerRef, maker.provider);");
    expect(runner).toContain("const laned = throughCallLane(maker.providerRef, sittingOut);");
    expect(runner).toContain("const provider = throughCallLane(ref, maker.provider);");
  });

  it("the preview policy and the native gateway keep the routed mark: one GLM POST, then the one repair call", async () => {
    const original = previewGlmHarness([{ content: BROKEN }, { content: COPY }]);
    const repair = scriptedRepairGateway(COPY);
    const failures: unknown[] = [];
    const member = withStructureRepair(original.gateway, { providerRef: HAIKU_REF, gateway: repair.gateway,
      bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } });
    const result = await throughLane(member, failures).call(request());
    expect(result).toMatchObject({ content: COPY, repairForm: "STRUCTURE", model: GLM });
    // Unrouted, the GLM gateway would have sent its own format repair (a second POST); routed, it stopped after one.
    expect(original.executions).toHaveLength(1);
    expect(repair.requests).toHaveLength(1);
    expect(failures).toEqual([]);
  });

  it("a repair that does not do reaches the run's wrappers as today's content refusal, never as an unrepaired structure", async () => {
    const original = previewGlmHarness([{ content: BROKEN }]);
    const repair = scriptedRepairGateway("{\"answer\": \"It is so\", \"score\": 0.5}");
    const failures: unknown[] = [];
    const member = withStructureRepair(original.gateway, { providerRef: HAIKU_REF, gateway: repair.gateway,
      bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } });
    const error = await throughLane(member, failures).call(request()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderContentUnacceptedError);
    expect(error).not.toBeInstanceOf(ProviderStructureUnrepairedError);
    expect(failures).toHaveLength(1);
    expect(failures[0]).not.toBeInstanceOf(ProviderStructureUnrepairedError);
  });
});
