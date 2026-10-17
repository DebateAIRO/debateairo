// tests/unit/lg-a-repair-wiring.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifyStructuredArtifact } from "@debateai/judgement";
import {
  PREVIEW_STRUCTURE_REPAIR_MODEL, ProviderCallFailedError, ProviderContentUnacceptedError, ProviderStructureUnrepairedError, STRUCTURE_REPAIR_PASSED_STOPS,
  STRUCTURE_SALVAGE_REPAIRS, buildFramedPrompt, buildFramedRepairPrompt, previewStructureRepairCeiling, previewStructureRepairRoute,
  replyWordCount, schemaFailureLocator, structureSalvageFor, withStructureRepair, type ContentClassification, type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import { RUN_COST_ENVELOPE_ROOM_KEPT } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { mapPromptContractHash } from "@debateai/map";
import { expansionPhaseStop } from "@debateai/runner";
import { providerCallSharedWall, storyCallScopeAgrees } from "../../apps/runner/src/index.js";
import { createRunnerMapCaller, runMapStage } from "../../apps/runner/src/map-stage.js";
import { laneGateway, structureRepairThroughLane } from "../../apps/runner/src/call-lane-gateway.js";
import { CALL_LANE_STOPPED, createCallScheduler, slotsTakenWithin, type CallSubject } from "../../apps/runner/src/call-scheduler.js";
import { GLM, HAIKU_REF, STOP, previewGlmHarness, scriptedRepairGateway } from "../support/lg-a-harness.js";
import { BASE, ECHO, ECHO_NOTES, KEYLESS, PANEL_KEY, panelRequest } from "../support/structure-salvage-shapes.js";

const haikuGateway: ProviderGateway = { call: async () => { throw new Error("not called"); } };
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
      // Task 14 carry: root 0's room adds the repair call (the sum), at the most the money seam can project for it.
      expect(source, path).toContain("structureRepairCeiling: previewStructureRepairCeiling(structureRepairRoute),");
    }
  });

  it("Task 14 carry: the most one repair call can be projected at is the preview's whole body and the route's token ceiling", () => {
    const route = previewStructureRepairRoute([{ providerRef: "preview:claude-haiku-5-5", model: "claude-haiku-5-5" }], () => haikuGateway);
    expect(previewStructureRepairCeiling(route)).toEqual({ providerRef: "preview:claude-haiku-5-5", requestBytes: 256 * 1024, completionTokenCeiling: 32768 });
    expect(previewStructureRepairCeiling(null)).toBeNull();
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

/**
 * Carried from Task 12: the repair call must never break the owner's parallel-call limits (spec 2026-10-12 §3.2: 12 per
 * debate, 3 per AI in a debate, 150 DeepInfra / 50 Haiku across the runner, each gate's slots). It is made inside the
 * original call's lane slot, so it asks the lane only for the repair model's slots the original does not hold.
 */
describe("LG-A: the repair call through the debate's lane", () => {
  const GLM_SUBJECT: CallSubject = Object.freeze({ model: GLM, vendor: "deepinfra", gate: "deepinfra" });
  const HAIKU_SUBJECT: CallSubject = Object.freeze({ model: "claude-haiku-5-5", vendor: "anthropic", gate: "anthropic" });
  const SONNET_SUBJECT: CallSubject = Object.freeze({ model: "claude-sonnet", vendor: "anthropic", gate: "anthropic" });
  const OWNER = Object.freeze({ perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } });
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => { resolve = res; });
    return { promise, resolve };
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const ticket = (subject: CallSubject) => ({ ...subject, priority: "AUTHOR" as const });

  it("takes only the slots the running call does not hold, never a debate slot", () => {
    expect(slotsTakenWithin(GLM_SUBJECT, HAIKU_SUBJECT)).toEqual({ debate: false, model: true, gate: true });
    expect(slotsTakenWithin(HAIKU_SUBJECT, HAIKU_SUBJECT)).toEqual({ debate: false, model: false, gate: false });
    expect(slotsTakenWithin(SONNET_SUBJECT, HAIKU_SUBJECT)).toEqual({ debate: false, model: true, gate: false });
    expect(slotsTakenWithin({ ...GLM_SUBJECT, gate: null }, { ...HAIKU_SUBJECT, gate: null })).toEqual({ debate: false, model: true, gate: false });
  });

  it("waits for one of Haiku's 3 slots in the debate when Haiku also argues, never for a debate slot", async () => {
    const scheduler = createCallScheduler({ policy: { ...OWNER, perDebate: 4 } });
    const lane = scheduler.openLane("run:limits");
    const haikuCalls = [deferred(), deferred(), deferred()];
    const running = haikuCalls.map((call) => lane.run(ticket(HAIKU_SUBJECT), () => call.promise));
    let repaired = false;
    const glm = lane.run(ticket(GLM_SUBJECT), () => lane.runWithin(GLM_SUBJECT, ticket(HAIKU_SUBJECT), async () => { repaired = true; }));
    await flush();
    // The debate's 4 slots are all taken (3 Haiku, 1 GLM) and Haiku has its 3: the repair waits for a Haiku slot only.
    expect(lane.stats().running).toBe(4);
    expect(repaired).toBe(false);
    expect(scheduler.stats().peakByModel["claude-haiku-5-5"]).toBe(3);
    haikuCalls[0]!.resolve();
    await glm;
    expect(repaired).toBe(true);
    // Never 4 Haiku POSTs at once in the debate.
    expect(lane.stats().peakByModel["claude-haiku-5-5"]).toBe(3);
    haikuCalls.slice(1).forEach((call) => { call.resolve(); });
    await Promise.all(running);
    expect(lane.stats().running).toBe(0);
  });

  it("waits for the Anthropic gate's slot held by another debate, and is never held back by the start guard", async () => {
    const scheduler = createCallScheduler({ policy: OWNER });
    scheduler.setGateCapacity("anthropic", 1);
    const other = scheduler.openLane("run:other");
    const otherHaiku = deferred();
    const busy = other.run(ticket(HAIKU_SUBJECT), () => otherHaiku.promise);
    const lane = scheduler.openLane("run:gate");
    let repaired = false;
    const original = deferred();
    // A call already running asks for its repair after the debate's start guard has closed (arguing stopped).
    const glm = lane.run(ticket(GLM_SUBJECT), async () => {
      await original.promise;
      await lane.runWithin(GLM_SUBJECT, ticket(HAIKU_SUBJECT), async () => { repaired = true; });
    });
    await flush();
    lane.guardStarts(() => false);
    original.resolve();
    await flush();
    expect(repaired).toBe(false);
    expect(scheduler.stats().peakByGate.anthropic).toBe(1);
    otherHaiku.resolve();
    await Promise.all([busy, glm]);
    expect(repaired).toBe(true);
    expect(scheduler.stats().peakByGate.anthropic).toBe(1);
    expect(lane.stats().heldBack).toBe(0);
  });

  it("a Haiku call's own repair takes nothing more, so Haiku at its limit never waits on itself", async () => {
    const scheduler = createCallScheduler({ policy: { ...OWNER, perModelPerDebate: 1 } });
    scheduler.setGateCapacity("anthropic", 1);
    const lane = scheduler.openLane("run:self");
    const done = await lane.run(ticket(HAIKU_SUBJECT), () => lane.runWithin(HAIKU_SUBJECT, ticket(HAIKU_SUBJECT), async () => "repaired"));
    expect(done).toBe("repaired");
    expect(scheduler.stats().peakByModel["claude-haiku-5-5"]).toBe(1);
  });

  it("the route's gateway asks the lane of the call it repairs; outside a lane it is the route's gateway", async () => {
    const subjects = { subjectOf: (providerRef: string): CallSubject => (providerRef === HAIKU_REF ? HAIKU_SUBJECT : GLM_SUBJECT) };
    const calls: string[] = [];
    const haiku: ProviderGateway = { call: async (request) => { calls.push(request.callSiteKey); return { content: "{}" } as never; } };
    const route = structureRepairThroughLane({ providerRef: HAIKU_REF, gateway: haiku, bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } }, subjects)!;
    expect(structureRepairThroughLane(null, subjects)).toBeNull();
    expect(route).toMatchObject({ providerRef: HAIKU_REF, bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } });
    await route.gateway.call({ callSiteKey: "REPAIR:STRUCTURE:JUDGE" } as ProviderCallRequest);
    expect(calls).toEqual(["REPAIR:STRUCTURE:JUDGE"]);

    const scheduler = createCallScheduler({ policy: { ...OWNER, perModelPerDebate: 1 } });
    const lane = scheduler.openLane("run:route");
    const heldHaiku = deferred();
    const haikuArgues = lane.run(ticket(HAIKU_SUBJECT), () => heldHaiku.promise);
    const admitted: string[] = [];
    const member = laneGateway({ lane, scheduler, subject: GLM_SUBJECT,
      provider: { call: (request) => route.gateway.call({ ...request, callSiteKey: `REPAIR:STRUCTURE:${request.callSiteKey}` }) },
      beforeSlot: async (subject) => { admitted.push(subject.model); } });
    const repair = member.call({ callSiteKey: "JUDGE" } as ProviderCallRequest);
    await flush();
    // The debate's one Haiku slot is taken: the repair waits for it (after the busy coordinator admitted it).
    expect(admitted).toEqual([GLM, "claude-haiku-5-5"]);
    expect(calls).toEqual(["REPAIR:STRUCTURE:JUDGE"]);
    heldHaiku.resolve();
    await Promise.all([haikuArgues, repair]);
    expect(calls).toEqual(["REPAIR:STRUCTURE:JUDGE", "REPAIR:STRUCTURE:JUDGE"]);
    expect(lane.stats().peakByModel["claude-haiku-5-5"]).toBe(1);
  });
});

