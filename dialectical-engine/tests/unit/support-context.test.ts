import { describe, expect, it } from "vitest";

import { SUPPORT_CAPABILITIES } from "../../packages/support-kb/src/catalog.js";
import { buildSupportKnowledgeContext } from "../../packages/support-kb/src/context.js";
import type { HelpCorpusEntry } from "../../packages/support-kb/src/index.js";

function entry(
  id: string,
  lang: "en" | "ro",
  title: string,
  body: string,
): HelpCorpusEntry {
  return Object.freeze({
    id,
    lang,
    title,
    status: "shipped",
    sources: Object.freeze(["packages/private/source.ts:42"]),
    verifiedAgainst: "private-commit",
    ratifiedBy: "",
    ratifiedOn: "",
    body,
  });
}

describe("Support knowledge context", () => {
  const entries = [
    entry("creation", "en", "Create a debate", "Open the new debate page and choose the plan controls."),
    entry("creation", "ro", "Creează o dezbatere", "Deschide pagina pentru o dezbatere nouă și alege controalele planului."),
    entry("export", "en", "Export an answer", "A completed owner answer can be downloaded as JSON when its ledger digest is readable."),
    entry("export", "ro", "Exportă un răspuns", "Un răspuns finalizat poate fi descărcat ca JSON când rezumatul registrului poate fi citit."),
  ] as const;

  it("always includes the complete compact policy and capability catalog", () => {
    // Property: lexical article selection cannot erase product limitations or credential boundaries.
    const result = buildSupportKnowledgeContext({
      entries,
      capabilities: SUPPORT_CAPABILITIES,
      language: "en",
      query: "unrelated greeting",
      historyText: "",
      maxCodePoints: 24_000,
    });

    for (const capability of SUPPORT_CAPABILITIES) {
      expect(result.text).toContain(capability.labels.en);
    }
    expect(result.text).toContain("Never request, receive, repeat, or submit credentials or security codes");
  });

  it("selects newly reviewed knowledge lexically without a hard-coded intent list", () => {
    // Property: article reachability follows its own current words rather than a separately edited regex gate.
    const result = buildSupportKnowledgeContext({
      entries,
      capabilities: SUPPORT_CAPABILITIES,
      language: "en",
      query: "Can I download the ledger result as JSON?",
      historyText: "",
      maxCodePoints: 24_000,
    });

    expect(result.sourceIds).toEqual(["export"]);
    expect(result.text).toContain("A completed owner answer can be downloaded as JSON");
    expect(result.text).not.toContain("packages/private/source.ts");
    expect(result.text).not.toContain("private-commit");
  });

  it("uses only the selected language and preserves Romanian visitor text", () => {
    // Property: one language request cannot leak the other language's article body.
    const result = buildSupportKnowledgeContext({
      entries,
      capabilities: SUPPORT_CAPABILITIES,
      language: "ro",
      query: "Cum descarc răspunsul JSON?",
      historyText: "",
      maxCodePoints: 24_000,
    });

    expect(result.sourceIds).toEqual(["export"]);
    expect(result.text).toContain("Un răspuns finalizat poate fi descărcat ca JSON");
    expect(result.text).not.toContain("A completed owner answer");
  });

  it("adds article sections whole and skips a section that would cross the cap", () => {
    // Property: a size bound never truncates reviewed prose into a misleading fragment.
    const short = entry("short", "en", "Short export note", "JSON is available.");
    const longBody = `distinct-long-marker ${"x".repeat(2_000)} final-marker`;
    const long = entry("long", "en", "Long export note", longBody);
    const base = buildSupportKnowledgeContext({
      entries: [],
      capabilities: SUPPORT_CAPABILITIES,
      language: "en",
      query: "export",
      historyText: "",
      maxCodePoints: 24_000,
    });

    const result = buildSupportKnowledgeContext({
      entries: [short, long],
      capabilities: SUPPORT_CAPABILITIES,
      language: "en",
      query: "export note distinct long marker",
      historyText: "",
      maxCodePoints: base.text.length + 120,
    });

    expect(result.sourceIds).toEqual(["short"]);
    expect(result.text).toContain("JSON is available.");
    expect(result.text).not.toContain("distinct-long-marker");
    expect(result.text).not.toContain("final-marker");
  });

  it("caps selected sources and requested actions at three", () => {
    // Property: lexical matches cannot expand the untrusted drafting surface without bound.
    const manyEntries = Array.from({ length: 5 }, (_, index) =>
      entry(`export-${index}`, "en", `Export JSON ${index}`, `Export JSON article ${index}.`));
    const result = buildSupportKnowledgeContext({
      entries: manyEntries,
      capabilities: SUPPORT_CAPABILITIES,
      language: "en",
      query: "export JSON debate settings public help",
      historyText: "",
      maxCodePoints: 24_000,
    });

    expect(result.sourceIds).toHaveLength(3);
    expect(result.requestedActionIds.length).toBeLessThanOrEqual(3);
    expect(Object.isFrozen(result.sourceIds)).toBe(true);
    expect(Object.isFrozen(result.requestedActionIds)).toBe(true);
  });
});
