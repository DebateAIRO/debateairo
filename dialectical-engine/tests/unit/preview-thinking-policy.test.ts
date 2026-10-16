/**
 * Spec 2026-10-12 §4.4 and §4.7: the owner's thinking-level table takes effect. Each preview call runs at the level the
 * table picks for its step (the step's override, else the AI's usual level, else the row's default, which is today's
 * request); a repair POST inside a call (the patch follow-up, the full re-ask) runs at the AI's `slip_fix` level when
 * the owner set one. Every gateway here is built exactly as the runner builds a preview target (the guarded fetch,
 * providerTargetGatewayControls then previewTargetGatewayControls, inside withPreviewProviderCallPolicy), so every body
 * below is one the gate accepts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Judge, classifyStructuredArtifact, judgeArtifactSchema } from "@debateai/judgement";
import {
  ANTHROPIC_PER_CALL_MARKERS_SEPARATOR, OpenAICompatibleProviderGateway, PREVIEW_REVIEWED_PROVIDER_REFS, PreviewVendorRefusedUnbilled, buildFramedPrompt,
  buildFramedRepairPrompt, createPreviewGuardedFetch, parsePreviewProviderTestConfig, parseProviderDiscoveryTargets,
  previewModelRow, previewTargetGatewayControls, previewTargetJsonRow, providerTargetGatewayControls, schemaFailureLocator, schemaFailurePaths,
  withPreviewProviderCallPolicy, type PreviewBudgetExecution, type ProviderCallRequest, type ProviderDiscoveryTarget,
  type ProviderLedgerInput
} from "@debateai/providers";
import { classifyStoryContent, type StoryMaterialIndex } from "@debateai/story";
import { framedFixturePacket } from "../support/framed-packet.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const COOLDOWN_MS = 60_000;
const BASE = { deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", scope_id: "preview-thinking-policy-fixture",
  anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU] };
const configWith = (levels?: unknown) =>
  parsePreviewProviderTestConfig(JSON.stringify(levels === undefined ? BASE : { ...BASE, thinking_levels: levels }))!;
const POSITION_SLIP = readFileSync(new URL("../support/fixtures/judge-format-replies/mimo-judge-position-ro-no-value-laden.txt", import.meta.url), "utf8");

const configured = (providerRef: string) => { const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
  return { providerRef, maker: row.maker, adapterKind: row.adapterKind }; };
const ALL_TARGETS: readonly ProviderDiscoveryTarget[] = parseProviderDiscoveryTargets(
  JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)), PREVIEW_REVIEWED_PROVIDER_REFS.map(configured));
const targetOf = (model: string) => ALL_TARGETS.find(target => target.model === model)!;

type Reply = { content: string; finish?: string } | { refuse: true };
/** One preview target's gateway as the runner builds it, with a scripted gate behind the guarded fetch. */
function harness(model: string, levels?: unknown, script: Reply[] = []) {
  const config = configWith(levels);
  const target = targetOf(model);
  const executions: PreviewBudgetExecution[] = [];
  const ledger: ProviderLedgerInput[] = [];
  const slept: number[] = [];
  const next = (): Reply => script.shift() ?? { content: "{}" };
  const deepinfra = { execute: async (input: PreviewBudgetExecution) => {
    executions.push(input);
    const reply = next();
    if ("refuse" in reply) throw new PreviewVendorRefusedUnbilled();
    return { status: 200, body: JSON.stringify({ id: `fixture-${executions.length}`, model,
      choices: [{ message: { content: reply.content }, finish_reason: reply.finish ?? "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20 } }) };
  } };
  const anthropic = { execute: async (input: PreviewBudgetExecution) => {
    executions.push(input);
    const reply = next();
    if ("refuse" in reply) throw new PreviewVendorRefusedUnbilled();
    return { status: 200, body: JSON.stringify({ id: `msg_${executions.length}`, type: "message", role: "assistant", model,
      content: [{ type: "text", text: reply.content }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20 } }) };
  } };
  const native = new OpenAICompatibleProviderGateway({ endpoint: target.baseUrl, model: target.model, maker: target.maker,
    ...providerTargetGatewayControls(target), ...previewTargetGatewayControls(config, target),
    fetchImplementation: createPreviewGuardedFetch({ deepinfra, anthropic }),
    persistRawArtifact: async artifact => artifact.artifactId,
    appendLedgerEntry: async entry => { ledger.push(entry); return entry.attemptId; },
    assertNoOpenWriteTransaction: () => undefined, sleepImplementation: async () => undefined });
  const gateway = withPreviewProviderCallPolicy(native, config, target, { sleep: async ms => { slept.push(ms); } });
  return { gateway, target, executions, ledger, slept };
}
const bodies = (executions: readonly PreviewBudgetExecution[]) =>
  executions.map(execution => JSON.parse(execution.requestBody) as Record<string, unknown>);
const efforts = (executions: readonly PreviewBudgetExecution[]) => bodies(executions).map(body => body.reasoning_effort);

const PACKET = framedFixturePacket("Synthetic school policy; no personal data.");
function plainRequest(target: ProviderDiscoveryTarget, callSiteKey: string, lane: "served" | "story"): ProviderCallRequest {
  return { runId: null, subjectItemId: "synthetic:node", callSiteKey, lane,
    role: lane === "story" ? "SYNTHESIZER" : callSiteKey.startsWith("COMPOSER:") ? "SYNTHESIZER" : "JUDGE",
    bound: { maxAttempts: 1, tokenCeiling: 8192, deadlineMs: 5_000 }, contractHash: "contract:synthetic",
    providerRef: target.providerRef, packet: PACKET };
}
/** A served panel call with its own content check and repair packet (the judge's), as the panel step sends it. */
function panelRequest(target: ProviderDiscoveryTarget): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId: "judge.position.fixture.v1", instruction: "Author your position on the question under debate.", answerForm: "Return one JSON object." },
    material: [{ name: "question_line", content: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?" }]
  });
  return { runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "PANEL:root", role: "JUDGE", lane: "served",
    bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:synthetic",
    providerRef: target.providerRef, packet: framed.packet,
    classifyContent: (content, reply) => classifyStructuredArtifact(content, judgeArtifactSchema, reply),
    buildRepairPacket: rejected => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)) };
}
function fixedPosition(valueLaden: boolean): string {
  const body = JSON.parse(POSITION_SLIP.replace(/^```json\n/u, "").replace(/\n```$/u, "")) as Record<string, unknown>;
  return JSON.stringify({ ...body, value_laden: valueLaden });
}
const INDEX: StoryMaterialIndex = {
  nodeIds: new Set(["P1"]), positionIds: new Set(["P1"]), positionOrder: ["P1"],
  shapeIds: new Set(["fixture"]), pathCap: 4, scoreTexts: new Set(), engineTokens: new Set()
};
function story(ref = "P1"): string {
  const paragraph = { text: "The proposed policy held up.", node_refs: [ref] };
  return JSON.stringify({ shape_id: "fixture",
    short: { headline: "The policy held up.", summary: "You asked about the policy; it held up.",
      confidence: "The evidence supports the policy.",
      paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Adopting the policy held up.", node_refs: ["P1"] }], change: paragraph },
    why: { reasons: [paragraph] },
    long: { sections: ["Our reading", "The verdict", "What would change it"].map(title => ({ title, paragraphs: [paragraph] })) },
    reviewer_note: null });
}
function storyRequest(target: ProviderDiscoveryTarget): ProviderCallRequest {
  const framed = buildFramedPrompt({
    contract: { contractId: "story.storyteller.v3", instruction: "Write the synthetic policy story.", answerForm: "Return one JSON object." },
    material: [{ name: "story_material", content: "One policy position, cited as P1." }]
  });
  return { runId: "run:synthetic", subjectItemId: "story:synthetic", callSiteKey: "STORY:STORYTELLER:1", role: "SYNTHESIZER", lane: "story",
    bound: { maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 5000 }, contractHash: "contract:synthetic-story",
    providerRef: target.providerRef, packet: framed.packet, preferredResponseFormat: "json_object",
    classifyContent: content => classifyStoryContent(content, INDEX),
    buildRepairPacket: rejected => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)) };
}

