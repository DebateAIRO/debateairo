// A review reply with a list closed one key too late (`…"last reason.","edge_bearings":[0.85]]}`): the reply never
// closed its `reasons` list, wrote `edge_bearings` inside it, and put the missing `]` at the end, so it is no JSON at all.
// The fixtures `review-list-closed-one-key-late-{1,2}.txt` are two such replies, and
// `review-list-closed-one-key-late-{1,2}-bracket-moved.txt` each of them with that one `]` moved and nothing else changed.
//
// Pinned here:
//  · code moves that one `]` itself (LIST_CLOSER_MOVED) before any repair call is made, and only under its rule
//    (`listCloserMoved`): the answer form states the key at the place of the object holding the list and not inside the
//    list; the `]` removed is the first closer, read on from the key, that stands where that object is the innermost
//    open container, nothing it holds closed before it; the value right before that `]` is no lone value under a key the
//    form states as a list; and the mended reply is strict JSON, one object, that writes no key twice in any object, no
//    dotted key and each key at a place the form states. Otherwise code mends nothing, a second fault beside the slip
//    included;
//  · a mended object the step's own check refuses is no object at all: the repair call and the follow-up to the original
//    AI go on as for any reply no object reads;
//  · the word-for-word check is the same as for any other reply: on a closed-late reply code does not mend (a second
//    fault on top, or a guard refusing), it reads the key's name as a text of the still-open list, so it refuses the
//    repair model's copy, and the review ends with `NodeReviewContentRefusedError`, the refusal the runner hands to
//    another reviewer (tests/integration/review-reply-refused.test.ts).
// A test named "guard: …" pins what holds with or without the mend and the hand-off; every other test needs them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  JUDGE_ANSWER_FORM, JUDGE_ARTIFACT_READING, Judge, NodeReviewContentRefusedError, PANEL_ANSWER_FORM, REVIEW_ARTIFACT_READING,
  WEB_STEP_PROMPT_CONTRACTS_IN_USE, classifyStructuredArtifact, judgeAssessmentSchema, nodeReviewArtifactSchema, reviewPromptContract
} from "@debateai/judgement";
import { MAP_ENGINE_ANSWER_FORMS } from "@debateai/map";
import { SYNTHESIZER_ANSWER_FORM } from "@debateai/serve";
import { STORYTELLER_ANSWER_FORM } from "@debateai/story";
import {
  PreviewGateUnavailable, ProviderCallFailedError, buildFramedPrompt, buildFramedRepairPrompt, decodeModelJson, readPromptFrame,
  salvageStructureReply, schemaFailureLocator, structureFollowUpFor, structureRepairKeepsWords, structureRepairTextsKeptAt,
  withStructureRepair, type ProviderCallRequest
} from "@debateai/providers";
import { HAIKU_REF, previewGlmHarness, scriptedRepairGateway } from "../support/lg-a-harness.js";

const fixture = (name: string) => readFileSync(new URL(`../support/fixtures/structure-repair-replies/${name}`, import.meta.url), "utf8");
/** `mended`: `broken` with only the list's `]` moved to right before the key. */
const REPLIES = [1, 2].map((n) => Object.freeze({
  name: `reply ${String(n)}`,
  broken: fixture(`review-list-closed-one-key-late-${String(n)}.txt`),
  mended: fixture(`review-list-closed-one-key-late-${String(n)}-bracket-moved.txt`)
}));
const REVIEW_KEY = "JUDGE:review:f689008b-e600-46ef-ab47-e2726d4b0d91";
const FORM = reviewPromptContract(1, true).answerForm;
const SCHEMA = nodeReviewArtifactSchema(1);
const PLACE = { textsKept: "place" as const };
const STOP = { finishReason: "stop" };
const classify = (content: string, reply?: { finishReason: string | null }) =>
  classifyStructuredArtifact(content, SCHEMA, reply, REVIEW_ARTIFACT_READING);
type Salvage = Parameters<typeof salvageStructureReply>[0];
const acceptAll: Salvage["classify"] = () => ({ parseStatus: "PARSED", parseError: null });
const salvageOf = (content: string, answerForm = FORM, textsKept: Salvage["textsKept"] = "place", check: Salvage["classify"] = classify) =>
  salvageStructureReply({ content, reply: STOP, answerForm, textsKept, classify: check });

describe("two replies with a list closed one key too late, as the engine reads them", () => {
  it.each(REPLIES)("guard: $name: one finished object with one `]` too late, which no reader of the engine reads", ({ broken, mended }) => {
    expect(decodeModelJson(broken, STOP).ok).toBe(false);
    expect(classify(broken, STOP)).toEqual({ parseStatus: "PARSE_FAILED", parseError: "No parsing strategy produced a JSON object" });
    // The mended text is the same text, character for character, except the one `]` moved from the end to before the key.
    const at = broken.indexOf("\",\"edge_bearings\":[");
    expect(at).toBeGreaterThan(0);
    expect(mended).toBe(`${broken.slice(0, at + 1)}]${broken.slice(at + 1, -3)}]}`);
    expect(broken.endsWith("]]}")).toBe(true);
    expect(classify(mended, STOP).parseStatus).toBe("PARSED");
    expect(structureRepairTextsKeptAt(REVIEW_KEY, "served")).toBe("place");
  });
});

