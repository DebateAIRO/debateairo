/**
 * Side-by-side spec §13, addition D12-D20 (owner 2026-10-22): the preview's AI line-up (the two plan rosters and the
 * thinking-level table) becomes a sealed settings value. This file pins the providers-level pieces (SA1):
 * - `parsePreviewLineUp`, the row value's own check (reviewed ids, unique per roster, the maker rule, the thinking menus);
 * - `parsePreviewEnvironmentConfig`, the env's three forms (legacy five keys, six keys, and the new sockets-only form);
 * - `composePreviewProviderTestConfig`, the gate part plus a line-up, back into today's config shape;
 * - `previewSeatableModels`, every model a version can seat (D20);
 * - the two halves of the target check, and the call policy's per-run thinking table (D17).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyStructuredArtifact, judgeArtifactSchema } from "@debateai/judgement";
import {
  OpenAICompatibleProviderGateway, PREVIEW_REVIEWED_PROVIDER_REFS, assertPreviewProviderTargets, assertPreviewRostersServed,
  assertPreviewTargetSet, buildFramedPrompt, buildFramedRepairPrompt, composePreviewProviderTestConfig, createPreviewGuardedFetch,
  parsePreviewEnvironmentConfig, parsePreviewLineUp, parsePreviewProviderTestConfig, parseProviderDiscoveryTargets, previewLineUpOfConfig,
  previewModelRow, previewSeatableModels, previewTargetGatewayControls, previewTargetJsonRow, providerTargetGatewayControls,
  schemaFailureLocator, validatePreviewProviderTestConfig, withPreviewProviderCallPolicy,
  type PreviewBudgetExecution, type PreviewThinkingLevels, type ProviderCallRequest, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const ALL_FIVE = [GLM, DEEPSEEK, MIMO, QWEN, HAIKU];
/**
 * The owner's live table (final, 2026-10-13; memory "thinking-effort-owner-setting-2026-10-12"), pasted verbatim: the
 * table the preview runs with today, which the first settings version must carry unchanged.
 */
const OWNER_LIVE_TABLE = JSON.parse(`{"zai-org/GLM-5.3-Flash":{"level":"high"},"deepseek-ai/DeepSeek-V4.1-Flash":{"level":"none"},"Qwen/Qwen3.8-Flash":{"level":"medium"},"XiaomiMiMo/MiMo-V2.6-Pro":{"level":"default","steps":{"pros_cons":"none","cross_exchange":"none"}},"claude-haiku-5-5":{"level":"medium","steps":{"judge_panel":"high","reviewer":"high","answer_checker":"high","story_checker":"high","answer_writer":"high","story_writer":"high","slip_fix":"medium"}}}`) as Record<string, unknown>;
const LIVE_FREE = [GLM, DEEPSEEK];

const DEEPINFRA_SOCKET = "/run/debateai-v3-preview/deepinfra-budget-v3.sock";
const ANTHROPIC_SOCKET = "/run/debateai-v3-preview/anthropic-budget-v1.sock";
const SOCKETS = { budget_socket: DEEPINFRA_SOCKET, deployment: "v3-preview", requested_thinking_level: "high", scope_id: "preview-line-up-fixture" };
const LEGACY = { ...SOCKETS, free_model_ids: [GLM] };
const SIX = { ...SOCKETS, anthropic_budget_socket: ANTHROPIC_SOCKET, free_model_ids: LIVE_FREE, premium_model_ids: ALL_FIVE,
  thinking_levels: OWNER_LIVE_TABLE };
const lineUp = (change: Record<string, unknown> = {}) => ({ free_model_ids: LIVE_FREE, premium_model_ids: ALL_FIVE,
  thinking_levels: OWNER_LIVE_TABLE, ...change });
const env = (value: unknown) => parsePreviewEnvironmentConfig(JSON.stringify(value));
const parse = (value: unknown) => parsePreviewProviderTestConfig(JSON.stringify(value));

