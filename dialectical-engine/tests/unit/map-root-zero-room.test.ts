import { describe, expect, it } from "vitest";
import { CostEnvelopeGuard, decideRunCostEnvelope, projectedCallCeilingMicros, type ModelSpendStore } from "@debateai/budget";
import { framedJudgePromptForTest, rootPositionRepairRequestBytesBound, rootPositionRequestBytesBound } from "@debateai/judgement";
import { TypedDomainError, questionLanguageForBounds } from "@debateai/kernel";
import { MAP_LIMITS, mapPromptContractHash } from "@debateai/map";
import {
  buildFramedRepairPrompt,
  lengthRetryTokenCeiling,
  OpenAICompatibleProviderGateway,
  type ProviderCallRequest,
  type ProviderCostEnvelopeSeam,
  type ProviderGateway
} from "@debateai/providers";
import { expansionPhaseStop } from "@debateai/runner";
import {
  createRunnerMapCaller,
  resolveShapeMap,
  rootZeroKeepRoomMicros,
  rootZeroMapMaterialChars,
  rootZeroRepairRequestBytes,
  rootZeroRequestBytes,
  rootZeroRoomAttempts,
  rootZeroRoomRefs,
  runMapStage,
  shapeRootMaterial,
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
    // T12-R1: it would fit without the room, so the refusal is the room's own (only the map stops), never MONEY.
    expect(await decisionAt(BODY_CEILING - PROJECTED - room + 1, room)).toBe("RUN_COST_ENVELOPE_ROOM_KEPT");
    expect(await decisionAt(BODY_CEILING - PROJECTED, room)).toBe("RUN_COST_ENVELOPE_ROOM_KEPT");
    // A call that would cross even without the room is the run's real money stop, room or not.
    expect(await decisionAt(BODY_CEILING - PROJECTED + 1, room)).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    // The same spend with no room named is today's decision: admitted.
    expect(await decisionAt(BODY_CEILING - PROJECTED - room + 1)).toBe("ADMITTED");
  });

  it("the room-only refusal is never a run-level spend stop; the real one is", () => {
    expect(expansionPhaseStop(new TypedDomainError("RUN_COST_ENVELOPE_ROOM_KEPT", "x"))).toBeNull();
    expect(expansionPhaseStop(new TypedDomainError("RUN_COST_ENVELOPE_MONEY_REACHED", "x"))).toBe("MONEY");
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

  it("is priced at root 0's OWN seat (its main and backup, and the seat it is handed to on a sit-out), never another seat's (T12-R2)", () => {
    const seat = (...refs: string[]) => ({ refs, out: false });
    const seats = [seat("opener", "opener-backup"), seat("next"), seat("dear-third")];
    const membersOf = (entry: { refs: string[] }) => entry.refs.map((providerRef) => ({ providerRef }));
    // Without the sit-out book root 0 is never handed over: only its own seat.
    expect(rootZeroRoomRefs({ seats, membersOf, canHandOver: false, sitsOut: () => false })).toEqual(["opener", "opener-backup"]);
    // With it, the next seat that does not sit out may open instead; never a later, dearer one.
    expect(rootZeroRoomRefs({ seats, membersOf, canHandOver: true, sitsOut: () => false })).toEqual(["opener", "opener-backup", "next"]);
    expect(rootZeroRoomRefs({ seats, membersOf, canHandOver: true, sitsOut: (entry) => entry === seats[1] }))
      .toEqual(["opener", "opener-backup", "dear-third"]);
    // Priced: a dearer member of another seat never raises root 0's room.
    const prices = new Map([["opener", PRICE], ["opener-backup", PRICE], ["next", PRICE],
      ["dear-third", { inputMicrosPerMillionTokens: 50_000_000, outputMicrosPerMillionTokens: 50_000_000 }]]);
    const priced = rootZeroRoomRefs({ seats, membersOf, canHandOver: true, sitsOut: () => false }).map((ref) => prices.get(ref)!);
    expect(rootZeroKeepRoomMicros({ prices: priced, first: { requestBytes: 1_000, completionTokenCeiling: 100 }, retries: [] })).toBe(600);
  });

  it("is priced at the dearest member it is given, never below one call's projection; no price (local) keeps no room", () => {
    const cheap = { inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 };
    const dear = { inputMicrosPerMillionTokens: 2_000_000, outputMicrosPerMillionTokens: 3_000_000 };
    const first = { requestBytes: 1_000, completionTokenCeiling: 100 };
    // ceil(1000 / 2) x 2 + 100 x 3 = 1 300 for the dear seat; 600 for the cheap one.
    expect(rootZeroKeepRoomMicros({ prices: [cheap, dear], first, retries: [] })).toBe(1_300);
    expect(rootZeroKeepRoomMicros({ prices: [], first, retries: [{ requestBytes: 1_000, completionTokenCeiling: 200 }] })).toBe(0);
    // T12-R3: plus the dearest retry at the dearest member — a length retry (2 x 500 + 200 x 3 = 1 600) or a repair
    // (2 x 700 + 100 x 3 = 1 700): 1 300 + 1 700. The retry may be the backup's, so its price is never tied to the first's.
    expect(rootZeroKeepRoomMicros({ prices: [cheap, dear], first, retries: [{ requestBytes: 1_000, completionTokenCeiling: 200 },
      { requestBytes: 1_400, completionTokenCeiling: 100 }] })).toBe(3_000);
  });

  it("bounds root 0's format repair: the runner's full re-ask, its first packet and the longest rejection a repair carries (T12-R3)", () => {
    const repairBound = rootZeroRepairRequestBytes({ questionLine: QUESTION, argumentLanguageName: "English", completionTokenCeiling: CEILING });
    const firstBound = rootZeroRequestBytes({ questionLine: QUESTION, argumentLanguageName: "English", completionTokenCeiling: CEILING });
    expect(repairBound).toBeGreaterThan(firstBound);
    // The longest code and path a repair packet may carry (the frame refuses longer ones), in other characters than the
    // bound's own: any repair the judge's check can ask is covered.
    const locators = [{ code: "SCHEMA_FAILED", path: "claim" }, { code: `Z${"9".repeat(63)}`, path: "-".repeat(200) }];
    const assigned = { kind: "assigned-root" as const, assignedAnswer: "\"".repeat(rootZeroMapMaterialChars.answer),
      mapPoints: "\"".repeat(rootZeroMapMaterialChars.points) };
    for (const leg of [{ kind: "primary-root" as const }, assigned]) {
      for (const claim of ["unknown", "resolved"] as const) {
        for (const locator of locators) {
          const repair = buildFramedRepairPrompt(framedJudgePromptForTest(leg, QUESTION, "English", claim), locator);
          expect(repairBound).toBeGreaterThanOrEqual(bodyBytes(repair) + 256);
        }
      }
    }
  });

  it("final review M14: a LOCKED root 0's real repair packets (up to a 64-byte name) never frame above the locked repair room", () => {
    const input = { questionLine: QUESTION, argumentLanguageName: "Romanian", completionTokenCeiling: CEILING };
    const locators = [{ code: "SCHEMA_FAILED", path: "claim" }, { code: `Z${"9".repeat(63)}`, path: "-".repeat(200) }];
    // Material at the map's limits in the two characters that grow on the way (a double quote, and U+0001 the most).
    const assignedLegs = ["\"", "\u0001"].map((grows) => ({ kind: "assigned-root" as const,
      assignedAnswer: grows.repeat(rootZeroMapMaterialChars.answer), mapPoints: grows.repeat(rootZeroMapMaterialChars.points) }));
    const locks = [{ code: "ro", name: "Romanian" }, { code: "az-Cyrl", name: "Azerbaijani (Cyrillic script)" },
      { code: "sr-Cyrl", name: "Ж".repeat(32) }];
    expect(new TextEncoder().encode(locks[2]!.name).length).toBe(64);
    for (const lock of locks) {
      const lockedRepairBound = rootZeroRepairRequestBytes({ ...input, questionLanguage: lock });
      for (const leg of [{ kind: "primary-root" as const }, ...assignedLegs]) {
        for (const claim of ["unknown", "resolved"] as const) {
          for (const locator of locators) {
            const repair = buildFramedRepairPrompt(framedJudgePromptForTest(leg, QUESTION, "Romanian", claim, lock), locator);
            expect(lockedRepairBound, `${lock.code} ${leg.kind} ${claim} ${locator.code}`).toBeGreaterThanOrEqual(bodyBytes(repair) + 256);
          }
        }
      }
    }
  });

  it("T12-R3: the room covers root 0's first attempt AND one retry — the larger of a length retry and a format repair", () => {
    const input = { questionLine: QUESTION, argumentLanguageName: "English" };
    const attempts = rootZeroRoomAttempts({ ...input, tokenCeiling: CEILING });
    expect(attempts.first).toEqual({ requestBytes: rootZeroRequestBytes({ ...input, completionTokenCeiling: CEILING }),
      completionTokenCeiling: lengthRetryTokenCeiling(CEILING, 0) });
    const lengthRetry = { requestBytes: rootZeroRequestBytes({ ...input, completionTokenCeiling: lengthRetryTokenCeiling(CEILING, 1) }),
      completionTokenCeiling: lengthRetryTokenCeiling(CEILING, 1) };
    const repair = { requestBytes: rootZeroRepairRequestBytes({ ...input, completionTokenCeiling: CEILING }), completionTokenCeiling: CEILING };
    expect(attempts.retries).toEqual([lengthRetry, repair]);
    for (const price of [PRICE, { inputMicrosPerMillionTokens: 40_000_000, outputMicrosPerMillionTokens: 1_000_000 }]) {
      const room = rootZeroKeepRoomMicros({ prices: [price], ...attempts });
      const projected = (attempt: typeof repair) => projectedCallCeilingMicros(price, attempt);
      expect(room).toBe(projected(attempts.first) + Math.max(projected(lengthRetry), projected(repair)));
      expect(room).toBeGreaterThanOrEqual(projected(attempts.first) + projected(lengthRetry));
      expect(room).toBeGreaterThanOrEqual(projected(attempts.first) + projected(repair));
    }
  });

  it("T12-R3, through the real seam: after the map spends down to the room, root 0's first attempt and either retry are admitted", async () => {
    const attempts = rootZeroRoomAttempts({ questionLine: QUESTION, argumentLanguageName: "English", tokenCeiling: CEILING });
    const room = rootZeroKeepRoomMicros({ prices: [PRICE], ...attempts });
    const decide = (spent: number, projection: Readonly<{ requestBytes: number; completionTokenCeiling: number }>) =>
      Promise.resolve(seamAt(spent).assertCallAllowed(projection)).then(() => "ADMITTED", (error: unknown) => (error as TypedDomainError).code);
    const afterMap = BODY_CEILING - room;
    expect(await decide(afterMap, attempts.first)).toBe("ADMITTED");
    const afterFirst = afterMap + projectedCallCeilingMicros(PRICE, attempts.first);
    for (const retry of attempts.retries) expect(await decide(afterFirst, retry)).toBe("ADMITTED");
    // The room of the first attempt alone (before T12-R3) would leave the length retry refused for money: no answer.
    const firstOnly = BODY_CEILING - projectedCallCeilingMicros(PRICE, attempts.first);
    expect(await decide(firstOnly + projectedCallCeilingMicros(PRICE, attempts.first), attempts.retries[0]!)).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
  });

  it("PF-L38 / L-B64: a locked root 0's room frames the lock at the bound lock (first, retry and repair); no lock is today's room", () => {
    const RO = { code: "ro", name: "Romanian" };
    const input = { questionLine: QUESTION, argumentLanguageName: "Romanian", completionTokenCeiling: CEILING };
    const material = { assignedMaterialChars: rootZeroMapMaterialChars };
    for (const [measure, bodyBound] of [[rootZeroRequestBytes, rootPositionRequestBytesBound],
      [rootZeroRepairRequestBytes, rootPositionRepairRequestBytesBound]] as const) {
      const today = measure(input);
      expect(today).toBe(bodyBound({ ...input, ...material }) + 256);
      expect(measure({ ...input, questionLanguage: null })).toBe(today);
      const locked = measure({ ...input, questionLanguage: RO });
      expect(locked).toBeGreaterThan(today);
      // Framed at the bound lock (the longest tag, a 64-byte name), so never below the run's own lock's framing.
      expect(locked).toBe(bodyBound({ ...input, ...material, questionLanguage: questionLanguageForBounds() }) + 256);
      expect(locked).toBeGreaterThanOrEqual(bodyBound({ ...input, ...material, questionLanguage: RO }) + 256);
    }
    // Real locked root 0 requests — today's primary root and an assigned root at the map's limits (U+0001, the character
    // that grows most), under real locks up to a 64-byte name — never frame above the locked room's first attempt.
    const lockedFirst = rootZeroRequestBytes({ ...input, questionLanguage: RO }) - 256;
    const assigned = { kind: "assigned-root" as const, assignedAnswer: "\u0001".repeat(rootZeroMapMaterialChars.answer),
      mapPoints: "\u0001".repeat(rootZeroMapMaterialChars.points) };
    for (const lock of [RO, { code: "az-Cyrl", name: "Azerbaijani (Cyrillic script)" }, { code: "sr-Cyrl", name: "\u0416".repeat(32) }]) {
      for (const leg of [{ kind: "primary-root" as const }, assigned]) {
        for (const claim of ["unknown", "resolved"] as const) {
          expect(bodyBytes(framedJudgePromptForTest(leg, QUESTION, "Romanian", claim, lock).packet)).toBeLessThanOrEqual(lockedFirst);
        }
      }
    }
    // The room's attempts forward the lock to every bound (T12-R3: the first, the length retry and the repair).
    const attempts = rootZeroRoomAttempts({ questionLine: QUESTION, argumentLanguageName: "Romanian", tokenCeiling: CEILING, questionLanguage: RO });
    expect(attempts.first.requestBytes).toBe(rootZeroRequestBytes({ ...input, completionTokenCeiling: lengthRetryTokenCeiling(CEILING, 0), questionLanguage: RO }));
    expect(attempts.retries.map((retry) => retry.requestBytes)).toEqual([
      rootZeroRequestBytes({ ...input, completionTokenCeiling: lengthRetryTokenCeiling(CEILING, 1), questionLanguage: RO }),
      rootZeroRepairRequestBytes({ ...input, completionTokenCeiling: CEILING, questionLanguage: RO })
    ]);
    expect(rootZeroRoomAttempts({ questionLine: QUESTION, argumentLanguageName: "Romanian", tokenCeiling: CEILING, questionLanguage: null }))
      .toEqual(rootZeroRoomAttempts({ questionLine: QUESTION, argumentLanguageName: "Romanian", tokenCeiling: CEILING }));
  });
});