/** The review's own request, as `Judge.review` frames it, on the GLM harness's preview gateway. */
function reviewRequest(): ProviderCallRequest {
  const framed = buildFramedPrompt({ contract: reviewPromptContract(1), material: [
    { name: "question_line", content: "Is new nuclear power cheaper than wind and solar with storage?" },
    { name: "statement", content: "Delivery risk undercuts the advertised cost of new reactors." },
    { name: "edges_sourced_by_this_node", content: JSON.stringify([{ ordinal: 0, relation: "support", target_statement: "Nuclear costs more." }]) }
  ] });
  return { runId: "run:review-slip", subjectItemId: "item:review-slip", callSiteKey: REVIEW_KEY, role: "JUDGE", lane: "served",
    modelRole: "REVIEWER", bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:review-slip",
    providerRef: "preview:fixture-a", packet: framed.packet, classifyContent: classify,
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected)) };
}
/** The repair model's route: answering `reply`, or failing with `reply` when it is an error. */
const route = (reply: string | Error) => {
  const repair = scriptedRepairGateway(reply);
  return { ...repair, route: { providerRef: HAIKU_REF, gateway: repair.gateway, bound: { tokenCeiling: 32768, deadlineMs: 1_260_000 } } };
};

describe("code moves the one `]` of a list closed one key too late (LIST_CLOSER_MOVED)", () => {
  it.each(REPLIES)("$name: code gives exactly the text with the `]` moved, and the step accepts it", ({ broken, mended }) => {
    const salvage = salvageOf(broken);
    expect(salvage).toMatchObject({ kind: "ACCEPTED", repairs: ["LIST_CLOSER_MOVED"],
      classification: { parseStatus: "PARSED", jsonRepair: "LIST_CLOSER_MOVED" } });
    expect(salvage.kind === "ACCEPTED" ? salvage.content : null).toBe(mended);
  });

  it.each(REPLIES)("$name: through the wrapper, no repair call is made and the review is the reviewer's own reply", async ({ broken, mended }) => {
    const original = previewGlmHarness([{ content: broken }]);
    const repair = route(mended);
    const result = await withStructureRepair(original.gateway, repair.route).call(reviewRequest());
    expect(repair.requests).toHaveLength(0);
    expect(result.repairForm).toBeUndefined();
    expect(result.content).toBe(mended);
    expect(original.artifacts).toHaveLength(1);
    expect(result.rawArtifactRef).toBe(original.artifacts[0]!.artifactId);
    expect(original.artifacts[0]!.replyRepairs).toEqual(["LIST_CLOSER_MOVED"]);
  });

  it("puts the slip right deeper in an object too, where the panel's form leaves `fit` one place", () => {
    const broken = "{\"context\":{\"ambiguityFlags\":[\"no country named\",\"fit\":0.85]}}";
    const salvage = salvageOf(broken, PANEL_ANSWER_FORM, "place", (content) => (JSON.parse(content) as { context: { fit: number } }).context.fit === 0.85
      ? { parseStatus: "PARSED", parseError: null } : { parseStatus: "SCHEMA_FAILED", parseError: "x" });
    expect(salvage).toMatchObject({ kind: "ACCEPTED", content: "{\"context\":{\"ambiguityFlags\":[\"no country named\"],\"fit\":0.85}}" });
  });

  it("moves a key whose object writes only other names, before the list or after it", () => {
    for (const [broken, mended] of [
      ["{\"outcome\":\"agree\",\"reasons\":[\"Fares fell.\",\"edge_bearings\":[0.85]]}",
        "{\"outcome\":\"agree\",\"reasons\":[\"Fares fell.\"],\"edge_bearings\":[0.85]}"],
      ["{\"reasons\":[\"Fares fell.\",\"edge_bearings\":[0.85]],\"outcome\":\"agree\"}",
        "{\"reasons\":[\"Fares fell.\"],\"edge_bearings\":[0.85],\"outcome\":\"agree\"}"]
    ] as const) {
      expect(salvageOf(broken)).toMatchObject({ kind: "ACCEPTED", content: mended, repairs: ["LIST_CLOSER_MOVED"] });
    }
  });

  it("a code fence around the reply holds no value: code still moves the `]`", () => {
    const fenced = "```json\n{\"outcome\":\"agree\",\"reasons\":[\"A.\",\"edge_bearings\":[0.85]]}\n```";
    expect(salvageOf(fenced)).toMatchObject({ kind: "ACCEPTED", repairs: ["LIST_CLOSER_MOVED"],
      content: "{\"outcome\":\"agree\",\"reasons\":[\"A.\"],\"edge_bearings\":[0.85]}" });
  });
});

