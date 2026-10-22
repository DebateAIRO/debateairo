// tests/unit/engine-map-runner.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { LENGTH_GUIDANCE_START, debateRoleFromCallSiteKey, lengthCallStepOf, lengthGuideForBounds, replyLanguageExpectation } from "@debateai/kernel";
import { previewThinkingStepOf } from "@debateai/providers";
import {
  MAP_ENGINE_LIMITS, MAP_RUNAWAY_LIMITS, mapCheckSpec, mapLimitsFor, mapListSpec, type MapChoice, type MapKeyPoint, type MapLength,
  type MapResult, type MapSpecContext
} from "@debateai/map";
import { readPromptFrame, type ProviderCallRequest, type ProviderGateway } from "@debateai/providers";
import { engineSettingsOf, engineVersionPolicyStartValues } from "@debateai/register";
import { framedJudgePromptForTest, rootPositionRequestBytesBound, type JudgeLeg } from "@debateai/judgement";
import {
  createRunnerMapCaller, engineMapCheckUnbudgeted, resolveShapeMap, rootZeroEngineMaterialCharsFor, rootZeroMapMaterialCharsFor, runMapStage, shapeEngineRootMaterial,
  type MapStageDeps
} from "../../apps/runner/src/map-stage.js";
import { shapePositionsFromMap } from "../../apps/runner/src/shape-plan.js";
import { storyAlsoRaisedFrom } from "../../apps/runner/src/story-snapshot.js";
import { engineMapScriptedContent, type EngineMapScriptOptions } from "../support/engine-map-script.js";

const LENGTH: MapLength = { targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const Q = "Should a mid-sized city make its central bus lines free to ride?";
const ctx = (engine: boolean): MapSpecContext => ({ questionLine: Q, languageName: "English", languageTag: "en", replyLanguage: replyLanguageExpectation(Q),
  length: LENGTH, ...(engine ? { engine: true as const } : {}) });

function deps(seen: ProviderCallRequest[], reply: string): MapStageDeps {
  const provider = { call: vi.fn(async (request: ProviderCallRequest) => { seen.push(request); return { content: reply }; }) } as unknown as ProviderGateway;
  return { runId: "run-1", subjectItemId: "item-1", mapContractHash: "m".repeat(64), engineContractHash: "e".repeat(64),
    judgeBound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 60_000 }, longBounds: { merge: 32_768, choose: 32_768 },
    memberOf: () => ({ provider, providerRef: "preview:a" }), sitsOut: () => false, satOutBy: () => false, spendStopOf: () => null,
    laneStopped: () => false, abandon: () => false, serial: true };
}

