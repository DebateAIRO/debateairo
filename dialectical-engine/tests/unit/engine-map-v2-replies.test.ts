import { describe, expect, it } from "vitest";
import { replyLanguageExpectation } from "@debateai/kernel";
import {
  MAP_ENGINE_REPLY_SCHEMAS, mapChooseCheckV2, mapChooseSalvageV2, mapCheckCheck, mapCheckReplySchema, mapCheckSalvage, mapClassifyReply,
  mapLimitsFor, mapReplySchemasV2For
} from "@debateai/map";
import { CONTENT_FOLLOW_UP_SENTENCES, schemaFailureLimits } from "@debateai/providers";

const STOP = { finishReason: "stop" } as const;
const V2 = mapReplySchemasV2For(mapLimitsFor(true));
const EN = replyLanguageExpectation("Should the city make its central bus lines free?");
const none = () => [];
const point = (claim: string, restsOn?: string) => ({ claim, why_it_matters: "It could change the answer.", leans: "context",
  ...(restsOn === undefined ? {} : { rests_on: restsOn }) });

describe("engine 2: a list point says what it rests on", () => {
  it("v2 reads rests_on; a point without it is refused at its own path (a content slip: the AI is asked, code never guesses)", () => {
    const reply = { points: [point("Fares pay for night buses.", "question"), point("The asker rides daily.", "assumption"),
      point("Costs rise.", "question")], candidate_answers: ["Yes, where night buses stay funded."] };
    expect(mapClassifyReply(JSON.stringify(reply), STOP, V2.list, none).value?.points[1]?.rests_on).toBe("assumption");
    const missing = { ...reply, points: [point("Fares pay for night buses."), ...reply.points.slice(1)] };
    const refused = mapClassifyReply(JSON.stringify(missing), STOP, V2.list, none);
    expect(refused.classification.parseStatus).toBe("SCHEMA_FAILED");
    expect(JSON.parse((refused.classification as { parseError: string }).parseError)[0].path).toEqual(["points", 0, "rests_on"]);
  });
});

describe("engine 2: choose names assumptions and reserves", () => {
  const KP = new Set(["kp01", "kp02", "kp03"]);
  const answer = (id: string, statement: string, extra: object = {}) => ({ answer_id: id, statement, for: ["kp01"], against: ["kp02"],
    strongest_rival: null, assumptions: [], ...extra });
  it("accepts reserves and assumptions; a missing reserve list reads as none", () => {
    const reply = { answers: [answer("yes", "Yes, where buses are full."), answer("no", "No, fund repairs first.")],
      reserve_answers: [{ statement: "Only at night.", for: ["kp03"], against: [], assumptions: ["Night riders are workers."] }] };
    const read = mapClassifyReply(JSON.stringify(reply), STOP, V2.choose, mapChooseCheckV2(KP, EN), mapChooseSalvageV2(KP));
    expect(read.value?.reserve_answers?.[0]?.assumptions).toEqual(["Night riders are workers."]);
    const { reserve_answers: _dropped, ...noReserves } = reply;
    expect(mapClassifyReply(JSON.stringify(noReserves), STOP, V2.choose, mapChooseCheckV2(KP, EN)).classification.parseStatus).toBe("PARSED");
  });
  it("refuses a reserve that repeats a chosen answer, and an assumption that names a field, each at its own path", () => {
    const reply = { answers: [answer("yes", "Yes, where buses are full.", { assumptions: ["The rests_on of kp01 holds."] }),
      answer("no", "No, fund repairs first.")],
      reserve_answers: [{ statement: "yes, where buses are full", for: [], against: [], assumptions: [] }] };
    const issues = mapChooseCheckV2(KP, EN)(V2.choose.parse(reply));
    expect(issues).toContainEqual({ path: ["answers", 0, "assumptions", 0], code: "MAP_ANSWER_NAMES_FIELD" });
    expect(issues).toContainEqual({ path: ["reserve_answers", 0, "statement"], code: "MAP_ANSWER_DUPLICATE" });
  });
});