describe("code mends nothing where its rule does not hold", () => {
  it("guard: not where the form leaves the key a second place, or where anything else is wrong", () => {
    const [{ broken }] = REPLIES as [typeof REPLIES[number]];
    const none = (content: string, answerForm = FORM) => expect(salvageOf(content, answerForm).kind, content.slice(-60)).toBe("NO_OBJECT");
    // The form states the key inside the list's entries too (the reply may have left out an entry's braces).
    none(broken, "{\"outcome\": string, \"reasons\": [{\"text\": string, \"edge_bearings\": [number]}], \"edge_bearings\": [number]}");
    // The form does not state the key at the holder's place.
    none(broken, "{\"outcome\": string, \"reasons\": [string], \"bearings\": [number]}");
    // A second fault beside the slip.
    none(broken.replace("\"outcome\":", "\"outcome\"::"));
    // The key is the list's first entry: no list entry before it, so no list closed late.
    none("{\"outcome\":\"agree\",\"reasons\":[\"edge_bearings\":[0.85]]}");
    // The list's late closer is a `}`, or there is none to move.
    none("{\"outcome\":\"agree\",\"reasons\":[\"Fares fell.\",\"edge_bearings\":[0.85]}}");
    none("{\"outcome\":\"agree\",\"reasons\":[\"Fares fell.\",\"edge_bearings\":[0.85]]");
    // A key in a list inside another list.
    none("{\"outcome\":\"agree\",\"reasons\":[[\"Fares fell.\",\"edge_bearings\":[0.85]]]}");
    // A reply that is a list holding the object.
    none("[{\"outcome\":\"agree\",\"reasons\":[\"A.\",\"edge_bearings\":[0.85]]}]");
  });

  it("guard: not a key the form also states inside the list: a fatal flag's `severity` may be a second flag that lost its braces", () => {
    const flag = { type: "STRAW_MAN", severity: 0.2, description: "It answers a weaker claim." };
    const broken = `{"fallacy":{"fatalFlags":[${JSON.stringify(flag)},"severity":0.5]}}`;
    expect(salvageOf(broken, PANEL_ANSWER_FORM, "place", acceptAll).kind).toBe("NO_OBJECT");
  });

  it("guard: not a story paragraph that lost its braces: the section states no such key", () => {
    const paragraph = { text: "Fares fell in the first year.", node_refs: ["P1"] };
    const broken = `{"long":{"sections":[{"title":"Fares","paragraphs":[${JSON.stringify(paragraph)},"text":"Riders rose in the second.",`
      + "\"node_refs\":[\"P2\"]]}]}}";
    expect(salvageOf(broken, STORYTELLER_ANSWER_FORM, "anywhere", acceptAll).kind).toBe("NO_OBJECT");
  });

  it("guard: not a closed-late reply with a second fault beside the slip, whatever the step's check would say", () => {
    const none = (content: string, answerForm: string, textsKept: Salvage["textsKept"]) =>
      expect(salvageOf(content, answerForm, textsKept, acceptAll).kind, content.slice(0, 80)).toBe("NO_OBJECT");
    // A one-entry list that lost its `[`: the late `]` may close that list, not `reasons`.
    none("{\"outcome\":\"agree\",\"reasons\":[\"a\",\"edge_bearings\":0.85]}", FORM, "place");
    expect(salvageOf("{\"outcome\":\"agree\",\"reasons\":[\"a\",\"edge_bearings\":0.85]}").kind).toBe("NO_OBJECT");
    // The story's paths list left open before `change`, and much later a one-entry list that lost its `[`, deeper: the
    // story's object closes before any `]` stands at its depth.
    const path = (ref: string) => `{"position_ref":"${ref}","fate":"HELD_UP","line":"L.","node_refs":["P1"]}`;
    none(`{"shape_id":"S1","short":{"headline":"H.","summary":"S.","confidence":"C.","paths":[${path("A1")},${path("A2")},`
      + "\"change\":{\"text\":\"T.\",\"node_refs\":[\"P2\"]}},\"why\":{\"reasons\":[{\"text\":\"R.\",\"node_refs\":[\"P1\"]}]},"
      + "\"long\":{\"sections\":[{\"title\":\"Fares\",\"paragraphs\":[{\"text\":\"Fares fell.\",\"node_refs\":\"t329\"]}]}]},"
      + "\"reviewer_note\":null}", STORYTELLER_ANSWER_FORM, "anywhere");
    // The `]` written after the object holding the list closed, and a member after it.
    none("{\"a\":{\"reasons\":[\"x\",\"edge_bearings\":[1]},\"b\":2]}",
      "{\"a\": {\"reasons\": [string], \"edge_bearings\": [number]}, \"b\": number}", "place");
    // The `}` of the panel's context written too late: `fallacy` would stand inside `context`.
    none("{\"context\":{\"ambiguityFlags\":[\"no country\",\"fit\":0.85],\"fallacy\":{\"severity\":0,\"fatalFlags\":[]}}}",
      PANEL_ANSWER_FORM, "place");
    // A stray `]` deeper than the object holding the list, closing an object written after the moved key.
    none("{\"outcome\":\"agree\",\"reasons\":[\"a\",\"edge_bearings\":[1],\"note\":{\"x\":1]}}", FORM, "place");
  });

  it("guard: not a dotted key: it may name a value its object writes under its first part", () => {
    // `context.fit` written inside a list held at the top, beside the `context` object that holds `fit` already.
    const broken = "{\"context\":{\"fit\":0.2,\"ambiguityFlags\":[\"no country\"]},\"notes\":[\"Fine.\",\"context.fit\":0.85]}";
    expect(salvageOf(broken, PANEL_ANSWER_FORM, "place", acceptAll).kind).toBe("NO_OBJECT");
  });
});

/**
 * A key written inside a still-open list, in a reply that, with that key moved out of the list, writes one place twice:
 * a name the holder object also writes (before the list, after it, as the list's own key, or after the moved key and
 * before the late `]`), the holder object itself written twice, or a dotted key that names the same place from another
 * object (`"context.fit"` one level up). Moved, one value would stand for the other or be replaced by it (JSON keeps a
 * key's last value), so code mends nothing; and the word check refuses both `copy` (which keeps only the value written
 * inside the list, or after it) and `other` (which keeps only the other one). On the review's own form and check, and on
 * the other steps whose forms state a key beside a list (the panel, the judge legs, the storyteller, the map's merge, the
 * web planner).
 */
