import { describe, expect, it } from "vitest";
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
  mapSnowballReplySchema
} from "@debateai/map";

const STOP = { finishReason: "stop" };
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

  it("refuses an angle kind the planner may not use (GENERAL is the code's own)", () => {
    const general = { angles: [...ANGLES.angles.slice(0, 3), { ...ANGLES.angles[3], kind: "GENERAL" }] };
    expect(mapClassifyReply(JSON.stringify(general), STOP, mapAnglesReplySchema, mapAnglesCheck).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: lists", () => {
  it("accepts 3 points and one candidate answer, and reads a code fence (recording the repair)", () => {
    const body = JSON.stringify({ points: EN_POINTS, candidate_answers: ["Yes, with conditions."] });
    expect(mapClassifyReply(body, STOP, mapListReplySchema, mapListCheck("en")).classification.parseStatus).toBe("PARSED");
    expect(mapClassifyReply(`\`\`\`json\n${body}\n\`\`\``, STOP, mapListReplySchema, mapListCheck("en")).classification)
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CODE_FENCE" });
  });

  it("refuses a 241-character claim at points.0.claim, and the gateway would patch exactly that member", () => {
    const content = JSON.stringify({ points: [point("x".repeat(241)), ...EN_POINTS.slice(1), EN_POINTS[0]], candidate_answers: ["Yes."] });
    const out = mapClassifyReply(content, STOP, mapListReplySchema, mapListCheck("en"));
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator.paths).toEqual(["points.0.claim"]);
  });

  it("refuses English points for a Romanian question at a patchable path", () => {
    const content = JSON.stringify({ points: EN_POINTS, candidate_answers: ["Yes, with conditions."] });
    const out = mapClassifyReply(content, STOP, mapListReplySchema, mapListCheck("ro"));
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@points"]);
    const ro = JSON.stringify({ points: RO_POINTS, candidate_answers: ["Da, cu condiții."] });
    expect(mapClassifyReply(ro, STOP, mapListReplySchema, mapListCheck("ro")).classification.parseStatus).toBe("PARSED");
  });

  it("checks points and candidate answers apart: English candidate answers for a Romanian question are refused at candidate_answers only, and the patch asks for that member", () => {
    const englishAnswer = "Yes, the change should go ahead, but only with clear conditions on who pays for it.";
    const content = JSON.stringify({ points: RO_POINTS, candidate_answers: [englishAnswer] });
    const out = mapClassifyReply(content, STOP, mapListReplySchema, mapListCheck("ro"));
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@candidate_answers"]);
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    const plan = planPatchFollowUp({ content, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator.paths).toEqual(["candidate_answers"]);
  });

  it("reads Romanian quotes: „…” inside text, and „…\" closed with a straight quote (the tolerant decode)", () => {
    const quoted = JSON.stringify({ points: [point("Mulți spun „da” și pleacă.", RO_WHY), ...RO_POINTS.slice(1)], candidate_answers: ["Da."] });
    expect(mapClassifyReply(quoted, STOP, mapListReplySchema, mapListCheck("ro")).value?.points[0]?.claim).toBe("Mulți spun „da” și pleacă.");
    const straight = quoted.replace("„da”", "„da\"");
    const out = mapClassifyReply(straight, STOP, mapListReplySchema, mapListCheck("ro"));
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_QUOTE" });
    expect(out.value?.points[0]?.claim).toContain("„da\"");
  });

  it("refuses prose with no JSON as a parse failure that names no model text", () => {
    expect(mapClassifyReply("Here are my points: costs.", STOP, mapListReplySchema, mapListCheck("en")).classification)
      .toEqual({ parseStatus: "PARSE_FAILED", parseError: "MAP_REPLY_NOT_JSON" });
  });

  it("lets a snowball list be empty when nothing new is left", () => {
    const empty = JSON.stringify({ points: [], candidate_answers: [] });
    expect(mapClassifyReply(empty, STOP, mapSnowballReplySchema, mapListCheck("en")).classification.parseStatus).toBe("PARSED");
    expect(mapClassifyReply(empty, STOP, mapListReplySchema, mapListCheck("en")).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: merge check: unknown, reused and wrong-kind ids", () => {
  const check = mapMergeCheck(new Set(["pt01", "pt02", "pt03"]), new Set(["ca01"]), "en");
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

  it("refuses a merged claim written in the wrong language at its key_points path", () => {
    const roCheck = mapMergeCheck(new Set(["pt01", "pt02", "pt03"]), new Set(["ca01"]), "ro");
    const content = merge([{ key_point_id: "k1", claim: "The cost of the change is high and the state should pay it.", member_item_ids: ["pt01"] }],
      [{ answer_id: "a1", answer: "Da, cu condiții.", member_item_ids: ["ca01"] }]);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, roCheck);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@key_points.0.claim"]);
  });

  it("refuses a merged answer written in the wrong language at its answers path", () => {
    const roCheck = mapMergeCheck(new Set(["pt01", "pt02", "pt03"]), new Set(["ca01"]), "ro");
    const content = merge([{ key_point_id: "k1", claim: "Costul schimbării este mare și statul ar trebui să îl plătească.", member_item_ids: ["pt01"] }],
      [{ answer_id: "a1", answer: "Yes, the change should go ahead, but only with clear conditions on who pays for it.", member_item_ids: ["ca01"] }]);
    const out = mapClassifyReply(content, STOP, mapMergeReplySchema, roCheck);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@answers.0.answer"]);
  });
});

describe("map replies: gap", () => {
  it("accepts empty lists, and up to three framing challenges", () => {
    expect(mapClassifyReply(JSON.stringify({ new_points: [], framing_challenges: [] }), STOP, mapGapReplySchema, mapGapCheck("en"))
      .classification.parseStatus).toBe("PARSED");
    const four = JSON.stringify({ new_points: [], framing_challenges: ["a", "b", "c", "d"] });
    expect(mapClassifyReply(four, STOP, mapGapReplySchema, mapGapCheck("en")).classification.parseStatus).toBe("SCHEMA_FAILED");
  });
});

describe("map replies: choose check", () => {
  const check = mapChooseCheck(new Set(["kp01", "kp02", "kp03"]), "en");
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

  it("reports a statement in the wrong language at its own answers path", () => {
    const roCheck = mapChooseCheck(new Set(["kp01", "kp02", "kp03"]), "ro");
    const content = JSON.stringify({ answers: [
      { answer_id: "a1", statement: "Da, schimbarea trebuie făcută, cu condiții clare.", for: ["kp01"], against: [], strongest_rival: null },
      { answer_id: "a2", statement: "The change should be made, but only with clear conditions on who pays.", for: ["kp02"], against: [], strongest_rival: null }] });
    const out = mapClassifyReply(content, STOP, mapChooseReplySchema, roCheck);
    expect(issuesOf(out.classification.parseError).map((issue) => `${issue.message}@${issue.path.join(".")}`)).toEqual(["MAP_WRONG_LANGUAGE@answers.1.statement"]);
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
