import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  originVersionOf, readSynthesisTexts, synthesisTextOf, verdictOfRecord
} from "../../packages/serve/src/synthesis-check.js";

const segment = (text: string, id: string) => ({
  segment_id: id, text, load_bearing: false, served_number_refs: []
});
const composed = (text: string, state: "COMPOSED" | "COMPONENTS_ONLY" = "COMPOSED") => ({
  serve_state: state,
  composed_text: [segment(text, "one")]
});

describe("synthesis check text", () => {
  it("synthesisTextOf joins composed_text segments with two newlines and trims, as the debate page does", () => {
    expect(synthesisTextOf({
      serve_state: "COMPOSED",
      composed_text: [segment("  first ", "one"), segment("second  ", "two")]
    })).toBe("first \n\nsecond");
  });

  it("synthesisTextOf is null for COMPONENTS_ONLY and for an empty joined text", () => {
    expect(synthesisTextOf(composed("secret", "COMPONENTS_ONLY"))).toBeNull();
    expect(synthesisTextOf(composed("  "))).toBeNull();
  });

  it("the debate page still builds its Synthesis with the same expression", async () => {
    const adapter = await readFile(new URL("../../apps/ui/lib/v3/adapter.ts", import.meta.url), "utf8");
    expect(adapter).toContain('answer.composed_text.map((segment) => segment.text).join("\\n\\n").trim()');
    expect(adapter).toContain('answer.serve_state === "COMPONENTS_ONLY"');
  });

  it("verdictOfRecord picks the final verdict of a matching origin, ignores a non-matching origin, and falls back to the latest UNAVAILABLE", () => {
    const versions = new Map([[1, "same"], [2, "same"], [3, "different"]]);
    expect(originVersionOf(versions, 2)).toBe(1);
    expect(originVersionOf(versions, 3)).toBe(3);
    const records = [
      { resultId: "r1", attemptId: "a1", runId: "run", answerId: "answer", verdict: "UNAVAILABLE" as const, outcome: { verdict: "UNAVAILABLE" as const, categories: [] as const, failureCode: "DEADLINE" as const }, modelProviderRef: null, modelId: null, policyVersion: "v", callCount: 0 as const, checkedAt: new Date("2026-10-20T10:00:00Z"), answerVersion: 1, synthesisOriginVersion: 1, final: false },
      { resultId: "r2", attemptId: "a2", runId: "run", answerId: "answer", verdict: "FLAGGED" as const, outcome: { verdict: "FLAGGED" as const, categories: ["TERRORISM"] as const }, modelProviderRef: null, modelId: null, policyVersion: "v", callCount: 1 as const, checkedAt: new Date("2026-10-20T09:00:00Z"), answerVersion: 1, synthesisOriginVersion: 1, final: true },
      { resultId: "r3", attemptId: "a3", runId: "run", answerId: "answer", verdict: "UNAVAILABLE" as const, outcome: { verdict: "UNAVAILABLE" as const, categories: [] as const, failureCode: "DEADLINE" as const }, modelProviderRef: null, modelId: null, policyVersion: "v", callCount: 0 as const, checkedAt: new Date("2026-10-20T11:00:00Z"), answerVersion: 3, synthesisOriginVersion: 3, final: false }
    ];
    expect(verdictOfRecord(records, (origin) => origin === 1)).toEqual({
      verdict: "FLAGGED", categories: ["TERRORISM"], checkedAt: new Date("2026-10-20T09:00:00Z"),
      answerVersion: 1, synthesisOriginVersion: 1
    });
    expect(verdictOfRecord(records, (origin) => origin === 3)?.verdict).toBe("UNAVAILABLE");
    expect(verdictOfRecord(records, (origin) => origin === 4)).toBeNull();
  });

  it("readSynthesisTexts reads down from the newest version to the answer's first, which need not be 1", async () => {
    // Production stamps an answer's first version with its debate's register version; versions below it never exist.
    const reads: number[] = [];
    const texts = await readSynthesisTexts(7, async (version) => {
      reads.push(version);
      return version < 5 ? null : composed(version === 7 ? "changed" : "first");
    });
    expect(reads).toEqual([7, 6, 5, 4]);
    expect([...texts!]).toEqual([[5, "first"], [6, "first"], [7, "changed"]]);
    expect(originVersionOf(texts!, 6)).toBe(5);
    expect([...(await readSynthesisTexts(1, async () => composed("only")))!]).toEqual([[1, "only"]]);
  });

  it("readSynthesisTexts is null when the newest version itself does not read", async () => {
    expect(await readSynthesisTexts(3, async (version) => version === 3 ? null : composed("older"))).toBeNull();
  });
});