describe("engine 2 in the runner's map caller", () => {
  it("records the engine seal on an engine-2 call and the map seal on any other; the check is routable (LG-A)", async () => {
    const seen: ProviderCallRequest[] = [];
    // FINAL Ruling D4(b) encoding: every scripted check entry carries the required cost_can_be_named.
    const reply = JSON.stringify({ checks: [{ check_id: "a1", answers_question: true, adds_unstated_fact: false, cost_can_be_named: true, reason: null }] });
    const caller = createRunnerMapCaller(deps(seen, reply));
    const seat = { aiRef: "preview:a", maker: "maker-a" };
    await caller.call({ step: "CHECK", callSiteKey: "MAP:check", seat, order: 0, shown: ["a1"], spec: mapCheckSpec(ctx(true), [{ checkId: "a1", answer: "Yes." }]) });
    expect(seen[0]).toMatchObject({ callSiteKey: "MAP:check", role: "JUDGE", lane: "served", contractHash: "e".repeat(64) });
    expect(typeof seen[0]!.classifyContent).toBe("function");
    expect(typeof seen[0]!.buildRepairPacket).toBe("function");
    await caller.call({ step: "LIST", callSiteKey: "MAP:list:0", seat, order: 1, shown: "BLIND", spec: mapListSpec(ctx(false), null) });
    expect(seen[1]!.contractHash).toBe("m".repeat(64));
  });

  // R3 final wave P14 (Task 14 Minor 2): the map caller's own refusal of an engine-2 call with no engine seal.
  it("refuses an engine-2 call when the runner was given no engine seal, sending nothing; engine 1's call still goes (ENGINE_RUNNER_UNCONFIGURED)", async () => {
    const seen: ProviderCallRequest[] = [];
    const { engineContractHash: _none, ...unsealed } = deps(seen, JSON.stringify({ points: [], candidate_answers: [] }));
    const caller = createRunnerMapCaller(unsealed);
    const seat = { aiRef: "preview:a", maker: "maker-a" };
    await expect(caller.call({ step: "LIST", callSiteKey: "MAP:list:0", seat, order: 0, shown: "BLIND", spec: mapListSpec(ctx(true), null) }))
      .rejects.toMatchObject({ code: "ENGINE_RUNNER_UNCONFIGURED" });
    expect(seen).toEqual([]);
    await caller.call({ step: "LIST", callSiteKey: "MAP:list:1", seat, order: 1, shown: "BLIND", spec: mapListSpec(ctx(false), null) });
    expect(seen.map((request) => request.contractHash)).toEqual(["m".repeat(64)]);
  });

  // P14 (Task 14 Minor 2): a shaped engine-2 run whose receipt did not count the check never reaches the map.
  it("stops a shaped engine-2 run whose receipt did not count the answer check, and only that run (ENGINE_MAP_CHECK_UNBUDGETED)", () => {
    const engine = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 4, mapOpening: true });
    expect(engine.sites.answerCheck).toBe(1);
    expect(engineMapCheckUnbudgeted(engine, true)).toBe(false);
    const uncounted = { ...engine, sites: { ...engine.sites, answerCheck: 0 as const } };
    expect(engineMapCheckUnbudgeted(uncounted, true)).toBe(true);
    expect(engineMapCheckUnbudgeted(uncounted, false)).toBe(false);
    expect(engineMapCheckUnbudgeted({ engine: 1 }, true)).toBe(false);
    // Where the runner reads it (before the map, throwing the declared code) is pinned in "the run body's engine-2 wiring" below.
  });

  it("the check runs at the map's own thinking level and is told the map's lengths (spec §17 default; INTERFACE §4.3)", () => {
    expect(previewThinkingStepOf({ callSiteKey: "MAP:check", lane: "served" })).toBe("opening");
    expect(lengthCallStepOf("MAP:check")).toBe("map");
    expect(debateRoleFromCallSiteKey("MAP:check")).toBeNull();
  });
});

const kp = (keyPointId: string, restsOn: "question" | "assumption"): MapKeyPoint => Object.freeze({ keyPointId, claim: `Claim ${keyPointId}.`,
  memberItemIds: ["pt01"], blindMakers: ["m1"], gapMakers: [], makers: ["m1"], fixedAngleKinds: [], leansAgainst: false, restsOn });
const CHOICE: MapChoice = { answers: [
  { answerId: "a1", statement: "Yes, where buses run full.", forKeyPointIds: ["kp01"], againstKeyPointIds: ["kp02"], strongestRival: "a2", filled: false,
    assumptions: ["The city can pay."], pointsRaised: [] },
  { answerId: "a2", statement: "Only on night lines.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a1", filled: false,
    assumptions: [], pointsRaised: ["kp03"] }], alsoRaised: [], reserves: [] };
const KEYS = [kp("kp01", "question"), kp("kp02", "assumption"), kp("kp03", "assumption")];

