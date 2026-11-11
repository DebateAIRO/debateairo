// What the preview gate stand-in (tests/support/preview-gate-stubs.ts) knows of the calls beyond a debate's own arguing and
// its story: the story's charts, the suggestions, the web step, a dig's rewrite and climb, the final report, the main-answer
// update, the public debate's two checks, a public report, the ask page's clarify call and the question check every ask passes
// (on the preview it goes through the Anthropic gate since 2026-11-02; a healthy question by default), and the path steps after Start
// (V4 start step: the gap round, each path's answer so far and its check, story v5 and its check). One row per contract id, and one
// valid default reply per kind, written from the request's own material, in the language the request names.
//
// A contract with no row here (or in the stand-in's own classifier) is "UNKNOWN" at the gate: a billed vendor 500, recorded,
// and every practice test refuses an UNKNOWN request. tests/unit/preview-gate-stand-in-coverage.test.ts reads the code's own
// contract ids and call sites, so a new one that nobody told the stand-in fails there first, with its name.
import { readPromptFrame, type PromptPacket } from "@debateai/providers";
// V4 start step (Task 52): story v5's check names its own eight criteria.
import { STORY_PATHS_CHECK_CRITERIA } from "@debateai/story";
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import type { StubLanguage } from "./preview-gate-stubs.js";

export type LaterGateKind = "STORY_CHARTS" | "SUGGESTIONS" | "PATH_REWRITE_WRITER" | "PATH_REWRITE_CHECKER" | "REPORT_ANSWER" | "REPORT_ANSWER_CHECK"
  | "REPORT_STORY" | "REPORT_STORY_CHECK" | "CONTRIBUTION_CHECK" | "PUBLIC_REPORT_CHECK" | "ASK_CLARIFY" | "WEB_PLAN" | "WEB_DIG_PLAN" | "WEB_READ_ALL"
  | "WEB_PICK" | "WEB_READ_TOP" | "QUESTION_CHECK" | "START_LIST" | "START_MERGE" | "START_MERGE_LATE" | "START_COMBINE" | "START_FIT"
  // V4 start step (Task 52): the path steps after Start: the gap round, each path's answer so far and its check, and story v5 and its check.
  | "PATH_GAP" | "PATH_OUTCOME_WRITER" | "PATH_OUTCOME_CHECKER" | "STORY_PATHS" | "STORY_PATHS_CHECK";

/** Every version is a row of its own: a new version may ask for a new form, so it is new to the stand-in until someone looks. */
export const LATER_CONTRACT_KINDS: Readonly<Record<string, LaterGateKind>> = Object.freeze({
  "story.charts.v2": "STORY_CHARTS",
  "web.suggest.v1": "SUGGESTIONS", "web.suggest-dig.v1": "SUGGESTIONS",
  "path-rewrite.writer.v1": "PATH_REWRITE_WRITER", "path-rewrite.writer.v2": "PATH_REWRITE_WRITER",
  "path-rewrite.checker.v1": "PATH_REWRITE_CHECKER", "path-rewrite.checker.v2": "PATH_REWRITE_CHECKER",
  "report.answer.v1": "REPORT_ANSWER", "report.answer.v2": "REPORT_ANSWER", "report.answer.v3": "REPORT_ANSWER", "report.answer.v4": "REPORT_ANSWER",
  "report.answer.later.v1": "REPORT_ANSWER", "report.answer.later.v2": "REPORT_ANSWER", "report.answer.later.v3": "REPORT_ANSWER", "report.answer.later.v4": "REPORT_ANSWER",
  "report.answer-check.v1": "REPORT_ANSWER_CHECK", "report.answer-check.v2": "REPORT_ANSWER_CHECK", "report.answer-check.v3": "REPORT_ANSWER_CHECK",
  "report.story.v1": "REPORT_STORY", "report.story-check.v1": "REPORT_STORY_CHECK",
  "public.contribution-check.v1": "CONTRIBUTION_CHECK", "public.report-check.v1": "PUBLIC_REPORT_CHECK",
  "ask.clarify.v1": "ASK_CLARIFY",
  "question.start-check.v2": "QUESTION_CHECK",
  "web.plan.v1": "WEB_PLAN", "web.plan.v2": "WEB_PLAN",
  "web.plan-dig.v1": "WEB_DIG_PLAN", "web.plan-dig.v2": "WEB_DIG_PLAN", "web.plan-dig.v3": "WEB_DIG_PLAN",
  "web.read-all.v1": "WEB_READ_ALL", "web.read-all.v2": "WEB_READ_ALL",
  "web.pick.v1": "WEB_PICK", "web.pick.v2": "WEB_PICK",
  "web.read-top.v1": "WEB_READ_TOP", "web.read-top.v2": "WEB_READ_TOP",
  // V4 start step (Task 22): the step before Start's list writers, merge, late merge, combine and fit.
  "start.list.v1": "START_LIST", "start.merge.v1": "START_MERGE", "start.merge-late.v1": "START_MERGE_LATE", "start.combine.v1": "START_COMBINE",
  "start.fit.v1": "START_FIT",
  // V4 start step (Task 52): the path steps after Start (drafts until Task 92 seals them). map.gap-paths.v1 is no map contract name
  // (the stand-in coverage's stale-row check proves it), so this row, not the debate map's script, answers it.
  "map.gap-paths.v1": "PATH_GAP", "path.outcome.v1": "PATH_OUTCOME_WRITER", "path.outcome-check.v1": "PATH_OUTCOME_CHECKER",
  "story.paths.v5": "STORY_PATHS", "story.paths-check.v5": "STORY_PATHS_CHECK",
  // V4 start step (Task 76d): the clarifying call's version 2 (a draft until Task 92 seals it). Version 1's reply is version 2's too
  // (its sentences, place mark and care question are optional), so the same default answers it.
  "ask.clarify.v2": "ASK_CLARIFY"
});

