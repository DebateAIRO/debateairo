import { describe, expect, it } from "vitest";

import { SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES } from "../../packages/support-kb/src/catalog.js";
import { buildSupportKnowledgeContext as buildContext } from "../../packages/support-kb/src/context.js";
import type { HelpCorpusEntry } from "../../packages/support-kb/src/index.js";

type ContextInput = Parameters<typeof buildContext>[0];
function buildSupportKnowledgeContext(
  input: Omit<ContextInput,"referenceFor"> & Partial<Pick<ContextInput,"referenceFor">>
) {
  return buildContext({
    ...input,
    referenceFor: input.referenceFor ?? ((kind,index) =>
      `${kind === "source" ? "s" : "a"}-10000000000040008000000000000001-${index + 1}`)
  });
}

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
      availableActionIds: SUPPORT_ACTION_IDS,
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
      availableActionIds: SUPPORT_ACTION_IDS,
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
      availableActionIds: SUPPORT_ACTION_IDS,
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
      availableActionIds: SUPPORT_ACTION_IDS,
      language: "en",
      query: "export",
      historyText: "",
      maxCodePoints: 24_000,
    });

    const result = buildSupportKnowledgeContext({
      entries: [short, long],
      capabilities: SUPPORT_CAPABILITIES,
      availableActionIds: SUPPORT_ACTION_IDS,
      language: "en",
      query: "export note distinct long marker",
      historyText: "",
      maxCodePoints: base.text.length + 200,
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
      availableActionIds: SUPPORT_ACTION_IDS,
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

  it.each(SUPPORT_CAPABILITIES.flatMap((capability) =>
    capability.articleIds.length === 0 ? [] : (["en","ro"] as const).map((language) => ({
      capability,language,
      query: `${capability.labels[language]} ${capability.searchTerms[language].join(" ")}`
    }))))(
    "keeps reviewed capability articles reachable for $capability.id in $language",
    ({ capability,language,query }) => {
      const articleIds = [...new Set(SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds))];
      const capabilityEntries = articleIds.map((id) => entry(
        id,language,`Reference ${id}`,"Reviewed product behavior and limitations."
      ));

      const result = buildSupportKnowledgeContext({
        entries: capabilityEntries,
        capabilities: SUPPORT_CAPABILITIES,
        availableActionIds: SUPPORT_ACTION_IDS,
        language,
        query,
        historyText: "",
        maxCodePoints: 24_000,
      });

      expect(result.sourceIds).toEqual(expect.arrayContaining(capability.articleIds.slice(0,3)));
      expect(result.sourceIds.length).toBeLessThanOrEqual(3);
    }
  );

  it("states the exact bounded source and action sets in the final output contract", () => {
    const result = buildSupportKnowledgeContext({
      entries,
      capabilities: SUPPORT_CAPABILITIES,
      availableActionIds: SUPPORT_ACTION_IDS,
      language: "en",
      query: "download the ledger result as JSON",
      historyText: "",
      maxCodePoints: 24_000,
    });

    expect(result.text).toContain("OUTPUT CONTRACT");
    expect(result.text).toContain(`sourceIds=${result.sourceReferences.map(({ reference }) => reference).join(",")}`);
    expect(result.text).toContain(`actionIds=${result.actionReferences.map(({ reference }) => reference).join(",") || "none"}`);
    expect(result.sourceIds).toHaveLength(1);
  });

  it.each([
    ["en" as const,"How do I create a debate?"],
    ["ro" as const,"Cum creez o dezbatere?"],
  ])("matches ordinary inflected creation language in %s", (language,query) => {
    const result = buildSupportKnowledgeContext({
      entries: [
        entry("getting-started-debate",language,"Start reference","Reviewed creation requirements."),
        entry("browse-public-debates",language,"Browse reference","Reviewed public browsing behavior."),
        entry("view-public-debate",language,"Public reference","Reviewed public viewing behavior."),
      ],
      capabilities: SUPPORT_CAPABILITIES,
      availableActionIds: SUPPORT_ACTION_IDS,
      language,
      query,
      historyText: "",
      maxCodePoints: 24_000,
    });

    expect(result.sourceIds[0]).toBe("getting-started-debate");
    expect(result.requestedActionIds).toEqual(["start-debate"]);
  });

  it("advertises only action ids resolved by the trusted caller before generation", () => {
    const result = buildSupportKnowledgeContext({
      entries: [entry(
        "export-json","ro","Exportă un răspuns",
        "Exportul este disponibil după un răspuns servit și un registru lizibil."
      )],
      capabilities: SUPPORT_CAPABILITIES,
      language: "ro",
      query: "Cum funcționează exportul JSON?",
      historyText: "",
      maxCodePoints: 24_000,
      availableActionIds: ["home","sign-in"],
    });

    expect(result.requestedActionIds).toEqual([]);
    expect(result.text).toContain("- Spațiul de lucru al proprietarului");
    expect(result.text).toContain("disponibilă numai într-un context verificat de proprietar | actions=none");
    expect(result.text).toContain("actionIds=none");
  });

  it("projects only request-local references and human labels to the model", () => {
    const result = buildSupportKnowledgeContext({
      entries: [entry(
        "getting-started-debate","en","Start a debate",
        "Choose the topic and plan controls before starting."
      )],
      capabilities: SUPPORT_CAPABILITIES,
      language: "en",query: "How do I create a debate?",historyText: "",
      maxCodePoints: 24_000,availableActionIds: SUPPORT_ACTION_IDS,
      referenceFor: (kind: "source" | "action",index: number) =>
        `${kind === "source" ? "s" : "a"}-10000000000040008000000000000001-${index + 1}`
    } as never);

    expect(result).toMatchObject({
      sourceIds: ["getting-started-debate"],requestedActionIds: ["start-debate"],
      sourceReferences: [{
        reference: "s-10000000000040008000000000000001-1",
        canonicalId: "getting-started-debate"
      }],
      actionReferences: [{
        reference: "a-10000000000040008000000000000001-1",
        canonicalId: "start-debate"
      }]
    });
    expect(result.text).toContain("SOURCE s-10000000000040008000000000000001-1");
    expect(result.text).toContain("actionIds=a-10000000000040008000000000000001-1");
    for (const forbidden of ["getting-started-debate","start-debate","new-debate","/new","route="]) {
      expect(result.text).not.toContain(forbidden);
    }
    expect(result.text).toContain("Create a debate with plan controls");
    expect(result.text).toContain("Start a debate");
    expect(result.text).toContain("signed-in visitors");
  });
});
