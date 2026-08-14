import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { RunRepository } from "@debateai/db";

describe("LOAD-01 persisted run projection", () => {
  it("reads the state only through the owning asker and prioritizes terminal failure", async () => {
    const calls: Array<{ text: string; values: readonly unknown[] }> = [];
    const pool = {
      query: async (text: string, values: readonly unknown[]) => {
        calls.push({ text, values });
        return {
          rows: [{
            run_id: "run:failed",
            question_line: "Messi or Ronaldo?",
            state: "FAILED",
            terminal_reason: "TOTAL_REVIEW_COVERAGE_UNSATISFIED"
          }]
        };
      }
    } as unknown as Pool;
    const result = await new RunRepository(pool).readLoadingProjection("run:failed", "asker:owner");
    expect(result).toEqual({
      runRef: "run:failed",
      questionLine: "Messi or Ronaldo?",
      state: "FAILED",
      terminalReason: "TOTAL_REVIEW_COVERAGE_UNSATISFIED"
    });
    expect(calls[0]?.values).toEqual(["run:failed", "asker:owner"]);
    expect(calls[0]?.text).toMatch(/run\.asker_id = \$2/);
  });
});
