import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it,vi } from "vitest";

import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import type { SupportModelPort } from "../../apps/api/src/support/model.js";
import {
  createHelpCorpusSnapshotLookup,loadHelpCorpus,type HelpCorpusEntry,type LoadedHelpCorpus
} from "../../packages/support-kb/src/index.js";
import { SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES } from "../../packages/support-kb/src/catalog.js";
import { buildSupportKnowledgeContext } from "../../packages/support-kb/src/context.js";
import { resolveSupportActions } from "../../packages/support-kb/src/navigation.js";
import type { SupportMessageCipherPort } from "../../apps/api/src/support/session.js";
import { createSupportModelReferenceFactory } from "../../apps/api/src/support/model-references.js";

const REFERENCE_REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_REFERENCE = "s-10000000000040008000000000000001-1";
const SECOND_SOURCE_REFERENCE = "s-10000000000040008000000000000001-2";
const ACTION_REFERENCE = "a-10000000000040008000000000000001-1";
const SECOND_ACTION_REFERENCE = "a-10000000000040008000000000000001-2";
const modelReferenceFactory = () => createSupportModelReferenceFactory(REFERENCE_REQUEST_ID);

function entry(id: string,body: string): HelpCorpusEntry {
  return Object.freeze({
    id,lang: "en",title: "Crosscap article",status: "shipped",
    sources: Object.freeze(["fixture"]),verifiedAgainst: "fixture",
    ratifiedBy: "V",ratifiedOn: "2026-09-01",body,
    modelProjection: body,fallback: "Use the reviewed guidance for this topic."
  });
}

function corpus(entries: readonly HelpCorpusEntry[],kbVersion: string): LoadedHelpCorpus {
  return Object.freeze({ entries: Object.freeze([...entries]),kbVersion }) as LoadedHelpCorpus;
}

function authorDraftCorpus(): LoadedHelpCorpus {
  const root = resolve(process.cwd(),"packages/support-kb");
  const document = JSON.parse(readFileSync(resolve(root,"recovery/components.json"),"utf8")) as {
    components: Array<Readonly<{ id:string;lang:"en"|"ro";modelProjection:string;fallback:string }>>;
  };
  return corpus(document.components.map((component) => Object.freeze({
    ...entry(component.id,component.modelProjection),lang:component.lang,
    title:component.id.replaceAll("-"," "),modelProjection:component.modelProjection,
    fallback:component.fallback,ratifiedBy:"",ratifiedOn:""
  })),"author-draft-corpus");
}

function productionReviewedCorpus(): LoadedHelpCorpus {
  const root = resolve(process.cwd(),"packages/support-kb");
  return loadHelpCorpus(resolve(root,"content"),{
    reviewManifest:JSON.parse(readFileSync(resolve(root,"reviews/manifest.json"),"utf8")) as unknown,
    recoveryComponents:readFileSync(resolve(root,"recovery/components.json")),
    requireReviewedRecovery:true
  });
}

const messages = Object.freeze({
  write: vi.fn(async (input) => Object.freeze({ ...input,redacted: false })),
  writeAndTransit: vi.fn(async (input,transit) => {
    await transit(input.text);
    return Object.freeze({ ...input,redacted: false });
  }),read: vi.fn(async () => null),listSession: vi.fn(async () => [])
}) as unknown as SupportMessageCipherPort;

function request(snapshot: LoadedHelpCorpus) {
  return {
    sessionId: "10000000-0000-4000-8000-000000000001",
    text: "crosscap",
    language: "en" as const,detectedLanguage: "en" as const,overrideLanguage: null,
    modelRef: "support-fixture",kbVersion: snapshot.kbVersion,snapshot,signedIn: false,
    receivedAt: new Date("2026-09-14T10:00:00.000Z")
  };
}

