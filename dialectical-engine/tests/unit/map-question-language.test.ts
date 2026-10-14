import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { argumentLanguageDirective, detectArgumentLanguage, questionLanguageSentence, replyLanguageExpectation } from "@debateai/kernel";
import { readPromptFrame } from "@debateai/providers";
import {
  MAP_ANSWER_FORMS, MAP_CONTRACT_IDS, MAP_DEFAULT_INSTRUCTIONS, mapAnglesReplySchema, mapAnglesSpec, mapChooseSpec, mapGapSpec, mapListSpec,
  mapLockedLanguage, mapMergeSpec, mapProviderPieces, mapPromptContractHash, mapRunAngleMap, mapSnowballSpec,
  type MapCallOutcome, type MapCaller, type MapCallRequest, type MapStepSpec
} from "@debateai/map";

const RO_CTX = { questionLine: "Ar trebui România să adopte euro?", languageName: "Romanian", languageTag: "ro" };
const ANGLES = (language?: string) => JSON.stringify({ ...(language === undefined ? {} : { question_language: language }), angles: [
  { angle_id: "opp", kind: "OPPOSITE_CASE", label: "Cealaltă parte", focus: "Argumentele împotrivă." },
  { angle_id: "grija", kind: "ASKER_WORRY", label: "Grija", focus: "De ce se teme cel care întreabă." },
  { angle_id: "fapte", kind: "PRACTICAL", label: "Ce e de făcut", focus: "Primul pas concret." },
  { angle_id: "cost", kind: "SPECIFIC", label: "Costul", focus: "Cine plătește trecerea." }] });

describe("the map in the locked language (question-language spec 2026-10-13, L6, L7)", () => {
  it("every step carries the named sentence and the field, last", () => {
    const specs: readonly MapStepSpec<unknown>[] = [mapAnglesSpec(RO_CTX as never), mapListSpec(RO_CTX as never, null)];
    for (const spec of specs) {
      const frame = readPromptFrame(mapProviderPieces(spec).framed.packet);
      expect(frame.fields.at(-1)).toEqual({ name: "question_language", content: '{"code":"ro","name":"Romanian"}' });
      expect(spec.contract.instruction).toContain(questionLanguageSentence({ code: "ro", name: "Romanian" }));
      expect(spec.contract.instruction).not.toContain("the language of the question");
    }
  });

  it("the planner's answer form puts question_language FIRST; the reader accepts a reply without it", () => {
    expect(MAP_ANSWER_FORMS.angles.indexOf('"question_language"')).toBeLessThan(MAP_ANSWER_FORMS.angles.indexOf('"angles"'));
    expect(mapAnglesReplySchema.safeParse(JSON.parse(ANGLES("ro"))).success).toBe(true);
    expect(mapAnglesReplySchema.safeParse(JSON.parse(ANGLES())).success).toBe(true);
    expect(mapPromptContractHash()).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("a planner that names another language is ONE operator-only note (no mark), and every later call stays in the locked language", async () => {
    const seen: MapCallRequest<unknown>[] = [];
    const caller: MapCaller = { call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
      seen.push(request as MapCallRequest<unknown>);
      return request.step === "ANGLES"
        ? { kind: "OK", value: request.spec.read(ANGLES("fr")) } as MapCallOutcome<T>
        : { kind: "FAILED", code: "TEST_STOP" } as MapCallOutcome<T>;
    } };
    const result = await mapRunAngleMap({ ...RO_CTX, seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }], caller, seed: "q1",
      gapRoundsMax: 1, maxAnswers: 2, pointsPerAnswer: 2 } as never);
    expect(result.plannerLanguage).toBe("fr");
    expect(result.notes.filter((note) => note.note === "LANGUAGE_PLANNER_DISAGREES")).toEqual([
      { note: "LANGUAGE_PLANNER_DISAGREES", step: "ANGLES", detail: "ro:fr" }]);
    expect(result.marks.some((mark) => (mark.mark as string) === "LANGUAGE_PLANNER_DISAGREES")).toBe(false);
    for (const request of seen.slice(1)) expect(request.spec.contract.instruction).toContain("in Romanian, the language this debate was set to");
  });

  it("the same language, a regional form, 'unknown' or nothing: no note", async () => {
    for (const named of ["ro", "ro-RO", "unknown", undefined]) {
      const caller: MapCaller = { call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => request.step === "ANGLES"
        ? { kind: "OK", value: request.spec.read(ANGLES(named)) } as MapCallOutcome<T>
        : { kind: "FAILED", code: "TEST_STOP" } as MapCallOutcome<T> };
      const result = await mapRunAngleMap({ ...RO_CTX, seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }], caller, seed: "q1",
        gapRoundsMax: 1, maxAnswers: 2, pointsPerAnswer: 2 } as never);
      expect(result.notes.some((note) => note.note === "LANGUAGE_PLANNER_DISAGREES"), String(named)).toBe(false);
    }
  });
});

