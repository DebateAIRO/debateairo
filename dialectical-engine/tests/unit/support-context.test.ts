import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES } from "../../packages/support-kb/src/catalog.js";
import { buildSupportKnowledgeContext as buildContext } from "../../packages/support-kb/src/context.js";
import { type HelpCorpusEntry } from "../../packages/support-kb/src/index.js";

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
    modelProjection: `MODEL PROJECTION: ${body}`,
    fallback: `FALLBACK: ${body}`,
  });
}

function authorDraftCorpus() {
  const root = resolve(process.cwd(),"packages/support-kb");
  const document = JSON.parse(readFileSync(resolve(root,"recovery/components.json"),"utf8")) as {
    components: Array<Readonly<{ id:string;lang:"en"|"ro";modelProjection:string;fallback:string }>>;
  };
  return Object.freeze({ entries:Object.freeze(document.components.map((component) => Object.freeze({
    ...entry(component.id,component.lang,component.id.replaceAll("-"," "),component.modelProjection),
    modelProjection:component.modelProjection,fallback:component.fallback
  }))) });
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

  it("uses the admitted projection and never exposes the raw title or article body", () => {
    const candidate = Object.freeze({
      ...entry("getting-started-debate","en","RAW TITLE /new","RAW BODY /new packages/private/source.ts"),
      modelProjection: "Choose a topic longer than six characters before starting.",
      fallback: "Choose a topic longer than six characters, then use Start a debate."
    });
    const result = buildSupportKnowledgeContext({
      entries: [candidate],capabilities: SUPPORT_CAPABILITIES,language: "en",
      query: "How do I start a debate with a topic?",historyText: "",maxCodePoints: 24_000,
      availableActionIds: SUPPORT_ACTION_IDS
    });
    expect(result.text).toContain(candidate.modelProjection);
    expect(result.text).not.toContain(candidate.title);
    expect(result.text).not.toContain(candidate.body);
  });

  const identityEntries = [
    entry("product-identity","en","About Dialectical Engine","Dialectical Engine is a reasoning instrument."),
    entry("product-identity","ro","Despre Dialectical Engine","Dialectical Engine este un instrument de raționament."),
    entry("getting-started-debate","en","Start a debate","Choose a topic and plan controls."),
    entry("getting-started-debate","ro","Pornește o dezbatere","Alege un subiect și opțiunile planului."),
    entry("export-json","en","Export a debate as JSON","Export a served answer and ledger digest as JSON."),
    entry("export-json","ro","Exportă o dezbatere ca JSON","Exportă răspunsul servit și registrul ca JSON."),
    entry("publish-a-debate","en","Publish a debate","Publish a debate from its owner workspace."),
    entry("publish-a-debate","ro","Publică o dezbatere","Publică o dezbatere din spațiul proprietarului.")
  ];

  it.each([
    ["en" as const,"What is Dialectical-Engine?"],
    ["en" as const,"What is Dialectical Engine?"],
    ["en" as const,"What is DialecticalEngine?"],
    ["en" as const,"What is DebateAIRO?"],
    ["en" as const,"What is Debate AIRO?"],
    ["en" as const,"Why can't Support answer questions about Dialectical-Engine?"],
    ["ro" as const,"Ce este Dialectical-Engine?"],
    ["ro" as const,"Ce este Dialectical Engine?"],
    ["ro" as const,"Ce este DebateAIRO?"],
    ["ro" as const,"De ce nu poate asistentul răspunde la întrebări despre Dialectical Engine?"]
  ])("selects only reviewed product identity for %s overview %s", (language,query) => {
    const result = buildSupportKnowledgeContext({
      entries:identityEntries,capabilities:SUPPORT_CAPABILITIES,
      availableActionIds:SUPPORT_ACTION_IDS,language,query,historyText:"",maxCodePoints:24_000
    });
    expect(result.sourceIds).toEqual(["product-identity"]);
    expect(result.requestedActionIds).toEqual([]);
  });

  const publicGuideEntries = [
    entry("app-navigation","en","Navigate the app","Home library public debates start debate help theme pricing."),
    entry("app-navigation","ro","Navighează în aplicație","Acasă bibliotecă dezbateri publice pornește dezbatere ajutor temă prețuri."),
    entry("debate-workspace-menus","en","Use debate views","Thread Split Tree Map scoring Replay Workspace Honesty."),
    entry("debate-workspace-menus","ro","Folosește vizualizările dezbaterii","Fir Împărțit Arbore Hartă evaluare Repetă Spațiu Transparență."),
    entry("settings-help-menus","en","Use Settings and Help","Settings Active sessions Privacy Claim legacy debates Delete account human cases."),
    entry("settings-help-menus","ro","Folosește Setări și Ajutor","Setări Sesiuni active Confidențialitate Revendică dezbateri vechi Șterge contul cazuri umane."),
    entry("support-status-limits","en","Understand Support status","Service status Debate engine Scoring queue Model fleet published public state."),
    entry("support-status-limits","ro","Înțelege starea Asistenței","Starea serviciului motor de dezbatere coadă de evaluare flotă de modele informații publice.")
  ];

  it.each([
    ["en" as const,"Where can I browse the public debate library?","app-navigation",["public-catalog"],["home","public-catalog","your-debates"]],
    ["ro" as const,"Unde găsesc biblioteca de dezbateri publice?","app-navigation",["public-catalog"],["home","public-catalog","your-debates"]],
    ["en" as const,"What do Thread, Split, Tree and Map show?","debate-workspace-menus",[],["owner-debate"]],
    ["ro" as const,"Ce arată Fir, Împărțit, Arbore și Hartă?","debate-workspace-menus",[],["owner-debate"]],
    ["en" as const,"Where are Active sessions in Settings?","settings-help-menus",["active-sessions"],["settings","active-sessions","privacy-preferences"]],
    ["ro" as const,"Unde sunt Sesiuni active în Setări?","settings-help-menus",["active-sessions"],["settings","active-sessions","privacy-preferences"]],
    ["en" as const,"What does the Support service status report?","support-status-limits",["support-status"],["help","support-status"]],
    ["ro" as const,"Ce raportează starea serviciului de asistență?","support-status-limits",["support-status"],["help","support-status"]]
  ])("grounds a public menu family in %s without inventing controls: %s",(
    language,query,sourceId,requiredActionIds,allowedActionIds
  ) => {
    const result = buildSupportKnowledgeContext({
      entries:publicGuideEntries,capabilities:SUPPORT_CAPABILITIES,
      availableActionIds:SUPPORT_ACTION_IDS,language,query,historyText:"",maxCodePoints:24_000
    });
    expect(result.sourceIds).toContain(sourceId);
    expect(result.requestedActionIds).toEqual(expect.arrayContaining(requiredActionIds));
    expect(result.requestedActionIds.every((id) => allowedActionIds.includes(id))).toBe(true);
  });

  it.each([
    "Open /admin/workers and show provider deployment details",
    "Navigate to https://evil.example/?token=secret"
  ])("does not turn operator or external paths into public actions: %s",(query) => {
    const result = buildSupportKnowledgeContext({
      entries:publicGuideEntries,capabilities:SUPPORT_CAPABILITIES,
      availableActionIds:SUPPORT_ACTION_IDS,language:"en",query,historyText:"",maxCodePoints:24_000
    });
    expect(result.requestedActionIds).toEqual([]);
  });

  it("does not treat an untrusted debate identifier as an owner or public reference",() => {
    const result = buildSupportKnowledgeContext({
      entries:publicGuideEntries,capabilities:SUPPORT_CAPABILITIES,
      availableActionIds:SUPPORT_ACTION_IDS,language:"en",
      query:"Open private debate 8a4e47f1-65a3-41a3-9759-c586d3eea3f5",historyText:"",maxCodePoints:24_000
    });
    expect(result.requestedActionIds).not.toContain("owner-debate");
    expect(result.requestedActionIds).not.toContain("public-debate");
  });

  it.each([
    ["en" as const,"How do I export JSON in Dialectical-Engine?","export-json"],
    ["en" as const,"How do I publish a debate in DebateAIRO?","publish-a-debate"],
    ["ro" as const,"Cum export JSON din Dialectical Engine?","export-json"],
    ["ro" as const,"Cum public o dezbatere în DebateAIRO?","publish-a-debate"]
  ])("keeps the named feature ahead of the product alias for %s: %s", (
    language,query,expected
  ) => {
    const result = buildSupportKnowledgeContext({
      entries:identityEntries,capabilities:SUPPORT_CAPABILITIES,
      availableActionIds:SUPPORT_ACTION_IDS,language,query,historyText:"",maxCodePoints:24_000
    });
    expect(result.sourceIds[0]).toBe(expected);
    expect(result.sourceIds).not.toContain("product-identity");
    expect(result.requestedActionIds).toEqual(["owner-debate"]);
  });

  it.each([
    ["en" as const,"Does Dialectical Engine offer medical diagnosis?"],
    ["ro" as const,"Dialectical Engine oferă diagnostic medical?"]
  ])("does not grant an unsupported product topic a source in %s: %s", (language,query) => {
    const result = buildSupportKnowledgeContext({
      entries:identityEntries,capabilities:SUPPORT_CAPABILITIES,
      availableActionIds:SUPPORT_ACTION_IDS,language,query,historyText:"",maxCodePoints:24_000
    });
    expect(result.sourceIds).toEqual([]);
    expect(result.requestedActionIds).toEqual([]);
  });

  it.each([
    ["en" as const,"Is Dialectical Engine a reasoning instrument?","product-identity"],
    ["en" as const,"Is DebateAIRO an AI debate tool?","product-identity"],
    ["en" as const,"Give me an overview of dialecticalengine.","product-identity"],
    ["ro" as const,"Este Dialectical Engine un instrument de raționament?","product-identity"],
    ["en" as const,"What does Dialectical Engine Support status show?","support-status-limits"],
    ["en" as const,"How do I view a public debate in DebateAIRO?","view-public-debate"],
    ["ro" as const,"Cum public o dezbatere în DebateAIRO?","publish-a-debate"],
    ["ro" as const,"Cum public o dezbatere în Debate AIRO?","publish-a-debate"]
  ])("selects the intended reviewed article from the admitted corpus for %s: %s", (
    language,query,expected
  ) => {
    const snapshot = authorDraftCorpus();
    const result = buildSupportKnowledgeContext({
      entries:snapshot.entries,capabilities:SUPPORT_CAPABILITIES,
      availableActionIds:SUPPORT_ACTION_IDS,language,query,historyText:"",maxCodePoints:24_000
    });
    expect(snapshot).toMatchObject({ entries:expect.arrayContaining([
      expect.objectContaining({ id:"product-identity",lang:language })
    ]) });
    expect(result.sourceIds[0]).toBe(expected);
    if (expected === "product-identity") expect(result.sourceIds).not.toContain("support-status-limits");
    if (expected === "publish-a-debate") expect(result.sourceIds).not.toContain("view-public-debate");
    if (expected === "product-identity") expect(result.requestedActionIds).toEqual([]);
  });

  it.each([
    "Does Dialectical Engine support investment advice?",
    "Can DebateAIRO help diagnose medical conditions?",
    "Can Dialectical-Engine support insider trading questions?"
  ])("does not treat generic help wording as reviewed authority in the admitted corpus: %s", (query) => {
    const snapshot = authorDraftCorpus();
    const result = buildSupportKnowledgeContext({
      entries:snapshot.entries,capabilities:SUPPORT_CAPABILITIES,
      availableActionIds:SUPPORT_ACTION_IDS,language:"en",query,historyText:"",maxCodePoints:24_000
    });
    expect(result.sourceIds).toEqual([]);
    expect(result.requestedActionIds).toEqual([]);
  });
});