/**
 * The scripted runs Task 15 extends to a whole debate. The calls go through the REAL money seam (`CostEnvelopeGuard`,
 * BODY phase, the store summing what was charged): every call projects PROJECTED and is charged that at admission. The
 * map names root 0's room on each call.
 */
describe("the map under a ceiling that leaves too little for it and root 0", () => {
  const ROOM = 10_000;
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

  /** A gateway over the real seam: admitted calls are charged PROJECTED and answered; `sent` lists what left. */
  const meteredFrom = (startSpent: number) => {
    const state = { spent: startSpent, sent: [] as string[] };
    const store: ModelSpendStore = {
      recordSpend: async () => undefined, readRunSpentMicros: async () => state.spent, readRunStorySpentMicros: async () => 0,
      readDaySpentMicros: async () => 0, admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
    };
    const guard = new CostEnvelopeGuard({ store, policy: POLICY, clock: () => new Date("2026-10-14T00:00:00.000Z") });
    const gateway: ProviderGateway = { call: async (call: ProviderCallRequest) => {
      await guard.providerSeam({ runId: "run-1", price: PRICE, requireReportedUsage: true, phase: "BODY" })
        .assertCallAllowed({ ...PROJECTION, ...(call.keepRoomMicros === undefined ? {} : { keepRoomMicros: call.keepRoomMicros }) });
      state.spent += PROJECTED;
      state.sent.push(call.callSiteKey);
      return { content: call.callSiteKey === "MAP:angles" ? ANGLES : LIST } as never;
    } } as ProviderGateway;
    return { state, gateway };
  };
  const mapUnder = async (gateway: ProviderGateway) => {
    const deps: MapStageDeps = {
      runId: "run-1", subjectItemId: "wi-1", mapContractHash: mapPromptContractHash(),
      judgeBound: { maxAttempts: 3, tokenCeiling: 8_192, deadlineMs: 60_000 }, longBounds: { merge: 32_768, choose: 32_768 },
      memberOf: (aiRef) => ({ provider: gateway, providerRef: aiRef }), sitsOut: () => false, satOutBy: () => false,
      spendStopOf: (error) => expansionPhaseStop(error), laneStopped: () => false, abandon: () => false, serial: true,
      keepRoomMicros: ROOM, roomKept: (error) => error instanceof TypedDomainError && error.code === "RUN_COST_ENVELOPE_ROOM_KEPT"
    };
    const caller = createRunnerMapCaller(deps);
    const result = await runMapStage({ opening: "ANGLE_MAP", map: {
      questionLine: "Should buses be free?", languageName: "English", languageTag: "en",
      seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }, { aiRef: "c", maker: "mc" }],
      caller, seed: "run-1", gapRoundsMax: 1, maxAnswers: 3, pointsPerAnswer: 2
    } });
    return { caller, result };
  };
  const spendStopOfCode = (code: string) => expansionPhaseStop(new TypedDomainError(code, code));
  const author = (callSiteKey: string): ProviderCallRequest => ({ runId: "run-1", subjectItemId: "wi-1", callSiteKey, role: "JUDGE",
    lane: "served", bound: { maxAttempts: 3, tokenCeiling: 8_192, deadlineMs: 60_000 }, contractHash: "c", providerRef: "a",
    packet: framedFixturePacket("q") });

  it("(a) a refusal only because of the room stops the MAP, never the arguing: no spend stop, the next calls are still asked", async () => {
    // The angles fit with the room; the first list fits only without it.
    const { state, gateway } = meteredFrom(BODY_CEILING - PROJECTED - ROOM);
    const { caller, result } = await mapUnder(gateway);
    expect(state.sent).toEqual(["MAP:angles"]);
    expect(result.stoppedBy).toBe("RUN_COST_ENVELOPE_ROOM_KEPT");
    expect(result.marks.map((mark) => mark.mark)).toContain("MAP_UNAVAILABLE_TODAYS_OPENING");
    expect(caller.spendStop()).toBeNull();
    const resolved = await resolveShapeMap({ store: { readMapResultForRun: async () => null, writeMapRun: async () => "INSERTED" },
      runId: "run-1", answerCount: () => 2, spendStopOfCode, runMap: async () => ({ result, spendStop: caller.spendStop() }) });
    expect(resolved.spendStop).toBeNull();
    // Root 0, then the next author call, are still asked; the seam alone decides them, as today.
    await gateway.call(author("JUDGE"));
    await gateway.call(author("JUDGE:root:secondary"));
    expect(state.sent).toEqual(["MAP:angles", "JUDGE", "JUDGE:root:secondary"]);
    // ...and refused only by the seam's own rule, once the run's money really is spent.
    state.spent = BODY_CEILING - PROJECTED + 1;
    await expect(gateway.call(author("JUDGE:root:2"))).rejects.toMatchObject({ code: "RUN_COST_ENVELOPE_MONEY_REACHED" });
  });

  it("(b) a real money refusal during the map is the run's spend stop, as before", async () => {
    // The angles fit with the room; then the run's spend reaches the ceiling (another call of the run was charged), so
    // the first list would cross it even with no room at all.
    const tight = meteredFrom(BODY_CEILING - PROJECTED - ROOM);
    const jumping: ProviderGateway = { call: async (call) => {
      const reply = await tight.gateway.call(call);
      if (call.callSiteKey === "MAP:angles") tight.state.spent = BODY_CEILING;
      return reply;
    } };
    const { caller, result } = await mapUnder(jumping);
    expect(tight.state.sent).toEqual(["MAP:angles"]);
    expect(result.stoppedBy).toBe("RUN_COST_ENVELOPE_MONEY_REACHED");
    expect(caller.spendStop()).toBe("MONEY");
    const resolved = await resolveShapeMap({ store: { readMapResultForRun: async () => null, writeMapRun: async () => "INSERTED" },
      runId: "run-1", answerCount: () => 2, spendStopOfCode, runMap: async () => ({ result, spendStop: caller.spendStop() }) });
    expect(resolved.spendStop).toBe("MONEY");
  });

  it("(d) a re-claim of a map stopped by the room alone restores no stop; one stopped by money restores MONEY", async () => {
    const stored = (stoppedBy: string) => ({ arm: "C", kind: "UNAVAILABLE", angles: [], items: [], keyPoints: [], mergedAnswers: [],
      framingChallenges: [], choice: null, marks: [], notes: [], calls: [], stoppedBy }) as never;
    const reclaim = (stoppedBy: string) => resolveShapeMap({
      store: { readMapResultForRun: async () => stored(stoppedBy), writeMapRun: async () => "INSERTED" }, runId: "run-1",
      answerCount: () => 2, spendStopOfCode, runMap: async () => { throw new Error("never asked"); } });
    expect((await reclaim("RUN_COST_ENVELOPE_ROOM_KEPT")).spendStop).toBeNull();
    expect((await reclaim("RUN_COST_ENVELOPE_MONEY_REACHED")).spendStop).toBe("MONEY");
  });

  it("keeps root 0 its room after a room-only stop", () => {
    expect(decideRunCostEnvelope({ spentMicros: BODY_CEILING - ROOM, projectedMicros: ROOM, ceilingMicros: BODY_CEILING }).kind).toBe("WITHIN");
  });
});