describe("engine 2: positions without code-sided points (spec §5.2 rule 4)", () => {
  it("labels each point with its basis; an unsided answer gets today's generic legs and its points raised", () => {
    const positions = shapePositionsFromMap({ choice: CHOICE, keyPoints: KEYS, answers: 2, pointsPerAnswer: 2, ring: true, engineMap: true });
    expect(JSON.parse(positions[0]!.mapPoints!)).toEqual({ for: [{ text: "Claim kp01.", rests_on: "question" }], against: [{ text: "Claim kp02.", rests_on: "assumption" }] });
    expect(positions[0]!.points.map((point) => [point.polarity, point.keyPointId])).toEqual([["attack", "kp02"], ["support", "kp01"]]);
    expect(positions[1]!.points).toEqual([{ polarity: "attack", consideration: null, keyPointId: null }, { polarity: "support", consideration: null, keyPointId: null }]);
    expect(positions[1]!.pointsRaised).toEqual([{ text: "Claim kp03.", restsOn: "assumption" }]);
    expect(positions[0]!.assumptions).toEqual(["The city can pay."]);
    const today = shapePositionsFromMap({ choice: CHOICE, keyPoints: KEYS, answers: 2, pointsPerAnswer: 2, ring: true });
    expect(Object.hasOwn(today[0]!, "assumptions")).toBe(false);
    expect(today[1]!.points).toEqual([]);
  });

  /** Ruling PF-R35.4 (a): points raised SHARE the points' room; whole items are dropped from the end, never a text cut (G1). */
  it("never clips the chosen words; sided points first, then whole points raised, within ONE shared points room (Review Focus 5)", () => {
    const limits = rootZeroEngineMaterialCharsFor(mapLimitsFor(true));
    expect(limits.answer).toBeGreaterThanOrEqual(Math.max(MAP_RUNAWAY_LIMITS.claimMaxChars, MAP_RUNAWAY_LIMITS.candidateAnswerMaxChars));
    expect({ answer: limits.answer, points: limits.points }).toEqual(rootZeroMapMaterialCharsFor(mapLimitsFor(true)));
    // The ONE shared points room (slices 1 and 4 read it the same way): pointsRaised equals points, never added to it.
    expect(limits.pointsRaised).toBe(limits.points);
    const shared = limits.pointsRaised + "[]".length;
    const words = "y".repeat(limits.answer);
    const many = Array.from({ length: 100 }, (_unused, n) => ({ text: `Point ${String(n)} ${"z".repeat(400)}`, rests_on: "question" }));
    const assumptions = JSON.stringify(Array.from({ length: MAP_ENGINE_LIMITS.assumptionsMax + 1 }, () => "a".repeat(mapLimitsFor(true).claimMaxChars)));
    // 1. Many sided points: they are trimmed by today's rule and fill most of the shared room; the points raised get only what is left.
    const full = shapeEngineRootMaterial({ assignedAnswer: words, mapPoints: JSON.stringify({ for: many, against: [] }),
      pointsRaised: JSON.stringify(many), assumptions }, limits);
    expect(full.assignedAnswer).toBe(words);
    expect(full.mapPoints.length).toBeLessThanOrEqual(limits.points);
    expect(full.mapPoints.length + full.pointsRaised.length).toBeLessThanOrEqual(shared);
    expect(JSON.parse(full.assumptions)).toHaveLength(MAP_ENGINE_LIMITS.assumptionsMax);
    expect(full.assumptions.length).toBeLessThanOrEqual(limits.assumptions);
    // 2. Few sided points: the points raised take what is left, trimmed whole from their end, the first kept.
    const few = shapeEngineRootMaterial({ assignedAnswer: words, mapPoints: JSON.stringify({ for: many.slice(0, 2), against: [] }),
      pointsRaised: JSON.stringify(many), assumptions: "[]" }, limits);
    expect(few.mapPoints).toBe(JSON.stringify({ for: many.slice(0, 2), against: [] }));
    expect(JSON.parse(few.pointsRaised).length).toBeLessThan(100);
    expect(JSON.parse(few.pointsRaised).length).toBeGreaterThan(0);
    expect(JSON.parse(few.pointsRaised)[0]).toEqual(many[0]);
    expect(few.mapPoints.length + few.pointsRaised.length).toBeLessThanOrEqual(shared);
  });
});

describe("engine 2: the stored map and the story", () => {
  it("a re-claimed run reuses its stored engine map and asks nothing (Review Focus 3); a first run stores unchosen answers", async () => {
    const stored = { kind: "MAP", stoppedBy: null } as unknown as MapResult;
    const runMap = vi.fn();
    type Store = Parameters<typeof resolveShapeMap>[0]["store"];
    const store = { readMapResultForRun: vi.fn(async () => stored), writeMapRun: vi.fn() } as unknown as Store;
    const reused = await resolveShapeMap({ store, runId: "run-1", answerCount: () => 2, runMap, spendStopOfCode: () => null, unchosenAnswers: true });
    expect(reused.result).toBe(stored);
    expect(runMap).not.toHaveBeenCalled();
    const fresh = { readMapResultForRun: vi.fn(async () => null), writeMapRun: vi.fn(async () => "INSERTED" as const) };
    await resolveShapeMap({ store: fresh as unknown as Store, runId: "run-1", answerCount: () => 2, runMap: async () => ({ result: stored, spendStop: null }),
      spendStopOfCode: () => null, unchosenAnswers: true });
    expect(fresh.writeMapRun).toHaveBeenCalledWith({ runId: "run-1", result: stored, answerCount: 2, unchosenAnswers: true });
  });

  it("the story's also-raised lists unchosen answers under engine 2 only", () => {
    const map = { choice: { answers: [CHOICE.answers[0]!, { ...CHOICE.answers[1]!, statement: "No." }], alsoRaised: [] }, keyPoints: [],
      mergedAnswers: [{ answerId: "an05", answer: "Only for students.", memberItemIds: ["ca05"], blindMakers: ["m1", "m2"], makers: ["m1", "m2"], fromOppositeCase: false }] };
    expect(storyAlsoRaisedFrom(map, 2)).toEqual([]);
    // Amendment A9-1: the engine argument carries checkFailedMergedAnswerIds beside checkFailed.
    expect(storyAlsoRaisedFrom(map, 2, { checkFailed: [], checkFailedMergedAnswerIds: [] })).toEqual([{ claim: "Only for students.", raisedBy: 2 }]);
    // Deviation 8: an answer the check failed is never listed, by its words or (ruling R3-T9.1) by the merged answer behind it.
    expect(storyAlsoRaisedFrom(map, 2, { checkFailed: ["Only for students."], checkFailedMergedAnswerIds: [] })).toEqual([]);
    expect(storyAlsoRaisedFrom(map, 2, { checkFailed: ["Only students, reworded."], checkFailedMergedAnswerIds: ["an05"] })).toEqual([]);
  });
});