const STORY_PATH = "{\"position_ref\":\"A1\",\"fate\":\"HELD_UP\",\"line\":\"L.\",\"node_refs\":[\"P1\"]}";
const PANEL_REST = {
  steelman: { summary: "S.", fidelity: 0.9 }, critic: { summary: "C.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.5, relevance: 0.6 }, fallacy: { severity: 0, fatalFlags: [] }
};
/** A panel reply whose `context` part is written as given, and a whole panel copy whose context keeps one `fit`. */
const panelReply = (context: string): string => "{\"steelman\":{\"summary\":\"S.\",\"fidelity\":0.9},\"critic\":{\"summary\":\"C.\","
  + `"counterargumentStrength":0.4,"basis":"REAL_ATTACK"},"evidence":{"quality":0.5,"relevance":0.6},${context},`
  + "\"fallacy\":{\"severity\":0,\"fatalFlags\":[]}}";
const panelCopy = (fit: number) => ({ steelman: { summary: "S.", fidelity: 0.9 },
  critic: { summary: "C.", counterargumentStrength: 0.4, basis: "REAL_ATTACK" }, evidence: { quality: 0.5, relevance: 0.6 },
  context: { fit, ambiguityFlags: ["no country"] }, fallacy: { severity: 0, fatalFlags: [] } });
const PANEL_FIT_TWICE = {
  dottedBefore: panelReply("\"context.fit\":0.2,\"context\":{\"ambiguityFlags\":[\"no country\",\"fit\":0.85]}"),
  dottedAfter: panelReply("\"context\":{\"ambiguityFlags\":[\"no country\",\"fit\":0.85]},\"context.fit\":0.2"),
  holderTwice: panelReply("\"context\":{\"fit\":0.2,\"ambiguityFlags\":[\"no country\"]},\"context\":{\"ambiguityFlags\":[\"no country\",\"fit\":0.85]}")
};
const webPlannerCopy = (needsSearch: boolean) => ({ country: null, answers: [{ answer_id: "a1", needs_search: needsSearch,
  reason: "Settled by the material.", pace: null, searches: [{ side: "for", local: false, query: "q" }] }] });
/**
 * `decodes`: the tolerant decoder reads the reply after all (its inner-quote repair takes the rest of the list for one
 * long text), so the step refuses it for what it lacks and code hands that object on unmended (PARTIAL), with no bracket
 * moved; every other row reads as no object at all (NO_OBJECT).
 */
const SAME_NAME: readonly Readonly<{ name: string; broken: string; copy: unknown; other: unknown; answerForm: string;
  textsKept: Salvage["textsKept"]; classify: Salvage["classify"]; decodes?: true }>[] = [
  { name: "a verdict written first, and a different one inside the list",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"The node is sound.\",\"outcome\":\"dispute\",\"edge_bearings\":[0.85]]}",
    copy: { outcome: "dispute", reasons: ["The node is sound."], edge_bearings: [0.85] },
    other: { outcome: "agree", reasons: ["The node is sound."], edge_bearings: [0.85] }, answerForm: FORM, textsKept: "place", classify },
  { name: "a verdict written first, and a different one inside the list, in other words",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"The point holds.\",\"outcome\":\"dispute\",\"edge_bearings\":[0.85]]}",
    copy: { outcome: "dispute", reasons: ["The point holds."], edge_bearings: [0.85] },
    other: { outcome: "agree", reasons: ["The point holds."], edge_bearings: [0.85] }, answerForm: FORM, textsKept: "place", classify },
  { name: "the list's own key written again inside it",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"Fares fell.\",\"reasons\":[\"Riders rose.\"]],\"edge_bearings\":[0.85]}",
    copy: { outcome: "agree", reasons: ["Riders rose."], edge_bearings: [0.85] },
    other: { outcome: "agree", reasons: ["Fares fell."], edge_bearings: [0.85] }, answerForm: FORM, textsKept: "place", classify },
  { name: "the key written before the list",
    broken: "{\"outcome\":\"agree\",\"edge_bearings\":[0.1],\"reasons\":[\"Sound.\",\"edge_bearings\":[0.9]]}",
    copy: { outcome: "agree", reasons: ["Sound."], edge_bearings: [0.9] },
    other: { outcome: "agree", reasons: ["Sound."], edge_bearings: [0.1] }, answerForm: FORM, textsKept: "place", classify },
  { name: "the key written before the list, in other words",
    broken: "{\"outcome\":\"agree\",\"edge_bearings\":[0.1],\"reasons\":[\"The point holds.\",\"edge_bearings\":[0.85]]}",
    copy: { outcome: "agree", reasons: ["The point holds."], edge_bearings: [0.85] },
    other: { outcome: "agree", reasons: ["The point holds."], edge_bearings: [0.1] }, answerForm: FORM, textsKept: "place", classify },
  { name: "the key written after the list",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"Sound.\",\"edge_bearings\":[0.1]],\"edge_bearings\":[0.9]}",
    copy: { outcome: "agree", reasons: ["Sound."], edge_bearings: [0.9] },
    other: { outcome: "agree", reasons: ["Sound."], edge_bearings: [0.1] }, answerForm: FORM, textsKept: "place", classify },
  { name: "the panel's fit written before its flags list, and again inside it",
    broken: "{\"steelman\":{\"summary\":\"S.\",\"fidelity\":0.9},\"critic\":{\"summary\":\"C.\",\"counterargumentStrength\":0.3,"
      + "\"basis\":\"PLAUSIBLE_COUNTER\"},\"evidence\":{\"quality\":0.5,\"relevance\":0.6},"
      + "\"context\":{\"fit\":0.2,\"ambiguityFlags\":[\"no country\",\"fit\":0.85]},\"fallacy\":{\"severity\":0,\"fatalFlags\":[]}}",
    copy: { ...PANEL_REST, context: { fit: 0.85, ambiguityFlags: ["no country"] } },
    other: { ...PANEL_REST, context: { fit: 0.2, ambiguityFlags: ["no country"] } },
    answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: acceptAll },
  { name: "the story's summary written before its paths list, and a different one inside it",
    broken: "{\"shape_id\":\"S1\",\"short\":{\"headline\":\"H.\",\"summary\":\"Nuclear power is the cheaper answer here.\","
      + `"confidence":"C.","paths":[${STORY_PATH},"summary":"Wind and solar with storage are the cheaper answer here.",`
      + "\"change\":{\"text\":\"T.\",\"node_refs\":[\"P2\"]}]}}",
    copy: { shape_id: "S1", short: { headline: "H.", summary: "Wind and solar with storage are the cheaper answer here.", confidence: "C.",
      paths: [JSON.parse(STORY_PATH) as unknown], change: { text: "T.", node_refs: ["P2"] } } },
    other: { shape_id: "S1", short: { headline: "H.", summary: "Nuclear power is the cheaper answer here.", confidence: "C.",
      paths: [JSON.parse(STORY_PATH) as unknown], change: { text: "T.", node_refs: ["P2"] } } },
    answerForm: STORYTELLER_ANSWER_FORM, textsKept: "anywhere", classify: acceptAll },
  { name: "the story's change text and refs written before its refs list, and different ones inside it",
    broken: "{\"short\":{\"change\":{\"text\":\"Cheaper storage would change the answer.\",\"node_refs\":[\"P2\","
      + "\"text\":\"Nothing would change the answer.\",\"node_refs\":[\"P9\"]]}}}",
    copy: { short: { change: { text: "Nothing would change the answer.", node_refs: ["P9"] } } },
    other: { short: { change: { text: "Cheaper storage would change the answer.", node_refs: ["P2"] } } },
    answerForm: STORYTELLER_ANSWER_FORM, textsKept: "anywhere", classify: acceptAll },
  { name: "a key point's claim and members written before its members list, and different ones inside it",
    broken: "{\"key_points\":[{\"key_point_id\":\"K1\",\"claim\":\"Nuclear is cheap.\",\"member_item_ids\":[\"i1\","
      + "\"claim\":\"Nuclear is expensive.\",\"member_item_ids\":[\"i2\"]]}],\"answers\":[]}",
    copy: { key_points: [{ key_point_id: "K1", claim: "Nuclear is expensive.", member_item_ids: ["i2"] }], answers: [] },
    other: { key_points: [{ key_point_id: "K1", claim: "Nuclear is cheap.", member_item_ids: ["i1"] }], answers: [] },
    answerForm: MAP_ENGINE_ANSWER_FORMS.merge, textsKept: "anywhere", classify: acceptAll },
  { name: "the web planner's needs_search written before its searches list, and a different one inside it",
    broken: "{\"country\":null,\"answers\":[{\"answer_id\":\"A1\",\"needs_search\":false,\"reason\":\"Settled by the material.\","
      + "\"pace\":null,\"searches\":[{\"side\":\"for\",\"local\":false,\"query\":\"q\"},\"needs_search\":true]}]}",
    copy: { country: null, answers: [{ answer_id: "A1", needs_search: true, reason: "Settled by the material.", pace: null,
      searches: [{ side: "for", local: false, query: "q" }] }] },
    other: { country: null, answers: [{ answer_id: "A1", needs_search: false, reason: "Settled by the material.", pace: null,
      searches: [{ side: "for", local: false, query: "q" }] }] },
    answerForm: WEB_STEP_PROMPT_CONTRACTS_IN_USE[0]!.answerForm, textsKept: "anywhere", classify: acceptAll },
  { name: "the story's change text written before its refs list, and a different one inside it, with a second slip",
    broken: "{\"short\"::{\"change\":{\"text\":\"Cheaper storage would change the answer.\",\"node_refs\":[\"P2\","
      + "\"text\":\"Nothing would change the answer.\"]}}}",
    copy: { short: { change: { text: "Nothing would change the answer.", node_refs: ["P2"] } } },
    other: { short: { change: { text: "Cheaper storage would change the answer.", node_refs: ["P2"] } } },
    answerForm: STORYTELLER_ANSWER_FORM, textsKept: "anywhere", classify: acceptAll },
  { name: "the list's own key again after the moved key, before the late `]`",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"Fares fell.\",\"edge_bearings\":[0.85],\"reasons\":[\"Riders rose.\"]]}",
    copy: { outcome: "agree", reasons: ["Riders rose."], edge_bearings: [0.85] },
    other: { outcome: "agree", reasons: ["Fares fell."], edge_bearings: [0.85] }, answerForm: FORM, textsKept: "place", classify },
  { name: "two braces after the late `]`: a verdict written again after the moved key",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"The point holds.\",\"edge_bearings\":[0.85],\"outcome\":\"dispute\"]}}",
    copy: { outcome: "dispute", reasons: ["The point holds."], edge_bearings: [0.85] },
    other: { outcome: "agree", reasons: ["The point holds."], edge_bearings: [0.85] }, answerForm: FORM, textsKept: "place", classify },
  { name: "one brace after the late `]`: a verdict written again after the moved key",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"The point holds.\",\"edge_bearings\":[0.85],\"outcome\":\"dispute\"]}",
    copy: { outcome: "dispute", reasons: ["The point holds."], edge_bearings: [0.85] },
    other: { outcome: "agree", reasons: ["The point holds."], edge_bearings: [0.85] }, answerForm: FORM, textsKept: "place", classify,
    decodes: true },
  { name: "a doubled colon: a verdict written again after the moved key",
    broken: "{\"outcome\"::\"agree\",\"reasons\":[\"The point holds.\",\"edge_bearings\":[0.85],\"outcome\":\"dispute\"]}",
    copy: { outcome: "dispute", reasons: ["The point holds."], edge_bearings: [0.85] },
    other: { outcome: "agree", reasons: ["The point holds."], edge_bearings: [0.85] }, answerForm: FORM, textsKept: "place", classify },
  { name: "the panel's fit written as a dotted key before the context object, and again inside its flags list",
    broken: PANEL_FIT_TWICE.dottedBefore, copy: panelCopy(0.85), other: panelCopy(0.2),
    answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: acceptAll },
  { name: "the panel's fit written inside the context object's flags list, and again as a dotted key after it",
    broken: PANEL_FIT_TWICE.dottedAfter, copy: panelCopy(0.85), other: panelCopy(0.2),
    answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: acceptAll },
  { name: "the panel's context object written twice, its fit in the first and inside the second's flags list",
    broken: PANEL_FIT_TWICE.holderTwice, copy: panelCopy(0.85), other: panelCopy(0.2),
    answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: acceptAll },
  { name: "a judge leg's fit written as a dotted key before the context object, and again inside its flags list",
    broken: PANEL_FIT_TWICE.dottedBefore, copy: panelCopy(0.85), other: panelCopy(0.2),
    answerForm: JUDGE_ANSWER_FORM, textsKept: "place", classify: acceptAll },
  { name: "a dotted answers.needs_search at the top, and needs_search inside an answer's searches list",
    broken: "{\"country\":null,\"answers.needs_search\":false,\"answers\":[{\"answer_id\":\"a1\",\"reason\":\"Settled by the material.\","
      + "\"pace\":null,\"searches\":[{\"side\":\"for\",\"local\":false,\"query\":\"q\"},\"needs_search\":true]}]}",
    copy: webPlannerCopy(true), other: webPlannerCopy(false),
    answerForm: WEB_STEP_PROMPT_CONTRACTS_IN_USE[0]!.answerForm, textsKept: "anywhere", classify: acceptAll }
];

describe("code mends nothing where, with the key moved out of the list, the reply would write one place twice", () => {
  it.each(SAME_NAME)("guard: $name: code mends nothing, and the word check refuses a copy that keeps only one of the two values",
    ({ broken, copy, other, answerForm, textsKept, classify: check, decodes }) => {
      expect(decodeModelJson(broken, STOP).ok).toBe(decodes === true);
      expect(salvageOf(broken, answerForm, textsKept, check).kind).toBe(decodes === true ? "PARTIAL" : "NO_OBJECT");
      expect(structureRepairKeepsWords(broken, copy, answerForm, { textsKept })).toBe(false);
      expect(structureRepairKeepsWords(broken, other, answerForm, { textsKept })).toBe(false);
    });
});

/**
 * A key written inside a still-open list, in a reply that, with that key moved out of the list, is no strict JSON: the
 * model went on writing in the list after the moved key (a reason, a flag, a number, true/false, a null or an object)
 * before the late `]`, wrote a sentence with no key in another object, or wrote a value after the object closed. Moved,
 * such a value would have no key of its own, so code mends nothing; and the word check refuses `copy`, which drops that
 * value and passes the step's own check.
 */
const panelCheck: Salvage["classify"] = (content) => classifyStructuredArtifact(content, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING);
const reviewCopy = (reasons: string[], bearings: number[] = [0.85]) => ({ outcome: "agree", reasons, edge_bearings: bearings });
const flagsCopy = (ambiguityFlags: string[]) => ({ ...panelCopy(0.85), context: { fit: 0.85, ambiguityFlags } });
const REASON_ON_ITS_OWN_LINE = "{\n  \"outcome\": \"agree\",\n  \"reasons\": [\n    \"The fare data holds.\",\n    \"edge_bearings\": [0.85],\n"
  + "    \"The rival point fails.\"\n  ]\n}";
const FLAG_AFTER_FIT = panelReply("\"context\":{\"ambiguityFlags\":[\"no country\",\"fit\":0.85,\n\"no date range\"]}");
const KEYLESS: readonly Readonly<{ name: string; broken: string; copy: unknown; answerForm: string; textsKept: Salvage["textsKept"];
  classify: Salvage["classify"] }>[] = [
  { name: "a reason after the moved key, on a line of its own", broken: REASON_ON_ITS_OWN_LINE, copy: reviewCopy(["The fare data holds."]),
    answerForm: FORM, textsKept: "place", classify },
  { name: "a reason after the moved key, where the step keeps a text under any name the form states",
    broken: REASON_ON_ITS_OWN_LINE, copy: reviewCopy(["The fare data holds."]), answerForm: FORM, textsKept: "anywhere", classify },
  { name: "a reason after the moved key, with a doubled colon",
    broken: "{\"outcome\"::\"agree\",\"reasons\":[\"The point holds.\",\"edge_bearings\":[0.85],\"The point fails on cost.\"]}",
    copy: reviewCopy(["The point holds."]), answerForm: FORM, textsKept: "place", classify },
  { name: "a reason after the moved key, with the last brace missing",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"The point holds.\",\"edge_bearings\":[0.85],\"The point fails on cost.\"]",
    copy: reviewCopy(["The point holds."]), answerForm: FORM, textsKept: "place", classify },
  { name: "a number after the moved key's list", broken: "{\"outcome\":\"agree\",\"reasons\":[\"A.\",\"edge_bearings\":[0.2],0.9]}",
    copy: reviewCopy(["A."], [0.2]), answerForm: FORM, textsKept: "place", classify },
  { name: "an object after the moved key's list",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"A.\",\"edge_bearings\":[0.85],{\"reasons\":[\"B.\"]}]}",
    copy: reviewCopy(["A.", "B."]), answerForm: FORM, textsKept: "place", classify },
  { name: "a null after the moved key's list", broken: "{\"outcome\":\"agree\",\"reasons\":[\"A.\",\"edge_bearings\":[0.85],null]}",
    copy: reviewCopy(["A."]), answerForm: FORM, textsKept: "place", classify },
  { name: "the panel's second flag after the moved fit", broken: FLAG_AFTER_FIT, copy: flagsCopy(["no country"]),
    answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: panelCheck },
  { name: "a judge leg's second flag after the moved fit", broken: FLAG_AFTER_FIT, copy: flagsCopy(["no country"]),
    answerForm: JUDGE_ANSWER_FORM, textsKept: "place", classify: acceptAll },
  { name: "the panel's second fit, in an object after the moved fit",
    broken: panelReply("\"context\":{\"ambiguityFlags\":[\"no country\",\"fit\":0.85,{\"fit\":0.2}]}"), copy: flagsCopy(["no country"]),
    answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: panelCheck },
  { name: "the panel's number after the moved fit", broken: panelReply("\"context\":{\"ambiguityFlags\":[\"no country\",\"fit\":0.85,0.2]}"),
    copy: flagsCopy(["no country"]), answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: panelCheck },
  { name: "the panel's flag after the moved fit, with a doubled colon", broken: "{\"context\"::{\"ambiguityFlags\":[\"a\",\"fit\":0.85,\"b\"]}}",
    copy: { context: { fit: 0.85, ambiguityFlags: ["a"] } }, answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: acceptAll },
  { name: "the map gap's framing challenge after the moved key",
    broken: "{\"new_points\":[{\"claim\":\"P1\"},\"framing_challenges\":[\"F1\"],\n\"F2\"]}",
    copy: { new_points: [{ claim: "P1" }], framing_challenges: ["F1"] },
    answerForm: MAP_ENGINE_ANSWER_FORMS.gap, textsKept: "anywhere", classify: acceptAll },
  { name: "the web planner's true/false after the moved needs_search",
    broken: "{\"country\":null,\"answers\":[{\"answer_id\":\"a1\",\"reason\":\"Settled by the material.\",\"pace\":null,\"searches\":["
      + "{\"side\":\"for\",\"local\":false,\"query\":\"q\"},{\"side\":\"against\",\"local\":true,\"query\":\"r\"},\"needs_search\":true,false]}]}",
    copy: { country: null, answers: [{ answer_id: "a1", needs_search: true, reason: "Settled by the material.", pace: null,
      searches: [{ side: "for", local: false, query: "q" }, { side: "against", local: true, query: "r" }] }] },
    answerForm: WEB_STEP_PROMPT_CONTRACTS_IN_USE[0]!.answerForm, textsKept: "anywhere", classify: acceptAll },
  { name: "a sentence with no key in another object of the panel's reply",
    broken: panelReply("\"context\":{\"ambiguityFlags\":[\"no country\",\"fit\":0.85]}")
      .replace("\"fidelity\":0.9}", "\"fidelity\":0.9,\n\"It holds for imports too.\"}"),
    copy: flagsCopy(["no country"]), answerForm: PANEL_ANSWER_FORM, textsKept: "place", classify: panelCheck },
  { name: "a reason after the reply's object closed, before the late `]`",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"A.\",\"edge_bearings\":[0.85]},\n\"B.\"]}",
    copy: reviewCopy(["A."]), answerForm: FORM, textsKept: "place", classify },
  { name: "a second object after the reply's object",
    broken: "{\"outcome\":\"agree\",\"reasons\":[\"A.\",\"edge_bearings\":[0.85]]}\n{\"note\":\"B.\"}",
    copy: reviewCopy(["A."]), answerForm: FORM, textsKept: "place", classify }
];

describe("code mends nothing where, with the key moved out of the list, the reply would be no strict JSON", () => {
  it.each(KEYLESS)("guard: $name: code mends nothing, and the word check refuses the copy that drops that value",
    ({ broken, copy, answerForm, textsKept, classify: check }) => {
      expect(decodeModelJson(broken, STOP).ok).toBe(false);
      expect(salvageOf(broken, answerForm, textsKept, check).kind).toBe("NO_OBJECT");
      expect(check(JSON.stringify(copy), STOP).parseStatus).toBe("PARSED");
      expect(structureRepairKeepsWords(broken, copy, answerForm, { textsKept })).toBe(false);
    });
});

/**
 * A closed-late review reply code does not mend goes to the structure-repair call. The repair model's copy passes the
 * review's own check, but the word check reads the reply as it came, the moved key's name a text of the still-open list,
 * and refuses it; so the review ends with `NodeReviewContentRefusedError`, which the runner answers by offering the point
 * to another reviewer. `copy` is the repair model's answer: for the two replies with a doubled colon too, the reply with
 * that colon mended and its `]` moved, every word as written.
 */
const [twiceVerdicts] = SAME_NAME as [typeof SAME_NAME[number]];
const [reasonAfterKey] = KEYLESS as [typeof KEYLESS[number]];
const NOT_MENDED: readonly Readonly<{ name: string; broken: string; copy: string }>[] = [
  ...REPLIES.map(({ name, broken, mended }) => ({ name: `${name} with a doubled colon too`,
    broken: broken.replace("\"outcome\":", "\"outcome\"::"), copy: mended })),
  { name: twiceVerdicts.name, broken: twiceVerdicts.broken, copy: JSON.stringify(twiceVerdicts.copy) },
  { name: reasonAfterKey.name, broken: reasonAfterKey.broken, copy: JSON.stringify(reasonAfterKey.copy) }
];

describe("a closed-late review reply code does not mend ends as a refusal another reviewer takes over", () => {
  it.each(NOT_MENDED)("$name: the step accepts the repair copy, the word check refuses it, and the review is refused for its content",
    async ({ broken, copy }) => {
      expect(broken).not.toBe(copy);
      expect(salvageOf(broken).kind).toBe("NO_OBJECT");
      expect(classify(copy, STOP).parseStatus).toBe("PARSED");
      expect(structureRepairKeepsWords(broken, JSON.parse(copy), FORM, PLACE)).toBe(false);
      const original = previewGlmHarness([{ content: broken }]);
      const repair = route(copy);
      const reviewing = new Judge(withStructureRepair(original.gateway, repair.route)).review({
        runId: "run:review-slip", subjectItemId: "item:review-slip", callSiteKey: REVIEW_KEY,
        questionLine: "Is new nuclear power cheaper than wind and solar with storage?",
        statement: "Delivery risk undercuts the advertised cost of new reactors.", authorMaker: "maker:author",
        providerRef: "preview:fixture-a", contractHash: "contract:review-slip",
        bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 },
        edges: [{ edgeId: "edge:1", targetStatement: "Nuclear costs more.", polarity: "support" }]
      });
      await expect(reviewing).rejects.toBeInstanceOf(NodeReviewContentRefusedError);
      await expect(reviewing).rejects.toMatchObject({ code: "NODE_REVIEW_SCHEMA_FAILURE" });
      expect(repair.requests).toHaveLength(1);
    });
});

