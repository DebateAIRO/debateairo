// Practice side-by-side page (spec 2026-10-12 §4.8): the same question's answers at each thinking level, labelled, on one
// static page with no script, so it can be published as a private page. `report --side-by-side` writes it.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { practiceSideBySideHtml } from "../../tools/preview-practice/practice-side-by-side.js";
import { repositoryRoot, runPractice } from "../../tools/preview-practice/practice.js";

const base = { providerRef: "preview:deepseek-v4-1-flash", gate: "deepinfra", attempts: [], inputTokens: 100, outputTokens: 900,
  cachedInputTokens: null, unbilledRefusals: 0, repairKind: null, issues: [], recheckIssues: [], errorCode: null, replyText: null, detail: null } as const;
const sample = (over: Record<string, unknown>) => ({ ...base, model: "deepseek-ai/DeepSeek-V4.1-Flash", lane: "PANEL", sample: 1,
  questionId: "q-en-1", status: "PARSED", latencyMs: 41_000, costNanoUsd: "540000", reasoningTokens: 700, cutOff: false, ...over });

describe("the side-by-side page (spec 2026-10-12 §4.8)", () => {
  it("puts the same question at each level in labelled columns, in run order", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "answer at high" }),
      sample({ levelRun: "low#1", thinkingLevel: "low", answerText: "answer at low", reasoningTokens: 90 })] as never);
    expect(html.indexOf("high#1")).toBeLessThan(html.indexOf("low#1"));
    expect(html).toContain("answer at high");
    expect(html).toContain("answer at low");
    expect(html).toContain("700");
    expect(html).toContain("90");
  });
  it("escapes answers: text, never markup", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "<script>alert(1)</script> & \"x\"" })] as never);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;");
  });
  it("shows a missing answer plainly", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "ok" }),
      sample({ levelRun: "low#1", thinkingLevel: "low", status: "SKIPPED_MODEL_BUSY", answerText: null })] as never);
    expect(html).toContain("no answer (model busy)");
  });
  it("is a themed page that works on a phone", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "ok" })] as never);
    expect(html).toMatch(/<title>Thinking level comparison<\/title>/u);
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain(':root:not([data-theme="light"])');
    expect(html).toContain('name="viewport"');
    expect(html).not.toMatch(/<script/u);
  });
});

describe("the side-by-side page: what each answer shows (spec 2026-10-12 §4.8)", () => {
  it("a repaired answer shows its accepted answer like a parsed one, with its status", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", status: "REPAIRED", answerText: "fixed answer" })] as never);
    expect(html).toContain("fixed answer");
    expect(html).toContain("answered on a second try");
    expect(html).not.toContain("no answer");
  });
  it("says in plain words why a job has no answer", () => {
    const html = practiceSideBySideHtml([
      sample({ levelRun: "high#1", thinkingLevel: "high", status: "PARSE_FAILED", answerText: null }),
      sample({ levelRun: "low#1", thinkingLevel: "low", status: "SKIPPED_GATE_STOPPED", answerText: null })] as never);
    expect(html).toContain("no answer (format failed for good)");
    expect(html).toContain("no answer (gate stopped)");
  });
  it("marks a cut-off answer, and shows its thinking tokens, time and cost under it", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "ok", cutOff: true,
      reasoningTokens: 700, latencyMs: 41_000, costNanoUsd: "540000" })] as never);
    expect(html).toContain("cut off");
    expect(html).toContain("700 tokens");
    expect(html).toContain("41.0 s");
    expect(html).toContain("$0.00054");
  });
  it("orders each model's runs by first appearance in the samples, and lanes in the default order", () => {
    // The model's first sample is a REVIEW one at high#1, so high#1 comes before low#1 in every lane of that model.
    const html = practiceSideBySideHtml([
      sample({ lane: "REVIEW", levelRun: "high#1", thinkingLevel: "high", answerText: "review answer" }),
      sample({ lane: "PANEL", levelRun: "low#1", thinkingLevel: "low", answerText: "panel low" }),
      sample({ lane: "PANEL", levelRun: "high#1", thinkingLevel: "high", answerText: "panel high" })] as never);
    expect(html.indexOf("panel high")).toBeLessThan(html.indexOf("panel low"));
    expect(html.indexOf("PANEL")).toBeLessThan(html.indexOf("REVIEW"));
  });
  it("the lanes option sets the order, and a lane it does not list is still shown, after the listed ones", () => {
    const html = practiceSideBySideHtml([sample({ lane: "JUDGE_POSITION", levelRun: "high#1", thinkingLevel: "high", answerText: "judge answer" }),
      sample({ lane: "REVIEW", levelRun: "high#1", thinkingLevel: "high", answerText: "review answer" })] as never, { lanes: ["REVIEW"] });
    expect(html.indexOf("review answer")).toBeLessThan(html.indexOf("judge answer"));
    expect(html).toContain("judge answer");
  });
  it("a run with no level label shows as the server's setting", () => {
    const html = practiceSideBySideHtml([sample({ answerText: "server answer" })] as never);
    expect(html).toContain("server setting");
    expect(html).toContain("server answer");
  });
  it("the header says in plain words what a run label means, and what default and none are", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "ok" })] as never,
      { generatedAt: new Date("2026-10-12T10:00:00.000Z") });
    expect(html).toContain("2026-10-12T10:00:00.000Z");
    expect(html).toContain("by chance alone");
    expect(html).toContain("switched off");
    expect(html).toContain("own setting");
  });
  it("is one static page: a dark theme under both selectors, a background on body, phone-width columns and wrapped answers", () => {
    const html = practiceSideBySideHtml([sample({ levelRun: "high#1", thinkingLevel: "high", answerText: "ok" })] as never);
    expect(html).toContain(':root[data-theme="dark"]');
    expect(html).toMatch(/body \{[^}]*background: var\(--bg\)/u);
    expect(html).toContain("repeat(auto-fit, minmax(18rem, 1fr))");
    expect(html).toContain("white-space: pre-wrap");
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toContain("16px");
  });
});