/**
 * Task 13 review, finding 1: a repair that meets a stop of the run's own machinery keeps that stop's name. The debate's
 * lane stopped while the repair waited for a slot, or the money seam kept root 0's room: the call was sent and billed,
 * so it must never be filed as the AI's content failure (the map would record FAILED instead of STOPPED).
 */
describe("LG-A: a repair stopped by the run keeps the stop's name", () => {
  const GLM_SUBJECT: CallSubject = Object.freeze({ model: GLM, vendor: "deepinfra", gate: "deepinfra" });
  const HAIKU_SUBJECT: CallSubject = Object.freeze({ model: "claude-haiku-5-5", vendor: "anthropic", gate: "anthropic" });
  const subjects = { subjectOf: (providerRef: string): CallSubject => (providerRef === HAIKU_REF ? HAIKU_SUBJECT : GLM_SUBJECT) };
  const BOUND = Object.freeze({ tokenCeiling: 32768, deadlineMs: 1_260_000 });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("names the stops it passes after their owners' constants", () => {
    expect(STRUCTURE_REPAIR_PASSED_STOPS).toEqual([CALL_LANE_STOPPED, RUN_COST_ENVELOPE_ROOM_KEPT]);
  });

  it("the lane stopped while the repair waited for Haiku's slot: the call ends CALL_LANE_STOPPED, nothing sent to Haiku", async () => {
    const scheduler = createCallScheduler({ policy: { perDebate: 12, perModelPerDebate: 1, perModelPerRunner: { default: 50 } } });
    const lane = scheduler.openLane("run:stop");
    let releaseHaiku!: () => void;
    const haikuArgues = lane.run({ ...HAIKU_SUBJECT, priority: "AUTHOR" }, () => new Promise<void>((resolve) => { releaseHaiku = resolve; }));
    const original = previewGlmHarness([{ content: BROKEN }]);
    const repair = scriptedRepairGateway(COPY);
    const admitted: string[] = [];
    const member = laneGateway({ lane, scheduler, subject: GLM_SUBJECT,
      provider: withStructureRepair(original.gateway, structureRepairThroughLane({ providerRef: HAIKU_REF, gateway: repair.gateway, bound: BOUND }, subjects)),
      beforeSlot: async (subject) => { admitted.push(subject.model); } });
    const ended = member.call(request()).catch((caught: unknown) => caught);
    for (let tries = 0; tries < 100 && !admitted.includes("claude-haiku-5-5"); tries += 1) await flush();
    await flush();
    expect(admitted).toEqual([GLM, "claude-haiku-5-5"]);
    expect(original.executions).toHaveLength(1);
    lane.stop();
    const error = await ended;
    expect(error).toBeInstanceOf(TypedDomainError);
    expect(error).toMatchObject({ code: CALL_LANE_STOPPED });
    expect(error).not.toBeInstanceOf(ProviderContentUnacceptedError);
    expect(repair.requests).toHaveLength(0);
    releaseHaiku();
    await haikuArgues;
  });

  it("a repair refused only for root 0's room ends RUN_COST_ENVELOPE_ROOM_KEPT, the room carried on the repair", async () => {
    const original = previewGlmHarness([{ content: BROKEN }]);
    const repair = scriptedRepairGateway(new TypedDomainError(RUN_COST_ENVELOPE_ROOM_KEPT, "room kept"));
    const error = await withStructureRepair(original.gateway, { providerRef: HAIKU_REF, gateway: repair.gateway, bound: BOUND })
      .call({ ...request(), keepRoomMicros: 5_000 }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: RUN_COST_ENVELOPE_ROOM_KEPT });
    expect(error).not.toBeInstanceOf(ProviderContentUnacceptedError);
    expect(repair.requests[0]).toMatchObject({ callSiteKey: "REPAIR:STRUCTURE:JUDGE", keepRoomMicros: 5_000 });
  });

  for (const code of [RUN_COST_ENVELOPE_ROOM_KEPT, CALL_LANE_STOPPED]) {
    it(`the map reads a repair stopped by ${code} as STOPPED, never FAILED`, async () => {
      // The map AI's reply is a structure the fixer cannot repair; the repair call meets the stop.
      const original: ProviderGateway = { call: async (call) => {
        if (call.structureRepairRouted !== true) throw new Error("the map call was not routed");
        throw new ProviderStructureUnrepairedError({ rawText: "{\"angles\": [", parseStatus: "SCHEMA_FAILED", parseError: "angles@$" }, 1,
          "artifact:map", "ledger:map", { provider: "openai-compatible-http", model: GLM, maker: "Z.AI", modelVersion: GLM });
      } };
      const repair = scriptedRepairGateway(new TypedDomainError(code, code));
      const provider = withStructureRepair(original, { providerRef: HAIKU_REF, gateway: repair.gateway, bound: BOUND });
      const caller = createRunnerMapCaller({
        runId: "run-1", subjectItemId: "wi-1", mapContractHash: mapPromptContractHash(),
        judgeBound: { maxAttempts: 3, tokenCeiling: 8_192, deadlineMs: 60_000 }, longBounds: { merge: 32_768, choose: 32_768 },
        memberOf: (aiRef) => ({ provider, providerRef: aiRef }), sitsOut: () => false, satOutBy: () => false,
        spendStopOf: (error) => expansionPhaseStop(error), abandon: () => false, serial: true, keepRoomMicros: 5_000,
        laneStopped: (error) => error instanceof TypedDomainError && error.code === CALL_LANE_STOPPED,
        roomKept: (error) => error instanceof TypedDomainError && error.code === RUN_COST_ENVELOPE_ROOM_KEPT
      });
      const result = await runMapStage({ opening: "ANGLE_MAP", map: {
        questionLine: "Should buses be free?", languageName: "English", languageTag: "en",
        seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }, { aiRef: "c", maker: "mc" }],
        caller, seed: "run-1", gapRoundsMax: 1, maxAnswers: 3, pointsPerAnswer: 2
      } });
      expect(repair.requests).toHaveLength(1);
      expect(caller.stopped()).toBe(true);
      expect(caller.spendStop()).toBeNull();
      expect(result.stoppedBy).toBe(code);
    });
  }
});