describe("CP1 composed answer context", () => {
  it.each([
    "What is Dialectical-Engine?",
    "What is Dialectical Engine?",
    "What is DebateAIRO?",
    "What is Debate AIRO?",
    "Why can't Support answer questions about Dialectical-Engine?"
  ])("grounds a product identity variant only in the identity article: %s", async (text) => {
    const identity = entry("product-identity","Dialectical Engine is a reasoning instrument for structured AI debates.");
    const unrelated = entry("support-status-limits","Support status can be stale.");
    const snapshot = corpus([identity,unrelated],"1".repeat(64));
    const complete = vi.fn(async () => Object.freeze({ text: JSON.stringify({
      kind:"answer",text:"Dialectical Engine is a reasoning instrument for structured AI debates.",
      sourceIds:[SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T12:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({ ...request(snapshot),text });

    expect(complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",sources:[{ id:"product-identity" }],actions:[]
    });
  });

  it("grounds the Romanian identity surface in the Romanian identity article", async () => {
    const identity = Object.freeze({
      ...entry("product-identity","Dialectical Engine este un instrument de raționament."),
      lang:"ro" as const,title:"Despre Dialectical Engine"
    });
    const snapshot = corpus([identity],"3".repeat(64));
    const complete = vi.fn(async () => Object.freeze({ text: JSON.stringify({
      kind:"answer",text:"Dialectical Engine este un instrument de raționament.",
      sourceIds:[SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T12:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text:"Ce este Dialectical-Engine?",
      language:"ro",detectedLanguage:"ro"
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",sources:[{ id:"product-identity" }],actions:[]
    });
  });

  it.each([
    "Does Dialectical Engine offer medical diagnosis?",
    "Does DebateAIRO provide investment advice?"
  ])("keeps an unsupported branded topic at NO_SOURCE without a model call: %s", async (text) => {
    const snapshot = corpus([
      entry("product-identity","Dialectical Engine is a reasoning instrument for structured AI debates."),
      entry("account-settings","Settings contains account controls.")
    ],"2".repeat(64));
    const complete = vi.fn();
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T12:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({ ...request(snapshot),text });

    expect(result).toMatchObject({ outcome:"NO_SOURCE",sources:[],actions:[] });
    expect(complete).not.toHaveBeenCalled();
  });

  it("grounds a Settings menu question and returns only the server-resolved section action", async () => {
    const guide = entry(
      "settings-help-menus",
      "Settings contains Active sessions, Privacy, Claim legacy debates, and Delete account."
    );
    const snapshot = corpus([guide],"5".repeat(64));
    const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",text:"Open Active sessions in Settings.",
      sourceIds:[SOURCE_REFERENCE],actionIds:[SECOND_ACTION_REFERENCE]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T13:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),signedIn:true,text:"Where are Active sessions in Settings?"
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",sources:[{ id:"settings-help-menus" }],
      actions:[{ id:"active-sessions",href:"/settings#active-sessions-heading" }]
    });
  });

  it("repairs omitted visible Account authority through the actual answer boundary",async () => {
    const snapshot = corpus([
      Object.freeze({
        ...entry("settings-help-menus","Account Settings Active sessions Privacy Claim legacy debates Delete account."),
        lang:"ro" as const
      }),
      Object.freeze({
        ...entry("app-navigation","Account deschide pagina de setări a contului autentificat."),
        lang:"ro" as const
      })
    ],"account-authority");
    const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",
      text:"Account deschide setările contului autentificat. De acolo poți gestiona sesiunile active prin Active sessions (examinare sau revocare), preferințele cookie prin Privacy, revendica dezbateri vechi prin Claim legacy debates și programa sau anula ștergerea contului prin Delete account.",
      sourceIds:[SECOND_SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-20T19:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text:"Account",language:"ro",detectedLanguage:"ro",signedIn:true
    });

    expect(result).toMatchObject({ outcome:"ANSWER_GROUNDED",actions:[] });
    expect(result.sources?.map(({ id }) => id)).toEqual([
      "settings-help-menus","app-navigation"
    ]);
  });

  it("rejects unsupported destination promises through the actual answer boundary",async () => {
    const snapshot = corpus([
      Object.freeze({ ...entry("support-status-limits","Starea publică a serviciului și limitele Asistenței."),lang:"ro" as const }),
      Object.freeze({ ...entry("unsupported-capabilities","Acțiuni indisponibile și limitări."),lang:"ro" as const }),
      Object.freeze({ ...entry("public-answer-disclosure","Limitele unui răspuns publicat."),lang:"ro" as const })
    ],"destination-authority");
    const badText = "Asistența te poate ghida către pagina principală, biblioteca de dezbateri, autentificare, creearea unui cont sau centrul de ajutor, în funcție de contextul tău de autentificare.";
    const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",text:badText,
      sourceIds:[SOURCE_REFERENCE,SECOND_SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-20T19:10:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text:"La ce poate răspunde Asistența și care sunt limitele ei?",
      language:"ro",detectedLanguage:"ro"
    });

    expect(result).toMatchObject({ outcome:"ANSWER_GROUNDED",actions:[] });
    expect(result.text).not.toBe(badText);
    expect(result.sources).toHaveLength(1);
  });

  it.each([
    ["en" as const,false,"Where is Home?","Support can guide you to Home.","app-navigation",["home"]],
    ["ro" as const,false,"Unde este Acasă?","Asistența te poate ghida către Acasă.","app-navigation",["home"]],
    ["en" as const,false,"Where is Help?","Support can guide you to Help.","app-navigation",["help"]],
    ["ro" as const,false,"Unde este Ajutor?","Asistența te poate ghida către Ajutor.","app-navigation",["help"]],
    ["en" as const,true,"Where are Active sessions?","Support can guide you to Active sessions.","settings-help-menus",["active-sessions"]],
    ["ro" as const,true,"Unde sunt Sesiunile active?","Asistența te poate ghida către Sesiuni active.","settings-help-menus",["active-sessions"]],
    ["en" as const,false,"Where can I Sign in or Create account?","Support can guide you to Sign in or Create account.","account-access",["sign-in","sign-up"]],
    ["ro" as const,false,"Unde sunt Autentificare și Creează un cont?","Asistența te poate ghida către Autentificare sau Creează un cont.","account-access",["sign-in","sign-up"]],
    ["en" as const,false,"Where can I sign in?","Support can guide you to Sign in.","account-access",["sign-in"]],
    ["ro" as const,false,"Unde îmi pot crea un cont?","Asistența te poate ghida către Creează un cont.","account-access",["sign-up"]]
  ])("binds a canonical %s destination promise through the actual answer service: %s",async (
    language,signedIn,query,answerText,sourceId,actionIds
  ) => {
    const snapshot = productionReviewedCorpus();
    expect(snapshot.entries).toHaveLength(44);
    const availableActionIds = resolveSupportActions(SUPPORT_ACTION_IDS,{ signedIn,language })
      .map(({ id }) => id);
    const context = buildSupportKnowledgeContext({
      entries:snapshot.entries,capabilities:SUPPORT_CAPABILITIES,language,
      query,historyText:"",maxCodePoints:24_000,availableActionIds,
      referenceFor:modelReferenceFactory().referenceFor
    });
    const sourceReferences = new Map(context.sourceReferences.map(({ canonicalId,reference }) =>
      [canonicalId,reference]
    ));
    const actionReferences = new Map(context.actionReferences.map(({ canonicalId,reference }) =>
      [canonicalId,reference]
    ));
    const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",text:answerText,
      sourceIds:[sourceReferences.get(sourceId)!],
      actionIds:actionIds.map((id) => actionReferences.get(
        id as (typeof SUPPORT_ACTION_IDS)[number]
      )!)
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-20T19:15:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text:query,language,detectedLanguage:language,signedIn
    });

    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",text:answerText,sources:[{ id:sourceId }],
      actions:actionIds.map((id) => ({ id }))
    });
  });

  it("rejects human-case and email conflation through the actual answer boundary",async () => {
    const supportCase = Object.freeze({
      ...entry("support-cases","Cazul uman folosește escaladarea; emailul este separat."),
      lang:"ro" as const
    });
    const snapshot = corpus([supportCase],"case-email-authority");
    const badText = "Un caz de asistență umană se creează separat, prin opțiunea de escaladare către o persoană sau prin fluxul de email de asistență — este un caz asincron, nu un apel telefonic.";
    const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",text:badText,sourceIds:[SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-20T19:20:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text:"Care este diferența dintre acest ghid public și un caz de asistență umană?",
      language:"ro",detectedLanguage:"ro"
    });

    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",text:supportCase.fallback,
      sources:[{ id:"support-cases" }],actions:[]
    });
  });

  it.each([
    ["en" as const,"Escalation creates the human case, while support email is a separate mail workflow.",false],
    ["ro" as const,"Escaladarea creează cazul uman, iar emailul este un flux separat.",false],
    ["en" as const,"Email support creates the human case and receives its private case link.",true],
    ["ro" as const,"Emailul de asistență creează cazul uman și primește legătura privată.",true]
  ])("enforces the %s case/email relation through the actual answer boundary",async (
    language,answerText,rejected
  ) => {
    const supportCase = Object.freeze({
      ...entry("support-cases","Escalation creates a human Support case; email is separate."),
      lang:language,title:"Support cases"
    });
    const snapshot = corpus([supportCase],`case-email-relation-${language}`);
    const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",text:answerText,sourceIds:[SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-20T19:22:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text:language === "ro"
        ? "Cum creez un caz uman și ce face emailul de asistență?"
        : "How do I create a human case and what does support email do?",
      language,detectedLanguage:language
    });

    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",text:rejected ? supportCase.fallback : answerText,
      sources:[{ id:"support-cases" }],actions:[]
    });
  });

  it.each([
    ["en" as const,"Where do I find my debates and the public debate library?"],
    ["ro" as const,"Unde găsesc dezbaterile mele și biblioteca publică?"],
    ["ro" as const,"Deschide Dezbaterile mele și Biblioteca de dezbateri publice."]
  ])("recovers a rejected compound %s answer from the required app-navigation source",async (
    language,text
  ) => {
    const drafted = authorDraftCorpus();
    const snapshot = corpus(drafted.entries.filter((candidate) =>
      candidate.lang === language && [
        "app-navigation","browse-public-debates","getting-started-debate"
      ].includes(candidate.id)),`compound-recovery-${language}`);
    const complete = vi.fn(async () => Object.freeze({ text:"not-json" }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T14:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text,language,detectedLanguage:language,signedIn:true
    });
    const required = snapshot.entries.find((candidate) => candidate.id === "app-navigation")!;

    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",text:required.fallback,
      sources:[{ id:"app-navigation" }]
    });
    expect(result.sources?.map(({ id }) => id)).not.toContain("getting-started-debate");
  });

  it("enforces required and allowed compound sources independent of accepted-draft order",async () => {
    const drafted = authorDraftCorpus();
    const snapshot = corpus(drafted.entries.filter((candidate) => candidate.lang === "en" && [
      "app-navigation","browse-public-debates","getting-started-debate"
    ].includes(candidate.id)),"compound-source-contract");
    const query = "Where do I find my debates and the public debate library?";
    const context = buildSupportKnowledgeContext({
      entries:snapshot.entries,capabilities:SUPPORT_CAPABILITIES,language:"en",query,historyText:"",
      maxCodePoints:24_000,availableActionIds:SUPPORT_ACTION_IDS,
      referenceFor:modelReferenceFactory().referenceFor
    });
    const sourceReference = new Map(context.sourceReferences.map((item) => [
      item.canonicalId,item.reference
    ]));
    const app = sourceReference.get("app-navigation")!;
    const browse = sourceReference.get("browse-public-debates")!;
    const required = snapshot.entries.find((candidate) => candidate.id === "app-navigation")!;
    const cases = [
      { ids:[app],text:"Use Home to find both lists.",expected:["app-navigation"] },
      { ids:[app,browse],text:"Use Home and the public catalog.",expected:["app-navigation","browse-public-debates"] },
      { ids:[browse,app],text:"Use the public catalog and Your debates.",expected:["app-navigation","browse-public-debates"] },
      { ids:[browse],text:"This covers only the public catalog.",expected:["app-navigation"],recovered:true }
    ] as const;

    for (const candidate of cases) {
      const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
        kind:"answer",text:candidate.text,sourceIds:candidate.ids,actionIds:[]
      }) }));
      const service = createSupportAnswerService({
        entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
        modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
        clock:(() => { let at=Date.parse("2026-09-17T14:30:00.000Z");return () => new Date(++at); })()
      });
      const result = await service.respond({ ...request(snapshot),text:query,signedIn:true });
      expect(result.sources?.map(({ id }) => id)).toEqual(candidate.expected);
      expect(result.text).toBe("recovered" in candidate ? required.fallback : candidate.text);
      expect(result.sources?.map(({ id }) => id)).not.toContain("getting-started-debate");
    }
  });

  it.each([
    ["en" as const,"Pricing"],
    ["ro" as const,"Cum funcționează secțiunea Prețuri?"],
  ])("keeps a reviewed %s prose-only guide answer actionless in the actual service",async (
    language,text
  ) => {
    const drafted = authorDraftCorpus();
    const snapshot = corpus(
      drafted.entries.filter((candidate) => candidate.id === "app-navigation"),
      `pricing-${language}`
    );
    const complete = vi.fn<SupportModelPort["complete"]>(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",text:"Pricing is currently a placeholder in the public navigation.",
      sourceIds:[SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T13:30:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text,language,detectedLanguage:language
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",sources:[{ id:"app-navigation" }],actions:[]
    });
    const system = complete.mock.calls[0]?.[0].system;
    expect(system).toContain("actionIds=none");
  });

  it.each([
    ["en" as const,"Where can I read the Method section?","method","/#method"],
    ["ro" as const,"Unde pot citi secțiunea Transcrieri?","sample-transcript","/#transcripts"],
  ])("keeps a genuine %s menu request bound to its relevant closed action",async (
    language,text,actionId,href
  ) => {
    const drafted = authorDraftCorpus();
    const snapshot = corpus(
      drafted.entries.filter((candidate) => candidate.id === "app-navigation"),
      `landing-${language}`
    );
    const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",text:"Use the reviewed landing-page section.",
      sourceIds:[SOURCE_REFERENCE],actionIds:[ACTION_REFERENCE]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T13:45:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text,language,detectedLanguage:language
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",sources:[{ id:"app-navigation" }],
      actions:[{ id:actionId,href }]
    });
  });

  it.each([
    ["en" as const,"Where are Privacy preferences? Do not open Active sessions."],
    ["ro" as const,"Unde sunt preferințele de confidențialitate? Nu deschide Sesiuni active."],
  ])("keeps a negated unrelated %s destination out of the model and response action sinks",async (
    language,text
  ) => {
    const snapshot = authorDraftCorpus();
    let system = "";
    const complete = vi.fn<SupportModelPort["complete"]>(async (input) => {
      system = input.system;
      return Object.freeze({ text:JSON.stringify({
        kind:"answer",text:"Use the reviewed Privacy section.",
        sourceIds:[SOURCE_REFERENCE],actionIds:[ACTION_REFERENCE]
      }) });
    });
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T13:50:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),signedIn:true,text,language,detectedLanguage:language
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(system).toContain(`actionIds=${ACTION_REFERENCE}`);
    expect(system).not.toContain(SECOND_ACTION_REFERENCE);
    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",actions:[{ id:"privacy-preferences" }]
    });
  });

  it.each([
    ["en" as const,"Is Dialectical Engine a reasoning instrument?"],
    ["en" as const,"Give me an overview of dialecticalengine."],
    ["en" as const,"What is Dialectical-Engine, and what can I do in this app?"],
    ["ro" as const,"Ce este Dialectical-Engine și ce pot face în această aplicație?"]
  ])("grounds a reviewed %s identity paraphrase through the actual service: %s", async (
    language,text
  ) => {
    const snapshot = authorDraftCorpus();
    const complete = vi.fn(async () => Object.freeze({ text:JSON.stringify({
      kind:"answer",text:"Dialectical Engine is a reasoning instrument.",
      sourceIds:[SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T12:45:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text,language,detectedLanguage:language
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome:"ANSWER_GROUNDED",sources:[{ id:"product-identity" }],actions:[]
    });
  });

  it.each([
    "Does Dialectical Engine support investment advice?",
    "Can DebateAIRO help diagnose medical conditions?"
  ])("keeps an unsupported branded claim out of the actual service on the admitted corpus: %s", async (
    text
  ) => {
    const snapshot = authorDraftCorpus();
    const complete = vi.fn(async () => Object.freeze({ text: JSON.stringify({
      kind:"answer",text:"Unsupported synthetic claim.",sourceIds:[SOURCE_REFERENCE],actionIds:[]
    }) }));
    const service = createSupportAnswerService({
      entries:snapshot.entries,snapshots:createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,modelFor:() => Object.freeze({ complete }) as never,
      clock:(() => { let at=Date.parse("2026-09-17T12:30:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({ ...request(snapshot),text });

    expect(result).toMatchObject({ outcome:"NO_SOURCE",sources:[],actions:[] });
    expect(complete).not.toHaveBeenCalled();
  });

  it.each(["not-json",JSON.stringify({ kind: "tool",text: "ignored",sourceIds: [],actionIds: [] })])(
    "recovers every rejected ordinary knowledge envelope from the pinned top source: %s",
    async (completionText) => {
      const top = entry("getting-started-debate","create debate topic plan controls");
      const snapshot = corpus([top],"6".repeat(64));
      const complete = vi.fn(async () => Object.freeze({
        text: completionText,usage: { input_tokens: 11,output_tokens: 7,cost_usd: 0.002 }
      }));
      const service = createSupportAnswerService({
        entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
        modelReferenceFactory,modelFor: () => Object.freeze({ complete }) as never,
        clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
      });

      const result = await service.respond({ ...request(snapshot),text: "How do I create a debate?" });

      expect(complete).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        outcome: "ANSWER_GROUNDED",text: top.fallback,
        sources: [{ id: top.id,label: top.title }],usage: { input_tokens: 11,output_tokens: 7,cost_usd: 0.002 }
      });
      expect(messages.write).toHaveBeenLastCalledWith(expect.objectContaining({
        role: "assistant",outcome: "ANSWER_GROUNDED",text: top.fallback
      }));
    }
  );
  it("maps request-local model references to canonical response provenance", async () => {
    const snapshot = corpus([
      entry("getting-started-debate","create debate topic plan controls")
    ],"9".repeat(64));
    const sourceReference = "s-10000000000040008000000000000001-1";
    const actionReference = "a-10000000000040008000000000000001-1";
    let system = "";
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory: () => Object.freeze({
        referenceFor: (kind: "source" | "action") =>
          kind === "source" ? sourceReference : actionReference
      }),
      modelFor: () => Object.freeze({
        complete: async (input: Readonly<{ system: string }>) => {
          system = input.system;
          return Object.freeze({ text: JSON.stringify({
            kind: "answer",text: "Choose Start a debate to continue.",
            sourceIds: [sourceReference],actionIds: [actionReference]
          }) });
        }
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    } as never);

    const result = await service.respond({
      ...request(snapshot),text: "How do I create a debate?"
    });

    expect(result).toMatchObject({
      outcome: "ANSWER_GROUNDED",
      sources: [{ id: "getting-started-debate",label: "Crosscap article" }],
      actions: [{ id: "start-debate",label: "Start a debate",href: "/login?next=%2Fnew" }]
    });
    expect(system).toContain(sourceReference);
    expect(system).toContain(actionReference);
    for (const forbidden of ["getting-started-debate","start-debate","new-debate","/new","route="]) {
      expect(system).not.toContain(forbidden);
    }
  });

  it("keeps matching whole reviewed sections above 12,000 and below the 24,000 system cap", async () => {
    const entries = [
      entry("crosscap-alpha",`alpha crosscap ${"a".repeat(4_000)} alpha-end-marker`),
      entry("crosscap-beta",`beta crosscap ${"b".repeat(4_000)} beta-end-marker`),
      entry("crosscap-gamma",`gamma crosscap ${"c".repeat(4_000)} gamma-end-marker`)
    ];
    const snapshot = corpus(entries,"a".repeat(64));
    let system = "";
    const complete = vi.fn(async (input: Readonly<{ system: string }>) => {
      system = input.system;
      return Object.freeze({ text: JSON.stringify({
        kind: "answer",text: "The reviewed sections describe the requested feature.",
        sourceIds: [SOURCE_REFERENCE],actionIds: []
      }) });
    });
    const service = createSupportAnswerService({
      entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,modelReferenceFactory,
      modelFor: () => Object.freeze({ complete }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    await service.respond(request(snapshot));

    expect([...system].length).toBeGreaterThan(12_000);
    expect([...system].length).toBeLessThanOrEqual(24_000);
    expect(system).toContain("alpha-end-marker");
    expect(system).toContain("beta-end-marker");
    expect(system).toContain("gamma-end-marker");
    expect(system).toContain("The final OUTPUT CONTRACT lists the only allowed sourceIds and actionIds");
    expect(system).toContain("sourceIds=s-10000000000040008000000000000001-1,s-10000000000040008000000000000001-2,s-10000000000040008000000000000001-3");
    expect(system).toContain("actionIds=none");
    expect(system).toContain('{"kind":"answer","text":"<grounded answer>","sourceIds":["<allowed source reference>"],"actionIds":[]}');
  });

  it("filters unavailable actions before the model sees the output contract", async () => {
    const snapshot = corpus([entry("export-json","export JSON served answer ledger")],"d".repeat(64));
    let system = "";
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelFor: () => Object.freeze({
        complete: async (input: Readonly<{ system: string }>) => {
          system = input.system;
          return Object.freeze({ text: JSON.stringify({
            kind: "answer",text: "JSON export requires a served answer and readable ledger.",
            sourceIds: [SOURCE_REFERENCE],actionIds: []
          }) });
        }
      }) as never,modelReferenceFactory,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshot),text: "How does JSON export work?",signedIn: false
    });

    expect(result.outcome).toBe("ANSWER_GROUNDED");
    expect(system).toContain("actionIds=none");
    expect(system).toContain("Never write source IDs, action IDs, capability IDs, routes, or paths inside text");
    expect(system).toContain("Owner debate workspace");
    expect(system).toContain("available only in verified owner context | actions=none");
    expect(system).not.toContain("owner-debate:");
    expect(system).not.toContain("route=");
  });

  it("uses the exact immutable snapshot object already resolved by the route", async () => {
    const selected = entry("selected-a","alpha crosscap selected-a-end");
    const stale = entry("stale-b","alpha crosscap stale-b-end");
    const snapshotA = corpus([selected],"a".repeat(64));
    const snapshotB = corpus([stale],"b".repeat(64));
    let system = "";
    const complete = vi.fn(async (input: Readonly<{ system: string }>) => {
      system = input.system;
      return Object.freeze({ text: JSON.stringify({
        kind: "answer",text: "Selected snapshot answer.",
        sourceIds: [SOURCE_REFERENCE],actionIds: []
      }) });
    });
    const service = createSupportAnswerService({
      entries: snapshotB.entries,
      snapshots: createHelpCorpusSnapshotLookup(snapshotB),messages,
      modelFor: () => Object.freeze({ complete }) as never,modelReferenceFactory,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond({
      ...request(snapshotA),kbVersion: snapshotB.kbVersion
    });

    expect(result.outcome).toBe("ANSWER_GROUNDED");
    expect(system).toContain("selected-a-end");
    expect(system).not.toContain("stale-b-end");
  });

  it("reports only the closed diagnostic shape for a rejected completion", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected-a-end")],"c".repeat(64));
    const reportDraftDiagnostic = vi.fn();
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      reportDraftDiagnostic,modelReferenceFactory,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: "```json\n{}\n```" })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond(request(snapshot));

    expect(result.outcome).toBe("ANSWER_GROUNDED");
    expect(reportDraftDiagnostic).toHaveBeenCalledOnce();
    expect(reportDraftDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      code: "JSON_INVALID",predicate: "JSON_SYNTAX",jsonValid: false,fenced: true,
      attemptId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
    }));
    expect(Object.keys(reportDraftDiagnostic.mock.calls[0]![0]).sort()).toEqual([
      "actionIdCount","allowedActionIdCount","allowedSourceIdCount","attemptId","code",
      "exactKeys","fenced","jsonValid","kindValid","predicate","sourceIdCount",
      "textCodePoints"
    ]);
    expect(JSON.stringify(reportDraftDiagnostic.mock.calls)).not.toContain("```json");
    expect(JSON.stringify(reportDraftDiagnostic.mock.calls)).not.toContain("selected-a");
  });

  it("rejects an internal identifier before canonical assistant storage", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected-a-end")],"e".repeat(64));
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: JSON.stringify({
          kind: "answer",text: "Select start-debate to continue.",
          sourceIds: [SOURCE_REFERENCE],actionIds: []
        }) })
      }) as never,modelReferenceFactory,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond(request(snapshot));

    expect(result).toMatchObject({
      outcome: "ANSWER_GROUNDED",sources: [{ id: "selected-a" }],actions: []
    });
    expect(result.text).not.toContain("start-debate");
    expect(messages.write).toHaveBeenLastCalledWith(expect.objectContaining({
      role: "assistant",outcome: "ANSWER_GROUNDED"
    }));
  });

  it("rejects a request alias in narrative text before canonical assistant storage", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected marker")],"7".repeat(64));
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: JSON.stringify({
          kind: "answer",text: `Select ${SOURCE_REFERENCE} to continue.`,
          sourceIds: [SOURCE_REFERENCE],actionIds: []
        }) })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond(request(snapshot));

    expect(result).toMatchObject({
      outcome: "ANSWER_GROUNDED",sources: [{ id: "selected-a" }],actions: []
    });
    expect(result.text).not.toContain(SOURCE_REFERENCE);
  });

  it("rejects a source reference issued for a prior request", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected marker")],"8".repeat(64));
    const firstFactory = createSupportModelReferenceFactory(REFERENCE_REQUEST_ID);
    const secondFactory = createSupportModelReferenceFactory("20000000-0000-4000-8000-000000000002");
    const factories = [firstFactory,secondFactory];
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      modelReferenceFactory: () => factories.shift()!,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: JSON.stringify({
          kind: "answer",text: "Selected snapshot answer.",
          sourceIds: [firstFactory.referenceFor("source",0)],actionIds: []
        }) })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    await expect(service.respond(request(snapshot))).resolves.toMatchObject({
      outcome: "ANSWER_GROUNDED",sources: [{ id: "selected-a" }]
    });
    await expect(service.respond(request(snapshot))).resolves.toMatchObject({
      outcome: "ANSWER_GROUNDED",sources: [{ id: "selected-a" }],actions: []
    });
  });

  it.each([
    "Support does not request passwords, plus it could receive them.",
    "Support does not request passwords, in addition it accepts them.",
    "Asistența nu cere parole, plus le poate primi.",
    "Asistența nu cere parole, în plus le poate primi.",
    "Asistența nu cere coduri de autentificare; de asemenea le poate valida.",
    "Asistența nu cere coduri de securitate; în plus le poate verifica.",
    "Network=%5C%5Cserver%5Cshare to continue."
  ])("keeps a rejected transformed completion out of assistant storage and return: %s", async (
    hostile
  ) => {
    const top = entry("selected-a","alpha crosscap selected marker");
    const snapshot = corpus([top],"4".repeat(64));
    const stored: string[] = [];
    const localMessages = Object.freeze({
      write: vi.fn(async (input) => {
        stored.push(input.text);
        return Object.freeze({ ...input,redacted: false });
      }),
      writeAndTransit: vi.fn(async (input,transit) => {
        await transit(input.text);
        stored.push(input.text);
        return Object.freeze({ ...input,redacted: false });
      }),read: vi.fn(async () => null),listSession: vi.fn(async () => [])
    }) as unknown as SupportMessageCipherPort;
    const complete = vi.fn(async () => Object.freeze({ text: JSON.stringify({
      kind: "answer",text: hostile,sourceIds: [SOURCE_REFERENCE],actionIds: []
    }) }));
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),
      messages: localMessages,modelReferenceFactory,
      modelFor: () => Object.freeze({ complete }) as never,
      clock: (() => { let at = Date.parse("2026-09-17T10:00:00.000Z");return () => new Date(++at); })()
    });

    const result = await service.respond(request(snapshot));

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      outcome: "ANSWER_GROUNDED",text: top.fallback,sources: [{ id: top.id }]
    });
    expect(result.text).not.toContain(hostile);
    expect(stored).not.toContain(hostile);
    expect(stored).toContain(top.fallback!);
  });

  it("assigns distinct opaque identities to separate rejected model attempts", async () => {
    const snapshot = corpus([entry("selected-a","alpha crosscap selected-a-end")],"f".repeat(64));
    const reports: Array<Readonly<{ attemptId: string }>> = [];
    const service = createSupportAnswerService({
      entries: snapshot.entries,snapshots: createHelpCorpusSnapshotLookup(snapshot),messages,
      reportDraftDiagnostic: (report) => { reports.push(report); },modelReferenceFactory,
      modelFor: () => Object.freeze({
        complete: async () => Object.freeze({ text: "not-json" })
      }) as never,
      clock: (() => { let at = Date.parse("2026-09-14T10:00:00.000Z");return () => new Date(++at); })()
    });

    await service.respond(request(snapshot));
    await service.respond(request(snapshot));

    expect(reports).toHaveLength(2);
    expect(new Set(reports.map(({ attemptId }) => attemptId)).size).toBe(2);
    expect(reports.every(({ attemptId }) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(attemptId)
    )).toBe(true);
  });
});
