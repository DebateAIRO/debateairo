import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("development runner terminal evaluation wiring", () => {
  it("wires the recorded-facts evaluator into the production runner", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/main.ts", import.meta.url),
      "utf8"
    );
    const importIndex = source.indexOf("createTerminalActivationEvaluator");
    const constructionIndex = source.indexOf("new WalkingSkeletonRunner");
    const wiringIndex = source.indexOf(
      "resolveTerminalActivations: createTerminalActivationEvaluator(pool)"
    );

    expect(importIndex).toBeGreaterThan(-1);
    expect(constructionIndex).toBeGreaterThan(importIndex);
    expect(wiringIndex).toBeGreaterThan(constructionIndex);
    expect(source).not.toContain("resolveTerminalActivations: async");
  });

  it("reads terminal facts through one bounded runtime capability", async () => {
    const source = await readFile(
      new URL("../../packages/battery/src/terminal.ts", import.meta.url),
      "utf8"
    );
    const migration = await readFile(
      new URL("../../migrations/0049_terminal_recorded_facts.sql", import.meta.url),
      "utf8"
    );

    expect(source).toContain("SELECT * FROM core.read_terminal_recorded_facts($1)");
    expect(source).not.toContain("FROM evidence.query_set WHERE run_id = $1");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION core.read_terminal_recorded_facts(uuid) TO debateai_runtime");
    expect(migration).toContain("REVOKE ALL ON FUNCTION core.read_terminal_recorded_facts(uuid) FROM PUBLIC");
  });
});