// ─── Carries from the earlier R3 task reviews (each case fails without the wiring it names) ───

const SEATS = [0, 1, 2, 3].map((n) => Object.freeze({ aiRef: `preview:${String(n)}`, maker: `maker-${String(n)}` }));

/** The runner's map caller over a scripted gateway: each reply is built from the framed request alone (engine-map-script). */
function scriptedDeps(options: EngineMapScriptOptions = {}, fail: (request: ProviderCallRequest) => unknown = () => null) {
  const seen: ProviderCallRequest[] = [];
  const provider = { call: async (request: ProviderCallRequest) => {
    seen.push(request);
    const failure = fail(request);
    if (failure !== null) throw failure;
    const frame = readPromptFrame(request.packet);
    const content = engineMapScriptedContent(frame.contractId, frame.fields, options);
    if (content === null) throw new Error(`not an engine-2 map contract: ${frame.contractId}`);
    request.classifyContent?.(content, { finishReason: "stop" });
    return { content };
  } } as unknown as ProviderGateway;
  const stageDeps: MapStageDeps = { ...deps([], ""), memberOf: () => ({ provider, providerRef: "preview:a" }) };
  return { seen, stageDeps };
}
const engineMapInput = (caller: ReturnType<typeof createRunnerMapCaller>) => ({ opening: "ANGLE_MAP" as const, map: {
  questionLine: Q, languageName: "English", languageTag: "en", seats: SEATS, caller, seed: "run-1", gapRoundsMax: 1, maxAnswers: 2,
  pointsPerAnswer: 2, length: LENGTH, engine: { answerCheckCandidates: 3 } } });
const fieldOf = (request: ProviderCallRequest, name: string): string =>
  readPromptFrame(request.packet).fields.find((entry) => entry.name === name)?.content ?? "";

