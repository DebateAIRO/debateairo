import { describe, expect, it } from "vitest";
import { argumentLanguageDirective } from "@debateai/kernel";
import { readPromptFrame } from "@debateai/providers";
import {
  MAP_CONTRACT_IDS,
  mapAnglesSpec,
  mapAssignItemIds,
  mapChooseSpec,
  mapGapSpec,
  mapItemsById,
  mapKeyPoint,
  mapListSpec,
  mapMergeSpec,
  mapMergedAnswer,
  mapProviderPieces,
  mapSnowballSpec,
  type MapItemDraft,
  type MapPointItem,
  type MapSeat,
  type MapSpecContext,
  type MapStepSpec
} from "@debateai/map";

const CTX: MapSpecContext = { questionLine: "Should a city make its central buses free to ride?", languageName: "English", languageTag: "en" };
const RO: MapSpecContext = { ...CTX, languageName: "Romanian", languageTag: "ro" };
const S1: MapSeat = { aiRef: "AIREF-SENTINEL-1", maker: "MAKER-SENTINEL-1" };
const S2: MapSeat = { aiRef: "AIREF-SENTINEL-2", maker: "MAKER-SENTINEL-2" };
const S3: MapSeat = { aiRef: "AIREF-SENTINEL-3", maker: "MAKER-SENTINEL-3" };
const drafts: MapItemDraft[] = [
  { kind: "POINT", seat: S1, origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, position: 0,
    claim: "Fares pay for repairs.", whyItMatters: "Without them the buses get worse.", leans: "against_some_answer" },
  { kind: "POINT", seat: S2, origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, position: 0,
    claim: "Fares pay for repairs.", whyItMatters: "The budget has no other source.", leans: "against_some_answer" },
  { kind: "POINT", seat: S2, origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, position: 1,
    claim: "Free rides cut car traffic.", whyItMatters: "Less traffic helps everyone.", leans: "for_some_answer" },
  // A third maker raises the same point again in a gap round: counted in its makers, never in its blind makers.
  { kind: "POINT", seat: S3, origin: "GAP", angleId: null, angleKind: null, listIndex: 2, position: 0,
    claim: "Free rides cut car traffic.", whyItMatters: "Fewer cars means less noise.", leans: "for_some_answer" },
  { kind: "ANSWER", seat: S1, origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, position: 0, answer: "No, keep the fares." },
  { kind: "ANSWER", seat: S2, origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, position: 0, answer: "Yes, make them free." }
];
const items = mapAssignItemIds(drafts, "seed-specs");
const byId = mapItemsById(items);
const idsOf = (text: string) => items.filter((item) => (item.kind === "POINT" ? item.claim : item.answer) === text).map((item) => item.itemId);
const keyPoints = [
  mapKeyPoint("kp01", "Fares pay for repairs.", idsOf("Fares pay for repairs."), byId),
  mapKeyPoint("kp02", "Free rides cut car traffic.", idsOf("Free rides cut car traffic."), byId)
];
const answers = [
  mapMergedAnswer("an01", "No, keep the fares.", idsOf("No, keep the fares."), byId),
  mapMergedAnswer("an02", "Yes, make them free.", idsOf("Yes, make them free."), byId)
];
const points = items.filter((item): item is MapPointItem => item.kind === "POINT");
const ANGLE = { angleId: "opp", kind: "OPPOSITE_CASE" as const, label: "The other side", focus: "The strongest case for keeping fares." };
const ALL: readonly MapStepSpec<unknown>[] = [mapAnglesSpec(CTX), mapListSpec(CTX, ANGLE), mapListSpec(CTX, null), mapSnowballSpec(CTX, points),
  mapMergeSpec(CTX, items), mapGapSpec(CTX, keyPoints, answers), mapChooseSpec(CTX, keyPoints, answers)];
const field = (spec: MapStepSpec<unknown>, name: string) => spec.material.find((entry) => entry.name === name)?.content ?? "";

const STOP = { finishReason: "stop" };
const EN_WHY = "It could change the answer.";
const EN_POINTS = [
  { claim: "The cost of the change is high and the state should pay it.", why_it_matters: EN_WHY, leans: "context" },
  { claim: "The people who use it most are poor.", why_it_matters: EN_WHY, leans: "for_some_answer" },
  { claim: "The change can be undone later if it fails.", why_it_matters: EN_WHY, leans: "context" }
];
const EN_ANSWER = "Yes, the change should go ahead, but only with clear conditions on who pays for it.";
const RO_WHY = "Ar putea schimba răspunsul la întrebare.";
const RO_POINTS = [
  { claim: "Costul schimbării este mare și statul ar trebui să îl plătească.", why_it_matters: RO_WHY, leans: "context" },
  { claim: "Cei care îl folosesc cel mai mult sunt săraci.", why_it_matters: RO_WHY, leans: "for_some_answer" },
  { claim: "Schimbarea poate fi anulată mai târziu dacă nu merge.", why_it_matters: RO_WHY, leans: "context" }
];
const RO_ANSWER = "Da, cu condiții.";

