// Owner rulings of 2026-10-12 for the preview practice's verdict:
//  - "Fixed slips = warning": a format or content slip the SAME call's second try fixed is a warning, listed per AI
//    (FORMAT_REPAIRED:<model>:<n>); a call that ends without an accepted reply after its tries fails; one AI whose first
//    tries slip more than 1 in 10 of its answered calls fails (one slip always allowed: slips > max(1, floor(answered/10))).
//  - "Keep GLM, it sits out": a busy model that gave at least one accepted answer is a warning (MODEL_BUSY_PARTLY), not
//    NOT_PROVEN; a busy model with no accepted answer stays NOT_PROVEN.
// Patch follow-up (owner design, 2026-10-12): a slip whose reply decoded to an object is first answered by the SHORT
// follow-up (the model's own answer back, only the failing paths asked for); a patch that does not do falls back to the
// full re-ask (a third POST). The practice reports which one fixed it (information only; the verdict is unchanged).
import { describe, expect, it } from "vitest";
import {
  PREVIEW_REVIEWED_PROVIDER_REFS,
  PreviewVendorRefusedUnbilled,
  parsePreviewProviderTestConfig,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewRunnerPolicy,
  previewTargetJsonRow,
  type PreviewBudgetPort
} from "@debateai/providers";
import { loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import { stubChatBody, stubVendorReply } from "../support/preview-gate-stubs.js";
import { readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { PracticeGateObserver, vendorUsage } from "../../tools/preview-practice/practice-gate-observer.js";
import { onePerModel, runPracticeFormats } from "../../tools/preview-practice/practice-formats.js";
import { cacheByModel, formatsReport, reportMarkdown } from "../../tools/preview-practice/practice-report.js";
import {
  practiceCallFacts,
  practiceModelCalls,
  practiceRepairKindOf,
  practiceRepairKindsByModel,
  practiceSlipRateExceeded,
  practiceVerdict,
  type PracticeVerdictInput
} from "../../tools/preview-practice/practice-verdict.js";

const CLEAN: PracticeVerdictInput = Object.freeze({
  harnessError: null, completed: true, servedAnswer: true, storyOutcome: "READY", formatFailures: 0, failedCalls: 0,
  gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: { a: 1_000 }
});
const calls = (answered: number, slips: number, repaired = slips, unrecovered = 0) => ({ answered, slips, repaired, unrecovered });

describe("practice verdict: fixed slips are a warning (owner ruling 2026-10-12)", () => {
  it("a slip the same call's second try fixed: PASS_WITH_WARNINGS, listed per AI", () => {
    expect(practiceVerdict({ ...CLEAN, callsByModel: { mimo: calls(12, 1), haiku: calls(12, 0) } }))
      .toEqual({ verdict: "PASS_WITH_WARNINGS", exitCode: 10, reasons: ["FORMAT_REPAIRED:mimo:1"] });
  });

  it("2 slips in 10 answered calls: FAIL (SLIP_RATE), even when both were fixed", () => {
    expect(practiceVerdict({ ...CLEAN, callsByModel: { mimo: calls(10, 2) } }))
      .toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["SLIP_RATE:mimo:2/10", "FORMAT_REPAIRED:mimo:2"] });
  });

  it("a call that never got an accepted reply after its tries: FAIL", () => {
    expect(practiceVerdict({ ...CLEAN, formatFailures: 1, callsByModel: { mimo: calls(20, 1, 0, 1) } }))
      .toEqual({ verdict: "FAIL", exitCode: 20, reasons: ["FORMAT_FAILED:1"] });
  });

  it("the exact rule: FAIL when slips > max(1, floor(answered / 10))", () => {
    const cases: readonly (readonly [number, number, boolean])[] = [
      [0, 1, false], [3, 1, false], [1, 1, false], [9, 2, true], [10, 2, true], [19, 2, true], [20, 2, false], [25, 3, true],
      [30, 3, false], [100, 10, false], [100, 11, true], [5, 0, false]
    ];
    for (const [answered, slips, fails] of cases) {
      expect(practiceSlipRateExceeded({ answered, slips }), `${String(slips)} in ${String(answered)}`).toBe(slips > Math.max(1, Math.floor(answered / 10)));
      expect(practiceSlipRateExceeded({ answered, slips }), `${String(slips)} in ${String(answered)}`).toBe(fails);
    }
  });

  it("a call's tries: the first REPLY decides the slip (an unbilled refusal has none); answered when one try ended OK", () => {
    expect(practiceCallFacts([{ outcome: "FAILED", parseStatus: "SCHEMA_FAILED" }, { outcome: "OK", parseStatus: "PARSED" }]))
      .toEqual({ answered: true, slip: true, repaired: true, unrecovered: false });
    expect(practiceCallFacts([{ outcome: "REFUSED", parseStatus: null }, { outcome: "OK", parseStatus: "PARSED" }]))
      .toEqual({ answered: true, slip: false, repaired: false, unrecovered: false });
    expect(practiceCallFacts([{ outcome: "FAILED", parseStatus: "PARSE_FAILED" }, { outcome: "FAILED", parseStatus: "PARSE_FAILED" }]))
      .toEqual({ answered: false, slip: true, repaired: false, unrecovered: true });
    // A slip, then a transport failure, then (the runner's final retry) an answer: the step on that maker was answered.
    expect(practiceCallFacts([{ outcome: "FAILED", parseStatus: "PARSE_FAILED" }, { outcome: "TIMED_OUT", parseStatus: null },
      { outcome: "OK", parseStatus: "PARSED" }])).toEqual({ answered: true, slip: true, repaired: true, unrecovered: false });
    expect(practiceModelCalls([
      { model: "m", tries: [{ outcome: "OK", parseStatus: "PARSED" }] },
      { model: "m", tries: [{ outcome: "FAILED", parseStatus: "SCHEMA_FAILED" }, { outcome: "OK", parseStatus: "PARSED" }] },
      { model: "n", tries: [{ outcome: "FAILED", parseStatus: "UNPARSED" }] }
    ])).toEqual({ m: { answered: 2, slips: 1, repaired: 1, unrecovered: 0 }, n: { answered: 0, slips: 1, repaired: 0, unrecovered: 1 } });
  });

  it("how a repaired call was fixed: the accepted try's form (PATCH, FULL, or RESEND for the original sent again); information only", () => {
    const slip = { outcome: "FAILED", parseStatus: "SCHEMA_FAILED", replyForm: "ORIGINAL" } as const;
    expect(practiceRepairKindOf([slip, { outcome: "OK", parseStatus: "PARSED", replyForm: "PATCH" }])).toBe("PATCH");
    expect(practiceRepairKindOf([slip, { outcome: "FAILED", parseStatus: "SCHEMA_FAILED", replyForm: "PATCH" },
      { outcome: "OK", parseStatus: "PARSED", replyForm: "FULL" }])).toBe("FULL");
    expect(practiceRepairKindOf([slip, { outcome: "OK", parseStatus: "PARSED", replyForm: "ORIGINAL" }])).toBe("RESEND");
    // Not repaired, or the form not recorded (an older log): no kind.
    expect(practiceRepairKindOf([{ outcome: "OK", parseStatus: "PARSED", replyForm: "ORIGINAL" }])).toBeNull();
    expect(practiceRepairKindOf([{ outcome: "FAILED", parseStatus: "SCHEMA_FAILED" }, { outcome: "OK", parseStatus: "PARSED" }])).toBeNull();
    expect(practiceRepairKindsByModel([
      { model: "m", tries: [slip, { outcome: "OK", parseStatus: "PARSED", replyForm: "PATCH" }] },
      { model: "m", tries: [slip, { outcome: "OK", parseStatus: "PARSED", replyForm: "FULL" }] },
      { model: "m", tries: [{ outcome: "FAILED", parseStatus: "SCHEMA_FAILED" }, { outcome: "OK", parseStatus: "PARSED" }] },
      { model: "n", tries: [{ outcome: "OK", parseStatus: "PARSED", replyForm: "ORIGINAL" }] }
    ])).toEqual({ m: { repairedByPatch: 1, repairedByFullAsk: 1, repairedOtherwise: 1 } });
    // The verdict reads none of it: FORMAT_REPAIRED counts a repaired call whichever way it was fixed.
    expect(practiceVerdict({ ...CLEAN, callsByModel: { m: calls(20, 2) } }).reasons).toEqual(["FORMAT_REPAIRED:m:2"]);
  });

  it("a story served with the checker's reservation is a warning; any other story that is not READY fails (owner ruling 2026-10-12)", () => {
    expect(practiceVerdict({ ...CLEAN, storyOutcome: "READY_WITH_RESERVATION" })).toMatchObject({ verdict: "PASS_WITH_WARNINGS", reasons: ["STORY_RESERVED"] });
    expect(practiceVerdict({ ...CLEAN, storyOutcome: "FAILED" })).toMatchObject({ verdict: "FAIL", reasons: ["STORY_NOT_READY:FAILED"] });
    expect(practiceVerdict({ ...CLEAN, storyOutcome: "MISSING" })).toMatchObject({ verdict: "FAIL", reasons: ["STORY_NOT_READY:MISSING"] });
  });
});