describe("engine 2's map through the runner's caller (Task 6, 9, 11 carries)", () => {
  it("every engine-2 map call records the engine seal; the gap rounds' framing challenges reach choose v2; ONE MAP:check", async () => {
    const { seen, stageDeps } = scriptedDeps();
    const result = await runMapStage(engineMapInput(createRunnerMapCaller(stageDeps)));
    expect(seen.length).toBeGreaterThan(3);
    for (const request of seen) expect(request.contractHash).toBe("e".repeat(64));
    const choose = seen.filter((request) => request.callSiteKey === "MAP:choose");
    expect(choose).toHaveLength(1);
    // Task 6 carry: a NON-EMPTY list reaches choose v2's material (specs.ts defaults to an empty list silently).
    expect(JSON.parse(fieldOf(choose[0]!, "framing_challenges"))).toEqual(["The question may be too narrow about who pays."]);
    expect(result.framingChallenges).toEqual(["The question may be too narrow about who pays."]);
    expect(seen.filter((request) => request.callSiteKey === "MAP:check")).toHaveLength(1);
    expect(result.answerCheck?.outcomes).toMatchObject({ a1: "PASSED", a2: "PASSED" });
  });

  it("a refused check reply is repaired INSIDE its one call (the gateway's attempts); the map never sends a second MAP:check", async () => {
    const refused = Object.assign(new Error("refused after its repairs"), { code: "PROVIDER_CONTENT_REJECTED" });
    const { seen, stageDeps } = scriptedDeps({}, (request) => (request.callSiteKey === "MAP:check" ? refused : null));
    const result = await runMapStage(engineMapInput(createRunnerMapCaller(stageDeps)));
    const checks = seen.filter((request) => request.callSiteKey === "MAP:check");
    expect(checks).toHaveLength(1);
    // The repair path rides that one request: its classifier and repair-packet builder go to the gateway.
    expect(typeof checks[0]!.classifyContent).toBe("function");
    expect(typeof checks[0]!.buildRepairPacket).toBe("function");
    expect(result.marks.map((mark) => mark.mark)).toContain("MAP_CHECK_UNAVAILABLE");
    expect(result.calls.filter((call) => call.callSiteKey === "MAP:check").map((call) => call.outcome)).toEqual(["FAILED"]);
  });

  it("Review Focus 3, runner half: a re-claimed engine-2 run argues the STORED, checked choice and sends NO second MAP:check", async () => {
    let row: MapResult | null = null;
    const writes: unknown[] = [];
    const store = { readMapResultForRun: async () => row,
      writeMapRun: async (input: { result: MapResult }) => { writes.push(input); row = input.result; return "INSERTED" as const; } };
    type Store = Parameters<typeof resolveShapeMap>[0]["store"];
    const claim = async (failCheck: readonly string[]) => {
      const { seen, stageDeps } = scriptedDeps({ failChecks: failCheck });
      const resolved = await resolveShapeMap({ store: store as unknown as Store, runId: "run-1", answerCount: () => 2, spendStopOfCode: () => null,
        unchosenAnswers: true, runMap: async () => ({ result: await runMapStage(engineMapInput(createRunnerMapCaller(stageDeps))), spendStop: null }) });
      return { seen, resolved };
    };
    const first = await claim(["a2"]);
    expect(first.seen.filter((request) => request.callSiteKey === "MAP:check")).toHaveLength(1);
    expect(writes).toEqual([expect.objectContaining({ runId: "run-1", answerCount: 2, unchosenAnswers: true })]);
    const checked = first.resolved.result;
    expect(checked.answerCheck?.replacements).toEqual([expect.objectContaining({ answerId: "a2", action: "REPLACED" })]);
    // The re-claim: a checker that would now fail a1 is never asked; the stored, checked choice comes back whole.
    const again = await claim(["a1"]);
    expect(again.seen).toEqual([]);
    expect(again.resolved.result).toBe(checked);
    expect(again.resolved.result.choice?.answers[1]?.statement).toBe("Only for the night lines, where riders are few.");
    expect(writes).toHaveLength(1);
  });
});

