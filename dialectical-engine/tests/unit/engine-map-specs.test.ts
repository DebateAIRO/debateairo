// tests/unit/engine-map-specs.test.ts
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, replyLanguageExpectation } from "@debateai/kernel";
import {
  mapAnglesSpec, mapCheckSpec, mapChooseSpec, mapGapSpec, mapListSpec, mapMergeSpec, mapSnowballSpec, type MapItem, type MapKeyPoint, type MapLength,
  type MapMergedAnswer, type MapSpecContext
} from "@debateai/map";
import { buildFramedPrompt, readPromptFrame } from "@debateai/providers";

const Q = "Should a mid-sized city make its central bus lines free to ride?";
const LENGTH: MapLength = { targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const ctx = (extra: Partial<MapSpecContext> = {}): MapSpecContext => ({ questionLine: Q, languageName: "English", languageTag: "en",
  replyLanguage: replyLanguageExpectation(Q), length: LENGTH, engine: true, ...extra });
const frameOf = (spec: { contract: Parameters<typeof buildFramedPrompt>[0]["contract"]; material: Parameters<typeof buildFramedPrompt>[0]["material"] }) =>
  readPromptFrame(buildFramedPrompt({ contract: spec.contract, material: spec.material }).packet);
const KEY_POINTS: readonly MapKeyPoint[] = [{ keyPointId: "kp01", claim: "Fares fund night buses.", memberItemIds: ["pt01"],
  blindMakers: ["m1", "m2"], gapMakers: [], makers: ["m1", "m2"], fixedAngleKinds: ["OPPOSITE_CASE"], leansAgainst: true, restsOn: "question" }];
const MERGED: readonly MapMergedAnswer[] = [{ answerId: "an01", answer: "Yes, where buses run full.", memberItemIds: ["ca01", "ca02"],
  blindMakers: ["m1", "m3"], makers: ["m1", "m3"], fromOppositeCase: false }];

describe("engine 2: the map's step specs (spec §5.2 items 1-5)", () => {
  it("a list is framed under its v2 contract with the length parts before question_language; it is marked engine", () => {
    const spec = mapListSpec(ctx(), null);
    const frame = frameOf(spec);
    expect(frame.contractId).toBe("map.list.open.v2");
    // `ctx` emits the ISO tag "en", so the map's lock adds question_language LAST (as LG-C's PF-C5.2) (pre-flight PF-R33.3).
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "length", "question_language"]);
    expect(spec.engine).toBe(true);
    expect(spec.guidedWords).toBe(LENGTH.targets.claim + LENGTH.targets.whyItMatters + LENGTH.targets.candidateAnswer);
  });

  it("choose sees each answer's makers, each point's basis and the framing challenges (P2.4)", () => {
    const spec = mapChooseSpec(ctx(), KEY_POINTS, MERGED, { engine: { framingChallenges: ["Is the city's budget the real question?"] } });
    const frame = frameOf(spec);
    expect(frame.contractId).toBe("map.choose.v2");
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "key_points", "answers", "framing_challenges", "length", "question_language"]); // (pre-flight PF-R33.3)
    const field = (name: string) => JSON.parse(frame.fields.find((entry) => entry.name === name)!.content) as unknown;
    expect(field("key_points")).toEqual([{ key_point_id: "kp01", claim: "Fares fund night buses.", raised_by: 2, angle_kind: "OPPOSITE_CASE", rests_on: "question" }]);
    expect(field("answers")).toEqual([{ answer_id: "an01", answer: "Yes, where buses run full.", raised_by: 2 }]);
    expect(field("framing_challenges")).toEqual(["Is the city's budget the real question?"]);
  });

  it("the check is framed with its ids and the reason's length; it needs engine 2", () => {
    const spec = mapCheckSpec(ctx(), [{ checkId: "a1", answer: "Yes." }, { checkId: "c1", answer: "Only at night." }]);
    const frame = frameOf(spec);
    expect(frame.contractId).toBe("map.check.v1");
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "answers", "length", "question_language"]); // (pre-flight PF-R33.3)
    expect(JSON.parse(frame.fields[1]!.content)).toEqual([{ check_id: "a1", answer: "Yes." }, { check_id: "c1", answer: "Only at night." }]);
    expect(frame.fields[2]!.content).toBe("reason: about 40 words");
    const { engine: _engine, ...engineOne } = ctx();
    expect(() => mapCheckSpec(engineOne, [])).toThrowError(expect.objectContaining({ code: "MAP_CHECK_ENGINE_ONLY" }));
  });

  it("a locked language rides last; engine 2 without length is a programming error; without engine, LG-C's map", () => {
    expect(frameOf(mapListSpec(ctx({ languageTag: "ro", languageName: "Romanian", questionLine: "Ar trebui orașul să facă autobuzele gratuite?",
      replyLanguage: replyLanguageExpectation("Ar trebui orașul să facă autobuzele gratuite?") }), null)).fields.at(-1)!.name).toBe("question_language");
    // No lock ("und", old practice data): no language field, the length parts ride last (pre-flight PF-R33.3).
    expect(frameOf(mapListSpec(ctx({ languageTag: "und", languageName: "English" }), null)).fields.at(-1)!.name).toBe("length");
    const { length: _dropped, ...noLength } = ctx();
    expect(() => mapListSpec(noLength, null)).toThrowError(expect.objectContaining({ code: "MAP_ENGINE_REQUIRES_LENGTH" }));
    const { engine: _off, ...engineOne } = ctx();
    const today = mapListSpec(engineOne, null);
    expect(frameOf(today).contractId).toBe("map.list.open.length.v1");
    expect(Object.hasOwn(today, "engine")).toBe(false);
  });

  it("the v2 merge is shown each point's basis, so the rests_on it writes is read, not guessed (P2.2; pre-flight PF-R33.4)", () => {
    const at = { seat: { aiRef: "preview:0", maker: "m1" }, origin: "BLIND" as const, angleId: null, angleKind: null, listIndex: 0 };
    const items: readonly MapItem[] = [
      { ...at, itemId: "pt01", kind: "POINT", claim: "Riders are workers.", whyItMatters: "W.", leans: "context", restsOn: "assumption" },
      { ...at, itemId: "pt02", kind: "POINT", claim: "Costs rise.", whyItMatters: "W.", leans: "context" },
      { ...at, itemId: "ca01", kind: "ANSWER", answer: "Yes." }];
    const points = (spec: Parameters<typeof frameOf>[0]) =>
      JSON.parse(frameOf(spec).fields.find((entry) => entry.name === "points")!.content) as readonly Record<string, unknown>[];
    const merge = mapMergeSpec(ctx(), items);
    expect(frameOf(merge).contractId).toBe("map.merge.v2");
    expect(points(merge)).toEqual([{ item_id: "pt01", claim: "Riders are workers.", why_it_matters: "W.", rests_on: "assumption" },
      { item_id: "pt02", claim: "Costs rise.", why_it_matters: "W.", rests_on: null }]);
    const { engine: _off, ...engineOne } = ctx();
    expect(Object.hasOwn(points(mapMergeSpec(engineOne, items))[0]!, "rests_on")).toBe(false);
  });

  it("a v2 list reply is read through the v2 schema", () => {
    const reply = JSON.stringify({ points: [1, 2, 3].map((n) => ({ claim: `Point ${String(n)}.`, why_it_matters: "It matters.", leans: "context",
      rests_on: "question" })), candidate_answers: ["Yes, where buses run full."] });
    expect(mapListSpec(ctx(), null).classify(reply, { finishReason: "stop" }).parseStatus).toBe("PARSED");
    // The v2 schema, not LG-C's: a point that says nothing of its basis is refused (rests_on is required, P2.2).
    const noBasis = JSON.stringify({ points: [1, 2, 3].map((n) => ({ claim: `Point ${String(n)}.`, why_it_matters: "It matters.", leans: "context" })),
      candidate_answers: ["Yes, where buses run full."] });
    expect(mapListSpec(ctx(), null).classify(noBasis, { finishReason: "stop" }).parseStatus).toBe("SCHEMA_FAILED");
  });

  // Carry from Task 4's review (binding): every engine-2 step reads with `{ exactLimits: true }`, so each refusal states
  // its exact limit (P2.3). One size-refused reply per engine-2 spec; a spec that forgot the option fails here.
  it("every engine-2 step spec is marked engine and its size refusals state their exact limit (P2.3)", () => {
    const point = { claim: "Fares fund buses.", why_it_matters: "It matters.", leans: "context", rests_on: "question" };
    const items: readonly MapItem[] = [{ seat: { aiRef: "preview:0", maker: "m1" }, origin: "BLIND", angleId: null, angleKind: null, listIndex: 0,
      itemId: "pt01", kind: "POINT", claim: "Riders are workers.", whyItMatters: "W.", leans: "context", restsOn: "question" }];
    const angle = { angleId: "g1", kind: "PRACTICAL" as const, label: "Cost", focus: "What it costs the city." };
    const cases = [
      { step: "angles", spec: mapAnglesSpec(ctx()), reply: { angles: [] } },
      { step: "list open", spec: mapListSpec(ctx(), null), reply: { points: [], candidate_answers: ["Yes."] } },
      { step: "list angle", spec: mapListSpec(ctx(), angle), reply: { points: [], candidate_answers: ["Yes."] } },
      { step: "snowball", spec: mapSnowballSpec(ctx(), []), reply: { points: Array.from({ length: 9 }, () => point), candidate_answers: [] } },
      { step: "merge", spec: mapMergeSpec(ctx(), items), reply: { key_points: [{ key_point_id: "kp01", claim: "C.", rests_on: "question", member_item_ids: [] }], answers: [] } },
      { step: "gap", spec: mapGapSpec(ctx(), KEY_POINTS, MERGED), reply: { new_points: [], framing_challenges: ["x".repeat(2100)] } },
      { step: "choose", spec: mapChooseSpec(ctx(), KEY_POINTS, MERGED, { engine: { framingChallenges: [] } }), reply: { answers: [] } },
      { step: "check", spec: mapCheckSpec(ctx(), [{ checkId: "a1", answer: "Yes." }]), reply: { checks: [] } }
    ];
    for (const entry of cases) {
      expect(entry.spec.engine, entry.step).toBe(true);
      const refused = entry.spec.classify(JSON.stringify(entry.reply), { finishReason: "stop" });
      expect(refused.parseStatus, entry.step).toBe("SCHEMA_FAILED");
      const issues = JSON.parse(refused.parseError!) as readonly Record<string, unknown>[];
      expect(issues.some((issue) => "minimum" in issue || "maximum" in issue), `${entry.step}: ${refused.parseError!}`).toBe(true);
    }
    // Engine 1 (LG-C) keeps today's refusal JSON with no limit members, byte for byte.
    const { engine: _off, ...engineOne } = ctx();
    const today = mapListSpec(engineOne, null).classify(JSON.stringify({ points: [], candidate_answers: ["Yes."] }), { finishReason: "stop" });
    expect((JSON.parse(today.parseError!) as readonly Record<string, unknown>[]).some((issue) => "minimum" in issue)).toBe(false);
  });
});
