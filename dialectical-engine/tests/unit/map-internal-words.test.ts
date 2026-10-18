import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { replyLanguageExpectation } from "@debateai/kernel";
import { promptContractFingerprintText } from "@debateai/providers";
import {
  MAP_CONTRACT_NAMES,
  MAP_ENGINE_INTERNAL_FIELD_NAMES,
  MAP_INTERNAL_FIELD_NAMES,
  MAP_NOTES,
  mapAlsoRaisedOf,
  mapAssignItemIds,
  mapChooseCheck,
  mapChooseSpec,
  mapFinishChoice,
  mapGapSpec,
  mapInternalWordsSkipped,
  mapItemsById,
  mapKeyPoint,
  mapListSpec,
  mapMergeAlsoRaised,
  mapMergeSpec,
  mapMergedAnswer,
  mapNamesInternalWord,
  mapPromptContractHash,
  mapPromptContracts,
  mapSnowballSpec,
  type MapChooseReply,
  type MapItemDraft,
  type MapSeat,
  type MapSpecContext
} from "@debateai/map";
import { debateMapViewFrom } from "../../apps/api/src/map-views.js";
import { storyAlsoRaisedFrom } from "../../apps/runner/src/story-snapshot.js";

/**
 * Practice 2026-10-15 (ro-strainatate, arm C): a list AI wrote claims about the prompt's own input field angle_focus
 * instead of the question, the code merge kept one as a key point, and it reached `choice.alsoRaised[10].claim`, the
 * debate page's "Also raised, not debated" list and the story material. Owner rule: no engine internals in anything a
 * person reads. These are the real claims from that run (our own practice text).
 */
const LEAKED_ALSO_RAISED = "Alternativa „familia migrează împreună” nu e analizată de angle_focus, deși e fezabilă în multe cazuri și elimină costurile separării.";
const LEAKED_ITEM_CLAIM = "Durata plecării (1-2 ani versus 10 ani) schimbă substanțial calculul, deși angle_focus se concentrează pe vârstă.";
const LEAKED_ITEM_WHY = "Dacă planul e pe termen scurt și cu reîntoarcere, absența e o investiție; dacă devine permanentă, copiii cresc fără părinte indiferent de vârstă, ceea ce angle_focus subestimează.";
const LEAKED = [LEAKED_ALSO_RAISED, LEAKED_ITEM_CLAIM, LEAKED_ITEM_WHY];
/** Ordinary claims from the same run, and prose that uses "focus", "angle", "key points" and the like as plain words. */
const ORDINARY = [
  "Verifică efectele pe termen lung: contribuțiile la pensie, recunoașterea vechimii în muncă și rezidența fiscală, care pot modifica veniturile reale.",
  "Accentul (focus) pe vârsta copiilor ignoră durata plecării.",
  "Din unghiul (angle) familiei, costul separării contează mai mult decât salariul.",
  "The focus on the children's age misses how long the move lasts.",
  "From this angle, the key points are the cost of living and the time apart.",
  "Why it matters: the candidate answers all assume the family stays.",
  "A focus group of parents raised by migrant workers said the opposite case is common.",
  "The evidence leans against moving; the answer is a value-laden choice about the question.",
  "Point 2 of the plan, and the PT and CA rules, are about tax residence.",
  "Captain Ca12, form pt-04 and the PT04 grade are ordinary text."
];
/** Each field form the matcher must catch: underscore, joined (camelCase) and, for a distinctive field, spaced. */
const NAMED = [
  "The angle_focus misses the family.", "The ANGLE_FOCUS misses it.", "The angleFocus misses it.", "The angle focus misses it.",
  "The angle-focus misses it.", "As angle_label says.", "Under key_point_id kp03.", "The key point id is wrong.",
  "Its why_it_matters is thin.", "The whyItMatters line is thin.", "member_item_ids are mixed.", "The answer_id is a2.",
  "The strongest_rival is a1.", "See framing_challenges.", "As question_line asks.", "The question line asks it.",
  "As pt04 says, the cost is high.", "Item ca01 is the same as ca02.", "The machine_rejection_path is answers.0."
];

