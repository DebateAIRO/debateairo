import { describe, expect, it } from "vitest";
import { auditArchitecture, auditSourceRules } from "../../tools/orphan-audit/src/index.js";

// apps/replay is the independent verifier of the published arithmetic: the edge table
// (tools/orphan-audit) allows it `published-arithmetic` and nothing else, and only the
// register loader may read the process environment. The L5-F3 floor on the ceremony's
// argv database URL has to live inside those two laws, not around them.
describe("apps/replay stays an isolated verifier while it floors its database URL (L5-F3)", () => {
  it("declares no workspace edge beyond published-arithmetic", async () => {
    const report = await auditArchitecture();
    expect(report.violations.filter((row) => row.startsWith("apps/replay"))).toEqual([]);
  });

  it("never reads the process environment", async () => {
    const report = await auditSourceRules();
    expect(report.blocking.filter((row) => row.startsWith("apps/replay"))).toEqual([]);
  });
});
