import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CostEnvelopeGuard, projectedCallCeilingMicros, type ModelSpendStore } from "@debateai/budget";
import {
  LENGTH_GUIDANCE_START, LENGTH_SENTENCE_PARTS, TypedDomainError, questionLanguageForBounds, replyLanguageExpectation
} from "@debateai/kernel";
import {
  MAP_ANSWER_FORMS, MAP_CONTRACT_IDS, MAP_CONTRACT_NAMES, MAP_LENGTHED_REPLY_SCHEMAS, MAP_LENGTH_ANSWER_FORMS, MAP_LENGTH_CONTRACT_IDS,
  MAP_LIMITS, MAP_RUNAWAY_LIMITS, mapAnglesReplySchema, mapAnglesSalvage, mapAnglesSalvageLengthed, mapClassifyReply,
  mapContractNameOf, mapGuidedWords, mapListSalvage, mapListSalvageLengthed, mapListSpec, mapLimitsFor, mapPromptContractHash,
  mapPromptContracts, mapPromptFingerprintText, mapReplySchemasFor, mapReplyWordsCeiling, type MapLength
} from "@debateai/map";
import {
  PREVIEW_GLM_GENERATION_TOKEN_FLOOR, PREVIEW_REQUEST_BODY_MAX_BYTES, buildFramedPrompt, previewModelRow,
  promptContractFingerprintText, readPromptFrame
} from "@debateai/providers";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW, costEnvelopeCeilings,
  lengthGuidancePolicyStartValues, resolveLengthGuidance
} from "@debateai/register";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import {
  guidedMapBound, rootZeroKeepRoomMicros, rootZeroMapMaterialChars, rootZeroMapMaterialCharsFor, rootZeroRoomAttempts
} from "../../apps/runner/src/map-stage.js";

const LENGTH: MapLength = { targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const ctx = (length?: MapLength) => ({ questionLine: "Should cities price congestion?", languageName: "English", languageTag: "en",
  replyLanguage: replyLanguageExpectation("Should cities price congestion?"), ...(length === undefined ? {} : { length }) });

describe("the map's length variants (spec §3.2, §3.9)", () => {
  it("today's seven contracts keep their ids and forms", () => {
    const today = mapPromptContracts();
    for (const name of MAP_CONTRACT_NAMES) {
      expect(today[name].contractId).toBe(MAP_CONTRACT_IDS[name]);
      expect(today[name].answerForm).toBe(MAP_ANSWER_FORMS[name]);
    }
    expect(mapLimitsFor(false)).toBe(MAP_LIMITS);
  });

  it("each variant is the instruction plus the parts sentence; its form names no character limit for a text", () => {
    const lengthed = mapPromptContracts(undefined, true);
    for (const name of MAP_CONTRACT_NAMES) {
      expect(lengthed[name].contractId).toBe(MAP_LENGTH_CONTRACT_IDS[name]);
      expect(lengthed[name].instruction).toBe(`${mapPromptContracts()[name].instruction} ${LENGTH_SENTENCE_PARTS}`);
      expect(lengthed[name].answerForm).toBe(MAP_LENGTH_ANSWER_FORMS[name]);
      for (const limit of [MAP_LIMITS.claimMaxChars, MAP_LIMITS.candidateAnswerMaxChars, MAP_LIMITS.angleLabelMaxChars]) {
        expect(MAP_LENGTH_ANSWER_FORMS[name], name).not.toContain(`at most ${String(limit)} characters`);
      }
      expect(mapContractNameOf(MAP_LENGTH_CONTRACT_IDS[name])).toBe(name);
      expect(mapContractNameOf(MAP_CONTRACT_IDS[name])).toBe(name);
    }
    expect(mapContractNameOf("judge.panel.v1")).toBeNull();
  });

  it("the map seal is today's seven, then the seven variants", () => {
    const text = mapPromptFingerprintText();
    expect(text).toBe([...MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(mapPromptContracts()[name])),
      ...MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(mapPromptContracts(undefined, true)[name]))].join("\n---\n"));
    expect(mapPromptContractHash()).toBe(createHash("sha256").update(text).digest("hex"));
  });
});