describe("practice verdict: a busy model that answered is a warning (owner ruling 2026-10-12, \"Keep GLM, it sits out\")", () => {
  it("busy with at least one accepted answer: PASS_WITH_WARNINGS, with what it answered and skipped", () => {
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 15 } }, unbilledRefusals: 4,
      callsByModel: { glm: calls(3, 0) } }))
      .toEqual({ verdict: "PASS_WITH_WARNINGS", exitCode: 10, reasons: ["MODEL_BUSY_PARTLY:glm:answered=3:skipped=15", "UNBILLED_REFUSALS:4"] });
  });

  it("busy with no accepted answer: NOT_PROVEN, as before", () => {
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 0, skipped: 18 } }, notExercisedModels: ["glm"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["MODEL_BUSY:glm"] });
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"] }).verdict).toBe("NOT_PROVEN");
  });

  it("its answered calls count toward its slip rate like any other AI's; everything else is unchanged", () => {
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 15 } }, callsByModel: { glm: calls(3, 2) } }).verdict)
      .toBe("FAIL");
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 1 } }, gateHalted: true }).verdict).toBe("FAIL");
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 1 } },
      gatePauses: ["deepinfra:NOT_REACHED_IN_A_ROW_4"] }).verdict).toBe("NOT_PROVEN");
    expect(practiceVerdict({ ...CLEAN, busyModels: ["glm"], busyRuns: { glm: { answered: 3, skipped: 1 } }, interrupted: true }).verdict).toBe("NOT_PROVEN");
  });
});

