import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrations = new URL("../../migrations/", import.meta.url);
const migration = new URL("0126_support_answer_scope.sql", migrations);
const sql = existsSync(migration) ? readFileSync(migration, "utf8") : "";
const statements = sql.replace(/--[^\n]*/gu, "").trim().split(";").map((part) => part.trim()).filter(Boolean);

const outcomes = [
  "ANSWER_GROUNDED", "NO_SOURCE", "REFUSE_ZONE", "REFUSE_INJECTION", "REFUSE_SAFETY",
  "DEGRADED", "DISABLED", "RATE_LIMITED", "CASE_OPENED", "CONSENT_NEEDED", "ANON_CONTEXT",
  "REFUSE_OTHER_USER", "ANSWER_OWN_STATE", "ANSWER_INCIDENT", "NO_INCIDENT",
  "OFF_TOPIC", "CRISIS", "THREAT"
];

describe("0126 support answer scope", () => {
  it("only drops and re-adds the outcome check on support.message", () => {
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^ALTER TABLE support\.message DROP CONSTRAINT IF EXISTS support_message_outcome_ck$/u);
    expect(statements[1]).toMatch(/^ALTER TABLE support\.message ADD CONSTRAINT support_message_outcome_ck CHECK \(outcome IN \([\s\S]*\)\)$/u);
  });

  it("lists exactly the fifteen existing outcomes and three new outcomes", () => {
    const match = sql.match(/ADD CONSTRAINT support_message_outcome_ck CHECK \(outcome IN \(([\s\S]*?)\)\)/u);
    expect(match).not.toBeNull();
    expect([...match![1]!.matchAll(/'([^']+)'/gu)].map(([, value]) => value)).toEqual(outcomes);
  });

  it("drops the existing check before adding its widened replacement", () => {
    expect(statements[0]).toContain("DROP CONSTRAINT IF EXISTS support_message_outcome_ck");
    expect(statements[1]).toContain("ADD CONSTRAINT support_message_outcome_ck");
  });

  it("appends the 0126 loader last in the forward chain", () => {
    const chain = readFileSync(new URL("../../packages/db/src/migration-forward-chain.ts", import.meta.url), "utf8");
    expect(chain).toMatch(/const STEPS:[^\n]+\[([^\]]*,)?loadForward0126\]\)/u);
  });
});
