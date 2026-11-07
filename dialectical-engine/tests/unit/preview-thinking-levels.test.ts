/** Spec 2026-10-12 §4.2–§4.3: the owner's thinking-level table, the step names, and the level lookup. */
import { describe, expect, it } from "vitest";
import {
  PREVIEW_THINKING_STEPS, parsePreviewProviderTestConfig, parsePreviewThinkingLevels, previewModelRow,
  previewSlipFixLevel, previewThinkingLevelFor, previewThinkingLevelOnRequest, previewThinkingStepOf
} from "@debateai/providers";
import { THINKING_LEVEL_DEFAULT_ONLY } from "@debateai/kernel";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const BASE = { deployment: "v3-preview", requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-fixture" };

describe("the thinking-level table", () => {
  // Web search (W1-5, 2026-10-30): the web step's four after today's ten (tests/unit/web-prompts.test.ts maps their call sites).
  // Dig-model revision W3-7: the path rewrite's two after them (packages/register PATH_REWRITE_THINKING).
  it("names the sixteen steps", () => {
    expect(PREVIEW_THINKING_STEPS).toEqual(["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer",
      "answer_writer", "answer_checker", "story_writer", "story_checker", "slip_fix",
      "web_planner", "web_reader", "web_pick", "web_reader_top", "path_rewrite_writer", "path_rewrite_checker"]);
  });
  it("parses a valid table", () => {
    expect(parsePreviewThinkingLevels({ [QWEN]: { level: "low", steps: { story_writer: "medium" } }, [HAIKU]: { level: "medium" } }))
      .toEqual({ [QWEN]: { level: "low", steps: { story_writer: "medium" } }, [HAIKU]: { level: "medium" } });
  });
  it.each([
    ["not an object", []], ["empty", {}], ["unknown model", { "other/model": { level: "low" } }],
    ["off-menu level (GLM has no medium)", { [GLM]: { level: "medium" } }], ["off-menu level (Haiku has no none)", { [HAIKU]: { level: "none" } }],
    ["unknown step", { [GLM]: { steps: { judging: "low" } } }], ["off-menu step level", { [MIMO]: { steps: { reviewer: "low" } } }],
    ["empty entry", { [GLM]: {} }], ["empty steps", { [GLM]: { steps: {} } }], ["extra key", { [GLM]: { level: "low", effort: "low" } }],
    ["non-string level", { [GLM]: { level: 1 } }]
  ])("refuses %s with PREVIEW_THINKING_LEVELS_INVALID", (_name, table) => {
    expect(() => parsePreviewThinkingLevels(table)).toThrow(/^PREVIEW_THINKING_LEVELS_INVALID:/u);
  });
  it("rides in the preview config, both forms, absent = today's", () => {
    const legacy = parsePreviewProviderTestConfig(JSON.stringify({ ...BASE, free_model_ids: [GLM], thinking_levels: { [GLM]: { level: "low" } } }));
    expect(legacy?.thinking_levels).toEqual({ [GLM]: { level: "low" } });
    const roster = parsePreviewProviderTestConfig(JSON.stringify({ ...BASE, free_model_ids: [GLM, DEEPSEEK],
      premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN], thinking_levels: { [DEEPSEEK]: { steps: { judge_panel: "none" } } } }));
    expect(roster?.thinking_levels).toEqual({ [DEEPSEEK]: { steps: { judge_panel: "none" } } });
    expect(parsePreviewProviderTestConfig(JSON.stringify({ ...BASE, free_model_ids: [GLM] }))).not.toHaveProperty("thinking_levels");
    expect(() => parsePreviewProviderTestConfig(JSON.stringify({ ...BASE, free_model_ids: [GLM], thinking_levels: { [GLM]: { level: "medium" } } })))
      .toThrow(/^PREVIEW_THINKING_LEVELS_INVALID:/u);
  });
});

describe("the step of a call", () => {
  it.each([
    ["JUDGE", "served", "opening"], ["JUDGE:root:0", "served", "opening"], ["JUDGE:critic:root0:r2:p0", "served", "pros_cons"],
    ["JUDGE:defender:root1:r1:p0", "served", "pros_cons"], ["JUDGE:cross-root:0->1", "served", "cross_exchange"],
    ["PANEL:root", "served", "judge_panel"], ["PANEL:root:preview:mimo-v2-6-pro:seat:runnerUp", "served", "judge_panel"],
    ["JUDGE:review:node-1", "served", "reviewer"], ["JUDGE:review:catch-up:node-1", "served", "reviewer"],
    ["COMPOSER:SYNTHESIZER:INITIAL:1", "served", "answer_writer"], ["COMPOSER:SYNTHESIZER:RETRY:2:seat:main", "served", "answer_writer"],
    ["POST_COMPOSE_R9:EVALUATOR:1", "served", "answer_checker"], ["STORY:STORYTELLER:1", "story", "story_writer"],
    ["STORY:CHECKER:2", "story", "story_checker"], ["STORY:STORYTELLER:1", "served", null], ["evaluator.grade-judge-output.v1", "served", null],
    ["MAP:angles", "served", "opening"], ["MAP:list:0", "served", "opening"], ["MAP:merge", "served", "opening"],
    ["MAP:gap:1", "served", "opening"], ["MAP:choose", "served", "opening"],
    // LG-A (L32, pre-flight PF-A47): a structure-repair call runs at its repair model's slip_fix level, whatever it repairs.
    ["REPAIR:STRUCTURE:JUDGE:cross-root:0->1", "served", "slip_fix"], ["REPAIR:STRUCTURE:PANEL:root", "served", "slip_fix"],
    ["REPAIR:STRUCTURE:STORY:STORYTELLER:1", "story", "slip_fix"]
  ])("%s on %s -> %s", (callSiteKey, lane, step) => {
    expect(previewThinkingStepOf({ callSiteKey, lane })).toBe(step);
  });
});