describe("map internal words: the field names come from the map's own prompts", () => {
  it("holds every multi-word field the map's material and answer forms name", () => {
    for (const name of ["angle_label", "angle_focus", "angle_id", "item_id", "key_point_id", "answer_id", "member_item_ids",
      "candidate_answers", "why_it_matters", "question_line", "framing_challenges", "strongest_rival", "points_so_far",
      "key_points", "new_points", "raised_by", "angle_kind", "question_language", "for_some_answer", "against_some_answer"]) {
      expect(MAP_INTERNAL_FIELD_NAMES, name).toContain(name);
    }
  });

  it("covers every material field name a map step actually sends (built specs, not a copied list)", () => {
    const ctx: MapSpecContext = { questionLine: "Should we move?", languageName: "English", languageTag: "en",
      replyLanguage: replyLanguageExpectation("Should we move?") };
    const angle = { angleId: "g1", kind: "SPECIFIC" as const, label: "Cost", focus: "Who pays." };
    const specs = [mapListSpec(ctx, angle), mapListSpec(ctx, null), mapSnowballSpec(ctx, []), mapMergeSpec(ctx, []),
      mapGapSpec(ctx, [], []), mapChooseSpec(ctx, [], [])];
    const names = new Set(specs.flatMap((spec) => spec.material.map((field) => field.name)));
    for (const name of names) {
      if (name.includes("_")) expect(mapNamesInternalWord(`It says ${name} here.`), name).toBe(true);
    }
    expect(names.has("angle_focus")).toBe(true);
  });

  it("names the practice run's leaked claims, and every field form", () => {
    for (const text of [...LEAKED, ...NAMED]) expect(mapNamesInternalWord(text), text).toBe(true);
  });

  it("leaves ordinary prose alone, including plain words such as focus, angle, key points or why it matters", () => {
    for (const text of ORDINARY) expect(mapNamesInternalWord(text), text).toBe(false);
  });
});

describe("map internal words: the one also-raised rule skips such a claim, never edits it", () => {
  it("mapMergeAlsoRaised drops the leaked claim and keeps the ordinary ones in order", () => {
    const merged = mapMergeAlsoRaised([
      { claim: ORDINARY[0]!, makers: ["Anthropic"] },
      { claim: LEAKED_ALSO_RAISED, makers: ["Xiaomi", "Alibaba"] },
      { claim: ORDINARY[3]!, makers: ["Z.AI"] }
    ]);
    expect(merged.map((entry) => entry.claim)).toEqual([ORDINARY[0], ORDINARY[3]]);
    // Running it again changes nothing.
    expect(mapMergeAlsoRaised(merged)).toEqual(merged);
  });

  it("mapAlsoRaisedOf leaves out a key point and a cut chosen answer that name a field", () => {
    const keyPoint = (keyPointId: string, claim: string) => ({ keyPointId, claim, memberItemIds: [], blindMakers: ["A"], gapMakers: [],
      makers: ["A"], fixedAngleKinds: [], leansAgainst: false });
    const listed = mapAlsoRaisedOf({
      choice: { answers: [
        { answerId: "a1", statement: "Da.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a2", filled: false },
        { answerId: "a2", statement: "Nu.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a1", filled: false },
        { answerId: "a3", statement: "Depinde de angle_focus.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a1", filled: false }
      ], alsoRaised: ["kp01", "kp02"] },
      keyPoints: [keyPoint("kp01", ORDINARY[0]!), keyPoint("kp02", LEAKED_ALSO_RAISED)],
      mergedAnswers: [],
      arguedAnswers: 2
    });
    expect(listed.map((entry) => entry.claim)).toEqual([ORDINARY[0]]);
  });

  it("the story material's also_raised excludes it", () => {
    const keyPoint = (keyPointId: string, claim: string) => ({ keyPointId, claim, memberItemIds: [], blindMakers: ["A"], gapMakers: [],
      makers: ["A"], fixedAngleKinds: [], leansAgainst: false });
    const story = storyAlsoRaisedFrom({
      keyPoints: [keyPoint("kp01", ORDINARY[0]!), keyPoint("kp02", LEAKED_ALSO_RAISED), keyPoint("kp03", ORDINARY[1]!)],
      mergedAnswers: [],
      choice: { answers: [
        { answerId: "a1", statement: "Da.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a2", filled: false },
        { answerId: "a2", statement: "Nu.", forKeyPointIds: [], againstKeyPointIds: [], strongestRival: "a1", filled: false }
      ], alsoRaised: ["kp01", "kp02", "kp03"] }
    }, 2);
    expect(story?.map((entry) => entry.claim)).toEqual([ORDINARY[0], ORDINARY[1]]);
  });

  it("the debate page's map view excludes it, even from a list stored before this rule, and never shows such a position", () => {
    const root = "a0000000-0000-4000-8000-00000000000a";
    const other = "b0000000-0000-4000-8000-00000000000b";
    const view = debateMapViewFrom({
      answers: [{ statement: "Depinde de durata plecării.", rootNodeId: root }, { statement: "Nu, după angle_focus.", rootNodeId: other }],
      alsoRaised: [{ claim: ORDINARY[0]!, makers: ["Anthropic"] }, { claim: LEAKED_ALSO_RAISED, makers: ["Xiaomi"] }]
    }, new Set([root, other]));
    expect(view.also_raised).toEqual([ORDINARY[0]]);
    expect(view.positions.map((position) => position.answer)).toEqual(["Depinde de durata plecării."]);
    expect(JSON.stringify(view)).not.toContain("angle_focus");
  });
});