describe("parsePreviewLineUp: the row value's own check (addition D12)", () => {
  it("accepts the owner's live table with the live rosters, and the same rosters with no table", () => {
    const parsed = parsePreviewLineUp(lineUp());
    expect(parsed).toEqual({ free_model_ids: LIVE_FREE, premium_model_ids: ALL_FIVE, thinking_levels: OWNER_LIVE_TABLE });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.free_model_ids)).toBe(true);
    expect(Object.isFrozen(parsed.premium_model_ids)).toBe(true);
    expect(parsePreviewLineUp(lineUp({ thinking_levels: null })))
      .toEqual({ free_model_ids: LIVE_FREE, premium_model_ids: ALL_FIVE, thinking_levels: null });
  });
  it.each([
    ["an unreviewed id", lineUp({ free_model_ids: [GLM, "other/model"] }), "PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids:unreviewed"],
    ["a duplicate id", lineUp({ premium_model_ids: [GLM, DEEPSEEK, GLM] }), "PREVIEW_LINE_UP_POLICY_INVALID:premium_model_ids:duplicate"],
    ["an empty roster", lineUp({ premium_model_ids: [] }), "PREVIEW_LINE_UP_POLICY_INVALID:premium_model_ids:list"],
    ["a roster that is not a list", lineUp({ free_model_ids: GLM }), "PREVIEW_LINE_UP_POLICY_INVALID:free_model_ids:list"],
    ["a roster pair breaking the maker rule", lineUp({ free_model_ids: [GLM] }), "PREVIEW_LINE_UP_POLICY_INVALID:maker_rule"],
    ["an extra member", lineUp({ kind: "PREVIEW_LINE_UP_POLICY" }), "PREVIEW_LINE_UP_POLICY_INVALID:members"],
    ["a missing table member", { free_model_ids: LIVE_FREE, premium_model_ids: ALL_FIVE }, "PREVIEW_LINE_UP_POLICY_INVALID:members"],
    ["not an object", [LIVE_FREE, ALL_FIVE], "PREVIEW_LINE_UP_POLICY_INVALID:value"],
    ["{} as a table", lineUp({ thinking_levels: {} }), "PREVIEW_THINKING_LEVELS_INVALID:table"],
    ["Qwen at \"high\"", lineUp({ thinking_levels: { [QWEN]: { level: "high" } } }), `PREVIEW_THINKING_LEVELS_INVALID:level ${QWEN}`],
    ["GLM at \"medium\"", lineUp({ thinking_levels: { [GLM]: { level: "medium" } } }), `PREVIEW_THINKING_LEVELS_INVALID:level ${GLM}`],
    ["MiMo at \"low\"", lineUp({ thinking_levels: { [MIMO]: { level: "low" } } }), `PREVIEW_THINKING_LEVELS_INVALID:level ${MIMO}`],
    ["Haiku at \"none\"", lineUp({ thinking_levels: { [HAIKU]: { level: "none" } } }), `PREVIEW_THINKING_LEVELS_INVALID:level ${HAIKU}`],
    ["an unknown step", lineUp({ thinking_levels: { [GLM]: { steps: { judging: "low" } } } }), `PREVIEW_THINKING_LEVELS_INVALID:step ${GLM} judging`]
  ])("refuses %s", (_name, value, message) => {
    let thrown: unknown;
    try { parsePreviewLineUp(value); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as Error).message).toBe(message);
  });
});