/**
 * A reply code mends but whose mended object the step's own check refuses goes on exactly as a reply no object reads:
 * the same structure-repair call, on the reply as it came, and the same follow-up to the original AI (the answer writer's
 * full re-ask; none for a review). The one thing the mend adds is a mended object the step's own check accepts.
 */
const brokenReplyOf = (request: ProviderCallRequest): string | undefined =>
  readPromptFrame(request.packet).fields.find((field) => field.name === "broken_reply")?.content;
const haikuDown = () => route(new ProviderCallFailedError(new PreviewGateUnavailable(), 1, "FAILED", "ledger:haiku"));
/** A first reply the gateway refused as unreadable, as the wrapper hands it to `structureFollowUpFor`. */
const unreadable = (rawText: string) => ({ rejected: { rawText, parseStatus: "PARSE_FAILED" as const, parseError: "PARSE_FAILED",
  failureClass: "STRUCTURE" as const }, rawArtifactRef: "artifact:first", ledgerEntryRef: "ledger:first", materialMarked: false });
/** An answer form that states its keys in quotes, one of them a list, with a check that takes a score of at most 1. */
const LISTED_FORM = "Return only JSON {\"answer\": string, \"sources\": [string], \"score\": number}.";
const LISTED_SCHEMA = z.object({ answer: z.string().min(1), sources: z.array(z.string()), score: z.number().min(0).max(1) }).strict();
const listedFramed = buildFramedPrompt({ contract: { contractId: "test.list-closer.v1", instruction: "Answer the question in one sentence.",
  answerForm: LISTED_FORM }, material: [{ name: "question", content: "Is it so?" }] });
