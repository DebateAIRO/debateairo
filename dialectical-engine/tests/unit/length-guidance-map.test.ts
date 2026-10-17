import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CostEnvelopeGuard, projectedCallCeilingMicros, type ModelSpendStore } from "@debateai/budget";
import {
  LENGTH_GUIDANCE_START, LENGTH_SENTENCE_PARTS, TypedDomainError, questionLanguageForBounds, replyLanguageExpectation
} from "@debateai/kernel";
import {
  MAP_ANSWER_FORMS, MAP_CONTRACT_IDS, MAP_CONTRACT_NAMES, MAP_DEFAULT_INSTRUCTIONS, MAP_LENGTHED_REPLY_SCHEMAS, MAP_LENGTH_ANSWER_FORMS,
  MAP_LENGTH_CONTRACT_IDS, MAP_LIMITS, MAP_RUNAWAY_LIMITS, mapAnglesReplySchema, mapAnglesSalvage, mapAnglesSalvageLengthed,
  mapAnglesSpec, mapChooseSpec, mapClassifyReply, mapContractNameOf, mapGuidedWords, mapGapSpec, mapLargestReplyWordsCeiling, mapLengthContractsOf, mapListSalvage, mapListSalvageLengthed,
  mapListSpec, mapLimitsFor, mapMergeSpec, mapSnowballSpec, mapPromptContractHash, mapPromptContracts, mapPromptFingerprintText, mapReplySchemasFor,
  mapReplyWordsCeiling, type MapLength
} from "@debateai/map";
import {
  PREVIEW_GLM_GENERATION_TOKEN_FLOOR, PREVIEW_REQUEST_BODY_MAX_BYTES, buildFramedPrompt, previewModelRow,
  promptContractFingerprintText, readPromptFrame, type ProviderCallRequest, type ProviderGateway
} from "@debateai/providers";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW, costEnvelopeCeilings,
  lengthGuidancePolicyStartValues, resolveLengthGuidance
} from "@debateai/register";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import {
  createRunnerMapCaller, guidedMapBound, rootZeroKeepRoomMicros, rootZeroMapMaterialChars, rootZeroMapMaterialCharsFor,
  rootZeroRoomAttempts, type MapStageDeps
} from "../../apps/runner/src/map-stage.js";
import { mapLengthAllowanceTokens } from "../../apps/api/src/ask-model-picker.js";

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

  // Task 14 review 3 (owner-editable prompts rule): an owner's edited map texts are never silently replaced on a lengthed run.
  it("owner-edited texts: a lengthed call and the hash default build the variants from the SAME texts the run uses", () => {
    const owners = mapPromptContracts({ ...MAP_DEFAULT_INSTRUCTIONS, angles: "Owner angles text.", listOpen: "Owner list text." });
    const spec = mapAnglesSpec({ ...ctx(LENGTH), contracts: owners });
    expect(spec.contract.contractId).toBe(MAP_LENGTH_CONTRACT_IDS.angles);
    expect(spec.contract.instruction.startsWith(`Owner angles text. ${LENGTH_SENTENCE_PARTS}`)).toBe(true);
    expect(spec.contract.answerForm).toBe(MAP_LENGTH_ANSWER_FORMS.angles);
    expect(mapListSpec({ ...ctx(LENGTH), contracts: owners }, null).contract.instruction.startsWith(`Owner list text. ${LENGTH_SENTENCE_PARTS}`))
      .toBe(true);
    // Without the row the owners' own contract, as today.
    expect(mapAnglesSpec({ ...ctx(), contracts: owners }).contract.instruction.startsWith("Owner angles text.\n\n")).toBe(true);
    // The hash default seals the owners' variants beside the owners' texts; the shipped default is unchanged.
    expect(mapPromptFingerprintText(owners)).toBe([...MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(owners[name])),
      ...MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(mapLengthContractsOf(owners)[name]))].join("\n---\n"));
    expect(mapLengthContractsOf(mapPromptContracts())).toEqual(mapPromptContracts(undefined, true));
    expect(mapPromptContractHash(owners)).not.toBe(mapPromptContractHash());
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
   * Ruling "PF-C5 root-0 bound" (a), pre-flight PF-C5.9, its re-rule "root-0 Free test" (2026-10-16), and the whole-branch
   * review's Ruling I1 (2026-10-17, after the refused-repair salvage merged): with the row, root 0's material bound is the
   * runaway limits (no trims, L19), and on a routed run root 0's kept room is the salvage's sum rule (first + retry + the
   * routed repair). These cases pin the MEASURED outcome:
   * - on Free, at either judge ceiling (the preview's 8,192 and 4,096), the first lengthed map list call is refused ROOM-ONLY
   *   (`RUN_COST_ENVELOPE_ROOM_KEPT`: the call alone would fit), never a money stop; at 8,192 root 0's room alone is larger
   *   than Free's body ceiling;
   * - at the dev paid start body ceiling (the site's start per-run ceiling, cut to a paid plan's credit, its body share), at
   *   4,096 the room plus one lengthed list call fits and the call is admitted; at 8,192 it does not, and the refusal is
   *   room-only.
   * What a room-only refusal does next is already pinned: the map stops, the debate argues on with today's opening
   * (`MAP_UNAVAILABLE_TODAYS_OPENING`, no spend stop), never a crash: `tests/unit/map-root-zero-room.test.ts` case
   * "(a) a refusal only because of the room stops the MAP, never the arguing" and `tests/integration/debate-shape-run.test.ts`
   * "a map call refused only to keep root 0's room …". Plan "Known limits" names this; sizing the plan ceilings for lengthed
   * debates (or a tighter root-0 frame, or accepting the skip) is the owner's decision before shape and length are switched
   * on together.
   * How the numbers are built:
   * - A plan's run ceiling: the site's per-run ceiling (the cost-envelope row's start value) cut to the plan's whole monthly
   *   credit, as `pickerMoneyLimits` cuts a person's room (apps/api/src/person-room-picker.ts), then the BODY share (the
   *   map and root 0 both spend from the body; the serve reserve is held back).
   * - Root 0's seat: any of the preview's four DeepInfra seats (the dearest per attempt, as `rootZeroKeepRoomMicros` prices
   *   it); the retry may be the routed Haiku structure-repair call (LG-A); the bound lock (a shaped run is locked).
   * - Root 0's and the list call's token ceiling: the judge bound (the preview's is `previewCallBound`: the sealed JUDGE bound
   *   raised to PREVIEW_GLM_GENERATION_TOKEN_FLOOR, 8,192); the list call raised by `guidedMapBound`.
   * - One lengthed map list call: an angle list whose angle is at the runaway angle limits, at the dearest seat.
   * - The seam: the plan's BODY seam with nothing spent yet, built as `tests/unit/map-root-zero-room.test.ts` builds its
   *   `seamAt` (`CostEnvelopeGuard(...).providerSeam(...)`), the room named as `keepRoomMicros`.
   */
  describe("with the row: root 0's kept room and one lengthed map list call, on Free and at the paid start ceiling (Ruling I1)", () => {
    const site = COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value;
    /** A plan's run policy: the site's start per-run ceiling cut to the plan's monthly credit; and its BODY ceiling. */
    const planMoney = (planId: "FREE" | "PLUS") => {
      const plan = BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.find((row) => row.plan_id === planId)!;
      const policy = Object.freeze({ perRunCeilingMicros: Math.min(site.per_run_ceiling_micros, plan.monthly_credit_micros),
        dailyCeilingMicros: site.daily_ceiling_micros, serveReserveBasisPoints: site.serve_reserve_basis_points,
        serveOverrunBasisPoints: site.serve_overrun_basis_points });
      const body = costEnvelopeCeilings({ perRunCeilingMicros: policy.perRunCeilingMicros,
        serveReserveBasisPoints: policy.serveReserveBasisPoints }).bodyMicros;
      return Object.freeze({ policy, body });
    };
    const free = planMoney("FREE");
    const paid = planMoney("PLUS");
    const price = (model: string) => {
      const row = previewModelRow(model)!;
      return Object.freeze({ inputMicrosPerMillionTokens: row.inputPriceMicrosPerMillion, outputMicrosPerMillionTokens: row.outputPriceMicrosPerMillion });
    };
    const seats = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash"].map(price);
    const previewJudgeCeiling = Math.max(DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE.tokenCeiling, PREVIEW_GLM_GENERATION_TOKEN_FLOOR);
    /** Root 0's kept room and the first lengthed list call (dearest seat) at one judge ceiling, on one plan's guidance. */
    const at = (judgeTokenCeiling: number, plan: "free" | "plus") => {
      const guidance = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan, answerLength: "standard" });
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
    /** What a plan's BODY seam, nothing spent yet, decides for that list call with root 0's room named. */
    const seamDecision = async (state: ReturnType<typeof at>, money: ReturnType<typeof planMoney>): Promise<string> => {
      const store: ModelSpendStore = {
        recordSpend: async () => undefined, readRunSpentMicros: async () => 0, readRunStorySpentMicros: async () => 0,
        readDaySpentMicros: async () => 0, admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
      };
      const seam = new CostEnvelopeGuard({ store, policy: money.policy, clock: () => new Date("2026-10-16T00:00:00.000Z") })
        .providerSeam({ runId: "run-plan", price: state.dearestSeat, requireReportedUsage: true, phase: "BODY" });
      return Promise.resolve(seam.assertCallAllowed({ ...state.projection, keepRoomMicros: state.room })).then(
        () => "ADMITTED", (error: unknown) => (error instanceof TypedDomainError ? error.code : "UNTYPED"));
    };

    it("the preview's judge ceiling is 8,192 and the paid start body ceiling is above Free's", () => {
      expect(previewJudgeCeiling).toBe(8192);
      expect(paid.body).toBeGreaterThan(free.body);
    });

    it("on Free at the preview's 8,192: root 0's room alone is larger than Free's body; the first lengthed list call is refused room-only, never a money stop", async () => {
      const state = at(previewJudgeCeiling, "free");
      expect(state.room).toBeGreaterThan(free.body); // root 0's room alone does not fit Free
      expect(state.listCall).toBeLessThanOrEqual(free.body); // the call alone would fit, so the refusal is the room's own
      expect(await seamDecision(state, free)).toBe("RUN_COST_ENVELOPE_ROOM_KEPT");
    });

    it("on Free at a 4,096 judge ceiling the first lengthed list call is refused room-only too, never a money stop", async () => {
      const state = at(4096, "free");
      expect(state.listCall).toBeLessThanOrEqual(free.body);
      expect(state.room + state.listCall).toBeGreaterThan(free.body);
      expect(await seamDecision(state, free)).toBe("RUN_COST_ENVELOPE_ROOM_KEPT");
    });

    it("at the paid start ceiling and a 4,096 judge ceiling, root 0's room plus one lengthed list call fits: admitted", async () => {
      const state = at(4096, "plus");
      expect(state.room + state.listCall).toBeLessThanOrEqual(paid.body);
      expect(await seamDecision(state, paid)).toBe("ADMITTED");
    });

    it("at the paid start ceiling and the preview's 8,192, root 0's room fits but not with one lengthed list call: refused room-only", async () => {
      const state = at(previewJudgeCeiling, "plus");
      expect(state.room).toBeLessThan(paid.body);
      expect(state.listCall).toBeLessThanOrEqual(paid.body);
      expect(state.room + state.listCall).toBeGreaterThan(paid.body);
      expect(await seamDecision(state, paid)).toBe("RUN_COST_ENVELOPE_ROOM_KEPT");
    });
  });
});

