// tests/unit/engine-map-practice.test.ts
import { describe, expect, it } from "vitest";
import { MAP_OPPOSITE_TEMPLATES, mapEnginePromptContracts, mapOppositeTemplate, mapPromptContracts } from "@debateai/map";
import { buildFramedPrompt } from "@debateai/providers";
import {
  PRACTICE_MAP_STEPS, practiceJsonRepairOf, practiceMapEngineOf, practiceMapLengthedOf, practiceMapStepOf, recheckReply
} from "../../tools/preview-practice/practice-lanes.js";
import {
  practiceAnswerCheckBlock, practiceCheckEmptyReasons, practiceMapFallbacks, practiceShapeBlock, practiceShapeLines, practiceTemplateFillsDebated
} from "../../tools/preview-practice/practice-shape.js";

// FINAL Ruling D4(b) encoding: every check entry carries the required cost_can_be_named.
const CHECK = JSON.stringify({ checks: [{ check_id: "A1", answers_question: true, adds_unstated_fact: false, cost_can_be_named: true, reason: null }] });
const LIST = JSON.stringify({ points: [1, 2, 3].map((n) => ({ claim: `Point ${String(n)}.`, why_it_matters: "It matters.", leans: "context",
  rests_on: "question" })), candidate_answers: ["Yes, where buses run full."] });

/** INTERFACE §15.4 (R3): the practice report's answer check and the map's fallback counts, codes only. */
describe("practice: engine 2's map", () => {
  it("knows the check step, tells an engine-2 call by its contract, and re-reads its reply by engine 2's reading", () => {
    expect(PRACTICE_MAP_STEPS.at(-1)).toBe("check");
    expect(practiceMapStepOf("MAP:check")).toBe("check");
    expect(practiceJsonRepairOf(CHECK, "stop", "MAP:check", null, true, true)).toBe("MAP_IDS_NORMALISED");
    expect(practiceJsonRepairOf(LIST, "stop", "MAP:list:0", null, true, true)).toBeNull();
    const framed = buildFramedPrompt({ contract: mapEnginePromptContracts().check, material: [{ name: "question_line", content: "Q?" }] }).packet;
    expect(practiceMapEngineOf(framed.messages)).toBe(true);
    // An engine-2 call is always lengthed (pre-flight PF-R35.15).
    expect(practiceMapLengthedOf(framed.messages)).toBe(true);
    const today = buildFramedPrompt({ contract: mapPromptContracts().choose, material: [{ name: "question_line", content: "Q?" }] }).packet;
    expect(practiceMapEngineOf(today.messages)).toBe(false);
    expect(practiceMapLengthedOf(today.messages)).toBe(false);
  });

  it("a recheck reads an engine-2 reply by engine 2's readings only; engine 1's readings know no check (pre-flight PF-R35.15)", () => {
    expect(recheckReply("MAP:list:0", LIST, null, true, true).issues).toEqual([]);
    // DEVIATION from the brief, accepted by controller ruling R3-T17.2: the brief pinned
    // `recheckReply("MAP:list:0", LIST, null, true, false).issues.length > 0`, but engine 1's lengthed reading ACCEPTS a v2
    // list (actual issues: []) by DROPPING the unasked `rests_on` keys. That difference is a repair, which the re-check does
    // not list and the repair reading names, so a re-read that forgot the engine flag stays visible: engine 1's reading
    // reports INNER_UNASKED_KEYS (rests_on dropped), engine 2's reports no repair (rests_on kept, as its schema asks).
    expect(recheckReply("MAP:list:0", LIST, null, true, false).issues).toEqual([]);
    expect(practiceJsonRepairOf(LIST, "stop", "MAP:list:0", null, true, false)).toBe("INNER_UNASKED_KEYS");
    expect(practiceJsonRepairOf(LIST, "stop", "MAP:list:0", null, true, true)).toBeNull();
    // Engine 2's reading requires rests_on on every point (a list without it is refused there, accepted by engine 1's), so
    // its "no repair" means every rests_on was read and kept.
    const withoutRestsOn = JSON.stringify({ ...JSON.parse(LIST) as object, points: (JSON.parse(LIST) as { points: Record<string, unknown>[] })
      .points.map(({ rests_on: _dropped, ...point }) => point) });
    expect(recheckReply("MAP:list:0", withoutRestsOn, null, true, true).issues)
      .toEqual(["invalid_value@points.0.rests_on", "invalid_value@points.1.rests_on", "invalid_value@points.2.rests_on"]);
    expect(recheckReply("MAP:list:0", withoutRestsOn, null, true, false).issues).toEqual([]);
    expect(recheckReply("MAP:check", CHECK, null, true, true).issues).toEqual([]);
    expect(recheckReply("MAP:check", CHECK, null, true, false).issues).toEqual(["UNMAPPED"]);
  });

  it("counts each test, the premise-exempt answers and the assumptions per answer from the codes; fallbacks from the marks (D1)", () => {
    // FINAL Ruling D4(b) encoding: an outcome names EACH failed test, in the order answer / fact / cost.
    const codes = ["a1:PASSED", "a2:NOT_AN_ANSWER>c1", "a3:NOT_AN_ANSWER+ADDED_FACT>DROPPED", "a4:NO_COST>DROPPED", "c1:PASSED",
      "c2:ADDED_FACT+NO_COST"];
    expect(practiceAnswerCheckBlock(codes, {}, { premiseExempt: 1, assumptionsPerAnswer: [1, 0] }))
      .toEqual({ checked: 6, rejected: 4, notAnAnswer: 2, addedFact: 2, noCost: 2, premiseExempt: 1, replaced: 1, dropped: 2,
        keptUnchecked: 0, unavailable: 0, assumptionsPerAnswer: [1, 0] });
    expect(practiceAnswerCheckBlock(["a1:UNCHECKED", "a2:UNCHECKED"], { MAP_CHECK_UNAVAILABLE: 1 }, { premiseExempt: 0, assumptionsPerAnswer: [0, 2] }))
      .toEqual({ checked: 0, rejected: 0, notAnAnswer: 0, addedFact: 0, noCost: 0, premiseExempt: 0, replaced: 0, dropped: 0,
        keptUnchecked: 0, unavailable: 1, assumptionsPerAnswer: [0, 2] });
    expect(practiceAnswerCheckBlock(null, {}, { premiseExempt: null, assumptionsPerAnswer: null })).toBeNull();
    expect(practiceMapFallbacks({ MAP_MERGE_FALLBACK: 1, ANSWERS_FILLED: 2 })).toEqual({ merge: 1, choose: 0 });
  });
});

