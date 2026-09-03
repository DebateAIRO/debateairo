import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  buildAcceptanceRegisterRows,
  extractEvaluatorContractText
} from "../../acceptance/seed-register.js";
import {
  buildDevelopmentRunnerRegisterRows,
  extractEvaluatorContractText as extractEvaluatorContractTextDev
} from "../../apps/runner/src/dev-deployment-register.js";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const runnerSource = async (): Promise<string> =>
  readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");

/**
 * F-SEALEDROWS-A. `c1d8e09d` retired the two-prompt conformance protocol
 * (`{conforms,findings}` + `{pass}`) for one combined evaluator prompt, and the
 * extractor that fingerprints it kept hunting for the retired wording. It
 * matched 0 where it required 2, so BOTH deployment seeders threw before
 * writing a single register row.
 *
 * V RULED 2026-09-04: the conformance fingerprint covers the EVALUATOR prompt
 * ALONE. The writer's prompt already carries `composerContractHash`, so the
 * checker's slot fingerprints the checker's prompt and nothing else — one slot,
 * one prompt, one fingerprint, so a later edit says WHICH wording moved.
 */
describe("F-SEALEDROWS-A · the conformance fingerprint and the extractor that locates it", () => {
  it("builds BOTH deployment seeders — the acceptance and development registers", async () => {
    const acceptance = await buildAcceptanceRegisterRows();
    const development = await buildDevelopmentRunnerRegisterRows();
    expect(acceptance.length).toBeGreaterThan(0);
    expect(development.length).toBeGreaterThan(0);
  });

  it("seals the EVALUATOR prompt alone as the conformance fingerprint (V 2026-09-04)", async () => {
    const runner = await runnerSource();
    const evaluatorText = extractEvaluatorContractText(runner, "TEST");
    // Independently re-derived here, so the seeder and the test do not share a
    // locator that could go stale in lockstep — which is how this defect hid.
    expect(evaluatorText).toContain("satisfied");
    expect(evaluatorText).toContain("citation_tracing");

    const rows = await buildAcceptanceRegisterRows();
    const byKey = Object.fromEntries(rows.map((row) => [row.rowKey, row.value]));
    expect(byKey.conformanceContractHash).toBe(sha256(evaluatorText));

    // The writer's prompt is a DIFFERENT slot and must not leak into this one.
    expect(byKey.conformanceContractHash).not.toBe(byKey.composerContractHash);
    const composerText = runner.match(/content: "(Return only JSON with a segments array[^"]+)"/)?.[1];
    expect(composerText).toBeDefined();
    expect(byKey.conformanceContractHash).not.toBe(sha256([composerText, evaluatorText].join("\n")));
  });

  it("agrees between the two deployments — one prompt, one fingerprint", async () => {
    const runner = await runnerSource();
    expect(extractEvaluatorContractTextDev(runner, "TEST")).toBe(extractEvaluatorContractText(runner, "TEST"));

    const acceptance = Object.fromEntries((await buildAcceptanceRegisterRows()).map((r) => [r.rowKey, r.value]));
    const development = Object.fromEntries((await buildDevelopmentRunnerRegisterRows()).map((r) => [r.rowKey, r.value]));
    expect(development.conformanceContractHash).toBe(acceptance.conformanceContractHash);
  });

  /**
   * THE GUARD. The retired extractor located the prompt by quoting words that
   * were themselves part of the volatile thing, so the prompt's wording could
   * move out from under it silently. This locator derives its search key from
   * the evaluator's OWN response parser in the same file: the prompt must name
   * every criterion the parser declares. Prompt and parser can now only drift
   * apart loudly.
   */
  describe("the locator is tied to the prompt it claims to describe", () => {
    const schema = (...keys: readonly string[]): string =>
      `const evaluatorVerdictSchema = z.object({\n  criteria: z.object({\n`
      + keys.map((key) => `    ${key}: z.boolean()`).join(",\n")
      + `\n  }).strict()\n}).strict();\n`;

    it("finds the one prompt that names every criterion the parser declares", () => {
      const source = schema("alpha", "beta")
        + `{ role: "system", content: "Return only JSON naming alpha and beta." },\n`
        + `{ role: "system", content: "Return only JSON with a segments array of things." },\n`;
      expect(extractEvaluatorContractText(source, "TEST")).toBe("Return only JSON naming alpha and beta.");
    });

    it("REFUSES when the prompt stops naming a criterion the parser still declares", () => {
      const source = schema("alpha", "beta", "gamma")
        + `{ role: "system", content: "Return only JSON naming alpha and beta." },\n`;
      expect(() => extractEvaluatorContractText(source, "TEST")).toThrow(/TEST/);
    });

    it("REFUSES when two prompts both name every criterion, rather than guessing", () => {
      const source = schema("alpha")
        + `{ role: "system", content: "First prompt naming alpha." },\n`
        + `{ role: "system", content: "Second prompt naming alpha." },\n`;
      expect(() => extractEvaluatorContractText(source, "TEST")).toThrow(/TEST/);
    });

    it("REFUSES when the parser declares no criteria at all", () => {
      const source = `{ role: "system", content: "Return only JSON naming alpha." },\n`;
      expect(() => extractEvaluatorContractText(source, "TEST")).toThrow(/TEST/);
    });
  });
});