const LATER_PROSE = Object.freeze({
  en: Object.freeze({
    question: "Does the evidence hold in winter?",
    why: "It could change how far this path reaches.",
    line: "This path holds up for now.",
    summary: "The follow-up debate supported this path.",
    changed: "The follow-up debate added a reason for this path.",
    view: "The person's view was weighed against the follow-up debate.",
    answer: "The positions were argued, and the first one held up.",
    change: "A stronger, sourced objection would change the answer.",
    clarifyPurpose: "What do you want the answer for?",
    clarifyAnswers: ["To decide something", "To understand it better"],
    noSearch: "This answer rests on reasoning that needs no outside source.",
    adds: "It adds a figure.",
    note: "The page reports one figure.",
    pathTitle: "Winter supply",
    // V4 start step (Task 52): the path steps after Start.
    gapPoints: ["Nobody has asked what this would cost to run in its first winter.", "Nobody has asked who pays if the works run late."],
    outcomeLine: "This path holds up so far.",
    outcomeSummary: "The arguing on this path supported its answer.",
    outcomeChanged: "The arguing added a reason for this path.",
    outcomeView: "The person's words were weighed against the points argued on this path.",
    storyHeadline: "The paths were argued, and the answer held up.",
    storySummary: "You asked a question; each path was argued on its own, and the answer weighs them all.",
    storyConfidence: "Fairly sure, until a sourced objection turns up.",
    storyPathLine: "This path came out where its answer so far says.",
    storyReason: "The answer rests on what the paths found.",
    storySections: ["What you are deciding", "What the paths found", "What would change it"],
    storyParagraph: "Each path was argued on its own terms."
  }),
  ro: Object.freeze({
    question: "Rezistă dovezile și iarna?",
    why: "Ar putea schimba cât de departe ajunge această cale.",
    line: "Această cale rezistă deocamdată.",
    summary: "Dezbaterea următoare a susținut această cale.",
    changed: "Dezbaterea următoare a adăugat un motiv pentru această cale.",
    view: "Părerea persoanei a fost cântărită față de dezbaterea următoare.",
    answer: "Pozițiile au fost argumentate, iar prima a rezistat.",
    change: "O obiecție mai puternică și cu sursă ar schimba răspunsul.",
    clarifyPurpose: "Pentru ce doriți răspunsul?",
    clarifyAnswers: ["Ca să iau o decizie", "Ca să înțeleg mai bine"],
    noSearch: "Acest răspuns se sprijină pe un raționament care nu cere o sursă din afară.",
    adds: "Adaugă o cifră.",
    note: "Pagina prezintă o cifră.",
    pathTitle: "Aprovizionarea iarna",
    // V4 start step (Task 52): the path steps after Start.
    gapPoints: ["Nimeni nu a întrebat cât ar costa funcționarea în prima iarnă.", "Nimeni nu a întrebat cine plătește dacă lucrările întârzie."],
    outcomeLine: "Această cale rezistă până acum.",
    outcomeSummary: "Argumentele de pe această cale i-au susținut răspunsul.",
    outcomeChanged: "Argumentele au adăugat un motiv pentru această cale.",
    outcomeView: "Cuvintele persoanei au fost cântărite față de argumentele de pe această cale.",
    storyHeadline: "Căile au fost argumentate, iar răspunsul a rezistat.",
    storySummary: "Ați pus o întrebare; fiecare cale a fost argumentată separat, iar răspunsul le cântărește pe toate.",
    storyConfidence: "Destul de sigur, până când apare o obiecție cu sursă.",
    storyPathLine: "Această cale a ajuns unde spune răspunsul ei de până acum.",
    storyReason: "Răspunsul se sprijină pe ce au găsit căile.",
    storySections: ["Ce decideți", "Ce au găsit căile", "Ce l-ar schimba"],
    storyParagraph: "Fiecare cale a fost argumentată în termenii ei."
  })
});