/**
 * Binding note 2 (Task 13): root 0's material is ENFORCED within `rootZeroMapMaterialChars`, so the room the map keeps
 * for root 0 stays a ceiling whatever the map (or a stored map) hands the runner: the answer is clipped at a character
 * boundary, and whole map points are dropped from the end of the longer side until the points' JSON fits.
 */
describe("a root's assigned material is held within root 0's limits", () => {
  const points = (forClaims: readonly string[], againstClaims: readonly string[]) => JSON.stringify({ for: forClaims, against: againstClaims });

  it("passes material within the limits through unchanged", () => {
    const material = { assignedAnswer: "Yes, keep it.", mapPoints: points(["A point for."], ["A point against."]) };
    expect(shapeRootMaterial(material)).toEqual(material);
  });

  it("clips an over-long answer to the limit, never splitting a character", () => {
    const fitted = shapeRootMaterial({ assignedAnswer: `${"a".repeat(rootZeroMapMaterialChars.answer - 1)}\u{1F600}tail`, mapPoints: points([], []) });
    expect(fitted.assignedAnswer).toBe("a".repeat(rootZeroMapMaterialChars.answer - 1));
  });

  it("drops whole points from the end of the longer side until the points fit, keeping the JSON readable", () => {
    // Claims of double quotes: each is two characters once JSON-escaped, so points within the map's own claim limit overflow.
    const claim = (tag: string) => `${tag}${"\"".repeat(MAP_LIMITS.claimMaxChars - tag.length)}`;
    const forClaims = Array.from({ length: MAP_LIMITS.choosePointsPerSideMax }, (_unused, index) => claim(`f${String(index)}`));
    const againstClaims = Array.from({ length: MAP_LIMITS.choosePointsPerSideMax + 3 }, (_unused, index) => claim(`a${String(index)}`));
    const fitted = shapeRootMaterial({ assignedAnswer: "Yes.", mapPoints: points(forClaims, againstClaims) });
    expect(fitted.mapPoints.length).toBeLessThanOrEqual(rootZeroMapMaterialChars.points);
    const kept = JSON.parse(fitted.mapPoints) as { for: string[]; against: string[] };
    expect(kept.for).toEqual(forClaims.slice(0, kept.for.length));
    expect(kept.against).toEqual(againstClaims.slice(0, kept.against.length));
    expect(kept.for.length + kept.against.length).toBeGreaterThan(0);
    // Nothing was dropped that did not have to be: every claim is as long, so one more point would not fit.
    const restored = { for: kept.for, against: againstClaims.slice(0, kept.against.length + 1) };
    expect(JSON.stringify(restored).length).toBeGreaterThan(rootZeroMapMaterialChars.points);
  });

  it("reads over-long map points it cannot parse as none", () => {
    expect(shapeRootMaterial({ assignedAnswer: "Yes.", mapPoints: "x".repeat(rootZeroMapMaterialChars.points + 1) }).mapPoints)
      .toBe(points([], []));
  });
});