/**
 * Binding (controller, P2L Tasks 14-15): a map with NO lock keeps today's prompts byte for byte. For the map that is a
 * context tagged "und" (old practice data; a stored fallback name reads back as no lock too). The six steps other than
 * the planner are pinned by the sha256 of what they frame (contract and material; the frame's own delimiters are
 * random), as built BEFORE this task; the planner's call differs
 * from today only by its code-owned answer form, which now asks for question_language first (pinned against today's
 * form text, copied here as the oracle).
 */
describe("a map with no lock keeps today's prompts (tag und)", () => {
  const Q = "Government should act.";
  const FALLBACK_NAME = "the same language as the question";
  const UND = { questionLine: Q, languageName: FALLBACK_NAME, languageTag: "und", replyLanguage: replyLanguageExpectation(Q) } as never;
  const ANGLE = { angleId: "g1", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." } as never;
  const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const TODAYS_ANGLES_FORM = "Return only one JSON object with exactly this schema and no additional keys:\n{ \"angles\": [{ \"angle_id\": short id of lowercase letters, digits and hyphens, at most 24 characters, \"kind\": \"OPPOSITE_CASE\" | \"ASKER_WORRY\" | \"PRACTICAL\" | \"SPECIFIC\", \"label\": non-empty string of at most 80 characters, \"focus\": non-empty string of at most 240 characters }, ...] }\nangles has 4 to 7 entries: exactly one each of OPPOSITE_CASE, ASKER_WORRY and PRACTICAL, and 1 to 4 of SPECIFIC; every angle_id is different.";
  const FIELD_REQUEST = "\"question_language\": FIRST, the two-letter ISO 639-1 code of the language the question in question_line is written in, in lower case, ";

  it("has no lock for und or a stored fallback name; a real tag is locked", () => {
    expect(mapLockedLanguage({ languageTag: "und", languageName: FALLBACK_NAME })).toBeNull();
    expect(mapLockedLanguage({ languageTag: "ro", languageName: FALLBACK_NAME })).toBeNull();
    expect(mapLockedLanguage({ languageTag: "ro", languageName: "Romanian" })).toEqual({ code: "ro", name: "Romanian" });
  });

  it("the six non-planner steps frame exactly today's contract and material", () => {
    const pins = [mapListSpec(UND, ANGLE), mapListSpec(UND, null), mapSnowballSpec(UND, []), mapMergeSpec(UND, []), mapGapSpec(UND, [], []),
      mapChooseSpec(UND, [], [])].map((spec) => sha({ contract: spec.contract, material: spec.material }));
    expect(pins).toEqual([
      "c42fcf731f8c38e39921d8b405baecd78a405065ae5b1b2223148dc984ed532a",
      "3ef1bae31d8173c430ec1bf868c12e7e4b64909df4938d290d56d92891615599",
      "69a4cfbb2f855c535a3607568bf3b20613da909ddf0489871b60679447d5da3d",
      "b53ff6444eb0f20e8e8cac2fc26da3286fedb37206d28febf9ec25f299c900e3",
      "5d3c9ed9a5d036ba9b5bdd9bc857b052970d3bd8b62a050fde09c34ac01183f1",
      "a1861704c09d16fc94aa43b62373424f7905b8caf14710c359939262f6ac7981"]);
  });

  it("the planner's call is today's but for the field request in its answer form; no field, today's directive", () => {
    expect(MAP_ANSWER_FORMS.angles).toBe(TODAYS_ANGLES_FORM.replace("{ \"angles\": [", `{ ${FIELD_REQUEST}"angles": [`));
    const spec = mapAnglesSpec(UND);
    expect(spec.material.map((entry) => entry.name)).toEqual(["question_line"]);
    expect({ ...spec.contract }).toEqual({ contractId: MAP_CONTRACT_IDS.angles,
      instruction: `${MAP_DEFAULT_INSTRUCTIONS.angles}\n\n${argumentLanguageDirective(FALLBACK_NAME)}`, answerForm: MAP_ANSWER_FORMS.angles });
    expect(spec.material).toEqual([{ name: "question_line", content: Q }]);
    expect(readPromptFrame(mapProviderPieces(spec).framed.packet).fields).toEqual([{ name: "question_line", content: Q }]);
  });
});

/**
 * Review I8: the map's reply check reads the LOCK (mapRunAngleMap builds its expectation once, in MapRun), never a
 * re-guess of the question. The question is one today's guesser cannot name ("und"), so without a lock a French list
 * passes; under a Romanian lock the same list must be refused (MAP_WRONG_LANGUAGE, the map's own language code). The
 * classifier is the one each LIST request carries out of the real orchestrator.
 */
describe("the map's replies are checked against the lock (review I8)", () => {
  const UND_QUESTION = "Ar trebui sa renuntam la leu si sa trecem la euro cat mai repede?";
  const STOP = Object.freeze({ finishReason: "stop" });
  const FR = [
    "Le gouvernement doit maintenir la monnaie nationale pour les citoyens et les entreprises du pays.",
    "Les entreprises du pays perdraient leur protection si la banque centrale abandonnait la monnaie nationale.",
    "Les familles qui vivent avec un petit salaire paieraient plus cher les produits de tous les jours."
  ];
  const FRENCH_LIST = JSON.stringify({
    points: FR.map((claim) => ({ claim, why_it_matters: "Cela change ce que les citoyens paient chaque mois pour vivre.", leans: "context" })),
    candidate_answers: ["Il faut garder la monnaie nationale encore quelques années avant de décider."]
  });

  async function firstListRequest(context: { languageName: string; languageTag: string }) {
    const lists: MapCallRequest<unknown>[] = [];
    const caller: MapCaller = { call: async <T>(request: MapCallRequest<T>): Promise<MapCallOutcome<T>> => {
      if (request.step === "ANGLES") return { kind: "OK", value: request.spec.read(ANGLES()) } as MapCallOutcome<T>;
      if (request.step === "LIST") lists.push(request as MapCallRequest<unknown>);
      return { kind: "FAILED", code: "TEST_STOP" } as MapCallOutcome<T>;
    } };
    await mapRunAngleMap({ questionLine: UND_QUESTION, ...context, seats: [{ aiRef: "a", maker: "ma" }, { aiRef: "b", maker: "mb" }],
      caller, seed: "q1", gapRoundsMax: 1, maxAnswers: 2, pointsPerAnswer: 2 } as never);
    expect(lists.length).toBeGreaterThan(0);
    return lists[0]!;
  }

  it("a French list is refused under a Romanian lock and accepted without one", async () => {
    expect(detectArgumentLanguage(UND_QUESTION).tag).toBe("und");
    const locked = (await firstListRequest({ languageName: "Romanian", languageTag: "ro" })).spec.classify(FRENCH_LIST, STOP);
    expect(locked.parseStatus).toBe("SCHEMA_FAILED");
    expect((JSON.parse(locked.parseError!) as { message: string }[]).map((issue) => issue.message)).toContain("MAP_WRONG_LANGUAGE");
    // No lock: an "und" context (old practice data) keeps today's check, which cannot name the question.
    const unlocked = (await firstListRequest({ languageName: "the same language as the question", languageTag: "und" })).spec.classify(FRENCH_LIST, STOP);
    expect(unlocked.parseStatus).toBe("PARSED");
  });
});
