// tests/unit/lg-a-map-fixer.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mapAnglesReplySchema, mapAnglesSalvage, mapChooseReplySchema, mapChooseSalvage, mapClassifyReply, mapGapReplySchema,
  mapGapSalvage, mapMergeReplySchema, mapMergeSalvage } from "@debateai/map";

const STOP = { finishReason: "stop" } as const;
const none = () => [];

describe("LG-A: the map repairs form and ids in code", () => {
  it("Qwen's merge ids in the wrong shape are lower-cased, every reference with them (MAP_IDS_NORMALISED)", () => {
    const reply = JSON.stringify({
      key_points: [{ key_point_id: "specific-CEE-comparatie", claim: "Wages lag.", member_item_ids: ["p-1"] }],
      answers: [{ answer_id: "Euro-Now", answer: "Adopt now.", member_item_ids: ["a-1"] }]
    });
    const out = mapClassifyReply(reply, STOP, mapMergeReplySchema, none, mapMergeSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_IDS_NORMALISED" });
    expect(out.value?.key_points[0]?.key_point_id).toBe("specific-cee-comparatie");
    expect(out.value?.answers[0]?.answer_id).toBe("euro-now");
  });

  it("choose: an answer id and the rival that names it are renamed the same way; key point ids too", () => {
    const reply = JSON.stringify({ answers: [
      { answer_id: "Answer-One", statement: "Adopt the euro now.", for: ["KP-1"], against: [], strongest_rival: "Answer-Two" },
      { answer_id: "Answer-Two", statement: "Wait for wages.", for: [], against: ["KP-1"], strongest_rival: "Answer-One" }
    ] });
    const out = mapClassifyReply(reply, STOP, mapChooseReplySchema, none, mapChooseSalvage(new Set(["kp-1"])));
    expect(out.classification.parseStatus).toBe("PARSED");
    expect(out.value?.answers.map((answer) => [answer.answer_id, answer.strongest_rival, answer.for, answer.against])).toEqual([
      ["answer-one", "answer-two", ["kp-1"], []], ["answer-two", "answer-one", [], ["kp-1"]]]);
    expect(out.repairs).toContain("MAP_IDS_NORMALISED");
  });

  it("ids that would become one are left as written, and the schema refuses them as before", () => {
    const reply = JSON.stringify({ key_points: [
      { key_point_id: "KP-1", claim: "One.", member_item_ids: ["p-1"] }, { key_point_id: "kp-1", claim: "Two.", member_item_ids: ["p-2"] }
    ], answers: [] });
    expect(mapClassifyReply(reply, STOP, mapMergeReplySchema, none, mapMergeSalvage).classification.parseStatus).toBe("SCHEMA_FAILED");
  });

  // (pre-flight PF-A31, ruling R6) The widened normalisation.
  it("ids with an underscore, a space, a dot, a diacritic or a leading hyphen are normalised, every reference with them", () => {
    const reply = JSON.stringify({
      key_points: [
        { key_point_id: "Key_Point_1", claim: "Wages lag.", member_item_ids: ["P_1"] },
        { key_point_id: "euro now", claim: "Adopt now.", member_item_ids: ["p.2"] },
        { key_point_id: "țară-mică", claim: "A small country.", member_item_ids: ["p-3"] },
        { key_point_id: "-leading", claim: "Prices rise.", member_item_ids: ["p-4"] }
      ],
      answers: [{ answer_id: "Answer.One", answer: "Adopt now.", member_item_ids: ["A_1"] }]
    });
    const out = mapClassifyReply(reply, STOP, mapMergeReplySchema, none, mapMergeSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_IDS_NORMALISED" });
    expect(out.value?.key_points.map((point) => [point.key_point_id, point.member_item_ids])).toEqual([
      ["key-point-1", ["p-1"]], ["euro-now", ["p-2"]], ["tara-mica", ["p-3"]], ["leading", ["p-4"]]]);
    expect(out.value?.answers.map((answer) => [answer.answer_id, answer.member_item_ids])).toEqual([["answer-one", ["a-1"]]]);
  });

  it("an underscore id and a hyphen id that would become one are left as written (the collision guard)", () => {
    const reply = JSON.stringify({ key_points: [
      { key_point_id: "kp_1", claim: "One.", member_item_ids: ["p-1"] }, { key_point_id: "kp-1", claim: "Two.", member_item_ids: ["p-2"] }
    ], answers: [] });
    const out = mapClassifyReply(reply, STOP, mapMergeReplySchema, none, mapMergeSalvage);
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    expect(out.repairs).toEqual([]);
  });

  // (pre-flight PF-A30, ruling R5) A moved member keeps the PATCH's paths on the reply as written.
  it("a member the fixer moved, then refused by the content check, is refused with the schema's own issues on the reply as written", () => {
    const schema = z.object({ note: z.string().optional(), part: z.object({ label: z.string() }).strict() }).strict();
    const reply = JSON.stringify({ part: { label: "Prices.", note: "Too deep." } });
    const refuseNote = (value: z.infer<typeof schema>) => (value.note === undefined ? [] : [{ path: ["note"], code: "MAP_NOTE_REFUSED" }]);
    expect(mapClassifyReply(reply, STOP, schema, refuseNote).classification).toEqual({ parseStatus: "SCHEMA_FAILED",
      parseError: JSON.stringify([{ code: "unrecognized_keys", path: ["part"], message: "SCHEMA_FAILED" }]) });
    // The same move with nothing for the check to refuse is accepted and named.
    const kept = mapClassifyReply(reply, STOP, schema, none);
    expect(kept.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MEMBER_UNNESTED" });
    expect(kept.value).toEqual({ note: "Too deep.", part: { label: "Prices." } });
  });

  it("MiMo's framing challenges as {text} are read as texts; the decode's repair comes first in the list", () => {
    const body = JSON.stringify({ new_points: [], framing_challenges: [{ text: "Is the question too narrow?" }] });
    expect(mapClassifyReply(body, STOP, mapGapReplySchema, none, mapGapSalvage).classification)
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "TEXT_FORM_CONVERTED" });
    expect(mapClassifyReply(`\`\`\`json\n${body}\n\`\`\``, STOP, mapGapReplySchema, none, mapGapSalvage).classification)
      .toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CODE_FENCE", jsonRepairs: ["CODE_FENCE", "TEXT_FORM_CONVERTED"] });
  });

  it("an extra key inside an angle is dropped and named", () => {
    const angles = [
      { angle_id: "opposite", kind: "OPPOSITE_CASE", label: "The other side", focus: "What if waiting is better?", note: "x" },
      { angle_id: "worry", kind: "ASKER_WORRY", label: "Your worry", focus: "Prices." },
      { angle_id: "practical", kind: "PRACTICAL", label: "In practice", focus: "Timing." },
      { angle_id: "cee", kind: "SPECIFIC", label: "Neighbours", focus: "What CEE countries did." }
    ];
    const out = mapClassifyReply(JSON.stringify({ angles }), STOP, mapAnglesReplySchema, none, mapAnglesSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_UNASKED_KEYS" });
  });

  // (Task 9, keepDeclaredTexts) A stray text under a name the schema declares as a text may be a claim or an answer.
  it("a merge answer written inside a key point is kept, so the reply stays refused; a stray undeclared note is still dropped", () => {
    const point = { key_point_id: "kp-1", claim: "Wages lag.", member_item_ids: ["p-1"] };
    const stray = JSON.stringify({ key_points: [{ ...point, answer: "Adopt the euro now." }], answers: [] });
    expect(mapClassifyReply(stray, STOP, mapMergeReplySchema, none, mapMergeSalvage).classification).toEqual({ parseStatus: "SCHEMA_FAILED",
      parseError: JSON.stringify([{ code: "unrecognized_keys", path: ["key_points", 0], message: "SCHEMA_FAILED" }]) });
    const noted = mapClassifyReply(JSON.stringify({ key_points: [{ ...point, note: "merged two" }], answers: [] }), STOP, mapMergeReplySchema,
      none, mapMergeSalvage);
    expect(noted.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_UNASKED_KEYS" });
    expect(noted.value?.key_points).toEqual([point]);
  });
});