describe("a lengthed map call", () => {
  it("is framed with the variant and the parts field; its guided words and reply ceiling follow the targets", () => {
    const spec = mapListSpec(ctx(LENGTH), null);
    const frame = readPromptFrame(buildFramedPrompt({ contract: spec.contract, material: spec.material }).packet);
    expect(frame.contractId).toBe("map.list.open.length.v1");
    // `ctx` emits the ISO tag "en", so the map's lock adds question_language LAST (specs.ts mapLockedLanguage,
    // kernel withQuestionLanguageField): `length` sits right before it (pre-flight PF-C5.2).
    expect(frame.fields.at(-2)).toEqual({ name: "length",
      content: "claim: about 35 words\nwhy_it_matters: about 35 words\ncandidate_answers: about 25 words" });
    expect(frame.fields.at(-1)!.name).toBe("question_language");
    expect(spec.guidedWords).toBe(95);
    expect(spec.replyWordsCeiling).toBe(8 * 70 + 3 * 25);
    expect(mapGuidedWords("choose", LENGTH)).toBe(35);
    expect(mapReplyWordsCeiling("merge", LENGTH)).toBeNull();
    const today = mapListSpec(ctx(), null);
    expect([today.guidedWords, today.replyWordsCeiling]).toEqual([null, null]);
    expect(today.contract.contractId).toBe("map.list.open.v1");
  });

  it("reads texts up to the runaway limits and never trims; today's reading trims as before", () => {
    const long = "word ".repeat(80).trim();
    const reply = JSON.stringify({ points: [1, 2, 3].map((n) => ({ claim: `Claim ${String(n)}.`, why_it_matters: long, leans: "context" })),
      candidate_answers: ["Yes."] });
    const lengthed = mapClassifyReply(reply, undefined, mapReplySchemasFor(mapLimitsFor(true)).list, () => [], mapListSalvageLengthed);
    expect(lengthed.classification.parseStatus).toBe("PARSED");
    expect(lengthed.repairs).not.toContain("MAP_TEXT_TRIMMED");
    const today = mapClassifyReply(reply, undefined, mapReplySchemasFor(MAP_LIMITS).list, () => [], mapListSalvage);
    expect(today.repairs).toContain("MAP_TEXT_TRIMMED");
    const runaway = JSON.stringify({ points: [1, 2, 3].map(() => ({ claim: "x".repeat(MAP_RUNAWAY_LIMITS.claimMaxChars + 1),
      why_it_matters: "w", leans: "context" })), candidate_answers: ["Yes."] });
    expect(mapClassifyReply(runaway, undefined, mapReplySchemasFor(mapLimitsFor(true)).list, () => [], mapListSalvageLengthed)
      .classification.parseStatus).toBe("SCHEMA_FAILED");
    const noLean = JSON.stringify({ points: [1, 2, 3].map((n) => ({ claim: `C${String(n)}.`, why_it_matters: "w" })), candidate_answers: ["Yes."] });
    expect(mapClassifyReply(noLean, undefined, mapReplySchemasFor(mapLimitsFor(true)).list, () => [], mapListSalvageLengthed).repairs)
      .toContain("MAP_LEANS_DEFAULTED");
  });

  it("the allowance and root 0's material follow the runaway limits only with the row", () => {
    const guidance = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
    const bound = { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 1000 };
    expect(guidedMapBound(bound, 635, null)).toBe(bound);
    expect(guidedMapBound(bound, null, guidance)).toBe(bound);
    expect(guidedMapBound(bound, 635, guidance).tokenCeiling).toBe(8192 + 7620);
    expect(rootZeroMapMaterialCharsFor(MAP_LIMITS)).toEqual(rootZeroMapMaterialChars);
    expect(rootZeroMapMaterialCharsFor(mapLimitsFor(true)).answer).toBe(2 * MAP_RUNAWAY_LIMITS.claimMaxChars);
  });

  // Ruling PF-C5.1 (pre-flight PF-C5.1): LG-A's id normalisation stays in the lengthed angles salvage; only the trims go.
  it("a lengthed angles reply keeps LG-A's id normalisation and is never trimmed; today's angles still trim", () => {
    const label = "word ".repeat(30).trim(); // 149 characters: over today's 80, within the runaway 650
    const angles = [
      { angle_id: "opposite", kind: "OPPOSITE_CASE", label: "The other side", focus: "What if waiting is better?" },
      { angle_id: "worry", kind: "ASKER_WORRY", label: "Your worry", focus: "Prices." },
      { angle_id: "practical", kind: "PRACTICAL", label: "In practice", focus: "Timing." },
      { angle_id: "Specific_CEE", kind: "SPECIFIC", label, focus: "What CEE countries did." }
    ];
    const reply = JSON.stringify({ angles });
    const lengthed = mapClassifyReply(reply, undefined, MAP_LENGTHED_REPLY_SCHEMAS.angles, () => [], mapAnglesSalvageLengthed);
    expect(lengthed.classification.parseStatus).toBe("PARSED");
    expect(lengthed.repairs).toContain("MAP_IDS_NORMALISED");
    expect(lengthed.repairs).not.toContain("MAP_TEXT_TRIMMED");
    expect(lengthed.value?.angles[3]).toEqual({ angle_id: "specific-cee", kind: "SPECIFIC", label, focus: "What CEE countries did." });
    const today = mapClassifyReply(reply, undefined, mapAnglesReplySchema, () => [], mapAnglesSalvage);
    expect(today.repairs).toEqual(expect.arrayContaining(["MAP_TEXT_TRIMMED", "MAP_IDS_NORMALISED"]));
    expect(Object.keys(MAP_LENGTHED_REPLY_SCHEMAS).sort()).toEqual(Object.keys(mapReplySchemasFor(MAP_LIMITS)).sort());
  });

  /**
   * Ruling "PF-C5 root-0 bound" (a), pre-flight PF-C5.9, and its re-rule "root-0 Free test" (2026-10-16): with the row, root
   * 0's material bound is the runaway limits (no trims, L19): the material bound grows about 7x and root 0's kept room about
   * 3x. These two cases pin the HONEST outcome on a Free run (pre-flight consistency, re-ruled):
   * - at the preview's 8,192 judge ceiling, root 0's room plus the first lengthed map list call crosses Free's body ceiling,
   *   so the money seam refuses that call ROOM-ONLY (`RUN_COST_ENVELOPE_ROOM_KEPT`: the call alone would fit). What a
   *   room-only refusal does next is already pinned and is run by this plan: the map stops, the debate argues on with today's
   *   opening (`MAP_UNAVAILABLE_TODAYS_OPENING`, no spend stop), never a crash: `tests/unit/map-root-zero-room.test.ts` case
   *   "(a) a refusal only because of the room stops the MAP, never the arguing" (Step 11) and
   *   `tests/integration/debate-shape-run.test.ts` "a map call refused only to keep root 0's room …" (Task 17 Step 5);
   * - at a 4,096 judge ceiling the same call fits beside the room and is admitted.
   * Plan "Known limits" names this; the follow-up (size Free's ceiling or root 0's room) is the owner's, before the new shape
   * is switched on for Free.
   * How the numbers are built:
   * - Free's run ceiling: the site's per-run ceiling (the cost-envelope row's start value) cut to Free's whole monthly
   *   credit, as `pickerMoneyLimits` cuts a person's room (apps/api/src/person-room-picker.ts), then the BODY share (the
   *   map and root 0 both spend from the body; the serve reserve is held back).
   * - Root 0's seat: any of the preview's four DeepInfra seats (the dearest per attempt, as `rootZeroKeepRoomMicros` prices
   *   it); the retry may be the routed Haiku structure-repair call (LG-A); the bound lock (a shaped run is locked).
   * - Root 0's and the list call's token ceiling: the judge bound (the preview's is `previewCallBound`: the sealed JUDGE bound
   *   raised to PREVIEW_GLM_GENERATION_TOKEN_FLOOR, 8,192); the list call raised by `guidedMapBound`.
   * - One lengthed map list call: an angle list whose angle is at the runaway angle limits, at the dearest seat.
   * - The seam: a Free run's BODY seam with nothing spent yet, built as `tests/unit/map-root-zero-room.test.ts` builds its
   *   `seamAt` (`CostEnvelopeGuard(...).providerSeam(...)`), the room named as `keepRoomMicros`.
   */
  describe("with the row on a Free run: root 0's room and one lengthed map list call (re-ruled)", () => {
    const guidance = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
    const site = COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value;
    const free = BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.find((plan) => plan.plan_id === "FREE")!;
    const freePolicy = Object.freeze({ perRunCeilingMicros: Math.min(site.per_run_ceiling_micros, free.monthly_credit_micros),
      dailyCeilingMicros: site.daily_ceiling_micros, serveReserveBasisPoints: site.serve_reserve_basis_points,
      serveOverrunBasisPoints: site.serve_overrun_basis_points });
    const freeBody = costEnvelopeCeilings({ perRunCeilingMicros: freePolicy.perRunCeilingMicros,
      serveReserveBasisPoints: freePolicy.serveReserveBasisPoints }).bodyMicros;
    const price = (model: string) => {
      const row = previewModelRow(model)!;
      return Object.freeze({ inputMicrosPerMillionTokens: row.inputPriceMicrosPerMillion, outputMicrosPerMillionTokens: row.outputPriceMicrosPerMillion });
    };
    const seats = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash"].map(price);
    /** Root 0's kept room and the first lengthed list call (dearest seat) at one judge ceiling. */
    const at = (judgeTokenCeiling: number) => {
      const room = rootZeroKeepRoomMicros({ prices: seats, ...rootZeroRoomAttempts({ questionLine: "Should cities price congestion?",
        argumentLanguageName: "English", questionLanguage: questionLanguageForBounds(), tokenCeiling: judgeTokenCeiling, lengthed: true,
        materialChars: rootZeroMapMaterialCharsFor(mapLimitsFor(true)) }),
        structureRepair: { price: price("claude-haiku-5-5"),
          attempt: { requestBytes: PREVIEW_REQUEST_BODY_MAX_BYTES, completionTokenCeiling: 32_768 } } });
      const spec = mapListSpec(ctx(LENGTH), { angleId: "g1", kind: "OPPOSITE_CASE",
        label: "x".repeat(MAP_RUNAWAY_LIMITS.angleLabelMaxChars), focus: "x".repeat(MAP_RUNAWAY_LIMITS.angleFocusMaxChars) });
      const listBound = guidedMapBound({ maxAttempts: 3, tokenCeiling: judgeTokenCeiling, deadlineMs: 1000 }, spec.replyWordsCeiling, guidance);
      const projection = Object.freeze({ completionTokenCeiling: listBound.tokenCeiling,
        requestBytes: Buffer.byteLength(JSON.stringify({ model: "m".repeat(256), max_tokens: listBound.tokenCeiling,
          messages: buildFramedPrompt({ contract: spec.contract, material: spec.material }).packet.messages }), "utf8") });
      const priced = seats.map((seat) => ({ seat, micros: projectedCallCeilingMicros(seat, projection) }));
      const dearest = priced.reduce((most, next) => (next.micros > most.micros ? next : most));
      return { room, listCall: dearest.micros, dearestSeat: dearest.seat, projection };
    };
    /** What a Free run's BODY seam, nothing spent yet, decides for that list call with root 0's room named. */
    const seamDecision = async (state: ReturnType<typeof at>): Promise<string> => {
      const store: ModelSpendStore = {
        recordSpend: async () => undefined, readRunSpentMicros: async () => 0, readRunStorySpentMicros: async () => 0,
        readDaySpentMicros: async () => 0, admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
      };
      const seam = new CostEnvelopeGuard({ store, policy: freePolicy, clock: () => new Date("2026-10-16T00:00:00.000Z") })
        .providerSeam({ runId: "run-free", price: state.dearestSeat, requireReportedUsage: true, phase: "BODY" });
      return Promise.resolve(seam.assertCallAllowed({ ...state.projection, keepRoomMicros: state.room })).then(
        () => "ADMITTED", (error: unknown) => (error instanceof TypedDomainError ? error.code : "UNTYPED"));
    };

    it("at the preview's 8,192 judge ceiling the first lengthed list call is refused room-only (RUN_COST_ENVELOPE_ROOM_KEPT), never a money stop", async () => {
      const judgeTokenCeiling = Math.max(DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE.tokenCeiling, PREVIEW_GLM_GENERATION_TOKEN_FLOOR);
      expect(judgeTokenCeiling).toBe(8192);
      const preview = at(judgeTokenCeiling);
      expect(preview.room).toBeLessThan(freeBody); // root 0 alone always fits: the debate still gets its answer
      expect(preview.listCall).toBeLessThanOrEqual(freeBody); // the call alone would fit, so the refusal is the room's own
      expect(preview.room + preview.listCall).toBeGreaterThan(freeBody); // but not beside root 0's room
      expect(await seamDecision(preview)).toBe("RUN_COST_ENVELOPE_ROOM_KEPT");
    });

    it("at a 4,096 judge ceiling the same call fits beside root 0's room", async () => {
      const smaller = at(4096);
      expect(smaller.room + smaller.listCall).toBeLessThanOrEqual(freeBody);
      expect(await seamDecision(smaller)).toBe("ADMITTED");
    });
  });
});
