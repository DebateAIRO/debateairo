import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const main = () => readFileSync("apps/api/src/main.ts", "utf8");

describe("S04 production composition", () => {
  it("reads the sealed policy and passes the composed question check to buildApi", () => {
    const source = main();
    expect(source).toContain('readQuestionCheckPolicy(pool, environment.REGISTER_VERSION)');
    expect(source).toContain("composeQuestionCheck({");
    expect(source).toContain("questionCheck,");
  });

  // 2026-11-19: the staff threat reports were removed. Nothing alerts or holds an email for them, but reports a database may
  // still hold are erased when due, so the hourly sweep stays (gated, and cleared on close) until the schema goes.
  it("starts only the threat-report erase sweep, and holds no email before destroying the user key", () => {
    const source = main();
    expect(source).toContain("const threatReportErasureTimer = startThreatReportErasure({ repository: new PostgresThreatReportRepository(pool) }, releaseWatcher);");
    expect(source).toContain('api.addHook("onClose",async () => clearInterval(threatReportErasureTimer));');
    expect(source).not.toMatch(/startThreatReportAlerts|threatReportEmail/u);
    expect(source).not.toContain("beforeKeyDestruction:");
  });

  // Property (V, 2026-10-28): the subjects file is read at boot, so a bad file stops the API; nothing keeps a question.
  it("reads the subjects file at boot and keeps no question", () => {
    const source = main();
    expect(source).toMatch(/boot\.run\("question-subjects", async \(\) => readQuestionSubjects\(\)\)/u);
    expect(source).toMatch(/composeQuestionCheck\(\{[\s\S]*?subjects: questionSubjects/u);
    expect(source).not.toContain("keepWithHeldEmail(questionLine");
    expect(source).not.toMatch(/keeper:/u);
    expect(readFileSync("apps/api/src/question-check/compose.ts", "utf8")).not.toMatch(/keeper|\.keep\(/u);
    expect(readFileSync("apps/api/src/question-check/ask-gate.ts", "utf8")).not.toMatch(/keep\(/u);
    const askRoute = readFileSync("apps/api/src/index.ts", "utf8");
    const at = askRoute.indexOf("options.questionCheck.check(questionWithPurposeLines(ask.question_line, ask.purpose_lines))");
    expect(at).toBeGreaterThan(0);
    expect(askRoute.slice(at, at + 1_500)).not.toMatch(/\.keep\(/u);
  });

  // Property: the price bound counts the instruction built from the subjects file, which is longer than the old one.
  it("projects the price from the instruction built from the subjects file", () => {
    const source = readFileSync("apps/api/src/question-check/compose.ts", "utf8");
    expect(source).toContain("Buffer.byteLength(questionCheckContract(input.subjects).instruction");
  });

  // R22's first debate (2026-11-02): the test site has the Anthropic gate and no support target; without the gate the check
  // was never on and every ask was refused. tests/unit/question-check-preview-route.test.ts runs what this wiring builds.
  it("hands the check the preview gate exactly as the language check gets it (ruling L-ROUTE)", () => {
    expect(main()).toMatch(/composeQuestionCheck\(\{[\s\S]*?preview: previewGate === undefined \? null : \{ fetch: previewFetch, anthropicSocket: previewProviderSocket\(previewGate, "anthropic"\) \}\n\}\)\);/u);
  });

  it("composes from the support target and the sealed policy through the local switch", () => {
    expect(existsSync("apps/api/src/question-check/compose.ts")).toBe(true);
    const source = readFileSync("apps/api/src/question-check/compose.ts", "utf8");
    expect(source).toContain("questionCheckTarget(input.target)");
    expect(source).toContain("createQuestionCheckTransport(target,");
    expect(source).toContain('localOffFlagPath(input.apiPort, "question-check")');
    expect(source).toContain("deadlineMs: input.policy.deadlineMs");
  });
});
