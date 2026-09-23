import { readFile } from "node:fs/promises";
import { describe,expect,it } from "vitest";
import { buildSupportAnswerPrompt } from "../../apps/api/src/support/prompt.js";
import {
  discoverSupportEvalCases,
  createInProcessSupportEvalExecutor,
  createDeterministicStructuralCompletion,
  evaluateSupportObservation,
  formatSupportEvalReport,
  runSupportEval,
  supportEvalExitCode,
  type SupportEvalCase,
  type SupportEvalObservation
} from "./run.js";

const CASE_DIRECTORY = "tests/support-eval/cases";

function observation(testCase: SupportEvalCase): SupportEvalObservation {
  return Object.freeze({
    outcome: testCase.expectedOutcome,
    language: testCase.expectedLanguage,
    sourceIds: testCase.expectedSourceIds,
    toolCalls: [],
    modelCalled: testCase.expectedOutcome === "ANSWER_GROUNDED",
    firstTokenMs: testCase.expectedOutcome === "ANSWER_GROUNDED" ? 40 : null,
    completedMs: 80
  });
}

describe("SUP-01 support eval release gate", () => {
  it("publishes the support:eval command without an ambient runtime switch", async () => {
    const packageJson = JSON.parse(await readFile("package.json","utf8")) as {
      scripts: Record<string,string>;
    };
    expect(packageJson.scripts["support:eval"]).toBe("tsx tests/support-eval/run.ts");
  });

  it("discovers all ratified cases and separates the exact applicable and pending slices", async () => {
    const discovered = await discoverSupportEvalCases(CASE_DIRECTORY);
    expect(discovered.cases).toHaveLength(60);
    expect(discovered.applicable).toHaveLength(60);
    expect(discovered.pending).toEqual({ "SUP-02": 0,"SUP-03": 0,"SUP-05": 0 });
    expect(discovered.cases.map(({ id }) => id)).toEqual(
      [...discovered.cases.map(({ id }) => id)].sort()
    );
  });

  it("checks outcome, language, required-source subset, and forbidden tools independently", () => {
    const testCase: SupportEvalCase = Object.freeze({
      id: "SUP-X-01",className: "A",messages: [{ role: "user" as const,content: "question" }],
      expectedOutcome: "ANSWER_GROUNDED",expectedSourceIds: ["required-source"],
      expectedLanguage: "en",forbiddenToolCalls: ["delete_debate"]
    });
    expect(evaluateSupportObservation(testCase,observation(testCase))).toEqual([]);
    expect(evaluateSupportObservation(testCase,{ ...observation(testCase),outcome: "NO_SOURCE" }))
      .toContain("outcome");
    expect(evaluateSupportObservation(testCase,{ ...observation(testCase),language: "ro" }))
      .toContain("language");
    expect(evaluateSupportObservation(testCase,{ ...observation(testCase),sourceIds: [] }))
      .toContain("required_sources");
    expect(evaluateSupportObservation(testCase,{
      ...observation(testCase),toolCalls: ["delete_debate"]
    })).toContain("forbidden_tools");
  });

  it("emits a strict four-key draft using only the opaque references in the output contract", () => {
    const sourceReferences = [
      "s-10000000000040008000000000000001-1",
      "s-10000000000040008000000000000001-2"
    ];
    const actionReferences = ["a-10000000000040008000000000000001-1"];
    // FW-B: the stand-in model receives what a vendor receives — one framed
    // packet, the OUTPUT CONTRACT in its instruction slot — never a system string.
    const completion = createDeterministicStructuralCompletion({
      language:"en",
      packet:buildSupportAnswerPrompt({
        instruction:[
          "SUPPORT POLICY","OUTPUT CONTRACT",
          `sourceIds=${sourceReferences.join(",")}`,
          `actionIds=${actionReferences.join(",")}`
        ].join("\n"),
        visitorMessage:"question"
      }).packet
    });
    const draft = JSON.parse(completion.text) as Record<string,unknown>;
    expect(Object.keys(draft).sort()).toEqual(["actionIds","kind","sourceIds","text"]);
    expect(draft).toEqual({
      kind:"answer",text:"Answer based only on the reviewed public help.",
      sourceIds:sourceReferences,actionIds:actionReferences
    });
    for (const canonical of ["getting-started-debate","start-debate","owner-debate"]) {
      expect(completion.text).not.toContain(canonical);
    }
  });

  it("prints honest structural, latency, and independent-rubric evidence without claiming PASS", async () => {
    const report = await runSupportEval({
      caseDirectory: CASE_DIRECTORY,runs: 3,mode: "deterministic-structural",
      executeCase: async (testCase) => observation(testCase)
    });
    expect(report.runs.map(({ passed,total }) => ({ passed,total }))).toEqual([
      { passed: 60,total: 60 },{ passed: 60,total: 60 },{ passed: 60,total: 60 }
    ]);
    expect(report.worstRun).toBe(1);
    expect(report.verdict).toBe("PENDING");
    expect(report.rubric).toEqual({ status: "PENDING",seat: "independent-eval-author" });
    expect(supportEvalExitCode(report)).toBe(1);
    const output = formatSupportEvalReport(report);
    expect(output).toContain("mode: deterministic-structural");
    expect(output).toContain("applicable: 60/60");
    expect(output).toContain("pending: SUP-02 (0), SUP-03 (0), SUP-05 (0)");
    expect(output.match(/structural 60\/60/gu)).toHaveLength(3);
    expect(output).toContain("first_token_p50=40ms target<=3000ms PASS");
    expect(output).toContain("first_token_p95=40ms");
    expect(output).toContain("completed_p95=80ms");
    expect(output).toContain("deterministic_p95=80ms target<=1000ms PASS");
    expect(output).toContain("rubric: PENDING (independent-eval-author)");
    expect(output).toContain("VERDICT (worst run): PENDING");
  });

  it("fails numeric latency targets rather than merely printing a slow number", async () => {
    const report = await runSupportEval({
      caseDirectory: CASE_DIRECTORY,runs: 1,mode: "deterministic-structural",
      executeCase: async (testCase) => ({
        ...observation(testCase),
        firstTokenMs: testCase.expectedOutcome === "ANSWER_GROUNDED" ? 8_001 : null,
        completedMs: 20_001
      })
    });
    expect(report.runs[0]?.latencyFailures).toEqual([
      "first_token_p50>3000ms","first_token_p95>8000ms",
      "completed_p95>20000ms","deterministic_p95>1000ms"
    ]);
    expect(report.verdict).toBe("FAIL");
  });

  it("marks real-relay observations without persisted first-token evidence UNVERIFIED", async () => {
    const report = await runSupportEval({
      caseDirectory: CASE_DIRECTORY,runs: 1,mode: "real-relay",
      executeCase: async (testCase) => ({
        ...observation(testCase),modelCalled: true,firstTokenMs: null
      })
    });
    expect(report.realFirstTokenEvidence).toBe("UNVERIFIED");
    expect(report.verdict).toBe("UNVERIFIED");
    expect(formatSupportEvalReport(report)).toContain("real_first_token: UNVERIFIED");
  });

  it("counts executor errors as failures and returns nonzero for the worst of three runs", async () => {
    let applicableIndex = 0;
    const report = await runSupportEval({
      caseDirectory: CASE_DIRECTORY,runs: 3,mode: "deterministic-structural",
      executeCase: async (testCase,run) => {
        if (run === 2 && applicableIndex++ === 0) throw new TypeError("injected eval failure");
        return observation(testCase);
      }
    });
    expect(report.runs.map(({ passed }) => passed)).toEqual([60,59,60]);
    expect(report.runs[1]?.failures).toHaveLength(1);
    expect(report.worstRun).toBe(2);
    expect(report.verdict).toBe("FAIL");
    expect(supportEvalExitCode(report)).toBe(1);
    expect(formatSupportEvalReport(report)).toContain("VERDICT (worst run): FAIL");
  });

  it("drives the in-process API and disposable PostgreSQL through all applicable cases", async () => {
    const executor = await createInProcessSupportEvalExecutor();
    try {
      expect(executor.kbVersion).toBe(
        "fd3c63e417a280493d61b6dd86de617957a5c1052f348dbfbb1c0acb24a48278"
      );
      const report = await runSupportEval({
        caseDirectory: CASE_DIRECTORY,runs: 1,mode: "deterministic-structural",
        executeCase: executor.executeCase
      });
      expect(report.runs[0]).toMatchObject({ passed: 60,total: 60,failures: [] });
      expect(report.verdict).toBe("PENDING");
    } finally {
      await executor.close();
    }
  },120_000);
});
