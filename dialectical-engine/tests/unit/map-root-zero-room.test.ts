import { describe, expect, it } from "vitest";
import { CostEnvelopeGuard, decideRunCostEnvelope, runCostEnvelopeReached, type ModelSpendStore } from "@debateai/budget";
import { framedJudgePromptForTest, rootPositionRequestBytesBound } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import { MAP_LIMITS, mapPromptContractHash } from "@debateai/map";
import {
  OpenAICompatibleProviderGateway,
  type ProviderCallRequest,
  type ProviderCostEnvelopeSeam,
  type ProviderGateway
} from "@debateai/providers";
import {
  createRunnerMapCaller,
  rootZeroKeepRoomMicros,
  rootZeroMapMaterialChars,
  runMapStage,
  type MapStageDeps
} from "../../apps/runner/src/map-stage.js";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * Controller ruling T12-R0 (the owner's "always an answer" rule): a started debate must always be able to pay root 0.
 * A map call may spend only what leaves room for root 0's worst-case call at its seat's price, ON TOP of the serve
 * reserve (the BODY ceiling already holds that back). The room rides each map request (`keepRoomMicros`), the gateway
 * hands it to the money seam with the projection, and the seam refuses a call whose projection plus that room would
 * cross the phase's ceiling: before anything is sent, as a map spend stop (RUN_COST_ENVELOPE_MONEY_REACHED).
 */

const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 });
/** At one micro-unit per token: ceil(800 / 2) = 400 input + 64 output = 464 micro-units. */
const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
const PROJECTED = 464;
/** 250 000 per run, 30% held back for the answer: the BODY ceiling is 175 000. */
const POLICY = Object.freeze({ perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000,
  serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000 });
const BODY_CEILING = 175_000;

function seamAt(runSpentMicros: number) {
  const store: ModelSpendStore = {
    recordSpend: async () => undefined,
    readRunSpentMicros: async () => runSpentMicros,
    readRunStorySpentMicros: async () => 0,
    readDaySpentMicros: async () => 0,
    admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
  };
  return new CostEnvelopeGuard({ store, policy: POLICY, clock: () => new Date("2026-10-14T00:00:00.000Z") })
    .providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true, phase: "BODY" });
}

async function decisionAt(runSpentMicros: number, keepRoomMicros?: number): Promise<string> {
  const projection = keepRoomMicros === undefined ? PROJECTION : { ...PROJECTION, keepRoomMicros };
  return Promise.resolve(seamAt(runSpentMicros).assertCallAllowed(projection)).then(
    () => "ADMITTED",
    (error: unknown) => (error instanceof TypedDomainError ? error.code : error instanceof TypeError ? error.message : "UNTYPED")
  );
}

describe("the money seam keeps the room a call names (T12-R0)", () => {
  it("refuses a call whose projection plus the room would cross the BODY ceiling, and admits exact equality", async () => {
    const room = 1_000;
    expect(await decisionAt(BODY_CEILING - PROJECTED - room, room)).toBe("ADMITTED");
    expect(await decisionAt(BODY_CEILING - PROJECTED - room + 1, room)).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    // The same spend with no room named is today's decision: admitted.
    expect(await decisionAt(BODY_CEILING - PROJECTED - room + 1)).toBe("ADMITTED");
  });

  it("is today's decision exactly when no room is named, or a room of zero", async () => {
    expect(await decisionAt(BODY_CEILING - PROJECTED)).toBe("ADMITTED");
    expect(await decisionAt(BODY_CEILING - PROJECTED + 1)).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(await decisionAt(BODY_CEILING - PROJECTED, 0)).toBe("ADMITTED");
  });

  it("refuses a room that is not a whole count of micro-units", async () => {
    expect(await decisionAt(0, -1)).toBe("COST_ENVELOPE_KEEP_ROOM_INVALID");
    expect(await decisionAt(0, 1.5)).toBe("COST_ENVELOPE_KEEP_ROOM_INVALID");
  });
});