/** Task 14 review 1, 2, 5, 6: the runner's map caller, the two map allowances, every spec builder, root 0's one material bound. */
describe("the map's length wiring, end to end (R1c final wave B10)", () => {
  const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
  const BOUND = Object.freeze({ maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 60_000 });
  const recording = () => {
    const seen: ProviderCallRequest[] = [];
    const gateway = { call: async (call: ProviderCallRequest) => { seen.push(call); throw new TypedDomainError("STOP_FOR_TEST", "x"); } } as
      ProviderGateway;
    return { seen, gateway };
  };
  const deps = (gateway: ProviderGateway, lengthGuidance: typeof GUIDANCE | null): MapStageDeps => ({
    runId: "run-1", subjectItemId: "wi-1", mapContractHash: mapPromptContractHash(), judgeBound: BOUND,
    longBounds: { merge: 32 * 1024, choose: 32 * 1024 }, memberOf: () => ({ provider: gateway, providerRef: "ref-a" }), sitsOut: () => false,
    satOutBy: () => false, spendStopOf: () => null, laneStopped: () => false, abandon: () => false, serial: false,
    ...(lengthGuidance === null ? {} : { lengthGuidance }) });
  const seat = { aiRef: "ref-a", maker: "a" };

  it("the runner's map caller: a LIST call asks the guided bound, its guided words and its reply ceiling; MERGE has no ceiling", async () => {
    const { seen, gateway } = recording();
    const caller = createRunnerMapCaller(deps(gateway, GUIDANCE));
    await caller.call({ step: "LIST", callSiteKey: "MAP:list:1", seat, order: 0, shown: "BLIND", spec: mapListSpec(ctx(LENGTH), null) as never });
    expect(seen[0]!.bound).toEqual({ ...BOUND, tokenCeiling: 15_812 });
    expect(seen[0]!.bound.tokenCeiling).toBe(guidedMapBound(BOUND, 635, GUIDANCE).tokenCeiling);
    expect([seen[0]!.guidedWords, seen[0]!.replyWordsCeiling]).toEqual([95, 635]);
    await caller.call({ step: "MERGE", callSiteKey: "MAP:merge", seat, order: 0, shown: "BLIND", spec: mapMergeSpec(ctx(LENGTH), []) as never });
    expect(Object.hasOwn(seen[1]!, "replyWordsCeiling")).toBe(false);
    expect(seen[1]!.bound.tokenCeiling).toBe(32 * 1024);
  });

  it("row absent: the same bound object, and no guidedWords or replyWordsCeiling key", async () => {
    const { seen, gateway } = recording();
    await createRunnerMapCaller(deps(gateway, null)).call({ step: "LIST", callSiteKey: "MAP:list:1", seat, order: 0, shown: "BLIND",
      spec: mapListSpec(ctx(), null) as never });
    expect(seen[0]!.bound).toBe(BOUND);
    expect(Object.hasOwn(seen[0]!, "guidedWords")).toBe(false);
    expect(Object.hasOwn(seen[0]!, "replyWordsCeiling")).toBe(false);
  });

  it("the runner's map bound and the pricers' map allowance are the same number for the largest reply, and cover every contract", () => {
    for (const todayTokens of [2048, 8192, 16_384]) {
      const bound = { ...BOUND, tokenCeiling: todayTokens };
      const largest = guidedMapBound(bound, mapLargestReplyWordsCeiling(LENGTH), GUIDANCE).tokenCeiling;
      expect(largest, String(todayTokens)).toBe(mapLengthAllowanceTokens(GUIDANCE, todayTokens));
      for (const name of MAP_CONTRACT_NAMES) {
        expect(guidedMapBound(bound, mapReplyWordsCeiling(name, LENGTH), GUIDANCE).tokenCeiling, name).toBeLessThanOrEqual(largest);
      }
    }
  });

  // A text past today's 240 characters, within the runaway limits, in plain English (the reply check reads its language).
  const LONG = "Congestion pricing cuts traffic in the centre and pays for better buses for everyone who rides them daily. ".repeat(3).trim();
  const point = (claim: string) => ({ claim, why_it_matters: "It changes who pays for the roads.", leans: "context" });
  const item = (itemId: string, kind: "POINT" | "ANSWER") => (kind === "POINT"
    ? { kind, itemId, claim: "Prices cut traffic.", whyItMatters: "Fewer cars.", leans: "context", seat, origin: "BLIND", angleId: null, angleKind: null, listIndex: 0 }
    : { kind, itemId, answer: "Yes.", seat, origin: "BLIND", angleId: null, angleKind: null, listIndex: 0 }) as never;
  const keyPoint = { keyPointId: "k1", claim: "Prices cut traffic.", memberItemIds: ["p1"], blindMakers: ["a"], gapMakers: [], makers: ["a"],
    fixedAngleKinds: [], leansAgainst: false };
  const answer = (answerId: string) => ({ answerId, answer: "Yes.", memberItemIds: ["c1"], blindMakers: ["a"], makers: ["a"], fromOppositeCase: false });
  const angle = { angleId: "g1", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." } as never;
  const label = "word ".repeat(30).trim(); // 149 characters: over today's 80, within the runaway 650
  it.each([
    ["angles", (c = ctx(LENGTH)) => mapAnglesSpec(c), JSON.stringify({ question_language: "en", angles: [
      { angle_id: "opposite", kind: "OPPOSITE_CASE", label, focus: "What if waiting is better?" },
      { angle_id: "worry", kind: "ASKER_WORRY", label: "Your worry", focus: "Prices." },
      { angle_id: "practical", kind: "PRACTICAL", label: "In practice", focus: "Timing." },
      { angle_id: "specific", kind: "SPECIFIC", label: "The cost", focus: "Who pays." }] })],
    ["list (open)", (c = ctx(LENGTH)) => mapListSpec(c, null), JSON.stringify({ points: [point(LONG), point(LONG), point(LONG)], candidate_answers: ["Yes."] })],
    ["list (angle)", (c = ctx(LENGTH)) => mapListSpec(c, angle), JSON.stringify({ points: [point(LONG), point(LONG), point(LONG)], candidate_answers: ["Yes."] })],
    ["snowball", (c = ctx(LENGTH)) => mapSnowballSpec(c, []), JSON.stringify({ points: [point(LONG)], candidate_answers: [] })],
    ["merge", (c = ctx(LENGTH)) => mapMergeSpec(c, [item("p1", "POINT"), item("c1", "ANSWER")]), JSON.stringify({
      key_points: [{ key_point_id: "k1", claim: LONG, member_item_ids: ["p1"] }], answers: [{ answer_id: "x1", answer: LONG, member_item_ids: ["c1"] }] })],
    ["gap", (c = ctx(LENGTH)) => mapGapSpec(c, [keyPoint], [answer("x1")]), JSON.stringify({ new_points: [point(LONG)], framing_challenges: [LONG] })],
    ["choose", (c = ctx(LENGTH)) => mapChooseSpec(c, [keyPoint], [answer("x1"), answer("x2")]), JSON.stringify({ answers: [
      { answer_id: "x1", statement: LONG, for: ["k1"], against: [], strongest_rival: "x2" },
      { answer_id: "x2", statement: "No, not yet.", for: [], against: ["k1"], strongest_rival: "x1" }] })]
  ] as const)("every map spec builder reads a lengthed %s reply with the runaway limits, untrimmed", (_name, build, reply) => {
    const spec = build();
    expect(spec.classify(reply, { finishReason: "stop" }).parseStatus, JSON.stringify(spec.classify(reply).parseError)).toBe("PARSED");
    const classified = spec.classify(reply, { finishReason: "stop" });
    expect(JSON.stringify(classified)).not.toContain("MAP_TEXT_TRIMMED");
    // The same reply under today's spec is trimmed or refused: the lengthed reading is what lets it through whole.
    const today = build(ctx()).classify(reply, { finishReason: "stop" });
    expect(today.parseStatus !== "PARSED" || JSON.stringify(today).includes("MAP_TEXT_TRIMMED"), JSON.stringify(today)).toBe(true);
  });

  it("root 0's map material bound is computed once in the runner and read by its room and every root's framing", () => {
    const runner = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
    expect(runner.split("rootZeroMapMaterialCharsFor(").length - 1).toBe(1);
    expect(runner).toContain("const rootMaterialChars = rootZeroMapMaterialCharsFor(mapLimitsFor(lengthGuidance !== null));");
    expect(runner.split("materialChars: rootMaterialChars }").length - 1).toBe(1);
    expect(runner.split("mapPoints: position.mapPoints }, rootMaterialChars)").length - 1).toBe(1);
  });
});