describe("the gateway may set the row's whole reviewed menu, on the preview only (spec 2026-10-12 §4.4)", () => {
  it("every row's menu less \"default\"; nothing off the preview", () => {
    const config = configWith();
    expect(previewTargetGatewayControls(config, { model: GLM })).toEqual({ maxOutputTokens: 32_768, thinking: { parameter: "reasoning_effort", levels: ["high", "low"] } });
    expect(previewTargetGatewayControls(config, { model: DEEPSEEK })).toEqual({ maxOutputTokens: 32_768, thinking: { parameter: "reasoning_effort", levels: ["high", "low", "none"] } });
    expect(previewTargetGatewayControls(config, { model: MIMO })).toEqual({ maxOutputTokens: 32_768, thinking: { parameter: "reasoning_effort", levels: ["none"] } });
    expect(previewTargetGatewayControls(config, { model: QWEN })).toEqual({ maxOutputTokens: 32_768, thinking: { parameter: "reasoning_effort", levels: ["low", "medium", "none"] } });
    expect(previewTargetGatewayControls(config, { model: HAIKU })).toEqual({ maxOutputTokens: 32_768, cacheFirstUserTurn: true, thinking: { parameter: "reasoning_effort", levels: ["high", "medium", "low"] } });
    expect(previewTargetGatewayControls(undefined, { model: DEEPSEEK })).toEqual({});
    expect(() => previewTargetGatewayControls(config, { model: "other/model" })).toThrow();
  });
});

