import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replyLanguageExpectation } from "@debateai/kernel";
import { planPatchFollowUp } from "@debateai/providers";
import {
  mapAnglesCheck,
  mapAnglesReplySchema,
  mapChooseCheck,
  mapChooseReplySchema,
  mapClassifyReply,
  mapGapCheck,
  mapGapReplySchema,
  mapListCheck,
  mapListReplySchema,
  mapMergeCheck,
  mapMergeReplySchema,
  mapSnowballReplySchema,
  mapWrongLanguage
} from "@debateai/map";

const STOP = { finishReason: "stop" };
// Ruling R-5: the expectation is built once per question from its line, by the kernel's reply-side check.
const RO = replyLanguageExpectation("Ar trebui România să adopte euro în următorii cinci ani?");
const EN = replyLanguageExpectation("Should a city make its central buses free to ride?");
const RO_WHY = "Ar putea schimba răspunsul la întrebare.";
const point = (claim: string, why = "It could change the answer.") => ({ claim, why_it_matters: why, leans: "context" });
const ANGLES = { angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "The other side", focus: "The strongest case for another answer." },
  { angle_id: "worry", kind: "ASKER_WORRY", label: "The worry", focus: "What the person asking fears." },
  { angle_id: "do", kind: "PRACTICAL", label: "What to do", focus: "What to do next." },
  { angle_id: "cost", kind: "SPECIFIC", label: "Cost", focus: "Who pays for it." }
] };
const EN_POINTS = ["The cost of the change is high and the state should pay it.", "The people who use it most are poor.",
  "The change can be undone later if it fails."].map((claim) => point(claim));
const RO_POINTS = ["Costul schimbării este mare și statul ar trebui să îl plătească.", "Cei care îl folosesc cel mai mult sunt săraci.",
  "Schimbarea poate fi anulată mai târziu dacă nu merge."].map((claim) => point(claim, RO_WHY));
// Stray script (2026-10-21): real replies with Chinese characters inside a sentence in the question's language, verbatim.
const STRAY = JSON.parse(readFileSync(new URL("../support/fixtures/reply-language/stray-script-2026-10.json", import.meta.url), "utf8")) as {
  readonly cases: readonly { question: string; text: string }[];
};
const issuesOf = (parseError: string | null) => JSON.parse(parseError ?? "[]") as { code: string; path: (string | number)[]; message: string }[];

