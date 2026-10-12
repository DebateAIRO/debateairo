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
const S1: MapSeat = { aiRef: "AIREF-SENTINEL-1", maker: "MAKER-SENTINEL-1" };
const S2: MapSeat = { aiRef: "AIREF-SENTINEL-2", maker: "MAKER-SENTINEL-2" };
const drafts: MapItemDraft[] = [
  { kind: "POINT", seat: S1, origin: "BLIND", angleId: "opp", angleKind: "OPPOSITE_CASE", listIndex: 0, position: 0,
    claim: "Fares pay for repairs.", whyItMatters: "Without them the buses get worse.", leans: "against_some_answer" },
  { kind: "POINT", seat: S2, origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, position: 0,
    claim: "Fares pay for repairs.", whyItMatters: "The budget has no other source.", leans: "against_some_answer" },
  { kind: "POINT", seat: S2, origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, position: 1,
    claim: "Free rides cut car traffic.", whyItMatters: "Less traffic helps everyone.", leans: "for_some_answer" },
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
    const sent = JSON.parse(field(mapMergeSpec(CTX, items), "points")) as Record<string, string>[];
    expect(sent.map((entry) => Object.keys(entry).join(","))).toEqual(["item_id,claim,why_it_matters", "item_id,claim,why_it_matters",
      "item_id,claim,why_it_matters"]);
    expect(sent.map((entry) => entry.item_id)).toEqual([...sent.map((entry) => entry.item_id!)].sort());
    expect(JSON.parse(field(mapMergeSpec(CTX, items), "candidate_answers"))).toHaveLength(2);
  });

  it("gap sees plain labels only: no ids, no counts", () => {
    const spec = mapGapSpec(CTX, keyPoints, answers);
    expect(JSON.parse(field(spec, "key_points"))).toEqual(["Fares pay for repairs.", "Free rides cut car traffic."]);
    expect(JSON.parse(field(spec, "answers"))).toEqual(["No, keep the fares.", "Yes, make them free."]);
  });

  it("choose sees each key point tagged by code: blind makers and fixed angle kind", () => {
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