/** The check's refusals as `MESSAGE@path` (the code and the machine path), or [] when nothing was refused. */
function refusals(spec: MapStepSpec<unknown>, content: string): string[] {
  const out = spec.classify(content, STOP);
  if (out.parseError === null) return [];
  return (JSON.parse(out.parseError) as { message: string; path: (string | number)[] }[]).map((issue) => `${issue.message}@${issue.path.join(".")}`);
}

describe("map specs: what each step sends", () => {
  it("uses the right contract and material fields for each step", () => {
    expect(ALL.map((spec) => readPromptFrame(mapProviderPieces(spec).framed.packet).contractId)).toEqual([
      MAP_CONTRACT_IDS.angles, MAP_CONTRACT_IDS.listAngle, MAP_CONTRACT_IDS.listOpen, MAP_CONTRACT_IDS.listSnowball,
      MAP_CONTRACT_IDS.merge, MAP_CONTRACT_IDS.gap, MAP_CONTRACT_IDS.choose]);
    expect(ALL.map((spec) => spec.material.map((entry) => entry.name).join(","))).toEqual([
      "question_line", "question_line,angle_label,angle_focus", "question_line", "question_line,points_so_far",
      "question_line,points,candidate_answers", "question_line,key_points,answers", "question_line,key_points,answers"]);
    expect(ALL.map((spec) => spec.step)).toEqual(["ANGLES", "LIST", "LIST", "SNOWBALL", "MERGE", "GAP", "CHOOSE"]);
  });

  it("asks every step in the question's language", () => {
    for (const spec of ALL) {
      expect(mapProviderPieces(spec).framed.packet.messages[0]!.content).toContain(argumentLanguageDirective("English"));
    }
  });

  it("never sends an AI reference or a maker, in any step", () => {
    for (const spec of ALL) {
      for (const message of mapProviderPieces(spec).framed.packet.messages) expect(message.content).not.toContain("SENTINEL");
    }
  });

  it("merge sees each item's id, claim and reason, in id order, and nothing about its origin", () => {
    // The items are given reversed, so only the spec's own sort can put the ids in order.
    const reversed = [...items].reverse();
    const sent = JSON.parse(field(mapMergeSpec(CTX, reversed), "points")) as Record<string, string>[];
    expect(sent.map((entry) => Object.keys(entry).join(","))).toEqual(Array.from({ length: points.length }, () => "item_id,claim,why_it_matters"));
    expect(sent.map((entry) => entry.item_id)).toEqual(points.map((point) => point.itemId).sort());
    const sentAnswers = JSON.parse(field(mapMergeSpec(CTX, reversed), "candidate_answers")) as Record<string, string>[];
    expect(sentAnswers.map((entry) => entry.item_id)).toEqual(items.filter((item) => item.kind === "ANSWER").map((item) => item.itemId).sort());
    expect(sentAnswers).toHaveLength(2);
  });

  it("snowball lists the claims so far in id order, whatever order it is given", () => {
    const reversed = [...points].reverse();
    const inIdOrder = [...points].sort((a, b) => a.itemId.localeCompare(b.itemId)).map((point) => point.claim);
    // The guard: the reversed claims must differ from the id order, or this check could not tell the sort from none.
    expect(reversed.map((point) => point.claim)).not.toEqual(inIdOrder);
    expect(JSON.parse(field(mapSnowballSpec(CTX, reversed), "points_so_far"))).toEqual(inIdOrder);
  });

  it("gap sees plain labels only: no ids, no counts", () => {
    const spec = mapGapSpec(CTX, keyPoints, answers);
    expect(JSON.parse(field(spec, "key_points"))).toEqual(["Fares pay for repairs.", "Free rides cut car traffic."]);
    expect(JSON.parse(field(spec, "answers"))).toEqual(["No, keep the fares.", "Yes, make them free."]);
  });

  it("choose sees each key point tagged by code: blind makers and fixed angle kind", () => {
    // The guard: a gap maker raised kp02 too, so its makers count is 2 while its blind count stays 1.
    expect(keyPoints[1]!.makers).toHaveLength(2);
    expect(JSON.parse(field(mapChooseSpec(CTX, keyPoints, answers), "key_points"))).toEqual([
      { key_point_id: "kp01", claim: "Fares pay for repairs.", raised_by: 2, angle_kind: "OPPOSITE_CASE" },
      { key_point_id: "kp02", claim: "Free rides cut car traffic.", raised_by: 1, angle_kind: null }
    ]);
  });

  it("gives the gateway its classifier, its repair packet and the accepted value", () => {
    const pieces = mapProviderPieces(mapChooseSpec(CTX, keyPoints, answers));
    const reply = JSON.stringify({ answers: [{ answer_id: "a1", statement: "No, keep the fares.", for: ["kp01"], against: ["kp02"], strongest_rival: null }] });
    expect(pieces.classifyContent(reply, { finishReason: "stop" }).parseStatus).toBe("PARSED");
    expect(pieces.readAccepted(reply).answers[0]?.for).toEqual(["kp01"]);
    const repair = pieces.buildRepairPacket({ parseStatus: "SCHEMA_FAILED", parseError: JSON.stringify([{ code: "custom", path: ["answers"], message: "SCHEMA_FAILED" }]) });
    expect(readPromptFrame(repair).fields.map((entry) => entry.name)).toContain("machine_rejection_code");
  });

  it("merge's check knows this map's ids", () => {
    const spec = mapMergeSpec(CTX, items);
    const unknown = JSON.stringify({ key_points: [{ key_point_id: "k1", claim: "Fares", member_item_ids: ["pt77"] }], answers: [] });
    expect(spec.classify(unknown, { finishReason: "stop" }).parseStatus).toBe("SCHEMA_FAILED");
    expect(() => spec.read(unknown)).toThrow("MAP_REPLY_UNREADABLE");
  });

  it("merge's language check follows the question's language, not a fixed one", () => {
    const englishClaim = JSON.stringify({ key_points: [{ key_point_id: "k1", claim: "The cost of the change is high and the state should pay it.",
      member_item_ids: [points[0]!.itemId] }], answers: [] });
    const romanian = mapMergeSpec({ ...CTX, languageName: "Romanian", languageTag: "ro" }, items);
    expect(romanian.classify(englishClaim, { finishReason: "stop" }).parseError).toContain("MAP_WRONG_LANGUAGE");
    expect(mapMergeSpec(CTX, items).classify(englishClaim, { finishReason: "stop" }).parseStatus).toBe("PARSED");
  });
});