describe("Task 12 carry: the v2 root bound holds for what the runner's shaping keeps (one shared points room)", () => {
  const limits = rootZeroEngineMaterialCharsFor(mapLimitsFor(true));
  const bound = rootPositionRequestBytesBound({ questionLine: Q, argumentLanguageName: "English", completionTokenCeiling: 8192,
    assignedMaterialChars: limits, length: lengthGuideForBounds() });
  /** The judge's own framing of an engine-2 root, measured as the bound measures it (empty model member). */
  const bytesOf = (material: ReturnType<typeof shapeEngineRootMaterial>): number => Math.max(...(["unknown", "resolved"] as const).map((claim) => {
    const leg: JudgeLeg = { kind: "assigned-root", assignedAnswer: material.assignedAnswer, mapPoints: material.mapPoints,
      engine: { pointsRaised: material.pointsRaised, assumptions: material.assumptions } };
    return Buffer.byteLength(JSON.stringify({ model: "", max_tokens: 8192,
      messages: framedJudgePromptForTest(leg, Q, "English", claim, null, lengthGuideForBounds()).packet.messages }), "utf8");
  }));
  // The character that grows most inside a JSON text (a quote: 2 characters there, 8 bytes once framed and sent), and
  // every text far beyond its room, so each room is filled to its last character.
  const heavy = (n: number) => '"'.repeat(n);
  const points = (count: number) => Array.from({ length: count }, (_unused, at) => ({ text: heavy(390 + at), rests_on: "assumption" }));
  const material = (sided: number, raised: number) => ({ assignedAnswer: "\u0001".repeat(limits.answer),
    mapPoints: JSON.stringify({ for: points(sided), against: points(sided) }), pointsRaised: JSON.stringify(points(raised)),
    assumptions: JSON.stringify(Array.from({ length: 3 }, () => heavy(mapLimitsFor(true).claimMaxChars - 2))) });

  it("every split the shaping can keep (all sided, none sided, between) frames within the bound", () => {
    for (const [sided, raised] of [[60, 0], [0, 120], [5, 120], [60, 120]] as const) {
      const shaped = shapeEngineRootMaterial(material(sided, raised), limits);
      expect(shaped.mapPoints.length + shaped.pointsRaised.length).toBeLessThanOrEqual(limits.pointsRaised + "[]".length);
      expect(bytesOf(shaped)).toBeLessThanOrEqual(bound);
    }
  });

  /**
   * Task 12's proof is in characters (the bound frames `pointsRaised + 2` characters of the shared room at 7 bytes each);
   * a JSON text frames at most 4 bytes a character (a quote), so the bytes alone keep slack and cannot show the rule. The
   * shaping's character rule is what the proof needs: a second points room would hold far more than the bound frames.
   */
  it("the shared room is what makes it hold: with full sided points the points raised get only what is left", () => {
    const shaped = shapeEngineRootMaterial(material(60, 120), limits);
    const raisedOwnRoom = shapeEngineRootMaterial(material(0, 120), limits).pointsRaised;
    expect(shaped.mapPoints.length).toBeGreaterThan(limits.points - 1000);
    expect(shaped.pointsRaised.length).toBeLessThan(1000);
    expect(shaped.mapPoints.length + raisedOwnRoom.length).toBeGreaterThan(limits.pointsRaised + "[]".length);
  });
});

describe("the run body's engine-2 wiring (pinned in the source; A0-3: the run body's engine, not the review catch-up's)", () => {
  const RUNNER = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
  const between = (from: string, to: string): string => {
    const at = RUNNER.indexOf(from);
    expect(at, from).toBeGreaterThanOrEqual(0);
    const end = RUNNER.indexOf(to, at);
    expect(end, to).toBeGreaterThan(at);
    return RUNNER.slice(at, end);
  };

  it("the receipt that did not count the check stops the run before the map; the map gets the seal, the engine and the flag", () => {
    const guard = RUNNER.indexOf("throw new TypedDomainError(\"ENGINE_MAP_CHECK_UNBUDGETED\"");
    expect(guard).toBeGreaterThan(RUNNER.indexOf("const shapeRun = "));
    expect(guard).toBeLessThan(RUNNER.indexOf("const runMap = async ()"));
    // R3 final wave P14: the guard reads the one pure rule (`engineMapCheckUnbudgeted`, its behaviour pinned above).
    expect(RUNNER).toContain("if (engineMapCheckUnbudgeted(engine, shapeRun !== null)) {");
    const map = between("const runMap = async ()", "shapeMapResult = resolved.result;");
    expect(map).toContain("...(engineMap ? { engineContractHash: settings.engine!.engineContractHash } : {})");
    expect(map).toContain("...(engineMap && engine.engine === 2 ? { engine: { answerCheckCandidates: engine.answerCheck.candidates } } : {})");
    expect(map).toContain("unchosenAnswers: engineMap");
    expect(RUNNER).toContain("pointsPerAnswer: shapeRun.shape.pointsPerAnswer, ring: engine.engine === 2, engineMap });");
  });

  it("rootLegOf's engine branch frames the fixed words with the ONE engine bound; the story passes both failed lists (A9-1)", () => {
    const leg = between("const rootLegOf = (rootIndex: number): JudgeLeg => {", "const openFirstPosition = ");
    expect(leg).toContain("if (engineMap) {");
    expect(leg).toContain("}, rootEngineMaterialChars!);");
    expect(leg).toContain("engine: { pointsRaised: material.pointsRaised, assumptions: material.assumptions } };");
    expect(leg).toContain("shapeRootMaterial({ assignedAnswer: position.statement, mapPoints: position.mapPoints }, rootMaterialChars)");
    expect(RUNNER).toContain("engineMap ? { checkFailed: mapCheckFailedStatements(debateShapeMap?.answerCheck),\n"
      + "                  checkFailedMergedAnswerIds: mapCheckFailedMergedAnswerIds(debateShapeMap?.answerCheck) } : undefined),");
  });
});