describe("practice formats: the second try is the app's own (same preview call policy), and its slip is a warning", () => {
  const FIVE = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"];
  const MIMO = FIVE[2]!;
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", free_model_ids: FIVE.slice(0, 2),
    premium_model_ids: FIVE, requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-slips-unit" }))!;
  const configured = PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  });
  const targets = onePerModel(parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), configured), FIVE);
  const policy = previewRunnerPolicy({ bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
    synthesisRolePolicy: { synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER, evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE } }, config);
  const bounds = { judge: policy.bounds.JUDGE, synthesizer: policy.synthesisRolePolicy.synthesizerBound, evaluator: policy.synthesisRolePolicy.evaluatorBound };
  const pack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
  const GOOD = JSON.stringify({ statement: "Free central lines are worth it if new money pays for them.", way_of_knowing: "REASONING",
    locator: null, restatement_text: "Should central buses be free?", restatement_status: "PASS", value_laden: true, claim_type: "normative",
    steelman: { summary: "Fares are a barrier.", fidelity: 0.8 }, critic: { summary: "Lost fares cut service.", counterargumentStrength: 0.6, basis: "PLAUSIBLE_COUNTER" },
    evidence: { quality: 0.4, relevance: 0.8 }, context: { fit: 0.8, ambiguityFlags: [] }, fallacy: { severity: 0.1, fatalFlags: [] } });
  const { value_laden: _left, ...withoutValueLaden } = JSON.parse(GOOD) as Record<string, unknown>;
  const MISSING_FIELD = JSON.stringify(withoutValueLaden);

  /** The patch follow-up's answer when it does its job: only the member it was asked for. */
  const PATCH = JSON.stringify({ value_laden: true });

  /**
   * What a request asks, read through the frame (the one reader): the step's own packet, the short patch follow-up
   * (its last block's `machine_reply_form` is PATCH), or the full re-ask (a block naming the refusal).
   */
  function requestForm(provider: "deepinfra" | "anthropic", requestBody: string): "ORIGINAL" | "PATCH" | "FULL" {
    const fields = readFramedMaterial(wirePacket(stubChatBody(provider, JSON.parse(requestBody) as Record<string, unknown>))).fields;
    const last = fields.at(-1);
    if (last?.name === "machine_reply_form" && last.content === "PATCH") return "PATCH";
    return fields.some((field) => field.name === "machine_rejection_code") ? "FULL" : "ORIGINAL";
  }

  /**
   * Every model answers well, except MiMo's first reply of its first `slips.remaining` jobs, which leaves out a
   * required field. MiMo answers a patch follow-up with `patchAnswer`: the patch itself (the default), or its whole
   * answer again (refused as a patch, so the call goes on to the full re-ask, which is answered well).
   */
  function port(provider: "deepinfra" | "anthropic", slips: { remaining: number }, sent: string[],
    patchAnswer: string = PATCH, forms: string[] = []): PreviewBudgetPort {
    let id = 0;
    return { async execute(input) {
      const body = JSON.parse(input.requestBody) as { model: unknown };
      const model = String(body.model);
      sent.push(model);
      id += 1;
      const form = requestForm(provider, input.requestBody);
      if (model === MIMO) forms.push(form);
      let content = GOOD;
      if (model === MIMO && form === "PATCH") content = patchAnswer;
      else if (model === MIMO && form === "ORIGINAL" && slips.remaining > 0) { slips.remaining -= 1; content = MISSING_FIELD; }
      return { status: 200, body: stubVendorReply(provider, model, content, `slip-${String(id)}`) };
    } };
  }
  const remaining = { deepinfra: { before: null, after: null }, anthropic: { before: null, after: null } };

  async function run(slipCount: number, samples: number, patchAnswer: string = PATCH) {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const sent: string[] = [];
    const forms: string[] = [];
    const slips = { remaining: slipCount };
    const ports = { deepinfra: observer.wrap("deepinfra", port("deepinfra", slips, sent, patchAnswer, forms)),
      anthropic: observer.wrap("anthropic", port("anthropic", slips, sent, patchAnswer, forms)) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION"], samples, gapMs: 0, pack, bounds,
      sleep: async () => undefined });
    const report = formatsReport({ result, observer, remaining, startedAt: new Date(0), finishedAt: new Date(1), interrupted: false });
    return { result, report, sent, forms };
  }

  it("MiMo leaves out a field once, the short patch follow-up fixes it: REPAIRED by PATCH, PASS_WITH_WARNINGS with FORMAT_REPAIRED", async () => {
    const { result, report, sent, forms } = await run(1, 2);
    const mimo = result.samples.filter((sample) => sample.model === MIMO);
    expect(mimo.map((sample) => sample.status)).toEqual(["REPAIRED", "PARSED"]);
    expect(mimo[0]!.attempts.map((attempt) => [attempt.outcome, attempt.parseStatus])).toEqual([["FAILED", "SCHEMA_FAILED"], ["OK", "PARSED"]]);
    expect(mimo[0]!.attempts.map((attempt) => attempt.replyForm)).toEqual(["ORIGINAL", "PATCH"]);
    expect(mimo.map((sample) => sample.repairKind)).toEqual(["PATCH", null]);
    expect(mimo[0]!.issues).toEqual(["invalid_type@value_laden"]);
    // The second POST was the patch follow-up, as the gate saw it; the next job started afresh.
    expect(forms).toEqual(["ORIGINAL", "PATCH", "ORIGINAL"]);
    expect(sent.filter((model) => model === MIMO)).toHaveLength(3);
    expect(report).toMatchObject({ verdict: "PASS_WITH_WARNINGS", exitCode: 10, reasons: [`FORMAT_REPAIRED:${MIMO}:1`] });
    expect((report.slipsByModel as Record<string, unknown>)[MIMO]).toMatchObject({ answered: 2, slips: 1, repaired: 1, unrecovered: 0,
      repairedByPatch: 1, repairedByFullAsk: 0, repairedOtherwise: 0, slipRateExceeded: false });
    expect(report.totals).toMatchObject({ formatFailures: 0, formatRepaired: 1, formatRepairedByPatch: 1, formatRepairedByFullAsk: 0,
      formatRepairedOtherwise: 0 });
    expect(reportMarkdown(report)).toContain("1 fixed by the same call (by patch 1, by full re-ask 0, otherwise 0)");
  });

  it("MiMo answers the patch follow-up with its whole answer again (refused as a patch), the full re-ask fixes it: REPAIRED by FULL, three tries", async () => {
    const { result, report, forms } = await run(1, 1, GOOD);
    const mimo = result.samples.find((sample) => sample.model === MIMO)!;
    expect(mimo.status).toBe("REPAIRED");
    expect(mimo.attempts.map((attempt) => [attempt.outcome, attempt.parseStatus, attempt.replyForm])).toEqual([
      ["FAILED", "SCHEMA_FAILED", "ORIGINAL"], ["FAILED", "SCHEMA_FAILED", "PATCH"], ["OK", "PARSED", "FULL"]]);
    expect(forms).toEqual(["ORIGINAL", "PATCH", "FULL"]);
    expect(mimo.repairKind).toBe("FULL");
    // The diagnosis is the slip itself (the first reply), not the refused patch.
    expect(mimo.issues).toEqual(["invalid_type@value_laden"]);
    expect(report).toMatchObject({ verdict: "PASS_WITH_WARNINGS", reasons: [`FORMAT_REPAIRED:${MIMO}:1`] });
    expect((report.slipsByModel as Record<string, unknown>)[MIMO]).toMatchObject({ repaired: 1, repairedByPatch: 0, repairedByFullAsk: 1 });
    expect(report.totals).toMatchObject({ formatRepaired: 1, formatRepairedByPatch: 0, formatRepairedByFullAsk: 1 });
  });

  it("MiMo slips twice in its two jobs, each fixed: over the slip rule, FAIL", async () => {
    const { report } = await run(2, 2);
    expect(report.verdict).toBe("FAIL");
    expect(report.reasons).toEqual([`SLIP_RATE:${MIMO}:2/2`, `FORMAT_REPAIRED:${MIMO}:2`]);
  });

  it("MiMo's patch and full re-ask are refused too: the call ends without an accepted reply after three tries, FAIL (FORMAT_FAILED)", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const always: PreviewBudgetPort = { async execute(input) {
      const model = String((JSON.parse(input.requestBody) as { model: unknown }).model);
      return { status: 200, body: stubVendorReply("deepinfra", model, model === MIMO ? MISSING_FIELD : GOOD, "x") };
    } };
    const ports = { deepinfra: observer.wrap("deepinfra", always), anthropic: observer.wrap("anthropic", port("anthropic", { remaining: 0 }, [])) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION"], samples: 1, gapMs: 0, pack, bounds,
      sleep: async () => undefined });
    const mimo = result.samples.find((sample) => sample.model === MIMO)!;
    expect(mimo.status).toBe("SCHEMA_FAILED");
    // First try, the patch follow-up (answered with the whole object again: refused), the full re-ask.
    expect(mimo.attempts.map((attempt) => [attempt.outcome, attempt.replyForm])).toEqual([["FAILED", "ORIGINAL"], ["FAILED", "PATCH"], ["FAILED", "FULL"]]);
    expect(mimo.repairKind).toBeNull();
    const report = formatsReport({ result, observer, remaining, startedAt: new Date(0), finishedAt: new Date(1), interrupted: false });
    expect(report.verdict).toBe("FAIL");
    expect(report.reasons).toContain("FORMAT_FAILED:1");
    expect(report.totals).toMatchObject({ formatRepaired: 0, formatRepairedByPatch: 0, formatRepairedByFullAsk: 0 });
  });

  it("a busy GLM that answered one job and then sat out: MODEL_BUSY_PARTLY, a warning", async () => {
    const GLM = FIVE[0]!;
    const observer = new PracticeGateObserver({ now: () => 0 });
    let glmCalls = 0;
    const busyAfterOne: PreviewBudgetPort = { async execute(input) {
      const model = String((JSON.parse(input.requestBody) as { model: unknown }).model);
      if (model === GLM && ++glmCalls > 1) throw new PreviewVendorRefusedUnbilled();
      return { status: 200, body: stubVendorReply("deepinfra", model, GOOD, "x") };
    } };
    const ports = { deepinfra: observer.wrap("deepinfra", busyAfterOne), anthropic: observer.wrap("anthropic", port("anthropic", { remaining: 0 }, [])) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION"], samples: 4, gapMs: 0, pack, bounds,
      sleep: async () => undefined });
    expect(result.busyModels).toEqual([GLM]);
    const report = formatsReport({ result, observer, remaining, startedAt: new Date(0), finishedAt: new Date(1), interrupted: false });
    expect(report.verdict).toBe("PASS_WITH_WARNINGS");
    expect(report.reasons).toContain(`MODEL_BUSY_PARTLY:${GLM}:answered=1:skipped=3`);
    expect(report.reasons.some((reason) => reason.startsWith("MODEL_BUSY:"))).toBe(false);
  });

  it("the prompt cache as the vendors report it: per call on the wire, per job, and one line per AI (information only)", async () => {
    const observer = new PracticeGateObserver({ now: () => 0 });
    const cached = (provider: "deepinfra" | "anthropic"): PreviewBudgetPort => ({ async execute(input) {
      const model = String((JSON.parse(input.requestBody) as { model: unknown }).model);
      const reply = JSON.parse(stubVendorReply(provider, model, GOOD, "c")) as Record<string, unknown>;
      // DeepInfra: prompt_tokens holds the cached part; Anthropic: input_tokens leaves the cache reads and writes out.
      reply.usage = provider === "anthropic"
        ? { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 80, cache_creation_input_tokens: 10 }
        : model === MIMO ? { prompt_tokens: 100, completion_tokens: 50 }
          : { prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 60 } };
      return { status: 200, body: JSON.stringify(reply) };
    } });
    const ports = { deepinfra: observer.wrap("deepinfra", cached("deepinfra")), anthropic: observer.wrap("anthropic", cached("anthropic")) };
    const result = await runPracticeFormats({ config, targets, ports, observer, lanes: ["JUDGE_POSITION"], samples: 1, gapMs: 0, pack, bounds,
      sleep: async () => undefined });
    const byModel = Object.fromEntries(result.samples.map((sample) => [sample.model, sample]));
    expect(byModel[FIVE[0]!]).toMatchObject({ inputTokens: 100, cachedInputTokens: 60 });
    expect(byModel[MIMO]).toMatchObject({ inputTokens: 100, cachedInputTokens: null });
    expect(byModel["claude-haiku-5-5"]).toMatchObject({ inputTokens: 100, cachedInputTokens: 80 });
    expect(observer.events.find((event) => event.model === MIMO)).not.toHaveProperty("cachedInputTokens");
    expect(cacheByModel(observer)).toMatchObject({
      [FIVE[0]!]: { calls: 1, inputTokens: 100, cachedInputTokens: 60, callsReportingCache: 1, cachedShare: 0.6 },
      [MIMO]: { calls: 1, inputTokens: 100, cachedInputTokens: 0, callsReportingCache: 0, cachedShare: 0 },
      "claude-haiku-5-5": { calls: 1, inputTokens: 100, cachedInputTokens: 80, callsReportingCache: 1, cachedShare: 0.8 }
    });
    const report = formatsReport({ result, observer, remaining, startedAt: new Date(0), finishedAt: new Date(1), interrupted: false });
    expect(report.verdict).toBe("PASS");
    expect(report.cacheByModel).toEqual(cacheByModel(observer));
    expect(reportMarkdown(report)).toContain(`- ${FIVE[0]!}: 1 answered calls, 100 input tokens, 60 read from the cache (60.0%)`);
    expect(reportMarkdown(report)).toContain(`- ${MIMO}: 1 answered calls, 100 input tokens, 0 read from the cache (0.0%); 1 call(s) reported no cache count`);
    expect(vendorUsage("deepinfra", JSON.stringify({ usage: { prompt_tokens: 7, completion_tokens: 1, cached_tokens: 3 } })))
      .toEqual({ inputTokens: 7, outputTokens: 1, reasoningTokens: null, cachedInputTokens: 3 });
  });
});