const A: MapSeat = { aiRef: "ai-a", maker: "maker-a" };
const B: MapSeat = { aiRef: "ai-b", maker: "maker-b" };
const point = (seat: MapSeat, listIndex: number, claim: string): MapItemDraft =>
  ({ kind: "POINT", seat, origin: "BLIND", angleId: null, angleKind: null, listIndex, position: 0, claim, whyItMatters: "De ce.", leans: "context" });
const answerDraft = (seat: MapSeat, listIndex: number, text: string): MapItemDraft =>
  ({ kind: "ANSWER", seat, origin: "BLIND", angleId: null, angleKind: null, listIndex, position: 1, answer: text });
const ITEMS = mapAssignItemIds([point(A, 0, ORDINARY[0]!), point(B, 1, LEAKED_ALSO_RAISED), point(B, 1, ORDINARY[1]!),
  answerDraft(A, 0, "Da, temporar."), answerDraft(B, 1, "Nu, conform angle_focus."), answerDraft(B, 1, "Nu merită.")], "seed-internal");
const BY_ID = mapItemsById(ITEMS);
const idsOf = (text: string) => ITEMS.filter((item) => (item.kind === "POINT" ? item.claim : item.answer) === text).map((item) => item.itemId);
const KEY_POINTS = [mapKeyPoint("kp01", ORDINARY[0]!, idsOf(ORDINARY[0]!), BY_ID),
  mapKeyPoint("kp02", LEAKED_ALSO_RAISED, idsOf(LEAKED_ALSO_RAISED), BY_ID), mapKeyPoint("kp03", ORDINARY[1]!, idsOf(ORDINARY[1]!), BY_ID)];
// The leaked merged answer is the best supported, so a rule that only ranked would pick it first.
const MERGED = [mapMergedAnswer("an01", "Nu, conform angle_focus.", [...idsOf("Nu, conform angle_focus."), ...idsOf("Da, temporar.")], BY_ID),
  mapMergedAnswer("an02", "Da, temporar.", idsOf("Da, temporar."), BY_ID), mapMergedAnswer("an03", "Nu merită.", idsOf("Nu merită."), BY_ID)];
const BASE = { keyPoints: KEY_POINTS, mergedAnswers: MERGED, items: ITEMS, languageTag: "ro", maxAnswers: 4, pointsPerAnswer: 3 };
const chosen = (answerId: string, statement: string, forIds: string[], against: string[], rival: string | null): MapChooseReply["answers"][number] =>
  ({ answer_id: answerId, statement, for: forIds, against, strongest_rival: rival });
const RO = replyLanguageExpectation("Merită să mă mut în străinătate pentru un salariu de două ori mai mare, dacă familia mea rămâne în România?");