/** The answer writer's call (its own call-site key), with the form above. */
function writerRequest(): ProviderCallRequest {
  return { runId: "run:writer-slip", subjectItemId: "item:writer-slip", callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1", role: "SYNTHESIZER",
    lane: "served", bound: { maxAttempts: 3, tokenCeiling: 8192, deadlineMs: 600_000 }, contractHash: "contract:writer-slip",
    providerRef: "preview:fixture-a", packet: listedFramed.packet,
    classifyContent: (content, reply) => classifyStructuredArtifact(content, LISTED_SCHEMA, reply, { fixer: {} }),
    buildRepairPacket: (rejected) => buildFramedRepairPrompt(listedFramed, schemaFailureLocator(rejected)) };
}

describe("a mended reply the step's own check refuses goes on as a reply no object reads", () => {
  it("the answer writer: the same repair call on the reply as it came, then the full re-ask of the whole answer", async () => {
    const broken = "{\"answer\":\"It is so.\",\"sources\":[\"s1\",\"score\":5]}";
    // The writer's own form states no key in quotes, so code mends no reply of it.
    expect(salvageOf(broken, SYNTHESIZER_ANSWER_FORM, "anywhere", acceptAll).kind).toBe("NO_OBJECT");
    // On a form that states its keys code mends this one, and the step's check refuses the mended score.
    expect(salvageOf(broken, LISTED_FORM, "anywhere", acceptAll).kind).toBe("ACCEPTED");
    expect(salvageOf(broken, LISTED_FORM, "anywhere", writerRequest().classifyContent!).kind).toBe("NO_OBJECT");
    expect(structureFollowUpFor(writerRequest(), unreadable(broken))).toMatchObject({ form: "FULL" });
    const answer = "{\"answer\":\"It is so.\",\"sources\":[\"s1\"],\"score\":0.5}";
    const original = previewGlmHarness([{ content: broken }, { content: answer }]);
    const repair = haikuDown();
    const result = await withStructureRepair(original.gateway, repair.route).call(writerRequest());
    expect(repair.requests.map(brokenReplyOf)).toEqual([broken]);
    expect(result).toMatchObject({ content: answer, repairForm: "FULL" });
    expect(original.executions).toHaveLength(2);
  });

  it("the review: the same repair call on the reply as it came, and no follow-up to the reviewer", async () => {
    // Two bearings for the one edge the review names: code mends the reply, and the review's check refuses it.
    const broken = "{\"outcome\":\"agree\",\"reasons\":[\"The point holds.\",\"edge_bearings\":[0.85,0.4]]}";
    expect(salvageOf(broken, FORM, "place", acceptAll).kind).toBe("ACCEPTED");
    expect(classify("{\"outcome\":\"agree\",\"reasons\":[\"The point holds.\"],\"edge_bearings\":[0.85,0.4]}", STOP).parseStatus)
      .toBe("SCHEMA_FAILED");
    expect(salvageOf(broken).kind).toBe("NO_OBJECT");
    expect(structureFollowUpFor(reviewRequest(), unreadable(broken))).toBeNull();
    const original = previewGlmHarness([{ content: broken }, { content: "{\"edge_bearings\":[0.85]}" }]);
    const repair = haikuDown();
    await expect(withStructureRepair(original.gateway, repair.route).call(reviewRequest()))
      .rejects.toMatchObject({ code: "PROVIDER_CONTENT_UNACCEPTED" });
    expect(repair.requests.map(brokenReplyOf)).toEqual([broken]);
    expect(original.executions).toHaveLength(1);
  });
});