describe("each call runs at the level the owner's table picks for its step", () => {
  it.each([
    // [model, thinking_levels, callSiteKey, lane, expected reasoning_effort member (undefined = absent)]
    [DEEPSEEK, undefined, "PANEL:root", "served", "high"],
    [DEEPSEEK, { [DEEPSEEK]: { level: "low", steps: { judge_panel: "none" } } }, "PANEL:root", "served", "none"],
    [DEEPSEEK, { [DEEPSEEK]: { level: "low", steps: { judge_panel: "none" } } }, "JUDGE", "served", "low"],
    [GLM, { [GLM]: { level: "low" } }, "COMPOSER:SYNTHESIZER:INITIAL:1", "served", "low"],
    [MIMO, undefined, "PANEL:root", "served", undefined],
    [MIMO, { [MIMO]: { level: "none" } }, "PANEL:root", "served", "none"],
    [QWEN, { [QWEN]: { steps: { story_writer: "medium" } } }, "STORY:STORYTELLER:1", "story", "medium"],
    [QWEN, { [QWEN]: { steps: { story_writer: "medium" } } }, "PANEL:root", "served", undefined]
  ] as const)("%s with %j at %s (%s) sends %s", async (model, levels, callSiteKey, lane, expected) => {
    const { gateway, target, executions } = harness(model, levels);
    await gateway.call(plainRequest(target, callSiteKey, lane));
    expect(executions).toHaveLength(1);
    const [body] = bodies(executions);
    if (expected === undefined) expect(body).not.toHaveProperty("reasoning_effort");
    else expect(body!.reasoning_effort).toBe(expected);
  });

  it("Haiku at {level: \"medium\"} sends output_config.effort medium on the Anthropic wire", async () => {
    const { gateway, target, executions } = harness(HAIKU, { [HAIKU]: { level: "medium" } });
    await gateway.call(plainRequest(target, "PANEL:root", "served"));
    expect(bodies(executions)[0]).toMatchObject({ model: HAIKU, output_config: { effort: "medium" } });
  });

  it("without a table every reviewed row's body is today's, byte for byte", async () => {
    for (const model of [GLM, DEEPSEEK, MIMO, QWEN]) {
      const { gateway, target, executions } = harness(model);
      await gateway.call(plainRequest(target, "PANEL:root", "served"));
      const row = previewModelRow(model)!;
      expect(executions[0]!.requestBody, model).toBe(JSON.stringify({ model, max_tokens: 8192,
        ...(row.defaultEffort === "default" ? {} : { reasoning_effort: row.defaultEffort }), ...(row.sampling ?? {}), messages: PACKET.messages }));
    }
    const { gateway, target, executions } = harness(DEEPSEEK);
    await gateway.call(plainRequest(target, "PANEL:root", "served"));
    expect(executions[0]!.requestBody).toBe(JSON.stringify({ model: DEEPSEEK, max_tokens: 8192, reasoning_effort: "high", messages: PACKET.messages }));
    // Haiku too, byte for byte (final review fix 6): the Anthropic wire's own body, the system frame split at the
    // per-call markers with the cache mark on its first block, then today's level, high.
    const haiku = harness(HAIKU);
    await haiku.gateway.call(plainRequest(haiku.target, "PANEL:root", "served"));
    const [system, user] = PACKET.messages;
    const cut = system!.content.indexOf(ANTHROPIC_PER_CALL_MARKERS_SEPARATOR) + 2;
    expect(haiku.executions[0]!.requestBody).toBe(JSON.stringify({ model: HAIKU, max_tokens: 8192,
      messages: [{ role: "user", content: user!.content }],
      system: [{ type: "text", text: system!.content.slice(0, cut), cache_control: { type: "ephemeral" } },
        { type: "text", text: system!.content.slice(cut) }],
      output_config: { effort: "high" } }));
  });

  it("the unbilled refusal's one resend carries the same level (Review Focus 3)", async () => {
    const { gateway, target, executions, slept } = harness(DEEPSEEK, { [DEEPSEEK]: { level: "low" } }, [{ refuse: true }, { content: "{}" }]);
    await gateway.call(plainRequest(target, "PANEL:root", "served"));
    expect(slept).toEqual([COOLDOWN_MS]);
    expect(efforts(executions)).toEqual(["low", "low"]);
  });

  it("the incoming-level rule is unchanged: a request carrying its own level is refused, the table picks", async () => {
    const { gateway, target, executions } = harness(DEEPSEEK, { [DEEPSEEK]: { level: "low" } });
    await expect((async () => gateway.call({ ...plainRequest(target, "PANEL:root", "served"), thinkingLevel: "low" }))())
      .rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    // Nor may the caller pick the repair level: that is the owner's slip_fix alone.
    await expect((async () => gateway.call({ ...panelRequest(target), repairThinkingLevel: "low" }))())
      .rejects.toMatchObject({ code: "PROVIDER_THINKING_LEVEL_UNSUPPORTED" });
    expect(executions).toHaveLength(0);
  });
});