describe("the gateway hands the request's room to the money seam", () => {
  const projections: unknown[] = [];
  const seam: ProviderCostEnvelopeSeam = {
    assertCallAllowed: (projection) => { projections.push(projection); throw new TypedDomainError("TEST_REFUSED", "x"); },
    recordCall: () => undefined,
    assertUsageReported: () => undefined
  };
  const gateway = new OpenAICompatibleProviderGateway({
    endpoint: "http://fixture/v1", model: "m", maker: "fixture",
    fetchImplementation: async () => { throw new Error("never sent"); },
    sleepImplementation: async () => undefined,
    persistRawArtifact: async (artifact) => artifact.artifactId,
    appendLedgerEntry: async () => "ledger:1",
    assertNoOpenWriteTransaction: () => undefined
  });
  const request = (extra: Partial<ProviderCallRequest>): ProviderCallRequest => ({
    runId: "run-1", subjectItemId: "wi", callSiteKey: "MAP:angles", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }, contractHash: "c", providerRef: "p",
    packet: framedFixturePacket("q"), costEnvelope: seam, ...extra
  });

  it("with the room only when the request names one: today's two members otherwise", async () => {
    await expect(gateway.call(request({}))).rejects.toMatchObject({ code: "TEST_REFUSED" });
    await expect(gateway.call(request({ keepRoomMicros: 777 }))).rejects.toMatchObject({ code: "TEST_REFUSED" });
    expect(Object.keys(projections[0] as object).sort()).toEqual(["completionTokenCeiling", "requestBytes"]);
    expect(projections[1]).toMatchObject({ keepRoomMicros: 777 });
  });
});

describe("root 0's worst-case call", () => {
  const QUESTION = "Should buses be free?";
  const CEILING = 8_192;
  const bodyBytes = (packet: Readonly<{ messages: unknown }>) =>
    Buffer.byteLength(JSON.stringify({ model: "", max_tokens: CEILING, messages: packet.messages }), "utf8");

  it("bounds today's primary root and a map-assigned root whose material is at the map's limits", () => {
    const bound = rootPositionRequestBytesBound({ questionLine: QUESTION, argumentLanguageName: "English",
      completionTokenCeiling: CEILING, assignedMaterialChars: rootZeroMapMaterialChars });
    for (const claim of ["unknown", "resolved"] as const) {
      expect(bound).toBeGreaterThanOrEqual(bodyBytes(framedJudgePromptForTest({ kind: "primary-root" }, QUESTION, "English", claim).packet));
      // Material at the limits, made of a character that grows on the way (a double quote: 1 → 2 → 4 bytes).
      const leg = { kind: "assigned-root" as const, assignedAnswer: "\"".repeat(rootZeroMapMaterialChars.answer),
        mapPoints: "\"".repeat(rootZeroMapMaterialChars.points) };
      expect(bound).toBeGreaterThanOrEqual(bodyBytes(framedJudgePromptForTest(leg, QUESTION, "English", claim).packet));
    }
    // The material allowance covers a chosen answer (a statement, or a filled one around it) and every point either side.
    expect(rootZeroMapMaterialChars.answer).toBeGreaterThanOrEqual(2 * MAP_LIMITS.claimMaxChars);
    expect(rootZeroMapMaterialChars.points).toBeGreaterThanOrEqual(2 * MAP_LIMITS.choosePointsPerSideMax * MAP_LIMITS.claimMaxChars);
  });

  it("is priced at the dearest root seat, never below one call's projection; no price (local) keeps no room", () => {
    const cheap = { inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 };
    const dear = { inputMicrosPerMillionTokens: 2_000_000, outputMicrosPerMillionTokens: 3_000_000 };
    // ceil(1000 / 2) x 2 + 100 x 3 = 1 300 for the dear seat; 600 for the cheap one.
    expect(rootZeroKeepRoomMicros({ prices: [cheap, dear], requestBytes: 1_000, completionTokenCeiling: 100 })).toBe(1_300);
    expect(rootZeroKeepRoomMicros({ prices: [], requestBytes: 1_000, completionTokenCeiling: 100 })).toBe(0);
  });
});