describe("map specs: each field's language follows the question's tag", () => {
  it("list (open and with an angle) refuses English points and English candidate answers for a Romanian question", () => {
    for (const spec of [mapListSpec(RO, null), mapListSpec(RO, ANGLE)]) {
      expect(refusals(spec, JSON.stringify({ points: EN_POINTS, candidate_answers: [RO_ANSWER] }))).toEqual(["MAP_WRONG_LANGUAGE@points"]);
      expect(refusals(spec, JSON.stringify({ points: RO_POINTS, candidate_answers: [EN_ANSWER] }))).toEqual(["MAP_WRONG_LANGUAGE@candidate_answers"]);
    }
    for (const spec of [mapListSpec(CTX, null), mapListSpec(CTX, ANGLE)]) {
      expect(spec.classify(JSON.stringify({ points: EN_POINTS, candidate_answers: [EN_ANSWER] }), STOP).parseStatus).toBe("PARSED");
    }
  });

  it("snowball refuses English points and English candidate answers for a Romanian question", () => {
    expect(refusals(mapSnowballSpec(RO, points), JSON.stringify({ points: EN_POINTS, candidate_answers: [RO_ANSWER] })))
      .toEqual(["MAP_WRONG_LANGUAGE@points"]);
    expect(refusals(mapSnowballSpec(RO, points), JSON.stringify({ points: RO_POINTS, candidate_answers: [EN_ANSWER] })))
      .toEqual(["MAP_WRONG_LANGUAGE@candidate_answers"]);
    expect(mapSnowballSpec(CTX, points).classify(JSON.stringify({ points: EN_POINTS, candidate_answers: [EN_ANSWER] }), STOP).parseStatus).toBe("PARSED");
  });

  it("gap refuses English new points for a Romanian question, and accepts Romanian ones there", () => {
    expect(refusals(mapGapSpec(RO, keyPoints, answers), JSON.stringify({ new_points: EN_POINTS, framing_challenges: [] })))
      .toEqual(["MAP_WRONG_LANGUAGE@new_points"]);
    expect(mapGapSpec(RO, keyPoints, answers).classify(JSON.stringify({ new_points: RO_POINTS, framing_challenges: [] }), STOP).parseStatus).toBe("PARSED");
    expect(mapGapSpec(CTX, keyPoints, answers).classify(JSON.stringify({ new_points: EN_POINTS, framing_challenges: [] }), STOP).parseStatus).toBe("PARSED");
  });

  it("choose refuses an English statement for a Romanian question, at its own answers path", () => {
    const body = (statement: string) => JSON.stringify({ answers: [{ answer_id: "a1", statement, for: ["kp01"], against: ["kp02"], strongest_rival: null }] });
    expect(refusals(mapChooseSpec(RO, keyPoints, answers), body(EN_ANSWER))).toEqual(["MAP_WRONG_LANGUAGE@answers.0.statement"]);
    expect(mapChooseSpec(RO, keyPoints, answers).classify(body(RO_ANSWER), STOP).parseStatus).toBe("PARSED");
    expect(mapChooseSpec(CTX, keyPoints, answers).classify(body(EN_ANSWER), STOP).parseStatus).toBe("PARSED");
  });

  it("the gateway's pieces refuse a wrong-language choose reply: a refused classification, and no accepted value", () => {
    const pieces = mapProviderPieces(mapChooseSpec(RO, keyPoints, answers));
    const refused = JSON.stringify({ answers: [{ answer_id: "a1", statement: EN_ANSWER, for: ["kp01"], against: [], strongest_rival: null }] });
    expect(pieces.classifyContent(refused, STOP).parseStatus).toBe("SCHEMA_FAILED");
    expect(() => pieces.readAccepted(refused)).toThrow("MAP_REPLY_UNREADABLE");
  });
});
