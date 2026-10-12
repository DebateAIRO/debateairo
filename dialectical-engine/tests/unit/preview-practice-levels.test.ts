// Practice `--levels` (spec 2026-10-12 §4.8): the same jobs at several thinking levels, each listed level its own run,
// the runs taking turns per job, each run's config naming only that model's level.
import { describe, expect, it } from "vitest";
import { parsePracticeLevels, practiceInterleavedRuns, practiceLevelConfig } from "../../tools/preview-practice/practice-levels.js";
import { parsePreviewProviderTestConfig } from "@debateai/providers";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";

describe("practice --levels (spec 2026-10-12 §4.8)", () => {
  it("names repeated levels as separate runs, in the given order", () => {
    expect(parsePracticeLevels(`${GLM}=high,high,low;${QWEN}=default,none`, [GLM, QWEN, DEEPSEEK])).toEqual({
      [GLM]: [{ model: GLM, level: "high", run: "high#1" }, { model: GLM, level: "high", run: "high#2" }, { model: GLM, level: "low", run: "low#1" }],
      [QWEN]: [{ model: QWEN, level: "default", run: "default#1" }, { model: QWEN, level: "none", run: "none#1" }]
    });
  });
  it.each([
    ["off-menu level", `${GLM}=medium`], ["model not in the run", `${DEEPSEEK}=low`], ["unknown model", "other/model=low"],
    ["empty level list", `${GLM}=`], ["duplicate model", `${GLM}=high;${GLM}=low`], ["garbage", "nonsense"]
  ])("refuses %s", (_name, text) => {
    expect(() => parsePracticeLevels(text, [GLM, QWEN])).toThrow(/PRACTICE_LEVELS_INVALID/u);
  });
  it("each run's config names only that model's level", () => {
    const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
      budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "preview-fixture", free_model_ids: [GLM],
      thinking_levels: { [GLM]: { steps: { story_writer: "low" } } } }))!;
    expect(practiceLevelConfig(config, { model: GLM, level: "low", run: "low#1" }).thinking_levels).toEqual({ [GLM]: { level: "low" } });
  });
  it("rotates the runs per job so drift spreads over every level", () => {
    const runs = parsePracticeLevels(`${GLM}=high,high,low`, [GLM])[GLM]!;
    expect([0, 1, 2, 3].map(index => practiceInterleavedRuns(runs, index).map(run => run.run))).toEqual([
      ["high#1", "high#2", "low#1"], ["high#2", "low#1", "high#1"], ["low#1", "high#1", "high#2"], ["high#1", "high#2", "low#1"]]);
  });
  it("a model listed with a single level simply runs that level", () => {
    expect(parsePracticeLevels(`${GLM}=low`, [GLM])).toEqual({ [GLM]: [{ model: GLM, level: "low", run: "low#1" }] });
  });
});
