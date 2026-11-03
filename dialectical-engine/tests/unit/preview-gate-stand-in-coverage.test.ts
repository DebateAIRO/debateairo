import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PublicContributionCheckReplySchema, PublicReportCheckReplySchema, classifyStructuredArtifact, webDigPlannerV2ReplySchema, webDigPlannerV3ReplyIssues,
  webPlannerV2ReplyIssues, webPlannerV2ReplySchema, webReadTopReplyIssues, webReadTopReplySchema, webSuggestDigReplySchema, webSuggestReplySchema
} from "@debateai/judgement";
import { mapContractNameOf, mapEngineContractNameOf, startCombineReplySchema, startFitReplySchema, startListSpec, startMergeLateSpec, startMergeSpec,
  type StartSpecContext } from "@debateai/map";
import { lockedReplyLanguageExpectation, questionLanguageFromRun, replyLanguageExpectation } from "@debateai/kernel";
import type { StartMenu } from "@debateai/contract";
import { buildFramedPrompt, type FramedMaterialField, type PromptContract } from "@debateai/providers";
import {
  ReportAnswerCheckReplySchema, ReportStoryCheckReplySchema, answerUpdateCallSiteKey, classifyPathRewriteCheckerContent, classifyPathRewriteContent,
  classifyReportAnswerContent, classifyReportStoryContent, classifyStoryChartsContent, investigationReportCallSiteKey, pathRewriteCallSiteKey,
  pathRewriteSuggestCallSiteKey, publicReportCallSiteKey
} from "@debateai/story";
import { readAskClarifyReply } from "../../apps/api/src/ask-clarify.js";
import { readQuestionSubjects } from "../../apps/api/src/question-check/subjects.js";
import { parseQuestionCheckAnswer } from "../../apps/api/src/question-check/verdict.js";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";
import { classifyPickReply, classifyReadAllReply } from "../../apps/runner/src/web-reader-all.js";
import { callFamilyOf, practiceStepOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";
import { practiceVerdict } from "../../tools/preview-practice/practice-verdict.js";
import { LATER_CONTRACT_KINDS, laterStepContent, type LaterGateKind } from "../support/gate-later-steps.js";
import { classifyGateRequest, type StubLanguage } from "../support/preview-gate-stubs.js";

/**
 * The practice's stand-in and the practice's report must know every AI call the code can make. This file reads the contract
 * ids and the call-site names out of the code itself, so a call added tomorrow fails HERE, by name, instead of as a billed 500
 * deep inside a practice debate (the way STORY:CHARTS and PATH_REWRITE:SUGGEST went unnoticed), or as an UNMAPPED report row.
 */
const ROOT = process.cwd();
const SOURCES = [join(ROOT, "apps/runner/src"), join(ROOT, "apps/api/src"),
  ...readdirSync(join(ROOT, "packages"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(ROOT, "packages", entry.name, "src"))];
const sourceFiles = (folder: string): readonly string[] => {
  let entries;
  try { entries = readdirSync(folder, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((entry) => entry.isDirectory() ? sourceFiles(join(folder, entry.name))
    : /\.tsx?$/u.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name) ? [join(folder, entry.name)] : []);
};
const CODE = SOURCES.flatMap(sourceFiles).map((file) => readFileSync(file, "utf8")).join("\n");
const allOf = (pattern: RegExp): readonly string[] => [...new Set([...CODE.matchAll(pattern)].map((match) => match[1]!))].sort();
const CODE_CONTRACT_IDS = allOf(/(?:\b[A-Z_0-9]*CONTRACT_ID\b[^=\n]*=\s*|\bcontractId:\s*)"([a-z][a-z0-9.-]*)"/gu);

/** Contracts the stand-in reads by the machine keys of their instruction (classifyGateRequest's last lines); the sealed ones are proved below. */
const READ_BY_INSTRUCTION = /^(?:judge\.|serve\.synthesizer\.|serve\.evaluator\.)/u;
/**
 * Contracts the stand-in leaves UNKNOWN on purpose, each with why: nothing the practice runs sends them, or only a scenario can
 * answer them. A name here is a decision somebody made; a contract on no list fails below.
 */
const NOT_ANSWERED_BY_DEFAULT: Readonly<Record<string, string>> = Object.freeze({
  "repair.structure.v1": "must return the broken reply's own text in its form: a scenario's override writes it (lg-a-structure-repair-chain)",
  "story.pack-probe.v1": "a local check of the story pack; it never reaches a provider",
  "story.storyteller.v1": "retired: a run asks v3 or v4", "story.storyteller.v2": "retired: a run asks v3 or v4",
  "story.checker.v1": "retired: a run asks v3 or v4", "story.checker.v2": "retired: a run asks v3 or v4",
  "synthesis.content-check.v1": "the API's own check on its own configured judge; the practice does not run it",
  "publication.content-check.v1": "the API's own check on its own configured judge; the practice does not run it",
  "support.chat-answer.v1": "the support chat is not part of a debate", "support.chat-answer.v2": "the support chat is not part of a debate",
  "support.chat-answer.v3": "the support chat is not part of a debate", "support.case-summary.v1": "the support chat is not part of a debate",
  "support.case-summary.v2": "the support chat is not part of a debate", "support.no-source-judgement.v1": "the support chat is not part of a debate",
  "evaluator.blind-judge-grade.v1": "the dormant evaluator lane's add-on", "evaluator.domain-tagger.v1": "the dormant evaluator lane's add-on",
  "evaluator.consumer-aggregate.v1": "the dormant evaluator lane's add-on"
});

const chatOf = (contract: PromptContract, material: readonly FramedMaterialField[]): string =>
  JSON.stringify({ messages: buildFramedPrompt({ contract, material }).packet.messages });
const contractOf = (contractId: string): PromptContract => Object.freeze({ contractId, instruction: "Read the material.", answerForm: "Return one JSON object." });

describe("the gate stand-in knows every contract the code can ask", () => {
  it("found the code's contract ids (a scan that finds nothing would prove nothing)", () => {
    expect(CODE_CONTRACT_IDS.length).toBeGreaterThan(60);
    for (const id of ["story.charts.v2", "web.suggest-dig.v1", "ask.clarify.v1", "public.report-check.v1", "report.answer.v4"]) expect(CODE_CONTRACT_IDS).toContain(id);
  });

  it("every contract id in the code is answered by the stand-in, or is on the named list of those it leaves alone", () => {
    const untold = CODE_CONTRACT_IDS.filter((id) => !READ_BY_INSTRUCTION.test(id) && !Object.hasOwn(NOT_ANSWERED_BY_DEFAULT, id)
      && classifyGateRequest(chatOf(contractOf(id), [{ name: "question_line", content: "Q" }])) === "UNKNOWN");
    expect(untold, "a contract the practice's stand-in does not know: add it to tests/support/gate-later-steps.ts").toEqual([]);
  });

  it("every engine-sealed contract, read whole as the gate reads it, is a kind the stand-in answers", () => {
    const untold = engineSealedContracts().map((contract) => contract.contractId)
      .filter((_id, at) => classifyGateRequest(chatOf(engineSealedContracts()[at]!, [{ name: "question_line", content: "Q" }])) === "UNKNOWN");
    expect(untold).toEqual([]);
  });

  it("no stale row: every row and every name on the leave-alone list is still in the code", () => {
    expect(Object.keys(LATER_CONTRACT_KINDS).filter((id) => !CODE_CONTRACT_IDS.includes(id))).toEqual([]);
    expect(Object.keys(NOT_ANSWERED_BY_DEFAULT).filter((id) => !CODE_CONTRACT_IDS.includes(id))).toEqual([]);
    // A leave-alone name the stand-in does answer would be a list that lies.
    expect(Object.keys(NOT_ANSWERED_BY_DEFAULT).filter((id) => classifyGateRequest(chatOf(contractOf(id), [{ name: "question_line", content: "Q" }])) !== "UNKNOWN")).toEqual([]);
    expect(Object.keys(NOT_ANSWERED_BY_DEFAULT).filter((id) => mapContractNameOf(id) !== null || mapEngineContractNameOf(id) !== null)).toEqual([]);
  });
});

const field = (name: string, content: unknown): FramedMaterialField => ({ name, content: typeof content === "string" ? content : JSON.stringify(content) });
const PAGES = field("pages", [{ page_id: "p1" }, { page_id: "p2" }, { page_id: "p3" }]);
const REWRITE_MATERIAL = [field("question", "Q"), field("path", { line: "L", points: [{ ref: "P1", text: "A point." }] }), field("picks", [{ text: "T", marked: "AI_SUGGESTION" }]),
  field("dig_paths", [{ ref: "D1", place: 1, statement: "S", points: [{ ref: "P2", text: "Another." }] }])];
const REWRITE_INDEX = Object.freeze({ pointRefs: new Set(["P1", "P2"]), digPathRefs: ["D1"], personWords: false });
const REPORT_INDEX = Object.freeze({ refs: new Set(["P1"]), cardRefs: ["C1"] });
const SUGGEST_MATERIAL = [field("for", [{ ref: "f1", text: "F" }]), field("against", [{ ref: "a1", text: "A" }])];
// The step before Start (V4 start step, Task 22): read by its own specs (the combine's and the fit's by their schemas until their specs exist).
// Each language's default reply is read against a question in that language, so a reply in the wrong one fails.
const START_QUESTIONS = Object.freeze({ en: "Should the town build a second ferry pier before next summer?",
  ro: "Ar trebui orașul să construiască un al doilea debarcader înainte de vara viitoare?" });
const START_CTX = (language: StubLanguage): StartSpecContext => language === "en"
  ? { questionLine: START_QUESTIONS.en, languageName: "English", languageTag: "en", replyLanguage: replyLanguageExpectation(START_QUESTIONS.en), readingLevel: null }
  : { questionLine: START_QUESTIONS.ro, languageName: "Romanian", languageTag: "ro",
    replyLanguage: lockedReplyLanguageExpectation(questionLanguageFromRun("ro", "Romanian")!, START_QUESTIONS.ro), readingLevel: null };
const START_ANGLE = { angleId: "g1", kind: "OPPOSITE_CASE", label: "The case against", focus: "Why it could be a mistake." } as const;
const START_SUGGESTIONS = [{ viewpoint_id: "pt11", title: "Queues", question: "Do the queues matter?", why: "They are the complaint.", angle_id: "g1" },
  { viewpoint_id: "pt12", title: "Winter", question: "Does winter matter?", why: "Half the year is quiet.", angle_id: "g1" }];
const START_PRIOR: StartMenu = { menu_id: "A".repeat(22), revision: 1, language: { code: "en", name: "English" }, angles: [{ angle_id: "g1", kind: "GENERAL", label: "All" }],
  viewpoints: [{ ...START_SUGGESTIONS[0]!, repeat_ids: [] }], repeats: [], paths: [{ path_ref: "kp00", title: "Queues", question: "Do the queues matter?",
    viewpoint_ids: ["pt11"], put_together: false, is_new: false }], cards: [], suggestions: [] };
const START_LATE = [{ ...START_SUGGESTIONS[1]!, viewpoint_id: "pt21" }];

/** A problem list: empty means the code's own reader takes the default reply. */
const issuesOf = (read: Readonly<{ parseStatus: string; parseError?: string | null }>): readonly string[] => read.parseStatus === "PARSED" ? [] : [read.parseError ?? read.parseStatus];
const zodIssues = (read: Readonly<{ success: boolean }>): readonly string[] => read.success ? [] : ["SCHEMA"];
type Row = Readonly<{ kind: LaterGateKind; id: string; material: readonly FramedMaterialField[]; accept: (content: string, language: StubLanguage) => readonly string[] }>;
const ROWS: readonly Row[] = [
  { kind: "STORY_CHARTS", id: "story.charts.v2", material: [], accept: (content) => issuesOf(classifyStoryChartsContent(content)) },
  { kind: "SUGGESTIONS", id: "web.suggest.v1", material: SUGGEST_MATERIAL, accept: (content) => issuesOf(classifyStructuredArtifact(content, webSuggestReplySchema, undefined)) },
  { kind: "SUGGESTIONS", id: "web.suggest-dig.v1", material: SUGGEST_MATERIAL, accept: (content) => issuesOf(classifyStructuredArtifact(content, webSuggestDigReplySchema, undefined)) },
  { kind: "PATH_REWRITE_WRITER", id: "path-rewrite.writer.v2", material: REWRITE_MATERIAL, accept: (content) => issuesOf(classifyPathRewriteContent(content, REWRITE_INDEX)) },
  { kind: "PATH_REWRITE_CHECKER", id: "path-rewrite.checker.v2", material: [], accept: (content) => issuesOf(classifyPathRewriteCheckerContent(content)) },
  { kind: "REPORT_ANSWER", id: "report.answer.v4", material: [], accept: (content) => issuesOf(classifyReportAnswerContent(content, REPORT_INDEX)) },
  { kind: "REPORT_ANSWER", id: "report.answer.later.v4", material: [], accept: (content) => issuesOf(classifyReportAnswerContent(content, REPORT_INDEX)) },
  { kind: "REPORT_ANSWER_CHECK", id: "report.answer-check.v3", material: [], accept: (content) => zodIssues(ReportAnswerCheckReplySchema.safeParse(JSON.parse(content))) },
  { kind: "REPORT_STORY", id: "report.story.v1", material: [], accept: (content) => issuesOf(classifyReportStoryContent(content, REPORT_INDEX)) },
  { kind: "REPORT_STORY_CHECK", id: "report.story-check.v1", material: [], accept: (content) => zodIssues(ReportStoryCheckReplySchema.safeParse(JSON.parse(content))) },
  { kind: "CONTRIBUTION_CHECK", id: "public.contribution-check.v1", material: [], accept: (content) => zodIssues(PublicContributionCheckReplySchema.safeParse(JSON.parse(content))) },
  { kind: "PUBLIC_REPORT_CHECK", id: "public.report-check.v1", material: [], accept: (content) => zodIssues(PublicReportCheckReplySchema.safeParse(JSON.parse(content))) },
  { kind: "ASK_CLARIFY", id: "ask.clarify.v1", material: [], accept: (content) => readAskClarifyReply(content)?.purpose === null ? ["NO_PURPOSE"] : [] },
  // 2026-11-02: on the preview the question check goes through the gate (it was on the leave-alone list as "the API's own check on
  // its own configured judge", which hid that the test site's check could never run). Read by the check's own strict parser.
  { kind: "QUESTION_CHECK", id: "question.start-check.v2", material: [], accept: (content) => {
    const read = parseQuestionCheckAnswer(content, String((JSON.parse(content) as { call?: unknown }).call), readQuestionSubjects().map((subject) => subject.id));
    return read.ok && read.subject === "NONE" && read.healthy ? [] : [read.ok ? "NOT_HEALTHY" : read.code];
  } },
  { kind: "WEB_PLAN", id: "web.plan.v2", material: [field("answers", [{ answer_id: "a1" }])], accept: (content) => {
    const read = webPlannerV2ReplySchema.safeParse(JSON.parse(content));
    return read.success ? webPlannerV2ReplyIssues(read.data, ["a1"], null).map((issue) => issue.message) : ["SCHEMA"];
  } },
  { kind: "WEB_DIG_PLAN", id: "web.plan-dig.v3", material: [], accept: (content) => {
    const read = webDigPlannerV2ReplySchema.safeParse(JSON.parse(content));
    return read.success ? webDigPlannerV3ReplyIssues(read.data, null).map((issue) => issue.message) : ["SCHEMA"];
  } },
  { kind: "WEB_READ_ALL", id: "web.read-all.v2", material: [PAGES], accept: (content) => issuesOf(classifyReadAllReply(content, ["p1", "p2", "p3"])) },
  { kind: "WEB_PICK", id: "web.pick.v2", material: [field("top_count", "3"), PAGES], accept: (content) => issuesOf(classifyPickReply(content, ["p1", "p2", "p3"])) },
  { kind: "WEB_READ_TOP", id: "web.read-top.v2", material: [PAGES], accept: (content) => {
    const read = webReadTopReplySchema.safeParse(JSON.parse(content));
    return read.success ? webReadTopReplyIssues(read.data, ["p1", "p2", "p3"]).map((issue) => issue.message) : ["SCHEMA"];
  } },
  { kind: "START_LIST", id: "start.list.v1", material: [field("angles", [{ angle_id: "g1", label: START_ANGLE.label, focus: START_ANGLE.focus }])],
    accept: (content, language) => issuesOf(startListSpec(START_CTX(language), [START_ANGLE], 1).classify(content)) },
  { kind: "START_MERGE", id: "start.merge.v1", material: [field("said", []), field("suggestions", START_SUGGESTIONS.map((one) => ({ id: one.viewpoint_id,
    title: one.title, question: one.question, why: one.why })))],
    accept: (content, language) => issuesOf(startMergeSpec(START_CTX(language), { said: [], viewpoints: START_SUGGESTIONS }).classify(content)) },
  { kind: "START_MERGE_LATE", id: "start.merge-late.v1", material: [field("said", []), field("new_suggestions", [{ id: "pt21", title: "Winter",
    question: "Does winter matter?", why: "Half the year is quiet." }])],
  accept: (content, language) => issuesOf(startMergeLateSpec(START_CTX(language), { said: [], prior: START_PRIOR, viewpoints: START_LATE }).classify(content)) },
  { kind: "START_COMBINE", id: "start.combine.v1", material: [], accept: (content) => zodIssues(startCombineReplySchema.safeParse(JSON.parse(content))) },
  { kind: "START_FIT", id: "start.fit.v1", material: [], accept: (content) => zodIssues(startFitReplySchema.safeParse(JSON.parse(content))) }
];

describe("the stand-in's default replies pass the code's own readers", () => {
  it("covers every kind", () => {
    expect(new Set(ROWS.map((row) => row.kind))).toEqual(new Set(Object.values(LATER_CONTRACT_KINDS)));
  });

  for (const language of ["en", "ro"] as readonly StubLanguage[]) {
    it.each(ROWS.map((row) => [row.id, row] as const))(`${language}: %s`, (_id, row) => {
      const chat = chatOf(contractOf(row.id), [...row.material, field("question_line", "Q")]);
      expect(classifyGateRequest(chat)).toBe(row.kind);
      expect(row.accept(laterStepContent(row.kind, chat, language), language)).toEqual([]);
    });
  }
});

/** Every call-site name, as the code builds it, with the family the report names it by and a default reply to re-check. */
const SITES: readonly (readonly [string, string, LaterGateKind | null])[] = [
  ["STORY:CHARTS:1", "STORY_CHARTS", "STORY_CHARTS"],
  [pathRewriteSuggestCallSiteKey(1), "SUGGESTIONS", "SUGGESTIONS"],
  [pathRewriteCallSiteKey("WRITER", 1), "PATH_REWRITE", "PATH_REWRITE_WRITER"],
  [pathRewriteCallSiteKey("CHECKER", 1), "PATH_REWRITE", "PATH_REWRITE_CHECKER"],
  [pathRewriteCallSiteKey("WRITER", 1, "PATH_CLIMB"), "PATH_CLIMB", "PATH_REWRITE_WRITER"],
  [pathRewriteCallSiteKey("CHECKER", 2, "PATH_CLIMB"), "PATH_CLIMB", "PATH_REWRITE_CHECKER"],
  [investigationReportCallSiteKey("ANSWER", 1), "REPORT", "REPORT_ANSWER"],
  [investigationReportCallSiteKey("ANSWER_ASKED", 1), "REPORT", "REPORT_ANSWER"],
  [investigationReportCallSiteKey("ANSWER_CHECK", 1), "REPORT", "REPORT_ANSWER_CHECK"],
  [investigationReportCallSiteKey("STORY", 1), "REPORT", "REPORT_STORY"],
  [investigationReportCallSiteKey("STORY_CHECK", 1), "REPORT", "REPORT_STORY_CHECK"],
  [answerUpdateCallSiteKey("ANSWER", 1), "ANSWER_UPDATE", "REPORT_ANSWER"],
  [answerUpdateCallSiteKey("ANSWER_CHECK", 1), "ANSWER_UPDATE", "REPORT_ANSWER_CHECK"],
  [publicReportCallSiteKey("ANSWER", 1), "PUBLIC_REPORT", "REPORT_ANSWER"],
  [publicReportCallSiteKey("STORY_CHECK", 1), "PUBLIC_REPORT", "REPORT_STORY_CHECK"],
  ["CONTRIBUTION_CHECK:CHECKER:1", "CONTRIBUTION_CHECK", "CONTRIBUTION_CHECK"],
  ["WEB:plan", "WEB", "WEB_PLAN"], ["WEB:plan:seat:runnerUp", "WEB", "WEB_PLAN"], ["WEB:plan:2", "WEB", "WEB_DIG_PLAN"],
  ["WEB:read1:0:0", "WEB", "WEB_READ_ALL"], ["WEB:pick:0", "WEB", "WEB_PICK"], ["WEB:read-top:0:2", "WEB", "WEB_READ_TOP"],
  ["WEB_RESEARCHED:read1", "WEB_RESEARCHED", "WEB_READ_ALL"], ["WEB_RESEARCHED:read-top:2", "WEB_RESEARCHED", "WEB_READ_TOP"]
];
const SITE_CHAT = (kind: LaterGateKind): string => {
  const row = ROWS.find((candidate) => candidate.kind === kind)!;
  return chatOf(contractOf(row.id), [...row.material, field("question_line", "Q")]);
};

describe("the practice's report names every call site", () => {
  const prefixes = allOf(/\b[A-Z_]*CALL_SITE_PREFIX\b[^=\n]*=\s*"([A-Z_]+:)"/gu);
  const patterns = allOf(/\b[A-Z_]*CALL_SITE\b[^=\n]*=\s*\/\^([A-Z_]+:)/gu);

  it("found the code's call-site families (a scan that finds nothing would prove nothing)", () => {
    expect(prefixes).toEqual(expect.arrayContaining(["ANSWER_UPDATE:", "CONTRIBUTION_CHECK:", "INVESTIGATION_REPORT:", "PATH_CLIMB:", "PATH_REWRITE:", "PUBLIC_REPORT:", "WEB_RESEARCHED:"]));
    expect(patterns).toEqual(expect.arrayContaining(["PATH_REWRITE:", "PUBLIC_REPORT:"]));
  });

  it("no family in the code reads as UNMAPPED", () => {
    // STORY: names no job by itself: its three jobs are read by their second word, STORYTELLER, CHECKER and CHARTS.
    expect([...prefixes, ...patterns].filter((family) => family !== "STORY:" && callFamilyOf(`${family}WRITER:1`) === "UNMAPPED")).toEqual([]);
    for (const site of ["STORY:STORYTELLER:1", "STORY:CHECKER:1", "STORY:CHARTS:1"]) expect(callFamilyOf(site)).not.toBe("UNMAPPED");
  });

  it.each(SITES.map((site) => [site[0], site] as const))("%s has its family and step, and its reply is re-checked by its own form", (key, [, family, kind]) => {
    expect(callFamilyOf(key)).toBe(family);
    expect(practiceStepOf(key)).not.toBe("UNMAPPED");
    const reply = laterStepContent(kind!, SITE_CHAT(kind!), "en");
    expect(recheckReply(key, reply)).toEqual({ family, issues: [] });
    // A try that repairs it is read as the step it repairs, its own family staying STRUCTURE_REPAIR.
    expect(recheckReply(`REPAIR:STRUCTURE:${key}`, reply)).toEqual({ family: "STRUCTURE_REPAIR", issues: [] });
    // Control: a reply of no form is refused, and refused as that step's, never as UNMAPPED.
    const refused = recheckReply(key, "{\"nothing\":1}").issues;
    expect(refused.length).toBeGreaterThan(0);
    expect(refused).not.toContain("UNMAPPED");
  });

  it("a call the report cannot name keeps the practice from passing: NOT_PROVEN, by its name", () => {
    const base = { harnessError: null, completed: true, servedAnswer: true, storyOutcome: "READY", formatFailures: 0, failedCalls: 0, gateHalted: false,
      gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {} } as const;
    expect(practiceVerdict(base).verdict).toBe("PASS");
    expect(practiceVerdict({ ...base, unmappedCallSites: ["NEW:SITE:1"] })).toMatchObject({ verdict: "NOT_PROVEN", reasons: ["CALL_SITE_UNMAPPED:NEW:SITE:1"] });
  });
});
