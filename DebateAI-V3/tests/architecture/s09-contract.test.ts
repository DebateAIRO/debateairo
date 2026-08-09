import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("S09 structural attachment and migration law", () => {
  it("removes the unreachable DERIVED tier member with replay-safe replacement DDL", async () => {
    const migration = await readFile(new URL("../../migrations/0012_s09.sql", import.meta.url), "utf8");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS run_tier_source_check");
    expect(migration).toContain("tier_source IN ('ASKER', 'DEPLOYMENT_POLICY')");
    expect(migration).not.toContain("'DERIVED'");
  });

  it("attaches the attempt-ledger-backed envelope to the runner and avoids source-literal tier arithmetic", async () => {
    const [runner, apiMain, budget] = await Promise.all([
      readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8"),
      readFile(new URL("../../packages/budget/src/index.ts", import.meta.url), "utf8")
    ]);
    expect(runner).toContain("BudgetRepository");
    expect(budget).toContain("countRunModelAttempts");
    expect(apiMain).toContain("resolveEffectiveRiskTier");
    expect(apiMain).not.toContain("RISK_TIERS.indexOf");
  });

  it("persists typed condition marks and their inspected affected nodes", async () => {
    const serve = await readFile(new URL("../../packages/serve/src/index.ts", import.meta.url), "utf8");
    expect(serve).toContain("INSERT INTO serve.condition_mark");
    expect(serve).toContain("INSERT INTO serve.condition_mark_node");
    expect(serve).toContain("ENVELOPE_EXHAUSTED");
    expect(serve).toContain("SKIPPED-BY-BUDGET");
  });
});
