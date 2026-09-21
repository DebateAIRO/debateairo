import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

import {
  buildSupportKnowledgeContext,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/context.ts";
import {
  SUPPORT_ACTION_IDS,
  SUPPORT_CAPABILITIES,
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/catalog.ts";

const lane = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine";
const contentDirectory = join(lane,"packages/support-kb/content");
const componentPath = join(lane,"packages/support-kb/recovery/components.json");
const manifestPath = join(lane,"packages/support-kb/reviews/manifest.json");
const contextPath = join(lane,"packages/support-kb/src/context.ts");
const catalogPath = join(lane,"packages/support-kb/src/catalog.ts");
const caseDirectory = join(lane,"tests/support-eval/cases");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function article(path: string): Readonly<{ title: string;body: string }> {
  const text = readFileSync(path,"utf8");
  const title = /^title:\s*"([^"]+)"$/mu.exec(text)?.[1];
  const body = text.split(/^---\s*$/mu).slice(2).join("---").trim();
  if (title === undefined || body === "") throw new Error(`ARTICLE_PARSE_FAILED:${path}`);
  return Object.freeze({ title,body });
}

const componentDocument = JSON.parse(readFileSync(componentPath,"utf8")) as Readonly<{
  components: readonly Readonly<{
    id: string;
    lang: "en" | "ro";
    modelProjection: string;
    fallback: string;
  }>[];
}>;

const entries = Object.freeze(componentDocument.components.map((component) => {
  const path = join(contentDirectory,`${component.id}.${component.lang}.md`);
  const parsed = article(path);
  return Object.freeze({
    id: component.id,lang: component.lang,title: parsed.title,status: "shipped" as const,
    sources: Object.freeze([]),verifiedAgainst: "probe",ratifiedBy: "" as const,
    ratifiedOn: "",body: parsed.body,modelProjection: component.modelProjection,
    fallback: component.fallback,
  });
}));

const cases = readdirSync(caseDirectory)
  .filter((name) => /^sup-[ab]-\d+\.json$/u.test(name))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(caseDirectory,name),"utf8")) as Readonly<{
    id: string;
    class: "A" | "B";
    messages: readonly Readonly<{ content: string }>[];
    expected_source_ids: readonly string[];
    expected_language: "en" | "ro";
  }>);

console.log(JSON.stringify({
  custody: [contextPath,catalogPath,componentPath,manifestPath].map((path) => ({
    path: realpathSync(path),sha256: sha256(path),
  })),
  componentEntries: entries.length,
  results: cases.map((testCase) => {
    const context = buildSupportKnowledgeContext({
      entries,capabilities: SUPPORT_CAPABILITIES,language: testCase.expected_language,
      query: testCase.messages.at(-1)?.content ?? "",historyText:"",maxCodePoints:24_000,
      availableActionIds: SUPPORT_ACTION_IDS,
      referenceFor: (kind,index) => `${kind === "source" ? "s" : "a"}${index + 1}`,
    });
    return {
      id:testCase.id,class:testCase.class,expectedSourceIds:testCase.expected_source_ids,
      actualSourceIds:context.sourceIds,requestedActionIds:context.requestedActionIds,
    };
  }),
},null,2));