describe("map replies: angles", () => {
  it("accepts the three fixed kinds plus one SPECIFIC", () => {
    const out = mapClassifyReply(JSON.stringify(ANGLES), STOP, mapAnglesReplySchema, mapAnglesCheck);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(out.value?.angles).toHaveLength(4);
  });

  it("refuses a missing fixed kind, and a reused angle_id at its own path", () => {
    const noWorry = { angles: [ANGLES.angles[0], ANGLES.angles[2], ANGLES.angles[3], { ...ANGLES.angles[3], angle_id: "cost" }] };
    const out = mapClassifyReply(JSON.stringify(noWorry), STOP, mapAnglesReplySchema, mapAnglesCheck);
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    const issues = issuesOf(out.classification.parseError);
    expect(issues.map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual([
      "MAP_ANGLE_ID_REUSED@angles.3.angle_id", "MAP_ANGLE_KINDS_WRONG@angles"]);
  });

  it("final review M3: the planner's measured-only question_language never costs a re-ask, whatever it holds", () => {
    for (const value of [null, "", "   ", { code: "ro" }, "x".repeat(36), 7, ["ro"]]) {
      const out = mapClassifyReply(JSON.stringify({ question_language: value, ...ANGLES }), STOP, mapAnglesReplySchema, mapAnglesCheck);
      expect(out.classification, JSON.stringify(value)).toEqual({ parseStatus: "PARSED", parseError: null });
      expect(out.value?.question_language, JSON.stringify(value)).toBeUndefined();
      expect(out.value?.angles).toHaveLength(4);
    }
    // A usable code is kept (trimmed); a missing one reads undefined, as before.
    expect(mapClassifyReply(JSON.stringify({ question_language: " ro ", ...ANGLES }), STOP, mapAnglesReplySchema, mapAnglesCheck).value?.question_language)
      .toBe("ro");
    expect(mapClassifyReply(JSON.stringify({ question_language: "x".repeat(35), ...ANGLES }), STOP, mapAnglesReplySchema, mapAnglesCheck).value?.question_language)
      .toBe("x".repeat(35));
    expect(mapClassifyReply(JSON.stringify(ANGLES), STOP, mapAnglesReplySchema, mapAnglesCheck).value?.question_language).toBeUndefined();
    // LG-A (L31): any other unknown key is dropped and named; the planner's measured-only question_language is kept.
    expect(mapClassifyReply(JSON.stringify({ question_language: "ro", extra: 1, ...ANGLES }), STOP, mapAnglesReplySchema, mapAnglesCheck)
      .classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "UNASKED_KEYS" });
  });

  it("refuses an angle kind the planner may not use (GENERAL is the code's own)", () => {
    const general = { angles: [...ANGLES.angles.slice(0, 3), { ...ANGLES.angles[3], kind: "GENERAL" }] };
    expect(mapClassifyReply(JSON.stringify(general), STOP, mapAnglesReplySchema, mapAnglesCheck).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: lists", () => {
  it("accepts 3 points and one candidate answer, and reads a code fence (recording the repair)", () => {
    const body = JSON.stringify({ points: EN_POINTS, candidate_answers: ["Yes, with conditions."] });
    expect(mapClassifyReply(body, STOP, mapListReplySchema, mapListCheck(EN)).classification.parseStatus).toBe("PARSED");
    expect(mapClassifyReply(`\`\`\`json\n${body}\n\`\`\``, STOP, mapListReplySchema, mapListCheck(EN)).classification)
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CODE_FENCE" });
  });

  it("refuses a 241-character claim at points.0.claim, and the gateway would patch exactly that member", () => {
    const content = JSON.stringify({ points: [point("x".repeat(241)), ...EN_POINTS.slice(1), EN_POINTS[0]], candidate_answers: ["Yes."] });
    const out = mapClassifyReply(content, STOP, mapListReplySchema, mapListCheck(EN));
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator.paths).toEqual(["points.0.claim"]);
  });

  it("refuses English points for a Romanian question at a patchable path", () => {
    const content = JSON.stringify({ points: EN_POINTS, candidate_answers: ["Yes, with conditions."] });
    const out = mapClassifyReply(content, STOP, mapListReplySchema, mapListCheck(RO));
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@points"]);
    const ro = JSON.stringify({ points: RO_POINTS, candidate_answers: ["Da, cu condiții."] });
    expect(mapClassifyReply(ro, STOP, mapListReplySchema, mapListCheck(RO)).classification.parseStatus).toBe("PARSED");
  });

  it("checks points and candidate answers apart: English candidate answers for a Romanian question are refused at candidate_answers only, and the patch asks for that member", () => {
    const englishAnswer = "Yes, the change should go ahead, but only with clear conditions on who pays for it.";
    const content = JSON.stringify({ points: RO_POINTS, candidate_answers: [englishAnswer] });
    const out = mapClassifyReply(content, STOP, mapListReplySchema, mapListCheck(RO));
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@candidate_answers"]);
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator.paths).toEqual(["candidate_answers"]);
  });

  it("reads Romanian quotes: „…” inside text, and „…\" closed with a straight quote (the tolerant decode)", () => {
    const quoted = JSON.stringify({ points: [point("Mulți spun „da” și pleacă.", RO_WHY), ...RO_POINTS.slice(1)], candidate_answers: ["Da."] });
    expect(mapClassifyReply(quoted, STOP, mapListReplySchema, mapListCheck(RO)).value?.points[0]?.claim).toBe("Mulți spun „da” și pleacă.");
    const straight = quoted.replace("„da”", "„da\"");
    const out = mapClassifyReply(straight, STOP, mapListReplySchema, mapListCheck(RO));
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_QUOTE" });
    expect(out.value?.points[0]?.claim).toContain("„da\"");
  });

  it("refuses prose with no JSON as a parse failure that names no model text", () => {
    expect(mapClassifyReply("Here are my points: costs.", STOP, mapListReplySchema, mapListCheck(EN)).classification)
      .toEqual({ parseStatus: "PARSE_FAILED", parseError: "MAP_REPLY_NOT_JSON" });
  });

  it("lets a snowball list be empty when nothing new is left", () => {
    const empty = JSON.stringify({ points: [], candidate_answers: [] });
    expect(mapClassifyReply(empty, STOP, mapSnowballReplySchema, mapListCheck(EN)).classification.parseStatus).toBe("PARSED");
    expect(mapClassifyReply(empty, STOP, mapListReplySchema, mapListCheck(EN)).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: merge check: unknown, reused and wrong-kind ids", () => {
  const check = mapMergeCheck(new Set(["pt01", "pt02", "pt03"]), new Set(["ca01"]), EN);
  const merge = (keyPoints: unknown[], answers: unknown[]) => JSON.stringify({ key_points: keyPoints, answers });

  it("accepts groups that use known ids once", () => {
    const content = merge([{ key_point_id: "k1", claim: "Cost", member_item_ids: ["pt01", "pt02"] }],
      [{ answer_id: "a1", answer: "Yes", member_item_ids: ["ca01"] }]);
    expect(mapClassifyReply(content, STOP, mapMergeReplySchema, check).classification.parseStatus).toBe("PARSED");
  });

  it("refuses an unknown id, a reused id, a point id among answers and a reused group id, each at its path", () => {
    const content = merge([
      { key_point_id: "k1", claim: "Cost", member_item_ids: ["pt01", "pt09"] },
      { key_point_id: "k1", claim: "Again", member_item_ids: ["pt01"] }
    ], [{ answer_id: "a1", answer: "Yes", member_item_ids: ["pt02"] }]);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, check);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual([
      "MAP_UNKNOWN_ITEM_ID@key_points.0.member_item_ids.1",
      "MAP_GROUP_ID_REUSED@key_points.1.key_point_id",
      "MAP_ITEM_ID_REUSED@key_points.1.member_item_ids.0",
      "MAP_UNKNOWN_ITEM_ID@answers.0.member_item_ids.0"
    ]);
  });

  it("refuses a merge that places no item at all, at both lists, so the repair path asks again", () => {
    const content = merge([], []);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, check);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`))
      .toEqual(["MAP_MERGE_EMPTY@key_points", "MAP_MERGE_EMPTY@answers"]);
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator).toEqual({ code: "MAP_MERGE_EMPTY", paths: ["key_points", "answers"] });
    // With nothing to place, empty lists stay acceptable.
    expect(mapClassifyReply(content, STOP, mapMergeReplySchema, mapMergeCheck(new Set(), new Set(), EN)).classification.parseStatus).toBe("PARSED");
  });

  // Ruling R-3 (real paid run, 2026-10-13): the language of a field is judged on ALL its texts joined, never on one
  // short claim — the engine's detector misreads single short Romanian sentences with high confidence.
  const roCheckFor = (pointCount: number) => mapMergeCheck(new Set(Array.from({ length: pointCount }, (_, at) => `pt${String(at + 1).padStart(2, "0")}`)),
    new Set(["ca01", "ca02"]), RO);
  const roGroups = (claims: readonly string[]) => claims.map((claim, at) => ({ key_point_id: `k${at + 1}`, claim,
    member_item_ids: [`pt${String(at + 1).padStart(2, "0")}`] }));
  const REAL_RUN_CLAIM_9 = "Renunțarea la leu înseamnă pierderea politicii monetare proprii și a cursului de schimb, instrumente care au amortizat șocurile asimetrice în ultimii douăzeci de ani.";
  const REAL_RUN_CLAIM_16 = "Impactul social depinde de comunicarea tranziției și de controlul prețurilor în perioada de schimb.";
  const RO_CLAIMS = [
    "Adoptarea euro ar reduce costurile de tranzacție pentru firmele care exportă în zona euro.",
    "Dobânzile la credite ar putea scădea dacă riscul valutar dispare.",
    "România nu îndeplinește încă toate criteriile de convergență, mai ales deficitul bugetar.",
    "Prețurile ar putea crește la trecerea la euro, prin rotunjiri în sus.",
    "Investitorii străini preferă de obicei țările cu monedă comună și stabilă.",
    "Salariile sunt încă mult sub media din zona euro, deci convergența reală lipsește.",
    "Banca Națională ar pierde controlul asupra dobânzii de politică monetară.",
    "Bulgaria și Croația au trecut deja la euro, iar experiența lor poate fi studiată.",
    "Încrederea populației în euro este mare, potrivit sondajelor recente.",
    REAL_RUN_CLAIM_9,
    "Disciplina bugetară cerută de zona euro ar putea limita cheltuielile publice.",
    "Trecerea la euro cere ani de pregătire și o dată fixă anunțată din timp.",
    "Turismul și comerțul cu vecinii din zona euro ar deveni mai simple.",
    "Economiile în lei ar fi convertite la un curs fix stabilit la intrare.",
    "Fondurile europene se gestionează mai ușor într-o monedă comună.",
    "Regiunile sărace ar putea suferi dacă nu există transferuri compensatorii.",
    REAL_RUN_CLAIM_16
  ];
  const RO_ANSWERS = [{ answer_id: "a1", answer: "Da, dar numai după ce România îndeplinește criteriile și pregătește bine tranziția.", member_item_ids: ["ca01"] },
    { answer_id: "a2", answer: "Nu acum; leul păstrează instrumente utile până când salariile se apropie de media europeană.", member_item_ids: ["ca02"] }];
  const EN_CLAIMS = ["The cost of the change is high and the state should pay it.", "The people who use it most are poor.",
    "The change can be undone later if it fails."];
  const EN_ANSWERS = [{ answer_id: "a1", answer: "Yes, the change should go ahead, but only with clear conditions on who pays for it.", member_item_ids: ["ca01"] },
    { answer_id: "a2", answer: "No, the city should keep the current system until there is a plan to pay for the change.", member_item_ids: ["ca02"] }];

  // Ruling R-5: the reply-side verdict reads each real claim ALONE as Romanian (the question detector read it as French).
  it.each([["9", REAL_RUN_CLAIM_9], ["16", REAL_RUN_CLAIM_16]])("accepts the real run's Romanian claim %s ALONE as a one-claim key_points field", (_, claim) => {
    expect(mapWrongLanguage(claim, RO)).toBe(false);
    const content = merge(roGroups([claim]), RO_ANSWERS);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, roCheckFor(1));
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(out.value?.key_points[0]?.claim).toBe(claim);
  });

  it("accepts an English merge for an English question", () => {
    const enCheck = mapMergeCheck(new Set(["pt01", "pt02", "pt03"]), new Set(["ca01", "ca02"]), EN);
    expect(mapClassifyReply(merge(roGroups(EN_CLAIMS), EN_ANSWERS), STOP, mapMergeReplySchema, enCheck).classification)
      .toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("lets a short field the verdict cannot judge (UNSURE) pass, whatever its language", () => {
    const content = merge(roGroups(["Costs."]), [{ answer_id: "a1", answer: "Yes.", member_item_ids: ["ca01"] }]);
    expect(mapWrongLanguage("Costs. Yes.", RO)).toBe(false);
    expect(mapClassifyReply(content, STOP, mapMergeReplySchema, roCheckFor(1)).classification).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("accepts the real run's whole Romanian merge reply (regression)", () => {
    const content = merge(roGroups(RO_CLAIMS), RO_ANSWERS);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, roCheckFor(RO_CLAIMS.length));
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(out.value?.key_points[9]?.claim).toBe(REAL_RUN_CLAIM_9);
    expect(out.value?.key_points[16]?.claim).toBe(REAL_RUN_CLAIM_16);
  });

  it("refuses all-English merged claims for a Romanian question at key_points (the whole field), and the patch asks for that field", () => {
    const content = merge(roGroups(EN_CLAIMS), RO_ANSWERS);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, roCheckFor(EN_CLAIMS.length));
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@key_points"]);
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator).toEqual({ code: "MAP_WRONG_LANGUAGE", paths: ["key_points"] });
  });

  it("refuses all-English merged answers for a Romanian question at answers (the whole field), and the patch asks for that field", () => {
    const content = merge(roGroups(RO_CLAIMS.slice(0, 3)), EN_ANSWERS);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, roCheckFor(3));
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@answers"]);
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator).toEqual({ code: "MAP_WRONG_LANGUAGE", paths: ["answers"] });
  });

  it("refuses both fields, each at its own whole-field path, when both are English", () => {
    const content = merge(roGroups(EN_CLAIMS), EN_ANSWERS);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, roCheckFor(EN_CLAIMS.length));
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`))
      .toEqual(["MAP_WRONG_LANGUAGE@key_points", "MAP_WRONG_LANGUAGE@answers"]);
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator).toEqual({ code: "MAP_WRONG_LANGUAGE", paths: ["key_points", "answers"] });
  });
});