describe("repair POSTs run at the AI's slip_fix level (Review Focus 4)", () => {
  const SLIP_FIX = { [DEEPSEEK]: { level: "high", steps: { slip_fix: "low" } } };

  it("a served panel call's patch follow-up runs at slip_fix; the first POST at the call's level; the ledger records both", async () => {
    const { gateway, target, executions, ledger } = harness(DEEPSEEK, SLIP_FIX, [{ content: POSITION_SLIP }, { content: "{\"value_laden\": false}" }]);
    const result = await gateway.call(panelRequest(target));
    expect(result.repairForm).toBe("PATCH");
    expect(efforts(executions)).toEqual(["high", "low"]);
    expect(ledger.map(entry => entry.thinkingLevel)).toEqual(["high", "low"]);
  });

  it("the full re-ask runs at slip_fix too, after a patch and without one", async () => {
    const patched = harness(DEEPSEEK, SLIP_FIX, [{ content: POSITION_SLIP }, { content: "{}" }, { content: fixedPosition(true) }]);
    expect((await patched.gateway.call(panelRequest(patched.target))).repairForm).toBe("FULL");
    expect(efforts(patched.executions)).toEqual(["high", "low", "low"]);
    expect(patched.ledger.map(entry => entry.thinkingLevel)).toEqual(["high", "low", "low"]);
    const prose = harness(DEEPSEEK, SLIP_FIX, [{ content: "I think the answer is yes." }, { content: fixedPosition(true) }]);
    expect((await prose.gateway.call(panelRequest(prose.target))).repairForm).toBe("FULL");
    expect(efforts(prose.executions)).toEqual(["high", "low"]);
  });

  it("with no slip_fix every POST of the call runs at the call's level", async () => {
    const { gateway, target, executions, ledger } = harness(DEEPSEEK, { [DEEPSEEK]: { level: "high" } },
      [{ content: POSITION_SLIP }, { content: "{\"value_laden\": false}" }]);
    await gateway.call(panelRequest(target));
    expect(efforts(executions)).toEqual(["high", "high"]);
    expect(ledger.map(entry => entry.thinkingLevel)).toEqual(["high", "high"]);
    const none = harness(DEEPSEEK, undefined, [{ content: POSITION_SLIP }, { content: "{\"value_laden\": false}" }]);
    await none.gateway.call(panelRequest(none.target));
    expect(efforts(none.executions)).toEqual(["high", "high"]);
  });

  it("the step's own override and slip_fix combine: the panel's first POST at judge_panel, its repair at slip_fix", async () => {
    const { gateway, target, executions } = harness(DEEPSEEK, { [DEEPSEEK]: { steps: { judge_panel: "none", slip_fix: "low" } } },
      [{ content: POSITION_SLIP }, { content: "{\"value_laden\": false}" }]);
    await gateway.call(panelRequest(target));
    expect(efforts(executions)).toEqual(["none", "low"]);
  });

  it("the storyteller's repair runs at slip_fix", async () => {
    // The patch answers each refused citation path with the right ref (provider-preview-story-repair.test.ts).
    const refused = classifyStoryContent(story("P99"), INDEX);
    const paths = refused.parseStatus === "PARSED" ? [] : schemaFailurePaths(refused.parseError) ?? [];
    expect(paths.length).toBeGreaterThan(0);
    const { gateway, target, executions, ledger } = harness(DEEPSEEK, SLIP_FIX,
      [{ content: story("P99") }, { content: JSON.stringify(Object.fromEntries(paths.map(path => [path, "P1"]))) }]);
    const result = await gateway.call(storyRequest(target));
    expect(result.repairAttempts).toBe(1);
    expect(efforts(executions)).toEqual(["high", "low"]);
    expect(ledger.map(entry => entry.thinkingLevel)).toEqual(["high", "low"]);
  });

  it("a length retry re-sends the original packet, so it stays at the call's level", async () => {
    const { gateway, target, executions } = harness(DEEPSEEK, SLIP_FIX, [{ content: story().slice(0, 40), finish: "length" }, { content: story() }]);
    const result = await gateway.call(storyRequest(target));
    expect(result.repairAttempts).toBe(0);
    expect(efforts(executions)).toEqual(["high", "high"]);
  });

  it("the Judge's own panel call path reaches the same levels (the step's real classifier and repair packet)", async () => {
    const { gateway, executions } = harness(DEEPSEEK, SLIP_FIX, [{ content: POSITION_SLIP }, { content: "{\"value_laden\": false}" }]);
    const judged = await new Judge(gateway).judge({ runId: "run:synthetic", subjectItemId: "node:synthetic", callSiteKey: "JUDGE",
      questionLine: "Ar trebui un oraș de mărime medie să facă gratuite liniile centrale de autobuz?", argumentLanguageName: "Romanian",
      providerRef: targetOf(DEEPSEEK).providerRef, contractHash: "contract:synthetic", leg: { kind: "primary-root" as const },
      bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 } });
    expect(judged.valueLaden).toBe(false);
    expect(efforts(executions)).toEqual(["high", "low"]);
  });
});