/**
 * The default reply to a later step's request: valid by its contract, and spending nothing further. The web planner plans no
 * search (a scenario that wants pages answers through its override), and the two public checks let everything through.
 */
export function laterStepContent(kind: LaterGateKind, chat: string, language: StubLanguage): string {
  const frame = readFramedMaterial(wirePacket(chat));
  const prose = LATER_PROSE[language];
  const text = (name: string): string | undefined => frame.fields.find((field) => field.name === name)?.content;
  const list = <T>(name: string): T[] => JSON.parse(text(name) ?? "[]") as T[];
  const satisfied = { satisfied: true, problem: null, part: null };
  switch (kind) {
    // No block planned: the story keeps its text, and code still builds the ranking where it always does.
    case "STORY_CHARTS": return JSON.stringify({ question_form: "best-way", charts: [], tables: [] });
    case "SUGGESTIONS": {
      const ref = [...list<{ ref: string }>("for"), ...list<{ ref: string }>("against")][0]?.ref ?? "f1";
      return JSON.stringify({ suggestions: [{ side: "for", question: prose.question, why: prose.why, rests_on: [ref] }] });
    }
    case "PATH_REWRITE_WRITER": {
      const path = JSON.parse(text("path") ?? "{}") as { points?: { ref: string }[] };
      const digPaths = list<{ ref: string; points?: { ref: string }[] }>("dig_paths");
      const refs = [...(path.points ?? []), ...digPaths.flatMap((digPath) => digPath.points ?? [])].map((point) => point.ref);
      const personWords = list<{ marked: string }>("picks").some((pick) => pick.marked !== "AI_SUGGESTION");
      return JSON.stringify({ line: prose.line, summary: prose.summary,
        what_changed: [{ text: prose.changed, rests_on: [refs[0] ?? "P1"] }], fate: "HELD_UP",
        view: personWords ? { outcome: "NOT_SETTLED", scope: "PATH", reason: prose.view } : null,
        dig_paths: digPaths.map((digPath) => ({ position_ref: digPath.ref, line: prose.line, fate: "HELD_UP" })) });
    }
    case "PATH_REWRITE_CHECKER": return JSON.stringify(satisfied);
    case "REPORT_ANSWER": return JSON.stringify({ segments: [{ text: prose.answer, rests_on: [] }] });
    case "REPORT_ANSWER_CHECK": return JSON.stringify(satisfied);
    case "REPORT_STORY": return JSON.stringify({ short_answer: prose.answer, what_would_change: prose.change, how_it_went: [], still_open: [] });
    case "REPORT_STORY_CHECK": return JSON.stringify({ ...satisfied, misleading: false });
    case "CONTRIBUTION_CHECK": return JSON.stringify({ verdict: "ALLOW", reason: null });
    case "PUBLIC_REPORT_CHECK": return JSON.stringify({ verdict: "NOT_FOUND", reason: null, quote: null });
    case "ASK_CLARIFY": return JSON.stringify({ questions: [], purpose: { text: prose.clarifyPurpose, answers: prose.clarifyAnswers } });
    // The check's answer form (apps/api/src/question-check/verdict.ts): the call's own marker back, no subject, healthy.
    case "QUESTION_CHECK": return JSON.stringify({ call: /[0-9a-f]{32}/u.exec(readPromptFrame(wirePacket(chat) as unknown as PromptPacket).fence)?.[0] ?? "",
      subject: "NONE", healthy: true });
    case "WEB_PLAN": {
      const answers = list<{ answer_id: string }>("answers").map((answer) =>
        ({ answer_id: answer.answer_id, needs_search: false, reason: prose.noSearch, pace: null, searches: [] }));
      return JSON.stringify(frame.contractId === "web.plan.v1" ? { answers } : { country: null, answers });
    }
    case "WEB_DIG_PLAN": return JSON.stringify(frame.contractId === "web.plan-dig.v1"
      ? { searches: list<{ pick_id: string }>("picks").map((pick) => ({ pick_id: pick.pick_id, pace: "normal", query: prose.question })) }
      : { country: null, needs_search: false, reason: prose.noSearch, pace: null, searches: [] });
    case "WEB_READ_ALL": return JSON.stringify({ pages: list<{ page_id: string }>("pages").map((page) => ({ page_id: page.page_id, grade: 2, adds: prose.adds,
      ...(frame.contractId === "web.read-all.v1" ? {} : { note: prose.note }), extracts: [] })) });
    case "WEB_PICK": return JSON.stringify({ top: list<{ page_id: string }>("pages").map((page) => page.page_id).slice(0, Number(text("top_count") ?? "3")) });
    case "WEB_READ_TOP": return JSON.stringify({ pages: list<{ page_id: string }>("pages").map((page) => ({ page_id: page.page_id, grade: 3, extracts: [] })),
      worth_looking_into: [] });
    // The step before Start: one path from each angle given; every suggestion a path of its own, nothing marked a repeat, no card, no
    // suggestion; the combine's one path; the person's own view fits no chosen path.
    case "START_LIST": return JSON.stringify({ paths: list<{ angle_id: string }>("angles").map((angle, at) =>
      ({ angle_id: angle.angle_id, title: `${prose.pathTitle} ${String(at + 1)}`, question: prose.question, why: prose.why })) });
    case "START_MERGE": return JSON.stringify({ repeats: [], paths: list<{ id: string }>("suggestions").map((one) => ({ ids: [one.id], title: null, question: null })),
      cards: [], suggestions: [] });
    case "START_MERGE_LATE": return JSON.stringify({ repeats: [],
      paths: list<{ id: string }>("new_suggestions").map((one) => ({ ids: [one.id], title: null, question: null })), fits: [] });
    case "START_COMBINE": return JSON.stringify({ title: prose.pathTitle, question: prose.question });
    case "START_FIT": return JSON.stringify({ fits: null });
    // V4 start step (Task 52): the path steps after Start. The gap round names one point not raised yet, for the first path given (none
    // left: nothing missing); each path's answer so far rests on its first point and has its verdict exactly when the person's own words
    // are there; story v5 gives every path given its line and its own fate, in order, citing only a point given; both checks are satisfied.
    case "PATH_GAP": {
      const raised = new Set(list<string>("already_raised"));
      const text = prose.gapPoints.find((point) => !raised.has(point));
      return JSON.stringify({ points: text === undefined ? [] : [{ text, path: list<{ id: string }>("paths")[0]?.id ?? null }] });
    }
    case "PATH_OUTCOME_WRITER": {
      const ref = list<{ ref: string }>("points")[0]?.ref;
      return JSON.stringify({ line: prose.outcomeLine, summary: prose.outcomeSummary, fate: "HELD_UP",
        what_changed: [{ text: prose.outcomeChanged, rests_on: ref === undefined ? [] : [ref] }],
        view: list<string>("own_words").length > 0 ? { outcome: "NOT_SETTLED", scope: "PATH", reason: prose.outcomeView } : null });
    }
    case "PATH_OUTCOME_CHECKER": return JSON.stringify(satisfied);
    case "STORY_PATHS": {
      const cite = list<{ ref: string }>("points").slice(0, 1).map((point) => point.ref);
      const entry = (body: string) => ({ text: body, node_refs: cite });
      return JSON.stringify({
        short: { headline: prose.storyHeadline, summary: prose.storySummary, confidence: prose.storyConfidence,
          paths: list<{ id: string; fate?: string }>("paths").map((path) => ({ position_ref: path.id, fate: path.fate ?? "SET_ASIDE",
            line: prose.storyPathLine, node_refs: cite })),
          change: entry(prose.change) },
        why: { reasons: [entry(prose.storyReason)] },
        reviewer_note: null,
        long: { sections: prose.storySections.map((title) => ({ title, paragraphs: [entry(prose.storyParagraph)] })) }
      });
    }
    case "STORY_PATHS_CHECK": return JSON.stringify({ satisfied: true, misleading: false, objection: null,
      criteria: Object.fromEntries(STORY_PATHS_CHECK_CRITERIA.map((name) => [name, true])) });
  }
}