describe("engine 2: the check's reply", () => {
  const SHOWN = ["a1", "a2", "c1"];
  // (pre-flight PF-R3-2.2, FINAL Ruling D4(b) encoding) every entry carries the REQUIRED nullable cost_can_be_named.
  const entry = (id: string, answers: boolean, adds: boolean, cost: boolean | null, reason: string | null) =>
    ({ check_id: id, answers_question: answers, adds_unstated_fact: adds, cost_can_be_named: cost, reason });
  it("accepts one entry per id shown; a failing entry needs a reason", () => {
    // (pre-flight PF-R3-2.10) one schema identity for every engine-2 reader.
    expect(mapCheckReplySchema).toBe(MAP_ENGINE_REPLY_SCHEMAS.check);
    const ok = { checks: [entry("a1", true, false, true, null), entry("a2", false, false, true, "It only says it depends."),
      entry("c1", true, false, null, null)] };
    expect(mapCheckCheck(SHOWN, EN)(V2.check.parse(ok))).toEqual([]);
    const bad = { checks: [entry("a1", true, true, true, null), entry("a1", true, false, true, null), entry("c4", true, false, true, null)] };
    expect(mapCheckCheck(SHOWN, EN)(V2.check.parse(bad))).toEqual([
      { path: ["checks", 0, "reason"], code: "MAP_CHECK_REASON_MISSING" },
      { path: ["checks", 1, "check_id"], code: "MAP_CHECK_ID_REPEATED" },
      { path: ["checks", 2, "check_id"], code: "MAP_CHECK_UNKNOWN_ID" },
      { path: ["checks"], code: "MAP_CHECK_ID_MISSING" }
    ]);
  });
  // (pre-flight PF-R3-2.2, FINAL Ruling D4(b) encoding) D4b's third question: false is a failed test and needs a reason;
  // null (a premise challenge, the checker's own exemption) is no failure; the member is required, so an absent one is
  // refused at its own path (a content slip: B's patch follow-up asks the same AI, code never guesses it).
  it("the third question: false needs a reason, null is exempt, an absent member is refused at its own path", () => {
    const noCost = { checks: [entry("a1", true, false, true, null), entry("a2", true, false, false, null), entry("c1", true, false, null, null)] };
    expect(mapCheckCheck(SHOWN, EN)(V2.check.parse(noCost))).toEqual([{ path: ["checks", 1, "reason"], code: "MAP_CHECK_REASON_MISSING" }]);
    const given = { checks: [entry("a1", true, false, true, null), entry("a2", true, false, false, "Nothing would go wrong if it were followed."),
      entry("c1", true, false, null, null)] };
    expect(mapCheckCheck(SHOWN, EN)(V2.check.parse(given))).toEqual([]);
    const { cost_can_be_named: _absent, ...withoutCost } = entry("a1", true, false, true, null);
    const refused = mapClassifyReply(JSON.stringify({ checks: [withoutCost, entry("a2", true, false, true, null), entry("c1", true, false, true, null)] }),
      STOP, V2.check, mapCheckCheck(SHOWN, EN), mapCheckSalvage, { exactLimits: true });
    expect(refused.classification.parseStatus).toBe("SCHEMA_FAILED");
    expect(JSON.parse((refused.classification as { parseError: string }).parseError)[0].path).toEqual(["checks", 0, "cost_can_be_named"]);
  });
  it("an upper-case id is repaired in code (LG-A's id normalisation), never re-asked", () => {
    const reply = { checks: [entry("A1", true, false, true, null), entry("a2", true, false, true, null), entry("C1", true, false, true, null)] };
    const read = mapClassifyReply(JSON.stringify(reply), STOP, V2.check, mapCheckCheck(SHOWN, EN), mapCheckSalvage, { exactLimits: true });
    expect(read.classification.parseStatus).toBe("PARSED");
    expect(read.repairs).toContain("MAP_IDS_NORMALISED");
  });
});

describe("engine 2: every refusal states its exact limit (P2.3)", () => {
  it("a list over its count keeps zod's limit, so the follow-up says 'at most 4 items'", () => {
    const answers = ["a", "b", "c", "d", "e"].map((id, index) => ({ answer_id: id, statement: `Answer ${String(index)}.`, for: [], against: [],
      strongest_rival: null, assumptions: [] }));
    const read = mapClassifyReply(JSON.stringify({ answers }), STOP, V2.choose, none, {}, { exactLimits: true });
    const error = (read.classification as { parseError: string }).parseError;
    expect(schemaFailureLimits(error, ["answers"])).toEqual([{ path: "answers", bound: "at most", size: 4, unit: "items" }]);
    const today = mapClassifyReply(JSON.stringify({ answers }), STOP, V2.choose, none);
    expect(schemaFailureLimits((today.classification as { parseError: string }).parseError, ["answers"])).toEqual([]);
  });
  it("an id code cannot repair says the id rule in plain words (MAP_ID_FORM)", () => {
    // Two ids that would normalise to one are left as written (LG-A's collision guard), so the schema refuses the first.
    const reply = { key_points: [{ key_point_id: "KP-1", claim: "One.", rests_on: "question", member_item_ids: ["pt01"] },
      { key_point_id: "kp-1", claim: "Two.", rests_on: "question", member_item_ids: ["pt02"] }], answers: [] };
    const read = mapClassifyReply(JSON.stringify(reply), STOP, V2.merge, none, {}, { exactLimits: true });
    expect(JSON.parse((read.classification as { parseError: string }).parseError))
      .toContainEqual({ code: "custom", path: ["key_points", 0, "key_point_id"], message: "MAP_ID_FORM" });
    // (pre-flight PF-R3-2.8) the sentence DESCRIBES the earlier answer (content-follow-up.ts:4-7), and states the rule.
    expect(CONTENT_FOLLOW_UP_SENTENCES.MAP_ID_FORM).toBe("The earlier answer gives an id the form does not allow: an id is 1 to 24 characters, lowercase letters, digits and hyphens.");
  });
});
