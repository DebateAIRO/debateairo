import { describe, expect, it } from "vitest";
import { argumentLanguageDirective, questionLanguageSentence } from "@debateai/kernel";
import { stripLanguageDirectiveForTest } from "../support/preview-gate-stubs.js";

// Pre-flight PF-L51 (BLOCKER): the strip pattern is the WHOLE directive in each form, both sentences, because the second
// sentence names "fatalFlags[].type" and would send every review and checker call to PANEL if it stayed. So the inputs
// are the real directives, never hand-written first sentences.
describe("the test doubles read all three language forms", () => {
  it("strips today's named form, today's fallback form, and the locked sentence, whole", () => {
    for (const text of [argumentLanguageDirective("English"), argumentLanguageDirective("Romanian"), argumentLanguageDirective(""),
      questionLanguageSentence({ code: "en", name: "English" }),
      questionLanguageSentence({ code: "sr-Latn", name: "Serbian (Latin script)" })]) {
      const stripped = stripLanguageDirectiveForTest(`Instruction. ${text}`);
      expect(stripped.trim()).toBe("Instruction.");
      expect(stripped).not.toContain("fatalFlags");
    }
  });
});

/**
 * P2L Task 17 — THE RUNNER'S WIRING, read off its source (CI skips the integration suites that argue a shaped run, so
 * this is the gate that sees a call site lose the lock). Binding note 3: root 0's room gets the lock in the SAME change
 * as the judge inputs (else the room under-counts every attempt by the sentence and the field).
 */
describe("the runner passes a shaped run's lock to every call site", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
  const declared = source.indexOf("const shapeLanguage: QuestionLanguage | null = shapeRun === null ? null");

  it("decides the lock by the shape receipt, before the map stage sizes root 0's room", () => {
    expect(declared).toBeGreaterThan(source.indexOf("const shapeRun = "));
    expect(source.slice(declared, declared + 200)).toContain(": questionLanguageFromRun(run.argumentLanguageTag, run.argumentLanguageName);");
    const room = source.indexOf("rootZeroKeepRoomMicros({ prices: rootZeroPrices, ...rootZeroRoomAttempts({");
    expect(room).toBeGreaterThan(declared);
    expect(source.slice(room, source.indexOf("}) });", room))).toContain("questionLanguage: shapeLanguage");
  });

  it("every judge input (panel, root, child leg, review) and root 0's room carry it, in one change", () => {
    const sites = [...source.matchAll(/argumentLanguageName: run\.argumentLanguageName,(\s*\.\.\.shapeLanguageInput,| questionLanguage: shapeLanguage,)?/gu)]
      .filter((match) => match.index > declared);
    expect(sites).toHaveLength(5);
    for (const site of sites) expect(site[1]).toBeDefined();
  });

  it("the writer, the checker, both readings and the story carry it", () => {
    expect(source).toContain("shapeRun === null ? null : shapeRun.shape.answerWords,\n          shapeLanguage);");
    expect(source).toContain("buildSynthesisRolePrompt(request, run.argumentLanguageName, undefined, null, shapeLanguage);");
    expect(source).toContain("questionLine: run.questionLine,\n          ...shapeLanguageInput\n        }, reply));");
    expect(source).toContain("classifyEvaluatorContent(content, reply, run.questionLine, shapeLanguage)");
    expect(source).toContain("languageLocked: shapeLanguage !== null,");
  });
});
