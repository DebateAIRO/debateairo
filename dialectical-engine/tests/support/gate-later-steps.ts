// What the preview gate stand-in (tests/support/preview-gate-stubs.ts) knows of the calls beyond a debate's own arguing and
// its story: the story's charts, the suggestions, the web step, a dig's rewrite and climb, the final report, the main-answer
// update, the public debate's two checks, a public report and the ask page's clarify call. One row per contract id, and one
// valid default reply per kind, written from the request's own material, in the language the request names.
//
// A contract with no row here (or in the stand-in's own classifier) is "UNKNOWN" at the gate: a billed vendor 500, recorded,
// and every practice test refuses an UNKNOWN request. tests/unit/preview-gate-stand-in-coverage.test.ts reads the code's own
// contract ids and call sites, so a new one that nobody told the stand-in fails there first, with its name.
import { readFramedMaterial, wirePacket } from "./framed-packet.js";
import type { StubLanguage } from "./preview-gate-stubs.js";

export type LaterGateKind = "STORY_CHARTS" | "SUGGESTIONS" | "PATH_REWRITE_WRITER" | "PATH_REWRITE_CHECKER" | "REPORT_ANSWER" | "REPORT_ANSWER_CHECK"
  | "REPORT_STORY" | "REPORT_STORY_CHECK" | "CONTRIBUTION_CHECK" | "PUBLIC_REPORT_CHECK" | "ASK_CLARIFY" | "WEB_PLAN" | "WEB_DIG_PLAN" | "WEB_READ_ALL"
  | "WEB_PICK" | "WEB_READ_TOP";

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
  "web.plan.v1": "WEB_PLAN", "web.plan.v2": "WEB_PLAN",
  "web.plan-dig.v1": "WEB_DIG_PLAN", "web.plan-dig.v2": "WEB_DIG_PLAN", "web.plan-dig.v3": "WEB_DIG_PLAN",
  "web.read-all.v1": "WEB_READ_ALL", "web.read-all.v2": "WEB_READ_ALL",
  "web.pick.v1": "WEB_PICK", "web.pick.v2": "WEB_PICK",
  "web.read-top.v1": "WEB_READ_TOP", "web.read-top.v2": "WEB_READ_TOP"
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
    note: "The page reports one figure."
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
    note: "Pagina prezintă o cifră."
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
  }
}