/**
 * The scripted run Task 15 extends to a whole debate: a money ceiling that leaves less than the map and one root-0 call.
 * Every call costs COST micro-units (charged at admission, so calls in flight count); the gateway refuses, as the seam
 * does, a call whose cost plus the room it names would cross the BODY ceiling. The map stops early with its code
 * fallbacks and sends nothing more, and root 0's call (the room) still fits.
 */
describe("a ceiling that leaves less than the map and one root-0 call", () => {
  const COST = 1_000;
  const ROOM = 2_500;
  const ANGLES = JSON.stringify({ angles: [
    { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against free buses." },
    { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the asker fears about the cost." },
    { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What a city should do first." },
    { angle_id: "cost", kind: "SPECIFIC", label: "The cost", focus: "Who pays for the buses." }] });
  const LIST = JSON.stringify({ points: [
    { claim: "Free buses cost the city a lot of money every year.", why_it_matters: "The money comes from taxes.", leans: "against_some_answer" },
    { claim: "Free buses help people who cannot afford a ticket.", why_it_matters: "Poor riders gain the most.", leans: "for_some_answer" },
    { claim: "More riders may crowd the buses at rush hour.", why_it_matters: "Service could get worse.", leans: "context" }],
  candidate_answers: ["Yes, for people on low incomes."] });

  it("stops the map as a money stop, sends nothing more, and leaves root 0 its room", async () => {
    // Room for the angles and one list, never a third call beside the room: 3 x COST + ROOM crosses by one.
    const ceiling = 3 * COST + ROOM - 1;
    let spent = 0;
    const sent: string[] = [];
    const metered: ProviderGateway = { call: async (call: ProviderCallRequest) => {
      const decision = decideRunCostEnvelope({ spentMicros: spent, projectedMicros: COST + (call.keepRoomMicros ?? 0), ceilingMicros: ceiling });
      if (decision.kind === "WOULD_CROSS") throw runCostEnvelopeReached(decision);
      spent += COST;
      sent.push(call.callSiteKey);
      return { content: call.callSiteKey === "MAP:angles" ? ANGLES : LIST } as never;
    } } as ProviderGateway;
    const deps: MapStageDeps = {
      runId: "run-1", subjectItemId: "wi-1", mapContractHash: mapPromptContractHash(),
      judgeBound: { maxAttempts: 3, tokenCeiling: 8_192, deadlineMs: 60_000 }, longBounds: { merge: 32_768, choose: 32_768 },
      memberOf: (aiRef) => ({ provider: metered, providerRef: aiRef }), sitsOut: () => false, satOutBy: () => false,
      spendStopOf: (error) => error instanceof TypedDomainError && error.code === "RUN_COST_ENVELOPE_MONEY_REACHED" ? "MONEY" : null,
      laneStopped: () => false, abandon: () => false, serial: true, keepRoomMicros: ROOM
    };
    const caller = createRunnerMapCaller(deps);
    const result = await runMapStage({ opening: "ANGLE_MAP", map: {
      questionLine: "Should buses be free?", languageName: "English", languageTag: "en",
      seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }, { aiRef: "c", maker: "mc" }],
      caller, seed: "run-1", gapRoundsMax: 1, maxAnswers: 3, pointsPerAnswer: 2
    } });
    expect(sent).toEqual(["MAP:angles", "MAP:list:0"]);
    expect(result.stoppedBy).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(caller.spendStop()).toBe("MONEY");
    expect(result.marks.map((mark) => mark.mark)).toContain("MAP_UNAVAILABLE_TODAYS_OPENING");
    // Root 0's worst-case call still fits under the BODY ceiling.
    expect(decideRunCostEnvelope({ spentMicros: spent, projectedMicros: ROOM, ceilingMicros: ceiling }).kind).toBe("WITHIN");
  });
});