/**
 * Carries into Task 17 (R3 progress log): Task 4's empty check reasons ("reason": "", refused by the schema's min(1) and
 * re-asked) and Task 7/8's code-written TEMPLATE fill (PF-R33.13), counted beside the by-test counts. Counts only.
 */
describe("practice: the answer check's carried counts (Tasks 4, 7, 8)", () => {
  it("counts empty check reasons from the refused MAP:check tries' own issues (Task 4), every try, structure repairs included", () => {
    // The real engine-2 reading refuses an empty (or blank) reason, and says where: `too_small@checks.<n>.reason`.
    const empty = JSON.stringify({ checks: [
      { check_id: "a1", answers_question: false, adds_unstated_fact: false, cost_can_be_named: true, reason: "" },
      { check_id: "a2", answers_question: true, adds_unstated_fact: true, cost_can_be_named: true, reason: "  " }] });
    const issues = recheckReply("MAP:check", empty, null, true, true).issues;
    expect(issues).toEqual(expect.arrayContaining(["too_small@checks.0.reason", "too_small@checks.1.reason"]));
    expect(practiceCheckEmptyReasons([
      { callSiteKey: "MAP:check", issues, recheckIssues: [] },
      // A structure-repair try of the check is the check's (LG-A); its stored issues may be empty, then its recheck counts.
      { callSiteKey: "REPAIR:STRUCTURE:MAP:check", issues: [], recheckIssues: ["too_small@checks.2.reason"] },
      // Another step's empty text is not the check's reason.
      { callSiteKey: "MAP:choose", issues: ["too_small@answers.0.statement"], recheckIssues: [] },
      { callSiteKey: "MAP:check", issues: ["invalid_type@checks.0.cost_can_be_named"], recheckIssues: [] }
    ])).toBe(3);
    expect(practiceCheckEmptyReasons([])).toBe(0);
  });

  it("counts TEMPLATE fills DEBATED (Tasks 7, 8): a filled answer whose words are the code's template; a replaced fill is not one", () => {
    const template = mapOppositeTemplate("Yes, build it.", "ro-RO");
    const empty = MAP_OPPOSITE_TEMPLATES.de!.empty;
    expect(practiceTemplateFillsDebated([
      { statement: "Yes, build it.", filled: false },
      { statement: template, filled: true },
      { statement: empty, filled: true },
      // A fill from the map's own candidates or the opposite-case list is not code-written text.
      { statement: "No, keep it as it is.", filled: true },
      // The check replaced a template fill: the answer now holds the candidate's words and `filled: false` (check.ts).
      { statement: "Only for the night lines.", filled: false }
    ])).toBe(2);
    expect(practiceTemplateFillsDebated([])).toBe(0);
  });

  it("the block and the report line carry both counts beside the by-test counts, engine 2 only", () => {
    const facts = { storedDepthParams: null, sizes: null, marks: { MAP_ANSWER_REPLACED: 1 }, choice: null, mapCallSiteKeys: ["MAP:check"],
      answerCheckCodes: ["a1:PASSED", "a2:NOT_AN_ANSWER>c1", "c1:PASSED"], checkPremiseExempt: 0, assumptionsPerAnswer: [1, 0],
      templateFillsDebated: 1 };
    const block = practiceShapeBlock({ source: "FLAG", registerVersion: "6", row: "ADDED", asked: {}, facts, checkEmptyReasons: 2 });
    expect(block.answerCheck).toEqual({ checked: 3, rejected: 1, notAnAnswer: 1, addedFact: 0, noCost: 0, premiseExempt: 0, replaced: 1,
      dropped: 0, keptUnchecked: 0, unavailable: 0, assumptionsPerAnswer: [1, 0], emptyReasons: 2, templateFillsDebated: 1 });
    expect(block.mapCallsByStep.check).toBe(1);
    expect(practiceShapeLines(block)).toEqual(expect.arrayContaining([
      "- answer check: 3 checked, 1 rejected (1 not an answer, 0 adding a fact, 0 with no cost named), 0 exempt as premise challenges; "
        + "1 replaced, 0 dropped, 0 kept, 0 unavailable; assumptions per answer 1, 0 (mean 0.5, max 1); "
        + "2 empty reasons refused; 1 template fill debated",
      "- map fallbacks: merge 0, choose 0"]));
    // Engine 1 (no check row): no answer-check block and no carried count, whatever is passed.
    const engineOne = practiceShapeBlock({ source: "FLAG", registerVersion: "6", row: "ADDED", asked: {}, checkEmptyReasons: 2,
      facts: { storedDepthParams: null, sizes: null, marks: {}, choice: null, mapCallSiteKeys: [], answerCheckCodes: null,
        checkPremiseExempt: null, assumptionsPerAnswer: null } });
    expect(engineOne.answerCheck).toBeNull();
  });
});