describe("map replies: gap", () => {
  it("accepts empty lists, and up to three framing challenges", () => {
    expect(mapClassifyReply(JSON.stringify({ new_points: [], framing_challenges: [] }), STOP, mapGapReplySchema, mapGapCheck(EN))
      .classification.parseStatus).toBe("PARSED");
    const four = JSON.stringify({ new_points: [], framing_challenges: ["a", "b", "c", "d"] });
    expect(mapClassifyReply(four, STOP, mapGapReplySchema, mapGapCheck(EN)).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: choose check", () => {
  const check = mapChooseCheck(new Set(["kp01", "kp02", "kp03"]), EN);
  const answer = (answerId: string, rival: string | null, forIds: string[], against: string[] = []) => ({
    answer_id: answerId, statement: `Yes, because of the plan ${answerId}.`, for: forIds, against, strongest_rival: rival });

  it("accepts one answer (the code fills the second later) and two answers that name each other", () => {
    expect(mapClassifyReply(JSON.stringify({ answers: [answer("a1", null, ["kp01"])] }), STOP, mapChooseReplySchema, check)
      .classification.parseStatus).toBe("PARSED");
    expect(mapClassifyReply(JSON.stringify({ answers: [answer("a1", "a2", ["kp01"]), answer("a2", "a1", [], ["kp01"])] }), STOP,
      mapChooseReplySchema, check).classification.parseStatus).toBe("PARSED");
  });

  it("refuses an unknown point id, a point twice in one answer, a self rival and an unknown rival", () => {
    const content = JSON.stringify({ answers: [answer("a1", "a1", ["kp01", "kp09"], ["kp01"]), answer("a2", "a7", ["kp02"])] });
    const out = mapClassifyReply(content, STOP, mapChooseReplySchema, check);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual([
      "MAP_UNKNOWN_KEY_POINT_ID@answers.0.for.1",
      "MAP_KEY_POINT_REPEATED@answers.0.against.0",
      "MAP_UNKNOWN_RIVAL@answers.0.strongest_rival",
      "MAP_UNKNOWN_RIVAL@answers.1.strongest_rival"
    ]);
  });

  // Ruling R-3: statements are judged joined, at ["answers"], never one short statement alone.
  const roChoose = mapChooseCheck(new Set(["kp01", "kp02", "kp03"]), RO);
  const stated = (statements: readonly string[]) => JSON.stringify({ answers: statements.map((statement, at) => ({
    answer_id: `a${at + 1}`, statement, for: [`kp0${at + 1}`], against: [], strongest_rival: null })) });

  it("accepts Romanian statements, including the real run's short sentence the question detector misread alone", () => {
    const shortRomanian = "Impactul social depinde de comunicarea tranziției și de controlul prețurilor în perioada de schimb.";
    expect(mapWrongLanguage(shortRomanian, RO)).toBe(false);
    const content = stated(["Da, România ar trebui să adopte euro, dar numai după ce îndeplinește criteriile de convergență.", shortRomanian]);
    expect(mapClassifyReply(content, STOP, mapChooseReplySchema, roChoose).classification).toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("refuses all-English statements for a Romanian question at answers (the whole field), and the patch asks for that field", () => {
    const content = stated(["Yes, the change should be made, but only with clear conditions on who pays for it.",
      "No, the city should keep the current system until there is a plan to pay for the change."]);
    const out = mapClassifyReply(content, STOP, mapChooseReplySchema, roChoose);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@answers"]);
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator).toEqual({ code: "MAP_WRONG_LANGUAGE", paths: ["answers"] });
  });

  // Stray script (2026-10-21): the map's own check refuses the same letters the shared reply-language check refuses.
  it("practice 2026-10-14: GLM's Romanian statement with one Chinese character inside a word is the wrong language; the same statement without it is not", () => {
    const map = STRAY.cases[0]!; // MAP:choose, answers.1.statement, Romanian question
    const expected = replyLanguageExpectation(map.question);
    expect(mapWrongLanguage(map.text, expected)).toBe(true);
    expect(mapWrongLanguage(map.text.replace("lovit毙 salariații", "lovit salariații"), expected)).toBe(false);
  });

  it("refuses a second answer whose statement repeats the first once case, punctuation and diacritics are set aside", () => {
    const content = JSON.stringify({ answers: [
      { answer_id: "a1", statement: "Yes, the plan works well.", for: ["kp01"], against: [], strongest_rival: null },
      { answer_id: "a2", statement: "YES — the plan works well!", for: ["kp02"], against: [], strongest_rival: null }] });
    const out = mapClassifyReply(content, STOP, mapChooseReplySchema, check);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_ANSWER_DUPLICATE@answers.1.statement"]);
  });

  it("refuses five answers", () => {
    const five = { answers: ["a1", "a2", "a3", "a4", "a5"].map((id) => answer(id, null, [])) };
    expect(mapClassifyReply(JSON.stringify(five), STOP, mapChooseReplySchema, check).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});
