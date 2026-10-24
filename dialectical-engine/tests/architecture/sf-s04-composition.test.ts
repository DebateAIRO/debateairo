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

  it("keeps a threat with its email when account erasure is already prepared", () => {
    const source = main();
    expect(source).toContain("keepWithHeldEmail(questionLine, accountUserId, email)");
    expect(source).toContain("const email = await readThreatReportRecipientEmail(accountUserId);");
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
