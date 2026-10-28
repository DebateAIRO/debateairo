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

  it("starts both threat-report workers and holds email before destroying the user key", () => {
    const source = main();
    expect(source).toContain("startThreatReportAlerts({");
    expect(source).toContain("startThreatReportErasure({");
    expect(source).toContain("beforeKeyDestruction: threatReportEmailHold(");
  });

  it("resolves queued alert staff ids through an active capability holder", () => {
    const source = main();
    expect(source).toContain('const readThreatReportStaffEmail = threatReportEmailReader(pool, dekStore, "staff");');
    expect(source).toMatch(/startThreatReportAlerts\(\{[\s\S]*?readRecipientEmail: readThreatReportStaffEmail/u);
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
    const at = askRoute.indexOf("options.questionCheck.check(ask.question_line)");
    expect(at).toBeGreaterThan(0);
    expect(askRoute.slice(at, at + 1_500)).not.toMatch(/\.keep\(/u);
  });

  // Property: the price bound counts the instruction built from the subjects file, which is longer than the old one.
  it("projects the price from the instruction built from the subjects file", () => {
    const source = readFileSync("apps/api/src/question-check/compose.ts", "utf8");
    expect(source).toContain("Buffer.byteLength(questionCheckContract(input.subjects).instruction");
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