describe("practice report --side-by-side (spec 2026-10-12 §4.8)", () => {
  const GLM = "zai-org/GLM-5.3-Flash";
  const folders: string[] = [];
  afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
  const freshFolder = () => { const folder = mkdtempSync(join(tmpdir(), "practice-side-by-side-")); folders.push(folder); return folder; };
  /** A samples.jsonl with a start line and one sample line per given sample (as the samples log writes them). */
  function samplesFile(...samples: readonly Record<string, unknown>[]): string {
    const file = join(freshFolder(), "samples.jsonl");
    const start = { kind: "start", schema: "preview-practice-samples-v1", mode: "formats", startedAt: "2026-10-12T00:00:00.000Z",
      models: [GLM], lanes: ["PANEL"], samples: 1, parallel: true, unsentStreakAtStart: { deepinfra: 0, anthropic: 0 },
      remainingBefore: { deepinfra: null, anthropic: null } };
    writeFileSync(file, [start, ...samples.map((value) => ({ kind: "sample", sample: value }))].map((line) => JSON.stringify(line)).join("\n") + "\n");
    return file;
  }

  it("writes side-by-side.html into --out from a samples log, and no report files", async () => {
    const file = samplesFile(sample({ model: GLM, levelRun: "high#1", thinkingLevel: "high", answerText: "answer at high" }));
    const out = join(freshFolder(), "out");
    const outcome = await runPractice(["report", "--side-by-side", file, "--out", out], {}, { log: () => undefined });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.directory).toBe(out);
    expect(readFileSync(join(out, "side-by-side.html"), "utf8")).toContain("answer at high");
    expect(existsSync(join(out, "report.json"))).toBe(false);
  });
  it("is refused outside report mode, before anything is written", async () => {
    const file = samplesFile();
    for (const mode of ["formats", "debate"]) {
      const out = join(freshFolder(), "out");
      const outcome = await runPractice([mode, "--side-by-side", file, "--out", out], {}, { log: () => undefined });
      expect(outcome.report).toMatchObject({ verdict: "HARNESS_ERROR", reasons: ["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"] });
      expect(outcome.directory).toBeNull();
      expect(existsSync(out)).toBe(false);
    }
  });
  it("never writes inside the repository", async () => {
    const file = samplesFile(sample({ model: GLM, levelRun: "high#1", thinkingLevel: "high", answerText: "ok" }));
    const out = join(repositoryRoot(), "side-by-side-refused-check");
    const outcome = await runPractice(["report", "--side-by-side", file, "--out", out], {}, { log: () => undefined });
    expect(outcome.report).toMatchObject({ verdict: "HARNESS_ERROR", reasons: ["HARNESS_ERROR:PRACTICE_REPORT_INSIDE_REPOSITORY"] });
    expect(outcome.directory).toBeNull();
    expect(existsSync(out)).toBe(false);
  });
});