describe("the level lookup", () => {
  const table = parsePreviewThinkingLevels({ [DEEPSEEK]: { level: "low", steps: { judge_panel: "none", slip_fix: "low" } },
    [QWEN]: { steps: { story_writer: "medium" } } });
  it("step override, else the AI's level, else the row's default", () => {
    expect(previewThinkingLevelFor(table, previewModelRow(DEEPSEEK)!, "judge_panel")).toBe("none");
    expect(previewThinkingLevelFor(table, previewModelRow(DEEPSEEK)!, "opening")).toBe("low");
    expect(previewThinkingLevelFor(table, previewModelRow(DEEPSEEK)!, null)).toBe("low");
    expect(previewThinkingLevelFor(table, previewModelRow(QWEN)!, "story_writer")).toBe("medium");
    expect(previewThinkingLevelFor(table, previewModelRow(QWEN)!, "reviewer")).toBe("default");
    expect(previewThinkingLevelFor(table, previewModelRow(GLM)!, "judge_panel")).toBe("high");
    expect(previewThinkingLevelFor(undefined, previewModelRow(HAIKU)!, "story_writer")).toBe("high");
  });
  it("slip_fix is read only as the repair level", () => {
    expect(previewSlipFixLevel(table, previewModelRow(DEEPSEEK)!)).toBe("low");
    expect(previewSlipFixLevel(table, previewModelRow(QWEN)!)).toBeUndefined();
    expect(previewSlipFixLevel(undefined, previewModelRow(GLM)!)).toBeUndefined();
  });
  it("'default' travels as DEFAULT_ONLY", () => {
    expect(previewThinkingLevelOnRequest("default")).toBe(THINKING_LEVEL_DEFAULT_ONLY);
    expect(previewThinkingLevelOnRequest("none")).toBe("none");
  });
});

describe("the path rewrite's steps (dig-model revision W3-7)", () => {
  it("maps the story lane's PATH_REWRITE sites to the two steps, as packages/story names them", async () => {
    const story = await import("@debateai/story");
    for (const round of [1, 2, 3, 4]) {
      expect(previewThinkingStepOf({ callSiteKey: `PATH_REWRITE:WRITER:${String(round)}`, lane: "story" })).toBe("path_rewrite_writer");
      expect(previewThinkingStepOf({ callSiteKey: `PATH_REWRITE:CHECKER:${String(round)}`, lane: "story" })).toBe("path_rewrite_checker");
      expect(story.pathRewriteThinkingOf(`PATH_REWRITE:WRITER:${String(round)}`)?.step).toBe("path_rewrite_writer");
      expect(story.pathRewriteThinkingOf(`PATH_REWRITE:CHECKER:${String(round)}`)?.step).toBe("path_rewrite_checker");
    }
    expect(previewThinkingStepOf({ callSiteKey: "PATH_REWRITE:WRITER:5", lane: "story" })).toBeNull();
    expect(previewThinkingStepOf({ callSiteKey: "PATH_REWRITE:WRITER:1", lane: "served" })).toBeNull();
  });

  it("thinks low by the code's rule unless the owner's table sets the step; an AI without low keeps its own", async () => {
    const story = await import("@debateai/story");
    expect(story.pathRewriteThinkingOf("PATH_REWRITE:WRITER:1")?.level).toBe("low");
    const haiku = previewModelRow(HAIKU)!;
    const glm = previewModelRow(GLM)!;
    expect(previewThinkingLevelFor(undefined, haiku, "path_rewrite_writer")).toBe("low");
    expect(previewThinkingLevelFor({ [HAIKU]: { level: "high" } }, haiku, "path_rewrite_writer")).toBe("low");
    expect(previewThinkingLevelFor({ [HAIKU]: { steps: { path_rewrite_writer: "medium" } } }, haiku, "path_rewrite_writer")).toBe("medium");
    expect(previewThinkingLevelFor(undefined, glm, "path_rewrite_checker"))
      .toBe((glm.efforts as readonly string[]).includes("low") ? "low" : glm.defaultEffort);
    // Every other step is as before.
    expect(previewThinkingLevelFor({ [HAIKU]: { level: "high" } }, haiku, "story_writer")).toBe("high");
  });
});