describe("map internal words: a chosen answer or a key point that names a field never stands in the choice", () => {
  it("the choose check refuses a statement that names a field at its own path, so the repair re-asks that member (as MAP_ANSWER_NO_WORDS)", () => {
    const issues = mapChooseCheck(new Set(["kp01", "kp03"]), RO)({ answers: [
      chosen("da", "Da, merită temporar, cu un termen clar.", ["kp01"], [], "nu"),
      chosen("nu", "Nu merită, conform angle_focus, pentru copiii mici.", ["kp03"], [], "da")] });
    expect(issues).toEqual([{ path: ["answers", 1, "statement"], code: "MAP_ANSWER_NAMES_FIELD" }]);
  });

  it("the fallback and the fill skip a merged answer that names a field; a key point that names one is never dealt", () => {
    const fallback = mapFinishChoice({ ...BASE, reply: null });
    expect(fallback.choice.answers.map((entry) => entry.statement)).toEqual(["Da, temporar.", "Nu merită."]);
    const dealt = fallback.choice.answers.flatMap((entry) => [...entry.forKeyPointIds, ...entry.againstKeyPointIds]);
    expect(dealt).not.toContain("kp02");
    expect(fallback.choice.alsoRaised).not.toContain("kp02");
    const filled = mapFinishChoice({ ...BASE, reply: { answers: [chosen("x", "Depinde de durată.", ["kp01"], [], null)] } });
    expect(filled.choice.answers.map((entry) => entry.statement)).toEqual(["Depinde de durată.", "Da, temporar."]);
  });

  it("a reply that names such a key point keeps its other points; such a reply statement is dropped (defence in depth)", () => {
    const out = mapFinishChoice({ ...BASE, reply: { answers: [
      chosen("da", "Da, temporar.", ["kp01", "kp02"], [], "nu"),
      chosen("nu", "Nu, conform angle_focus.", ["kp03"], [], "da"),
      chosen("poate", "Nu merită.", [], ["kp02"], "da")] } });
    expect(out.choice.answers.map((entry) => entry.statement)).toEqual(["Da, temporar.", "Nu merită."]);
    expect(out.choice.answers.flatMap((entry) => [...entry.forKeyPointIds, ...entry.againstKeyPointIds])).not.toContain("kp02");
    expect(out.choice.alsoRaised).not.toContain("kp02");
  });

  it("records the count skipped as an operator-only note, never as a mark", () => {
    expect(MAP_NOTES).toContain("INTERNAL_WORDS_SKIPPED");
    expect(mapInternalWordsSkipped(KEY_POINTS, MERGED)).toEqual({ note: "INTERNAL_WORDS_SKIPPED", step: "CHOOSE", detail: "key points 1, answers 1" });
    expect(mapInternalWordsSkipped([KEY_POINTS[0]!], [MERGED[1]!])).toBeNull();
  });
});

describe("map internal words: no prompt change", () => {
  it("keeps the map contract hash pinned", () => {
    // LG-C Task 14: today's 7 contracts + the 7 length variants; 25b4c106…9392 is history (register 14's map seal).
    expect(mapPromptContractHash()).toBe("d46c0c12d8164c9b01db78ff64ab58515e8a2f98887d5a433c090b40dcd39b71");
    // Review Focus 1: today's seven are byte for byte unchanged (their own fingerprint is still register 14's seal).
    expect(createHash("sha256").update(MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(mapPromptContracts()[name]))
      .join("\n---\n")).digest("hex")).toBe("25b4c106a9b5e444d19aee0a31b7fea95f377ee91fb1f9eef64c623938e59392");
  });
});

/**
 * R3 final wave P3 (Task 3 Minor 1): the skip's compiled pattern is keyed by the joined names, not the list object, so a
 * fresh copy of a list reads as the list does, a list changed after a first read is read again, and an empty list names
 * no field (an empty alternation would match every text, so every claim would be skipped).
 */
describe("map internal words: one pattern per name list, keyed by its names", () => {
  it("reads a fresh copy as the list, a changed list anew, and an empty list as naming nothing", () => {
    const text = "Each rests_on of the answer matters.";
    expect(mapNamesInternalWord(text, MAP_INTERNAL_FIELD_NAMES)).toBe(false);
    expect(mapNamesInternalWord(text, MAP_ENGINE_INTERNAL_FIELD_NAMES)).toBe(true);
    expect(mapNamesInternalWord(text, [...MAP_ENGINE_INTERNAL_FIELD_NAMES])).toBe(true);
    const names = ["why_it_matters"];
    expect(mapNamesInternalWord(text, names)).toBe(false);
    names.push("rests_on");
    expect(mapNamesInternalWord(text, names)).toBe(true);
    expect(mapNamesInternalWord("Fares fund night buses.", [])).toBe(false);
    expect(mapNamesInternalWord("A claim citing pt04.", [])).toBe(true);
    expect(mapMergeAlsoRaised([{ claim: "Fares fund night buses.", makers: ["A"] }], []).map((entry) => entry.claim))
      .toEqual(["Fares fund night buses."]);
  });
});