describe("parsePreviewEnvironmentConfig: the env's three forms (addition D14)", () => {
  it("is undefined when the variable is unset", () => {
    expect(parsePreviewEnvironmentConfig(undefined)).toBeUndefined();
  });
  it("the legacy five keys: the env line-up is free = premium = [GLM], no table", () => {
    const parsed = env(LEGACY)!;
    expect(parsed).toEqual({ gate: SOCKETS, envLineUp: { free_model_ids: [GLM], premium_model_ids: [GLM], thinking_levels: null } });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.gate)).toBe(true);
  });
  it("the six keys with the Anthropic socket and a table: both carried", () => {
    expect(env(SIX)).toEqual({ gate: { ...SOCKETS, anthropic_budget_socket: ANTHROPIC_SOCKET },
      envLineUp: { free_model_ids: LIVE_FREE, premium_model_ids: ALL_FIVE, thinking_levels: OWNER_LIVE_TABLE } });
  });
  it("the sockets-only form, with or without the Anthropic socket: no env line-up", () => {
    expect(env(SOCKETS)).toEqual({ gate: SOCKETS, envLineUp: null });
    expect(env({ ...SOCKETS, anthropic_budget_socket: ANTHROPIC_SOCKET }))
      .toEqual({ gate: { ...SOCKETS, anthropic_budget_socket: ANTHROPIC_SOCKET }, envLineUp: null });
    // Today's parser still refuses it: the kit, tests and tools keep its exact behaviour.
    expect(() => parse(SOCKETS)).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  it("refuses the sockets-only form with a table but no rosters (a table without rosters is never meant)", () => {
    expect(() => env({ ...SOCKETS, thinking_levels: OWNER_LIVE_TABLE })).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(() => env({ ...SOCKETS, anthropic_budget_socket: ANTHROPIC_SOCKET, thinking_levels: { [GLM]: { level: "low" } } }))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  const MULTI = { ...SOCKETS, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN] };
  const THREE_MAKERS = { ...SOCKETS, anthropic_budget_socket: ANTHROPIC_SOCKET, free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, HAIKU] };
  // Today's refusal tables (preview-multi-model.test.ts, preview-anthropic-gate.test.ts), plus the shared field checks.
  it.each([
    ["a one-maker Free roster while two makers exist", { ...MULTI, free_model_ids: [GLM] }],
    ["a one-maker Premium roster while two makers exist", { ...MULTI, premium_model_ids: [MIMO] }],
    ["an unreviewed id", { ...MULTI, free_model_ids: [GLM, "other/model"] }],
    ["a duplicate id", { ...MULTI, free_model_ids: [GLM, GLM, DEEPSEEK] }],
    ["an empty roster", { ...MULTI, premium_model_ids: [] }],
    ["a missing premium list with a non-GLM free list", { ...SOCKETS, free_model_ids: [GLM, DEEPSEEK] }],
    ["a legacy form with another model", { ...SOCKETS, free_model_ids: [DEEPSEEK] }],
    ["an extra key", { ...MULTI, other_budget_socket: "/run/debateai-v3-preview/a.sock" }],
    ["an extra key on the sockets-only form", { ...SOCKETS, other_budget_socket: "/run/debateai-v3-preview/a.sock" }],
    ["a non-array roster", { ...MULTI, premium_model_ids: GLM }],
    ["a one-maker Premium roster of Qwen alone", { ...MULTI, premium_model_ids: [QWEN] }],
    ["Qwen twice", { ...MULTI, premium_model_ids: [GLM, QWEN, QWEN] }],
    ["Haiku in a roster without the Anthropic socket", { ...THREE_MAKERS, anthropic_budget_socket: undefined }],
    ["the Anthropic socket equal to the DeepInfra socket", { ...THREE_MAKERS, anthropic_budget_socket: DEEPINFRA_SOCKET }],
    ["the sockets-only form with the Anthropic socket equal to the DeepInfra socket", { ...SOCKETS, anthropic_budget_socket: DEEPINFRA_SOCKET }],
    ["an Anthropic socket outside the preview folder", { ...THREE_MAKERS, anthropic_budget_socket: "/tmp/anthropic-budget-v1.sock" }],
    ["a non-string Anthropic socket", { ...THREE_MAKERS, anthropic_budget_socket: 1 }],
    ["the legacy five keys plus the Anthropic socket", { ...SOCKETS, free_model_ids: [GLM], anthropic_budget_socket: ANTHROPIC_SOCKET }],
    ["a Free roster of Haiku alone while three makers exist", { ...THREE_MAKERS, free_model_ids: [HAIKU] }],
    ["a Premium roster of Haiku alone", { ...THREE_MAKERS, premium_model_ids: [HAIKU] }],
    ["another deployment", { ...SOCKETS, deployment: "v3-hosted" }],
    ["another wire level", { ...SOCKETS, requested_thinking_level: "low" }],
    ["a socket outside the preview folder", { ...SOCKETS, budget_socket: "/tmp/provider-budget.sock" }],
    ["a bad scope", { ...SOCKETS, scope_id: "Bad Scope" }],
    ["a missing scope", { budget_socket: DEEPINFRA_SOCKET, deployment: "v3-preview", requested_thinking_level: "high" }],
    ["an array", [SOCKETS]],
    ["null", null]
  ])("both parsers refuse %s", (_name, value) => {
    const source = JSON.stringify(JSON.parse(JSON.stringify(value)));
    expect(() => parsePreviewProviderTestConfig(source)).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(() => parsePreviewEnvironmentConfig(source)).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
  it("both parsers refuse text that is not JSON, and a bad table with the thinking parser's own error", () => {
    expect(() => parsePreviewEnvironmentConfig("{")).toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(() => env({ ...SIX, thinking_levels: { [QWEN]: { level: "high" } } })).toThrow(/^PREVIEW_THINKING_LEVELS_INVALID:/u);
    expect(() => parse({ ...SIX, thinking_levels: { [QWEN]: { level: "high" } } })).toThrow(/^PREVIEW_THINKING_LEVELS_INVALID:/u);
  });
});

describe("composePreviewProviderTestConfig: the gate part plus a line-up is today's config (addition D16)", () => {
  it("deep-equals the six-key parse of the same values and passes validatePreviewProviderTestConfig unchanged", () => {
    const { gate } = env({ ...SOCKETS, anthropic_budget_socket: ANTHROPIC_SOCKET })!;
    const composed = composePreviewProviderTestConfig(gate, parsePreviewLineUp(lineUp()));
    expect(composed).toEqual(parse(SIX));
    expect(validatePreviewProviderTestConfig(composed)).toEqual(composed);
    expect(Object.isFrozen(composed)).toBe(true);
    // No table: no thinking_levels member at all, exactly as today's parse of a config without one.
    const plain = composePreviewProviderTestConfig(gate, parsePreviewLineUp(lineUp({ thinking_levels: null })));
    expect(plain).toEqual(parse({ ...SIX, thinking_levels: undefined }));
    expect(plain).not.toHaveProperty("thinking_levels");
  });
  it("takes only the gate members of a whole config passed as the gate", () => {
    const whole = parse(SIX)!;
    const composed = composePreviewProviderTestConfig(whole, parsePreviewLineUp({ free_model_ids: [GLM], premium_model_ids: [GLM], thinking_levels: null }));
    expect(composed).toEqual(parse({ ...SOCKETS, anthropic_budget_socket: ANTHROPIC_SOCKET, free_model_ids: [GLM], premium_model_ids: [GLM] }));
    expect(composed).not.toHaveProperty("thinking_levels");
  });
  it("refuses a Haiku roster when the gate has no Anthropic socket (today's rule)", () => {
    const { gate } = env(SOCKETS)!;
    expect(() => composePreviewProviderTestConfig(gate, parsePreviewLineUp(lineUp())))
      .toThrow("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
  });
});

describe("previewLineUpOfConfig round-trips through composition", () => {
  it.each([["the legacy form", LEGACY], ["the six keys with a table", SIX],
    ["the six keys without a table", { ...SIX, thinking_levels: undefined }]])("%s", (_name, value) => {
    const config = parse(JSON.parse(JSON.stringify(value)))!;
    const { gate } = env(JSON.parse(JSON.stringify(value)))!;
    expect(composePreviewProviderTestConfig(gate, previewLineUpOfConfig(config))).toEqual(config);
    expect(previewLineUpOfConfig(config)).toEqual(env(JSON.parse(JSON.stringify(value)))!.envLineUp);
  });
});

describe("previewSeatableModels: every model a version can seat (addition D20)", () => {
  const noTable = (free: readonly string[], premium: readonly string[]) =>
    parsePreviewLineUp({ free_model_ids: free, premium_model_ids: premium, thinking_levels: null });
  it("is both rosters, the seat refs' models and the structure-repair model when declared, sorted and unique", () => {
    expect(previewSeatableModels({ lineUp: noTable([GLM, DEEPSEEK], [GLM, DEEPSEEK, MIMO]),
      seatRefs: ["preview:fixture-a", "preview:fixture-b", "preview:qwen-3-8-flash", "preview:fixture-a"],
      declaredModels: [GLM, DEEPSEEK, MIMO, QWEN] })).toEqual([DEEPSEEK, QWEN, MIMO, GLM].sort());
    const withRepair = previewSeatableModels({ lineUp: noTable([GLM, DEEPSEEK], [GLM, DEEPSEEK]),
      seatRefs: ["preview:fixture-a", "preview:fixture-b", "preview:fixture-a", "preview:fixture-b"], declaredModels: ALL_FIVE });
    expect(withRepair).toEqual([HAIKU, DEEPSEEK, GLM].sort());
    expect(Object.isFrozen(withRepair)).toBe(true);
  });
  it("the two GLM refs map to GLM once; Haiku only when declared (or seated)", () => {
    expect(previewSeatableModels({ lineUp: noTable([GLM], [GLM]), seatRefs: ["preview:fixture-a", "preview:fixture-b"],
      declaredModels: [GLM] })).toEqual([GLM]);
    expect(previewSeatableModels({ lineUp: noTable([GLM], [GLM]), seatRefs: ["preview:fixture-a", "preview:claude-haiku-5-5"],
      declaredModels: [GLM] })).toEqual([HAIKU, GLM].sort());
  });
  it("an unreviewed seat ref is kept as unreviewed-ref:<ref>", () => {
    expect(previewSeatableModels({ lineUp: noTable([GLM], [GLM]), seatRefs: ["preview:fixture-a", "preview:other"],
      declaredModels: [GLM] })).toEqual([GLM, "unreviewed-ref:preview:other"].sort());
  });
});

describe("the target check's two halves refuse exactly what the whole refuses (addition D16, D19)", () => {
  const configured = (providerRef: string) => { const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind }; };
  const targets = (refs: readonly string[], index = -1, change: Record<string, unknown> = {}, maker?: string) => {
    const rows = refs.map(ref => ({ ...previewTargetJsonRow(ref) } as Record<string, unknown>));
    if (index >= 0) {
      Object.assign(rows[index]!, change);
      for (const [key, value] of Object.entries(change)) if (value === undefined) delete rows[index]![key];
    }
    return parseProviderDiscoveryTargets(JSON.stringify(rows), refs.map(ref => ({ ...configured(ref), ...(maker === undefined ? {} : { maker }) })));
  };
  const legacyRefs = ["preview:fixture-a", "preview:fixture-b"];
  const deepinfraOnly = PREVIEW_REVIEWED_PROVIDER_REFS.filter(ref => ref !== "preview:claude-haiku-5-5");
  const MULTI = parse({ ...SOCKETS, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN] })!;
  const LIVE = parse(SIX)!;
  const cases: ReadonlyArray<readonly [string, Parameters<typeof assertPreviewRostersServed>[0], () => readonly ProviderDiscoveryTarget[]]> = [
    ["legacy on the GLM pair", parse(LEGACY)!, () => targets(legacyRefs)],
    ["multi on the reviewed set", MULTI, () => targets(deepinfraOnly)],
    ["live on the full reviewed set", LIVE, () => targets(PREVIEW_REVIEWED_PROVIDER_REFS)],
    ["legacy on the full reviewed set", parse(LEGACY)!, () => targets(PREVIEW_REVIEWED_PROVIDER_REFS)],
    ["multi on the GLM pair (rosters not served)", MULTI, () => targets(legacyRefs)],
    ["live without Haiku declared (rosters not served)", LIVE, () => targets(deepinfraOnly)],
    ["legacy on fixture-a alone", parse(LEGACY)!, () => targets(["preview:fixture-a"])],
    ["multi on the reversed set", MULTI, () => targets([...deepinfraOnly].reverse())],
    ["DeepSeek at GLM's price", MULTI, () => targets(deepinfraOnly, 2, { input_price_micros_per_million: 150_000 })],
    ["MiMo with a thinking switch", MULTI, () => targets(deepinfraOnly, 3, { thinking_parameter: "reasoning_effort", thinking_levels: ["high"] })],
    ["DeepSeek without its thinking switch", MULTI, () => targets(deepinfraOnly, 2, { thinking_parameter: undefined, thinking_levels: undefined })],
    ["DeepSeek on the GLM ref's model", MULTI, () => targets(deepinfraOnly, 2, { model: GLM })],
    ["Qwen at its cached-input price", MULTI, () => targets(deepinfraOnly, 4, { input_price_micros_per_million: 14_000 })],
    ["Haiku with a credential header", LIVE, () => targets(PREVIEW_REVIEWED_PROVIDER_REFS, 5, { authorization_header: "synthetic-not-a-key" })],
    ["every ref under one maker", MULTI, () => targets(deepinfraOnly, -1, {}, "Z.AI")]
  ];
  const outcome = (run: () => void): string => { try { run(); return "ok"; } catch (error) { return (error as Error).message; } };
  it.each(cases)("%s", (_name, config, declared) => {
    let list: readonly ProviderDiscoveryTarget[] = [];
    // A declaration the target parser itself refuses never reaches either check.
    try { list = declared(); } catch { return; }
    const whole = outcome(() => assertPreviewProviderTargets(config, list));
    const halves = outcome(() => { assertPreviewTargetSet(list); assertPreviewRostersServed(config, list); });
    expect(halves).toBe(whole);
  });
  it("the cases cover both accepting and refusing, and both halves refuse on their own", () => {
    expect(outcome(() => assertPreviewProviderTargets(MULTI, targets(deepinfraOnly)))).toBe("ok");
    expect(outcome(() => assertPreviewTargetSet(targets(["preview:fixture-a"])))).toBe("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(outcome(() => assertPreviewTargetSet(targets(legacyRefs)))).toBe("ok");
    expect(outcome(() => assertPreviewRostersServed(MULTI, targets(legacyRefs)))).toBe("PREVIEW_PROVIDER_TEST_CONFIGURATION_INVALID");
    expect(() => assertPreviewProviderTargets(undefined, [])).not.toThrow();
  });
});

describe("the call policy reads each run's own thinking table (addition D17)", () => {
  const POSITION_SLIP = readFileSync(new URL("../support/fixtures/judge-format-replies/mimo-judge-position-ro-no-value-laden.txt", import.meta.url), "utf8");
  const configured = (providerRef: string) => { const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind }; };
  const ALL_TARGETS = parseProviderDiscoveryTargets(JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)),
    PREVIEW_REVIEWED_PROVIDER_REFS.map(configured));
  const target = ALL_TARGETS.find(candidate => candidate.model === DEEPSEEK)!;
  const TABLE_A: PreviewThinkingLevels = { [DEEPSEEK]: { level: "high", steps: { pros_cons: "low", slip_fix: "low" } } };
  const TABLE_B: PreviewThinkingLevels = { [DEEPSEEK]: { level: "low", steps: { pros_cons: "none", slip_fix: "none" } } };
  /** The DeepSeek gateway as the runner builds it, the config's own table beside an optional per-run resolver. */
  function harness(levels: unknown, thinkingLevelsOf?: (runId: string | null) => PreviewThinkingLevels | undefined, script: string[] = []) {
    const config = parse({ ...SOCKETS, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK],
      ...(levels === undefined ? {} : { thinking_levels: levels }) })!;
    const executions: PreviewBudgetExecution[] = [];
    const deepinfra = { execute: async (input: PreviewBudgetExecution) => {
      executions.push(input);
      return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model: DEEPSEEK,
        choices: [{ message: { content: script.shift() ?? "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
    } };
    const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
      ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(config, target),
      fetchImplementation: createPreviewGuardedFetch({ deepinfra }),
      persistRawArtifact: async artifact => artifact.artifactId, appendLedgerEntry: async entry => entry.attemptId,
      assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
    const gateway = withPreviewProviderCallPolicy(native, config, target,
      { sleep: async () => undefined, ...(thinkingLevelsOf === undefined ? {} : { thinkingLevelsOf }) });
    return { gateway, executions, efforts: () => executions.map(execution => (JSON.parse(execution.requestBody) as Record<string, unknown>).reasoning_effort) };
  }
  const PACKET = framedFixturePacket("Synthetic school policy; no personal data.");
  const supportAttack = (runId: string | null): ProviderCallRequest => ({ runId, subjectItemId: "synthetic:node",
    callSiteKey: "JUDGE:defender:P1", lane: "served", role: "JUDGE", bound: { maxAttempts: 1, tokenCeiling: 8192, deadlineMs: 5_000 },
    contractHash: "contract:synthetic", providerRef: target.providerRef, packet: PACKET });
  const panel = (runId: string): ProviderCallRequest => {
    const framed = buildFramedPrompt({
      contract: { contractId: "judge.position.fixture.v1", instruction: "Author your position on the question under debate.", answerForm: "Return one JSON object." },
      material: [{ name: "question_line", content: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?" }]
    });
    return { runId, subjectItemId: "node:synthetic", callSiteKey: "PANEL:root", role: "JUDGE", lane: "served",
      bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:synthetic",
      providerRef: target.providerRef, packet: framed.packet,
      classifyContent: (content, reply) => classifyStructuredArtifact(content, judgeArtifactSchema, reply),
      buildRepairPacket: rejected => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)) };
  };
  const byRun = (runId: string | null) => runId === "r1" ? TABLE_A : runId === "r2" ? TABLE_B : undefined;

  it("each run's pros & cons call runs at its own table's level, not the config's", async () => {
    const seen: (string | null)[] = [];
    const { gateway, efforts } = harness({ [DEEPSEEK]: { level: "high" } }, runId => { seen.push(runId); return byRun(runId); });
    await gateway.call(supportAttack("r1"));
    await gateway.call(supportAttack("r2"));
    await gateway.call(supportAttack("r1"));
    expect(efforts()).toEqual(["low", "none", "low"]);
    expect(seen).toEqual(["r1", "r2", "r1"]);
  });
  it("a resolver answering undefined means no table: the row's default", async () => {
    const { gateway, efforts } = harness({ [DEEPSEEK]: { level: "low" } }, () => undefined);
    await gateway.call(supportAttack(null));
    expect(efforts()).toEqual(["high"]);
  });
  it("slip_fix follows the same run's table", async () => {
    const fixed = "{\"value_laden\": false}";
    const one = harness(undefined, byRun, [POSITION_SLIP, fixed]);
    expect((await one.gateway.call(panel("r1"))).repairForm).toBe("PATCH");
    expect(one.efforts()).toEqual(["high", "low"]);
    const two = harness(undefined, byRun, [POSITION_SLIP, fixed]);
    expect((await two.gateway.call(panel("r2"))).repairForm).toBe("PATCH");
    expect(two.efforts()).toEqual(["low", "none"]);
  });
  it("without the option the config's own table is used (preview-thinking-policy.test.ts's expectation)", async () => {
    const { gateway, efforts } = harness({ [DEEPSEEK]: { level: "low", steps: { judge_panel: "none" } } });
    await gateway.call({ ...supportAttack("r1"), callSiteKey: "PANEL:root" });
    expect(efforts()).toEqual(["none"]);
  });
  it("a resolver that throws makes the call reject before anything is sent", async () => {
    const { gateway, executions } = harness(undefined, () => { throw new TypeError("RUN_SETTINGS_VERSION_UNKNOWN"); });
    await expect((async () => gateway.call(supportAttack("r9")))()).rejects.toThrow("RUN_SETTINGS_VERSION_UNKNOWN");
    expect(executions).toHaveLength(0);
  });
});