/** Task 13 review, finding 2: a call made for a running call takes a freed slot before any lane's new call. */
describe("LG-A: a waiting repair goes first", () => {
  it("takes Haiku's freed slot before another debate's Haiku call that waited longer; run calls keep their order", async () => {
    const HAIKU: CallSubject = Object.freeze({ model: "claude-haiku-5-5", vendor: "anthropic", gate: null });
    const GLM_SUBJECT: CallSubject = Object.freeze({ model: GLM, vendor: "deepinfra", gate: null });
    const scheduler = createCallScheduler({ policy: { perDebate: 12, perModelPerDebate: 3, perModelPerRunner: { default: 50, anthropic: 1 } } });
    const laneA = scheduler.openLane("run:a");
    const laneB = scheduler.openLane("run:b");
    const started: string[] = [];
    let releaseFirst!: () => void;
    const first = laneA.run({ ...HAIKU, priority: "AUTHOR" }, () => new Promise<void>((resolve) => { releaseFirst = resolve; }));
    const other = laneB.run({ ...HAIKU, priority: "AUTHOR" }, async () => { started.push("other debate's Haiku call"); });
    const glm = laneA.run({ ...GLM_SUBJECT, priority: "AUTHOR" },
      () => laneA.runWithin(GLM_SUBJECT, { ...HAIKU, priority: "AUTHOR" }, async () => { started.push("repair"); }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual([]);
    releaseFirst();
    await Promise.all([first, other, glm]);
    expect(started).toEqual(["repair", "other debate's Haiku call"]);
  });

  it("takes Haiku's freed slot before its own debate's Haiku call that waited longer", async () => {
    const HAIKU: CallSubject = Object.freeze({ model: "claude-haiku-5-5", vendor: "anthropic", gate: null });
    const GLM_SUBJECT: CallSubject = Object.freeze({ model: GLM, vendor: "deepinfra", gate: null });
    const scheduler = createCallScheduler({ policy: { perDebate: 12, perModelPerDebate: 1, perModelPerRunner: { default: 50 } } });
    const lane = scheduler.openLane("run:a");
    const started: string[] = [];
    let releaseFirst!: () => void;
    const first = lane.run({ ...HAIKU, priority: "AUTHOR" }, () => new Promise<void>((resolve) => { releaseFirst = resolve; }));
    const next = lane.run({ ...HAIKU, priority: "AUTHOR" }, async () => { started.push("next Haiku call"); });
    const glm = lane.run({ ...GLM_SUBJECT, priority: "AUTHOR" },
      () => lane.runWithin(GLM_SUBJECT, { ...HAIKU, priority: "OTHER" }, async () => { started.push("repair"); }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFirst();
    await Promise.all([first, next, glm]);
    expect(started).toEqual(["repair", "next Haiku call"]);
  });
});

describe("A1 before the repair call", () => {
  const panel = (): ProviderCallRequest => panelRequest(request());
  const ROUTE_BOUND = { tokenCeiling: 32768, deadlineMs: 1_260_000 };

  it.each([["echo", ECHO], ["echo with notes", ECHO_NOTES], ["keyless", KEYLESS]])(
    "A's reply keeps the original AI as author: the original row OK, no REPAIR:STRUCTURE row (%s)", async (_name, broken) => {
      const original = previewGlmHarness([{ content: broken }]);
      const repair = scriptedRepairGateway(new Error("the repair model must not be asked"));
      const result = await withStructureRepair(original.gateway, { providerRef: HAIKU_REF, gateway: repair.gateway, bound: ROUTE_BOUND })
        .call(panel());
      expect(repair.requests).toHaveLength(0);
      expect(original.executions).toHaveLength(1);
      expect(result.content).toBe(JSON.stringify(BASE));
      expect(result).toMatchObject({ model: GLM, repairAttempts: 0, rawArtifactRef: original.artifacts[0]!.artifactId,
        ledgerEntryRef: original.ledger[0]!.attemptId });
      expect(result.repairForm).toBeUndefined();
      expect(original.ledger.map((row) => [row.callSiteKey, row.outcome])).toEqual([[PANEL_KEY, "OK"]]);
      expect(original.artifacts[0]).toMatchObject({ parseStatus: "PARSED", replyForm: "ORIGINAL", replyFailureClass: null });
      // The artifact keeps the vendor's whole body (`index.ts:2182, 2331`); its message is the AI's own reply, byte for byte
      // (pre-flight PF-S5).
      expect((JSON.parse(original.artifacts[0]!.rawText) as { choices: { message: { content: string } }[] }).choices[0]!.message.content)
        .toBe(broken);
      expect(original.artifacts[0]!.replyRepairs!.some((name) => (STRUCTURE_SALVAGE_REPAIRS as readonly string[]).includes(name))).toBe(true);
      // Fix round 1 (Minor 2): the artifact's words are counted on what was accepted, never on the broken reply.
      expect(original.artifacts[0]!.actualWords).toBe(replyWordCount(JSON.stringify(BASE), STOP));
      expect(result.actualWords).toBe(replyWordCount(JSON.stringify(BASE), STOP));
    });

  it("A1 needs no Haiku: with the repair gateway throwing, the three shapes are still accepted", async () => {
    for (const broken of [ECHO, ECHO_NOTES, KEYLESS]) {
      const original = previewGlmHarness([{ content: broken }]);
      const dead = scriptedRepairGateway(new ProviderCallFailedError(new Error("gate halted"), 1, "FAILED", "ledger:haiku"));
      const result = await withStructureRepair(original.gateway, { providerRef: HAIKU_REF, gateway: dead.gateway, bound: ROUTE_BOUND })
        .call(panel());
      expect(result.content).toBe(JSON.stringify(BASE));
    }
  });

  it("an unrouted call (no route) never runs A1, though a salvage exists for its request: today's loop, byte for byte", async () => {
    // The salvage is real for this request (so the 2 POSTs below are the routing rule, never a shape A1 cannot read); this
    // line also makes the test fail first, on `structureSalvageFor` (pre-flight PF-S18).
    expect(structureSalvageFor(panel())?.(KEYLESS, STOP)?.content).toBe(JSON.stringify(BASE));
    const original = previewGlmHarness([{ content: KEYLESS }, { content: JSON.stringify(BASE) }]);
    await withStructureRepair(original.gateway, null).call(panel());
    expect(original.executions).toHaveLength(2);
  });
});

describe("A1 reads every reply to the original question, never a cut-off one (fix round 1)", () => {
  const ROUTE_BOUND = { tokenCeiling: 32768, deadlineMs: 1_260_000 };
  const WRITER_KEY = "COMPOSER:SYNTHESIZER:INITIAL:1";
  const WRITER_FORM = "Return only JSON {\"answer\": string, \"basis\": {\"score\": number, \"source\": string}}.";
  const WRITER_SCHEMA = z.object({ answer: z.string().min(1), basis: z.object({ score: z.number(), source: z.string() }).strict() }).strict();
  const writerFramed = buildFramedPrompt({ contract: { contractId: "test.lg-a.writer.v1", instruction: "Write the answer in one sentence.",
    answerForm: WRITER_FORM }, material: [{ name: "question", content: "Is it so?" }] });
  /** An answer-writer-shaped call: its key, its frame (the step keeps every stated text: "anywhere") and its own strict check. */
  const writer = (): ProviderCallRequest => ({ ...request(), callSiteKey: WRITER_KEY, modelRole: "ANSWER_WRITER", packet: writerFramed.packet,
    classifyContent: (content, reply) => classifyStructuredArtifact(content, WRITER_SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(writerFramed, schemaFailureLocator(rejected)) });
  const ACCEPTED = "{\"answer\":\"It is so\",\"basis\":{\"score\":0.5,\"source\":\"the city's own figures\"}}";
  /** An inner `basis` echoing the outer one's score: the step refuses it (class STRUCTURE), and A1 leaves the echo out. */
  const ECHOED = "{\"answer\": \"It is so\", \"basis\": {\"score\": 0.5, \"source\": \"the city's own figures\", \"basis\": {\"score\": 0.5}}}";

  it("a STRUCTURE reply to the length retry (the original question again) is rescued: its OK row at the original key", async () => {
    // The step refuses the reply as written and A1 rescues it, so the one OK row below is A1's, never a reply accepted as is.
    expect(writer().classifyContent!(ECHOED, STOP)).toMatchObject({ parseStatus: "SCHEMA_FAILED" });
    expect(structureSalvageFor(writer())?.(ECHOED, STOP)?.content).toBe(ACCEPTED);
    const original = previewGlmHarness([{ content: "{\"answer\": \"It is so\", \"basis\": {\"score\": 0.5, \"sour", finishReason: "length" },
      { content: ECHOED }]);
    const repair = scriptedRepairGateway(new Error("the repair model must not be asked"));
    const result = await withStructureRepair(original.gateway, { providerRef: HAIKU_REF, gateway: repair.gateway, bound: ROUTE_BOUND })
      .call(writer());
    expect(repair.requests).toHaveLength(0);
    expect(original.executions).toHaveLength(2);
    expect(result.content).toBe(ACCEPTED);
    expect(result).toMatchObject({ model: GLM, repairAttempts: 0, rawArtifactRef: original.artifacts[1]!.artifactId,
      ledgerEntryRef: original.ledger[1]!.attemptId });
    expect(result.repairForm).toBeUndefined();
    expect(original.ledger.map((row) => [row.callSiteKey, row.outcome])).toEqual([[WRITER_KEY, "FAILED"], [WRITER_KEY, "OK"]]);
    expect(original.artifacts.map((artifact) => artifact.replyFailureClass)).toEqual(["CUT_OFF", null]);
    // The retry's own reply form stays the length retry's; A1 adds its drops to the repairs, nothing else.
    expect(original.artifacts[1]).toMatchObject({ parseStatus: "PARSED", replyForm: "LENGTH_RETRY", replyRepairs: ["ECHO_DROPPED"] });
    expect(original.artifacts[1]!.actualWords).toBe(replyWordCount(ACCEPTED, STOP));
  });

  it("a reply cut off at its token ceiling is never A1's, even when its step names its refusal STRUCTURE: today's length retry", async () => {
    // A step that sets its own class wins over the gateway's reading (`classifiedContent.failureClass`), so only the hook's
    // own cut-off test keeps a truncated reply from A1. This step says STRUCTURE for every refusal.
    const own = panelRequest(request());
    const saysStructure = (content: string, reply?: Parameters<NonNullable<ProviderCallRequest["classifyContent"]>>[1]): ContentClassification => {
      const classified = own.classifyContent!(content, reply);
      return classified.parseStatus === "PARSED" ? classified : { ...classified, failureClass: "STRUCTURE" };
    };
    const panel: ProviderCallRequest = { ...own, classifyContent: saysStructure };
    expect(structureSalvageFor(panel)?.(KEYLESS, STOP)?.content).toBe(JSON.stringify(BASE));
    const original = previewGlmHarness([{ content: KEYLESS, finishReason: "length" }, { content: JSON.stringify(BASE) }]);
    const repair = scriptedRepairGateway(new Error("the repair model must not be asked"));
    const result = await withStructureRepair(original.gateway, { providerRef: HAIKU_REF, gateway: repair.gateway, bound: ROUTE_BOUND })
      .call(panel);
    expect(repair.requests).toHaveLength(0);
    expect(original.executions).toHaveLength(2);
    expect(original.ledger.map((row) => [row.callSiteKey, row.outcome])).toEqual([[PANEL_KEY, "FAILED"], [PANEL_KEY, "OK"]]);
    expect(original.artifacts[0]!.replyRepairs).toBeNull();
    expect(result).toMatchObject({ content: JSON.stringify(BASE), rawArtifactRef: original.artifacts[1]!.artifactId });
  });
});
